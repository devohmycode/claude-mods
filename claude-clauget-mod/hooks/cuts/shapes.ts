/**
 * One cap per tool, each to the shape of its fat (T33, T35, T40, T41).
 *
 * - Bash: head, tail, how many lines went, and the error lines of the middle
 *   kept whole — the line that says why it failed is the one worth reading.
 * - Grep in content mode: matches capped per file before the total, so one
 *   talkative file does not eat the budget of all the others; lines already
 *   shown earlier in the conversation left out.
 * - An MCP tool's JSON: long arrays keep their first items and say how many
 *   more, long strings keep their head and say their length, every key stays.
 * - A subagent's report: its conclusion kept first, its opening cut.
 * - A block pasted into a prompt: head, tail and the path, the person's
 *   sentences around it untouched.
 *
 * Each answers `null` when there is nothing to cut: the result then goes
 * through byte for byte, which is what keeps every measurement comparable.
 * Each takes the path the whole will be filed under, because the marker
 * names it.
 *
 * Pure.
 */

import { headOf, tailOf } from '../cap'
import { bytesOf } from '../format'
import {
  BLOB_HEAD_LINES,
  BLOB_MIN_BYTES,
  BLOB_MIN_LINES,
  BLOB_PROSE_SHARE,
  BLOB_TAIL_LINES,
  JSON_CHARS,
  JSON_ITEMS,
  TEXTS,
} from '../names'
import { markerOf } from './filing'

/**
 * A text cut to shape, and its figures in bytes.
 */
export type Cut = {
  text: string
  before: number
  after: number
}

const ERROR_LINE = /error|fail|exception|traceback|panic|fatal/i

/**
 * Lines taken from one end while they fit a number of bytes, newline counted.
 */
function linesWithin(lines: readonly string[], bytes: number, fromEnd: boolean): string[] {
  const out: string[] = []
  let used = 0
  const order = fromEnd ? [...lines].reverse() : lines

  for (const line of order) {
    const size = bytesOf(line) + 1

    if (used + size > bytes) {
      break
    }

    out.push(line)
    used += size
  }

  return fromEnd ? out.reverse() : out
}

/**
 * Bash's output cut to a budget: the head and the tail, four tenths of the
 * room each, and between them the marker and the middle's error lines, as
 * many as the last fifth holds.
 *
 * @param text the output
 * @param budget the bytes the model reads at most
 * @param path where the whole is filed
 * @returns the cut, or `null` when the output fits
 */
export function bashCutOf(text: string, budget: number, path: string): Cut | null {
  const before = bytesOf(text)

  if (budget <= 0 || before <= budget) {
    return null
  }

  const lines = text.split('\n')
  const room = Math.max(0, budget - 200 - bytesOf(path))
  let head = linesWithin(lines, Math.floor(room * 0.4), false)
  let tail = linesWithin(lines.slice(head.length), Math.floor(room * 0.4), true)

  if (head.length === 0) {
    head = [headOf(lines[0] ?? '', Math.floor(room * 0.4))]
  }

  if (tail.length === 0 && lines.length > 1) {
    tail = [tailOf(lines.at(-1) ?? '', Math.floor(room * 0.4))]
  }

  const middle = lines.slice(head.length, Math.max(head.length, lines.length - tail.length))
  const errors = linesWithin(
    middle.filter(line => ERROR_LINE.test(line)),
    Math.floor(room * 0.2),
    false,
  )
  const cut = middle.length - errors.length
  const marker = markerOf(
    [
      `${cut} ${TEXTS.cutLines}`,
      errors.length > 0 ? `${errors.length} ${TEXTS.keptErrors}` : '',
    ].filter(part => part !== ''),
    path,
  )
  const shorter = [...head, marker, ...errors, ...tail].join('\n')

  return { text: shorter, before, after: bytesOf(shorter) }
}

/**
 * The file a Grep content line belongs to, or `null` for a separator.
 *
 * @param line `path:12:text` for a match, `path-12-text` for context
 * @returns the path and whether the line is a match
 */
export function grepLineOf(line: string): { file: string; isMatch: boolean } | null {
  const found = /^(.+?)([:-])(\d+)\2/.exec(line)

  return found === null ? null : { file: found[1] ?? '', isMatch: found[2] === ':' }
}

/**
 * Grep's content output cut to shape: lines already shown earlier left out,
 * at most `perFile` matches of each file, then the budget.
 *
 * @param text the output
 * @param seen the lines already shown earlier in the conversation
 * @param budget the bytes the model reads at most
 * @param perFile the matches one file may show
 * @param path where the whole is filed
 * @returns the cut and the lines it shows, or `null` when nothing went
 */
export function grepCutOf(
  text: string,
  seen: ReadonlySet<string>,
  budget: number,
  perFile: number,
  path: string,
): (Cut & { shown: string[] }) | null {
  const lines = text.split('\n')
  const perFileCount = new Map<string, number>()
  const kept: string[] = []
  let already = 0
  let overFile = 0

  for (const line of lines) {
    if (line === '') {
      continue
    }

    if (seen.has(line)) {
      already += 1
      continue
    }

    const parsed = grepLineOf(line)

    if (parsed !== null) {
      const count = perFileCount.get(parsed.file) ?? 0

      if (count >= perFile) {
        overFile += 1
        continue
      }

      if (parsed.isMatch) {
        perFileCount.set(parsed.file, count + 1)
      }
    }

    kept.push(line)
  }

  const room = Math.max(0, budget - 250 - bytesOf(path))
  const within = linesWithin(kept, room, false)
  const overBudget = kept.length - within.length

  if (already === 0 && overFile === 0 && overBudget === 0) {
    return null
  }

  const marker = markerOf(
    [
      overFile + overBudget > 0 ? `${overFile + overBudget} ${TEXTS.cutLines} (${perFile} ${TEXTS.perFile})` : '',
      already > 0 ? `${already} ${TEXTS.alreadyShown}` : '',
    ].filter(part => part !== ''),
    path,
  )
  const shorter = [...within, marker].join('\n')

  return { text: shorter, before: bytesOf(text), after: bytesOf(shorter), shown: within }
}

/**
 * A JSON value on a diet: arrays past `items` keep their first and say how
 * many more, strings past `chars` keep their head and say their length, null
 * items of an array go; every key of every object stays.
 *
 * @param value the parsed JSON
 * @param items the longest array kept whole
 * @param chars the longest string kept whole
 * @returns the lighter value, and whether anything changed
 */
export function dietOf(
  value: unknown,
  items: number = JSON_ITEMS,
  chars: number = JSON_CHARS,
): { value: unknown; isChanged: boolean } {
  if (typeof value === 'string') {
    return value.length <= chars
      ? { value, isChanged: false }
      : { value: `${value.slice(0, chars)}…[${value.length} ${TEXTS.jsonChars}]`, isChanged: true }
  }

  if (Array.isArray(value)) {
    const present = value.filter(item => item !== null)
    const head = present.slice(0, items).map(item => dietOf(item, items, chars))
    const more = present.length - head.length
    const out: unknown[] = head.map(one => one.value)

    if (more > 0) {
      out.push(`+${more} ${TEXTS.jsonItems}`)
    }

    return {
      value: out,
      isChanged: more > 0 || present.length !== value.length || head.some(one => one.isChanged),
    }
  }

  if (typeof value === 'object' && value !== null) {
    let isChanged = false
    const out: Record<string, unknown> = {}

    for (const [key, one] of Object.entries(value)) {
      const dieted = dietOf(one, items, chars)

      out[key] = dieted.value
      isChanged ||= dieted.isChanged
    }

    return { value: out, isChanged }
  }

  return { value, isChanged: false }
}

/**
 * A text holding JSON, on a diet.
 *
 * @param text the text
 * @returns the lighter JSON, compact, or `null` when the text is not JSON or
 *   nothing was over the thresholds — it then goes through byte for byte
 */
export function jsonCutOf(text: string): Cut | null {
  const trimmed = text.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  const dieted = dietOf(parsed)

  if (!dieted.isChanged) {
    return null
  }

  const shorter = JSON.stringify(dieted.value)

  return bytesOf(shorter) < bytesOf(text) ? { text: shorter, before: bytesOf(text), after: bytesOf(shorter) } : null
}

/**
 * A subagent's report cut to a budget, its conclusion first: paragraphs are
 * kept from the last one back, and the marker says the opening went.
 *
 * @param text the report
 * @param budget the bytes the model reads at most
 * @param path where the whole is filed
 * @returns the cut, or `null` when the report fits
 */
export function reportCutOf(text: string, budget: number, path: string): Cut | null {
  const before = bytesOf(text)

  if (budget <= 0 || before <= budget) {
    return null
  }

  const marker = markerOf([TEXTS.conclusion], path)
  const paragraphs = text.split(/\n\s*\n/)
  const kept: string[] = []
  let used = bytesOf(marker) + 2

  for (const paragraph of [...paragraphs].reverse()) {
    const size = bytesOf(paragraph) + 2

    if (used + size > budget) {
      break
    }

    kept.unshift(paragraph)
    used += size
  }

  if (kept.length === 0) {
    kept.push(tailOf(paragraphs.at(-1) ?? '', Math.max(0, budget - bytesOf(marker) - 2)))
  }

  const shorter = [marker, ...kept].join('\n\n')

  return { text: shorter, before, after: bytesOf(shorter) }
}

/**
 * Whether a block of lines reads like a log rather than like prose: long,
 * heavy, and few of its lines end a sentence.
 *
 * @param block the block
 * @returns true for a block to file
 */
export function isBlob(block: string): boolean {
  const lines = block.split('\n')

  if (lines.length < BLOB_MIN_LINES || bytesOf(block) < BLOB_MIN_BYTES) {
    return false
  }

  const prose = lines.filter(line => /[.!?…:]["')\]]?\s*$/.test(line.trim())).length

  return prose / lines.length < BLOB_PROSE_SHARE
}

/**
 * A prompt with its pasted blocks filed: each block that reads like a log is
 * replaced by its head, a marker naming where it is filed, and its tail;
 * every other paragraph — the person's own sentences — stays as typed.
 *
 * @param text the prompt as it will reach the model
 * @param pathOf where the block of a number is filed
 * @returns the prompt and the blocks to file, or `null` when there are none
 */
export function blobCutOf(
  text: string,
  pathOf: (index: number) => string,
): { text: string; blobs: string[] } | null {
  const paragraphs = text.split(/(\n\s*\n)/)
  const blobs: string[] = []

  const out = paragraphs.map(part => {
    if (!isBlob(part)) {
      return part
    }

    const lines = part.split('\n')
    const path = pathOf(blobs.length)

    blobs.push(part)

    return [
      ...lines.slice(0, BLOB_HEAD_LINES),
      markerOf([`${TEXTS.pasted}, ${lines.length - BLOB_HEAD_LINES - BLOB_TAIL_LINES} ${TEXTS.cutLines}`], path),
      ...lines.slice(-BLOB_TAIL_LINES),
    ].join('\n')
  })

  return blobs.length === 0 ? null : { text: out.join(''), blobs }
}
