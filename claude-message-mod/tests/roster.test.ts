import { describe, expect, test, tier } from 'claude-code/testing'

import { ROSTER_TTL_MS } from '../hooks/names'
import {
  liveOf,
  placeOf,
  seatOf,
  seatsDirOf,
  shortOf,
} from '../hooks/roster'

tier('user')

/**
 * The socket the engine reaches one session at, spelled as Windows spells a
 * named pipe — the shape this has to survive being read from JSON.
 */
const SOCKET = String.raw`\\.\pipe\LOCAL\cc-msg-d481228c`

/**
 * One file of the engine's register, as it writes it: the fields this mod
 * reads, and the ones it steps over.
 */
const FILE = JSON.stringify({
  pid: 34664,
  sessionId: '95934c24-e326-44f0-ace1-0cf11d4cadab',
  cwd: 'C:\\Users\\Gildas\\Documents\\GitHub\\claude-mods',
  startedAt: 1_789_980_397_435,
  version: '2.1.278',
  kind: 'interactive',
  entrypoint: 'cli',
  messagingSocketPath: SOCKET,
  name: 'test',
  nameSource: 'user',
  nameSince: 1_789_980_624_680,
  status: 'idle',
  updatedAt: 1_789_980_624_730,
})

/**
 * One session of the register, for the tests that want a row.
 *
 * @param name what it goes by
 * @param at when it last said so
 * @param isBusy whether it is working
 * @returns the session
 */
const seat = (name: string, at: number, isBusy = false) => ({
  id: name,
  name,
  address: `uds:socket-${name}`,
  isNamed: false,
  isBusy,
  cwd: `/w/${name}`,
  at,
})

describe('roster', () => {
  test('the register sits where the engine keeps it', () => {
    expect(seatsDirOf('/home/g')).toBe('/home/g/.claude/sessions')
  })

  test("a session is read with the name it goes by, and whether that name is the person's", () => {
    const one = seatOf(FILE)

    expect(one?.name).toBe('test')
    expect(one?.isNamed).toBe(true)
    expect(one?.isBusy).toBe(false)
    expect(one?.id).toBe('95934c24-e326-44f0-ace1-0cf11d4cadab')
    expect(one?.at).toBe(1_789_980_624_730)

    // The address a delivery's frame carries: `uds:` and this socket, spelled
    // exactly as the engine spells it. It is what ties a message to a name.
    expect(one?.address).toBe(`uds:${SOCKET}`)

    // Forward slashes, as everything this mod builds a path with.
    expect(one?.cwd).toBe('C:/Users/Gildas/Documents/GitHub/claude-mods')
  })

  test('a session with no socket has no address, and is still a row', () => {
    const one = seatOf(
      JSON.stringify({ sessionId: 't-1', name: 'quiet', updatedAt: 10 }),
    )

    expect(one?.address).toBe('')
    expect(one?.name).toBe('quiet')
  })

  test('a derived name is read as one, and is still a name', () => {
    const one = seatOf(
      JSON.stringify({
        sessionId: 't-1',
        name: 'claude-mods-79',
        nameSource: 'derived',
        status: 'busy',
        updatedAt: 10,
      }),
    )

    expect(one?.name).toBe('claude-mods-79')
    expect(one?.isNamed).toBe(false)
    expect(one?.isBusy).toBe(true)
  })

  test('a file that is not one is skipped rather than believed', () => {
    expect(seatOf('{')).toBeNull()
    expect(seatOf('null')).toBeNull()
    expect(seatOf('{"sessionId":"t-1"}')).toBeNull()
    expect(seatOf('{"name":"test"}')).toBeNull()
  })

  test('this session is not one of its own correspondents, nor is a stale one', () => {
    const live = liveOf(
      [
        seat('self', 100),
        seat('warm', 90),
        seat('cold', 100 - ROSTER_TTL_MS - 1),
      ],
      'self',
      100,
    )

    expect(live.map(one => one.name)).toEqual(['warm'])
  })

  test('the ones at work come first, then the most recent', () => {
    const live = liveOf(
      [seat('quiet', 100), seat('working', 10, true), seat('older', 50)],
      'self',
      100,
    )

    expect(live.map(one => one.name)).toEqual(['working', 'quiet', 'older'])
  })

  test('an address with no name is told apart by the tail of its socket', () => {
    expect(shortOf(`uds:${SOCKET}`)).toBe(SOCKET.slice(-6))
    expect(shortOf('uds:abcdefghij')).toBe('efghij')
    expect(shortOf('ab')).toBe('ab')
  })

  test('a row says the folder a session works in', () => {
    expect(placeOf('C:/Users/g/Documents/GitHub/claude-mods')).toBe('claude-mods')
    expect(placeOf('/w/repo/')).toBe('repo')
    expect(placeOf('')).toBe('')
  })
})
