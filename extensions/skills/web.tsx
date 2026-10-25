import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, defineWebExtension, insertIntoComposer, useConversation, useSystem } from '@/sdk'
import { matchingSkills, skillTrigger, type SkillTrigger } from './match.ts'

type Skill = NonNullable<ReturnType<typeof useSystem>>['skills'][number]

function SkillRows({
  skills,
  choose,
}: {
  skills: readonly Skill[]
  choose: (name: string) => void
}) {
  return skills.map((skill) => (
    <CommandItem
      className="flex-col items-start gap-0.5 py-1.5"
      key={skill.path}
      keywords={[skill.description]}
      onSelect={() => choose(skill.name)}
      value={skill.name}
    >
      <span className="flex w-full items-center gap-2 text-[12.5px]">
        <span className="font-mono text-brand">{skill.name}</span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/60">
          {skill.scope}
          {skill.manual && ' · manual'}
        </span>
      </span>
      <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
        {skill.description}
      </span>
    </CommandItem>
  ))
}

/** The book button remains useful for browsing and now has the same complete, searchable list. */
function SkillsMenu() {
  const { id } = useConversation()
  const skills = useSystem()?.skills ?? []
  const [open, setOpen] = useState(false)

  if (skills.length === 0 || id === undefined) return null

  const choose = (name: string) => {
    insertIntoComposer(id, `/skill:${name} `)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label="Skills"
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded px-1',
            'text-muted-foreground hover:bg-accent hover:text-foreground',
            open && 'bg-accent text-foreground',
          )}
          title="Run a skill"
          type="button"
        >
          <BookOpenIcon className="size-3.5" />
          <ChevronDownIcon className="-ml-0.5 size-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(32rem,calc(100vw-1rem))] p-0" side="top">
        <Command>
          <CommandInput className="text-[13px]" placeholder="Find a skill…" />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty className="py-6 text-center text-[12px] text-muted-foreground">
              No matching skill.
            </CommandEmpty>
            <SkillRows choose={choose} skills={skills} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Type `/` in the composer, then filter by skill name or description without leaving the editor. */
function SkillsAutocomplete({ core }: { core: ReactNode }) {
  const { id } = useConversation()
  const skills = useSystem()?.skills ?? []
  const editor = useRef<HTMLTextAreaElement | null>(null)
  const [trigger, setTrigger] = useState<SkillTrigger>()
  const [selected, setSelected] = useState(0)
  const matches = trigger ? matchingSkills(skills, trigger.query) : []

  const update = (event: FormEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return
    editor.current = event.target
    const next = skillTrigger(event.target.value, event.target.selectionStart)
    setTrigger(next)
    setSelected(0)
  }

  const choose = (name: string) => {
    if (id === undefined || !trigger || !editor.current) return
    editor.current.setSelectionRange(trigger.start, trigger.end)
    insertIntoComposer(id, `/skill:${name} `)
    setTrigger(undefined)
    requestAnimationFrame(() => editor.current?.focus())
  }

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLTextAreaElement) || !trigger || matches.length === 0) return
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
      if (choice) choose(choice.name)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setTrigger(undefined)
    }
  }

  return (
    <div className="relative" onInputCapture={update} onKeyDownCapture={navigate}>
      {trigger && matches.length > 0 && (
        <div className="absolute right-0 bottom-full left-0 z-50 mb-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="border-b border-border/60 px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground">
            skills · type to filter · ↑↓ select · ↵ insert
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {matches.map((skill, index) => (
              <button
                aria-selected={index === selected}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left',
                  index === selected && 'bg-accent text-accent-foreground',
                )}
                key={skill.path}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(skill.name)
                }}
                onMouseEnter={() => setSelected(index)}
                type="button"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="font-mono text-[12.5px] text-brand">{skill.name}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/60">
                    {skill.scope}
                  </span>
                </span>
                <span className="line-clamp-1 text-[11.5px] text-muted-foreground">
                  {skill.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {core}
    </div>
  )
}

export default defineWebExtension({
  composer: SkillsAutocomplete,
  slots: {
    'composer.actions': [SkillsMenu],
  },
})
