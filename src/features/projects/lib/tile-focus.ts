// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Finding a dashboard tile's controls when focus must land on one after a dialog closes, a
// delete, an archive or an unarchive (v0.49.0; v0.50.0). The tile is found by its project id
// (`data-project-id`), never by a CSS selector built from the id: an id may hold any character.
// Its controls are found by their names, which keep the project's name (D11), read with
// getAttribute('aria-label') and compared as TEXT. A selector built from a name would throw on a
// name holding `"` (inside the focus effect, under the Projects tab's error boundary) and find
// nothing for one holding `\`.

export type TileControl = 'open' | 'edit' | 'delete'

/**
 * The open button's two names (v0.50.0): "View history for X…" and, on an archived tile,
 * "Unarchive and view history for X…" (each may end with the access badge). The open button
 * comes first in the tile, so it is found before an Unarchive button whatever the project's name.
 */
const OPEN_PREFIXES = ['View history for ', 'Unarchive and view history for ']
const PREFIX: Record<Exclude<TileControl, 'open'>, string> = { edit: 'Edit ', delete: 'Delete ' }

const labelOf = (el: Element) => el.getAttribute('aria-label') ?? ''

function tileButtons(root: ParentNode | null, projectId: string): HTMLElement[] {
  const tile = Array.from(root?.querySelectorAll<HTMLElement>('[data-tile="true"]') ?? []).find(
    (el) => el.dataset.projectId === projectId,
  )
  return Array.from(tile?.querySelectorAll<HTMLElement>('button') ?? [])
}

/** The control on `projectId`'s tile under `root`; null when the tile or the control is not there. */
export function findTileControl(root: ParentNode | null, projectId: string, control: TileControl): HTMLElement | null {
  const matches =
    control === 'open'
      ? (label: string) => OPEN_PREFIXES.some((prefix) => label.startsWith(prefix))
      : (label: string) => label.startsWith(PREFIX[control])
  return tileButtons(root, projectId).find((b) => matches(labelOf(b))) ?? null
}

/** The control on `projectId`'s tile whose whole name is `name` ("Archive X", "Unarchive X"). */
export function findTileControlNamed(root: ParentNode | null, projectId: string, name: string): HTMLElement | null {
  return tileButtons(root, projectId).find((b) => labelOf(b) === name) ?? null
}

/** Where focus goes once the tiles have re-rendered. */
export type TileFocusTarget =
  | { kind: TileControl; projectId: string }
  | { kind: 'named'; projectId: string; name: string }
  | { kind: 'new' }

/**
 * Where focus goes when a tile leaves the grid (a delete, or an Archive with "Show archived"
 * off): the next SHOWN tile's name button, else the previous shown tile's, else New Project
 * (GanttApp's `focusAfterTileLeaves`, fed the shown list). Fed every project, a hidden archived
 * neighbour would drop focus to <body> (B44 again).
 */
export function focusAfterTileLeaves(shown: { id: string }[], leavingId: string): TileFocusTarget {
  const index = shown.findIndex((p) => p.id === leavingId)
  const neighbour = index === -1 ? undefined : (shown[index + 1] ?? shown[index - 1])
  return neighbour ? { kind: 'open', projectId: neighbour.id } : { kind: 'new' }
}

/** The element a focus target names, or null when it is not on screen. */
export function resolveFocusTarget(
  root: ParentNode | null,
  target: TileFocusTarget,
  newProject: HTMLElement | null,
): HTMLElement | null {
  if (target.kind === 'new') return newProject
  if (target.kind === 'named') return findTileControlNamed(root, target.projectId, target.name)
  return findTileControl(root, target.projectId, target.kind)
}
