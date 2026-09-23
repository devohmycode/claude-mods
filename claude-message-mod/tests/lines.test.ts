/**
 * The thread's lines: the wrapping, the cut and the paging, each on its own.
 *
 * Pure functions, so nothing here mounts anything: what a message looks like
 * on screen is decided by these three, and a test that pins them down pins
 * down the tab.
 */

import { describe, expect, test } from 'claude-code/testing'

import { bodyLines, cutAt, fitFrom, wrapText } from '../hooks/lines'
import { NOTE_CHARS } from '../hooks/names'

describe('wrapping', () => {
  test('breaks on spaces and never draws past the column', () => {
    const lines = wrapText(
      'the capsule is green and the bench is free again tonight',
      20,
    )

    expect(lines.every(line => line.length <= 20)).toBe(true)
    expect(lines.join(' ')).toBe(
      'the capsule is green and the bench is free again tonight',
    )
  })

  test('keeps the paragraphs a message was written in', () => {
    expect(wrapText('first\n\nsecond', 20)).toEqual(['first', '', 'second'])
  })

  test('cuts a word that is longer than the column rather than pushing it out', () => {
    // A socket path, an address, a base64 blob: one of these in a flex row is
    // what shrinks the column beside it, so it is broken here instead.
    const lines = wrapText('uds:\\\\.\\pipe\\LOCAL\\cc-msg-2a246fbc-long', 10)

    expect(lines.every(line => line.length <= 10)).toBe(true)
    expect(lines.join('')).toBe('uds:\\\\.\\pipe\\LOCAL\\cc-msg-2a246fbc-long')
  })

  test('a message of nothing still takes one line', () => {
    expect(wrapText('', 20)).toEqual([''])
  })
})

describe('the cut', () => {
  test('leaves a short message whole, and hides nothing', () => {
    expect(cutAt('the capsule is green', 40)).toEqual({
      text: 'the capsule is green',
      hidden: 0,
    })
  })

  test('cuts on a space, and says how many characters it left out', () => {
    const long = `${'alpha '.repeat(20)}omega`
    const cut = cutAt(long, 40)

    expect(cut.text.endsWith('…')).toBe(true)
    expect(cut.text).not.toContain('omega')
    // The figure carries its unit and is counted, not estimated: what is
    // hidden plus what is drawn is the message, its ellipsis apart.
    expect(cut.hidden).toBe(long.trim().length - (cut.text.length - 1))
  })

  test('cuts inside a single long token, since a space too early says nothing', () => {
    const cut = cutAt('x'.repeat(100), 20)

    expect(cut.text).toBe(`${'x'.repeat(20)}…`)
    expect(cut.hidden).toBe(80)
  })
})

describe('the body', () => {
  test('a long message is cut, and asking for it whole hides nothing', () => {
    const long = `${'alpha '.repeat(80)}omega`

    const preview = bodyLines(long, 40, false)
    const whole = bodyLines(long, 40, true)

    expect(preview.hidden).toBeGreaterThan(0)
    expect(preview.lines.join(' ')).not.toContain('omega')

    expect(whole.hidden).toBe(0)
    expect(whole.lines.join(' ')).toContain('omega')
    expect(whole.lines.length).toBeGreaterThan(preview.lines.length)
  })

  test('a message under the limit is never cut', () => {
    const short = 'a'.repeat(NOTE_CHARS - 1)

    expect(bodyLines(short, 40, false).hidden).toBe(0)
  })
})

describe('paging', () => {
  test('keeps the last messages, which are the ones a person came to read', () => {
    expect(fitFrom([3, 3, 3, 3], 7)).toBe(2)
  })

  test('keeps them all where they all fit', () => {
    expect(fitFrom([3, 3], 10)).toBe(0)
  })

  test('draws the newest whatever it costs, and lets the surface scroll it', () => {
    // A message a person has just expanded is taller than the pane on
    // purpose. Dropping it because it does not fit would answer their press
    // with an empty thread.
    expect(fitFrom([2, 40], 5)).toBe(1)
  })

  test('an empty thread starts at the beginning', () => {
    expect(fitFrom([], 10)).toBe(0)
  })
})
