import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { cn, defineWebExtension, insertIntoComposer, useConversation, useSystem } from '@/sdk'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Skills menu in composer.actions: a dropdown listing available skills.
 * Click a skill to insert `/skill:name ` at the cursor.
 */
function SkillsMenu() {
  const { id } = useConversation()
  const system = useSystem()
  const skills = system?.skills ?? []
  const [open, setOpen] = useState(false)

  if (skills.length === 0 || id === undefined) return null

  const choose = (name: string) => {
    insertIntoComposer(id, `/skill:${name} `)
    setOpen(false)
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Skills"
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded px-1',
            'text-muted-foreground hover:bg-accent hover:text-foreground',
            open && 'bg-accent text-foreground',
          )}
          title="Run a skill — type the request after selecting"
          type="button"
        >
          <BookOpenIcon className="size-3.5" />
          <ChevronDownIcon className="size-2.5 -ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {skills.map((skill) => (
          <DropdownMenuItem key={skill.name} onSelect={() => choose(skill.name)}>
            <span className="font-mono text-[12px] font-medium text-brand">{skill.name}</span>
            <span className="ml-2 text-[11px] text-muted-foreground line-clamp-1">
              {skill.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default defineWebExtension({
  slots: {
    'composer.actions': [SkillsMenu],
  },
})
