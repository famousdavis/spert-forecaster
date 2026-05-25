// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { toast } from 'sonner'
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
} from '@/shared/firebase/firestore-driver'
import { auth } from '@/shared/firebase/config'
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
  // Intentional latest-value ref write during render. userRef is only consumed
  // inside sync-bus effect callbacks, never during render itself. Moving to
  // useEffect would introduce a stale-ref window between render commit and
  // effect run.
  userRef.current = user

  // Track Firestore doc metadata for proper saves (owner/members)
  const docMetaRef = useRef<Map<string, FirestoreProjectDoc>>(new Map())

  useEffect(() => {
    if (!isActive || !user) return

    const uid = user.uid
    let cancelled = false
    let unsubscribeSnapshot: (() => void) | null = null
    let unsubscribeSyncBus: (() => void) | null = null

    // Profile writes are owned by AuthProvider (single source of truth, fires
    // on every auth resolution regardless of storage mode). Removed from this
    // hook in v0.26.0 to support cross-app email→uid resolution for the
    // bulk-invitation system.

    // Closure-local sentinel for the snapshot data-loss guard (I1).
    // Limits the guard to the first snapshot of each cloud session so
    // access-revocation events on subsequent snapshots propagate to the
    // local store. Reset implicitly on every effect re-run (sign-out →
    // re-sign-in creates a new closure with snapshotEverReceived = false).
    let snapshotEverReceived = false

    // --- Async setup: load first, then attach listeners ---
    async function setup() {
      // Initial load from Firestore
      try {
        const projectDocs = await loadProjects(uid)
        // `cancelled` handles teardown; `auth?.currentUser?.uid !== uid` adds
        // belt-and-suspenders defense for the user-switch edge case where a
        // different account signs in before the old effect tears down (H2).
        if (cancelled || auth?.currentUser?.uid !== uid) return

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
        if (cancelled || auth?.currentUser?.uid !== uid) return
        if (settingsDoc) {
          const settings = firestoreDocToSettings(settingsDoc)
          useSettingsStore.getState().replaceSettingsFromCloud(settings)
        }
      } catch (err) {
        console.error('Initial cloud load failed:', err)
        toast.error('Failed to load your projects from the cloud.')
      } finally {
        // Pitfall #88: "Attempted, done" — fires on success, throw, and
        // data-loss-guard bypass. !cancelled: if setup() is suspended at an
        // await when the cleanup runs, the next microtask resumes setup() and
        // hits this finally — by then `cancelled` is already true and the
        // signal is suppressed, so cleanup's false wins.
        if (!cancelled) {
          useProjectStore.getState().setCloudDataLoaded(true)
        }
      }

      if (cancelled) return

      // Subscribe to Firestore snapshots (incoming changes)
      unsubscribeSnapshot = subscribeToUserProjects(uid, (projectDocs) => {
        // User-guard (H-2). Reject snapshots for a different user (user-switch
        // race) or when no user is signed in (post-sign-out). `uid` is the
        // closure variable from subscription setup, NOT a live read.
        if (auth?.currentUser?.uid !== uid) return

        const { projects, sprints } = processProjectDocs(projectDocs, docMetaRef)

        // Data-loss guard (I1) — fires AT MOST ONCE per cloud session. After
        // the first snapshot, subsequent empty snapshots propagate so that
        // legitimate access-revocation reaches the local store.
        if (!snapshotEverReceived) {
          snapshotEverReceived = true
          const localProjects = useProjectStore.getState().projects
          if (projects.length === 0 && localProjects.length > 0) {
            console.warn(
              `Cloud snapshot returned 0 projects but local has ${localProjects.length} — ` +
              `skipping first snapshot to protect local data`
            )
            return
          }
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
          deleteProject(event.projectId).catch((err) => {
            console.error('Cloud delete failed:', err)
            toast.error('Failed to delete project from the cloud.')
          })
          break
        }
        case 'project:import': {
          // Cancel stale debounced saves so they don't overwrite imported data
          cancelPendingSaves()

          const state = useProjectStore.getState()
          const importedIds = new Set(state.projects.map((p) => p.id))
          const { replacedIdMap } = event

          // Pre-seed docMetaRef for name-conflict winner IDs so projectToFirestoreDoc
          // receives the old doc's owner/members instead of defaulting to the current
          // user with empty members (which would destroy prior sharing — pitfall #7).
          //
          // Owner guard: only pre-seed when currentUser IS the owner of the existing
          // doc. Non-owner editors cannot write a Firestore doc with
          // owner !== request.auth.uid. For non-owners the pre-seed is skipped: the
          // new winnerId doc is created with owner: currentUser.uid (allowed), but
          // the old existingId delete fails (rejected). After the next snapshot,
          // both docs appear — the toast in the delete loop below explains this.
          // TODO (v0.35.0): detect non-owned conflicts at preview time and disable
          // 'replace' for those rows. Requires exposing ownership metadata through
          // the Zustand store.
          //
          // Order rationale: pre-seed BEFORE the delete loop. The delete loop
          // iterates docMetaRef.current.keys() after the pre-seed has called
          // set(winnerId, oldDoc), so winnerId appears in keys() — but
          // importedIds.has(winnerId) is true (the winner is in the post-import
          // store), so it's not deleted. Reversing the order would call
          // docMetaRef.current.delete(existingId) before the pre-seed could read
          // oldDoc = docMetaRef.current.get(existingId).
          for (const [existingId, winnerId] of replacedIdMap) {
            const oldDoc = docMetaRef.current.get(existingId)
            if (
              oldDoc &&
              oldDoc.owner === currentUser.uid &&
              !docMetaRef.current.has(winnerId)
            ) {
              docMetaRef.current.set(winnerId, oldDoc)
            }
          }

          // Delete old cloud projects not present in the import
          for (const oldId of docMetaRef.current.keys()) {
            if (!importedIds.has(oldId)) {
              docMetaRef.current.delete(oldId)
              deleteProject(oldId).catch((err) => {
                console.error('Cloud delete failed:', err)
                // Non-owner editors cannot delete projects they don't own. The
                // replacement create succeeded, so the user now sees both the
                // old and new project with the same name. Inform them so they
                // can clean up manually.
                toast.error(
                  'Could not remove the original project from your cloud workspace — ' +
                  'you may see a duplicate. Delete it manually if needed.'
                )
              })
            }
          }

          // Save all imported projects (immediate, with owner/members)
          for (const project of state.projects) {
            const doc = projectToFirestoreDoc(
              project,
              state.sprints,
              currentUser.uid,
              docMetaRef.current.get(project.id), // pre-seeded winnerId carries old owner/members
              state._originRef || getWorkspaceId(),
              state._changeLog
            )
            docMetaRef.current.set(project.id, doc)
            saveProjectImmediate(project.id, doc).catch((err) => {
              console.error(`Cloud import save failed for ${project.id}:`, err)
              toast.error(`Failed to save imported project "${project.name}" to the cloud.`)
            })
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
    // v0.28.3 L3 (UX): if the user signs out and immediately closes the tab,
    // the listener can fire AFTER `firebaseSignOut()` has revoked the token
    // but BEFORE React commits `setUser(null)` and tears down this effect.
    // Flushing in that window dispatches Firestore writes against a stale
    // auth context — Firestore rejects them, but the user sees toast errors
    // on the way out. Gate on `auth.currentUser` so the post-sign-out window
    // routes to cancel instead.
    function handleBeforeUnload() {
      if (auth?.currentUser) {
        flushPendingSaves()
      } else {
        cancelPendingSaves()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    // D2 — pagehide covers bfcache navigations and iOS Safari, where
    // beforeunload is not reliably delivered. Both listeners route through
    // the same handler; flushPendingSaves is idempotent (the second call
    // finds no pending timers).
    window.addEventListener('pagehide', handleBeforeUnload)

    return () => {
      // Set cancelled = true FIRST. If setup() is suspended at an await, the
      // next microtask resumes and hits the finally — !cancelled is already
      // false so setCloudDataLoaded(true) is suppressed and cleanup's false
      // wins (pitfall #88).
      cancelled = true
      useProjectStore.getState().setCloudDataLoaded(false)
      unsubscribeSnapshot?.()
      unsubscribeSyncBus?.()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      // Teardown fires on sign-out (credentials revoked) and mode switch.
      // Flushing would send writes against stale auth; cancel instead.
      // The `beforeunload` handler above remains the only flush path.
      cancelPendingSaves()
    }
  }, [isActive, user])
}
