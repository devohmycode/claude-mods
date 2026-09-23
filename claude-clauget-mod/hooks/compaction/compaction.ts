/**
 * The compaction: the one window where rewriting the past is free, because
 * the cache is thrown away anyway (T51–T59).
 *
 * - Lighten before summarizing (T51): the large tool results handed to the
 *   summarizer are replaced by the line saying where they are filed. The
 *   summary costs less, and is better for not wading through a build log to
 *   find the decision. Measured on 2.1.280, the results live in the user
 *   messages' `toolResults`, so those blocks are what is replaced: the text a
 *   person typed is never touched, and no message is added or dropped.
 * - The queue (T52): what the mod would have liked to shorten in the past
 *   waits, as pointers, for this moment — and this module, which rewrites the
 *   past, has one caller: the `session.compact` hook.
 * - The warm cache's last question (T53): the facts not to lose, asked of a
 *   fork while its cache is still warm, become the summarizer's instructions.
 * - The profitable point (T54), with its hypotheses printed beside it.
 * - The files read before, given to the summarizer by path, and served after
 *   the compaction as the windows that were read then (T56).
 * - A brief, built without a model call, a fresh session could start from
 *   instead of paying for a resume (T57); the countdown of the warm cache
 *   (T58).
 *
 * Pure.
 */

import type { SessionMessage } from 'claude-code'

import { bytesOf } from '../format'
import {
  BRIEF_MAX_BYTES,
  MARK,
  OUTPUT_RATE,
  READ_RATE,
  TEXTS,
  WRITE_RATE,
} from '../names'
import { declarationsOf } from '../reads'
import type { TextRead } from '../reads'

/**
 * A transcript lightened, and what to file before it goes up.
 */
export type Lightened = {
  messages: SessionMessage[]
  filed: { path: string; text: string }[]
  before: number
  after: number
  substituted: number
}

/**
 * The transcript with its large tool results replaced by their filing line.
 *
 * A message whose tool results are all left keeps its engine handle and goes
 * as the engine has it. One with a result replaced loses its handle and is
 * built from its role, its text — unchanged — and its tool blocks.
 *
 * @param messages the transcript the compaction runs over
 * @param queued the tool_use ids queued for this moment (T52)
 * @param minBytes the size from which a result is replaced anyway
 * @param pathOf where a result is filed, by its tool_use id
 * @returns the lighter transcript, message for message, and the files to write
 */
export function lightenedOf(
  messages: readonly SessionMessage[],
  queued: ReadonlySet<string>,
  minBytes: number,
  pathOf: (toolUseId: string) => string,
): Lightened {
  const filed: { path: string; text: string }[] = []
  let before = 0
  let after = 0

  const out = messages.map(message => {
    const results = message.toolResults ?? []

    if (message.role !== 'user' || results.length === 0) {
      return message
    }

    let isChanged = false

    const kept = results.map(result => {
      const size = bytesOf(result.text)

      if (result.isError || (size < minBytes && !queued.has(result.tool_use_id))) {
        return result
      }

      const path = pathOf(result.tool_use_id)
      const line = `[${MARK}: ${TEXTS.substituted} — ${size} bytes at ${path}]`

      filed.push({ path, text: result.text })
      before += size
      after += bytesOf(line)
      isChanged = true

      return { tool_use_id: result.tool_use_id, text: line, isError: false }
    })

    if (!isChanged) {
      return message
    }

    // Built, not the engine's: no handle, the same role, text and tool blocks.
    return { role: message.role, text: message.text, toolUses: message.toolUses, toolResults: kept }
  })

  return { messages: out, filed, before, after, substituted: filed.length }
}

/**
 * The summarizer's instructions: what the person gave, the facts the fork
 * listed, the files read — cut to the ceiling, whole lines only.
 *
 * @param parts the person's own instructions, the facts, the paths read
 * @param maxBytes the ceiling
 * @returns the instructions, or `undefined` when there is nothing to say
 */
export function instructionsTextOf(
  parts: { given?: string; facts: string | null; files: readonly string[] },
  maxBytes: number,
): string | undefined {
  const blocks = [
    parts.given?.trim() ?? '',
    parts.facts === null || parts.facts.trim() === '' ? '' : `${TEXTS.factsHead}\n${parts.facts.trim()}`,
    parts.files.length === 0 ? '' : `${TEXTS.filesHead}\n${parts.files.map(path => `- ${path}`).join('\n')}`,
  ].filter(block => block !== '')

  if (blocks.length === 0) {
    return undefined
  }

  const lines = blocks.join('\n\n').split('\n')
  const kept: string[] = []
  let used = 0

  for (const line of lines) {
    const size = bytesOf(line) + 1

    if (used + size > maxBytes) {
      break
    }

    kept.push(line)
    used += size
  }

  return kept.length === 0 ? undefined : kept.join('\n')
}

/**
 * What the fork answered, kept only when it is text: a cold snapshot, an
 * error, or a shape this build does not declare reads as no facts.
 *
 * @param answered what `$.model.fork` resolved to
 * @returns the facts, or `null`
 */
export function factsOf(answered: unknown): string | null {
  const text = (answered as { text?: unknown } | null)?.text

  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null
}

/**
 * The fork's token counts, whatever shape carried them.
 *
 * @param answered what `$.model.fork` resolved to
 * @returns the four counts, zero where absent
 */
export function forkUsageOf(answered: unknown): {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
} {
  const usage = (answered as { usage?: Record<string, unknown> } | null)?.usage ?? {}
  const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

  return {
    input: n(usage.input_tokens),
    output: n(usage.output_tokens),
    cacheRead: n(usage.cache_read_input_tokens),
    cacheWrite: n(usage.cache_creation_input_tokens),
  }
}

/**
 * The hypotheses of the profitable point, every one printed beside it.
 */
export type PointInput = {
  /**
   * The conversation's size after a compaction, tokens.
   */
  after: number
  /**
   * The summary's output tokens.
   */
  summary: number
  /**
   * The steps a turn runs to: the requests that will re-read the context.
   */
  steps: number
  readRate?: number
  writeRate?: number
  outputRate?: number
}

/**
 * The size from which compacting pays (T54): the smallest context C with
 *
 *   n × (C − c) × read  >  C × read + summary × output + c × write
 *
 * — what n requests save by re-reading c instead of C, against what the
 * compaction costs: reading C once, writing the summary, writing c again.
 *
 * @param input the hypotheses
 * @returns the size in tokens, `Infinity` when turns are too short to ever pay
 */
export function compactPointOf(input: PointInput): number {
  const read = input.readRate ?? READ_RATE
  const write = input.writeRate ?? WRITE_RATE
  const output = input.outputRate ?? OUTPUT_RATE
  const n = input.steps
  const c = input.after

  if (n <= 1) {
    return Number.POSITIVE_INFINITY
  }

  return (input.summary * output + c * write + n * c * read) / (read * (n - 1))
}

/**
 * The median of counts, the lower one of an even list.
 *
 * @param counts the counts
 * @returns the median, zero for none
 */
export function medianOf(counts: readonly number[]): number {
  const sorted = [...counts].sort((a, b) => a - b)

  return sorted.length === 0 ? 0 : (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0)
}

/**
 * The report's line of the point, hypotheses and all.
 *
 * @param point the point, tokens
 * @param context the context now, tokens
 * @param input the hypotheses it was computed from
 * @param threshold the engine's auto-compaction threshold, when it has one
 * @returns the line
 */
export function pointLine(point: number, context: number, input: PointInput, threshold: number | null): string {
  const at = Number.isFinite(point) ? `${Math.round(point)} tok` : 'never, at this turn length'

  return [
    `${MARK} · ${TEXTS.compactionLine} · profitable from ${at}`,
    `now ${context} tok`,
    threshold === null ? 'auto-compaction off' : `auto-compaction at ${threshold} tok`,
    `hypotheses: ${input.steps} steps a turn, ${input.after} tok after, ${input.summary} tok summary, read ${input.readRate ?? READ_RATE}, write ${input.writeRate ?? WRITE_RATE}, output ${input.outputRate ?? OUTPUT_RATE}`,
  ].join(' · ')
}

/**
 * The line ranges a record of served lines covers, in order.
 *
 * @param lines the hashes of the lines served, by line number
 * @returns the contiguous ranges
 */
export function rangesOf(lines: Readonly<Record<number, string>>): { from: number; to: number }[] {
  const numbers = Object.keys(lines)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const ranges: { from: number; to: number }[] = []

  for (const n of numbers) {
    const last = ranges.at(-1)

    if (last !== undefined && n === last.to + 1) {
      last.to = n
    } else {
      ranges.push({ from: n, to: n })
    }
  }

  return ranges
}

/**
 * The windows the model has read of each file, as line ranges: what the
 * compaction hands the summarizer by path and serves again afterwards (T56).
 * Ranges only, never content, so the store may keep them across a resume.
 */
export type ReadRanges = Readonly<Record<string, { path: string; ranges: readonly { from: number; to: number }[] }>>

/**
 * The ranges with one window more, overlapping and touching ranges merged.
 *
 * @param reads the ranges so far
 * @param key the file's key
 * @param path the path as the call spelled it
 * @param from the window's first line
 * @param to its last line
 * @returns the ranges
 */
export function withRead(reads: ReadRanges, key: string, path: string, from: number, to: number): ReadRanges {
  if (to < from) {
    return reads
  }

  const all = [...(reads[key]?.ranges ?? []), { from, to }].sort((a, b) => a.from - b.from)
  const merged: { from: number; to: number }[] = []

  for (const range of all) {
    const last = merged.at(-1)

    if (last !== undefined && range.from <= last.to + 1) {
      last.to = Math.max(last.to, range.to)
    } else {
      merged.push({ ...range })
    }
  }

  return { ...reads, [key]: { path, ranges: merged } }
}

/**
 * Ranges read back from the store, for their own session only.
 *
 * @param value what the store held
 * @param sessionId the session asking
 * @returns the ranges, or `null`
 */
export function readRangesFrom(value: unknown, sessionId: string): ReadRanges | null {
  const v = value as { sessionId?: unknown; files?: unknown } | null

  if (v === null || typeof v !== 'object' || v.sessionId !== sessionId || typeof v.files !== 'object' || v.files === null) {
    return null
  }

  const out: Record<string, { path: string; ranges: { from: number; to: number }[] }> = {}

  for (const [key, one] of Object.entries(v.files as Record<string, unknown>)) {
    const file = one as { path?: unknown; ranges?: unknown } | null

    if (typeof file?.path === 'string' && Array.isArray(file.ranges)) {
      out[key] = {
        path: file.path,
        ranges: file.ranges.filter(
          (range): range is { from: number; to: number } =>
            typeof range?.from === 'number' && typeof range?.to === 'number',
        ),
      }
    }
  }

  return out
}

/**
 * What the compaction levers did this session.
 */
export type CompactStats = {
  compactions: number
  /**
   * Tool results replaced by their filing line, and their bytes before and
   * after — what the summarizer did not have to read.
   */
  substituted: number
  substitutedBefore: number
  substitutedAfter: number
  /**
   * The conversation's size before and after, as the engine recorded it.
   */
  tokensBefore: number
  tokensAfter: number
  /**
   * Forks asked for the facts, and those that answered.
   */
  forks: number
  facts: number
  /**
   * Precomputed summaries refused.
   */
  precomputeSkipped: number
  /**
   * Reads, after a compaction, of a file read before it: the milestone's
   * measure. And those the mod answered with the windows read then.
   */
  rereadsAfter: number
  digests: number
  digestBytesBefore: number
  digestBytesAfter: number
  proposed: number
  provoked: number
}

export const NO_COMPACT_STATS: CompactStats = {
  compactions: 0,
  substituted: 0,
  substitutedBefore: 0,
  substitutedAfter: 0,
  tokensBefore: 0,
  tokensAfter: 0,
  forks: 0,
  facts: 0,
  precomputeSkipped: 0,
  rereadsAfter: 0,
  digests: 0,
  digestBytesBefore: 0,
  digestBytesAfter: 0,
  proposed: 0,
  provoked: 0,
}

/**
 * The report's lines of the compaction levers.
 *
 * @param stats the record
 * @returns the lines
 */
export function compactionLines(stats: CompactStats): string[] {
  return [
    `${MARK} · ${TEXTS.compactionLine} · ${stats.compactions} compactions · ${stats.tokensBefore} → ${stats.tokensAfter} tok (engine)`,
    `  lightened · ${stats.substituted} results filed, ${stats.substitutedBefore} → ${stats.substitutedAfter} bytes handed to the summarizer`,
    `  facts · ${stats.facts} of ${stats.forks} forks answered · ${stats.precomputeSkipped} precomputed summaries refused`,
    `  after · ${stats.rereadsAfter} rereads of files read before · ${stats.digests} served as the windows read then (${stats.digestBytesBefore} → ${stats.digestBytesAfter} bytes)`,
    `  point · proposed ${stats.proposed}× · compacted by the mod ${stats.provoked}×`,
  ]
}

/**
 * A file read again after a compaction (T56): the first window the model had
 * read of it, and a note listing the others and the file's declarations —
 * only windows the index holds, no others.
 *
 * @param text the file's text now
 * @param path the path as the call named it
 * @param ranges the windows read before the compaction
 * @returns the record and the note, or `null` when nothing was read of it
 */
export function digestOf(
  text: string,
  path: string,
  ranges: readonly { from: number; to: number }[],
): { record: TextRead; context: string } | null {
  const first = ranges[0]

  if (first === undefined) {
    return null
  }

  const all = text.split('\n')
  const lines = all.length > 1 && all.at(-1) === '' ? all.slice(0, -1) : all
  const window = lines.slice(first.from - 1, first.to)
  const others = ranges.slice(1).map(range => `${range.from}–${range.to}`)
  const table = declarationsOf(text)
    .filter(one => one.line < first.from || one.line > first.to)
    .slice(0, 40)
    .map(one => `${one.line}: ${one.text.slice(0, 120)}`)

  return {
    record: {
      type: 'text',
      file: { filePath: path, content: window.join('\n'), numLines: window.length, startLine: first.from, totalLines: lines.length },
    },
    context: [
      `${MARK} · ${path}: lines ${first.from}–${first.to} ${TEXTS.digestHead}${others.length === 0 ? '' : `; also read then: ${others.join(', ')}`}.`,
      ...table,
    ].join('\n'),
  }
}

/**
 * A brief a fresh session could start from (T57), built without a model
 * call: where, the files read, and the last summary as the engine wrote it.
 *
 * @param parts the working directory, the files read, the last summary
 * @param maxBytes the ceiling
 * @returns the brief, whole lines under the ceiling
 */
export function sessionBriefOf(
  parts: { cwd: string; files: readonly string[]; summary: string | null },
  maxBytes: number = BRIEF_MAX_BYTES,
): string {
  const text = [
    `# Brief of a previous session (${MARK})`,
    '',
    `Working directory: ${parts.cwd}`,
    '',
    '## Files it read',
    ...(parts.files.length === 0 ? ['- none recorded'] : parts.files.map(path => `- ${path}`)),
    '',
    '## Its last summary',
    parts.summary ?? 'none: the session was not compacted',
  ].join('\n')

  if (bytesOf(text) <= maxBytes) {
    return text
  }

  const kept: string[] = []
  let used = 0

  for (const line of text.split('\n')) {
    const size = bytesOf(line) + 1

    if (used + size > maxBytes) {
      break
    }

    kept.push(line)
    used += size
  }

  return kept.join('\n')
}

/**
 * The countdown line of the warm cache (T58).
 *
 * @param remainingMs what is left of the assumed TTL
 * @returns `cache warm 1:40 (assumed 5 min TTL)`, or the expiry line
 */
export function countdownText(remainingMs: number): string {
  if (remainingMs <= 0) {
    return `${MARK} · ${TEXTS.cacheCold}`
  }

  const seconds = Math.ceil(remainingMs / 1000)

  return `${MARK} · ${TEXTS.cacheWarm} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} (${TEXTS.assumedTtl})`
}
