import { describe, expect, test, tier } from 'claude-code/testing'

import { countText, modelText, msText, pctText } from '../hooks/format'
import { NO_LEDGER, withStep, withTurn } from '../hooks/ledger'
import type { Step } from '../hooks/ledger'
import { NO_SPEND, withDispatch, withModelCall, withShown } from '../hooks/spend'
import { missLine, reportLines, spendLine, stepLine, tokensText, turnLine } from '../hooks/ticket'

tier('user')

/**
 * One step, filled.
 *
 * @param over what this step is about
 * @returns the step
 */
const stepOf = (over: Partial<Step> = {}): Step => ({
  turnId: 't1',
  index: 2,
  agentId: null,
  model: 'claude-opus-5',
  atMs: 12_000,
  ms: 1_400,
  usage: {
    model: 'claude-opus-5',
    input: 420,
    output: 1_800,
    cacheRead: 128_000,
    cacheWrite: 2_400,
  },
  tools: 1,
  hasText: false,
  miss: null,
  ...over,
})

describe('the short forms', () => {
  test('a count keeps its size and loses its noise', () => {
    expect(countText(0)).toBe('0')
    expect(countText(840)).toBe('840')
    expect(countText(1_240)).toBe('1.2k')
    expect(countText(38_000)).toBe('38k')
    expect(countText(4_100_000)).toBe('4.1M')
  })

  test('a duration reads as a person says it', () => {
    expect(msText(820)).toBe('820 ms')
    expect(msText(4_200)).toBe('4.2 s')
    expect(msText(80_000)).toBe('1 min 20 s')
  })

  test('a share of nothing is nothing, not an error', () => {
    expect(pctText(4, 0)).toBe('0%')
    expect(pctText(50, 200)).toBe('25%')
  })

  test('a model is named by what tells it apart', () => {
    expect(modelText('claude-opus-5')).toBe('opus-5')
    expect(modelText('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
  })
})

describe('a line per step', () => {
  test('it carries the four counters of that request', () => {
    const line = stepLine(stepOf())

    expect(line).toContain('read 128k')
    expect(line).toContain('wrote 2.4k')
    expect(line).toContain('in 420')
    expect(line).toContain('out 1.8k')
    expect(line).toContain('opus-5')
  })

  test('a subagent’s step says whose it was', () => {
    expect(stepLine(stepOf({ agentId: 'a1' }))).toContain('subagents:a1')
  })

  test('a request that got no response says so instead of showing zeroes', () => {
    const line = stepLine(stepOf({ usage: null }))

    expect(line).toContain('no response')
    expect(line).not.toContain('out 0')
  })
})

describe('a line per cache miss', () => {
  test('a fault names its cause, its tokens, its share and its gap', () => {
    const line = missLine(
      stepOf({ miss: { cause: 'ttl', tokens: 96_000, sinceMs: 420_000, detail: null } }),
    )

    expect(line).toContain('cache miss')
    expect(line).toContain('wait past the cache TTL')
    expect(line).toContain('96k')
    expect(line).toContain('after 7 min')
  })

  test('a cold start is not called a miss', () => {
    const line = missLine(
      stepOf({ miss: { cause: 'cold', tokens: 96_000, sinceMs: -1, detail: null } }),
    )

    expect(line).not.toContain('cache miss')
    expect(line).toContain('nothing to read yet')
  })

  test('a step that missed nothing has no line', () => {
    expect(missLine(stepOf())).toBe(null)
  })
})

describe('the turn’s line', () => {
  test('it counts the turn’s own steps and says the figures are the engine’s', () => {
    const ledger = withTurn(
      withStep(
        withStep(NO_LEDGER, stepOf({ index: 0 })),
        stepOf({ index: 1, agentId: 'a1' }),
      ),
    )

    const line = turnLine(ledger, 't1')

    expect(line).toContain('2 steps')
    expect(line).toContain('1 in subagents')
    expect(line).toContain('read 256k')
    expect(line).toContain('(engine)')
  })

  test('a turn with no finished request has no line to write', () => {
    expect(turnLine(NO_LEDGER, 't1')).toBe(null)
  })

  test('no line of the ticket adds one unit to another', () => {
    const totals = tokensText({
      steps: 2,
      input: 420,
      output: 1_800,
      cacheRead: 128_000,
      cacheWrite: 2_400,
      ms: 1_400,
    })

    // Four counters, four figures, and no fifth that is their sum.
    expect(totals.split('·')).toHaveLength(4)
    expect(totals).not.toContain('total')
  })
})

describe('the mod’s own line', () => {
  test('a mod that made no model call and showed nothing says both', () => {
    const line = spendLine(withDispatch(NO_SPEND, 12))

    expect(line).toContain('0 model calls')
    expect(line).toContain('nothing shown to the model')
    expect(line).toContain('12 engine calls')
    expect(line).toContain('(counted)')
  })

  test('a mod that spent says what it spent', () => {
    const spend = withShown(
      withModelCall(NO_SPEND, 'fork', {
        model: 'claude-opus-5',
        input: 10,
        output: 20,
        cacheRead: 100_000,
        cacheWrite: 0,
      }),
      340,
    )

    const line = spendLine(spend)

    expect(line).toContain('1 fork')
    expect(line).toContain('340 chars shown to the model')
  })
})

describe('the report', () => {
  test('an empty session says so, and says how it would have counted', () => {
    expect(reportLines(NO_LEDGER, NO_SPEND)[0]).toContain('No model request')
  })

  test('it keeps the two sides apart and lists the faults', () => {
    const ledger = withTurn(
      withStep(
        withStep(NO_LEDGER, stepOf({ index: 0 })),
        stepOf({
          index: 1,
          agentId: 'a1',
          miss: { cause: 'model', tokens: 90_000, sinceMs: 3_000, detail: 'opus-5 → haiku-4-5' },
        }),
      ),
    )

    const lines = reportLines(ledger, NO_SPEND)

    expect(lines[0]).toContain('main · 1 steps')
    expect(lines[1]).toContain('subagents · 1 steps')
    expect(lines.some(line => line.includes('model changed'))).toBe(true)
    expect(lines.some(line => line.includes('nothing shown to the model'))).toBe(true)
  })
})
