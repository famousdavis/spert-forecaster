// Project sharing operations — find users, add/remove members, manage roles.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
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

/** Find a user by email address. Returns null if not found. */
export async function findUserByEmail(email: string): Promise<{ uid: string; profile: FirestoreProfileDoc } | null> {
  if (!db) return null
  const q = query(
    collection(db, COLLECTIONS.profiles),
    where('email', '==', email.toLowerCase().trim())
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

/** Remove a member from a project. Only the owner can remove members. */
export async function removeProjectMember(
  currentUid: string,
  projectId: string,
  targetUid: string
): Promise<SharingResult> {
  if (!db) return { success: false, error: 'Firestore not available' }

  const verification = await verifyProjectOwner(projectId, currentUid)
  if (!verification.ok) return verification.result
  const { projectRef } = verification

  // Remove from members map by setting to deleteField
  try {
    const { deleteField } = await import('firebase/firestore')
    await updateDoc(projectRef, {
      [`members.${targetUid}`]: deleteField(),
    })
  } catch (err) {
    return { success: false, error: `Failed to remove member: ${err}` }
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
