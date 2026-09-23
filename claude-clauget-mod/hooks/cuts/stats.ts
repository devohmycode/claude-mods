/**
 * What the cuts did this session, and the one figure that says whether they
 * were right: how often the model went back for what was cut.
 *
 * Bytes before and after, per rule — measured on the texts, never converted
 * into tokens. A re-read of a filed result, or a windowed read of a file the
 * mod summarised, is a targeted reread: a cut the model had to undo. Many of
 * them and the cut was too deep; none, and it was either right or never
 * missed. Both columns are printed, neither is summed with the other.
 *
 * Pure.
 */

import { byteText } from '../format'
import { MARK, TEXTS } from '../names'

/**
 * One rule's record: how often it answered, and the bytes it took the text
 * from and to.
 */
export type RuleCount = {
  count: number
  before: number
  after: number
}

/**
 * The session's record of the cuts.
 */
export type CutStats = {
  rules: Readonly<Record<string, RuleCount>>
  noise: Readonly<Record<string, number>>
  /**
   * Reads of a filed result.
   */
  rereads: number
  /**
   * Windowed reads of a file the mod summarised.
   */
  summaryRereads: number
  /**
   * Results filed, and the bytes written.
   */
  filed: number
  filedBytes: number
}

export const NO_CUT_STATS: CutStats = {
  rules: {},
  noise: {},
  rereads: 0,
  summaryRereads: 0,
  filed: 0,
  filedBytes: 0,
}

/**
 * The record with one answer more.
 *
 * @param stats the record
 * @param rule the rule that answered
 * @param before the bytes as the engine made them
 * @param after the bytes the model reads
 * @param noise the noise rules that fired, with their counts
 * @returns the record
 */
export function withCut(
  stats: CutStats,
  rule: string,
  before: number,
  after: number,
  noise: Readonly<Record<string, number>> = {},
): CutStats {
  const was = stats.rules[rule] ?? { count: 0, before: 0, after: 0 }
  const merged: Record<string, number> = { ...stats.noise }

  for (const [name, count] of Object.entries(noise)) {
    merged[name] = (merged[name] ?? 0) + count
  }

  return {
    ...stats,
    rules: { ...stats.rules, [rule]: { count: was.count + 1, before: was.before + before, after: was.after + after } },
    noise: merged,
  }
}

/**
 * A record read back from the store, for its own session only.
 *
 * @param value what the store held
 * @param sessionId the session asking
 * @returns the record, or `null`
 */
export function cutStatsFrom(value: unknown, sessionId: string): CutStats | null {
  const v = value as { sessionId?: unknown; stats?: Partial<CutStats> } | null

  if (v === null || typeof v !== 'object' || v.sessionId !== sessionId || typeof v.stats !== 'object') {
    return null
  }

  return { ...NO_CUT_STATS, ...v.stats }
}

/**
 * The ticket's line of the cuts: results cut, bytes before and after, and the
 * rereads that followed; nothing when the cuts did nothing.
 *
 * @param stats the record
 * @returns `clauget · cuts · 5 answers · 84 312 → 9 110 bytes · 2 targeted rereads (counted)`
 */
export function cutsLine(stats: CutStats): string | null {
  const rules = Object.values(stats.rules)
  const count = rules.reduce((sum, one) => sum + one.count, 0)

  if (count === 0 && stats.rereads === 0 && stats.summaryRereads === 0) {
    return null
  }

  const before = rules.reduce((sum, one) => sum + one.before, 0)
  const after = rules.reduce((sum, one) => sum + one.after, 0)

  return [
    `${MARK} · ${TEXTS.cutsLine}`,
    `${count} answers`,
    `${byteText(before)} → ${byteText(after)} ${TEXTS.bytes}`,
    `${stats.rereads + stats.summaryRereads} ${TEXTS.rereads}`,
    `(${TEXTS.counted})`,
  ].join(' · ')
}

/**
 * The report's lines of the cuts, rule by rule.
 *
 * @param stats the record
 * @returns the lines
 */
export function cutsLines(stats: CutStats): string[] {
  const head = cutsLine(stats)

  if (head === null) {
    return [`${MARK} · ${TEXTS.cutsLine} · none this session`]
  }

  const lines = [head]

  for (const [rule, one] of Object.entries(stats.rules).sort((a, b) => b[1].before - a[1].before)) {
    lines.push(`  ${rule} · ${one.count}× · ${byteText(one.before)} → ${byteText(one.after)} ${TEXTS.bytes}`)
  }

  const noise = Object.entries(stats.noise).sort((a, b) => b[1] - a[1])

  if (noise.length > 0) {
    lines.push(`  ${TEXTS.noiseRules} · ${noise.map(([name, count]) => `${name} ${count}`).join(' · ')}`)
  }

  lines.push(
    `  ${stats.filed} filed (${byteText(stats.filedBytes)} ${TEXTS.bytes}) · ${stats.rereads} rereads of a filed result · ${stats.summaryRereads} windowed reads of a summarised file`,
  )

  return lines
}
