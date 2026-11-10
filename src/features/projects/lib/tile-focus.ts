// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Finding a dashboard tile's controls when focus must land on one after a dialog closes
// (v0.49.0). The tile is found by its project id (`data-project-id`), never by a CSS selector
// built from the id: an id may hold any character. Its controls are found by the start of
// their names, which keep the project's name (D11): "View history for X", "Edit X", "Delete X".

export type TileControl = 'open' | 'edit' | 'delete'

const NAME_PREFIX: Record<TileControl, string> = {
  open: 'View history for ',
  edit: 'Edit ',
  delete: 'Delete ',
}

/** The control on `projectId`'s tile under `root`; null when the tile or the control is not there. */
export function findTileControl(root: ParentNode | null, projectId: string, control: TileControl): HTMLElement | null {
  const tile = Array.from(root?.querySelectorAll<HTMLElement>('[data-tile="true"]') ?? []).find(
    (el) => el.dataset.projectId === projectId,
  )
  return tile?.querySelector<HTMLElement>(`button[aria-label^="${NAME_PREFIX[control]}"]`) ?? null
}
