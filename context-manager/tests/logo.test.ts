import { describe, expect, test } from 'claude-code/testing'

import { LOGO_BITMAP, logoCells } from '../hooks/core/logo'

const GLYPHS = new Set(['.', 'd', 'v', 'a'])     // the whole alphabet of the stored bitmap
const CELL_GLYPHS = new Set([' ', '▀', '▄', '█'])  // and of the cells it is drawn as
const WORDS = 3                                   // u32 words one cell packs: the code point, the fg, the bg
const BYTES = 4
const DEFAULT_COLOR = 0x01000000
const VIOLET_COLOR = 0x8b5cf6
const AMBER_COLOR = 0xf59e0b
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// The decoder the surface has, written the short way round, so the test reads the payload rather than
// the encoder that wrote it.
const bytesOf = (base64: string): number[] => {
  const clean = base64.replace(/=+$/, '')
  return Array.from({ length: Math.ceil(clean.length / 4) }, (_, at) => clean.slice(at * 4, at * 4 + 4))
    .flatMap(quad => {
      const sextets = [...quad].map(char => ALPHABET.indexOf(char))
      const packed = sextets.reduce((bits, sextet) => (bits << 6) | sextet, 0) << (6 * (4 - sextets.length))
      return [(packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff].slice(0, sextets.length - 1)
    })
}

const wordAt = (bytes: readonly number[], at: number): number =>
  (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24)

describe('logo', () => {
  test('the stored bitmap is eight rows of eight pixels in four glyphs', () => {
    const rows = LOGO_BITMAP.split('\n')

    expect(rows).toHaveLength(8)
    expect(rows.every(row => row.length === 8)).toEqual(true)
    expect([...LOGO_BITMAP.replace(/\n/g, '')].every(pixel => GLYPHS.has(pixel))).toEqual(true)
    expect(LOGO_BITMAP.includes('d'), 'the rails').toEqual(true)
    expect(LOGO_BITMAP.includes('v'), 'the violet knobs').toEqual(true)
    expect(LOGO_BITMAP.includes('a'), 'the amber knobs').toEqual(true)
  })

  test('the mark reads as four sliders: a full rail under a two-pixel knob, each at its own level', () => {
    const rows = LOGO_BITMAP.split('\n')
    const levels = [0, 1, 2, 3].map(slider => {
      const top = rows[slider * 2] ?? ''
      const rail = rows[slider * 2 + 1] ?? ''
      const knob = top.search(/[va]/)
      // The knob is the only ink above the rail, two pixels wide, and the rail carries it through.
      expect(top.replace(/[va]/g, '.'), `slider ${slider}: nothing but the knob above`).toEqual('........')
      expect(top.slice(knob, knob + 2), `slider ${slider}: a two-pixel knob`).toMatch(/^(vv|aa)$/)
      expect(rail.slice(knob, knob + 2), `slider ${slider}: the rail holds the knob`).toEqual(top.slice(knob, knob + 2))
      expect(rail.replace(/[va]/g, 'd'), `slider ${slider}: a rail end to end`).toEqual('dddddddd')
      return knob
    })

    expect(new Set(levels).size, 'no two knobs at one level').toEqual(4)
    // The knobs alternate: violet, amber, violet, amber.
    expect(levels.map((knob, slider) => rows[slider * 2]?.[knob])).toEqual(['v', 'a', 'v', 'a'])
  })

  test('the cells are one padded base64 payload of the size the Raster declares', () => {
    const { columns, rows, cells } = logoCells()

    expect({ columns, rows }).toEqual({ columns: 8, rows: 4 })
    // Standard padded base64: four characters per three bytes, and the payload divides by three here.
    expect(cells.length).toEqual((columns * rows * WORDS * BYTES) / 3 * 4)
    expect(/^[A-Za-z0-9+/]*={0,2}$/.test(cells), 'nothing outside the standard alphabet').toEqual(true)
    expect(bytesOf(cells)).toHaveLength(columns * rows * WORDS * BYTES)
  })

  test('the first cells decode back to the pixels the bitmap holds', () => {
    const { columns, rows, cells } = logoCells()
    const bytes = bytesOf(cells)
    const cell = WORDS * BYTES

    // The bitmap opens '.' over 'd': an empty pixel over the rail, drawn as a lower half block in the
    // terminal's own foreground.
    expect(wordAt(bytes, 0)).toEqual('▄'.codePointAt(0))
    expect(wordAt(bytes, 4), 'the rail takes the terminal\'s own foreground').toEqual(DEFAULT_COLOR)
    expect(wordAt(bytes, 8)).toEqual(DEFAULT_COLOR)
    // Then 'v' over 'v': the knob, a full block that names its colour.
    expect(wordAt(bytes, cell)).toEqual('█'.codePointAt(0))
    expect(wordAt(bytes, cell + 4), 'the violet knob names its colour').toEqual(VIOLET_COLOR)
    // The second slider's knob, on the next row of cells, is amber.
    const amber = (columns + 4) * cell
    expect(wordAt(bytes, amber)).toEqual('█'.codePointAt(0))
    expect(wordAt(bytes, amber + 4)).toEqual(AMBER_COLOR)

    // Every cell is one of the four glyphs the mark is drawn with, and one of its three colours.
    const glyphs = Array.from({ length: columns * rows }, (_, at) =>
      String.fromCodePoint(wordAt(bytes, at * cell)))
    expect(glyphs.every(glyph => CELL_GLYPHS.has(glyph))).toEqual(true)
    const colors = Array.from({ length: columns * rows * 2 }, (_, at) =>
      wordAt(bytes, Math.floor(at / 2) * cell + (at % 2 === 0 ? 4 : 8)))
    const palette = [DEFAULT_COLOR, VIOLET_COLOR, AMBER_COLOR]
    expect(colors.every(color => palette.includes(color))).toEqual(true)
    expect(colors.includes(VIOLET_COLOR) && colors.includes(AMBER_COLOR), 'both knob colours').toEqual(true)
  })
})
