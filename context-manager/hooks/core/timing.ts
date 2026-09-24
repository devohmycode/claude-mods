/**
 * The durations this plugin measured, kept on disk so that reloading the plugin does not lose them.
 *
 * A reload (`/reload-plugins`, a `/config` change, a save under `--plugin-dir`) runs `session.start` again, and
 * the state starts over from the transcript, which records no duration: every row it rebuilds would read 0 ms,
 * and the header would state a time nobody measured. So each call's measured duration is kept here under its
 * `tool_use_id`, and the rebuilt row takes it back. The entry also says when the session was last audited, so
 * a reload close behind an audit does not pay for another one.
 *
 * One JSON file per project, beside the history, holding the few sessions that ran there last. Two sessions
 * may share a project, so each has its own entry, and a write keeps every other session's entry.
 *
 * Pure: the path, parse, fold. The register reads and writes the file.
 */

import { projectFile } from './history'
import { JUDGE_MIN_GAP_MS, ROW_CAP, TIMING_SESSIONS } from './types'

/** One session: its key, when it was last audited (null before any run), and each main-loop call's duration by id. */
export type Timed = { key: string; judgedAt: number | null; ms: Readonly<Record<string, number>> }

/** The whole file: the sessions, newest first. */
export type Timing = readonly Timed[]

/**
 * A session with nothing measured yet.
 *
 * @param key the session's key, `s<startedAt>`
 * @returns the empty entry
 */
export const untimed = (key: string): Timed => ({ key, judgedAt: null, ms: {} })

/**
 * Where a project's timing lives.
 *
 * @param home the home directory
 * @param cwd the project's working directory
 * @returns `<home>/.claude/contextmanager/timing/<slug>-<hash>.json`, forward slashes
 */
export const timingPath = (home: string, cwd: string): string => projectFile(home, cwd, 'timing')

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

const timedOfValue = (v: unknown): Timed | null => {
  if (!isRecord(v) || typeof v['key'] !== 'string' || !isRecord(v['ms'])) return null
  const judgedAt = v['judgedAt']
  const ms = Object.fromEntries(Object.entries(v['ms']).filter((entry): entry is [string, number] => isMs(entry[1])))
  return { key: v['key'], judgedAt: isMs(judgedAt) ? judgedAt : null, ms }
}

/**
 * The file as the plugin can use it: a missing, broken or foreign file is no timing, and an entry that does not
 * validate is left out.
 *
 * @param text the file, or null where there is none
 * @returns the sessions, newest first, at most TIMING_SESSIONS
 */
export const parseTiming = (text: string | null): Timing => {
  if (text === null) return []
  try {
    const value: unknown = JSON.parse(text)
    if (!Array.isArray(value)) return []
    return value.map(timedOfValue).filter((t): t is Timed => t !== null).slice(0, TIMING_SESSIONS)
  } catch {
    return []
  }
}

/**
 * A session's entry in the file, if it has one.
 *
 * @param timing the file
 * @param key the session's key
 * @returns the entry, or undefined
 */
export const timedOf = (timing: Timing, key: string): Timed | undefined => timing.find(t => t.key === key)

/**
 * The file with one session's entry put first. Every other session keeps its entry, and the oldest go past the cap.
 *
 * @param timing the file as last read
 * @param entry this session's entry
 * @returns the file to write
 */
export const withTimed = (timing: Timing, entry: Timed): Timing =>
  [entry, ...timing.filter(t => t.key !== entry.key)].slice(0, TIMING_SESSIONS)

/**
 * The entry with one more call measured. It keeps the newest ROW_CAP calls, since a reload rebuilds no more rows.
 *
 * @param entry the session's entry
 * @param id the call's tool_use_id
 * @param ms what the call took
 * @returns the entry
 */
export const measured = (entry: Timed, id: string, ms: number): Timed => {
  const kept = Object.entries(entry.ms).filter(([k]) => k !== id).slice(-(ROW_CAP - 1))
  return { ...entry, ms: Object.fromEntries([...kept, [id, ms]]) }
}

/**
 * Whether a load is this session coming back close behind an audit. In the `--plugin-dir` loop every save
 * reloads the plugin, and each reload would otherwise pay for a fork over the same history. Past the gap a reload
 * audits as a late join does, since the cards the last run drew were lost with the old state.
 *
 * @param entry the session's entry as the file had it, or undefined for a session this plugin never measured
 * @param now the clock
 * @returns true when the last audit is less than JUDGE_MIN_GAP_MS old
 */
export const auditedLately = (entry: Timed | undefined, now: number): boolean =>
  entry !== undefined && entry.judgedAt !== null && now - entry.judgedAt < JUDGE_MIN_GAP_MS
