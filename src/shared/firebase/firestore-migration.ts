// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// One-way local-to-cloud migration.
// Uploads all localStorage projects to Firestore with collision detection.

import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { getWorkspaceId, appendChangeLogEntry } from '@/shared/state/storage'
import { projectToFirestoreDoc, settingsToFirestoreDoc } from './firestore-converters'
import { saveProjectImmediate, saveSettingsImmediate, projectExists, uploadProjectPrefs } from './firestore-driver'
import { projectPrefOf } from '@/shared/lib/project-prefs'
import { upsertProfile } from './profileWrites'
import type { FirestoreProfileDoc } from './types'

export interface MigrationResult {
  projectsUploaded: number
  projectsSkipped: number
  settingsUploaded: boolean
  errors: string[]
}

/**
 * Migrate all local data to Firestore.
 * - Each project becomes a Firestore document with denormalized sprints.
 * - Dataset-level _originRef and _changeLog are copied per-project.
 * - Collision detection: if project ID already exists in Firestore, generate new ID.
 */
export async function migrateLocalToCloud(
  uid: string,
  profile: FirestoreProfileDoc
): Promise<MigrationResult> {
  const result: MigrationResult = {
    projectsUploaded: 0,
    projectsSkipped: 0,
    settingsUploaded: false,
    errors: [],
  }

  const projectState = useProjectStore.getState()
  const settingsState = useSettingsStore.getState()
  const { projects, sprints, _originRef, _changeLog } = projectState
  const originRef = _originRef || getWorkspaceId()
  // v0.50.0: each project this upload writes, under the id it has in the cloud (reassigned on a
  // collision below). Only these projects' tile colours and archives go up.
  const uploaded: { localId: string; cloudId: string }[] = []

  // Append migration event to changelog
  const migrationLog = appendChangeLogEntry(_changeLog, {
    op: 'import',
    entity: 'dataset',
    source: 'cloud-migration',
  })

  // Upload profile first
  try {
    await upsertProfile(uid, profile)
  } catch (err) {
    result.errors.push(`Profile upload failed: ${err}`)
  }

  // Upload each project
  for (const project of projects) {
    try {
      // Check for collision
      let projectId = project.id
      try {
        const exists = await projectExists(projectId)
        if (exists) {
          // Generate new ID to avoid collision
          projectId = crypto.randomUUID()
          result.errors.push(`Project "${project.name}" had ID collision, assigned new ID`)
        }
      } catch {
        // permission-denied = belongs to someone else, generate new ID.
        // Say so. This branch used to reassign silently while projectsUploaded++
        // still ran, so a reassignment forced by another account owning that id
        // reached the user as an unqualified success — with none of the
        // downstream consequences of a changed id visible anywhere.
        projectId = crypto.randomUUID()
        result.errors.push(
          `Project "${project.name}" could not be checked for an ID collision, assigned new ID`
        )
      }

      const projectWithId = { ...project, id: projectId }

      // ⚠️ REMAP THE SPRINTS WHENEVER THE ID WAS REASSIGNED.
      // projectToFirestoreDoc:28 selects sprints with `s.projectId === project.id`.
      // Handing it the reassigned project alongside the untouched store array
      // matched NOTHING — every sprint still carried the old id — so the document
      // uploaded with `sprints: []` while `projectsUploaded++` still reported
      // success. Migration is one-way, and useCloudSync's data-loss guard counts
      // PROJECTS (`projects.length === 0`), so a project holding zero sprints does
      // not trip it: the empty cloud doc then replaced the local sprint history
      // permanently. `import-utils.ts:694` already remaps on its own id mint.
      const projectSprints = sprints
        .filter((s) => s.projectId === project.id)
        .map((s) => (s.projectId === projectId ? s : { ...s, projectId }))

      const doc = projectToFirestoreDoc(
        projectWithId,
        projectSprints,
        uid,
        undefined, // no existing doc
        originRef,
        migrationLog
      )
      await saveProjectImmediate(projectId, doc)
      result.projectsUploaded++
      uploaded.push({ localId: project.id, cloudId: projectId })
    } catch (err) {
      result.errors.push(`Failed to upload project "${project.name}": ${err}`)
    }
  }

  // Upload settings. The seven ordinary fields never carry the map (Brief 20 trap 3); the tile
  // colours and archives go in their own write, and settings count as uploaded only once both
  // have landed.
  try {
    const settingsDoc = settingsToFirestoreDoc(settingsState)
    await saveSettingsImmediate(uid, settingsDoc)
    // ⚠️ Immediate and awaited, never the debounced write: a failure must land in
    // result.errors, which keeps the mode local (UploadConfirmPanel). A debounced write would
    // fail after the switch with no error, and the first cloud load would then replace the
    // local map with the cloud's — every colour and archive lost, reported as a success.
    //
    // Exactly the uploaded projects' entries, each under its cloud id, both fields masked (a
    // field the local entry lacks is cleared there). Every other cloud entry stays as it is, and
    // no other local entry goes up: a cloud→local switch keeps the map, so it can hold a cloud
    // account's entries under live cloud ids.
    try {
      await uploadProjectPrefs(
        uid,
        uploaded.map(({ localId, cloudId }) => ({
          projectId: cloudId,
          pref: projectPrefOf(settingsState.projectPrefs, localId),
        })),
      )
      result.settingsUploaded = true
    } catch (err) {
      result.errors.push(`Tile colours and archive upload failed: ${err}`)
    }
  } catch (err) {
    result.errors.push(`Settings upload failed: ${err}`)
  }

  return result
}
