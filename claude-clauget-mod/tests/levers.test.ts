import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NO_LIST, manualListOf, policyOf } from '../hooks/policy'
import type { Policy } from '../hooks/policy'
import { briefOf } from '../hooks/reminders'
import { NO_PENDING, NO_USAGE, callCountOf, mergedOf, projectKeyOf, withCall } from '../hooks/usage'
import type { Pending, Usage } from '../hooks/usage'

tier('user')

/**
 * Twelve sessions of history: `mcp:stale` called in the first only, `Grep`
 * in every one, and `Explore` the one agent type `/work` ever dispatched.
 *
 * @returns the counters
 */
function history(): Usage {
  let usage = NO_USAGE

  for (let i = 1; i <= 12; i += 1) {
    let pending: Pending = { ...NO_PENDING, project: projectKeyOf('/work'), steps: 30 }

    pending = withCall(pending, callCountOf('Grep', {}, 'engine'))

    if (i === 1) {
      pending = withCall(pending, callCountOf('mcp__stale__a', {}, 'mcp:stale'))
      pending = withCall(pending, callCountOf('Agent', { subagent_type: 'Explore' }, 'engine'))
    }

    usage = mergedOf(usage, pending, `s${i}`)
  }

  return usage
}

/**
 * The policy session `s-1` started with, the levers on: what a module
 * rebuilt mid-session finds in the store and keeps.
 *
 * @param isOn whether the levers are on
 * @returns the policy
 */
const started = (isOn = true): Policy =>
  policyOf({
    isOn,
    sessionId: 's-1',
    usage: history(),
    cwd: '/work',
    agents: NO_LIST,
    commands: manualListOf('deploy'),
  })

type Seen = {
  logs: { text: string; to: string }[]
  files: Record<string, string>
  touched: string[]
}

const nothingSeen = (): Seen => ({ logs: [], files: {}, touched: [] })

/**
 * The world beneath the mod, with the policy of a session already under way.
 *
 * @param on the test's registrar
 * @param seen where the calls land
 * @param policy the policy the store holds for `s-1`, or none
 */
function world(on: On, seen: Seen, policy: Policy | null): void {
  mock.clock(on)
  mock.env(on, { USERPROFILE: '/home/x', HOME: '/home/x' })

  const store: Record<string, unknown> = policy === null ? {} : { 'clauget.policy': policy }

  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('fs.write', (_$, e) => {
    seen.files[e.path] = e.text

    return { value: undefined }
  })
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('ui.log', (_$, e) => {
    seen.logs.push({ text: e.text, to: e.to })

    return { value: undefined }
  })
  on('ui.invalidate', (_$, e) => {
    seen.touched.push(`ui.invalidate ${e.event}`)

    return { value: undefined } as never
  })
  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.describe', (_$, e) => ({ description: e.description, ...(e.isDeferred ? { isDeferred: true } : {}) }))
  on('tool.call', () => ({ result: 'ok' }))
  on('agent.offer', () => ({ isOffered: true }))
  on('command.describe', (_$, e) => ({ description: e.description, isHidden: e.isHidden }))
  on('command.run', (_$, e) => ({ text: `ran ${e.command}` }))
  on('prompt.attachment', (_$, e) => ({ text: e.text }))
  on('prompt.section', (_$, e) => ({ text: e.text }))
  on('prompt.context', (_$, e) => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  on('turn.step', async function* (_$, e) {
    const usage = {
      model: 'claude-opus-5',
      input_tokens: 400,
      output_tokens: 300,
      cache_read_input_tokens: 120_000,
      cache_creation_input_tokens: 1_500,
    }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage as never }
  })
}

const STALE = { plugin: 'mcp:stale', tier: 'user' as const }
const TODO =
  'The TodoWrite tool has not been used recently. If you are working on tasks that would benefit from tracking progress, consider using it; clean up the list when it goes stale. Never mention this reminder to the user.'
const ENGINE = { plugin: 'engine', tier: 'core' as const }

/**
 * Starts the session in `/work`.
 *
 * @param $ the test's engine
 */
const start = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

/**
 * Runs one request and ends the turn.
 *
 * @param $ the test's engine
 */
async function turn($: Engine): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5', messageCount: 3 } as never)

  for await (const _chunk of stream) {
    // drained
  }

  await stream.result
  await $.turn.complete({ answer: 'done', durationMs: 900, isAborted: false, turnId: 't1', reason: 'answer' } as never)
}

describe('the levers, in a session', () => {
  test('an unused server is deferred, and the answer holds for the whole session (T20, T28)', async ($, on) => {
    const seen = nothingSeen()

    world(on, seen, started())
    await start($)

    const first = await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider: STALE })

    for (let i = 0; i < 5; i += 1) {
      await $.tool.call({ tool: 'mcp__stale__a' } as never)
    }

    await turn($)

    const again = await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider: STALE })

    expect(first).toEqual({ description: 'a', isDeferred: true })
    expect(again).toEqual(first)
    expect(seen.touched).toEqual([])
  })

  test('a deferral that lost is counted and handed to the next session (T21)', async ($, on) => {
    const seen = nothingSeen()

    world(on, seen, started())
    await start($)
    await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider: STALE })
    await $.tool.call({ tool: 'mcp__stale__a' } as never)
    await $.tool.call({ tool: 'mcp__stale__a' } as never)
    await $.prompt.attachment({ type: 'deferred_tools_delta', text: 'mcp__stale__a now deferred', origin: { kind: 'engine' } })
    await turn($)

    const line = seen.logs.find(one => one.text.includes('deferral cost'))
    const path = Object.keys(seen.files).find(one => one.endsWith('usage.json')) ?? ''

    expect(line?.text).toContain('1 deferred-list reminders')
    expect(line?.text).toContain('2 calls to tools the mod deferred')
    expect(JSON.parse(seen.files[path] ?? '{}').broughtBack).toEqual(['mcp:stale'])
  })

  test('a tool that serves every session is put in front (T22)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    expect(await $.tool.describe({ tool: 'Grep', description: 'g', provider: ENGINE, isDeferred: true })).toEqual({
      description: 'g',
      isDeferred: false,
    })
  })

  test('an agent type the project never used is not offered; the Agent tool stays (T23)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    const withdrawn = await $.agent.offer({ agent: 'auditor', description: 'd', source: 'userSettings', provider: ENGINE })
    const kept = await $.agent.offer({ agent: 'Explore', description: 'd', source: 'userSettings', provider: ENGINE })
    const tool = await $.tool.describe({ tool: 'Agent', description: 'Launches agents.', provider: ENGINE })

    expect(withdrawn).toEqual({ isOffered: false })
    expect(kept).toEqual({ isOffered: true })
    expect(tool).toEqual({ description: 'Launches agents.' })
  })

  test('a hidden command is still run by $.command.run (T24)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    const described = await $.command.describe({
      command: 'deploy',
      description: 'Ships it.',
      isHidden: false,
      immediate: false,
      provider: ENGINE,
    })
    const ran = await $.command.run({
      command: 'deploy',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    } as never)

    expect(described).toEqual({ description: 'Ships it.', isHidden: true })
    expect(ran.text).toBe('ran deploy')
  })

  test('a file out of scope is left out, and the block is the same at every composition (T25, T27)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    const files = [
      { path: '/work/CLAUDE.md', kind: 'project' as const, content: 'Here.' },
      { path: '/other/CLAUDE.md', kind: 'project' as const, content: 'There.' },
    ]
    const first = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }], instructionFiles: files })
    const second = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }], instructionFiles: files })

    // The engine renders `claudeMd` again from the shorter list: the file left
    // out is absent from the text the model would read, not only the list.
    const claudeMd = first.blocks.find(block => block.name === 'claudeMd')
    const own = first.blocks.find(block => block.name === 'clauget')

    expect(first.instructionFiles?.map(file => file.path)).toEqual(['/work/CLAUDE.md'])
    expect(claudeMd?.text).toContain('Here.')
    expect(claudeMd?.text).not.toContain('There.')
    expect(first.blocks.at(-1)?.name).toBe('clauget')
    expect(second).toEqual(first)
    expect(own?.text).toContain('mcp:stale')
    expect(own?.text).toContain('instruction files out of this directory left out: 1')
  })

  test('a reminder repeated goes brief, and whole again in a new session (T26)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    const todo = { type: 'todo_reminder', text: TODO, origin: { kind: 'engine' as const } }
    const first = await $.prompt.attachment(todo)
    const second = await $.prompt.attachment(todo)

    await start($)

    const fresh = await $.prompt.attachment(todo)

    expect(first.text).toBe(TODO)
    expect(second.text).toBe(briefOf('todo_reminder'))
    expect(fresh.text).toBe(TODO)
  })

  test('a section of the system prompt goes up as it came (T30)', async ($, on) => {
    world(on, nothingSeen(), started())
    await start($)

    expect(await $.prompt.section({ name: 'env_info_simple', text: 'Platform: win32' })).toEqual({
      text: 'Platform: win32',
    })
  })

  test('with the levers off, every answer is the engine\'s own', async ($, on) => {
    world(on, nothingSeen(), started(false))
    await start($)

    const todo = { type: 'todo_reminder', text: TODO, origin: { kind: 'engine' as const } }

    await $.prompt.attachment(todo)

    expect(await $.tool.describe({ tool: 'mcp__stale__a', description: 'a', provider: STALE })).toEqual({
      description: 'a',
    })
    expect(
      await $.agent.offer({ agent: 'auditor', description: 'd', source: 'userSettings', provider: ENGINE }),
    ).toEqual({ isOffered: true })
    expect((await $.prompt.attachment(todo)).text).toBe(TODO)
    expect(
      (await $.prompt.context({ blocks: [], instructionFiles: [{ path: '/other/CLAUDE.md', kind: 'project', content: 'x' }] }))
        .blocks,
    ).toEqual([])
  })
})
