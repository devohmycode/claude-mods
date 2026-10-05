/**
 * The rules a mod breaks without a word: what the loader refuses or what
 * fails at run time with no message, read off the source before `validate`
 * or a session ever loads it. Each rule is one the repository's CLAUDE.md
 * names as a silent failure. The reading is static and approximate, so the
 * lint stands before the engine's own checks, never in place of them.
 */

import { argsOf, pairs, tokenize } from './tokens'
import type { Token } from './tokens'

/** How bad a finding is: `error` will not load or will misbehave, `warning` may. */
export type Severity = 'error' | 'warning'

/** One thing the lint found, where it found it. */
export type Finding = {
  rule: Rule
  severity: Severity
  file: string
  line: number
  message: string
}

/** The rules, by the name a report prints. */
export type Rule =
  | 'dollar-bound'
  | 'dollar-computed'
  | 'noun-bound'
  | 'method-unbound'
  | 'event-computed'
  | 'env-computed'
  | 'hook-twice'
  | 'noun-event'
  | 'config-reload'
  | 'catch-next'
  | 'register-delegated'

/** One `on(...)` the module registers: the event, whether it has a matcher, where. */
export type Hooked = { event: string; hasMatcher: boolean; file: string; line: number }

/** What one file says it hooks and calls, and what is wrong with it. */
export type FileReport = { findings: Finding[]; hooked: Hooked[]; calls: string[] }

/** What a whole plugin says it hooks and calls, and what is wrong with it. */
export type PluginReport = { findings: Finding[]; hooked: Hooked[]; calls: string[] }

/** A file of the plugin, as the check reads it. */
export type SourceFile = { path: string; text: string }

const CONTROL = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'typeof', 'await', 'new'])
const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])

const at = (tokens: readonly Token[], i: number): Token | undefined => tokens[i]
const is = (t: Token | undefined, text: string): boolean => t !== undefined && t.text === text && t.kind !== 'string' && t.kind !== 'template'
const isDot = (t: Token | undefined): boolean => is(t, '.') || is(t, '?.')

/**
 * Whether the `$` at `i` is a parameter of the function whose parameter
 * list encloses it — the one place `$` may stand alone.
 */
function isParameter(tokens: readonly Token[], partner: readonly number[], i: number): boolean {
  const prev = at(tokens, i - 1)
  if (!is(prev, '(') && !is(prev, ',')) return false
  let open = -1
  for (let j = i - 1; j >= 0; j -= 1) {
    const t = tokens[j] as Token
    if (t.kind !== 'punct') continue
    if (CLOSERS.has(t.text) && (partner[j] ?? -1) >= 0) { j = partner[j] as number; continue }
    if (OPENERS.has(t.text)) { open = t.text === '(' ? j : -1; break }
  }
  if (open < 0) return false
  const close = partner[open] ?? -1
  if (close < 0) return false
  const after = at(tokens, close + 1)
  if (is(after, '=>')) return true
  if (is(after, ':')) {
    let depth = 0
    for (let k = close + 2; k < Math.min(tokens.length, close + 80); k += 1) {
      const t = tokens[k] as Token
      if (t.kind === 'punct' && (t.text === '(' || t.text === '[' || t.text === '<')) depth += 1
      if (t.kind === 'punct' && (t.text === ')' || t.text === ']' || t.text === '>')) depth -= 1
      if (depth <= 0 && is(t, '=>')) return true
      if (depth <= 0 && is(t, '{')) return true
      if (depth <= 0 && (is(t, ';') || is(t, ','))) return false
    }
    return false
  }
  if (is(after, '{')) {
    const before = at(tokens, open - 1)
    if (before === undefined) return false
    if (is(before, '*') || is(before, 'function')) return true
    return before.kind === 'ident' && !CONTROL.has(before.text)
  }
  return false
}

/** Says how a lone `$` is used, for the message. */
function useOf(tokens: readonly Token[], i: number): string {
  const prev = at(tokens, i - 1)
  if (is(prev, '=')) return 'assigned to a name'
  if (is(prev, 'return') || is(prev, '=>')) return 'returned'
  if (is(prev, '...')) return 'spread'
  if (is(prev, '(') || is(prev, ',')) return 'passed as an argument'
  if (is(prev, '{') || is(prev, ':')) return 'put in an object'
  return 'read'
}

/**
 * Lints one file of the plugin.
 *
 * @param file the file's path (for the findings) and text
 * @param core the engine's own event names, when the types file was found;
 *   absent, no event is judged a plugin noun's
 * @returns the findings, and the events and `$` calls the file spells
 */
export function lintFile(file: SourceFile, core?: ReadonlySet<string>): FileReport {
  const tokens = tokenize(file.text)
  const partner = pairs(tokens)
  const isTest = /\.test\.tsx?$/.test(file.path) || /(^|[\\/])tests[\\/]/.test(file.path)
  const findings: Finding[] = []
  const hooked: Hooked[] = []
  const calls = new Set<string>()
  const find = (rule: Rule, severity: Severity, line: number, message: string): void => {
    findings.push({ rule, severity, file: file.path, line, message })
  }

  tokens.forEach((t, i) => {
    // A test's `$` is the kit's engine, not the module's: it may be passed to a helper.
    if (!isTest && t.kind === 'ident' && t.text === '$' && !isDot(at(tokens, i - 1))) {
      const a = at(tokens, i + 1)
      const noun = at(tokens, i + 2)
      const b = at(tokens, i + 3)
      const verb = at(tokens, i + 4)
      if (is(a, '[')) {
        find('dollar-computed', 'error', t.line, '`$[...]`: the loader reads `$` by its literal spelling and refuses a computed noun')
        return
      }
      if (isDot(a) && noun?.kind === 'ident') {
        if (is(b, '[')) {
          find('dollar-computed', 'error', t.line, `\`$.${noun.text}[...]\`: a computed verb is refused; spell \`$.${noun.text}.verb(...)\``)
          return
        }
        if (!isDot(b) || verb?.kind !== 'ident') {
          find('noun-bound', 'error', t.line, `\`$.${noun.text}\` stands alone: a noun is never bound to a name; spell \`$.${noun.text}.verb(...)\` at the call site`)
          return
        }
        const name = `$.${noun.text}.${verb.text}`
        calls.add(name)
        if (!is(at(tokens, i + 5), '(')) {
          find('method-unbound', 'warning', t.line, `\`${name}\` is referenced without being called; pass a closure that calls it instead`)
        }
        if (name === '$.env.get') {
          const first = argsOf(tokens, partner, i + 5)[0]
          if (first !== undefined && !(first[0] === first[1] && tokens[first[0]]?.kind === 'string')) {
            find('env-computed', 'error', t.line, '`$.env.get` takes its name as a string literal: the loader inventories the variables it reads')
          }
        }
        if (name === '$.config.set') {
          // Guarded when the lines before compare, or leave early on a condition.
          const from = Math.max(0, t.line - 16)
          const before = file.text.split('\n').slice(from, t.line).join('\n')
          if (!/===|!==|\.includes\(|\bunchanged\b|\bsame\b|\bif\s*\([^]*?\breturn\b/.test(before)) {
            find('config-reload', 'warning', t.line, '`$.config.set` reloads the module: compare with the current value first and write nothing when it already holds')
          }
        }
        return
      }
      if (isParameter(tokens, partner, i)) return
      find('dollar-bound', 'error', t.line, `\`$\` is ${useOf(tokens, i)}: \`$\` is always spelled \`$.noun.verb(...)\` at the call site`)
      return
    }

    if (isTest) {
      if (t.kind === 'ident' && t.text === 'register' && is(at(tokens, i + 1), ':')) {
        const window = tokens.slice(i + 2, i + 10).map(x => x.text).join(' ')
        if (/=> register \(/.test(window)) {
          find('register-delegated', 'warning', t.line, 'an inline test plugin whose `register` delegates registers nothing the loader sees; write its `on(...)` calls inline')
        }
      }
      return
    }

    if (t.kind === 'ident' && t.text === 'on' && is(at(tokens, i + 1), '(') && !isDot(at(tokens, i - 1)) && !is(at(tokens, i - 1), 'function')) {
      const args = argsOf(tokens, partner, i + 1)
      const first = args[0]
      if (first === undefined) return
      const head = tokens[first[0]] as Token
      const isLiteral = first[0] === first[1] && head.kind === 'string'
      // Every engine event is dotted (`tool.call`, `classic.Stop`): a literal
      // without a dot, or a single argument, is some other function named `on`.
      if (isLiteral && !head.text.includes('.')) return
      if (!isLiteral && args.length < 2) return
      if (!isLiteral) {
        find('event-computed', 'error', t.line, 'the event of `on(...)` is a string literal: the loader inventories events by reading the source')
        return
      }
      const event = head.text
      hooked.push({ event, hasMatcher: args.length >= 3, file: file.path, line: t.line })
      if (core !== undefined && core.size > 0 && !core.has(event) && !event.includes('*') && !event.startsWith('classic.')) {
        find('noun-event', 'warning', t.line, `\`${event}\` is no engine event: hooking a plugin noun's verb fails to build \`$\` where no plugin provides the noun; call the noun in a try/catch instead`)
      }
      return
    }

    if (is(t, '.') && is(at(tokens, i + 1), 'catch') && is(at(tokens, i + 2), '(')) {
      const close = partner[i + 2] ?? -1
      if (close < 0) return
      const body = tokens.slice(i + 3, close)
      const params = body.slice(0, 8).map(x => x.text)
      const isHookCatch = params.includes('next') || params.includes('$')
      const callsNext = body.some((x, k) => x.text === 'next' && is(body[k + 1], '('))
      const checksCalled = body.some((x, k) => x.text === 'next' && is(body[k + 1], '.') && body[k + 2]?.text === 'called')
      if (isHookCatch && callsNext && !checksCalled) {
        find('catch-next', 'warning', t.line, 'this `.catch` calls `next(...)` without reading `next.called`: when the hook failed after its `next`, the side effect runs twice')
      }
    }
  })

  return { findings, hooked, calls: [...calls].sort() }
}

/**
 * Lints every file of a plugin and the rules that span files: one hook
 * without a matcher per event and per module.
 *
 * @param files the plugin's source files (hooks and tests)
 * @param core the engine's own event names, when known
 * @returns every finding, sorted by file and line, and the plugin's inventory
 */
export function lintPlugin(files: readonly SourceFile[], core?: ReadonlySet<string>): PluginReport {
  const reports = files.map(f => lintFile(f, core))
  const findings = reports.flatMap(r => r.findings)
  const hooked = reports.flatMap(r => r.hooked)
  const bare = new Map<string, Hooked[]>()
  for (const h of hooked) {
    if (h.hasMatcher) continue
    bare.set(h.event, [...(bare.get(h.event) ?? []), h])
  }
  for (const [event, list] of bare) {
    const [first, ...rest] = list
    if (first === undefined) continue
    for (const h of rest) {
      findings.push({
        rule: 'hook-twice',
        severity: 'error',
        file: h.file,
        line: h.line,
        message: `a second \`on("${event}")\` with no matcher; the first is ${first.file}:${first.line}. Share one hook, or give one a matcher`,
      })
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  const calls = [...new Set(reports.flatMap(r => r.calls))].sort()
  return { findings, hooked, calls }
}

/**
 * The engine's own event names, read from a `claude-code.d.ts`: the keys of
 * its engine, classic and op event maps. A plugin noun's events are not in
 * them.
 *
 * @param types the text of the declaration file
 * @returns the names; empty when the file has none of the three maps
 */
export function coreEvents(types: string): Set<string> {
  const out = new Set<string>()
  const lines = types.split('\n')
  let inside = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*export type (EngineEventOf|ClassicEventOf|OpEventOf) = \{/.test(line)) { inside = true; continue }
    if (inside && /^ {2}\};?$/.test(line)) { inside = false; continue }
    if (!inside) continue
    const key = /^ {6}'([^']+)'\??:/.exec(line)
    if (key?.[1] !== undefined) out.add(key[1])
  }
  return out
}

/**
 * The Claude Code version that wrote a declaration file, from its first line.
 *
 * @param types the text of the declaration file
 * @returns the version, or undefined when the first line does not name one
 */
export function typesVersion(types: string): string | undefined {
  return /Written by Claude Code (\d+\.\d+\.\d+[\w.-]*?)\.?\s*$/m.exec(types.split('\n')[0] ?? '')?.[1]
}
