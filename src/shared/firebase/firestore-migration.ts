// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// One-way local-to-cloud migration.
// Uploads all localStorage projects to Firestore with collision detection.

import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { getWorkspaceId, appendChangeLogEntry } from '@/shared/state/storage'
import { projectToFirestoreDoc, settingsToFirestoreDoc } from './firestore-converters'
import { saveProjectImmediate, saveSettingsImmediate, upsertProfile, projectExists } from './firestore-driver'
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
        // permission-denied = belongs to someone else, generate new ID
        projectId = crypto.randomUUID()
      }

      const projectWithId = { ...project, id: projectId }
      const doc = projectToFirestoreDoc(
        projectWithId,
        sprints,
        uid,
        undefined, // no existing doc
        originRef,
        migrationLog
      )
      await saveProjectImmediate(projectId, doc)
      result.projectsUploaded++
    } catch (err) {
      result.errors.push(`Failed to upload project "${project.name}": ${err}`)
    }
  }

  // Upload settings
  try {
    const settingsDoc = settingsToFirestoreDoc(settingsState)
    await saveSettingsImmediate(uid, settingsDoc)
    result.settingsUploaded = true
  } catch (err) {
    result.errors.push(`Settings upload failed: ${err}`)
  }

  return result
}
