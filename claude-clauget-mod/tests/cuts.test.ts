import { describe, expect, test } from 'claude-code/testing'

import { chainOf, worthOf } from '../hooks/call'
import {
  bashCutOf,
  blobCutOf,
  cleanOf,
  dietOf,
  filedPathOf,
  grepCutOf,
  isFileable,
  isFiledPath,
  isProtected,
  jsonCutOf,
  NOISE_RULES,
  reportCutOf,
} from '../hooks/cuts'
import { bytesOf } from '../hooks/format'

const PATH = '/home/x/.claude/clauget/files/s-1/toolu_1.txt'
const ESC = String.fromCharCode(27)

const numbered = (count: number, word = 'ok') =>
  Array.from({ length: count }, (_, i) => `${word} ${String(i + 1).padStart(5, '0')}`).join('\n')

describe('the filing cabinet (T32)', () => {
  test('a result is filed under a stable path its excerpt names', () => {
    expect(filedPathOf('C:\\Users\\x\\', 's-1', 'toolu_1')).toBe('C:/Users/x/.claude/clauget/files/s-1/toolu_1.txt')
    expect(filedPathOf('/home/x', 's/../1', 'a b')).toBe('/home/x/.claude/clauget/files/s-..-1/a-b.txt')
    expect(bashCutOf(numbered(5_000), 4_000, PATH)?.text).toContain(PATH)
  })

  test('past 4 MiB a result is not fileable, and so not cut', () => {
    expect(isFileable('x'.repeat(4 * 1024 * 1024))).toBe(true)
    expect(isFileable('x'.repeat(4 * 1024 * 1024 + 1))).toBe(false)
  })

  test('a read of a filed path is known as a targeted reread', () => {
    expect(isFiledPath('C:\\Users\\x\\.claude\\clauget\\files\\s\\t.txt')).toBe(true)
    expect(isFiledPath('/work/src/app.ts')).toBe(false)
  })
})

describe('Bash, cut to its shape (T33)', () => {
  test('head, tail, the count of lines cut, and the middle\'s error lines kept whole', () => {
    const lines = numbered(3_000).split('\n')

    lines[1_500] = 'src/app.ts:12 error TS2322: Type string is not assignable to number.'
    lines[2_000] = 'FAIL tests/app.test.ts > adds'

    const cut = bashCutOf(lines.join('\n'), 4_000, PATH)
    const out = cut?.text.split('\n') ?? []

    expect(out[0]).toBe('ok 00001')
    expect(out.at(-1)).toBe('ok 03000')
    expect(cut?.text).toContain(lines[1_500])
    expect(cut?.text).toContain(lines[2_000])
    expect(cut?.text).toMatch(/\d+ lines cut, 2 error lines kept/)
    expect(cut?.after ?? Infinity).toBeLessThanOrEqual(4_000)
  })

  test('an output under the budget comes back as nothing to do', () => {
    expect(bashCutOf('a\nb\n', 4_000, PATH)).toBe(null)
  })

  test('a cut that takes away less than half is not made: the reread it invites costs more', () => {
    const slightly = numbered(900)
    const much = numbered(5_000)
    const context = { bashBudget: 8_000, grepSeen: new Set<string>(), root: null, path: PATH }
    const result = (stdout: string) => ({ result: { stdout, stderr: '', interrupted: false } })

    // 10.8 kB to 8 kB would save a quarter: left whole.
    expect(worthOf(bashCutOf(slightly, 8_000, PATH))).toBe(null)
    expect(chainOf('Bash', result(slightly), context).kind).toBe('kept')
    expect(chainOf('Bash', result(much), context).kind).toBe('rewritten')
  })

  test('an output the engine already put aside is left to the engine', () => {
    const context = { bashBudget: 8_000, grepSeen: new Set<string>(), root: null, path: PATH }
    const persisted = {
      result: { stdout: numbered(5_000), stderr: '', interrupted: false, persistedOutputPath: '/tmp/out.txt' },
    }

    expect(chainOf('Bash', persisted, context).kind).toBe('kept')
  })
})

describe('Grep, cut to its shape (T33, T37)', () => {
  const grep = (files: number, per: number) =>
    Array.from({ length: files }, (_, f) =>
      Array.from({ length: per }, (_, i) => `src/f${f}.ts:${i + 1}:const a${i} = ${f}`).join('\n'),
    ).join('\n')

  test('a talkative file is capped before the total, so every file gets its share', () => {
    const cut = grepCutOf(`${grep(1, 500)}\n${grep(3, 2).replace(/f0/g, 'g0')}`, new Set(), 50_000, 20, PATH)
    const shown = cut?.shown ?? []

    expect(shown.filter(line => line.startsWith('src/f0.ts')).length).toBe(20)
    expect(shown.filter(line => line.startsWith('src/g0.ts')).length).toBe(2)
    expect(shown.filter(line => line.startsWith('src/f2.ts')).length).toBe(2)
    expect(cut?.text).toContain('480 lines cut (20 matches per file kept)')
  })

  test('lines already shown earlier are left out and counted', () => {
    const first = grep(1, 3)
    const cut = grepCutOf(`${first}\nsrc/new.ts:1:fresh`, new Set(first.split('\n')), 50_000, 20, PATH)

    expect(cut?.shown).toEqual(['src/new.ts:1:fresh'])
    expect(cut?.text).toContain('3 lines already shown earlier in this conversation left out')
  })

  test('a Grep under every limit goes through as it came', () => {
    expect(grepCutOf(grep(2, 3), new Set(), 50_000, 20, PATH)).toBe(null)
  })
})

describe('the JSON diet of MCP results (T35)', () => {
  const heavy = {
    items: Array.from({ length: 192 }, (_, i) => ({ id: i, name: `item ${i}`, note: null, tags: [] })),
    description: 'x'.repeat(2_000),
    meta: { next: null, total: 192 },
  }

  test('the diet still parses, and every key present before is present after', () => {
    const cut = jsonCutOf(JSON.stringify(heavy, null, 2))
    const after = JSON.parse(cut?.text ?? 'null')
    const keysOf = (value: unknown, into = new Set<string>()): Set<string> => {
      if (Array.isArray(value)) {
        value.forEach(one => keysOf(one, into))
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, one] of Object.entries(value)) {
          into.add(key)
          keysOf(one, into)
        }
      }

      return into
    }

    expect([...keysOf(heavy)].every(key => keysOf(after).has(key))).toBe(true)
    expect(after.items).toHaveLength(21)
    expect(after.items.at(-1)).toBe('+172 more items of the same shape')
    expect(after.description).toMatch(/…\[2000 chars\]$/)
    expect(cut?.after ?? Infinity).toBeLessThan(cut?.before ?? 0)
  })

  test('a JSON under the thresholds goes through identical', () => {
    expect(jsonCutOf(JSON.stringify({ a: [1, 2, 3], b: 'short' }))).toBe(null)
    expect(jsonCutOf('not json at all')).toBe(null)
    expect(dietOf({ a: [1, null, 2] })).toEqual({ value: { a: [1, 2] }, isChanged: true })
  })

  test('an MCP result in text blocks is dieted block by block, with where the whole is filed', () => {
    const got = { result: [{ type: 'text', text: JSON.stringify(heavy) }, { type: 'image', data: 'x' }] }
    const chained = chainOf('mcp__server__list', got, { bashBudget: 8_000, grepSeen: new Set(), root: null, path: PATH })

    expect(chained.kind).toBe('rewritten')

    if (chained.kind !== 'rewritten') {
      return
    }

    const result = chained.answer.result as { type: string; text?: string }[]

    expect(result[1]).toEqual({ type: 'image', data: 'x' })
    expect(JSON.parse(result[0]?.text ?? '').items).toHaveLength(21)
    expect(chained.answer.context?.at(-1)).toContain(PATH)
    expect(chained.filed).toBe(JSON.stringify(heavy))
  })
})

describe('noise of a known shape (T39)', () => {
  const examples: [string, string, string][] = [
    ['ansi', `${ESC}[32mok${ESC}[0m done`, 'ok done'],
    ['carriage', 'downloading 10%\rdownloading 50%\rdownloading done', 'downloading done'],
    ['progress', '[=========>          ] 45%', ''],
    ['repeat', 'warn: slow disk\nwarn: slow disk', 'warn: slow disk'],
    ['deprecation', 'DeprecationWarning: x is old\nstep\nDeprecationWarning: x is old', 'DeprecationWarning: x is old\nstep'],
    ['abspath', '/work/src/app.ts compiled', './src/app.ts compiled'],
  ]

  for (const [rule, input, output] of examples) {
    test(`the ${rule} rule`, () => {
      const cleaned = cleanOf(input, '/work')

      expect(cleaned.text.split('\n').filter(line => line !== '').join('\n')).toBe(output)
      expect(cleaned.counts[rule]).toBeGreaterThan(0)
    })
  }

  test('no rule touches a line that says error or FAIL', () => {
    const lines = [
      `${ESC}[31merror${ESC}[0m: /work/src/app.ts`,
      'FAIL [=========>          ] 45%',
      'Error: boom',
      'Error: boom',
      'npm ERR! deprecated error in /work',
    ]

    expect(lines.every(isProtected)).toBe(true)
    expect(cleanOf(lines.join('\n'), '/work')).toEqual({ text: lines.join('\n'), counts: {} })
  })

  test('an output with nothing to clean is the same string', () => {
    const text = 'all\ngood\n'

    expect(cleanOf(text, '/work').text).toBe(text)
    expect(NOISE_RULES.map(rule => rule.name)).toEqual(['ansi', 'carriage', 'progress', 'repeat', 'deprecation', 'abspath'])
  })
})

describe('a subagent\'s report (T40)', () => {
  const report = [
    'Preamble: I looked at many things.',
    'x'.repeat(4_000),
    'y'.repeat(3_000),
    'Conclusion: the bug is in src/app.ts line 12; fix the cast.',
  ].join('\n\n')

  test('the conclusion is kept before the opening', () => {
    const cut = reportCutOf(report, 3_500, PATH)

    expect(cut?.text).toContain('Conclusion: the bug is in src/app.ts line 12')
    expect(cut?.text).not.toContain('Preamble')
    expect(cut?.text).toContain(PATH)
    expect(cut?.after ?? Infinity).toBeLessThanOrEqual(3_500)
  })

  test('a report under the budget goes through identical', () => {
    expect(reportCutOf('Short and done.', 6_000, PATH)).toBe(null)
  })
})

describe('a log pasted into the prompt (T41)', () => {
  const log = Array.from({ length: 400 }, (_, i) => `2026-09-23T10:${String(i % 60).padStart(2, '0')} INFO worker-${i} tick ${i * 7}`).join('\n')
  const before = 'Why does the worker stall? Here is the log.'
  const after = 'It started after the last deploy, I think.'

  test('a prompt without a pasted block comes back as nothing to do', () => {
    expect(blobCutOf(`${before}\n\n${after}`, () => PATH)).toBe(null)
  })

  test('the block is filed whole, head and tail stay, the path is named', () => {
    const cut = blobCutOf(`${before}\n\n${log}\n\n${after}`, index => `${PATH}.${index}`)

    expect(cut?.blobs).toEqual([log])
    expect(cut?.text).toContain('worker-0 ')
    expect(cut?.text).toContain('worker-399 ')
    expect(cut?.text).not.toContain('worker-200 ')
    expect(cut?.text).toContain(`${PATH}.0`)
    expect(bytesOf(cut?.text ?? '')).toBeLessThan(bytesOf(log))
  })

  test('no sentence outside the block is touched', () => {
    const cut = blobCutOf(`${before}\n\n${log}\n\n${after}`, () => PATH)

    expect(cut?.text.startsWith(`${before}\n\n`)).toBe(true)
    expect(cut?.text.endsWith(`\n\n${after}`)).toBe(true)
  })

  test('long prose is not a log', () => {
    const prose = Array.from({ length: 120 }, (_, i) => `This is sentence number ${i} of a long message, written by hand.`).join('\n')

    expect(blobCutOf(prose, () => PATH)).toBe(null)
  })
})
