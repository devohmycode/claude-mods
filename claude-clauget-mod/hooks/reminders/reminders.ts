/**
 * The reminders the engine injects again and again, and what they cost.
 *
 * `prompt.attachment` is raised for each attachment a request carries, and
 * some of them repeat word for word: a todo reminder, a mode's rules. The
 * first goes whole; the next ones identical to it go in a brief form that
 * points back at it (T26). A reminder whose text changed is a changed
 * constraint and goes whole — and becomes the one the next are compared to.
 *
 * The brief form stands only while the first is still in the context: a
 * compaction or a new session empties the record, and the next occurrence
 * goes whole again.
 *
 * Every attachment is counted by type, occurrences and bytes, whatever the
 * levers say: "injected 23 times, 14 kB in all" is a reading. The
 * `deferred_tools_delta` ones are what a deferral costs back (T21).
 *
 * Pure.
 */

import { bytesOf } from '../format'
import { hashOf } from '../instructions'
import { BRIEF_TYPES, TEXTS } from '../names'

/**
 * One type's count: occurrences, the bytes of the text as the engine made
 * it, and how many were served brief.
 */
export type ReminderCount = {
  count: number
  bytes: number
  brief: number
}

/**
 * What the mod knows of the session's attachments.
 */
export type Reminders = {
  /**
   * The hash of the occurrence each brief form points back at, by type.
   */
  first: Readonly<Record<string, string>>
  counts: Readonly<Record<string, ReminderCount>>
}

export const NO_REMINDERS: Reminders = { first: {}, counts: {} }

/**
 * The brief form of a repeated reminder.
 *
 * @param type the attachment's type
 * @returns the text
 */
export const briefOf = (type: string): string => `(${type}) ${TEXTS.brief}`

/**
 * What the model reads for one attachment, and the record after it.
 *
 * @param reminders the record so far
 * @param e the attachment: its type, its text, and who wrote it
 * @param isBrief whether the levers allow the brief form
 * @returns the text to answer and the record
 */
export function reminderOf(
  reminders: Reminders,
  e: { type: string; text: string; origin: { kind: string } },
  isBrief: boolean,
): { text: string; reminders: Reminders } {
  const was = reminders.counts[e.type] ?? { count: 0, bytes: 0, brief: 0 }
  const counted = { ...was, count: was.count + 1, bytes: was.bytes + bytesOf(e.text) }
  const isCandidate = isBrief && e.origin.kind === 'engine' && BRIEF_TYPES.includes(e.type)

  if (!isCandidate) {
    return { text: e.text, reminders: { ...reminders, counts: { ...reminders.counts, [e.type]: counted } } }
  }

  const hash = hashOf(e.text)

  // A reminder shorter than its brief form goes whole: pointing back at it
  // would cost more than repeating it.
  if (reminders.first[e.type] === hash && bytesOf(briefOf(e.type)) < bytesOf(e.text)) {
    return {
      text: briefOf(e.type),
      reminders: {
        ...reminders,
        counts: { ...reminders.counts, [e.type]: { ...counted, brief: counted.brief + 1 } },
      },
    }
  }

  return {
    text: e.text,
    reminders: {
      first: { ...reminders.first, [e.type]: hash },
      counts: { ...reminders.counts, [e.type]: counted },
    },
  }
}

/**
 * The record with the brief forms' anchors forgotten, the counts kept: what a
 * compaction leaves, since the first occurrences it summarised are gone.
 *
 * @param reminders the record
 * @returns the record
 */
export const afterCompaction = (reminders: Reminders): Reminders => ({ ...reminders, first: {} })
