# clauget

![Version](https://img.shields.io/badge/Version-0.2.0-blue)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.280%2B-informational)

The scale, then the diet — and the diet only where the scale says it pays.

A session is not a conversation: it is a sequence of requests, each of which
re-reads everything before it. The turn where Claude reads three files, runs
the tests and edits two lines is six requests and six re-readings of the whole
context. `turn.step` is raised once per request, and the stop chunk that ends
its stream carries the four token counters the API reported and the model that
answered — so the real cost of a session is already passing through the chain,
and relaying it costs nothing.

Out of the box the mod reads it, and that is all it does: it cuts nothing,
defers nothing, summarises nothing, rewrites nothing. **`/clauget on`** turns
the levers on, from the next session — each one measured on a real session
before it stayed, and the ones that lost closed and named below. The plan's
own lesson is why: **a mod of economies was written in this repository before,
measured, and removed** — the real savings were far below the estimated ones,
and one of its levers cost context instead of returning any.

## Measured, before and after

The same task, twice, on Claude Code 2.1.280 with sonnet, 23 September 2026:
a 500-line `sed`, one file read twice, and a search delegated to a subagent
of the model's choosing. Without the mod, then with `/clauget strict`. Both
answered the same, correctly. Each figure is traced to where it comes from,
and no two units are added together.

| | without | with | where it comes from |
| --- | --- | --- | --- |
| dollars | $0.479 | **$0.319** | the engine's `total_cost_usd` |
| bytes of tool results the model read | 28 102 | **6 095** | measured on the transcript |
| main loop: tokens read from / written to the cache | 366 981 / 60 659 | 345 495 / 52 346 | the engine's counters, per step |
| subagent: tokens read from / written to the cache | 96 106 / 52 498 | 43 598 / 14 597 | the engine's counters, per step |
| steps: main / subagent | 5 / 3 | 5 / 5 | counted |
| wall time | 39.7 s | **61.5 s** | the engine's `duration_ms` |
| what the mod showed the model | 0 chars | 1 870 chars | the mod's own column |
| engine calls the mod made | 126 | 158 | the mod's own column |

The session was a third cheaper and **half again as slow**: the model chose
the explorer, which ran on haiku in five steps where Explore ran in three. The
Bash output was cut to its head and tail and filed; the second read of the file
was answered as unchanged without running the tool; nothing was read back.

Lever by lever, as each milestone measured it on a real session — the ones
that gained nothing are named as such:

| Lever | Measured | Verdict |
| --- | --- | --- |
| result rewrite (J1) | the engine keeps a hook's rewrite, `ref` or not | holds |
| bill, counters (J2) | 806 tools, each with one provider; nothing shown to the model | holds |
| deferring tools (T20) | the engine already defers every MCP server here | nothing to do on this machine |
| withdrawing an agent type (T23) | −28 tokens per request | small gain |
| the context block (T27) | its first version cost 43 tokens more than it saved | fixed: only what the model acts on |
| brief reminders (T26) | none repeated in the sessions measured | not observed |
| cuts on results (T33, T36) | 30 387 → 13 189 bytes, 0 rereads | holds |
| a cut saving a third | read back at 10 kB for 3 kB saved | closed: no cut under half |
| the explorer (T43) | its steps re-read ~5 500 tokens against 14 000–53 000 for Explore | holds, slower |
| lower effort after a mechanical step (T47) | the provider rewrote 75 897 cached tokens at the switch | **lost — closed** |
| lightening the compaction (T51) | the summarizer read 558 bytes instead of 18 733; −6 to −10 % | holds |
| rereads after a compaction (J6's measure) | 0 with, 0 without | nothing to save in the sessions measured |
| the facts fork (T53) | a headless `/compact` forks a cold snapshot and gets nothing | not observed live |
| the cache ping (T58) | its two hypotheses are not measured | off |
| loop guard, switch guard, breaker, detour (T44–T49) | tested, not triggered in the sessions measured | no figure yet |

## The one lever, and the pilot

**`/clauget on`**, **`off`** or **`strict`** writes one row, the economy, which
every lever left off in its own row follows: `on` turns on the levers on the
prefix, the cuts, the levers on the steps and the compaction; `strict` also
compacts by itself and arms the circuit breaker. It writes nothing when the row
already says so — a write reloads the module — and a session keeps the policy
it started with: the change takes effect from the next one.

- **The tiers.** The fullest plan window, as the engine pushes it after each
  turn, sets a tier: from 60 % the cuts are tighter, from 80 % the compaction
  is proposed at the end of the task, from 92 % the mod says so and stops
  compacting or stopping a turn on its own. A tier moves at most once in three
  turns and steps down only ten points under where it stepped up. It drives
  budgets and proposals only — never a description, a listing or a context
  block, which would cost the cache.
- **The forecast.** When a window fills before its reset at the last hour's
  rate, one line says when, with a range and its method: a straight line fitted
  over the hour, the range from the slopes of its two halves — load is not a
  straight line, and the line says so.
- **Later.** `/clauget later <prompt>` defers a prompt to the fullest window's
  reset: it is sent once, after that time, never during a turn; `/clauget later`
  lists them, `/clauget cancel` empties the list. **A deferred prompt starts by
  itself at the reset — at three in the morning if that is when it falls.** The
  list lives with the session: a closed session sends nothing.
- **Nobody watching.** A `-p` run, the SDK or a scheduled task gets the
  strictest profile — the cut budgets halved — and the quietest: nothing is
  drawn but log lines, no status, no toast.

## What it gives you

**A line per model request**, in the debug log: what the request read from the
cache, wrote to it, carried uncached and produced, which model answered, how
many tools it called and how long it took. The main loop and every subagent
are counted apart, because a subagent has a prefix of its own.

**The cache misses, named where they happen.** In a normal step the cache
write is small — the last tool result. When it suddenly amounts to the
request's whole input, the prompt cache was lost, and that is paid at once and
in silence. The mod sees it at the very request where it happens and names the
cause from what it saw between the two steps:

| Cause | What it means |
| --- | --- |
| `wait past the cache TTL` | more than five minutes went by; the prefix had to be written again |
| `model changed` | each model has its own prefix cache; switching rewrites it whole |
| `invalidation` | somebody asked the engine to re-run a cached event — this plugin or another |
| `configuration written` | writing a `/config` row reloads the module that owns it |
| `plugin reloaded` | this module was rebuilt while the session ran |
| `first request, nothing to read yet` | not a fault: the cold start of a loop |
| `cause not seen` | the write happened and the mod will not invent a reason |

**Two lines per turn**, dim in the transcript: what the turn's requests cost
as the engine reported it, and — beside it, never under it — what the mod
itself spent to know that.

**A tab in the [cockpit](../claude-cockpit-mod/)** where one is seated, with
the same lines. No cockpit, no tab, and nothing else changes.

## What it costs

Nothing the model reads. The per-turn lines go to the transcript through
`$.ui.log`, which draws them like a system notice and does not send them to
the model; the per-step lines go to the debug log. A ticket that entered the
context would cost exactly what it measures.

What the mod does spend is printed on its own line, every turn:

```
clauget · mod · 0 model calls · nothing shown to the model · 14 engine calls · (counted)
```

Out of the box that is the whole bill: no model call, not one character where
the model reads, and the engine calls are its own reads of the clock, the store
and the disk. With the levers on, the same line counts what they cost: every
marker, note and block the mod puts where the model reads, in characters; the
report's counted breakdown and the compaction's fork, as model calls with their
tokens. The explorer's line in the agent listing is counted the same way.

## The Bash cap, off by default

One rewrite, and only when its row is set: a Bash `stdout` longer than the cap
is cut to its head and its tail, whole lines, with one line between them:

```
[clauget: 4523 lines, 21903 bytes cut]
```

It happens on the way up from `tool.call`, when the engine has run the command
and the result has not yet entered the transcript — the one moment a content
can be made shorter without costing a cache. `stderr` and every other field of
the record go through untouched, so the result still matches Bash's output
schema; a result under the cap goes up exactly as the engine made it. Each
rewrite writes one line to the debug log, in bytes:

```
clauget · Bash · stdout capped · 23 905 → 2 042 bytes
```

This cap is the bench that proves a rewrite reaches the model, before any other
tool gets one. It was checked on a real session (Claude Code 2.1.280): with the
cap at 2 048 bytes, the transcript carried 2 042 bytes where the uncapped
control carried 23 905, and the model, asked for a line printed in the middle
of the output, answered that it had not seen one — the control read it back
exactly.

## The report: `/clauget`

The bill, read off the engine. `/clauget` asks for a counted breakdown of the
window — the one place the mod does, since `full` sends a token-count request
per tool and memory file — and prints, as dim transcript rows the model never
reads:

- the journal's lines and the mod's own column;
- the window and the cost as the engine last pushed them (`session.measure`,
  never polled);
- **the bill**: one line per provider of the prefix — a plugin, an MCP server,
  the instruction files, the engine — each naming the breakdown field its
  figure came from (`mcpTools`, `agents`, `skills`, `slashCommands`,
  `memoryFiles`). The engine's line carries the rest of `totalTokens` no
  detail claims, so the lines add up to the total; deferred schemas are a
  column apart, since they are outside the window;
- beside each provider of tools, **how often they were called**: calls, and
  in how many of the sessions counted. The counters live in
  `~/.claude/clauget/usage.json`, added to by every session;
- **the break-even of deferring**, computed and not applied:
  `front = schema × steps × 0.1` against
  `deferred = P(used) × (prefix × 0.1 + search)`, every parameter printed;
- the tools listed, counted by the provider `tool.describe` named — one each;
- the instruction files, their weight, and any paragraph two of them repeat
  word for word, spaces aside. The mod says so and touches nothing: those
  files are yours.

The command answers with no text, because a command's output row is read by
the model, and it writes no configuration row and asks for no invalidation.
The same lines go to `~/.claude/clauget/<session>.report.txt`, which is where
a headless run finds them. Registering the command does not put it in front
of the model either: checked on 2.1.280, a session asked to find `clauget`
among its tools, skills and commands found nothing, while it quoted a skill's
line word for word.

## The levers on the prefix, off by default

A byte of the prefix is re-read at every request, so the prefix is where the
savings are — and where a mistake costs most, since the engine caches the
answers that shape it. The **Levers on the prefix** row turns on a policy
decided once, at each session's start, from the usage counters, and never
moved after: a tool used heavily this very session stays where the policy put
it until the next one.

| Lever | What it does | When |
| --- | --- | --- |
| defer (T20) | a provider's tools go behind ToolSearch | the break-even says so, with the schemas' weight from a past report; or used in under 10% of sessions when none weighed them |
| bring back (T21) | a deferral that lost comes back in front | two calls or more to its tools in one session; next session only |
| keep in front (T22) | a tool the engine defers stays in the prompt | it served 80% of sessions |
| agents (T23) | an agent type is not offered — neither listed nor dispatched | this project never dispatched it; the **Agent types never offered** row adds or keeps any |
| commands (T24) | a command leaves the typeahead and `/help`, and still runs typed in full | only the ones the **Commands hidden** row lists |
| scope (T25) | a project instruction file outside the working directory's ancestry is left out | always, with the levers on; your own, managed, memory and `@`-imported files stay |
| brief reminders (T26) | a reminder repeated word for word points back at its first occurrence | from the second, while the first is in context, and only if the brief form is shorter |
| block (T27) | one short context block names the providers the model now has to search for | only then: nothing to say, no block |

Nothing is judged unused before ten sessions of history. The system prompt's
sections are shown in the report with their weight and never removed (T30);
condensing a skill's prompt (T29) and trimming tool descriptions (T31) are not
opened.

What was measured on this machine (Claude Code 2.1.280), same task, levers off
then on with one agent type withdrawn by hand: the prefix of the first request
went from 28 755 to 28 727 tokens, and no lever moved after it. The first
version of the block named the withdrawn agents too, and cost 43 tokens more
than it saved: it now names only what the model acts on. The bulk of this
machine's prefix is elsewhere — the deferred tools' names (34 kB of one
attachment) and the MCP servers' instructions (23 kB) — which no lever here
touches yet.

## The cuts on what enters, off by default

The one free moment to make a content shorter is before it enters the
transcript. The **Cuts on what enters** row turns on, from the next session,
a cut for each shape of fat — made on the way up from `tool.call`, never after:

| Cut | What the model reads instead |
| --- | --- |
| Bash (T33) | head, tail, the count of lines cut, and the middle's error lines whole |
| Grep, content mode (T33, T37) | at most 20 matches per file before the budget, and no line it was already shown |
| an MCP tool's JSON (T35) | arrays to 20 items and `+N more`, strings to 500 chars and their length; every key kept |
| a subagent's report (T40) | its conclusion first, its opening cut |
| the same Read again, file unchanged (T36) | the engine's own `file_unchanged` answer; the tool does not run |
| a Read overlapping lines already read (T37) | only the new lines, as a true window, and a note where the rest is |
| a Read after an edit (T38) | the changed span, and a note that every other line is as read |
| a long file read whole, first time (T34) | its first 60 lines, and a table of its declarations with their line numbers |
| noise (T39) | colour codes, redrawn lines, progress bars, repeats and the working directory gone — never a line that says `error` or `FAIL` |
| a log pasted into the prompt (T41) | its head, its tail and where it is filed; your sentences untouched |

Every cut files the whole first, under `~/.claude/clauget/files/<session>/`,
and names the path, so one Read undoes it (T32). A result that cannot be filed
— past 4 MiB, or a write that failed — is not cut. A cut that would take away
less than half the text is not made either: it invites a reread of the whole,
which costs more than the whole. A Bash output the engine already put aside
is left to the engine.

The report counts the **targeted rereads** — a Read of a filed result, a
windowed Read of a summarised file — beside the bytes each rule took: the
measure of whether the cuts were right.

Measured on this machine (Claude Code 2.1.280), same task — a 500-line `sed`,
a Grep, one file read twice — cuts off then on: the tool results the model
read went from 30 387 to 13 189 bytes, the prefix every later request re-read
was 3 956 tokens lighter, both sessions answered the same, and no reread
followed. An earlier run, before the half rule, cut a 9 kB output by a third
and was read back at 10 kB: the session came out heavier, which is why the
rule is there.

## The levers on the steps, off by default

A step avoided is a whole prefix not re-read — but the split into steps is the
model's. The **Levers on the steps** row turns on, from the next session:

| Lever | What it does |
| --- | --- |
| explorer (T43) | a `clauget:explorer` agent: Read, Grep and Glob only, no MCP server, no skill, no CLAUDE.md, on haiku, twelve turns at most |
| detour (T44) | on a Grep over the whole tree, a Glob over `**` or a tree walk, the explorer is proposed — once a session, never forced |
| smaller model (T45) | the types the **Subagent types on the smaller model** row lists run on haiku when their caller named no model |
| loop guard (T46) | a Bash output identical byte for byte to an earlier one of the turn is named, with its step; nothing is refused |
| switch guard (T48) | a `/model` switch that would rewrite a warm cache above $0.10 asks first |

The **Circuit breaker** row, on its own and off by default, stops a turn that
runs past twice the median turn's steps — never under thirty — between two
steps, and says how to resume (T49). It shows no "steps avoided": nobody knows
how many would have followed.

Measured on this machine (Claude Code 2.1.280, sonnet), same task — three
commands, then a subagent to find a declaration: with the built-in Explore
agent the session cost $0.385, with the explorer $0.290, same answer. The
explorer's steps re-read about 5 500 tokens each against 14 000 to 53 000 for
Explore's and 76 000 for a main step; its listing line costs the main thread
about 105 tokens a request.

**The effort is never touched** (T47). Lowering it one notch after a
mechanical step was built and measured: at the first change the provider
dropped its cached messages and the step wrote 75 897 tokens again, for output
tokens that did not move. The rule stays in the code, tested, and unapplied.

## The levers on the compaction, off by default

A compaction is the most concentrated spend of a session, and the one moment
the cache is thrown away anyway: the only time rewriting the past is free.
The **Levers on the compaction** row (`off`, `on`, `auto`) turns on, from the
next session:

| Lever | What it does |
| --- | --- |
| lighten (T51, T52) | the large tool results the summarizer would read are filed and replaced by their path; the text a person typed is never touched, no message added or dropped; results that entered whole wait in a queue of pointers for this moment, and nothing else rewrites the past |
| facts (T53) | a fork of the still-warm cache lists the facts not to lose; they, and the files read, become the summarizer's instructions; a cold fork adds nothing |
| point (T54) | the size from which compacting pays, `n × (C − c) × 0.1 > C × 0.1 + summary × 5 + c × 1.25`, printed beside the engine's threshold with every hypothesis; proposed once passed, and with `auto` compacted after the turn — never during one, never twice for a turn |
| precompute (T55) | no summary precomputed while the person works |
| after (T56) | a file read before the compaction, asked for whole, is served first as the windows read then, until the first turn ends |
| resume (T57) | a resumed session shows its re-write price beside the brief a fresh one could start from, `~/.claude/clauget/<session>.brief.md`, built without a model call |
| countdown (T58) | the status line counts down the warm cache after each turn, on an assumed five-minute TTL; the ping that would keep it warm stays off |

It applies to a subagent's own compaction too, save the fork, which shares
the main thread's cache only (T59).

Measured on this machine (Claude Code 2.1.280, haiku), two comparable
sessions — two files read and a log, `/compact`, then a question quoting both
files verbatim: the summarizer read 558 bytes instead of 18 733 for the three
results, the context went from 58 395 to 18 691 tokens, the three steps cost
$0.402 against $0.445, both answered the same, and **neither session reread a
file** after the compaction — the measure the milestone asked for is 0 against
0. Not yet seen live: the fork answering (a `/compact` run headless has no warm
snapshot, and goes on without facts, as tested), and the two hypotheses the
ping would rest on — that a fork shares the cache, and that its read refreshes
the TTL. Until both are measured, the ping stays off.

## Units

Four of them, and no total over them:

| Unit | Where it comes from |
| --- | --- |
| tokens | the API's own counters, relayed by the engine — nothing here is estimated |
| steps, turns, engine calls | counted by the mod |
| milliseconds | the engine's clock, around each request |
| characters, bytes | exact, measured on the strings (bytes in UTF-8, for the cap) |
| tokens (est.) | the breakdown's estimates, on the bill: counted by the token-count API when the report asks for `full` |
| calls, sessions | counted by the mod, in `usage.json` |
| dollars | the engine's own figure, where it serves one; never derived from tokens here |

A mod that added a token count to a millisecond would be lying in a currency
it invented. So each line says which unit it is in, and the turn's line ends
with `(engine)` where the figures are the engine's and `(counted)` where they
are the mod's.

## Settings

| Row | What it does |
| --- | --- |
| **Economy** | the row `/clauget on`, `off` and `strict` write; every lever left off in its own row follows it |
| **Where the ticket is written** | `turn` writes the turn's two lines to the transcript and the rest to the debug log; `debug` keeps everything out of the transcript; `off` writes neither and leaves the journal to the report |
| **Keep the journal on disk** | writes the session's steps to `~/.claude/clauget/<session>.json` at the end of each turn, so two sessions at the same task may be compared later; keeps the usage counters in `usage.json` beside it and each report in `<session>.report.txt`. Off, no counter is kept and the bill shows zero calls |
| **Cap on Bash output, in bytes** | `0`, the default, rewrites nothing; above it, a longer Bash `stdout` is cut to its head and tail with a line saying what went |
| **Levers on the prefix** | `off`, the default, decides nothing; `on` applies the policy above from the next session on |
| **Agent types never offered** | with the levers on, types to withdraw whatever the history says; `!name` keeps one |
| **Commands hidden from the menu** | with the levers on, commands to leave out of the typeahead and `/help` |
| **Cuts on what enters** | `off`, the default, lets every result and prompt in as made; `on` applies the cuts above from the next session on |
| **Levers on the steps** | `off`, the default; `on` applies the step levers above from the next session on |
| **Subagent types on the smaller model** | the types moved to haiku when their caller named no model; `Explore, clauget:explorer` by default |
| **Circuit breaker** | `off`, the default; `on` stops a runaway turn between two steps |
| **Levers on the compaction** | `off`, the default; `on` lightens, instructs, proposes; `auto` also compacts after a turn past the profitable point |

## What it does not promise

- **No purge.** `$.fs` has no `delete`. A file written stays written: the
  journals, the reports, the briefs, and every result filed by a cut or a
  compaction under `~/.claude/clauget/files/`. The rotation is of store keys
  alone; at worst a file can be rewritten empty. The folder grows.
- **No balance between units.** Bytes measured, tokens reported by the engine,
  tokens estimated by the breakdown, steps and calls counted, milliseconds and
  dollars are separate columns. None is converted into another, and no line
  adds them. An estimate says so: the bill's tokens are the breakdown's, and a
  brief's size is characters divided by four, which is wrong on dense JSON and
  on CJK text.
- **No promise that a summary, a diet or a digest "keeps the essential".**
  What is promised is checkable: the whole of anything cut is readable at the
  path the excerpt names, a diff applied to the version read gives the current
  file byte for byte, every key of a dieted JSON is still there — and the
  report counts the rereads that followed, which is the measure of whether a
  cut was too deep.
- **The ping and the detour are hypotheses.** Keeping the cache warm with a
  fork rests on two facts not yet measured; proposing the explorer on a search
  has not been seen to pay. Until measured, the ping stays off and the detour
  only proposes.
- **The effort is never touched.** Lowering it mid-turn was measured to make
  the provider rewrite its cached messages.
- **The counters are this machine's.** Two sessions writing `usage.json` at
  once each re-read it and add their share, so neither erases the other's
  calls; a write that lands between another's read and write can still lose
  that one's latest share. A call is counted when it is asked for, refused or
  not. Nothing is judged unused before ten sessions of history.
- **No savings by default.** Out of the box the mod measures and changes
  nothing. Every lever is off until its row, or the economy, turns it on — and
  then from the next session.
- **The TTL is an assumption**, stated where it is used: five minutes, the
  short prompt-cache window.
- **The acknowledgement steps are counted, not corrected.** A request that
  re-read the whole prefix to write "done" in a line is worth seeing. Guessing
  the model's answer instead of asking for it would not be an economy.

## Developing

```bash
npm run check                                        # every mod: types, options, validate, tests
claude plugin validate --strict claude-clauget-mod   # what the engine would refuse
claude plugin test claude-clauget-mod                # the tests, against the engine
bash scripts/check-types-version.sh                  # the declarations match the installed build
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir claude-clauget-mod --debug
```

`types/claude-code.d.ts` is written by `/plugin-types` and never edited; its
first line names the build that wrote it. It moved from 2.1.278 to 2.1.280
during this work (`SessionUsage` gained `startedAt`, `ui.open` answers
`{ isPlaced }`, `$.model.fork` answers `isAnswered`): read it before debugging
an API that seems to have changed.

`validate --strict` prints what the module hooks and what it calls. Comparing
that list with what you thought you wrote is the check that catches the
mistakes this API fails silently on.
