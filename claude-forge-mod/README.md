# forge

Make your own plugins and mods, and catch what a mod breaks without a word
before a session loads it.

A mod fails in ways nothing reports: `$` bound to a name is refused at load,
a second `on("tool.call")` with no matcher is refused too, a plugin noun's
verb hooked where no plugin provides the noun breaks the building of `$`, a
`.catch` that calls `next` again runs the side effect twice. `forge` reads
the source for these before `claude plugin validate` or a session does, then
runs the checks this repository runs, and compares what `validate` says the
module hooks and calls with what the source spells.

## Commands

```
/forge new <name> [mod|plugin]   write claude-<name>-mod/ (the default) or claude-<name>-plugin/
/forge lint [folder]             the silent-failure rules, read off the source
/forge check [folder]            lint, types version, tsc, validate --strict and its inventory, plugin test
```

A folder is relative to the session's directory. Nothing runs unless the
command is typed, and nothing reaches the model but the command's output row.

### `/forge new`

A **mod** comes out in the repository's shape: `hooks/<name>/` for the pure
logic with an `index.ts` that re-exports it, `hooks/register.ts` that
declares `/<name>` at `session.start` and answers it in `command.run`, a
test that runs the command through the engine, a `tsconfig.json` that
extends the root one. It passes `/forge check` as written.

A **classic plugin** is one command and one skill, no hooks module. Agents,
MCP servers and shell hooks are `/plugin-dev:create-plugin`'s to add; how to
write a mod's hooks is the `plugin-authoring` skill's, which ships with
Claude Code and follows its version. `forge` copies neither.

The folder must not exist: `$.fs` has no delete, so `forge` never writes
over anything.

### `/forge lint`

| Rule | Severity | What it catches |
| --- | --- | --- |
| `dollar-bound` | error | `$` assigned, destructured, passed, returned, spread or read anywhere but as a hook's parameter |
| `dollar-computed` | error | `$[noun]`, `$.noun[verb]` |
| `noun-bound` | error | `$.noun` standing alone (`const s = $.store`) |
| `event-computed` | error | `on(name, …)` whose event is no string literal |
| `env-computed` | error | `$.env.get(name)` whose name is no string literal |
| `hook-twice` | error | two `on("event", hook)` with no matcher in one module, across its files |
| `method-unbound` | warning | `$.noun.verb` referenced and not called |
| `noun-event` | warning | an event that is not the engine's: hooking a plugin noun's verb fails where no plugin provides it |
| `catch-next` | warning | a `.catch` that calls `next(…)` without reading `next.called` |
| `config-reload` | warning | `$.config.set` with no comparison or early return before it: the write reloads the module |
| `register-delegated` | warning | a test's inline plugin whose `register` delegates, which registers nothing the loader sees |

In a test file only `register-delegated` applies: there `$` is the kit's
engine and may be handed to a helper.

The engine's own events are read from the nearest `types/claude-code.d.ts`
(or `.claude/types/claude-code.d.ts`) above the plugin; without one,
`noun-event` judges nothing and the report says so.

The reading is a tokenizer, not a parser: a regex literal is guessed where
an expression may start, and an apostrophe in JSX text is read as text
because a quote that does not close on its line is no string. `validate`
remains the judge. On this repository's four other mods the lint finds
nothing.

### `/forge check`

| Step | Runs | Fails when |
| --- | --- | --- |
| `lint` | the rules above | an error |
| `types` | first line of `types/claude-code.d.ts` against the running engine | never: a mismatch is a warning to run `/plugin-types` |
| `tsc` | `node <nearest node_modules>/typescript/bin/tsc -p <plugin>/tsconfig.json` | a type error |
| `validate` | `claude plugin validate --strict <plugin>` | a refusal; its reason is printed |
| `inventory` | the events and `$` calls the source spells against the ones `validate` lists | the source spells one `validate` does not list |
| `test` | `claude plugin test <plugin>` | a failed test; each is named |

A call `validate` lists that no `$.` spells is reported, not failed: it is
reached through an engine captured at `engine.create`, which is allowed.

The hook awaits each command: time spent inside a `$` call does not count
against the 10-second budget, and each command carries its own timeout (5
minutes for `tsc`, 10 for the CLI). The status line names the step running.
On `claude-forge-mod` itself the whole check takes about ten seconds.

## Development

```
npx tsc -p claude-forge-mod/tsconfig.json
claude plugin validate --strict claude-forge-mod
claude plugin test claude-forge-mod
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir claude-forge-mod
```

`hooks/lint/` holds the tokenizer and the rules, `hooks/check/` reads what
the host commands print and writes the report, `hooks/scaffold/` holds the
files `/forge new` writes. `hooks/register.ts` only runs them.
