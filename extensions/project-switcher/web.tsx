import { defineWebExtension, provide } from '@/sdk'
import { ProjectHeader } from '../sidebar/ui.tsx'
import { ProjectSwitcher } from './ui.tsx'

export default defineWebExtension({
  provides: [provide(ProjectHeader, () => <ProjectSwitcher />)],
})
