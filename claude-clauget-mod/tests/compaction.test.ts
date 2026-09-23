import { describe, expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import {
  compactPointOf,
  countdownText,
  digestOf,
  factsOf,
  instructionsTextOf,
  lightenedOf,
  medianOf,
  readRangesFrom,
  sessionBriefOf,
  withRead,
} from '../hooks/compaction'
import { bytesOf } from '../hooks/format'

const BIG = 'x'.repeat(5_000)
const pathOf = (id: string) => `/home/x/.claude/clauget/files/s-1/compact-${id}.txt`

/**
 * A transcript as `session.compact` hands it: the person's prompt, then two
 * tool calls whose results the user messages carry.
 */
const transcript = (): SessionMessage[] => [
  { role: 'user', text: 'Fix the build, and keep the public API as it is.', toolUses: [], handle: 'h0' },
  {
    role: 'assistant',
    text: '',
    toolUses: [{ tool_use_id: 't1', tool: 'Bash', input: { command: 'npm run build' }, text: BIG }],
    handle: 'h1',
  },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: BIG, isError: false }], handle: 'h2' },
  {
    role: 'assistant',
    text: '',
    toolUses: [{ tool_use_id: 't2', tool: 'Read', input: { file_path: 'a.ts' }, text: 'short' }],
    handle: 'h3',
  },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't2', text: 'short', isError: false }], handle: 'h4' },
  { role: 'assistant', text: 'Done: the cast in a.ts was wrong.', toolUses: [], handle: 'h5' },
]

describe('lightening the transcript before its summary (T51, T52)', () => {
  test('a large result is replaced by its filing line, and filed whole', () => {
    const light = lightenedOf(transcript(), new Set(), 2_000, pathOf)
    const replaced = light.messages[2]?.toolResults?.[0]

    expect(replaced?.text).toContain(pathOf('t1'))
    expect(replaced?.text).toContain('5000 bytes')
    expect(light.filed).toEqual([{ path: pathOf('t1'), text: BIG }])
    expect(light.before).toBe(5_000)
    expect(light.after).toBe(bytesOf(replaced?.text ?? ''))
  })

  test('no text a person typed is changed, and no message is added or dropped', () => {
    const before = transcript()
    const light = lightenedOf(before, new Set(['t2']), 2_000, pathOf)

    expect(light.messages).toHaveLength(before.length)
    light.messages.forEach((message, index) => {
      expect(message.role).toBe(before[index]?.role)
      expect(message.text).toBe(before[index]?.text)
    })
  })

  test('only the messages it changed lose their engine handle', () => {
    const light = lightenedOf(transcript(), new Set(), 2_000, pathOf)

    expect(light.messages.map(message => message.handle)).toEqual(['h0', 'h1', undefined, 'h3', 'h4', 'h5'])
  })

  test('a queued result is replaced whatever its size; an error never is', () => {
    const queued = lightenedOf(transcript(), new Set(['t2']), 2_000, pathOf)
    const errored = transcript()

    errored[2] = { ...errored[2]!, toolResults: [{ tool_use_id: 't1', text: BIG, isError: true }] }

    expect(queued.messages[4]?.toolResults?.[0]?.text).toContain(pathOf('t2'))
    expect(lightenedOf(errored, new Set(), 2_000, pathOf).substituted).toBe(0)
  })
})

describe('the warm cache\'s last question (T53)', () => {
  test('a cold fork adds no facts', () => {
    expect(factsOf(null)).toBe(null)
    expect(factsOf({ isAnswered: false, reason: 'nothing-to-fork' })).toBe(null)
    expect(factsOf({ text: '  ' })).toBe(null)
    expect(factsOf({ text: '- keep the API\n' })).toBe('- keep the API')
  })

  test('the instructions keep the person\'s own first, and stay under their ceiling', () => {
    const files = Array.from({ length: 400 }, (_, i) => `/work/src/file-${i}.ts`)
    const text = instructionsTextOf({ given: 'Keep the plan.', facts: '- keep the API', files }, 3_000)

    expect(text?.startsWith('Keep the plan.')).toBe(true)
    expect(text).toContain('- keep the API')
    expect(text).toContain('/work/src/file-0.ts')
    expect(bytesOf(text ?? '')).toBeLessThanOrEqual(3_000)
  })

  test('nothing to say is no instructions at all', () => {
    expect(instructionsTextOf({ facts: null, files: [] }, 3_000)).toBe(undefined)
  })
})

describe('the profitable point (T54)', () => {
  const base = { after: 20_000, summary: 4_000 }

  test('short turns: very late', () => {
    // (4 000 × 5 + 20 000 × 1.25 + 2 × 20 000 × 0.1) / (0.1 × 1)
    expect(compactPointOf({ ...base, steps: 2 })).toBe(490_000)
  })

  test('long turns: early', () => {
    expect(Math.round(compactPointOf({ ...base, steps: 30 }))).toBe(36_207)
  })

  test('a turn of one step never pays', () => {
    expect(compactPointOf({ ...base, steps: 1 })).toBe(Number.POSITIVE_INFINITY)
    expect(medianOf([3, 9, 1])).toBe(3)
    expect(medianOf([])).toBe(0)
  })
})

describe('the files read, and served again after a compaction (T56)', () => {
  test('windows are merged when they overlap or touch', () => {
    let reads = withRead({}, 'a', '/w/a.ts', 1, 50)

    reads = withRead(reads, 'a', '/w/a.ts', 40, 80)
    reads = withRead(reads, 'a', '/w/a.ts', 81, 90)
    reads = withRead(reads, 'a', '/w/a.ts', 200, 210)

    expect(reads['a']?.ranges).toEqual([
      { from: 1, to: 90 },
      { from: 200, to: 210 },
    ])
    expect(readRangesFrom({ sessionId: 's', files: reads }, 's')).toEqual(reads)
    expect(readRangesFrom({ sessionId: 's', files: reads }, 'other')).toBe(null)
  })

  test('the lines served are the ones the index holds, and no others', () => {
    const text = `${Array.from({ length: 300 }, (_, i) => (i === 249 ? 'export function late() {' : `line ${i + 1}`)).join('\n')}\n`
    const digest = digestOf(text, '/w/a.ts', [
      { from: 10, to: 20 },
      { from: 100, to: 110 },
    ])

    expect(digest?.record.file.startLine).toBe(10)
    expect(digest?.record.file.content.split('\n')).toEqual(Array.from({ length: 11 }, (_, i) => `line ${i + 10}`))
    expect(digest?.context).toContain('also read then: 100–110')
    expect(digest?.context).toContain('250: export function late() {')
    expect(digestOf(text, '/w/a.ts', [])).toBe(null)
  })
})

describe('the brief and the countdown (T57, T58)', () => {
  test('the brief is built without a model call, and stays under its ceiling', () => {
    const files = Array.from({ length: 2_000 }, (_, i) => `/work/src/file-${i}.ts`)
    const brief = sessionBriefOf({ cwd: '/work', files, summary: 'We fixed the cast.' }, 8_000)

    expect(brief).toContain('Working directory: /work')
    expect(bytesOf(brief)).toBeLessThanOrEqual(8_000)
    expect(sessionBriefOf({ cwd: '/w', files: [], summary: 'S.' })).toContain('S.')
  })

  test('the countdown says what is left, then that it expired', () => {
    expect(countdownText(100_000)).toContain('cache warm 1:40')
    expect(countdownText(0)).toContain('cache expired')
  })
})
