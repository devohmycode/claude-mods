import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NO_LIST, policyOf } from '../hooks/policy'
import type { Policy } from '../hooks/policy'
import { NO_USAGE } from '../hooks/usage'

tier('user')

/**
 * The policy session `s-1` started with: cuts on, levers off.
 *
 * @param cuts whether the cuts are on
 * @returns the policy
 */
const started = (cuts = true): Policy =>
  policyOf({ isOn: false, isCuts: cuts, sessionId: 's-1', usage: NO_USAGE, cwd: '/work', agents: NO_LIST, commands: NO_LIST })

/**
 * The world beneath the mod: a disk of files with fingerprints, tools that
 * answer from it, and a record of every call that reached the bottom.
 */
type World = {
  disk: Record<string, string>
  stamps: Record<string, { size: number; mtimeMs: number }>
  written: Record<string, string>
  logs: string[]
  bottom: string[]
  submitted: string[]
  /**
   * What the next Bash call prints.
   */
  stdout: string
}

/**
 * A path as the world keys it: the engine resolves a path to the platform's
 * own spelling (`C:\work\a.ts` for `/work/a.ts` on Windows), so the world
 * compares them without the drive and with forward slashes.
 */
const keyOf = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

/**
 * The value a record holds for a path, whatever its spelling.
 */
const at = <T,>(record: Record<string, T>, path: string): T | undefined =>
  Object.entries(record).find(([key]) => keyOf(key) === keyOf(path))?.[1]

const worldOf = (): World => ({ disk: {}, stamps: {}, written: {}, logs: [], bottom: [], submitted: [], stdout: '' })

/**
 * Hooks the world beneath the mod, with the policy of a session under way.
 *
 * @param on the test's registrar
 * @param world the world
 * @param policy the policy the store holds for `s-1`
 */
function hook(on: On, world: World, policy: Policy): void {
  mock.clock(on)
  mock.env(on, { USERPROFILE: '/home/x', HOME: '/home/x' })

  const store: Record<string, unknown> = { 'clauget.policy': policy }

  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', () => ({ value: undefined }))
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('fs.write', (_$, e) => {
    world.written[e.path] = e.text

    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const text = at(world.disk, e.path) ?? at(world.written, e.path)

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('fs.stat', (_$, e) => {
    const stamp = at(world.stamps, e.path)

    if (stamp === undefined) {
      throw new Error('ENOENT')
    }

    return { value: { kind: 'file', size: stamp.size, mtimeMs: stamp.mtimeMs, isLink: false } } as never
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => {
    world.submitted.push(e.text)

    return { text: e.text }
  })
  on('tool.call', (_$, e) => {
    world.bottom.push(e.tool)

    if (e.tool === 'Bash') {
      return { result: { stdout: world.stdout, stderr: '', interrupted: false } } as never
    }

    if (e.tool === 'Read') {
      const args = e as unknown as { file_path: string; offset?: number; limit?: number }
      const all = (at(world.disk, args.file_path) ?? at(world.written, args.file_path) ?? '').split('\n').slice(0, -1)
      const start = args.offset ?? 1
      const lines = all.slice(start - 1, start - 1 + (args.limit ?? 2_000))

      return {
        result: {
          type: 'text',
          file: {
            filePath: args.file_path,
            content: lines.join('\n'),
            numLines: lines.length,
            startLine: start,
            totalLines: all.length,
          },
        },
      } as never
    }

    return { result: 'ok' } as never
  })
  on('turn.step', async function* (_$, e) {
    const usage = {
      model: 'claude-opus-5',
      input_tokens: 10,
      output_tokens: 10,
      cache_read_input_tokens: 1_000,
      cache_creation_input_tokens: 100,
    }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage as never }
  })
}

const start = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

/**
 * Runs one request and ends the turn.
 */
async function turn($: Engine): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5', messageCount: 3 } as never)

  for await (const _chunk of stream) {
    // drained
  }

  await stream.result
  await $.turn.complete({ answer: 'done', durationMs: 900, isAborted: false, turnId: 't1', reason: 'answer' } as never)
}

const numbered = (count: number) => `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`

describe('the cuts, in a session', () => {
  test('a long Bash output is filed whole at the path its excerpt names (T32, T33)', async ($, on) => {
    const world = worldOf()

    world.stdout = numbered(5_000)
    hook(on, world, started())
    await start($)

    const got = await $.tool.call({ tool: 'Bash', command: 'seq 5000', tool_use_id: 'toolu_a' } as never)
    const stdout = (got.result as { stdout: string }).stdout
    const path = '/home/x/.claude/clauget/files/s-1/toolu_a.txt'

    expect(stdout).toContain(path)
    expect(stdout.length).toBeLessThan(9_000)
    expect(at(world.written, path)).toBe(world.stdout)
  })

  test('a result past 4 MiB is not filed, and goes through whole (T32)', async ($, on) => {
    const world = worldOf()

    world.stdout = 'x'.repeat(4 * 1024 * 1024 + 10)
    hook(on, world, started())
    await start($)

    const got = await $.tool.call({ tool: 'Bash', command: 'big', tool_use_id: 'toolu_b' } as never)

    expect((got.result as { stdout: string }).stdout.length).toBe(world.stdout.length)
    expect(Object.keys(world.written).filter(path => path.includes('/files/'))).toEqual([])
  })

  test('the same window of an unchanged file is answered without running the tool (T36)', async ($, on) => {
    const world = worldOf()

    world.disk['/work/a.ts'] = numbered(10)
    world.stamps['/work/a.ts'] = { size: 10, mtimeMs: 1 }
    hook(on, world, started())
    await start($)

    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    const again = await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    const other = await $.tool.call({ tool: 'Read', file_path: '/work/a.ts', offset: 3, limit: 2 })

    expect(again.result).toEqual({ type: 'file_unchanged', file: { filePath: '/work/a.ts' } })
    expect(world.bottom).toEqual(['Read', 'Read'])
    expect((other.result as { type: string }).type).toBe('text')
  })

  test('a Read after an edit gets the changed span, and a note says the rest is as read (T38)', async ($, on) => {
    const world = worldOf()
    // Under the summary's threshold: a longer file read whole the first time
    // gets its head and a table, and a diff needs the whole to have been read.
    const lines = numbered(700).split('\n')

    world.disk['/work/a.ts'] = lines.join('\n')
    world.stamps['/work/a.ts'] = { size: 1, mtimeMs: 1 }
    hook(on, world, started())
    await start($)
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })

    lines[449] = 'line 450, edited'
    world.disk['/work/a.ts'] = lines.join('\n')
    world.stamps['/work/a.ts'] = { size: 2, mtimeMs: 2 }

    const reread = await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    const file = (reread.result as { file: { startLine: number; content: string } }).file

    expect(file.startLine).toBe(449)
    expect(file.content).toBe('line 449\nline 450, edited\nline 451')
    expect(reread.context?.at(-1)).toContain('every other line is as you read it then')
  })

  test('a long file read whole gets its head and its table (T34), and a windowed read after it counts as a reread', async ($, on) => {
    const world = worldOf()
    const lines = numbered(3_000).split('\n')

    lines[1_499] = 'export function middle(): void {'
    world.disk['/work/big.ts'] = lines.join('\n')
    world.stamps['/work/big.ts'] = { size: 3, mtimeMs: 3 }
    hook(on, world, started())
    await start($)

    const first = await $.tool.call({ tool: 'Read', file_path: '/work/big.ts' })

    await $.tool.call({ tool: 'Read', file_path: '/work/big.ts', offset: 1_490, limit: 20 })
    await turn($)

    expect((first.result as { file: { numLines: number } }).file.numLines).toBe(60)
    expect(first.context?.at(-1)).toContain('1500: export function middle(): void {')
    expect(world.logs.find(line => line.includes('· cuts ·'))).toContain('1 targeted rereads')
  })

  test('a log pasted into a prompt is filed, and the prompt that goes on carries its head, tail and path (T41)', async ($, on) => {
    const world = worldOf()
    const log = Array.from({ length: 300 }, (_, i) => `10:00:${i} INFO tick ${i} worker-${i}`).join('\n')

    hook(on, world, started())
    await start($)
    await $.prompt.submit({ text: `Why?\n\n${log}\n\nThanks.`, wait: false, origin: { kind: 'composer' } } as never)

    const sent = world.submitted.at(-1) ?? ''
    const filed = Object.entries(world.written).find(([path]) => path.endsWith('prompt-0-0.txt'))

    expect(sent.startsWith('Why?\n\n')).toBe(true)
    expect(sent.endsWith('\n\nThanks.')).toBe(true)
    expect(sent).not.toContain('worker-150')
    expect(filed?.[1]).toBe(log)
  })

  test('with the cuts off, a long output goes through whole and nothing is filed', async ($, on) => {
    const world = worldOf()

    world.stdout = numbered(5_000)
    hook(on, world, started(false))
    await start($)

    const got = await $.tool.call({ tool: 'Bash', command: 'seq 5000', tool_use_id: 'toolu_c' } as never)

    expect((got.result as { stdout: string }).stdout).toBe(world.stdout)
    expect(Object.keys(world.written).filter(path => path.includes('/files/'))).toEqual([])
  })
})
