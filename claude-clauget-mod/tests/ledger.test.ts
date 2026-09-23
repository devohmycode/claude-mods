import { describe, expect, test, tier } from 'claude-code/testing'

import {
  NO_LEDGER,
  isAck,
  lastStepOf,
  prefixOf,
  totalsOf,
  turnStepsOf,
  usageOf,
  withStep,
  withTurn,
} from '../hooks/ledger'
import type { Step } from '../hooks/ledger'

tier('user')

/**
 * One step, with everything a test does not care about already filled.
 *
 * @param over what this step is about
 * @returns the step
 */
const stepOf = (over: Partial<Step> = {}): Step => ({
  turnId: 't1',
  index: 0,
  agentId: null,
  model: 'claude-opus-5',
  atMs: 1_000,
  ms: 900,
  usage: {
    model: 'claude-opus-5',
    input: 400,
    output: 300,
    cacheRead: 60_000,
    cacheWrite: 1_200,
  },
  tools: 1,
  hasText: false,
  miss: null,
  ...over,
})

describe('usage', () => {
  test("the stop chunk's counters are read as they are reported", () => {
    expect(
      usageOf({
        model: 'claude-haiku-4-5-20251001',
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 56,
        cache_creation_input_tokens: 78,
      }),
    ).toEqual({
      model: 'claude-haiku-4-5-20251001',
      input: 12,
      output: 34,
      cacheRead: 56,
      cacheWrite: 78,
    })
  })

  test('a response that never arrived is null, not four zeroes', () => {
    expect(usageOf(null)).toBe(null)
    expect(prefixOf(null)).toBe(0)
  })

  test("the prefix is what the request carried: read, written and uncached", () => {
    expect(prefixOf(stepOf().usage)).toBe(61_600)
  })
})

describe('journal', () => {
  test('the main loop and the subagents are counted apart', () => {
    const ledger = withStep(
      withStep(NO_LEDGER, stepOf()),
      stepOf({ agentId: 'a1', index: 1, usage: { ...stepOf().usage!, output: 50 } }),
    )

    expect(ledger.main.steps).toBe(1)
    expect(ledger.agents.steps).toBe(1)
    expect(ledger.main.output).toBe(300)
    expect(ledger.agents.output).toBe(50)
  })

  test('each loop reads its own previous step, never the other loop’s', () => {
    const ledger = withStep(
      withStep(NO_LEDGER, stepOf({ index: 0 })),
      stepOf({ index: 1, agentId: 'a1' }),
    )

    expect(lastStepOf(ledger, null)?.index).toBe(0)
    expect(lastStepOf(ledger, 'a1')?.index).toBe(1)
    expect(lastStepOf(ledger, 'a2')).toBe(null)
  })

  test('a step with no response adds a step and no tokens', () => {
    const ledger = withStep(NO_LEDGER, stepOf({ usage: null }))

    expect(ledger.main.steps).toBe(1)
    expect(ledger.main.input).toBe(0)
    expect(ledger.main.cacheRead).toBe(0)
  })

  test('what falls off the end of the list is the detail, never a figure', () => {
    const caps = { steps: 2, misses: 10 }

    const ledger = [0, 1, 2, 3].reduce(
      (kept, index) => withStep(kept, stepOf({ index }), caps),
      NO_LEDGER,
    )

    expect(ledger.steps.map(step => step.index)).toEqual([2, 3])
    expect(ledger.dropped).toBe(2)
    expect(ledger.main.steps).toBe(4)
    expect(ledger.main.cacheRead).toBe(240_000)
  })

  test('a missed step is listed among the misses as well', () => {
    const missed = stepOf({
      miss: { cause: 'ttl', tokens: 90_000, sinceMs: 400_000, detail: null },
    })

    expect(withStep(NO_LEDGER, missed).misses).toHaveLength(1)
    expect(withStep(NO_LEDGER, stepOf()).misses).toHaveLength(0)
  })

  test('a turn is counted when it is closed, not when it steps', () => {
    const ledger = withTurn(withStep(withStep(NO_LEDGER, stepOf()), stepOf({ index: 1 })))

    expect(ledger.turns).toBe(1)
    expect(ledger.main.steps).toBe(2)
  })

  test('a turn’s steps are its own, and their totals are the five columns', () => {
    const ledger = withStep(
      withStep(NO_LEDGER, stepOf({ turnId: 't1' })),
      stepOf({ turnId: 't2', index: 0, ms: 100 }),
    )

    expect(turnStepsOf(ledger, 't2')).toHaveLength(1)
    expect(totalsOf(turnStepsOf(ledger, 't2'))).toEqual({
      steps: 1,
      input: 400,
      output: 300,
      cacheRead: 60_000,
      cacheWrite: 1_200,
      ms: 100,
    })
  })
})

describe('acknowledgement steps', () => {
  test('a short text step after a tool step is one', () => {
    const previous = stepOf({ tools: 2 })
    const ack = stepOf({
      index: 1,
      tools: 0,
      hasText: true,
      usage: { ...stepOf().usage!, output: 18 },
    })

    expect(isAck(ack, previous)).toBe(true)
  })

  test('a step that called a tool is not one, however short', () => {
    const previous = stepOf({ tools: 2 })
    const step = stepOf({ index: 1, tools: 1, usage: { ...stepOf().usage!, output: 4 } })

    expect(isAck(step, previous)).toBe(false)
  })

  test('a long answer is not one, and neither is the first step of a turn', () => {
    const previous = stepOf({ tools: 2 })

    expect(
      isAck(stepOf({ index: 1, tools: 0, usage: { ...stepOf().usage!, output: 900 } }), previous),
    ).toBe(false)

    expect(isAck(stepOf({ tools: 0, usage: { ...stepOf().usage!, output: 10 } }), null)).toBe(false)
  })

  test('the journal counts them, and what they read to say it', () => {
    const ledger = withStep(
      withStep(NO_LEDGER, stepOf({ tools: 2 })),
      stepOf({ index: 1, tools: 0, hasText: true, usage: { ...stepOf().usage!, output: 12 } }),
    )

    expect(ledger.acks).toBe(1)
    expect(ledger.ackCacheRead).toBe(60_000)
  })
})
