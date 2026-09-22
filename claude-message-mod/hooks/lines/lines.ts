/**
 * The thread's lines: a message wrapped to the column it draws in, cut to a
 * preview where it is long, and as many of the last messages as the pane has
 * rows for.
 *
 * Pure, and deliberately ignorant of what a note is — it takes a text, a
 * width and a count of rows. That is what lets the tests say how a message
 * lands on screen without an engine under them, and it is the reason the
 * wrapping is done here rather than left to the surface: a body the mod has
 * measured is a body the mod can page, and a `Show more` under a cut message
 * has to know how much it is hiding.
 */

import { NOTE_CHARS } from '../names'

/**
 * One message's body, as the thread draws it.
 */
export type Body = {
  /**
   * Its lines, each already inside the column.
   */
  lines: readonly string[]

  /**
   * The characters the preview left out: 0 where the whole of it is drawn,
   * which is both the short message and the one a person has expanded.
   */
  hidden: number
}

/**
 * A text cut to a preview: what is drawn, and what the cut left out.
 */
export type Cut = {
  /**
   * The preview, its ellipsis on the end where anything was cut.
   */
  text: string

  /**
   * The characters left out, 0 where nothing was.
   */
  hidden: number
}

/**
 * A text wrapped to a column, on its spaces where it has any.
 *
 * Its own newlines are kept, blank line and all: a message another session
 * wrote in paragraphs reads as paragraphs, and a list stays a list. A word
 * longer than the column — a path, an address — is cut across lines rather
 * than pushing the column out, which in a flex row would shrink the
 * neighbour instead of scrolling.
 *
 * @param text the text
 * @param cells how wide it may draw, at least 8
 * @returns its lines, none longer than the column
 */
export function wrapText(text: string, cells: number): readonly string[] {
  const width = Math.max(8, Math.floor(cells))
  const rows: string[] = []

  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    const flat = paragraph.replace(/\t/g, '  ').trimEnd()

    if (flat.trim() === '') {
      rows.push('')

      continue
    }

    let row = ''

    for (const word of flat.trim().split(/ +/)) {
      let rest = word

      while (rest.length > width) {
        if (row !== '') {
          rows.push(row)
          row = ''
        }

        rows.push(rest.slice(0, width))
        rest = rest.slice(width)
      }

      if (rest === '') {
        continue
      }

      if (row === '') {
        row = rest
      } else if (row.length + 1 + rest.length <= width) {
        row = `${row} ${rest}`
      } else {
        rows.push(row)
        row = rest
      }
    }

    if (row !== '') {
      rows.push(row)
    }
  }

  return rows.length === 0 ? [''] : rows
}

/**
 * A text cut to a preview, on the last space before the limit so that the
 * cut never lands inside a word.
 *
 * @param text the text
 * @param max the characters the preview may carry, at least 16
 * @returns the preview with its ellipsis, and the characters it left out
 */
export function cutAt(text: string, max: number): Cut {
  const clean = text.trim()
  const limit = Math.max(16, Math.floor(max))

  if (clean.length <= limit) {
    return { text: clean, hidden: 0 }
  }

  const head = clean.slice(0, limit)
  const space = head.lastIndexOf(' ')

  // A cut on a space, unless the space is so early that the preview would
  // say nothing: a single long token is then cut where it falls.
  const kept = (space > limit / 2 ? head.slice(0, space) : head).trimEnd()

  return { text: `${kept}…`, hidden: clean.length - kept.length }
}

/**
 * One message's body as the thread draws it: cut to a preview where it is
 * long and the person has not asked for the whole of it, then wrapped.
 *
 * @param text the message
 * @param cells the column's width
 * @param isAll whether the person pressed `Show more` on this one
 * @param max the characters a preview carries
 * @returns its lines and what the preview hides
 */
export function bodyLines(
  text: string,
  cells: number,
  isAll: boolean,
  max: number = NOTE_CHARS,
): Body {
  const cut = isAll ? { text: text.trim(), hidden: 0 } : cutAt(text, max)

  return { lines: wrapText(cut.text, cells), hidden: cut.hidden }
}

/**
 * The first of the last messages the pane has room for.
 *
 * Counted from the newest backwards, because the newest is the one the
 * person came to read. The newest is drawn whatever it costs: a message a
 * person has just expanded is taller than the pane on purpose, and the
 * surface scrolls it — which is worth paying for where they asked for it.
 *
 * @param costs the rows each message takes, oldest first
 * @param rows the rows the thread has
 * @returns the index of the first message drawn; 0 for an empty thread
 */
export function fitFrom(costs: readonly number[], rows: number): number {
  const room = Math.max(1, Math.floor(rows))
  let used = 0
  let first = costs.length

  for (let index = costs.length - 1; index >= 0; index -= 1) {
    const cost = costs[index] ?? 0

    if (index < costs.length - 1 && used + cost > room) {
      break
    }

    used += cost
    first = index
  }

  return costs.length === 0 ? 0 : first
}
