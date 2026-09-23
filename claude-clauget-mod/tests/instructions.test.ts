import { describe, expect, test } from 'claude-code/testing'

import {
  hashOf,
  instructionLines,
  instructionsFrom,
  instructionsOf,
  paragraphsOf,
  pathKeyOf,
} from '../hooks/instructions'

const RULE =
  'Every commit carries the local git author alone, and no agent is ever named in the message or its trailers.'

describe('the instruction files (T18)', () => {
  test('two paragraphs identical but for their spaces are found', () => {
    const found = instructionsOf([
      { path: '/home/x/.claude/CLAUDE.md', kind: 'user', content: `# Mine\n\n${RULE}\n` },
      {
        path: '/work/CLAUDE.md',
        kind: 'project',
        content: `# Repo\n\n${RULE.replace(/ /g, '  ').replace('agent is', 'agent\n   is')}\n\nOther.`,
      },
    ])

    expect(found.duplicates).toHaveLength(1)
    expect(found.duplicates[0]?.places).toEqual(['/home/x/.claude/CLAUDE.md', '/work/CLAUDE.md'])
  })

  test('two paragraphs one word apart are not', () => {
    const found = instructionsOf([
      { path: '/a', kind: 'user', content: RULE },
      { path: '/b', kind: 'project', content: RULE.replace('alone', 'only') },
    ])

    expect(found.duplicates).toEqual([])
  })

  test('a short paragraph repeated — a heading, a fence — is not worth saying', () => {
    const found = instructionsOf([
      { path: '/a', kind: 'user', content: '## Style\n\n```' },
      { path: '/b', kind: 'project', content: '## Style\n\n```' },
    ])

    expect(found.duplicates).toEqual([])
  })

  test('the store keeps where and which tier, never the text', () => {
    const found = instructionsOf([
      { path: '/a', kind: 'user', content: RULE },
      { path: '/b', kind: 'project', content: RULE, parent: '/a' },
    ])

    expect(found.files).toEqual([
      { path: '/a', kind: 'user' },
      { path: '/b', kind: 'project', parent: '/a' },
    ])
    expect(JSON.stringify(found)).not.toContain('trailers.')
    expect(instructionsFrom(JSON.parse(JSON.stringify(found)))).toEqual(found)
    expect(instructionsFrom(null)).toEqual({ files: [], duplicates: [] })
  })

  test('paragraphs are split on blank lines, with or without carriage returns', () => {
    expect(paragraphsOf(`${RULE}\r\n\r\n${RULE}`, 10)).toHaveLength(2)
    expect(hashOf('a b')).toBe(hashOf('a b'))
    expect(hashOf('a b')).not.toBe(hashOf('a c'))
  })

  test('the report weighs each file by its path, whatever its spelling', () => {
    const found = instructionsOf([{ path: 'C:\\Users\\X\\CLAUDE.md', kind: 'user', content: RULE }])
    const lines = instructionLines(found, { [pathKeyOf('c:/users/x/claude.md')]: 1_234 })

    expect(lines[1]).toContain('1234 tok (est.)')
  })
})
