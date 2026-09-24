import { describe, expect, test } from 'claude-code/testing'

import { detect, reExplorations } from '../hooks/core/detect'
import { compactionReport, paneModel, reduce } from '../hooks/core/patterns'
import type { Loop, Row, State } from '../hooks/core/types'
import { bashAnswer } from './fixtures/register/bashAnswer'
import { compactedMessage } from './fixtures/register/compactedMessage'
import { managerRun } from './fixtures/register/managerRun'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'
import { seedState } from './fixtures/patterns/seedState'

type Call = Partial<Omit<Row, 'seq' | 'id'>>

const ledger = (...calls: Call[]): Row[] =>
  calls.map((call, at) => ({
    seq: at + 1, id: `r${at + 1}`, tool: 'Read', key: '/a.ts:-', cls: 'read', agent: 'main', turn: 1,
    ms: 10, chars: 1_000, head: '', flags: [], lines: null, paths: [], spawn: null, ...call,
  }))

const loop = (id: string, firstSeq: number): Loop => ({
  id, run: null, label: null, phase: null, model: null, turns: 1, ms: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  ended: 'answer', firstTurn: 1, firstSeq, outcome: null, calls: 0, edits: 0, checks: 0, reads: 0,
})

const read = (path: string, agent = 'main'): Call => ({ tool: 'Read', key: `${path}:-`, agent })
const grep = (pattern: string, agent = 'main'): Call => ({ tool: 'Grep', key: `Grep:${pattern}:/src`, cls: 'search', agent })

const stateOf = (rows: Row[], over: Partial<State> = {}): State => seedState({ rows, seq: rows.length, turn: 2, ...over })

describe('subagents that re-read what the parent had read', () => {
  const parent = [read('/a.ts'), read('/b.ts'), grep('TODO')]

  test('three looks the parent took before the spawn, taken again by the agent, make a finding', ($, _on) => {
    const rows = ledger(...parent, read('/a.ts', 'agent-1'), read('/b.ts', 'agent-1'), grep('TODO', 'agent-1'), read('/c.ts', 'agent-1'))
    const [finding] = reExplorations(stateOf(rows, { loops: [loop('agent-1', 4)] }), rows)
    expect(finding?.id).toBe('multi-agent:cm-re-explore')
    expect(finding?.evidence, 'the agent\'s rows, each key once').toEqual(['r4', 'r5', 'r6'])
    expect(finding?.proposal?.kind).toBe('agent-brief')
    expect(finding?.why).toBe('1 subagent re-read 3 files or searches the main session had already read before spawning them, 3k characters over again.')
  })

  test('two are not enough, and what the parent read while the agent ran was no brief it could have written', ($, _on) => {
    const two = ledger(read('/a.ts'), read('/b.ts'), read('/a.ts', 'agent-1'), read('/b.ts', 'agent-1'))
    expect(reExplorations(stateOf(two, { loops: [loop('agent-1', 3)] }), two)).toEqual([])
    const during = ledger(read('/x.ts', 'agent-1'), ...parent, read('/a.ts', 'agent-1'), read('/b.ts', 'agent-1'), grep('TODO', 'agent-1'))
    expect(reExplorations(stateOf(during, { loops: [loop('agent-1', 1)] }), during)).toEqual([])
  })

  test('the detector speaks through detect, as the others do', ($, _on) => {
    const rows = ledger(...parent, read('/a.ts', 'agent-1'), read('/b.ts', 'agent-1'), grep('TODO', 'agent-1'))
    expect(detect(stateOf(rows, { loops: [loop('agent-1', 4)] })).map(f => f.id)).toContain('multi-agent:cm-re-explore')
  })
})

describe('what filled the window before a compaction', () => {
  const tests: Call = { tool: 'Bash', key: 'test:bun test', cls: 'test', chars: 6_000 }

  test('the report covers the span since the compaction before, by sink', ($, _on) => {
    const rows = ledger({ ...tests, turn: 1 }, { ...tests, turn: 3 }, { ...read('/a.ts'), turn: 3, chars: 2_000 }, { ...tests, turn: 4 })
    const report = compactionReport(stateOf(rows, { turn: 4, compactions: [2] }))
    expect(report?.turn).toBe(4)
    expect(report?.total, 'turn 1 was before the compaction at turn 2').toBe(14_000)
    expect(report?.sinks.map(s => s.label)).toEqual(['tests', 'reads'])
    expect(compactionReport(stateOf([], { turn: 4 }))).toBeNull()
  })

  test('a compaction keeps its report, and the header states it in shares', ($, _on) => {
    const rows = ledger({ ...tests, turn: 1 }, { ...read('/a.ts'), turn: 1, chars: 2_000 })
    const compacted = reduce(stateOf(rows, { turn: 1 }), { type: 'compact' })
    expect(compacted.lastCompaction?.total).toBe(8_000)
    expect(paneModel(compacted, []).header.compaction).toEqual({ turn: 1, sinks: [{ label: 'tests', share: 75 }, { label: 'reads', share: 25 }] })
  })
})

describe('the prefix every request re-reads', () => {
  test('the header lists its parts largest first, and a reset keeps what the engine measured', ($, _on) => {
    const measured = reduce(seedState(), { type: 'prefix', parts: [{ name: 'System prompt', tokens: 3_100 }, { name: 'System tools', tokens: 12_400 }] })
    expect(paneModel(measured, []).header.prefix).toEqual({ total: 15_500, parts: [{ name: 'System tools', tokens: 12_400 }, { name: 'System prompt', tokens: 3_100 }] })
    expect(reduce(measured, { type: 'reset' }).prefixParts).toEqual(measured.prefixParts)
  })
})

describe('prefix and compaction, in a session', () => {
  test('session.start measures the prefix from /context, without the conversation or deferred schemas', async ($, on) => {
    startsManager(on)

    await $.session.start(SESSION)

    expect((await $.command.run(managerRun('debug'))).text).toContain('prefix parts System prompt 3100 · System tools 12400 · MCP tools 3400')
  })

  test('a compaction says what had filled the window since the one before', async ($, on) => {
    const world = startsManager(on)
    on('tool.call', () => bashAnswer(9_000))
    on('session.compact', ($, e) => ({ messages: e.messages }))

    await $.session.start(SESSION)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'bun test' })
    await $.session.compact({ trigger: 'auto', messages: [compactedMessage] })

    expect(world.toasts).toContain('ContextManager: compacted at turn 1 — tests 100%')
    expect((await $.command.run(managerRun('debug'))).text).toContain('compactions 1 · last at turn 1: tests 9000 of 9000 ch')
  })
})
