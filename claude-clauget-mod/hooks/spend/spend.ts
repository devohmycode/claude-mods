/**
 * The mod's own column: what it spent to find out what everything else spent.
 *
 * A mod that showed savings and hid its own costs would be an advertisement,
 * not an instrument. So every model call it makes, every character it puts in
 * front of the model, and every call it makes on the engine is counted here
 * and printed beside the figures it gathered.
 *
 * In this version the first two are zero by construction: the mod makes no
 * model call at all, and the ticket goes to the transcript as a dim row and
 * to the debug log — neither of which the model reads. `isSilent` is the test
 * of that, and it is the one number that would quietly stop being true if a
 * later fiche put a line of `context` on a tool result.
 *
 * Pure.
 */

import type { StepUsage } from '../ledger'

/**
 * A call the mod made on a model — or, for `breakdown`, a counted context
 * breakdown: one `$.session.usage({ breakdown: 'full' })`, which sends a
 * token-count request per tool and memory file. Counted as one call here, and
 * made only by the report the person opens.
 */
export type SpendKind = 'fork' | 'complete' | 'classify' | 'spawn' | 'breakdown'

/**
 * What the mod has spent.
 */
export type Spend = {
  /**
   * How many of each kind of model call it made.
   */
  calls: Record<SpendKind, number>
  /**
   * What those calls cost, as the engine reported it: the same four counters
   * as a step, so they may be read next to one another.
   */
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  /**
   * Characters the mod put where the model reads them: a `context` line on a
   * tool result, a block of its own in the first message, the description of
   * a tool it registered. Bytes, exactly — never converted into tokens here.
   */
  shownChars: number
  /**
   * Calls the mod made on the engine: each is a dispatch through every hook
   * beneath it, which is small but not free, and countable exactly.
   */
  dispatches: number
}

/**
 * A mod that has done nothing yet.
 */
export const NO_SPEND: Spend = {
  calls: { fork: 0, complete: 0, classify: 0, spawn: 0, breakdown: 0 },
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  shownChars: 0,
  dispatches: 0,
}

/**
 * The column with one model call of the mod's own added.
 *
 * Called before the call's result is returned, never after: a call counted
 * only on success would hide the ones that cost and failed.
 *
 * @param spend the column
 * @param kind which call it was
 * @param usage what it cost, null where the engine reported none
 * @returns the column, one call on
 */
export function withModelCall(
  spend: Spend,
  kind: SpendKind,
  usage: StepUsage | null,
): Spend {
  return {
    ...spend,
    calls: { ...spend.calls, [kind]: spend.calls[kind] + 1 },
    tokens: {
      input: spend.tokens.input + (usage?.input ?? 0),
      output: spend.tokens.output + (usage?.output ?? 0),
      cacheRead: spend.tokens.cacheRead + (usage?.cacheRead ?? 0),
      cacheWrite: spend.tokens.cacheWrite + (usage?.cacheWrite ?? 0),
    },
  }
}

/**
 * The column with characters the mod made the model read.
 *
 * @param spend the column
 * @param chars how many characters, negative read as zero
 * @returns the column
 */
export function withShown(spend: Spend, chars: number): Spend {
  return { ...spend, shownChars: spend.shownChars + Math.max(0, Math.round(chars)) }
}

/**
 * The column with one engine call of the mod's own.
 *
 * @param spend the column
 * @param count how many, one by default
 * @returns the column
 */
export function withDispatch(spend: Spend, count = 1): Spend {
  return { ...spend, dispatches: spend.dispatches + Math.max(0, Math.round(count)) }
}

/**
 * Whether the mod has put nothing in front of the model: no model call, and
 * not one character where the model reads.
 *
 * @param spend the column
 * @returns whether the session's context owes the mod nothing
 */
export function isSilent(spend: Spend): boolean {
  const calls = Object.values(spend.calls).reduce((sum, one) => sum + one, 0)

  return calls === 0 && spend.shownChars === 0
}
