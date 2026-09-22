/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The tab's body: the correspondents down the left, a rule, the thread to
 * the right of it, and under a second rule the controls — the buttons, the
 * field that answers without waking the model, and the three figures.
 *
 * One function draws it, whether the cockpit is what mounts it or this mod's
 * own pane is — so the tests, which mount the fallback pane, are testing the
 * tab.
 *
 * Two things about the shape are worth saying out loud, because forgetting
 * either is what the first draft of this file got wrong.
 *
 * **A message is drawn whole.** The thread wraps every line itself, to the
 * width it has measured, and cuts only by the number of characters — past
 * `NOTE_CHARS` a `Show more` under the message draws the rest, which is the
 * press the cockpit's Usage tab cuts its lists with. A thread that cut to
 * two lines, as this one once did, showed a person the beginning of a
 * sentence and then made them hand the message to Claude to read the end of
 * it: the whole point of holding the delivery is that reading it is free.
 *
 * **A fixed column has to say it is fixed.** A flex row shrinks its children
 * to fit, and a `width` is a preference and not a promise: the left column,
 * given a width of 22 beside a thread whose text wanted more, was drawn at
 * 17 and every row of it wrapped. `flexShrink={0}` on that column, and a
 * thread whose lines are already inside their column, is what holds the two
 * apart.
 */

import type { CockpitDraw, RenderElement } from 'claude-code'

import { byteText, clockText, fitText } from '../format'
import { bodyLines, fitFrom } from '../lines'
import type { Body } from '../lines'
import {
  CLEAR_KEY,
  COMPOSE_KEY,
  DROP_PREFIX,
  HAND_KEY,
  MARK_BUSY,
  MARK_GONE,
  MARK_HERE,
  MARK_IDLE,
  MORE_PREFIX,
  NOTIFY_KEY,
  PEERS_COLUMNS,
  PEERS_MIN,
  PEER_PREFIX,
  PICK_PREFIX,
  REFRESH_HOTKEY,
  REFRESH_KEY,
  RULE_COLUMN,
  RULE_COLUMNS,
  RULE_ROW,
  SLOT_KEY,
  TEXTS,
  THREAD_MIN,
  TWO_COLUMN_MIN,
} from '../names'
import { heldOf, idOf, labelIn, threadOf } from '../thread'
import type { Note, Peer, State } from '../thread'

/**
 * What the tab needs from the register module: the thread as it stands when
 * the pane draws, and the six things a press or a submit does.
 */
export type MessageKit = {
  /**
   * The elements, the box and how the pane sits.
   */
  draw: CockpitDraw

  /**
   * The thread at draw time, read rather than closed over, so a tab drawn
   * after a delivery shows that delivery.
   */
  state: State

  /**
   * The correspondents, live sessions first.
   */
  peers: readonly Peer[]

  /**
   * Whether this session's next idle notice is already subscribed for the
   * correspondent on screen.
   */
  isNotifying: boolean

  /**
   * What this session itself goes by, as the register names it, or null where
   * the register has no row for it: what another session would write to.
   */
  self: string | null

  /**
   * Whether the person asked for this message whole.
   *
   * @param id the message, as `idOf` addresses it
   * @returns whether its `Show more` has been pressed
   */
  isAll: (id: string) => boolean

  /**
   * Draws one message whole, or folds it back to its preview.
   */
  showAll: (id: string, isAll: boolean) => void

  /**
   * Whether this held message is one of those the next hand-over takes.
   *
   * @param id the message, as `idOf` addresses it
   * @returns whether it has been picked
   */
  isPicked: (id: string) => boolean

  /**
   * Picks one held message for the hand-over, or unpicks it.
   */
  pick: (id: string, isPicked: boolean) => void

  /**
   * Drops one message from the screen; the mailbox keeps it.
   */
  drop: (id: string) => void

  /**
   * Reads the register again, now, rather than at the next reading.
   */
  refresh: () => void

  /**
   * Draws the thread of another correspondent.
   */
  select: (who: string) => void

  /**
   * Sends what was typed to the correspondent on screen.
   */
  send: (text: string) => void

  /**
   * Hands that correspondent's held messages to Claude.
   */
  hand: () => void

  /**
   * Drops that correspondent's messages from the screen.
   */
  clear: () => void

  /**
   * Asks that correspondent for one notice when it next goes idle.
   */
  notify: () => void
}

/**
 * One message with its body already measured: what the thread pages by, and
 * what it then draws.
 */
type Laid = {
  /**
   * The note itself.
   */
  note: Note

  /**
   * Its address, which keys its block and its `Show more`.
   */
  id: string

  /**
   * Its body, wrapped and possibly cut.
   */
  body: Body

  /**
   * The rows it takes: the blank line above it, its header, its lines, and
   * the `Show more` under it where there is one.
   */
  rows: number
}

/**
 * The rows a message takes beside its own text: the blank line that parts it
 * from the one before, the line that says who wrote it and when, and the row
 * of presses under it.
 */
const NOTE_CHROME = 3

/**
 * The rows the thread's own heading takes: the correspondent, and the rule
 * under them.
 */
const HEAD_ROWS = 2

/**
 * The rows the controls take under the thread: the rule, the buttons, the
 * field and the figures.
 */
const FOOT_ROWS = 4

/**
 * A rule across the body.
 *
 * @param ui the surface's element table
 * @param cells how wide
 * @returns the rule
 */
function rowRule(ui: CockpitDraw['ui'], cells: number): RenderElement {
  const { Text } = ui

  return <Text dimColor>{RULE_ROW.repeat(Math.max(1, Math.floor(cells)))}</Text>
}

/**
 * The rule between the correspondents and the thread.
 *
 * One `Text` of as many lines as the body has rows, rather than one element
 * per row: a column of elements would need a key apiece, and `Text` takes
 * none.
 *
 * @param kit the tab
 * @param rows how tall
 * @returns the rule, with its blank on either side
 */
function columnRule(kit: MessageKit, rows: number): RenderElement {
  const { Box, Text } = kit.draw.ui

  return (
    <Box key="rule" width={RULE_COLUMNS} flexShrink={0} justifyContent="center">
      <Text dimColor>
        {Array.from({ length: Math.max(1, rows) }, () => RULE_COLUMN).join('\n')}
      </Text>
    </Box>
  )
}

/**
 * One correspondent's row in the left column.
 *
 * The two marks lead, and the name follows: a row that padded the name out
 * to put its mark on the right was a row exactly as wide as its column, and
 * a column a flex row had shrunk by one cell wrapped every one of them.
 *
 * @param kit the tab's handlers and its draw
 * @param peer the correspondent
 * @param isSelected whether the thread on screen is this one's
 * @param cells the column's width
 * @returns the row
 */
function peerRow(
  kit: MessageKit,
  peer: Peer,
  isSelected: boolean,
  cells: number,
): RenderElement {
  const { Button } = kit.draw.ui

  // Working, waiting, or not running at all: the register says which, and a
  // correspondent known only from the thread says nothing.
  const mark = peer.isBusy ? MARK_BUSY : peer.isLive ? MARK_IDLE : MARK_GONE
  const head = `${isSelected ? MARK_HERE : ' '} ${mark} `

  return (
    <Button
      key={`${PEER_PREFIX}${peer.key}`}
      plain
      dimColor={!isSelected}
      onPress={() => kit.select(peer.key)}
    >
      {`${head}${fitText(peer.label, Math.max(4, cells - head.length))}`}
    </Button>
  )
}

/**
 * The left column: every session worth writing to.
 *
 * @param kit the tab
 * @param cells the column's width
 * @returns the column
 */
function peersColumn(kit: MessageKit, cells: number): RenderElement {
  const { Box, Text } = kit.draw.ui

  return (
    <Box key="peers" flexDirection="column" width={cells} flexShrink={0}>
      <Text bold>{fitText(TEXTS.peers, cells)}</Text>

      {/* This session, by the name another one would write to: the register
          names it as it names the others, and a person who has renamed two
          should not have to work out which one they are sitting in. */}
      <Text dimColor italic>
        {fitText(
          kit.self === null ? TEXTS.selfUnknown : TEXTS.self(kit.self),
          cells,
        )}
      </Text>

      <Box marginTop={1} flexDirection="column">
        {kit.peers.length === 0 ? (
          <Text dimColor wrap="wrap">
            {TEXTS.emptyPeers}
          </Text>
        ) : (
          kit.peers.map(peer =>
            peerRow(kit, peer, peer.key === kit.state.who, cells),
          )
        )}
      </Box>
    </Box>
  )
}

/**
 * The thread's heading: who is on screen, what the register says they are
 * doing, and the folder they are doing it in.
 *
 * @param kit the tab
 * @param cells the thread's width
 * @returns the heading and its rule
 */
function threadHead(kit: MessageKit, cells: number): RenderElement {
  const { Box, Text } = kit.draw.ui
  const who = kit.state.who
  const peer = who === null ? undefined : kit.peers.find(one => one.key === who)

  const name = who === null ? TEXTS.noPeerHead : labelIn(kit.peers, who)
  const doing =
    who === null
      ? ''
      : TEXTS.doing(
          peer === undefined || !peer.isLive
            ? TEXTS.gone
            : peer.isBusy
              ? TEXTS.busy
              : TEXTS.waiting,
          peer?.place ?? '',
        )

  // The right of the line is cut first and the name gets what is left: two
  // texts pushed apart by `space-between` overflow their row together, and
  // an overflowing row is what shrinks the column of sessions beside it.
  const tail = fitText(doing, Math.max(4, cells - 6))
  const head = fitText(name, Math.max(4, cells - tail.length - 1))

  return (
    <Box key="head" flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text bold>{head}</Text>
        <Text dimColor>{tail}</Text>
      </Box>
      {rowRule(kit.draw.ui, cells)}
    </Box>
  )
}

/**
 * The row of presses under one message: read the rest of it, pick it for
 * the hand-over, drop it from the screen.
 *
 * Three small presses rather than one pile of messages and one button. The
 * pile was the first shape of this tab, and it made the person's only
 * decision an all-or-nothing one: everything held went into the context
 * together or none of it did, which is a poor trade when one message of the
 * five matters. A press per message is what makes holding them worth
 * anything.
 *
 * It wraps: three labels do not fit a narrow thread, and a row that
 * overflowed would shrink the column of sessions beside it.
 *
 * @param kit the tab
 * @param laid the message, its body already measured
 * @returns the row, or null where the message has nothing to offer
 */
function actsRow(kit: MessageKit, laid: Laid): RenderElement | null {
  const { Box, Button } = kit.draw.ui
  const { note, id, body } = laid

  const isAll = kit.isAll(id)
  const isPicked = kit.isPicked(id)
  const hasMore = body.hidden > 0 || isAll

  return (
    <Box key={`acts:${id}`} flexDirection="row" gap={2} flexWrap="wrap">
      {hasMore ? (
        <Button
          key={`${MORE_PREFIX}${id}`}
          plain
          dimColor
          onPress={() => kit.showAll(id, !isAll)}
        >
          {isAll ? TEXTS.showLess : TEXTS.showMore(body.hidden)}
        </Button>
      ) : null}

      {/* Only a held message: an answer of this session's own and a message
          already handed over are both in the context, and picking one for a
          hand-over would mean nothing. */}
      {note.isHeld ? (
        <Button
          key={`${PICK_PREFIX}${id}`}
          plain
          dimColor={!isPicked}
          onPress={() => kit.pick(id, !isPicked)}
        >
          {isPicked ? TEXTS.picked : TEXTS.pick}
        </Button>
      ) : null}

      <Button
        key={`${DROP_PREFIX}${id}`}
        plain
        dimColor
        onPress={() => kit.drop(id)}
      >
        {TEXTS.drop}
      </Button>
    </Box>
  )
}

/**
 * One message of the thread: who and when on one line, the message under it,
 * and where it was cut the press that draws the rest.
 *
 * A held message wears its word, because held is the whole point: it says
 * that this text is on screen and not in the context, and that reading it
 * has so far cost nothing.
 *
 * @param kit the tab
 * @param laid the message, its body already measured
 * @param cells the thread's width
 * @returns the message's block
 */
function noteRow(kit: MessageKit, laid: Laid, cells: number): RenderElement {
  const { Box, Text } = kit.draw.ui
  const { note, id, body } = laid
  const isOut = note.kind === 'out'

  const stamp = clockText(note.at)
  const who = isOut ? TEXTS.you : labelIn(kit.peers, note.who)
  const head = `${who}${note.isHeld ? ` ${TEXTS.heldNote}` : ''}`

  return (
    <Box key={`note:${id}`} flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text bold={!isOut} dimColor={isOut}>
          {fitText(head, Math.max(4, cells - stamp.length - 1))}
        </Text>
        <Text dimColor>{stamp}</Text>
      </Box>

      {/* Already inside the column: the lines were wrapped against `cells`,
          so the surface has nothing left to break and the row beside this
          one is never shrunk to make room. */}
      <Text dimColor={isOut} wrap="wrap">
        {body.lines.join('\n')}
      </Text>

      {actsRow(kit, laid)}
    </Box>
  )
}

/**
 * The thread of the correspondent on screen, as many of its last messages as
 * the body has room for.
 *
 * @param kit the tab
 * @param cells the thread's width
 * @param rows the rows the two columns have between them
 * @returns the thread
 */
function threadColumn(
  kit: MessageKit,
  cells: number,
  rows: number,
): RenderElement {
  const { Box, Text } = kit.draw.ui
  const notes = threadOf(kit.state, kit.state.who)

  const laid: Laid[] = notes.map(note => {
    const id = idOf(note)
    const body = bodyLines(note.text, cells, kit.isAll(id))

    return { note, id, body, rows: body.lines.length + NOTE_CHROME }
  })

  const first = fitFrom(
    laid.map(one => one.rows),
    rows - HEAD_ROWS,
  )

  return (
    <Box key="thread" flexDirection="column" flexGrow={1} flexShrink={1}>
      {threadHead(kit, cells)}
      {laid.length === 0 ? (
        <Text dimColor wrap="wrap">
          {TEXTS.emptyThread}
        </Text>
      ) : (
        laid.slice(first).map(one => noteRow(kit, one, cells))
      )}
    </Box>
  )
}

/**
 * The row of buttons under the thread: what the person decides about what is
 * held, and what this session asks of the other one.
 *
 * @param kit the tab
 * @returns the row
 */
function buttons(kit: MessageKit): RenderElement {
  const { Box, Button } = kit.draw.ui
  const who = kit.state.who
  const held = heldOf(kit.state, who ?? undefined)
  const hasThread = threadOf(kit.state, who).length > 0

  // What this press will actually put in the context: the messages picked,
  // or every held one where nothing was picked. The label says which, so
  // that the count on the button is never a count of something else.
  const picked = held.filter(note => kit.isPicked(idOf(note))).length

  return (
    <Box key="acts" flexDirection="row" gap={2} flexWrap="wrap">
      {held.length > 0 ? (
        <Button key={HAND_KEY} onPress={() => kit.hand()}>
          {picked === 0
            ? `${TEXTS.hand} (${held.length})`
            : TEXTS.handSome(picked, held.length)}
        </Button>
      ) : null}
      {hasThread ? (
        <Button key={CLEAR_KEY} plain dimColor onPress={() => kit.clear()}>
          {TEXTS.clear}
        </Button>
      ) : null}
      {who === null ? null : (
        <Button
          key={NOTIFY_KEY}
          plain
          dimColor={!kit.isNotifying}
          onPress={() => kit.notify()}
        >
          {kit.isNotifying ? TEXTS.notifyOn : TEXTS.notify}
        </Button>
      )}

      {/* The register is read every thirty seconds, which is a long time to
          wait after renaming a session next door. `r` presses this while the
          pane holds the keys — never from the field, which takes every
          printable key it is given until Esc hands them back. */}
      <Button
        key={REFRESH_KEY}
        plain
        dimColor
        hotkey={REFRESH_HOTKEY}
        onPress={() => kit.refresh()}
      >
        {TEXTS.refresh}
      </Button>
    </Box>
  )
}

/**
 * The field the answer is typed in.
 *
 * Drawn without a `value`: the field's own text is the person's, and a
 * redraw — which a delivery landing mid-sentence asks for — would otherwise
 * put the hook's idea of the text back over what is being typed.
 *
 * Left out entirely where the surface has no `Input` at all, which today is
 * the phone: the thread still reads there, and the buttons still decide.
 *
 * @param kit the tab
 * @returns the field, or the line that says why there is none
 */
function compose(kit: MessageKit): RenderElement {
  const { Text } = kit.draw.ui
  const who = kit.state.who

  if (kit.draw.surface === 'mobile') {
    return (
      <Text key="compose" dimColor>
        {TEXTS.composeNoField}
      </Text>
    )
  }

  if (who === null) {
    return (
      <Text key="compose" dimColor>
        {TEXTS.composeNoPeer}
      </Text>
    )
  }

  const { Input } = kit.draw.ui

  return (
    <Input
      key={COMPOSE_KEY}
      label={TEXTS.compose}
      placeholder={TEXTS.composePlaceholder(labelIn(kit.peers, who))}
      submitLabel={TEXTS.submitLabel}
      autoFocus={kit.draw.isFocused ? true : undefined}
      onSubmit={value => kit.send(value)}
    />
  )
}

/**
 * The controls under the thread, parted from it by a rule: the buttons, the
 * field, and the three figures.
 *
 * @param kit the tab
 * @returns the block
 */
function foot(kit: MessageKit): RenderElement {
  const { Box, Text } = kit.draw.ui

  return (
    <Box key="foot" flexDirection="column" marginTop={1}>
      {rowRule(kit.draw.ui, kit.draw.columns)}
      {buttons(kit)}
      {compose(kit)}

      {/* Three figures in two units, side by side and never added up. It
          wraps rather than truncates: a narrow pane may take two rows for
          it, and dropping the bytes off the end would drop the one figure
          this mod measures. */}
      <Text dimColor wrap="wrap">
        {TEXTS.counts(
          kit.state.sent,
          heldOf(kit.state).length,
          byteText(kit.state.bytes),
        )}
      </Text>
    </Box>
  )
}

/**
 * The tab's tree.
 *
 * @param kit the draw, the thread, the correspondents and the handlers
 * @returns the tab's body
 */
export function messageView(kit: MessageKit): RenderElement {
  const { Box } = kit.draw.ui
  const isWide = kit.draw.columns >= TWO_COLUMN_MIN

  const peerCells = Math.max(
    PEERS_MIN,
    Math.min(PEERS_COLUMNS, Math.floor(kit.draw.columns / 3)),
  )
  const threadCells = isWide
    ? Math.max(THREAD_MIN, kit.draw.columns - peerCells - RULE_COLUMNS)
    : kit.draw.columns

  // The rows the two columns have between them: the pane's, less the block
  // of controls under them and the blank line that parts the two.
  const bodyRows = Math.max(HEAD_ROWS + 1, kit.draw.rows - FOOT_ROWS - 1)

  // Keyed with the cockpit's slot: the same body is either put into the
  // cockpit's drawing in place of that node, or returned under its key for
  // the cockpit to find. In this mod's own pane the key is simply a name.
  return (
    <Box key={SLOT_KEY} flexDirection="column">
      {isWide ? (
        <Box flexDirection="row">
          {peersColumn(kit, peerCells)}
          {columnRule(kit, bodyRows)}
          {threadColumn(kit, threadCells, bodyRows)}
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          {peersColumn(kit, kit.draw.columns)}
          {threadColumn(kit, threadCells, bodyRows)}
        </Box>
      )}
      {foot(kit)}
    </Box>
  )
}
