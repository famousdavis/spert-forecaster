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
import type { ProjectMember, ProjectRole } from '@/shared/firebase/types'

interface SharingSectionProps {
  projectId: string
  projectName: string
}

export function SharingSection({ projectId, projectName }: SharingSectionProps) {
  const { user } = useAuth()
  const { mode } = useStorageMode()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('editor')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isOwner = members.some((m) => m.uid === user?.uid && m.role === 'owner')

  const loadMembers = useCallback(async () => {
    if (mode !== 'cloud') return
    try {
      const result = await getProjectMembers(projectId)
      setMembers(result)
    } catch {
      // silently fail — user may not have access
    }
  }, [projectId, mode])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  if (mode !== 'cloud' || !user) return null

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

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-spert-text-secondary dark:text-gray-300">
        Sharing: {projectName}
      </h4>

      {/* Member list */}
      {members.length > 0 && (
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
        <div className="flex gap-2 items-end">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 p-1.5 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100"
            onKeyDown={(e) => e.key === 'Enter' && handleShare()}
          />
          <select
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

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-600 dark:text-green-400">{success}</p>}
    </div>
  )
}
