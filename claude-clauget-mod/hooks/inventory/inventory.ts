/**
 * Who provides each tool, as the engine names it.
 *
 * `tool.describe` is raised once per tool, when the engine first renders its
 * schema, and its input carries `provider`: the plugin and its tier,
 * `engine` for a built-in, `mcp:<server>` for a configured server. The mod
 * notes it and hands the description back untouched — the note is the whole
 * point, and a changed description would be a changed prefix.
 *
 * `$.tool.list()` is the other half: what the model can call right now. The
 * two are crossed so every listed tool has exactly one provider, and one the
 * mod never saw described says so instead of being guessed from its name —
 * `mcp__x__y` is a plugin's tool as readily as a server's.
 *
 * Pure.
 */

import { UNDESCRIBED } from '../names'

/**
 * One tool as `tool.describe` showed it.
 */
export type Described = {
  /**
   * The provider's name as the engine spells it: `engine`, `mcp:<server>`, or
   * a plugin's name.
   */
  provider: string
  tier: string
  isDeferred: boolean
}

/**
 * Every tool described so far, by the name the model calls it by.
 */
export type Inventory = {
  tools: Readonly<Record<string, Described>>
}

export const NO_INVENTORY: Inventory = { tools: {} }

/**
 * The inventory with one description noted. A tool described again takes its
 * latest provider: a tool has one provider at a time, never two.
 *
 * @param inventory what was noted before
 * @param tool the tool's name as the model sees it
 * @param provider who provides it, as `tool.describe` carried it
 * @param isDeferred whether the engine lists it behind ToolSearch
 * @returns the inventory with it
 */
export function withDescribed(
  inventory: Inventory,
  tool: string,
  provider: { plugin: string; tier: string },
  isDeferred: boolean,
): Inventory {
  return {
    tools: { ...inventory.tools, [tool]: { provider: provider.plugin, tier: provider.tier, isDeferred } },
  }
}

/**
 * Who provides a tool, for the counters: the described provider, or `?`.
 *
 * @param inventory what was noted
 * @param tool the tool's name
 * @returns the provider's name
 */
export function providerOf(inventory: Inventory, tool: string): string {
  return inventory.tools[tool]?.provider ?? UNDESCRIBED
}

/**
 * The listed tools, each with its one provider.
 *
 * @param inventory what was noted
 * @param listed the tools' names, as `$.tool.list()` answered them
 * @returns one row per listed name, in the list's order, duplicates folded
 */
export function inventoryOf(
  inventory: Inventory,
  listed: readonly string[],
): { tool: string; provider: string }[] {
  const seen = new Set<string>()
  const rows: { tool: string; provider: string }[] = []

  for (const tool of listed) {
    if (seen.has(tool)) {
      continue
    }

    seen.add(tool)
    rows.push({ tool, provider: providerOf(inventory, tool) })
  }

  return rows
}

/**
 * An inventory read back from the store, or nothing when the value is not
 * one: a record the mod cannot read is dropped, never half-trusted.
 *
 * @param value what the store held
 * @returns the inventory, or `null`
 */
export function inventoryFrom(value: unknown): Inventory | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const tools = (value as { tools?: unknown }).tools

  if (typeof tools !== 'object' || tools === null) {
    return null
  }

  const kept: Record<string, Described> = {}

  for (const [tool, one] of Object.entries(tools)) {
    const d = one as Partial<Described> | null

    if (d !== null && typeof d?.provider === 'string' && typeof d.tier === 'string') {
      kept[tool] = { provider: d.provider, tier: d.tier, isDeferred: d.isDeferred === true }
    }
  }

  return { tools: kept }
}
