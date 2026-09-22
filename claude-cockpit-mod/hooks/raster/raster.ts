/**
 * The cells of a `Raster`, the terminal's cell-grid leaf: a fixed box whose
 * every cell is a glyph, a foreground and a background, packed as the
 * element's `cells` prop takes them.
 *
 * The packing is standard padded base64 of `columns * rows` little-endian
 * u32 triplets `[codePoint, foreground, background]`, row-major, a color
 * `0x00RRGGBB` or `DEFAULT_COLOR` for the terminal's own. The bytes are laid
 * out by hand rather than through a typed array's buffer, so the order is the
 * element's whatever the machine's is.
 */

/**
 * The color that leaves a cell the terminal's own: bit 24 alone.
 */
export const DEFAULT_COLOR = 0x01000000

/**
 * A blank cell: a space in the terminal's own colors.
 */
const BLANK = { codePoint: 0x20, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR }

/**
 * The eighth blocks, `▁` to `█`: the glyph for a bar filling 1/8 of a cell
 * up to a full one, at index 1 to 8, and a space at 0.
 */
const EIGHTHS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

/**
 * One cell of a raster.
 */
export type Cell = {
  codePoint: number
  fg: number
  bg: number
}

/**
 * A raster ready to draw: what `<Raster>` takes beside its key.
 */
export type Raster = {
  columns: number
  rows: number
  cells: string
}

/**
 * The cells packed as `RasterProps.cells` takes them.
 *
 * @param cells every cell, row-major, exactly `columns * rows` of them
 * @returns the standard padded base64 of their triplets
 */
export function packCells(cells: readonly Cell[]): string {
  const bytes = new Uint8Array(cells.length * 12)

  cells.forEach((cell, index) => {
    writeU32(bytes, index * 12, cell.codePoint)
    writeU32(bytes, index * 12 + 4, cell.fg)
    writeU32(bytes, index * 12 + 8, cell.bg)
  })

  return base64Of(bytes)
}

/**
 * One u32 written little-endian at an offset.
 *
 * @param bytes the buffer
 * @param at the offset
 * @param value the word
 */
function writeU32(bytes: Uint8Array, at: number, value: number): void {
  const word = value >>> 0

  bytes[at] = word & 0xff
  bytes[at + 1] = (word >>> 8) & 0xff
  bytes[at + 2] = (word >>> 16) & 0xff
  bytes[at + 3] = (word >>> 24) & 0xff
}

/**
 * Standard padded base64 of the bytes, by hand: the hooks module's
 * environment is neither a browser nor Node, and `Uint8Array.toBase64` is not
 * in every build that loads it.
 *
 * @param bytes the buffer
 * @returns its base64
 */
function base64Of(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  let text = ''

  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1] ?? 0
    const c = bytes[at + 2] ?? 0
    const left = bytes.length - at

    text += alphabet[a >>> 2]
    text += alphabet[((a & 0x03) << 4) | (b >>> 4)]
    text += left > 1 ? alphabet[((b & 0x0f) << 2) | (c >>> 6)] : '='
    text += left > 2 ? alphabet[c & 0x3f] : '='
  }

  return text
}

/**
 * A series fitted to a width, each column the highest value of the slice it
 * covers, so a spike survives the fit and a long session still shows whole.
 *
 * @param values the series, oldest first
 * @param columns how many columns it must fill, at least 1
 * @returns one value per column, or an empty list for an empty series
 */
export function fitTo(
  values: readonly number[],
  columns: number,
): readonly number[] {
  const width = Math.max(1, Math.floor(columns))

  if (values.length === 0) {
    return []
  }

  if (values.length <= width) {
    return values
  }

  const per = values.length / width

  return Array.from({ length: width }, (_unused, column) => {
    const from = Math.floor(column * per)
    const to = Math.max(from + 1, Math.floor((column + 1) * per))

    return Math.max(...values.slice(from, to))
  })
}

/**
 * A two-row sparkline of a series of percentages: every column a bar of
 * sixteen levels, colored by where its own value sits.
 *
 * The series is fitted to the width first, so the whole session shows however
 * many turns it ran.
 *
 * @param percents the series, oldest first, each 0 to 100
 * @param columns the width in cells
 * @param colorAt the color of a column, by its value
 * @returns the raster, or null for an empty series or no width
 */
export function sparklineOf(
  percents: readonly number[],
  columns: number,
  colorAt: (percent: number) => number,
): Raster | null {
  const width = Math.floor(columns)
  const values = fitTo(percents, width)

  if (values.length === 0 || width < 1) {
    return null
  }

  const rows = 2
  const cells: Cell[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const percent = values[column]

      if (percent === undefined) {
        cells.push(BLANK)
        continue
      }

      const level = Math.round(Math.min(100, Math.max(0, percent)) * 0.16)
      const here = row === 0 ? level - 8 : level

      cells.push({
        codePoint: EIGHTHS[Math.min(8, Math.max(0, here))] ?? 0x20,
        fg: colorAt(percent),
        bg: DEFAULT_COLOR,
      })
    }
  }

  return { columns: width, rows, cells: packCells(cells) }
}

/**
 * The band a value falls in, of a scale whose top is the busiest value: 0 for
 * nothing, then one of the bands above it.
 *
 * The scale is the window's own rather than a fixed one, because what counts
 * as a busy day is what a busy day was here; a fixed top would draw every
 * week of a quiet month the same shade as an idle one.
 *
 * @param value the value
 * @param top the busiest value of the window, 0 for an empty one
 * @param bands how many bands there are above nothing, at least 1
 * @returns the band, 0 to `bands`
 */
export function bandOf(value: number, top: number, bands: number): number {
  const count = Math.max(1, Math.floor(bands))

  if (value <= 0 || top <= 0) {
    return 0
  }

  return Math.min(count, Math.max(1, Math.ceil((value / top) * count)))
}

/**
 * A calendar of counts as a raster: one column a week, one row a weekday,
 * every cell a filled block in the shade of the band its count falls in.
 *
 * A cell the window does not reach — a weekday of this week that has not
 * happened yet — is a blank, so the grid ends where the days do.
 *
 * @param columns the counts, a column a week, seven of them each, `null` for
 *   a cell outside the window
 * @param shades the colors, quietest first, `0x00RRGGBB` each; the first is
 *   the shade of a day with nothing on it
 * @returns the raster, or null with no column or no shade
 */
export function calendarRasterOf(
  columns: readonly (readonly (number | null)[])[],
  shades: readonly number[],
): Raster | null {
  if (columns.length === 0 || shades.length === 0) {
    return null
  }

  const rows = 7
  const top = columns.reduce(
    (high, week) =>
      week.reduce<number>((best, one) => Math.max(best, one ?? 0), high),
    0,
  )

  const cells: Cell[] = []

  for (let row = 0; row < rows; row += 1) {
    for (const week of columns) {
      const count = week[row]

      if (count === null || count === undefined) {
        cells.push(BLANK)
        continue
      }

      const band = bandOf(count, top, shades.length - 1)

      cells.push({
        codePoint: 0x2588,
        fg: shades[band] ?? shades[0] ?? DEFAULT_COLOR,
        bg: DEFAULT_COLOR,
      })
    }
  }

  return { columns: columns.length, rows, cells: packCells(cells) }
}
