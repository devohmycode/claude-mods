import { describe, expect, test } from 'claude-code/testing'
import type { ToolCallResult } from 'claude-code'

import { answerOf, ownAnswerOf } from '../hooks/call'
import type { CallLimits } from '../hooks/call'

/**
 * A cap that is on, at a budget small enough for a test's output.
 */
const ON: CallLimits = { cap: { bytes: 512 } }

/**
 * A cap that is off, as the manifest's default leaves it.
 */
const OFF: CallLimits = { cap: { bytes: 0 } }

/**
 * A long run of output lines.
 *
 * @param count how many lines
 * @returns the text
 */
const long = (count: number): string =>
  Array.from({ length: count }, (_, i) => `ok ${i} src/module-${i}.ts`).join('\n')

/**
 * Bash's record as the engine keeps it, every field the tool's output schema
 * names beside `stdout`.
 *
 * @param stdout the command's output
 * @returns the record
 */
const bashRecord = (stdout: string) => ({
  stdout,
  stderr: 'warning: one\n',
  interrupted: false,
  returnCodeInterpretation: 'no matches',
  noOutputExpected: false,
})

/**
 * What `next(e)` resolves to for a call the engine ran: the record, the text
 * the model read, and the `ref` naming the engine's own messages.
 *
 * @param stdout the command's output
 * @param context what another hook put after the result
 * @returns the engine's answer
 */
const fromCore = (stdout: string, context?: readonly string[]): ToolCallResult =>
  context === undefined
    ? { ref: 7, result: bashRecord(stdout), text: stdout }
    : { ref: 7, result: bashRecord(stdout), text: stdout, context }

describe('the answer is the mod\'s own (T11)', () => {
  test('a rewrite answers { result } alone, with neither the engine\'s ref nor its text', () => {
    const decided = answerOf('Bash', fromCore(long(400)), ON)

    expect(decided.kind).toBe('rewritten')

    if (decided.kind !== 'rewritten') {
      return
    }

    expect('ref' in decided.answer).toBe(false)
    expect('text' in decided.answer).toBe(false)
    expect(Object.keys(decided.answer)).toEqual(['result'])
  })

  test('a context another hook put after the result survives the rewrite', () => {
    const decided = answerOf('Bash', fromCore(long(400), ['<reminder>']), ON)

    expect(decided.kind === 'rewritten' ? decided.answer.context : null).toEqual(['<reminder>'])
    expect(decided.kind === 'rewritten' && 'ref' in decided.answer).toBe(false)
  })

  test('ownAnswerOf never carries an empty context', () => {
    expect(ownAnswerOf('x', [])).toEqual({ result: 'x' })
    expect(ownAnswerOf('x', undefined)).toEqual({ result: 'x' })
  })
})

describe('the output contract (T12)', () => {
  test('a capped record keeps every field and every type the schema checks', () => {
    const got = fromCore(long(400))
    const decided = answerOf('Bash', got, ON)
    const before = got.result as Record<string, unknown>
    const after = (decided.kind === 'rewritten' ? decided.answer.result : null) as Record<
      string,
      unknown
    >

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())

    for (const key of Object.keys(before)) {
      expect(typeof after[key]).toBe(typeof before[key])
    }

    // Only stdout moved: stderr, where the errors are, goes through whole.
    expect({ ...after, stdout: '' }).toEqual({ ...before, stdout: '' })
    expect(String(after.stdout).length).toBeLessThan(String(before.stdout).length)
  })

  test('a result under the cap goes up as it came, ref and all', () => {
    expect(answerOf('Bash', fromCore('three\nshort\nlines\n'), ON)).toEqual({ kind: 'kept' })
  })

  test('with the cap off, nothing is rewritten, however long', () => {
    expect(answerOf('Bash', fromCore(long(10_000)), OFF)).toEqual({ kind: 'kept' })
  })

  test('the figures are the bytes of stdout before and after', () => {
    const stdout = long(400)
    const decided = answerOf('Bash', fromCore(stdout), ON)

    expect(decided.kind === 'rewritten' ? decided.before : 0).toBe(stdout.length)
    expect(decided.kind === 'rewritten' ? decided.after : Infinity).toBeLessThanOrEqual(512)
  })
})

describe('what the chain leaves alone', () => {
  test('another tool', () => {
    const got: ToolCallResult = { ref: 3, result: { file: { content: long(400) } }, text: long(400) }

    expect(answerOf('Read', got, ON)).toEqual({ kind: 'kept' })
  })

  test('a refusal', () => {
    expect(answerOf('Bash', { deny: 'no' }, ON)).toEqual({ kind: 'kept' })
  })

  test('an error, whose result is the error text and not the record', () => {
    expect(answerOf('Bash', { isError: true, result: long(400), ref: 4 }, ON)).toEqual({
      kind: 'kept',
    })
  })

  test('a result that is not Bash\'s record', () => {
    expect(answerOf('Bash', { result: long(400) }, ON)).toEqual({ kind: 'kept' })
    expect(answerOf('Bash', { result: { stdout: 42 } }, ON)).toEqual({ kind: 'kept' })
  })
})
