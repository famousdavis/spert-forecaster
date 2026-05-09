// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// --- Module mocks ---
//
// next/navigation: control searchParams + capture router.replace calls
// AuthProvider: control user + isFirebaseAvailable per test
// Zustand stores: minimal stand-ins exposing only the state methods the hook reads
// feature-flags: hot-swappable via vi.hoisted; default to ON for assertion ergonomics
//
// All hot-swap state goes through `vi.hoisted` so it's defined before module
// graph evaluation (captureInviteTokenFromUrl in inviteCapture.ts runs at
// module load and reads INVITATIONS_ENABLED — without hoisted state we'd hit
// the TDZ on the `let` declarations).

const hoisted = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParams: new URLSearchParams(),
  mockUser: null as { uid: string } | null,
  mockFirebaseAvailable: true,
  mockProjectCount: 0,
  mockSetMode: vi.fn(),
  mockFlag: true,
}))

const mockReplace = hoisted.mockReplace
const mockSearchParams = hoisted.mockSearchParams
const mockSetMode = hoisted.mockSetMode

vi.mock('next/navigation', () => ({
  useSearchParams: () => hoisted.mockSearchParams,
  usePathname: () => '/',
  useRouter: () => ({ replace: hoisted.mockReplace }),
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: hoisted.mockUser,
    isFirebaseAvailable: hoisted.mockFirebaseAvailable,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithMicrosoft: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('@/shared/state/project-store', () => ({
  useProjectStore: {
    getState: () => ({
      projects: new Array(hoisted.mockProjectCount).fill({}),
    }),
  },
}))

vi.mock('@/shared/state/storage-mode-store', () => ({
  useStorageModeStore: {
    getState: () => ({ setMode: hoisted.mockSetMode }),
  },
}))

vi.mock('@/lib/feature-flags', () => ({
  get INVITATIONS_ENABLED() {
    return hoisted.mockFlag
  },
}))

// Imported AFTER mocks so its deps resolve to the stand-ins above.
import { useInvitationLanding } from './useInvitationLanding'

const SESSION_KEY = 'spert_invite_token'

function dispatchModelsChanged(claimed: { appId: string; modelId: string; modelName: string }[]) {
  act(() => {
    window.dispatchEvent(new CustomEvent('spert:models-changed', { detail: { claimed } }))
  })
}

function setSearchParams(query: string) {
  const next = new URLSearchParams(query)
  // Mutate the shared instance in place so the mocked getter returns the new value.
  for (const k of Array.from(mockSearchParams.keys())) mockSearchParams.delete(k)
  for (const [k, v] of next) mockSearchParams.append(k, v)
  // Sync window.location for captureInviteTokenFromUrl reads (Lesson 58).
  window.history.replaceState({}, '', query ? `/?${query}` : '/')
  // Mirror the module-load capture: in production, captureInviteTokenFromUrl
  // would read window.location.search and write SESSION_KEY here. The hook's
  // lazy useState initializer (Lesson 66) reads sessionStorage at mount, so
  // the test setup must populate it before renderHook runs.
  const inviteToken = next.get('invite')
  if (inviteToken && hoisted.mockFlag) {
    sessionStorage.setItem(SESSION_KEY, inviteToken)
  }
}

beforeEach(() => {
  mockReplace.mockClear()
  mockSetMode.mockClear()
  setSearchParams('')
  sessionStorage.clear()
  hoisted.mockUser = null
  hoisted.mockFirebaseAvailable = true
  hoisted.mockProjectCount = 0
  hoisted.mockFlag = true
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useInvitationLanding — flag off', () => {
  beforeEach(() => {
    hoisted.mockFlag = false
  })

  it('stays idle and never touches sessionStorage even with ?invite= in URL', () => {
    setSearchParams('invite=tok-123')
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('idle')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockSetMode).not.toHaveBeenCalled()
  })
})

describe('useInvitationLanding — URL capture (Effect 1)', () => {
  it('captures ?invite=, strips param, sessions the token, transitions to pre_auth', () => {
    setSearchParams('invite=tok-abc')
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('pre_auth')
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-abc')
    expect(mockReplace).toHaveBeenCalledWith('/', { scroll: false })
  })

  it('preserves other query params when stripping invite=', () => {
    setSearchParams('invite=tok-abc&tab=settings')
    renderHook(() => useInvitationLanding())
    expect(mockReplace).toHaveBeenCalledWith('/?tab=settings', { scroll: false })
  })

  it('flips storage mode to cloud when local has zero projects', () => {
    setSearchParams('invite=tok-abc')
    hoisted.mockProjectCount = 0
    renderHook(() => useInvitationLanding())
    expect(mockSetMode).toHaveBeenCalledWith('cloud')
  })

  it('does NOT flip storage mode when local projects exist (C1 gate)', () => {
    setSearchParams('invite=tok-abc')
    hoisted.mockProjectCount = 2
    renderHook(() => useInvitationLanding())
    expect(mockSetMode).not.toHaveBeenCalled()
  })

  it('does NOT flip storage mode when Firebase is unavailable', () => {
    setSearchParams('invite=tok-abc')
    hoisted.mockFirebaseAvailable = false
    renderHook(() => useInvitationLanding())
    expect(mockSetMode).not.toHaveBeenCalled()
  })

  it('restores from sessionStorage post-OAuth redirect (no URL param)', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-from-redirect')
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('pre_auth')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('stays idle when no URL param and no session token', () => {
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('idle')
  })
})

describe('useInvitationLanding — claimed transition (Effect 3)', () => {
  it('transitions to claimed on spert:models-changed with names', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('pre_auth')

    dispatchModelsChanged([
      { appId: 'spertforecaster', modelId: 'p1', modelName: 'Atlas' },
      { appId: 'spertforecaster', modelId: 'p2', modelName: 'Borealis' },
    ])

    expect(result.current.state).toBe('claimed')
    expect(result.current.claimedNames).toEqual(['Atlas', 'Borealis'])
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('transitions from idle directly when event arrives without prior pre_auth (N1)', () => {
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('idle')

    dispatchModelsChanged([{ appId: 'spertforecaster', modelId: 'p1', modelName: 'Solo' }])

    expect(result.current.state).toBe('claimed')
    expect(result.current.claimedNames).toEqual(['Solo'])
  })

  it('ignores empty claimed array', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')
    const { result } = renderHook(() => useInvitationLanding())
    dispatchModelsChanged([])
    expect(result.current.state).toBe('pre_auth')
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-abc')
  })

  it('filters out empty modelNames', () => {
    const { result } = renderHook(() => useInvitationLanding())
    dispatchModelsChanged([
      { appId: 'spertforecaster', modelId: 'p1', modelName: '' },
      { appId: 'spertforecaster', modelId: 'p2', modelName: 'Real' },
    ])
    expect(result.current.claimedNames).toEqual(['Real'])
  })
})

describe('useInvitationLanding — dismiss', () => {
  it('clears state and sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')
    const { result } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('pre_auth')

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.claimedNames).toEqual([])
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })
})

describe('useInvitationLanding — 10s grace timer (Effect 2)', () => {
  it('happy path: claimed event arrives before timeout, state transitions to claimed (timer cleared)', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')

    const { result, rerender } = renderHook(() => useInvitationLanding())
    expect(result.current.state).toBe('pre_auth')

    // user becomes non-null while in pre_auth — Effect 2 starts the timer
    hoisted.mockUser = { uid: 'user-1' }
    rerender()

    // Advance 5s — still within grace window
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Event arrives — should transition to claimed BEFORE timeout fires
    dispatchModelsChanged([
      { appId: 'spertforecaster', modelId: 'p1', modelName: 'Atlas' },
    ])
    expect(result.current.state).toBe('claimed')

    // Run remaining timer — must be a no-op (cleanup cleared it)
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(result.current.state).toBe('claimed')
  })

  it('timeout path: after CLAIM_GRACE_MS (10s) with no event, falls back to idle', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')

    const { result, rerender } = renderHook(() => useInvitationLanding())
    hoisted.mockUser = { uid: 'user-1' }
    rerender()

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(result.current.state).toBe('idle')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('H2 sign-out behavior: user goes null while in pre_auth → cleanup fires, state stays pre_auth', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(SESSION_KEY, 'tok-abc')

    const { result, rerender } = renderHook(() => useInvitationLanding())
    hoisted.mockUser = { uid: 'user-1' }
    rerender()

    // Sign out: user goes null, Effect 2 cleanup clears the timer
    hoisted.mockUser = null
    rerender()

    // Advance past 10s — timer must NOT fire (state is not auto-dismissed)
    act(() => {
      vi.advanceTimersByTime(15000)
    })
    expect(result.current.state).toBe('pre_auth')
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-abc')
  })
})
