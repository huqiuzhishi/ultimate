import { createHash } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

const loopback = (hostname: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')

/** Terminal upgrades are deliberately stricter than Ultimate's normal admission: a local page, never a proxy. */
export function localTerminalRequest(headers: IncomingHttpHeaders) {
  if (
    ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded'].some(
      (key) => headers[key] !== undefined,
    )
  )
    return false
  const host = headers.host
  const origin = headers.origin
  if (typeof host !== 'string' || typeof origin !== 'string') return false
  try {
    const authority = new URL(`http://${host}`)
    const source = new URL(origin)
    return (
      loopback(authority.hostname) &&
      !authority.username &&
      !authority.password &&
      authority.pathname === '/' &&
      ['http:', 'https:'].includes(source.protocol) &&
      source.origin === origin &&
      source.host.toLowerCase() === host.toLowerCase() &&
      loopback(source.hostname)
    )
  } catch {
    // Malformed browser authorities are not local terminal requests.
    return false
  }
}

const projectId = (home: string) => createHash('sha256').update(home).digest('hex').slice(0, 12)

/** A private tmux server per Ultimate home, isolated from the user's tmux configuration and sessions. */
export const tmuxServer = (home: string) => `ultimate-${projectId(home)}`

/** A stable session for one Ultimate home and conversation, short enough for every supported platform. */
export function sessionName(home: string, conversationId: number) {
  return `${projectId(home)}-${conversationId}`
}

/** Attach to or create the durable shell without passing cwd or names through a shell parser. */
export function tmuxArgs(
  server: string,
  name: string,
  cwd: string,
  shell = process.env.SHELL || '/bin/zsh',
) {
  return [
    '-L',
    server,
    '-f',
    '/dev/null',
    'new-session',
    '-A',
    '-s',
    name,
    '-c',
    cwd,
    shell,
    '-l',
    ';',
    'set-option',
    '-g',
    'status',
    'off',
  ]
}

export function terminalSize(value: string | null, fallback: number, maximum: number) {
  return Math.max(2, Math.min(maximum, Number(value) || fallback))
}
