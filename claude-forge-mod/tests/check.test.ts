import { describe, expect, test } from 'claude-code/testing'

import { compareInventory, formatReport, join, parseTests, parseTsc, parseValidate, resolve, splitList, upward } from '../hooks'
import type { PluginReport } from '../hooks'

const VALIDATE = `Validating plugin manifest: C:\\p\\.claude-plugin\\plugin.json

  ❯ ./register.ts hooks: engine.create, session.start, ui.render{component=Pane, requestId=?}, command.run{command=x}
  ❯ ./register.ts calls: $.clock.every, $.command.register, $.ui.open
  ❯ ./register.ts env writes: nothing

✔ Validation passed
`

describe('the paths', () => {
  test('join speaks forward slashes and resolve keeps an absolute path', () => {
    expect(join('C:\\a\\', 'b', 'c/')).toBe('C:/a/b/c')
    expect(resolve('C:/repo', 'claude-x-mod')).toBe('C:/repo/claude-x-mod')
    expect(resolve('C:/repo', '')).toBe('C:/repo')
    expect(resolve('/home/me', '/tmp/p')).toBe('/tmp/p')
  })

  test('upward climbs to the root and stops there', () => {
    expect(upward('C:/a/b')).toEqual(['C:/a/b', 'C:/a', 'C:/'])
    expect(upward('/a/b')).toEqual(['/a/b', '/a'])
  })
})

describe('reading what the host commands printed', () => {
  test('validate: the events without their matchers, the calls, and a pass', () => {
    const seen = parseValidate(VALIDATE, 0)
    expect(seen.isPassed).toBe(true)
    expect(seen.hooks).toEqual(['engine.create', 'session.start', 'ui.render', 'command.run'])
    expect(seen.calls).toEqual(['$.clock.every', '$.command.register', '$.ui.open'])
    expect(splitList('a{x=1, y=2}, b')).toEqual(['a{x=1, y=2}', 'b'])
  })

  test('validate: the reason of a refusal, without its banners', () => {
    const out = '✘ Found 1 error:\n\n  ❯ modules../register.ts: p: compiled line 4 `const { command } = $;`: $ itself is bound to a name\n\n✘ Validation failed\n'
    const seen = parseValidate(out, 1)
    expect(seen.isPassed).toBe(false)
    expect(seen.problems).toEqual(['❯ modules../register.ts: p: compiled line 4 `const { command } = $;`: $ itself is bound to a name'])
  })

  test('validate: a refusal is a failure whatever the exit status says', () => {
    const seen = parseValidate('✘ hooks/register.ts: $ itself is bound to a name\n', 1)
    expect(seen.isPassed).toBe(false)
    expect(seen.problems).toEqual(['✘ hooks/register.ts: $ itself is bound to a name'])
  })

  test('tsc and plugin test', () => {
    expect(parseTsc('x/hooks/a.ts(3,5): error TS2322: no\nfine\n')).toEqual(['x/hooks/a.ts(3,5): error TS2322: no'])
    const tested = parseTests('(pass) a > b [1.2ms]\n(fail) a > c [3.40ms]\n\n 1 pass\n 1 fail\nRan 2 tests across 1 files.')
    expect(tested).toEqual({ pass: 1, fail: 1, failures: ['a > c'] })
  })
})

describe('the inventory', () => {
  const source = (events: string[], calls: string[]): PluginReport => ({
    findings: [],
    hooked: events.map(event => ({ event, hasMatcher: false, file: 'f', line: 1 })),
    calls,
  })

  test('what the source spells and the engine lists agree', () => {
    const diff = compareInventory(source(['session.start', 'command.run'], ['$.command.register', '$.ui.open']), parseValidate(VALIDATE, 0))
    expect(diff.isBroken).toBe(false)
    expect(diff.lines).toEqual(['· reached through a captured engine, not spelled $.: $.clock.every'])
  })

  test('an event or a call the engine did not see is a failure', () => {
    const diff = compareInventory(source(['turn.complete'], ['$.store.get']), parseValidate(VALIDATE, 0))
    expect(diff.isBroken).toBe(true)
    expect(diff.lines.slice(0, 2)).toEqual([
      '✘ the source hooks "turn.complete", validate does not list it',
      '✘ the source calls $.store.get, validate does not list it',
    ])
  })
})

describe('the report', () => {
  test('names the failed steps and cuts long ones', () => {
    const text = formatReport('C:/p', [
      { name: 'lint', status: 'ok', summary: '3 files', lines: [] },
      { name: 'tsc', status: 'fail', summary: '14 type errors', lines: Array.from({ length: 14 }, (_, i) => `e${i}`) },
    ])
    expect(text.split('\n')[0]).toBe('forge check C:/p: tsc failed')
    expect(text).toContain('✘ tsc       14 type errors')
    expect(text).toContain('    … 2 more')
  })
})
