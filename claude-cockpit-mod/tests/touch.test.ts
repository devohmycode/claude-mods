import { describe, expect, test, tier } from 'claude-code/testing'

import { bashTouches, churnOf, resolveOf, touchesOf } from '../hooks/touch'

tier('user')

const CWD = '/w/repo'

describe('touch', () => {
  test('a file tool names its file, and its input says what it moved', () => {
    const [touch] = touchesOf(
      'Edit',
      {
        file_path: '/w/repo/a.ts',
        old_string: 'one\ntwo',
        new_string: 'one\ntwo\nthree\nfour',
      },
      CWD,
      true,
    )

    expect(touch).toEqual({
      path: '/w/repo/a.ts',
      kind: 'write',
      added: 4,
      removed: 2,
    })
  })

  test('a write reports what landed, and every edit of a MultiEdit counts', () => {
    expect(churnOf('Write', { content: 'a\nb\nc' })).toEqual({
      added: 3,
      removed: 0,
    })

    expect(
      churnOf('MultiEdit', {
        edits: [
          { old_string: 'a', new_string: 'a\nb' },
          { old_string: 'c\nd', new_string: 'c' },
        ],
      }),
    ).toEqual({ added: 3, removed: 3 })
  })

  test('a shell command that reads a file credits the read', () => {
    expect(bashTouches('cat hooks/register.ts')).toEqual([
      { path: 'hooks/register.ts', kind: 'read', added: 0, removed: 0 },
    ])
  })

  test("a sed script is not a file, and the file after it is", () => {
    expect(bashTouches("sed -n '1,20p' hooks/state.ts").map(one => one.path)).toEqual([
      'hooks/state.ts',
    ])

    expect(bashTouches("sed -n '/foo/,/bar/p' a.ts").map(one => one.path)).toEqual([
      'a.ts',
    ])
  })

  test('a redirection writes its target, whatever wrote to it', () => {
    expect(bashTouches('printf hi > notes/out.txt')).toEqual([
      { path: 'notes/out.txt', kind: 'write', added: 0, removed: 0 },
    ])

    expect(bashTouches('grep -n x a.ts >> b.log').map(one => one.kind)).toEqual([
      'write',
      'read',
    ])
  })

  test('a copy reads its source and writes its destination', () => {
    expect(bashTouches('cp a.ts b.ts')).toEqual([
      { path: 'a.ts', kind: 'read', added: 0, removed: 0 },
      { path: 'b.ts', kind: 'write', added: 0, removed: 0 },
    ])
  })

  test('sed -i writes the file it would otherwise have read', () => {
    expect(bashTouches("sed -i 's/a/b/' a.ts").map(one => one.kind)).toEqual([
      'write',
    ])
  })

  test('each piece of a command line is read on its own', () => {
    const paths = bashTouches('cat a.ts && rm b.ts | head c.ts').map(
      one => `${one.kind}:${one.path}`,
    )

    expect(paths).toEqual(['read:a.ts', 'write:b.ts', 'read:c.ts'])
  })

  test('what is not a file is left alone: a directory, a glob, a command', () => {
    expect(bashTouches('cat hooks')).toEqual([])
    expect(bashTouches('rm *.ts')).toEqual([])
    expect(bashTouches('npm run build')).toEqual([])
    expect(bashTouches('echo hi > /dev/null')).toEqual([])
  })

  test('one command touching a file both ways counts it as written', () => {
    expect(bashTouches('cat a.ts > a.ts')).toEqual([
      { path: 'a.ts', kind: 'write', added: 0, removed: 0 },
    ])
  })

  test('the shell is left alone where the person asked for it to be', () => {
    expect(touchesOf('Bash', { command: 'cat a.ts' }, CWD, false)).toEqual([])
  })

  test('a relative path and a full one are the same row', () => {
    expect(resolveOf(CWD, 'hooks/a.ts')).toBe('/w/repo/hooks/a.ts')
    expect(resolveOf(CWD, './hooks/../a.ts')).toBe('/w/repo/a.ts')
    expect(resolveOf(CWD, '/w/repo/hooks/a.ts')).toBe('/w/repo/hooks/a.ts')
  })

  test('a cd moves the directory the paths after it are read against', () => {
    expect(bashTouches('cd sub && cat a.ts', CWD).map(one => one.path)).toEqual([
      '/w/repo/sub/a.ts',
    ])

    expect(
      bashTouches('cd /w/other && head -3 x/y.ts', CWD).map(one => one.path),
    ).toEqual(['/w/other/x/y.ts'])

    // The cd of one command line does not outlive it.
    expect(bashTouches('cat a.ts', CWD).map(one => one.path)).toEqual([
      '/w/repo/a.ts',
    ])
  })

  test('a cd it cannot follow drops what is relative to it, and keeps what is not', () => {
    expect(bashTouches('cd - && cat a.ts', CWD)).toEqual([])
    expect(bashTouches('cd ~ && cat a.ts', CWD)).toEqual([])

    expect(
      bashTouches('cd - && cat /w/repo/a.ts', CWD).map(one => one.path),
    ).toEqual(['/w/repo/a.ts'])
  })

  test('the shell root of a windows host is the host spelling of it', () => {
    expect(
      bashTouches('cd /c/w/repo/sub && cat a.ts', 'C:/w/repo').map(
        one => one.path,
      ),
    ).toEqual(['C:/w/repo/sub/a.ts'])

    expect(resolveOf('C:/w/repo', '/c/w/repo/a.ts')).toBe('C:/w/repo/a.ts')

    // A session whose own directory is no drive is on a host where that path
    // is a path like any other.
    expect(resolveOf(CWD, '/c/w/repo/a.ts')).toBe('/c/w/repo/a.ts')
  })

  test('a windows path is one path, whichever slash wrote it', () => {
    expect(resolveOf('C:\\w\\repo', 'hooks\\a.ts')).toBe('C:/w/repo/hooks/a.ts')
    expect(resolveOf('C:\\w\\repo', 'C:\\w\\repo\\hooks\\a.ts')).toBe(
      'C:/w/repo/hooks/a.ts',
    )
  })
})
