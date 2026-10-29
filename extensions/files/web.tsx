import { FileIcon } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { cn, defineWebExtension, insertIntoComposer, useAction, useConversation } from '@/sdk'
import { fileTrigger, type FileTrigger } from './match.ts'
import { SearchFilesAction } from './refs.ts'

/** Type `@` in the composer to search files in the conversation's checkout. */
function FileAutocomplete({ core }: { core: ReactNode }) {
  const { id } = useConversation()
  const editor = useRef<HTMLTextAreaElement | null>(null)
  const [trigger, setTrigger] = useState<FileTrigger>()
  const [selected, setSelected] = useState(0)
  const query = trigger?.query ?? ''
  const search = useAction(
    SearchFilesAction,
    { query },
    { enabled: query.length > 0, onError: () => {} },
  )
  const matches = search.data ?? []

  const update = (event: FormEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return
    editor.current = event.target
    setTrigger(fileTrigger(event.target.value, event.target.selectionStart))
    setSelected(0)
  }

  const choose = (path: string) => {
    if (id === undefined || !trigger || !editor.current) return
    editor.current.setSelectionRange(trigger.start, trigger.end)
    insertIntoComposer(id, `@${path} `)
    setTrigger(undefined)
    requestAnimationFrame(() => editor.current?.focus())
  }

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLTextAreaElement) || !trigger) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setTrigger(undefined)
      return
    }
    if (matches.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setSelected((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setSelected((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const choice = matches[selected] ?? matches[0]
      if (choice) choose(choice)
    }
  }

  const open = trigger !== undefined
  return (
    <div className="relative" onInputCapture={update} onKeyDownCapture={navigate}>
      {open && (
        <div className="absolute right-0 bottom-full left-0 z-50 mb-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="border-b border-border/60 px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground">
            files · type to filter · ↑↓ select · ↵ insert
          </div>
          {query.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-muted-foreground">
              Type part of a file path.
            </div>
          ) : search.loading ? (
            <div className="px-3 py-3 text-center text-[12px] text-muted-foreground">
              Searching…
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-muted-foreground">
              No matching file.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              {matches.map((path, index) => (
                <button
                  aria-selected={index === selected}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
                    index === selected && 'bg-accent text-accent-foreground',
                  )}
                  key={path}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    choose(path)
                  }}
                  onMouseEnter={() => setSelected(index)}
                  type="button"
                >
                  <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[12px]">{path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {core}
    </div>
  )
}

export default defineWebExtension({ composer: FileAutocomplete })
