// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus after "Revoke invitation?" (v0.50.3, F3). A revoke that works removes its row (the list
// is reloaded while the dialog is still open), and focus goes to the Revoke of the invitation
// that moved into its place, else the one above, else the invite email box. A revoke that fails
// keeps its row, and focus goes back to its Revoke. Sharing needs a signed-in cloud account, so
// this is jsdom only. Known-bad (read, not measured): <body>.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { PendingInvite } from '@/shared/firebase/types'

const H = vi.hoisted(() => ({
  // One object: a new user on every render would reload the members on every render.
  user: { uid: 'u1', email: 'owner@example.com', displayName: 'Owner' },
  pending: [] as string[],
  revoke: vi.fn<(tokenId: string) => Promise<void>>(),
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: H.user }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: 'cloud' }) }))
vi.mock('@/shared/firebase/firestore-sharing', () => ({
  getProjectMembers: async () => [{ uid: 'u1', email: 'owner@example.com', displayName: 'Owner', role: 'owner' }],
  shareProject: vi.fn(),
  removeProjectMember: vi.fn(),
  updateMemberRole: vi.fn(),
}))
vi.mock('@/shared/firebase/firestore-invitations', () => ({
  listPendingInvites: async (): Promise<PendingInvite[]> =>
    H.pending.map((email, i) => ({
      tokenId: `t-${email}`, modelId: 'p', modelName: 'P', inviteeEmail: email, role: 'editor', isVoting: false,
      inviterUid: 'u1', inviterName: 'Owner', inviterEmail: 'owner@example.com', status: 'pending',
      createdAt: i, expiresAt: i, lastEmailSentAt: i, emailSendCount: 1, updatedAt: i,
    }) as PendingInvite),
  revokeInviteToken: (tokenId: string) => H.revoke(tokenId),
  resendInviteToken: vi.fn(),
  parseBulkEmails: vi.fn(),
  mapInvitationError: () => 'Could not revoke.',
}))
vi.mock('@/shared/firebase/callables', () => ({ callSendInvitationEmail: vi.fn() }))

import { SharingSection } from './SharingSection'

beforeEach(() => {
  H.pending = ['a@example.com', 'b@example.com', 'c@example.com']
  H.revoke.mockReset()
  // A revoke that works: the invitation is gone from the next list.
  H.revoke.mockImplementation(async (tokenId) => {
    H.pending = H.pending.filter((e) => `t-${e}` !== tokenId)
  })
})
afterEach(() => cleanup())

const revokeButtons = () => screen.getAllByRole('button', { name: 'Revoke' })
/** The Revoke of the invitation to this address. */
const revokeOf = (email: string) => {
  const row = screen.getByText(email).parentElement!
  return within(row).getByRole('button', { name: 'Revoke' })
}
const focused = () => document.activeElement

async function mount() {
  render(<SharingSection projectId="p" projectName="P" />)
  await act(async () => {})
  expect(revokeButtons()).toHaveLength(H.pending.length)
}

/** Focus the Revoke and press it, then confirm, as a keyboard user does. */
async function revoke(email: string) {
  const button = revokeOf(email)
  button.focus()
  fireEvent.click(button)
  const dialog = screen.getByRole('alertdialog', { name: 'Revoke invitation?' })
  expect(focused()?.textContent).toBe('Cancel')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
  })
  expect(screen.queryByRole('alertdialog')).toBeNull()
}

describe('Revoke invitation → the next invitation\'s Revoke (known-bad: <body>)', () => {
  it('a middle one: the invitation that moved into its place', async () => {
    await mount()
    await revoke('b@example.com')
    expect([screen.queryByText('b@example.com'), focused()]).toEqual([null, revokeOf('c@example.com')])
  })

  it('the last one: the one above', async () => {
    await mount()
    await revoke('c@example.com')
    expect(focused()).toBe(revokeOf('b@example.com'))
  })

  it('the only one: the invite email box', async () => {
    H.pending = ['a@example.com']
    await mount()
    await revoke('a@example.com')
    expect([screen.queryByText('Pending Invitations'), focused()]).toEqual([null, screen.getByRole('textbox', { name: 'Invite email addresses' })])
  })

  it('a revoke that fails keeps the row, and focus goes back to its Revoke', async () => {
    H.revoke.mockRejectedValue(new Error('denied'))
    await mount()
    await revoke('b@example.com')
    expect([screen.getByText('Could not revoke.') !== null, focused()]).toEqual([true, revokeOf('b@example.com')])
  })

  it('Cancel: back to the same Revoke', async () => {
    await mount()
    const button = revokeOf('a@example.com')
    button.focus()
    fireEvent.click(button)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect([H.revoke.mock.calls.length, focused()]).toEqual([0, revokeOf('a@example.com')])
  })
})
