/** Project-file search for the composer's `@` autocomplete. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

/** `{ query }` → up to 20 matching non-ignored files relative to the conversation's checkout. */
export const SearchFilesAction = actionRef<{ query: string }, string[]>('files', 'search')
