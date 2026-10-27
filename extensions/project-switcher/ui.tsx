/** Project switcher UI for the sidebar's local project path trigger. */
import { ChevronDownIcon, ExternalLinkIcon, FolderIcon, PlayIcon } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, cn, errorMessage, projectTitle, useAction, useSystem } from '@/sdk'
import { ListAction, StartAction } from './refs.ts'
import type { Project } from './refs.ts'

const isLoopback = (hostname: string) =>
  /^(127\.0\.0\.1|localhost|\[::1\])$|\.localhost$/.test(hostname)

type Pending = { root: string } | undefined

/** Dense rows for known projects; opening always delegates to the supervisor launcher. */
export function ProjectList({
  projects,
  pending,
  onStart,
}: {
  projects: Project[]
  pending: Pending
  onStart: (project: Project) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {projects.map((project) => {
        const port = project.running ? `:${new URL(project.running.url).port}` : undefined
        const busy = pending?.root === project.root
        return (
          <div
            className="flex min-h-8 items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent"
            key={project.root ?? project.name}
            title={project.root}
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                project.running ? 'bg-success' : 'bg-muted-foreground/40',
              )}
            />
            <span
              className={cn('min-w-0 flex-1 truncate text-[13px]', project.current && 'text-brand')}
            >
              {project.name}
            </span>
            {project.running && (
              <span
                className="shrink-0 font-mono text-[11px] text-muted-foreground"
                title={`PID ${project.running.pid}`}
              >
                {port}
              </span>
            )}
            {project.current ? (
              <span className="font-mono text-[10.5px] text-muted-foreground">Current</span>
            ) : project.root ? (
              <button
                aria-label={`${project.running ? 'Open' : 'Start'} ${project.name}`}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
                disabled={busy}
                onClick={() => onStart(project)}
                title={`${project.running ? 'Open' : 'Start'} ${project.name}`}
                type="button"
              >
                {project.running ? (
                  <ExternalLinkIcon className="size-3.5" />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** The top-left project path, interactive only when the browser itself is on loopback. */
export function ProjectSwitcher() {
  const system = useSystem()
  const local = isLoopback(location.hostname)
  const inventory = useAction(ListAction, null, { enabled: local, onError: () => {} })
  const [pending, setPending] = useState<Pending>()
  const [error, setError] = useState<string>()
  const [dialog, setDialog] = useState(false)
  const [path, setPath] = useState('')
  const trigger = (
    <>
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{projectTitle(system)}</span>
    </>
  )
  if (!local)
    return (
      <div
        className="mb-1 flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-4 text-[13px] font-medium text-foreground/90"
        title={system?.project.root}
      >
        {trigger}
      </div>
    )

  const run = async (project: Project) => {
    if (!project.root) return false
    setError(undefined)
    setPending({ root: project.root })
    try {
      await api.action(StartAction, { root: project.root })
      await inventory.refetch()
      return true
    } catch (failure) {
      setError(errorMessage(failure))
      return false
    } finally {
      setPending(undefined)
    }
  }
  const openPath = async (event: FormEvent) => {
    event.preventDefault()
    const project = { root: path, name: path, current: false }
    if (await run(project)) setDialog(false)
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && inventory.refetch()}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Switch project"
            className="mb-1 flex h-10 w-full shrink-0 items-center gap-2 border-b border-border/70 px-4 text-[13px] font-medium text-foreground/90 transition-colors outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent"
            title={system?.project.root}
            type="button"
          >
            {trigger}
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80" sideOffset={4}>
          <DropdownMenuLabel className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] font-normal tracking-wider text-muted-foreground uppercase">
            Projects
          </DropdownMenuLabel>
          {inventory.data && (
            <ProjectList
              onStart={(project) => void run(project)}
              pending={pending}
              projects={inventory.data}
            />
          )}
          {error && <div className="px-2 py-1.5 text-[11px] text-error">{error}</div>}
          <button
            className="mt-1 flex h-8 w-full items-center gap-2 border-t border-border/70 px-2 pt-1 text-left text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setError(undefined)
              setDialog(true)
            }}
            type="button"
          >
            <FolderIcon className="size-3.5" />
            Open another folder…
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog onOpenChange={setDialog} open={dialog}>
        <DialogContent className="gap-3 p-5 sm:max-w-md">
          <DialogTitle className="text-base">Open another folder</DialogTitle>
          <DialogDescription>Enter an existing directory path on this host.</DialogDescription>
          <form className="flex flex-col gap-3" onSubmit={(event) => void openPath(event)}>
            <input
              aria-label="Project path"
              autoFocus
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => setPath(event.target.value)}
              placeholder="/path/to/project"
              value={path}
            />
            {error && <div className="text-[12px] text-error">{error}</div>}
            <Button disabled={!path.trim() || pending !== undefined} type="submit">
              Open
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
