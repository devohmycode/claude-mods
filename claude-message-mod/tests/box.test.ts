import { describe, expect, test, tier } from 'claude-code/testing'

import {
  boxOf,
  homeOf,
  noteNameOf,
  noteOf,
  noteTextOf,
  readbackOf,
  safeName,
  threadDirOf,
} from '../hooks/box'
import { READBACK_MAX } from '../hooks/names'

tier('user')

describe('box', () => {
  test('the home directory comes from whichever variable the host sets', () => {
    expect(homeOf('C:\\Users\\g', undefined)).toBe('C:/Users/g')
    expect(homeOf(undefined, '/home/g')).toBe('/home/g')
    expect(homeOf('', '/home/g')).toBe('/home/g')
    expect(homeOf(undefined, undefined)).toBeNull()
  })

  test('the mailbox sits under the home, one folder per session', () => {
    const box = boxOf('/home/g')

    expect(box.root).toBe('/home/g/.claude/message')
    expect(threadDirOf(box, 't-1')).toBe('/home/g/.claude/message/threads/t-1')
  })

  test('a session id that spells itself freely still writes a file', () => {
    expect(safeName('a/b:c d')).toBe('a-b-c-d')
    expect(safeName('///')).toBe('unnamed')
  })

  test('a folder of notes sorts oldest first as names, not as numbers', () => {
    const names = [noteNameOf(9, 0), noteNameOf(10, 0), noteNameOf(9, 1)]

    // The defect this padding exists for: `"9"` sorts after `"10"`, so an
    // unpadded stamp would read a thread back in the wrong order.
    expect([...names].sort()).toEqual([
      noteNameOf(9, 0),
      noteNameOf(9, 1),
      noteNameOf(10, 0),
    ])
  })

  test('a note goes to a file and comes back the same', () => {
    const note = { at: 12, kind: 'in' as const, who: 'tokenos', text: 'hé 🙂' }

    expect(noteOf(noteTextOf(note))).toEqual(note)
  })

  test('a half-written file is a file to skip and not a session to stop', () => {
    expect(noteOf('{"at":')).toBeNull()
    expect(noteOf('{"at":1,"kind":"sideways","who":"x","text":"y"}')).toBeNull()
    expect(noteOf('null')).toBeNull()
  })

  test('the readback takes the last notes, oldest first, and skips what is not one', () => {
    const names = [
      ...Array.from({ length: READBACK_MAX + 5 }, (_, index) =>
        noteNameOf(index + 1, 0),
      ),
      'notes.txt',
    ]
    const read = readbackOf(names)

    expect(read).toHaveLength(READBACK_MAX)
    expect(read[0]).toBe(noteNameOf(6, 0))
    expect(read[read.length - 1]).toBe(noteNameOf(READBACK_MAX + 5, 0))
  })
})
