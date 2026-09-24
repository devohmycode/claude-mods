import type { Elements } from 'claude-code'

export const PLUGIN_NAME = 'contextmanager'
export const PANE_ID = 'manager'
export const PANE_TITLE = 'ContextManager'
export const PANE_INLINE_ROWS = 18            // body rows requested when seated inline above the prompt (the compact card is framed)
export const AUTO_OPEN_MIN_COLUMNS = 144      // unasked opens wait undrawn below this width (d.ts 1943-1945)
export const STEER_RING_TRIES = 8             // frames the Fix… field's ring is asked for before the composer route is said
export const STEER_RING_WAIT_MS = 40          // a frame and a little: the shown pane redraws at most thirty times a second
export const COMMAND = { name: 'manager', description: 'ContextManager: toggle the pane · check | fix [n] [text] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset', argumentHint: '[check | fix [n] [text] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]' } as const
export const SETTLE_TURNS = 2                 // an instruction not ignored for this many turns is credited
export const JUDGE_MIN_NEW_TOKENS = 30_000
export const JUDGE_MIN_TURNS = 3
export const JUDGE_MIN_ROWS = 8
export const JUDGE_MAX_BACKOFF = 4
export const JUDGE_BUDGET_SHARE = 0.03
export const JUDGE_LEDGER_ROWS = 150          // full rows rendered; older rows are folded into `~` summary lines
export const MAX_FINDINGS = 6
export const MAX_BEHAVIORAL_FINDINGS = 3      // findings with signature: null per judge run (agent findings are signature-null too)
export const MAX_PATTERNS = 50
export const ROW_CAP = 2000
export const KIND_MAX = 120
export const ALTERNATIVE_MAX = 200
export const KEY_MAX = 200
export const DEBUG_MAX_LINES = 40             // `/manager debug` ceiling
export const DEBUG_MAX_PATTERNS = 16          // pattern lines `/manager debug` prints before folding the rest
export const DEBUG_MAX_DROPPED = 6            // dropped-finding reasons `/manager debug` and the debug log print
export const BRIEF_TOOLS = 'Read, Grep, Glob' // the tools an agent brief allows when the proposal names none
export const FILE_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'NotebookEdit']   // tools whose ledger key is the path they touched
export const CLAUDE_MD_HEADING = '## ContextManager'
export const RECOVERED_FLAG = 'recovered'     // `Row.flags` marker for a row rebuilt from the transcript: its `ms` is 0 and its agent reads `main`
export const APPLIED_FLAG = 'applied'         // `Row.flags` marker for a call Apply rewrote: the command in the row is the one that ran
export const MAIN_AGENT = 'main'              // `Row.agent` of the main loop; the alias table leaves it as it is
export const NO_CALLS = 'no tool calls'       // `Evidence.what` of a turn handle: that turn ran none
export const CARD_EVIDENCE = 3                // cited calls one card's details show, newest first
export const JUDGE_MIN_NEW_ROWS = 40          // mid-turn cadence: ledger rows since the last run (a turn can last hours)
export const JUDGE_MIN_GAP_MS = 300_000       // mid-turn cadence: at least five minutes between runs
export const TREND_TURNS = 10                 // context samples the header's trend draws
export const SINKS = 3                        // named sinks the Time and Context rows show
export const LOOP_CAP = 400                   // loops kept (oldest dropped)
export const AGENTS_ROWS = 60                 // loop lines the AGENTS block renders in full; older ones fold per run
export const RUN_REFRESH_MS = 10_000          // a running workflow's journal is re-read at most this often
export const RUN_FRESH_MS = 600_000           // a run with no loop yet counts as active this long after its launch
export const DETECT_MIN_REPEATS = 3           // occurrences a deterministic detector needs before it names a behaviour
export const LOG_DUMP_MIN_REPEATS = 2         // the same whole-log dump twice is already one too many
export const LOG_DUMP_CHARS = 20_000          // a log read this large, or persisted by the engine, is a dump
export const DETECTED_SLUG = 'cm-'            // the slug every detector's id opens with: `reading:cm-reread-1a2b3c`
export const PREFIX_MIN_BREAKS = 2            // model or effort switches before the prefix card; one is usually a choice
export const PREFIX_SAMPLES = 50              // steady steps whose cache writes the median of a normal step is read from
export const PREFIX_BREAKS_CAP = 50           // breaks kept (oldest dropped)
export const HISTORY_SESSIONS = 50            // sessions the project's history file keeps (oldest rewritten away)
export const TIMING_SESSIONS = 4              // sessions the project's timing file keeps, newest first: the ones that may share a project at once
export const MUTE_SESSIONS = 3                // sessions a behaviour must have been ignored in before it goes quiet in a project
export const DEAD_RULE_SESSIONS = 10          // sessions after a rule was written, none of them seeing its behaviour, before the rule is offered for removal
export const PREVIEW_LINES = 4                // lines of an artifact's text the Write preview quotes
export const RULE_MARKER = 'cm:'              // the id a written CLAUDE.md bullet carries in an HTML comment: `<!-- cm:reading:cm-reread-1a2b3c -->`
/** How eager ContextManager is, as one `/config` row rather than a threshold per knob. */
export type Sensitivity = 'quiet' | 'normal' | 'verbose'
export const SENSITIVITIES: readonly Sensitivity[] = ['quiet', 'normal', 'verbose']
/** What each sensitivity moves: the judge's token gate (a factor) and turn gate (a delta), the detectors' floor (a delta), and the findings one run may keep. */
export const TUNING: Readonly<Record<Sensitivity, { tokens: number; turns: number; floor: number; findings: number }>> = {
  quiet: { tokens: 2, turns: 2, floor: 1, findings: 3 },
  normal: { tokens: 1, turns: 0, floor: 0, findings: 6 },
  verbose: { tokens: 0.5, turns: -1, floor: -1, findings: 6 },
}
export const APPLY_FULL_EVERY = 3             // every third run of an applied suite goes through whole, so a regression elsewhere still shows
export const APPLY_WATCH_CALLS = 2            // calls after a rewrite in which running the original again counts as a failure of it
export const APPLY_MAX_FAILURES = 2           // failures before a rewrite stops itself for the session
export const LOG_TAIL_LINES = 300             // what a whole-log read is rewritten to keep
export const JUDGE_EMPTY_RUNS = 3             // judge runs in a row that kept nothing before the cadence slows to its floor

export type CommandClass = 'test' | 'lint' | 'format' | 'typecheck' | 'build' | 'install' | 'git' | 'read' | 'search' | 'other'
export type Category = 'execution' | 'reading' | 'production' | 'behavior' | 'communication' | 'multi-agent' | 'environment' | 'process' | 'other'
export type Choice = 'keep' | 'steer' | 'kill'

export type Row = {
  seq: number              // 1-based, monotonically increasing; the judge sees `r${seq}`
  id: string               // tool_use_id
  tool: string; key: string; cls: CommandClass
  agent: string            // e.agentId ?? 'main'
  turn: number
  ms: number; chars: number
  head: string             // first 80 chars of result.text, control characters stripped; quoted as evidence in the pane, never sent to the judge
  flags: string[]          // 'err' (tool reported an error) | 'denied' (result.deny: the user or a policy said no) | 'dedup' (Read type 'file_unchanged') | 'trunc' (truncatedByTokenCap) | 'bg' (run_in_background or backgroundTaskId) | 'timeout' (timedOutAfterMs) | `persist=${persistedOutputSize}` | 'ask' (AskUserQuestion: ms is the wait for the person) | 'recommended' (an ask whose questions carry '(Recommended)') | 'recovered' (rebuilt from the transcript at load: ms is 0 and agent reads 'main')
  lines: { add: number; del: number } | null   // Edit: gitDiff.additions/deletions else counted from structuredPatch; Write: content line count as add
  paths: string[]          // absolute paths this call edited (Edit/Write filePath unless staged; Bash bashEditDiff.changedFiles)
  spawn: { type: string; requested: string | null; resolved: string | null; status: string | null; tokens: number | null; edits: number | null; promptChars: number } | null   // Agent rows only
}
export type TurnStat = { turn: number; input: number; output: number; cacheRead: number; cacheCreate: number; calls: number; ms: number; answerChars: number; answerHead: string; aborted: boolean; ended: TurnEnd; at: number; idleMs: number; context: number | null }   // answerHead: first 100 chars of e.answer, for evidence quotes; ended: how the turn ended; at: clock at completion; idleMs: wait until the next turn started (0 until it does); context: tokens in the window after the turn (usage), null when unknown — growth between turns is the pace compaction runs at
export type TurnEnd = 'answer' | 'aborted' | 'refusal' | 'error'
export type Tokens = { input: number; output: number; cacheRead: number; cacheCreate: number }
export type Outcome = { kind: 'findings'; critical: number; high: number; medium: number; low: number } | { kind: 'report'; chars: number }
export type Loop = { id: string; run: string | null; label: string | null; phase: string | null; model: string | null; turns: number; ms: number; tokens: Tokens; ended: TurnEnd | null; firstTurn: number; firstSeq: number; outcome: Outcome | null; calls: number; edits: number; checks: number; reads: number }   // one spawned agent loop: `id` is its agentId (the ledger's `agent`), `run` the workflow run that launched it, `ended` null while it runs; calls/edits/checks/reads count its own rows as they land, so the line stays whole once ROW_CAP drops them
export type Folded = { tool: string; key: string; cls: CommandClass; agent: string; count: number; ms: number; chars: number; firstTurn: number; lastTurn: number; flags: { ask: number; recommended: number; err: number } }   // one (tool, key) pair's rows dropped past ROW_CAP: nothing citable, everything counted; `agent` is 'main' or the first loop seen
export type Run = { id: string; name: string; dir: string | null; turn: number; seq: number; at: number; refreshedAt: number }   // at: clock at launch; refreshedAt: last journal read (0 never)
export type JournalEntry = { kind: 'started'; agentId: string; label: string | null; phase: string | null } | { kind: 'result'; agentId: string; outcome: Outcome }
export type Signature = { tool: string; key: string }
export type ArtifactKind = 'claude-md' | 'skill' | 'agent-brief' | 'settings-allow'
export type Proposal = { kind: ArtifactKind; title: string; body: string }

/** Persisted across sessions, per project. */
export type StoredPattern = {
  id: string                       // `${category}:${slug}`, slug ≤ 40
  category: Category
  kind: string                     // the behaviour, one sentence ≤ 120 chars: "Claude keeps running `bun test` after every step"
  signature: Signature | null      // null = behavioural, no single command carries it
  why: string
  alternative: string              // the fix, one imperative sentence ≤ 200 chars written for Claude; pre-fills Fix…, completes Fix
  confidence: number               // 0.5..1
  proposal: Proposal | null
  estTokensPerTurn: number | null  // judge's estimate for behavioural patterns; null when a signature exists
  lastDecision: Choice | null      // the most recent session's decision, for the judge's calibration
}
/** Session-only fields. */
export type Pattern = StoredPattern & {
  hits: string[]                   // evidence handles: row ids (tool_use_id), `turn:<n>` or `agent:<agentId>`; grows with matching rows; cost/baseline from rows only
  decision: Choice | null
  decidedAtTurn: number | null
  instruction: string | null       // the text sent for steer/kill
  openedAtTurn: number | null      // turn of the last steer/kill; settles saved (credited or ignored)
  ignored: number                  // times the instruction was ignored
  credited?: { ms: number; chars: number }   // what this pattern's settled instructions saved this session; absent until one did
  applied?: { count: number; failures: number; stopped: boolean }   // Apply was pressed: rewrites in a row since the last whole run, times Claude ran the original again, and whether it gave up
}

/** What one fork of the judge cost, in the four token counts the API reports. */
export type JudgeUsage = { input: number; output: number; cacheRead: number; cacheCreate: number }
/** What one judge run reported: findings returned, findings kept, one short line per drop and per cap a kept finding missed, and what the fork cost (null when it returned nothing). */
export type JudgeRun = { returned: number; kept: number; dropped: readonly string[]; usage: JudgeUsage | null }

/** One cited call (or turn) as the details render it: what ran, in which loop, what it cost, what it answered. */
export type Evidence = {
  turn: number
  what: string             // the command for Bash, the path for a file tool, `tool key` otherwise; NO_CALLS for a turn handle
  agent: string | null     // the loop's alias (a1, a2…), null when it was the main loop's own call
  ms: number               // 0 when nothing measured it (a turn handle, a recovered row)
  chars: number            // in-context size of the result, or of the turn's answer
  head: string             // the first line of what came back, quoted under the call; '' when there is none
}
/** One waster as the pane draws it: the behaviour, the stats, the fix, and the receipts behind `i`. */
export type Card = {
  patternId: string
  n: number                // 1-based seat in the pane's list, top to bottom
  category: Category       // the dim tag on the title row
  kind: string
  stats: string
  why: string
  fix: string
  total: { unit: 'calls' | 'turns' | 'agents'; calls: number; ms: number; chars: number }   // cited calls, their wall time and their context; `unit: 'turns'` when the pattern cites turns instead, so `calls` counts turns and `chars` is the per-turn estimate; `unit: 'agents'` when it cites loops, so `calls` counts loops and `ms` is their sum
  evidence: readonly Evidence[]                          // ≤ CARD_EVIDENCE cited calls, newest first
  canApply?: boolean       // the `apply` lever is on and this behaviour has a rewrite: the card offers Apply beside Fix
}
/** A change of model or effort between two steps of the main loop: the step after it rewrote the prompt cache. */
export type PrefixCause = 'model' | 'effort'
export type PrefixBreak = { cause: PrefixCause; turn: number; from: string; to: string; cacheCreate: number | null }   // cacheCreate: what the step after the switch wrote to the cache, null when the step reported no usage
export type Prefix = {
  last: { model: string; effort: string | null } | null   // the main loop's previous step; null before the first
  breaks: PrefixBreak[]                                    // capped at PREFIX_BREAKS_CAP
  steady: number[]                                         // cache writes of the last PREFIX_SAMPLES steps that switched nothing
}

/** The session's facts the pane can show, each behind a `/config` row of its own. */
export type InfoKey = 'model' | 'effort' | 'fiveHour' | 'fiveHourReset' | 'week' | 'cost' | 'branch' | 'diff' | 'skill' | 'version' | 'clock' | 'system'
export const INFO_KEYS: readonly InfoKey[] = ['model', 'effort', 'fiveHour', 'fiveHourReset', 'week', 'cost', 'branch', 'diff', 'skill', 'version', 'clock', 'system']
export const INFO_REFRESH_DEFAULT_S = 30      // seconds between two readings of git, the limits and the machine while the pane is open
export const INFO_REFRESH_MIN_S = 5           // the floor a `/config` value is held to: a probe spawns a process
/** What the session's facts were at the last reading; null wherever nothing has said yet. */
export type Info = {
  model: string | null                                     // from /context at the start, until a step names one
  limits: { fiveHour: { percent: number; resetsAt: number | null } | null; week: { percent: number } | null }
  costUsd: number | null
  git: { branch: string | null; add: number; del: number } | null   // null outside a repository
  skill: string | null                                     // the last skill loaded this session
  version: string | null
  system: { cpu: number | null; ram: number | null } | null
  at: number                                               // the clock at the last reading, for the time the pane shows
}

/** One row of /context that is not the conversation: the system prompt, the tools, the memory files, the agents. */
export type PrefixPart = { name: string; tokens: number }
/** What filled the window before a compaction: the turn it came at, and the largest sinks since the one before. */
export type CompactionReport = { turn: number; total: number; sinks: readonly Sink[] }

/** What Write would do, shown before it does it: the lines it adds, and whether they are there already. */
export type ArtifactPreview = { patternId: string; kind: ArtifactKind; path: string; mode: Artifact['mode']; added: string; duplicate: boolean; overwrites: boolean }
/** A written rule whose behaviour has not turned up since, and had not before either: offered for removal. */
export type StaleRule = { patternId: string; text: string; sessions: number }

export type Artifact = { patternId: string; kind: ArtifactKind; title: string; path: string; content: string; savingPct: number; mode: 'append' | 'write' | 'merge-settings' }
export type Usage = { tokens?: number; window: number; percent?: number; compactAt?: number }

export type State = {
  cwd: string
  turn: number
  seq: number                      // last Row.seq issued
  rows: Row[]                      // capped at ROW_CAP (oldest dropped)
  folded: Record<string, Folded>   // the rows ROW_CAP dropped, folded per `${tool}\t${key}`: STATS, the LEDGER's `~` lines and the sinks count them, so a long session's totals stay whole
  turns: TurnStat[]
  loops: Loop[]                    // every agent loop seen, oldest first, capped at LOOP_CAP (oldest dropped)
  runs: Run[]                      // every Workflow launched this session, oldest first
  usage: Usage
  overhead: { memory: number; mcp: number; agents: number } | null
  compactions: number[]            // turn indices at which session.compact fired
  patterns: Pattern[]
  cards: string[]                  // pattern ids awaiting a decision, newest first (the pane's WASTERS list)
  expanded: string | null          // pattern id whose (i) details are open; one at a time
  steering: string | null          // pattern id whose Fix… field is open
  steerDraft: string | null        // what the person has typed so far: every render draws it back into the field, so a redraw for any other reason never wipes it
  notes: string[]                  // one-shot texts: drained into the next tool result or prompt
  standing: string[]               // texts re-sent with every prompt this session
  written: string[]                // `${patternId}:${kind}` of artifacts written, tried or skipped this session; propose() omits them
  judge: { lastAtTokens: number; lastAtTurn: number; lastAtSeq: number; lastAtMs: number; running: boolean; runs: number; spent: number; backoff: number; error: string | null; focus: string | null; time: string | null; context: string | null; last: JudgeRun | null }   // lastAtSeq/lastAtMs: the mid-turn cadence; time/context: the judge's one-line explanations of where they went
  pendingCheck: boolean            // a check armed at load and not yet answered: a plugin that joined a session with history fires one there and retries it at every warm opportunity until a run answers (§6)
  paneOpen: boolean
  autoOpened: boolean              // the pane auto-opened once this session (like /diff on the first edit)
  columns: number | null           // last band width seen (e.props.bodyColumns), for the auto-open decision
  saved: { ms: number; chars: number }
  prefix: Prefix                   // the main loop's model and effort, step by step, and the switches that rewrote the cache
  muted: string[]                  // pattern ids ignored in MUTE_SESSIONS sessions of this project: counted, never carded
  emptyRuns: number                // judge runs in a row that answered and kept nothing; JUDGE_EMPTY_RUNS slows the cadence to its floor
  prefixParts: PrefixPart[] | null // what every request re-reads before the conversation, by /context's rows; null until measured
  lastCompaction: CompactionReport | null   // where the context went between the last two compactions
  preview: ArtifactPreview | null  // the Write the person pressed once: shown until they press it again, skip it or reset
  stale: StaleRule[]               // written rules offered for removal this session, read at session.start
  sensitivity: Sensitivity         // the `/config` row, settled at register: it outlives a reset
  canApply: boolean                // the `apply` row of `/config`: whether cards may offer Apply at all
  info: Info                       // the session's facts at the last reading
  infoShow: Record<InfoKey, boolean>   // which of them the `/config` rows switch on
}

export const initialState = (cwd: string, window: number): State => ({
  cwd, turn: 0, seq: 0, rows: [], folded: {}, turns: [], loops: [], runs: [], usage: { window }, overhead: null, compactions: [], patterns: [], cards: [], expanded: null, steering: null, steerDraft: null, notes: [], standing: [], written: [],
  prefix: { last: null, breaks: [], steady: [] }, muted: [], emptyRuns: 0, prefixParts: null, lastCompaction: null, preview: null, stale: [], sensitivity: 'normal', canApply: false,
  info: { model: null, limits: { fiveHour: null, week: null }, costUsd: null, git: null, skill: null, version: null, system: null, at: 0 },
  infoShow: { model: true, effort: true, fiveHour: true, fiveHourReset: true, week: true, cost: true, branch: true, diff: true, skill: true, version: true, clock: true, system: true },
  judge: { lastAtTokens: 0, lastAtTurn: 0, lastAtSeq: 0, lastAtMs: 0, running: false, runs: 0, spent: 0, backoff: 1, error: null, focus: null, time: null, context: null, last: null }, pendingCheck: false, paneOpen: false, autoOpened: false, columns: null, saved: { ms: 0, chars: 0 },
})

export type Action =
  | { type: 'turn.start'; now: number }                        // now: dates the idle wait since the last completed turn
  | { type: 'loop.turn'; agentId: string; model: string | null; ms: number; tokens: Tokens; ended: TurnEnd; turn: number }   // one turn of an agent loop completed
  | { type: 'agent.start'; agentId: string; description: string; model: string | null }   // an Agent tool result: names the loop
  | { type: 'run.start'; run: { id: string; name: string; dir: string | null }; now: number }   // a Workflow tool result: a run launched (an id already present is a resume)
  | { type: 'run.journal'; runId: string; entries: JournalEntry[]; now: number }   // a run's journal read: stages and outcomes of its loops
  | { type: 'row'; row: Omit<Row, 'seq'> }
  | { type: 'adopt'; rows: readonly Omit<Row, 'seq'>[] }      // rows rebuilt from the transcript of a session joined late
  | { type: 'turn.complete'; stat: Omit<TurnStat, 'turn' | 'calls'> }
  | { type: 'usage'; usage: Usage; now: number }
  | { type: 'overhead'; overhead: { memory: number; mcp: number; agents: number } }
  | { type: 'artifact.preview'; preview: ArtifactPreview | null }   // Write pressed once: what it would do; null closes the preview
  | { type: 'stale'; rules: StaleRule[] }                   // the written rules offered for removal this session
  | { type: 'stale.done'; patternId: string }               // one of them removed or kept: it leaves the list
  | { type: 'apply.on'; patternId: string }                  // Apply pressed: the calls that carry this behaviour are rewritten from now on
  | { type: 'apply.rewrote'; patternId: string }             // one call rewritten
  | { type: 'apply.whole'; patternId: string }               // one call let through whole on purpose: the count starts again
  | { type: 'apply.failed'; patternId: string }              // Claude ran the original again right after a rewrite
  | { type: 'info'; info: Partial<Info> }                     // a reading of the session's facts: what it measured, the rest kept
  | { type: 'prefix'; parts: PrefixPart[] }                 // /context's rows outside the conversation, measured by the engine
  | { type: 'compact' }
  | { type: 'expand'; patternId: string | null }              // (i) toggled; null collapses
  | { type: 'steer.begin'; patternId: string }
  | { type: 'steer.draft'; text: string }
  | { type: 'decide'; patternId: string; choice: Choice; text?: string }   // text required for steer
  | { type: 'judge.start'; now: number; seq: number }        // when and at which ledger row the run began, for the mid-turn cadence
  | { type: 'judge.done'; patterns: Pattern[]; fresh: string[]; recurred: string[]; focus: string | null; time: string | null; context: string | null; spent: number; error: string | null; returned: number; kept: number; dropped: readonly string[]; usage: JudgeUsage | null }
  | { type: 'check.arm' }                                      // the ledger a session.start adopted already passes the row floor: judge it there, and again at the next warm opportunity if that run answers nothing
  | { type: 'step'; model: string; effort: string | null; cacheCreate: number | null }   // one step of the main loop answered: its model, its effort, what it wrote to the cache
  | { type: 'history'; muted: string[] }                     // the project's history was read, or a behaviour was unmuted: what stays quiet here
  | { type: 'judge.wake' }                                    // the person asked for a check: an audit slowed by empty runs runs at its own pace again
  | { type: 'detect.done'; patterns: Pattern[]; fresh: string[] }   // the deterministic detectors named something: the registry merged with it, and the ids that are news
  | { type: 'notes.drained' }
  | { type: 'standing.add'; text: string }
  | { type: 'artifact.done'; patternId: string; kind: ArtifactKind; written: boolean }   // written: true once the rule is handled — written, tried or skipped — and recorded in state.written
  | { type: 'pane'; open: boolean; auto?: true }
  | { type: 'columns'; columns: number }
  | { type: 'reset' }

/** Judge output after validation (section 5.3). */
export type Finding = { id: string; category: Category; kind: string; evidence: string[]; signature: Signature | null; why: string; alternative: string; confidence: number; estTokensPerTurn: number | null; proposal: Proposal | null }

/** UI ↔ shell interface. */
export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input' | 'Raster'>
export type Site = { bodyColumns: number; maxRows: number }
export type Actions = {
  keep(patternId: string): void
  steer(patternId: string): void          // toggles the Fix… field under the waster's verbs
  steerDraft(text: string): void          // every keystroke: the state keeps the text and the redraw is what paints it
  steerSubmit(patternId: string, text: string): void  // Enter in the field, or /manager fix <text>
  kill(patternId: string): void
  info(patternId: string): void           // toggles the (i) details
  togglePane(): void
  check(): void                           // run the judge now
  write(a: Artifact): void
  tryOnce(a: Artifact): void
  skip(a: Artifact): void
  removeRule(patternId: string): void     // a stale rule: take its bullet out of CLAUDE.md
  keepRule(patternId: string): void       // a stale rule: keep it, and stop asking this session
  apply(patternId: string): void          // Fix, and rewrite the calls that carry the behaviour from now on
}
/** View models: computed by patterns.ts from State, rendered by ui.tsx. Keeps the UI free of state logic. */
export type Sink = { label: string; amount: number; count: number }   // one named consumer: `tests`, `reads`, `agents`, `git`…; amount in ms (time) or chars (context)
export type Sinks = { total: number; sinks: readonly Sink[] }         // total over every ledger row of the main loop plus the agents' own rows (Agent spawn rows excluded: they contain their loop's rows); the SINKS largest named
export type Header = {
  percent: number | null            // context used, 0..100
  tokensToCompaction: number | null // exact: threshold - tokens
  turnsToCompaction: number | null  // estimate at the recent pace: tokens to compaction / median context growth per turn
  prefix: { total: number; parts: readonly PrefixPart[] } | null   // re-read by every request: the engine's own measure, in tokens; null until measured
  compaction: { turn: number; sinks: readonly { label: string; share: number }[] } | null   // the last compaction and what had filled the window, by share of the ledger's context
  info: { session: readonly string[]; machine: readonly string[]; repo: readonly string[] }   // the facts switched on, one short item each, in their three rows; a row with nothing known is []
  turnsRange: { low: number; high: number } | null   // the same run at the fast and the slow quartile of the last TREND_TURNS turns' growth; null when too few turns grew or both ends agree
  trend: readonly number[]          // context percent after each of the last TREND_TURNS turns, oldest first; [] before the first
  time: Sinks | null                // where the wall-clock went, from the ledger; null before the first row
  timeUnmeasured: boolean           // no row carries a measured duration: every one was rebuilt from a transcript, so the time is unknown, not 0s
  context: Sinks | null             // where the context went, from the ledger; null before the first row
  judgeTime: string | null          // the judge's one-line explanation of the time, verbatim; null until it has run
  judgeContext: string | null       // the judge's one-line explanation of the context
  judgeRuns: number
  judgeTokens: number               // tokens the judge has spent this session; the pane's JUDGE row
  judgeShare: number                // those tokens as a percentage of the session's, 1 decimal; 0 while the session has none; `/manager debug` only
  judgeRunning: boolean             // a run is in flight: Check now reads `Checking…`, dims, and ignores presses
  savedPct: number
  savedMs: number
}
export type DecidedRow = {
  patternId: string
  choice: Choice
  kind: string
  savedPct: number | null   // what one avoided repeat is worth; a rate until `settled`, a credit after it
  settled: boolean          // the instruction was neither ignored nor still in flight, so the saving is real
  instruction: string | null   // the sentence the user sent, when it is not the fix the card offered
  ignored: number
}
export type PaneModel = {
  header: Header
  wasters: Card[]                   // undecided patterns, newest first
  expanded: string | null
  steering: string | null
  steerDraft: string | null
  decided: DecidedRow[]             // newest first
  artifacts: Artifact[]
  preview: ArtifactPreview | null
  stale: readonly StaleRule[]
}
/** The band's one teaser line: which of the four states the session is in, and the figures that state names. */
export type BandModel = {
  state: 'died' | 'checking' | 'found' | 'saved' | 'watching'   // the first that applies: the last turn died, a judge run in flight, cards waiting, a saving credited, else watching
  died: TurnEnd | null     // the last turn's `ended` when it was an error or a refusal and no turn has started since
  running: { name: string; loops: number; calls: number; label: string | null } | null   // the newest active workflow run: its loops, their rows, the newest unended loop's stage
  fresh: number            // cards awaiting a decision
  costPct: number          // what those cards have already cost, as a share of the window
  costMs: number           // and in wall time
  savedPct: number
  savedMs: number
  calls: number            // ledger rows watched this session
  paneOpen: boolean
  slowed?: boolean         // the last JUDGE_EMPTY_RUNS judge runs kept nothing, so it now waits for more work between runs
}
export type BandProps = { ui: Ui; model: BandModel; site: Site; actions: Actions }
export type PaneProps = { ui: Ui; model: PaneModel; site: Site; placement: 'dock' | 'inline'; actions: Actions }
