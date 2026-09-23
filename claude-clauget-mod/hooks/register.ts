/**
 * The hooks: what the mod watches, and the two places it writes.
 *
 * Everything here hangs off one reading. A turn is a sequence of model
 * requests, `turn.step` is raised once per request, and its stream ends with
 * a stop chunk carrying the four token counters and the model that answered.
 * Relaying that stream costs nothing — the chunks pass through either way —
 * and it is the only grain at which a session's real cost is visible.
 *
 * By default the mod cuts nothing, defers nothing, rewrites nothing: it
 * reads what goes past, names the cache misses it exposes, and prints two
 * lines a turn where the model will never read them. What it costs to do
 * that is printed beside the rest, because a column of savings without a
 * column of costs is an advertisement.
 *
 * One row turns on what it can do besides: the economy, which `/clauget on`
 * writes and every lever left off in its own row follows. `levers`, the
 * policy on the prefix, decided once at a session's start. `cuts`, each
 * tool's result cut to its shape and filed whole. `steps`, the explorer and
 * the guards. `compaction`, the one moment rewriting the past is free. And
 * the pilot — tiers, forecast, deferred prompts — which only ever moves flow,
 * never an answer the prefix is made of. `bashCap` stays, the bench of the
 * one rewrite J1 proved.
 */

import type {
  CockpitDraw,
  CockpitTabInfo,
  On,
  PluginOptions,
  RenderElement,
  SessionContextBreakdown,
  SessionMeasureInput,
  ToolCallResult,
} from 'claude-code'

import { billOf } from './bill'
import { MISS_LIMITS, NO_SEEN, isFault, missOf } from './cache'
import type { Seen } from './cache'
import { answerOf, chainOf, markerBytesOf } from './call'
import type { CallLimits } from './call'
import {
  NO_COMPACT_STATS,
  sessionBriefOf,
  compactPointOf,
  compactionLines,
  countdownText,
  digestOf,
  factsOf,
  forkUsageOf,
  instructionsTextOf,
  lightenedOf,
  medianOf,
  pointLine,
  readRangesFrom,
  withRead,
} from './compaction'
import type { CompactStats, ReadRanges } from './compaction'
import {
  NO_CUT_STATS,
  blobCutOf,
  cutStatsFrom,
  cutsLine,
  filedPathOf,
  isFileable,
  isFiledPath,
  withCut,
} from './cuts'
import type { CutStats } from './cuts'
import { byteText, bytesOf } from './format'
import { NO_INSTRUCTIONS, instructionsFrom, instructionsOf, pathKeyOf } from './instructions'
import type { Instructions } from './instructions'
import { NO_INVENTORY, inventoryFrom, providerOf, withDescribed } from './inventory'
import type { Inventory } from './inventory'
import {
  briefPathOf,
  journalOf,
  journalPathOf,
  keptOf,
  reportPathOf,
  restoredOf,
  sessionKeyOf,
  staleKeysOf,
} from './keep'
import {
  NO_LEDGER,
  lastStepOf,
  prefixOf,
  stepsPerTurnOf,
  usageOf,
  withStep,
  withTurn,
} from './ledger'
import type { Ledger, Step } from './ledger'
import {
  BASH_BUDGET,
  BODY_PAD_COLUMNS,
  BRING_BACK_CALLS,
  CACHE_TTL_MS,
  CAP_OFF,
  COCKPIT_CHROME_ROWS,
  COCKPIT_PANE,
  COMMAND_SPEC,
  COMPACTION_KEY,
  COMPACTION_OFF,
  COMPACT_AFTER_TOKENS,
  COUNTDOWN_EVERY_MS,
  COUNTDOWN_MAX_TICKS,
  CUTS_KEY,
  ECONOMY_KEY,
  ECONOMY_ROW,
  EXPLORER,
  EXPLORER_TYPE,
  FACTS_PROMPT,
  FACTS_TIMEOUT_MS,
  HEADLESS_BUDGET_DIVISOR,
  INSTRUCTIONS_MAX_BYTES,
  INVENTORY_KEY,
  LIGHTEN_MIN_BYTES,
  MARK,
  POLICY_KEY,
  RESTORE_MS,
  SLOT_KEY,
  SMALL_MODEL,
  SMALL_MODEL_AGENTS,
  STEPS_KEY,
  SUMMARY_MIN_LINES,
  SUMMARY_TOKENS,
  TAB_ID,
  TAB_ORDER,
  TAB_TITLE,
  TEXTS,
  TICKET_DEBUG,
  TICKET_OFF,
  TICKET_TURN,
} from './names'
import {
  clockOf,
  commandOf,
  forecastLine,
  forecastOf,
  fullestOf,
  isEconomyWrite,
  switchesOf,
  tierOf,
} from './pilot'
import type { Sample } from './pilot'
import {
  NO_POLICY,
  blockOf,
  describedUnder,
  isAgentOffered,
  isCommandHidden,
  manualListOf,
  policyFrom,
  policyOf,
  scopedOf,
} from './policy'
import type { Policy } from './policy'
import { NO_READS, isUnchanged, readAnswerOf } from './reads'
import type { Reads, Stamp, TextRead } from './reads'
import { NO_REMINDERS, afterCompaction, reminderOf } from './reminders'
import type { Reminders } from './reminders'
import { filled, foundIn } from './slot'
import { NO_SPEND, withDispatch, withModelCall, withShown } from './spend'
import type { Spend } from './spend'
import {
  NO_STEP_STATS,
  breakerCapOf,
  isBreaking,
  isExploration,
  loopNoteOf,
  spawnModelOf,
  stepLines,
  switchAskOf,
} from './steps'
import type { Outputs, StepStats } from './steps'
import { capLine, commandReportOf, leverLine, missLine, spendLine, stepLine, turnLine } from './ticket'
import {
  NO_PENDING,
  NO_USAGE,
  callCountOf,
  isEmpty,
  mergedOf,
  projectKeyOf,
  restOf,
  usageFrom,
  usagePathOf,
  usageText,
  withCall,
  withStepCounted,
} from './usage'
import type { Pending, Usage } from './usage'
import { view } from './view'

/**
 * One line the ticket is about to write, and where it goes.
 *
 * The register makes these and writes them itself: `$` is spelled at the call
 * site or not at all, so a helper hands back what to say rather than saying
 * it.
 */
type Line = {
  text: string
  to: 'transcript' | 'debug'
}

/**
 * The calls on the world the mod keeps from the fold that builds `$`.
 *
 * A timer outlives the dispatch that set it, and `$` does not: what runs
 * after a hook has returned calls through this instead.
 */
type Host = {
  id: () => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeDelete: (key: string) => Promise<void>
  storeKeys: () => Promise<string[]>
  write: (path: string, text: string) => Promise<void>
  read: (path: string) => Promise<string>
  home: () => Promise<string | undefined>
  now: () => Promise<number>
  log: (text: string, to: 'transcript' | 'debug') => void
  every: (ms: number, fn: () => void) => { cancel: () => void }
  after: (ms: number, fn: () => void) => { cancel: () => void }
  status: (text: string | undefined) => void
  compact: () => Promise<unknown>
  submit: (text: string) => Promise<unknown>
}

/**
 * Registers the mod.
 *
 * @param on the registrar
 * @param options the plugin's configuration, as the manifest declares it
 */
export function register(on: On, options: PluginOptions): void {
  /**
   * Where the ticket is written, off the one `/config` row that says so.
   *
   * Read here and nowhere else: writing that row reloads the module, so
   * `register` runs again with the new value and there is nothing to keep in
   * step.
   */
  const ticket = String(options.ticket ?? TICKET_TURN)
  const isJournalling = options.journal !== false

  /**
   * The cap on Bash's output, in bytes; off (zero) unless the row says
   * otherwise. Anything that is not a positive number reads as off: a cap the
   * mod could not read is a cap it does not apply.
   */
  const bashCap = Number(options.bashCap ?? CAP_OFF)
  const limits: CallLimits = {
    cap: { bytes: Number.isFinite(bashCap) && bashCap > 0 ? Math.floor(bashCap) : CAP_OFF },
  }

  /**
   * The switches in force: each row's own value, or the economy row's when
   * the row is left off (T63) — `/clauget on` writes that one row. Read here,
   * frozen into the session's policy at its start, applied from the next
   * session on: a row written mid-session reloads the module, and the
   * reloaded module takes back the policy its session started with.
   *
   * - levers: the policy on the prefix;
   * - cuts: tool results and pasted blocks cut to their shape, filed whole;
   * - steps: the explorer, the smaller model, the loop and switch guards;
   * - breaker: the circuit breaker;
   * - compaction: off, on, or auto.
   */
  const switches = switchesOf({
    economy: options.economy,
    levers: options.levers,
    cuts: options.cuts,
    steps: options.steps,
    compaction: options.compaction,
    breaker: options.breaker,
  })
  const isLevers = switches.levers
  const isCuts = switches.cuts
  const isSteps = switches.steps
  const isBreaker = switches.breaker
  const compactionMode = switches.compaction
  const agentList = manualListOf(options.hideAgents)
  const commandList = manualListOf(options.hideCommands)
  const smallModelAgents = manualListOf(options.smallModelAgents ?? SMALL_MODEL_AGENTS).hide

  /**
   * The session as the mod knows it. It lives in the store as well, because
   * a configuration row written rebuilds this module and takes every one of
   * these with it.
   */
  let ledger: Ledger = NO_LEDGER
  let spend: Spend = NO_SPEND

  /**
   * What the mod saw between the last step and the next one: the evidence a
   * cache miss is named from, cleared each time a step is recorded.
   */
  let seen: Seen = NO_SEEN

  /**
   * Who provides each tool, the instruction files, and the counters: what the
   * bill is made of. The counters on disk are `usage`; what this session
   * counted since it last wrote them is `pending`.
   */
  let inventory: Inventory = NO_INVENTORY
  let instructions: Instructions = NO_INSTRUCTIONS
  let isInventoryDirty = false
  let usage: Usage = NO_USAGE
  let pending: Pending = NO_PENDING

  /**
   * The last `session.measure`: the window and the cost, pushed by the engine
   * whenever one of them moves, so the mod never polls for them.
   */
  let measured: SessionMeasureInput | null = null

  /**
   * The session's policy — decided once, then read, never decided again —
   * and what the levers saw: the attachments, the calls that paid a search
   * first, the files the scope left out, the prompt's sections, the block.
   */
  let policy: Policy | null = null
  let cwd: string | null = null
  let reminders: Reminders = NO_REMINDERS
  let deferredCalls: Record<string, number> = {}
  const modDeferred = new Map<string, string>()
  let dropped: readonly string[] = []
  let sections: Record<string, number> = {}
  let blockBytes = 0

  /**
   * What the model has read of each file, the Grep lines it has seen, the
   * files the mod summarised, and what the cuts did: all of it about the
   * context as it stands, so all of it goes with a compaction or a /clear.
   */
  let reads: Reads = NO_READS
  const grepSeen = new Set<string>()
  const summarised = new Set<string>()
  let cutStats: CutStats = NO_CUT_STATS
  let prompts = 0

  /**
   * What the step levers saw: the explorer's runs, the main loop's position,
   * this turn's outputs for the loop guard, the turns the breaker stopped.
   */
  let stepStats: StepStats = NO_STEP_STATS
  let isExplorerReady = false
  let hasProposed = false
  const explorerIds = new Set<string>()
  let currentTurn = ''
  let currentStep = 0
  let turnOutputs: Outputs = {}
  const brokenTurns = new Set<string>()

  /**
   * What the compaction levers keep: the windows read (ranges), the snapshot
   * of them taken at the last compaction — the files a reread after it is
   * counted against — the queue of results waiting for it, the last summary
   * and size after, the countdown of the warm cache, and the counters.
   */
  let readRanges: ReadRanges = {}
  let compactedFiles: ReadRanges | null = null
  const queue = new Set<string>()
  let lastSummary: string | null = null
  let lastAfter: number | null = null
  let compactStats: CompactStats = NO_COMPACT_STATS
  let hasProposedCompaction = false
  const compactedTurns = new Set<string>()
  let isInteractive = false
  let countdown: { cancel: () => void } | null = null

  /**
   * The pilot (T61–T64): the economy tier and the turn it last changed at,
   * the readings of each plan window, whether the forecast was said, whether
   * a turn is running, and the prompts deferred to a window's reset.
   */
  let tier = 0
  let tierChangedAt = 0
  const samples: Record<string, Sample[]> = {}
  let hasForecast = false
  let isTurnRunning = false
  let deferred: { text: string; atMs: number; timer: { cancel: () => void } | null; isSent: boolean }[] = []

  /**
   * What the cut budgets are divided by: twice in a session nobody watches
   * (T60), twice again from the first economy tier (T61).
   *
   * @returns the divisor
   */
  const budgetDivisorOf = (): number =>
    (policy?.headless === true ? HEADLESS_BUDGET_DIVISOR : 1) * (tier >= 1 ? 2 : 1)

  /**
   * Sends a deferred prompt, once, and never while a turn runs: one that
   * comes due during a turn waits for its end.
   *
   * @param item the prompt
   */
  function sendDeferred(item: { text: string; isSent: boolean }): void {
    if (item.isSent || host === null || isTurnRunning) {
      return
    }

    item.isSent = true
    deferred = deferred.filter(one => one !== item)
    void host.submit(item.text).catch(() => undefined)
  }

  let host: Host | null = null
  let sessionId = ''
  let home: string | null = null
  let hasTab = false
  let hasRestored = false

  /**
   * Picks the mod's own record back up, once per load.
   *
   * At the start of a fresh session there is nothing to find. Finding
   * something means this module was rebuilt while the session ran — a
   * `/config` row written, a file saved while the folder is watched — which
   * is itself a thing that costs a cache, so it is noted as evidence.
   */
  async function restore(): Promise<void> {
    if (hasRestored || host === null) {
      return
    }

    hasRestored = true

    spend = withDispatch(spend, 2)
    sessionId = await host.id().catch(() => '')
    home ??= (await host.home().catch(() => undefined)) ?? null

    if (sessionId === '') {
      return
    }

    spend = withDispatch(spend)

    const held = (await host.storeGet(INVENTORY_KEY).catch(() => undefined)) as
      | { sessionId?: unknown; inventory?: unknown; instructions?: unknown }
      | undefined

    // Only this session's: another session's tools and files are not this
    // one's, and `tool.describe` will name them again as it renders them.
    if (held?.sessionId === sessionId) {
      const kept = inventoryFrom(held.inventory)

      if (kept !== null) {
        inventory = { tools: { ...kept.tools, ...inventory.tools } }
      }

      if (instructions.files.length === 0) {
        instructions = instructionsFrom(held.instructions)
      }
    }

    if (isJournalling && home !== null) {
      spend = withDispatch(spend)

      usage = usageFrom(await host.read(usagePathOf(home)).catch(() => null))
    }

    spend = withDispatch(spend)

    // A module rebuilt mid-session finds the policy its session started with
    // and keeps it: deciding again, from counters that moved since, is what
    // would make an answer change under a cached prefix.
    policy ??= policyFrom(await host.storeGet(POLICY_KEY).catch(() => undefined), sessionId)

    spend = withDispatch(spend)
    cutStats = cutStatsFrom(await host.storeGet(CUTS_KEY).catch(() => undefined), sessionId) ?? cutStats

    spend = withDispatch(spend)

    const heldSteps = (await host.storeGet(STEPS_KEY).catch(() => undefined)) as
      | { sessionId?: unknown; stats?: Partial<StepStats> }
      | undefined

    if (heldSteps?.sessionId === sessionId && typeof heldSteps.stats === 'object') {
      stepStats = { ...NO_STEP_STATS, ...heldSteps.stats }
    }

    spend = withDispatch(spend)

    // The compaction's record, for this session only: a resume, or a /compact
    // run in a process of its own, finds the windows read and the snapshot.
    const heldCompaction = (await host.storeGet(COMPACTION_KEY).catch(() => undefined)) as
      | {
          sessionId?: unknown
          reads?: unknown
          compacted?: unknown
          queue?: unknown
          summary?: unknown
          after?: unknown
          stats?: Partial<CompactStats>
        }
      | undefined

    if (heldCompaction?.sessionId === sessionId) {
      readRanges = readRangesFrom({ sessionId, files: heldCompaction.reads }, sessionId) ?? readRanges
      compactedFiles = readRangesFrom({ sessionId, files: heldCompaction.compacted }, sessionId)
      lastSummary = typeof heldCompaction.summary === 'string' ? heldCompaction.summary : null
      lastAfter = typeof heldCompaction.after === 'number' ? heldCompaction.after : null
      compactStats = { ...NO_COMPACT_STATS, ...heldCompaction.stats }

      for (const id of Array.isArray(heldCompaction.queue) ? heldCompaction.queue : []) {
        if (typeof id === 'string') {
          queue.add(id)
        }
      }
    }

    spend = withDispatch(spend)

    const value = await host.storeGet(sessionKeyOf(sessionId)).catch(() => undefined)

    if (value === undefined) {
      return
    }

    const kept = restoredOf(value)

    if (kept === null) {
      host.log(`${MARK} · ${TEXTS.restored}`, 'debug')

      return
    }

    ledger = kept.ledger
    spend = kept.spend
    seen = { ...seen, reloaded: true }
  }

  /**
   * Writes the session's record: the store always, the journal where the
   * manifest asked for one and a home directory answered.
   *
   * @param atMs the engine's clock, as the caller already read it
   */
  async function keep(atMs: number): Promise<void> {
    if (host === null || sessionId === '') {
      return
    }

    const kept = keptOf(sessionId, atMs, ledger, spend)

    spend = withDispatch(spend)

    await host.storeSet(sessionKeyOf(sessionId), kept).catch(() => undefined)

    if (stepStats !== NO_STEP_STATS) {
      spend = withDispatch(spend)

      await host.storeSet(STEPS_KEY, { sessionId, stats: stepStats }).catch(() => undefined)
    }

    // Ranges, pointers and figures, never content: the store's 4 MiB are not
    // a warehouse.
    if (policy?.compaction !== undefined && policy.compaction !== 'off') {
      spend = withDispatch(spend)

      await host
        .storeSet(COMPACTION_KEY, {
          sessionId,
          reads: readRanges,
          compacted: compactedFiles,
          queue: [...queue].slice(-500),
          summary: lastSummary,
          after: lastAfter,
          stats: compactStats,
        })
        .catch(() => undefined)
    }

    if (cutStats !== NO_CUT_STATS) {
      spend = withDispatch(spend)

      await host.storeSet(CUTS_KEY, { sessionId, stats: cutStats }).catch(() => undefined)
    }

    if (isInventoryDirty) {
      spend = withDispatch(spend)
      isInventoryDirty = false

      await host.storeSet(INVENTORY_KEY, { sessionId, inventory, instructions }).catch(() => undefined)
    }

    if (!isJournalling || home === null) {
      return
    }

    spend = withDispatch(spend)

    await host.write(journalPathOf(home, sessionId), journalOf(kept)).catch(() => undefined)
    await flushUsage(home)

    // The brief a fresh session could start from (T57): built without a
    // model call, rewritten whole at each keep.
    if (policy?.compaction !== undefined && policy.compaction !== 'off' && cwd !== null) {
      spend = withDispatch(spend)

      const files = [
        ...new Set([
          ...Object.values(compactedFiles ?? {}).map(one => one.path),
          ...Object.values(readRanges).map(one => one.path),
        ]),
      ]

      await host
        .write(briefPathOf(home, sessionId), sessionBriefOf({ cwd, files, summary: lastSummary }))
        .catch(() => undefined)
    }
  }

  /**
   * Adds what this session counted to the counters on disk: the file read
   * again, this session's share added, the sum written. What was counted is
   * dropped only once the write went through.
   *
   * @param at the home directory
   */
  async function flushUsage(at: string): Promise<void> {
    if (host === null || sessionId === '' || (isEmpty(pending) && usage.seen.includes(sessionId))) {
      return
    }

    const path = usagePathOf(at)
    const counted = pending

    spend = withDispatch(spend, 2)

    const disk = usageFrom(await host.read(path).catch(() => null))
    const merged = mergedOf(disk, counted, sessionId)
    const isWritten = await host.write(path, usageText(merged)).then(
      () => true,
      () => false,
    )

    if (isWritten) {
      usage = merged
      // Whatever was counted while the write was in flight stays pending.
      pending = restOf(pending, counted)
    }
  }

  /**
   * Drops the records of older sessions, so the store never grows to the
   * 4 MiB of JSON it would refuse.
   */
  async function rotate(): Promise<void> {
    if (host === null || sessionId === '') {
      return
    }

    spend = withDispatch(spend)

    const keys = await host.storeKeys().catch(() => [] as string[])

    for (const key of staleKeysOf(keys, sessionKeyOf(sessionId))) {
      spend = withDispatch(spend)

      await host.storeDelete(key).catch(() => undefined)
    }
  }

  /**
   * Records one finished request and says what to write about it.
   *
   * @param step the step as the stream reported it, its miss not yet judged
   * @returns the lines the caller writes, in order
   */
  function record(step: Step): Line[] {
    const previous = lastStepOf(ledger, step.agentId)
    const miss = missOf(step, previous, seen, MISS_LIMITS)
    const recorded: Step = { ...step, miss }

    ledger = withStep(ledger, recorded)
    seen = NO_SEEN

    if (recorded.agentId === null) {
      pending = withStepCounted(pending)
    }

    if (ticket === TICKET_OFF) {
      return []
    }

    const lines: Line[] = [{ text: stepLine(recorded), to: 'debug' }]
    const missed = missLine(recorded)

    if (missed !== null) {
      // A fault goes where the person is, a cold start to the log: the first
      // request of a loop writes its whole prefix because there was nothing
      // to read, and printing that as an incident would cry wolf once a
      // session.
      lines.push({
        text: missed,
        to: isFault(miss) && ticket === TICKET_TURN ? 'transcript' : 'debug',
      })
    }

    return lines
  }

  /**
   * The step levers' notes on a tool's answer, in the main loop only: the
   * explorer proposed on an open-ended search, once a session (T44), and a
   * Bash output named when it is the same, byte for byte, as an earlier one
   * of the turn (T46). The answer itself is left as it was; the notes go
   * after it, and count as what the mod shows the model.
   *
   * @param e the call
   * @param answered what the chain answered
   * @returns the answer, with the notes when there are any
   */
  function stepNotesOf(e: { tool: string; agentId?: string }, answered: ToolCallResult): ToolCallResult {
    if (policy?.stepLevers !== true || e.agentId !== undefined || answered.deny !== undefined || answered.isError === true) {
      return answered
    }

    const input = e as unknown as Record<string, unknown>
    const notes: string[] = []

    if (isExplorerReady && !hasProposed && isExploration(e.tool, input)) {
      hasProposed = true
      notes.push(TEXTS.explorerHint)
      stepStats = {
        ...stepStats,
        proposals: stepStats.proposals + 1,
        proposalBytes: stepStats.proposalBytes + bytesOf(TEXTS.explorerHint),
      }
    }

    if (e.tool === 'Bash') {
      const record = answered.result as { stdout?: unknown; stderr?: unknown } | undefined
      const output = [record?.stdout, record?.stderr].filter(one => typeof one === 'string').join('\n')
      const looped = loopNoteOf(turnOutputs, output, currentStep)

      turnOutputs = looped.outputs

      if (looped.note !== null) {
        notes.push(looped.note)
        stepStats = { ...stepStats, loops: stepStats.loops + 1, loopBytes: stepStats.loopBytes + bytesOf(looped.note) }
      }
    }

    if (notes.length === 0) {
      return answered
    }

    spend = withShown(spend, notes.reduce((sum, note) => sum + bytesOf(note), 0))

    return { result: answered.result, context: [...(answered.context ?? []), ...notes] }
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)

    host ??= {
      id: () => beneath.session.id(),
      storeGet: key => beneath.store.get(key),
      storeSet: (key, value) => beneath.store.set(key, value),
      storeDelete: key => beneath.store.delete(key),
      storeKeys: () => beneath.store.keys(),
      write: (path, text) => beneath.fs.write(path, text),
      read: path => beneath.fs.read(path),
      // Two variables, each spelled out: the engine takes the name as a
      // literal, and which of them answers is the host's business.
      home: async () =>
        (await beneath.env.get('USERPROFILE')) ?? (await beneath.env.get('HOME')),
      now: () => beneath.clock.now(),
      log: (text, to) => beneath.ui.log(text, { to }),
      every: (ms, fn) => beneath.clock.every(ms, fn),
      after: (ms, fn) => beneath.clock.after(ms, fn),
      status: text => beneath.ui.status(text),
      compact: () => beneath.session.compact(),
      submit: text => beneath.prompt.submit({ text }),
    }

    // A reload rebuilds `$` without starting the session over, so this is the
    // only moment the module has to notice that it had a session already. A
    // fresh load finds no record and leaves it to `session.start`.
    beneath.clock.after(RESTORE_MS, () => {
      void restore().catch(() => undefined)
    })

    return beneath
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await restore()
    await rotate()

    cwd = e.cwd
    isInteractive = e.isInteractive
    pending = { ...pending, project: projectKeyOf(e.cwd) }
    // A new session: the reminders the brief forms point back at are not in
    // its context.
    reminders = NO_REMINDERS
    reads = NO_READS
    grepSeen.clear()
    summarised.clear()

    if (policy === null) {
      policy = policyOf({
        isOn: isLevers,
        isCuts,
        isSteps,
        isBreaker,
        smallModelAgents,
        compaction: compactionMode,
        isHeadless: !e.isInteractive,
        sessionId,
        usage,
        cwd,
        agents: agentList,
        commands: commandList,
      })

      spend = withDispatch(spend)

      await $.store.set(POLICY_KEY, policy).catch(() => undefined)
    }

    // Listed in the typeahead, not to the model: checked on 2.1.280, where a
    // session asked to find `clauget` among its tools, skills and commands
    // found nothing while it quoted a skill's line word for word. So nothing
    // goes in the column of what the mod shows.
    spend = withDispatch(spend)

    await $.command.register({ ...COMMAND_SPEC }).catch(() => undefined)

    // The explorer (T43), declared before the first prompt so it is listed
    // from the first request. Its listing line is what the mod shows the
    // model for it, and is counted as such.
    if (policy?.stepLevers === true && !isExplorerReady) {
      spend = withDispatch(spend)

      isExplorerReady = await $.agent
        .register({ ...EXPLORER, tools: [...EXPLORER.tools], mcpServers: [], skills: [] })
        .then(
          () => true,
          () => false,
        )

      if (isExplorerReady) {
        spend = withShown(spend, bytesOf(EXPLORER_TYPE) + bytesOf(EXPLORER.description))
      }
    }

    // Three plain fields and no `render`: a call on another plugin's noun
    // crosses environments and its arguments must be plain data, which a
    // function is not. The body is drawn by this mod's own `ui.render` hook,
    // into the slot the cockpit leaves for it. No cockpit, no tab, and the
    // ticket is all the mod shows.
    try {
      await $.cockpit.tab({ id: TAB_ID, title: TAB_TITLE, order: TAB_ORDER })

      hasTab = true
    } catch {
      hasTab = false
    }

    return started
  })

  on('turn.step', async function* ($, e, next) {
    const startedMs = await $.clock.now().catch(() => 0)
    const isMain = e.agentId === undefined

    if (isMain) {
      currentStep = e.index
      isTurnRunning = true

      if (currentTurn !== e.turnId) {
        currentTurn = e.turnId
        turnOutputs = {}
      }
    }

    // The circuit breaker (T49), between two steps and never during a tool:
    // a turn past twice its median length, and never under thirty steps.
    // At the top tier the mod decides nothing alone (T61): no breaker then.
    if (policy?.breaker === true && tier < 3 && isBreaking(e, breakerCapOf(stepsPerTurnOf(ledger, e.turnId)), brokenTurns.has(e.turnId))) {
      brokenTurns.add(e.turnId)

      const isStopped = await $.turn.abort({ turnId: e.turnId }).then(
        () => true,
        () => false,
      )

      spend = withDispatch(spend, 2)

      if (isStopped) {
        stepStats = { ...stepStats, broken: stepStats.broken + 1 }
        $.ui.log(`${MARK} · ${TEXTS.breaker} ${e.index} · ${TEXTS.breakerResume}`, { to: 'transcript' })
      } else {
        $.ui.log(`${MARK} · ${TEXTS.breaker} ${e.index}: refused, the turn had moved on`, { to: 'debug' })
      }
    }

    // The effort is left as the engine asked (T47, measured and closed): on
    // 2.1.280, one notch less effort at step 1 of a turn made the provider
    // drop its cached messages — the step read nothing from the cache and
    // wrote 75 897 tokens again — for output tokens that did not move. The
    // rule and its guards stay in `steps`, tested, for the day that changes.
    const stream = next(e)

    let usage: Parameters<typeof usageOf>[0] = null
    let tools = 0
    let hasText = false

    // The relay itself: every chunk goes up exactly as it came, and the two
    // counters are read off the ones that carry them. A hook that gathered
    // the response and yielded it whole would have changed what the person
    // watched arrive.
    for await (const chunk of stream) {
      if (chunk.kind === 'stop') {
        usage = chunk.usage
      } else if (chunk.kind === 'tool') {
        tools += 1
      } else if (chunk.kind === 'text' && chunk.text !== '') {
        hasText = true
      }

      yield chunk
    }

    const result = await stream.result
    const endedMs = await $.clock.now().catch(() => startedMs)
    const reported = usage ?? result.usage

    const lines = record({
      turnId: e.turnId,
      index: e.index,
      agentId: e.agentId ?? null,
      model: reported?.model ?? e.model,
      atMs: endedMs,
      ms: Math.max(0, endedMs - startedMs),
      usage: usageOf(reported),
      tools,
      hasText,
      miss: null,
    })

    for (const line of lines) {
      spend = withDispatch(spend)

      $.ui.log(line.text, { to: line.to })
    }

    const counted = usageOf(reported)

    // The saving column of T43, read off the engine's own counters: what each
    // of the explorer's steps re-read from the cache.
    if (counted !== null && e.agentId !== undefined && explorerIds.has(e.agentId)) {
      stepStats = { ...stepStats, explorerReads: [...stepStats.explorerReads, counted.cacheRead].slice(-200) }
    }

    return result
  })

  on('agent.spawn', async (_$, e, next) => {
    // A subagent on a smaller model (T45): its own prefix, so no cache is
    // lost to the switch. Only the types listed, never a fork, never one
    // whose caller named a model.
    const model = policy?.stepLevers === true ? spawnModelOf(e, policy.smallModelAgents, SMALL_MODEL) : null
    const spawned = await next(model === null ? e : { ...e, model })

    if (spawned.deny === undefined) {
      if (model !== null) {
        stepStats = { ...stepStats, rerouted: stepStats.rerouted + 1 }
      }

      if (e.subagentType === EXPLORER_TYPE && spawned.agentId !== undefined) {
        explorerIds.add(spawned.agentId)
        stepStats = { ...stepStats, explorerRuns: stepStats.explorerRuns + 1 }
      }
    }

    // A refusal from beneath goes up as it came: the Agent tool reports it.
    return spawned
  })

  on('classic.PreModelSwitch', async (_$, e, next) => {
    const decided = await next(e)

    // A switch that would rewrite a warm cache above the threshold asks first
    // (T48); one another hook decided is left to it.
    if (policy?.stepLevers !== true || decided.permissionDecision !== undefined) {
      return decided
    }

    const reason = switchAskOf(e)

    if (reason === null) {
      return decided
    }

    stepStats = { ...stepStats, asked: stepStats.asked + 1 }

    return { ...decided, permissionDecision: 'ask', permissionDecisionReason: reason }
  })

  on('turn.complete', async ($, e, next) => {
    const atMs = await $.clock.now().catch(() => 0)

    spend = withDispatch(spend)

    // A subagent's run is a turn of its own loop. Its steps are already on
    // the journal, counted apart; counting its run as one of the session's
    // turns would make a turn mean two things in the same column.
    if (e.agentId !== undefined) {
      return next(e)
    }

    ledger = withTurn(ledger)
    isTurnRunning = false

    // A deferred prompt that came due during the turn goes now (T64).
    for (const item of deferred.filter(one => one.atMs <= atMs)) {
      sendDeferred(item)
    }

    // The forecast, said once a session, when a window fills before its reset
    // at the last hour's rate (T62).
    if (!hasForecast && measured !== null) {
      const fullest = fullestOf(measured)
      const forecast = forecastOf(samples[fullest.kind] ?? [], atMs)
      const resetsAtMs = fullest.resetsAt === undefined ? null : Date.parse(fullest.resetsAt)

      if (forecast !== null && resetsAtMs !== null && forecast.fullAtMs < resetsAtMs) {
        hasForecast = true
        spend = withDispatch(spend)

        $.ui.log(forecastLine(fullest.kind, forecast, resetsAtMs), { to: 'transcript' })
      }
    }

    const turn = turnLine(ledger, e.turnId)

    if (turn !== null && ticket !== TICKET_OFF) {
      const to = ticket === TICKET_DEBUG ? 'debug' : 'transcript'

      spend = withDispatch(spend, 2)

      // Two lines and no total over them: what the engine reported, then what
      // the mod spent to report it. Both are dim transcript rows the model
      // never reads — a ticket that entered the context would cost what it
      // measures.
      $.ui.log(turn, { to })
      $.ui.log(spendLine(spend), { to })

      const cutsCounted = cutsLine(cutStats)

      if (cutsCounted !== null) {
        spend = withDispatch(spend)

        $.ui.log(cutsCounted, { to })
      }

      const counted = leverLine(reminders, deferredCalls)

      if (counted !== null) {
        spend = withDispatch(spend)

        $.ui.log(counted, { to })
      }
    }

    // What the next session decides from: the prefix this one re-read, and
    // the providers whose deferral lost — searched for often enough that the
    // schemas in front would have cost less. Brought back next session, never
    // during this one.
    const last = lastStepOf(ledger, null)

    pending = {
      ...pending,
      prefix: last === null ? pending.prefix : prefixOf(last.usage),
      broughtBack:
        policy?.isOn === true
          ? Object.entries(deferredCalls)
              .filter(([, calls]) => calls >= BRING_BACK_CALLS)
              .map(([provider]) => provider)
          : pending.broughtBack,
    }

    const isCompacting = policy?.compaction !== undefined && policy.compaction !== 'off'

    // The window after a compaction closes at the first turn's end (T56).
    compactedFiles = null

    // The profitable point (T54): proposed once the context is past it, and
    // in auto mode compacted by the mod — after the turn, never during one,
    // never twice for the same turn.
    if (isCompacting && last !== null) {
      const context = prefixOf(last.usage)
      const point = compactPointOf({
        after: lastAfter ?? COMPACT_AFTER_TOKENS,
        summary: SUMMARY_TOKENS,
        steps: medianOf(stepsPerTurnOf(ledger, '')),
      })

      // From the second tier (T61) the compaction is brought forward: proposed
      // at the end of the task whatever the point says.
      if ((context >= point || tier >= 2) && !hasProposedCompaction) {
        hasProposedCompaction = true
        compactStats = { ...compactStats, proposed: compactStats.proposed + 1 }
        spend = withDispatch(spend)

        $.ui.log(`${MARK} · ${TEXTS.compactProposal} (${Math.round(point)} tok, now ${context})`, { to: 'transcript' })

        if (policy?.compaction === 'auto' && tier < 3 && host !== null && !compactedTurns.has(e.turnId)) {
          const at = host

          compactedTurns.add(e.turnId)
          at.after(1_000, () => {
            void at.compact().then(
              () => {
                compactStats = { ...compactStats, provoked: compactStats.provoked + 1 }
              },
              () => undefined,
            )
          })
        }
      }
    }

    // The countdown of the warm cache (T58): armed as the turn ends, redrawn
    // every few seconds, stopped at its expiry or a bounded number of ticks,
    // disarmed by the next prompt. The ping that would keep it warm stays off.
    if (isCompacting && isInteractive && host !== null) {
      const at = host
      const endedAt = atMs
      let ticks = 0

      countdown?.cancel()
      $.ui.status(countdownText(CACHE_TTL_MS))
      countdown = at.every(COUNTDOWN_EVERY_MS, () => {
        ticks += 1

        void at.now().then(now => {
          const remaining = CACHE_TTL_MS - (now - endedAt)

          at.status(countdownText(remaining))

          if (remaining <= 0 || ticks >= COUNTDOWN_MAX_TICKS) {
            countdown?.cancel()
            countdown = null
          }
        })
      })
    }

    await keep(atMs)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // Every answer below — the engine's, the cap's, a cut, a Read's — goes
    // through the step levers' notes on the way up.
    const answered = await (async (): Promise<ToolCallResult> => {
      // Counted before the call runs, so a call that fails or is refused is
      // still a call the provider was asked for.
      pending = withCall(
        pending,
        callCountOf(e.tool, e as unknown as Record<string, unknown>, providerOf(inventory, e.tool)),
      )

      const deferredBy = modDeferred.get(e.tool)

      if (deferredBy !== undefined) {
        deferredCalls = { ...deferredCalls, [deferredBy]: (deferredCalls[deferredBy] ?? 0) + 1 }
      }

      const args = e as unknown as { file_path?: unknown; offset?: unknown; limit?: unknown; pages?: unknown }
      const readPath =
        e.tool === 'Read' && typeof args.file_path === 'string' && args.pages === undefined ? args.file_path : null
      const window = {
        offset: typeof args.offset === 'number' ? args.offset : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      }

      // The measure of whether a cut was right: the model going back for what
      // was cut, counted whether the cuts are on or not.
      if (readPath !== null) {
        if (isFiledPath(readPath)) {
          cutStats = { ...cutStats, rereads: cutStats.rereads + 1 }
        } else if (window.offset !== undefined && summarised.has(pathKeyOf(readPath))) {
          cutStats = { ...cutStats, summaryRereads: cutStats.summaryRereads + 1 }
        }
      }

      // After a compaction: a file read before it counts as a reread — the
      // milestone's measure, counted whatever the levers say — and, asked for
      // whole with the levers on, it is served as the windows read then (T56).
      // The tool still runs, so the engine knows the file was read.
      const before = readPath === null || compactedFiles === null ? undefined : compactedFiles[pathKeyOf(readPath)]

      if (readPath !== null && before !== undefined) {
        compactStats = { ...compactStats, rereadsAfter: compactStats.rereadsAfter + 1 }

        if (policy?.compaction !== undefined && policy.compaction !== 'off' && window.offset === undefined && window.limit === undefined) {
          const got = await next(e)
          const record = got.result as TextRead | undefined

          if (got.deny !== undefined || got.isError === true || record?.type !== 'text') {
            return got
          }

          spend = withDispatch(spend)

          const text = await $.fs.read(readPath).catch(() => null)
          const digest = text === null ? null : digestOf(text, record.file.filePath, before.ranges)

          if (digest === null || bytesOf(digest.record.file.content) >= bytesOf(record.file.content)) {
            readRanges = withRead(readRanges, pathKeyOf(readPath), readPath, record.file.startLine, record.file.startLine + record.file.numLines - 1)

            return got
          }

          compactStats = {
            ...compactStats,
            digests: compactStats.digests + 1,
            digestBytesBefore: compactStats.digestBytesBefore + bytesOf(record.file.content),
            digestBytesAfter: compactStats.digestBytesAfter + bytesOf(digest.record.file.content),
          }
          readRanges = withRead(
            readRanges,
            pathKeyOf(readPath),
            readPath,
            digest.record.file.startLine,
            digest.record.file.startLine + digest.record.file.numLines - 1,
          )
          spend = withShown(spend, bytesOf(digest.context))

          return { result: digest.record, context: [...(got.context ?? []), digest.context] }
        }
      }

      if (policy?.cuts !== true) {
        const got = await next(e)

        // What the model now has of the file, for the compaction to come.
        const served = got.result as TextRead | undefined

        if (readPath !== null && got.deny === undefined && got.isError !== true && served?.type === 'text') {
          readRanges = withRead(
            readRanges,
            pathKeyOf(readPath),
            readPath,
            served.file.startLine,
            served.file.startLine + served.file.numLines - 1,
          )
        }

        const decided = answerOf(e.tool, got, limits)

        if (decided.kind === 'kept') {
          // What came up, untouched: its `ref` makes the engine use its own
          // messages, which is exactly right for a result the mod had no reason
          // to change.
          return got
        }

        spend = withShown(spend, decided.shown)

        if (ticket !== TICKET_OFF) {
          spend = withDispatch(spend)

          $.ui.log(capLine(decided.tool, decided.before, decided.after), { to: 'debug' })
        }

        // The mod's own answer, `{ result }` without the engine's `ref`: the
        // form the contract names for a hook's answer. (On 2.1.280 a spread of
        // `got` took as well; see `call` for what was measured.)
        return decided.answer
      }

      let stamp: Stamp | null = null

      if (readPath !== null) {
        spend = withDispatch(spend)
        stamp = await $.fs.stat(readPath).then(
          found => ({ size: found.size, mtimeMs: found.mtimeMs }),
          () => null,
        )

        // The same window of a file unchanged since the model read it (T36):
        // the engine's own answer for that case, and the tool does not run.
        if (isUnchanged(reads, readPath, window, stamp)) {
          cutStats = withCut(cutStats, 'unchanged', stamp?.size ?? 0, 0)

          return { result: { type: 'file_unchanged', file: { filePath: readPath } } }
        }
      }

      const got = await next(e)

      if (readPath !== null) {
        const record = got.result as TextRead | undefined

        if (got.deny !== undefined || got.isError === true || record?.type !== 'text') {
          return got
        }

        const isWholeAsk = window.offset === undefined && window.limit === undefined
        let fullText: string | null = null

        // A summary needs the whole file, which a Read serves only in part past
        // two thousand lines: read once, here, and only when one may be due.
        if (isWholeAsk && record.file.totalLines > SUMMARY_MIN_LINES && reads.files[pathKeyOf(readPath)] === undefined) {
          spend = withDispatch(spend)
          fullText = await $.fs.read(readPath).catch(() => null)
        }

        const answered = readAnswerOf(reads, { file_path: readPath, ...window }, record, stamp, fullText)

        reads = answered.reads

        const shown = answered.record ?? record

        readRanges = withRead(
          readRanges,
          pathKeyOf(readPath),
          readPath,
          shown.file.startLine,
          shown.file.startLine + shown.file.numLines - 1,
        )

        if (answered.record === null) {
          return got
        }

        if (answered.rule === 'summary') {
          summarised.add(pathKeyOf(readPath))
        }

        cutStats = withCut(
          cutStats,
          answered.rule ?? 'read',
          bytesOf(record.file.content),
          bytesOf(answered.record.file.content),
        )
        spend = withShown(spend, bytesOf(answered.context ?? ''))

        return {
          result: answered.record,
          context: [...(got.context ?? []), ...(answered.context === null ? [] : [answered.context])],
        }
      }

      const path = home === null || sessionId === '' ? '' : filedPathOf(home, sessionId, e.tool_use_id ?? 'call')
      const chained = chainOf(e.tool, got, {
        bashBudget: Math.floor((limits.cap.bytes > 0 ? limits.cap.bytes : BASH_BUDGET) / budgetDivisorOf()),
        grepSeen,
        root: cwd,
        path,
      })

      if (e.tool === 'Grep') {
        const shown =
          chained.kind === 'rewritten'
            ? chained.grepShown
            : String((got.result as { content?: unknown } | undefined)?.content ?? '').split('\n')

        for (const line of shown) {
          if (line !== '') {
            grepSeen.add(line)
          }
        }
      }

      if (chained.kind === 'kept') {
        return got
      }

      // No filing, no cut: a result the model could not get back whole goes
      // through whole.
      if (chained.filed !== null) {
        if (path === '' || !isFileable(chained.filed)) {
          return got
        }

        spend = withDispatch(spend)

        const isFiled = await $.fs.write(path, chained.filed).then(
          () => true,
          () => false,
        )

        if (!isFiled) {
          return got
        }

        cutStats = { ...cutStats, filed: cutStats.filed + 1, filedBytes: cutStats.filedBytes + bytesOf(chained.filed) }
      }

      cutStats = withCut(cutStats, chained.rule, chained.before, chained.after, chained.noise)
      spend = withShown(spend, chained.shown)

      if (ticket !== TICKET_OFF) {
        spend = withDispatch(spend)

        $.ui.log(`${MARK} · ${e.tool} · ${chained.rule} · ${byteText(chained.before)} → ${byteText(chained.after)} ${TEXTS.bytes}`, {
          to: 'debug',
        })
      }

      return chained.answer
    })()

    // A large result that entered whole waits, as a pointer, for the next
    // compaction to file it (T52): nothing about the past is rewritten now.
    if (
      policy?.compaction !== undefined &&
      policy.compaction !== 'off' &&
      answered.ref !== undefined &&
      typeof answered.text === 'string' &&
      e.tool_use_id !== undefined &&
      bytesOf(answered.text) >= LIGHTEN_MIN_BYTES
    ) {
      queue.add(e.tool_use_id)
    }

    return stepNotesOf(e, answered)
  })

  on('prompt.submit', async (_$, e, next) => {
    // A prompt is the person back: the countdown has said what it had to.
    if (countdown !== null) {
      countdown.cancel()
      countdown = null
      _$.ui.status(undefined)
    }

    if (policy?.cuts !== true || home === null || sessionId === '') {
      return next(e)
    }

    const at = home
    const prompt = prompts

    prompts += 1

    // A block pasted into the prompt that reads like a log (T41): filed, and
    // replaced by its head, its tail and where it is. The person's own
    // sentences around it go in as typed.
    const cut = blobCutOf(e.text, index => filedPathOf(at, sessionId, `prompt-${prompt}-${index}`))

    if (cut === null) {
      return next(e)
    }

    for (const [index, blob] of cut.blobs.entries()) {
      const isFiled =
        isFileable(blob) &&
        (await _$.fs.write(filedPathOf(at, sessionId, `prompt-${prompt}-${index}`), blob).then(
          () => true,
          () => false,
        ))

      if (!isFiled) {
        return next(e)
      }

      cutStats = { ...cutStats, filed: cutStats.filed + 1, filedBytes: cutStats.filedBytes + bytesOf(blob) }
    }

    cutStats = withCut(cutStats, 'pasted', bytesOf(e.text), bytesOf(cut.text))
    spend = withShown(spend, markerBytesOf(cut.text))

    return next({ ...e, text: cut.text })
  })

  on('session.end', async (_$, e, next) => {
    // A /clear ends the conversation without a new session.start: what the
    // model had read is gone from its context, and so is the mod's record.
    reads = NO_READS
    grepSeen.clear()
    summarised.clear()
    reminders = NO_REMINDERS

    return next(e)
  })

  on('tool.describe', async (_$, e, next) => {
    const described = await next(e)

    // The description goes back as it came: a changed description would be a
    // changed prefix. Only the placement may move, and only as the session's
    // policy decided before the first request — the same answer every time.
    const placed = described.isDeferred ?? e.isDeferred === true
    const { answer, isModDeferred } = describedUnder(policy ?? NO_POLICY, e.tool, e.provider.plugin, {
      description: described.description,
      isDeferred: placed,
    })

    if (isModDeferred) {
      modDeferred.set(e.tool, e.provider.plugin)
    }

    inventory = withDescribed(inventory, e.tool, e.provider, answer.isDeferred === true)
    isInventoryDirty = true

    return answer.isDeferred === placed ? described : { ...described, isDeferred: answer.isDeferred }
  })

  on('agent.offer', async (_$, e, next) => {
    // Withdrawn from the listing and from dispatch alike (T23); the Agent
    // tool itself is never touched, whatever the list holds.
    if (policy !== null && !isAgentOffered(policy, e.agent, e.source)) {
      return { isOffered: false }
    }

    return next(e)
  })

  on('command.describe', async (_$, e, next) => {
    const described = await next(e)

    // Hidden from the typeahead and /help (T24); typed in full, it still runs.
    return policy !== null && isCommandHidden(policy, e.command)
      ? { ...described, isHidden: true }
      : described
  })

  on('prompt.attachment', async (_$, e, next) => {
    const got = await next(e)

    if (got.text === null) {
      return got
    }

    // Each attachment is raised once, when it is made, never again for a
    // request that re-sends it: measured on 2.1.280, four requests raised the
    // one deferred-list attachment once, and a per-request reminder four
    // times as four new ones. So a brief form rewrites nothing already sent.
    const served = reminderOf(reminders, { type: e.type, text: got.text, origin: e.origin }, policy?.isOn === true)

    reminders = served.reminders

    return served.text === got.text ? got : { text: served.text }
  })

  // The one caller of what rewrites the past (T52): `lightenedOf` is called
  // here and nowhere else. Between two compactions the mod writes forward.
  on('session.compact', async ($, e, next) => {
    const mode = policy?.compaction ?? 'off'

    // No summary precomputed while the person works (T55): nothing is
    // computed, nothing kept, the conversation stays as it is.
    if (mode !== 'off' && e.trigger === 'precompute') {
      compactStats = { ...compactStats, precomputeSkipped: compactStats.precomputeSkipped + 1 }

      return { skip: TEXTS.precompute }
    }

    let input = e

    if (mode !== 'off' && e.trigger !== 'precompute') {
      // The warm cache's last question (T53), before anything is lightened:
      // the fork reads the transcript the cache knows. Main loop only — a
      // fork shares the main thread's cache, not a subagent's. It gets a few
      // seconds; past them the compaction goes on without it.
      let facts: string | null = null

      if (e.agentId === undefined) {
        compactStats = { ...compactStats, forks: compactStats.forks + 1 }

        const forked: unknown = await Promise.race([
          $.model.fork({ prompt: FACTS_PROMPT }).catch(() => null),
          $.clock.sleep(FACTS_TIMEOUT_MS).then(() => null),
        ])
        const used = forkUsageOf(forked)

        facts = factsOf(forked)
        spend = withModelCall(spend, 'fork', { model: 'fork', ...used })

        if (facts !== null) {
          compactStats = { ...compactStats, facts: compactStats.facts + 1 }
        }
      }

      // The files read, by path, for the summarizer to name (T56).
      const files = e.agentId === undefined ? Object.values(readRanges).map(one => one.path) : []
      const instructions = instructionsTextOf({ given: e.instructions, facts, files }, INSTRUCTIONS_MAX_BYTES)

      // The large tool results, filed and replaced by their line (T51, T52),
      // in a subagent's transcript as in the main one (T59). A file that
      // could not be written leaves the whole transcript as the engine has it.
      let messages = e.messages
      const at = home

      if (at !== null && sessionId !== '') {
        const light = lightenedOf(e.messages, queue, LIGHTEN_MIN_BYTES, id => filedPathOf(at, sessionId, `compact-${id}`))
        let isFiled = light.substituted > 0

        for (const one of light.filed) {
          spend = withDispatch(spend)

          isFiled &&= isFileable(one.text) && (await $.fs.write(one.path, one.text).then(() => true, () => false))
        }

        if (isFiled) {
          messages = light.messages
          compactStats = {
            ...compactStats,
            substituted: compactStats.substituted + light.substituted,
            substitutedBefore: compactStats.substitutedBefore + light.before,
            substitutedAfter: compactStats.substitutedAfter + light.after,
          }
        }
      }

      input = { ...e, messages, ...(instructions === undefined ? {} : { instructions }) }
    }

    const compacted = await next(input)

    if (compacted.skip === undefined) {
      queue.clear()

      if (e.agentId === undefined) {
        // What was read before is what a reread after is counted against,
        // and served from (T56); the summary is kept for the brief (T57).
        compactedFiles = readRanges
        readRanges = {}
        lastSummary = compacted.messages?.[0]?.text ?? lastSummary
        lastAfter = compacted.tokensAfter ?? lastAfter
        hasProposedCompaction = false
        compactStats = {
          ...compactStats,
          compactions: compactStats.compactions + 1,
          tokensBefore: compactStats.tokensBefore + (compacted.tokensBefore ?? 0),
          tokensAfter: compactStats.tokensAfter + (compacted.tokensAfter ?? 0),
        }
      }
    }

    // The first occurrences the brief forms point back at were summarised
    // away: the next of each goes whole again.
    reminders = afterCompaction(reminders)
    reads = NO_READS
    grepSeen.clear()
    summarised.clear()

    // A /compact runs no turn, so nothing else would keep what it changed:
    // the snapshot, the summary, the counters are written here.
    if (mode !== 'off') {
      await keep(await $.clock.now().catch(() => 0))
    }

    return compacted
  })

  on('classic.SessionStart', { source: 'resume' }, async ($, e, next) => {
    const started = await next(e)

    // Resuming or starting fresh, the two prices side by side (T57): what the
    // resume re-writes, as the engine estimates it, against the brief a new
    // session could start from — its size estimated at four characters a
    // token, and said so.
    if (compactionMode === COMPACTION_OFF || home === null || e.context_tokens === undefined) {
      return started
    }

    const brief = await $.fs.read(briefPathOf(home, e.session_id)).catch(() => null)
    const usd = e.estimated_cache_write_usd

    $.ui.log(
      [
        `${MARK} · ${TEXTS.resumePrices}: ${e.context_tokens} tok${usd === undefined ? '' : `, ~$${usd.toFixed(2)} (engine)`}${e.prompt_cache_likely_expired === true ? ', cache likely expired' : ''}`,
        brief === null
          ? null
          : `${TEXTS.briefAlt}: ~${Math.ceil(brief.length / 4)} tok (chars/4, est.) at ${briefPathOf(home, e.session_id)}`,
      ]
        .filter((one): one is string => one !== null)
        .join(' · '),
      { to: 'transcript' },
    )

    return started
  })

  on('prompt.section', async (_$, e, next) => {
    const section = await next(e)

    // Read for the report, and handed back as it came (T30): a section is
    // shown with its weight, never removed by the mod.
    sections = { ...sections, [e.name]: bytesOf(section.text ?? '') }

    return section
  })

  on('prompt.context', async (_$, e, next) => {
    const context = await next(e)
    const files = context.instructionFiles ?? e.instructionFiles
    const active = policy ?? NO_POLICY
    let kept = files

    if (files !== undefined) {
      instructions = instructionsOf(files)
      isInventoryDirty = true

      // The files outside the working directory's ancestry, left out (T25);
      // the engine injects one again when the session works in its folder.
      const scoped = scopedOf(active, files)

      dropped = scoped.dropped.map(file => file.path)
      kept = scoped.dropped.length === 0 ? files : scoped.kept
    }

    // The mod's own block (T27): what the policy decided, recomposed with the
    // context after a compaction or a /clear. It is what the mod shows the
    // model, and it is counted as such.
    const block = blockOf(active, dropped)

    blockBytes = block === null ? 0 : bytesOf(block.text)

    if (block === null && kept === files) {
      return context
    }

    spend = withShown(spend, blockBytes)

    return {
      blocks: block === null ? context.blocks : [...context.blocks, block],
      ...(kept === files || kept === undefined ? {} : { instructionFiles: kept }),
    }
  })

  on('session.measure', async ($, e, next) => {
    // Pushed by the engine when the window, the plan windows or the cost
    // moved: kept for the report, so the mod never polls for them.
    measured = e

    const now = await $.clock.now().catch(() => 0)

    // The readings the forecast is drawn from (T62), per plan window.
    for (const window of e.rateLimits) {
      samples[window.kind] = [...(samples[window.kind] ?? []), { atMs: now, percent: window.percentUsed }].slice(-200)
    }

    // The tier (T61): it drives only flow — the cut budgets, the compaction,
    // who decides — never an answer the prefix is made of.
    const fullest = fullestOf(e)
    const reached = tierOf(tier, fullest.percent, ledger.turns - tierChangedAt)

    if (reached !== tier) {
      tier = reached
      tierChangedAt = ledger.turns
      spend = withDispatch(spend)

      $.ui.log(`${MARK} · ${TEXTS.tier} ${tier} (${fullest.kind} ${fullest.percent}%)`, { to: 'debug' })

      if (tier >= 3) {
        spend = withDispatch(spend)

        $.ui.log(
          `${MARK} · ${TEXTS.tierWarn}${fullest.resetsAt === undefined ? '' : ` · resets at ${fullest.resetsAt}`}`,
          { to: 'transcript' },
        )
      }
    }

    return next(e)
  })

  // The matcher is spelled out: the loader reads it off the source, and a
  // name it cannot read is a `?` it cannot check. `COMMAND_SPEC.name` is the
  // same word, and a test holds the two together.
  on('command.run', { command: 'clauget' }, async ($, e) => {
    const asked = commandOf(e.args)

    // The one lever (T63): one row written, and only when it changes — a
    // write reloads the module, and the store remembers what was written so
    // a second `/clauget on` before the reload writes nothing either.
    if (asked.kind === 'economy') {
      spend = withDispatch(spend, 2)

      const written = await $.store.get(ECONOMY_KEY).catch(() => undefined)

      if (!isEconomyWrite(asked.economy, options.economy, written)) {
        $.ui.log(`${MARK} · economy ${TEXTS.already} ${asked.economy}`, { to: 'transcript' })

        return {}
      }

      await $.store.set(ECONOMY_KEY, asked.economy).catch(() => undefined)
      spend = withDispatch(spend, 2)

      const set = await $.config.set({ key: ECONOMY_ROW, value: asked.economy }).catch(() => ({ deny: 'refused' }))

      $.ui.log(
        'deny' in set && set.deny !== undefined
          ? `${MARK} · economy not set: ${set.deny}`
          : `${MARK} · ${TEXTS.economySet} ${asked.economy} · ${TEXTS.economyNext}`,
        { to: 'transcript' },
      )

      return {}
    }

    // The prompts deferred to a window's reset (T64): visible, cancellable,
    // sent once, after the time, never during a turn.
    if (asked.kind === 'later' || asked.kind === 'list' || asked.kind === 'cancel') {
      spend = withDispatch(spend)

      if (asked.kind === 'cancel') {
        for (const item of deferred) {
          item.timer?.cancel()
        }

        deferred = []
        $.ui.log(`${MARK} · ${TEXTS.laterCancelled}`, { to: 'transcript' })

        return {}
      }

      if (asked.kind === 'list') {
        $.ui.log(
          deferred.length === 0
            ? `${MARK} · ${TEXTS.laterNone}`
            : deferred.map(item => `${MARK} · ${TEXTS.later} to ${clockOf(item.atMs)}: ${item.text.slice(0, 80)}`).join('\n'),
          { to: 'transcript' },
        )

        return {}
      }

      const fullest = measured === null ? null : fullestOf(measured)
      const atMs = fullest?.resetsAt === undefined ? Number.NaN : Date.parse(fullest.resetsAt)

      if (!Number.isFinite(atMs) || host === null) {
        $.ui.log(`${MARK} · ${TEXTS.laterNoReset}`, { to: 'transcript' })

        return {}
      }

      const now = await $.clock.now().catch(() => 0)
      const item = { text: asked.text, atMs, timer: null as { cancel: () => void } | null, isSent: false }

      item.timer = host.after(Math.max(0, atMs - now), () => sendDeferred(item))
      deferred = [...deferred, item]
      $.ui.log(`${MARK} · ${TEXTS.later} to ${clockOf(atMs)} (${fullest?.kind} reset) · ${TEXTS.laterNote}`, {
        to: 'transcript',
      })

      return {}
    }

    // The one place the mod asks for a counted breakdown: the person opened
    // the report, and a token-count request per tool is the price of its
    // figures. Nowhere else asks for one, not even a summary.
    spend = withModelCall(withDispatch(spend, 3), 'breakdown', null)

    const answered = await $.session.usage({ breakdown: 'full' }).catch(() => null)
    const listed = await $.tool.list().catch(() => [])
    const atMs = await $.clock.now().catch(() => 0)
    const breakdown: SessionContextBreakdown | null = answered?.context.breakdown ?? null

    const lines = commandReportOf({
      ledger,
      spend,
      measured,
      breakdown,
      detail: 'full',
      inventory,
      listed: listed.map(tool => tool.name),
      usage: mergedOf(usage, pending, sessionId),
      instructions,
      prefix: prefixOf(lastStepOf(ledger, null)?.usage ?? null),
      levers: {
        policy: policy ?? NO_POLICY,
        reminders,
        deferredCalls,
        dropped,
        sections,
        blockBytes,
      },
      cuts: cutStats,
    })

    // The step levers, each with what it saved and what it cost.
    lines.push(...stepLines(stepStats, ledger.main.steps === 0 ? 0 : ledger.main.cacheRead / ledger.main.steps))

    // The pilot: the tier and what it reads, the forecast, the deferred work.
    const fullest = measured === null ? null : fullestOf(measured)
    const forecast = fullest === null ? null : forecastOf(samples[fullest.kind] ?? [], atMs)

    lines.push(
      `${MARK} · ${TEXTS.tier} ${tier} of 3 (${TEXTS.tierNames}) · ${fullest === null ? 'no reading yet' : `${fullest.kind} ${fullest.percent}%`} · ${policy?.headless === true ? 'headless profile' : 'interactive'}`,
    )

    if (fullest !== null && forecast !== null) {
      lines.push(forecastLine(fullest.kind, forecast, fullest.resetsAt === undefined ? null : Date.parse(fullest.resetsAt)))
    }

    for (const item of deferred) {
      lines.push(`  ${TEXTS.later} to ${clockOf(item.atMs)}: ${item.text.slice(0, 80)}`)
    }

    // The compaction levers, and the profitable point with its hypotheses.
    if (policy?.compaction !== undefined && policy.compaction !== 'off') {
      const hypotheses = {
        after: lastAfter ?? COMPACT_AFTER_TOKENS,
        summary: SUMMARY_TOKENS,
        steps: medianOf(stepsPerTurnOf(ledger, '')),
      }

      lines.push(
        ...compactionLines(compactStats),
        pointLine(
          compactPointOf(hypotheses),
          prefixOf(lastStepOf(ledger, null)?.usage ?? null),
          hypotheses,
          breakdown?.autoCompactThreshold ?? null,
        ),
      )
    }

    // The weight of each provider's schemas, for the break-even the next
    // session's policy computes: the report is the one place it is counted.
    if (breakdown !== null) {
      const weights: Record<string, number> = {}

      for (const line of billOf(breakdown, inventory).lines) {
        if (line.tools > 0) {
          weights[line.provider] = line.tokens + line.deferred
        }
      }

      pending = { ...pending, weights }
    }

    // Dim transcript rows, which the model never reads; and the same lines on
    // disk beside the journal, where a session with no transcript — a
    // headless run — leaves them.
    for (const line of lines) {
      spend = withDispatch(spend)

      $.ui.log(line, { to: 'transcript' })
    }

    if (isJournalling && home !== null && sessionId !== '') {
      spend = withDispatch(spend)

      await $.fs
        .write(reportPathOf(home, sessionId), `${lines.join('\n')}\n`)
        .catch(() => undefined)
    }

    await keep(atMs)

    // No text: a command's output row is read by the model, and a report
    // that entered the context would cost what it measures.
    return {}
  })

  on('ui.invalidate', (_$, e, next) => {
    // Whoever asked for it. An invalidation drops the engine's cached answers
    // for that event, and the prefix hooks are asked again — which is one of
    // the few things that can lose a prompt cache mid-session.
    seen = { ...seen, invalidated: e.event }

    return next(e)
  })

  on('config.set', (_$, e, next) => {
    // Writing a row reloads the module that owns it. That is evidence for the
    // next step's cache write, whoever's row it was.
    seen = { ...seen, configKey: e.key }

    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== COCKPIT_PANE) {
      return next(e)
    }

    // What is beneath is asked for first, because whether this mod's hook
    // sits inside the cockpit's or outside it is nothing either of them
    // chooses — and the answer is in the tree that comes back.
    const below = await next(e)

    if (!hasTab) {
      return below
    }

    let rail: readonly CockpitTabInfo[] = []

    try {
      rail = await $.cockpit.tabs()
    } catch {
      return below
    }

    if (rail.find(tab => tab.id === TAB_ID)?.isSelected !== true) {
      return below
    }

    // One cast, as the cockpit's own pane makes: `e` is a union over the
    // surfaces and `$.ui.resolve` answers that surface's table, but the pair
    // only narrows together inside a per-surface branch.
    const draw = {
      surface: e.surface,
      ui: await $.ui.resolve(e),
      columns: Math.max(1, e.props.bodyColumns - BODY_PAD_COLUMNS),
      rows: Math.max(1, e.props.scroll.bodyRows - COCKPIT_CHROME_ROWS),
      isFocused: e.props.isFocused,
      placement: e.props.placement,
    } as CockpitDraw

    const body = view({ draw, ledger, spend })

    // Outside the cockpit: its drawing is in hand, slot and all, and the body
    // goes in where the slot was. Inside it: the cockpit has not drawn yet,
    // so the body is returned under the slot's own key, and the cockpit finds
    // it there instead of drawing an empty one.
    return foundIn(below, SLOT_KEY) === null
      ? body
      : (filled(below, SLOT_KEY, body) as RenderElement)
  })
}
