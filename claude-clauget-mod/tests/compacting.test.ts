import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, SessionMessage } from 'claude-code'

import { NO_LIST, policyOf } from '../hooks/policy'
import type { Policy } from '../hooks/policy'
import { NO_USAGE } from '../hooks/usage'

tier('user')

const started = (compaction: 'off' | 'on' | 'auto' = 'on'): Policy =>
  policyOf({ isOn: false, compaction, sessionId: 's-1', usage: NO_USAGE, cwd: '/work', agents: NO_LIST, commands: NO_LIST })

type World = {
  compacts: { instructions?: string; messages: readonly SessionMessage[]; trigger: string; agentId?: string }[]
  forks: number
  fork: unknown
  files: Record<string, string>
  written: Record<string, string>
  logs: string[]
  status: (string | undefined)[]
  cacheRead: number
}

const worldOf = (): World => ({
  compacts: [],
  forks: 0,
  fork: { text: '- keep the public API', usage: { input_tokens: 5, output_tokens: 20, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 } },
  files: {},
  written: {},
  logs: [],
  status: [],
  cacheRead: 1_000,
})

const keyOf = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
const at = <T,>(record: Record<string, T>, path: string): T | undefined =>
  Object.entries(record).find(([key]) => keyOf(key) === keyOf(path))?.[1]

function hook(on: On, world: World, policy: Policy): MockClock {
  const clock = mock.clock(on)

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
    const text = at(world.files, e.path)

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)

    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    world.status.push(e.text)

    return { value: undefined } as never
  })
  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('model.fork', () => {
    world.forks += 1

    return { value: world.fork } as never
  })
  on('session.compact', (_$, e) => {
    world.compacts.push(e as never)

    return { messages: [{ role: 'user', text: 'Summary: the build was fixed.', toolUses: [] }], tokensBefore: 90_000, tokensAfter: 18_000 } as never
  })
  on('tool.call', (_$, e) => {
    const args = e as unknown as { file_path?: string; offset?: number; limit?: number }

    if (e.tool === 'Read' && args.file_path !== undefined) {
      const all = (at(world.files, args.file_path) ?? '').split('\n').slice(0, -1)
      const start = args.offset ?? 1
      const lines = all.slice(start - 1, start - 1 + (args.limit ?? 2_000))

      return {
        result: { type: 'text', file: { filePath: args.file_path, content: lines.join('\n'), numLines: lines.length, startLine: start, totalLines: all.length } },
      } as never
    }

    return { result: { stdout: 'ok', stderr: '', interrupted: false } } as never
  })
  on('turn.step', async function* (_$, e) {
    const usage = { model: 'claude-opus-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: world.cacheRead, cache_creation_input_tokens: 100 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage as never }
  })

  return clock
}

const start = ($: Engine, isInteractive = true) =>
  $.session.start({ surface: isInteractive ? 'terminal' : null, isInteractive, cwd: '/work' })

async function turn($: Engine, turnId: string, steps = 1): Promise<void> {
  for (let index = 0; index < steps; index += 1) {
    const stream = $.turn.step({ turnId, index, model: 'claude-opus-5', messageCount: 3 } as never)

    for await (const _chunk of stream) {
      // drained
    }

    await stream.result
  }

  await $.turn.complete({ answer: 'done', durationMs: 9, isAborted: false, turnId, reason: 'answer' } as never)
}

const BIG = 'x'.repeat(5_000)

/**
 * The transcript the engine hands the compaction: the person's prompt, one
 * large result and one small.
 */
const transcript = (): SessionMessage[] => [
  { role: 'user', text: 'Fix the build.', toolUses: [], handle: 'h0' },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Bash', input: {}, text: BIG }], handle: 'h1' },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: BIG, isError: false }], handle: 'h2' },
  { role: 'assistant', text: 'Fixed.', toolUses: [], handle: 'h3' },
]

const numbered = (count: number) => `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`

describe('the compaction levers, in a session', () => {
  test('no summary is precomputed while the person works, and the conversation stays (T55)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)

    const answered = await $.session.compact({ trigger: 'precompute', messages: transcript() } as never)

    expect(answered).toEqual({ skip: 'clauget: no precomputed summary while the person works' })
    expect(world.compacts).toEqual([])
  })

  test('the summarizer gets the transcript lightened, the facts and the files read (T51, T53, T56)', async ($, on) => {
    const world = worldOf()

    world.files['/work/a.ts'] = numbered(50)
    hook(on, world, started())
    await start($)
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts', offset: 5, limit: 10 })
    await $.session.compact({ trigger: 'manual', instructions: 'Keep the plan.', messages: transcript() } as never)

    const handed = world.compacts[0]
    const filed = Object.entries(world.written).find(([path]) => path.includes('compact-t1'))

    expect(world.forks).toBe(1)
    expect(handed?.instructions?.startsWith('Keep the plan.')).toBe(true)
    expect(handed?.instructions).toContain('- keep the public API')
    expect(handed?.instructions).toContain('/work/a.ts')
    expect(handed?.messages).toHaveLength(4)
    expect(handed?.messages[0]?.text).toBe('Fix the build.')
    expect(handed?.messages[2]?.toolResults?.[0]?.text).toContain('compact-t1')
    expect(filed?.[1]).toBe(BIG)
  })

  test('a cold fork leaves the compaction without facts (T53)', async ($, on) => {
    const world = worldOf()

    world.fork = null
    hook(on, world, started())
    await start($)
    await $.session.compact({ trigger: 'manual', messages: transcript() } as never)

    expect(world.compacts[0]?.instructions).toBe(undefined)
  })

  test('a subagent\'s compaction is lightened, and asks no fork of the main cache (T59)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)
    await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: transcript() } as never)

    expect(world.forks).toBe(0)
    expect(world.compacts[0]?.messages[2]?.toolResults?.[0]?.text).toContain('compact-t1')
  })

  test('after it, a file read before is served as the windows read then, until the first turn ends (T56)', async ($, on) => {
    const world = worldOf()

    world.files['/work/a.ts'] = numbered(400)
    hook(on, world, started())
    await start($)
    await $.tool.call({ tool: 'Read', file_path: '/work/a.ts', offset: 100, limit: 20 })
    await $.session.compact({ trigger: 'manual', messages: transcript() } as never)

    const first = await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })

    await turn($, 't1')

    const second = await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
    const window = (first.result as { file: { startLine: number; numLines: number } }).file

    expect(window.startLine).toBe(100)
    expect(window.numLines).toBe(20)
    expect(first.context?.at(-1)).toContain('read before the compaction')
    expect((second.result as { file: { numLines: number } }).file.numLines).toBe(400)
  })

  test('past the profitable point it is proposed once; auto compacts after the turn, once (T54)', async ($, on) => {
    const world = worldOf()

    world.cacheRead = 600_000
    const clock = hook(on, world, started('auto'))

    await start($)
    await turn($, 't1', 3)
    await turn($, 't2', 3)
    await clock.advance(2_000)

    expect(world.logs.filter(line => line.includes('compacting now would pay'))).toHaveLength(1)
    // One compaction, after the turn: the harness hands a plugin's own
    // compaction down without the `plugin` trigger the engine stamps.
    expect(world.compacts).toHaveLength(1)
  })

  test('the countdown is armed as a turn ends and disarmed by the next prompt (T58)', async ($, on) => {
    const world = worldOf()
    const clock = hook(on, world, started())

    on('prompt.submit', (_$, e) => ({ text: e.text }))
    await start($)
    await turn($, 't1')
    await clock.advance(15_000)

    const armed = world.status.filter(one => one !== undefined).length

    await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(60_000)

    expect(world.status[0]).toContain('cache warm 5:00')
    expect(world.status.at(-1)).toBe(undefined)
    expect(world.status.filter(one => one !== undefined).length).toBe(armed)
  })

  test('with the levers off, the compaction is the engine\'s own', async ($, on) => {
    const world = worldOf()

    hook(on, world, started('off'))
    await start($)
    await $.session.compact({ trigger: 'manual', messages: transcript() } as never)

    expect(world.forks).toBe(0)
    expect(world.compacts[0]?.messages[2]?.handle).toBe('h2')
    expect(world.compacts[0]?.instructions).toBe(undefined)
  })
})
