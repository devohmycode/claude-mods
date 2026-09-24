import { describe, expect, test } from 'claude-code/testing'

import { knownPatternsBlock } from '../hooks/core/blocks'
import { detect, extraCache, isDetected, isWholeSuite } from '../hooks/core/detect'
import { merge } from '../hooks/core/judge'
import { reduce, turnsRange } from '../hooks/core/patterns'
import { quantile } from '../hooks/core/text'
import type { Row, State } from '../hooks/core/types'
import { setSay } from '../hooks/say'
import { seedState } from './fixtures/patterns/seedState'
import { turnEnd } from './fixtures/patterns/turnEnd'

type Call = Partial<Omit<Row, 'seq' | 'id'>>

// The calls a test needs, as the ledger keys them.
const read = (path: string, over: Call = {}): Call => ({ tool: 'Read', key: `${path}:-`, cls: 'read', ...over })
const grep = (pattern = 'TODO'): Call => ({ tool: 'Grep', key: `Grep:${pattern}:/src`, cls: 'search' })
const edit = (path: string): Call => ({ tool: 'Edit', key: path, cls: 'other', paths: [path] })
const suite = (command = 'bun test'): Call => ({ tool: 'Bash', key: `test:${command}`, cls: 'test' })
const install: Call = { tool: 'Bash', key: 'install:bun install', cls: 'install' }
const commit: Call = { tool: 'Bash', key: 'git:git commit -m fix', cls: 'git' }
const logDump = (chars = 30_000, flags: string[] = []): Call => ({ tool: 'Bash', key: 'read:cat app.log', cls: 'read', chars, flags })

// A ledger numbered as the reducer would number it: `r1`, `r2`… in order.
const ledger = (...calls: Call[]): Row[] =>
  calls.map((call, at) => ({
    seq: at + 1, id: `r${at + 1}`, tool: 'Bash', key: 'read:ls', cls: 'read', agent: 'main', turn: 1,
    ms: 10, chars: 100, head: '', flags: [], lines: null, paths: [], spawn: null, ...call,
  }))

const stateOf = (rows: Row[], over: Partial<State> = {}): State =>
  seedState({ rows, seq: rows.length, turn: Math.max(1, ...rows.map(r => r.turn)), ...over })

const ids = (state: State): string[] => detect(state).map(f => f.id)

describe('detect: re-reads', () => {
  test('the same Read three times with other work between is a finding, cited call by call', ($, _on) => {
    const [finding] = detect(stateOf(ledger(read('/src/a.ts'), grep(), read('/src/a.ts'), grep('x'), read('/src/a.ts'))))
    expect(finding?.id).toMatch(/^reading:cm-reread-[0-9a-f]{6}$/)
    expect(finding?.evidence).toEqual(['r1', 'r3', 'r5'])
    expect(finding?.signature).toEqual({ tool: 'Read', key: '/src/a.ts:-' })
    expect(finding?.kind).toBe('Claude keeps re-reading /src/a.ts with nothing changed in between')
    expect(finding?.confidence).toBe(0.9)
  })

  test('twice is a first read and one repeat: not yet a finding', ($, _on) => {
    expect(ids(stateOf(ledger(read('/src/a.ts'), grep(), read('/src/a.ts'))))).toEqual([])
  })

  test('an edit to the file starts the count again; an edit to another file does not', ($, _on) => {
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), read('/a.ts'), edit('/a.ts'), read('/a.ts'), grep('y'), read('/a.ts'))))).toEqual([])
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), read('/a.ts'), edit('/b.ts'), read('/a.ts'))))).toHaveLength(1)
  })

  test('a shell command that may write files starts every count again, an in-place sed included', ($, _on) => {
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), read('/a.ts'), install, read('/a.ts'))))).toEqual([])
    const sed: Call = { tool: 'Bash', key: "read:sed -i 's/a/b/' /a.ts", cls: 'read' }
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), read('/a.ts'), sed, read('/a.ts'))))).toEqual([])
  })

  test('a dedup row costs nothing, and two reads with nothing between are one batch', ($, _on) => {
    const dedup = read('/a.ts', { flags: ['dedup'] })
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), dedup, grep('y'), read('/a.ts'))))).toEqual([])
    expect(ids(stateOf(ledger(read('/a.ts'), read('/a.ts'), grep(), read('/a.ts'))))).toEqual([])
  })

  test('each loop keeps its own count, and a slice at another offset is another read', ($, _on) => {
    const agent = read('/a.ts', { agent: 'agent-1' })
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), agent, grep('y'), read('/a.ts'))))).toEqual([])
    const slice: Call = { tool: 'Read', key: '/a.ts:100-50', cls: 'read' }
    expect(ids(stateOf(ledger(read('/a.ts'), grep(), slice, grep('y'), read('/a.ts'))))).toEqual([])
  })

  test('what a compaction separated is forgotten', ($, _on) => {
    const rows = ledger(read('/a.ts', { turn: 1 }), grep(), read('/a.ts', { turn: 1 }), { ...grep('y'), turn: 2 }, read('/a.ts', { turn: 2 }))
    expect(ids(stateOf(rows, { compactions: [1] }))).toEqual([])
    expect(ids(stateOf(rows))).toHaveLength(1)
  })
})

describe('detect: the whole suite after one-file edits', () => {
  test('a test command is whole when it names no path, file, node or filter', ($, _on) => {
    for (const whole of ['bun test', 'npm test', 'npx vitest run', 'pytest', 'go test ./...', 'bun test --coverage']) expect(isWholeSuite(whole), whole).toBe(true)
    for (const target of ['bun test src/a.test.ts', 'pytest tests/test_a.py', 'pytest a.py::test_b', 'bun test -t auth', 'jest --testNamePattern=x', 'npm test -- auth'])
      expect(isWholeSuite(target), target).toBe(false)
  })

  test('three full runs, each right after an edit to one file, past the baseline', ($, _on) => {
    const rows = ledger(suite(), edit('/a.ts'), suite(), edit('/a.ts'), suite(), edit('/b.ts'), suite())
    const [finding] = detect(stateOf(rows))
    expect(finding?.id).toMatch(/^execution:cm-full-suite-[0-9a-f]{6}$/)
    expect(finding?.evidence, 'r1 is the baseline').toEqual(['r3', 'r5', 'r7'])
    expect(finding?.proposal?.kind).toBe('claude-md')
    expect(finding?.kind).toBe('Claude keeps running the whole `bun test` suite after one-file edits')
  })

  test('a run after two files, after an install, before a commit or with nothing edited is excused', ($, _on) => {
    const two = [edit('/a.ts'), edit('/b.ts')]
    expect(ids(stateOf(ledger(suite(), edit('/a.ts'), suite(), ...two, suite(), edit('/a.ts'), suite())))).toEqual([])
    expect(ids(stateOf(ledger(suite(), edit('/a.ts'), suite(), edit('/a.ts'), install, suite(), edit('/a.ts'), suite())))).toEqual([])
    expect(ids(stateOf(ledger(suite(), edit('/a.ts'), suite(), edit('/a.ts'), suite(), commit, edit('/a.ts'), suite())))).toEqual([])
    expect(ids(stateOf(ledger(suite(), edit('/a.ts'), suite(), suite(), edit('/a.ts'), suite())))).toEqual([])
  })

  test('targeted runs are never counted', ($, _on) => {
    const target = suite('bun test src/a.test.ts')
    expect(ids(stateOf(ledger(target, edit('/a.ts'), target, edit('/a.ts'), target, edit('/a.ts'), target)))).toEqual([])
  })
})

describe('detect: repeated searches and log dumps', () => {
  test('the same search three times with nothing edited between', ($, _on) => {
    const [finding] = detect(stateOf(ledger(grep(), read('/x.ts'), grep(), read('/y.ts'), grep())))
    expect(finding?.id).toMatch(/^reading:cm-same-search-[0-9a-f]{6}$/)
    expect(finding?.evidence).toEqual(['r1', 'r3', 'r5'])
    expect(ids(stateOf(ledger(grep(), read('/x.ts'), grep(), edit('/x.ts'), grep())))).toEqual([])
  })

  test('the same whole log twice; a filtered one, the same size or not, is no dump', ($, _on) => {
    const [finding] = detect(stateOf(ledger(logDump(), grep(), logDump())))
    expect(finding?.id).toMatch(/^reading:cm-log-dump-[0-9a-f]{6}$/)
    expect(finding?.kind).toBe('Claude keeps dumping a whole log with `cat app.log`')
    expect(ids(stateOf(ledger(logDump(2_000), grep(), logDump(2_000))))).toEqual([])
    expect(ids(stateOf(ledger(logDump(2_000, ['persist=90000']), grep(), logDump(2_000, ['persist=90000']))))).toHaveLength(1)
  })
})

describe('detect: what the registry already speaks for', () => {
  const rows = ledger(read('/a.ts'), grep(), read('/a.ts'), grep('y'), read('/a.ts'))

  test('an id the code found is known as such, and the judge is told so', ($, _on) => {
    const state = stateOf(rows)
    const merged = merge(state, detect(state))
    expect(isDetected(merged.patterns[0]?.id ?? '')).toBe(true)
    expect(isDetected('execution:full-suite-after-each-edit')).toBe(false)
    expect(knownPatternsBlock({ ...state, patterns: merged.patterns })).toContain('| found by code')
  })

  test('a decision this session silences it, and so does the judge\'s own card for the same call', ($, _on) => {
    const state = stateOf(rows)
    const merged = merge(state, detect(state))
    const decided = reduce({ ...state, patterns: merged.patterns, cards: merged.fresh }, { type: 'decide', patternId: merged.fresh[0] ?? '', choice: 'keep' })
    expect(detect(decided)).toEqual([])
    const judged = { ...merged.patterns[0]!, id: 'reading:rereads-the-api', decision: null }
    expect(detect({ ...state, patterns: [judged] })).toEqual([])
  })

  test('a behaviour kept in a previous session needs one more occurrence', ($, _on) => {
    const state = stateOf(rows)
    const [finding] = detect(state)
    const previous = { ...merge(state, detect(state)).patterns[0]!, lastDecision: 'keep' as const }
    expect(detect({ ...state, patterns: [previous] })).toEqual([])
    const more = ledger(read('/a.ts'), grep(), read('/a.ts'), grep('y'), read('/a.ts'), grep('z'), read('/a.ts'))
    expect(detect({ ...stateOf(more), patterns: [previous] }).map(f => f.id)).toEqual([finding?.id])
  })

  test('the ids are the same in every session, so a stored pattern finds its detector again', ($, _on) => {
    expect(ids(stateOf(rows))).toEqual(ids(stateOf(rows)))
  })

  test('a detector finding queues a card and leaves the judge\'s bookkeeping alone', ($, _on) => {
    const state = stateOf(rows)
    const merged = merge(state, detect(state))
    const next = reduce(state, { type: 'detect.done', patterns: merged.patterns, fresh: merged.fresh })
    expect(next.cards).toEqual(merged.fresh)
    expect(next.judge).toEqual(state.judge)
  })

  test('the cards read in the session\'s language, opening with its own words', ($, _on) => {
    setSay('fr')
    try {
      const [finding] = detect(stateOf(rows))
      expect(finding?.kind.startsWith('Claude continue de relire /a.ts')).toBe(true)
    } finally {
      setSay('en')
    }
  })
})

describe('detect: switches that rewrite the prompt cache', () => {
  const step = (state: State, effort: string | null, cacheCreate: number | null, model = 'claude-opus-5-5'): State =>
    reduce(state, { type: 'step', model, effort, cacheCreate })

  const steps = (list: readonly [string | null, number | null][], from: State = seedState({ turn: 3 })): State =>
    list.reduce((state, [effort, cache]) => step(state, effort, cache), from)

  test('two switches of effort make a card whose cost is measured against a steady step', ($, _on) => {
    const state = steps([['high', 1_000], ['high', 1_200], ['low', 50_000], ['low', 1_100], ['high', 60_000]])
    expect(state.prefix.breaks.map(b => `${b.cause} ${b.from}→${b.to}`)).toEqual(['effort high→low', 'effort low→high'])
    expect(extraCache(state.prefix.breaks, state.prefix.steady), 'each break less the median steady step, 1.1k').toBe(48_900 + 58_900)
    const [finding] = detect(state)
    expect(finding?.id).toBe('environment:cm-prefix-effort')
    expect(finding?.signature).toBeNull()
    expect(finding?.evidence, 'both switches happened in turn 3: one handle').toEqual(['turn:3'])
    expect(finding?.why).toBe('2 switches (turn 3); the steps right after them wrote ~108k tokens more to the cache than a usual step.')
  })

  test('one switch is a choice, not a behaviour', ($, _on) => {
    expect(detect(steps([['high', 1_000], ['low', 50_000], ['low', 1_000]]))).toEqual([])
  })

  test('a new model is a model switch whatever the effort did, and nothing before a first step is a switch', ($, _on) => {
    const first = step(seedState(), 'high', 1_000, 'claude-opus-5-5')
    expect(first.prefix.breaks).toEqual([])
    const switched = step(first, 'low', 40_000, 'claude-sonnet-5')
    expect(switched.prefix.breaks.map(b => b.cause)).toEqual(['model'])
  })

  test('no steady step yet is no measure: the card says the switches and claims no cost', ($, _on) => {
    const state = steps([['high', null], ['low', 50_000], ['high', 60_000]])
    expect(extraCache(state.prefix.breaks, state.prefix.steady)).toBeNull()
    expect(detect(state)[0]?.why).toBe('2 switches (turn 3).')
  })
})

describe('the run to compaction, as a range', () => {
  const filled = (contexts: number[]): State =>
    seedState({
      turns: contexts.map((context, at) => ({ ...turnEnd({ context }), turn: at + 1, calls: 1 })),
      usage: { window: 200_000, tokens: contexts[contexts.length - 1], percent: 50, compactAt: 180_000 },
    })

  test('the quantile interpolates between the nearest values', ($, _on) => {
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5)
    expect(quantile([10, 20, 30, 40], 0.75)).toBe(32.5)
    expect(quantile([], 0.5)).toBe(0)
  })

  test('an uneven pace gives the fast and the slow end, holding the median estimate between them', ($, _on) => {
    const range = turnsRange(filled([60_000, 65_000, 85_000, 90_000, 110_000, 120_000]))
    // Growth 5k, 20k, 5k, 20k, 10k with 60k left: 3 turns at the fast quartile, 12 at the slow one.
    expect(range).toEqual({ low: 3, high: 12 })
  })

  test('a steady pace, or too few turns, gives no range', ($, _on) => {
    expect(turnsRange(filled([80_000, 90_000, 100_000, 110_000]))).toBeNull()
    expect(turnsRange(filled([80_000, 95_000]))).toBeNull()
  })
})
