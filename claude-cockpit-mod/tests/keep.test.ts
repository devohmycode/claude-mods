import { describe, expect, test, tier } from 'claude-code/testing'

import { keptOf, restoredOf, sessionKeyOf, staleKeysOf } from '../hooks/keep'
import { KEPT_VERSION, STORE_SESSION_PREFIX } from '../hooks/names'
import { EMPTY, elapsedOf } from '../hooks/state'
import type { State } from '../hooks/state'

tier('user')

/**
 * A session that did some work and was left with an agent still running.
 */
const LIVED: State = {
  ...EMPTY,
  files: [
    {
      path: '/w/a.ts',
      reads: 2,
      writes: 1,
      added: 9,
      removed: 3,
      status: ' M',
      atMs: 5_000,
    },
  ],
  tools: [{ tool: 'Read', calls: 2, ms: 40, failed: 1 }],
  recent: [{ tool: 'Read', detail: '/w/a.ts', ms: 20, isErrored: false }],
  history: [{ percent: 12, costUsd: 1.25 }],
  agents: [
    {
      id: 'a1',
      type: 'Explore',
      name: null,
      status: 'running',
      description: 'find the parser',
      parentId: null,
      startedMs: 1_000,
      endedMs: null,
      depth: 0,
    },
  ],
  armed: ['/w/a.ts'],
  vitals: { ...EMPTY.vitals, model: 'claude-opus-5', turns: 3 },
}

describe('keep', () => {
  test('a session finds its own tallies again', () => {
    const back = restoredOf(keptOf(LIVED, 9_000), EMPTY)

    expect(back.files).toEqual(LIVED.files)
    expect(back.tools).toEqual(LIVED.tools)
    expect(back.recent).toEqual(LIVED.recent)
    expect(back.history).toEqual(LIVED.history)
  })

  test('what the record leaves out, a restart does not bring back', () => {
    const back = restoredOf(keptOf(LIVED, 9_000), EMPTY)

    // The Session tab reads its figures when it is looked at, and an hour
    // old reading is worse than none.
    expect(back.vitals).toEqual(EMPTY.vitals)

    // What an armed file adds is invisible by the engine's own contract; it
    // must not outlive the session that armed it and ride a prompt typed the
    // next day.
    expect(back.armed).toEqual([])
  })

  test('an agent still running is closed where the session was left', () => {
    const back = restoredOf(keptOf(LIVED, 9_000), EMPTY)
    const agent = back.agents[0]

    expect(agent?.status).toBe('gone')
    expect(agent?.endedMs).toBe(9_000)

    // Eight seconds of work, not the hours the session spent shut.
    expect(elapsedOf(agent!, 5_000_000)).toBe(8_000)
  })

  test('a record of another shape is not read', () => {
    const wrong = { ...keptOf(LIVED, 9_000), version: KEPT_VERSION + 1 }

    expect(restoredOf(wrong, EMPTY)).toBe(EMPTY)
    expect(restoredOf(undefined, EMPTY)).toBe(EMPTY)
    expect(restoredOf('a record', EMPTY)).toBe(EMPTY)
    expect(restoredOf({ version: KEPT_VERSION, atMs: 1 }, EMPTY)).toBe(EMPTY)
  })

  test('the oldest records are dropped, and never the running session', () => {
    const key = (name: string): string => `${STORE_SESSION_PREFIX}${name}`
    const keys = ['cockpit.tab', key('s1'), key('s2'), key('s3'), key('s4')]

    // Room for three: the running session, oldest of them all, and the two
    // newest beside it.
    expect(staleKeysOf(keys, key('s1'), 3)).toEqual([key('s2')])

    // With no session of its own to spare, the store keeps the newest three.
    expect(staleKeysOf(keys, null, 3)).toEqual([key('s1')])

    // A key that is not a session's is not the cockpit's to drop.
    expect(staleKeysOf(keys, key('s1'), 8)).toEqual([])
  })

  test('a session with no id has no record to find', () => {
    expect(sessionKeyOf('t-1')).toBe(`${STORE_SESSION_PREFIX}t-1`)
    expect(sessionKeyOf('')).toBeNull()
  })
})
