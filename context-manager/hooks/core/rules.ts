import { baseline } from './evidence'
import { collapseWs, pctOf, slug } from './text'
import { BRIEF_TOOLS, CLAUDE_MD_HEADING, RULE_MARKER } from './types'
import type { Artifact, ArtifactKind, ArtifactPreview, Pattern, Proposal, State } from './types'

// The id a written bullet carries, invisible where the file is rendered: `<!-- cm:execution:cm-full-suite-1a2b3c -->`.
const MARKER = /\s*<!--\s*cm:([a-z-]+:[a-z0-9-]{1,40})\s*-->\s*$/

/**
 * Renders one single-line CLAUDE.md bullet; the shell appends only this when the heading already exists. With a
 * pattern id, the bullet carries it in an HTML comment, so a later session can tell which rule it wrote.
 */
export const bulletOf = (body: string, patternId?: string): string =>
  `- ${collapseWs(body).replace(/^[-*] /, '')}${patternId === undefined ? '' : ` <!-- ${RULE_MARKER}${patternId} -->`}\n`

/** Returns the bullet alone from a claude-md artifact's content, for appending under an existing heading. */
export const bulletOnly = (content: string): string => content.slice(Math.max(0, content.indexOf('\n- ') + 1))

/** The rule a bullet states, without its dash and without its marker: what Claude reads, and what Try sends. */
export const ruleText = (bullet: string): string => collapseWs(bullet.replace(MARKER, '')).replace(/^[-*] /, '')

// Two bullets are one rule when they say the same thing: case and spacing are how it was typed, not what it says.
const sameRule = (a: string, b: string): boolean => ruleText(a).toLowerCase() === ruleText(b).toLowerCase()

/**
 * The rules ContextManager wrote into a CLAUDE.md, by the id their marker carries. A bullet with no marker was
 * written by a person, or before the marker existed, and is never ours to offer for removal.
 *
 * @param text the file
 * @returns one entry per marked bullet, in file order
 */
export const markedRules = (text: string): { patternId: string; text: string }[] =>
  text.split('\n').flatMap(line => {
    const id = MARKER.exec(line)?.[1]
    return id === undefined || !/^\s*[-*] /.test(line) ? [] : [{ patternId: id, text: ruleText(line) }]
  })

/**
 * The file without the bullet a pattern's marker names; every other line kept as it was, the heading too.
 *
 * @param text the file
 * @param patternId the rule to take out
 * @returns the file to write back
 */
export const withoutRule = (text: string, patternId: string): string =>
  text.split('\n').filter(line => MARKER.exec(line)?.[1] !== patternId).join('\n')

/**
 * What Write would do, before it does it: the lines it adds, whether the file already says it, and whether a
 * whole-file write would replace one that is there. A duplicate is only what can be shown to be one — the same
 * marker, the same bullet, the same file, the same permission — never a rule that merely disagrees.
 *
 * @param a the artifact
 * @param existing the file as it stands, or null where there is none
 * @returns the preview
 */
export const previewOf = (a: Artifact, existing: string | null): ArtifactPreview => {
  const base = { patternId: a.patternId, kind: a.kind, path: a.path, mode: a.mode }
  if (a.mode === 'merge-settings') {
    const allow = recordOf(objectOf(existing)['permissions'])['allow']
    return { ...base, added: a.content, duplicate: Array.isArray(allow) && allow.includes(a.content), overwrites: false }
  }
  if (a.mode === 'write') return { ...base, added: a.content, duplicate: existing === a.content, overwrites: existing !== null && existing !== a.content }
  const bullet = bulletOnly(a.content)
  const lines = (existing ?? '').split('\n')
  const duplicate = lines.some(line => MARKER.exec(line)?.[1] === a.patternId || (/^\s*[-*] /.test(line) && sameRule(line, bullet)))
  return { ...base, added: appendedTo(existing, a.content).slice((existing ?? '').length), duplicate, overwrites: false }
}

/** Appends an artifact's content to a file's text: the bullet alone under an existing heading, never glued to a line. */
export const appendedTo = (existing: string | null, content: string): string => {
  const base = existing ?? ''
  const glue = base === '' || base.endsWith('\n') ? '' : '\n'
  if (base.includes(CLAUDE_MD_HEADING)) return base + glue + bulletOnly(content)
  // A brand-new file opens on the heading itself; an existing one keeps the blank line before it.
  return base + glue + (base === '' ? content.replace(/^\n+/, '') : content)
}

// The name a written rule takes on disk. A title of nothing but punctuation slugs to nothing, and a file
// with no name is a path with a hole in it, so the body answers for it and a constant answers for both.
const nameOf = (p: Proposal): string => slug(p.title) || slug(p.body) || 'rule'

/** Renders the file an artifact kind writes: where it goes, what it says, how it lands. */
export const render = (kind: ArtifactKind, p: Proposal, cwd: string, patternId?: string): Pick<Artifact, 'path' | 'content' | 'mode'> => {
  if (kind === 'skill') return { path: `${cwd}/.claude/skills/${nameOf(p)}/SKILL.md`, content: skillDoc(p), mode: 'write' }
  if (kind === 'agent-brief') return { path: `${cwd}/.claude/agents/${nameOf(p)}.md`, content: briefDoc(p), mode: 'write' }
  if (kind === 'settings-allow') return { path: `${cwd}/.claude/settings.json`, content: p.body, mode: 'merge-settings' }
  return { path: `${cwd}/CLAUDE.md`, content: `\n${CLAUDE_MD_HEADING}\n${bulletOf(p.body, patternId)}`, mode: 'append' }
}

/** Returns the artifacts that make this session's decisions permanent, largest saving first. */
export const propose = (state: State): Artifact[] =>
  state.patterns.flatMap(p => artifactsOf(state, p)).sort((a, b) => b.savingPct - a.savingPct)

/** Adds a permission rule to permissions.allow, keeping every other setting; idempotent. */
export const mergeSettings = (existing: string | null, rule: string): string => {
  const root = objectOf(existing)
  const permissions = recordOf(root['permissions'])
  const allow = Array.isArray(permissions['allow']) ? permissions['allow'] : []
  const merged = { ...root, permissions: { ...permissions, allow: allow.includes(rule) ? allow : [...allow, rule] } }
  return `${JSON.stringify(merged, null, 2)}\n`
}

const artifactsOf = (state: State, p: Pattern): Artifact[] => {
  const proposal = proposalOf(p)
  // An artifact written, tried or skipped this session is done: the pane never offers it twice.
  if (proposal === null || state.written.includes(`${p.id}:${proposal.kind}`)) return []
  return [{
    patternId: p.id,
    kind: proposal.kind,
    title: proposal.title,
    savingPct: pctOf(baseline(state, p).chars * 3, state.usage.window),
    ...render(proposal.kind, proposal, state.cwd, p.id),
  }]
}

// Two decisions where D2 wins over 5.4's wording: an Ignore is final for the session, so it proposes nothing even
// when the judge attached a proposal; and a kill's permanent line is the scoped alternative, never its kill prompt.
const proposalOf = (p: Pattern): Proposal | null => {
  if (p.decision === null || p.decision === 'keep') return null
  if (p.proposal !== null) return p.proposal
  const body = p.decision === 'kill' ? p.alternative : (p.instruction ?? p.alternative)
  // The label is the rule, never the waste: a row offering `Write` reads as what would be written.
  return { kind: 'claude-md', title: titleOf(body) || p.id, body }
}

// The rule's first clause as a label: what it tells Claude to do, capitalised and without its full stop.
const titleOf = (body: string): string => {
  const s = collapseWs(body).split(/[;,]/)[0]?.replace(/\.$/, '') ?? ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const skillDoc = (p: Proposal): string =>
  `${frontmatter([field('name', nameOf(p)), field('description', p.title)])}${prose(p.body)}`

const briefDoc = (p: Proposal): string => {
  const lines = p.body.split('\n')
  const head = leading(lines)
  const rest = lines.slice(head.length)
  const model = valueOf(head, 'model')
  const tools = valueOf(head, 'tools') ?? BRIEF_TOOLS
  const fields = [field('name', nameOf(p)), field('description', p.title), ...(model === null ? [] : [field('model', model)]), field('tools', tools)]
  return `${frontmatter(fields)}${prose([...without(without(head, 'model'), 'tools'), ...rest].join('\n'))}`
}

const leading = (lines: string[]): string[] => {
  const blank = lines.findIndex(l => l.trim() === '')
  return blank === -1 ? lines : lines.slice(0, blank)
}

const frontmatter = (fields: string[]): string => `---\n${fields.join('\n')}\n---\n\n`

const field = (key: string, value: string): string => `${key}: ${JSON.stringify(collapseWs(value))}`

const prose = (body: string): string => `${body.trim()}\n`

const isField = (line: string, key: string): boolean => line.trim().toLowerCase().startsWith(`${key}:`)

const valueOf = (lines: string[], key: string): string | null => {
  const line = lines.find(l => isField(l, key))
  return line === undefined ? null : collapseWs(line.trim().slice(key.length + 1)) || null
}

const without = (lines: string[], key: string): string[] => {
  const i = lines.findIndex(l => isField(l, key))
  return i === -1 ? lines : [...lines.slice(0, i), ...lines.slice(i + 1)]
}

const objectOf = (text: string | null): Record<string, unknown> => {
  if (text === null) return {}
  try {
    return recordOf(JSON.parse(text))
  } catch {
    return {}
  }
}

const recordOf = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
