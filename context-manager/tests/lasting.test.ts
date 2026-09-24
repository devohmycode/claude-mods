import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { historyPath, parseHistory, staleRules, withRule } from '../hooks/core/history'
import type { History, SessionEntry } from '../hooks/core/history'
import { markedRules, previewOf, ruleText, withoutRule } from '../hooks/core/rules'
import type { Artifact } from '../hooks/core/types'
import { managerRun } from './fixtures/register/managerRun'
import { paneRender } from './fixtures/register/paneRender'
import { SESSION } from './fixtures/register/session'
import { startsManager } from './fixtures/register/startsManager'

const ID = 'reading:cm-reread-1a2b3c'
const CLAUDE_MD = `# Project\n\n## ContextManager\n- a rule a person wrote\n- Work from what you already read of api.ts. <!-- cm:${ID} -->\n- Filter logs first. <!-- cm:reading:cm-log-dump-9f8e7d -->\n`

const append: Artifact = {
  patternId: 'execution:cm-full-suite-aaaaaa', kind: 'claude-md', title: 'Targeted tests', path: '/work/CLAUDE.md',
  content: '\n## ContextManager\n- Run only the covering tests. <!-- cm:execution:cm-full-suite-aaaaaa -->\n', savingPct: 3, mode: 'append',
}

const session = (at: number, seen: number): SessionEntry => ({
  id: `s${at}`, at, judgeRuns: 0, judgeTokens: 0,
  patterns: seen === 0 ? {} : { [ID]: { kind: 'x', seen, decision: 'kill', ignored: 0, savedMs: 0, savedChars: 0, byCode: true } },
})

// Sessions at 1..n, the rule written during session `writtenIn`, and whether its behaviour turned up in each.
const historyOf = (seen: readonly number[], writtenIn: number): History => ({
  sessions: seen.map((n, at) => session(at + 1, n)),
  unmuted: {},
  rules: { [ID]: writtenIn + 0.5 },
})

describe('the rules ContextManager wrote', () => {
  test('a marked bullet is found by its id; a bullet a person wrote is never ours', ($, _on) => {
    expect(markedRules(CLAUDE_MD)).toEqual([
      { patternId: ID, text: 'Work from what you already read of api.ts.' },
      { patternId: 'reading:cm-log-dump-9f8e7d', text: 'Filter logs first.' },
    ])
    expect(ruleText(`- Filter logs first. <!-- cm:${ID} -->`), 'what Try sends has no marker').toBe('Filter logs first.')
  })

  test('removing one takes its bullet out and leaves every other line as it was', ($, _on) => {
    expect(withoutRule(CLAUDE_MD, ID)).toBe('# Project\n\n## ContextManager\n- a rule a person wrote\n- Filter logs first. <!-- cm:reading:cm-log-dump-9f8e7d -->\n')
  })
})

describe('Write, previewed', () => {
  test('an append shows the lines it adds, the heading only where the file has none', ($, _on) => {
    expect(previewOf(append, '# Project\n').added).toBe('\n## ContextManager\n- Run only the covering tests. <!-- cm:execution:cm-full-suite-aaaaaa -->\n')
    expect(previewOf(append, CLAUDE_MD).added).toBe('- Run only the covering tests. <!-- cm:execution:cm-full-suite-aaaaaa -->\n')
    expect(previewOf(append, null).duplicate).toBe(false)
  })

  test('the same marker, or the same rule typed differently, is a duplicate', ($, _on) => {
    expect(previewOf(append, `${CLAUDE_MD}- x <!-- cm:execution:cm-full-suite-aaaaaa -->\n`).duplicate).toBe(true)
    expect(previewOf(append, `${CLAUDE_MD}-   run only the COVERING tests.\n`).duplicate).toBe(true)
    expect(previewOf(append, `${CLAUDE_MD}- run the covering tests twice\n`).duplicate, 'a rule that merely differs is not one').toBe(false)
  })

  test('a whole-file write says it replaces a file, and a permission already allowed is a duplicate', ($, _on) => {
    const skill: Artifact = { ...append, kind: 'skill', path: '/work/.claude/skills/x/SKILL.md', content: 'body\n', mode: 'write' }
    expect(previewOf(skill, 'other\n')).toMatchObject({ duplicate: false, overwrites: true })
    expect(previewOf(skill, 'body\n')).toMatchObject({ duplicate: true, overwrites: false })
    const allow: Artifact = { ...append, kind: 'settings-allow', path: '/work/.claude/settings.json', content: 'Bash(bun test:*)', mode: 'merge-settings' }
    expect(previewOf(allow, JSON.stringify({ permissions: { allow: ['Bash(bun test:*)'] } })).duplicate).toBe(true)
    expect(previewOf(allow, null).duplicate).toBe(false)
  })
})

describe('rules that never fired', () => {
  const marked = [{ patternId: ID, text: 'Work from what you already read.' }]

  test('ten quiet sessions after it, and a one-off before it: offered', ($, _on) => {
    const quiet = [0, 3, ...Array.from({ length: 10 }, () => 0)]
    expect(staleRules(historyOf(quiet, 2), marked)).toEqual([{ patternId: ID, text: 'Work from what you already read.', sessions: 10 }])
  })

  test('fewer quiet sessions, a return, or a behaviour that was frequent before: kept', ($, _on) => {
    expect(staleRules(historyOf([3, ...Array.from({ length: 9 }, () => 0)], 1), marked), 'nine sessions is not ten').toEqual([])
    expect(staleRules(historyOf([3, ...Array.from({ length: 9 }, () => 0), 2], 1), marked), 'it came back').toEqual([])
    const working = [2, 4, 3, ...Array.from({ length: 10 }, () => 0)]
    expect(staleRules(historyOf(working, 3), marked), 'frequent before, gone since: the rule works').toEqual([])
  })

  test('a rule the history has no date for is left alone, and the date survives the file', ($, _on) => {
    expect(staleRules({ ...historyOf([0, 0], 1), rules: {} }, marked)).toEqual([])
    expect(parseHistory(JSON.stringify(withRule(historyOf([], 0), 'x', 42))).rules['x']).toBe(42)
  })
})

describe('lasting rules, in a session', () => {
  const HOME = '/home/me'
  const posix = (path: string): string => path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')

  const disk = (on: On, files: Record<string, string>): Record<string, string> => {
    const held = { ...files }
    mock.env(on, { USERPROFILE: HOME })
    on('fs.exists', ($, e) => ({ value: posix(e.path) in held }))
    on('fs.read', ($, e) => {
      const text = held[posix(e.path)]
      return text === undefined ? { deny: 'no such file' } : { value: text }
    })
    on('fs.write', ($, e) => {
      held[posix(e.path)] = e.text
      return { value: undefined }
    })
    return held
  }

  test('a stale rule is offered at the start, and Remove takes its bullet out of CLAUDE.md', async ($, on) => {
    const world = startsManager(on)
    const file = posix(historyPath(HOME, SESSION.cwd))
    const quiet = [0, 3, ...Array.from({ length: 10 }, () => 0)]
    const held = disk(on, { '/work/CLAUDE.md': CLAUDE_MD, [file]: JSON.stringify(historyOf(quiet, 2)) })
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return Box({})
    })

    await $.session.start(SESSION)
    await $.command.run(managerRun(''))
    const drawn = JSON.stringify(await $.ui.render(paneRender()))
    expect(drawn).toContain('Rules that never fired')

    await $.ui.press({ plugin: 'contextmanager', key: `stale:${ID}:remove` })
    await world.clock.settle()

    expect(held['/work/CLAUDE.md']).not.toContain(ID)
    expect(held['/work/CLAUDE.md']).toContain('- a rule a person wrote')
    expect(world.toasts).toContain('ContextManager: rule removed from /work/CLAUDE.md')
  })
})
