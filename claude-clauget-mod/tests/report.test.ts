import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COMMAND_SPEC } from '../hooks/names'

tier('user')

/**
 * One line the mod wrote, as the `ui.log` beneath it saw it.
 */
type Logged = {
  text: string
  to: string
}

/**
 * What `/clauget` is run with, as the composer runs it.
 */
const REPORT = {
  command: 'clauget',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

/**
 * A breakdown with one server of two tools — one of them deferred — and one
 * instruction file.
 */
const BREAKDOWN = {
  categories: [{ name: 'Messages', tokens: 50_000, color: 'x', isDeferred: false, kind: 'used' as const }],
  totalTokens: 50_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  autocompactSource: 'auto' as never,
  percentage: 5,
  gridRows: [],
  model: 'claude-opus-5',
  memoryFiles: [{ path: '/work/CLAUDE.md', type: 'Project', tokens: 1_200 }],
  mcpTools: [
    { name: 'mcp__linear__a', serverName: 'linear', tokens: 2_000, isLoaded: true },
    { name: 'mcp__linear__b', serverName: 'linear', tokens: 1_500, isLoaded: false },
  ],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

/**
 * The world beneath the mod, every call it makes answered and recorded.
 *
 * @param on the test's registrar, whose hooks sit beneath the plugin
 * @param seen where the calls land: the usage arguments, the config writes
 *   and invalidations, the lines logged, the files written
 * @param disk what `$.fs.read` answers, by the path's last segment
 */
function world(
  on: On,
  seen: { asked: unknown[]; touched: string[]; logs: Logged[]; files: Record<string, string> },
  disk: Record<string, string> = {},
): void {
  mock.clock(on)
  mock.env(on, { USERPROFILE: '/home/x', HOME: '/home/x' })

  const store: Record<string, unknown> = {}

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
  on('fs.read', (_$, e) => {
    const name = e.path.split(/[\\/]/).at(-1) ?? ''
    const text = disk[name]

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('ui.log', (_$, e) => {
    seen.logs.push({ text: e.text, to: e.to })

    return { value: undefined }
  })
  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.usage', (_$, e) => {
    seen.asked.push(e)

    return {
      value: {
        context: { window: 1_000_000, tokens: 50_000, percent: 5, breakdown: BREAKDOWN },
        startedAt: 0,
        rateLimits: [],
      },
    }
  })
  on('tool.list', () => ({
    value: [
      { name: 'Bash', description: 'b', mcp: false },
      { name: 'mcp__linear__a', description: 'a', mcp: true },
      { name: 'mcp__linear__b', description: 'b', mcp: true },
    ],
  }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.describe', (_$, e) => ({ description: e.description }))
  on('tool.call', () => ({ result: 'ok' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('prompt.context', (_$, e) => ({ blocks: e.blocks }))
  on('config.set', (_$, e) => {
    seen.touched.push(`config.set ${e.key}`)

    return next0()
  })
  on('ui.invalidate', (_$, e) => {
    seen.touched.push(`ui.invalidate ${e.event}`)

    return next0()
  })
  on('turn.step', async function* (_$, e) {
    const usage = {
      model: 'claude-opus-5',
      input_tokens: 400,
      output_tokens: 300,
      cache_read_input_tokens: 120_000,
      cache_creation_input_tokens: 1_500,
    }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: usage as never,
    }
  })
}

/**
 * The bottom's answer to an op whose value nothing reads.
 *
 * @returns an empty value
 */
const next0 = () => ({ value: undefined }) as never

/**
 * An empty record of what the world saw.
 *
 * @returns the record
 */
const nothingSeen = () => ({
  asked: [] as unknown[],
  touched: [] as string[],
  logs: [] as Logged[],
  files: {} as Record<string, string>,
})

/**
 * A session with one request and one turn, its three tools described as the
 * engine describes them on rendering.
 *
 * @param $ the test's engine
 * @param calls the tool calls the turn makes
 */
async function session($: Engine, calls: () => Promise<unknown> = async () => undefined): Promise<void> {
  const engine = { plugin: 'engine', tier: 'core' as const }
  const linear = { plugin: 'mcp:linear', tier: 'user' as const }

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.describe({ tool: 'Bash', description: 'b', provider: engine })
  await $.tool.describe({ tool: 'mcp__linear__a', description: 'a', provider: linear })
  await $.tool.describe({ tool: 'mcp__linear__b', description: 'b', provider: linear, isDeferred: true })
  await calls()

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5', messageCount: 3 } as never)

  for await (const _chunk of stream) {
    // drained
  }

  await stream.result
  await $.turn.complete({ answer: 'done', durationMs: 900, isAborted: false, turnId: 't1', reason: 'answer' } as never)
}

describe('the bill, from a session', () => {
  test('the command registered is the command served', () => {
    expect(COMMAND_SPEC.name).toBe(REPORT.command)
  })

  test('a description goes up exactly as it came (T13)', async ($, on) => {
    world(on, nothingSeen())

    const linear = { plugin: 'mcp:linear', tier: 'user' as const }

    expect(await $.tool.describe({ tool: 'mcp__linear__a', description: 'Creates.', provider: linear })).toEqual({
      description: 'Creates.',
    })
  })

  test('each call is counted for the provider that described its tool, and the counters survive (T14)', async ($, on) => {
    const seen = nothingSeen()
    const earlier = {
      version: 1,
      sessions: 29,
      steps: 900,
      seen: ['old'],
      providers: { 'mcp:linear': { calls: 1, sessions: 1, seen: ['old'] } },
      agents: {},
      skills: {},
    }

    world(on, seen, { 'usage.json': JSON.stringify(earlier) })

    await session($, async () => {
      await $.tool.call({ tool: 'mcp__linear__a' } as never)
      await $.tool.call({ tool: 'Bash', command: 'ls' })
      await $.tool.call({ tool: 'Skill', skill: 'remember' } as never)
    })

    const path = Object.keys(seen.files).find(one => one.endsWith('usage.json')) ?? ''
    const written = JSON.parse(seen.files[path] ?? '{}')

    expect(written.sessions).toBe(30)
    expect(written.steps).toBe(901)
    expect(written.providers['mcp:linear']).toEqual({ calls: 2, sessions: 2, seen: ['old', 's-1'] })
    expect(written.providers['engine'].calls).toBe(1)
    // Skill was never described in this session: said, not guessed.
    expect(written.providers['?'].calls).toBe(1)
    expect(written.skills['remember'].calls).toBe(1)
  })

  test('no breakdown is asked for outside the report, and one counted inside it (T15)', async ($, on) => {
    const seen = nothingSeen()

    world(on, seen)

    await session($, async () => {
      await $.session.measure({
        context: { window: 1_000_000, tokens: 50_000, percent: 5 },
        rateLimits: [],
        cost: { usd: 0.42 },
        changed: ['context', 'cost'],
      })
      await $.tool.call({ tool: 'Bash', command: 'ls' })
    })

    expect(seen.asked).toEqual([])

    await $.command.run(REPORT)

    expect(seen.asked).toEqual([{ breakdown: 'full' }])
  })

  test('the report writes nothing the model reads, no config row and no invalidation (T19)', async ($, on) => {
    const seen = nothingSeen()

    world(on, seen)

    await session($, async () => {
      await $.prompt.context({
        blocks: [],
        instructionFiles: [{ path: '/work/CLAUDE.md', kind: 'project', content: 'Short.' }],
      })
      await $.session.measure({
        context: { window: 1_000_000, tokens: 50_000, percent: 5 },
        rateLimits: [],
        cost: { usd: 0.42 },
        changed: ['context'],
      })
    })

    const answered = await $.command.run(REPORT)
    const report = seen.logs.filter(line => line.to === 'transcript' && line.text.startsWith('clauget ·'))
    const texts = report.map(line => line.text)

    expect(answered.text ?? '').toBe('')
    expect(answered.context ?? []).toEqual([])
    expect(seen.touched).toEqual([])
    expect(texts.some(line => line.includes('window 5%') && line.includes('cost $0.42'))).toBe(true)
    expect(texts.some(line => line.includes('bill') && line.includes('token-count API'))).toBe(true)
    expect(texts.some(line => line.includes('3 listed') && line.includes('mcp:linear 2'))).toBe(true)

    const all = seen.logs.map(line => line.text)

    expect(all.some(line => line.includes('mcp:linear') && line.includes('[mcpTools]'))).toBe(true)
    expect(all.some(line => line.includes('/work/CLAUDE.md') && line.includes('1200 tok'))).toBe(true)

    const path = Object.keys(seen.files).find(one => one.endsWith('s-1.report.txt')) ?? ''

    expect(seen.files[path]).toContain('[mcpTools]')
    expect(seen.files[path]).toContain('deferral break-even, computed and not applied')
  })
})
