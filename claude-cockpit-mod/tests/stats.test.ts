import { describe, expect, test, tier } from 'claude-code/testing'

import { bandOf, calendarRasterOf } from '../hooks/raster'
import {
  calendarOf,
  currentStreakOf,
  dayOf,
  longestStreakOf,
  promptsOf,
  startOf,
  statsOf,
} from '../hooks/stats'
import type { Prompt } from '../hooks/stats'

tier('user')

/**
 * A day in milliseconds, so a fixture reads as the days it means.
 */
const DAY = 86_400_000

/**
 * The window every fixture is built against: UTC, so a day index is a whole
 * number of days from the epoch and a test states no time zone.
 */
const UTC = 0

const at = (day: number, hour = 12): number => day * DAY + hour * 3_600_000

const prompt = (day: number, session = 's1', project = '/w'): Prompt => ({
  atMs: at(day),
  sessionId: session,
  project,
})

describe('the history file', () => {
  test('a line is a prompt, and its instant is its `timestamp`', () => {
    const text = [
      '{"display":"/mcp","timestamp":1000,"project":"/w","sessionId":"s1"}',
      '{"display":"hi","timestamp":2000,"project":"/w","sessionId":"s2"}',
    ].join('\n')

    expect(promptsOf(text)).toEqual([
      { atMs: 1000, sessionId: 's1', project: '/w' },
      { atMs: 2000, sessionId: 's2', project: '/w' },
    ])
  })

  test('a line that is not one is skipped rather than failing the read', () => {
    const text = [
      'not json',
      '{"timestamp":"soon"}',
      '{}',
      '',
      '{"timestamp":5,"sessionId":"s","project":"/w"}',
    ].join('\n')

    expect(promptsOf(text)).toEqual([{ atMs: 5, sessionId: 's', project: '/w' }])
  })

  test('prompts come back oldest first however the file holds them', () => {
    const text = [
      '{"timestamp":300}',
      '{"timestamp":100}',
      '{"timestamp":200}',
    ].join('\n')

    expect(promptsOf(text).map(one => one.atMs)).toEqual([100, 200, 300])
  })
})

describe('days', () => {
  test('two instants of one local day share a day index', () => {
    expect(dayOf(at(100, 0), UTC)).toBe(dayOf(at(100, 23), UTC))
    expect(dayOf(at(101, 0), UTC)).toBe(dayOf(at(100, 0), UTC) + 1)
  })

  test('the offset moves the boundary, not the count', () => {
    // 23:00 UTC on day 100 is already the next day two hours east.
    expect(dayOf(at(100, 23), -120)).toBe(dayOf(at(100, 23), UTC) + 1)
  })

  test('a day index turns back into the instant it starts at', () => {
    expect(startOf(dayOf(at(100, 7), UTC), UTC)).toBe(at(100, 0))
  })
})

describe('streaks', () => {
  test('a run of consecutive days is the longest streak', () => {
    const days = [3, 4, 5, 9, 10].map(day => ({ day, prompts: 1 }))

    expect(longestStreakOf(days)).toBe(3)
  })

  test('a day in progress with no prompt yet does not break the streak', () => {
    const counts = new Map([
      [8, 1],
      [9, 1],
    ])

    // Today is 10 and has nothing on it: the run through yesterday stands.
    expect(currentStreakOf(counts, 10)).toBe(2)
  })

  test('a day that went by with none does break it', () => {
    const counts = new Map([
      [7, 1],
      [8, 1],
    ])

    expect(currentStreakOf(counts, 10)).toBe(0)
  })

  test('today counts the moment it has a prompt', () => {
    expect(currentStreakOf(new Map([[10, 1]]), 10)).toBe(1)
  })
})

describe('figures', () => {
  const prompts = [
    prompt(100, 's1', '/a'),
    prompt(100, 's1', '/a'),
    prompt(101, 's2', '/b'),
    prompt(103, 's3', '/a'),
  ]

  test('a window counts its prompts, sessions, projects and days', () => {
    const stats = statsOf(prompts, at(103), 'all', UTC)

    expect(stats.prompts).toBe(4)
    expect(stats.sessions).toBe(3)
    expect(stats.projects).toBe(2)
    expect(stats.activeDays).toBe(3)
    expect(stats.spanDays).toBe(4)
  })

  test('the busiest day is the one with the most prompts', () => {
    const stats = statsOf(prompts, at(103), 'all', UTC)

    expect(stats.busiest).toEqual({ day: 100, prompts: 2 })
  })

  test('the top project is the one the most were typed in', () => {
    const stats = statsOf(prompts, at(103), 'all', UTC)

    expect(stats.topProject).toEqual({ project: '/a', prompts: 3 })
  })

  test('a short window leaves out what falls before it', () => {
    const stats = statsOf(prompts, at(103), 'd7', UTC)

    expect(stats.spanDays).toBe(7)
    expect(stats.prompts).toBe(4)

    const older = statsOf([prompt(90), ...prompts], at(103), 'd7', UTC)

    expect(older.prompts).toBe(4)
  })

  test('an empty window is empty rather than wrong', () => {
    const stats = statsOf([], at(103), 'd30', UTC)

    expect(stats.prompts).toBe(0)
    expect(stats.busiest).toBe(null)
    expect(stats.currentStreak).toBe(0)
    expect(stats.spanDays).toBe(30)
  })

  test('no figure here is a token count', () => {
    const stats = statsOf(prompts, at(103), 'all', UTC)

    // The tab may only draw what the history file can answer for. A field
    // named for tokens would be one the module cannot stand behind.
    expect(
      Object.keys(stats).filter(key => /token|cost|usd/i.test(key)),
    ).toEqual([])
  })
})

describe('the calendar', () => {
  test('it is seven days a column, the last one the week of the clock', () => {
    const columns = calendarOf([{ day: 100, prompts: 3 }], at(103), 4, UTC)

    expect(columns).toHaveLength(4)
    expect(columns.every(week => week.length === 7)).toBe(true)
  })

  test('a day that has not happened yet is blank, not quiet', () => {
    // Day 0 of the epoch was a Thursday, so day 3 is a Sunday: a Monday-first
    // week whose Thursday is today has three days still to come.
    const columns = calendarOf([{ day: 0, prompts: 1 }], at(0), 1, UTC)
    const week = columns[0] ?? []

    expect(week[3]).toBe(1)
    expect(week[4]).toBe(null)
    expect(week[6]).toBe(null)
  })

  test('a day with nothing on it is a zero and draws quiet', () => {
    const columns = calendarOf([{ day: 0, prompts: 1 }], at(2), 1, UTC)

    expect((columns[0] ?? [])[0]).toBe(0)
  })

  test('a band is read against the busiest day of the window', () => {
    expect(bandOf(0, 10, 4)).toBe(0)
    expect(bandOf(10, 10, 4)).toBe(4)
    expect(bandOf(1, 10, 4)).toBe(1)
    expect(bandOf(5, 10, 4)).toBe(2)
  })

  test('an empty window bands nothing rather than dividing by it', () => {
    expect(bandOf(3, 0, 4)).toBe(0)
  })

  test('the raster is one cell a day, seven rows deep', () => {
    const grid = calendarRasterOf(
      calendarOf([{ day: 100, prompts: 3 }], at(103), 5, UTC),
      [1, 2, 3, 4, 5],
    )

    expect(grid?.columns).toBe(5)
    expect(grid?.rows).toBe(7)
  })

  test('no column draws no raster', () => {
    expect(calendarRasterOf([], [1, 2])).toBe(null)
  })
})
