import { describe, expect, test, tier } from 'claude-code/testing'

import { DEFAULT_COLOR, fitTo, packCells, sparklineOf } from '../hooks/raster'

tier('user')

/**
 * The triplets a packed string holds, read back the way the element reads
 * them: standard base64 of little-endian u32s, three to a cell.
 *
 * @param cells the packed string
 * @returns one triplet per cell
 */
function unpack(cells: string): number[][] {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  const bits = [...cells.replace(/=+$/, '')].map(glyph =>
    alphabet.indexOf(glyph),
  )

  const bytes: number[] = []

  for (let at = 0; at < bits.length; at += 4) {
    const [a = 0, b = 0, c = 0, d = 0] = bits.slice(at, at + 4)

    bytes.push((a << 2) | (b >> 4), ((b & 0x0f) << 4) | (c >> 2), ((c & 0x03) << 6) | d)
  }

  const words: number[] = []

  for (let at = 0; at + 3 < bytes.length; at += 4) {
    words.push(
      ((bytes[at] ?? 0) |
        ((bytes[at + 1] ?? 0) << 8) |
        ((bytes[at + 2] ?? 0) << 16) |
        ((bytes[at + 3] ?? 0) << 24)) >>>
        0,
    )
  }

  return Array.from({ length: Math.floor(words.length / 3) }, (_unused, cell) =>
    words.slice(cell * 3, cell * 3 + 3),
  )
}

describe('raster', () => {
  test('one cell packs to the triplet the element reads', () => {
    const packed = packCells([
      { codePoint: 0x2588, fg: 0xff8800, bg: DEFAULT_COLOR },
    ])

    expect(packed).toBe('iCUAAACI/wAAAAAB')
    expect(unpack(packed)).toEqual([[0x2588, 0xff8800, DEFAULT_COLOR]])
  })

  test('a series longer than the width keeps its spikes', () => {
    expect(fitTo([1, 9, 2, 3], 2)).toEqual([9, 3])
    expect(fitTo([1, 2], 4)).toEqual([1, 2])
    expect(fitTo([], 4)).toEqual([])
  })

  test('a sparkline is two rows of the width it was given', () => {
    const line = sparklineOf([0, 50, 100], 3, () => 0x3fb950)

    expect(line?.columns).toBe(3)
    expect(line?.rows).toBe(2)

    const cells = unpack(line?.cells ?? '')

    expect(cells).toHaveLength(6)
    expect(cells[0]?.[0]).toBe(0x20)
    expect(cells[2]?.[0]).toBe(0x2588)
    expect(cells[3]?.[0]).toBe(0x20)
    expect(cells[5]?.[0]).toBe(0x2588)
  })

  test('an empty series draws nothing at all', () => {
    expect(sparklineOf([], 10, () => 0)).toBeNull()
  })
})
