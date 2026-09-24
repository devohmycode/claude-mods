import type { On, SessionMessage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { adoptRows } from '../hooks/core/adopt'
import { paneModel } from '../hooks/core/patterns'
import { auditedLately, measured, parseTiming, timedOf, timingPath, untimed, withTimed } from '../hooks/core/timing'
import { JUDGE_MIN_GAP_MS, JUDGE_MIN_ROWS, RECOVERED_FLAG, ROW_CAP, TIMING_SESSIONS } from '../hooks/core/types'
import { assistant } from './fixtures/adopt/assistant'
import { bashUse } from './fixtures/adopt/bashUse'
import { prompt } from './fixtures/adopt/prompt'
import { replyText } from './fixtures/judge/replyText'
import { seedState } from './fixtures/patterns/seedState'
import { bashAnswer } from './fixtures/register/bashAnswer'
import { forkAnswer } from './fixtures/register/forkAnswer'
import { managerRun } from './fixtures/register/managerRun'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'

const HOME = '/home/me'
const CALL_MS = 8_000
// The key of the session `usageAnswer` describes: it started at 0.
const KEY = 's0'

// A path as the host hands it to a stub: on Windows `/home/me/…` arrives as `C:\home\me\…`.
const posix = (path: string): string => path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')

const FILE = posix(timingPath(HOME, SESSION.cwd))

// One prompt, then one finished `bun test` per id: the transcript a reload rebuilds its rows from.
const transcriptOf = (ids: readonly string[]): SessionMessage[] => [prompt('go'), assistant(ids.map(id => bashUse({ tool_use_id: id })))]

// A home directory and a filesystem held in memory.
const disk = (on: On, env: Record<string, string> = {}): { files: Record<string, string> } => {
  const world = { files: {} as Record<string, string> }
  mock.env(on, { USERPROFILE: HOME, ...env })
  on('fs.exists', ($, e) => ({ value: posix(e.path) in world.files }))
  on('fs.read', ($, e) => {
    const text = world.files[posix(e.path)]
    return text === undefined ? { deny: 'no such file' } : { value: text }
  })
  on('fs.write', ($, e) => {
    world.files[posix(e.path)] = e.text
    return { value: undefined }
  })
  return world
}

describe('the timing file', () => {
  test('a call measured before the reload takes its duration back; one nobody timed still says it was rebuilt', ($, _on) => {
    const [timed, rebuilt] = adoptRows(transcriptOf(['u-1', 'u-2']), { 'u-1': 4_000 })
    expect(timed?.ms).toBe(4_000)
    expect(timed?.flags, 'a duration measured is a row like any other').not.toContain(RECOVERED_FLAG)
    expect(rebuilt?.ms).toBe(0)
    expect(rebuilt?.flags).toContain(RECOVERED_FLAG)
  })

  test('each session keeps its own entry, newest first; a broken file is no timing', ($, _on) => {
    expect(parseTiming(null)).toEqual([])
    expect(parseTiming('{')).toEqual([])
    expect(parseTiming('{"key":"s1"}'), 'not a list').toEqual([])
    expect(parseTiming(JSON.stringify([{ key: 's1', judgedAt: 'soon', ms: { a: 5, b: -1, c: 'x' } }, { ms: {} }])), 'what validates survives')
      .toEqual([{ key: 's1', judgedAt: null, ms: { a: 5 } }])
    const sessions = Array.from({ length: TIMING_SESSIONS }, (_, at) => untimed(`s${at}`))
    expect(withTimed(sessions, { ...untimed('s2'), judgedAt: 9 }).map(t => t.key), 'this session first, the others kept').toEqual(['s2', 's0', 's1', 's3'])
    expect(withTimed(sessions, untimed('new')).map(t => t.key), 'a new session pushes the oldest out').toEqual(['new', 's0', 's1', 's2'])
  })

  test('an entry keeps the newest ROW_CAP calls, since a reload rebuilds no more rows', ($, _on) => {
    const full = { ...untimed(KEY), ms: Object.fromEntries(Array.from({ length: ROW_CAP }, (_, at) => [`u-${at}`, at])) }
    const next = measured(full, 'u-new', 7)
    expect(Object.keys(next.ms)).toHaveLength(ROW_CAP)
    expect(next.ms['u-0'], 'the oldest call goes first').toBeUndefined()
    expect(measured(next, 'u-5', 1).ms['u-5'], 'a call measured again keeps its last duration').toBe(1)
  })

  test('only a reload close behind an audit is spared one', ($, _on) => {
    const now = 1_700_000_000_000
    expect(auditedLately(undefined, now), 'a session this plugin never measured is a late join').toBe(false)
    expect(auditedLately(untimed(KEY), now), 'measured, never audited').toBe(false)
    expect(auditedLately({ ...untimed(KEY), judgedAt: now - JUDGE_MIN_GAP_MS + 1 }, now)).toBe(true)
    expect(auditedLately({ ...untimed(KEY), judgedAt: now - JUDGE_MIN_GAP_MS }, now)).toBe(false)
  })

  test('a ledger rebuilt without a single duration reads as not measured, never as 0s', ($, _on) => {
    const rows = (known: Record<string, number>): ReturnType<typeof seedState>['rows'] =>
      adoptRows(transcriptOf(['u-1', 'u-2']), known).map((r, at) => ({ ...r, seq: at + 1 }))
    expect(paneModel(seedState({ rows: rows({}) }), []).header.timeUnmeasured).toBe(true)
    expect(paneModel(seedState({ rows: rows({ 'u-1': 4_000 }) }), []).header.timeUnmeasured, 'one timed call is a measure').toBe(false)
    expect(paneModel(seedState(), []).header.timeUnmeasured, 'no row is no claim').toBe(false)
  })
})

describe('a reload, in a session', () => {
  test('a reload gives the rows it rebuilds the durations measured before it', async ($, on) => {
    const world = startsManager(on)
    const fs = disk(on)
    let transcript: SessionMessage[] = []
    const prompts: string[] = []
    on('session.messages', () => ({ value: transcript }))
    on('tool.call', async () => {
      await world.clock.advance(CALL_MS)
      return bashAnswer(100)
    })
    on('model.fork', ($, e) => {
      prompts.push(e.prompt)
      return { value: forkAnswer(replyText([])) }
    })

    await $.session.start(SESSION)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'bun test' })
    await $.tool.call({ tool: 'Bash', command: 'bun test' })
    await world.clock.settle()
    const ids = Object.keys(timedOf(parseTiming(fs.files[FILE] ?? null), KEY)?.ms ?? {})
    expect(ids, 'each call of the main loop is kept under its id').toHaveLength(2)

    // The same session, reloaded: its transcript holds those two calls, and one the plugin never saw.
    transcript = transcriptOf([...ids, 'u-unseen'])
    await $.session.start(SESSION)
    await $.command.run(managerRun('check'))
    await world.clock.settle()

    expect(prompts[0], 'the first call took its duration back').toContain(`r1 | Bash | test:bun test | test | main | 1 | ${CALL_MS} | 8 | -`)
    expect(prompts[0], 'and so did the second').toContain(`r2 | Bash | test:bun test | test | main | 1 | ${CALL_MS} | 8 | -`)
    expect(prompts[0], 'a call nobody timed still says it was rebuilt').toContain('r3 | Bash | test:bun test | test | main | 1 | 0 | 8 | recovered')
  })

  test('a reload close behind an audit forks nothing; past the gap it audits as a late join does', async ($, on) => {
    const world = startsManager(on)
    const fs = disk(on, { CONTEXTMANAGER_DEBUG: '1' })
    let forks = 0
    on('session.messages', () => ({ value: transcriptOf(Array.from({ length: JUDGE_MIN_ROWS }, (_, at) => `u-${at + 1}`)) }))
    on('model.fork', () => {
      forks += 1
      return { value: forkAnswer(replyText([])) }
    })

    await $.session.start(SESSION)
    await world.clock.settle()
    expect(forks, 'a session this plugin never measured is a late join, audited at load').toBe(1)
    const judgedAt = timedOf(parseTiming(fs.files[FILE] ?? null), KEY)?.judgedAt
    expect(judgedAt, 'and the file says when').not.toBeNull()

    await $.session.start(SESSION)
    await world.clock.settle()
    expect(forks, 'a save under --plugin-dir right after: the same history is not judged again').toBe(1)
    expect(world.logs.join(' ')).toContain('after an audit · nothing to check')

    await world.clock.advance(JUDGE_MIN_GAP_MS)
    await $.session.start(SESSION)
    await world.clock.settle()
    expect(forks, 'past the gap the reload audits: the cards the last run drew went with the old state').toBe(2)
    expect(timedOf(parseTiming(fs.files[FILE] ?? null), KEY)?.judgedAt).toBeGreaterThan(judgedAt ?? Infinity)
  })
})
