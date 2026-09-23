import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sessionKeyOf } from '../hooks/keep'

tier('user')

/**
 * One line the mod wrote, as the `ui.log` beneath it saw it.
 */
type Logged = {
  text: string
  to: string
}

/**
 * What a request cost, in the shape the stop chunk carries.
 *
 * @param over the counters this test is about
 * @returns the usage
 */
const usageOf = (
  over: Partial<{
    model: string
    input: number
    output: number
    read: number
    write: number
  }> = {},
) => ({
  model: over.model ?? 'claude-opus-5',
  input_tokens: over.input ?? 400,
  output_tokens: over.output ?? 300,
  cache_read_input_tokens: over.read ?? 120_000,
  cache_creation_input_tokens: over.write ?? 1_500,
})

/**
 * Answers every call the mod makes on the world beneath it, so a test says
 * only what it is about.
 *
 * @param on the test's registrar, whose hooks sit beneath the plugin
 * @param store the plugin's store: what it holds before the session starts,
 *   and where its writes land, so a test can seed a reload and read back what
 *   a turn kept
 * @param logs the lines the mod wrote, with the sink each went to
 * @param files what the mod wrote to disk, by path
 * @returns the clock beneath the plugin, for a test that has to let a wait
 *   come due
 */
function world(
  on: Parameters<typeof mock.clock>[0],
  store: Record<string, unknown> = {},
  logs: Logged[] = [],
  files: Record<string, string> = {},
): MockClock {
  const clock = mock.clock(on)

  mock.env(on, { USERPROFILE: '/home/x', HOME: '/home/x' })

  // Hand-rolled rather than `mock.store`, which keeps its own object: these
  // tests need to read what the mod wrote.
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
    files[e.path] = e.text

    return { value: undefined }
  })

  on('ui.log', (_$, e) => {
    logs.push({ text: e.text, to: e.to })

    return { value: undefined }
  })

  on('session.id', () => ({ value: 's-1' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  return clock
}

/**
 * What the engine beneath answers the next request with; a test moves it
 * between two steps to say that something changed under the session.
 */
type Answer = { chunks: readonly Record<string, unknown>[] }

/**
 * The bottom of the chain for a model request: the chunks the engine would
 * stream, and the result it would return.
 *
 * Registered once, before the test's first call on `$` — the hooks beneath
 * the plugins go in as a module's do, in `register` — so what varies between
 * two steps is the answer it reads, not the hook.
 *
 * @param on the test's registrar
 * @param answer what to stream, the stop chunk included
 */
function responds(on: On, answer: Answer): void {
  on('turn.step', async function* (_$, e) {
    for (const chunk of answer.chunks) {
      yield chunk as never
    }

    const stop = answer.chunks.find(chunk => chunk.kind === 'stop')

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use',
      usage: (stop?.usage ?? null) as never,
    }
  })
}

/**
 * One step's worth of chunks: a tool call, then the stop that carries what it
 * cost.
 *
 * @param usage what the request cost
 * @returns the chunks
 */
const streamOf = (usage: ReturnType<typeof usageOf>) => [
  { kind: 'tool', index: 0, id: 'tu-1', name: 'Read' },
  { kind: 'stop', stopReason: 'tool_use', usage },
]

/**
 * Runs one model request through the plugin and hands back what came up.
 *
 * @param $ the test's engine
 * @param input the step, `turnId` and `index` apart from the defaults
 * @returns the chunks that reached the top, in order
 */
async function stepped(
  $: { turn: { step: (input: never) => AsyncIterable<unknown> & { result: Promise<unknown> } } },
  input: Record<string, unknown>,
): Promise<unknown[]> {
  const stream = $.turn.step({
    model: 'claude-opus-5',
    messageCount: 12,
    ...input,
  } as never)

  const seen: unknown[] = []

  for await (const chunk of stream) {
    seen.push(chunk)
  }

  await stream.result

  return seen
}

/**
 * The session's record as the store holds it.
 *
 * @param store the store
 * @returns the record
 */
const keptIn = (store: Record<string, unknown>) =>
  store[sessionKeyOf('s-1')] as
    | {
        ledger: {
          steps: { index: number; agentId: string | null }[]
          main: { steps: number; cacheRead: number; output: number }
          agents: { steps: number; output: number }
          turns: number
          misses: { miss: { cause: string } }[]
        }
        spend: { shownChars: number; dispatches: number }
      }
    | undefined

/**
 * A plugin of somebody else's, which asks for an invalidation as a turn ends.
 *
 * It is here because the test's own `$` dispatches events and does not hold
 * the nouns: an invalidation has to come from a hook, which is also where it
 * comes from in a real session.
 */
const GUEST = {
  name: 'guest',
  register: (on: On) => {
    on('turn.complete', async ($, e, next) => {
      await $.ui.invalidate('tool.describe')

      return next(e)
    })
  },
}

/**
 * What a turn's end carries.
 *
 * @param over what this test is about
 * @returns the event's input
 */
const ending = (over: Record<string, unknown> = {}) => ({
  answer: 'done',
  durationMs: 1_200,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...over,
})

describe('the journal', () => {
  test('the stop chunk lands on the journal, and every chunk passes through as it came', async ($, on) => {
    const store: Record<string, unknown> = {}
    const logs: Logged[] = []
    const chunks = streamOf(usageOf())

    world(on, store, logs)
    responds(on, { chunks })

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    const seen = await stepped($, { turnId: 't1', index: 0 })

    // The relay changed nothing: a hook that gathered the response and yielded
    // it whole would have changed what the person watched arrive.
    expect(seen).toEqual(chunks)

    // A step is a step; the record is a turn's work.
    expect(keptIn(store)).toBeUndefined()

    await $.turn.complete(ending())

    const kept = keptIn(store)

    expect(kept?.ledger.main.steps).toBe(1)
    expect(kept?.ledger.main.cacheRead).toBe(120_000)
    expect(kept?.ledger.main.output).toBe(300)
    expect(kept?.ledger.turns).toBe(1)
  })

  test('a subagent’s step is counted on its own side, and its run is not a turn', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, store)
    const answer = { chunks: streamOf(usageOf({ output: 50 })) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0, agentId: 'a1' })
    await $.turn.complete(ending({ agentId: 'a1' }))
    await stepped($, { turnId: 't1', index: 1 })
    await $.turn.complete(ending())

    const kept = keptIn(store)

    expect(kept?.ledger.agents.steps).toBe(1)
    expect(kept?.ledger.agents.output).toBe(50)
    expect(kept?.ledger.main.steps).toBe(1)
    expect(kept?.ledger.turns).toBe(1)
  })

  test('the journal is written to disk as well, the session’s file and the counters', async ($, on) => {
    const files: Record<string, string> = {}

    world(on, {}, [], files)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    const written = Object.keys(files)

    // Two files, whose paths the engine resolved to this platform's own
    // spelling: the session's journal, and the machine's counters beside it.
    const slashed = written.map(path => path.split('\\').join('/'))
    const journal = written[slashed.findIndex(path => path.endsWith('.claude/clauget/s-1.json'))]

    expect(written).toHaveLength(2)
    expect(files[journal ?? '']).toContain('"turns": 1')
    expect(slashed.some(path => path.endsWith('.claude/clauget/usage.json'))).toBe(true)
  })
})

describe('the detector', () => {
  test('a model that changed under the session is named at the request it cost', async ($, on) => {
    const logs: Logged[] = []

    world(on, {}, logs)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })

    // The whole prefix, written again, on another model.
    answer.chunks = streamOf(usageOf({ model: 'claude-haiku-4-5-20251001', read: 0, write: 120_000 }))

    await stepped($, { turnId: 't1', index: 1 })

    const named = logs.find(line => line.text.includes('model changed'))

    expect(named?.text).toContain('cache miss')
    expect(named?.text).toContain('120k')
    expect(named?.to).toBe('transcript')
  })

  test('an ordinary step is never flagged', async ($, on) => {
    const logs: Logged[] = []

    world(on, {}, logs)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await stepped($, { turnId: 't1', index: 1 })

    expect(logs.filter(line => line.text.includes('cache miss'))).toHaveLength(0)
  })

  test(
    'an invalidation somebody else asked for is the cause of the next miss',
    { plugins: [GUEST] },
    async ($, on) => {
      const logs: Logged[] = []

      world(on, {}, logs)
      on('ui.invalidate', () => ({ value: undefined }))
      const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      await stepped($, { turnId: 't1', index: 0 })

      // The guest invalidates as the turn ends, the way another plugin would.
      await $.turn.complete(ending())

      answer.chunks = streamOf(usageOf({ read: 0, write: 120_000 }))

      await stepped($, { turnId: 't2', index: 0 })

      expect(logs.some(line => line.text.includes('invalidation'))).toBe(true)
    },
  )
})

describe('the ticket', () => {
  test('a turn writes two lines, the engine’s figures and the mod’s own', async ($, on) => {
    const logs: Logged[] = []

    world(on, {}, logs)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    const turn = logs.find(line => line.text.includes('clauget · turn'))
    const mod = logs.find(line => line.text.includes('clauget · mod'))

    expect(turn?.text).toContain('1 steps')
    expect(turn?.text).toContain('(engine)')
    expect(turn?.to).toBe('transcript')
    expect(mod?.text).toContain('nothing shown to the model')
    expect(mod?.text).toContain('(counted)')
  })

  test('the step lines stay out of the transcript', async ($, on) => {
    const logs: Logged[] = []

    world(on, {}, logs)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })

    expect(logs.every(line => line.to === 'debug')).toBe(true)
    expect(logs.some(line => line.text.includes('clauget · step 0'))).toBe(true)
  })

  test('what the mod wrote, it wrote nowhere the model reads', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, store)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    // The one figure that would quietly stop being true if a later fiche put
    // a line of `context` on a tool result.
    expect(keptIn(store)?.spend.shownChars).toBe(0)
    expect(keptIn(store)?.spend.dispatches).toBeGreaterThan(0)
  })
})

describe('what it picks back up', () => {
  test('a module rebuilt mid-session finds its own counters again', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, store)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    const kept = keptIn(store)

    expect(kept?.ledger.main.steps).toBe(1)

    // What a reload would find: the record is the session, not the memory.
    expect(kept?.ledger.turns).toBe(1)
    expect(kept?.spend.dispatches).toBeGreaterThan(0)
  })

  test('a record it cannot read starts the session empty and says so', async ($, on) => {
    const logs: Logged[] = []
    const store: Record<string, unknown> = { [sessionKeyOf('s-1')]: { version: 99, junk: true } }

    world(on, store, logs)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    expect(logs.some(line => line.text.includes('state unreadable'))).toBe(true)

    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    expect(keptIn(store)?.ledger.main.steps).toBe(1)
  })

  test('the records of older sessions are dropped, and nobody else’s key is', async ($, on) => {
    const store: Record<string, unknown> = {
      'cockpit.session.old': { keep: true },
      'clauget.session.a': { version: 1 },
      'clauget.session.b': { version: 1 },
      'clauget.session.c': { version: 1 },
      'clauget.session.d': { version: 1 },
      'clauget.session.e': { version: 1 },
      'clauget.session.f': { version: 1 },
      'clauget.session.g': { version: 1 },
      'clauget.session.h': { version: 1 },
      'clauget.session.i': { version: 1 },
    }

    world(on, store)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    expect(store['cockpit.session.old']).toBeDefined()
    expect(store['clauget.session.a']).toBeUndefined()
    expect(Object.keys(store).filter(key => key.startsWith('clauget.session.')).length).toBe(7)
  })
})

describe('with no cockpit under it', () => {
  test('the session starts, the tab is simply not there, and the journal runs', async ($, on) => {
    const store: Record<string, unknown> = {}

    world(on, store)
    const answer = { chunks: streamOf(usageOf()) }

    responds(on, answer)

    // No plugin provides `$.cockpit` here: the call on it rejects, the mod
    // catches, and everything that does not need a pane goes on.
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await stepped($, { turnId: 't1', index: 0 })
    await $.turn.complete(ending())

    expect(keptIn(store)?.ledger.main.steps).toBe(1)
  })
})

describe('on tool.call, with the manifest as it ships', () => {
  test('the cap is off: a long Bash result goes up whole, and nothing is logged', async ($, on) => {
    const logs: Logged[] = []
    const stdout = Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join('\n')
    const record = { stdout, stderr: '', interrupted: false }

    world(on, {}, logs)
    on('tool.call', () => ({ result: record }))

    const got = await $.tool.call({ tool: 'Bash', command: 'seq 5000' })

    expect(got.result).toEqual(record)
    expect(logs.filter(line => line.text.includes('capped'))).toEqual([])
  })

  test('a refusal beneath goes up as a refusal', async ($, on) => {
    world(on)
    on('tool.call', () => ({ deny: 'not here' }))

    expect(await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })).toEqual({ deny: 'not here' })
  })
})
