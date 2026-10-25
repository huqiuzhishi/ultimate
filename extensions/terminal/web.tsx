import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCcwIcon, SquareTerminalIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { cn, defineWebExtension, shortenPath, useConversation, useSystem, useUltimate } from '@/sdk'

const STORAGE = 'ultimate.terminal'
const CHANGED = 'ultimate:terminal-state'
type DrawerState = { open: boolean; height: number }
const defaults: DrawerState = { open: false, height: 300 }
const localPage = () =>
  ['127.0.0.1', 'localhost', '::1'].includes(location.hostname) ||
  location.hostname.endsWith('.localhost')

function stored(): DrawerState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Partial<DrawerState> | null
    return {
      open: value?.open === true,
      height: typeof value?.height === 'number' ? Math.max(140, value.height) : defaults.height,
    }
  } catch {
    return defaults
  }
}

function save(value: DrawerState) {
  localStorage.setItem(STORAGE, JSON.stringify(value))
  window.dispatchEvent(new Event(CHANGED))
}

function useDrawerState() {
  const [value, setValue] = useState(stored)
  useEffect(() => {
    const update = () => setValue(stored())
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGED, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return [value, save] as const
}

function toggle() {
  const value = stored()
  save({ ...value, open: !value.open })
}

function HeaderToggle() {
  const { id } = useConversation()
  const { surface } = useUltimate()
  const [drawer] = useDrawerState()
  if (!localPage() || surface !== 'agent' || id === undefined) return null
  return (
    <button
      aria-label="Toggle terminal"
      aria-pressed={drawer.open}
      className={cn(
        'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        drawer.open && 'bg-muted text-brand',
      )}
      onClick={toggle}
      title="Toggle terminal"
      type="button"
    >
      <SquareTerminalIcon className="size-4" />
    </button>
  )
}

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'

function appearance() {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    font: value('--font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace'),
    theme: {
      background: value('--terminal', '#151518'),
      foreground: value('--foreground', '#e8e8eb'),
      cursor: value('--brand', '#a78bfa'),
      selectionBackground: value('--accent', '#303038'),
    },
  }
}

function TerminalDrawer({
  conversation,
  cwd,
  state,
  setState,
}: {
  conversation: number
  cwd: string
  state: DrawerState
  setState: (value: DrawerState) => void
}) {
  const system = useSystem()
  const host = useRef<HTMLDivElement>(null)
  const restart = useRef<() => void>(() => {})
  const [connection, setConnection] = useState<Connection>('connecting')
  const [liveHeight, setLiveHeight] = useState<number>()
  const height = liveHeight ?? Math.min(state.height, Math.max(180, window.innerHeight * 0.7))

  useEffect(() => {
    const element = host.current
    if (!element) return undefined
    let disposed = false
    let socket: WebSocket | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const look = appearance()
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: look.font,
      fontSize: 13,
      scrollback: 5000,
      theme: look.theme,
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)
    const control = (value: object) =>
      socket?.readyState === WebSocket.OPEN &&
      socket.send(new TextEncoder().encode(JSON.stringify(value)))
    const connect = () => {
      clearTimeout(timer)
      if (disposed) return
      setConnection(attempts ? 'reconnecting' : 'connecting')
      fit.fit()
      const query = new URLSearchParams({
        conversation: String(conversation),
        cols: String(terminal.cols),
        rows: String(terminal.rows),
      })
      // oxlint-disable-next-line ultimate/no-raw-stream -- a PTY needs the extension's admitted duplex upgrade route.
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/extensions/terminal/socket?${query}`,
      )
      socket.addEventListener('open', () => {
        attempts = 0
        setConnection('connected')
        control({ resize: [terminal.cols, terminal.rows] })
        terminal.focus()
      })
      socket.addEventListener('message', (event) => terminal.write(event.data as string))
      socket.addEventListener('close', (event) => {
        if (disposed) return
        if (event.code === 4001) {
          setConnection('closed')
          terminal.write('\r\n\x1b[2m[shell exited — hide and reopen, or restart]\x1b[0m\r\n')
          return
        }
        if (event.code === 1003 || event.code === 1011) {
          setConnection('error')
          terminal.write(
            `\r\n\x1b[31m[terminal closed${event.reason ? `: ${event.reason}` : ''}]\x1b[0m\r\n`,
          )
          return
        }
        attempts++
        setConnection('reconnecting')
        timer = setTimeout(connect, Math.min(4000, 250 * 2 ** Math.min(attempts, 4)))
      })
      socket.addEventListener('error', () => setConnection('reconnecting'))
    }
    restart.current = () => {
      setConnection('reconnecting')
      if (socket?.readyState === WebSocket.OPEN) control({ restart: true })
      else {
        attempts = 0
        connect()
      }
    }
    const input = terminal.onData(
      (data) => socket?.readyState === WebSocket.OPEN && socket.send(data),
    )
    const resize = terminal.onResize(({ cols, rows }) => control({ resize: [cols, rows] }))
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(element)
    const theme = new MutationObserver(() => {
      const next = appearance()
      terminal.options.fontFamily = next.font
      terminal.options.theme = next.theme
    })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    connect()
    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      theme.disconnect()
      input.dispose()
      resize.dispose()
      socket?.close()
      terminal.dispose()
    }
  }, [conversation])

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const start = event.clientY
    const initial = height
    event.currentTarget.setPointerCapture(event.pointerId)
    let nextHeight = initial
    const move = (next: globalThis.PointerEvent) => {
      nextHeight = Math.max(
        140,
        Math.min(window.innerHeight * 0.7, initial - (next.clientY - start)),
      )
      setLiveHeight(nextHeight)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      setState({ ...state, height: Math.round(nextHeight) })
      setLiveHeight(undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const shown = shortenPath(cwd, { home: system?.machine.home })
  return (
    <section
      aria-label="Terminal"
      className="relative flex shrink-0 flex-col border-t border-border/70 bg-terminal"
      data-ultimate-terminal
      style={{ height }}
    >
      <div
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        className="absolute -top-1 right-0 left-0 z-10 h-2 cursor-row-resize after:absolute after:top-1 after:right-0 after:left-0 after:h-px after:bg-brand/60 after:opacity-0 hover:after:opacity-100"
        onPointerDown={resize}
        role="separator"
      />
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border/70 px-2 font-mono text-[11px] text-muted-foreground">
        <SquareTerminalIcon className="size-3.5 text-brand" />
        <span className="min-w-0 truncate text-foreground/80" title={cwd}>
          {shown}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full',
              connection === 'connected'
                ? 'bg-success'
                : connection === 'error'
                  ? 'bg-error'
                  : 'bg-warning',
            )}
          />
          {connection}
        </span>
        <button
          className="flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground"
          onClick={() => restart.current()}
          title="Restart shell"
          type="button"
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
        <button
          className="flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground"
          onClick={() => setState({ ...state, open: false })}
          title="Hide terminal (shell keeps running)"
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-1.5 py-1" ref={host} />
    </section>
  )
}

function TerminalComposer({ core, dock }: { core: ReactNode; dock?: boolean }) {
  const { id, agent } = useConversation()
  const system = useSystem()
  const [state, setState] = useDrawerState()
  const cwd = agent.cwd ?? system?.execution.defaultCwd
  if (!localPage() || dock || !state.open || id === undefined || !cwd) return core
  return (
    <>
      <TerminalDrawer conversation={id} cwd={cwd} setState={setState} state={state} />
      {core}
    </>
  )
}

export default defineWebExtension({
  slots: { 'header.right': [HeaderToggle] },
  composer: TerminalComposer,
  commands: [
    {
      id: 'terminal.toggle',
      title: 'Toggle terminal',
      when: (context) =>
        localPage() && context.surface === 'agent' && context.conversationId !== undefined,
      run: toggle,
    },
  ],
})
