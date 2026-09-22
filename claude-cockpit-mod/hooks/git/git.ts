/**
 * What git makes of the files the Files tab lists, read off one
 * `git status --porcelain`.
 *
 * The tab already knows what Claude did to a file this session. What it does
 * not know is whether any of that is still there — an edit that was reverted,
 * a file that was already dirty before the session opened, a new file nothing
 * has staged yet. That is git's to say, and one command says it for every
 * file at once.
 *
 * Pure: text in, a lookup out.
 */

/**
 * Git's reading of every file it has something to say about, keyed by the
 * absolute path in lower case, since the tab has to match paths a host may
 * spell in either case.
 *
 * The value is the porcelain code with its spaces kept — `' M'` for a change
 * nothing has staged, `'M '` for a staged one, `'??'` for a file git does not
 * track — so a caller can read the staged half and the working half apart.
 *
 * @param stdout what `git status --porcelain` wrote
 * @param root the repository's root, absolute
 * @returns the lookup, empty where git said nothing
 */
export function statusesOf(
  stdout: string,
  root: string,
): ReadonlyMap<string, string> {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const found = new Map<string, string>()

  for (const line of stdout.split('\n')) {
    if (line.length < 4) {
      continue
    }

    const code = line.slice(0, 2)
    const named = line.slice(3)

    // A rename carries where it came from and where it went; the tab lists
    // files as they are now, so the arrow's right side is the row it marks.
    const path = named.includes(' -> ')
      ? (named.split(' -> ').pop() ?? named)
      : named

    const clean = unquote(path.trim())

    if (clean === '') {
      continue
    }

    found.set(`${base}/${clean}`.toLowerCase(), code)
  }

  return found
}

/**
 * The one letter a status code draws as, and what it means: the working
 * tree's letter where the file differs from the index, the index's where it
 * does not, since the change on disk is the one the person is looking at.
 *
 * @param code the porcelain code, two characters
 * @returns the letter, or null for a code that says nothing
 */
export function letterOf(code: string | null): string | null {
  if (code === null || code.trim() === '') {
    return null
  }

  if (code === '??') {
    return '?'
  }

  const staged = code[0] ?? ' '
  const worktree = code[1] ?? ' '

  return worktree !== ' ' ? worktree : staged
}

/**
 * Whether a code says the change is staged, which the tab draws in full
 * rather than dimmed.
 *
 * @param code the porcelain code
 * @returns whether the index holds the change
 */
export const isStaged = (code: string | null): boolean =>
  code !== null && code !== '??' && (code[0] ?? ' ') !== ' '

/**
 * A path as git quotes one that holds a space or a byte it would rather
 * escape, with the quotes taken off.
 *
 * @param path the path as the line spells it
 * @returns the path inside
 */
const unquote = (path: string): string =>
  path.startsWith('"') && path.endsWith('"') && path.length > 1
    ? path.slice(1, -1).replace(/\\(.)/g, '$1')
    : path
