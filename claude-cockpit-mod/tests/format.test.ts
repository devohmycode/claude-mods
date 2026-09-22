import { describe, expect, test, tier } from 'claude-code/testing'

import {
  churnParts,
  fitPath,
  fitText,
  limitName,
  relativeOf,
  toolText,
  untilText,
} from '../hooks/format'

tier('user')

describe('format', () => {
  test('the halves of a diff come apart, and still fill the column exactly', () => {
    const both = churnParts(34, 7, 10)

    expect(both.added).toBe('+34 ')
    expect(both.removed).toBe('-7')
    expect(`${both.blank}${both.added}${both.removed}`).toHaveLength(10)

    const one = churnParts(34, 0, 10)

    expect(one.added).toBe('+34')
    expect(one.removed).toBe('')
    expect(`${one.blank}${one.added}${one.removed}`).toHaveLength(10)

    // A file that was only read moved nothing, and says so with nothing.
    expect(churnParts(0, 0, 10)).toEqual({
      blank: ' '.repeat(10),
      added: '',
      removed: '',
    })
  })

  test('a built-in tool is drawn as it is called', () => {
    expect(toolText('Bash', 14)).toBe('Bash')
    expect(toolText('NotebookEdit', 8)).toBe('Noteboo…')
  })

  test('an MCP tool is its server and its own name', () => {
    expect(toolText('mcp__jina__primer', 14)).toBe('jina·primer')
  })

  test('where the pair does not fit, the server is cut and the tool kept whole', () => {
    expect(toolText('mcp__claude_ai_Linear__save_issue', 14)).toBe(
      '…ar·save_issue',
    )

    expect(toolText('mcp__claude_ai_Claude_Docs__batch', 14)).toBe(
      '…de_Docs·batch',
    )
  })

  test('two tools of one server read apart, which their engine names do not', () => {
    const save = toolText('mcp__claude_ai_Linear__save_issue', 14)
    const list = toolText('mcp__claude_ai_Linear__list_issues', 14)

    expect(save).not.toBe(list)

    // What the column drew before: the prefix every MCP tool shares.
    expect(fitText('mcp__claude_ai_Linear__save_issue', 14)).toBe(
      fitText('mcp__claude_ai_Linear__list_issues', 14),
    )
  })

  test('the servers of a real session, in the two columns that draw them', () => {
    // The tallies have fourteen cells, the last calls ten.
    expect(toolText('mcp__claude_ai_Tavily__tavily_search', 14)).toBe(
      'tavily_search',
    )
    expect(toolText('mcp__claude_ai_Tavily__tavily_search', 10)).toBe(
      'tavily_se…',
    )

    expect(toolText('mcp__jina__primer', 14)).toBe('jina·primer')
    expect(toolText('mcp__jina__primer', 10)).toBe('…na·primer')
  })

  test('a tool whose own name is too long is cut like any other text', () => {
    expect(toolText('mcp__claude-in-chrome__tabs_context_mcp', 14)).toBe(
      'tabs_context_…',
    )
  })

  test('a path is cut from its start, since its end tells two files apart', () => {
    expect(fitPath('/w/repo/hooks/tabs/tabs.tsx', 14)).toBe('…tabs/tabs.tsx')
  })

  test('a path is drawn from the root the session works in', () => {
    expect(relativeOf('/w/repo/hooks/tabs/tabs.tsx', '/w/repo')).toBe(
      'hooks/tabs/tabs.tsx',
    )

    // A root as the host spells it, with a trailing slash or a drive in
    // another case, is the same root; the row still shows the file's own case.
    expect(
      relativeOf(
        'C:/Users/Gildas/repo/hooks/Names.ts',
        'c:\\Users\\Gildas\\repo\\',
      ),
    ).toBe('hooks/Names.ts')

    // A file the root does not hold keeps its path: where it is says more
    // than the steps back out to it.
    expect(relativeOf('/etc/hosts', '/w/repo')).toBe('/etc/hosts')
    expect(relativeOf('/w/repo-two/a.ts', '/w/repo')).toBe('/w/repo-two/a.ts')

    // No root, nothing to draw against.
    expect(relativeOf('/w/repo/a.ts', '')).toBe('/w/repo/a.ts')
  })

  test('a plan window is named, whatever the account reports', () => {
    expect(limitName('five_hour')).toBe('5-hour')
    expect(limitName('seven_day')).toBe('Week')
    expect(limitName('spend_limit')).toBe('Spend')

    // A window this was not written against is drawn rather than dropped: an
    // account may carry one per model family, and the kind is the API's word.
    expect(limitName('seven_day_fable')).toBe('Week · fable')
    expect(limitName('weekly_something_else')).toBe('weekly something else')
  })

  test('what is left of a window is said in the fewest characters', () => {
    expect(untilText(14 * 60_000)).toBe('14m')
    expect(untilText(2 * 3_600_000 + 14 * 60_000)).toBe('2h14m')
    expect(untilText(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d4h')

    // A window whose reset is due says so rather than counting backwards.
    expect(untilText(0)).toBe('now')
    expect(untilText(-5_000)).toBe('now')
  })
})
