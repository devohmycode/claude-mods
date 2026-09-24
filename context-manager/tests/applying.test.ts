import { describe, expect, test } from 'claude-code/testing'

import { appliedFor, editedSince, isApplicable, rewriteOf, testCandidates, watchStep } from '../hooks/core/apply'
import { detect } from '../hooks/core/detect'
import { shouldRun } from '../hooks/core/judge'
import { cardOf, reduce } from '../hooks/core/patterns'
import { reportOf, reportPath } from '../hooks/core/report'
import { APPLY_MAX_FAILURES } from '../hooks/core/types'
import type { Pattern, Row, State } from '../hooks/core/types'
import { agentAliases } from '../hooks/core/evidence'
import { bashAnswer } from './fixtures/register/bashAnswer'
import { managerRun } from './fixtures/register/managerRun'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'
import { judgeState } from './fixtures/judge/judgeState'
import { seedState } from './fixtures/patterns/seedState'
import { suitePattern } from './fixtures/patterns/suitePattern'
import { testRow } from './fixtures/patterns/testRow'

const SUITE_ID = 'execution:cm-full-suite-1a2b3c'
const LOG_ID = 'reading:cm-log-dump-4d5e6f'

const applied = (over: Partial<Pattern> = {}): Pattern => ({
  ...suitePattern, id: SUITE_ID, decision: 'kill', applied: { count: 0, failures: 0, stopped: false }, ...over,
})

const logPattern = applied({ id: LOG_ID, signature: { tool: 'Bash', key: 'read:cat app.log' } })

const withSeq = (over: Partial<Omit<Row, 'seq'>>, seq: number): Row => ({ ...testRow(over), seq })

describe('Apply: which calls, and how', () => {
  test('only the two detectors tied to a rewrite can be applied', ($, _on) => {
    expect(isApplicable(applied())).toBe(true)
    expect(isApplicable(logPattern)).toBe(true)
    expect(isApplicable(suitePattern), 'the judge\'s own pattern has no rewrite').toBe(false)
    expect(isApplicable(applied({ signature: null }))).toBe(false)
  })

  test('a source file\'s tests are looked for beside it and under tests/, and a test file answers for itself', ($, _on) => {
    expect(testCandidates('/work/src/auth.ts', '/work')).toEqual([
      '/work/src/auth.test.ts', '/work/src/auth.spec.ts', '/work/tests/auth.test.ts', '/work/test/auth.test.ts',
    ])
    expect(testCandidates('/work/src/auth.test.ts', '/work')).toEqual(['/work/src/auth.test.ts'])
    expect(testCandidates('/work/app/db.py', '/work')).toContain('/work/tests/test_db.py')
    expect(testCandidates('/work/Makefile', '/work')).toEqual([])
  })

  test('the whole suite after one edit becomes that file\'s tests, with a note for Claude', ($, _on) => {
    const plan = rewriteOf(applied(), 'bun test', ['/work/src/auth.ts'], ['/work/src/auth.test.ts'], '/work')
    expect(plan).toEqual({
      type: 'rewrite', command: 'bun test src/auth.test.ts',
      note: '[ContextManager] ran `bun test src/auth.test.ts` instead of `bun test`, as the user asked — run the original command again to get the whole suite.',
    })
    const npm = rewriteOf(applied({ signature: { tool: 'Bash', key: 'test:npm test' } }), 'npm test', ['/work/a.ts'], ['/work/a test.ts'], '/work')
    expect(npm?.type === 'rewrite' ? npm.command : '', 'npm passes a path after --, quoted where it has a space').toBe('npm test -- "a test.ts"')
  })

  test('in doubt, nothing is rewritten', ($, _on) => {
    const cases: [string, string[], string[]][] = [
      ['bun test', ['/a.ts', '/b.ts'], ['/a.test.ts']],               // two files edited
      ['bun test', ['/a.ts'], ['/a.test.ts', '/tests/a.test.ts']],     // two candidate test files
      ['bun test', ['/a.ts'], []],                                     // no test file
      ['bun test | tail -5', ['/a.ts'], ['/a.test.ts']],               // not one plain command
      ['bun test --watch', ['/a.ts'], ['/a.test.ts']],                 // not the command the card named
    ]
    for (const [command, edited, found] of cases) expect(rewriteOf(applied(), command, edited, found, '/work'), command).toBeNull()
    expect(rewriteOf(applied({ applied: { count: 0, failures: 2, stopped: true } }), 'bun test', ['/a.ts'], ['/a.test.ts'], '/work'), 'stopped').toBeNull()
    expect(rewriteOf({ ...applied(), applied: undefined }, 'bun test', ['/a.ts'], ['/a.test.ts'], '/work'), 'never applied').toBeNull()
  })

  test('every third run goes through whole, so a regression elsewhere still shows', ($, _on) => {
    expect(rewriteOf(applied({ applied: { count: 1, failures: 0, stopped: false } }), 'bun test', ['/a.ts'], ['/a.test.ts'], '/work')?.type).toBe('rewrite')
    expect(rewriteOf(applied({ applied: { count: 2, failures: 0, stopped: false } }), 'bun test', ['/a.ts'], ['/a.test.ts'], '/work')).toEqual({ type: 'whole' })
  })

  test('a whole log read becomes its tail; the log itself stays on disk to read', ($, _on) => {
    const plan = rewriteOf(logPattern, 'cat app.log', [], [], '/work')
    expect(plan?.type === 'rewrite' ? plan.command : '').toBe('tail -n 300 app.log')
    expect(rewriteOf(logPattern, 'cat app.log | grep ERROR', [], [], '/work')).toBeNull()
  })

  test('what a run has to cover is what the main loop edited since the last run of it', ($, _on) => {
    const rows = [
      withSeq({ id: 'r1', paths: ['/old.ts'], key: 'other:edit', tool: 'Edit' }, 1),
      withSeq({ id: 'r2' }, 2),
      withSeq({ id: 'r3', paths: ['/a.ts'], key: 'other:edit', tool: 'Edit' }, 3),
      withSeq({ id: 'r4', paths: ['/b.ts'], key: 'other:edit', tool: 'Edit', agent: 'agent-1' }, 4),
    ]
    expect(editedSince(seedState({ rows }), 'test:bun test')).toEqual(['/a.ts'])
    expect(appliedFor(seedState({ patterns: [applied()] }), 'test:bun test')?.id).toBe(SUITE_ID)
    expect(appliedFor(seedState({ patterns: [applied({ applied: { count: 0, failures: 2, stopped: true } })] }), 'test:bun test')).toBeUndefined()
  })
})

describe('Apply: watching what Claude does next', () => {
  const watch = { patternId: SUITE_ID, key: 'test:bun test', left: 2 }

  test('the original run again, right after, charges the rewrite a failure; other calls use up the window', ($, _on) => {
    expect(watchStep(watch, 'test:bun test')).toEqual({ watch: null, failed: SUITE_ID })
    expect(watchStep(watch, 'git:git status')).toEqual({ watch: { ...watch, left: 1 }, failed: null })
    expect(watchStep({ ...watch, left: 1 }, 'git:git status')).toEqual({ watch: null, failed: null })
    expect(watchStep(null, 'test:bun test')).toEqual({ watch: null, failed: null })
  })

  test('two failures stop the rewrite for the session; the count starts again after a whole run', ($, _on) => {
    const on = reduce(seedState({ patterns: [{ ...applied(), applied: undefined }] }), { type: 'apply.on', patternId: SUITE_ID })
    const twice = reduce(reduce(on, { type: 'apply.rewrote', patternId: SUITE_ID }), { type: 'apply.rewrote', patternId: SUITE_ID })
    expect(twice.patterns[0]?.applied?.count).toBe(2)
    expect(reduce(twice, { type: 'apply.whole', patternId: SUITE_ID }).patterns[0]?.applied?.count).toBe(0)
    const failed = Array.from({ length: APPLY_MAX_FAILURES }).reduce<State>(s => reduce(s, { type: 'apply.failed', patternId: SUITE_ID }), on)
    expect(failed.patterns[0]?.applied).toEqual({ count: 0, failures: APPLY_MAX_FAILURES, stopped: true })
    expect(reduce(seedState({ patterns: [suitePattern] }), { type: 'apply.rewrote', patternId: suitePattern.id }).patterns[0]?.applied, 'nothing applied, nothing moves').toBeUndefined()
  })

  test('a card offers Apply only where the /config row is on and the behaviour has a rewrite', ($, _on) => {
    const fresh: Pattern = { ...applied(), decision: null, applied: undefined }
    const card = (state: State): boolean | undefined => cardOf(fresh, state, 1, agentAliases([], [])).canApply
    expect(card(seedState())).toBe(false)
    expect(card(seedState({ canApply: true }))).toBe(true)
    expect(cardOf({ ...suitePattern }, seedState({ canApply: true }), 1, agentAliases([], [])).canApply).toBe(false)
  })

  test('with the row off, /manager apply says so and rewrites nothing', async ($, on) => {
    startsManager(on)
    const commands: string[] = []
    on('tool.call', ($, e) => {
      if (e.tool === 'Bash' && typeof e.command === 'string') commands.push(e.command)
      return bashAnswer(100)
    })
    await $.session.start(SESSION)
    for (const path of ['/work/a.ts', '/work/b.ts']) {
      await $.tool.call({ tool: 'Grep', pattern: path, path: '/work' })
    }
    expect((await $.command.run(managerRun('apply 1'))).text).toBe('ContextManager: nothing to decide on')
    await $.tool.call({ tool: 'Bash', command: 'bun test' })
    expect(commands).toEqual(['bun test'])
  })
})

describe('sensitivity', () => {
  test('quiet waits for twice the work between audits; verbose for half', ($, _on) => {
    const due = judgeState()
    expect(shouldRun(due, 0)).toBe(true)
    expect(shouldRun({ ...due, sensitivity: 'quiet' }, 0)).toBe(false)
    const early = judgeState({ judge: { ...judgeState().judge, lastAtTokens: 20_000 } })
    expect(shouldRun(early, 0)).toBe(false)
    expect(shouldRun({ ...early, sensitivity: 'verbose' }, 0)).toBe(true)
  })

  test('quiet needs one more occurrence before the code names a behaviour; verbose one fewer', ($, _on) => {
    const read = (seq: number): Row => withSeq({ id: `r${seq}`, tool: seq % 2 === 1 ? 'Read' : 'Grep', key: seq % 2 === 1 ? '/a.ts:-' : `Grep:${seq}:/`, cls: seq % 2 === 1 ? 'read' : 'search' }, seq)
    const three = seedState({ rows: [1, 2, 3, 4, 5].map(read) })
    const two = seedState({ rows: [1, 2, 3].map(read) })
    expect(detect(three)).toHaveLength(1)
    expect(detect({ ...three, sensitivity: 'quiet' })).toHaveLength(0)
    expect(detect({ ...two, sensitivity: 'verbose' })).toHaveLength(1)
  })

  test('a reset keeps the sensitivity and the Apply row, which the session never set', ($, _on) => {
    const reset = reduce(seedState({ sensitivity: 'quiet', canApply: true }), { type: 'reset' })
    expect([reset.sensitivity, reset.canApply]).toEqual(['quiet', true])
  })
})

describe('/manager report', () => {
  test('one file per minute under the project, named so a listing sorts by date', ($, _on) => {
    expect(reportPath('C:\\work\\', Date.UTC(2026, 8, 24, 11, 42, 7))).toBe('C:/work/.claude/contextmanager/report-2026-09-24-1142.md')
  })

  test('what repeated and who found it, what it saved, what the audit cost: separate figures', ($, _on) => {
    const found: Pattern = { ...applied(), hits: ['r1', 'r2', 'r3'] }
    const state = seedState({
      turn: 4, rows: [withSeq({ id: 'r1', chars: 9_000 }, 1)], patterns: [found, { ...suitePattern, hits: ['r1'] }],
      saved: { ms: 90_000, chars: 12_000 }, judge: { ...seedState().judge, runs: 2, spent: 8_000 },
    })
    const text = reportOf(state, Date.UTC(2026, 8, 24, 11, 42))
    expect(text).toContain('# ContextManager — session report, 2026-09-24 11:42 UTC')
    expect(text).toContain('4 turns · 1 tool call · 0 compactions')
    expect(text).toContain(`- ${suitePattern.kind} — 3× · fixed · found by code`)
    expect(text).toContain(`- ${suitePattern.kind} — 1× · not decided · found by the audit`)
    expect(text).toContain('- time: 1m 30s')
    expect(text).toContain('- context: 12k characters (~1.5% of the window)')
    expect(text).toContain('- 2 runs · 8k tokens')
    expect(text).toContain('- tests: 9k (100%)')
  })

  test('the command writes the file and says where', async ($, on) => {
    const world = startsManager(on)
    const writes: string[] = []
    on('fs.write', ($, e) => {
      writes.push(e.path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/'))
      return { value: undefined }
    })
    await $.session.start(SESSION)
    const reply = (await $.command.run(managerRun('report'))).text
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatch(/^\/work\/\.claude\/contextmanager\/report-\d{4}-\d{2}-\d{2}-\d{4}\.md$/)
    expect(reply).toContain('ContextManager: report written to /work/.claude/contextmanager/report-')
    expect(world.toasts).toEqual([])
  })
})
