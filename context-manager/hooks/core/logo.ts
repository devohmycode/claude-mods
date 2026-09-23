// The mark, stored as drawn (assets/logo.svg is the same picture at scale): an 8×8 three-tone bitmap of
// a mixing desk — four sliders, one per row of cells, each a thin rail with a knob set at its own level,
// the context being managed rather than merely saved. The rails are drawn in the terminal's own default
// foreground rather than as an rgb value, so the mark reads on a light theme and a dark one alike; only
// the knobs name a colour, violet and amber in turn. Eight pixel rows are drawn as four rows of cells,
// two vertical pixels to a cell, with '▀', '▄', '█' or a space: a rail is a lower half block, a knob a
// full one.
const EMPTY = '.'
const DARK = 'd'                    // a rail: the terminal's default foreground
const VIOLET = 'v'                  // the violet knobs, first and third slider
const AMBER = 'a'                   // the amber knobs, second and fourth
const DEFAULT_COLOR = 0x01000000    // bit 24 alone: whatever the terminal calls default in this slot
const VIOLET_COLOR = 0x8b5cf6
const AMBER_COLOR = 0xf59e0b
const UPPER = 0x2580                // '▀'
const LOWER = 0x2584                // '▄'
const BOTH = 0x2588                 // '█'
const NEITHER = 0x20                // ' '
const PIXEL_ROWS = 2                // pixel rows one cell holds
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The mark as eight rows of eight pixels: '.' empty, 'd' a rail, 'v' a violet knob, 'a' an amber one. */
export const LOGO_BITMAP = [
  '.vv.....',
  'dvvddddd',
  '....aa..',
  'ddddaadd',
  '.....vv.',
  'dddddvvd',
  '..aa....',
  'ddaadddd',
].join('\n')

/** The colour one pixel is drawn in. */
const colorOf = (pixel: string): number =>
  pixel === AMBER ? AMBER_COLOR : pixel === VIOLET ? VIOLET_COLOR : DEFAULT_COLOR

/** One cell as its three words: the glyph that holds both pixels, then its foreground and background. */
const cellOf = (top: string, bottom: string): readonly number[] => {
  if (top === EMPTY && bottom === EMPTY) return [NEITHER, DEFAULT_COLOR, DEFAULT_COLOR]
  if (bottom === EMPTY) return [UPPER, colorOf(top), DEFAULT_COLOR]
  if (top === EMPTY) return [LOWER, colorOf(bottom), DEFAULT_COLOR]
  if (top === bottom) return [BOTH, colorOf(top), DEFAULT_COLOR]
  // Two tones in one cell: the half block paints one pixel and its background the other, and the rail
  // takes the foreground, because 'default' in a background is the pane rather than the ink.
  return bottom === DARK ? [LOWER, DEFAULT_COLOR, colorOf(top)] : [UPPER, colorOf(top), colorOf(bottom)]
}

/** The word split into its four little-endian bytes. */
const bytesOf = (word: number): readonly number[] =>
  [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]

/** One character of the alphabet, by its six-bit value. */
const charOf = (value: number): string => ALPHABET[value] ?? ''

/** Three bytes as their four base64 characters, the tail padded with '='. */
const quadOf = (bytes: readonly number[], at: number): string => {
  const first = bytes[at] ?? 0
  const second = bytes[at + 1] ?? 0
  const third = bytes[at + 2] ?? 0
  const left = bytes.length - at
  return charOf(first >>> 2)
    + charOf(((first & 0x03) << 4) | (second >>> 4))
    + (left > 1 ? charOf(((second & 0x0f) << 2) | (third >>> 6)) : '=')
    + (left > 2 ? charOf(third & 0x3f) : '=')
}

/** Standard padded base64 of the bytes, without a Buffer or a global. */
const base64 = (bytes: readonly number[]): string =>
  Array.from({ length: Math.ceil(bytes.length / 3) }, (_, at) => quadOf(bytes, at * 3)).join('')

/** The mark as a Raster: eight columns of four cells, packed as the element's `cells` are. */
export const logoCells = (): { columns: number; rows: number; cells: string } => {
  const pixels = LOGO_BITMAP.split('\n')
  const columns = (pixels[0] ?? '').length
  const rows = pixels.length / PIXEL_ROWS
  const words = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const top = pixels[row * PIXEL_ROWS] ?? ''
      const bottom = pixels[row * PIXEL_ROWS + 1] ?? ''
      return cellOf(top[column] ?? EMPTY, bottom[column] ?? EMPTY)
    })).flat(2)
  return { columns, rows, cells: base64(words.flatMap(bytesOf)) }
}
