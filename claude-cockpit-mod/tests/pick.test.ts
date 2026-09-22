import { describe, expect, test, tier } from 'claude-code/testing'

import { isPickable, pickKey, pickedOf } from '../hooks/pick'

tier('user')

describe('pick', () => {
  test('a key names the row it was made from', () => {
    expect(pickedOf(pickKey('file', '/w/a.ts'))).toEqual({
      kind: 'file',
      id: '/w/a.ts',
    })

    // A path holds colons of its own on a Windows host, and the id is the
    // whole of what follows the kind rather than the next word.
    expect(pickedOf(pickKey('file', 'C:/w/a.ts'))).toEqual({
      kind: 'file',
      id: 'C:/w/a.ts',
    })

    expect(pickedOf(pickKey('tool', 'mcp__linear__save_issue'))).toEqual({
      kind: 'tool',
      id: 'mcp__linear__save_issue',
    })

    expect(pickedOf(pickKey('call', '3'))).toEqual({ kind: 'call', id: '3' })
  })

  test('the keys a list carries for other reasons are not rows', () => {
    // The same rows carry keys that arm a file or open a tab; a ring landing
    // on one of those must not move the card under the list.
    expect(isPickable('arm:/w/a.ts')).toBe(false)
    expect(isPickable('tab:files')).toBe(false)
    expect(isPickable('more:files')).toBe(false)
    expect(isPickable(pickKey('file', '/w/a.ts'))).toBe(true)

    expect(pickedOf('arm:/w/a.ts')).toBeNull()
    expect(pickedOf(null)).toBeNull()
    expect(pickedOf('pick:weather:paris')).toBeNull()
    expect(pickedOf('pick:')).toBeNull()
  })
})
