# cockpit

![Version](https://img.shields.io/badge/Version-0.3.0-blue)

One pane of tabs beside the transcript, and the `$.cockpit` noun other
plugins fill. `/cockpit` opens it and closes it again, and so does the
`[ Cockpit ]` button in the band above the prompt; `/cockpit files` opens it
on a named tab, and `/cockpit weather` answers with the tabs there are. Where the terminal is in its fullscreen layout and at least 110 columns
wide the pane docks beside the transcript; narrower, or on the main screen,
it opens as a dialog above the prompt, which Esc closes. The rail across the
top carries every tab with a hotkey, `1` to `9`, the selected one lit and the
rest dim; a tab that something landed on while you were looking elsewhere
wears a `•` until you select it. The open state and the selected tab are
kept in `$.store`, so a resumed session opens where you left it, as soon as
the first drawing says how wide the terminal is — and so is the session's
own record, so it opens on the work it left rather than on empty tabs.

The button is the command without the typing, and nothing more: it opens the
pane, and where the pane is up it reads `Close` and closes it. The band above
the prompt is shared, so the cockpit's row is drawn under whatever the
plugins beneath it drew there rather than over it; it stands down whole while
a survey holds the band, and `c` presses it while the band holds the keys —
a click in it, or ctrl+x tab. `button` turns it off, and the pane is then the
command's alone.

Both ways of asking for the pane ask for the keyboard with it, so the rail's
hotkeys and the arrows are live the moment it opens, and Escape hands the
keys back to the prompt without closing a docked pane. It is a request and
not a grant: the surface hands the keyboard over only while the prompt holds
it over an empty composer, so a click in the band — which is itself a way of
giving the band the keys — may well keep them, and the pane opens beside a
transcript you go on typing under. A pane the cockpit opened on its own never
asks: not the one a resumed session comes back to, not the one `autoOpen`
opens on the first edit. A pane that took the keyboard off an idle prompt
would answer the next thing typed with the rail's hotkeys.

## Installing

Two things are needed before the mod runs, both because function hooks are
still early access: **Claude Code 2.1.280 or newer**, and the environment
variable that switches the feature on.

From inside a Claude Code session:

```
/plugin marketplace add devohmycode/claude-mods
/plugin install cockpit@claude-devohmycode-mods
```

Or from the shell:

```bash
claude plugin marketplace add devohmycode/claude-mods
claude plugin install cockpit@claude-devohmycode-mods
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

## Walking it with the keyboard

Tab walks the rail, and the tab the ring reaches is the tab on screen —
there is nothing to press, and nothing shown that the ring is not on. Past
the last tab it comes back to the first rather than walking on into the
pane's close mark and the rows of the tab being shown, and Shift+Tab does
the same the other way round.

Enter on the tab under the ring is the way into what it drew: the ring moves
to the first row of the list, and from there Tab and the arrows walk the
rows, each one written out in the card under the list as it is reached. Both
ends of that list give the ring back to the rail, on the tab still being
shown. Escape hands the keys back to the prompt without closing a docked
pane, and `1`-`9` still select a tab from anywhere.

A tab another plugin contributed is the one place Enter is not the cockpit's
to answer. The ring cannot be led into a body this plugin did not draw: the
engine answers `$.ui.focus` with *no element of its own is drawn under that
key*, and a `ui.focus` hook may only land the ring on an element of the very
plugin the move was already heading at. So the press goes through whole and
is the contributing plugin's to hear — `ui.press`, on the tile keyed
`tab:<id>` — and what it does with it is its own: the Message tab opens the
pane it has of its own, focused, which Escape closes and the cockpit comes
back in its place. What the cockpit guarantees is the press, not the ring.

Neither row walks into the surface's own stops, and that is deliberate: the
close mark between a list and its rail is a step nobody meant to take. It
stays a click, Escape, or ctrl+x x — and another plugin's pane is still
`pane:next` and `pane:previous`, which are bound globally rather than to this
pane's Tab.

One thing the surface settles rather than the cockpit: in a pane, Tab and
the down arrow are one and the same move — `ui.focus` is raised for both,
with nothing in it that says which key was pressed — so the rail and the
rows cannot be given a key each. They are given a step each instead, which
is the rule above. The arrows do part company with Tab in one place: where
the tab's body is longer than the pane, up and down scroll it rather than
moving the ring, as they do in any pane.

Six tabs ship with it, and none of them is privileged: each is a
`CockpitTab` exactly like one a plugin adds — and `/config` leaves any of
them off the rail, a plugin's as readily as a built-in one.

That row is a line of text rather than one toggle per tab, and the reason is
worth stating: a tab another plugin contributes is not knowable when this
plugin's manifest is written, and `/config` has no row that picks several of
a list (`ConfigKind` has four kinds and none of them does). A
`config.describe` hook may rewrite a row's label, help and hidden flag, but
`ConfigDescribeResult` omits its kind and its options, so no dropdown can be
filled at runtime either. What *can* be written at runtime is the help under
the row — so that is where the ids live, rebuilt from the tabs actually
registered each time the menu lists it:

```
Tabs the cockpit leaves out                                   stats, tools
  Ids to leave out, comma-separated; empty draws them all.
  Registered now: session, usage, files, agents, message, stats, tools.
  Out: stats, tools.
```

It names what to leave *out* rather than what to keep, because the cockpit's
contract is that a plugin adds a tab in three lines and the tab appears: a
list of what to keep would swallow every tab written after the line was last
edited, silently, which is the one failure a plugin author could never debug
from their own side.

An id no registered tab carries is refused rather than written, and the menu
draws the reason beside the row with the ids there were to choose from — a
typo would otherwise hide nothing and leave the row looking as though it had
taken. An id that names nothing when the line is *read* is a different case
and is let through: the line outlives the plugins that were loaded when it
was written, and a session started without one of them should draw its rail
rather than refuse to.

A hidden tab is hidden to everything: the rail, the `1`-`9` hotkeys, the
flags, `$.cockpit.tabs()` and `$.cockpit.show`. `/cockpit stats` on one says
so — *Stats is hidden. /config → Tabs the cockpit leaves out brings it back*
— rather than "no tab called stats", which would send you looking for a typo
you did not make. Hide every one of them and the pane says where they went.

The cockpit never writes that line itself. Writing a `/config` row reloads
the module, so a plugin that wrote its own row would be restarting itself;
the row is the person's, and the reload it costs is theirs to ask for.

**Session** reads the model, the turn count, the context window and the cost
from `$.session`, over a two-row `Raster` sparkline of the context every
finished turn ended on — green while the window is roomy, amber past half,
red where compaction is near — and the weight of what is in the window now,
each category in the color the engine gives it. The sparkline is the
terminal's alone: no other surface has `Raster`, and there the tab draws its
numbers without it.

The account's own windows are not here. They belong to the account and not
to the session, and the tab below is where somebody asking what this costs
is looking.

Under the vitals, where `hostStats` is on or `/cockpit host` turned it over for
this session, sits what the machine itself is doing: the processor, the
memory (`75%  12.0G / 16.0G`) and the graphics card where one answers. No
part of the plugin API reports any of this, so each reading runs a command of
the host — and the section says which it cost: `Machine · read in 1.9s`.

A host has its own commands, so there is one probe per family and the cockpit
keeps the first that answers: `cat /proc/stat /proc/meminfo` on Linux, one
`top -l 1 -n 0` on macOS, one PowerShell over `Win32_Processor` and
`Win32_OperatingSystem` on Windows, tried in the order the session's own
paths suggest. For the card it is `nvidia-smi`, then `rocm-smi`, then the
kernel's own `gpu_busy_percent` for an AMD card with no tool installed. A
probe that fails is never run again this session, a host that answers none is
said so once and asked no more, and a machine with no card is drawn without
one. On Linux the processor is a share of the time between two readings, so
the first reading of a session draws a dash there and the next draws a
figure. The network is not read at all: its counters are totals, which would
be a second command for a figure nobody asked for.

A finished turn is what the figures above come from, and the first turn of a
session ends long after the pane could have been opened on this tab — so
looking at the tab takes a reading of its own, which marks no column: a
column is a turn that ended, and a tab someone looked at is not one. While
the tab is the one on screen that reading is taken again every thirty
seconds, since a window's reset counts down between turns. The reading is
`breakdown: "summary"`, estimated locally, so it sends nothing.

**Usage** is what the session cost, and what the account has left.

The four token counters the API reports — uncached input, output, cache read,
cache write — are folded one finished turn at a time off `turn.complete`'s
`usage`, which is the only place they are ever reported. A subagent's turn
goes on the ledger as readily as the main loop's, on a row of its own: a
subagent spends this session's tokens and the main loop never sees it. The
four stay four. Adding them would make one number out of four prices, and
every share drawn off that number would be a figure with no unit behind it —
so where the tab says the subagents wrote a fifth of the output, it is a
fifth of the output and it says so. Where two models answered, each gets a
row with its turns and what it wrote.

Under them sit the account's windows, as the last API response reported them:
`5-hour`, `Week`, and whatever else the account carries, each a bar of what is
spent and how long is left of it. A window past 80% is drawn in red. The
engine passes the kind the API gave, so a window this was not written against
— a weekly one for a single model family, say — is drawn under its own name
rather than dropped, and an account with no subscription reports none.

The cockpit does not poll for these. `session.measure` is raised by the
engine whenever the cost, the window or a plan window moves, which is exactly
when the tab is out of date: the reading arrives for nothing, and the
`sessionSeconds` poll is the backstop rather than the source.

Last is what each provider's skill listing adds to the system prompt: one row
apiece, how many skills it lists and what they cost every turn the prompt is
sent (`pdf-viewer   4 skills   ~76`). It comes off the same
`breakdown: 'summary'` the vitals do — estimated locally, no request sent.
A session lists more providers than the block has rows, so the list is cut
and a `Show more (9)` row under it draws the whole of it, the same press the
Files and Tools tabs cut their lists with; the total above that row counts
every provider whichever way the list stands.

**Stats** is the machine's own record: `~/.claude/history.jsonl`, one line
per prompt ever typed here, with its instant, its session and its project.
A contribution calendar across the weeks — a seven-row `Raster`, each cell
shaded against the busiest day of the window — then the prompts, the
sessions, the projects, the active days, the busiest day, the top project and
the two streaks, over all time or the last thirty or seven days.

It counts prompts and never tokens, and every line of it says so. The token
totals of a lifetime live in the transcripts: two gigabytes of them on this
machine, a hundred of those files past the 4 MiB `$.fs.read` will carry. A
tab that printed a token total off the part it could read would be drawing a
figure it cannot stand behind.

The file is read when the tab is first looked at and not before — it is a
file of somebody else's, and a session that never opens the tab never opens
it — and read once, not polled.

**Files** lists what Claude read and wrote this session, the files it kept
coming back to first, a write weighing twice a read. Beside the count sit the
lines that file moved — `+34 -7`, the lines in green and the lines out red,
added up over every edit of the session — and, in a repository, the letter
git gives it now: `M` for a change on disk, `A` staged, `?` untracked, `D`
gone, dim while the index does not hold it. The two
answer different questions on purpose, and a file edited four times that
reads as clean is worth seeing at a glance. Git is asked only while the tab
is the one on screen, and outside a repository it is not asked at all.

A row names the file from the root the session works in — the repository's,
or the working directory outside one — since the head every row of a project
shares is the part that says nothing, and the first a narrow column would
have spent its cells on. A file that root does not hold keeps its whole path,
because where it is says more than the steps back out to it; and what a row
arms, what the note names and what git is asked about is the file itself,
path and all.

A file counts whether a file tool named it or a shell command did: `cat`,
`sed`, `tee`, `cp`, a `>` redirection and the rest of a short table, read off
the command line and resolved against the session's working directory, so
`sed -n '1,20p' hooks/a.ts` and a `Read` of the same file are one row. A `cd`
moves that directory for the pieces after it, since `cd sub && cat a.ts`
reads `sub/a.ts`; a `cd` the tab cannot follow — `cd -`, a home, a glob —
drops the relative paths after it rather than rooting them where they are
not. On a Windows host a shell spells the drive from its own root, and
`/c/w/repo/a.ts` is listed where `C:\w\repo\a.ts` is, as one file. It is
a reading of a command rather than a record of a syscall, so it is drawn
narrowly: an operand counts only where it carries an extension, which keeps
directories, globs and `sed` scripts out of the tab and costs it the odd
extensionless `Makefile`. `bashFiles` turns it off.

Every row carries a button that arms the file: the next prompt goes out with
one note naming it, so `ask` on a row is a way of saying *this one* without
typing the path. The same button disarms it, and a prompt sent with nothing
armed carries nothing. Arming a second file keeps the first — a question is
as often about two files as about one — and they ride the prompt together,
in one block naming all of them rather than the same sentence over again.

What the note adds is a context block, which by the engine's own contract the
person never sees. So the button says `sent` on the row the file went from,
until another is armed; the tab is flagged in the rail for someone looking at
another one; and a toast says it where the pane is shut, a docked pane being
the news itself. A prompt that quietly carries something no one can see is
the one thing this row must not do.

A row is itself a button, and pressing it — a click, or Enter on it — opens
a card under the list where that one row is written out whole: how often the
file was touched, how, its own path rather than the short one the row draws,
and what it moved. Pressing it again closes the card. The card also follows
the focus ring, so Tab and the arrows walk the list while the pane holds the
keys and each row says its piece as it is reached, with nothing to press. The
Tools tab has the same card: a tally says its calls, its time and its
failures, and one of the last calls says what the line had to cut — the whole
command, and whether it ended well.

A list is drawn into the rows the body has, and where there are more it says
so on the last row: `Show more (6)` draws the whole of it instead, which the
surface then scrolls, and `Show less` puts it back. The tab keeps 80 files,
so that is what the whole of it is; the choice is a view and not a fact, so
it is not kept with the session's record.

**Tools** tallies every tool call with the time it spent and the calls that
failed or were denied, the tool it spent the most time in first, and lists
the last twelve calls with what each one was about. The two lists share the
body, half the rows to the tallies and the rest to the calls, and the same
`Show more` row draws both whole.

MCP calls are there like any other: they cross `tool.call` as
`mcp__<server>__<tool>`, and the tab draws them as `linear·create_issue` —
the prefix every one of them shares is most of that name, and a column of
those cut to fit reads as one tool called over and over. Where the pair is
still too wide it is the server that is cut, from its start, since the tool's
own name is what tells two rows apart. An MCP server names its arguments as
it pleases, so where none of them is one a built-in tool would use, the first
that reads as text stands in as the line's subject.

**Agents** is the session's record of what ran under it: every subagent and
teammate it started, each one under the agent that spawned it, with what it
was asked for and how long that took. A row's clock starts at the spawn
rather than at the poll that first saw it, and stops when the agent does; a
finished agent keeps its row and the status it ended on, since *what ran
here* is the question the tab answers and a row that vanishes on completion
answers it for two seconds. `$.agent.list()` is asked again every two seconds
while the tab is on screen, once on every spawn, and once at the end of every
turn — so the tab has a roster the first time it is opened.

## What a restart keeps

Four of these six tabs are the session's own record, and `claude --resume`
returns to a session rather than starting one — so the record returns with
it. A session's id is its transcript's name and a resume continues the
transcript it names, so the tallies are filed under that id: the same
session finds its own, while a `/clear` and a fork open a transcript of
their own, find nothing under it, and start on the empty tabs they are.

The record is written once a turn rather than once a call — thirty tool
calls cost one write, and the only thing a turn leaves out is what happens
after the last one ends, which is nothing a tab draws. It holds the files,
the tool tallies, the last calls, the sparkline's marks, the roster and the
ledger. The ledger is there because nothing else can hand it back:
`$.session.usage` answers the cost and the window at any moment, but the
four token counters only ever arrive one finished turn at a time, so a
resumed session that did not keep them would restart its own accounting at
zero. Not the vitals, which the Session and Usage tabs read fresh when they
are looked at and which would otherwise come back an hour stale; and not the armed file, since what
an armed file adds is invisible by the engine's own contract, and a side
effect nobody can see must not outlive the session that armed it.

`session.start` is not the only moment the record is read back. Writing any
`/config` row reloads the module — `register` runs again on an empty state —
and the session does not start over with it, so a cockpit that only restored
at `session.start` would go blank for the rest of a session the moment
somebody changed one of its own options. Hiding a tab is exactly such a
change, and nobody would connect the two. So a reload asks, once, whether
there is a record of a session already under way; a fresh load finds no id
and leaves it to `session.start`, and whichever of the two arrives first
does it while the other finds it done.

An agent still running when the session was left is closed at that moment
and reads `gone`, rather than counting through the hours nobody was there.
The store is the plugin's own and its four mebibytes are shared by every
session it has ever kept, so the eight most recent records stay and the
older ones are dropped at the next start.

## What it hooks

- `engine.create` — adds `$.cockpit` over the nouns beneath, and binds the
  engine the module's timers reach the world through.
- `session.start` — registers the built-in tabs and `/cockpit`, asks for the
  working directory and the repository's root the rows are drawn against,
  reads back the pane's open state and selected tab, restores this session's
  record under its own id, and drops the records of sessions nobody will
  resume.
- `ui.render{component=PromptHint}` — the first measurement of the terminal:
  its width and whether the layout docks a pane, which is what says whether a
  remembered pane can be reopened.
- `ui.render{component=AbovePrompt}` — the button above the prompt, drawn
  under what the plugins beneath the cockpit drew in the same band.
- `ui.render{component=Pane}` — the pane's own drawing: the rail, the rule,
  the selected tab's body, the footer.
- `command.run{command=cockpit}` — the toggle, the tab a name selects, and
  `host`, which turns the machine's readings over for this session.
- `config.describe{key=cockpit.language}` — names the languages there are,
  from `LANGUAGES` rather than from the manifest's list.
- `config.describe{key=cockpit.hideTabs}` — writes the help under that row
  from the tabs registered at the moment the menu lists it, which is the only
  moment a plugin's tab is knowable at all.
- `config.set{key=cockpit.hideTabs}` — tidies a typed line and refuses an id
  no registered tab carries, with the reason the menu draws beside the row.
- `ui.close{id=cockpit}` — a pane the person closed stays closed across
  sessions; one an unload closed does not.
- `ui.focus{plugin=cockpit}` — whether the pane holds the keys, and where the
  ring is: the tab it lands on is the tab shown, the row it lands on is what
  the card under a list is drawn from, and a move off either end of the rail
  comes back round to its other end.
- `tool.call` — times the call, tallies it, credits the files it touched and
  the lines it moved in them, and flags the Files tab on a write.
- `turn.complete` — every turn's tokens onto the ledger, a subagent's as much
  as the main loop's, since `usage` is the only place the four counters are
  ever reported; and for the main loop's turns alone, reads the vitals, marks
  the sparkline, folds the turn's agents into the roster, and writes the
  session's record.
- `session.measure` — the cost, the window and the plan windows, raised by
  the engine whenever one of them moves. It is the reading the Usage tab
  would otherwise poll for, handed over for nothing.
- `prompt.submit` — rides the armed file's note on the prompt.
- `agent.spawn` — notes when the agent started, flags the Agents tab, and
  refreshes the roster.

## What it calls on `$`

`$.agent.list`, `$.clock.after`, `$.clock.every`, `$.clock.now`,
`$.command.register`, `$.env.get`, `$.fs.read`, `$.process.run`,
`$.session.cwd`, `$.session.id`,
`$.session.model`, `$.session.repo`, `$.session.turns`, `$.session.usage`,
`$.store.delete`, `$.store.get`, `$.store.keys`, `$.store.set`,
`$.ui.close`, `$.ui.focus`, `$.ui.invalidate`, `$.ui.open`, `$.ui.resolve`,
`$.ui.toast`.

Five of those are the ones worth knowing about. `$.clock.now` runs twice per
tool call, which is how a call is timed. `$.session.usage` runs once per
finished turn of the main loop, once when the Session or Usage tab is looked
at and every thirty seconds while one of them stays on screen —
`breakdown: "summary"` sends no request, and `session.measure` brings the
figures in on its own between those readings — with
`$.agent.list` beside it at the turn. `$.store.set` runs once a finished
turn, for the session's record. `$.process.run` runs one
`git status --porcelain` every four seconds, and only while the Files tab is
the one on screen, in a session whose `$.session.repo()` answers a root —
asked once, at the start, since the rows are drawn against that root, so a
session outside a repository runs git never. It runs the machine's own
commands too, where those readings are on: one every five seconds while the
Session tab is open, two where a graphics card answers, and none at all
otherwise. `$.fs.read` runs exactly once a session, and only in one that
opened the Stats tab: `~/.claude/history.jsonl`, read when the tab is first
looked at and never again. `$.env.get` runs beside it, for the two names a
home directory may be spelled under — `USERPROFILE`, then `HOME`.

Each of those polls reads its own figure and nothing else: the agents list
every two seconds, git every four, the session every thirty (`sessionSeconds`)
and the machine every five (`hostSeconds`). A draw is another matter — the pane is one tree, so a repaint
redraws every tab's worth of it, but a repaint reads nothing: each tab draws
what its own poll already left in memory.

Nothing else is asked of the engine while the pane is closed, and both polls
stop with the pane and with the tab that needs them.

## The `$.cockpit` noun

A plugin that has something to show adds a tab from its own `session.start`
hook, which the engine awaits before the first prompt, so the rail is
complete by turn one. **It registers three plain fields and draws the body
itself**:

```tsx
on('session.start', async ($, e, next) => {
  await $.cockpit.tab({ id: 'tests', title: 'Tests', order: 15 })

  return next(e)
})

on('ui.render', { component: 'Pane' }, async ($, e, next) => {
  const below = await next(e)

  if (e.requestId !== 'cockpit') return below

  const rail = await $.cockpit.tabs()

  if (rail.find(tab => tab.id === 'tests')?.isSelected !== true) return below

  const body = view(await $.ui.resolve(e))   // keyed `cockpit:body`

  return foundIn(below, 'cockpit:body') === null
    ? body
    : filled(below, 'cockpit:body', body)
})
```

Why not a `render` the cockpit calls: **each plugin's hooks run in an
environment of its own**, and a call on another plugin's noun crosses that
boundary. Its arguments must be structured-cloneable, and a function is not —
the engine refuses the whole call, *the object can not be cloned*. Drawings
cross freely, since a tree is plain data and a Button's `onPress` stays in its
own environment under a handle the host keeps. So the cockpit is told that the
tab exists, leaves a node keyed `cockpit:body` where its body goes, and the
plugin puts its own drawing there from its own `ui.render` hook.

Whether that hook nests inside the cockpit's or outside it is nothing either
of them chooses, so the plugin reads the answer off the tree `next(e)` gives
it: a tree holding the slot means the cockpit has drawn and the body replaces
that node; a tree without one means the cockpit has yet to draw, and the body
is returned keyed `cockpit:body` for it to find. The cockpit handles both.

A tab of the cockpit's own module keeps its `render`, since it crosses
nothing: `draw` carries the surface's element table, the cells and rows the
body has, whether the pane holds the keys and how it sits, narrowed on
`surface` — so a tab that wants `Raster` or `Image` asks for the terminal
first.

Beside `tab` the noun has `drop`, `show`, `hide`, `mark`, `redraw` and `tabs`.
Every verb of `$` takes **one** input, its event's `e` — the engine refuses a
second — so a flag is `mark({ id: 'tests', badge: 3 })`, which says so in the
rail without stealing the view; `redraw` is what a tab calls when state of its
own moved, and `tabs` answers plain data, which is how a foreign tab knows it
is the one on screen.

The contract is [`types/index.d.ts`](types/index.d.ts); `/plugin-types` copies
it beside the engine's own declarations, so `$.cockpit` is typed in the session
you develop in with nothing copied by hand. `claude-message-mod/` is the first
plugin to fill it, and its README carries the engine's own words for each of
these refusals.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `en` | The language the cockpit draws in. English is the complete one and the others fall back to it line by line. It does not touch what you type. |
| `defaultTab` | `session` | The tab `/cockpit` opens on when the session has no tab of its own yet. |
| `hideTabs` | empty | Ids of the tabs to leave off the rail, comma-separated; empty draws them all. It covers what other plugins contribute as readily as the built-in tabs, and the help under the row names the ids registered right now. |
| `button` | on | Draw the `[ Cockpit ]` button in the band above the prompt, which opens the pane and closes it again. |
| `autoRaise` | off | Select the tab the work lands on — Files when Claude writes a file, Agents when it starts a subagent — instead of only flagging it. Only while the pane is already open; closed, the tab is flagged and you find the `•` when you open it. It never raises a tab you left out of the rail. |
| `autoOpen` | off | Open the pane by itself on Claude's first *write* of the session — a modification, not a read, and once only. Needs the fullscreen layout, and opens without taking the keyboard, since nobody asked for it at that moment. |
| `sessionSeconds` | `30` | Seconds between two readings of the session while the Session or Usage tab is open, held between 5 and 300. The reading is local, so this is about how fresh the figures are rather than what they cost — and `session.measure` brings them in on its own, so this is the backstop and not the source. |
| `hostStats` | off | Read the machine's processor, memory and graphics card while the Session tab is open. Off, no command of the host is ever run; `/cockpit host` turns it over for one session. |
| `hostSeconds` | `5` | Seconds between two of those readings, held between 2 and 60. It sets that reading alone. |
| `bashFiles` | on | Credit the Files tab with the files a shell command reads or writes, not only the ones the file tools name. Read off the command line rather than recorded — a reading, so it can be wrong — and capped at eight paths a command so one `rm` does not become the whole tab. |

Each is a row in the config menu, and a change there reloads the module with
the new options — which the session's record survives, since a reload reads
it back the way a resume does.

## Speaking another language

`language` sets what the cockpit draws in: the tab names in the rail, every
line in the tabs, and what `/cockpit` answers. It does not touch what you
*type* — `/cockpit session`, the ids in `hideTabs` and the command's own name
keep their spelling whatever the language, because those are written down and
a name that moved with the locale would be a name nobody could write down.

English is the complete bundle and the fallback. A language gives the keys it
has translated and no others, so a half-finished translation ships: it draws
its own words where it has them and English where it has not, key by key,
rather than leaving blanks.

Adding one is three lines:

1. **`hooks/say/<tag>.ts`** — `export const XX: PartialTexts = { … }`. The
   type is the guarantee: a key you leave out falls back, a key you *misspell*
   is a compile error, and a line that takes an argument is a function rather
   than a template the caller assembles — a sentence's word order is the
   translator's business, and a caller that glued two halves together would
   have decided it for them.
2. **One entry in `LANGUAGES`**, in `hooks/say/say.ts`.
3. **One string in the manifest's `language` options**, so `/config` offers
   it. That third line is the only duplication and it is unavoidable: a
   `config.describe` hook may rewrite a row's label and help but neither its
   kind nor its options, so the menu's list has to be declared. Until it is,
   the help under the row already names the language — that hook writes it
   from `LANGUAGES` itself.

Nothing else reaches for a tag: `sayOf` reads `LANGUAGES` and no call site
anywhere names a language, which is what makes the second line enough.

## Try it

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir claude-cockpit-mod
```

```powershell
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1"
claude --plugin-dir claude-cockpit-mod
```

Then `/cockpit`, or the `[ Cockpit ]` button above the prompt. A tab is
selected by clicking it, or by `/cockpit files`; the `1`-`9` hotkeys reach
the rail while the pane holds the keys, which it asks for when you open it
and Escape hands back. To
make it permanent rather than per-session, put the folder (or a link to it)
at `~/.claude/skills/cockpit`, which auto-loads next session as
`cockpit@skills-dir`.

The folder is watched: saving a file reloads the hooks module. Before a
session loads it,

```
claude plugin validate --strict claude-cockpit-mod
claude plugin test claude-cockpit-mod
```

read the manifest and the module the way the engine will, and run the tests
against the engine itself.

## What it does not do yet

- The sparkline is redrawn through `ui.render`, not `$.ui.blit`; a blit
  would repaint it without a render pass, which is the next thing to do.
- The pane does not hook `ui.scroll`: the surface scrolls a body longer than
  its window on its own, and it scrolls the whole tree, so the rail goes up
  with it. A tab drawing its list whole is worth a rail that stays put.
- The machine's readings have no network figure, and no graphics figure on
  macOS: what would give one there is `powermetrics`, which asks for root,
  and a cockpit tab is not worth a password.
- Only the terminal is exercised: the tabs draw on every surface, and the
  tests mount them on the terminal alone.
- `$.session.usage` is read when a turn ends and when the Session or Usage
  tab is looked at, so its numbers are from one of those moments rather than
  from the running instant; a turn that is still going does not move them.
  `session.measure` closes most of that gap for the cost and the windows, and
  none of it for the breakdown.
- The Usage tab's `Turn time` is the wall clock of the turns, tool time
  inside it — the engine reports that and not the API's own duration, so the
  tab says *turn* and never *API*.
- The Stats tab counts prompts, not tokens, and only the prompts
  `~/.claude/history.jsonl` holds. The token totals of a lifetime are in the
  transcripts: two gigabytes of them on the machine this was written on, a
  hundred of those files past the 4 MiB `$.fs.read` will carry and therefore
  unreadable outright. What a streaming read would give — the per-session
  token totals `/usage` attributes its last twenty-four hours from — is out
  of reach of a plugin as the API stands.
- A session's four token counters start at the turn the cockpit was loaded
  for. A session already under way when the plugin is added counts from
  there, and the tab has no way to say how much came before.
