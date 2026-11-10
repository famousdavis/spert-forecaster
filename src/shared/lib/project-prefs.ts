// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// One person's tile colours and archived projects (v0.50.0), ported from GanttApp's
// `src/shared/utils/projectPrefs.ts` at d437e84. The map lives in that person's own settings
// (`spert-settings` locally, `spertforecaster_settings/{uid}` in the cloud), never on a
// project, so another member of a shared project sees neither.
//
// An entry can outlive its project on purpose: a project can leave and come back (a member
// removed and invited again, a backup restored), and an old entry is harmless. So nothing here
// prunes on load, and counts come from the projects, never from the map.
//
// Pure: no store, no Firestore. Sprint History, Forecast, Connect AI and Projects all read it.

import type { Project } from '@/shared/types'

export type ProjectColor = 'blue' | 'teal' | 'slate' | 'purple' | 'pink'

/** One project's entry. No colour is the field absent; `archived` is `true` or absent. */
export interface ProjectPref {
  color?: ProjectColor
  archived?: true
}

/** Keyed by project id. */
export type ProjectPrefs = Record<string, ProjectPref>

/** The two fields of an entry, as the cloud write names them. */
export type ProjectPrefField = 'color' | 'archived'

export const PROJECT_COLORS: readonly ProjectColor[] = ['blue', 'teal', 'slate', 'purple', 'pink']

/** Far more than anyone holds: a bound on what a tampered store or document can add. */
export const MAX_PROJECT_PREFS = 1000

/**
 * An id that must never be a key. `__proto__` and `constructor` reach the prototype, and the
 * Firestore SDK refuses any write that carries a field named `__…__`, inside the mask or out of
 * it (both R2 plan reviews' probes). `constructor` the SDK accepts; it is refused for the
 * prototype's sake. An empty or non-string id is refused too.
 */
export function isUnsafePrefKey(id: unknown): boolean {
  return typeof id !== 'string' || id === '' || id === 'constructor' || /^__.*__$/.test(id)
}

function hasEntry(prefs: ProjectPrefs | undefined, id: string): prefs is ProjectPrefs {
  return prefs !== undefined && Object.prototype.hasOwnProperty.call(prefs, id)
}

/** Each field on its own, then the entry: a refused colour leaves a valid archive. */
function sanitizeEntry(raw: unknown): ProjectPref | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { color, archived } = raw as { color?: unknown; archived?: unknown }
  const pref: ProjectPref = {}
  if (PROJECT_COLORS.includes(color as ProjectColor)) pref.color = color as ProjectColor
  if (archived === true) pref.archived = true
  return pref.color || pref.archived ? pref : null
}

/**
 * The map as stored, kept only where it can be trusted: a rehydrated `spert-settings` and a
 * cloud settings document both come through here. Never throws; `{}` when nothing is left.
 */
export function sanitizeProjectPrefs(raw: unknown): ProjectPrefs {
  const out: ProjectPrefs = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let kept = 0
  for (const key of Object.keys(raw)) {
    if (kept >= MAX_PROJECT_PREFS) break
    if (isUnsafePrefKey(key)) continue
    const pref = sanitizeEntry((raw as Record<string, unknown>)[key])
    if (!pref) continue
    out[key] = pref
    kept++
  }
  return out
}

/** This project's entry, or an empty one: a project with the id `constructor` finds nothing. */
export function projectPrefOf(prefs: ProjectPrefs | undefined, id: string): ProjectPref {
  return hasEntry(prefs, id) ? prefs[id] : {}
}

export function isProjectArchived(prefs: ProjectPrefs | undefined, id: string): boolean {
  return projectPrefOf(prefs, id).archived === true
}

/** The projects this person sees: everything, or everything not archived. */
export function shownProjects(projects: Project[], prefs: ProjectPrefs | undefined, showArchived: boolean): Project[] {
  return showArchived ? projects : projects.filter((p) => !isProjectArchived(prefs, p.id))
}

/**
 * The full list with the shown projects in `shownIds`' order: the slots that held a shown
 * project take the new order, and a hidden project keeps its slot. Always the full list:
 * `reorderProjects` deletes every project it is not given (B29), so a filtered list must
 * never reach it.
 */
export function reorderShown(projects: Project[], shownIds: string[]): Project[] {
  const byId = new Map(projects.map((p) => [p.id, p] as const))
  const shown = new Set(shownIds)
  let next = 0
  return projects.map((p) => (shown.has(p.id) ? (byId.get(shownIds[next++]) as Project) : p))
}
