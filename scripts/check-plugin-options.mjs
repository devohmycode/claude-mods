#!/usr/bin/env node
/**
 * Checks that every option a mod's code reads is declared in its manifest.
 *
 * The defect this exists for: `register.ts` read `options.capTools` and
 * `options.capThreshold`, the README documented both, and the manifest
 * declared neither — so they never appeared in `/plugin configure` and the
 * code silently fell back to its defaults. Nothing caught it. `tsc` types
 * `options` as an open record, and `claude plugin validate` reads the
 * manifest and the source without comparing them. It took installing the
 * plugin and reading "5 userConfig options not yet set" to notice.
 *
 * This is a repository check and not a plugin test on purpose: a test runs
 * in an environment like a hooks module's, with no filesystem, so it
 * cannot read a manifest at all.
 *
 *     node scripts/check-plugin-options.mjs            # every mod here
 *     node scripts/check-plugin-options.mjs <dir>...   # the ones named
 *     node scripts/check-plugin-options.mjs --selftest # free, no repo
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Every `options.<name>` a source reads, by name.
 *
 * @param {string} source the module's text
 * @returns {Set<string>} the names read literally
 */
export function readsOf(source) {
  return new Set(
    [...source.matchAll(/\boptions\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
  )
}

/**
 * Whether a source reaches its options by a computed key, which makes the
 * unread direction undecidable by reading alone.
 *
 * @param {string} source the module's text
 * @returns {boolean} whether `options[…]` appears
 */
export const hasDynamicReads = source => /\boptions\s*\[/.test(source)

/**
 * Compares what a mod declares with what it reads.
 *
 * Only one direction is an error. An option read but not declared is a
 * setting the person can never set, which is the bug. An option declared
 * but never read literally is only a suspicion — and not even that where
 * the code indexes `options` by a computed key, as this one does to walk
 * its levers.
 *
 * @param {{ declared: string[], source: string }} mod what to compare
 * @returns {{ undeclared: string[], unread: string[], isDecidable: boolean }}
 */
export function compare({ declared, source }) {
  const read = readsOf(source)
  const isDecidable = !hasDynamicReads(source)

  return {
    undeclared: [...read].filter(name => !declared.includes(name)).sort(),
    unread: isDecidable
      ? declared.filter(name => !read.has(name)).sort()
      : [],
    isDecidable,
  }
}

/**
 * Every `.ts` and `.tsx` file under a directory, recursively.
 *
 * @param {string} dir where to look
 * @returns {string[]} the paths
 */
function sourcesUnder(dir) {
  const out = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      out.push(...sourcesUnder(path))
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }

  return out
}

/**
 * The mod folders of this repository: those with a plugin manifest.
 *
 * @returns {string[]} their absolute paths
 */
function modsHere() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(ROOT, entry.name))
    .filter(dir => {
      try {
        return statSync(join(dir, '.claude-plugin', 'plugin.json')).isFile()
      } catch {
        return false
      }
    })
}

/**
 * Checks one mod and says what it found.
 *
 * @param {string} dir the mod's folder
 * @returns {boolean} whether it passed
 */
function check(dir) {
  const name = relative(ROOT, dir) || dir
  const manifest = JSON.parse(
    readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
  )

  const declared = Object.keys(manifest.userConfig ?? {})
  const hooks = join(dir, 'hooks')
  const source = sourcesUnder(hooks)
    .map(path => readFileSync(path, 'utf8'))
    .join('\n')

  const { undeclared, unread, isDecidable } = compare({ declared, source })

  if (undeclared.length > 0) {
    console.error(
      `✘ ${name}: read but not declared in userConfig — ` +
        `${undeclared.join(', ')}\n` +
        `  The person can never set these; the code falls back to its ` +
        `defaults in silence.`,
    )

    return false
  }

  const note = isDecidable
    ? unread.length > 0
      ? `; declared but never read: ${unread.join(', ')}`
      : ''
    : '; the unread direction is undecidable here (options is indexed by a computed key)'

  console.log(`✔ ${name}: ${declared.length} option(s) declared, all read${note}`)

  return true
}

/**
 * Exercises the comparison against two shapes, for nothing.
 *
 * @returns {number} the exit code
 */
function selftest() {
  const bad = compare({
    declared: ['cap'],
    source: 'const a = options.cap; const b = options.capTools',
  })

  if (bad.undeclared.join() !== 'capTools') {
    console.error('✘ selftest: an undeclared read was not caught')

    return 1
  }

  const dynamic = compare({
    declared: ['cap', 'defer'],
    source: 'const a = options.cap; const b = options[id]',
  })

  if (dynamic.isDecidable || dynamic.unread.length > 0) {
    console.error('✘ selftest: a computed key was treated as decidable')

    return 1
  }

  console.log('✔ selftest: an undeclared read is caught, a computed key is not guessed at')

  return 0
}

const args = process.argv.slice(2)

if (args[0] === '--selftest') {
  process.exit(selftest())
}

const dirs = args.length > 0 ? args.map(one => resolve(one)) : modsHere()

process.exit(dirs.map(check).every(Boolean) ? 0 : 1)
