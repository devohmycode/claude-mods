# Claude Mods

![Version](https://img.shields.io/badge/Version-0.1.0-blue)

Mods for Claude Code — plugins whose whole behaviour fits in one *function
hooks* module: a `register(on, options)` that hooks the engine's events in
the shape `($, e, next)`.

- **[claude-cockpit-mod/](claude-cockpit-mod/)** — the first one, built: a
  tabbed pane beside the transcript, and the name `$.cockpit` that the
  other plugins fill.
- **[claude-message-mod/](claude-message-mod/)** — what other sessions
  send, held out of the context until you decide otherwise:
  `session.receive` turns the message away before it costs anything, the
  thread lives in a mailbox on disk, and a field answers through
  `SendMessage` without waking the model. Fifth tab of `cockpit`, and the
  first consumer of the name `$.cockpit`.
- **[claude-clauget-mod/](claude-clauget-mod/)** — the scale before the
  diet: `turn.step` streams through one hook whose stop chunk carries what
  each model request read from the cache, wrote to it, carried and
  produced, so a session has a line per request and the cache misses it
  exposes are named where they happen. Out of the box it cuts nothing;
  `/clauget on` turns on levers each measured on a real session, and it
  prints what every one cost beside what it saved.
- **[context-manager/](context-manager/)** — the waste a session repeats,
  named while it compounds: a ledger of every tool call, a background audit
  that asks what had a shorter path to the same result, and a pane where
  one click fixes, rewords or ignores each finding. Starts from
  ContextSaver 0.5.0, language choice included, as the base of its next
  version.

## Installing

Two things are needed before a mod runs, both because function hooks are
still early access: **Claude Code 2.1.280 or newer**, and the environment
variable that switches the feature on.

From inside a Claude Code session:

```
/plugin marketplace add devohmycode/claude-mods
/plugin install cockpit@claude-devohmycode-mods
/plugin install message@claude-devohmycode-mods
/plugin install clauget@claude-devohmycode-mods
/plugin install contextmanager@claude-devohmycode-mods
```

Or from the shell:

```bash
claude plugin marketplace add devohmycode/claude-mods
claude plugin install cockpit@claude-devohmycode-mods
claude plugin install message@claude-devohmycode-mods
claude plugin install clauget@claude-devohmycode-mods
claude plugin install contextmanager@claude-devohmycode-mods
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

`claude --version` says which build you are on. The declarations these mods
are typechecked against were written by 2.1.280, and
`types/claude-code.d.ts` names that build on its first line.
## Layout

```
types/claude-code.d.ts   the declarations /plugin-types writes, versioned
                         the way Anthropic's own repository versions them
tsconfig.json            typechecks every mod against them
claude-<name>-mod/       one mod, a complete and standalone folder
```

Each mod follows the layout of the mods shipped in
[`anthropics/claude-code/mods`](https://github.com/anthropics/claude-code/tree/main/mods):

```
.claude-plugin/plugin.json   the manifest, and "types" when the mod adds a name to $
hooks/hooks.json             the module the engine loads
hooks/register.ts            the only file that touches the events
hooks/index.ts               the barrel
hooks/<module>/              one folder per module, with its own barrel
types/index.d.ts             the contract of the name, without a single import
tests/<name>.test.ts         the tests, named after what they cover
README.md
```

## Developing

Function hooks are in early access: they have to be switched on.

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir claude-cockpit-mod
```

The folder is watched: saving a file reloads the module.

```bash
claude plugin validate --strict claude-cockpit-mod   # what the engine would refuse
claude plugin test claude-cockpit-mod                # the tests, against the engine
npx tsc -p tsconfig.json                             # the types, against types/
```

`/plugin-types` regenerates `types/claude-code.d.ts` from the installed
binary. Do that after every Claude Code update rather than editing the
file: its first line says which version wrote it.
