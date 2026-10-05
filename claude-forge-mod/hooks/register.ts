/**
 * Registers /forge: `lint`, `check` and `new`, answered by one command.run
 * hook. The command's own hook awaits the host commands it runs: time spent
 * in a `$` call does not count against the hook's budget, and each command
 * carries its own timeout. Nothing runs unless the person types the command,
 * and nothing the mod does reaches the model but the command's output row.
 */

import type { Register } from 'claude-code'

import {
  compareInventory,
  coreEvents,
  folderOf,
  formatReport,
  isPluginName,
  join,
  lintPlugin,
  lintStep,
  parseTests,
  parseTsc,
  parseValidate,
  resolve,
  scaffoldMod,
  scaffoldPlugin,
  STEP_LINES,
  typesVersion,
  upward,
} from '.'
import type { Kind, SourceFile, Step } from '.'

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const SKIP = new Set(['node_modules', '.git', 'dist'])
const TSC_MS = 5 * 60_000
const CLI_MS = 10 * 60_000

const HELP = [
  'forge — make plugins and mods, and check them before a session loads them',
  '',
  '  /forge new <name> [mod|plugin]   write claude-<name>-mod/ (the default) or claude-<name>-plugin/',
  '  /forge lint [folder]             the silent-failure rules, read off the source',
  '  /forge check [folder]            lint, tsc, validate --strict and its inventory, plugin test',
  '',
  'A folder is relative to the session\'s directory; none means the session\'s directory itself.',
].join('\n')

/**
 * The module's entry point.
 *
 * @param on adds a hook
 */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge',
      description: 'Make a plugin or a mod, lint it, check it',
      argumentHint: 'new <name> [mod|plugin] | lint [folder] | check [folder]',
    })
    return next(e)
  })

  on('command.run', { command: 'forge' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const cwd = await $.session.cwd()

    // Every file of the plugin a rule reads: the hooks module and the tests.
    const readPlugin = async (root: string): Promise<SourceFile[]> => {
      const files: SourceFile[] = []
      const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > 8 || !(await $.fs.exists(dir))) return
        for (const entry of await $.fs.list(dir)) {
          const path = join(dir, entry.name)
          if (entry.kind === 'dir' && !SKIP.has(entry.name)) await walk(path, depth + 1)
          else if (entry.kind === 'file' && SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            files.push({ path, text: String(await $.fs.read(path)) })
          }
        }
      }
      await walk(join(root, 'hooks'), 0)
      await walk(join(root, 'tests'), 0)
      return files
    }

    // The nearest of the given relative paths above the plugin, or undefined.
    const nearest = async (root: string, relative: string): Promise<string | undefined> => {
      for (const dir of upward(root)) {
        const path = join(dir, relative)
        if (await $.fs.exists(path)) return path
      }
      return undefined
    }

    const lint = async (root: string) => {
      const files = await readPlugin(root)
      const typesPath = (await nearest(root, 'types/claude-code.d.ts')) ?? (await nearest(root, '.claude/types/claude-code.d.ts'))
      const types = typesPath === undefined ? '' : String(await $.fs.read(typesPath))
      const core = coreEvents(types)
      return { files, typesPath, types, report: lintPlugin(files, core.size > 0 ? core : undefined) }
    }

    if (verb === 'new') {
      const [name = '', kindTyped = 'mod'] = rest
      const kind: Kind = kindTyped === 'plugin' ? 'plugin' : 'mod'
      if (!isPluginName(name)) return { text: `forge new: "${name}" is not a plugin name (lowercase words joined by dashes)\n\n${HELP}` }
      const folder = join(cwd, folderOf(name, kind))
      if (await $.fs.exists(folder)) return { text: `forge new: ${folder} already exists; nothing was written` }
      const author = (await $.process.run(['git', 'config', 'user.name']).catch(() => null))?.stdout.trim() || 'you'
      const files = kind === 'mod' ? scaffoldMod(name, author) : scaffoldPlugin(name, author)
      for (const [path, text] of Object.entries(files)) await $.fs.write(join(folder, path), text)
      const next =
        kind === 'mod'
          ? [`/forge check ${folderOf(name, kind)}`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ${folderOf(name, kind)} --debug`]
          : [`claude plugin validate ${folderOf(name, kind)}`, `claude --plugin-dir ${folderOf(name, kind)}`, 'agents, MCP servers, shell hooks: /plugin-dev:create-plugin']
      return { text: [`forge new: ${kind} ${name} written to ${folder}`, ...Object.keys(files).map(p => `  ${p}`), '', 'next:', ...next.map(n => `  ${n}`)].join('\n') }
    }

    if (verb === 'lint') {
      const root = resolve(cwd, rest.join(' '))
      const { files, typesPath, report } = await lint(root)
      if (files.length === 0) return { text: `forge lint: no hooks module under ${root}/hooks` }
      const step = lintStep(report, root, files.length)
      const note = typesPath === undefined ? ['· no types/claude-code.d.ts found above the plugin: plugin-noun events were not judged'] : []
      return { text: formatReport(root, [{ ...step, lines: [...step.lines, ...note] }]).replace(/^forge check/, 'forge lint') }
    }

    if (verb === 'check') {
      const root = resolve(cwd, rest.join(' '))
      if (!(await $.fs.exists(join(root, '.claude-plugin/plugin.json')))) {
        return { text: `forge check: ${root} has no .claude-plugin/plugin.json` }
      }
      const steps: Step[] = []
      const status = (text: string | undefined): void => $.ui.status(text)

      // 1. the lint, and the version of the types it was read against
      status('forge: lint')
      const { files, typesPath, types, report } = await lint(root)
      const isMod = await $.fs.exists(join(root, 'hooks/hooks.json'))
      if (files.length === 0) steps.push({ name: 'lint', status: 'skip', summary: isMod ? 'no source under hooks/' : 'no hooks module: a classic plugin', lines: [] })
      else steps.push(lintStep(report, root, files.length))
      const engine = (await $.session.version()).version
      const written = typesVersion(types)
      steps.push(
        typesPath === undefined
          ? { name: 'types', status: 'skip', summary: 'no types/claude-code.d.ts above the plugin', lines: ['run /plugin-types'] }
          : written === undefined || engine.startsWith(written)
            ? { name: 'types', status: 'ok', summary: `${written ?? '?'} = the running engine`, lines: [] }
            : { name: 'types', status: 'warn', summary: `written by ${written}, the engine is ${engine}`, lines: ['regenerate with /plugin-types before trusting tsc'] },
      )

      // 2. tsc, from the TypeScript the repository pins
      status('forge: tsc')
      const tsconfig = join(root, 'tsconfig.json')
      const tsc = await nearest(root, 'node_modules/typescript/bin/tsc')
      if (!(await $.fs.exists(tsconfig))) steps.push({ name: 'tsc', status: 'skip', summary: 'no tsconfig.json in the plugin', lines: [] })
      else if (tsc === undefined) steps.push({ name: 'tsc', status: 'skip', summary: 'no node_modules/typescript above the plugin', lines: ['npm install'] })
      else {
        const ran = await $.process.run(['node', tsc, '-p', tsconfig, '--pretty', 'false'], { timeoutMs: TSC_MS }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
        const errors = parseTsc(`${ran.stdout}\n${ran.stderr}`)
        steps.push(
          ran.exitCode === 0
            ? { name: 'tsc', status: 'ok', summary: 'no type error', lines: [] }
            : { name: 'tsc', status: 'fail', summary: `${errors.length} type errors`, lines: errors.length > 0 ? errors : [ran.stderr.trim()].filter(Boolean) },
        )
      }

      // 3. validate --strict, and its inventory against the source's
      status('forge: validate')
      const validated = await $.process.run(['claude', 'plugin', 'validate', '--strict', root], { timeoutMs: CLI_MS }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
      const seen = parseValidate(`${validated.stdout}\n${validated.stderr}`, validated.exitCode)
      steps.push(
        seen.isPassed
          ? { name: 'validate', status: 'ok', summary: 'passed --strict', lines: [] }
          : { name: 'validate', status: 'fail', summary: 'refused', lines: seen.problems.length > 0 ? seen.problems : `${validated.stdout}\n${validated.stderr}`.trim().split('\n').slice(-STEP_LINES) },
      )
      if (seen.isPassed && files.length > 0) {
        const diff = compareInventory(report, seen)
        steps.push({ name: 'inventory', status: diff.isBroken ? 'fail' : 'ok', summary: `${seen.hooks.length} events · ${seen.calls.length} calls`, lines: diff.lines })
      }

      // 4. the plugin's tests, run against the engine itself
      status('forge: test')
      if (!(await $.fs.exists(join(root, 'tests')))) steps.push({ name: 'test', status: 'skip', summary: 'no tests/ folder', lines: [] })
      else {
        const ran = await $.process.run(['claude', 'plugin', 'test', root], { timeoutMs: CLI_MS }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
        const tested = parseTests(`${ran.stdout}\n${ran.stderr}`)
        const isOk = ran.exitCode === 0 && tested.fail === 0
        steps.push({
          name: 'test',
          status: isOk ? 'ok' : 'fail',
          summary: `${tested.pass} pass · ${tested.fail} fail`,
          lines: isOk ? [] : tested.failures.length > 0 ? tested.failures : `${ran.stdout}\n${ran.stderr}`.trim().split('\n').slice(-STEP_LINES),
        })
      }

      status(undefined)
      return { text: formatReport(root, steps) }
    }

    return { text: HELP }
  })
}
