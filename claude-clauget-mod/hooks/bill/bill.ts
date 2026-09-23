/**
 * The bill: whose tokens the prefix carries, one line per provider, and what
 * deferring a provider's tools would be worth — computed, printed, never
 * applied.
 *
 * Every figure on a line comes from one field of the engine's breakdown or
 * one of the mod's counters, and the line names which: `mcpTools`, `agents`,
 * `skills`, `slashCommands`, `memoryFiles`, and the rest of `totalTokens`
 * that no detail claims. The rest goes to the engine's line — the system
 * prompt, the built-in tools, the conversation — so the lines add up to the
 * breakdown's total and nothing is counted twice. The deferred row is apart:
 * a deferred schema is not a smaller one, it is outside the window.
 *
 * Tokens here are the breakdown's estimates (`summary` counts locally, `full`
 * asks the token-count API); calls are counted by the mod. Two columns, never
 * one sum.
 *
 * Pure.
 */

import type { SessionContextBreakdown } from 'claude-code'

import { countText } from '../format'
import type { Inventory } from '../inventory'
import { ENGINE, INSTRUCTIONS, MARK, READ_RATE, TEXTS } from '../names'
import type { Tally, Usage } from '../usage'

/**
 * One provider's line.
 */
export type BillLine = {
  provider: string
  /**
   * Estimated tokens inside the window.
   */
  tokens: number
  /**
   * Estimated tokens of its tool schemas loaded on demand, outside the window.
   */
  deferred: number
  tools: number
  agents: number
  skills: number
  files: number
  /**
   * The breakdown's fields the figures come from, in the order first met.
   */
  sources: readonly string[]
}

/**
 * The whole bill.
 */
export type Bill = {
  /**
   * Heaviest first; the engine's line carries `rest`.
   */
  lines: readonly BillLine[]
  /**
   * The breakdown's `totalTokens`, which the lines add up to.
   */
  total: number
  /**
   * The part of the total no detail claims, on the engine's line.
   */
  rest: number
  /**
   * How far the details ran past the total, when they did; zero on a
   * consistent breakdown. The bill then says so rather than printing a
   * negative rest.
   */
  overlap: number
  /**
   * The breakdown's `deferred` rows, outside the window.
   */
  deferred: number
}

type Draft = {
  tokens: number
  deferred: number
  tools: number
  agents: number
  skills: number
  files: number
  sources: string[]
}

/**
 * Who provides an agent type, from the breakdown's `source`.
 *
 * @param agentType the type as the Agent tool names it (`plugin:name`)
 * @param source where it was defined (`plugin`, `built-in`, `userSettings`)
 * @returns the provider
 */
export function agentProviderOf(agentType: string, source: string): string {
  if (source === 'plugin') {
    const cut = agentType.indexOf(':')

    return cut > 0 ? agentType.slice(0, cut) : source
  }

  return source === 'built-in' ? ENGINE : source
}

/**
 * Who provides a skill's listing, from the breakdown's entry.
 *
 * @param source where it came from (`plugin`, `built-in`, `userSettings`)
 * @param pluginName the plugin, when one provides it
 * @returns the provider
 */
export function skillProviderOf(source: string, pluginName: string | undefined): string {
  if (pluginName !== undefined && pluginName !== '') {
    return pluginName
  }

  return source === 'built-in' || source === 'bundled' ? ENGINE : source
}

/**
 * The bill of a breakdown.
 *
 * @param breakdown what `$.session.usage({ breakdown })` answered
 * @param inventory who provides each tool, as `tool.describe` named them: a
 *   tool described there is billed to that provider, one never described to
 *   the server the breakdown names
 * @returns the bill
 */
export function billOf(breakdown: SessionContextBreakdown, inventory: Inventory): Bill {
  const drafts = new Map<string, Draft>()

  const at = (provider: string, source: string): Draft => {
    let draft = drafts.get(provider)

    if (draft === undefined) {
      draft = { tokens: 0, deferred: 0, tools: 0, agents: 0, skills: 0, files: 0, sources: [] }
      drafts.set(provider, draft)
    }

    if (!draft.sources.includes(source)) {
      draft.sources.push(source)
    }

    return draft
  }

  let claimed = 0

  for (const tool of breakdown.mcpTools) {
    const draft = at(inventory.tools[tool.name]?.provider ?? `mcp:${tool.serverName}`, 'mcpTools')

    draft.tools += 1

    if (tool.isLoaded) {
      draft.tokens += tool.tokens
      claimed += tool.tokens
    } else {
      draft.deferred += tool.tokens
    }
  }

  for (const agent of breakdown.agents) {
    const draft = at(agentProviderOf(agent.agentType, agent.source), 'agents')

    draft.agents += 1
    draft.tokens += agent.tokens
    claimed += agent.tokens
  }

  if (breakdown.skills !== undefined) {
    let listed = 0

    for (const skill of breakdown.skills.skillFrontmatter) {
      const draft = at(skillProviderOf(skill.source, skill.pluginName), 'skills')

      draft.skills += 1
      draft.tokens += skill.tokens
      listed += skill.tokens
    }

    // The listing's own frame — its heading, its budget line — belongs to no
    // skill, and is the engine's.
    const frame = Math.max(0, breakdown.skills.tokens - listed)

    at(ENGINE, 'skills').tokens += frame
    claimed += listed + frame
  }

  if (breakdown.slashCommands !== undefined) {
    at(ENGINE, 'slashCommands').tokens += breakdown.slashCommands.tokens
    claimed += breakdown.slashCommands.tokens
  }

  for (const file of breakdown.memoryFiles) {
    const draft = at(INSTRUCTIONS, 'memoryFiles')

    draft.files += 1
    draft.tokens += file.tokens
    claimed += file.tokens
  }

  const total = breakdown.totalTokens
  const rest = Math.max(0, total - claimed)
  const overlap = Math.max(0, claimed - total)
  const engine = at(ENGINE, 'totalTokens')

  engine.tokens += rest

  const deferred = breakdown.categories
    .filter(category => category.kind === 'deferred')
    .reduce((sum, category) => sum + category.tokens, 0)

  const lines = [...drafts.entries()]
    .map(([provider, draft]) => ({ provider, ...draft }))
    .sort((a, b) => b.tokens - a.tokens || a.provider.localeCompare(b.provider))

  return { lines, total, rest, overlap, deferred }
}

/**
 * The parameters of the break-even, every one printed beside the verdict.
 */
export type BreakEvenInput = {
  /**
   * The provider's schemas, estimated tokens.
   */
  schemaTokens: number
  /**
   * How many requests a session runs to, on average.
   */
  stepsPerSession: number
  /**
   * The share of sessions that used the provider at least once.
   */
  pUsed: number
  /**
   * The prefix a request re-reads, tokens.
   */
  prefixTokens: number
  /**
   * What the search step adds once the tool is found: at least its schema.
   */
  searchTokens: number
  /**
   * What a cached token costs against an uncached one.
   */
  readRate: number
  /**
   * What the two ways cost the session before, when it was measured: a
   * deferral that cost more than the front did is brought back.
   */
  last?: { front: number; deferred: number }
}

/**
 * The break-even's answer.
 */
export type BreakEven = {
  front: number
  deferred: number
  verdict: 'front' | 'defer'
  why: 'cheaper' | 'brought back'
}

/**
 * What keeping a provider's schemas in front costs a session, against what
 * deferring them would — in cached-token equivalents, both columns printed.
 *
 *   front    = schema × steps × readRate
 *   deferred = P(used) × (prefix × readRate + search)
 *
 * Deferring is not free: when the model needs the tool it searches for it,
 * and that search is one more request re-reading the whole prefix.
 *
 * @param input the parameters
 * @returns both costs and the verdict — which nothing applies
 */
export function breakEvenOf(input: BreakEvenInput): BreakEven {
  const front = input.schemaTokens * input.stepsPerSession * input.readRate
  const deferred = input.pUsed * (input.prefixTokens * input.readRate + input.searchTokens)

  if (input.last !== undefined && input.last.deferred > input.last.front) {
    return { front, deferred, verdict: 'front', why: 'brought back' }
  }

  return { front, deferred, verdict: deferred < front ? 'defer' : 'front', why: 'cheaper' }
}

/**
 * The share of sessions a counter was used in.
 *
 * @param tally the provider's counter, if any
 * @param usage the counters, for the number of sessions
 * @returns between 0 and 1
 */
export function pUsedOf(tally: Tally | undefined, usage: Usage): number {
  return usage.sessions <= 0 || tally === undefined ? 0 : Math.min(1, tally.sessions / usage.sessions)
}

/**
 * The counted column of a line: calls and the sessions they came from.
 *
 * @param tally the counter, if any
 * @param usage the counters
 * @returns `2 calls in 2 of 30 sessions`
 */
export function callsText(tally: Tally | undefined, usage: Usage): string {
  const calls = tally?.calls ?? 0

  return `${calls} ${TEXTS.callsCounted} in ${tally?.sessions ?? 0} of ${usage.sessions} ${TEXTS.sessions}`
}

/**
 * The verdict as the report words it, against where the tools sit now: a
 * provider whose schemas are all deferred already is not told to defer them.
 *
 * @param verdict what the break-even found cheaper
 * @param isDeferredNow whether every schema of the provider waits behind
 *   ToolSearch already
 * @returns the words
 */
export function verdictText(verdict: BreakEven['verdict'], isDeferredNow: boolean): string {
  if (isDeferredNow) {
    return verdict === 'defer' ? TEXTS.staysDeferred : TEXTS.wouldFront
  }

  return verdict === 'defer' ? TEXTS.wouldDefer : TEXTS.wouldKeep
}

/**
 * The bill as the report prints it: a head line, one line per provider, and
 * the break-even of the providers whose tools could be deferred.
 *
 * @param bill the bill
 * @param usage the counters on disk, this session's share included
 * @param detail how the breakdown was counted
 * @param prefixTokens the prefix the last main request re-read
 * @param steps the main loop's requests this session, when the counters
 *   have no sessions yet to average over
 * @returns the lines
 */
export function billLines(
  bill: Bill,
  usage: Usage,
  detail: 'summary' | 'full',
  prefixTokens: number,
  steps: number,
): string[] {
  const how = detail === 'full' ? TEXTS.countedFull : TEXTS.countedSummary
  const lines = [
    `${MARK} · ${TEXTS.bill} · ${countText(bill.total)} ${TEXTS.tokEst} ${TEXTS.inWindow} · ${countText(bill.deferred)} ${TEXTS.deferredApart} (${how})`,
  ]

  for (const line of bill.lines) {
    const parts = [
      `  ${line.provider}`,
      `${countText(line.tokens)} ${TEXTS.tokEst}`,
      line.deferred > 0 ? `${countText(line.deferred)} ${TEXTS.deferredShort}` : null,
      line.tools > 0 ? `${line.tools} ${TEXTS.tools}` : null,
      line.agents > 0 ? `${line.agents} ${TEXTS.agentTypes}` : null,
      line.skills > 0 ? `${line.skills} ${TEXTS.skills}` : null,
      line.files > 0 ? `${line.files} ${TEXTS.files}` : null,
      line.provider === ENGINE ? `${countText(bill.rest)} ${TEXTS.rest}` : null,
      line.tools > 0 ? callsText(usage.providers[line.provider], usage) : null,
      `[${line.sources.join(', ')}]`,
    ]

    lines.push(parts.filter((one): one is string => one !== null).join(' · '))
  }

  if (bill.overlap > 0) {
    lines.push(`  ${TEXTS.overlap}: ${countText(bill.overlap)}`)
  }

  const perSession = usage.sessions > 0 ? usage.steps / usage.sessions : steps
  const candidates = bill.lines.filter(line => line.tools > 0 && line.provider !== ENGINE)

  if (candidates.length > 0) {
    lines.push(
      `${MARK} · ${TEXTS.breakEven} · ${TEXTS.readRate} ${READ_RATE} · ${Math.round(perSession)} ${TEXTS.stepsPerSession} · ${countText(prefixTokens)} ${TEXTS.prefix} · ${TEXTS.searchIsSchema}`,
    )

    for (const line of candidates) {
      const schema = line.tokens + line.deferred
      const pUsed = pUsedOf(usage.providers[line.provider], usage)
      const even = breakEvenOf({
        schemaTokens: schema,
        stepsPerSession: perSession,
        pUsed,
        prefixTokens,
        searchTokens: schema,
        readRate: READ_RATE,
      })

      lines.push(
        [
          `  ${line.provider}`,
          `${TEXTS.front} ${countText(even.front)}`,
          `${TEXTS.deferredShort} ${countText(even.deferred)} (P ${pUsed.toFixed(2)})`,
          `→ ${verdictText(even.verdict, line.tokens === 0 && line.deferred > 0)}`,
        ].join(' · '),
      )
    }
  }

  return lines
}
