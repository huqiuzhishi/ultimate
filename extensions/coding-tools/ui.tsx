/** Coding tools for other extensions' browser code: commit events, shortened paths, and opening files in the terminal. */
import { SquareTerminalIcon } from 'lucide-react'
import { useMemo } from 'react'
import { cn, definePoint, Provided, shortenPath, useConversation, useStore } from '@/sdk'
export { Committed } from './refs.ts'

export type TerminalFileTarget = { path: string; line?: number }

/** Opens a file (and optional 1-based line) in the conversation's terminal (`terminal` provides it). */
export const OpenInTerminal = definePoint<TerminalFileTarget, (() => void) | undefined>(
  'coding-tools.open-in-terminal',
)

/** A path relative to the conversation's cwd, else with `~`. */
export function useShortPath(path: string) {
  const cwd = useConversation((conversation) => conversation.agent.cwd)
  const defaultCwd = useStore((state) => state.system?.execution.defaultCwd)
  const home = useStore((state) => state.system?.machine.home)
  return shortenPath(path, { cwd: cwd ?? defaultCwd, home })
}

const fileName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

/**
 * A compact `nvim` button that opens `path` (and optional `line`) in the conversation's terminal when `terminal`
 * provides `OpenInTerminal`; renders nothing when terminal is unavailable or the browser is remote.
 */
export function OpenFileButton({
  path,
  line,
  className,
  variant = 'badge',
}: {
  path: string
  line?: number
  className?: string
  variant?: 'badge' | 'chip'
}) {
  const shown = useShortPath(path)
  const target = useMemo(() => ({ path, ...(line ? { line } : {}) }), [path, line])
  if (!path) return null
  const name = fileName(path)
  return (
    <Provided input={target} point={OpenInTerminal}>
      {(open) =>
        open ? (
          <button
            aria-label={`Open ${name} in nvim`}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1 font-mono text-[10.5px] font-medium text-brand transition-colors outline-none hover:bg-brand/20 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
              variant === 'chip'
                ? 'h-6 border-l border-border/80 bg-brand/10 px-1.5'
                : 'h-5 rounded border border-brand/30 bg-brand/10 px-1.5 hover:border-brand/50',
              className,
            )}
            data-open-nvim={path}
            onClick={(event) => {
              event.stopPropagation()
              open()
            }}
            title={`Open ${shown}${line ? `:${line}` : ''} with nvim in terminal`}
            type="button"
          >
            <SquareTerminalIcon className="size-3 shrink-0" />
            <span>nvim</span>
          </button>
        ) : null
      }
    </Provided>
  )
}
