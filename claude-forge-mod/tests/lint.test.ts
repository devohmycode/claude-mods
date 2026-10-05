import { describe, expect, test } from 'claude-code/testing'

import { coreEvents, lintFile, lintPlugin, tokenize, typesVersion } from '../hooks'
import type { Rule } from '../hooks'

// The rules a source breaks, in the order they were found.
const rules = (text: string, path = '/p/hooks/register.ts', core?: Set<string>): Rule[] =>
  lintFile({ path, text }, core).findings.map(f => f.rule)

const CLEAN = `
import type { Register } from 'claude-code'
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'x', description: "it's fine" })
    return next(e)
  })
  on('tool.call', { tool: 'Bash' }, async ($: unknown, e, next) => next(e))
  on('tool.call', async function* ($, e, next) { yield* next(e) })
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return <Box><Text>don't stop {e.component}</Text></Box>
  })
}
`

describe('the lint, rule by rule', () => {
  test('a module that spells everything at the call site has nothing to say', () => {
    const report = lintFile({ path: '/p/hooks/register.tsx', text: CLEAN })
    expect(report.findings).toEqual([])
    expect(report.calls).toEqual(['$.command.register', '$.ui.resolve'])
    expect(report.hooked.map(h => `${h.event}:${h.hasMatcher}`)).toEqual([
      'session.start:false',
      'tool.call:true',
      'tool.call:false',
      'ui.render:true',
    ])
  })

  test('$ destructured, passed, returned or spread is bound to a name', () => {
    expect(rules(`on('a.b', ($, e, next) => { const { store } = $; return next(e) })`)).toEqual(['dollar-bound'])
    expect(rules(`on('a.b', ($, e, next) => { helper($, 1); return next(e) })`)).toEqual(['dollar-bound'])
    expect(rules(`on('a.b', ($) => $)`)).toEqual(['dollar-bound'])
    expect(rules(`on('a.b', ($) => f(...$))`)).toEqual(['dollar-bound'])
  })

  test('a computed noun or verb is refused, and a noun alone is bound', () => {
    expect(rules(`on('a.b', ($) => $[noun].get())`)).toEqual(['dollar-computed'])
    expect(rules(`on('a.b', ($) => $.store[verb]())`)).toEqual(['dollar-computed'])
    expect(rules(`on('a.b', ($) => { const s = $.store; return s })`)).toEqual(['noun-bound'])
  })

  test('a method referenced and not called is a warning', () => {
    const report = lintFile({ path: '/p/hooks/r.ts', text: `on('a.b', ($) => { list.forEach($.ui.toast) })` })
    expect(report.findings.map(f => [f.rule, f.severity])).toEqual([['method-unbound', 'warning']])
  })

  test('the event of on(...) and the name of $.env.get are literals', () => {
    expect(rules(`on(EVENT, hook)`)).toEqual(['event-computed'])
    expect(rules(`on(\`tool.\${x}\`, hook)`)).toEqual(['event-computed'])
    expect(rules(`on('a.b', async ($) => $.env.get(NAME))`)).toEqual(['env-computed'])
    expect(rules(`on('a.b', async ($) => $.env.get('HOME'))`)).toEqual([])
  })

  test('two hooks without a matcher on one event, across the files of one module', () => {
    const report = lintPlugin([
      { path: '/p/hooks/register.ts', text: `on('tool.call', a)\non('tool.call', { tool: 'Read' }, b)` },
      { path: '/p/hooks/more.ts', text: `\n\non('tool.call', c)` },
    ])
    expect(report.findings.map(f => `${f.rule} ${f.file}:${f.line}`)).toEqual(['hook-twice /p/hooks/more.ts:3'])
    expect(report.findings[0]?.message).toContain('/p/hooks/register.ts:1')
  })

  test('a plugin noun\'s event is a warning only when the engine\'s events are known', () => {
    const core = new Set(['tool.call', 'session.start'])
    expect(rules(`on('cockpit.show', h)`, undefined, core)).toEqual(['noun-event'])
    expect(rules(`on('tool.call', h)`, undefined, core)).toEqual([])
    expect(rules(`on('classic.Stop', h)`, undefined, core)).toEqual([])
    expect(rules(`on('telemetry.*', h)`, undefined, core)).toEqual([])
    expect(rules(`on('cockpit.show', h)`)).toEqual([])
  })

  test('a .catch that calls next without reading next.called', () => {
    expect(rules(`on('a.b', h).catch(($, e, next) => next(e))`)).toEqual(['catch-next'])
    expect(rules(`on('a.b', h).catch(($, e, next) => (next.called ? undefined : next(e)))`)).toEqual([])
    expect(rules(`promise.catch(() => undefined)`)).toEqual([])
  })

  test('$.config.set is a warning unless the lines before compare first', () => {
    expect(rules(`on('a.b', async ($) => { await $.config.set({ key: 'k', value: v }) })`)).toEqual(['config-reload'])
    const guarded = `on('a.b', async ($) => {\n  if (current === v) return\n  await $.config.set({ key: 'k', value: v })\n})`
    expect(rules(guarded)).toEqual([])
  })

  test('in a test, only the delegated register is judged', () => {
    const path = '/p/tests/x.test.ts'
    expect(rules(`test('t', { plugins: [{ name: 'p', register: on => register(on, options) }] }, async ($, on) => { on('a.b', h); on('a.b', h) })`, path)).toEqual(['register-delegated'])
    expect(rules(`const kept = $.turn.step`, path)).toEqual([])
  })
})

describe('the tokenizer', () => {
  test('an apostrophe in JSX text does not open a string', () => {
    const tokens = tokenize(`<Text>it's {$.ui.x()}</Text>\nconst a = 'b'`)
    expect(tokens.filter(t => t.kind === 'string').map(t => t.text)).toEqual(['b'])
    expect(tokens.at(-1)?.line).toBe(2)
  })

  test('a regex literal and a comment hide what they hold', () => {
    const tokens = tokenize(`const r = /\\$\\[x]/ // $[y]\n/* $ */ f()`)
    expect(tokens.filter(t => t.text === '$')).toEqual([])
  })
})

describe('the declaration file', () => {
  const TYPES = [
    '// Written by Claude Code 2.1.286.',
    '  export type EngineEventOf = {',
    '      /** doc */',
    "      'tool.call': ToolCallInput;",
    "      'session.start'?: SessionStartInput;",
    '  };',
    '  export type NounEventOf = {',
    "      'cockpit.show': X;",
    '  };',
    '  export type OpEventOf = {',
    "      'model.complete': ModelCompleteRequest;",
    '  };',
  ].join('\n')

  test('names the engine\'s events and not a plugin noun\'s', () => {
    expect([...coreEvents(TYPES)].sort()).toEqual(['model.complete', 'session.start', 'tool.call'])
  })

  test('says which build wrote it', () => {
    expect(typesVersion(TYPES)).toBe('2.1.286')
    expect(typesVersion('// nothing')).toBeUndefined()
  })
})
