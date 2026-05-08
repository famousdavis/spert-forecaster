// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Project sharing operations — find users, add/remove members, manage roles.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  runTransaction,
  deleteField,
  type DocumentReference,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS, type ProjectRole, type ProjectMember, type FirestoreProfileDoc } from './types'

type SharingResult = { success: boolean; error?: string }

type OwnerVerification =
  | { ok: true; projectRef: DocumentReference }
  | { ok: false; result: SharingResult }

/** Verify that the current user is the owner of a project. Returns projectRef on success. */
async function verifyProjectOwner(
  projectId: string,
  currentUid: string
): Promise<OwnerVerification> {
  const projectRef = doc(db!, COLLECTIONS.projects, projectId)
  const projectSnap = await getDoc(projectRef)
  if (!projectSnap.exists()) {
    return { ok: false, result: { success: false, error: 'Project not found' } }
  }
  const projectData = projectSnap.data()
  if (projectData.owner !== currentUid) {
    return { ok: false, result: { success: false, error: 'Only the project owner can perform this action' } }
  }
  return { ok: true, projectRef }
}

/** Find a user by email address. Returns null if not found or invalid. */
export async function findUserByEmail(email: string): Promise<{ uid: string; profile: FirestoreProfileDoc } | null> {
  if (!db) return null
  const cleaned = email.toLowerCase().trim()
  if (!cleaned || cleaned.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null
  const q = query(
    collection(db, COLLECTIONS.profiles),
    where('email', '==', cleaned)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]!
  return { uid: docSnap.id, profile: docSnap.data() as FirestoreProfileDoc }
}

/** Share a project with another user by email. Only the project owner can share. */
export async function shareProject(
  currentUid: string,
  projectId: string,
  email: string,
  role: ProjectRole
): Promise<SharingResult> {
  if (!db) return { success: false, error: 'Firestore not available' }

  const verification = await verifyProjectOwner(projectId, currentUid)
  if (!verification.ok) return verification.result
  const { projectRef } = verification

  // Find target user
  const targetUser = await findUserByEmail(email)
  if (!targetUser) return { success: false, error: 'User not found. They must sign in to SPERT Forecaster first.' }
  if (targetUser.uid === currentUid) return { success: false, error: 'Cannot share with yourself' }

  // Add member
  try {
    await updateDoc(projectRef, {
      [`members.${targetUser.uid}`]: role,
    })
  } catch (err) {
    return { success: false, error: `Failed to update project: ${err}` }
  }

  return { success: true }
}

/**
 * Remove a member from a project. Three-guard transactional pattern (Lesson 50):
 *
 *   Guard 1 (pre-tx, fast-fail): caller cannot remove themselves.
 *   Guard 2 (in-tx, defense-in-depth): caller must still be the owner.
 *   Guard 3 (in-tx): the project owner cannot be removed (would brick the doc —
 *                    Firestore `list`/`get` rules require uid in members map +
 *                    owner field, and removing the owner from the doc passes
 *                    the `update` rule but produces a permanently-inaccessible
 *                    project).
 *
 * `verifyProjectOwner`'s pre-flight read is intentionally dropped here — Guard 2
 * inside the transaction provides the same check atomically. The helper remains
 * for `shareProject` and `updateMemberRole`, which still benefit from the early
 * return shape.
 *
 * Guards throw plain `Error` objects (no `.code` property). The catch block
 * surfaces `err.message` directly into `SharingResult.error`; UI callers must
 * NOT route through `mapInvitationError` (that pattern-matches `functions/*`
 * Cloud Function error codes).
 */
export async function removeProjectMember(
  currentUid: string,
  projectId: string,
  targetUid: string
): Promise<SharingResult> {
  if (!db) return { success: false, error: 'Firestore not available' }

  // Guard 1 — pre-transaction fast-fail. No Firestore read needed.
  if (targetUid === currentUid) {
    return { success: false, error: 'Cannot remove yourself from a project.' }
  }

  const projectRef = doc(db, COLLECTIONS.projects, projectId)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(projectRef)
      if (!snap.exists()) throw new Error('Project not found.')
      const data = snap.data()
      // Guard 2 — caller must be owner (defense-in-depth alongside Firestore rules).
      // UI is owner-gated, so this should never fire in practice.
      if (data.owner !== currentUid) {
        console.warn('[firestore-sharing] non-owner attempted remove — UI gating bypass?')
        throw new Error('Only the project owner can remove members.')
      }
      // Guard 3 — cannot remove the project owner.
      if (data.owner === targetUid) throw new Error('Cannot remove the project owner.')
      tx.update(projectRef, { [`members.${targetUid}`]: deleteField() })
    })
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  return { success: true }
}

/** Get all members of a project (including owner). */
export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  if (!db) return []

  const projectRef = doc(db, COLLECTIONS.projects, projectId)
  const projectSnap = await getDoc(projectRef)
  if (!projectSnap.exists()) return []

  const projectData = projectSnap.data()
  const members: ProjectMember[] = []

  // Add owner
  const ownerProfile = await getDoc(doc(db, COLLECTIONS.profiles, projectData.owner))
  const ownerData = ownerProfile.exists() ? (ownerProfile.data() as FirestoreProfileDoc) : null
  members.push({
    uid: projectData.owner,
    email: ownerData?.email || '',
    displayName: ownerData?.displayName || '',
    role: 'owner',
  })

  // Add members
  const memberEntries = Object.entries(projectData.members || {}) as [string, ProjectRole][]
  for (const [uid, role] of memberEntries) {
    const profileSnap = await getDoc(doc(db, COLLECTIONS.profiles, uid))
    const profileData = profileSnap.exists() ? (profileSnap.data() as FirestoreProfileDoc) : null
    members.push({
      uid,
      email: profileData?.email || '',
      displayName: profileData?.displayName || '',
      role,
    })
  }

  return members
}

/** Update a member's role. Only the owner can change roles. */
export async function updateMemberRole(
  currentUid: string,
  projectId: string,
  targetUid: string,
  newRole: ProjectRole
): Promise<SharingResult> {
  if (!db) return { success: false, error: 'Firestore not available' }

  const verification = await verifyProjectOwner(projectId, currentUid)
  if (!verification.ok) return verification.result
  const { projectRef } = verification

  try {
    await updateDoc(projectRef, {
      [`members.${targetUid}`]: newRole,
    })
  } catch (err) {
    return { success: false, error: `Failed to update role: ${err}` }
  }

  return { success: true }
}
