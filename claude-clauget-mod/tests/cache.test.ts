import { describe, expect, test, tier } from 'claude-code/testing'

import { MISS_LIMITS, NO_SEEN, faultTokensOf, faultsOf, isFault, missOf } from '../hooks/cache'
import type { Seen } from '../hooks/cache'
import type { Step } from '../hooks/ledger'

tier('user')

/**
 * A step of a hundred-thousand-token prefix, whose cache write a test sets.
 *
 * @param over what this step is about
 * @returns the step
 */
const stepOf = (over: Partial<Step> & { write?: number } = {}): Step => {
  const { write, ...rest } = over

  return {
    turnId: 't1',
    index: 1,
    agentId: null,
    model: 'claude-opus-5',
    atMs: 60_000,
    ms: 800,
    usage: {
      model: 'claude-opus-5',
      input: 500,
      output: 400,
      cacheRead: 100_000 - (write ?? 1_000),
      cacheWrite: write ?? 1_000,
    },
    tools: 1,
    hasText: false,
    miss: null,
    ...rest,
  }
}

/**
 * The step before, at the top of the minute.
 */
const PREVIOUS = stepOf({ index: 0, atMs: 0 })

/**
 * What the mod saw, with one thing in it.
 *
 * @param over the thing
 * @returns what it saw
 */
const seenOf = (over: Partial<Seen> = {}): Seen => ({ ...NO_SEEN, ...over })

describe('an ordinary step', () => {
  test('a small write beside a large read is never flagged', () => {
    expect(missOf(stepOf(), PREVIOUS, NO_SEEN)).toBe(null)
  })

  test('a step with no response is never flagged', () => {
    expect(missOf(stepOf({ usage: null }), PREVIOUS, NO_SEEN)).toBe(null)
  })

  test('a small prefix written whole is under the floor, so it is nothing', () => {
    const tiny = stepOf({
      usage: { model: 'claude-opus-5', input: 200, output: 30, cacheRead: 0, cacheWrite: 900 },
    })

    expect(missOf(tiny, PREVIOUS, NO_SEEN)).toBe(null)
  })
})

describe('naming the cause', () => {
  test('the first request of a loop is cold, and not a fault', () => {
    const miss = missOf(stepOf({ write: 100_000 }), null, NO_SEEN)

    expect(miss?.cause).toBe('cold')
    expect(miss?.sinceMs).toBe(-1)
    expect(isFault(miss)).toBe(false)
  })

  test('a wait past the TTL is the cause, whatever else was true', () => {
    const late = stepOf({ write: 100_000, atMs: MISS_LIMITS.ttlMs + 60_000 })

    expect(missOf(late, PREVIOUS, seenOf({ invalidated: 'tool.describe' }))?.cause).toBe('ttl')
  })

  test('a model that changed under it is named, with both ids', () => {
    const switched = stepOf({ write: 100_000, model: 'claude-haiku-4-5-20251001' })
    const miss = missOf(switched, PREVIOUS, NO_SEEN)

    expect(miss?.cause).toBe('model')
    expect(miss?.detail).toBe('claude-opus-5 → claude-haiku-4-5-20251001')
    expect(miss?.sinceMs).toBe(60_000)
  })

  test('an invalidation is named, whoever asked for it', () => {
    const miss = missOf(stepOf({ write: 100_000 }), PREVIOUS, seenOf({ invalidated: 'tool.describe' }))

    expect(miss?.cause).toBe('invalidate')
    expect(miss?.detail).toBe('tool.describe')
  })

  test('a configuration row written is named after an invalidation', () => {
    const miss = missOf(stepOf({ write: 100_000 }), PREVIOUS, seenOf({ configKey: 'cockpit.hideTabs' }))

    expect(miss?.cause).toBe('config')
  })

  test('a module rebuilt is named where nothing else explains it', () => {
    expect(missOf(stepOf({ write: 100_000 }), PREVIOUS, seenOf({ reloaded: true }))?.cause).toBe(
      'reload',
    )
  })

  test('a write nobody explains says so rather than guessing', () => {
    const miss = missOf(stepOf({ write: 100_000 }), PREVIOUS, NO_SEEN)

    expect(miss?.cause).toBe('unknown')
    expect(miss?.detail).toBe(null)
  })
})

describe('the thresholds', () => {
  test('a write is judged against the request, not the window', () => {
    // Half of a 100k request, on the nose: the share is met.
    const half = stepOf({
      usage: { model: 'claude-opus-5', input: 0, output: 10, cacheRead: 50_000, cacheWrite: 50_000 },
    })

    expect(missOf(half, PREVIOUS, NO_SEEN)).not.toBe(null)

    const under = stepOf({
      usage: { model: 'claude-opus-5', input: 0, output: 10, cacheRead: 60_000, cacheWrite: 40_000 },
    })

    expect(missOf(under, PREVIOUS, NO_SEEN)).toBe(null)
  })

  test('the thresholds are arguments, so a report may print the one it used', () => {
    const step = stepOf({ write: 3_000 })
    const limits = { ttlMs: 1_000, share: 0.01, minTokens: 100 }

    expect(missOf(step, PREVIOUS, NO_SEEN, limits)?.cause).toBe('ttl')
  })
})

describe('the faults of a session', () => {
  test('cold starts are left out of the tally, and their tokens with them', () => {
    const cold = { ...stepOf({ write: 100_000 }), miss: missOf(stepOf({ write: 100_000 }), null, NO_SEEN) }
    const fault = {
      ...stepOf({ write: 80_000 }),
      miss: missOf(stepOf({ write: 80_000 }), PREVIOUS, NO_SEEN),
    }

    expect(faultsOf([cold, fault])).toHaveLength(1)
    expect(faultTokensOf([cold, fault])).toBe(80_000)
  })
})
