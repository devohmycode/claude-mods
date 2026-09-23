/**
 * The cap: a tool's output cut to a budget of bytes, head and tail kept, and
 * one line in the middle saying what went.
 *
 * Pure. The one decision that matters — whether a rewrite takes at all — is
 * the register's and `call`'s; this module only answers what the shorter text
 * is, and answers nothing when there is nothing to cut, so a result under the
 * cap is never touched by so much as a re-encoding.
 */

import { bytesOf } from '../format'
import { MARK, TEXTS } from '../names'

/**
 * What a cap is set to.
 *
 * `bytes` is the budget of the text the model reads, the marker line
 * included; zero or less is a cap that is off.
 */
export type CapLimits = {
  bytes: number
}

/**
 * A text the cap shortened, and the figures of what it took.
 *
 * Bytes, measured: the length in UTF-8 of the text before and after, which is
 * what the transcript carries and the only figure here. No token count is
 * derived from it.
 */
export type Capped = {
  text: string
  before: number
  after: number
  cutLines: number
  /**
   * The bytes of the marker line: what the mod itself put where the model
   * reads it, which goes in the mod's own column, not the savings'.
   */
  shown: number
}

/**
 * The longest head of a text that fits a number of bytes, cut on a code
 * point and never inside one.
 *
 * @param text the text
 * @param bytes the room, in UTF-8 bytes
 * @returns the head
 */
export function headOf(text: string, bytes: number): string {
  let used = 0
  let end = 0

  for (const point of text) {
    const size = bytesOf(point)

    if (used + size > bytes) {
      break
    }

    used += size
    end += point.length
  }

  return text.slice(0, end)
}

/**
 * The longest tail of a text that fits a number of bytes, cut on a code
 * point and never inside one.
 *
 * @param text the text
 * @param bytes the room, in UTF-8 bytes
 * @returns the tail
 */
export function tailOf(text: string, bytes: number): string {
  const points = Array.from(text)
  let used = 0
  let start = points.length

  while (start > 0) {
    const size = bytesOf(points[start - 1] ?? '')

    if (used + size > bytes) {
      break
    }

    used += size
    start -= 1
  }

  return points.slice(start).join('')
}

/**
 * The line that stands where the middle was, as the model reads it.
 *
 * @param lines how many whole lines went
 * @param bytes how many bytes went
 * @returns the line, without its newline
 */
export const cutLineOf = (lines: number, bytes: number): string =>
  `[${MARK}: ${lines} ${TEXTS.lines}, ${bytes} ${TEXTS.bytes} ${TEXTS.cut}]`

/**
 * A text cut to the cap: whole lines from the head and from the tail, half
 * the room each, and the marker line between them.
 *
 * A line longer than half the room on its own — a minified file, a JSON
 * blob on one line — is cut by bytes instead, so the head and the tail are
 * never both empty for want of a newline.
 *
 * @param text the text
 * @param limits the cap
 * @returns the shorter text and its figures, or `null` when the text fits
 *   (or the cap is off): the caller then keeps what it had, byte for byte
 */
export function capOf(text: string, limits: CapLimits): Capped | null {
  const before = bytesOf(text)

  if (limits.bytes <= 0 || before <= limits.bytes) {
    return null
  }

  const lines = text.split('\n')
  // The marker's own length depends on what it counts; its widest form bounds
  // it, so the result never runs past the budget it was cut to.
  const room = Math.max(0, limits.bytes - bytesOf(cutLineOf(lines.length, before)) - 2)
  const half = Math.floor(room / 2)

  let head: string[] = []
  let used = 0

  for (const line of lines) {
    const size = bytesOf(line) + 1

    if (used + size > half) {
      break
    }

    head.push(line)
    used += size
  }

  let tail: string[] = []

  used = 0

  for (let i = lines.length - 1; i >= head.length; i -= 1) {
    const line = lines[i] ?? ''
    const size = bytesOf(line) + 1

    if (used + size > half) {
      break
    }

    tail.unshift(line)
    used += size
  }

  if (head.length === 0) {
    head = [headOf(lines[0] ?? '', half)]
  }

  // The loop above stops at a last line wider than half the room, or at the
  // one line a single-line text has: either way its tail is what is kept.
  if (tail.length === 0) {
    tail = [tailOf(lines[lines.length - 1] ?? '', half)]
  }

  const kept = [...head, ...tail].join('\n')
  const cutLines = Math.max(0, lines.length - head.length - tail.length)
  const marker = cutLineOf(cutLines, Math.max(0, before - bytesOf(kept)))
  const shorter = [...head, marker, ...tail].join('\n')

  return { text: shorter, before, after: bytesOf(shorter), cutLines, shown: bytesOf(marker) }
}
