/**
 * The Apply lever: rewriting the calls that carry a behaviour a person chose to correct.
 *
 * Off unless the `apply` row of `/config` is on, and then only for a pattern whose card was applied. It rewrites
 * the call's input before it runs — never a result already produced — so the shorter output comes from the source
 * and nothing is trimmed. Two rewrites to start with, both tied to a detector: the whole suite after a one-file
 * edit becomes that file's tests, and a whole log read becomes its tail. In doubt, nothing is rewritten.
 *
 * Pure: whether and how. The register runs the call, adds the note, and watches what Claude does next.
 */

import { say } from '../say'
import { collapseWs } from './text'
import { APPLY_FULL_EVERY, LOG_TAIL_LINES, MAIN_AGENT } from './types'
import type { Pattern, State } from './types'

const SUITE = /^[a-z-]+:cm-full-suite-[0-9a-f]{6}$/
const LOG = /^[a-z-]+:cm-log-dump-[0-9a-f]{6}$/

// Runners that pass a path to the test tool only after `--`.
const DASHED = /^(?:npm|pnpm|yarn)(?: run)? test$/

// A command that is one command: no pipe, no chain, no redirect, no substitution.
const PLAIN = /^[^|&;<>`$()]+$/

// `cat <file>.log`, the path bare or quoted.
const CAT_LOG = /^cat\s+("[^"]+\.log"|'[^']+\.log'|[^\s"']+\.log)$/

// A test file already: its own tests are itself.
const IS_TEST = /(?:\.test\.|\.spec\.|(?:^|\/)test_[^/]+\.py$)/

/**
 * Whether a pattern has a rewrite: one of the two detectors it is tied to.
 *
 * @param p the pattern
 * @returns true for the whole-suite and the whole-log patterns
 */
export const isApplicable = (p: Pattern): boolean => p.signature !== null && (SUITE.test(p.id) || LOG.test(p.id))

// The command a Bash key names, without the class the ledger put in front of it.
const commandOf = (key: string): string => key.slice(key.indexOf(':') + 1)

/**
 * The paths edited since the last run of a key in the main loop: what a targeted run would have to cover.
 *
 * @param state the session so far
 * @param key the ledger key of the run
 * @returns the distinct paths, in the order they were edited
 */
export const editedSince = (state: State, key: string): string[] => {
  const main = state.rows.filter(r => r.agent === MAIN_AGENT)
  const last = main.map(r => r.key).lastIndexOf(key)
  return [...new Set(main.slice(last + 1).flatMap(r => r.paths))]
}

/**
 * Where the tests of a source file may live, most usual first. A test file answers for itself.
 *
 * @param path the edited file, absolute
 * @param cwd the project
 * @returns candidate paths, absolute, forward slashes
 */
export const testCandidates = (path: string, cwd: string): string[] => {
  const posix = path.replaceAll('\\', '/')
  if (IS_TEST.test(posix)) return [posix]
  const dir = posix.slice(0, posix.lastIndexOf('/'))
  const file = posix.slice(posix.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  if (dot <= 0) return []
  const name = file.slice(0, dot)
  const ext = file.slice(dot + 1)
  const root = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  return [
    `${dir}/${name}.test.${ext}`, `${dir}/${name}.spec.${ext}`, `${root}/tests/${name}.test.${ext}`, `${root}/test/${name}.test.${ext}`,
    ...(ext === 'py' ? [`${dir}/test_${name}.py`, `${root}/tests/test_${name}.py`] : []),
  ]
}

// A path as a command wants it: relative to the project where it is inside it, quoted where it has a space.
const argOf = (path: string, cwd: string): string => {
  const root = `${cwd.replaceAll('\\', '/').replace(/\/+$/, '')}/`
  const rel = path.startsWith(root) ? path.slice(root.length) : path
  return /\s/.test(rel) ? `"${rel}"` : rel
}

/** What happens to one call: rewritten with a note for Claude, let through whole on purpose, or left alone. */
export type Rewrite = { type: 'rewrite'; command: string; note: string } | { type: 'whole' } | null

/**
 * Whether and how to rewrite one Bash call for an applied pattern.
 *
 * @param p the applied pattern
 * @param command the command as Claude wrote it
 * @param edited the paths edited since the pattern's last run (for the suite)
 * @param found the test files that exist among the candidates of the one edited path
 * @param cwd the project
 * @returns the rewrite, the planned whole run, or null
 */
export const rewriteOf = (p: Pattern, command: string, edited: readonly string[], found: readonly string[], cwd: string): Rewrite => {
  const applied = p.applied
  if (applied === undefined || applied.stopped || p.signature === null || p.signature.tool !== 'Bash') return null
  const typed = collapseWs(command)
  if (!PLAIN.test(typed)) return null
  if (SUITE.test(p.id)) {
    if (typed !== commandOf(p.signature.key) || edited.length !== 1 || found.length !== 1) return null
    // Two targeted runs, then one whole: a regression outside the file still shows by the third run.
    if (applied.count >= APPLY_FULL_EVERY - 1) return { type: 'whole' }
    const target = argOf(found[0] ?? '', cwd)
    const rewritten = DASHED.test(typed) ? `${typed} -- ${target}` : `${typed} ${target}`
    return { type: 'rewrite', command: rewritten, note: say().command.appliedNote(typed, rewritten, say().command.appliedSuiteAfter) }
  }
  const log = CAT_LOG.exec(typed)
  if (LOG.test(p.id) && log !== null && `read:${typed}` === p.signature.key) {
    const rewritten = `tail -n ${LOG_TAIL_LINES} ${log[1] ?? ''}`
    return { type: 'rewrite', command: rewritten, note: say().command.appliedNote(typed, rewritten, say().command.appliedLogAfter) }
  }
  return null
}

/** The last rewrite, and how many main-loop Bash calls after it still count as its aftermath. */
export type Watch = { patternId: string; key: string; left: number } | null

/**
 * One main-loop Bash call after a rewrite. Running the original again within the window means the rewrite
 * took away something Claude needed: that call goes through whole, and the rewrite is charged a failure.
 *
 * @param watch the rewrite being watched
 * @param key the call's ledger key
 * @returns what is still watched, and the pattern charged a failure by this call, if any
 */
export const watchStep = (watch: Watch, key: string): { watch: Watch; failed: string | null } => {
  if (watch === null) return { watch: null, failed: null }
  if (watch.key === key) return { watch: null, failed: watch.patternId }
  return { watch: watch.left > 1 ? { ...watch, left: watch.left - 1 } : null, failed: null }
}

/**
 * The applied pattern a Bash call carries, if any: its signature's key is the call's key.
 *
 * @param state the session so far
 * @param key the call's ledger key
 * @returns the pattern, or undefined
 */
export const appliedFor = (state: State, key: string): Pattern | undefined =>
  state.patterns.find(p => p.applied !== undefined && !p.applied.stopped && p.signature?.key === key)
