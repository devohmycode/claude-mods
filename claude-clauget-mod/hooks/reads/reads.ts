/**
 * What the model has read of each file this conversation, and the answers
 * that follow from it (T34, T36, T37, T38).
 *
 * - The same window of an unchanged file, read again (T36): the engine's own
 *   `file_unchanged` answer, and the tool does not run.
 * - A window overlapping lines already read of an unchanged file (T37): only
 *   the new lines, and a note saying where the rest is.
 * - A whole read after an edit (T38): only the span that changed, and a note
 *   saying every other line is as read — measured, not promised: applying the
 *   span to the version read before gives the current file byte for byte.
 * - A whole read of a long file, the first time (T34): its head, and in the
 *   note a table of its declarations with their line numbers.
 *
 * The engine numbers a Read's lines from `startLine`, so every answer here is
 * a true window of the file — never a text passed off as one — and what the
 * model is told goes in the note beside it.
 *
 * Everything rests on the earlier reads still being in the context: a
 * compaction or a new session empties the record, and the next read is
 * served whole.
 *
 * Pure.
 */

import { bytesOf } from '../format'
import { hashOf, pathKeyOf } from '../instructions'
import {
  DIFF_MAX_LINES,
  MARK,
  SUMMARY_BUDGET,
  SUMMARY_HEAD_LINES,
  SUMMARY_MIN_LINES,
  TEXTS,
} from '../names'

/**
 * A file's size and time as `$.fs.stat` gives them: the fingerprint that says
 * whether it changed.
 */
export type Stamp = {
  size: number
  mtimeMs: number
}

/**
 * One file as the model has read it.
 */
export type FileRead = {
  stamp: Stamp | null
  /**
   * A hash of each line served, by line number.
   */
  lines: Readonly<Record<number, string>>
  /**
   * The windows served whole, as the calls asked for them.
   */
  windows: readonly string[]
  /**
   * The whole text, when a whole read served it and it is small enough to
   * keep: what the next change is measured against.
   */
  whole: string | null
}

/**
 * Every file read this conversation, by path key.
 */
export type Reads = {
  files: Readonly<Record<string, FileRead>>
}

export const NO_READS: Reads = { files: {} }

/**
 * The largest whole text kept to measure a change against.
 */
const WHOLE_MAX_BYTES = 512 * 1024

/**
 * A Read's window as its arguments name it.
 *
 * @param args the call's `offset` and `limit`
 * @returns `offset:limit`, blank for either left out
 */
export const windowKeyOf = (args: { offset?: number; limit?: number }): string =>
  `${args.offset ?? ''}:${args.limit ?? ''}`

const sameStamp = (a: Stamp | null, b: Stamp | null): boolean =>
  a !== null && b !== null && a.size === b.size && a.mtimeMs === b.mtimeMs

/**
 * Whether a read can be answered `file_unchanged` without running the tool
 * (T36): the same window of the same file, whose fingerprint has not moved.
 * A different offset or limit is never taken for it.
 *
 * @param reads the record
 * @param path the path asked for
 * @param args the window asked for
 * @param stamp the file's fingerprint now
 * @returns true to answer without the tool
 */
export function isUnchanged(
  reads: Reads,
  path: string,
  args: { offset?: number; limit?: number },
  stamp: Stamp | null,
): boolean {
  const known = reads.files[pathKeyOf(path)]

  return known !== undefined && sameStamp(known.stamp, stamp) && known.windows.includes(windowKeyOf(args))
}

/**
 * The text record of a Read, as the engine makes it.
 */
export type TextRead = {
  type: 'text'
  file: {
    filePath: string
    content: string
    numLines: number
    startLine: number
    totalLines: number
    truncatedByTokenCap?: boolean
  }
}

/**
 * What the mod answers for a Read the engine ran.
 */
export type ReadAnswer = {
  /**
   * The record to answer, or `null` to keep the engine's.
   */
  record: TextRead | null
  context: string | null
  /**
   * Which rule answered, for the counters.
   */
  rule: 'summary' | 'overlap' | 'diff' | null
  reads: Reads
}

/**
 * A text's lines, a trailing newline not counted as a line of its own.
 */
const linesOf = (text: string): string[] => {
  const lines = text.split('\n')

  return lines.length > 1 && lines.at(-1) === '' ? lines.slice(0, -1) : lines
}

/**
 * A window of lines as a record the engine will number correctly.
 */
function windowRecord(of: TextRead, lines: readonly string[], start: number): TextRead {
  return {
    type: 'text',
    file: {
      filePath: of.file.filePath,
      content: lines.join('\n'),
      numLines: lines.length,
      startLine: start,
      totalLines: of.file.totalLines,
    },
  }
}

/**
 * The lines that open a declaration: what a table of contents is made of —
 * code at the left margin, Markdown headings, top-level keys.
 *
 * @param text the file's text
 * @returns each with its line number, in order
 */
export function declarationsOf(text: string): { line: number; text: string }[] {
  const opening =
    /^(?:export\s|import\s|(?:async\s+)?function\s|class\s|interface\s|type\s|enum\s|const\s|let\s|def\s|module\s|namespace\s|public\s|private\s|protected\s|fn\s|pub\s|impl\s|struct\s|#{1,6}\s|[A-Za-z_][\w.-]*:\s*$|"[^"]+":\s*[[{])/

  return linesOf(text)
    .map((line, index) => ({ line: index + 1, text: line.trimEnd() }))
    .filter(one => opening.test(one.text))
}

/**
 * The span two versions of a file differ in: from the first line that
 * differs from the top, to the last that differs from the bottom.
 *
 * @param before the version read earlier
 * @param after the version now
 * @returns the span in each version (1-based, `end` below `start` when the
 *   span is empty on that side), or `null` when they are the same
 */
export function changedSpanOf(
  before: readonly string[],
  after: readonly string[],
): { start: number; endBefore: number; endAfter: number } | null {
  let top = 0

  while (top < before.length && top < after.length && before[top] === after[top]) {
    top += 1
  }

  if (top === before.length && top === after.length) {
    return null
  }

  let bottom = 0

  while (
    bottom < before.length - top &&
    bottom < after.length - top &&
    before[before.length - 1 - bottom] === after[after.length - 1 - bottom]
  ) {
    bottom += 1
  }

  return { start: top + 1, endBefore: before.length - bottom, endAfter: after.length - bottom }
}

/**
 * The version read before with a span replaced: what a diff answer claims
 * the file now is. The property the tests hold it to.
 *
 * @param before the version read earlier, as lines
 * @param start the span's first line
 * @param endBefore the span's last line in the version read before
 * @param replacement the span's lines now
 * @returns the lines of the file as the answer describes it
 */
export function appliedOf(
  before: readonly string[],
  start: number,
  endBefore: number,
  replacement: readonly string[],
): string[] {
  return [...before.slice(0, start - 1), ...replacement, ...before.slice(endBefore)]
}

/**
 * The record after a window was served: its lines hashed, its window noted
 * when it was served whole, the whole text kept when it fits.
 */
function served(
  reads: Reads,
  key: string,
  stamp: Stamp | null,
  window: string | null,
  lines: readonly string[],
  start: number,
  whole: string | null,
): Reads {
  const was = reads.files[key]
  const isSame = was !== undefined && sameStamp(was.stamp, stamp)
  const hashes: Record<number, string> = isSame ? { ...was.lines } : {}

  lines.forEach((line, index) => {
    hashes[start + index] = hashOf(line)
  })

  const windows = isSame ? was.windows : []

  return {
    files: {
      ...reads.files,
      [key]: {
        stamp,
        lines: hashes,
        windows: window === null || windows.includes(window) ? windows : [...windows, window],
        whole: whole !== null && bytesOf(whole) <= WHOLE_MAX_BYTES ? whole : isSame ? (was?.whole ?? null) : null,
      },
    },
  }
}

/**
 * The record after a Read the mod left as it came: which lines the model now
 * has, and no whole text kept. What the compaction's digest and its count of
 * rereads need, whatever the cuts say.
 *
 * @param reads the record
 * @param args the call's path and window
 * @param record the engine's text record
 * @param stamp the file's fingerprint, when known
 * @returns the record
 */
export function withServed(
  reads: Reads,
  args: { file_path: string; offset?: number; limit?: number },
  record: TextRead,
  stamp: Stamp | null,
): Reads {
  return served(
    reads,
    pathKeyOf(args.file_path),
    stamp,
    windowKeyOf(args),
    linesOf(record.file.content),
    record.file.startLine,
    null,
  )
}

/**
 * What the mod answers for a Read the engine ran, and the record after it.
 *
 * @param reads the record
 * @param args the call's path and window
 * @param record the engine's text record
 * @param stamp the file's fingerprint now
 * @param fullText the whole file, read by the register when a summary may be
 *   due (a whole read of a long file); `null` otherwise
 * @returns the answer
 */
export function readAnswerOf(
  reads: Reads,
  args: { file_path: string; offset?: number; limit?: number },
  record: TextRead,
  stamp: Stamp | null,
  fullText: string | null,
): ReadAnswer {
  const key = pathKeyOf(args.file_path)
  const known = reads.files[key]
  const lines = linesOf(record.file.content)
  const start = record.file.startLine
  const isWholeAsk = args.offset === undefined && args.limit === undefined
  const isWholeServed = start === 1 && lines.length >= record.file.totalLines
  const window = windowKeyOf(args)
  const path = record.file.filePath
  const keep = (whole: string | null): ReadAnswer => ({
    record: null,
    context: null,
    rule: null,
    reads: served(reads, key, stamp, window, lines, start, whole),
  })

  // A whole read after the file changed: the span, if it is small (T38).
  if (isWholeAsk && isWholeServed && known?.whole != null && !sameStamp(known.stamp, stamp)) {
    const before = linesOf(known.whole)
    const span = changedSpanOf(before, lines)

    if (span === null) {
      return keep(record.file.content)
    }

    // One line of context each side, so the span is never empty and the
    // model sees where it sits.
    const from = Math.max(1, span.start - 1)
    const to = Math.min(lines.length, Math.max(span.endAfter, span.start) + 1)
    const size = to - from + 1

    if (size <= DIFF_MAX_LINES && size * 2 < lines.length) {
      const shift = span.endAfter - span.endBefore
      const note = [
        `${MARK} · ${path}: lines ${from}–${to} ${TEXTS.changedSpan}`,
        shift === 0 ? '' : `; ${TEXTS.shiftedBy} ${shift > 0 ? '+' : ''}${shift}`,
        '.',
      ].join('')

      return {
        record: windowRecord(record, lines.slice(from - 1, to), from),
        context: note,
        rule: 'diff',
        reads: served(reads, key, stamp, window, lines, start, record.file.content),
      }
    }

    return keep(record.file.content)
  }

  // Lines already read of the same version: only the new ones (T37).
  if (known !== undefined && sameStamp(known.stamp, stamp) && !known.windows.includes(window)) {
    const isKnown = (index: number) => known.lines[start + index] === hashOf(lines[index] ?? '')
    let head = 0

    while (head < lines.length && isKnown(head)) {
      head += 1
    }

    let tail = 0

    while (tail < lines.length - head && isKnown(lines.length - 1 - tail)) {
      tail += 1
    }

    // Known at one end only, and something new: a window of the new lines.
    // Known in the middle or everywhere: served whole, never confused.
    if ((head > 0) !== (tail > 0) && head + tail < lines.length) {
      const fresh = lines.slice(head, lines.length - tail)
      const knownFrom = head > 0 ? start : start + lines.length - tail
      const knownTo = head > 0 ? start + head - 1 : start + lines.length - 1

      return {
        record: windowRecord(record, fresh, start + head),
        context: `${MARK} · ${path}: lines ${knownFrom}–${knownTo} ${TEXTS.onlyNew}.`,
        rule: 'overlap',
        reads: served(reads, key, stamp, null, fresh, start + head, null),
      }
    }
  }

  // A long file read whole for the first time: head and table (T34).
  if (isWholeAsk && known === undefined && fullText !== null && record.file.totalLines > SUMMARY_MIN_LINES) {
    const head = linesOf(fullText).slice(0, SUMMARY_HEAD_LINES)
    const table: string[] = []
    let used = 0

    for (const one of declarationsOf(fullText)) {
      if (one.line <= SUMMARY_HEAD_LINES) {
        continue
      }

      const entry = `${one.line}: ${one.text.slice(0, 120)}`

      if (used + bytesOf(entry) + 1 > SUMMARY_BUDGET) {
        break
      }

      table.push(entry)
      used += bytesOf(entry) + 1
    }

    const note = [
      `${MARK} · ${path}: ${record.file.totalLines} lines; lines 1–${head.length} above, then ${TEXTS.summaryHead} — ${TEXTS.summaryRest}.`,
      ...table,
    ].join('\n')

    return {
      record: windowRecord(record, head, 1),
      context: note,
      rule: 'summary',
      reads: served(reads, key, stamp, null, head, 1, null),
    }
  }

  return keep(isWholeAsk && isWholeServed ? record.file.content : null)
}
