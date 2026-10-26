// Pi upstream: @earendil-works/pi-durable@1.4.0 src/tools/bash.ts and src/tools/edit.ts — internal bash exit_code diagnostic message drives exitOf and untyped details.patch/details.diff drive Edit. Drop when Pi exports structured bash outcomes and structured diff rows for rendering.
import type { EntryRecord } from '@earendil-works/pi-durable'
import { CopyIcon, FileCode2Icon, FileDiffIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnsiOutput } from '@/components/ai/ansi-output'
import { Shimmer } from '@/components/ai/shimmer'
import { CodeBlock, languageFromPath } from '@/components/ai/code-block'
import {
  Tool,
  ToolContent,
  ToolDiagnostics,
  ToolHeader,
  ToolImage,
  ToolOutput,
  ToolSection,
} from '@/components/ai/tool'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  api,
  cn,
  defineWebExtension,
  events,
  formatBytes,
  shortenPath,
  useConversation,
  useStore,
  useToolDuration,
  useTranscript,
  useUltimate,
} from '@/sdk'
import type { ToolCallView } from '@/sdk'
import { type BashStep, formatBashCommand } from './bash-command.tsx'
import {
  countChanges,
  Diff,
  editRows,
  firstChangedLine,
  parseDisplayDiff,
  parsePatch,
} from './diff.tsx'
import { CancelAction } from './refs.ts'
import { OpenFileButton, useShortPath } from './ui.tsx'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const usePath = useShortPath

function lineCount(value: string) {
  if (!value) return 0
  return value.split('\n').length - (value.endsWith('\n') ? 1 : 0)
}
const lines = (count: number) => `${count} line${count === 1 ? '' : 's'}`

/** The skill a read loads: the folder name of a `SKILL.md`, the convention Pi's skill list points agents at. */
export function skillOf(path: string) {
  const parts = path.split('/')
  return parts.at(-1) === 'SKILL.md' && parts.length > 1 ? parts.at(-2) : undefined
}

function Read({ call }: { call: ToolCallView }) {
  const path = text(call.args.path)
  const shown = usePath(path)
  const skill = skillOf(path)
  const duration = useToolDuration(call)
  const offset = typeof call.args.offset === 'number' ? call.args.offset : undefined
  const limit = typeof call.args.limit === 'number' ? call.args.limit : undefined
  const range =
    offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : '+'}` : ''
  const failed = call.status === 'error'
  const count = call.status === 'done' ? lineCount(call.output) : 0
  const image = call.images[0]
  // The image itself says what Pi's bare "Read image file [type]." note does; keep only notes that add something.
  const diagnostics = image
    ? call.diagnostics.filter((d) => !/^Read image file \[[^\]]+\]\.$/.test(d.message))
    : call.diagnostics
  return (
    <Tool defaultOpen={failed || !!image}>
      <ToolHeader
        action={
          path &&
          !skill &&
          !image &&
          !failed &&
          call.status !== 'streaming' && <OpenFileButton line={offset} path={path} />
        }
        meta={
          <>
            {count > 0 && <span>{lines(count)}</span>}
            {duration && <span>{duration}</span>}
          </>
        }
        name={skill ? 'skill' : 'read'}
        state={call.status}
        title={
          skill ? (
            <>
              <span className="text-brand">{skill}</span>
              <span className="text-muted-foreground/60"> · {shown}</span>
            </>
          ) : (
            <>
              {shown}
              <span className="text-muted-foreground/60">{range}</span>
            </>
          )
        }
      />
      <ToolContent>
        {failed ? (
          <ToolOutput isError output={call.output} />
        ) : image ? (
          <ToolSection>
            <ToolImage alt={shown} image={image} />
          </ToolSection>
        ) : (
          call.output && (
            <CodeBlock
              className="max-h-96 overflow-auto rounded-none border-none"
              code={call.output}
              language={languageFromPath(path)}
              showLineNumbers
              startLine={offset ?? 1}
            />
          )
        )}
        <ToolDiagnostics diagnostics={diagnostics} />
      </ToolContent>
    </Tool>
  )
}

/** Keeps a growing body scrolled to its end while `following`, as a running bash call does. */
function useFollow<T extends HTMLElement>(following: boolean, content: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (following && element) element.scrollTop = element.scrollHeight
  }, [content, following])
  return ref
}

/** A file call's title: its path, or a shimmering verb until the model has written the path. */
function FileTitle({ path, verb }: { path: string; verb: string }) {
  const shown = usePath(path)
  return path ? shown : <Shimmer>{`${verb}…`}</Shimmer>
}

function Write({ call }: { call: ToolCallView }) {
  const path = text(call.args.path)
  const content = text(call.args.content)
  const duration = useToolDuration(call)
  const failed = call.status === 'error'
  const streaming = call.status === 'streaming'
  // Open while it streams in, so the file appears as it is written, and it stays open rather than jump shut when
  // the write lands; a write first seen finished starts closed.
  const [watched] = useState(streaming)
  const [toggled, setToggled] = useState<boolean>()
  const open = toggled ?? (watched || streaming || failed)
  const scroller = useFollow<HTMLDivElement>(streaming, content)
  return (
    <Tool onOpenChange={setToggled} open={open}>
      <ToolHeader
        action={path && !streaming && !failed && <OpenFileButton path={path} />}
        meta={
          <>
            {content && (
              <span>
                {lines(lineCount(content))}
                {!streaming && ` · ${formatBytes(new TextEncoder().encode(content).length)}`}
              </span>
            )}
            {duration && <span>{duration}</span>}
          </>
        }
        name="write"
        state={call.status}
        title={<FileTitle path={path} verb="writing" />}
      />
      <ToolContent>
        {content && (
          <CodeBlock
            caret={streaming}
            className="max-h-96 overflow-auto rounded-none border-none"
            code={content}
            language={languageFromPath(path)}
            ref={scroller}
            showLineNumbers
          />
        )}
        {failed && <ToolOutput isError output={call.output} />}
        <ToolDiagnostics diagnostics={call.diagnostics} />
      </ToolContent>
    </Tool>
  )
}

interface EditDetails {
  diff?: string
  patch?: string
}

function Edit({ call }: { call: ToolCallView }) {
  const path = text(call.args.path)
  const duration = useToolDuration(call)
  const streaming = call.status === 'streaming'
  const details = (call.details ?? {}) as EditDetails
  const edits = Array.isArray(call.args.edits)
    ? (call.args.edits as { oldText?: string; newText?: string }[])
    : [{ oldText: text(call.args.oldText), newText: text(call.args.newText) }]
  const rows = details.patch
    ? parsePatch(details.patch)
    : details.diff
      ? parseDisplayDiff(details.diff)
      : editRows(edits)
  // Counts only once the model has written the whole call: mid-stream they would still change.
  const { added, removed } = countChanges(streaming ? [] : rows)
  const firstLine = firstChangedLine(rows)
  const failed = call.status === 'error'
  const scroller = useFollow<HTMLDivElement>(streaming, rows.length)
  return (
    <Tool defaultOpen>
      <ToolHeader
        action={path && !streaming && !failed && <OpenFileButton line={firstLine} path={path} />}
        meta={
          <>
            {added + removed > 0 && (
              <span>
                <span className="text-diff-add">+{added}</span>{' '}
                <span className="text-diff-del">−{removed}</span>
              </span>
            )}
            {duration && <span>{duration}</span>}
          </>
        }
        name="edit"
        state={call.status}
        title={<FileTitle path={path} verb="editing" />}
      />
      <ToolContent>
        {failed ? (
          <ToolOutput isError output={call.output} />
        ) : (
          <Diff caret={streaming} className="max-h-[28rem]" ref={scroller} rows={rows} />
        )}
        <ToolDiagnostics diagnostics={call.diagnostics} />
      </ToolContent>
    </Tool>
  )
}

function exitOf(call: ToolCallView): { label: string; ok: boolean } | undefined {
  if (call.status === 'done' && /\n\[Cancelled by the user after [^\]]*\]$/.test(call.output))
    return { label: 'cancelled', ok: false }
  if (call.status === 'done') return { label: 'exit 0', ok: true }
  if (call.status === 'interrupted') return { label: 'interrupted', ok: false }
  if (call.status !== 'error') return undefined
  const exited = call.diagnostics.find((diagnostic) => diagnostic.code === 'exit_code')
  const code = exited && /\d+/.exec(exited.message)?.[0]
  if (code) return { label: `exit ${code}`, ok: false }
  const messages = call.diagnostics.map((diagnostic) => diagnostic.message).join('\n')
  if (/timed out/.test(messages)) return { label: 'timeout', ok: false }
  if (/aborted/i.test(messages)) return { label: 'aborted', ok: false }
  return { label: 'failed', ok: false }
}

const separators: Record<string, string> = { '&&': '&&', '||': '||', ';': '·' }

/** The file a heredoc writes, by name: `cat > src/a.ts <<EOF` writes `a.ts`. */
const written = (step: BashStep) =>
  step.heredocs
    .find((heredoc) => heredoc.file && !heredoc.file.startsWith('heredoc.'))
    ?.file?.split('/')
    .at(-1)

/** The header line: each step's programs joined by pipe arrows, steps by their operators, repeats folded. */
function BashSummary({ steps }: { steps: BashStep[] }) {
  const runs: { step: BashStep; count: number }[] = []
  for (const step of steps) {
    const previous = runs.at(-1)
    if (
      previous &&
      previous.step.programs.join() === step.programs.join() &&
      step.operator !== '||'
    )
      previous.count++
    else runs.push({ step, count: 1 })
  }
  return (
    <>
      {runs.map(({ step, count }, index) => (
        <span key={index}>
          {index > 0 && (
            <span className="px-1.5 text-muted-foreground/50">
              {separators[step.operator ?? ';']}
            </span>
          )}
          {step.programs.map((name, position) => {
            const [program, ...rest] = name.split(' ')
            return (
              <span key={position}>
                {position > 0 && <span className="px-1 text-brand/70">→</span>}
                <span className="text-foreground/90">{program}</span>
                {rest.length > 0 && (
                  <span className="text-muted-foreground"> {rest.join(' ')}</span>
                )}
              </span>
            )
          })}
          {written(step) && <span className="text-muted-foreground"> &gt; {written(step)}</span>}
          {count > 1 && <span className="pl-1 text-muted-foreground/60">×{count}</span>}
        </span>
      ))}
    </>
  )
}

/** Cancel a running bash call: its command is killed and the model gets the output so far. */
function CancelCall({ callId }: { callId: string }) {
  const conversationId = useConversation((conversation) => conversation.id)
  const [sent, setSent] = useState(false)
  const cancel = () => {
    setSent(true)
    api.action(CancelAction, { callId }, { conversationId }).catch((error: unknown) => {
      setSent(false)
      throw error
    })
  }
  return (
    <button
      aria-label="Cancel this command"
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
      disabled={sent}
      onClick={cancel}
      title="Cancel this command; the agent gets the output so far"
      type="button"
    >
      <XIcon className="size-3" />
    </button>
  )
}

function Bash({ call }: { call: ToolCallView }) {
  const command = text(call.args.command)
  const display = useMemo(() => formatBashCommand(command), [command])
  const directory = usePath(display.directory ?? '')
  const parsed = display.steps.some((step) => step.programs.length > 0)
  const plain =
    parsed &&
    display.steps.length === 1 &&
    display.steps[0].programs.length === 1 &&
    !display.directory &&
    !command.includes('\n')
  const duration = useToolDuration(call)
  const exit = exitOf(call)
  const output = call.output
  const running = call.status === 'running'
  const [toggled, setToggled] = useState<boolean>()
  const open = toggled ?? (running || call.status === 'error')
  const scroller = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const element = scroller.current
    if (running && element) element.scrollTop = element.scrollHeight
  }, [output, running])
  return (
    <Tool onOpenChange={setToggled} open={open}>
      <ToolHeader
        meta={
          <>
            {display.directory && (
              <span className="max-w-48 truncate" title={display.directory}>
                {directory}
              </span>
            )}
            {exit && !exit.ok && (
              <span className={exit.label === 'cancelled' ? 'text-warning' : 'text-error'}>
                {exit.label}
              </span>
            )}
            {duration && <span>{duration}</span>}
          </>
        }
        action={running && <CancelCall callId={call.id} />}
        name="$"
        state={call.status}
        title={
          <span title={command.split('\n')[0]}>
            {plain || !parsed ? (
              <span className="text-foreground/90">{command.split('\n')[0]}</span>
            ) : (
              <BashSummary steps={display.steps} />
            )}
          </span>
        }
      />
      <ToolContent>
        {!plain && (
          <ToolSection className="space-y-1.5">
            {display.directory && (
              <div className="flex gap-2 text-muted-foreground/70">
                <span className="w-4 shrink-0 text-muted-foreground/50">$</span>
                <span className="min-w-0 truncate" title={display.directory}>
                  cd {directory}
                </span>
              </div>
            )}
            {display.steps.map((step, index) => (
              <div className="flex gap-2" key={index}>
                <span className="w-4 shrink-0 pt-px text-muted-foreground/50">
                  {step.operator ?? (display.directory ? '&&' : '$')}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <CodeBlock
                    className="rounded-none border-none bg-transparent [&_pre]:p-0 [&_pre]:whitespace-pre-wrap [&_.whitespace-pre]:whitespace-pre-wrap"
                    code={step.text}
                    language="bash"
                  />
                  {step.heredocs.map((heredoc, position) => (
                    <div className="border-l-2 border-border/80" key={position}>
                      <CodeBlock
                        className="rounded-none border-none"
                        code={heredoc.body}
                        language={languageFromPath(heredoc.file ?? '')}
                      />
                      <pre className="px-3 text-muted-foreground/60">{heredoc.closing}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ToolSection>
        )}
        {(output || running) && (
          <pre
            className="max-h-80 overflow-auto bg-terminal px-3 py-2 leading-[1.55] whitespace-pre-wrap text-foreground/85"
            ref={scroller}
          >
            {call.dropped && (
              <div className="text-muted-foreground/70">
                … {call.dropped.lines.toLocaleString()} earlier lines dropped
              </div>
            )}
            <AnsiOutput output={output} />
            {running && (
              <span className="ml-px inline-block h-3.5 w-1.5 animate-pulse-dot bg-brand align-middle" />
            )}
          </pre>
        )}
        {!output && !running && (
          <ToolSection className={cn('text-muted-foreground/70')}>no output</ToolSection>
        )}
        <ToolDiagnostics diagnostics={call.diagnostics.filter((d) => d.code !== 'tool_error')} />
      </ToolContent>
    </Tool>
  )
}

/** A file tool as a step line: its verb and path. */
const fileLine = (verb: string) =>
  function FileLine({ call }: { call: ToolCallView }) {
    return (
      <>
        <span className="text-foreground/80">{verb}</span> {usePath(text(call.args.path))}
      </>
    )
  }

/** A read as a step line; a skill's `SKILL.md` names the skill it loads. */
function ReadLine({ call }: { call: ToolCallView }) {
  const path = text(call.args.path)
  const shown = usePath(path)
  const skill = skillOf(path)
  return skill ? (
    <>
      <span className="text-foreground/80">skill</span> <span className="text-brand">{skill}</span>
    </>
  ) : (
    <>
      <span className="text-foreground/80">read</span> {shown}
    </>
  )
}

/** A bash call as a step line: its programs, as its header shows them. */
function BashLine({ call }: { call: ToolCallView }) {
  const command = text(call.args.command)
  const display = useMemo(() => formatBashCommand(command), [command])
  return (
    <>
      <span className="text-foreground/80">$</span>{' '}
      {display.steps.some((step) => step.programs.length > 0) ? (
        <BashSummary steps={display.steps} />
      ) : (
        command.split('\n')[0]
      )}
    </>
  )
}

export interface WrittenFile {
  path: string
  shown: string
  name: string
  tool: 'write' | 'edit'
  callId: string
  entryId: number
  count: number
  line?: number
}

const isUserTurnStart = (entry: EntryRecord) =>
  entry.model?.[0]?.role === 'user' && entry.kind !== 'pi.compaction'

function collectWrittenFiles(
  entries: readonly EntryRecord[],
  scope: readonly EntryRecord[],
  options: { cwd?: string; home?: string },
): WrittenFile[] {
  const results = new Map<string, { isError?: boolean; details?: EditDetails }>()
  for (const entry of entries) {
    const message = entry.model?.[0]
    if (message?.role === 'toolResult')
      results.set(message.toolCallId, {
        isError: message.isError,
        details: entry.data as EditDetails | undefined,
      })
  }
  const byPath = new Map<string, WrittenFile>()
  for (const entry of scope) {
    const message = entry.model?.[0]
    if (message?.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type !== 'toolCall' || (block.name !== 'write' && block.name !== 'edit')) continue
      const result = results.get(block.id)
      if (!result || result.isError) continue
      const args = block.arguments as { path?: unknown } | undefined
      const raw = typeof args?.path === 'string' ? args.path.trim() : ''
      if (!raw) continue
      const shown = shortenPath(raw, options)
      const name = raw.split('/').filter(Boolean).at(-1) ?? raw
      const details = result.details
      const line =
        block.name === 'edit'
          ? firstChangedLine(
              details?.patch
                ? parsePatch(details.patch)
                : details?.diff
                  ? parseDisplayDiff(details.diff)
                  : [],
            )
          : undefined
      const previous = byPath.get(raw)
      byPath.set(raw, {
        path: raw,
        shown,
        name,
        tool: block.name,
        callId: block.id,
        entryId: entry.id,
        count: (previous?.count ?? 0) + 1,
        line: line ?? previous?.line,
      })
    }
  }
  return [...byPath.values()]
}

function revealToolCall(conversationId: number | undefined, entryId: number, callId: string) {
  if (conversationId !== undefined)
    events.emit('ultimate:reveal-entry', { conversationId, entryId })
  setTimeout(() => {
    const element = document.querySelector<HTMLElement>(
      `[data-tool-call-id="${CSS.escape(callId)}"]`,
    )
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 40)
}

/**
 * Distinct files written or edited in a completed assistant turn, rendered as chips at the bottom of the turn's final
 * response (matching durable-pi's `.turn-written-files`).
 */
function AssistantTurnFiles({
  entry,
  blocks,
  core,
}: {
  entry: EntryRecord
  blocks?: readonly number[]
  core: ReactNode
}) {
  const entries = useTranscript()
  const { id, agent } = useConversation()
  const defaultCwd = useStore((state) => state.system?.execution.defaultCwd)
  const home = useStore((state) => state.system?.machine.home)
  const message = entry.model?.[0]
  const lastBlock = message?.role === 'assistant' ? message.content.length - 1 : -1
  const isTurnTail =
    message?.role === 'assistant' &&
    message.stopReason !== 'toolUse' &&
    (!blocks || blocks.includes(lastBlock))
  const turnFiles = useMemo(() => {
    if (!isTurnTail) return []
    const at = entries.indexOf(entry)
    if (at < 0) return []
    const turnEntries: EntryRecord[] = []
    for (let index = at; index >= 0; index--) {
      const current = entries[index]
      if (isUserTurnStart(current)) break
      turnEntries.unshift(current)
    }
    return collectWrittenFiles(entries, turnEntries, {
      cwd: agent.cwd ?? defaultCwd,
      home,
    })
  }, [isTurnTail, entries, entry, agent.cwd, defaultCwd, home])
  if (!turnFiles.length) return core
  return (
    <div className="space-y-1.5">
      {core}
      <div
        aria-label="Files written in this turn"
        className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]"
        data-turn-written-files
      >
        {turnFiles.map((file) => (
          <div
            className="inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-md border border-border/80 bg-card/60"
            data-turn-file-chip={file.path}
            key={file.path}
          >
            <button
              className="inline-flex h-6 min-w-0 cursor-pointer items-center gap-1.5 px-2 text-foreground/90 transition-colors hover:bg-accent/50"
              onClick={() => revealToolCall(id, file.entryId, file.callId)}
              title={`${file.shown} (${file.tool})`}
              type="button"
            >
              <FileCode2Icon className="size-3 shrink-0 text-brand" />
              <span className="truncate">{file.name}</span>
            </button>
            <OpenFileButton line={file.line} path={file.path} variant="chip" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Header popover listing all files written or edited by the agent in the shown conversation, with jump-to-call, copy
 * path, and `nvim` actions (matching durable-pi's `Changed files` header menu).
 */
function ChangedFilesButton() {
  const { id, agent } = useConversation()
  const { surface } = useUltimate()
  const entries = useTranscript()
  const defaultCwd = useStore((state) => state.system?.execution.defaultCwd)
  const home = useStore((state) => state.system?.machine.home)
  const [open, setOpen] = useState(false)
  const cwd = agent.cwd ?? defaultCwd
  const files = useMemo(
    () => (surface === 'agent' ? collectWrittenFiles(entries, entries, { cwd, home }) : []),
    [surface, entries, cwd, home],
  )
  if (surface !== 'agent' || id === undefined || files.length === 0) return null
  const shownCwd = cwd ? shortenPath(cwd, { home }) : undefined
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label="Changed files"
          className={cn(
            'flex h-7 cursor-pointer items-center gap-1 rounded px-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            open && 'bg-muted text-brand',
          )}
          data-changed-files-toggle
          title={`${files.length} file${files.length === 1 ? '' : 's'} changed by this agent`}
          type="button"
        >
          <FileDiffIcon className="size-3.5 shrink-0" />
          <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-medium text-brand tabular-nums">
            {files.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(32rem,calc(100vw-2rem))] p-0 font-mono text-[12px]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Changed files ({files.length})</span>
          {shownCwd && (
            <span className="min-w-0 truncate text-muted-foreground/70" title={cwd}>
              {shownCwd}
            </span>
          )}
        </div>
        <div className="max-h-80 divide-y divide-border/50 overflow-y-auto">
          {files.map((file) => (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-accent/40"
              data-changed-file-row={file.path}
              key={file.path}
            >
              <button
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                onClick={() => {
                  setOpen(false)
                  revealToolCall(id, file.entryId, file.callId)
                }}
                title={`Jump to ${file.tool} (#${file.entryId}) — ${file.path}`}
                type="button"
              >
                <FileCode2Icon className="size-3.5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-foreground">{file.name}</span>
                  {file.shown !== file.name && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{file.shown}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-muted-foreground">
                  <span>{file.tool}</span>
                  {file.count > 1 && <span>×{file.count}</span>}
                </span>
              </button>
              <button
                aria-label={`Copy path ${file.name}`}
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void navigator.clipboard.writeText(file.path)}
                title={`Copy ${file.path}`}
                type="button"
              >
                <CopyIcon className="size-3" />
              </button>
              <OpenFileButton line={file.line} path={file.path} />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default defineWebExtension({
  tools: { read: Read, write: Write, edit: Edit, bash: Bash },
  toolLines: {
    read: ReadLine,
    write: fileLine('write'),
    edit: fileLine('edit'),
    bash: BashLine,
  },
  entries: {
    'pi.assistant': AssistantTurnFiles,
  },
  slots: {
    'header.right': [ChangedFilesButton],
  },
})
