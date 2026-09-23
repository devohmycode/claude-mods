/**
 * What the mod answers on `tool.call`, once the engine has answered: the
 * chain of pure treatments behind the mod's one hook on that event.
 *
 * The engine refuses a second `tool.call` hook without a matcher from the
 * same module, so every treatment the plan puts on a tool's result — the cap
 * today, the filing, the summary and the rest later — is a step of this
 * chain, and the register only relays what the chain decided.
 *
 * What `next(e)` resolves to carries a `ref` naming the engine's own
 * messages, and the declarations say a hook returning that object makes the
 * engine use them verbatim. The plan read that as "a spread with a new
 * `result` cuts nothing", and measured it on 2.1.280: it does not hold there.
 * A spread and even the same object mutated both took — the transcript
 * carried the shorter text and the model did not read the middle. The mod
 * still answers with its own `{ result }`, built fresh, because that is the
 * form the contract names for a hook's answer and the one that does not rest
 * on how the engine compares what came back.
 *
 * Pure.
 */

import type { ToolCallResult } from 'claude-code'

import { capOf } from '../cap'
import type { CapLimits } from '../cap'
import { CAP_TOOL } from '../names'

/**
 * The limits the chain works under, as the register read them off the
 * manifest.
 */
export type CallLimits = {
  cap: CapLimits
}

/**
 * What the chain decided.
 *
 * `kept`: the engine's answer goes up as it came, `ref` and all — the case of
 * every result the mod has no reason to touch, and the one that makes every
 * byte measured elsewhere comparable. `rewritten`: the mod's own answer, and
 * the bytes of the field it shortened, before and after.
 */
export type CallAnswer =
  | { kind: 'kept' }
  | {
      kind: 'rewritten'
      answer: ToolCallResult
      tool: string
      before: number
      after: number
      shown: number
    }

const KEPT: CallAnswer = { kind: 'kept' }

/**
 * Whether a value is a plain record, which a tool's structured result is.
 *
 * @param value anything
 * @returns true for a non-null, non-array object
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The mod's own answer: the result it built, and the engine's `context` where
 * there was one — a reminder another hook put after the result, which the
 * rewrite has no business dropping.
 *
 * Built field by field, so neither `ref` nor `text` rides along: both are the
 * engine's to set, `text` from the result by the tool's own mapper.
 *
 * @param result the result the model is to read
 * @param context what the engine's answer carried after it
 * @returns the answer a hook returns
 */
export function ownAnswerOf(result: unknown, context: readonly string[] | undefined): ToolCallResult {
  return context === undefined || context.length === 0 ? { result } : { result, context }
}

/**
 * The chain: what the mod answers for one call, given what the engine
 * answered.
 *
 * A refusal, an error, a tool without a cap, a cap that is off and a result
 * under it all come back `kept`. A Bash result over the cap comes back as a
 * record of the same shape, every field kept but `stdout`, so the engine's
 * check against the tool's output schema passes and its mapper renders it as
 * it would have rendered the original.
 *
 * @param tool the tool the call went to (`e.tool`)
 * @param got what `next(e)` resolved to
 * @param limits the limits in force
 * @returns the decision
 */
export function answerOf(tool: string, got: ToolCallResult, limits: CallLimits): CallAnswer {
  if (tool !== CAP_TOOL || got.deny !== undefined || got.isError === true) {
    return KEPT
  }

  const record = got.result

  if (!isRecord(record) || typeof record.stdout !== 'string') {
    return KEPT
  }

  const capped = capOf(record.stdout, limits.cap)

  if (capped === null) {
    return KEPT
  }

  return {
    kind: 'rewritten',
    answer: ownAnswerOf({ ...record, stdout: capped.text }, got.context),
    tool,
    before: capped.before,
    after: capped.after,
    shown: capped.shown,
  }
}
