/**
 * The cockpit's state and the pure steps that move it: what the hooks record
 * and what the tabs draw, with no `$` and no engine types in sight, so every
 * rule here is one a test can state in a line.
 */

import {
  AGENTS_MAX,
  FILES_MAX,
  GONE_STATUS,
  HISTORY_MAX,
  LIVE_STATUSES,
  RECENT_MAX,
} from '../names'
import type { Touch } from '../touch'
import { NO_LEDGER } from '../usage'
import type { Ledger, PluginSkills, TurnCost } from '../usage'
import { withCost } from '../usage'

/**
 * One tool's tally over the session.
 */
export type ToolStat = {
  tool: string
  calls: number
  ms: number
  failed: number
}

/**
 * One file Claude touched, how often each way, what it moved in it, and what
 * git makes of it now.
 */
export type FileStat = {
  path: string
  reads: number
  writes: number
  added: number
  removed: number
  status: string | null
  atMs: number
}

/**
 * One finished tool call, as the Tools tab lists it.
 */
export type Call = {
  tool: string
  detail: string
  ms: number
  isErrored: boolean
}

/**
 * One finished turn's mark on the context window, as the sparkline draws it.
 */
export type TurnMark = {
  percent: number
  costUsd: number | null
}

/**
 * What the Session tab reads, refreshed on every finished turn.
 */
export type Vitals = {
  model: string | null
  turns: number | null
  tokens: number | null
  window: number | null
  percent: number | null
  costUsd: number | null
  categories: readonly { name: string; tokens: number; color: string }[]

  /**
   * The account's rate-limit windows as the last API response reported them:
   * how much of each is spent, and when it resets on the engine's clock.
   *
   * Empty off a subscription, and empty until one response has carried them.
   */
  limits: readonly { kind: string; percent: number; resetsMs: number | null }[]

  /**
   * What each plugin's skill listing costs the system prompt every turn, as
   * the breakdown estimates it locally; empty where the session lists none.
   */
  plugins: readonly PluginSkills[]
}

/**
 * One agent of this session, as the Agents tab lists it: the engine's own
 * row, and the times the cockpit keeps around it.
 */
export type AgentRow = {
  id: string
  type: string
  name: string | null
  status: string
  description: string
  parentId: string | null

  /**
   * When the cockpit first knew of it, on the engine's clock.
   */
  startedMs: number

  /**
   * When it stopped working, or null while it still is.
   */
  endedMs: number | null

  /**
   * How deep under its parent it sits, 0 for one the main loop spawned.
   */
  depth: number
}

/**
 * What one pass of `$.agent.list()` says about one agent: its row, without
 * the times and the depth the cockpit works out for itself.
 */
export type AgentSeen = {
  id: string
  type: string
  name: string | null
  status: string
  description: string
  parentId: string | null
}

/**
 * Everything the pane draws from.
 */
export type State = {
  tools: readonly ToolStat[]
  files: readonly FileStat[]
  recent: readonly Call[]
  history: readonly TurnMark[]
  vitals: Vitals

  /**
   * What the session has spent, folded turn by turn off what the engine
   * reports at the end of each: the Usage tab's whole body but the limits.
   */
  ledger: Ledger

  agents: readonly AgentRow[]
  /**
   * The files armed for the next prompt, in the order they were armed: a
   * question is often about two files rather than one, and the note that
   * rides the prompt names all of them.
   */
  armed: readonly string[]

  /**
   * The files that rode the last prompt, kept until others are armed: what
   * the model was handed beside the prompt is never shown to the person, so
   * the rows they went from are where the cockpit owes them the news.
   */
  sent: readonly string[]

  /**
   * The engine's clock as the last poll read it: what a duration on screen is
   * measured against, so no tab has to read a clock while it draws.
   */
  nowMs: number
}

/**
 * A session that has done nothing yet.
 */
export const EMPTY: State = {
  tools: [],
  files: [],
  recent: [],
  history: [],
  vitals: {
    model: null,
    turns: null,
    tokens: null,
    window: null,
    percent: null,
    costUsd: null,
    categories: [],
    limits: [],
    plugins: [],
  },
  ledger: NO_LEDGER,
  agents: [],
  armed: [],
  sent: [],
  nowMs: 0,
}

/**
 * The state with one finished tool call counted: its tally, its place in the
 * recent list, and every file it touched.
 *
 * @param state the state before the call
 * @param call the call as it finished
 * @param touches the files it touched, empty where it touched none
 * @param atMs when it finished, on the engine's clock
 * @returns the state after it
 */
export function withCall(
  state: State,
  call: Call,
  touches: readonly Touch[],
  atMs: number,
): State {
  const tools = withTally(state.tools, call)
  const recent = [call, ...state.recent].slice(0, RECENT_MAX)

  const files = touches.reduce(
    (list, touch) => withFile(list, touch, atMs),
    state.files,
  )

  return { ...state, tools, recent, files }
}

/**
 * The tallies with one call counted, the touched tool's row rewritten and the
 * rest left as they are; the list stays sorted by time spent, heaviest first.
 *
 * @param tools the tallies before the call
 * @param call the call as it finished
 * @returns the tallies after it
 */
export function withTally(
  tools: readonly ToolStat[],
  call: Call,
): readonly ToolStat[] {
  const seen = tools.find(tool => tool.tool === call.tool)

  const row: ToolStat = {
    tool: call.tool,
    calls: (seen?.calls ?? 0) + 1,
    ms: (seen?.ms ?? 0) + call.ms,
    failed: (seen?.failed ?? 0) + (call.isErrored ? 1 : 0),
  }

  return [...tools.filter(tool => tool.tool !== call.tool), row].sort(
    (a, b) => b.ms - a.ms || b.calls - a.calls,
  )
}

/**
 * The files with one touch counted, sorted by how often Claude came back to
 * them, writes weighing double; the list is cut to FILES_MAX at its tail.
 *
 * The lines a touch moved add to what the file already moved this session, so
 * a file edited four times reads as the whole of what those four edits did.
 * What git says of the file is kept, since a touch is not news about it.
 *
 * @param files the files before the touch
 * @param touch the file, how it was touched, and what it moved
 * @param atMs when, on the engine's clock
 * @returns the files after it
 */
export function withFile(
  files: readonly FileStat[],
  touch: Touch,
  atMs: number,
): readonly FileStat[] {
  const seen = files.find(file => file.path === touch.path)

  const row: FileStat = {
    path: touch.path,
    reads: (seen?.reads ?? 0) + (touch.kind === 'read' ? 1 : 0),
    writes: (seen?.writes ?? 0) + (touch.kind === 'write' ? 1 : 0),
    added: (seen?.added ?? 0) + touch.added,
    removed: (seen?.removed ?? 0) + touch.removed,
    status: seen?.status ?? null,
    atMs,
  }

  return [...files.filter(file => file.path !== touch.path), row]
    .sort((a, b) => heatOf(b) - heatOf(a) || b.atMs - a.atMs)
    .slice(0, FILES_MAX)
}

/**
 * How hot a file is: every touch counts, a write counting double, since a
 * file Claude keeps rewriting is the one worth looking at.
 *
 * @param file the file's row
 * @returns its weight in the list
 */
export const heatOf = (file: FileStat): number => file.reads + file.writes * 2

/**
 * The files with git's reading of them written on, every file git did not
 * name left with none: a file the tab lists and git is silent about is one
 * that matches HEAD, and that is worth saying as plainly as a change is.
 *
 * @param files the files as they stand
 * @param statuses what git said, by the same absolute path
 * @returns the files with their status letters
 */
export const withStatuses = (
  files: readonly FileStat[],
  statuses: ReadonlyMap<string, string>,
): readonly FileStat[] =>
  files.map(file => ({
    ...file,
    status: statuses.get(file.path.toLowerCase()) ?? null,
  }))

/**
 * The state with one finished turn marked on the sparkline, the oldest mark
 * dropped once the history is full.
 *
 * A turn whose context the engine did not report leaves no mark: an absent
 * reading is not a zero, and a flat line where the session was busy would
 * say something untrue.
 *
 * @param state the state before the turn
 * @param vitals what the session reads after it
 * @returns the state after it
 */
export function withTurn(state: State, vitals: Vitals): State {
  const history =
    vitals.percent === null
      ? state.history
      : [
          ...state.history,
          { percent: vitals.percent, costUsd: vitals.costUsd },
        ].slice(-HISTORY_MAX)

  return { ...state, vitals, history }
}

/**
 * The state with one turn's tokens on the ledger, whichever loop ran it.
 *
 * A turn the engine reported no usage for leaves the ledger alone: it was
 * interrupted before a response or died on an API error, and four zeroes on
 * the ledger would say it answered for nothing.
 *
 * @param state the state before the turn
 * @param cost the turn's tokens, or null where the engine reported none
 * @returns the state after it
 */
export const withCostOf = (state: State, cost: TurnCost | null): State =>
  cost === null ? state : { ...state, ledger: withCost(state.ledger, cost) }

/**
 * The state with one pass over the engine's agents folded into the roster.
 *
 * The engine lists the agents it still holds; the cockpit lists the agents
 * this session had. An agent seen for the first time starts its clock now, an
 * agent whose status has left the working ones stops its clock now, and an
 * agent the engine has let go stays on the tab with the status it ended on,
 * because "what ran here" is the question the tab answers and a row that
 * vanishes on completion answers it for two seconds.
 *
 * @param state the state before the pass
 * @param seen the agents as the engine lists them now
 * @param nowMs the engine's clock at the pass
 * @param startedMs when the cockpit saw each spawn, for the ones it caught
 * @returns the state after it
 */
export function withAgents(
  state: State,
  seen: readonly AgentSeen[],
  nowMs: number,
  startedMs: ReadonlyMap<string, number> = new Map(),
): State {
  const live = new Map(seen.map(one => [one.id, one]))

  const kept = state.agents.map(row => {
    const now = live.get(row.id)

    if (!now) {
      return row.endedMs === null
        ? {
            ...row,
            status: isLive(row.status) ? GONE_STATUS : row.status,
            endedMs: nowMs,
          }
        : row
    }

    return {
      ...row,
      type: now.type,
      name: now.name,
      status: now.status,
      description: now.description,
      parentId: now.parentId,
      endedMs: isLive(now.status) ? null : (row.endedMs ?? nowMs),
    }
  })

  const known = new Set(kept.map(row => row.id))

  const fresh = seen
    .filter(one => !known.has(one.id))
    .map(one => ({
      ...one,
      startedMs: startedMs.get(one.id) ?? nowMs,
      endedMs: isLive(one.status) ? null : nowMs,
      depth: 0,
    }))

  return {
    ...state,
    nowMs,
    agents: orderAgents([...kept, ...fresh].slice(-AGENTS_MAX)),
  }
}

/**
 * Whether an agent under that status is still working.
 *
 * @param status the status the engine reports
 * @returns whether it is running
 */
export const isLive = (status: string): boolean =>
  LIVE_STATUSES.includes(status)

/**
 * The roster as the tab reads it: every agent under the one that spawned it,
 * roots oldest first, each one's depth written on it.
 *
 * An agent whose parent is not in the roster is a root, so a child that
 * outlived the list its parent fell off is still drawn.
 *
 * @param rows the roster, in any order
 * @returns the roster in reading order
 */
export function orderAgents(rows: readonly AgentRow[]): readonly AgentRow[] {
  const ids = new Set(rows.map(row => row.id))
  const byParent = new Map<string | null, AgentRow[]>()

  for (const row of [...rows].sort((a, b) => a.startedMs - b.startedMs)) {
    const parent =
      row.parentId !== null && ids.has(row.parentId) ? row.parentId : null

    byParent.set(parent, [...(byParent.get(parent) ?? []), row])
  }

  const ordered: AgentRow[] = []

  const walk = (parent: string | null, depth: number): void => {
    for (const row of byParent.get(parent) ?? []) {
      if (ordered.some(one => one.id === row.id)) {
        continue
      }

      ordered.push({ ...row, depth })
      walk(row.id, depth + 1)
    }
  }

  walk(null, 0)

  return ordered
}

/**
 * How long an agent has been at it, or was: the reading a row draws.
 *
 * @param row the agent's row
 * @param nowMs the clock the state last read
 * @returns the duration in milliseconds, or null where it cannot be told
 */
export const elapsedOf = (row: AgentRow, nowMs: number): number | null => {
  const end = row.endedMs ?? nowMs

  return end < row.startedMs ? null : end - row.startedMs
}

/**
 * The state with one more file armed for the next prompt, or with that file
 * disarmed where it was already armed: the same button arms and disarms, and
 * arming a second file does not disarm the first.
 *
 * @param state the state before the press
 * @param path the file the pressed row names
 * @returns the state after it
 */
export const withArmed = (state: State, path: string): State => ({
  ...state,
  armed: state.armed.includes(path)
    ? state.armed.filter(one => one !== path)
    : [...state.armed, path],
})

/**
 * The state with the armed file gone with the prompt: nothing is armed any
 * more, and the row it went from says so until another one is armed.
 *
 * The note itself is a context block, which the person never sees; a row that
 * went back to `ask` the moment the prompt left would be the cockpit doing
 * something on their behalf and saying nothing about it.
 *
 * @param state the state as the prompt was submitted
 * @returns the state after it, unchanged where nothing was armed
 */
export const withSent = (state: State): State =>
  state.armed.length === 0
    ? state
    : { ...state, armed: [], sent: state.armed }

/**
 * The note the armed files ride the next prompt as, the one block the model
 * reads beside what the person typed.
 *
 * One block for all of them rather than one each: they were armed together
 * and they are one fact about the question, and a block per file would cost
 * the same sentence over again.
 *
 * @param paths the armed files, in the order they were armed
 * @returns the note, empty where nothing is armed
 */
export const askOf = (paths: readonly string[]): string => {
  if (paths.length === 0) {
    return ''
  }

  return paths.length === 1
    ? `The person opened ${paths[0]} in the cockpit's Files tab before sending this. Read it before answering where it bears on the question.`
    : `The person opened these files in the cockpit's Files tab before sending this: ${paths.join(', ')}. Read them before answering where they bear on the question.`
}
