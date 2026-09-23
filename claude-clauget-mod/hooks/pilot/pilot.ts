/**
 * The pilot: when the levers act, and what the mod tells the person about the
 * quota (T60–T64).
 *
 * - One lever (T63): `/clauget on|off|strict` writes one manifest row, the
 *   economy, which every other row falls back on — and writes nothing when
 *   the row already says so, since a write reloads the module.
 * - The tiers (T61): the fullest plan window, as `session.measure` pushes it,
 *   sets a tier that tightens the cuts, brings the compaction forward, and at
 *   the top warns and stops deciding alone. A tier only drives flow — never
 *   a description, a listing or a context block — and moves at most once in
 *   so many turns, and steps down only well below where it stepped up.
 * - The forecast (T62): when a window fills at the last hour's rate, with the
 *   method and a range, because load is not a straight line.
 * - The command's arguments, including the deferred prompts (T64).
 *
 * Pure.
 */

import {
  ECONOMY_OFF,
  ECONOMY_ON,
  ECONOMY_STRICT,
  FORECAST_WINDOW_MS,
  MARK,
  TEXTS,
  TIER_DOWN_MARGIN,
  TIER_MIN_TURNS,
  TIER_UP,
} from '../names'

/**
 * The economy row, read.
 */
export type Economy = 'off' | 'on' | 'strict'

/**
 * A row value as an economy, anything else reading as off.
 *
 * @param value the row's value
 * @returns the economy
 */
export const economyOf = (value: unknown): Economy =>
  value === ECONOMY_ON || value === ECONOMY_STRICT ? value : ECONOMY_OFF

/**
 * The switches in force: each row's own value, or the economy's when the row
 * is left off. `on` turns the levers, the cuts, the steps and the compaction
 * on; `strict` also compacts by itself and arms the breaker.
 *
 * @param rows the rows as the manifest holds them
 * @returns the switches
 */
export function switchesOf(rows: {
  economy: unknown
  levers: unknown
  cuts: unknown
  steps: unknown
  compaction: unknown
  breaker: unknown
}): { levers: boolean; cuts: boolean; steps: boolean; compaction: 'off' | 'on' | 'auto'; breaker: boolean } {
  const economy = economyOf(rows.economy)
  const isOn = (row: unknown) => row === 'on' || economy !== ECONOMY_OFF
  const compaction =
    rows.compaction === 'on' || rows.compaction === 'auto'
      ? rows.compaction
      : economy === ECONOMY_STRICT
        ? 'auto'
        : economy === ECONOMY_ON
          ? 'on'
          : 'off'

  return {
    levers: isOn(rows.levers),
    cuts: isOn(rows.cuts),
    steps: isOn(rows.steps),
    compaction,
    breaker: rows.breaker === 'on' || economy === ECONOMY_STRICT,
  }
}

/**
 * Whether `/clauget on|off|strict` has anything to write (T63): not when the
 * row already holds it, and not when the command already wrote it and the
 * reload that follows has not come yet.
 *
 * @param asked the economy asked for
 * @param row the row's value now
 * @param written what the command last wrote, as the store remembers it
 * @returns true to write the row
 */
export function isEconomyWrite(asked: Economy, row: unknown, written: unknown): boolean {
  return economyOf(row) !== asked && written !== asked
}

/**
 * What `/clauget` was asked to do.
 */
export type Command =
  | { kind: 'report' }
  | { kind: 'economy'; economy: Economy }
  | { kind: 'later'; text: string }
  | { kind: 'list' }
  | { kind: 'cancel' }

/**
 * The command's arguments, read.
 *
 * @param args everything after `/clauget`
 * @returns the command
 */
export function commandOf(args: string): Command {
  const trimmed = args.trim()
  const [head = '', ...rest] = trimmed.split(/\s+/)

  if (head === ECONOMY_ON || head === ECONOMY_OFF || head === ECONOMY_STRICT) {
    return { kind: 'economy', economy: head }
  }

  if (head === 'later') {
    const text = trimmed.slice('later'.length).trim()

    return text === '' ? { kind: 'list' } : { kind: 'later', text }
  }

  if (head === 'cancel' && rest.length === 0) {
    return { kind: 'cancel' }
  }

  return { kind: 'report' }
}

/**
 * The tier a share of the window sets (T61), from the one in force.
 *
 * Up at 60, 80 and 92 percent; down only once the share is ten points under
 * the tier's own threshold; and no change at all until enough turns have
 * passed since the last one — a policy that loosened at 59 and tightened at
 * 61 would swing every turn.
 *
 * @param current the tier in force, 0 to 3
 * @param percent the fullest window's share, 0 to 100
 * @param turnsSince turns since the tier last changed
 * @returns the tier
 */
export function tierOf(current: number, percent: number, turnsSince: number): number {
  const reached = TIER_UP.filter(threshold => percent >= threshold).length

  if (reached > current) {
    return turnsSince >= TIER_MIN_TURNS || current === 0 ? reached : current
  }

  if (reached < current) {
    const floor = (TIER_UP[current - 1] ?? 0) - TIER_DOWN_MARGIN

    return percent < floor && turnsSince >= TIER_MIN_TURNS ? current - 1 : current
  }

  return current
}

/**
 * The share of the fullest plan window, or of the context when no plan
 * window has a reading.
 *
 * @param measured the last measurement
 * @returns the share, 0 to 100, and the window it came from
 */
export function fullestOf(measured: {
  context: { percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
}): { percent: number; kind: string; resetsAt?: string } {
  const windows = [...measured.rateLimits].sort((a, b) => b.percentUsed - a.percentUsed)
  const top = windows[0]

  return top === undefined
    ? { percent: measured.context.percent ?? 0, kind: 'context' }
    : { percent: top.percentUsed, kind: top.kind, ...(top.resetsAt === undefined ? {} : { resetsAt: top.resetsAt }) }
}

/**
 * A time as a person reads it on their own clock.
 *
 * @param ms the time
 * @returns `16:12`
 */
export function clockOf(ms: number): string {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * The forecast as the person reads it (T62), method and range included.
 *
 * @param kind the window
 * @param forecast when it is full, earliest and latest
 * @param resetsAtMs when it resets, if known
 * @returns `five_hour full at 16:12 (15:40–17:05), before its reset at 17:40 …`
 */
export function forecastLine(
  kind: string,
  forecast: { fullAtMs: number; earliestMs: number; latestMs: number },
  resetsAtMs: number | null,
): string {
  const range = Number.isFinite(forecast.latestMs)
    ? `${clockOf(forecast.earliestMs)}–${clockOf(forecast.latestMs)}`
    : `from ${clockOf(forecast.earliestMs)}`
  const reset =
    resetsAtMs === null
      ? ''
      : forecast.fullAtMs < resetsAtMs
        ? `, before its reset at ${clockOf(resetsAtMs)}`
        : `, after its reset at ${clockOf(resetsAtMs)}`

  return `${MARK} · ${TEXTS.forecast}, ${kind} is full at ${clockOf(forecast.fullAtMs)} (${range})${reset} · ${TEXTS.forecastMethod}`
}

/**
 * One reading of a window.
 */
export type Sample = {
  atMs: number
  percent: number
}

/**
 * When a window is full at the last hour's rate (T62): a straight line fitted
 * to the readings, and a range from the slopes of the hour's first and second
 * halves.
 *
 * @param samples the window's readings, oldest first
 * @param nowMs the time now
 * @returns the time it is full at, earliest and latest, or `null` when the
 *   window is not filling (flat, falling) or there are too few readings
 */
export function forecastOf(
  samples: readonly Sample[],
  nowMs: number,
): { fullAtMs: number; earliestMs: number; latestMs: number } | null {
  const recent = samples.filter(one => nowMs - one.atMs <= FORECAST_WINDOW_MS)

  if (recent.length < 3) {
    return null
  }

  const slopeOf = (points: readonly Sample[]): number => {
    const n = points.length

    if (n < 2) {
      return 0
    }

    const meanT = points.reduce((sum, one) => sum + one.atMs, 0) / n
    const meanP = points.reduce((sum, one) => sum + one.percent, 0) / n
    const top = points.reduce((sum, one) => sum + (one.atMs - meanT) * (one.percent - meanP), 0)
    const bottom = points.reduce((sum, one) => sum + (one.atMs - meanT) ** 2, 0)

    return bottom === 0 ? 0 : top / bottom
  }

  const slope = slopeOf(recent)

  if (!(slope > 0)) {
    return null
  }

  const last = recent[recent.length - 1] as Sample
  // To the millisecond; a half that did not rise says the window may never
  // fill at that pace, and its bound is open.
  const at = (rate: number) =>
    rate > 0 ? Math.round(last.atMs + (100 - last.percent) / rate) : Number.POSITIVE_INFINITY
  const half = Math.floor(recent.length / 2)
  const halves = [slopeOf(recent.slice(0, half + 1)), slopeOf(recent.slice(half))]
  const fastest = Math.max(slope, ...halves)
  const slowest = Math.min(slope, ...halves)

  return { fullAtMs: at(slope), earliestMs: at(fastest), latestMs: at(slowest) }
}
