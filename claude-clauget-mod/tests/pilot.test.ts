import { describe, expect, test } from 'claude-code/testing'

import {
  commandOf,
  forecastLine,
  forecastOf,
  fullestOf,
  isEconomyWrite,
  switchesOf,
  tierOf,
} from '../hooks/pilot'
import type { Sample } from '../hooks/pilot'

const rows = (over: Record<string, unknown> = {}) => ({
  economy: 'off',
  levers: 'off',
  cuts: 'off',
  steps: 'off',
  compaction: 'off',
  breaker: 'off',
  ...over,
})

describe('one lever (T63)', () => {
  test('every lever left off follows the economy row', () => {
    expect(switchesOf(rows())).toEqual({ levers: false, cuts: false, steps: false, compaction: 'off', breaker: false })
    expect(switchesOf(rows({ economy: 'on' }))).toEqual({ levers: true, cuts: true, steps: true, compaction: 'on', breaker: false })
    expect(switchesOf(rows({ economy: 'strict' }))).toEqual({ levers: true, cuts: true, steps: true, compaction: 'auto', breaker: true })
  })

  test('a lever turned on in its own row stays on whatever the economy says', () => {
    expect(switchesOf(rows({ cuts: 'on' })).cuts).toBe(true)
    expect(switchesOf(rows({ economy: 'on', compaction: 'auto' })).compaction).toBe('auto')
  })

  test('the same economy asked twice is written once', () => {
    expect(isEconomyWrite('on', 'off', undefined)).toBe(true)
    // Written already, the reload not yet come: nothing to write.
    expect(isEconomyWrite('on', 'off', 'on')).toBe(false)
    // The row says it already.
    expect(isEconomyWrite('on', 'on', undefined)).toBe(false)
    expect(isEconomyWrite('off', 'on', 'on')).toBe(true)
  })

  test('the command\'s arguments', () => {
    expect(commandOf('')).toEqual({ kind: 'report' })
    expect(commandOf(' on ')).toEqual({ kind: 'economy', economy: 'on' })
    expect(commandOf('strict')).toEqual({ kind: 'economy', economy: 'strict' })
    expect(commandOf('later run the migration tests')).toEqual({ kind: 'later', text: 'run the migration tests' })
    expect(commandOf('later')).toEqual({ kind: 'list' })
    expect(commandOf('cancel')).toEqual({ kind: 'cancel' })
    expect(commandOf('whatever')).toEqual({ kind: 'report' })
  })
})

describe('the tiers, with hysteresis (T61)', () => {
  test('up at 60, 80 and 92', () => {
    expect(tierOf(0, 49, 0)).toBe(0)
    expect(tierOf(0, 61, 0)).toBe(1)
    expect(tierOf(0, 85, 0)).toBe(2)
    expect(tierOf(0, 95, 0)).toBe(3)
  })

  test('down only ten points under the threshold it went up at', () => {
    expect(tierOf(1, 59, 5)).toBe(1)
    expect(tierOf(1, 51, 5)).toBe(1)
    expect(tierOf(1, 49, 5)).toBe(0)
  })

  test('no two changes within three turns', () => {
    // Up at turn 0, then the share swings: nothing moves before three turns.
    expect(tierOf(1, 30, 1)).toBe(1)
    expect(tierOf(1, 85, 2)).toBe(1)
    expect(tierOf(1, 85, 3)).toBe(2)
  })

  test('the fullest plan window, or the context without one', () => {
    expect(
      fullestOf({
        context: { percent: 12 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 40, resetsAt: '2026-09-23T17:40:00Z' },
          { kind: 'seven_day', percentUsed: 71 },
        ],
      }),
    ).toEqual({ percent: 71, kind: 'seven_day' })
    expect(fullestOf({ context: { percent: 12 }, rateLimits: [] })).toEqual({ percent: 12, kind: 'context' })
  })
})

describe('the forecast (T62)', () => {
  const HOUR = 60 * 60 * 1000
  const now = 10 * HOUR
  const series = (at: (i: number) => number): Sample[] =>
    Array.from({ length: 7 }, (_, i) => ({ atMs: now - HOUR + (i * HOUR) / 6, percent: at(i) }))

  test('flat: no forecast', () => {
    expect(forecastOf(series(() => 40), now)).toBe(null)
  })

  test('linear: the line, and a range that closes on it', () => {
    // 10 points an hour from 40: 100 at +5 h after the last reading at 50.
    const forecast = forecastOf(series(i => 40 + (i * 10) / 6), now)

    expect(forecast?.fullAtMs).toBe(now + 5 * HOUR)
    expect(forecast?.earliestMs).toBe(now + 5 * HOUR)
    expect(forecast?.latestMs).toBe(now + 5 * HOUR)
  })

  test('in steps: the range opens around the line', () => {
    const forecast = forecastOf(series(i => (i < 4 ? 40 : 60)), now)

    expect(forecast).not.toBe(null)
    expect(forecast?.earliestMs ?? 0).toBeLessThan(forecast?.fullAtMs ?? 0)
    expect(forecast?.latestMs ?? 0).toBeGreaterThan(forecast?.fullAtMs ?? 0)
  })

  test('too few readings, or old ones, say nothing', () => {
    expect(forecastOf(series(i => 40 + i).slice(0, 2), now)).toBe(null)
    expect(forecastOf(series(i => 40 + i), now + 3 * HOUR)).toBe(null)
  })

  test('the line says its method', () => {
    const line = forecastLine('five_hour', { fullAtMs: now, earliestMs: now, latestMs: now + HOUR }, now + 2 * HOUR)

    expect(line).toContain('before its reset')
    expect(line).toContain('straight line fitted over the last hour')
  })
})
