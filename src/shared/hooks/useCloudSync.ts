// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import {
  loadProjects,
  saveProject,
  saveProjectImmediate,
  deleteProject,
  cancelPendingSaves,
  subscribeToUserProjects,
  loadSettings,
  saveSettings,
  flushPendingSaves,
  upsertProfile,
} from '@/shared/firebase/firestore-driver'
import {
  projectToFirestoreDoc,
  firestoreDocToProject,
  firestoreDocToSprints,
  settingsToFirestoreDoc,
  firestoreDocToSettings,
} from '@/shared/firebase/firestore-converters'
import type { FirestoreProjectDoc } from '@/shared/firebase/types'
import type { Project, Sprint } from '@/shared/types'
import { getWorkspaceId } from '@/shared/state/storage'

/** Convert Firestore project docs into typed arrays for the Zustand store. */
function processProjectDocs(
  projectDocs: Iterable<[string, FirestoreProjectDoc]>,
  docMetaRef: React.MutableRefObject<Map<string, FirestoreProjectDoc>>
): { projects: Project[]; sprints: Sprint[] } {
  const projects: Project[] = []
  const sprints: Sprint[] = []

  for (const [docId, doc] of projectDocs) {
    docMetaRef.current.set(docId, doc)
    projects.push(firestoreDocToProject(docId, doc))
    sprints.push(...firestoreDocToSprints(doc))
  }

  return { projects, sprints }
}

/**
 * Cloud sync hook — activates Firestore sync when in cloud mode.
 * Subscribes to:
 *   - Firestore onSnapshot for incoming changes (Firestore → Zustand)
 *   - Sync bus for outgoing changes (Zustand → Firestore)
 */
export function useCloudSync(user: User | null, mode: 'local' | 'cloud') {
  const isActive = mode === 'cloud' && !!user
  const userRef = useRef(user)
  userRef.current = user

  // Track Firestore doc metadata for proper saves (owner/members)
  const docMetaRef = useRef<Map<string, FirestoreProjectDoc>>(new Map())

  useEffect(() => {
    if (!isActive || !user) return

    const uid = user.uid
    let cancelled = false
    let unsubscribeSnapshot: (() => void) | null = null
    let unsubscribeSyncBus: (() => void) | null = null

    // Upsert user profile on connect
    upsertProfile(uid, {
      displayName: user.displayName || '',
      email: user.email || '',
      lastSignIn: new Date().toISOString(),
    }).catch((err) => console.error('Profile upsert failed:', err))

    // --- Async setup: load first, then attach listeners ---
    async function setup() {
      // Initial load from Firestore
      try {
        const projectDocs = await loadProjects(uid)
        if (cancelled) return

        const { projects, sprints } = processProjectDocs(projectDocs, docMetaRef)

        // Data-loss guard: if cloud is empty but local has projects, skip
        // replacement on initial load. This prevents wiping un-migrated local
        // data when cloud mode activates without a prior upload.
        const localProjects = useProjectStore.getState().projects
        if (projects.length === 0 && localProjects.length > 0) {
          console.warn(
            `Cloud returned 0 projects but local has ${localProjects.length} — skipping initial replacement to protect local data`
          )
        } else {
          useProjectStore.getState().replaceProjectsFromCloud(projects, sprints)
        }

        // Load settings
        const settingsDoc = await loadSettings(uid)
        if (cancelled) return
        if (settingsDoc) {
          const settings = firestoreDocToSettings(settingsDoc)
          useSettingsStore.getState().replaceSettingsFromCloud(settings)
        }
      } catch (err) {
        console.error('Initial cloud load failed:', err)
      }

      if (cancelled) return

      // Subscribe to Firestore snapshots (incoming changes)
      unsubscribeSnapshot = subscribeToUserProjects(uid, (projectDocs) => {
        const { projects, sprints } = processProjectDocs(projectDocs, docMetaRef)

        // Same data-loss guard for snapshot updates
        const localProjects = useProjectStore.getState().projects
        if (projects.length === 0 && localProjects.length > 0) {
          console.warn(
            `Cloud snapshot returned 0 projects but local has ${localProjects.length} — skipping replacement`
          )
          return
        }

        useProjectStore.getState().replaceProjectsFromCloud(projects, sprints)
      })
    }

    setup()

    // --- Subscribe to sync bus (outgoing changes) ---
    unsubscribeSyncBus = syncBus.subscribe((event) => {
      const currentUser = userRef.current
      if (!currentUser) return

      switch (event.type) {
        case 'project:save': {
          const state = useProjectStore.getState()
          const project = state.projects.find((p) => p.id === event.projectId)
          if (!project) return

          const existingDoc = docMetaRef.current.get(event.projectId)
          const doc = projectToFirestoreDoc(
            project,
            state.sprints,
            currentUser.uid,
            existingDoc,
            state._originRef || getWorkspaceId(),
            state._changeLog
          )
          docMetaRef.current.set(event.projectId, doc)
          saveProject(event.projectId, doc)
          break
        }
        case 'project:delete': {
          docMetaRef.current.delete(event.projectId)
          deleteProject(event.projectId).catch((err) =>
            console.error('Cloud delete failed:', err)
          )
          break
        }
        case 'project:import': {
          // Cancel stale debounced saves so they don't overwrite imported data
          cancelPendingSaves()

          const state = useProjectStore.getState()
          const importedIds = new Set(state.projects.map((p) => p.id))

          // Delete old cloud projects not present in the import
          for (const oldId of docMetaRef.current.keys()) {
            if (!importedIds.has(oldId)) {
              docMetaRef.current.delete(oldId)
              deleteProject(oldId).catch((err) =>
                console.error('Cloud delete failed:', err)
              )
            }
          }

          // Save all imported projects (immediate, with owner/members)
          for (const project of state.projects) {
            const doc = projectToFirestoreDoc(
              project,
              state.sprints,
              currentUser.uid,
              docMetaRef.current.get(project.id),
              state._originRef || getWorkspaceId(),
              state._changeLog
            )
            docMetaRef.current.set(project.id, doc)
            saveProjectImmediate(project.id, doc).catch((err) =>
              console.error(`Cloud import save failed for ${project.id}:`, err)
            )
          }
          break
        }
        case 'settings:save': {
          const settingsState = useSettingsStore.getState()
          const doc = settingsToFirestoreDoc(settingsState)
          saveSettings(currentUser.uid, doc)
          break
        }
      }
    })

    // --- Flush on beforeunload ---
    function handleBeforeUnload() {
      flushPendingSaves()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      cancelled = true
      unsubscribeSnapshot?.()
      unsubscribeSyncBus?.()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Teardown fires on sign-out (credentials revoked) and mode switch.
      // Flushing would send writes against stale auth; cancel instead.
      // The `beforeunload` handler above remains the only flush path.
      cancelPendingSaves()
    }
  }, [isActive, user])
}
