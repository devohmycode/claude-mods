/**
 * What the session has spent, turn by turn: the token counts the engine
 * already holds on every finished turn, kept apart by who spent them.
 *
 * `turn.complete` carries `usage` — the API's own four counters and the model
 * that answered — and `agentId` for a turn a subagent ran. Nothing here is
 * estimated and nothing is summed across units: four counters stay four
 * counters, and a share of them is a share of one of them.
 *
 * Pure: a ledger and a turn in, a ledger out. No `$`.
 */

import { MODELS_MAX } from '../names'

/**
 * The four counters the API reports, as it spells them; the shape every row
 * of the ledger is built on.
 */
export type Counts = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * One finished turn as the ledger takes it: the counters the API reported,
 * how long the turn ran, which model answered, and whether a subagent ran it.
 *
 * A turn the engine reported no usage for is not one of these: an absent
 * reading is not four zeroes.
 */
export type TurnCost = Counts & {
  /**
   * The subagent that ran the turn, or null for the main loop.
   */
  agentId: string | null

  /**
   * The turn's wall clock in milliseconds, tool time included.
   */
  durationMs: number

  /**
   * The model that answered, by the id the API reports.
   */
  model: string
}

/**
 * One model's share of the session, by the id the API reports.
 */
export type ModelRow = Counts & {
  model: string
  turns: number
}

/**
 * One side of the ledger: the main loop, or every subagent together.
 */
export type Side = Counts & {
  turns: number

  /**
   * The wall clock of those turns, summed; tool time is inside it, so this is
   * how long the session was busy and not how long the API was.
   */
  durationMs: number
}

/**
 * What the session has spent: the main loop, the subagents, and the models
 * that answered.
 */
export type Ledger = {
  main: Side
  agents: Side
  models: readonly ModelRow[]
}

/**
 * A side with nothing spent on it.
 */
const NOTHING: Side = {
  turns: 0,
  durationMs: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
}

/**
 * A session that has finished no turn.
 */
export const NO_LEDGER: Ledger = {
  main: NOTHING,
  agents: NOTHING,
  models: [],
}

/**
 * The ledger with one finished turn folded in, on the side that ran it.
 *
 * @param ledger the ledger before the turn
 * @param cost the turn as the engine reported it
 * @returns the ledger after it
 */
export function withCost(ledger: Ledger, cost: TurnCost): Ledger {
  const side = cost.agentId === null ? 'main' : 'agents'

  return {
    ...ledger,
    [side]: plus(ledger[side], cost),
    models: withModel(ledger.models, cost),
  }
}

/**
 * One side with a turn added to it.
 *
 * @param side the side before the turn
 * @param cost the turn
 * @returns the side after it
 */
const plus = (side: Side, cost: TurnCost): Side => ({
  turns: side.turns + 1,
  durationMs: side.durationMs + Math.max(0, cost.durationMs),
  input: side.input + cost.input,
  output: side.output + cost.output,
  cacheRead: side.cacheRead + cost.cacheRead,
  cacheWrite: side.cacheWrite + cost.cacheWrite,
})

/**
 * The model rows with a turn counted against the model that answered it, the
 * list sorted by what each model wrote and cut at MODELS_MAX.
 *
 * Output is what sorts them because it is the one counter a model alone
 * decides: the input side is what the session handed it, and the cache
 * counters say more about how long the session has run than about the model.
 *
 * @param models the rows before the turn
 * @param cost the turn
 * @returns the rows after it
 */
export function withModel(
  models: readonly ModelRow[],
  cost: TurnCost,
): readonly ModelRow[] {
  const seen = models.find(row => row.model === cost.model)

  const row: ModelRow = {
    model: cost.model,
    turns: (seen?.turns ?? 0) + 1,
    input: (seen?.input ?? 0) + cost.input,
    output: (seen?.output ?? 0) + cost.output,
    cacheRead: (seen?.cacheRead ?? 0) + cost.cacheRead,
    cacheWrite: (seen?.cacheWrite ?? 0) + cost.cacheWrite,
  }

  return [...models.filter(one => one.model !== cost.model), row]
    .sort((a, b) => b.output - a.output || b.turns - a.turns)
    .slice(0, MODELS_MAX)
}

/**
 * Both sides added together: what the session spent in all.
 *
 * @param ledger the ledger
 * @returns the totals, as one side
 */
export const totalOf = (ledger: Ledger): Side => ({
  turns: ledger.main.turns + ledger.agents.turns,
  durationMs: ledger.main.durationMs + ledger.agents.durationMs,
  input: ledger.main.input + ledger.agents.input,
  output: ledger.main.output + ledger.agents.output,
  cacheRead: ledger.main.cacheRead + ledger.agents.cacheRead,
  cacheWrite: ledger.main.cacheWrite + ledger.agents.cacheWrite,
})

/**
 * What share of the session's written tokens the subagents wrote, as a whole
 * percentage, or null before anything was written.
 *
 * Output alone, and said as output: the four counters are four prices, and a
 * percentage of their sum would be a number with no unit behind it.
 *
 * @param ledger the ledger
 * @returns the share, 0 to 100, or null
 */
export function agentShareOf(ledger: Ledger): number | null {
  const all = ledger.main.output + ledger.agents.output

  return all === 0 ? null : (ledger.agents.output / all) * 100
}

/**
 * One plugin's skill listing in the system prompt: how many skills it lists
 * and what they cost every turn the prompt is sent.
 */
export type PluginSkills = {
  plugin: string
  skills: number
  tokens: number
}

/**
 * The skill listing gathered by the plugin that provides it, heaviest first.
 *
 * A skill with no plugin behind it — the user's own, a built-in, one an MCP
 * server carries — is gathered under the source the engine named it with, so
 * the rows add up to the listing rather than to the part of it plugins pay
 * for.
 *
 * @param skills one entry per listed skill, as the breakdown carries them
 * @returns one row per provider, heaviest first
 */
export function pluginsOf(
  skills: readonly { pluginName?: string; source: string; tokens: number }[],
): readonly PluginSkills[] {
  const rows = new Map<string, PluginSkills>()

  for (const skill of skills) {
    const plugin = skill.pluginName ?? skill.source
    const seen = rows.get(plugin)

    rows.set(plugin, {
      plugin,
      skills: (seen?.skills ?? 0) + 1,
      tokens: (seen?.tokens ?? 0) + skill.tokens,
    })
  }

  return [...rows.values()].sort(
    (a, b) => b.tokens - a.tokens || b.skills - a.skills,
  )
}
