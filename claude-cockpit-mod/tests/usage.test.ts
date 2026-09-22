import { describe, expect, test, tier } from 'claude-code/testing'

import { barText, longMsText, modelText } from '../hooks/format'
import { NO_LEDGER, agentShareOf, pluginsOf, totalOf, withCost } from '../hooks/usage'
import type { TurnCost } from '../hooks/usage'
import { tokenColumnsOf } from '../hooks/tabs'

tier('user')

const TURN: TurnCost = {
  agentId: null,
  durationMs: 4_000,
  model: 'claude-opus-5',
  input: 100,
  output: 200,
  cacheRead: 30_000,
  cacheWrite: 4_000,
}

const AGENT_TURN: TurnCost = {
  ...TURN,
  agentId: 'a1',
  model: 'claude-haiku-4-5-20251001',
  output: 50,
}

describe('ledger', () => {
  test('a main-loop turn lands on the main side, a subagent turn on theirs', () => {
    const ledger = withCost(withCost(NO_LEDGER, TURN), AGENT_TURN)

    expect(ledger.main.turns).toBe(1)
    expect(ledger.agents.turns).toBe(1)
    expect(ledger.main.output).toBe(200)
    expect(ledger.agents.output).toBe(50)
  })

  test('the total is both sides, counter by counter', () => {
    const total = totalOf(withCost(withCost(NO_LEDGER, TURN), TURN))

    expect(total).toEqual({
      turns: 2,
      durationMs: 8_000,
      input: 200,
      output: 400,
      cacheRead: 60_000,
      cacheWrite: 8_000,
    })
  })

  test('the four counters are never summed into one', () => {
    const total = totalOf(withCost(NO_LEDGER, TURN))

    // The guarantee the tab rests on: no field of a side holds two units at
    // once, so no share drawn off one of them is a figure without a unit.
    expect(total.input + total.output).not.toBe(total.cacheRead)
    expect(Object.keys(total).sort()).toEqual([
      'cacheRead',
      'cacheWrite',
      'durationMs',
      'input',
      'output',
      'turns',
    ])
  })

  test('the subagent share is a share of the output alone', () => {
    const ledger = withCost(withCost(NO_LEDGER, TURN), AGENT_TURN)

    // 50 of 250 written, whatever the two sides read or cached.
    expect(agentShareOf(ledger)).toBe(20)
  })

  test('nothing written yet is no share rather than none written', () => {
    expect(agentShareOf(NO_LEDGER)).toBe(null)
  })

  test('a model keeps one row however many turns it answers', () => {
    const ledger = withCost(withCost(withCost(NO_LEDGER, TURN), TURN), AGENT_TURN)

    expect(ledger.models.map(row => row.model)).toEqual([
      'claude-opus-5',
      'claude-haiku-4-5-20251001',
    ])
    expect(ledger.models[0]?.turns).toBe(2)
  })

  test('a negative duration does not run the clock backwards', () => {
    const ledger = withCost(NO_LEDGER, { ...TURN, durationMs: -5 })

    expect(ledger.main.durationMs).toBe(0)
  })
})

describe('skill listings', () => {
  test('skills gather under the plugin that provides them, heaviest first', () => {
    const rows = pluginsOf([
      { pluginName: 'pdf-viewer', source: 'plugin', tokens: 40 },
      { pluginName: 'pdf-viewer', source: 'plugin', tokens: 36 },
      { pluginName: 'remember', source: 'plugin', tokens: 36 },
    ])

    expect(rows).toEqual([
      { plugin: 'pdf-viewer', skills: 2, tokens: 76 },
      { plugin: 'remember', skills: 1, tokens: 36 },
    ])
  })

  test('a skill with no plugin behind it is gathered under its source', () => {
    const rows = pluginsOf([{ source: 'userSettings', tokens: 12 }])

    expect(rows).toEqual([{ plugin: 'userSettings', skills: 1, tokens: 12 }])
  })

  test('the rows add up to the whole listing', () => {
    const skills = [
      { pluginName: 'a', source: 'plugin', tokens: 10 },
      { source: 'built-in', tokens: 7 },
      { pluginName: 'b', source: 'plugin', tokens: 3 },
    ]

    const total = pluginsOf(skills).reduce((sum, row) => sum + row.tokens, 0)

    expect(total).toBe(20)
  })
})

describe('the tab draws them', () => {
  test('a bar fills with the reading and keeps its width', () => {
    expect(barText(0, 10)).toBe('░░░░░░░░░░')
    expect(barText(100, 10)).toBe('██████████')
    expect(barText(50, 10)).toHaveLength(10)
    expect(barText(null, 4)).toBe('····')
  })

  test('a bar past its window fills rather than overflowing', () => {
    expect(barText(140, 6)).toBe('██████')
  })

  test('an hour is read as hours', () => {
    expect(longMsText(4_200)).toBe('4.2s')
    expect(longMsText(74_123_456)).toBe('20h35m')
    expect(longMsText(3_600_000)).toBe('1h00m')
  })

  test('a model is drawn without its vendor or its pin', () => {
    expect(modelText('claude-opus-5', 20)).toBe('opus-5')
    expect(modelText('claude-haiku-4-5-20251001', 20)).toBe('haiku-4-5')
  })

  test('the four token columns and their label fit the pane exactly', () => {
    for (const columns of [40, 52, 64, 80, 120]) {
      const width = tokenColumnsOf(columns)

      expect(width.label + width.cell * 4).toBeGreaterThanOrEqual(columns - 1)
      expect(width.cell).toBeGreaterThanOrEqual(6)
    }
  })
})
