import { describe, expect, test, tier } from 'claude-code/testing'

import { isStaged, letterOf, statusesOf } from '../hooks/git'

tier('user')

const ROOT = '/w/repo'

describe('git', () => {
  test('a porcelain line becomes an absolute path and its code', () => {
    const statuses = statusesOf(' M hooks/a.ts\n?? new.ts\n', ROOT)

    expect(statuses.get('/w/repo/hooks/a.ts')).toBe(' M')
    expect(statuses.get('/w/repo/new.ts')).toBe('??')
  })

  test('a rename is marked where the file is now, not where it was', () => {
    const statuses = statusesOf('R  old.ts -> new.ts\n', ROOT)

    expect(statuses.has('/w/repo/old.ts')).toBe(false)
    expect(statuses.get('/w/repo/new.ts')).toBe('R ')
  })

  test('a quoted path is unquoted, and lookups ignore case', () => {
    const statuses = statusesOf(' M "a file.ts"\n M Hooks/B.ts\n', ROOT)

    expect(statuses.get('/w/repo/a file.ts')).toBe(' M')
    expect(statuses.get('/w/repo/hooks/b.ts')).toBe(' M')
  })

  test('the letter is the working tree where it has one, the index else', () => {
    expect(letterOf(' M')).toBe('M')
    expect(letterOf('A ')).toBe('A')
    expect(letterOf('MM')).toBe('M')
    expect(letterOf('??')).toBe('?')
    expect(letterOf('  ')).toBeNull()
    expect(letterOf(null)).toBeNull()
  })

  test('a staged change says so, an untracked file does not', () => {
    expect(isStaged('A ')).toBe(true)
    expect(isStaged(' M')).toBe(false)
    expect(isStaged('??')).toBe(false)
    expect(isStaged(null)).toBe(false)
  })

  test('what git did not say about, it said nothing about', () => {
    expect(statusesOf('', ROOT).size).toBe(0)
    expect(statusesOf('##', ROOT).size).toBe(0)
  })
})
