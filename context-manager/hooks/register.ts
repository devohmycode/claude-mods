import type { ModelForkResult, On, PaneOpenArgs, PluginOptions, RenderElement, SessionUsage } from 'claude-code'

import { adoptRows } from './core/adopt'
import { detect } from './core/detect'
import { EMPTY_HISTORY, historyPath, mutedOf, parseHistory, sessionEntryOf, staleRules, statsText, unmuted, withRule, withSession } from './core/history'
import type { History } from './core/history'
import { demoForkUsage, demoPatterns, demoRows, demoTurns, demoUsage } from './core/demo'
import { buildPrompt, judgeAliases, merge, parseReply, shouldRun, spentOf, usageOf } from './core/judge'
import { appliedFor, editedSince, isApplicable, rewriteOf, testCandidates, watchStep } from './core/apply'
import type { Watch } from './core/apply'
import {
  GIT_BRANCH_ARGV, GIT_DIFF_ARGV, LINUX_ARGV, MAC_ARGV, VERSION_ARGV, WINDOWS_ARGV, branchOf, diffOf, limitsOf, parseLinux, parseMac,
  parseWindows, platformOf, versionOf,
} from './core/info'
import type { Platform, SystemReading } from './core/info'
import { normalize, rowOf } from './core/ledger'
import { reportOf, reportPath } from './core/report'
import type { ToolEvent } from './core/ledger'
import { bandModel, debugDump, fromStored, mergeStored, paneModel, parseRegistry, reduce, toStored, usageLine } from './core/patterns'
import { appendedTo, bulletOnly, markedRules, mergeSettings, previewOf, propose, ruleText, withoutRule } from './core/rules'
import { activeRuns, agentOf, journalPath, parseJournal, runOf } from './core/spawns'
import { collapseWs, duration, fit, instructionOf, pctOf } from './core/text'
import {
  AUTO_OPEN_MIN_COLUMNS, CLAUDE_MD_HEADING, COMMAND, DEBUG_MAX_DROPPED, JUDGE_MIN_ROWS, MAX_PATTERNS, PANE_ID,
  APPLIED_FLAG, APPLY_WATCH_CALLS, PANE_INLINE_ROWS, PANE_TITLE, PLUGIN_NAME, RUN_REFRESH_MS, SENSITIVITIES, STEER_RING_TRIES, STEER_RING_WAIT_MS,
  initialState,
} from './core/types'
import { INFO_KEYS, INFO_REFRESH_DEFAULT_S, INFO_REFRESH_MIN_S } from './core/types'
import type { Action, Actions, Artifact, Choice, Info, InfoKey, JudgeUsage, Run, Sensitivity, State, Tokens, Ui } from './core/types'
import type { Host } from './host'
import { LANGUAGE_TAGS, say, setSay } from './say'
import { Band, Pane } from './ui'

const CONFIG_LANG_KEY = `${PLUGIN_NAME}.language`   // the `/config` row that picks the language
const PREFIX_EXCLUDED = 'Messages'   // the /context row that is the conversation itself, not the prefix
const ANSWER_HEAD = 100   // characters of the turn's answer kept as an evidence quote
const CARD_KIND = 60      // characters of a card's behaviour quoted back in a command's reply
const DEMO_CONTEXT = [120_000, 190_000, 250_000, 320_000]   // `/manager demo`: the window filling up to the sample's own 32%, so the trend draws

// What set one judge run going, as the debug log names it: the mid-turn cadence, the turn's end, the
// person, or a check armed at load over a transcript this plugin joined late.
type JudgeReason = 'tool.call' | 'turn.complete' | '/manager check' | 'load'

// The lanes the run answers out loud: the check the person typed, and the one the load armed for them.
const REQUESTED: readonly JudgeReason[] = ['/manager check', 'load']

/**
 * Registers ContextManager: the ledger of every tool call, the judge that names wasteful
 * behaviours, the band and the pane that let the user fix or ignore them.
 *
 * @param on the engine's registrar
 * @param options what `/config` holds for this plugin; only `language` is read, and it is read
 *   here and nowhere else — writing that row reloads the module, so `register` runs again with the
 *   new value and there is nothing to keep in step.
 */
export function register(on: On, options: PluginOptions = {}): void {
  // Before anything else: the command's own words are read when it is registered, and every line the
  // pane draws is read when it is drawn, both of which happen under a hook below.
  setSay(options['language'])
  // The other two rows are read here too, and for the same reason: writing one reloads the module.
  const sensitivity: Sensitivity = SENSITIVITIES.find(s => s === options['sensitivity']) ?? 'normal'
  const canApply = options['apply'] === true
  // One row per fact, each read by its literal name; a row left at its default shows its fact.
  const infoShow: Record<InfoKey, boolean> = {
    model: options['showModel'] !== false,
    effort: options['showEffort'] !== false,
    fiveHour: options['showFiveHour'] !== false,
    fiveHourReset: options['showFiveHourReset'] !== false,
    week: options['showWeek'] !== false,
    cost: options['showCost'] !== false,
    branch: options['showBranch'] !== false,
    diff: options['showDiff'] !== false,
    skill: options['showSkill'] !== false,
    version: options['showVersion'] !== false,
    clock: options['showClock'] !== false,
    system: options['showSystem'] !== false,
  }
  const refreshSeconds = typeof options['infoRefresh'] === 'number' && Number.isFinite(options['infoRefresh'])
    ? Math.max(INFO_REFRESH_MIN_S, options['infoRefresh'])
    : INFO_REFRESH_DEFAULT_S

  let state: State = initialState('', 0)
  let host: Host | null = null
  let isDebug = false
  // `judge.start` lands one clock read after the decision to run, and a storm of tool calls decides
  // inside that window: this flag is what stops a second fork of the same session.
  let forking = false
  // A check asked for while a run is in flight is answered by that run: cadence runs are frequent now,
  // and the person who pressed Check now would otherwise be told `already checking` and never told more.
  let asked = false
  // The load lane's one failure toast. Its arming survives every failure, so a toast per retry would be a
  // storm — but total silence reads exactly like a check that never fired, so the first failure speaks.
  let armedSpoke = false
  // The project's history: the file it lives in (null without a home directory), what it held when read, this
  // session's key in it, and the entry last written, so a turn that changed nothing writes nothing.
  let historyFile: string | null = null
  let history: History = EMPTY_HISTORY
  let sessionKey = ''
  let sessionAt = 0
  let resets = 0
  let lastWritten = ''

  const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

  // Why a fork came back without a reply, in the words the failure toast and the debug dump print.
  const unansweredOf = (reply: Extract<ModelForkResult, { isAnswered: false }>): string => {
    if (reply.reason === 'nothing-to-fork') return 'cold snapshot'
    if (reply.reason === 'api-error') return `API error ${reply.error}${reply.status === null ? '' : ` (${reply.status})`}`
    if (reply.reason === 'empty-reply') return 'empty reply'
    return 'aborted'
  }

  // `focus` is a request, not a grant (d.ts 4915-4922): the surface hands the pane the keyboard only while
  // the prompt holds them over an empty composer, and refuses it otherwise — the pane opens either way.
  const paneArgs = (focus?: true): PaneOpenArgs =>
    focus === undefined
      ? { id: PANE_ID, title: PANE_TITLE, rows: PANE_INLINE_ROWS }
      : { id: PANE_ID, title: PANE_TITLE, rows: PANE_INLINE_ROWS, focus }

  const savedToast = (before: State['saved']): void => {
    const ms = state.saved.ms - before.ms
    const pct = pctOf(state.saved.chars - before.chars, state.usage.window)
    const grew = [...(ms > 0 ? [`+${duration(ms)}`] : []), ...(pct > 0 ? [`+~${pct}%`] : [])]
    if (grew.length === 0) return
    host?.toast(say().command.savedToast(grew.join(' · ')))
  }

  const openIds = (): string[] => state.patterns.filter(p => p.openedAtTurn !== null).map(p => p.id)

  // Outside a render hook: fold the action in, redraw, and credit an instruction that settled in it.
  const dispatch = (action: Action): void => {
    const before = state.saved
    const open = openIds()
    state = reduce(state, action)
    host?.invalidate()
    // Only a settled instruction is a saving to announce; the per-turn accrual behind it stays quiet.
    if (open.some(id => state.patterns.find(p => p.id === id)?.openedAtTurn === null)) savedToast(before)
  }

  // A `/clear`, a `/manager reset` or a resume starts the session over: the closure flags that belong to
  // the session go with its state, so a new one may speak for its armed check again.
  const resetSession = (): void => {
    dispatch({ type: 'reset' })
    armedSpoke = false
    // What ran before the reset stays in the history under its own key; what follows is a session of its own.
    resets += 1
    sessionKey = `s${sessionAt}-${resets}`
    lastWritten = ''
  }

  // This session's entry, folded into the history and written back when it changed. Never awaited from a hook:
  // the turn is answered first, and a write that fails costs the history one turn, never the session.
  const writeHistory = async (): Promise<void> => {
    const engine = host
    const file = historyFile
    if (engine === null || file === null || sessionKey === '') return
    const entry = sessionEntryOf(state, sessionKey, sessionAt)
    const text = JSON.stringify(entry)
    if (text === lastWritten) return
    history = withSession(history, entry)
    await engine.writeFile(file, JSON.stringify(history))
    lastWritten = text
    // The store keeps the pointer and two counters; the detail is the file's.
    await engine.storeSet(`history:${state.cwd}`, { file, sessions: history.sessions.length, lastWrittenAt: sessionAt })
  }

  // The history as `/manager stats` reads it: the file's sessions, this one included as it stands now.
  const historyNow = (): History => (sessionKey === '' ? history : withSession(history, sessionEntryOf(state, sessionKey, sessionAt)))

  const unmuteText = async (id: string): Promise<string> => {
    if (id === '') return say().command.unmuteUsage
    if (!state.muted.includes(id)) return say().command.notMuted(id)
    const now = host === null ? 0 : await host.now()
    history = unmuted(history, id, now)
    dispatch({ type: 'history', muted: mutedOf(history) })
    if (historyFile !== null && host !== null) await host.writeFile(historyFile, JSON.stringify(history)).catch(() => undefined)
    return say().command.unmuted(id)
  }

  // Inside a render hook: fold the action in with no redraw, since a redraw loops.
  const observe = (action: Action): void => {
    state = reduce(state, action)
  }

  const persist = (): void => {
    const engine = host
    if (engine === null) return
    const key = `patterns:${state.cwd}`
    const mine = state.patterns.map(toStored)
    void engine
      .storeGet(key)
      .then(value => engine.storeSet(key, mergeStored(parseRegistry(value), mine)))
      .catch(() => undefined)
  }

  // An open the person asked for asks for their keyboard too, so the pane they just called up is the pane
  // they can type in; an unasked one interrupts whatever they were doing and never asks.
  const openPane = async (auto?: true): Promise<void> => {
    const engine = host
    if (engine === null) return
    const opened = await engine.openPane(auto === undefined ? paneArgs(true) : paneArgs())
    // Since 2.1.280 a pane the surface could not place resolves rather than throws: it is the same
    // refusal every caller already catches, and the pane is not open.
    if (!opened.isPlaced) throw new Error(opened.reason)
    dispatch(auto === undefined ? { type: 'pane', open: true } : { type: 'pane', open: true, auto })
    // The facts were not read while the pane was shut: read them now rather than at the next tick.
    void readInfo(true).catch(() => undefined)
  }

  // Only after fresh cards arrived, once a session, and only where the surface would draw it.
  const autoOpen = async (fresh: readonly string[]): Promise<void> => {
    const queued = fresh.some(id => state.cards.includes(id))
    if (!queued || state.paneOpen || state.autoOpened || (state.columns ?? 0) < AUTO_OPEN_MIN_COLUMNS) return
    try {
      await openPane(true)
    } catch {
      // an unasked open the surface or another plugin refused is no error of the user's
    }
  }

  // A check the person asked for: they are waiting for the answer, so the pane opens at any width, every time.
  const openForCheck = async (queued: readonly string[]): Promise<void> => {
    if (queued.length === 0 || state.paneOpen) return
    try {
      await openPane()
    } catch {
      // the surface or another plugin refused: the band still says what was found
    }
  }

  // The four counts a turn was billed, zero where no response came back to bill.
  const tokensOf = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | undefined): Tokens =>
    ({ input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheCreate: u?.cache_creation_input_tokens ?? 0 })

  // An `Agent` result names its loop, but the description it was given is the call's own argument, so the
  // value is handed over with it; every other tool's result is read as it came.
  const spawnValue = (e: ToolEvent, value: unknown): unknown =>
    e.tool === 'Agent' && typeof e.description === 'string' && typeof value === 'object' && value !== null
      ? { ...value, description: e.description }
      : value

  // One run's journal, read and folded in; a read that fails still stamps the run, so it is not retried at once.
  const readJournal = async (engine: Host, run: Run, now: number): Promise<void> => {
    const path = journalPath(run)
    if (path === null) return
    const entries = await engine.readFile(path).then(parseJournal).catch(() => [])
    dispatch({ type: 'run.journal', runId: run.id, entries, now })
  }

  // The journals of the runs still going, at most every RUN_REFRESH_MS each — every run's when forced: a
  // launch reads its own at once, and the judge reads them all before it asks. Never awaited from a hook.
  const refreshRuns = async (force: boolean): Promise<void> => {
    const engine = host
    if (engine === null || state.runs.length === 0) return
    const now = await engine.now()
    const due = force ? state.runs : activeRuns(state, now).filter(run => now - run.refreshedAt >= RUN_REFRESH_MS)
    await Promise.all(due.map(run => readJournal(engine, run, now)))
  }

  // What the run put in front of the user: a recurrence is news too, and it is the D4 moment this exists for.
  const checkedText = (queued: number): string =>
    queued === 0 ? say().command.nothingNew : say().command.found(queued)

  // A run that reported nothing: a cold snapshot, a refusal, or a failure of ours. An API error still bills
  // what it read before it failed, so its usage is counted with the judge's spending.
  const judgedNothing = (error: string, usage: JudgeUsage | null = null): Action => ({
    type: 'judge.done', patterns: state.patterns, fresh: [], recurred: [], focus: null, time: null, context: null,
    spent: usage === null ? 0 : spentOf(usage), error, returned: 0, kept: 0, dropped: [], usage,
  })

  // A run the person asked for answers them, whatever it found: silence is what a check must never be.
  // An armed check nobody asked for says it once, in its own words, since it will be retried: the first
  // failure names itself and the retries stay quiet.
  const failedToast = (reason: JudgeReason, failure: string): void => {
    if (reason === 'load' && !asked) {
      if (armedSpoke) return
      armedSpoke = true
      host?.toast(say().command.notCheckedYet(failure))
      return
    }
    if (REQUESTED.includes(reason) || asked) host?.toast(say().command.checkFailed(failure))
  }

  const judgeOnce = async (engine: Host, reason: JudgeReason): Promise<void> => {
    const requested = REQUESTED.includes(reason)
    const seq = state.seq
    const now = await engine.now()
    dispatch({ type: 'judge.start', now, seq })
    // AGENTS is read off the journals, so they are brought up to date once, here, before the prompt is built.
    await refreshRuns(true).catch(() => undefined)
    // One alias table for the run: the loops keep spawning while the fork thinks, and a new agent's first
    // row would renumber the `agent:aN` handles the reply cites against the AGENTS the prompt printed.
    const aliases = judgeAliases(state)
    let reply: ModelForkResult | null = null
    let failed: string | null = null
    try {
      reply = await engine.fork(buildPrompt(state, aliases))
    } catch (err) {
      failed = messageOf(err)
    }
    if (reply === null) {
      dispatch(judgedNothing(failed ?? 'cold snapshot'))
      failedToast(reason, failed ?? 'cold snapshot')
      return
    }
    // Since 2.1.280 a fork can resolve without a reply, and says why: nothing to fork yet (the cold snapshot a
    // null used to say), an API error named by its kind and status and never by its text, a reply with no
    // text, or an abort. Every case but the first was billed, so its usage is counted.
    if (!reply.isAnswered) {
      const unanswered = unansweredOf(reply)
      dispatch(judgedNothing(unanswered, reply.reason === 'nothing-to-fork' ? null : usageOf(reply.usage)))
      failedToast(reason, unanswered)
      return
    }
    try {
      const { findings, focus, time, context, dropped, returned } = parseReply(reply.text, state, aliases)
      const merged = merge(state, findings)
      // A finding the registry cap evicted never becomes a card, so it is dropped, not kept.
      const reasons = [...dropped, ...merged.evicted.map(id => `${id}: evicted, over MAX_PATTERNS (${MAX_PATTERNS})`)]
      const kept = findings.length - merged.evicted.length
      const usage = usageOf(reply.usage)
      dispatch({
        type: 'judge.done', patterns: merged.patterns, fresh: merged.fresh, recurred: merged.recurred, focus,
        time, context, spent: spentOf(usage), error: null, returned, kept, dropped: reasons, usage,
      })
      try {
        if (isDebug) {
          engine.log(`ContextManager judge: ${returned} returned · ${kept} kept · ${reasons.length} dropped · from ${reason}`)
          for (const line of reasons.slice(0, DEBUG_MAX_DROPPED)) engine.log(line)
          // A cold cache is what makes a run expensive, and only the four counts say which it was.
          engine.log(usageLine(usage))
        }
      } catch {
        // a log we could not write is not a failed run: the findings are already in the registry
      }
      persist()
      // Every card this run queued: a fresh finding, or a steered behaviour that came back.
      const queued = [...merged.fresh, ...merged.recurred].filter(id => state.cards.includes(id))
      // A check asked for mid-run is answered by the run it arrived in, whichever run that was.
      if (!(requested || asked)) return autoOpen(queued)
      engine.toast(checkedText(queued.length))
      return openForCheck(queued)
    } catch (err) {
      // Whatever went wrong, the run is over: `running` may never stay true.
      dispatch(judgedNothing(messageOf(err)))
      failedToast(reason, messageOf(err))
    }
  }

  /**
   * Judges the session once, if no run is already in flight.
   *
   * @param reason what set this run going: the mid-turn cadence, the turn's end, the person, or the
   *   check a load armed. The two REQUESTED lanes are answered with a toast and open the pane wherever
   *   it can be drawn; a cadence run stays quiet and keeps the once-a-session, wide-terminal rule for
   *   opening itself — unless someone asks while it is in flight, in which case that run answers them.
   */
  async function runJudge(reason: JudgeReason): Promise<void> {
    const engine = host
    if (engine === null || forking || state.judge.running) return
    forking = true
    try {
      await judgeOnce(engine, reason)
    } finally {
      forking = false
      asked = false
    }
  }

  // A check armed at load consults no gate — `shouldRun` counts new work, and a session joined late has
  // all of its work behind it. The load fires this itself; every opportunity after it is a retry of a run
  // that came back with nothing. Answers whether it took this opportunity.
  const armedCheck = (): boolean => {
    if (!state.pendingCheck || state.judge.running) return false
    void runJudge('load').catch(() => undefined)
    return true
  }

  // The opportunities a run can start at: the armed check first, else the cadence's own count of new work.
  const judgeAt = (now: number, cadence: JudgeReason): void => {
    if (!armedCheck() && shouldRun(state, now)) void runJudge(cadence).catch(() => undefined)
  }

  // The detectors cost no model call, so they read every new fact as it lands — a ledger row, a finished
  // turn, a step that switched model or effort — and only news reaches the registry: a behaviour they named
  // before and nobody has decided is already queued, and one somebody decided is theirs to keep.
  const detectNow = (): void => {
    const findings = detect(state)
    if (findings.length === 0) return
    const merged = merge(state, findings)
    if (merged.fresh.length === 0) return
    dispatch({ type: 'detect.done', patterns: merged.patterns, fresh: merged.fresh })
    persist()
    if (isDebug) host?.log(`ContextManager detectors: ${merged.fresh.join(', ')}`)
    void autoOpen(merged.fresh)
  }

  const checkNow = (): string => {
    // Asked for by a person: an audit slowed by empty runs goes back to its own pace.
    dispatch({ type: 'judge.wake' })
    if (forking || state.judge.running) {
      // The run already going answers this ask: nothing is forked, and nobody is left without a reply.
      asked = true
      return say().command.alreadyChecking
    }
    void runJudge('/manager check').catch(() => undefined)
    return say().command.checking
  }

  const togglePane = async (): Promise<void> => {
    const engine = host
    if (engine === null) return
    try {
      // The `ui.close` hook records the close, as it records the person's own.
      if (state.paneOpen) await engine.closePane({ id: PANE_ID })
      else await openPane()
    } catch {
      // the surface or another plugin refused: the pane stays as it was, and `/manager` says so
    }
  }

  const firstLine = (text: string): string => {
    const [head = ''] = text.split('\n')
    return head === text ? text : `${head} …`
  }

  const decide = (patternId: string, choice: Choice, text?: string): void => {
    const p = state.patterns.find(q => q.id === patternId)
    if (p === undefined) return
    dispatch({ type: 'decide', patternId, choice, text })
    if (state.patterns.find(q => q.id === patternId)?.decision !== choice) return
    if (choice === 'keep') host?.toast(say().command.toastIgnored(p.kind))
    if (choice === 'kill') host?.toast(say().command.toastFixed(p.alternative))
    if (choice === 'steer') host?.toast(say().command.toastNoted(firstLine(text ?? '')))
    persist()
  }

  // The number the pane draws beside a card is its seat in `cards`; 0 means the card is no longer listed.
  const seatOf = (patternId: string): number => state.cards.indexOf(patternId) + 1

  const cardReply = (patternId: string, seat: number, tail: string): string => {
    const kind = state.patterns.find(q => q.id === patternId)?.kind ?? patternId
    return say().command.card(seat, fit(kind, CARD_KIND), tail)
  }

  const numberOf = (token: string): number | null => (/^\d+$/.test(token) ? Number(token) : null)

  // A number no card wears is a numbering mistake, whichever verb typed it: it is refused, never obeyed.
  const noCardText = (n: number): string => say().command.noCard(n, state.cards.length)

  // `/manager ignore 2` and `/manager fix 2` decide the card the pane numbers 2, and say which one they took.
  const decideByNumber = (choice: Choice, token: string): string => {
    if (state.cards.length === 0) return say().command.nothingToDecide
    const n = numberOf(token)
    if (n === null) return say().command.usage
    const patternId = state.cards[n - 1]
    if (patternId === undefined) return noCardText(n)
    const reply = cardReply(patternId, n, choice === 'keep' ? say().command.outcomeIgnored : say().command.outcomeFixed)
    decide(patternId, choice)
    return reply
  }

  const steerSubmit = (patternId: string, text: string): void => {
    const wanted = text.trim()
    if (wanted === '') {
      host?.toast(say().command.writeFirst)
      return
    }
    decide(patternId, 'steer', wanted)
  }

  // The artifact's own words without the file's furniture: a bullet, or the prose under a frontmatter.
  const bodyOf = (content: string): string =>
    content.includes(CLAUDE_MD_HEADING) ? ruleText(bulletOnly(content)) : (content.split('---\n').at(-1) ?? content)

  // Apply: Fix, and the calls that carry the behaviour are rewritten from now on. Only where the `/config` row is
  // on and the behaviour has a rewrite; anything else is answered, never silently turned into a plain Fix.
  const applyPattern = (patternId: string): string | null => {
    const p = state.patterns.find(q => q.id === patternId)
    if (p === undefined) return null
    if (!state.canApply) return say().command.applyOff
    if (!isApplicable(p)) return say().command.notApplicable(seatOf(patternId))
    decide(patternId, 'kill')
    if (state.patterns.find(q => q.id === patternId)?.decision !== 'kill') return null
    dispatch({ type: 'apply.on', patternId })
    host?.toast(say().command.appliedOn(p.kind))
    return null
  }

  // The rewrite last made, and the main-loop Bash calls after it in which running the original again means the
  // rewrite was wrong: the note tells Claude that running it again gets the whole thing, so that call goes through.
  let watch: Watch = null

  // Generic over the call's own type, so the rewritten call is still the call the engine handed us.
  const planCall = async <E extends ToolEvent>(engine: Host, e: E): Promise<{ call: E; note: string | null }> => {
    const unchanged = { call: e, note: null }
    if (e.tool !== 'Bash' || e.agentId !== undefined || typeof e.command !== 'string') return unchanged
    const { key } = normalize('Bash', e)
    const step = watchStep(watch, key)
    watch = step.watch
    if (step.failed !== null) {
      dispatch({ type: 'apply.failed', patternId: step.failed })
      const failed = state.patterns.find(q => q.id === step.failed)
      if (failed?.applied?.stopped === true) engine.toast(say().command.appliedStopped(failed.kind))
      return unchanged
    }
    const p = appliedFor(state, key)
    if (p === undefined) return unchanged
    const edited = editedSince(state, key)
    const candidates = edited.length === 1 ? testCandidates(edited[0] ?? '', state.cwd) : []
    const found: string[] = []
    for (const candidate of candidates) if (await engine.exists(candidate).catch(() => false)) found.push(candidate)
    const plan = rewriteOf(p, e.command, edited, found, state.cwd)
    if (plan === null) return unchanged
    if (plan.type === 'whole') {
      dispatch({ type: 'apply.whole', patternId: p.id })
      return unchanged
    }
    dispatch({ type: 'apply.rewrote', patternId: p.id })
    watch = { patternId: p.id, key, left: APPLY_WATCH_CALLS }
    return { call: { ...e, command: plan.command } as E, note: plan.note }
  }

  const isPreviewed = (a: Artifact): boolean => state.preview !== null && state.preview.patternId === a.patternId && state.preview.kind === a.kind

  // Write in two presses: the first shows what would be written, the second writes it. The file is read again at
  // the second press, since the person may have edited it between the two, and a rule already there is not
  // written twice.
  const writeArtifact = async (a: Artifact): Promise<void> => {
    const engine = host
    if (engine === null) return
    try {
      const existing = (await engine.exists(a.path)) ? await engine.readFile(a.path) : null
      const preview = previewOf(a, existing)
      if (!isPreviewed(a) || preview.duplicate) {
        dispatch({ type: 'artifact.preview', preview })
        if (isPreviewed(a) && preview.duplicate) engine.toast(say().command.alreadyThere(a.path))
        return
      }
      if (a.mode === 'append') await engine.writeFile(a.path, appendedTo(existing, a.content))
      if (a.mode === 'write') await engine.writeFile(a.path, a.content)
      if (a.mode === 'merge-settings') await engine.writeFile(a.path, mergeSettings(existing, a.content))
      dispatch({ type: 'artifact.preview', preview: null })
      dispatch({ type: 'artifact.done', patternId: a.patternId, kind: a.kind, written: true })
      engine.toast(say().command.wrote(a.path))
      // The date a CLAUDE.md rule was written is what later sessions measure its usefulness from.
      if (a.kind === 'claude-md' && historyFile !== null) {
        history = withRule(history, a.patternId, await engine.now())
        await engine.writeFile(historyFile, JSON.stringify(history))
      }
    } catch (err) {
      engine.toast(messageOf(err))
    }
  }

  // A stale rule taken out of CLAUDE.md: its bullet alone, every other line as it was.
  const removeRule = async (patternId: string): Promise<void> => {
    const engine = host
    if (engine === null) return
    const path = `${state.cwd}/CLAUDE.md`
    try {
      const text = await engine.readFile(path)
      await engine.writeFile(path, withoutRule(text, patternId))
      dispatch({ type: 'stale.done', patternId })
      engine.toast(say().command.removed(path))
    } catch (err) {
      engine.toast(messageOf(err))
    }
  }

  const tryArtifact = (a: Artifact): void => {
    dispatch({ type: 'standing.add', text: instructionOf(collapseWs(bodyOf(a.content)) || a.title) })
    dispatch({ type: 'artifact.done', patternId: a.patternId, kind: a.kind, written: true })
    host?.toast(say().command.trying(a.title))
  }

  // The key the pane draws a card's Fix… field under.
  const steerFieldKey = (patternId: string): string => `card:${patternId}:text`

  // The ring lands only on an element the drawn tree already holds ('no element of its own is drawn under that
  // key', d.ts 8846-8853), and a tree lands after the render hook that built it returns. The press that opens
  // the field asks for a redraw and nothing more, so the ask waits for the frame the field is drawn in, and
  // asks again while the engine answers that nothing is drawn under the key — a few frames, then it stops.
  const steerRing = async (patternId: string): Promise<void> => {
    const engine = host
    if (engine === null) return
    // `focus` is a request, not a grant (d.ts 4915-4922): the surface refuses it while the person holds an
    // element of ours, which the press that opened the field is — but where the composer holds the keys over
    // an empty line it is granted, and then `autoFocus` lands the ring on the field by itself.
    void engine.openPane(paneArgs(true)).catch(() => undefined)
    let denied = 'the ask was never answered'
    for (let tries = STEER_RING_TRIES; tries > 0; tries -= 1) {
      await engine.sleep(STEER_RING_WAIT_MS).catch(() => undefined)
      // The field was closed again, or another card's opened: this ring is nobody's now.
      if (state.steering !== patternId) return
      const deny = await engine
        .focusElement({ requestId: PANE_ID, key: steerFieldKey(patternId) })
        .then(result => result.deny ?? null)
        .catch(err => messageOf(err))
      if (deny === null) return
      denied = deny
    }
    // The ring stayed put, so the keystrokes are the composer's: the way in is the line the person is owed.
    engine.toast(say().command.composerHasKeys(seatOf(patternId)))
    if (isDebug) engine.log(`${PLUGIN_NAME}: the ring never reached ${steerFieldKey(patternId)} — ${denied}`)
  }

  const actions: Actions = {
    keep: patternId => decide(patternId, 'keep'),
    steer: patternId => {
      dispatch({ type: 'steer.begin', patternId })
      // A second press closed the field; only the press that opened one goes looking for the keyboard.
      if (state.steering === patternId) void steerRing(patternId)
    },
    // The pane's body is this hook's tree, so the redraw is what paints the keystroke; the text it draws
    // back is this one, which is also what `/manager fix` sends when the keyboard never reaches the field.
    steerDraft: text => dispatch({ type: 'steer.draft', text }),
    steerSubmit: (patternId, text) => steerSubmit(patternId, text),
    kill: patternId => decide(patternId, 'kill'),
    info: patternId => dispatch({ type: 'expand', patternId }),
    togglePane: () => {
      void togglePane()
    },
    // The band and the pane have no reply to write in, so the press is answered with a toast.
    check: () => {
      host?.toast(checkNow())
    },
    write: a => {
      void writeArtifact(a)
    },
    tryOnce: a => tryArtifact(a),
    // A skipped rule is handled: `state.written` is the set the pane never offers again.
    skip: a => {
      if (isPreviewed(a)) dispatch({ type: 'artifact.preview', preview: null })
      dispatch({ type: 'artifact.done', patternId: a.patternId, kind: a.kind, written: true })
    },
    removeRule: patternId => {
      void removeRule(patternId)
    },
    keepRule: patternId => dispatch({ type: 'stale.done', patternId }),
    apply: patternId => {
      const refused = applyPattern(patternId)
      if (refused !== null) host?.toast(refused)
    },
  }

  // What a timer may call once the hook that started it has returned: `$` does not outlive its dispatch, the
  // engine the module was created with does.
  type Live = {
    run: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string }>
    every: (ms: number, fn: () => void) => { cancel: () => void }
    usage: () => Promise<SessionUsage>
    now: () => Promise<number>
    os: () => Promise<string | undefined>
    invalidate: () => void
  }
  let live: Live | null = null
  let ticker: { cancel: () => void } | null = null
  let platform: Platform | null = null
  let lastTicks: { idle: number; total: number } | undefined
  let reading = false

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)
    try {
      live ??= {
        run: argv => beneath.process.run(argv),
        every: (ms, fn) => beneath.clock.every(ms, fn),
        usage: () => beneath.session.usage(),
        now: () => beneath.clock.now(),
        os: () => beneath.env.get('OS'),
        invalidate: () => beneath.ui.invalidate('ui.render'),
      }
    } catch {
      // an engine that lacks a noun leaves the facts it would have read unread
    }
    return beneath
  })

  const wanted = (...keys: InfoKey[]): boolean => keys.some(key => state.infoShow[key])

  // The machine, by the probe its platform takes; null where it has none or the probe failed.
  const readSystem = async (engine: Live): Promise<SystemReading | null> => {
    if (platform === null) {
      const os = await engine.os().catch(() => undefined)
      const uname = os === 'Windows_NT' ? null : await engine.run(['uname', '-s']).then(r => r.stdout).catch(() => null)
      platform = platformOf(os, uname)
    }
    if (platform === 'windows') return parseWindows((await engine.run(WINDOWS_ARGV)).stdout)
    if (platform === 'mac') return parseMac((await engine.run(MAC_ARGV)).stdout)
    if (platform === 'linux') {
      const reading = parseLinux((await engine.run(LINUX_ARGV)).stdout, lastTicks)
      lastTicks = reading?.ticks ?? lastTicks
      return reading
    }
    return null
  }

  // One reading of the facts that change on their own: the limits and the cost, git, the machine and the time.
  // Only while the pane is open, since nothing else draws them, and never two at once.
  const readInfo = async (force = false): Promise<void> => {
    const engine = live
    if (engine === null || reading || (!force && !state.paneOpen)) return
    reading = true
    try {
      const at = await engine.now()
      const patch: Partial<Info> = { at }
      if (wanted('fiveHour', 'fiveHourReset', 'week', 'cost')) {
        const u = await engine.usage().catch(() => null)
        if (u !== null) Object.assign(patch, { limits: limitsOf(u.rateLimits), costUsd: u.cost?.usd ?? null })
      }
      if (wanted('branch', 'diff')) {
        const branch = await engine.run(GIT_BRANCH_ARGV).catch(() => null)
        const diff = branch === null || branch.exitCode !== 0 ? null : await engine.run(GIT_DIFF_ARGV).catch(() => null)
        patch.git = branch === null || branch.exitCode !== 0 ? null : { branch: branchOf(branch.stdout), ...diffOf(diff?.stdout ?? '') }
      }
      if (wanted('system')) patch.system = await readSystem(engine).catch(() => null)
      dispatch({ type: 'info', info: patch })
      engine.invalidate()
    } finally {
      reading = false
    }
  }

  // Started once per session on the plugin's own clock; a new session cancels the one before.
  const startTicker = (): void => {
    const engine = live
    if (engine === null || !wanted(...INFO_KEYS)) return
    ticker?.cancel()
    ticker = engine.every(refreshSeconds * 1000, () => {
      void readInfo().catch(() => undefined)
    })
  }

  // The version never changes within a session, so it is asked once, detached from the start.
  const readVersion = async (): Promise<void> => {
    const engine = live
    if (engine === null || !state.infoShow.version) return
    const version = versionOf((await engine.run(VERSION_ARGV)).stdout)
    if (version !== null) dispatch({ type: 'info', info: { version } })
  }

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try {
      dispatch({ type: 'info', info: { skill: e.skill } })
    } catch {
      // a skill we failed to note is still the skill the engine loaded
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    try {
      const engine: Host = {
        now: () => $.clock.now(),
        sleep: ms => $.clock.sleep(ms),
        invalidate: () => $.ui.invalidate('ui.render'),
        toast: text => $.ui.toast(text),
        log: text => $.ui.log(text),
        openPane: args => $.ui.open(args),
        closePane: args => $.ui.close(args),
        focusElement: args => $.ui.focus(args),
        registerCommand: spec => $.command.register(spec),
        usage: args => $.session.usage(args),
        messages: () => $.session.messages(),
        storeGet: key => $.store.get(key),
        storeSet: (key, value) => $.store.set(key, value),
        fork: prompt => $.model.fork({ prompt }),
        readFile: path => $.fs.read(path),
        writeFile: (path, text) => $.fs.write(path, text),
        exists: path => $.fs.exists(path),
        debugFlag: () => $.env.get('CONTEXTMANAGER_DEBUG'),
        home: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')),
      }
      host = engine
      const u = await engine.usage({ breakdown: 'summary' })
      const now = await engine.now()
      const stored = parseRegistry(await engine.storeGet(`patterns:${e.cwd}`))
      state = { ...initialState(e.cwd, u.context.window), patterns: stored.map(fromStored), sensitivity, canApply, infoShow }
      dispatch({
        type: 'info',
        info: { model: u.context.breakdown?.model ?? null, limits: limitsOf(u.rateLimits), costUsd: u.cost?.usd ?? null, at: now },
      })
      startTicker()
      void readVersion().catch(() => undefined)
      void readInfo(true).catch(() => undefined)
      // One key per session: when it started is what `session.usage` can tell us, and a reload finds it again.
      sessionAt = u.startedAt
      resets = 0
      sessionKey = `s${sessionAt}`
      lastWritten = ''
      history = EMPTY_HISTORY
      historyFile = null
      try {
        const home = await engine.home()
        if (home !== undefined && home !== '') {
          const file = historyPath(home, e.cwd)
          history = parseHistory((await engine.exists(file)) ? await engine.readFile(file) : null)
          historyFile = file
          const muted = mutedOf(history)
          if (muted.length > 0) dispatch({ type: 'history', muted })
          // The rules this plugin wrote, read once here: CLAUDE.md is read at the start of a session, so a rule
          // offered for removal now changes nothing the running session has already paid for.
          const claudeMd = `${e.cwd}/CLAUDE.md`
          const marked = (await engine.exists(claudeMd)) ? markedRules(await engine.readFile(claudeMd)) : []
          const stale = staleRules(history, marked)
          if (stale.length > 0) dispatch({ type: 'stale', rules: stale })
        }
      } catch {
        // a history we cannot read is a project with no history: the session goes on without one
      }
      dispatch({
        type: 'usage',
        usage: { window: u.context.window, compactAt: u.context.breakdown?.autoCompactThreshold, tokens: u.context.tokens, percent: u.context.percent },
        now,
      })
      const tokensOf = (items: readonly { tokens: number }[] | undefined): number => (items ?? []).reduce((n, i) => n + i.tokens, 0)
      const breakdown = u.context.breakdown
      // Only the MCP schemas in the window: a deferred one is listed with its size but stays behind
      // ToolSearch until searched for, and summing those read 1.1M of overhead in a window of 1M.
      const loadedMcp = breakdown?.mcpTools.filter(tool => tool.isLoaded)
      dispatch({
        type: 'overhead',
        overhead: { memory: tokensOf(breakdown?.memoryFiles), mcp: tokensOf(loadedMcp), agents: tokensOf(breakdown?.agents) },
      })
      // What every request re-reads before the conversation: /context's rows that hold tokens, less the
      // conversation itself and the schemas still behind ToolSearch.
      const parts = (breakdown?.categories ?? [])
        .filter(c => c.kind === 'used' && !c.isDeferred && c.name !== PREFIX_EXCLUDED && c.tokens > 0)
        .map(c => ({ name: c.name, tokens: c.tokens }))
      if (parts.length > 0) dispatch({ type: 'prefix', parts })
      try {
        // The name and its subcommands are typed, so they never move; only what `/help` reads does.
        await engine.registerCommand({ ...COMMAND, description: say().command.description, argumentHint: say().command.argumentHint })
      } catch (err) {
        engine.log(`${PLUGIN_NAME}: /${COMMAND.name} is taken — ${messageOf(err)}`)
      }
      try {
        const flag = await engine.debugFlag()
        isDebug = flag !== undefined && flag !== '' && flag !== '0'
      } catch {
        isDebug = false
      }
      // Last, so a transcript we cannot read costs the session nothing it already has.
      const adopted = adoptRows(await engine.messages())
      if (adopted.length === 0) return next(e)
      dispatch({ type: 'adopt', rows: adopted })
      detectNow()
      // Too few rows to judge: a fresh session, nothing armed and nothing forked — which the log says too,
      // since a debug line that claims a check on three rows is worse than no line at all.
      const enough = state.rows.length >= JUDGE_MIN_ROWS
      if (isDebug) {
        const tail = enough ? 'checking them now' : `under the ${JUDGE_MIN_ROWS}-row floor, nothing to check`
        engine.log(`ContextManager adopted ${adopted.length} rows from the transcript · ${tail}`)
      }
      if (!enough) return next(e)
      dispatch({ type: 'check.arm' })
      if (isDebug) engine.log(`ContextManager fired a check over ${state.rows.length} adopted rows · armed, so a cold answer retries`)
      // Fired here, not left for the person's next keystroke: a session with this much history behind it has
      // run turns, and `$.model.fork` reads its last turn's cache-safe snapshot (d.ts 2019-2034) — which is
      // exactly what a `/reload-plugins`, an edit under `--plugin-dir` or a resume hands us (d.ts 3106-3111).
      // Detached, never awaited: this hook is awaited by the engine and has a budget, and the run speaks in a
      // toast, not in a return value. A snapshot that really is cold answers null, and the arming stays up
      // (§5.2) for the first warm opportunity below — the next prompt, the next tool call, or the turn's end.
      armedCheck()
      return next(e)
    } catch {
      return next(e)
    }
  })

  on('turn.start', async ($, e, next) => {
    try {
      // The clock dates the wait since the last answer, so TURNS can say the person was away.
      const now = host === null ? 0 : await host.now()
      dispatch({ type: 'turn.start', now })
      return next(e)
    } catch {
      return next(e)
    }
  })

  on('tool.call', async ($, e, next) => {
    const engine = host
    let started = 0
    let call = e
    let note: string | null = null
    try {
      if (engine === null || next.origin.plugin === PLUGIN_NAME) return next(e)
      started = await engine.now()
      // Apply: the call is rewritten before it runs, never its result after. Anything that goes wrong here
      // leaves the call as Claude wrote it.
      const planned = await planCall(engine, e)
      call = planned.call
      note = planned.note
    } catch {
      if (engine === null) return next(e)
      call = e
      note = null
    }
    // `next(e)` is called exactly once: a rejection is the engine's to report — calling it again would run the tool twice.
    const result = await next(call)
    try {
      const ended = await engine.now()
      const row = rowOf(call, result, ended - started, state.turn)
      dispatch({ type: 'row', row: note === null ? row : { ...row, flags: [...row.flags, APPLIED_FLAG] } })
      const landed = state.rows[state.rows.length - 1]
      if (isDebug && landed !== undefined) engine.log(`ContextManager row r${landed.seq} ${landed.tool} ${landed.key} ${landed.ms}ms ${landed.chars}ch`)
      // A `Workflow` result is a run launched, an `Agent` result a loop named; a launch reads its journal at
      // once, and any run still going is re-read on the plugin's own cadence — detached, the call is answered.
      const run = runOf(result.result)
      if (run !== null) dispatch({ type: 'run.start', run, now: ended })
      const agent = agentOf(spawnValue(e, result.result))
      if (agent !== null) dispatch({ type: 'agent.start', ...agent })
      void refreshRuns(run !== null).catch(() => undefined)
      detectNow()
      // One agentic turn can run for hours, so the cadence is judged here too, not only between turns.
      judgeAt(ended, 'tool.call')
      // The rewrite's note rides beside the result, like any instruction: the result itself is untouched.
      const pending = [...(note === null ? [] : [note]), ...state.notes]
      if (pending.length === 0 || result.deny !== undefined) return result
      if (state.notes.length > 0) dispatch({ type: 'notes.drained' })
      return { ...result, context: [...(result.context ?? []), ...pending] }
    } catch {
      return result
    }
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const engine = host
      if (engine === null) return next(e)
      const u = e.usage
      // A subagent's turn is its loop's: what it cost and how it ended go onto the loop, and nothing else
      // moves — the window is the main loop's to sample, and so is the cadence.
      if (e.agentId !== undefined) {
        dispatch({ type: 'loop.turn', agentId: e.agentId, model: u?.model ?? null, ms: e.durationMs, tokens: tokensOf(u), ended: e.reason, turn: state.turn })
        return next(e)
      }
      // The window is sampled before the turn is recorded: how full it is after this turn is the turn's
      // own figure, and its growth over the last turns is the pace compaction actually runs at. The
      // sample is optional, though: a refused `session.usage` costs this turn its context reading, never
      // the turn itself — without the stat the trend, the pace and every token gate go with it.
      const seen = await engine.usage().catch(() => null)
      const now = await engine.now()
      dispatch({
        type: 'turn.complete',
        stat: {
          ...tokensOf(u),
          ms: e.durationMs,
          answerChars: e.answer.length,
          answerHead: e.answer.slice(0, ANSWER_HEAD),
          aborted: e.isAborted,
          ended: e.reason,
          at: now,
          idleMs: 0,
          context: seen?.context.tokens ?? null,
        },
      })
      if (seen !== null) dispatch({ type: 'usage', usage: { window: seen.context.window, tokens: seen.context.tokens, percent: seen.context.percent }, now })
      // The same sample says where the limits and the cost stand: a turn is when they move.
      if (seen !== null) dispatch({ type: 'info', info: { limits: limitsOf(seen.rateLimits), costUsd: seen.cost?.usd ?? null, at: now } })
      detectNow()
      void writeHistory().catch(() => undefined)
      judgeAt(now, 'turn.complete')
      return next(e)
    } catch {
      return next(e)
    }
  })

  // Every step of the main loop, for its model, its effort and what it wrote to the cache: a switch of either
  // rewrites the whole prompt cache, and the step after it is where that shows. Passed through untouched —
  // nothing is read mid-stream and nothing is yielded but what came from beneath. A subagent's steps are its
  // loop's, and our own fork's are the judge's, so neither is the session's prefix.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (host === null || e.agentId !== undefined || next.origin.plugin === PLUGIN_NAME) return result
      const effort = e.effort === undefined ? null : String(e.effort)
      // No redraw for a steady step: only a switch can change what is drawn, and the detectors redraw for that.
      observe({ type: 'step', model: e.model, effort, cacheCreate: result.usage?.cache_creation_input_tokens ?? null })
      if (state.prefix.breaks.length > 0) detectNow()
    } catch {
      // a step we failed to record is still the step the model took
    }
    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    try {
      dispatch({ type: 'compact' })
      // What had filled the window, said once at the moment it was emptied: the pane keeps it on its own row.
      const report = paneModel(state, []).header.compaction
      if (report !== null && report.sinks.length > 0) {
        host?.toast(say().command.compacted(report.turn, report.sinks.map(s => say().pane.share(say().pane.sinkNames[s.label] ?? s.label, s.share)).join(', ')))
      }
    } catch {
      // a compaction we failed to record is still the compaction the engine performed
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      // `origin` is the engine's to stamp; read it defensively so an unstamped submission still carries the texts.
      if (e.origin?.kind === 'plugin' || e.text.trimStart().startsWith(`/${COMMAND.name}`)) return next(e)
      const extra = [...state.notes, ...state.standing.filter(text => !state.notes.includes(text))]
      if (extra.length > 0) dispatch({ type: 'notes.drained' })
      const carried = extra.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...extra] }
      // A prompt is no new work, so there is no cadence lane here: only a check still armed fires — the load
      // fired its own, so this is the retry of one that came back cold — and it never changes what the
      // prompt carries.
      armedCheck()
      return next(carried)
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const engine = host
    try {
      if (engine === null || e.props.hasSurvey || e.surface === 'mobile') return next(e)
      if (e.props.bodyColumns !== state.columns) observe({ type: 'columns', columns: e.props.bodyColumns })
    } catch {
      return next(e)
    }
    // Drawn once: a band we cannot build answers with what is beneath it, never with a second dispatch.
    const below: RenderElement = await next(e)
    // The clock, read once per draw: the newest reading the state holds is a turn's end or a run's launch, so
    // a loopless run would read as fresh for the rest of a quiet session. A host that will not say the time
    // leaves the band that newest reading of its own rather than undrawn.
    const now = await engine.now().catch(() => null)
    try {
      const { Box, Text, Button, Input, Raster } = $.ui.resolve(e) as unknown as Ui
      const band = Band({
        ui: { Box, Text, Button, Input, Raster },
        model: now === null ? bandModel(state) : bandModel(state, now),
        site: { bodyColumns: e.props.bodyColumns, maxRows: e.props.maxRows },
        actions,
      })
      return Box({ flexDirection: 'column', children: [below, band] })
    } catch {
      return below
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e, next) => {
    try {
      if (host === null || e.surface === 'mobile') return next(e)
      const { Box, Text, Button, Input, Raster } = $.ui.resolve(e) as unknown as Ui
      return Pane({
        ui: { Box, Text, Button, Input, Raster },
        model: paneModel(state, propose(state)),
        site: { bodyColumns: e.props.bodyColumns, maxRows: e.props.scroll.bodyRows },
        placement: e.props.placement,
        actions,
      })
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: COMMAND.name }, async ($, e, next) => {
    try {
      if (host === null) return next(e)
      const args = e.args.trim()
      const [sub = ''] = args.split(/\s+/)
      if (sub === '' || sub === 'rules') {
        await togglePane()
        return { text: state.paneOpen ? say().command.paneShown : say().command.paneHidden }
      }
      if (sub === 'check') return { text: checkNow() }
      if (sub === 'fix') {
        const rest = args.slice(sub.length).trim()   // newlines inside the instruction survive
        const [first = ''] = rest.split(/\s+/)
        // A leading number is always the card: folding a mistyped one back into the instruction would
        // fix the wrong card with a garbled sentence, and `standing` keeps it for the whole session.
        const n = numberOf(first)
        if (state.cards.length === 0) return { text: say().command.nothingToDecide }
        if (n !== null && (n < 1 || n > state.cards.length)) return { text: noCardText(n) }
        const text = (n === null ? rest : rest.slice(first.length)).trim()
        // Nothing after the number sends the fix the card already offers; a note sends the note instead.
        if (text === '') return { text: n === null ? say().command.fixUsage : decideByNumber('kill', first) }
        const patternId = n === null ? (state.steering ?? state.cards[0]) : state.cards[n - 1]
        const seat = patternId === undefined ? 0 : seatOf(patternId)
        if (patternId === undefined || seat === 0) return { text: say().command.fixUsage }
        steerSubmit(patternId, text)
        return { text: cardReply(patternId, seat, say().command.outcomeNoted(text)) }
      }
      if (sub === 'ignore') return { text: decideByNumber('keep', args.slice(sub.length).trim()) }
      if (sub === 'apply') {
        if (state.cards.length === 0) return { text: say().command.nothingToDecide }
        const n = numberOf(args.slice(sub.length).trim())
        const patternId = n === null ? undefined : state.cards[n - 1]
        if (n === null) return { text: say().command.usage }
        if (patternId === undefined) return { text: noCardText(n) }
        const reply = cardReply(patternId, n, say().command.outcomeFixed)
        return { text: applyPattern(patternId) ?? reply }
      }
      if (sub === 'report') {
        const now = await host.now()
        const path = reportPath(state.cwd, now)
        await host.writeFile(path, reportOf(state, now))
        return { text: say().command.reportWritten(path) }
      }
      if (sub === 'demo' && isDebug) {
        // Debug-only: the pane's own look, without waiting for a real finding. The header is part of that
        // look, so a usage sample and its turns come first — without them the hero row draws its empty
        // state above cards that state a percentage of context. (`now` is the reducer's to ignore.)
        dispatch({ type: 'usage', usage: demoUsage(), now: 0 })
        // Four turns, each with the context it left behind, so the header's trend and its run to
        // compaction draw from a window filling up rather than from what a turn was billed.
        const samples = demoTurns()
        for (const [at, context] of DEMO_CONTEXT.entries()) {
          const stat = samples[at % samples.length]
          if (stat !== undefined) dispatch({ type: 'turn.complete', stat: { ...stat, context } })
        }
        for (const row of demoRows(state.turn)) dispatch({ type: 'row', row })
        const patterns = demoPatterns(state.turn)
        const fresh = patterns.filter(p => p.decision === null).map(p => p.id)
        const usage = demoForkUsage()
        dispatch({
          type: 'judge.done', patterns, fresh, recurred: [], focus: null, time: null, context: null,
          spent: spentOf(usage), error: null, returned: patterns.length, kept: patterns.length, dropped: [], usage,
        })
        await openPane()
        return { text: say().command.demoLoaded }
      }
      if (sub === 'debug') return { text: debugDump(state, armedSpoke) }
      if (sub === 'stats') return { text: historyFile === null ? say().command.historyUnavailable : statsText(historyNow(), state.muted) }
      if (sub === 'unmute') return { text: await unmuteText(args.slice(sub.length).trim()) }
      if (sub === 'reset') {
        resetSession()
        return { text: say().command.reset }
      }
      return { text: say().command.usage }
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const result = await next(e)
    try {
      resetSession()
    } catch {
      // the command ran either way: it is not ours to run a second time
    }
    return result
  })

  // The languages there are, rather than the ones the manifest happened to list when it was written: a
  // row's options cannot be rewritten here (`ConfigDescribeResult` omits them), but its label and its help
  // can, so a language added to `LANGUAGES` shows up in the menu's help at once — and the row reads in the
  // language already chosen, which is the one place a person checks after changing it.
  on('config.describe', { key: CONFIG_LANG_KEY }, async (_$, e, next) =>
    next({
      ...e,
      label: say().config.languageLabel,
      description: `${e.description ?? ''} ${say().config.languageAvailable(LANGUAGE_TAGS)}`.trim(),
    }),
  )

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    try {
      // A close another plugin refused leaves the pane open, so the band still reads `Close`.
      if (result.deny === undefined) dispatch({ type: 'pane', open: false })
    } catch {
      // the pane stays as the surface left it
    }
    return result
  })
}
