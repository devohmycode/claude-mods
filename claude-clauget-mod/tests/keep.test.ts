import { describe, expect, test, tier } from 'claude-code/testing'

import { NO_LEDGER, withStep, withTurn } from '../hooks/ledger'
import type { Step } from '../hooks/ledger'
import {
  journalOf,
  journalPathOf,
  keptOf,
  restoredOf,
  sessionKeyOf,
  staleKeysOf,
} from '../hooks/keep'
import { NO_SPEND, withDispatch, withModelCall } from '../hooks/spend'

tier('user')

/**
 * One step, filled.
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

/**
 * A session with two steps, one of them missed, and a turn closed.
 */
const LEDGER = withTurn(
  withStep(
    withStep(NO_LEDGER, stepOf()),
    stepOf({
      index: 1,
      agentId: 'a1',
      miss: { cause: 'model', tokens: 90_000, sinceMs: 4_000, detail: 'opus → haiku' },
    }),
  ),
)

/**
 * A mod that has spent something.
 */
const SPEND = withDispatch(withModelCall(NO_SPEND, 'fork', null), 7)

describe('the record', () => {
  test('a session written and read back is the same session', () => {
    const kept = keptOf('s-1', 9_000, LEDGER, SPEND)
    const back = restoredOf(JSON.parse(JSON.stringify(kept)))

    expect(back?.sessionId).toBe('s-1')
    expect(back?.ledger.main).toEqual(LEDGER.main)
    expect(back?.ledger.agents).toEqual(LEDGER.agents)
    expect(back?.ledger.turns).toBe(1)
    expect(back?.ledger.steps).toHaveLength(2)
    expect(back?.ledger.misses[0]?.miss?.cause).toBe('model')
    expect(back?.spend).toEqual(SPEND)
  })

  test('the journal on disk is the same record, readable by eye', () => {
    const text = journalOf(keptOf('s-1', 9_000, LEDGER, SPEND))

    expect(text.endsWith('\n')).toBe(true)
    expect(restoredOf(JSON.parse(text))?.ledger.steps).toHaveLength(2)
  })
})

describe('a record that cannot be read', () => {
  test('nothing at all is nothing', () => {
    expect(restoredOf(undefined)).toBe(null)
    expect(restoredOf(null)).toBe(null)
    expect(restoredOf('{}')).toBe(null)
    expect(restoredOf([])).toBe(null)
  })

  test('another version is not read, rather than half read', () => {
    const kept = { ...keptOf('s-1', 9_000, LEDGER, NO_SPEND), version: 99 }

    expect(restoredOf(JSON.parse(JSON.stringify(kept)))).toBe(null)
  })

  test('a journal whose steps are not steps is refused', () => {
    const kept = JSON.parse(JSON.stringify(keptOf('s-1', 9_000, LEDGER, NO_SPEND)))

    kept.ledger.steps = 'all of them'

    expect(restoredOf(kept)).toBe(null)
  })

  test('one unreadable step is dropped and the rest of the record stands', () => {
    const kept = JSON.parse(JSON.stringify(keptOf('s-1', 9_000, LEDGER, NO_SPEND)))

    kept.ledger.steps[0] = { turnId: 't1' }

    const back = restoredOf(kept)

    expect(back?.ledger.steps).toHaveLength(1)
    expect(back?.ledger.main).toEqual(LEDGER.main)
  })

  test('a cause no version of this mod wrote is not carried into the report', () => {
    const kept = JSON.parse(JSON.stringify(keptOf('s-1', 9_000, LEDGER, NO_SPEND)))

    kept.ledger.steps[1].miss.cause = 'sunspots'

    expect(restoredOf(kept)?.ledger.steps[1]?.miss).toBe(null)
  })
})

describe('rotation', () => {
  test('the store keeps the current session and the last few', () => {
    const keys = ['clauget.session.a', 'clauget.session.b', 'clauget.session.c']

    expect(staleKeysOf(keys, 'clauget.session.c', 2)).toEqual(['clauget.session.a'])
  })

  test('a key of somebody else’s is never dropped', () => {
    const keys = ['cockpit.session.x', 'clauget.session.a', 'clauget.session.b']

    expect(staleKeysOf(keys, 'clauget.session.b', 1)).toEqual(['clauget.session.a'])
  })

  test('under the limit, nothing is dropped', () => {
    expect(staleKeysOf(['clauget.session.a'], 'clauget.session.a', 8)).toEqual([])
  })
})

describe('where things are written', () => {
  test('the store key is the session', () => {
    expect(sessionKeyOf('s-1')).toBe('clauget.session.s-1')
  })

  test('the journal is one file per session under the home directory', () => {
    expect(journalPathOf('C:\\Users\\x\\', 's-1')).toBe('C:/Users/x/.claude/clauget/s-1.json')
    expect(journalPathOf('/home/x', 'a/b c')).toBe('/home/x/.claude/clauget/a-b-c.json')
  })
})
