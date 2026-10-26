import { execFile } from 'node:child_process'
import { accessSync, chmodSync, constants, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import type { Duplex } from 'node:stream'
import { defineExtension } from '@earendil-works/pi-durable'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import * as pty from 'node-pty'
import { WebSocket, WebSocketServer } from 'ws'
import type { RawData } from 'ws'
import type { ConversationId } from '@earendil-works/pi-durable'
import { git } from '../../lib/git.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import {
  localTerminalRequest,
  nvimWindowArgs,
  resolveTerminalFile,
  sessionName,
  terminalSize,
  tmuxArgs,
  tmuxServer,
} from './session.ts'

// node-pty's packaged macOS helper loses its executable bit under pnpm/npm; restore the bit before the first spawn.
const helper = join(
  dirname(createRequire(import.meta.url).resolve('node-pty/package.json')),
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'spawn-helper',
)
try {
  const mode = statSync(helper).mode
  if (!(mode & 0o111)) chmodSync(helper, mode | 0o755)
} catch (error) {
  // Source-built platforms keep the helper elsewhere; any real spawn failure is shown in the terminal.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

const refuse = (socket: Duplex, status: string) =>
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)

function textOf(message: RawData) {
  if (Array.isArray(message)) return Buffer.concat(message).toString()
  if (message instanceof ArrayBuffer) return Buffer.from(message).toString()
  return message.toString()
}

const environment = () =>
  Object.fromEntries(
    Object.entries({ ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }).filter(
      ([key, value]) => value !== undefined && key !== 'TMUX' && key !== 'TMUX_PANE',
    ),
  ) as Record<string, string>

function resolveNvim(userHome: string) {
  const dirs = new Set([
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
    join(userHome, 'nvim-macos-arm64', 'bin'),
    join(userHome, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ])
  for (const dir of dirs) {
    const candidate = join(dir, 'nvim')
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Try the next directory on PATH.
    }
  }
  return undefined
}

export default function terminal(host: ExtensionHost) {
  const wss = new WebSocketServer({ noServer: true })
  wss.on('error', (error) => host.notice(`Terminal WebSocket failed: ${error.message}`))

  host.upgrade('/socket', (request, socket, head) => {
    if (!localTerminalRequest(request.headers)) {
      refuse(socket, '403 Forbidden')
      return
    }
    const url = new URL(request.url ?? '/', 'http://ultimate')
    const conversationId = Number(url.searchParams.get('conversation'))
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
      refuse(socket, '400 Bad Request')
      return
    }
    const cols = terminalSize(url.searchParams.get('cols'), 100, 500)
    const rows = terminalSize(url.searchParams.get('rows'), 30, 300)

    void (async () => {
      const conversation = await host
        .harness()
        .conversation(conversationId as ConversationId, BACKGROUND_CONTEXT)
      if (!conversation) {
        refuse(socket, '404 Not Found')
        return
      }
      const agent = await conversation.agent(BACKGROUND_CONTEXT)
      const cwd = agent.cwd ?? host.projectRoot
      const server = tmuxServer(host.home)
      const name = sessionName(host.home, conversationId)
      if (socket.destroyed) return
      wss.handleUpgrade(request, socket, head, (ws) => {
        let term: pty.IPty
        try {
          term = pty.spawn('tmux', tmuxArgs(server, name, cwd), {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: environment(),
          })
        } catch (error) {
          ws.close(
            1011,
            error instanceof Error ? error.message.slice(0, 120) : 'Could not start terminal',
          )
          return
        }
        let exited = false
        let restarting = false
        const data = term.onData((chunk) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
        })
        const exit = term.onExit(() => {
          exited = true
          data.dispose()
          exit.dispose()
          if (ws.readyState === WebSocket.OPEN)
            ws.close(restarting ? 1012 : 4001, restarting ? 'Restarting shell' : 'Shell exited')
        })
        ws.on('message', (message, binary) => {
          const text = textOf(message)
          if (!binary) {
            term.write(text)
            return
          }
          let control: {
            resize?: [number, number]
            restart?: boolean
            open?: { path?: unknown; line?: unknown }
          }
          try {
            control = JSON.parse(text) as typeof control
          } catch {
            ws.close(1003, 'Invalid terminal control frame')
            return
          }
          if (control.restart === true) {
            restarting = true
            execFile('tmux', ['-L', server, 'kill-session', '-t', name], (error) => {
              if (error && ws.readyState === WebSocket.OPEN) {
                restarting = false
                ws.send(`\r\n\x1b[31m[Could not restart shell: ${error.message}]\x1b[0m\r\n`)
              } else if (ws.readyState === WebSocket.OPEN) ws.close(1012, 'Restarting shell')
            })
            return
          }
          if (control.open !== undefined) {
            const rawPath = control.open?.path
            const rawLine = control.open?.line
            const line =
              typeof rawLine === 'number' && Number.isSafeInteger(rawLine) && rawLine >= 1
                ? rawLine
                : undefined
            void (async () => {
              if (typeof rawPath !== 'string') throw new Error('Expected a file path')
              const filePath = resolveTerminalFile(rawPath, cwd, host.userHome)
              let info
              try {
                info = statSync(filePath)
              } catch {
                // Missing files should fail clearly instead of opening an empty buffer.
                throw new Error(`File not found: ${rawPath}`)
              }
              if (info.isDirectory()) throw new Error(`Cannot open directory in nvim: ${rawPath}`)
              const nvimBin = resolveNvim(host.userHome)
              if (!nvimBin) throw new Error('nvim is not installed or not in PATH')
              const windowCwd = await git(dirname(filePath), 'rev-parse', '--show-toplevel').catch(
                // Outside a git checkout, fall back to the conversation's working directory.
                () => cwd,
              )
              await new Promise<void>((resolveOpen, rejectOpen) => {
                execFile(
                  'tmux',
                  nvimWindowArgs(server, name, windowCwd, filePath, {
                    line,
                    nvimBin,
                    pathEnv: process.env.PATH,
                  }),
                  { cwd: windowCwd, env: environment() },
                  (error) => {
                    if (error) rejectOpen(error)
                    else resolveOpen()
                  },
                )
              })
            })().catch((error: unknown) => {
              const reason = error instanceof Error ? error.message : String(error)
              host.notice(`Could not open in nvim: ${reason}`)
              if (ws.readyState === WebSocket.OPEN)
                ws.send(`\r\n\x1b[31m[Could not open in nvim: ${reason}]\x1b[0m\r\n`)
            })
            return
          }
          const [nextCols, nextRows] = control.resize ?? [0, 0]
          if (nextCols > 1 && nextRows > 1)
            term.resize(Math.min(nextCols, 500), Math.min(nextRows, 300))
        })
        ws.on('close', () => {
          data.dispose()
          exit.dispose()
          if (!exited) term.kill()
        })
      })
    })().catch((error: unknown) => {
      host.notice(
        `Terminal connection failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (!socket.destroyed) refuse(socket, '503 Service Unavailable')
    })
  })

  host.onClose(async () => {
    for (const client of wss.clients) client.terminate()
    await new Promise<void>((resolve) => wss.close(() => resolve()))
  })
  return defineExtension({ name: 'terminal' })
}
