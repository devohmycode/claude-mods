/**
 * The usage counters: how often each provider's tools, each tool, each agent
 * type and each skill were called, across every session this machine runs —
 * and, per project, which agent types it ever dispatched.
 *
 * This is the half of the rent nobody has. A server's 61 schemas cost what
 * the breakdown says at every request; whether that is worth it depends on
 * how often it is called, and "twice in thirty sessions" is a reading, not an
 * opinion. The counters live on disk, in one file, because they outlive the
 * store's rotation of sessions.
 *
 * Two sessions can run at once and write the same file. So a session never
 * writes its view of the file: it keeps what it counted since its last write
 * (`Pending`), reads the file again, adds its share, and writes the sum. A
 * session is counted once per counter by the ids a counter remembers, not by
 * which session wrote last.
 *
 * Beside the counts, three readings the levers of the next session decide
 * from: the weight of each provider's schemas as the last report measured
 * them, the prefix the last request re-read, and the providers a deferral
 * cost more than it saved. Each is replaced, never added to.
 *
 * Calls, counted — never tokens, and never added to anything that is.
 *
 * Pure.
 */

import { JOURNAL_DIR, USAGE_FILE, USAGE_SEEN, USAGE_VERSION } from '../names'

/**
 * One counter: calls, the sessions that made at least one, and the last few
 * of those sessions' ids.
 */
export type Tally = {
  calls: number
  sessions: number
  seen: readonly string[]
}

/**
 * One project's counter, by its working directory: the sessions run there,
 * and the calls each agent type got there.
 */
export type ProjectTally = {
  sessions: number
  seen: readonly string[]
  agents: Readonly<Record<string, number>>
}

/**
 * The file's content.
 */
export type Usage = {
  version: number
  /**
   * Sessions that finished a turn with the mod loaded, and the main loop's
   * steps across them: the average a session runs to, which the break-even
   * of deferring reads.
   */
  sessions: number
  steps: number
  seen: readonly string[]
  providers: Readonly<Record<string, Tally>>
  tools: Readonly<Record<string, Tally>>
  agents: Readonly<Record<string, Tally>>
  skills: Readonly<Record<string, Tally>>
  projects: Readonly<Record<string, ProjectTally>>
  /**
   * Each provider's schemas, estimated tokens, as the last report counted
   * them; a provider no report weighed is absent.
   */
  weights: Readonly<Record<string, number>>
  /**
   * The prefix the last main request re-read, tokens (the engine's own).
   */
  prefix: number
  /**
   * The providers whose deferral cost more than it saved in the session that
   * wrote last: in front again for the next one.
   */
  broughtBack: readonly string[]
}

export const NO_USAGE: Usage = {
  version: USAGE_VERSION,
  sessions: 0,
  steps: 0,
  seen: [],
  providers: {},
  tools: {},
  agents: {},
  skills: {},
  projects: {},
  weights: {},
  prefix: 0,
  broughtBack: [],
}

/**
 * What a session counted since it last wrote the file, and the readings it
 * has to hand on. A reading left `null` leaves the file's as it is.
 */
export type Pending = {
  steps: number
  providers: Readonly<Record<string, number>>
  tools: Readonly<Record<string, number>>
  agents: Readonly<Record<string, number>>
  skills: Readonly<Record<string, number>>
  /**
   * The project the session runs in, and the agent types dispatched there.
   */
  project: string | null
  projectAgents: Readonly<Record<string, number>>
  weights: Readonly<Record<string, number>> | null
  prefix: number | null
  broughtBack: readonly string[] | null
}

export const NO_PENDING: Pending = {
  steps: 0,
  providers: {},
  tools: {},
  agents: {},
  skills: {},
  project: null,
  projectAgents: {},
  weights: null,
  prefix: null,
  broughtBack: null,
}

/**
 * What one call counts toward: its tool and the tool's provider always, the
 * agent type an `Agent` call starts, the skill a `Skill` call loads.
 */
export type CallCount = {
  tool: string
  provider: string
  agent: string | null
  skill: string | null
}

/**
 * What a call counts toward, read off its input.
 *
 * @param tool the tool called
 * @param input the call's input, the tool's arguments beside `tool`
 * @param provider who provides the tool
 * @returns the counters it moves
 */
export function callCountOf(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  provider: string,
): CallCount {
  const agent =
    tool === 'Agent'
      ? typeof input.subagent_type === 'string' && input.subagent_type !== ''
        ? input.subagent_type
        : 'general-purpose'
      : null
  const skill = tool === 'Skill' && typeof input.skill === 'string' ? input.skill : null

  return { tool, provider, agent, skill }
}

const plus = (counts: Readonly<Record<string, number>>, key: string | null) =>
  key === null ? counts : { ...counts, [key]: (counts[key] ?? 0) + 1 }

/**
 * The pending counts with one call more.
 *
 * @param pending what was counted since the last write
 * @param call what the call counts toward
 * @returns the counts
 */
export function withCall(pending: Pending, call: CallCount): Pending {
  return {
    ...pending,
    providers: plus(pending.providers, call.provider),
    tools: plus(pending.tools, call.tool),
    agents: plus(pending.agents, call.agent),
    skills: plus(pending.skills, call.skill),
    projectAgents: plus(pending.projectAgents, call.agent),
  }
}

/**
 * The pending counts with one main-loop step more.
 *
 * @param pending what was counted since the last write
 * @returns the counts
 */
export const withStepCounted = (pending: Pending): Pending => ({ ...pending, steps: pending.steps + 1 })

/**
 * A count with another taken from it, the keys that reach zero dropped.
 */
function less(
  from: Readonly<Record<string, number>>,
  taken: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {}

  for (const [key, count] of Object.entries(from)) {
    const rest = count - (taken[key] ?? 0)

    if (rest > 0) {
      out[key] = rest
    }
  }

  return out
}

/**
 * What stays pending once a write took `counted`: whatever was counted while
 * the write was in flight. A reading is dropped only when it is the one the
 * write carried.
 *
 * @param pending what is pending now
 * @param counted what the write carried
 * @returns the rest
 */
export function restOf(pending: Pending, counted: Pending): Pending {
  return {
    steps: pending.steps - counted.steps,
    providers: less(pending.providers, counted.providers),
    tools: less(pending.tools, counted.tools),
    agents: less(pending.agents, counted.agents),
    skills: less(pending.skills, counted.skills),
    project: pending.project,
    projectAgents: less(pending.projectAgents, counted.projectAgents),
    weights: pending.weights === counted.weights ? null : pending.weights,
    prefix: pending.prefix === counted.prefix ? null : pending.prefix,
    broughtBack: pending.broughtBack === counted.broughtBack ? null : pending.broughtBack,
  }
}

/**
 * A session id remembered, the oldest dropped past the limit.
 */
const remembered = (seen: readonly string[], id: string): readonly string[] =>
  seen.includes(id) ? seen : [...seen, id].slice(-USAGE_SEEN)

/**
 * The counters with a session's share added.
 */
function tallied(
  tallies: Readonly<Record<string, Tally>>,
  counts: Readonly<Record<string, number>>,
  sessionId: string,
): Record<string, Tally> {
  const out: Record<string, Tally> = { ...tallies }

  for (const [key, calls] of Object.entries(counts)) {
    const was = out[key] ?? { calls: 0, sessions: 0, seen: [] }
    const isNew = !was.seen.includes(sessionId)

    out[key] = {
      calls: was.calls + calls,
      sessions: was.sessions + (isNew ? 1 : 0),
      seen: remembered(was.seen, sessionId),
    }
  }

  return out
}

/**
 * The projects with a session's share added to its own.
 */
function projectsTallied(
  projects: Readonly<Record<string, ProjectTally>>,
  pending: Pending,
  sessionId: string,
): Record<string, ProjectTally> {
  if (pending.project === null) {
    return { ...projects }
  }

  const was = projects[pending.project] ?? { sessions: 0, seen: [], agents: {} }
  const agents: Record<string, number> = { ...was.agents }

  for (const [agent, calls] of Object.entries(pending.projectAgents)) {
    agents[agent] = (agents[agent] ?? 0) + calls
  }

  return {
    ...projects,
    [pending.project]: {
      sessions: was.sessions + (was.seen.includes(sessionId) ? 0 : 1),
      seen: remembered(was.seen, sessionId),
      agents,
    },
  }
}

/**
 * The file as it should be written: what is on disk now, plus what this
 * session counted since its last write, the session itself counted once.
 *
 * @param disk the file as just read (`NO_USAGE` when there is none)
 * @param pending what this session counted since its last write
 * @param sessionId the session
 * @returns the content to write
 */
export function mergedOf(disk: Usage, pending: Pending, sessionId: string): Usage {
  const isNew = !disk.seen.includes(sessionId)

  return {
    version: USAGE_VERSION,
    sessions: disk.sessions + (isNew ? 1 : 0),
    steps: disk.steps + pending.steps,
    seen: remembered(disk.seen, sessionId),
    providers: tallied(disk.providers, pending.providers, sessionId),
    tools: tallied(disk.tools, pending.tools, sessionId),
    agents: tallied(disk.agents, pending.agents, sessionId),
    skills: tallied(disk.skills, pending.skills, sessionId),
    projects: projectsTallied(disk.projects, pending, sessionId),
    weights: pending.weights === null ? disk.weights : { ...disk.weights, ...pending.weights },
    prefix: pending.prefix ?? disk.prefix,
    broughtBack: pending.broughtBack ?? disk.broughtBack,
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const idsFrom = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

/**
 * Numbers by name, read back, dropping what is not a number.
 */
function numbersFrom(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}

  if (isObject(value)) {
    for (const [key, one] of Object.entries(value)) {
      if (typeof one === 'number' && Number.isFinite(one)) {
        out[key] = one
      }
    }
  }

  return out
}

/**
 * The counters of one kind, read back, dropping what is not a counter.
 */
function talliesFrom(value: unknown): Record<string, Tally> {
  const out: Record<string, Tally> = {}

  if (!isObject(value)) {
    return out
  }

  for (const [key, one] of Object.entries(value)) {
    const t = one as Partial<Tally> | null

    if (t !== null && typeof t?.calls === 'number' && typeof t.sessions === 'number') {
      out[key] = { calls: t.calls, sessions: t.sessions, seen: idsFrom(t.seen) }
    }
  }

  return out
}

/**
 * The projects, read back.
 */
function projectsFrom(value: unknown): Record<string, ProjectTally> {
  const out: Record<string, ProjectTally> = {}

  if (!isObject(value)) {
    return out
  }

  for (const [key, one] of Object.entries(value)) {
    const p = one as Partial<ProjectTally> | null

    if (p !== null && typeof p?.sessions === 'number') {
      out[key] = { sessions: p.sessions, seen: idsFrom(p.seen), agents: numbersFrom(p.agents) }
    }
  }

  return out
}

/**
 * The file read back. A file of another version, or not JSON at all, reads as
 * no counters: the next write starts it again rather than adding to a shape
 * the mod does not know. A field this version added and an older file lacks
 * reads as empty.
 *
 * @param text the file's text, or `null` when there is no file
 * @returns the counters
 */
export function usageFrom(text: string | null): Usage {
  if (text === null || text.trim() === '') {
    return NO_USAGE
  }

  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return NO_USAGE
  }

  if (!isObject(value) || value.version !== USAGE_VERSION) {
    return NO_USAGE
  }

  return {
    version: USAGE_VERSION,
    sessions: typeof value.sessions === 'number' ? value.sessions : 0,
    steps: typeof value.steps === 'number' ? value.steps : 0,
    seen: idsFrom(value.seen),
    providers: talliesFrom(value.providers),
    tools: talliesFrom(value.tools),
    agents: talliesFrom(value.agents),
    skills: talliesFrom(value.skills),
    projects: projectsFrom(value.projects),
    weights: numbersFrom(value.weights),
    prefix: typeof value.prefix === 'number' ? value.prefix : 0,
    broughtBack: idsFrom(value.broughtBack),
  }
}

/**
 * The file's text.
 *
 * @param usage the counters
 * @returns indented JSON, so a person can read the file
 */
export const usageText = (usage: Usage): string => `${JSON.stringify(usage, null, 2)}\n`

/**
 * Whether a session has anything to write.
 *
 * @param pending what it counted since its last write
 * @returns true when every count is zero and no reading waits
 */
export const isEmpty = (pending: Pending): boolean =>
  pending.steps === 0 &&
  Object.keys(pending.providers).length === 0 &&
  Object.keys(pending.tools).length === 0 &&
  Object.keys(pending.agents).length === 0 &&
  Object.keys(pending.skills).length === 0 &&
  Object.keys(pending.projectAgents).length === 0 &&
  pending.weights === null &&
  pending.prefix === null &&
  pending.broughtBack === null

/**
 * Where the counters live: beside the journals, one file for the machine.
 *
 * @param home the home directory
 * @returns `<home>/.claude/clauget/usage.json`, forward slashes
 */
export function usagePathOf(home: string): string {
  return `${home.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/${JOURNAL_DIR}/${USAGE_FILE}`
}

/**
 * A working directory as the key its project is counted under: forward
 * slashes, no trailing one, case folded — the machine this runs on ignores
 * case in paths.
 *
 * @param cwd the directory
 * @returns the key
 */
export const projectKeyOf = (cwd: string): string =>
  cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
