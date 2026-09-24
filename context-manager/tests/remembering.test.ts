import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { historyPath } from '../hooks/core/history'
import type { History, PatternEntry } from '../hooks/core/history'
import { bashAnswer } from './fixtures/register/bashAnswer'
import { managerRun } from './fixtures/register/managerRun'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'

const HOME = '/home/me'
const ID = 'execution:full-suite-after-each-edit'
const TURN_USAGE = { input_tokens: 20_000, output_tokens: 1_000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 1_000, model: 'claude-opus-4-6' }

// A path as the host hands it to a stub: the engine resolves it against the host's filesystem, so on Windows
// `/home/me/…` arrives as `C:\home\me\…`. Compared in POSIX form, without the drive.
const posix = (path: string): string => path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')

const FILE = posix(historyPath(HOME, SESSION.cwd))

const kept: PatternEntry = { kind: 'Claude keeps running the whole bun test suite', seen: 2, decision: 'keep', ignored: 0, savedMs: 0, savedChars: 0, byCode: false }

// A home directory and a filesystem held in memory: what the plugin reads, and every write it makes.
const disk = (on: On, files: Record<string, string> = {}): { files: Record<string, string>; writes: string[] } => {
  const world = { files: { ...files }, writes: [] as string[] }
  mock.env(on, { USERPROFILE: HOME })
  on('fs.exists', ($, e) => ({ value: posix(e.path) in world.files }))
  on('fs.read', ($, e) => {
    const text = world.files[posix(e.path)]
    return text === undefined ? { deny: 'no such file' } : { value: text }
  })
  on('fs.write', ($, e) => {
    world.files[posix(e.path)] = e.text
    world.writes.push(posix(e.path))
    return { value: undefined }
  })
  return world
}

const ignoredThrice: History = {
  sessions: [1, 2, 3].map(at => ({ id: `s${at}`, at, judgeRuns: 1, judgeTokens: 5_000, patterns: { [ID]: kept } })),
  unmuted: {},
  rules: {},
}

const turn = async ($: Engine, n: number): Promise<void> => {
  await $.turn.start({ text: 'go', turnId: `t${n}` })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: `t${n}`, reason: 'answer', usage: TURN_USAGE })
}

describe('the project\'s history, in a session', () => {
  test('a behaviour ignored in three sessions is muted from the start', async ($, on) => {
    startsManager(on)
    disk(on, { [FILE]: JSON.stringify(ignoredThrice) })

    await $.session.start(SESSION)

    expect((await $.command.run(managerRun('debug'))).text).toContain(`muted 1: ${ID}`)
  })

  test('a turn writes this session into the file, and a turn that changed nothing writes nothing', async ($, on) => {
    const world = startsManager(on)
    const fs = disk(on)
    on('tool.call', () => bashAnswer(100))

    await $.session.start(SESSION)
    await turn($, 1)
    await world.clock.settle()
    const written = JSON.parse(fs.files[FILE] ?? '{}') as History
    expect(written.sessions.map(s => s.id), 'the session is keyed by when it started').toEqual(['s0'])
    expect(world.store[`history:${SESSION.cwd}`]).toMatchObject({ sessions: 1 })

    // The timing file takes each call's duration; the history is what a turn that changed nothing leaves alone.
    const historyWrites = (): number => fs.writes.filter(path => path === FILE).length
    const writes = historyWrites()
    await turn($, 2)
    await world.clock.settle()
    expect(historyWrites(), 'nothing new to keep').toBe(writes)
  })

  test('/manager stats reads the project, this session included; unmute hears a behaviour again', async ($, on) => {
    const world = startsManager(on)
    const fs = disk(on, { [FILE]: JSON.stringify(ignoredThrice) })

    await $.session.start(SESSION)

    const stats = (await $.command.run(managerRun('stats'))).text
    expect(stats).toContain('ContextManager — this project, 4 sessions:')
    expect(stats).toContain('— 6× in 3 sessions · fixed 0 · ignored 3 [muted]')
    expect(stats).toContain('Audit: 3 runs · 15k tokens')

    expect((await $.command.run(managerRun('unmute reading:nothing'))).text).toBe('ContextManager: reading:nothing is not muted in this project')
    expect((await $.command.run(managerRun(`unmute ${ID}`))).text).toBe(`ContextManager: ${ID} will be reported again in this project`)
    expect((await $.command.run(managerRun('debug'))).text).toContain('muted 0 ')
    await world.clock.settle()
    expect((JSON.parse(fs.files[FILE] ?? '{}') as History).unmuted[ID], 'the file remembers when').toBeDefined()
  })

  test('without a home directory the session runs without a history, and says so when asked', async ($, on) => {
    startsManager(on)
    mock.env(on, {})

    await $.session.start(SESSION)

    expect((await $.command.run(managerRun('stats'))).text).toBe("ContextManager: no home directory to keep this project's history in")
  })
})
