// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Merges a cloud view of the user's projects into the store's project list.
//
// ⚠️ This is a MERGE, not a replace, and every rule below exists because a
// replace lost data or misattributed it (Brief 40):
//   1. The STORE's order is kept. A project already in the store stays at its
//      index; a project new to the store is appended. The cloud has no order
//      field, and the Sprint History / Forecast tabs show projects[0] whenever
//      nothing is selected — so a reorder here moves the user's next sprint
//      into a different project.
//   2. A PROTECTED project (a local change not yet in any cloud view) keeps the
//      store's version, at its own index.
//   3. A project ABSENT from the cloud view is kept only while its create is
//      unconfirmed. Anything else absent was deleted or unshared remotely and
//      leaves the store, protected or not — keeping it would be a ghost that an
//      import later re-creates on the server.
//   4. A project whose local delete has not settled is never appended back.
//   5. A project whose cloud version equals the store's keeps the store's
//      object, and a merge that changes nothing reports changed: false, so an
//      own write's echo costs no store write, no re-render and no localStorage
//      write.

import type { Project, Sprint } from '@/shared/types'

export interface CloudMergePolicy {
  /** A local change to this project is not in any cloud view yet. */
  isProtected: (projectId: string) => boolean
  /** The project's first write (its create) has not been confirmed yet. */
  isCreateUnconfirmed: (projectId: string) => boolean
  /** A local delete of this project has been issued and has not settled. */
  isDeletePending: (projectId: string) => boolean
}

export interface ProjectSet {
  projects: Project[]
  sprints: Sprint[]
}

export interface CloudMergeResult extends ProjectSet {
  changed: boolean
}

function groupSprints(sprints: Sprint[]): Map<string, Sprint[]> {
  const byProject = new Map<string, Sprint[]>()
  for (const sprint of sprints) {
    const list = byProject.get(sprint.projectId)
    if (list) list.push(sprint)
    else byProject.set(sprint.projectId, [sprint])
  }
  return byProject
}

const definedKeys = (value: object): string[] =>
  Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined)

/**
 * Structural equality for JSON-shaped values: arrays element by element in
 * order, objects key by key. A key whose value is `undefined` counts as absent —
 * the converter writes `projectStartDate: undefined`, and a mutator's spread may
 * lack the key altogether.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  }
  const keysA = definedKeys(a)
  return (
    keysA.length === definedKeys(b).length &&
    keysA.every((key) => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  )
}

/**
 * Merge `cloud` (a raise, already converted) into `store` by the rules above.
 * Sprints in the result are, per output project, the sprints of the source that
 * project came from; the global order of the sprints array carries no meaning,
 * because every consumer filters by project and sorts by sprint number.
 */
export function mergeCloudView(store: ProjectSet, cloud: ProjectSet, policy: CloudMergePolicy): CloudMergeResult {
  const cloudById = new Map(cloud.projects.map((p) => [p.id, p]))
  const cloudSprints = groupSprints(cloud.sprints)
  const storeSprints = groupSprints(store.sprints)
  const projects: Project[] = []
  const sprints: Sprint[] = []
  let changed = false

  const take = (project: Project, from: Map<string, Sprint[]>) => {
    projects.push(project)
    sprints.push(...(from.get(project.id) ?? []))
  }

  for (const local of store.projects) {
    const remote = cloudById.get(local.id)
    if (remote === undefined) {
      // Rule 3: absent from the view.
      if (policy.isCreateUnconfirmed(local.id)) take(local, storeSprints)
      else changed = true
    } else if (
      policy.isProtected(local.id) ||
      (sameValue(local, remote) && sameValue(storeSprints.get(local.id) ?? [], cloudSprints.get(local.id) ?? []))
    ) {
      // Rule 2, and rule 5's identity reuse.
      take(local, storeSprints)
    } else {
      take(remote, cloudSprints)
      changed = true
    }
  }

  const storeIds = new Set(store.projects.map((p) => p.id))
  for (const remote of cloud.projects) {
    // Rule 4: a project deleted here, whose delete has not settled, stays gone.
    if (storeIds.has(remote.id) || policy.isDeletePending(remote.id)) continue
    take(remote, cloudSprints)
    changed = true
  }

  return changed ? { projects, sprints, changed } : { projects: store.projects, sprints: store.sprints, changed }
}
