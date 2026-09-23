import { describe, expect, test } from 'claude-code/testing'

import { NO_REMINDERS, afterCompaction, briefOf, reminderOf } from '../hooks/reminders'

const ENGINE = { kind: 'engine' }
const TODO =
  'The TodoWrite tool has not been used recently. If you are working on tasks that would benefit from tracking progress, consider using it; clean up the list when it goes stale. Never mention this reminder to the user.'

describe('the reminders, brief from the second time (T26)', () => {
  test('the first goes whole, the identical next ones brief', () => {
    let state = NO_REMINDERS
    const seen: string[] = []

    for (let i = 0; i < 3; i += 1) {
      const served = reminderOf(state, { type: 'todo_reminder', text: TODO, origin: ENGINE }, true)

      state = served.reminders
      seen.push(served.text)
    }

    expect(seen).toEqual([TODO, briefOf('todo_reminder'), briefOf('todo_reminder')])
    expect(state.counts['todo_reminder']).toEqual({ count: 3, bytes: 3 * TODO.length, brief: 2 })
  })

  test('a changed reminder is a changed constraint: whole, and the new anchor', () => {
    let state = reminderOf(NO_REMINDERS, { type: 'todo_reminder', text: TODO, origin: ENGINE }, true).reminders
    const changed = reminderOf(state, { type: 'todo_reminder', text: `${TODO} Two items open.`, origin: ENGINE }, true)

    state = changed.reminders

    expect(changed.text).toBe(`${TODO} Two items open.`)
    expect(
      reminderOf(state, { type: 'todo_reminder', text: `${TODO} Two items open.`, origin: ENGINE }, true).text,
    ).toBe(briefOf('todo_reminder'))
  })

  test('a hook\'s or a plugin\'s text, a type off the list, and the levers off go whole', () => {
    const once = reminderOf(NO_REMINDERS, { type: 'todo_reminder', text: TODO, origin: ENGINE }, true).reminders

    expect(reminderOf(once, { type: 'todo_reminder', text: TODO, origin: { kind: 'hook' } }, true).text).toBe(TODO)
    expect(reminderOf(once, { type: 'todo_reminder', text: TODO, origin: ENGINE }, false).text).toBe(TODO)

    const file = reminderOf(NO_REMINDERS, { type: 'file', text: 'x', origin: ENGINE }, true).reminders

    expect(reminderOf(file, { type: 'file', text: 'x', origin: ENGINE }, true).text).toBe('x')
  })

  test('a reminder shorter than its brief form goes whole every time', () => {
    const short = { type: 'todo_reminder', text: 'Use todos.', origin: ENGINE }
    const once = reminderOf(NO_REMINDERS, short, true).reminders

    expect(reminderOf(once, short, true).text).toBe('Use todos.')
  })

  test('every attachment is counted, levers or not', () => {
    const state = reminderOf(NO_REMINDERS, { type: 'deferred_tools_delta', text: 'abc', origin: ENGINE }, false)

    expect(state.reminders.counts['deferred_tools_delta']).toEqual({ count: 1, bytes: 3, brief: 0 })
  })

  test('after a compaction the next one goes whole again, the counts kept', () => {
    const state = reminderOf(NO_REMINDERS, { type: 'todo_reminder', text: TODO, origin: ENGINE }, true).reminders
    const compacted = afterCompaction(state)

    expect(reminderOf(compacted, { type: 'todo_reminder', text: TODO, origin: ENGINE }, true).text).toBe(TODO)
    expect(compacted.counts['todo_reminder']?.count).toBe(1)
  })
})
