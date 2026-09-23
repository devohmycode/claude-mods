/**
 * Turning figures into the short strings a line is made of.
 *
 * Pure, and deliberately dull: every number the mod prints comes from the
 * engine, so the only thing that happens here is shortening. A function that
 * rounded a token count into another unit would be the beginning of the grand
 * total this mod refuses to print.
 */

/**
 * A count as a line carries it: whole under a thousand, then `k` and `M` with
 * one decimal where it says something.
 *
 * @param count the number, negative read as zero
 * @returns the short form (`0`, `840`, `1.2k`, `38k`, `4.1M`)
 */
export function countText(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0

  if (n < 1_000) {
    return String(n)
  }

  if (n < 1_000_000) {
    const k = n / 1_000

    return `${k < 10 ? k.toFixed(1) : String(Math.round(k))}k`
  }

  const m = n / 1_000_000

  return `${m < 10 ? m.toFixed(1) : String(Math.round(m))}M`
}

/**
 * A duration as a line carries it.
 *
 * @param ms the duration in milliseconds, negative read as zero
 * @returns the short form (`0 ms`, `820 ms`, `4.2 s`, `1 min 20 s`)
 */
export function msText(ms: number): string {
  const value = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0

  if (value < 1_000) {
    return `${value} ms`
  }

  if (value < 60_000) {
    return `${(value / 1_000).toFixed(1)} s`
  }

  const minutes = Math.floor(value / 60_000)
  const seconds = Math.round((value % 60_000) / 1_000)

  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
}

/**
 * A share as a whole percentage.
 *
 * @param part the part
 * @param whole the whole; zero or less answers `0%`
 * @returns the percentage with its sign (`43%`)
 */
export function pctText(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return '0%'
  }

  return `${Math.round((part / whole) * 100)}%`
}

/**
 * Text cut to a width, with an ellipsis where it was cut.
 *
 * @param text the text
 * @param columns how many cells it may take, one or more
 * @returns the text, or its head and `…`
 */
export function fitText(text: string, columns: number): string {
  const width = Math.max(1, Math.floor(columns))

  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`
}

/**
 * A model id as a line names it: the last meaningful part, without the date
 * a published id ends with.
 *
 * @param model the id the API reported (`claude-opus-5`, `claude-haiku-4-5-20251001`)
 * @returns the short name (`opus-5`, `haiku-4-5`)
 */
export function modelText(model: string): string {
  const bare = model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

  return bare === '' ? model : bare
}

/**
 * The bytes a text takes in UTF-8: what the transcript carries, measured
 * rather than estimated.
 *
 * A figure in bytes is never added to a figure in tokens; the cap's line
 * prints it as bytes and nothing else.
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
 * A count of bytes with its thousands apart, so a line reads at a glance.
 *
 * @param bytes the count
 * @returns `84 312`
 */
export const byteText = (bytes: number): string =>
  String(Math.max(0, Math.round(bytes))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
