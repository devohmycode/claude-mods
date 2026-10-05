/**
 * The files `/forge new` writes, as a map from relative path to text. A mod
 * comes out in the repository's shape: a folder per subject under `hooks/`,
 * an `index.ts` that re-exports, the pure logic away from `register.ts`, a
 * test that runs the command through the engine, and a tsconfig that
 * extends the root one. A classic plugin (commands and skills, no hooks
 * module) comes out as the smallest folder `claude plugin validate` takes.
 */

/** What `/forge new` can make. */
export type Kind = 'mod' | 'plugin'

/** The files of a new plugin: relative path → text. */
export type Scaffold = Record<string, string>

/**
 * Whether a name may name a plugin: lowercase words joined by dashes.
 *
 * @param name what the person typed
 * @returns true when it is usable as is
 */
export function isPluginName(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)
}

/**
 * The folder a new plugin goes in, after the repository's naming.
 *
 * @param name the plugin's name
 * @param kind a mod or a classic plugin
 * @returns the folder's name
 */
export function folderOf(name: string, kind: Kind): string {
  return kind === 'mod' ? `claude-${name}-mod` : `claude-${name}-plugin`
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/**
 * The files of a new mod: one slash command named after it, answered by a
 * pure function, and a test that runs it.
 *
 * @param name the mod's name, which is also its command's
 * @param author who the manifest names
 * @returns the files, by path relative to the mod's folder
 */
export function scaffoldMod(name: string, author: string): Scaffold {
  const camel = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return {
    '.claude-plugin/plugin.json': json({
      name,
      version: '0.1.0',
      description: `${name}: describe in one sentence what the mod does and what it never does.`,
      author: { name: author },
      license: 'MIT',
      keywords: ['function-hooks'],
    }),
    'hooks/hooks.json': json({
      description: `/${name} and the hooks behind it`,
      modules: ['./register.ts'],
    }),
    'hooks/index.ts': `export * from './${name}'\n`,
    [`hooks/${name}/index.ts`]: `export * from './${name}'\n`,
    [`hooks/${name}/${name}.ts`]: `/**
 * The logic of /${name}, away from the register so the tests reach it
 * without an engine.
 */

/**
 * What /${name} answers.
 *
 * @param args everything typed after the command's name
 * @returns the command's output
 */
export function ${camel}Answer(args: string): string {
  const said = args.trim()
  return said === '' ? '${name} is loaded.' : \`${name} heard: \${said}\`
}
`,
    'hooks/register.ts': `/**
 * Registers /${name}: the command is declared at the session's start and
 * answered by a command.run hook. Every \`$\` call is spelled
 * \`$.noun.verb(...)\` at its call site, and each event has one hook without
 * a matcher at most: \`/forge check\` holds the module to both.
 */

import type { Register } from 'claude-code'

import { ${camel}Answer } from '.'

/**
 * The module's entry point.
 *
 * @param on adds a hook
 */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: '${name}', description: 'Say what /${name} does' })
    return next(e)
  })

  on('command.run', { command: '${name}' }, ($, e) => ({ text: ${camel}Answer(e.args) }))
}
`,
    [`tests/${name}.test.ts`]: `import { describe, expect, test } from 'claude-code/testing'

import { ${camel}Answer } from '../hooks'

describe('/${name}', () => {
  test('answers through the engine', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))

    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const out = await $.command.run({ command: '${name}', args: 'hello', origin: { kind: 'composer' } } as never)

    expect(out.text).toBe('${name} heard: hello')
  })

  test('says it is loaded when given nothing', () => {
    expect(${camel}Answer('  ')).toBe('${name} is loaded.')
  })
})
`,
    'tsconfig.json': `{
  "extends": "../tsconfig.json",
  "include": ["../types", "hooks", "tests", "types"]
}
`,
    'README.md': `# ${name}

What the mod does, in two sentences, and what it never does.

## Use

\`\`\`
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ${folderOf(name, 'mod')}
\`\`\`

Then \`/${name}\`.

## Check

\`/forge check ${folderOf(name, 'mod')}\` runs the lint, the typecheck, \`claude plugin validate --strict\` and \`claude plugin test\`.
`,
  }
}

/**
 * The files of a new classic plugin: one command and one skill, no hooks
 * module. Agents, MCP servers and shell hooks are \`/plugin-dev\`'s to add.
 *
 * @param name the plugin's name
 * @param author who the manifest names
 * @returns the files, by path relative to the plugin's folder
 */
export function scaffoldPlugin(name: string, author: string): Scaffold {
  return {
    '.claude-plugin/plugin.json': json({
      name,
      version: '0.1.0',
      description: `${name}: describe in one sentence what the plugin offers.`,
      author: { name: author },
      license: 'MIT',
    }),
    [`commands/${name}.md`]: `---
description: Say what /${name}:${name} does
argument-hint: "[what to act on]"
---

Explain to Claude, in the imperative, what to do with: $ARGUMENTS
`,
    [`skills/${name}/SKILL.md`]: `---
name: ${name}
description: Say when Claude should load this skill, in the words a person would use.
---

# ${name}

The instructions Claude follows once the skill is loaded.
`,
    'README.md': `# ${name}

What the plugin offers.

\`\`\`
claude --plugin-dir ${folderOf(name, 'plugin')}
\`\`\`
`,
  }
}
