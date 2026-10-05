import type { Args, On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { lintPlugin, scaffoldMod, scaffoldPlugin } from '../hooks'

const CWD = 'C:/repo'

/** A host with a disk in memory and the host commands answered by `answer`. */
type World = { files: Map<string, string>; runs: string[][]; status: (string | undefined)[] }

function host(on: On, files: Record<string, string>, answer: (argv: readonly string[]) => { exitCode: number; stdout: string; stderr: string }): World {
  const world: World = { files: new Map(Object.entries(files)), runs: [], status: [] }
  // The engine hands a hook the path in the platform's spelling; the world keeps forward slashes.
  const norm = (path: string): string => path.replace(/\\/g, '/')
  const isDir = (path: string): boolean => [...world.files.keys()].some(f => f.startsWith(`${path}/`))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.version', () => ({ value: { version: '2.1.286', base: '2.1.286', builtAt: '' } as never }))
  on('ui.status', ($, e: Args<'ui.status'>) => {
    world.status.push((e as { text?: string }).text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: world.files.has(norm(e.path)) || isDir(norm(e.path)) }))
  on('fs.read', ($, e) => ({ value: world.files.get(norm(e.path)) ?? '' }))
  on('fs.write', ($, e) => {
    world.files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    const dir = norm(e.path)
    const names = new Map<string, 'file' | 'dir'>()
    for (const f of world.files.keys()) {
      if (!f.startsWith(`${dir}/`)) continue
      const [head, ...rest] = f.slice(dir.length + 1).split('/')
      if (head !== undefined) names.set(head, rest.length > 0 ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind })) as never }
  })
  on('process.run', ($, e) => {
    world.runs.push([...e.argv])
    return { value: answer(e.argv) }
  })
  return world
}

const run = (args: string) => ({ command: 'forge', args, origin: { kind: 'composer' } }) as never
const SESSION = { cwd: CWD, surface: 'terminal', isInteractive: true } as const

// The files of a mod laid under a folder of the repository.
const under = (folder: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([p, t]) => [`${CWD}/${folder}/${p}`, t]))

const OK = { exitCode: 0, stdout: '', stderr: '' }
const VALIDATED = (hooks: string, calls: string) =>
  `  ❯ ./register.ts hooks: ${hooks}\n  ❯ ./register.ts calls: ${calls}\n\n✔ Validation passed\n`

describe('/forge new', () => {
  test('writes a mod in the repository\'s shape, and the lint finds nothing in it', async ($, on) => {
    const world = host(on, {}, argv => (argv[0] === 'git' ? { ...OK, stdout: 'DevOhMyCode\n' } : OK))
    await $.session.start(SESSION)

    const out = (await $.command.run(run('new demo'))).text ?? ''

    expect(out).toContain('forge new: mod demo written to C:/repo/claude-demo-mod')
    expect([...world.files.keys()].sort()).toContain('C:/repo/claude-demo-mod/hooks/register.ts')
    expect(world.files.get('C:/repo/claude-demo-mod/.claude-plugin/plugin.json')).toContain('"name": "DevOhMyCode"')
    const sources = [...world.files].filter(([p]) => /\.ts$/.test(p)).map(([path, text]) => ({ path, text }))
    expect(lintPlugin(sources).findings).toEqual([])
  })

  test('a classic plugin, and nothing written over a folder that exists', async ($, on) => {
    const world = host(on, { [`${CWD}/claude-demo-mod/README.md`]: 'mine' }, () => OK)
    await $.session.start(SESSION)

    expect((await $.command.run(run('new demo'))).text).toContain('already exists; nothing was written')
    expect(world.files.get(`${CWD}/claude-demo-mod/README.md`)).toBe('mine')

    await $.command.run(run('new notes plugin'))
    expect(world.files.has(`${CWD}/claude-notes-plugin/commands/notes.md`)).toBe(true)
    expect(world.files.has(`${CWD}/claude-notes-plugin/hooks/hooks.json`)).toBe(false)
  })

  test('refuses a name that is no plugin name', async ($, on) => {
    host(on, {}, () => OK)
    await $.session.start(SESSION)
    expect((await $.command.run(run('new My_Mod'))).text).toContain('is not a plugin name')
  })
})

describe('/forge lint', () => {
  test('names the rule, the file and the line', async ($, on) => {
    host(on, {
      [`${CWD}/claude-bad-mod/hooks/register.ts`]: `export const register = on => {\n  on('tool.call', ($, e, next) => helper($, e))\n  on('tool.call', ($, e, next) => next(e))\n}\n`,
    }, () => OK)
    await $.session.start(SESSION)

    const out = (await $.command.run(run('lint claude-bad-mod'))).text ?? ''

    expect(out).toContain('forge lint C:/repo/claude-bad-mod: lint failed')
    expect(out).toContain('✘ hooks/register.ts:2 [dollar-bound]')
    expect(out).toContain('✘ hooks/register.ts:3 [hook-twice]')
    expect(out).toContain('no types/claude-code.d.ts found above the plugin')
  })
})

describe('/forge check', () => {
  const mod = (): Record<string, string> => ({
    ...under('claude-demo-mod', scaffoldMod('demo', 'me')),
    [`${CWD}/node_modules/typescript/bin/tsc`]: '',
    [`${CWD}/types/claude-code.d.ts`]: "// Written by Claude Code 2.1.286.\n  export type EngineEventOf = {\n      'session.start': X;\n      'command.run': Y;\n  };\n",
  })

  test('runs the four steps and says everything held', async ($, on) => {
    const world = host(on, mod(), argv => {
      if (argv[1] === 'plugin' && argv[2] === 'validate') return { ...OK, stdout: VALIDATED('session.start, command.run{command=demo}', '$.command.register') }
      if (argv[1] === 'plugin' && argv[2] === 'test') return { ...OK, stdout: '(pass) a\n 2 pass\n 0 fail\n' }
      return OK
    })
    await $.session.start(SESSION)

    const out = (await $.command.run(run('check claude-demo-mod'))).text ?? ''

    expect(out.split('\n')[0]).toBe('forge check C:/repo/claude-demo-mod: everything held')
    expect(out).toContain('✔ types     2.1.286 = the running engine')
    expect(out).toContain('✔ inventory 2 events · 1 calls')
    expect(out).toContain('✔ test      2 pass · 0 fail')
    expect(world.runs.map(r => r.slice(0, 3).join(' '))).toEqual([
      `node ${CWD}/node_modules/typescript/bin/tsc -p`,
      'claude plugin validate',
      'claude plugin test',
    ])
    expect(world.status.at(-1)).toBeUndefined()
  })

  test('a type error, a refused event and a failed test each fail their step', async ($, on) => {
    host(on, mod(), argv => {
      if (argv[0] === 'node') return { exitCode: 2, stdout: 'hooks/register.ts(3,1): error TS2304: nope\n', stderr: '' }
      if (argv[2] === 'validate') return { ...OK, stdout: VALIDATED('session.start', '$.command.register') }
      return { exitCode: 1, stdout: '(fail) /demo > answers [1ms]\n 1 pass\n 1 fail\n', stderr: '' }
    })
    await $.session.start(SESSION)

    const out = (await $.command.run(run('check claude-demo-mod'))).text ?? ''

    expect(out.split('\n')[0]).toBe('forge check C:/repo/claude-demo-mod: tsc, inventory, test failed')
    expect(out).toContain('error TS2304: nope')
    expect(out).toContain('✘ the source hooks "command.run", validate does not list it')
    expect(out).toContain('    /demo > answers')
  })

  test('a folder without a manifest is no plugin', async ($, on) => {
    host(on, {}, () => OK)
    await $.session.start(SESSION)
    expect((await $.command.run(run('check nowhere'))).text).toBe('forge check: C:/repo/nowhere has no .claude-plugin/plugin.json')
  })
})

describe('the scaffolds', () => {
  test('a classic plugin has no hooks module for the lint to read', () => {
    expect(Object.keys(scaffoldPlugin('notes', 'me')).filter(p => p.startsWith('hooks/'))).toEqual([])
  })
})
