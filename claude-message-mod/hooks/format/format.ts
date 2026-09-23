/**
 * The text shaping the tab does: a line cut to a column, the clock beside a
 * message, and the one measurement this mod makes — the bytes of a delivery
 * it kept out of the transcript.
 *
 * Pure, so the tests reach it without an engine.
 */

/**
 * A text on one line, cut to fit a column.
 *
 * @param text the text, its newlines already spaces
 * @param cells how wide it may draw, at least 4
 * @returns the text, cut with a trailing ellipsis where it did not fit
 */
export function fitText(text: string, cells: number): string {
  const width = Math.max(4, Math.floor(cells))
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length <= width ? line : `${line.slice(0, width - 1)}…`
}

/**
 * The first line of a message, for the toast and for the row of a thread the
 * person is not looking at.
 *
 * `SendMessage` itself tells the model that the recipient sees the first line
 * alone until it is expanded, so the first line is the summary its sender was
 * asked to write, and not an arbitrary cut.
 *
 * @param text the message
 * @returns its first non-empty line, trimmed; the empty string for no text
 */
export function firstLineOf(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()

    if (trimmed !== '') {
      return trimmed
    }
  }

  return ''
}

/**
 * The clock a message is stamped with, in the local time of the machine the
 * session runs on.
 *
 * @param ms the engine's clock, in milliseconds since the epoch
 * @returns `09:14`, or an empty string where the stamp is not a time
 */
export function clockText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return ''
  }

  const at = new Date(ms)
  const hours = String(at.getHours()).padStart(2, '0')
  const minutes = String(at.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}

/**
 * The bytes a text takes in UTF-8: what the transcript did not have to carry,
 * measured rather than estimated.
 *
 * The repository's rule on measurement is that a figure carries its unit and,
 * where it is estimated, its method. This one is neither estimated nor a
 * token count: it is the length of the delivery in bytes, which is why the
 * footer never adds it to anything else.
 *
 * @param text the text
 * @returns its length in bytes
 */
export function bytesOf(text: string): number {
  let bytes = 0

  for (const point of text) {
    const code = point.codePointAt(0) ?? 0

    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10_000 ? 3 : 4
  }

  return bytes
}

/**
 * A count of bytes with its thousands apart, so a footer reads at a glance.
 *
 * @param bytes the count
 * @returns `1 204`
 */
export const byteText = (bytes: number): string =>
  String(Math.max(0, Math.round(bytes))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/**
 * A text padded to a fixed width, so a column of them lines up.
 *
 * @param text the text
 * @param cells the width
 * @returns the text, padded or cut to exactly `cells`
 */
export const pad = (text: string, cells: number): string =>
  text.length >= cells ? text.slice(0, cells) : text.padEnd(cells, ' ')
