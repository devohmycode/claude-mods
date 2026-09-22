# claude-mods

Mods for Claude Code — plugins whose whole behaviour fits in one *function
hooks* module: a `register(on, options)` that hooks the engine's events in
the shape `($, e, next)`.

- **[claude-cockpit-mod/](claude-cockpit-mod/)** — the first one, built: a
  tabbed pane beside the transcript, and the name `$.cockpit` that the
  other plugins fill.

## Installing

```bash
claude plugin marketplace add devohmycode/claude-mods

claude plugin install cockpit@claude-devohmycode-mods
```

Function hooks are in early access: Claude Code loads a hooks module only
when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is in the environment. Put it
where your shell keeps its variables rather than in front of one command —
otherwise the plugin is installed and its hooks never run.

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1       # bash, zsh
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1"     # PowerShell, this session
setx CLAUDE_CODE_ENABLE_FUNCTION_HOOKS 1         # Windows, once and for all
```

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
