/**
 * What a tool call did to a file, read off the call's own input: which file,
 * which way, and how many lines it moved.
 *
 * Two sources, and they answer with different certainty. A file tool names
 * its file in a field, so what it says is what happened. A shell command
 * names its files in an argument list the cockpit has to read, so what it
 * says is a reading — a careful one, and one that would rather miss a file
 * than invent one, since a tab that lists files Claude never opened is worse
 * than a tab that lists one fewer.
 *
 * Everything here is pure: a tool name, an input, a working directory in,
 * touches out. No `$`, so every rule is one a test can state in a line.
 */

import {
  BASH_LAST_WRITES,
  BASH_MAX_PATHS,
  BASH_PREFIXES,
  BASH_READERS,
  BASH_SCRIPT_FIRST,
  BASH_WRITERS,
  FILE_TOOLS,
} from '../names'

/**
 * One file a call touched, and what it did to it.
 */
export type Touch = {
  /**
   * The file, absolute and with forward slashes, whatever the host writes.
   */
  path: string

  /**
   * How the call touched it.
   */
  kind: 'read' | 'write'

  /**
   * The lines it put in, where the call's input says; 0 where it does not,
   * which is every shell command and every read.
   */
  added: number

  /**
   * The lines it took out, on the same terms.
   */
  removed: number
}

/**
 * Every file one finished tool call touched.
 *
 * @param tool the tool's name, as the call carries it
 * @param input the call's input, as it crossed
 * @param cwd the session's working directory, for the relative paths a shell
 *   command hands about
 * @param isReadingBash whether shell commands are read for files at all
 * @returns the touches, one per file, in the order the call named them
 */
export function touchesOf(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
  isReadingBash: boolean,
): readonly Touch[] {
  if (tool === 'Bash') {
    return isReadingBash ? bashTouches(textOf(input.command), cwd) : []
  }

  const kind = FILE_TOOLS[tool]
  const named = textOf(input.file_path) || textOf(input.notebook_path)

  if (!kind || named === '') {
    return []
  }

  const churn = churnOf(tool, input)

  return [{ path: resolveOf(cwd, named), kind, ...churn }]
}

/**
 * The lines a file tool's call put in and took out, as its own input says.
 *
 * A `Write` reports every line it wrote as added, since the call does not
 * carry what was there before: it is the size of what landed, not a diff. An
 * `Edit` that replaces every occurrence reports one occurrence, since the
 * count is in the file rather than in the call.
 *
 * @param tool the tool's name
 * @param input the call's input
 * @returns the lines in and the lines out
 */
export function churnOf(
  tool: string,
  input: Record<string, unknown>,
): { added: number; removed: number } {
  if (tool === 'Write') {
    return { added: linesOf(input.content), removed: 0 }
  }

  if (tool === 'Edit') {
    return {
      added: linesOf(input.new_string),
      removed: linesOf(input.old_string),
    }
  }

  if (tool === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : []

    return edits.reduce<{ added: number; removed: number }>(
      (sum, edit) => {
        const one = (edit ?? {}) as Record<string, unknown>

        return {
          added: sum.added + linesOf(one.new_string),
          removed: sum.removed + linesOf(one.old_string),
        }
      },
      { added: 0, removed: 0 },
    )
  }

  if (tool === 'NotebookEdit') {
    const isDeleting = textOf(input.edit_mode) === 'delete'
    const lines = linesOf(input.new_source)

    return isDeleting
      ? { added: 0, removed: lines }
      : { added: lines, removed: 0 }
  }

  return { added: 0, removed: 0 }
}

/**
 * Every file a shell command names, by what the command does with it.
 *
 * The command is cut at its separators, each piece read on its own: a
 * redirection writes its target, a known reader reads its operands, a known
 * writer writes them, and a command the table does not know names nothing.
 * An operand only counts as a file where it carries an extension, which
 * keeps a directory, a flag's value and a `sed` script out of the tab.
 *
 * A `cd` moves the directory the pieces after it spell their relative paths
 * against, since `cd sub && cat a.ts` reads `sub/a.ts` and crediting
 * `a.ts` would name a file that is not there. A `cd` this cannot follow — no
 * operand, `cd -`, a home or a glob — drops the relative paths after it
 * rather than rooting them somewhere they are not; the absolute ones stand.
 * A `cd` inside a subshell is not followed either, and the parentheses keep
 * its files out of the tab.
 *
 * @param command the command as the call carries it
 * @param cwd the directory the command started in, for its relative paths;
 *   empty leaves every path as the command line spelled it
 * @returns the touches, at most BASH_MAX_PATHS of them, write before read
 *   where one piece does both to the same file
 */
export function bashTouches(command: string, cwd = ''): readonly Touch[] {
  const found: Touch[] = []

  let base = cwd
  let isLost = false

  for (const piece of command.split(/\s*(?:&&|\|\||[;|\n])\s*/)) {
    const moved = cdOf(piece)

    if (moved !== null) {
      isLost = moved === ''
      base = isLost ? base : resolveOf(base, moved)

      continue
    }

    for (const touch of pieceTouches(piece)) {
      if (isLost && !isRooted(touch.path)) {
        continue
      }

      found.push({ ...touch, path: resolveOf(base, touch.path) })
    }
  }

  const byPath = new Map<string, Touch>()

  for (const touch of found) {
    const seen = byPath.get(touch.path)

    if (!seen) {
      byPath.set(touch.path, touch)
    } else if (seen.kind === 'read' && touch.kind === 'write') {
      byPath.set(touch.path, touch)
    }
  }

  return [...byPath.values()].slice(0, BASH_MAX_PATHS)
}

/**
 * The files one piece of a command line names, the piece already cut at its
 * separators.
 *
 * @param piece the piece
 * @returns its touches
 */
function pieceTouches(piece: string): readonly Touch[] {
  const written = [...piece.matchAll(/(?:^|\s)\d?>>?\s*([^\s|&;<>]+)/g)]
    .map(match => unquote(match[1] ?? ''))
    .filter(isFileLike)
    .map(path => touch(path, 'write'))

  const rest = piece.replace(/(?:^|\s)\d?>>?\s*[^\s|&;<>]+/g, ' ')
  const words = wordsOf(rest)
  const start = words.findIndex(
    word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && !isPrefix(word),
  )

  if (start < 0) {
    return written
  }

  const name = baseOf(words[start] ?? '')
  const after = words.slice(start + 1)
  const flags = after.filter(word => word.startsWith('-'))
  const operands = after.filter(word => !word.startsWith('-'))

  const isWriter =
    BASH_WRITERS.includes(name) ||
    (name === 'sed' && flags.some(flag => flag.startsWith('-i')))

  if (!isWriter && !BASH_READERS.includes(name)) {
    return written
  }

  const named = (
    BASH_SCRIPT_FIRST.includes(name) ? operands.slice(1) : operands
  ).filter(isFileLike)

  if (BASH_LAST_WRITES.includes(name) && named.length > 1) {
    return [
      ...written,
      ...named.slice(0, -1).map(path => touch(path, 'read')),
      touch(named[named.length - 1] ?? '', 'write'),
    ]
  }

  return [
    ...written,
    ...named.map(path => touch(path, isWriter ? 'write' : 'read')),
  ]
}

/**
 * Where a piece of a command line moves the working directory, where it is a
 * `cd` at all.
 *
 * @param piece the piece, already cut at its separators
 * @returns the directory it moves to, an empty string for a `cd` that cannot
 *   be followed, and null for a piece that is not one
 */
function cdOf(piece: string): string | null {
  const words = wordsOf(piece)
  const start = words.findIndex(
    word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && !isPrefix(word),
  )

  if (start < 0 || baseOf(words[start] ?? '') !== 'cd') {
    return null
  }

  const target = words.slice(start + 1).find(word => !word.startsWith('-')) ?? ''

  return target.startsWith('~') || /[*?$`()<>]/.test(target) ? '' : target
}

/**
 * Whether a path names where it is from the root, so no working directory
 * bears on it.
 *
 * @param path the path, as the command line spelled it
 * @returns whether it stands on its own
 */
const isRooted = (path: string): boolean =>
  path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)

/**
 * One touch of a shell command, which never knows its own churn.
 *
 * @param path the file
 * @param kind how it was touched
 * @returns the touch
 */
const touch = (path: string, kind: 'read' | 'write'): Touch => ({
  path,
  kind,
  added: 0,
  removed: 0,
})

/**
 * A command line's words, the quoted ones kept whole and unquoted.
 *
 * @param line the line
 * @returns its words
 */
const wordsOf = (line: string): readonly string[] =>
  (line.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map(unquote)

/**
 * A word with its surrounding quotes taken off.
 *
 * @param word the word
 * @returns the word inside
 */
const unquote = (word: string): string =>
  (word.startsWith('"') && word.endsWith('"')) ||
  (word.startsWith("'") && word.endsWith("'"))
    ? word.slice(1, -1)
    : word

/**
 * A command's own name, whatever path it was called through.
 *
 * @param word the command word
 * @returns its base name, without a Windows extension
 */
const baseOf = (word: string): string =>
  (word.split(/[\\/]/).pop() ?? word).replace(/\.(?:exe|cmd|bat)$/i, '')

/**
 * Whether a word is one a command hides behind rather than the command.
 *
 * @param word the word
 * @returns whether to keep looking
 */
const isPrefix = (word: string): boolean =>
  BASH_PREFIXES.includes(baseOf(word)) || word.startsWith('-')

/**
 * Whether an operand reads as a file rather than as a pattern, a number, a
 * directory or a glob.
 *
 * The test is an extension: `hooks/register.ts` passes, `hooks` does not,
 * `*.ts` does not, and neither does the `1,20p` of a `sed` script. It costs
 * the tab an extensionless `Makefile`, and it spares it a tab full of
 * fragments that were never files.
 *
 * @param word the operand
 * @returns whether to count it
 */
export const isFileLike = (word: string): boolean =>
  word !== '' &&
  !/[*?$`()<>]/.test(word) &&
  !word.startsWith('/dev/') &&
  /\.[A-Za-z0-9_]{1,8}$/.test(word)

/**
 * A path as the cockpit keeps it: absolute, with forward slashes, its `.`
 * and `..` steps walked out, so the file a tool named by its full path and
 * the one a command named from the working directory are one row.
 *
 * @param cwd the session's working directory
 * @param path the path as the call spelled it
 * @returns the path as the tab lists it
 */
export function resolveOf(cwd: string, path: string): string {
  const base = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const written = path.replace(/\\/g, '/')

  // On a Windows host a shell spells the drive from its own root; the file
  // tools spell it as the host does. Left apart, one file would hold two rows.
  const slashed = /^[A-Za-z]:\//.test(base) ? driveOf(written) : written

  const full =
    slashed.startsWith('/') || /^[A-Za-z]:\//.test(slashed) || base === ''
      ? slashed
      : `${base}/${slashed}`

  const isRooted = full.startsWith('/')
  const steps: string[] = []

  for (const step of full.split('/')) {
    if (step === '' || step === '.') {
      continue
    }

    if (step === '..' && steps.length > 0 && steps[steps.length - 1] !== '..') {
      steps.pop()

      continue
    }

    steps.push(step)
  }

  return `${isRooted ? '/' : ''}${steps.join('/')}`
}

/**
 * A path a shell on Windows spells from its own root (`/c/w/repo`) as the
 * host spells it (`C:/w/repo`); any other path is its own answer.
 *
 * @param path the path, its slashes already forward
 * @returns the path as the host spells it
 */
function driveOf(path: string): string {
  const match = /^\/([A-Za-z])(\/.*)?$/.exec(path)

  return match ? `${(match[1] ?? '').toUpperCase()}:${match[2] ?? '/'}` : path
}

/**
 * The lines a piece of text holds, an empty one holding none.
 *
 * @param text the text, where it is one
 * @returns its lines
 */
const linesOf = (text: unknown): number =>
  typeof text === 'string' && text !== '' ? text.split('\n').length : 0

/**
 * A field as text, where it is text and not empty.
 *
 * @param value the field
 * @returns the text, or an empty string
 */
const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : ''
