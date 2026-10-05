/**
 * The steps of `/forge check` as pure functions: the argv of each host
 * command, what its output says, the comparison of what the source spells
 * with what `claude plugin validate` saw, and the report. Running the
 * commands is the register's business; reading them is this module's, so
 * the tests reach every branch without a process.
 */

import type { Finding, PluginReport } from '../lint'

/** How one step ended. `skip` says why it did not run. */
export type StepStatus = 'ok' | 'warn' | 'fail' | 'skip'

/** One step of the check, as the report prints it. */
export type Step = { name: string; status: StepStatus; summary: string; lines: string[] }

/** What `claude plugin validate` printed, read. */
export type Validated = { isPassed: boolean; hooks: string[]; calls: string[]; problems: string[] }

/** What `claude plugin test` printed, read. */
export type Tested = { pass: number; fail: number; failures: string[] }

/** The most lines a step prints before saying how many it left out. */
export const STEP_LINES = 12

/**
 * Joins path parts with forward slashes, the spelling `$.fs` and the CLI
 * both take on every platform.
 *
 * @param parts the parts; an absolute later part does not reset the join
 * @returns the joined path, without doubled or trailing slashes
 */
export function join(...parts: string[]): string {
  return parts
    .filter(p => p !== '')
    .map(p => p.replace(/\\/g, '/'))
    .join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/(.)\/$/, '$1')
}

/**
 * Resolves a folder the person typed against the session's directory.
 *
 * @param cwd the session's working directory
 * @param typed what the person typed; empty means the session's directory
 * @returns an absolute path with forward slashes
 */
export function resolve(cwd: string, typed: string): string {
  const t = typed.trim().replace(/^["']|["']$/g, '')
  if (t === '' || t === '.') return join(cwd)
  if (/^([A-Za-z]:)?[\\/]/.test(t)) return join(t)
  return join(cwd, t.replace(/^\.[\\/]/, ''))
}

/**
 * The folders above a path, nearest first, the path itself included.
 *
 * @param path an absolute path with forward slashes
 * @param depth how many levels to climb at most
 * @returns the path and its ancestors
 */
export function upward(path: string, depth = 6): string[] {
  const out: string[] = []
  let p = join(path)
  for (let i = 0; i <= depth; i += 1) {
    out.push(p)
    const cut = p.lastIndexOf('/')
    if (cut <= 0 || /^[A-Za-z]:\/?$/.test(p)) break
    const up = p.slice(0, cut)
    p = /^[A-Za-z]:$/.test(up) ? `${up}/` : up
  }
  return out
}

/**
 * Splits a list `validate` prints at its top-level commas: a matcher in
 * braces may hold commas of its own.
 *
 * @param list the text after `hooks:` or `calls:`
 * @returns the items, trimmed
 */
export function splitList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i]
    if (c === '{') depth += 1
    if (c === '}') depth -= 1
    if (c === ',' && depth === 0) {
      out.push(list.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(list.slice(from).trim())
  return out.filter(s => s !== '' && s !== 'nothing')
}

/**
 * Reads the output of `claude plugin validate`.
 *
 * @param out stdout and stderr together
 * @param exitCode the command's exit status
 * @returns whether it passed, the events and calls it listed, and its complaints
 */
export function parseValidate(out: string, exitCode: number): Validated {
  const hooks: string[] = []
  const calls: string[] = []
  const problems: string[] = []
  for (const raw of out.split('\n')) {
    const line = raw.trim()
    const hooked = /hooks: (.*)$/.exec(line)
    const called = /calls: (.*)$/.exec(line)
    if (hooked?.[1] !== undefined && line.startsWith('❯')) hooks.push(...splitList(hooked[1]).map(h => h.replace(/\{.*\}$/, '')))
    else if (called?.[1] !== undefined && line.startsWith('❯')) calls.push(...splitList(called[1]))
    // A refusal is a `❯` row that is no inventory, or a line of its own; the
    // banners around it ("Found 1 error:", "Validation failed") say nothing more.
    else if (line.startsWith('❯') && !/ (env writes|env reads): /.test(line)) problems.push(line)
    else if (/^(✘|✖|×|error|Error)|refus|not allowed|invalid/i.test(line) && !/Validation (passed|failed)|^✘ Found \d+ errors?:?$/.test(line)) problems.push(line)
  }
  return { isPassed: exitCode === 0 && /Validation passed/.test(out), hooks: [...new Set(hooks)], calls: [...new Set(calls)], problems }
}

/**
 * Reads the output of `tsc --pretty false`.
 *
 * @param out stdout and stderr together
 * @returns one line per error
 */
export function parseTsc(out: string): string[] {
  return out.split('\n').map(l => l.trim()).filter(l => /error TS\d+/.test(l))
}

/**
 * Reads the output of `claude plugin test`.
 *
 * @param out stdout and stderr together
 * @returns the totals and the name of each failed test
 */
export function parseTests(out: string): Tested {
  const pass = Number(/^\s*(\d+) pass\s*$/m.exec(out)?.[1] ?? 0)
  const fail = Number(/^\s*(\d+) fail\s*$/m.exec(out)?.[1] ?? 0)
  const failures = out.split('\n').filter(l => l.startsWith('(fail)')).map(l => l.replace(/^\(fail\)\s*/, '').replace(/\s*\[[\d.]+m?s\]\s*$/, ''))
  return { pass, fail, failures }
}

/**
 * Compares what the source spells with what `validate` saw: an event or a
 * call the source spells that the engine does not list is one the loader
 * did not see as written; a call the engine lists that no `$.` spells is
 * reached through an engine captured at `engine.create`, which is allowed.
 *
 * @param source the lint's inventory
 * @param seen what validate listed
 * @returns the report lines and whether one of them is a failure
 */
export function compareInventory(source: PluginReport, seen: Validated): { lines: string[]; isBroken: boolean } {
  const lines: string[] = []
  const events = [...new Set(source.hooked.map(h => h.event))]
  const unseenEvents = events.filter(e => !seen.hooks.includes(e))
  const unseenCalls = source.calls.filter(c => !seen.calls.includes(c))
  const viaEngine = seen.calls.filter(c => !source.calls.includes(c))
  for (const e of unseenEvents) lines.push(`✘ the source hooks "${e}", validate does not list it`)
  for (const c of unseenCalls) lines.push(`✘ the source calls ${c}, validate does not list it`)
  if (viaEngine.length > 0) lines.push(`· reached through a captured engine, not spelled $.: ${viaEngine.join(', ')}`)
  if (lines.length === 0) lines.push(`the engine sees what the source spells: ${events.length} events, ${source.calls.length} calls`)
  return { lines, isBroken: unseenEvents.length + unseenCalls.length > 0 }
}

/**
 * Prints the lint's findings, errors first.
 *
 * @param findings what the lint found
 * @param root the plugin's folder, cut from each path
 * @returns one line per finding
 */
export function findingLines(findings: readonly Finding[], root: string): string[] {
  const rel = (p: string): string => (p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p)
  return [...findings]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
    .map(f => `${f.severity === 'error' ? '✘' : '!'} ${rel(f.file)}:${f.line} [${f.rule}] ${f.message}`)
}

/**
 * The lint as a step of the check.
 *
 * @param report the lint's report
 * @param root the plugin's folder
 * @param files how many files were read
 * @returns the step
 */
export function lintStep(report: PluginReport, root: string, files: number): Step {
  const errors = report.findings.filter(f => f.severity === 'error').length
  const warnings = report.findings.length - errors
  const status: StepStatus = errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'ok'
  return {
    name: 'lint',
    status,
    summary: `${files} files · ${errors} errors · ${warnings} warnings`,
    lines: findingLines(report.findings, root),
  }
}

const MARK: Record<StepStatus, string> = { ok: '✔', warn: '!', fail: '✘', skip: '–' }

/**
 * Prints the check, one block per step, each cut at `STEP_LINES` lines.
 *
 * @param root the plugin's folder
 * @param steps the steps, in the order they ran
 * @returns the report text
 */
export function formatReport(root: string, steps: readonly Step[]): string {
  const failed = steps.filter(s => s.status === 'fail').map(s => s.name)
  const head = failed.length === 0 ? `forge check ${root}: everything held` : `forge check ${root}: ${failed.join(', ')} failed`
  const blocks = steps.map(s => {
    const shown = s.lines.slice(0, STEP_LINES).map(l => `    ${l}`)
    if (s.lines.length > STEP_LINES) shown.push(`    … ${s.lines.length - STEP_LINES} more`)
    return [`${MARK[s.status]} ${s.name.padEnd(9)} ${s.summary}`, ...shown].join('\n')
  })
  return [head, '', ...blocks].join('\n')
}
