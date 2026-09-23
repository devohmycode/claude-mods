/**
 * The levers on the prefix, and the one rule they all keep: decided once, at
 * the session's start, from what the disk remembers of the sessions before —
 * and never moved after.
 *
 * A byte of the prefix is paid at every request, so the prefix is where the
 * savings are. It is also where a mistake costs most: the answers of
 * `tool.describe`, `command.describe` and `prompt.context` are cached, and an
 * answer that varied would rewrite the cache at every request it changed.
 * So the policy is a snapshot. Every decision below is a pure function of
 * that snapshot and of the name asked about, which makes the same question
 * get the same answer for the whole session — a tool used heavily this very
 * session stays deferred until the next one, and that is the point.
 *
 * What the levers do, each only when the manifest's row turns them on:
 *
 * - defer a provider's tools the history says are not worth their schemas
 *   (T20), bring back one whose deferral cost more than it saved (T21), and
 *   put in front a tool the engine defers but that serves every session (T22);
 * - withdraw from the model's listing an agent type this project never
 *   dispatched (T23), and hide the commands the person listed (T24);
 * - leave out the instruction files outside the working directory (T25).
 *
 * A judgement of disuse needs history: under `POLICY_MIN_SESSIONS`, nothing
 * is deferred or withdrawn for want of use.
 *
 * Pure.
 */

import type { PromptContextBlock } from 'claude-code'

import { breakEvenOf } from '../bill'
import { bytesOf } from '../format'
import {
  BLOCK_MAX_BYTES,
  DEFER_P_FALLBACK,
  ENGINE,
  FRONT_P,
  PLUGIN_NAME,
  POLICY_MIN_SESSIONS,
  READ_RATE,
  RECENT_SESSIONS,
  TEXTS,
  UNDESCRIBED,
} from '../names'
import type { Tally, Usage } from '../usage'
import { projectKeyOf } from '../usage'

/**
 * A list the person keeps by hand, from one manifest row: names to withdraw,
 * and names written `!name` to keep whatever the history says.
 */
export type ManualList = {
  hide: readonly string[]
  keep: readonly string[]
}

export const NO_LIST: ManualList = { hide: [], keep: [] }

/**
 * A manifest row read as a list.
 *
 * @param row `Explore, !Plan, my-agent` — commas or spaces between names
 * @returns the names to withdraw and the names to keep
 */
export function manualListOf(row: unknown): ManualList {
  const names = String(row ?? '')
    .split(/[\s,]+/)
    .map(name => name.trim())
    .filter(name => name !== '' && name !== '!')

  return {
    hide: names.filter(name => !name.startsWith('!')),
    keep: names.filter(name => name.startsWith('!')).map(name => name.slice(1)),
  }
}

/**
 * The session's policy: whether the levers are on, and the snapshot every
 * decision reads.
 */
export type Policy = {
  isOn: boolean
  /**
   * Whether the cuts on what enters are on for this session: read once at
   * its start like the levers, so a module rebuilt mid-session keeps them.
   */
  cuts: boolean
  /**
   * Whether the levers on the steps are on, and the circuit breaker armed:
   * read once at the start like the rest.
   */
  stepLevers: boolean
  breaker: boolean
  /**
   * The levers on the compaction: off, on, or auto — which also compacts
   * once a turn ends past the profitable point.
   */
  compaction: 'off' | 'on' | 'auto'
  /**
   * Whether nobody watches the session (T60): a `-p` run, the SDK, a
   * scheduled task. The strictest and the quietest profile.
   */
  headless: boolean
  /**
   * The subagent types the smaller-model rule applies to.
   */
  smallModelAgents: readonly string[]
  sessionId: string
  /**
   * The counters as they stood at the session's start.
   */
  sessions: number
  recent: readonly string[]
  steps: number
  prefix: number
  providers: Readonly<Record<string, Tally>>
  tools: Readonly<Record<string, Tally>>
  weights: Readonly<Record<string, number>>
  broughtBack: readonly string[]
  /**
   * This project's sessions, and the agent types it dispatched.
   */
  projectSessions: number
  projectAgents: Readonly<Record<string, number>>
  /**
   * The working directory, as the scope of the instruction files; `null`
   * when the levers are off or it is unknown.
   */
  root: string | null
  agents: ManualList
  commands: ManualList
}

/**
 * A policy that decides nothing.
 */
export const NO_POLICY: Policy = {
  isOn: false,
  cuts: false,
  stepLevers: false,
  breaker: false,
  compaction: 'off',
  headless: false,
  smallModelAgents: [],
  sessionId: '',
  sessions: 0,
  recent: [],
  steps: 0,
  prefix: 0,
  providers: {},
  tools: {},
  weights: {},
  broughtBack: [],
  projectSessions: 0,
  projectAgents: {},
  root: null,
  agents: NO_LIST,
  commands: NO_LIST,
}

/**
 * What the policy is decided from.
 */
export type PolicyInput = {
  isOn: boolean
  isCuts?: boolean
  isSteps?: boolean
  isBreaker?: boolean
  compaction?: string
  isHeadless?: boolean
  smallModelAgents?: readonly string[]
  sessionId: string
  usage: Usage
  cwd: string | null
  agents: ManualList
  commands: ManualList
}

/**
 * The session's policy: the snapshot, taken once.
 *
 * @param input the switch, the session, the counters, where it runs and the
 *   hand-kept lists
 * @returns the policy; with the levers off, one that decides nothing
 */
export function policyOf(input: PolicyInput): Policy {
  const switches = {
    cuts: input.isCuts === true,
    stepLevers: input.isSteps === true,
    breaker: input.isBreaker === true,
    compaction: (input.compaction === 'on' || input.compaction === 'auto' ? input.compaction : 'off') as Policy['compaction'],
    smallModelAgents: input.smallModelAgents ?? [],
    headless: input.isHeadless === true,
  }

  if (!input.isOn) {
    return { ...NO_POLICY, ...switches, sessionId: input.sessionId }
  }

  const { usage } = input
  const project = input.cwd === null ? undefined : usage.projects[projectKeyOf(input.cwd)]

  return {
    isOn: true,
    ...switches,
    sessionId: input.sessionId,
    sessions: usage.sessions,
    recent: usage.seen.slice(-RECENT_SESSIONS),
    steps: usage.steps,
    prefix: usage.prefix,
    providers: usage.providers,
    tools: usage.tools,
    weights: usage.weights,
    broughtBack: usage.broughtBack,
    projectSessions: project?.sessions ?? 0,
    projectAgents: project?.agents ?? {},
    root: input.cwd === null ? null : projectKeyOf(input.cwd),
    agents: input.agents,
    commands: input.commands,
  }
}

/**
 * Why a provider's tools stay where the engine put them, or go behind
 * ToolSearch.
 */
export type DeferVerdict = {
  isDeferred: boolean
  why: 'off' | 'not deferrable' | 'brought back' | 'history' | 'recent' | 'break-even' | 'rarely used'
}

/**
 * Whether the policy defers a provider's tools (T20, T21).
 *
 * The engine's own tools, this mod's and a provider never described are
 * never deferred. A provider brought back after a losing deferral, one used
 * in the last few sessions, and any provider while the history is short stay
 * where they are. Otherwise the break-even decides where a report weighed
 * the provider's schemas, and a low share of sessions where none did.
 *
 * @param policy the session's policy
 * @param provider the provider, as `tool.describe` named it
 * @returns the verdict and its reason
 */
export function deferVerdictOf(policy: Policy, provider: string): DeferVerdict {
  if (!policy.isOn) {
    return { isDeferred: false, why: 'off' }
  }

  if (provider === ENGINE || provider === PLUGIN_NAME || provider === UNDESCRIBED) {
    return { isDeferred: false, why: 'not deferrable' }
  }

  if (policy.broughtBack.includes(provider)) {
    return { isDeferred: false, why: 'brought back' }
  }

  if (policy.sessions < POLICY_MIN_SESSIONS) {
    return { isDeferred: false, why: 'history' }
  }

  const tally = policy.providers[provider]

  if (tally !== undefined && tally.seen.some(id => policy.recent.includes(id))) {
    return { isDeferred: false, why: 'recent' }
  }

  const pUsed = tally === undefined ? 0 : Math.min(1, tally.sessions / policy.sessions)
  const weight = policy.weights[provider]

  if (weight === undefined) {
    return { isDeferred: pUsed < DEFER_P_FALLBACK, why: 'rarely used' }
  }

  const even = breakEvenOf({
    schemaTokens: weight,
    stepsPerSession: policy.steps / policy.sessions,
    pUsed,
    prefixTokens: policy.prefix,
    searchTokens: weight,
    readRate: READ_RATE,
  })

  return { isDeferred: even.verdict === 'defer', why: 'break-even' }
}

/**
 * Whether the policy puts a tool in front whatever the default (T22): one
 * that served most sessions, which a search before every use would cost a
 * request each time.
 *
 * @param policy the session's policy
 * @param tool the tool's name
 * @returns true to keep it in the prompt's list
 */
export function isFronted(policy: Policy, tool: string): boolean {
  if (!policy.isOn || policy.sessions < POLICY_MIN_SESSIONS) {
    return false
  }

  const tally = policy.tools[tool]

  return tally !== undefined && tally.sessions / policy.sessions >= FRONT_P
}

/**
 * What `tool.describe` answers under the policy.
 *
 * @param policy the session's policy
 * @param tool the tool's name
 * @param provider who provides it
 * @param described what the chain beneath answered
 * @returns the answer, and whether the mod moved it behind ToolSearch
 */
export function describedUnder<D extends { description: string; isDeferred?: boolean }>(
  policy: Policy,
  tool: string,
  provider: string,
  described: D,
): { answer: D; isModDeferred: boolean } {
  if (isFronted(policy, tool)) {
    return {
      answer: described.isDeferred === true ? { ...described, isDeferred: false } : described,
      isModDeferred: false,
    }
  }

  if (described.isDeferred !== true && deferVerdictOf(policy, provider).isDeferred) {
    return { answer: { ...described, isDeferred: true }, isModDeferred: true }
  }

  return { answer: described, isModDeferred: false }
}

/**
 * Whether the model is offered an agent type (T23).
 *
 * The person's list wins. A built-in type is never withdrawn by the history,
 * and neither is any type while the project has run fewer sessions than a
 * judgement needs; after that, a type this project never dispatched is.
 *
 * @param policy the session's policy
 * @param agent the type
 * @param source where its definition came from
 * @returns false to withdraw it from the listing and from dispatch
 */
export function isAgentOffered(policy: Policy, agent: string, source: string): boolean {
  if (!policy.isOn || policy.agents.keep.includes(agent)) {
    return true
  }

  if (policy.agents.hide.includes(agent)) {
    return false
  }

  if (source === 'built-in' || policy.projectSessions < POLICY_MIN_SESSIONS) {
    return true
  }

  return (policy.projectAgents[agent] ?? 0) > 0
}

/**
 * Whether a command is hidden (T24): the person's list alone. A command the
 * person may type is theirs to hide.
 *
 * @param policy the session's policy
 * @param command the command's name
 * @returns true to hide it
 */
export function isCommandHidden(policy: Policy, command: string): boolean {
  return policy.isOn && !policy.commands.keep.includes(command) && policy.commands.hide.includes(command)
}

/**
 * One instruction file as the scope sees it.
 */
export type ScopedFile = {
  path: string
  kind: string
  parent?: string
}

/**
 * Whether a directory is the root or one of its ancestors.
 */
const isAncestorOf = (dir: string, root: string): boolean => root === dir || root.startsWith(`${dir}/`)

/**
 * The instruction files the scope keeps (T25): every file but a project's or
 * a local one whose folder is outside the working directory's ancestry. The
 * person's own, the managed ones, memory and whatever an `@` import brought
 * stay: someone chose them.
 *
 * @param policy the session's policy
 * @param files the files as `prompt.context` handed them
 * @returns the kept files, in order, and the ones left out
 */
export function scopedOf<F extends ScopedFile>(
  policy: Policy,
  files: readonly F[],
): { kept: F[]; dropped: F[] } {
  if (!policy.isOn || policy.root === null) {
    return { kept: [...files], dropped: [] }
  }

  const root = policy.root
  const kept: F[] = []
  const dropped: F[] = []

  for (const file of files) {
    const dir = projectKeyOf(file.path).replace(/\/[^/]*$/, '')
    const isScoped = (file.kind === 'project' || file.kind === 'local') && file.parent === undefined

    if (isScoped && !isAncestorOf(dir, root)) {
      dropped.push(file)
    } else {
      kept.push(file)
    }
  }

  return { kept, dropped }
}

/**
 * The providers the policy defers among those the snapshot knows, for the
 * block and the report.
 *
 * @param policy the session's policy
 * @returns the providers, sorted
 */
export function deferredKnownOf(policy: Policy): string[] {
  const known = new Set([...Object.keys(policy.providers), ...Object.keys(policy.weights)])

  return [...known].filter(provider => deferVerdictOf(policy, provider).isDeferred).sort()
}

/**
 * The tools the policy puts in front, for the block and the report.
 *
 * @param policy the session's policy
 * @returns the tools, sorted
 */
export function frontedKnownOf(policy: Policy): string[] {
  return Object.keys(policy.tools).filter(tool => isFronted(policy, tool)).sort()
}

/**
 * The mod's own context block (T27): what the policy decided, in a few
 * lines, so a session compacted or cleared finds it again — the engine
 * recomposes the context blocks then, so losing the summary costs nothing.
 *
 * Only what the snapshot decides goes in, so two compositions of one session
 * give the same text; and only what the model acts on — the providers it now
 * has to search for, the files it will not find in its context. An agent
 * type withdrawn or a command hidden is nothing the model can use, and
 * saying so cost more than withdrawing it saved: measured on 2.1.280, a block
 * naming two hidden agent types added 43 tokens to every request's prefix,
 * where the listing line it withdrew was worth less. Nothing to say, no
 * block, no byte. Cut to `BLOCK_MAX_BYTES`, whole lines only.
 *
 * @param policy the session's policy
 * @param dropped the instruction files the scope left out, by path
 * @returns the block, or `null`
 */
export function blockOf(policy: Policy, dropped: readonly string[]): PromptContextBlock | null {
  if (!policy.isOn) {
    return null
  }

  const deferred = deferredKnownOf(policy)
  const scoped = dropped.length > 0 ? `- ${TEXTS.blockScoped}: ${dropped.length}` : null
  // The scope line is short and always fits; the providers take what is left,
  // as many whole names as fit, and the count of the rest.
  const room = BLOCK_MAX_BYTES - bytesOf(TEXTS.blockHead) - (scoped === null ? 0 : bytesOf(scoped) + 1) - 1
  const named = deferred.length > 0 ? namesWithin(deferred, room) : null
  const lines = [named, scoped].filter((line): line is string => line !== null)

  if (lines.length === 0) {
    return null
  }

  return { name: PLUGIN_NAME, text: [TEXTS.blockHead, ...lines].join('\n') }
}

/**
 * The deferred providers' line, as many whole names as fit a number of
 * bytes, then how many more there are.
 *
 * @param providers the providers, in order
 * @param bytes the room
 * @returns the line, or `null` when not even one name fits
 */
function namesWithin(providers: readonly string[], bytes: number): string | null {
  const lineOf = (shown: readonly string[]) => {
    const more = providers.length - shown.length

    return `- ${TEXTS.blockDeferred} ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}. ${TEXTS.blockSearch}`
  }

  let count = providers.length

  while (count > 0 && bytesOf(lineOf(providers.slice(0, count))) > bytes) {
    count -= 1
  }

  return count === 0 ? null : lineOf(providers.slice(0, count))
}

/**
 * A policy read back from the store, for this session only: a module rebuilt
 * mid-session takes the policy its session started with instead of deciding
 * again, which is what keeps every answer the same from the first request on.
 *
 * @param value what the store held
 * @param sessionId the session asking
 * @returns the policy, or `null` when none was kept for this session
 */
export function policyFrom(value: unknown, sessionId: string): Policy | null {
  const v = value as Partial<Policy> | null

  if (v === null || typeof v !== 'object' || v.sessionId !== sessionId || typeof v.isOn !== 'boolean') {
    return null
  }

  return { ...NO_POLICY, ...v, sessionId }
}
