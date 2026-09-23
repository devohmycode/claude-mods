/**
 * The detector: which request had to write the prefix into the cache again,
 * and what happened between it and the one before.
 *
 * In a normal step the cache write is small — the last tool result, a few
 * hundred tokens. When it suddenly amounts to the request's whole input, the
 * cache was lost, and it is paid at once and in silence. The engine reports
 * both counters on every step, so the mod sees it at the very request where
 * it happens rather than at the end of the session.
 *
 * Naming the cause is the part that makes the rest of the plan safe: a mod
 * that broke the cache while believing it was saving would be caught by its
 * own instrument. It works on other plugins too — an invalidation is an
 * invalidation whoever asked for it.
 *
 * Pure, and every threshold is a parameter: the report prints the threshold
 * beside the figure it judged.
 */

import type { Miss, MissCause, Step } from '../ledger'
import { prefixOf } from '../ledger'
import { CACHE_TTL_MS, MISS_MIN_TOKENS, MISS_SHARE } from '../names'
import { TEXTS } from '../names'

/**
 * What the mod saw between two steps, gathered by the hooks that watch for it.
 *
 * Every field is what somebody did, not what the mod concluded: an
 * invalidation asked for, a configuration row written, a module rebuilt.
 */
export type Seen = {
  /**
   * The event an invalidation was asked for, by this plugin or another.
   */
  invalidated: string | null
  /**
   * The configuration row written; writing one reloads the module that owns
   * it, and every cached answer of its prefix hooks is asked for again.
   */
  configKey: string | null
  /**
   * Whether this module was rebuilt since the previous step.
   */
  reloaded: boolean
}

/**
 * Nothing seen.
 */
export const NO_SEEN: Seen = {
  invalidated: null,
  configKey: null,
  reloaded: false,
}

/**
 * The thresholds a write is judged by.
 */
export type MissLimits = {
  /**
   * How long a prefix stays warm, in milliseconds. An assumption, stated:
   * the engine names the live value on `classic.PreModelSwitch`, and until a
   * hook reads it this is what the classifier says it used.
   */
  ttlMs: number
  /**
   * How much of the request's input the write has to be.
   */
  share: number
  /**
   * The floor under which the question is not worth asking.
   */
  minTokens: number
}

/**
 * The thresholds the mod runs with.
 */
export const MISS_LIMITS: MissLimits = {
  ttlMs: CACHE_TTL_MS,
  share: MISS_SHARE,
  minTokens: MISS_MIN_TOKENS,
}

/**
 * Whether a miss is a fault, or the ordinary cold start of a loop.
 *
 * The first request of a session or of a subagent writes its whole prefix
 * because there was nothing to read: that is the price of starting, not a
 * raté.
 *
 * @param miss the miss, or null
 * @returns whether anybody lost anything
 */
export function isFault(miss: Miss | null): boolean {
  return miss !== null && miss.cause !== 'cold'
}

/**
 * What a cause is called, in the mod's own words.
 *
 * @param cause the cause
 * @returns its line
 */
export function causeText(cause: MissCause): string {
  return TEXTS[cause]
}

/**
 * Whether this step wrote its prefix into the cache again, and why.
 *
 * The order the causes are tried in is the order of sufficiency, not of
 * likelihood: a wait longer than the TTL loses the cache whatever else
 * happened, so it is asked first and the rest ride along in `detail`.
 *
 * @param step the step, with the usage its stop chunk carried
 * @param previous the previous step of the same loop, or null
 * @param seen what the mod saw between the two
 * @param limits the thresholds
 * @returns the miss, or null on an ordinary step
 */
export function missOf(
  step: Step,
  previous: Step | null,
  seen: Seen,
  limits: MissLimits = MISS_LIMITS,
): Miss | null {
  const usage = step.usage

  if (usage === null) {
    return null
  }

  const written = usage.cacheWrite
  const prefix = prefixOf(usage)

  if (written < limits.minTokens || written < prefix * limits.share) {
    return null
  }

  const sinceMs = previous === null ? -1 : Math.max(0, step.atMs - previous.atMs)
  const detail = detailOf(step, previous, seen)

  if (previous === null) {
    return { cause: 'cold', tokens: written, sinceMs, detail }
  }

  const cause: MissCause =
    sinceMs > limits.ttlMs
      ? 'ttl'
      : previous.model !== step.model
        ? 'model'
        : seen.invalidated !== null
          ? 'invalidate'
          : seen.configKey !== null
            ? 'config'
            : seen.reloaded
              ? 'reload'
              : 'unknown'

  return { cause, tokens: written, sinceMs, detail }
}

/**
 * What else was true when the cache went, in one short phrase: the secondary
 * factors the cause did not name, so that a reader sees the whole moment.
 *
 * @param step the step
 * @param previous the previous step of the same loop, or null
 * @param seen what the mod saw between the two
 * @returns the phrase, or null where there is nothing to add
 */
function detailOf(step: Step, previous: Step | null, seen: Seen): string | null {
  const parts: string[] = []

  if (previous !== null && previous.model !== step.model) {
    parts.push(`${previous.model} → ${step.model}`)
  }

  if (seen.invalidated !== null) {
    parts.push(seen.invalidated)
  }

  if (seen.configKey !== null) {
    parts.push(seen.configKey)
  }

  if (seen.reloaded) {
    parts.push(TEXTS.reload)
  }

  return parts.length === 0 ? null : parts.join(', ')
}

/**
 * The faults among a journal's misses.
 *
 * @param steps the steps a journal kept as missed
 * @returns those whose cause is not the cold start of a loop
 */
export function faultsOf(steps: readonly Step[]): readonly Step[] {
  return steps.filter(step => isFault(step.miss))
}

/**
 * What the faults cost in all, in tokens the engine reported.
 *
 * One unit, one column: these are tokens written again, never added to the
 * steps, the milliseconds or the dollars.
 *
 * @param steps the steps a journal kept as missed
 * @returns the tokens rewritten by the faults among them
 */
export function faultTokensOf(steps: readonly Step[]): number {
  return faultsOf(steps).reduce((sum, step) => sum + (step.miss?.tokens ?? 0), 0)
}
