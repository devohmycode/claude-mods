import { describe, expect, test } from 'claude-code/testing'

import {
  NO_READS,
  appliedOf,
  changedSpanOf,
  declarationsOf,
  isUnchanged,
  readAnswerOf,
} from '../hooks/reads'
import type { Reads, Stamp, TextRead } from '../hooks/reads'

const STAMP: Stamp = { size: 100, mtimeMs: 1 }
const MOVED: Stamp = { size: 101, mtimeMs: 2 }

/**
 * A file of numbered lines.
 */
const fileOf = (count: number, edit: (lines: string[]) => void = () => undefined): string => {
  const lines = Array.from({ length: count }, (_, i) => `line ${i + 1}`)

  edit(lines)

  return `${lines.join('\n')}\n`
}

/**
 * The record the engine makes for a window of a text.
 */
function recordOf(text: string, start = 1, count?: number): TextRead {
  const all = text.split('\n').slice(0, -1)
  const lines = all.slice(start - 1, count === undefined ? undefined : start - 1 + count)

  return {
    type: 'text',
    file: { filePath: '/work/a.ts', content: lines.join('\n'), numLines: lines.length, startLine: start, totalLines: all.length },
  }
}

/**
 * The record after a whole read of a text.
 */
const afterWholeRead = (text: string, stamp: Stamp = STAMP): Reads =>
  readAnswerOf(NO_READS, { file_path: '/work/a.ts' }, recordOf(text), stamp, null).reads

describe('the same window, unchanged (T36)', () => {
  test('the same window of an unchanged file is answered without the tool', () => {
    expect(isUnchanged(afterWholeRead(fileOf(10)), '/work/a.ts', {}, STAMP)).toBe(true)
  })

  test('a file modified between the two reads is read again whole', () => {
    expect(isUnchanged(afterWholeRead(fileOf(10)), '/work/a.ts', {}, MOVED)).toBe(false)
  })

  test('a read with another offset is never taken for it', () => {
    expect(isUnchanged(afterWholeRead(fileOf(10)), '/work/a.ts', { offset: 2 }, STAMP)).toBe(false)
  })

  test('with no fingerprint, nothing is assumed', () => {
    expect(isUnchanged(afterWholeRead(fileOf(10), STAMP), '/work/a.ts', {}, null)).toBe(false)
  })

  test('a record emptied — compaction, new session — short-circuits nothing', () => {
    expect(isUnchanged(NO_READS, '/work/a.ts', {}, STAMP)).toBe(false)
  })
})

describe('a partial overlap (T37)', () => {
  const text = fileOf(400)
  const read = (reads: Reads, offset: number, limit: number) =>
    readAnswerOf(reads, { file_path: '/work/a.ts', offset, limit }, recordOf(text, offset, limit), STAMP, null)

  test('lines 150–350 then 200–400: only 351–400 are served', () => {
    const first = read(NO_READS, 150, 201)
    const second = read(first.reads, 200, 201)

    expect(second.rule).toBe('overlap')
    expect(second.record?.file.startLine).toBe(351)
    expect(second.record?.file.content.split('\n')[0]).toBe('line 351')
    expect(second.record?.file.numLines).toBe(50)
    expect(second.context).toContain('lines 200–350')
  })

  test('the known part at the end: only the head is served', () => {
    const first = read(NO_READS, 200, 201)
    const second = read(first.reads, 150, 100)

    expect(second.record?.file.startLine).toBe(150)
    expect(second.record?.file.numLines).toBe(50)
  })

  test('a window inside what was read, or around it, is served whole — never confused', () => {
    const first = read(NO_READS, 150, 201)

    expect(read(first.reads, 200, 50).record).toBe(null)
    expect(read(read(NO_READS, 200, 10).reads, 150, 100).record).toBe(null)
  })

  test('disjoint windows are served whole', () => {
    expect(read(read(NO_READS, 1, 50).reads, 300, 50).record).toBe(null)
  })

  test('a file modified since invalidates everything read of it', () => {
    const first = read(NO_READS, 150, 201)
    const moved = readAnswerOf(first.reads, { file_path: '/work/a.ts', offset: 200, limit: 201 }, recordOf(text, 200, 201), MOVED, null)

    expect(moved.record).toBe(null)
  })
})

describe('a reread after an edit: the span, not the file (T38)', () => {
  const before = fileOf(900)
  const after = fileOf(900, lines => {
    lines[119] = 'line 120, edited'
    lines.splice(121, 0, 'a new line')
    lines[122] = 'line 122, edited'
  })

  test('only the changed span is served, one line of context each side', () => {
    const answer = readAnswerOf(afterWholeRead(before), { file_path: '/work/a.ts' }, recordOf(after), MOVED, null)

    expect(answer.rule).toBe('diff')
    expect(answer.record?.file.startLine).toBe(119)
    expect(answer.record?.file.numLines).toBeLessThan(10)
    expect(answer.context).toContain('+1')
  })

  test('the property: the span applied to the version read before gives the current file, byte for byte', () => {
    const cases: [string, string][] = [
      [before, after],
      [fileOf(50), fileOf(50, lines => lines.splice(10, 3))],
      [fileOf(50), fileOf(50, lines => lines.push('appended'))],
      [fileOf(50), fileOf(50, lines => lines.unshift('prepended'))],
      [fileOf(50), fileOf(50, lines => (lines[0] = 'first changed'))],
    ]

    for (const [was, now] of cases) {
      const oldLines = was.split('\n')
      const newLines = now.split('\n')
      const span = changedSpanOf(oldLines, newLines)

      expect(span).not.toBe(null)

      if (span === null) {
        continue
      }

      const replacement = newLines.slice(span.start - 1, span.endAfter)

      expect(appliedOf(oldLines, span.start, span.endBefore, replacement).join('\n')).toBe(now)
    }
  })

  test('an edit that touches half the file is served whole', () => {
    const rewritten = fileOf(900, lines => lines.forEach((_, i) => (lines[i] = `new ${i}`)))
    const answer = readAnswerOf(afterWholeRead(before), { file_path: '/work/a.ts' }, recordOf(rewritten), MOVED, null)

    expect(answer.record).toBe(null)
  })

  test('the same text under a new fingerprint is served as the engine made it', () => {
    expect(readAnswerOf(afterWholeRead(before), { file_path: '/work/a.ts' }, recordOf(before), MOVED, null).record).toBe(null)
  })
})

describe('the summary before the text (T34)', () => {
  const source = fileOf(3_000, lines => {
    lines[99] = 'export function alpha(): void {'
    lines[1_199] = 'class Beta {'
    lines[2_499] = '## Gamma'
  })

  test('every line of the summary exists at the number it announces', () => {
    const answer = readAnswerOf(NO_READS, { file_path: '/work/a.ts' }, recordOf(source, 1, 2_000), STAMP, source)
    const all = source.split('\n')
    const table = (answer.context ?? '').split('\n').slice(1)

    expect(answer.rule).toBe('summary')
    expect(answer.record?.file.numLines).toBe(60)
    expect(table).toEqual(['100: export function alpha(): void {', '1200: class Beta {', '2500: ## Gamma'])

    for (const entry of table) {
      const [number, ...text] = entry.split(': ')

      expect(all[Number(number) - 1]).toBe(text.join(': '))
    }
  })

  test('a file under the threshold comes out whole', () => {
    const small = fileOf(700)

    expect(readAnswerOf(NO_READS, { file_path: '/work/a.ts' }, recordOf(small), STAMP, small).record).toBe(null)
  })

  test('a second read after the summary gets what is new', () => {
    const first = readAnswerOf(NO_READS, { file_path: '/work/a.ts' }, recordOf(source, 1, 2_000), STAMP, source)
    const again = readAnswerOf(first.reads, { file_path: '/work/a.ts', offset: 1, limit: 200 }, recordOf(source, 1, 200), STAMP, null)

    expect(again.record?.file.startLine).toBe(61)
  })

  test('declarations are code at the margin, headings and top-level keys', () => {
    expect(declarationsOf('export const a = 1\n  const inner = 2\n# Title\nkey:\n"k": {\nplain text').map(one => one.line)).toEqual([
      1, 3, 4, 5,
    ])
  })
})
