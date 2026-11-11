// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.6: one Escape in the sign-in agreement ("Enable Cloud Storage", which SignInButtons opens
// inside the Cloud Storage window when you are signed out) closes only the agreement, and focus
// goes back to the sign-in button that opened it. A second Escape closes the window, and focus
// goes to the header button. Before, one Escape closed both, in either order of the two document
// listeners (measured on forecaster.spertsuite.com, v0.50.5: focus ended on the header button).
// v0.50.2 made the window yield to its own confirmations (CloudStorageModal.escape.test.tsx);
// the agreement belongs to SignInButtons, so the window could not see it.
//
// Both orders happen. The window's listener is registered when it opens and the agreement's when
// it opens later, so the window's runs first; any re-render that hands the window a new onClose
// (AppShell passes it inline) re-registers the window's behind the agreement's. Each case below
// forces its order and ASSERTS it before pressing Escape, reading each listener's owner from the
// file that registered it, so a case cannot silently run in the other order.
// Signing in needs Firebase; this is jsdom, through the real SignInButtons and ConsentModal.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, createEvent, cleanup, act } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'

const H = vi.hoisted(() => ({
  user: null as { uid: string; email: string; displayName: string } | null,
  google: vi.fn(async () => {}),
  closes: 0,
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: H.user, isFirebaseAvailable: true, signOut: vi.fn(async () => {}) }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: 'local', setMode: vi.fn(), isFirebaseAvailable: true }),
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('@/features/projects/lib/export-backup', () => ({ exportWorkspaceBackup: vi.fn() }))
vi.mock('./UploadConfirmPanel', () => ({ UploadConfirmPanel: () => null }))
vi.mock('@/shared/firebase/auth', () => ({ signInWithGoogle: H.google, signInWithMicrosoft: vi.fn(async () => {}) }))
vi.mock('@/features/auth/lib/tos', () => ({
  TOS_URL: 'https://example.com/tos',
  PRIVACY_URL: 'https://example.com/privacy',
  isTosCached: () => false,
  cacheTos: vi.fn(),
  setPendingWrite: vi.fn(),
}))

import { CloudStorageModal } from './CloudStorageModal'
import { SignInButtons } from './SignInButtons'
import { useProjectStore } from '@/shared/state/project-store'

const T = '2026-01-01T00:00:00.000Z'

// ── The document's keydown listeners, in the order they run, each tagged with its owner ──
type Owner = 'window' | 'agreement' | 'other'
let keydown: { fn: unknown; owner: Owner }[] = []

/** Who is registering: the effect that calls addEventListener is in its component's file. */
function ownerOfCaller(): Owner {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 100
  const stack = new Error().stack ?? ''
  Error.stackTraceLimit = limit
  if (/[\\/]ConsentModal\.tsx/.test(stack)) return 'agreement'
  if (/[\\/]CloudStorageModal\.tsx/.test(stack)) return 'window'
  return 'other'
}

const listenerOrder = () => keydown.map((l) => l.owner).filter((o) => o !== 'other')

beforeEach(() => {
  H.user = null
  H.closes = 0
  H.google.mockClear()
  useProjectStore.setState({ projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }], sprints: [], cloudDataLoaded: true })
  keydown = []
  const add = document.addEventListener.bind(document)
  const remove = document.removeEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => {
    // The DOM ignores a second registration of the same listener; so does this list.
    if (type === 'keydown' && !keydown.some((l) => l.fn === fn)) keydown.push({ fn, owner: ownerOfCaller() })
    add(type, fn, options)
  })
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, options) => {
    if (type === 'keydown') keydown = keydown.filter((l) => l.fn !== fn)
    remove(type, fn, options)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * The header's account button and the window, as AppShell has them. `newOnCloseEachRender`:
 * AppShell's inline onClose (a re-render re-registers the window's listener); otherwise one
 * onClose for the page's life (a re-render re-registers only the agreement's, whose onCancel
 * SignInButtons makes anew on every render).
 */
function Page({ newOnCloseEachRender }: { newOnCloseEachRender: boolean }) {
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLButtonElement>(null)
  const stableOnClose = useCallback(() => {
    H.closes++
    setOpen(false)
  }, [])
  const inlineOnClose = () => {
    H.closes++
    setOpen(false)
  }
  return (
    <>
      <button ref={headerRef} onClick={() => setOpen(true)}>Sign in</button>
      <CloudStorageModal
        isOpen={open}
        onClose={newOnCloseEachRender ? inlineOnClose : stableOnClose}
        returnFocusTo={() => headerRef.current}
      />
    </>
  )
}

const button = (name: string) => screen.getByRole('button', { name })
const cloudWindow = () => screen.queryByRole('dialog', { name: 'Cloud Storage' })
const agreement = () => screen.queryByRole('dialog', { name: 'Enable Cloud Storage' })
const focusedName = () => {
  const el = document.activeElement
  if (!el || el === document.body) return 'BODY'
  return `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}"`
}

/** Focus a button and press it, as a keyboard user does (a jsdom click moves no focus). */
function press(name: string) {
  button(name).focus()
  fireEvent.click(button(name))
}

function escape() {
  const event = createEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  act(() => {
    fireEvent(document.activeElement ?? document.body, event)
  })
  return event
}

/** Open the window from the header, then the agreement from Sign in with Google. */
function openAgreement(newOnCloseEachRender: boolean) {
  const view = render(<Page newOnCloseEachRender={newOnCloseEachRender} />)
  press('Sign in')
  expect(cloudWindow()).not.toBeNull()
  press('Sign in with Google')
  expect([agreement() !== null, focusedName()]).toEqual([true, 'BUTTON "Cancel"'])
  return view
}

const ORDERS = [
  { order: 'the window first', newOnCloseEachRender: false, expected: ['window', 'agreement'] },
  { order: 'the agreement first', newOnCloseEachRender: true, expected: ['agreement', 'window'] },
] as const

describe.each(ORDERS)('listener order: $order', ({ newOnCloseEachRender, expected }) => {
  it('one Escape closes only the agreement, focus goes back to its sign-in button; the next closes the window (known-bad: both closed)', () => {
    const { rerender } = openAgreement(newOnCloseEachRender)
    // Force the order: a re-render re-registers the agreement's listener, and, with a new
    // onClose, the window's after it (a child's effects run first).
    rerender(<Page newOnCloseEachRender={newOnCloseEachRender} />)
    expect(listenerOrder()).toEqual(expected)

    const event = escape()
    expect({
      agreement: agreement() !== null,
      window: cloudWindow() !== null,
      closes: H.closes,
      handled: event.defaultPrevented,
      focus: focusedName(),
      signIns: H.google.mock.calls.length,
    }).toEqual({ agreement: false, window: true, closes: 0, handled: true, focus: 'BUTTON "Sign in with Google"', signIns: 0 })

    // The next Escape is the window's: it closes, and focus goes to the header button.
    escape()
    expect({ window: cloudWindow() !== null, closes: H.closes, focus: focusedName() }).toEqual({
      window: false,
      closes: 1,
      focus: 'BUTTON "Sign in"',
    })
  })
})

describe('controls', () => {
  it("the agreement's Cancel closes only the agreement (it did before the fix too)", () => {
    openAgreement(true)
    fireEvent.click(button('Cancel'))
    expect([agreement() !== null, cloudWindow() !== null, H.closes, focusedName()]).toEqual([
      false,
      true,
      0,
      'BUTTON "Sign in with Google"',
    ])
  })

  it('the agreement leaves with its buttons (a sign-in lands from another tab): the next Escape closes the window', () => {
    const { rerender } = openAgreement(true)
    H.user = { uid: 'u1', email: 'a@example.com', displayName: 'A' }
    rerender(<Page newOnCloseEachRender />)
    expect([agreement() !== null, cloudWindow() !== null]).toEqual([false, true])

    escape()
    expect([cloudWindow() !== null, H.closes]).toEqual([false, 1])
  })

  it('without the agreement, one Escape closes the window', () => {
    render(<Page newOnCloseEachRender />)
    press('Sign in')
    const event = escape()
    expect([cloudWindow() !== null, H.closes, event.defaultPrevented, focusedName()]).toEqual([false, 1, true, 'BUTTON "Sign in"'])
  })
})

// The window hears of the agreement from a LAYOUT effect: a passive effect's update would wait for
// a later task, and an Escape arriving before it would still close both. jsdom cannot press a key
// that fast through act(), which flushes everything first, so this runs React on its own
// scheduler: the click and the Escape are native events, with only microtasks between them.
describe('timing', () => {
  it('an Escape right after the agreement opens, before any other task runs, closes only the agreement', async () => {
    render(<Page newOnCloseEachRender={false} />)
    press('Sign in')
    const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const actEnvironment = flags.IS_REACT_ACT_ENVIRONMENT
    flags.IS_REACT_ACT_ENVIRONMENT = false
    try {
      button('Sign in with Google').focus()
      button('Sign in with Google').click()
      for (let i = 0; i < 50 && agreement() === null; i++) await Promise.resolve()
      expect(agreement()).not.toBeNull()
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      flags.IS_REACT_ACT_ENVIRONMENT = actEnvironment
    }
    expect([agreement() !== null, cloudWindow() !== null, H.closes]).toEqual([false, true, 0])
  })
})

// The contract the window relies on, from SignInButtons alone: `true` when the agreement appears,
// `false` when it leaves by any way out.
describe('SignInButtons reports the agreement', () => {
  const report = vi.fn()
  const SignIn = () => <SignInButtons fullLabel onAgreementOpenChange={report} />
  beforeEach(() => report.mockClear())

  it.each([
    ['Cancel', () => fireEvent.click(button('Cancel'))],
    ['Escape', () => void escape()],
    ['Enable Cloud Storage', () => {
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(button('Enable Cloud Storage'))
    }],
  ])('open, then %s: true, then false', (_how, close) => {
    render(<SignIn />)
    expect(report.mock.calls).toEqual([])
    press('Sign in with Google')
    expect(report.mock.calls).toEqual([[true]])
    close()
    expect([agreement() !== null, report.mock.calls]).toEqual([false, [[true], [false]]])
  })

  it('a sign-in lands while it is open (the buttons stay mounted and render nothing): false', () => {
    const { rerender } = render(<SignIn />)
    press('Sign in with Google')
    H.user = { uid: 'u1', email: 'a@example.com', displayName: 'A' }
    rerender(<SignIn />)
    expect([agreement() !== null, report.mock.calls]).toEqual([false, [[true], [false]]])
  })
})
