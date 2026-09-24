/**
 * The project's history: what each session found, decided and saved, kept on disk from one session to the next.
 *
 * `$.store` refuses past 4 MiB and is shared by every project, so the detail lives in one JSON file per project
 * under the home directory, and the store keeps only a pointer and two counters. `$.fs` has no delete: the file
 * is bounded by rewriting it without its oldest sessions, which is the only purge there is.
 *
 * Everything here is pure — parse, fold, count, format. The register reads and writes the file.
 */

import { say } from '../say'
import { isDetected } from './detect'
import { duration, hashOf, kilo } from './text'
import { DEAD_RULE_SESSIONS, HISTORY_SESSIONS, KIND_MAX, MUTE_SESSIONS } from './types'
import type { Choice, StaleRule, State } from './types'

/** One pattern as one session left it. `savedMs` and `savedChars` are two measures, never added together. */
export type PatternEntry = { kind: string; seen: number; decision: Choice | null; ignored: number; savedMs: number; savedChars: number; byCode: boolean }

/** One session: when it started, what the judge cost it, and every pattern it cited or decided. */
export type SessionEntry = { id: string; at: number; judgeRuns: number; judgeTokens: number; patterns: Record<string, PatternEntry> }

/** The whole file: the sessions oldest first, when each behaviour was last unmuted, and when each rule was written. */
export type History = { sessions: SessionEntry[]; unmuted: Record<string, number>; rules: Record<string, number> }

/** A project with no history yet. */
export const EMPTY_HISTORY: History = { sessions: [], unmuted: {}, rules: {} }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

const choiceOf = (v: unknown): Choice | null => (v === 'keep' || v === 'steer' || v === 'kill' ? v : null)

const patternEntryOf = (v: unknown): PatternEntry | null => {
  if (!isRecord(v) || typeof v['kind'] !== 'string') return null
  return {
    kind: v['kind'].slice(0, KIND_MAX), seen: num(v['seen']), decision: choiceOf(v['decision']), ignored: num(v['ignored']),
    savedMs: num(v['savedMs']), savedChars: num(v['savedChars']), byCode: v['byCode'] === true,
  }
}

const sessionEntryFrom = (v: unknown): SessionEntry | null => {
  if (!isRecord(v) || typeof v['id'] !== 'string' || !isRecord(v['patterns'])) return null
  const patterns: Record<string, PatternEntry> = {}
  for (const [id, raw] of Object.entries(v['patterns'])) {
    const entry = patternEntryOf(raw)
    if (entry !== null) patterns[id] = entry
  }
  return { id: v['id'], at: num(v['at']), judgeRuns: num(v['judgeRuns']), judgeTokens: num(v['judgeTokens']), patterns }
}

/**
 * Reads a history file, dropping whatever does not validate: a file edited by hand, cut short by a crash or
 * written by a later version still yields every session it can.
 *
 * @param text the file's contents, or null when there is none
 * @returns the history
 */
export const parseHistory = (text: string | null): History => {
  if (text === null) return EMPTY_HISTORY
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return EMPTY_HISTORY
  }
  if (!isRecord(root)) return EMPTY_HISTORY
  const sessions = Array.isArray(root['sessions']) ? root['sessions'].map(sessionEntryFrom).filter((e): e is SessionEntry => e !== null) : []
  return { sessions: sessions.slice(-HISTORY_SESSIONS), unmuted: datesOf(root['unmuted']), rules: datesOf(root['rules']) }
}

// An id → date table, whatever does not validate dropped to 0.
const datesOf = (v: unknown): Record<string, number> => {
  const dates: Record<string, number> = {}
  if (isRecord(v)) for (const [id, at] of Object.entries(v)) dates[id] = num(at)
  return dates
}

/**
 * The history with a rule recorded as written now: the date `staleRules` measures the sessions after it from.
 *
 * @param history the project's history
 * @param id the pattern the rule was written for
 * @param at now
 * @returns the history to write
 */
export const withRule = (history: History, id: string, at: number): History => ({ ...history, rules: { ...history.rules, [id]: at } })

/**
 * The written rules worth offering for removal. A rule that works keeps its behaviour away, so a behaviour
 * that stopped turning up proves nothing on its own: a rule is offered only when DEAD_RULE_SESSIONS sessions
 * since it was written never saw its behaviour, and the sessions before the one that wrote it never had
 * either — the behaviour was a one-off, and the rule is a line every request pays for nothing. A rule the
 * history has no date for was written before the history knew, and is left alone.
 *
 * @param history the project's history
 * @param marked the rules CLAUDE.md carries, by pattern id
 * @returns the ones to offer, with how many quiet sessions stand behind each
 */
export const staleRules = (history: History, marked: readonly { patternId: string; text: string }[]): StaleRule[] =>
  marked.flatMap(rule => {
    const writtenAt = history.rules[rule.patternId]
    if (writtenAt === undefined) return []
    const after = history.sessions.filter(s => s.at > writtenAt)
    // The session that wrote the rule started before it was written, and it saw the behaviour: that is why.
    const writing = history.sessions.filter(s => s.at <= writtenAt).at(-1)
    const before = history.sessions.filter(s => s.at <= writtenAt && s !== writing)
    const saw = (s: SessionEntry): boolean => (s.patterns[rule.patternId]?.seen ?? 0) > 0
    if (after.length < DEAD_RULE_SESSIONS || after.some(saw) || before.some(saw)) return []
    return [{ patternId: rule.patternId, text: rule.text, sessions: after.length }]
  })

/**
 * Where a project's file of one kind lives: one file per working directory, named after the directory so a
 * person can find it, and tagged with a hash so two directories whose names fold to the same slug never share one.
 *
 * @param home the home directory
 * @param cwd the project's working directory
 * @param dir the kind of file: `history`, `timing`
 * @returns `<home>/.claude/contextmanager/<dir>/<slug>-<hash>.json`, forward slashes
 */
export const projectFile = (home: string, cwd: string, dir: string): string => {
  const posix = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  const slug = posix.replace(/^[A-Za-z]:/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'root'
  return `${home.replaceAll('\\', '/').replace(/\/+$/, '')}/.claude/contextmanager/${dir}/${slug}-${hashOf(posix.toLowerCase())}.json`
}

/**
 * Where a project's history lives.
 *
 * @param home the home directory
 * @param cwd the project's working directory
 * @returns `<home>/.claude/contextmanager/history/<slug>-<hash>.json`, forward slashes
 */
export const historyPath = (home: string, cwd: string): string => projectFile(home, cwd, 'history')

/**
 * This session as the history keeps it: every pattern it cited, decided or was credited for.
 *
 * @param state the session so far
 * @param id the session's key
 * @param at when it started
 * @returns the entry
 */
export const sessionEntryOf = (state: State, id: string, at: number): SessionEntry => {
  const patterns: Record<string, PatternEntry> = {}
  for (const p of state.patterns) {
    if (p.hits.length === 0 && p.decision === null) continue
    patterns[p.id] = {
      kind: p.kind, seen: p.hits.length, decision: p.decision, ignored: p.ignored,
      savedMs: p.credited?.ms ?? 0, savedChars: p.credited?.chars ?? 0, byCode: isDetected(p.id),
    }
  }
  return { id, at, judgeRuns: state.judge.runs, judgeTokens: state.judge.spent, patterns }
}

/**
 * The history with this session's entry in it: replaced where the session is already listed, appended where
 * it is new, and the oldest sessions dropped past HISTORY_SESSIONS.
 *
 * @param history what the file held
 * @param entry this session
 * @returns the history to write
 */
export const withSession = (history: History, entry: SessionEntry): History => {
  const others = history.sessions.filter(s => s.id !== entry.id)
  return { ...history, sessions: [...others, entry].sort((a, b) => a.at - b.at).slice(-HISTORY_SESSIONS) }
}

/**
 * The behaviours that stay quiet in this project: ignored in MUTE_SESSIONS distinct sessions since they were
 * last unmuted. Three ignores in one session are one opinion, not three.
 *
 * @param history the project's history
 * @returns the muted pattern ids, sorted
 */
export const mutedOf = (history: History): string[] => {
  const counts = new Map<string, number>()
  for (const s of history.sessions) {
    for (const [id, p] of Object.entries(s.patterns)) {
      if (p.decision !== 'keep' || s.at <= (history.unmuted[id] ?? -1)) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= MUTE_SESSIONS).map(([id]) => id).sort()
}

/**
 * The history with a behaviour unmuted: the sessions that ignored it before now no longer count.
 *
 * @param history the project's history
 * @param id the pattern to hear again
 * @param at now
 * @returns the history to write
 */
export const unmuted = (history: History, id: string, at: number): History => ({ ...history, unmuted: { ...history.unmuted, [id]: at } })

/** One behaviour over every session of the project. */
export type StatRow = { id: string; kind: string; sessions: number; seen: number; fixed: number; ignored: number; savedMs: number; savedChars: number; byCode: boolean }

/**
 * Every behaviour the project's sessions met, most seen first; the kind is the newest session's words.
 *
 * @param history the project's history, this session included
 * @returns one row per pattern id
 */
export const statRows = (history: History): StatRow[] => {
  const rows = new Map<string, StatRow>()
  for (const s of history.sessions) {
    for (const [id, p] of Object.entries(s.patterns)) {
      const row = rows.get(id) ?? { id, kind: p.kind, sessions: 0, seen: 0, fixed: 0, ignored: 0, savedMs: 0, savedChars: 0, byCode: p.byCode }
      rows.set(id, {
        ...row, kind: p.kind, sessions: row.sessions + 1, seen: row.seen + p.seen,
        fixed: row.fixed + (p.decision === 'steer' || p.decision === 'kill' ? 1 : 0),
        ignored: row.ignored + (p.decision === 'keep' ? 1 : 0),
        savedMs: row.savedMs + p.savedMs, savedChars: row.savedChars + p.savedChars,
      })
    }
  }
  return [...rows.values()].sort((a, b) => b.seen - a.seen || a.id.localeCompare(b.id))
}

const STATS_ROWS = 20   // behaviours `/manager stats` lists before folding the rest

/**
 * What `/manager stats` answers: one line per behaviour, then what the audit cost across the sessions — the
 * saving in time and in characters, the cost in tokens, each in its own column and never summed.
 *
 * @param history the project's history, this session included
 * @param muted the ids that stay quiet here
 * @returns the reply
 */
export const statsText = (history: History, muted: readonly string[]): string => {
  const rows = statRows(history)
  if (rows.length === 0) return say().command.statsEmpty(history.sessions.length)
  const t = say().command
  const lines = rows.slice(0, STATS_ROWS).map(r => t.statsLine({
    kind: r.kind, sessions: r.sessions, seen: r.seen, fixed: r.fixed, ignored: r.ignored,
    savedTime: r.savedMs > 0 ? duration(r.savedMs) : null, savedChars: r.savedChars > 0 ? kilo(r.savedChars) : null,
    byCode: r.byCode, muted: muted.includes(r.id),
  }))
  const rest = rows.length - STATS_ROWS
  const runs = history.sessions.reduce((n, s) => n + s.judgeRuns, 0)
  const tokens = history.sessions.reduce((n, s) => n + s.judgeTokens, 0)
  return [
    t.statsHeader(history.sessions.length),
    ...lines,
    ...(rest > 0 ? [t.statsMore(rest)] : []),
    t.statsAudit(runs, kilo(tokens)),
  ].join('\n')
}
