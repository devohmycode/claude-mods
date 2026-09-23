/**
 * The journal: one line per model request, and the totals it feeds.
 *
 * A turn is not one request. The turn where Claude reads three files, runs
 * the tests and edits two lines is six requests, and each of them re-reads
 * everything before it. `turn.step` is the only event raised at that grain,
 * and its stop chunk carries what the request cost — so this module is what
 * the mod knows, and every figure in it was reported by the API rather than
 * worked out here.
 *
 * Pure. The list of steps is capped and the totals are not: what falls off
 * the end of the list is the detail of an old step, never a figure, and
 * `dropped` says how many lines the list no longer shows.
 */

import { ACK_MAX_OUTPUT, MISSES_CAP, STEPS_CAP } from '../names'

/**
 * What one request cost, as the API reported it: the four counters and the
 * model that answered.
 */
export type StepUsage = {
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * Why a request had to write its prefix into the cache again, as the cache
 * module judges it. Null on an ordinary step.
 */
export type Miss = {
  cause: MissCause
  tokens: number
  sinceMs: number
  detail: string | null
}

/**
 * What came between the two steps, where the mod saw it.
 *
 * `cold` is not a fault: the first request of a loop has nothing to read.
 */
export type MissCause =
  | 'cold'
  | 'ttl'
  | 'model'
  | 'invalidate'
  | 'config'
  | 'reload'
  | 'unknown'

/**
 * One model request as the journal keeps it.
 */
export type Step = {
  /**
   * The turn it belongs to, and its position in that turn from 0.
   */
  turnId: string
  index: number
  /**
   * The loop it ran in: a subagent's id, or null on the main loop. A
   * subagent has a prefix of its own, so its steps are counted apart and its
   * cache is judged against its own previous step.
   */
  agentId: string | null
  /**
   * The model that answered, as the API reported it; the model the step was
   * sent with where no response arrived.
   */
  model: string
  /**
   * When the response ended and how long the step took, on the engine's clock.
   */
  atMs: number
  ms: number
  /**
   * What it cost; null where no response arrived (interrupted, an API error),
   * which four zeroes would wrongly call a free request.
   */
  usage: StepUsage | null
  /**
   * How many tool calls the response asked for, and whether it produced any
   * visible text: the shape of the step, which is what tells a mechanical
   * step from a deciding one.
   */
  tools: number
  hasText: boolean
  /**
   * Why its cache was written again, where it was.
   */
  miss: Miss | null
}

/**
 * One side's figures: the main loop's, or every subagent's together.
 *
 * Five columns and no total over them. Tokens are the engine's; `steps` and
 * `ms` are counted here; they are never added to one another.
 */
export type Totals = {
  steps: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  ms: number
}

/**
 * Everything the mod knows about this session.
 */
export type Ledger = {
  /**
   * The last steps, newest last, capped; `dropped` is how many are no longer
   * listed, whose figures are in the totals all the same.
   */
  steps: readonly Step[]
  dropped: number
  /**
   * The steps whose cache was written again, capped the same way.
   */
  misses: readonly Step[]
  /**
   * The two sides, kept apart.
   */
  main: Totals
  agents: Totals
  /**
   * Turns finished, acknowledgement steps counted, and what those steps read
   * from the cache to say "done" in a line.
   */
  turns: number
  acks: number
  ackCacheRead: number
}

/**
 * A side with nothing on it.
 */
export const NO_TOTALS: Totals = {
  steps: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  ms: 0,
}

/**
 * A session nothing has happened in yet.
 */
export const NO_LEDGER: Ledger = {
  steps: [],
  dropped: 0,
  misses: [],
  main: NO_TOTALS,
  agents: NO_TOTALS,
  turns: 0,
  acks: 0,
  ackCacheRead: 0,
}

/**
 * The usage a stop chunk carries, in the journal's own shape.
 *
 * @param usage the chunk's usage, or null where the response carried none
 * @returns the four counters and the model, or null
 */
export function usageOf(
  usage: {
    model: string
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  } | null,
): StepUsage | null {
  if (usage === null) {
    return null
  }

  return {
    model: usage.model,
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
  }
}

/**
 * What the request carried in all: uncached input, what it read from the
 * cache and what it wrote there.
 *
 * This is the figure a cache write is judged against — the prefix as this
 * request saw it, not the context window.
 *
 * @param usage the step's usage
 * @returns the input tokens of the request, zero where there was no response
 */
export function prefixOf(usage: StepUsage | null): number {
  return usage === null ? 0 : usage.input + usage.cacheRead + usage.cacheWrite
}

/**
 * The last step of one loop, which is the step whose cache the next one reads.
 *
 * @param ledger the journal
 * @param agentId the loop, null for the main one
 * @returns the step, or null where that loop has not stepped yet
 */
export function lastStepOf(ledger: Ledger, agentId: string | null): Step | null {
  for (let at = ledger.steps.length - 1; at >= 0; at -= 1) {
    const step = ledger.steps[at]

    if (step !== undefined && step.agentId === agentId) {
      return step
    }
  }

  return null
}

/**
 * Whether a step did nothing but acknowledge: no tool call, a handful of
 * output tokens, and a step before it that had called tools.
 *
 * It re-read the whole prefix to write a line. The mod counts these and
 * leaves them alone: a brevity instruction is a plausible promise, not a
 * guarantee, and the only honest thing to do with one is measure it.
 *
 * @param step the step
 * @param previous the step before it in the same loop, or null
 * @param maxOutput the output ceiling under which a step is an acknowledgement
 * @returns whether it is one
 */
export function isAck(
  step: Step,
  previous: Step | null,
  maxOutput: number = ACK_MAX_OUTPUT,
): boolean {
  if (step.usage === null || step.tools > 0) {
    return false
  }

  return step.usage.output <= maxOutput && previous !== null && previous.tools > 0
}

/**
 * One side's totals with a step added.
 *
 * @param totals the side
 * @param step the step
 * @returns the side, one step on
 */
function withStepTotals(totals: Totals, step: Step): Totals {
  return {
    steps: totals.steps + 1,
    input: totals.input + (step.usage?.input ?? 0),
    output: totals.output + (step.usage?.output ?? 0),
    cacheRead: totals.cacheRead + (step.usage?.cacheRead ?? 0),
    cacheWrite: totals.cacheWrite + (step.usage?.cacheWrite ?? 0),
    ms: totals.ms + step.ms,
  }
}

/**
 * The journal with one step recorded: its line, its totals on the side it
 * belongs to, its miss where it had one, and the acknowledgement count.
 *
 * @param ledger the journal
 * @param step the step, its miss already judged
 * @param caps how many steps and misses stay listed
 * @returns the journal, one step on
 */
export function withStep(
  ledger: Ledger,
  step: Step,
  caps: { steps: number; misses: number } = {
    steps: STEPS_CAP,
    misses: MISSES_CAP,
  },
): Ledger {
  const previous = lastStepOf(ledger, step.agentId)
  const isMain = step.agentId === null
  const steps = [...ledger.steps, step]
  const over = Math.max(0, steps.length - Math.max(1, caps.steps))
  const misses =
    step.miss === null ? ledger.misses : [...ledger.misses, step].slice(-Math.max(1, caps.misses))
  const acknowledged = isAck(step, previous)

  return {
    ...ledger,
    steps: over === 0 ? steps : steps.slice(over),
    dropped: ledger.dropped + over,
    misses,
    main: isMain ? withStepTotals(ledger.main, step) : ledger.main,
    agents: isMain ? ledger.agents : withStepTotals(ledger.agents, step),
    acks: acknowledged ? ledger.acks + 1 : ledger.acks,
    ackCacheRead: acknowledged
      ? ledger.ackCacheRead + (step.usage?.cacheRead ?? 0)
      : ledger.ackCacheRead,
  }
}

/**
 * The journal with one turn closed.
 *
 * @param ledger the journal
 * @returns the journal, one turn on
 */
export function withTurn(ledger: Ledger): Ledger {
  return { ...ledger, turns: ledger.turns + 1 }
}

/**
 * The steps of one turn, in order.
 *
 * @param ledger the journal
 * @param turnId the turn
 * @returns its steps, as far back as the list goes
 */
export function turnStepsOf(ledger: Ledger, turnId: string): readonly Step[] {
  return ledger.steps.filter(step => step.turnId === turnId)
}

/**
 * The totals of a set of steps, both sides together — for one turn's line,
 * where the main loop and the subagents it started are one piece of work.
 *
 * @param steps the steps
 * @returns their five columns
 */
export function totalsOf(steps: readonly Step[]): Totals {
  return steps.reduce(withStepTotals, NO_TOTALS)
}

/**
 * The main loop's steps of each turn the journal lists, the running one left
 * out: what the circuit breaker's median is taken over.
 *
 * @param ledger the journal
 * @param running the turn under way, not counted
 * @returns one count per finished turn
 */
export function stepsPerTurnOf(ledger: Ledger, running: string): number[] {
  const counts = new Map<string, number>()

  for (const step of ledger.steps) {
    if (step.agentId === null && step.turnId !== running) {
      counts.set(step.turnId, (counts.get(step.turnId) ?? 0) + 1)
    }
  }

  return [...counts.values()]
}

/**
 * One main-loop step of a turn, by its index.
 *
 * @param ledger the journal
 * @param turnId the turn
 * @param index the step's index
 * @returns the step, or `null` when the journal does not list it
 */
export function stepAtOf(ledger: Ledger, turnId: string, index: number): Step | null {
  return ledger.steps.find(step => step.agentId === null && step.turnId === turnId && step.index === index) ?? null
}
