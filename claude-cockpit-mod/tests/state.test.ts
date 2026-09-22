import { describe, expect, test, tier } from 'claude-code/testing'

import {
  EMPTY,
  askOf,
  elapsedOf,
  heatOf,
  withAgents,
  withArmed,
  withCall,
  withFile,
  withSent,
  withStatuses,
  withTurn,
} from '../hooks/state'
import type { AgentSeen, Vitals } from '../hooks/state'

tier('user')

const CALL = { tool: 'Read', detail: 'a.ts', ms: 10, isErrored: false }

const READ = { kind: 'read' as const, added: 0, removed: 0 }

const VITALS: Vitals = {
  model: 'claude-opus-5',
  turns: 3,
  tokens: 40_000,
  window: 200_000,
  percent: 20,
  costUsd: 1.5,
  limits: [],
  categories: [],
  plugins: [],
}

const AGENT: AgentSeen = {
  id: 'a1',
  type: 'Explore',
  name: null,
  status: 'running',
  description: 'look for the parser',
  parentId: null,
}

describe('state', () => {
  test('a call is tallied, listed and credited to the file it touched', () => {
    const state = withCall(EMPTY, CALL, [{ path: '/w/a.ts', ...READ }], 100)

    expect(state.tools).toEqual([{ tool: 'Read', calls: 1, ms: 10, failed: 0 }])
    expect(state.recent).toEqual([CALL])
    expect(state.files).toEqual([
      {
        path: '/w/a.ts',
        reads: 1,
        writes: 0,
        added: 0,
        removed: 0,
        status: null,
        atMs: 100,
      },
    ])
  })

  test('one call touching several files credits each of them', () => {
    const state = withCall(
      EMPTY,
      { ...CALL, tool: 'Bash' },
      [
        { path: '/w/a.ts', ...READ },
        { path: '/w/b.ts', kind: 'write', added: 0, removed: 0 },
      ],
      100,
    )

    expect(state.files.map(file => file.path)).toEqual(['/w/b.ts', '/w/a.ts'])
  })

  test('a second call to one tool adds to its row rather than making another', () => {
    const once = withCall(EMPTY, CALL, [], 100)
    const twice = withCall(once, { ...CALL, ms: 30, isErrored: true }, [], 200)

    expect(twice.tools).toEqual([{ tool: 'Read', calls: 2, ms: 40, failed: 1 }])
    expect(twice.recent).toHaveLength(2)
  })

  test('the heaviest tool leads the tallies, whatever order the calls came in', () => {
    const light = withCall(EMPTY, { ...CALL, tool: 'Glob', ms: 5 }, [], 100)
    const heavy = withCall(light, { ...CALL, tool: 'Bash', ms: 900 }, [], 200)

    expect(heavy.tools.map(tool => tool.tool)).toEqual(['Bash', 'Glob'])
  })

  test('a written file outweighs a read one, so the rewritten file leads', () => {
    const read = withFile([], { path: 'a.ts', ...READ }, 100)
    const readTwice = withFile(read, { path: 'a.ts', ...READ }, 200)

    const written = withFile(
      readTwice,
      { path: 'b.ts', kind: 'write', added: 0, removed: 0 },
      300,
    )

    expect(written.map(file => file.path)).toEqual(['b.ts', 'a.ts'])
    expect(
      heatOf({
        path: 'b.ts',
        reads: 0,
        writes: 1,
        added: 0,
        removed: 0,
        status: null,
        atMs: 300,
      }),
    ).toBe(2)
  })

  test('what a file moved over a session is what its edits moved, added up', () => {
    const once = withFile(
      [],
      { path: 'a.ts', kind: 'write', added: 4, removed: 1 },
      100,
    )

    const twice = withFile(
      once,
      { path: 'a.ts', kind: 'write', added: 2, removed: 6 },
      200,
    )

    expect(twice[0]?.added).toBe(6)
    expect(twice[0]?.removed).toBe(7)
  })

  test('git marks the files it named and clears the ones it did not', () => {
    const files = withFile([], { path: '/w/a.ts', ...READ }, 100)
    const marked = withStatuses(files, new Map([['/w/a.ts', ' M']]))

    expect(marked[0]?.status).toBe(' M')
    expect(withStatuses(marked, new Map())[0]?.status).toBeNull()
  })

  test('a turn with no context reading leaves the sparkline where it was', () => {
    const read = withTurn(EMPTY, VITALS)
    const blind = withTurn(read, { ...VITALS, percent: null })

    expect(read.history).toEqual([{ percent: 20, costUsd: 1.5 }])
    expect(blind.history).toEqual(read.history)
    expect(blind.vitals.percent).toBeNull()
  })

  test('the same file arms and disarms, and a second one joins it', () => {
    const one = withArmed(EMPTY, 'a.ts')

    expect(one.armed).toEqual(['a.ts'])
    expect(withArmed(one, 'a.ts').armed).toEqual([])

    // A question is often about two files rather than one, so arming a
    // second keeps the first, in the order they were armed.
    const two = withArmed(one, 'b.ts')

    expect(two.armed).toEqual(['a.ts', 'b.ts'])
    expect(withArmed(two, 'a.ts').armed).toEqual(['b.ts'])
  })

  test('the note names every file that is armed, in one block', () => {
    expect(askOf(['a.ts'])).toContain('a.ts')

    const both = askOf(['a.ts', 'b.ts'])

    expect(both).toContain('a.ts')
    expect(both).toContain('b.ts')

    // One block for all of them: the same sentence twice is the same
    // sentence twice.
    expect(both.split('cockpit').length - 1).toBe(1)

    expect(askOf([])).toBe('')
  })

  test('the files that went with the prompt are the ones the rows say went', () => {
    const sent = withSent(withArmed(withArmed(EMPTY, 'a.ts'), 'b.ts'))

    expect(sent.armed).toEqual([])
    expect(sent.sent).toEqual(['a.ts', 'b.ts'])

    // A prompt with nothing armed sends nothing and says nothing.
    expect(withSent(sent)).toBe(sent)

    // The word stands until others are armed and go in their turn.
    expect(withSent(withArmed(sent, 'c.ts')).sent).toEqual(['c.ts'])
  })

  test('an agent starts when the spawn said it did, not when the poll saw it', () => {
    const state = withAgents(EMPTY, [AGENT], 5_000, new Map([['a1', 1_000]]))

    expect(state.agents[0]?.startedMs).toBe(1_000)
    expect(state.agents[0]?.endedMs).toBeNull()
    expect(elapsedOf(state.agents[0]!, 5_000)).toBe(4_000)
  })

  test('an agent the engine stops listing keeps its row and its outcome', () => {
    const running = withAgents(EMPTY, [AGENT], 1_000)
    const done = withAgents(running, [{ ...AGENT, status: 'completed' }], 3_000)
    const gone = withAgents(done, [], 9_000)

    expect(done.agents[0]?.endedMs).toBe(3_000)
    expect(gone.agents).toHaveLength(1)
    expect(gone.agents[0]?.status).toBe('completed')
    expect(elapsedOf(gone.agents[0]!, 9_000)).toBe(2_000)
  })

  test('an agent that leaves the list while it ran stops its clock there', () => {
    const running = withAgents(EMPTY, [AGENT], 1_000)
    const gone = withAgents(running, [], 4_000)

    expect(gone.agents[0]?.status).toBe('gone')
    expect(gone.agents[0]?.endedMs).toBe(4_000)
    expect(withAgents(gone, [], 9_000).agents[0]?.endedMs).toBe(4_000)
  })

  test('a child sits under the agent that spawned it', () => {
    const child: AgentSeen = { ...AGENT, id: 'a2', parentId: 'a1' }
    const state = withAgents(EMPTY, [child, AGENT], 1_000)

    expect(state.agents.map(row => [row.id, row.depth])).toEqual([
      ['a1', 0],
      ['a2', 1],
    ])
  })

  test('a child whose parent is not listed is drawn as a root of its own', () => {
    const orphan: AgentSeen = { ...AGENT, id: 'a2', parentId: 'gone' }
    const state = withAgents(EMPTY, [orphan], 1_000)

    expect(state.agents[0]?.depth).toBe(0)
  })
})
