import { describe, expect, test } from 'claude-code/testing'

import {
  NO_INVENTORY,
  inventoryFrom,
  inventoryOf,
  providerOf,
  withDescribed,
} from '../hooks/inventory'

const ENGINE = { plugin: 'engine', tier: 'core' }
const LINEAR = { plugin: 'mcp:linear', tier: 'user' }
const COCKPIT = { plugin: 'cockpit', tier: 'user' }

/**
 * An inventory of three providers, as `tool.describe` would have named them.
 */
const described = () => {
  let inventory = NO_INVENTORY

  inventory = withDescribed(inventory, 'Bash', ENGINE, false)
  inventory = withDescribed(inventory, 'Read', ENGINE, false)
  inventory = withDescribed(inventory, 'mcp__linear__create_issue', LINEAR, true)
  inventory = withDescribed(inventory, 'mcp__cockpit__open', COCKPIT, false)

  return inventory
}

describe('who provides each tool (T13)', () => {
  test('every listed tool has exactly one provider, and none has two', () => {
    const listed = ['Bash', 'Read', 'mcp__linear__create_issue', 'mcp__cockpit__open', 'Read']
    const rows = inventoryOf(described(), listed)
    const names = rows.map(row => row.tool)

    // One row per tool: a name listed twice is still one tool.
    expect(new Set(names).size).toBe(names.length)
    expect(names.sort()).toEqual([...new Set(listed)].sort())

    for (const row of rows) {
      expect(typeof row.provider).toBe('string')
      expect(row.provider).not.toBe('')
    }
  })

  test('the provider is the one the engine named, not one read off the name', () => {
    expect(providerOf(described(), 'mcp__linear__create_issue')).toBe('mcp:linear')
    // Same prefix as a server's tool, but a plugin's: the name alone would lie.
    expect(providerOf(described(), 'mcp__cockpit__open')).toBe('cockpit')
    expect(providerOf(described(), 'Bash')).toBe('engine')
  })

  test('a tool never described says so instead of being guessed', () => {
    expect(inventoryOf(described(), ['mcp__github__search'])).toEqual([
      { tool: 'mcp__github__search', provider: '?' },
    ])
  })

  test('a tool described again takes its latest provider, never two', () => {
    const again = withDescribed(described(), 'Bash', COCKPIT, false)

    expect(providerOf(again, 'Bash')).toBe('cockpit')
    expect(Object.keys(again.tools)).toHaveLength(4)
  })

  test('the inventory survives the store, and a foreign value reads as nothing', () => {
    const inventory = described()

    expect(inventoryFrom(JSON.parse(JSON.stringify(inventory)))).toEqual(inventory)
    expect(inventoryFrom('nope')).toBe(null)
    expect(inventoryFrom({ tools: { Bash: { provider: 3 } } })).toEqual({ tools: {} })
  })
})
