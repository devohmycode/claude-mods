/**
 * Finding and filling a slot in a drawing somebody else made.
 *
 * A tab of the cockpit cannot be a `render` this mod hands over: each plugin's
 * hooks run in an environment of its own, a call on another plugin's noun
 * crosses that boundary, and its arguments must be plain data —
 * *the object can not be cloned*, says the engine, of a function. So the tab
 * is registered as three plain fields, and the body is drawn here, from this
 * mod's own `ui.render` hook, into the slot the cockpit leaves for it.
 *
 * A drawing, unlike a function, does cross: it is plain data, and a Button's
 * `onPress` stays in its own environment under a handle the host keeps. That
 * is what makes any of this work.
 *
 * Pure, and the whole of it is a walk over `{ type, props, children }`. It
 * walks the tree as data rather than as a `RenderElement`, because that union
 * has leaves with no `children` and a node of the engine's own with no
 * `props`, and a walk that narrowed to each in turn would say less clearly
 * what it does: look at every node, read a key where there is one, and go on
 * through whatever children it has.
 */

import type { RenderElement } from 'claude-code'

/**
 * A node as this walk reads it.
 */
type Node = {
  readonly props?: { readonly key?: unknown }
  readonly children?: readonly unknown[]
}

/**
 * Whether a value is a node to look inside: an element, and not a string, a
 * number, a nullish or a list.
 *
 * @param value the value
 * @returns whether it is one
 */
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A node's key, where it has one.
 *
 * @param value the node
 * @returns its key, or null for anything without a string key
 */
export function keyOf(value: unknown): string | null {
  if (!isNode(value)) {
    return null
  }

  const key = value.props?.key

  return typeof key === 'string' ? key : null
}

/**
 * The element keyed `key`, anywhere in a drawing.
 *
 * @param tree the drawing, or one of its nodes
 * @param key the key to look for
 * @returns the element, or null where the drawing holds none
 */
export function foundIn(tree: unknown, key: string): RenderElement | null {
  if (Array.isArray(tree)) {
    for (const child of tree as readonly unknown[]) {
      const found = foundIn(child, key)

      if (found !== null) {
        return found
      }
    }

    return null
  }

  if (!isNode(tree)) {
    return null
  }

  return keyOf(tree) === key
    ? (tree as RenderElement)
    : foundIn(tree.children, key)
}

/**
 * The drawing with the element keyed `key` replaced by `body`.
 *
 * Rebuilt down the path to the slot and shared everywhere else: what the
 * cockpit drew is passed on as it drew it, save for the one node it left
 * empty. A drawing that holds no such node comes back as it went in, which is
 * what tells a caller that it is drawing inside the cockpit rather than
 * outside it.
 *
 * @param tree the drawing
 * @param key the slot's key
 * @param body what to put in its place
 * @returns the drawing, filled
 */
export function filled(
  tree: RenderElement,
  key: string,
  body: RenderElement,
): RenderElement {
  return fill(tree, key, body) as RenderElement
}

/**
 * The walk `filled` is the entry of: one node, its children rebuilt only
 * where one of them changed.
 *
 * @param value the node
 * @param key the slot's key
 * @param body what to put in its place
 * @returns the node, filled
 */
function fill(value: unknown, key: string, body: RenderElement): unknown {
  if (Array.isArray(value)) {
    return mapped(value as readonly unknown[], key, body)
  }

  if (!isNode(value)) {
    return value
  }

  if (keyOf(value) === key) {
    return body
  }

  const children = value.children

  if (children === undefined) {
    return value
  }

  const next = mapped(children, key, body)

  return next === children ? value : { ...value, children: next }
}

/**
 * A list of children, rebuilt only where one of them changed.
 *
 * @param children the children
 * @param key the slot's key
 * @param body what to put in its place
 * @returns the children, the same list where nothing moved
 */
function mapped(
  children: readonly unknown[],
  key: string,
  body: RenderElement,
): readonly unknown[] {
  let hasChanged = false

  const next = children.map(child => {
    const drawn = fill(child, key, body)

    hasChanged ||= drawn !== child

    return drawn
  })

  return hasChanged ? next : children
}
