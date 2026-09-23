import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NO_LIST, policyOf } from '../hooks/policy'
import type { Policy } from '../hooks/policy'
import { NO_PENDING, NO_USAGE, callCountOf, mergedOf, withCall } from '../hooks/usage'
import type { Usage } from '../hooks/usage'

tier('user')

/**
 * Twelve sessions in which `mcp:stale` was called once, at the first.
 */
function history(): Usage {
  let usage = NO_USAGE

  for (let i = 1; i <= 12; i += 1) {
    usage = mergedOf(usage, i === 1 ? withCall(NO_PENDING, callCountOf('mcp__stale__a', {}, 'mcp:stale')) : NO_PENDING, `s${i}`)
  }

  return usage
}

/**
 * The policy of a session under way: every lever on, as `/clauget strict`
 * would leave it, and the profile the test names.
 */
const started = (headless: boolean): Policy =>
  policyOf({
    isOn: true,
    isCuts: true,
    isSteps: true,
    isBreaker: true,
    compaction: 'auto',
    isHeadless: headless,
    sessionId: 's-1',
    usage: history(),
    cwd: '/work',
    agents: NO_LIST,
    commands: NO_LIST,
  })

type World = {
  ui: string[]
  logs: string[]
  configs: { key: string; value: unknown }[]
  submitted: string[]
}

const worldOf = (): World => ({ ui: [], logs: [], configs: [], submitted: [] })

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
  on('fs.write', () => ({ value: undefined }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)

    return { value: undefined }
  })

  // Every other drawing call, recorded: a session nobody watches must make
  // none of them.
  for (const noun of ['status', 'toast', 'notice', 'open', 'invalidate'] as const) {
    on(`ui.${noun}` as 'ui.status', () => {
      world.ui.push(noun)

      return { value: undefined } as never
    })
  }

  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('agent.register', (_$, e) => ({ value: { agent: `clauget:${e.name}` } }) as never)
  on('config.set', (_$, e) => {
    world.configs.push({ key: e.key, value: e.value })

    return { value: e.value } as never
  })
  on('prompt.submit', (_$, e) => {
    world.submitted.push(e.text)

    return { text: e.text }
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.compact', () => ({ messages: [], tokensBefore: 10, tokensAfter: 5 }) as never)
  on('tool.describe', (_$, e) => ({ description: e.description }))
  on('tool.call', () => ({ result: { stdout: 'x'.repeat(40_000), stderr: '', interrupted: false } }) as never)
  on('turn.step', async function* (_$, e) {
    const usage = { model: 'claude-opus-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 900_000, cache_creation_input_tokens: 100 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage as never }
  })

  return clock
}

const start = ($: Engine, isInteractive: boolean) =>
  $.session.start({ surface: isInteractive ? 'terminal' : null, isInteractive, cwd: '/work' })

async function step($: Engine, turnId: string, index: number): Promise<void> {
  const stream = $.turn.step({ turnId, index, model: 'claude-opus-5', messageCount: 3 } as never)

  for await (const _chunk of stream) {
    // drained
  }

  await stream.result
}

const complete = ($: Engine, turnId: string) =>
  $.turn.complete({ answer: 'done', durationMs: 9, isAborted: false, turnId, reason: 'answer' } as never)

const measure = ($: Engine, percentUsed: number, resetsAt?: string) =>
  $.session.measure({
    context: { window: 1_000_000, tokens: 500_000, percent: 50 },
    rateLimits: [{ kind: 'five_hour', percentUsed, ...(resetsAt === undefined ? {} : { resetsAt }) }],
    changed: ['rateLimits'],
  })

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const

describe('the pilot, in a session', () => {
  test('a session nobody watches draws nothing but log lines, every lever on (T60)', async ($, on) => {
    const world = worldOf()
    const clock = hook(on, world, started(true))

    await start($, false)
    await $.tool.call({ tool: 'Bash', command: 'build' })
    await step($, 't1', 0)
    await step($, 't1', 1)
    await complete($, 't1')
    await measure($, 95)
    await clock.advance(120_000)

    expect(world.ui).toEqual([])
    expect(world.logs.length).toBeGreaterThan(0)
  })

  test('a change of tier mid-session moves no answer the prefix is made of (T61)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started(false))
    await start($, true)

    const provider = { plugin: 'mcp:stale', tier: 'user' as const }
    const before = await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider })

    await measure($, 95)

    const after = await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider })

    expect(after).toEqual(before)
    expect(world.logs.some(line => line.includes('no longer compacts or stops a turn'))).toBe(true)
  })

  test('the tier does not swing: one change, then none within three turns (T61)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started(false))
    await start($, true)
    await measure($, 65)
    await measure($, 30)
    await step($, 't1', 0)
    await complete($, 't1')
    await measure($, 65)

    expect(world.logs.filter(line => line.includes('economy tier'))).toHaveLength(1)
  })

  test('/clauget on twice writes the row once (T63)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started(false))
    await start($, true)
    await $.command.run({ command: 'clauget', args: 'on', ...RUN } as never)
    await $.command.run({ command: 'clauget', args: 'on', ...RUN } as never)

    expect(world.configs).toEqual([{ key: 'clauget.economy', value: 'on' }])
    expect(world.logs.some(line => line.includes('economy already on'))).toBe(true)
  })

  test('a deferred prompt is sent once, after the reset, never during a turn; a cancel empties the queue (T64)', async ($, on) => {
    const world = worldOf()
    const clock = hook(on, world, started(false))

    await start($, true)
    await measure($, 91, new Date(clock.now() + 60_000).toISOString())
    await $.command.run({ command: 'clauget', args: 'later run the heavy suite', ...RUN } as never)
    await $.command.run({ command: 'clauget', args: 'later run another', ...RUN } as never)

    // A turn is running when the time comes: the prompts wait for its end.
    await step($, 't1', 0)
    await clock.advance(61_000)

    expect(world.submitted).toEqual([])

    await complete($, 't1')
    await clock.advance(1_000)

    expect(world.submitted).toEqual(['run the heavy suite', 'run another'])

    await $.command.run({ command: 'clauget', args: 'later once more', ...RUN } as never)
    await $.command.run({ command: 'clauget', args: 'cancel', ...RUN } as never)
    await clock.advance(120_000)

    expect(world.submitted).toHaveLength(2)
  })

  test('with no reset known, nothing is deferred (T64)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started(false))
    await start($, true)
    await $.command.run({ command: 'clauget', args: 'later run it', ...RUN } as never)

    expect(world.logs.some(line => line.includes('no window reset is known yet'))).toBe(true)
  })
})
