/**
 * The deterministic detectors: the behaviours code can prove without asking a model.
 *
 * Each detector reads the ledger (or the main loop's steps) and returns findings in the
 * very shape the judge's reply is validated into, so everything after it — the registry,
 * the card, the saving credited when an instruction holds — is the path a judge finding
 * takes. What differs is who speaks: the judge writes its own sentences, a detector's
 * come from `say().detect`, in the session's language.
 *
 * The rules are the judge's own, made mechanical and made stricter, because a wrong card
 * costs more than a missed one: a first occurrence is never a repeat, calls issued
 * together count once, anything a compaction separates is forgotten, and whatever may
 * have changed a file — an edit, or a shell command that is not a plain read, search or
 * check — excuses the next read of it.
 *
 * Every id's slug opens with DETECTED_SLUG, a spelling the judge is never shown minting,
 * so a pattern says who found it and the judge is told to leave it be.
 */

import { say } from '../say'
import { fit, hashOf, kilo, median } from './text'
import {
  ALTERNATIVE_MAX, DETECT_MIN_REPEATS, DETECTED_SLUG, FILE_TOOLS, KIND_MAX, LOG_DUMP_CHARS, LOG_DUMP_MIN_REPEATS,
  MAIN_AGENT, PREFIX_MIN_BREAKS, TUNING,
} from './types'
import type { Category, CommandClass, Finding, Pattern, PrefixBreak, PrefixCause, Proposal, Row, Signature, State } from './types'

const CONFIDENCE = 0.9   // the rule is true by construction; what it cannot see is why the work needed it

// Bash classes that change no file: after anything else, a file may have moved under the ledger's feet.
const QUIET: readonly CommandClass[] = ['read', 'search', 'test', 'lint', 'typecheck']

// A test command that names what it runs: a path, a file, a node id, or a filter flag.
const TARGET_FLAGS = ['-t', '-k', '-g', '-m', '-run', '--grep', '--filter', '--testNamePattern', '--test-name-pattern']

// A command that reads a log: a `.log` file, a `logs` subcommand, or the journal.
const LOG_KEY = /\.log\b|\blogs?\b|journalctl/i

// The `:offset-limit` slice a Read key carries.
const READ_RANGE = /:\d*-\d*$/

// Where the path shown on a card is cut, from the left: the end of a path is the part that names it.
const PATH_SHOWN = 60

const idOf = (category: Category, name: string, key: string): string => `${category}:${DETECTED_SLUG}${name}-${hashOf(key)}`

/**
 * Whether a pattern was found by a detector rather than by the judge.
 *
 * @param id the pattern's id
 * @returns true when its slug opens with DETECTED_SLUG
 */
export const isDetected = (id: string): boolean => id.slice(id.indexOf(':') + 1).startsWith(DETECTED_SLUG)

const isAnswered = (r: Row): boolean => !r.flags.includes('err') && !r.flags.includes('denied')

// Rows after the last compaction: what came before it had to be re-acquired, so it is no repeat.
const windowOf = (state: State): Row[] => {
  const last = state.compactions.length === 0 ? null : Math.max(...state.compactions)
  return last === null ? state.rows : state.rows.filter(r => r.turn > last)
}

// A shell command that may write where the host does not diff: any class but a plain read or check, and an
// in-place `sed`, which the ledger files under `read`.
const isLoudBash = (r: Row): boolean => r.tool === 'Bash' && (!QUIET.includes(r.cls) || /\bsed\b.*\s-i/.test(r.key))

// A row that may have rewritten files: an edit the host diffed, or a shell command that is not a plain read or check.
const mayChangeFiles = (r: Row): boolean =>
  r.paths.length > 0 || isLoudBash(r) || (FILE_TOOLS.includes(r.tool) && r.tool !== 'Read')

// Calls issued together are one decision: an occurrence right after its twin, with nothing between, is the same one.
const isBatched = (rows: readonly Row[], at: number, same: (r: Row) => boolean): boolean => {
  const before = rows[at - 1]
  return before !== undefined && same(before)
}

const shownPath = (key: string): string => {
  const path = key.replace(READ_RANGE, '')
  return path.length <= PATH_SHOWN ? path : `…${path.slice(path.length - PATH_SHOWN + 1)}`
}

// What ran, as it was typed: the key without the class the ledger put in front of it.
const commandOf = (r: Pick<Row, 'key' | 'cls'>): string => (r.key.startsWith(`${r.cls}:`) ? r.key.slice(r.cls.length + 1) : r.key)

const sameSignature = (a: Signature | null, b: Signature | null): boolean =>
  a !== null && b !== null && a.tool === b.tool && a.key === b.key

// Whether the registry already speaks for this behaviour: a decision on it this session, or the judge's own
// card under another id. A pattern this detector found before and nobody has decided is merged, not skipped.
const isSpokenFor = (patterns: readonly Pattern[], id: string, signature: Signature | null): boolean =>
  patterns.some(p =>
    (p.id === id && p.decision !== null) ||
    (p.id !== id && sameSignature(p.signature, signature)))

// A behaviour kept in a previous session needs one more occurrence than the floor, as the judge's rule 5 asks.
const floorFor = (patterns: readonly Pattern[], id: string, signature: Signature | null, floor: number): number =>
  patterns.some(p => p.lastDecision === 'keep' && (p.id === id || sameSignature(p.signature, signature))) ? floor + 1 : floor

// `count` is what the floor is held against: the evidence, except for switches, where two in one turn cite that turn once.
type Draft = { category: Category; id: string; signature: Signature | null; evidence: string[]; count: number; kind: string; why: string; alternative: string; proposal: Proposal | null; floor: number }

const findingOf = (d: Draft): Finding => ({
  id: d.id,
  category: d.category,
  kind: fit(d.kind, KIND_MAX),
  evidence: d.evidence,
  signature: d.signature,
  why: d.why,
  alternative: fit(d.alternative, ALTERNATIVE_MAX),
  confidence: CONFIDENCE,
  estTokensPerTurn: null,
  proposal: d.proposal,
})

// The drafts that clear their floor and that nothing already speaks for.
const kept = (state: State, drafts: readonly Draft[]): Finding[] =>
  drafts
    .filter(d => d.count >= floorFor(state.patterns, d.id, d.signature, Math.max(2, d.floor + TUNING[state.sensitivity].floor)))
    .filter(d => !isSpokenFor(state.patterns, d.id, d.signature))
    .filter(d => !state.muted.includes(d.id))
    .map(findingOf)

/**
 * The same Read, key for key, three times with nothing between the reads that could have changed the file.
 * A `dedup` row is the engine answering "unchanged" for almost nothing, so it is not a read at all.
 */
export const rereads = (rows: readonly Row[]): Draft[] => {
  const chains = new Map<string, { row: Row; ids: string[] }>()
  rows.forEach((r, at) => {
    // Something that may have rewritten files ends every chain it could have touched: all of them for a
    // shell command, which says nothing of what it wrote, only its own paths for an edit.
    if (mayChangeFiles(r)) {
      const bash = isLoudBash(r)
      for (const [chain, entry] of chains) {
        if (bash || r.paths.includes(entry.row.key.replace(READ_RANGE, ''))) chains.delete(chain)
      }
      return
    }
    if (r.tool !== 'Read' || !isAnswered(r) || r.flags.includes('dedup')) return
    if (isBatched(rows, at, b => b.tool === 'Read' && b.key === r.key && b.agent === r.agent)) return
    const chain = `${r.agent}\t${r.key}`
    const entry = chains.get(chain)
    chains.set(chain, { row: r, ids: [...(entry?.ids ?? []), r.id] })
  })
  return [...chains.values()].map(({ row, ids }) => {
    const signature = { tool: 'Read', key: row.key }
    const path = shownPath(row.key)
    return {
      category: 'reading', id: idOf('reading', 'reread', row.key), signature, evidence: ids, count: ids.length,
      kind: say().detect.rereadKind(path), why: say().detect.rereadWhy(ids.length), alternative: say().detect.rereadFix(path),
      proposal: null, floor: DETECT_MIN_REPEATS,
    }
  })
}

/**
 * Whether a test command runs everything: no path, no file, no node id and no filter among its arguments.
 * `./...` is Go's "every package", so it is the whole suite, not a target.
 */
export const isWholeSuite = (command: string): boolean => {
  const tokens = command.split(' ').filter(t => t !== '')
  const dashes = tokens.indexOf('--')
  if (dashes >= 0 && dashes < tokens.length - 1) return false
  return !tokens.some(t =>
    (t.includes('/') && t !== './...') || /\.[A-Za-z]{1,5}$/.test(t) || t.includes('::') ||
    TARGET_FLAGS.includes(t) || TARGET_FLAGS.some(flag => t.startsWith(`${flag}=`)))
}

// The run right after this one in its own loop is a commit: the check before a commit is excused.
const precedesCommit = (rows: readonly Row[], at: number, agent: string): boolean => {
  const next = rows.slice(at + 1).find(r => r.agent === agent && r.tool === 'Bash')
  return next !== undefined && next.cls === 'git' && /\bcommit\b/.test(next.key)
}

/**
 * The whole suite, run again right after an edit to one single file, three times. The first run of a key is
 * the baseline, a run with no edit before it re-checks nothing new, and a run with an install or a formatter
 * before it had its inputs changed: none of those count.
 */
export const fullSuites = (rows: readonly Row[]): Draft[] => {
  const runs = new Map<string, { row: Row; ids: string[]; lastAt: number }>()
  rows.forEach((r, at) => {
    if (r.tool !== 'Bash' || r.cls !== 'test' || r.flags.includes('denied') || !isWholeSuite(commandOf(r))) return
    const chain = `${r.agent}\t${r.key}`
    const entry = runs.get(chain)
    if (entry === undefined) {
      runs.set(chain, { row: r, ids: [], lastAt: at })
      return
    }
    const between = rows.slice(entry.lastAt + 1, at)
    const edited = new Set(between.flatMap(b => b.paths))
    const changedInputs = between.some(b => isLoudBash(b) && b.paths.length === 0)
    const counts = edited.size === 1 && !changedInputs && !precedesCommit(rows, at, r.agent)
    runs.set(chain, { row: r, ids: counts ? [...entry.ids, r.id] : entry.ids, lastAt: at })
  })
  return [...runs.values()].map(({ row, ids }) => ({
    category: 'execution', id: idOf('execution', 'full-suite', row.key), signature: { tool: 'Bash', key: row.key }, evidence: ids, count: ids.length,
    kind: say().detect.fullSuiteKind(commandOf(row)), why: say().detect.fullSuiteWhy(ids.length), alternative: say().detect.fullSuiteFix,
    proposal: { kind: 'claude-md', title: say().detect.fullSuiteRuleTitle, body: say().detect.fullSuiteRule }, floor: DETECT_MIN_REPEATS,
  }))
}

// A search, as the ledger keys it: Grep and Glob by pattern and path, a shell search by its command.
const isSearch = (r: Row): boolean => r.tool === 'Grep' || r.tool === 'Glob' || (r.tool === 'Bash' && r.cls === 'search')

/** The same search three times with nothing edited between: each one found what the last one did. */
export const sameSearches = (rows: readonly Row[]): Draft[] => {
  const chains = new Map<string, { row: Row; ids: string[] }>()
  rows.forEach((r, at) => {
    if (mayChangeFiles(r)) {
      chains.clear()
      return
    }
    if (!isSearch(r) || !isAnswered(r)) return
    if (isBatched(rows, at, b => b.tool === r.tool && b.key === r.key && b.agent === r.agent)) return
    const chain = `${r.agent}\t${r.tool}\t${r.key}`
    chains.set(chain, { row: r, ids: [...(chains.get(chain)?.ids ?? []), r.id] })
  })
  return [...chains.values()].map(({ row, ids }) => ({
    category: 'reading', id: idOf('reading', 'same-search', `${row.tool}\t${row.key}`), signature: { tool: row.tool, key: row.key },
    evidence: ids, count: ids.length, kind: say().detect.sameSearchKind(row.tool === 'Bash' ? commandOf(row) : row.key),
    why: say().detect.sameSearchWhy(ids.length), alternative: say().detect.sameSearchFix, proposal: null, floor: DETECT_MIN_REPEATS,
  }))
}

const isDump = (r: Row): boolean => r.chars >= LOG_DUMP_CHARS || r.flags.some(flag => flag.startsWith('persist='))

/** The same log read whole twice: large enough to be a dump, and never cut by a pipe (a pipe keeps the key but not the size). */
export const logDumps = (rows: readonly Row[]): Draft[] => {
  const chains = new Map<string, { row: Row; ids: string[] }>()
  rows.forEach((r, at) => {
    if (r.tool !== 'Bash' || !isAnswered(r) || !LOG_KEY.test(r.key) || !isDump(r)) return
    if (isBatched(rows, at, b => b.tool === 'Bash' && b.key === r.key && b.agent === r.agent)) return
    const chain = `${r.agent}\t${r.key}`
    chains.set(chain, { row: r, ids: [...(chains.get(chain)?.ids ?? []), r.id] })
  })
  return [...chains.values()].map(({ row, ids }) => ({
    category: 'reading', id: idOf('reading', 'log-dump', row.key), signature: { tool: 'Bash', key: row.key }, evidence: ids, count: ids.length,
    kind: say().detect.logDumpKind(commandOf(row)), why: say().detect.logDumpWhy(ids.length, kilo(LOG_DUMP_CHARS)),
    alternative: say().detect.logDumpFix,
    proposal: { kind: 'claude-md', title: say().detect.logDumpRuleTitle, body: say().detect.logDumpRule }, floor: LOG_DUMP_MIN_REPEATS,
  }))
}

// A look at the code: a Read, a Grep or a Glob that answered with something.
const isLook = (r: Row): boolean => (r.tool === 'Read' || r.tool === 'Grep' || r.tool === 'Glob') && isAnswered(r) && !r.flags.includes('dedup')

/**
 * Subagents re-reading what the main loop had already read before spawning them: three looks or more, key for
 * key, in one loop. Only what the parent read before the loop's first call counts — a read the parent made
 * while the agent ran is no brief it could have written — and a compaction since makes the parent's reads
 * stale, which the window already drops.
 */
export const reExplorations = (state: State, rows: readonly Row[]): Draft[] => {
  const loops = state.loops.map(loop => {
    const own = rows.filter(r => r.agent === loop.id && isLook(r))
    const first = own[0]?.seq ?? Infinity
    const known = new Set(rows.filter(r => r.agent === MAIN_AGENT && r.seq < first && isLook(r)).map(r => `${r.tool}\t${r.key}`))
    const seen = new Set<string>()
    const again = own.filter(r => {
      const key = `${r.tool}\t${r.key}`
      if (!known.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    return again.length >= DETECT_MIN_REPEATS ? again : []
  }).filter(again => again.length > 0)
  const again = loops.flat()
  if (again.length === 0) return []
  return [{
    category: 'multi-agent', id: `multi-agent:${DETECTED_SLUG}re-explore`, signature: null, evidence: again.map(r => r.id), count: again.length,
    kind: say().detect.reExploreKind,
    why: say().detect.reExploreWhy(loops.length, again.length, kilo(again.reduce((n, r) => n + r.chars, 0))),
    alternative: say().detect.reExploreFix,
    proposal: { kind: 'agent-brief', title: say().detect.reExploreBriefTitle, body: say().detect.reExploreBrief }, floor: DETECT_MIN_REPEATS,
  }]
}

/**
 * What the switches cost beyond a normal step, in tokens written to the cache: the step after each switch,
 * less the median step that switched nothing. Measured, never estimated; null before a normal step was seen.
 */
export const extraCache = (breaks: readonly PrefixBreak[], steady: readonly number[]): number | null => {
  const measured = breaks.map(b => b.cacheCreate).filter((n): n is number => n !== null)
  if (steady.length === 0 || measured.length === 0) return null
  const usual = median([...steady])
  return measured.reduce((sum, n) => sum + Math.max(0, n - usual), 0)
}

/** Two switches of model, or of effort, in the main loop: each one rewrote the whole prompt cache. */
export const prefixSwitches = (state: State): Draft[] =>
  (['model', 'effort'] as const satisfies readonly PrefixCause[]).map(cause => {
    const breaks = state.prefix.breaks.filter(b => b.cause === cause)
    const turns = [...new Set(breaks.map(b => b.turn))]
    const extra = extraCache(breaks, state.prefix.steady)
    return {
      category: 'environment', id: `environment:${DETECTED_SLUG}prefix-${cause}`, signature: null,
      evidence: turns.map(t => `turn:${t}`), count: breaks.length,
      kind: say().detect.prefixKind[cause],
      why: say().detect.prefixWhy(breaks.length, turns.map(t => `${t}`).join(', '), extra === null ? null : kilo(extra)),
      alternative: say().detect.prefixFix, proposal: null, floor: PREFIX_MIN_BREAKS,
    }
  })

/**
 * Every behaviour the detectors can prove in this session, minus what the registry already speaks for.
 *
 * @param state the session so far
 * @returns findings shaped like the judge's, ready for `merge`
 */
export const detect = (state: State): Finding[] => {
  const rows = windowOf(state)
  return kept(state, [...rereads(rows), ...fullSuites(rows), ...sameSearches(rows), ...logDumps(rows), ...reExplorations(state, rows), ...prefixSwitches(state)])
}
