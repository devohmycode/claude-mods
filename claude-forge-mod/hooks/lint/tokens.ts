/**
 * A tokenizer just good enough to read a hooks module the way the loader
 * does: identifiers, punctuation and string literals, with comments dropped
 * and each token's line kept. It is no parser. A regex literal is skipped
 * where an expression may start, a template literal is one token whatever
 * it holds, and a quote that does not close on its own line is read as a
 * plain character, which is what an apostrophe in JSX text is.
 */

/** One token of the source, with the line it starts on (1-based). */
export type Token = {
  kind: 'ident' | 'string' | 'template' | 'number' | 'punct'
  text: string
  line: number
}

const PUNCT = ['...', '?.', '=>', '===', '!==', '==', '!=', '&&', '||', '??']
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&&', '||', '??', '?', '{', '}', ';', '=>', 'return', 'typeof'])

const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c)
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_$]/.test(c)

/**
 * Splits a source into tokens.
 *
 * @param source the text of a `.ts`, `.tsx`, `.js` module
 * @returns its tokens, comments left out
 */
export function tokenize(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  let line = 1
  const n = source.length
  const last = (): Token | undefined => out[out.length - 1]

  while (i < n) {
    const c = source[i] as string
    if (c === '\n') { line += 1; i += 1; continue }
    if (c === ' ' || c === '\t' || c === '\r') { i += 1; continue }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      for (let k = i; k < stop; k += 1) if (source[k] === '\n') line += 1
      i = stop
      continue
    }
    if (c === '"' || c === "'") {
      let k = i + 1
      while (k < n && source[k] !== c && source[k] !== '\n') k += source[k] === '\\' ? 2 : 1
      if (source[k] === c) {
        out.push({ kind: 'string', text: source.slice(i + 1, k), line })
        i = k + 1
      } else {
        out.push({ kind: 'punct', text: c, line })
        i += 1
      }
      continue
    }
    if (c === '`') {
      const start = line
      let k = i + 1
      let depth = 0
      while (k < n) {
        const d = source[k]
        if (d === '\\') { k += 2; continue }
        if (d === '\n') line += 1
        if (depth === 0 && d === '`') break
        if (d === '$' && source[k + 1] === '{') { depth += 1; k += 2; continue }
        if (depth > 0 && d === '}') depth -= 1
        k += 1
      }
      out.push({ kind: 'template', text: source.slice(i + 1, k), line: start })
      i = k + 1
      continue
    }
    if (c === '/') {
      const before = last()
      const startsExpression = before === undefined || REGEX_BEFORE.has(before.text)
      if (startsExpression) {
        let k = i + 1
        let inClass = false
        while (k < n && source[k] !== '\n') {
          const d = source[k]
          if (d === '\\') { k += 2; continue }
          if (d === '[') inClass = true
          else if (d === ']') inClass = false
          else if (d === '/' && !inClass) break
          k += 1
        }
        if (source[k] === '/') {
          k += 1
          while (k < n && /[a-z]/.test(source[k] as string)) k += 1
          out.push({ kind: 'string', text: source.slice(i, k), line })
          i = k
          continue
        }
      }
    }
    if (isIdentStart(c)) {
      let k = i + 1
      while (k < n && isIdentPart(source[k] as string)) k += 1
      out.push({ kind: 'ident', text: source.slice(i, k), line })
      i = k
      continue
    }
    if (/[0-9]/.test(c)) {
      let k = i + 1
      while (k < n && /[0-9a-zA-Z_.]/.test(source[k] as string)) k += 1
      out.push({ kind: 'number', text: source.slice(i, k), line })
      i = k
      continue
    }
    const multi = PUNCT.find(p => source.startsWith(p, i))
    if (multi !== undefined && !(multi === '?.' && /[0-9]/.test(source[i + 2] ?? ''))) {
      out.push({ kind: 'punct', text: multi, line })
      i += multi.length
      continue
    }
    out.push({ kind: 'punct', text: c, line })
    i += 1
  }
  return out
}

/**
 * Pairs every opening bracket with its closing one.
 *
 * @param tokens the module's tokens
 * @returns for each index, the index of its partner bracket, or -1
 */
export function pairs(tokens: readonly Token[]): number[] {
  const partner = tokens.map(() => -1)
  const stack: number[] = []
  const open: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  tokens.forEach((t, i) => {
    if (t.kind !== 'punct') return
    if (t.text === '(' || t.text === '[' || t.text === '{') stack.push(i)
    const want = open[t.text]
    if (want === undefined) return
    // An unmatched closer (JSX text, a regex we misread) is dropped rather
    // than allowed to unwind the whole stack.
    let at = stack.length - 1
    while (at >= 0 && tokens[stack[at] as number]?.text !== want) at -= 1
    if (at < 0) return
    const o = stack[at] as number
    stack.length = at
    partner[o] = i
    partner[i] = o
  })
  return partner
}

/**
 * Splits the arguments of a call at its top-level commas.
 *
 * @param tokens the module's tokens
 * @param partner the bracket pairs from `pairs`
 * @param open the index of the call's `(`
 * @returns each argument as a [first, last] index range, inclusive
 */
export function argsOf(tokens: readonly Token[], partner: readonly number[], open: number): [number, number][] {
  const close = partner[open] ?? -1
  if (close < 0) return []
  const out: [number, number][] = []
  let from = open + 1
  for (let i = open + 1; i < close; i += 1) {
    const t = tokens[i] as Token
    if (t.kind === 'punct' && (t.text === '(' || t.text === '[' || t.text === '{')) {
      i = Math.max(i, partner[i] ?? i)
      continue
    }
    if (t.kind === 'punct' && t.text === ',') {
      if (i > from) out.push([from, i - 1])
      from = i + 1
    }
  }
  if (close > from) out.push([from, close - 1])
  return out
}
