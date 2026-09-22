/**
 * What the person has done with Claude Code on this machine, from the one
 * file that answers it cheaply: `~/.claude/history.jsonl`, one line per
 * prompt typed, with its instant, its session and its project.
 *
 * It says nothing about tokens, and this module never pretends otherwise.
 * The counts that would need them live in the transcripts — 2 GB of them,
 * many past the 4 MiB one `$.fs.read` will carry — so what is counted here
 * is prompts, sessions, projects and days, and the tab names them as such.
 *
 * Pure: text in, rows out; rows and a clock in, figures out. No `$`.
 */

import { STATS_MAX_LINES } from '../names'

/**
 * One prompt as the history file records it.
 */
export type Prompt = {
  atMs: number
  sessionId: string
  project: string
}

/**
 * One day with at least one prompt on it.
 */
export type Day = {
  /**
   * The day's index: whole local days since the epoch, so two instants of the
   * same local day share it and the next day is this plus one.
   */
  day: number
  prompts: number
}

/**
 * The window the figures are read over.
 */
export type Range = 'all' | 'd30' | 'd7'

/**
 * What the Stats tab draws.
 */
export type Stats = {
  prompts: number
  sessions: number
  projects: number

  /**
   * Days with at least one prompt, and the days the window spans: `17/18`.
   */
  activeDays: number
  spanDays: number

  /**
   * The busiest day of the window, or null for an empty window.
   */
  busiest: Day | null

  /**
   * The project the most prompts were typed in, or null for an empty window.
   */
  topProject: { project: string; prompts: number } | null

  /**
   * Consecutive active days ending today — or ending yesterday where today
   * has no prompt yet, so a streak is not reported broken before the day's
   * first one.
   */
  currentStreak: number
  longestStreak: number

  /**
   * The first and last prompt of the window, or null where it holds none.
   */
  firstMs: number | null
  lastMs: number | null

  /**
   * Every active day of the window, oldest first: what the calendar draws.
   */
  days: readonly Day[]
}

/**
 * A window with nothing in it.
 */
export const NO_STATS: Stats = {
  prompts: 0,
  sessions: 0,
  projects: 0,
  activeDays: 0,
  spanDays: 0,
  busiest: null,
  topProject: null,
  currentStreak: 0,
  longestStreak: 0,
  firstMs: null,
  lastMs: null,
  days: [],
}

/**
 * The local day an instant falls on, as a whole count of days: the index the
 * calendar and the streaks are built on.
 *
 * The offset is the one `Date.prototype.getTimezoneOffset` gives — minutes
 * behind UTC, so Paris in summer is -120 — and it is passed in rather than
 * read, so every rule here is one a test can state without a time zone.
 *
 * @param ms the instant
 * @param offsetMin the local offset in minutes behind UTC
 * @returns the day index
 */
export const dayOf = (ms: number, offsetMin: number): number =>
  Math.floor((ms - offsetMin * 60_000) / 86_400_000)

/**
 * The instant a day index begins at, local midnight.
 *
 * @param day the day index
 * @param offsetMin the local offset in minutes behind UTC
 * @returns the instant
 */
export const startOf = (day: number, offsetMin: number): number =>
  day * 86_400_000 + offsetMin * 60_000

/**
 * The prompts a history file records, newest last, lines that are not one
 * skipped rather than failing the read.
 *
 * The file grows forever and only its tail is drawn, so the read keeps the
 * last STATS_MAX_LINES lines and no more: a file of a hundred thousand
 * prompts costs the same as one of a thousand.
 *
 * @param text the file's text
 * @returns the prompts, oldest first
 */
export function promptsOf(text: string): readonly Prompt[] {
  const lines = text.split('\n').slice(-STATS_MAX_LINES)
  const prompts: Prompt[] = []

  for (const line of lines) {
    if (line.trim() === '') {
      continue
    }

    let row: unknown

    try {
      row = JSON.parse(line)
    } catch {
      continue
    }

    // One cast, at the boundary where JSON becomes a type: the file names its
    // instant `timestamp`, and every field is checked before it is read.
    const one = row as {
      timestamp?: unknown
      sessionId?: unknown
      project?: unknown
    } | null

    if (!one || typeof one !== 'object' || typeof one.timestamp !== 'number') {
      continue
    }

    prompts.push({
      atMs: one.timestamp,
      sessionId: typeof one.sessionId === 'string' ? one.sessionId : '',
      project: typeof one.project === 'string' ? one.project : '',
    })
  }

  return prompts.sort((a, b) => a.atMs - b.atMs)
}

/**
 * The figures of one window.
 *
 * @param prompts every prompt the history holds, in any order
 * @param nowMs the engine's clock
 * @param range the window
 * @param offsetMin the local offset in minutes behind UTC
 * @returns the figures
 */
export function statsOf(
  prompts: readonly Prompt[],
  nowMs: number,
  range: Range,
  offsetMin: number,
): Stats {
  const today = dayOf(nowMs, offsetMin)
  const span = range === 'd7' ? 7 : range === 'd30' ? 30 : 0
  const from = span === 0 ? -Infinity : today - (span - 1)

  const inRange = prompts.filter(one => dayOf(one.atMs, offsetMin) >= from)

  if (inRange.length === 0) {
    return { ...NO_STATS, spanDays: span }
  }

  const counts = new Map<number, number>()
  const sessions = new Set<string>()
  const projects = new Map<string, number>()

  for (const one of inRange) {
    const day = dayOf(one.atMs, offsetMin)

    counts.set(day, (counts.get(day) ?? 0) + 1)
    sessions.add(one.sessionId)
    projects.set(one.project, (projects.get(one.project) ?? 0) + 1)
  }

  const days = [...counts.entries()]
    .map(([day, count]) => ({ day, prompts: count }))
    .sort((a, b) => a.day - b.day)

  const first = inRange[0]?.atMs ?? null
  const last = inRange[inRange.length - 1]?.atMs ?? null

  const busiest = days.reduce<Day | null>(
    (high, one) => (high === null || one.prompts > high.prompts ? one : high),
    null,
  )

  const top = [...projects.entries()]
    .map(([project, count]) => ({ project, prompts: count }))
    .sort((a, b) => b.prompts - a.prompts)[0]

  const firstDay = days[0]?.day ?? today

  return {
    prompts: inRange.length,
    sessions: sessions.size,
    projects: projects.size,
    activeDays: days.length,
    spanDays: span === 0 ? today - firstDay + 1 : span,
    busiest,
    topProject: top ?? null,
    currentStreak: currentStreakOf(counts, today),
    longestStreak: longestStreakOf(days),
    firstMs: first,
    lastMs: last,
    days,
  }
}

/**
 * The run of active days ending today, or ending yesterday where today has
 * no prompt yet: a streak is not broken at midnight, it is broken by a day
 * that goes by without one, and the day in progress is not yet that.
 *
 * @param counts how many prompts each active day holds
 * @param today the day index the clock falls on
 * @returns the run's length in days
 */
export function currentStreakOf(
  counts: ReadonlyMap<number, number>,
  today: number,
): number {
  let day = counts.has(today) ? today : today - 1
  let run = 0

  while (counts.has(day)) {
    run += 1
    day -= 1
  }

  return run
}

/**
 * The longest run of consecutive active days the window holds.
 *
 * @param days the active days, oldest first
 * @returns the run's length in days
 */
export function longestStreakOf(days: readonly Day[]): number {
  let best = 0
  let run = 0
  let previous: number | null = null

  for (const one of days) {
    run = previous !== null && one.day === previous + 1 ? run + 1 : 1
    previous = one.day
    best = Math.max(best, run)
  }

  return best
}

/**
 * The calendar the tab draws: one column a week, one row a weekday, the last
 * column the week the clock falls in.
 *
 * The count of a day with no prompt is 0, and a cell outside the window — a
 * weekday of the last week that has not happened yet — is null, so the
 * drawing can leave it blank rather than draw it as a quiet day.
 *
 * @param days the active days of the window
 * @param nowMs the engine's clock
 * @param weeks how many columns the pane has room for, at least 1
 * @param offsetMin the local offset in minutes behind UTC
 * @returns the columns, oldest first, seven days each, Monday first
 */
export function calendarOf(
  days: readonly Day[],
  nowMs: number,
  weeks: number,
  offsetMin: number,
): readonly (readonly (number | null)[])[] {
  const width = Math.max(1, Math.floor(weeks))
  const today = dayOf(nowMs, offsetMin)
  const counts = new Map(days.map(one => [one.day, one.prompts]))

  // Day 0 of the epoch was a Thursday, so Monday-first weekday of a day
  // index is `(day + 3) % 7`.
  const weekday = (day: number): number => (((day + 3) % 7) + 7) % 7

  // The Monday of the last column: the week the clock falls in.
  const lastMonday = today - weekday(today)

  return Array.from({ length: width }, (_unused, column) => {
    const monday = lastMonday - (width - 1 - column) * 7

    return Array.from({ length: 7 }, (_also, row) => {
      const day = monday + row

      return day > today ? null : (counts.get(day) ?? 0)
    })
  })
}
