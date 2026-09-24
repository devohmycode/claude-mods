import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { managerRun } from './fixtures/register/managerRun'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'

// The cache a step writes, by the order the test sends them in; the core answers every step with it.
const stepsAnswer = (on: On, writes: number[]): void => {
  let at = 0
  on('turn.step', async function* (_$, e) {
    const cache = writes[at] ?? 1_000
    at += 1
    const usage = { model: e.model, input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 1_000, cache_creation_input_tokens: cache }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage } as never
  })
}

// One step of the main loop, or of a subagent's when `agentId` is given, drained as the engine drains it.
const step = async ($: Engine, index: number, effort: string, agentId?: string): Promise<void> => {
  const args = { turnId: 't1', index, model: 'claude-opus-5-5', effort, messageCount: 3, ...(agentId === undefined ? {} : { agentId }) }
  const stream = $.turn.step(args as never)
  for await (const _chunk of stream) {
    // drained
  }
  await stream.result
}

describe('the detectors, in a session', () => {
  test('three reads of one unchanged file make a card with no fork of the model', async ($, on) => {
    startsManager(on)
    let forks = 0
    on('model.fork', () => {
      forks += 1
      return { value: { isAnswered: false, reason: 'nothing-to-fork' } } as never
    })
    on('tool.call', () => ({ result: { type: 'text', file: {} }, text: 'x'.repeat(2_000) }))

    await $.session.start(SESSION)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    for (const pattern of ['a', 'b']) {
      await $.tool.call({ tool: 'Read', file_path: '/src/api.ts' })
      await $.tool.call({ tool: 'Grep', pattern, path: '/src' })
    }
    await $.tool.call({ tool: 'Read', file_path: '/src/api.ts' })

    const debug = (await $.command.run(managerRun('debug'))).text
    expect(debug).toMatch(/found by code 1: reading:cm-reread-[0-9a-f]{6} · by the judge 0/)
    expect(debug).toContain('cards 1')
    expect(forks, 'the code needed no model to say it').toBe(0)
  })

  test('two switches of effort in the main loop make the prefix card; a subagent\'s steps are its own', async ($, on) => {
    startsManager(on)
    stepsAnswer(on, [1_000, 1_000, 40_000, 1_000, 45_000, 1_000])

    await $.session.start(SESSION)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await step($, 0, 'high')
    await step($, 1, 'high')
    await step($, 2, 'low')
    await step($, 3, 'medium', 'agent-7')
    await step($, 4, 'high')
    await step($, 5, 'high')

    const debug = (await $.command.run(managerRun('debug'))).text
    expect(debug).toContain('prefix claude-opus-5-5/high · switches 2 (effort high→low @ 1, effort low→high @ 1)')
    expect(debug, 'each switch less the steady 1k').toContain('extra cache 83000 tokens')
    expect(debug).toContain('found by code 1: environment:cm-prefix-effort')
    expect(debug).toContain('cards 1')
  })
})
