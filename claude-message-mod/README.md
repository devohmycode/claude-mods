# message

![Version](https://img.shields.io/badge/Version-0.1.0-blue)

What another session sends lands in a tab instead of in the context.

A peer's delivery is written to the mailbox under your home directory, listed
in the **Message** tab beside the thread it belongs to, and announced in one
line — and the session's transcript does not grow by a byte. You read it and
decide: **Hand to Claude** puts it in the context and starts a turn, which is
the only moment it costs anything, or the field at the bottom answers it,
calling `SendMessage` in the session's own loop so that no model turn is
started to write three words.

It is the cockpit's fifth tab where a cockpit is seated, and opens a pane of
its own where none is.

## Installing

Two things are needed before the mod runs, both because function hooks are
still early access: **Claude Code 2.1.278 or newer**, and the environment
variable that switches the feature on.

From inside a Claude Code session:

```
/plugin marketplace add devohmycode/claude-mods
/plugin install message@claude-devohmycode-mods
```

Or from the shell:

```bash
claude plugin marketplace add devohmycode/claude-mods
claude plugin install message@claude-devohmycode-mods
```

Claude Code loads a hooks module only when
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is in the environment. Put it where
your shell keeps its variables rather than in front of one command —
otherwise the plugin is installed and its hooks never run.

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1       # bash, zsh
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1"     # PowerShell, this session
setx CLAUDE_CODE_ENABLE_FUNCTION_HOOKS 1         # Windows, once and for all
```

`claude --version` says which build you are on.

## Why

Two sessions on the same repository already write to each other, badly, at a
price nobody sees.

- **On the way out, the model writes.** `SendMessage` is a tool: to send three
  words to the session next door you write a prompt, the model reads it,
  decides to call the tool, composes the message and reads the result. A whole
  turn, in and out, for a sentence you already had in mind.
- **On the way in, it goes to the transcript.** A peer delivery is queued and
  becomes a message of the session — sometimes in the middle of a turn. Its
  cost does not stop there: it is paid again on every call after it, until the
  next compaction. A "by the way, I'm done" is three hundred tokens for good.

The repository's rule is that one compresses on the way in and never
afterwards. An inbound delivery is exactly that case, and `session.receive` is
the one place in the engine where the entry can be refused before it costs
anything.

## The tab

```
┌─ Cockpit ─ 1: Session · … · 7: Message ─────────────────────────────────┐
│ SESSIONS             │ tokenos                        working · claude-mods │
│ you · claude-mods-9a │ ───────────────────────────────────────────────────  │
│                      │                                                      │
│ ▸ ● tokenos          │ tokenos                                  • held 09:14│
│   ○ banc             │ M5 delivered, green capsule, 41 tests. The bench is  │
│   · claude-mods-79   │ free again from tonight, and the defer lever is out  │
│                      │ of the running — it saved eleven bytes over a whole  │
│                      │ session, which is nothing at all.                    │
│                      │ Show more (+312 characters) ☑ handing this one ✕ rem…│
│                      │                                                      │
│                      │ you                                             09:21│
│                      │ keep the bench for tomorrow                          │
│                      │ ✕ remove                                             │
│                      │                                                      │
│──────────────────────────────────────────────────────────────────────────── │
│ [ Hand to Claude (1 of 3) ]  Clear  Tell me when idle  ↻ refresh            │
│ ›: answer tokenos                                                   send ⏎  │
│ 1 sent without a model turn · 3 held · 812 bytes kept out of the transcript │
└─────────────────────────────────────────────────────────────────────────────┘
```

**A message is drawn whole.** The thread wraps every line itself, to the width
it has measured, and cuts only past `NOTE_CHARS` characters — where it does,
`Show more` under the message draws the rest, and draws it in place. That is
the same press the cockpit's Usage tab cuts its lists with, and it matters
more here: a thread that cut to two lines showed you the beginning of a
sentence and then made you hand the message to Claude to read the end of it,
which is the one thing holding the delivery was meant to avoid paying for.

The figure on that button is **characters**, counted — never added to the
bytes in the footer, which are a different quantity.

`• held` beside a message means it is on screen and not in the context:
reading it has so far cost nothing.

The three figures under it are **two counts and a length in bytes**, and they
are never added up — a total over two units says nothing. The bytes are
measured, not estimated: `bytesOf` counts the UTF-8 length of the delivery, so
an accent is two and an emoji is four.

### Three presses per message

Under every message: `Show more` where the thread cut it, `☐ hand this one`
where it is still held, and `✕ remove`.

**`☐ hand this one` picks what goes into the context.** Held messages pile up,
and the first version of this tab put one button over the pile: everything
went to Claude together or none of it did, which is a poor trade when one
message of five is the one that matters. Pick the ones worth paying for and
the button says exactly what will go — `Hand to Claude (2 of 5)`. Pick nothing
and it hands the pile over, as it always did. What is not picked stays on
screen and stays out of the context.

**`✕ remove` drops one message from the tab.** The mailbox keeps it: `$.fs`
has no delete, and this mod does not promise what the engine cannot do.
Dropping a held message is deciding never to pay for it, so the count of what
is held falls with it — while the bytes it kept out of the transcript stand,
because they were kept whatever is done with the message afterwards.

**`Clear` empties the thread and keeps the correspondent.** It used to build
the column out of the messages and move the selection to whatever was left,
so clearing a thread took the correspondent off the column, and the field at
the bottom — which only draws for a selected correspondent — went with them.
The person was left looking at a tab they could no longer write from.
Clearing what was said is not forgetting who said it: who this session has
spoken to is held apart from what was said, and nothing on this tab removes
it.

Each press addresses one message by its clock and its direction. Two
deliveries in one millisecond would share that address — and `✕ remove` would
take both — so a note is stamped with the first millisecond free in its
direction. That is a millisecond on a stamp drawn to the minute: nothing on
screen moves, the order is kept, and the file on disk carries the same stamp,
so a thread read back is recognised rather than doubled.

### Why the columns are held apart

A flex row shrinks its children to fit, and a `width` is a preference and not
a promise. The column of sessions, given 22 cells beside a thread whose text
wanted more, was drawn at 17 — and every row of it wrapped, so each session's
mark landed on a line of its own. Two things hold it now: `flexShrink={0}` on
that column, and a thread whose lines are **already inside their column**,
wrapped by `hooks/lines/` before the surface ever sees them. A body the mod
has measured is also a body the mod can page, which is what lets the thread
fill from the newest message backwards and stop where the pane does.

## What a delivery goes through

1. `session.receive` sees it before it is queued, matched on `origin.kind`:
   `peer` and `peer-send-message`, and nothing else. A task notification, a
   scheduled trigger and a Remote Control prompt are work the session was
   waiting for; holding one would stop that work rather than save a context.
2. **The disk first.** Until `$.fs.write` has come back, nothing is taken: a
   write that fails hands the delivery straight back to the engine, which
   queues it as it always did. A message that was neither kept nor queued
   would simply be gone, and that is worse than a message that costs.
3. **A person must be able to see it.** A session with `isInteractive` false
   never holds: nobody would ever press the button that hands it over.
4. It goes into the thread, flags the tab, raises a one-line toast, and the
   hook answers `{ consumed: "held in the Message tab" }` — not queued, not
   written to the transcript, never read by the model, and the reason logged
   under this plugin's name.

## Commands

| | |
|---|---|
| `/message` | opens the tab, or the pane where no cockpit is seated |
| Enter on the rail's **Message** tile | opens that pane over a cockpit that steps aside; Escape brings the cockpit back |
| `/message hand` | hands every held message to Claude at once |
| `/message hold` | turns the holding off for this session, and on again |
| `/message who` | answers with `ListAgents`' own listing of reachable sessions |

`/message hold` changes nothing on disk on purpose: `$.config.set` reloads the
module, which would take the session's thread with it.

`/message hand` answers *on their way* rather than *handed*: the engine refuses
`prompt.submit` from inside a `command.run` hook — it would wait on the turn
that hook is holding — so the hand-over is left to a timer, and the toast that
follows says when it landed.

## `$.message`

The mod adds a noun other plugins fill in turn — `send`, `hand`, `held` and
`counts`; the contract is `types/index.d.ts`. A plugin that runs several
sessions at once (`banc`, say) can write to them all without a model turn:

```ts
await $.message.send('tokenos', 'the bench is free again')
```

## The mailbox

Under `$USERPROFILE` or `$HOME`, in `.claude/message/`:

```
threads/<session>/<stamp>.json   one file per note, written once
```

One file per note rather than one file per thread, because `$.fs.write` writes
a whole file: a thread that appended would read and rewrite itself on every
delivery. The stamp is zero-padded so that a folder listing sorts oldest
first — `"9"` sorts after `"10"`, `"000…009"` does not.

## The frame a delivery arrives in

`session.receive` hands over `origin.kind` and the text, and nothing else —
no sender. But the text is wrapped, and the wrapper names one:

```
<cross-session-message from="uds:\\.\pipe\LOCAL\cc-msg-2a246fbc…">
the message itself
</cross-session-message>
```

The engine's own instruction to the model is to **copy that `from` as the `to`
of a reply**, so the address is read rather than guessed, and it is a
recipient that works. It is also the `messagingSocketPath` the register keeps
for that session — which is how a row gets a name: `test`, not
*another session*.

So the thread is filed by address, the column labels it from the register, and
what is drawn is the message with the frame taken off. The bytes counted are
the whole delivery, frame and all, since that is what the transcript would
have carried.

**And the hand-over puts a recipient back.** Taking the frame off takes the
`from` with it, so the prompt heads each message with the shortest recipient
that reaches its sender: its name where one session of the register answers
to it, the name *and* the address where two do, and the bare address where
nothing names it — `SendMessage`'s own rule, in its own words. The first
version headed them with the raw socket, and the receiving session spent
three tool calls on `~/.claude/sessions` working out who had written to it,
which costs more than the holding saved.

## The column of sessions

Read, not written. Claude Code keeps one small file per running session under
`~/.claude/sessions/<pid>.json`, and it holds what the column wants:

```json
{ "sessionId": "95934c24-…", "name": "test", "nameSource": "user",
  "status": "idle", "cwd": "C:\…\claude-mods", "updatedAt": 1789980624730 }
```

`name` is the name the session goes by — the one `/rename` sets, and the one
`SendMessage` takes — so a row of the column is a recipient the engine will
accept. `●` is a session at work, `○` one waiting at its prompt, and `·` a
correspondent known only from the thread — one this session heard from before
and cannot reach now. `▸` is the thread on screen.

The marks lead and the name follows, rather than the name being padded out to
put its mark on the right: a row padded to exactly its column's width is a
row that wraps the moment the column loses a cell.

The same three words head the thread — `working`, `waiting`, `not running` —
beside the folder the register says that session is in.

**This session is named at the head of the column**, `you · test`, by the same
register and therefore by the name another session would write to. A person
who has renamed two of them should not have to work out which one they are
sitting in.

The register is read every thirty seconds, which is a long time to wait after
renaming a session next door — so **`↻ refresh`, or `r` while the pane holds
the keys**, reads it again now and says what it found. Not from the field: an
`Input` with the focus takes every printable key alone, and Esc hands them
back.

**A reading, not a contract.** Nothing in `claude-code.d.ts` declares that
folder; it is the engine's own bookkeeping. A version that moved it would
leave this mod with an empty column and nothing worse: every field is checked
before it is believed, an unreadable file is skipped, and `/message who` stays
the authority, since it asks `ListAgents` itself.

This mod wrote a presence of its own for an afternoon. It published the
repository's folder as each session's name, so two sessions in one checkout
were both called `claude-mods` — a label that told them apart from nothing and
that `SendMessage` would have refused. The register was there all along.

## What this mod does not promise

- **`$.fs` has no `delete`.** The thread on disk is append-only. **Clear**
  and **✕ remove** empty the screen, not the folder, and nothing here will
  ever claim to purge it. What they do change is what the tab holds and what
  it counts, which is the decision a person is actually making.
- **A delivery with no frame names nobody.** A peer message that is not a
  `SendMessage` carries no address, so it is filed under *another session* and
  cannot be answered from the field.
- **The register is read, not declared.** `~/.claude/sessions` is the
  engine's own bookkeeping and no part of the plugin API. It is checked field
  by field and a version that moved it costs this mod its column, nothing
  else; `/message who` asks `ListAgents` and is the authority. A send to a
  name the engine does not know says so rather than failing quietly.
- **Holding is deciding in the model's place.** A delivery that was really
  coordinating two sessions — "stop, I'm taking that file" — arrives too late
  if nobody looks at the tab. Hence the toast, hence the visible count, hence
  `/message hold` and `/message hand` within reach at all times.
- **Not every surface has a text field.** The phone's element table has no
  `Input` yet: the thread reads there and the buttons still decide, but the
  answer is typed somewhere else.

## Costs

This mod calls no model. Its own spending is one `SendMessage` per answer —
the same call the model would have made, less the turn that made it — and one
`prompt.submit` per hand-over, which is a turn you asked for. Reading the
register is a listing and one small read per running session, every thirty
seconds, and nothing is written.

## Development

```bash
npx tsc -p claude-message-mod/tsconfig.json
claude plugin validate --strict claude-message-mod
claude plugin test claude-message-mod
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir claude-cockpit-mod --plugin-dir claude-message-mod
```

### How the tab is seated

It is not a `render` handed to the cockpit. **Each plugin's hooks run in an
environment of its own** — the debug log names them, `cockpit@inline (worker,
environment 1)`, `message@inline (worker, environment 2)` — and a call on
another plugin's noun crosses that boundary. Its arguments must be
structured-cloneable, and a function is not: the engine refuses the whole
call, and says so.

```
HooksError: interface.call: arguments are not plain data:
            The object can not be cloned.
```

So the tab is three plain fields, and the body is drawn from this mod's own
`ui.render` hook into the node the cockpit leaves keyed `cockpit:body`. A
drawing crosses where a function does not: it is plain data, and a Button's
`onPress` stays in its own environment under a handle the host keeps — which
is why the field and the buttons work from inside somebody else's pane.

Whether this mod's render hook nests inside the cockpit's or outside it is
nothing either of them chooses, so it reads the answer off the tree `next(e)`
gives it: a tree holding the slot means the cockpit has drawn and the body
replaces that node; a tree without one means the body is returned keyed
`cockpit:body` for the cockpit to find. `hooks/slot/` is that walk, and both
ways round are tested.

### The way in, and why it is a pane

Enter on the tile of the tab already shown is the cockpit's way into what a
tab drew, and it is the one thing that cannot cross. The cockpit may not put
the ring on an element it did not draw — `$.ui.focus` answers *no element of
its own is drawn under that key* — and a `ui.focus` hook may only land the
ring on an element of the plugin the move was already heading at. Neither
may this mod reach into the cockpit's pane: `$.ui.focus` takes *one of its
own sites*, and that pane is not one.

What does cross is the press. This mod hooks `ui.press` on the cockpit's own
tile, `{ plugin: 'cockpit', element: 'tab:message' }`, reads the rail before
the press runs — a tile that is not the shown one is the cockpit showing its
tab, not a person asking to go in — and answers with the one surface it may
ask the keyboard for: the pane it opens for itself.

The cockpit steps aside first, and that order is not a preference. `focus` is
a request the surface grants only while the prompt holds the keys over an
empty composer; a pane the person holds refuses it. A Message pane opened
beside the open cockpit would come up without the keyboard, which is the whole
of what was asked for. So `$.cockpit.hide()`, then the pane, `closeOnEscape`
and all — and the close hands the cockpit back on the same tab, where the
person closed it. `hooks/zoom/` is that rule, alone and pure, because the key
that raises it is the surface's own and no test can press it.

Two more refusals shaped this, each worth knowing:

- **A verb of `$` takes one input**, its event's `e`. `mark(id, badge)` is
  refused — *takes one input, its event's e* — so the flag is
  `$.cockpit.mark({ id, badge })`.
- **An element keeps its own plugin.** The field this mod draws into the
  cockpit's pane belongs to `message`, not to `cockpit`: a test presses it
  with `ui.press({ plugin: 'message', key })`, and the engine routes the
  press to the closure in this environment.

### What the tests reach

`claude plugin test` mounts the pane this mod opens for itself, and everything
the tab does is tested through it. `tests/cockpit.test.ts` goes further: it
seats a stand-in cockpit with `test(name, { plugins }, …)` — an inline plugin
that adds the `$.cockpit` noun in its own `engine.create` fold — and tests the
tab through it, both ways round the two render hooks can nest.

Writing that stand-in taught two things about an inline plugin, each from the
engine's own refusal:

- its `register` is read as a module is, so it sees none of the test file's
  imports or constants and fails with `is not defined` if it reaches for one;
- it may not call through the interface it captured in `engine.create` —
  *a hooks module behind the call is not admitted* — so it keeps what it saw
  in variables of its own and answers them from a command of its own.

What no test reaches is the real cockpit's layout, rail and hotkeys. Run the
two mods together and look.

The tsconfig includes `../claude-cockpit-mod/types`: the contract of
`$.cockpit` lives with the cockpit, once, and this mod reads it from there
rather than keeping a copy that would drift. It is a dependency of compilation
and not of execution — the call sits in a try/catch, and the mod runs with no
cockpit under it.
