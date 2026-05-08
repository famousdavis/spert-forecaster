// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import {
  getProjectMembers,
  shareProject,
  removeProjectMember,
  updateMemberRole,
} from '@/shared/firebase/firestore-sharing'
import {
  listPendingInvites,
  revokeInviteToken,
  resendInviteToken,
  parseBulkEmails,
  mapInvitationError,
} from '@/shared/firebase/firestore-invitations'
import { getSendInvitationEmail } from '@/shared/firebase/config'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { INVITATIONS_ENABLED } from '@/lib/feature-flags'
import type {
  ProjectMember,
  ProjectRole,
  PendingInvite,
  SendInvitationEmailResult,
} from '@/shared/firebase/types'

interface SharingSectionProps {
  projectId: string
  projectName: string
}

/**
 * Four-state enum for the async ownership check (Lesson 60).
 *
 *   'loading'    — getProjectMembers in flight; render nothing visible yet.
 *   'owner'      — caller is the project owner; render the bulk-invite form
 *                  and the role/remove controls.
 *   'not-owner'  — caller is signed in and a member but not the owner;
 *                  render the members list (read-only role badges) but
 *                  hide the bulk-invite form.
 *   'error'      — getProjectMembers rejected (network blip, transient
 *                  permission). Render a visible error message instead of
 *                  silently hiding the section, so an owner mid-edit knows
 *                  to refresh rather than losing context.
 *
 * Derived from the async members fetch, NOT synchronously from
 * `project.owner` (which Forecaster's local Project type doesn't carry —
 * that's the Scheduler/AHP pattern).
 */
type OwnerStatus = 'loading' | 'owner' | 'not-owner' | 'error'

export function SharingSection({ projectId, projectName }: SharingSectionProps) {
  const { user } = useAuth()
  const { mode } = useStorageMode()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('editor')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Bulk-invite state (flag-on path)
  const [bulkEmails, setBulkEmails] = useState('')
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteResult, setInviteResult] = useState<SendInvitationEmailResult | null>(null)
  const [sendError, setSendError] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [revokeConfirmTokenId, setRevokeConfirmTokenId] = useState<string | null>(null)
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus>('loading')

  const isOwner = ownerStatus === 'owner'

  const loadMembers = useCallback(async () => {
    if (mode !== 'cloud') return

    // Lesson 64: Promise.allSettled instead of sequential awaits. If
    // listPendingInvites rejects (transient permission, Firestore rules deny
    // for non-owners), the member list refresh must still land — and vice
    // versa. Promise.all is fail-fast and would lose one update on the
    // other's failure.
    const wantsPending = INVITATIONS_ENABLED && !!user
    const [memRes, pendRes] = await Promise.allSettled([
      getProjectMembers(projectId),
      wantsPending
        ? listPendingInvites(user!.uid, projectId)
        : Promise.resolve<PendingInvite[]>([]),
    ])

    // Lesson 60: derive OwnerStatus from the members fetch. The same fetch
    // populates the members list, so a single Promise drives both states.
    if (memRes.status === 'fulfilled') {
      const fetched = memRes.value
      setMembers(fetched)
      const callerIsOwner = fetched.some(
        (m) => m.uid === user?.uid && m.role === 'owner'
      )
      setOwnerStatus(callerIsOwner ? 'owner' : 'not-owner')
    } else {
      console.warn('[SharingSection] member refresh failed:', memRes.reason)
      setOwnerStatus('error')
    }

    if (wantsPending) {
      if (pendRes.status === 'fulfilled') {
        setPendingInvites(pendRes.value)
      } else {
        console.warn('[SharingSection] pending refresh failed:', pendRes.reason)
      }
    }
  }, [projectId, mode, user])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  if (mode !== 'cloud' || !user) return null

  // --- Flag-OFF (legacy single-email) handlers ---

  const handleShare = async () => {
    if (!email.trim()) return
    setIsLoading(true)
    setError('')
    setSuccess('')
    const result = await shareProject(user.uid, projectId, email.trim(), role)
    if (result.success) {
      setSuccess(`Shared with ${email.trim()}`)
      setEmail('')
      await loadMembers()
    } else {
      setError(result.error || 'Failed to share')
    }
    setIsLoading(false)
  }

  const handleRemove = async (targetUid: string) => {
    const result = await removeProjectMember(user.uid, projectId, targetUid)
    if (result.success) {
      await loadMembers()
    } else {
      setError(result.error || 'Failed to remove member')
    }
  }

  const handleRoleChange = async (targetUid: string, newRole: ProjectRole) => {
    const result = await updateMemberRole(user.uid, projectId, targetUid, newRole)
    if (result.success) {
      await loadMembers()
    } else {
      setError(result.error || 'Failed to update role')
    }
  }

  // --- Flag-ON (bulk-invite) handlers ---

  const handleBulkInvite = async () => {
    const { valid, invalid } = parseBulkEmails(bulkEmails)
    if (valid.length === 0 && invalid.length === 0) return

    setSendError('')
    setInviteResult(null)

    // Lesson 42 + 43: when ALL submitted tokens are invalid-format, do NOT call
    // the CF and do NOT clear the textarea — surface the invalid chips and let
    // the user fix and retry.
    if (valid.length === 0) {
      setInviteResult({
        added: [],
        invited: [],
        failed: invalid.map((email) => ({ email, reason: 'invalid-format' })),
      })
      return
    }

    setIsLoading(true)
    try {
      const callable = getSendInvitationEmail()
      if (!callable) throw new Error('Cloud invitations not configured.')
      const res = await callable({
        appId: 'spertforecaster',
        modelId: projectId,
        emails: valid,
        role,
        isVoting: false,
      })
      // Merge client-side invalid-format failures into the CF result so the
      // UI renders them alongside CF-side rejections (uniform red chips).
      const merged: SendInvitationEmailResult = {
        added: res.data.added,
        invited: res.data.invited,
        failed: [
          ...invalid.map((email) => ({ email, reason: 'invalid-format' })),
          ...res.data.failed,
        ],
      }
      setInviteResult(merged)
      // Lesson 43: clear the textarea only when at least one address landed
      // (added or invited). If every valid address was CF-rejected, retain
      // the textarea content so the user can correct and retry.
      if (merged.added.length + merged.invited.length > 0) {
        setBulkEmails('')
      }
      await loadMembers()
    } catch (err) {
      setSendError(mapInvitationError(err, 'send'))
    }
    setIsLoading(false)
  }

  const handleResend = async (tokenId: string) => {
    setActionBusy(tokenId)
    setSendError('')
    try {
      await resendInviteToken(tokenId)
      await loadMembers()
    } catch (err) {
      setSendError(mapInvitationError(err, 'resend'))
    }
    setActionBusy(null)
  }

  const handleRevoke = async (tokenId: string) => {
    setActionBusy(tokenId)
    setSendError('')
    try {
      await revokeInviteToken(tokenId)
      await loadMembers()
    } catch (err) {
      setSendError(mapInvitationError(err, 'revoke'))
    }
    setActionBusy(null)
    setRevokeConfirmTokenId(null)
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-spert-text-secondary dark:text-gray-300">
        Sharing: {projectName}
      </h4>

      {/* Lesson 60: visible error state — never hide the section silently. */}
      {ownerStatus === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load sharing details. Refresh the page to try again.
        </p>
      )}

      {/* Member list */}
      {ownerStatus !== 'error' && members.length > 0 && (
        <div className="space-y-1">
          {members.map((member) => (
            <div key={member.uid} className="flex items-center gap-2 text-sm py-1">
              <span className="text-spert-text dark:text-gray-200 truncate flex-1">
                {member.displayName || member.email}
                {member.uid === user.uid && <span className="text-xs text-spert-text-muted"> (you)</span>}
              </span>
              {member.role === 'owner' ? (
                <span className="text-xs text-spert-text-muted dark:text-gray-400 px-2">Owner</span>
              ) : isOwner ? (
                <>
                  <select
                    name="memberRole"
                    aria-label={`Role for ${member.displayName || member.email}`}
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.uid, e.target.value as ProjectRole)}
                    className="text-xs border border-spert-border dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-200 cursor-pointer"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleRemove(member.uid)}
                    className="text-xs text-red-500 hover:text-red-700 cursor-pointer px-1"
                    title="Remove member"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-xs text-spert-text-muted dark:text-gray-400 px-2 capitalize">{member.role}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add member form (owner only) */}
      {isOwner && (
        <>
          {INVITATIONS_ENABLED ? (
            <>
              <div className="space-y-2">
                <textarea
                  name="bulkInviteEmails"
                  aria-label="Invite email addresses"
                  value={bulkEmails}
                  onChange={(e) => {
                    setBulkEmails(e.target.value)
                    if (inviteResult) setInviteResult(null)
                  }}
                  placeholder="Enter email addresses separated by commas, semicolons, or newlines"
                  rows={3}
                  className="w-full p-1.5 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100"
                />
                <div className="flex gap-2 items-center">
                  <select
                    name="bulkInviteRole"
                    aria-label="Invitee role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as ProjectRole)}
                    className="p-1.5 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 cursor-pointer"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={handleBulkInvite}
                    disabled={isLoading || !bulkEmails.trim()}
                    className="px-3 py-1.5 text-sm font-medium rounded bg-spert-blue text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? '...' : 'Invite'}
                  </button>
                </div>
              </div>

              {inviteResult && (
                <div className="text-xs space-y-0.5">
                  {inviteResult.added.length > 0 && (
                    <p className="text-green-600 dark:text-green-400">
                      Added {inviteResult.added.length}: {inviteResult.added.join(', ')}
                    </p>
                  )}
                  {inviteResult.invited.length > 0 && (
                    <p className="text-spert-blue dark:text-blue-300">
                      Invited {inviteResult.invited.length}: {inviteResult.invited.join(', ')}
                    </p>
                  )}
                  {inviteResult.failed.map((f) => (
                    <p key={f.email} className="text-red-600 dark:text-red-400">
                      Skipped {f.email} ({f.reason})
                    </p>
                  ))}
                </div>
              )}

              {pendingInvites.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-xs font-semibold text-spert-text-secondary dark:text-gray-400">
                    Pending Invitations
                  </h5>
                  {pendingInvites.map((inv) => (
                    <div key={inv.tokenId} className="flex items-center gap-2 text-xs py-1">
                      <span className="flex-1 truncate text-spert-text dark:text-gray-200">
                        {inv.inviteeEmail}
                      </span>
                      <span className="text-spert-text-muted dark:text-gray-400 capitalize">
                        {inv.role}
                      </span>
                      <button
                        onClick={() => handleResend(inv.tokenId)}
                        disabled={actionBusy !== null || inv.emailSendCount >= 5}
                        title={`Resend (${inv.emailSendCount}/5)`}
                        className="text-spert-blue dark:text-blue-300 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Resend ({inv.emailSendCount}/5)
                      </button>
                      <button
                        onClick={() => setRevokeConfirmTokenId(inv.tokenId)}
                        disabled={actionBusy !== null}
                        className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sendError && <p className="text-xs text-red-600 dark:text-red-400">{sendError}</p>}

              <ConfirmDialog
                isOpen={revokeConfirmTokenId !== null}
                title="Revoke invitation?"
                message="The recipient will no longer be able to use this invitation link. You can re-invite them afterward."
                confirmLabel="Revoke"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={() => revokeConfirmTokenId && handleRevoke(revokeConfirmTokenId)}
                onCancel={() => setRevokeConfirmTokenId(null)}
              />
            </>
          ) : (
            <div className="flex gap-2 items-end">
              <input
                type="email"
                name="shareInviteEmail"
                aria-label="Invitee email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                autoComplete="off"
                className="flex-1 p-1.5 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100"
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              />
              <select
                name="shareInviteRole"
                aria-label="Invitee role"
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="p-1.5 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 cursor-pointer"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={handleShare}
                disabled={isLoading || !email.trim()}
                className="px-3 py-1.5 text-sm font-medium rounded bg-spert-blue text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? '...' : 'Share'}
              </button>
            </div>
          )}
        </>
      )}

      {!INVITATIONS_ENABLED && error && <p className="text-xs text-red-500">{error}</p>}
      {!INVITATIONS_ENABLED && success && (
        <p className="text-xs text-green-600 dark:text-green-400">{success}</p>
      )}
    </div>
  )
}
