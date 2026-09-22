/**
 * The cockpit's numbers and paths as cells: short enough for a pane that is
 * often half a terminal wide, and the same width whatever the value.
 */

/**
 * A duration in the fewest characters that still say which order it is:
 * `840ms` under a second, `4.2s` under a minute, `3m10s` beyond.
 *
 * @param ms the duration
 * @returns the text
 */
export function msText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—'
  }

  if (ms < 1_000) {
    return `${Math.round(ms)}ms`
  }

  if (ms < 60_000) {
    return `${(ms / 1_000).toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)

  return `${minutes}m${String(seconds).padStart(2, '0')}s`
}

/**
 * A count in the fewest characters: `938`, `24.1k`, `1.2M`.
 *
 * @param count the number
 * @returns the text
 */
export function countText(count: number): string {
  if (!Number.isFinite(count)) {
    return '—'
  }

  const n = Math.round(count)

  if (Math.abs(n) < 1_000) {
    return String(n)
  }

  if (Math.abs(n) < 1_000_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }

  return `${(n / 1_000_000).toFixed(1)}M`
}

/**
 * The lines a file moved this session, as short as it can be said: `+34 -7`,
 * or one half where only one moved, or nothing at all where neither did.
 *
 * The halves come apart because a diff is read in two colors, and one string
 * can only take one: the blank that right-aligns the pair in its column, then
 * the lines in, then the lines out. A file Claude only read moved nothing,
 * and an empty column beside it says that better than a pair of zeroes.
 *
 * @param added the lines put in
 * @param removed the lines taken out
 * @param cells the column's width, which the three parts fill exactly
 * @returns the blank, the lines in (with the space before the other half,
 *   where both are drawn), and the lines out
 */
export function churnParts(
  added: number,
  removed: number,
  cells: number,
): { blank: string; added: string; removed: string } {
  const plus = added > 0 ? `+${countText(added)}` : ''
  const minus = removed > 0 ? `-${countText(removed)}` : ''
  const isPair = plus !== '' && minus !== ''

  const width = plus.length + minus.length + (isPair ? 1 : 0)

  return {
    blank: ' '.repeat(Math.max(0, Math.floor(cells) - width)),
    added: isPair ? `${plus} ` : plus,
    removed: minus,
  }
}

/**
 * A cost in dollars, to the cent, or a dash where the session reports none.
 *
 * @param usd the cost, or null
 * @returns the text
 */
export const usdText = (usd: number | null): string =>
  usd === null ? '—' : `$${usd.toFixed(2)}`

/**
 * A percentage with no decimals, or a dash where there is no reading.
 *
 * @param percent the percentage, or null
 * @returns the text
 */
export const percentText = (percent: number | null): string =>
  percent === null ? '—' : `${Math.round(percent)}%`

/**
 * A size in gibibytes, as the machine's memory is read: `9.7G`, or a dash
 * where there is no reading.
 *
 * @param kb the size in kibibytes, or null
 * @returns the text
 */
export const gbText = (kb: number | null): string =>
  kb === null || !Number.isFinite(kb) ? '—' : `${(kb / 1_048_576).toFixed(1)}G`

/**
 * A plan window's name as the Session tab draws it: `5-hour` and `Week` for
 * the two every subscription has, and whatever a window carries beyond them.
 *
 * The engine passes the kind the API reported, and an account may report
 * windows this was not written against — a weekly window for one model
 * family beside the one for all of them. So a kind that is not one of the
 * three known ones is drawn rather than dropped: its own words, its
 * underscores opened out.
 *
 * @param kind the window's kind, as `$.session.usage()` reports it
 * @returns the name for the row
 */
export function limitName(kind: string): string {
  const words = (rest: string): string => rest.replace(/_/g, ' ').trim()

  if (kind === 'five_hour') {
    return '5-hour'
  }

  if (kind === 'seven_day') {
    return 'Week'
  }

  if (kind === 'spend_limit') {
    return 'Spend'
  }

  if (kind.startsWith('five_hour_')) {
    return `5-hour · ${words(kind.slice('five_hour_'.length))}`
  }

  if (kind.startsWith('seven_day_')) {
    return `Week · ${words(kind.slice('seven_day_'.length))}`
  }

  return words(kind)
}

/**
 * A wait in the fewest characters that still say which order it is: `14m`
 * under the hour, `2h14m` under the day, `3d4h` beyond, `now` for a window
 * whose reset is due or past.
 *
 * @param ms how long is left
 * @returns the text
 */
export function untilText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'now'
  }

  const minutes = Math.max(1, Math.round(ms / 60_000))

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  }

  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

/**
 * An ISO 8601 timestamp as milliseconds on the same clock `$.clock.now()`
 * reads, or null for one that says nothing.
 *
 * @param stamp the timestamp, or undefined where the engine gave none
 * @returns the instant, or null
 */
export function stampOf(stamp: string | undefined): number | null {
  if (stamp === undefined) {
    return null
  }

  const ms = Date.parse(stamp)

  return Number.isFinite(ms) ? ms : null
}

/**
 * A path as a row shows it: the steps under the root the session works in,
 * `hooks/register.ts` rather than the whole of it.
 *
 * Every row of the tab is the same project, so the head they share is the
 * part that says nothing — and it is what a narrow column would otherwise
 * spend its cells on before cutting off the names that tell the rows apart.
 *
 * A file the root does not hold keeps its path whole: `../../../etc/hosts`
 * says less about where a file is than where it is says.
 *
 * @param path the path as the cockpit keeps it: absolute, forward slashes
 * @param root the root to draw against, empty where there is none
 * @returns the path under the root, or the path as it was
 */
export function relativeOf(path: string, root: string): string {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')

  if (base === '') {
    return path
  }

  // Lowercased on both sides to compare, never to draw: a host may spell the
  // drive or a folder in a case of its own, and the row shows the file's own.
  const isUnder = path.toLowerCase().startsWith(`${base.toLowerCase()}/`)

  return isUnder ? path.slice(base.length + 1) : path
}

/**
 * A path cut to the cells it has, from its start, since the end of a path is
 * what tells two files apart.
 *
 * @param path the path
 * @param cells how wide it may draw, at least 4
 * @returns the path, cut with a leading ellipsis where it did not fit
 */
export function fitPath(path: string, cells: number): string {
  const width = Math.max(4, Math.floor(cells))

  if (path.length <= width) {
    return path
  }

  return `…${path.slice(path.length - (width - 1))}`
}

/**
 * A line cut to the cells it has, from its end, for text that reads from the
 * left: a command, a tool's argument.
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
 * A tool's name as a narrow column shows it: a built-in tool by its name, an
 * MCP tool as its server and its own name, `linear·create_issue`.
 *
 * The engine names an MCP tool `mcp__<server>__<tool>`, which is long and
 * begins with what every one of them has in common; cut from the end, as a
 * line of text is, a column of them reads as the same tool called twenty
 * times. So the prefix goes, and where even that does not fit it is the
 * server that is cut, from its start, since the tool's own name is what tells
 * two rows apart.
 *
 * @param tool the tool's name, as the call carries it
 * @param cells how wide it may draw, at least 4
 * @returns the name, cut to fit
 */
export function toolText(tool: string, cells: number): string {
  const width = Math.max(4, Math.floor(cells))

  if (!tool.startsWith('mcp__')) {
    return fitText(tool, width)
  }

  const parts = tool.slice(5).split('__')
  const server = parts[0] ?? ''
  const name = parts.slice(1).join('__')

  if (name === '') {
    return fitText(server, width)
  }

  const whole = `${server}·${name}`

  if (whole.length <= width) {
    return whole
  }

  const room = width - name.length - 1

  return room >= 2
    ? `…${server.slice(server.length - (room - 1))}·${name}`
    : fitText(name, width)
}

/**
 * A text padded to a fixed width, so a column of them lines up.
 *
 * @param text the text
 * @param cells the width
 * @returns the text, padded or cut to exactly `cells`
 */
export const pad = (text: string, cells: number): string =>
  text.length >= cells ? text.slice(0, cells) : text.padEnd(cells, ' ')

/**
 * A text right-aligned in a fixed width.
 *
 * @param text the text
 * @param cells the width
 * @returns the text, padded from the left or cut to exactly `cells`
 */
export const padLeft = (text: string, cells: number): string =>
  text.length >= cells ? text.slice(text.length - cells) : text.padStart(cells, ' ')

/**
 * A duration long enough to be worth hours: `20h35m`, `38m12s`, `4.2s`,
 * `840ms`. `msText` says the short orders; this one carries on past the hour,
 * where `184m30s` stops being a reading anyone can place.
 *
 * @param ms the duration
 * @returns the text
 */
export function longMsText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—'
  }

  if (ms < 3_600_000) {
    return msText(ms)
  }

  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.round((ms % 3_600_000) / 60_000)

  return minutes === 60
    ? `${hours + 1}h00m`
    : `${hours}h${String(minutes).padStart(2, '0')}m`
}

/**
 * A bar of a percentage, drawn in the block characters every terminal has:
 * the eighths, so a bar of ten cells still moves at one percent.
 *
 * @param percent the reading, 0 to 100; past 100 it fills
 * @param cells the bar's width, at least 1
 * @returns the bar, exactly `cells` wide
 */
export function barText(percent: number | null, cells: number): string {
  const width = Math.max(1, Math.floor(cells))

  if (percent === null || !Number.isFinite(percent)) {
    return '·'.repeat(width)
  }

  const eighths = Math.round(
    (Math.min(100, Math.max(0, percent)) / 100) * width * 8,
  )

  const full = Math.floor(eighths / 8)
  const rest = eighths % 8

  const partial = rest === 0 ? '' : '▏▎▍▌▋▊▉'[rest - 1]

  return `${'█'.repeat(full)}${partial ?? ''}`.padEnd(width, '░').slice(0, width)
}

/**
 * A date as a row names it: `Sep 20`, or with the year where it is not this
 * one. Local, since a day of use is a day the person lived.
 *
 * @param ms the instant, or null
 * @param nowMs the clock the year is judged against
 * @returns the text
 */
export function dateText(ms: number | null, nowMs: number): string {
  if (ms === null || !Number.isFinite(ms)) {
    return '—'
  }

  const at = new Date(ms)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]

  const month = months[at.getMonth()] ?? '—'
  const day = at.getDate()
  const year = at.getFullYear()

  return year === new Date(nowMs).getFullYear()
    ? `${month} ${day}`
    : `${month} ${day}, ${year}`
}

/**
 * A model as a narrow column shows it: the API's id without the vendor's
 * prefix and without the date it was pinned on, `opus-5` out of
 * `claude-opus-5-20260101`.
 *
 * @param model the id the API reports
 * @param cells how wide it may draw, at least 4
 * @returns the name, cut to fit
 */
export function modelText(model: string, cells: number): string {
  const short = model
    .replace(/^(us|eu|apac)\./, '')
    .replace(/^anthropic\./, '')
    .replace(/^claude-/, '')
    .replace(/-\d{8}(?=\[|$)/, '')
    .replace(/-v\d+:\d+$/, '')

  return fitText(short === '' ? model : short, cells)
}
