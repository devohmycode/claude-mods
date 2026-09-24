import { describe, expect, test } from 'claude-code/testing'

import { detect } from '../hooks/core/detect'
import {
  EMPTY_HISTORY, historyPath, mutedOf, parseHistory, sessionEntryOf, statRows, statsText, unmuted, withSession,
} from '../hooks/core/history'
import type { History, PatternEntry, SessionEntry } from '../hooks/core/history'
import { merge } from '../hooks/core/judge'
import { bandModel, reduce } from '../hooks/core/patterns'
import { HISTORY_SESSIONS, JUDGE_EMPTY_RUNS, JUDGE_MAX_BACKOFF, SETTLE_TURNS } from '../hooks/core/types'
import type { Action, Pattern, Row, State } from '../hooks/core/types'
import { judgeFinding } from './fixtures/judge/judgeFinding'
import { seedState } from './fixtures/patterns/seedState'
import { suitePattern } from './fixtures/patterns/suitePattern'
import { testRow } from './fixtures/patterns/testRow'
import { turnEnd } from './fixtures/patterns/turnEnd'

const ID = suitePattern.id

const entry = (over: Partial<PatternEntry> = {}): PatternEntry =>
  ({ kind: suitePattern.kind, seen: 2, decision: null, ignored: 0, savedMs: 0, savedChars: 0, byCode: false, ...over })

const session = (id: string, at: number, patterns: Record<string, PatternEntry> = {}, judge = { runs: 0, tokens: 0 }): SessionEntry =>
  ({ id, at, judgeRuns: judge.runs, judgeTokens: judge.tokens, patterns })

const ignoredIn = (...ats: number[]): History =>
  ({ sessions: ats.map(at => session(`s${at}`, at, { [ID]: entry({ decision: 'keep' }) })), unmuted: {}, rules: {} })

const withSeq = (over: Partial<Omit<Row, 'seq'>>, seq: number): Row => ({ ...testRow(over), seq })

// A judge run that answered: kept or not, its bookkeeping, nothing else.
const judged = (state: State, kept: number, error: string | null = null): State => {
  const action: Action = {
    type: 'judge.done', patterns: state.patterns, fresh: [], recurred: [], focus: null, time: null, context: null,
    spent: 100, error, returned: kept, kept, dropped: [], usage: null,
  }
  return reduce(state, action)
}

describe('history: the file', () => {
  test('a missing, broken or foreign file is an empty history; what validates survives', ($, _on) => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY)
    expect(parseHistory('{ not json')).toEqual(EMPTY_HISTORY)
    expect(parseHistory('[1, 2]')).toEqual(EMPTY_HISTORY)
    const text = JSON.stringify({ sessions: [session('s1', 1, { [ID]: entry() }), { id: 7 }, 'junk'], unmuted: { [ID]: 5, bad: 'x' } })
    const read = parseHistory(text)
    expect(read.sessions.map(s => s.id)).toEqual(['s1'])
    expect(read.unmuted).toEqual({ [ID]: 5, bad: 0 })
  })

  test('one file per project, found again whatever the slashes and the trailing separator', ($, _on) => {
    const path = historyPath('C:\\Users\\me', 'C:\\Users\\me\\Documents\\GitHub\\My Project')
    expect(path).toMatch(/^C:\/Users\/me\/\.claude\/contextmanager\/history\/Users-me-Documents-GitHub-My-Project-[0-9a-f]{6}\.json$/)
    expect(historyPath('C:\\Users\\me', 'C:/Users/me/Documents/GitHub/My Project/')).toBe(path)
    expect(historyPath('/home/me', '/work/a-b')).not.toBe(historyPath('/home/me', '/work/a/b'))
  })

  test('a session is replaced where it is listed, appended where it is new, and the oldest go past the cap', ($, _on) => {
    const one = withSession(EMPTY_HISTORY, session('s1', 1))
    expect(withSession(one, session('s1', 1, { [ID]: entry() })).sessions).toHaveLength(1)
    const many = Array.from({ length: HISTORY_SESSIONS + 5 }, (_, at) => session(`s${at}`, at))
      .reduce<History>((h, s) => withSession(h, s), EMPTY_HISTORY)
    expect(many.sessions).toHaveLength(HISTORY_SESSIONS)
    expect(many.sessions[0]?.id).toBe('s5')
  })
})

describe('history: this session', () => {
  test('the entry keeps every pattern cited or decided, what it saved, who found it and what the judge cost', ($, _on) => {
    const cited: Pattern = { ...suitePattern, hits: ['r1', 'r2'], decision: 'kill', credited: { ms: 60_000, chars: 9_000 } }
    const untouched: Pattern = { ...suitePattern, id: 'reading:never-cited' }
    const state = seedState({ patterns: [cited, untouched], judge: { ...seedState().judge, runs: 2, spent: 7_400 } })
    const e = sessionEntryOf(state, 's9', 9)
    expect(e).toEqual({
      id: 's9', at: 9, judgeRuns: 2, judgeTokens: 7_400,
      patterns: { [ID]: { kind: suitePattern.kind, seen: 2, decision: 'kill', ignored: 0, savedMs: 60_000, savedChars: 9_000, byCode: false } },
    })
  })

  test('a settled instruction credits its own pattern, not only the session', ($, _on) => {
    const rows = [withSeq({ id: 'r-1', turn: 5, ms: 60_000, chars: 9_000 }, 1)]
    const steered: Pattern = { ...suitePattern, hits: ['r-1'], decision: 'steer', decidedAtTurn: 5, instruction: 'x', openedAtTurn: 5 }
    const settled = reduce(seedState({ turn: 5 + SETTLE_TURNS, rows, patterns: [steered] }), { type: 'turn.complete', stat: turnEnd() })
    expect(settled.patterns[0]?.credited).toEqual({ ms: 60_000, chars: 9_000 })
  })
})

describe('history: what stays quiet in a project', () => {
  test('ignored in three sessions is muted; three times in one session is one opinion', ($, _on) => {
    expect(mutedOf(ignoredIn(1, 2, 3))).toEqual([ID])
    expect(mutedOf(ignoredIn(1, 2))).toEqual([])
    const fixedOnce: History = { ...ignoredIn(1, 2), sessions: [...ignoredIn(1, 2).sessions, session('s3', 3, { [ID]: entry({ decision: 'kill' }) })] }
    expect(mutedOf(fixedOnce)).toEqual([])
  })

  test('unmuting forgets the sessions before it; ignoring it three times more mutes it again', ($, _on) => {
    const back = unmuted(ignoredIn(1, 2, 3), ID, 10)
    expect(mutedOf(back)).toEqual([])
    expect(mutedOf({ ...back, sessions: [...back.sessions, ...ignoredIn(11, 12, 13).sessions] })).toEqual([ID])
  })

  test('a muted behaviour is counted but never carded, by the judge or by the code', ($, _on) => {
    const muted = reduce(seedState({ cards: [ID] }), { type: 'history', muted: [ID] })
    expect(muted.cards, 'a card already waiting leaves too').toEqual([])
    const found = merge(muted, [judgeFinding()])
    const after = reduce(muted, {
      type: 'judge.done', patterns: found.patterns, fresh: found.fresh, recurred: [], focus: null, time: null, context: null,
      spent: 0, error: null, returned: 1, kept: 1, dropped: [], usage: null,
    })
    expect(after.patterns.map(p => p.id)).toContain(ID)
    expect(after.cards).toEqual([])
    const reads = [1, 2, 3, 4, 5].map(seq => withSeq({ id: `r${seq}`, tool: seq % 2 === 1 ? 'Read' : 'Grep', key: seq % 2 === 1 ? '/a.ts:-' : `Grep:${seq}:/`, cls: seq % 2 === 1 ? 'read' : 'search' }, seq))
    const [code] = detect(seedState({ rows: reads }))
    expect(code).toBeDefined()
    expect(detect(seedState({ rows: reads, muted: [code?.id ?? ''] }))).toEqual([])
  })

  test('a reset keeps what the project muted', ($, _on) => {
    expect(reduce(seedState({ muted: [ID] }), { type: 'reset' }).muted).toEqual([ID])
  })
})

describe('history: /manager stats', () => {
  const history: History = {
    sessions: [
      session('s1', 1, { [ID]: entry({ seen: 3, decision: 'kill', savedMs: 120_000, savedChars: 9_000 }) }, { runs: 2, tokens: 30_000 }),
      session('s2', 2, { [ID]: entry({ seen: 2, decision: 'keep' }), 'reading:cm-reread-abc123': entry({ kind: 'Claude keeps re-reading a.ts', seen: 3, byCode: true }) }, { runs: 1, tokens: 12_000 }),
    ],
    unmuted: {},
    rules: {},
  }

  test('one row per behaviour, summed over the sessions, most seen first', ($, _on) => {
    expect(statRows(history).map(r => [r.id, r.sessions, r.seen, r.fixed, r.ignored])).toEqual([
      [ID, 2, 5, 1, 1],
      ['reading:cm-reread-abc123', 1, 3, 0, 0],
    ])
  })

  test('the saving in time and in characters, the cost in tokens: three figures, never one total', ($, _on) => {
    expect(statsText(history, [ID])).toBe([
      'ContextManager — this project, 2 sessions:',
      `- ${suitePattern.kind} — 5× in 2 sessions · fixed 1 · ignored 1 · saved 2m · 9k chars [muted]`,
      '- Claude keeps re-reading a.ts — 3× in 1 session · fixed 0 · ignored 0 [found by code]',
      'Audit: 3 runs · 42k tokens',
    ].join('\n'))
    expect(statsText(EMPTY_HISTORY, [])).toBe('ContextManager: nothing recorded yet in this project (0 sessions)')
  })
})

describe('the audit slows down when it keeps finding nothing', () => {
  test('three answered runs that kept nothing slow it to its floor, and the band says so', ($, _on) => {
    const quiet = [1, 2, 3].reduce(state => judged(state, 0), seedState())
    expect(quiet.emptyRuns).toBe(JUDGE_EMPTY_RUNS)
    expect(quiet.judge.backoff).toBe(JUDGE_MAX_BACKOFF)
    expect(bandModel(quiet).slowed).toBe(true)
  })

  test('a run that failed says nothing about the session, and a run that found something restores the pace', ($, _on) => {
    const two = judged(judged(seedState(), 0), 0)
    expect(judged(two, 0, 'cold snapshot').emptyRuns).toBe(2)
    const slowed = judged(two, 0)
    const found = judged(slowed, 1)
    expect(found.emptyRuns).toBe(0)
    expect(found.judge.backoff).toBe(1)
  })

  test('/manager check wakes it at once', ($, _on) => {
    const slowed = [1, 2, 3].reduce(state => judged(state, 0), seedState())
    const woken = reduce(slowed, { type: 'judge.wake' })
    expect(woken.emptyRuns).toBe(0)
    expect(woken.judge.backoff).toBe(1)
    expect(reduce(seedState(), { type: 'judge.wake' }), 'nothing to wake').toEqual(seedState())
  })
})
