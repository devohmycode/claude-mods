/**
 * What survives the session: the record the store holds, the journal the disk
 * holds, and the reading back of both.
 *
 * Two reasons a mod like this has to persist. A `/config` row written reloads
 * the module — `register` runs again and every counter in memory is gone — so
 * the record is what the session is picked up from. And a bill that compares
 * two sessions at the same task needs the first one to still be there when
 * the second ends.
 *
 * Two constraints shape it. `$.store` refuses past 4 MiB of JSON in all, so
 * the store keeps the record and the disk keeps the volume; and `$.fs` has no
 * `delete`, so a journal file written is a journal file kept — the rotation
 * here is of store keys alone, and the README says as much of the folder.
 *
 * Pure: reading and writing are the register's business, shaping and
 * validating are this module's.
 */

import type { Ledger, MissCause, Step } from '../ledger'
import { NO_LEDGER } from '../ledger'
import { JOURNAL_DIR, JOURNAL_EXT, KEPT_SESSIONS, KEPT_VERSION, STORE_PREFIX } from '../names'
import type { Spend } from '../spend'
import { NO_SPEND } from '../spend'

/**
 * One session's record, as the store and the journal both hold it.
 */
export type Kept = {
  version: number
  sessionId: string
  atMs: number
  ledger: Ledger
  spend: Spend
}

/**
 * The store key a session's record is kept under.
 *
 * @param sessionId the session
 * @returns the key
 */
export function sessionKeyOf(sessionId: string): string {
  return `${STORE_PREFIX}${sessionId}`
}

/**
 * The record of a session as it stands.
 *
 * @param sessionId the session
 * @param atMs when it was written, on the engine's clock
 * @param ledger the journal
 * @param spend the mod's own column
 * @returns the record
 */
export function keptOf(
  sessionId: string,
  atMs: number,
  ledger: Ledger,
  spend: Spend,
): Kept {
  return { version: KEPT_VERSION, sessionId, atMs, ledger, spend }
}

/**
 * Whether a value is an object to read fields off.
 *
 * @param value the value
 * @returns whether it is one
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A number read off a record, or null where it is not one.
 *
 * @param value the field
 * @returns the number, or null
 */
const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * Every cause a miss may carry, so a record written by hand — or by another
 * version — cannot put a word the report has no line for into the journal.
 */
const CAUSES: readonly MissCause[] = [
  'cold',
  'ttl',
  'model',
  'invalidate',
  'config',
  'reload',
  'unknown',
]

/**
 * A cause read back, or null where the field names none.
 *
 * @param value the field
 * @returns the cause, or null
 */
const causeOf = (value: unknown): MissCause | null =>
  CAUSES.find(cause => cause === value) ?? null

/**
 * One step read back, or null where anything about it is wrong.
 *
 * @param value the field
 * @returns the step, or null
 */
function stepOf(value: unknown): Step | null {
  if (!isRecord(value)) {
    return null
  }

  const atMs = numberOf(value.atMs)
  const index = numberOf(value.index)
  const ms = numberOf(value.ms)
  const tools = numberOf(value.tools)

  if (
    typeof value.turnId !== 'string' ||
    typeof value.model !== 'string' ||
    atMs === null ||
    index === null ||
    ms === null ||
    tools === null
  ) {
    return null
  }

  const usage = isRecord(value.usage)
    ? {
        model: typeof value.usage.model === 'string' ? value.usage.model : value.model,
        input: numberOf(value.usage.input) ?? 0,
        output: numberOf(value.usage.output) ?? 0,
        cacheRead: numberOf(value.usage.cacheRead) ?? 0,
        cacheWrite: numberOf(value.usage.cacheWrite) ?? 0,
      }
    : null

  const cause = isRecord(value.miss) ? causeOf(value.miss.cause) : null

  const miss =
    isRecord(value.miss) && cause !== null
      ? {
          cause,
          tokens: numberOf(value.miss.tokens) ?? 0,
          sinceMs: numberOf(value.miss.sinceMs) ?? -1,
          detail: typeof value.miss.detail === 'string' ? value.miss.detail : null,
        }
      : null

  return {
    turnId: value.turnId,
    index,
    agentId: typeof value.agentId === 'string' ? value.agentId : null,
    model: value.model,
    atMs,
    ms,
    usage,
    tools,
    hasText: value.hasText === true,
    miss,
  }
}

/**
 * One side's totals read back, or the empty side where anything is wrong.
 *
 * @param value the field
 * @returns the totals
 */
function totalsOf(value: unknown): Ledger['main'] {
  if (!isRecord(value)) {
    return NO_LEDGER.main
  }

  return {
    steps: numberOf(value.steps) ?? 0,
    input: numberOf(value.input) ?? 0,
    output: numberOf(value.output) ?? 0,
    cacheRead: numberOf(value.cacheRead) ?? 0,
    cacheWrite: numberOf(value.cacheWrite) ?? 0,
    ms: numberOf(value.ms) ?? 0,
  }
}

/**
 * The mod's own column read back.
 *
 * @param value the field
 * @returns the column, empty where anything is wrong
 */
function spendOf(value: unknown): Spend {
  if (!isRecord(value)) {
    return NO_SPEND
  }

  const calls = isRecord(value.calls) ? value.calls : {}
  const tokens = isRecord(value.tokens) ? value.tokens : {}

  return {
    calls: {
      fork: numberOf(calls.fork) ?? 0,
      complete: numberOf(calls.complete) ?? 0,
      classify: numberOf(calls.classify) ?? 0,
      spawn: numberOf(calls.spawn) ?? 0,
      breakdown: numberOf(calls.breakdown) ?? 0,
    },
    tokens: {
      input: numberOf(tokens.input) ?? 0,
      output: numberOf(tokens.output) ?? 0,
      cacheRead: numberOf(tokens.cacheRead) ?? 0,
      cacheWrite: numberOf(tokens.cacheWrite) ?? 0,
    },
    shownChars: numberOf(value.shownChars) ?? 0,
    dispatches: numberOf(value.dispatches) ?? 0,
  }
}

/**
 * A record read back from the store or the disk.
 *
 * Anything unreadable answers null rather than half a journal: a corrupt
 * state makes the session start empty and say so, and never makes the module
 * fail to load.
 *
 * @param value whatever was stored
 * @returns the record, or null
 */
export function restoredOf(value: unknown): Kept | null {
  if (!isRecord(value) || numberOf(value.version) !== KEPT_VERSION) {
    return null
  }

  const atMs = numberOf(value.atMs)

  if (typeof value.sessionId !== 'string' || atMs === null || !isRecord(value.ledger)) {
    return null
  }

  const kept = value.ledger
  const steps = Array.isArray(kept.steps)
    ? kept.steps.map(stepOf).filter((step): step is Step => step !== null)
    : null

  if (steps === null) {
    return null
  }

  const misses = Array.isArray(kept.misses)
    ? kept.misses.map(stepOf).filter((step): step is Step => step !== null)
    : []

  return {
    version: KEPT_VERSION,
    sessionId: value.sessionId,
    atMs,
    ledger: {
      steps,
      dropped: numberOf(kept.dropped) ?? 0,
      misses,
      main: totalsOf(kept.main),
      agents: totalsOf(kept.agents),
      turns: numberOf(kept.turns) ?? 0,
      acks: numberOf(kept.acks) ?? 0,
      ackCacheRead: numberOf(kept.ackCacheRead) ?? 0,
    },
    spend: spendOf(value.spend),
  }
}

/**
 * The store keys of old sessions, oldest first, that are over the limit.
 *
 * `$.store.keys()` answers in insertion order, so the oldest are at the head;
 * the current session's key is never stale, wherever it sits.
 *
 * @param keys every key the store holds
 * @param current the current session's key
 * @param keep how many session records stay
 * @returns the keys to delete, in the order they were found
 */
export function staleKeysOf(
  keys: readonly string[],
  current: string,
  keep: number = KEPT_SESSIONS,
): string[] {
  const ours = keys.filter(key => key.startsWith(STORE_PREFIX) && key !== current)
  const over = ours.length - Math.max(0, keep - 1)

  return over <= 0 ? [] : ours.slice(0, over)
}

/**
 * Where a session's journal is written.
 *
 * @param home the home directory
 * @param sessionId the session
 * @returns the path
 */
export function journalPathOf(home: string, sessionId: string): string {
  const root = home.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const name = sessionId.replace(/[^A-Za-z0-9._-]/g, '-')

  return `${root}/${JOURNAL_DIR}/${name}${JOURNAL_EXT}`
}

/**
 * Where the /clauget report of a session is written, beside its journal.
 *
 * @param home the home directory
 * @param sessionId the session's id
 * @returns `<home>/.claude/clauget/<session>.report.txt`
 */
export function reportPathOf(home: string, sessionId: string): string {
  return journalPathOf(home, sessionId).replace(/\.json$/, '.report.txt')
}

/**
 * Where the brief of a session is written, beside its journal: what a fresh
 * session can be pointed at instead of resuming this one.
 *
 * @param home the home directory
 * @param sessionId the session's id
 * @returns `<home>/.claude/clauget/<session>.brief.md`
 */
export function briefPathOf(home: string, sessionId: string): string {
  return journalPathOf(home, sessionId).replace(/\.json$/, '.brief.md')
}

/**
 * The journal as it is written: the record, indented, so a person reading the
 * file with their own eyes can.
 *
 * @param kept the record
 * @returns the file's whole text
 */
export function journalOf(kept: Kept): string {
  return `${JSON.stringify(kept, null, 2)}\n`
}
