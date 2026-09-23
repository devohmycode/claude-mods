import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NO_LIST, policyOf } from '../hooks/policy'
import type { Policy } from '../hooks/policy'
import { NO_USAGE } from '../hooks/usage'

tier('user')

/**
 * The policy session `s-1` started with: the step levers on, the breaker as
 * the test says.
 */
const started = (breaker = false, steps = true): Policy =>
  policyOf({
    isOn: false,
    isSteps: steps,
    isBreaker: breaker,
    smallModelAgents: ['Explore', 'clauget:explorer'],
    sessionId: 's-1',
    usage: NO_USAGE,
    cwd: '/work',
    agents: NO_LIST,
    commands: NO_LIST,
  })

type World = {
  registered: Record<string, unknown>[]
  spawned: Record<string, unknown>[]
  efforts: unknown[]
  aborts: string[]
  logs: string[]
  stdout: string
  /**
   * What the next step streams: tool calls and no text, or text.
   */
  isMechanical: boolean
  /**
   * Whether the bottom refuses an abort (a turn that has moved on).
   */
  refuseAbort: boolean
  denySpawn: boolean
}

const worldOf = (): World => ({
  registered: [],
  spawned: [],
  efforts: [],
  aborts: [],
  logs: [],
  stdout: '',
  isMechanical: true,
  refuseAbort: false,
  denySpawn: false,
})

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
  on('fs.write', () => ({ value: undefined }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('agent.register', (_$, e) => {
    world.registered.push(e as unknown as Record<string, unknown>)

    return { value: { agent: `clauget:${e.name}` } } as never
  })
  on('agent.spawn', (_$, e) => {
    world.spawned.push(e as unknown as Record<string, unknown>)

    return world.denySpawn ? { deny: 'no room' } : ({ model: e.model ?? 'parent', agentId: `a${world.spawned.length}` } as never)
  })
  on('turn.abort', (_$, e) => {
    if (world.refuseAbort) {
      throw new Error('not the running turn')
    }

    world.aborts.push(e.turnId)

    return { value: undefined } as never
  })
  on('classic.PreModelSwitch', () => ({}))
  on('tool.call', (_$, e) =>
    e.tool === 'Bash'
      ? ({ result: { stdout: world.stdout, stderr: '', interrupted: false } } as never)
      : ({ result: { mode: 'content', numFiles: 1, filenames: ['a.ts'], content: 'a.ts:1:x' } } as never),
  )
  on('turn.step', async function* (_$, e) {
    world.efforts.push(e.effort)

    const usage = {
      model: 'claude-opus-5',
      input_tokens: 10,
      output_tokens: 40,
      cache_read_input_tokens: e.agentId === undefined ? 100_000 : 4_000,
      cache_creation_input_tokens: 100,
    }

    if (world.isMechanical) {
      yield { kind: 'tool', index: 0, id: `t${e.index}`, name: 'Bash' } as never
    } else {
      yield { kind: 'text', index: 0, text: 'Here is what I found.' } as never
    }

    yield { kind: 'stop', stopReason: 'tool_use', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: usage as never }
  })
}

const start = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

/**
 * Runs one request of a turn.
 */
async function step($: Engine, turnId: string, index: number, over: Record<string, unknown> = {}): Promise<void> {
  const stream = $.turn.step({ turnId, index, model: 'claude-opus-5', messageCount: 3, effort: 'high', ...over } as never)

  for await (const _chunk of stream) {
    // drained
  }

  await stream.result
}

const OUTPUT = Array.from({ length: 30 }, (_, i) => `test ${i} passed`).join('\n')

describe('the step levers, in a session', () => {
  test('the explorer is declared with a small prefix: read-only tools, no server, no skill, no CLAUDE.md, a bounded loop (T43)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)

    expect(world.registered).toHaveLength(1)
    expect(world.registered[0]).toMatchObject({
      name: 'explorer',
      tools: ['Read', 'Grep', 'Glob'],
      mcpServers: [],
      skills: [],
      model: 'haiku',
      maxTurns: 12,
      omitClaudeMd: true,
    })
  })

  test('the explorer\'s own steps are read apart, by its agentId (T43)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)

    const spawned = await $.agent.spawn({ prompt: 'find capOf', description: 'find', subagentType: 'clauget:explorer' } as never)

    await step($, 'sub', 0, { agentId: (spawned as { agentId: string }).agentId })
    await step($, 'sub', 1, { agentId: (spawned as { agentId: string }).agentId })
    await step($, 't1', 0)
    await $.turn.complete({ answer: 'done', durationMs: 9, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await $.command.run({ command: 'clauget', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as never)

    expect(world.logs.find(line => line.includes('explorer ·'))).toContain('2 steps reading 4000 tok each from the cache, against 100000')
  })

  test('a listed type goes to the smaller model; an excluded one keeps its own; a refusal goes up (T45)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)
    await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'Explore' } as never)
    await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'general-purpose' } as never)

    world.denySpawn = true

    const refused = await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'Explore' } as never)

    expect(world.spawned[0]?.model).toBe('haiku')
    expect(world.spawned[1]?.model).toBe(undefined)
    expect(refused).toEqual({ deny: 'no room' })
  })

  test('an open-ended search is answered as it came, with the explorer proposed once (T44)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)

    const first = await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
    const second = await $.tool.call({ tool: 'Grep', pattern: 'y' } as never)
    const scoped = await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'src' } as never)

    expect((first.result as { content: string }).content).toBe('a.ts:1:x')
    expect(first.context?.at(-1)).toContain('clauget:explorer')
    expect(second.context ?? []).toEqual([])
    expect(scoped.context ?? []).toEqual([])
  })

  test('a Bash output identical to an earlier one of the turn is named, with its step (T46)', async ($, on) => {
    const world = worldOf()

    world.stdout = OUTPUT
    hook(on, world, started())
    await start($)
    await step($, 't1', 4)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await step($, 't1', 5)

    const again = await $.tool.call({ tool: 'Bash', command: 'npm  test --silent' })

    world.stdout = `${OUTPUT}!`
    await step($, 't1', 6)

    const changed = await $.tool.call({ tool: 'Bash', command: 'npm test' })

    expect(again.context?.at(-1)).toContain('as at step 4')
    expect(changed.context ?? []).toEqual([])
  })

  test('the effort is left as the engine asked, even after a mechanical step (T47, closed by measurement)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started())
    await start($)
    await step($, 't1', 0)
    await step($, 't1', 1)

    world.isMechanical = false
    await step($, 't1', 2)
    await step($, 't1', 3)

    // Lowering it mid-turn made the provider rewrite its cached messages.
    expect(world.efforts).toEqual(['high', 'high', 'high', 'high'])
  })

  test('a switch that would rewrite a warm cache above the threshold asks first (T48)', async ($, on) => {
    hook(on, worldOf(), started())
    await start($)

    const base = { from_model: 'a', to_model: 'b', requested_model: 'b', source: 'command', context_tokens: 120_000, prompt_cache_warm: true, cache_ttl: '5m', pricing: 'catalog' }
    // The engine's `classic` noun, which the 2.1.278 declarations leave off
    // the test's `$`: it raises the classic event as the engine does.
    const classic = ($ as unknown as { classic: { PreModelSwitch: (e: unknown) => Promise<{ permissionDecision?: string }> } }).classic
    const costly = await classic.PreModelSwitch({ ...base, estimated_cache_write_usd: 0.45 })
    const cheap = await classic.PreModelSwitch({ ...base, estimated_cache_write_usd: 0.02 })

    expect(costly).toMatchObject({ permissionDecision: 'ask' })
    expect(cheap.permissionDecision).toBe(undefined)
  })

  test('the breaker stops a turn once at its ceiling, never under it, and a refused abort is logged (T49)', async ($, on) => {
    const world = worldOf()

    hook(on, world, started(true))
    await start($)
    await step($, 't1', 29)
    await step($, 't1', 30)
    await step($, 't1', 31)

    world.refuseAbort = true
    await step($, 't2', 30)

    expect(world.aborts).toEqual(['t1'])
    expect(world.logs.some(line => line.includes('stopped by the circuit breaker at step 30 · resume'))).toBe(true)
    expect(world.logs.some(line => line.includes('refused, the turn had moved on'))).toBe(true)
  })

  test('with the step levers off, nothing is declared, moved, named or lowered', async ($, on) => {
    const world = worldOf()

    world.stdout = OUTPUT
    hook(on, world, started(false, false))
    await start($)
    await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'Explore' } as never)
    await step($, 't1', 0)
    await $.tool.call({ tool: 'Bash', command: 'x' })
    await step($, 't1', 1)

    const again = await $.tool.call({ tool: 'Bash', command: 'x' })

    expect(world.registered).toEqual([])
    expect(world.spawned[0]?.model).toBe(undefined)
    expect(world.efforts).toEqual(['high', 'high'])
    expect(again.context ?? []).toEqual([])
  })
})
