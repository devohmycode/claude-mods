import { describe, expect, test } from 'claude-code/testing'

import { capOf, cutLineOf, headOf, tailOf } from '../hooks/cap'
import { bytesOf } from '../hooks/format'

/**
 * A text of numbered lines, each the same width, so a test can say which
 * lines a cut kept.
 *
 * @param count how many lines
 * @returns the text, without a final newline
 */
const numbered = (count: number): string =>
  Array.from({ length: count }, (_, i) => `line ${String(i + 1).padStart(4, '0')}`).join('\n')

describe('the cap', () => {
  test('a text under the cap comes back as nothing to do', () => {
    expect(capOf('short\noutput\n', { bytes: 4_096 })).toBe(null)
  })

  test('a text of exactly the cap is under it', () => {
    const text = 'x'.repeat(100)

    expect(capOf(text, { bytes: 100 })).toBe(null)
  })

  test('a cap of zero is a cap that is off, whatever the length', () => {
    expect(capOf(numbered(10_000), { bytes: 0 })).toBe(null)
    expect(capOf(numbered(10_000), { bytes: -5 })).toBe(null)
  })

  test('a long text keeps its first and last lines, whole, and says what went', () => {
    const text = numbered(1_000)
    const capped = capOf(text, { bytes: 1_024 })

    expect(capped).not.toBe(null)

    const lines = (capped?.text ?? '').split('\n')

    expect(lines[0]).toBe('line 0001')
    expect(lines.at(-1)).toBe('line 1000')
    expect(capped?.text).toContain(`${capped?.cutLines} lines`)
    expect(capped?.cutLines).toBeGreaterThan(900)
  })

  test('the result never runs past the budget, marker included', () => {
    for (const bytes of [200, 512, 1_024, 4_096]) {
      const capped = capOf(numbered(5_000), { bytes })

      expect(capped?.after ?? Infinity).toBeLessThanOrEqual(bytes)
      expect(bytesOf(capped?.text ?? '')).toBe(capped?.after ?? -1)
    }
  })

  test('the figures are bytes of the text itself, before and after', () => {
    const text = numbered(2_000)
    const capped = capOf(text, { bytes: 800 })

    expect(capped?.before).toBe(bytesOf(text))
    expect(capped?.after).toBe(bytesOf(capped?.text ?? ''))
  })

  test('the marker says how many bytes went, and counts as shown', () => {
    const text = numbered(2_000)
    const capped = capOf(text, { bytes: 800 })
    const kept = (capped?.text ?? '')
      .split('\n')
      .filter(line => !line.startsWith('[clauget:'))
      .join('\n')
    const marker = cutLineOf(capped?.cutLines ?? 0, bytesOf(text) - bytesOf(kept))

    expect(capped?.text).toContain(marker)
    expect(capped?.shown).toBe(bytesOf(marker))
  })

  test('one line wider than the budget is cut by bytes, head and tail both kept', () => {
    const text = `${'a'.repeat(5_000)}${'z'.repeat(5_000)}`
    const capped = capOf(text, { bytes: 400 })
    const [head, , tail] = (capped?.text ?? '').split('\n')

    expect(head?.startsWith('aaa')).toBe(true)
    expect(tail?.endsWith('zzz')).toBe(true)
    expect(capped?.after ?? Infinity).toBeLessThanOrEqual(400)
  })

  test('a cut never splits a character in two', () => {
    const text = 'é'.repeat(3_000)
    const capped = capOf(text, { bytes: 301 })

    expect(capped?.text).not.toContain('�')
    expect(headOf('éé', 3)).toBe('é')
    expect(tailOf('éé', 3)).toBe('é')
    expect(headOf('😀x', 3)).toBe('')
    expect(tailOf('x😀', 4)).toBe('😀')
  })
})
