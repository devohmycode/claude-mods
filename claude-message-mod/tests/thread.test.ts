import { describe, expect, test, tier } from 'claude-code/testing'

import { bytesOf, byteText, clockText, firstLineOf } from '../hooks/format'
import { ADDRESS_PREFIX, TEXTS, UNKNOWN_PEER } from '../hooks/names'
import { placeOf, seatOf } from '../hooks/roster'
import {
  EMPTY,
  bodyOf,
  fromOf,
  handOf,
  heldOf,
  labelFor,
  labelIn,
  peersOf,
  senderOf,
  threadOf,
  withFiled,
  withHanded,
  withIn,
  withOut,
  withWho,
  idOf,
  withoutNote,
  withoutThread,
} from '../hooks/thread'

tier('user')

/**
 * One session's address, as a delivery's frame spells it and as the engine's
 * register keeps the socket behind it.
 */
const ADDRESS = String.raw`uds:\\.\pipe\LOCAL\cc-msg-2a246fbc6c6ab`

/**
 * A delivery as it arrives: the message, wrapped.
 *
 * @param text the message
 * @returns the delivery
 */
const delivery = (text: string): string =>
  `<cross-session-message from="${ADDRESS}">\n${text}\n</cross-session-message>`

/**
 * Takes one delivery, measuring the whole of it as the hook does.
 *
 * @param state the thread
 * @param at when it arrived
 * @param who the key it is filed under
 * @param text the message, its frame already off
 * @returns the thread with it
 */
const took = (state: typeof EMPTY, at: number, who: string, text: string) =>
  withIn(state, at, who, text, bytesOf(text))

describe('format', () => {
  test('bytes are measured and not guessed, whatever the alphabet', () => {
    expect(bytesOf('abc')).toBe(3)

    // Two bytes for an accent, three for a CJK glyph, four for an emoji:
    // `length / 4` would answer 1 for each of them, which is the whole point
    // of measuring the one figure this mod puts a unit on.
    expect(bytesOf('é')).toBe(2)
    expect(bytesOf('文')).toBe(3)
    expect(bytesOf('🙂')).toBe(4)
  })

  test('the first line is the summary its sender was asked to write', () => {
    expect(firstLineOf('\n\n  done with M5  \nand the rest')).toBe('done with M5')
    expect(firstLineOf('')).toBe('')
  })

  test('a stamp that is not a time draws as nothing', () => {
    expect(clockText(0)).toBe('')
    expect(clockText(Number.NaN)).toBe('')
    expect(clockText(1_700_000_000_000)).toMatch(/^\d{2}:\d{2}$/)
  })

  test('bytes read with their thousands apart', () => {
    expect(byteText(1204)).toBe('1 204')
    expect(byteText(12)).toBe('12')
  })
})

describe('the frame a delivery arrives in', () => {
  test("the sender is the frame's own address, which is also the reply's", () => {
    expect(senderOf(delivery('Ho'))).toBe(ADDRESS)
  })

  test('a delivery with no frame names nobody, rather than guessing', () => {
    expect(senderOf('Ho')).toBeNull()
    expect(senderOf('Message from banc: hello')).toBeNull()
  })

  test('what is shown is the message, not the envelope it travelled in', () => {
    expect(bodyOf(delivery('Ho'))).toBe('Ho')
    expect(bodyOf(delivery('two\nlines'))).toBe('two\nlines')

    // A frame that was cut short still gives up its message.
    expect(bodyOf(`<cross-session-message from="${ADDRESS}">Ho`)).toBe('Ho')
    expect(bodyOf('  plain text  ')).toBe('plain text')
  })

  test('an address with no name is drawn by its tail, and no address by a word', () => {
    expect(labelFor(ADDRESS)).toBe(TEXTS.unknownPeer(ADDRESS.slice(-6)))
    expect(labelFor(ADDRESS)).toContain('6c6ab')
    expect(labelFor(UNKNOWN_PEER)).toBe(TEXTS.somePeer)
  })
})

describe('thread', () => {
  test('a held delivery counts once, in two units that stay apart', () => {
    const state = took(EMPTY, 10, ADDRESS, 'M5 delivered')

    expect(state.held).toBe(1)
    expect(state.bytes).toBe(bytesOf('M5 delivered'))
    expect(state.who).toBe(ADDRESS)
    expect(heldOf(state)).toHaveLength(1)

    // The footer never adds them: two counts and a length in bytes are three
    // quantities, and a total over them says nothing.
    const footer = TEXTS.counts(state.sent, state.held, byteText(state.bytes))

    expect(footer).toContain('1 held')
    expect(footer).toContain(`${bytesOf('M5 delivered')} bytes`)
    expect(footer).toContain('0 sent without a model turn')
  })

  test('the bytes are the whole delivery, the text only the message', () => {
    const whole = delivery('Ho')
    const state = withIn(EMPTY, 10, ADDRESS, bodyOf(whole), bytesOf(whole))

    expect(state.notes[0]?.text).toBe('Ho')
    expect(state.bytes).toBe(bytesOf(whole))
    expect(state.bytes).toBeGreaterThan(bytesOf('Ho'))
  })

  test('handing the held ones over releases them and counts what it cost', () => {
    const held = took(took(EMPTY, 10, ADDRESS, 'one'), 20, 'banc', 'two')
    const handed = withHanded(held, ADDRESS)

    expect(heldOf(handed)).toHaveLength(1)
    expect(heldOf(handed, 'banc')).toHaveLength(1)
    expect(handed.handed).toBe(1)

    // Still counted as held-on-arrival: what a session avoided at the door is
    // not undone by what it later chose to read.
    expect(handed.held).toBe(2)
  })

  test('handing over nothing changes nothing', () => {
    expect(withHanded(EMPTY)).toBe(EMPTY)
  })

  test('an answer is noted against the correspondent it went to', () => {
    const state = withOut(took(EMPTY, 10, ADDRESS, 'one'), 20, ADDRESS, 'ok')

    expect(state.sent).toBe(1)
    expect(threadOf(state, ADDRESS)).toHaveLength(2)
    expect(threadOf(state, ADDRESS)[1]?.isHeld).toBe(false)
  })

  test('the prompt a hand-over builds names every sender once', () => {
    const state = took(took(EMPTY, 10, 'tokenos', 'one'), 20, 'banc', 'two')
    const text = handOf(heldOf(state))

    expect(text).toContain('tokenos:\none')
    expect(text).toContain('banc:\ntwo')
    expect(handOf([])).toBe('')
  })

  test('a hand-over heads a delivery by the name the register gives it', () => {
    const state = took(EMPTY, 10, ADDRESS, 'Recois-tu ce message ?')
    const peers = peersOf(state, [
      { address: ADDRESS, name: 'claude-mods-9a', place: '', at: 20, isBusy: false },
    ])

    // What the model reads is a recipient it can copy, not the socket the
    // delivery travelled on.
    expect(handOf(heldOf(state), peers)).toContain(
      'claude-mods-9a:\nRecois-tu ce message ?',
    )
    expect(handOf(heldOf(state), peers)).not.toContain('pipe')
  })

  test('a sender the register does not name keeps its address, which always reaches', () => {
    const state = took(EMPTY, 10, ADDRESS, 'Ho')

    expect(handOf(heldOf(state), peersOf(state, []))).toContain(`${ADDRESS}:\nHo`)
  })

  test('two sessions of one name are told apart by the address beside it', () => {
    const other = String.raw`uds:\\.\pipe\LOCAL\cc-msg-99999999`
    const state = took(EMPTY, 10, ADDRESS, 'Ho')
    const peers = peersOf(state, [
      { address: ADDRESS, name: 'claude-mods', place: '', at: 20, isBusy: false },
      { address: other, name: 'claude-mods', place: '', at: 30, isBusy: false },
    ])

    // `SendMessage`'s own rule: the bare name only where it reaches one
    // session, and what tells two of them apart where it does not.
    expect(fromOf(peers, ADDRESS)).toBe(TEXTS.handFrom('claude-mods', ADDRESS))
    expect(handOf(heldOf(state), peers)).toContain(`${ADDRESS}):\nHo`)
  })

  test('a delivery that carried no frame is headed by a plain word', () => {
    const state = took(EMPTY, 10, UNKNOWN_PEER, 'Ho')

    expect(handOf(heldOf(state), peersOf(state, []))).toContain(
      `${TEXTS.somePeer}:\nHo`,
    )
  })

  test('the preamble says what the heads are for', () => {
    expect(TEXTS.handPreamble(1)).toContain('SendMessage')
  })

  test('the register file a session writes carries the name a head needs', () => {
    // The shape below is one the engine actually wrote, 2.1.278, taken from
    // `~/.claude/sessions/<pid>.json` while the two sessions of this
    // repository were writing to each other; the identifiers are stood in
    // for, the fields and their spelling are not.
    //
    // This is the whole chain the defect ran through — a socket read off a
    // delivery, a file read off the register, one row, one head — and it is
    // the reason the test carries a real frame rather than a tidy one.
    const socket = String.raw`\\.\pipe\LOCAL\cc-msg-545145ca20a86aa1c8669ac53c09ac47`
    const seat = seatOf(
      JSON.stringify({
        pid: 31_684,
        sessionId: 'b286a213-0000-0000-0000-000000000000',
        cwd: 'C:\\Users\\g\\Documents\\GitHub\\claude-mods',
        startedAt: 1_789_982_606_760,
        version: '2.1.278',
        kind: 'interactive',
        messagingSocketPath: socket,
        name: 'claude-mods-9a',
        nameSource: 'derived',
        status: 'idle',
        updatedAt: 1_789_982_607_086,
      }),
    )

    expect(seat?.address).toBe(`${ADDRESS_PREFIX}${socket}`)

    const state = took(EMPTY, 20, seat?.address ?? '', 'Recois-tu ce message ?')
    const peers = peersOf(state, [
      {
        address: seat?.address ?? '',
        name: seat?.name ?? '',
        place: placeOf(seat?.cwd ?? ''),
        at: seat?.at ?? 0,
        isBusy: seat?.isBusy ?? false,
      },
    ])

    expect(peers[0]?.place).toBe('claude-mods')
    expect(handOf(heldOf(state), peers)).toContain(
      'claude-mods-9a:\nRecois-tu ce message ?',
    )
  })

  test('notes read back from disk hold nothing, count nothing, and lose their frame', () => {
    const live = took(EMPTY, 30, ADDRESS, 'now')
    const state = withFiled(live, [
      { at: 10, kind: 'in', who: ADDRESS, text: delivery('before') },
      { at: 20, kind: 'out', who: ADDRESS, text: 'answered' },
    ])

    expect(state.notes.map(note => note.at)).toEqual([10, 20, 30])
    expect(state.notes[0]?.text).toBe('before')
    expect(heldOf(state)).toHaveLength(1)
    expect(state.held).toBe(1)
    expect(state.handed).toBe(0)
  })

  test('a note already in the thread is not read back twice', () => {
    const live = took(EMPTY, 10, ADDRESS, 'one')
    const state = withFiled(live, [
      { at: 10, kind: 'in', who: ADDRESS, text: 'one' },
    ])

    expect(state.notes).toHaveLength(1)
  })

  test('clearing a thread drops its notes and keeps the figures', () => {
    const state = withoutThread(
      took(took(EMPTY, 10, ADDRESS, 'one'), 20, 'banc', 'two'),
      ADDRESS,
    )

    expect(threadOf(state, ADDRESS)).toHaveLength(0)
    expect(threadOf(state, 'banc')).toHaveLength(1)
    expect(state.held).toBe(2)
    expect(state.bytes).toBeGreaterThan(0)
  })

  test('clearing keeps the correspondent, and keeps them selected', () => {
    // The defect this covers, in the person's own words: Clear emptied the
    // thread and the column with it, and there was nothing left to answer.
    // Clearing what was said is not forgetting who said it.
    const before = took(EMPTY, 10, ADDRESS, 'one')
    const state = withoutThread(before, ADDRESS)

    expect(state.who).toBe(ADDRESS)
    expect(peersOf(state, []).map(peer => peer.key)).toEqual([ADDRESS])
    expect(peersOf(state, [])[0]?.sendTo).toBe(ADDRESS)
  })

  test('one message is dropped on its own, and the rest of the thread stands', () => {
    const both = took(took(EMPTY, 10, ADDRESS, 'one'), 20, ADDRESS, 'two')
    const first = both.notes[0]
    const state = withoutNote(both, idOf(first ?? { at: 0, kind: 'in' }))

    expect(state.notes.map(note => note.text)).toEqual(['two'])
    expect(heldOf(state)).toHaveLength(1)

    // The bytes stand: they were kept out of the transcript whatever the
    // person does with the message afterwards.
    expect(state.bytes).toBe(both.bytes)
    expect(peersOf(state, [])).toHaveLength(1)
  })
})

describe('picking what goes over', () => {
  /**
   * Three held messages from one correspondent.
   */
  const three = took(
    took(took(EMPTY, 10, ADDRESS, 'one'), 20, ADDRESS, 'two'),
    30,
    ADDRESS,
    'three',
  )

  test('picking none hands the pile over, as the button always did', () => {
    expect(heldOf(three, ADDRESS, new Set())).toHaveLength(3)
    expect(heldOf(three, ADDRESS, undefined)).toHaveLength(3)
  })

  test('picking two hands exactly those two, and leaves the third held', () => {
    const picked = new Set(
      three.notes.filter(note => note.text !== 'two').map(idOf),
    )

    expect(heldOf(three, ADDRESS, picked).map(note => note.text)).toEqual([
      'one',
      'three',
    ])

    const handed = withHanded(three, ADDRESS, picked)

    // The one nobody picked is still on screen and still out of the
    // context, which is the whole point of picking.
    expect(heldOf(handed).map(note => note.text)).toEqual(['two'])
    expect(handed.handed).toBe(2)
    expect(handOf(heldOf(three, ADDRESS, picked))).not.toContain('two')
  })
})

describe('the column', () => {
  test('a message and a running session are one row, joined by their address', () => {
    const state = took(EMPTY, 10, ADDRESS, 'Ho')
    const peers = peersOf(state, [
      { address: ADDRESS, name: 'test', place: 'claude-mods', at: 20, isBusy: false },
    ])

    // The address a delivery came from is the socket the register keeps for
    // the session that sent it, so the two are the same correspondent.
    expect(peers).toHaveLength(1)
    expect(peers[0]?.label).toBe('test')
    expect(peers[0]?.sendTo).toBe('test')
    expect(peers[0]?.key).toBe(ADDRESS)
    expect(peers[0]?.isLive).toBe(true)
  })

  test('a correspondent the register does not have keeps its address to answer', () => {
    const state = took(EMPTY, 10, ADDRESS, 'Ho')
    const peers = peersOf(state, [])

    expect(peers[0]?.sendTo).toBe(ADDRESS)
    expect(peers[0]?.label).toContain('6c6ab')
    expect(peers[0]?.isLive).toBe(false)
  })

  test('the ones at work come first, then the most recent', () => {
    const peers = peersOf(EMPTY, [
      { address: 'uds:a', name: 'quiet', place: '', at: 100, isBusy: false },
      { address: 'uds:b', name: 'working', place: '', at: 10, isBusy: true },
    ])

    expect(peers.map(peer => peer.label)).toEqual(['working', 'quiet'])
  })

  test('a note is labelled by the column, and by its address where it is not there', () => {
    const state = took(EMPTY, 10, ADDRESS, 'Ho')
    const peers = peersOf(state, [
      { address: ADDRESS, name: 'test', place: '', at: 20, isBusy: false },
    ])

    expect(labelIn(peers, ADDRESS)).toBe('test')
    expect(labelIn([], ADDRESS)).toContain('6c6ab')
  })
})
