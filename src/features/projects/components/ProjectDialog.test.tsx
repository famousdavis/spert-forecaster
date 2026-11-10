// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The project dialog on its own (v0.49.0): its semantics, the inert page behind it, its focus,
// its keys, and Escape with an import preview waiting. ProjectsTab.dashboard.test.tsx covers
// where focus lands on each way in and out of the tab.
//
// ⚠️ jsdom does not enforce `inert` and RTL's queries ignore it, so a dialog that never removed
// it would leave the whole app unclickable with every other test green. The inert test below
// is the guard. jsdom also keeps focus on a disabled field, where a browser moves it out of the
// dialog: the read-only test asserts the explicit move to Close.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useRef, useState } from 'react'
import { ProjectDialog } from './ProjectDialog'
import { ProjectForm } from './ProjectForm'
import { ImportPreviewSection } from './ImportPreviewSection'
import { isModalSurfaceOpen } from '@/shared/lib/modal-surface'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const ALPHA: Project = { id: 'a', name: 'Alpha', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }
const REASON = 'View only — this project is shared with you as a viewer.'

/** The dialog in a stateful parent, as ProjectsTab holds it, with an opener outside it to return to. */
function Harness({
  project = null,
  readOnlyReason = null,
  returnSeen,
}: {
  project?: Project | null
  readOnlyReason?: string | null
  /** Called with whether the opener was still inert when the dialog asked where focus goes. */
  returnSeen?: (stillInert: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  // A ref, not a query: on unmount the opener is gone before the dialog's cleanup asks.
  const openerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={openerRef}>opener</button>
      {open && (
        <ProjectDialog
          identity={project ? `edit:${project.id}` : 'new'}
          title={project ? 'Edit Project' : 'New Project'}
          readOnly={readOnlyReason !== null}
          onCancel={() => setOpen(false)}
          returnFocusTo={() => {
            const el = openerRef.current
            if (el) returnSeen?.(el.closest('[inert]') !== null)
            return el
          }}
        >
          <ProjectForm project={project} onSubmit={() => setOpen(false)} onCancel={() => setOpen(false)} readOnlyReason={readOnlyReason} />
        </ProjectDialog>
      )}
    </>
  )
}

const dialog = () => screen.getByRole('dialog')
const nameField = () => document.getElementById('name') as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const key = (target: Element, init: KeyboardEventInit) => fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init })

afterEach(() => {
  cleanup()
  document.body.querySelectorAll('[data-extra]').forEach((el) => el.remove())
})

describe('ProjectDialog', () => {
  it('is a modal dialog in document.body, named by its title, inside the modal-surface marker, with focus in Project Name', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'New Project' })).toBe(dialog())
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    const overlay = dialog().closest('[data-modal-surface]')
    expect(overlay).not.toBeNull()
    expect(overlay!.parentElement).toBe(document.body) // a portal, not inside the page
    expect(isModalSurfaceOpen()).toBe(true)
    expect(document.activeElement).toBe(nameField())
    expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Add Project'])
    expect(screen.getByText('Enter saves. Esc cancels.').tagName).toBe('P')
  })

  it('Edit: titled Edit Project, Update Project offered, the name selected', () => {
    render(<Harness project={ALPHA} />)
    expect(screen.getByRole('dialog', { name: 'Edit Project' })).toBe(dialog())
    expect(button('Update Project').type).toBe('submit')
    expect(document.activeElement).toBe(nameField())
    expect([nameField().selectionStart, nameField().selectionEnd]).toEqual([0, 5])
  })

  it('read only on open: titled Edit Project, Close the only button, focus on Close, "Esc closes."', () => {
    render(<Harness project={ALPHA} readOnlyReason={REASON} />)
    expect(screen.getByRole('dialog', { name: 'Edit Project' })).toBe(dialog())
    expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Close'])
    expect(document.activeElement).toBe(button('Close'))
    expect(screen.getByText('Esc closes.').tagName).toBe('P')
  })

  it('turning read only while open moves focus to Close, and keeps the dialog open (known-bad: focus left on the disabled name field)', () => {
    const view = render(<Harness project={ALPHA} />)
    expect(document.activeElement).toBe(nameField())
    view.rerender(<Harness project={ALPHA} readOnlyReason={REASON} />)
    expect([nameField().disabled, document.activeElement === button('Close'), screen.queryByRole('dialog') !== null]).toEqual([true, true, true])
  })

  it.each([
    ['Add Project', () => { fireEvent.change(nameField(), { target: { value: 'Beta' } }); fireEvent.click(button('Add Project')) }],
    ['Cancel', () => fireEvent.click(button('Cancel'))],
    ['Escape', () => key(nameField(), { key: 'Escape' })],
  ])('makes every other child of the page inert while open, and %s restores only what it changed', (_label, close) => {
    const before = document.createElement('div')
    before.setAttribute('data-extra', 'a')
    const alreadyInert = document.createElement('div')
    alreadyInert.setAttribute('data-extra', 'b')
    alreadyInert.setAttribute('inert', '')
    document.body.append(before, alreadyInert)

    render(<Harness />)
    const overlay = dialog().closest('[data-modal-surface]')!
    const others = Array.from(document.body.children).filter((el) => el !== overlay)
    expect(others.length).toBeGreaterThanOrEqual(3) // RTL's container and the two above
    expect(others.map((el) => el.hasAttribute('inert'))).toEqual(others.map(() => true))
    expect(overlay.hasAttribute('inert')).toBe(false)

    close()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(Array.from(document.body.children).filter((el) => el.hasAttribute('inert'))).toEqual([alreadyInert])
  })

  it('unmounting it (the tab switched away) restores the page too', () => {
    const alreadyInert = document.createElement('div')
    alreadyInert.setAttribute('data-extra', 'b')
    alreadyInert.setAttribute('inert', '')
    document.body.append(alreadyInert)
    const view = render(<Harness />)
    view.unmount()
    expect(Array.from(document.body.children).filter((el) => el.hasAttribute('inert'))).toEqual([alreadyInert])
  })

  it('returns focus as it closes, AFTER the page is no longer inert (a browser ignores focus() on an inert element)', () => {
    const seen: boolean[] = []
    render(<Harness returnSeen={(stillInert) => seen.push(stillInert)} />)
    fireEvent.click(button('Cancel'))
    expect([seen, document.activeElement === button('opener')]).toEqual([[false], true])
  })

  it('a return target that is gone (null) focuses nothing and does not throw', () => {
    function NoTarget() {
      const [open, setOpen] = useState(true)
      return open ? (
        <ProjectDialog identity="new" title="New Project" readOnly={false} onCancel={() => setOpen(false)} returnFocusTo={() => null}>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </ProjectDialog>
      ) : null
    }
    render(<NoTarget />)
    fireEvent.click(button('Cancel'))
    expect(document.activeElement).toBe(document.body)
  })

  it('Tab from the last control wraps to the first, and Shift+Tab from the first to the last', () => {
    render(<Harness project={ALPHA} />)
    const update = button('Update Project')
    update.focus()
    key(update, { key: 'Tab' })
    expect(document.activeElement).toBe(nameField())
    key(nameField(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(update)
  })

  it.each([
    { label: 'Tab', shiftKey: false, lands: () => nameField() },
    { label: 'Shift+Tab', shiftKey: true, lands: () => button('Update Project') },
  ])('$label with focus outside the dialog brings focus back into it', ({ shiftKey, lands }) => {
    render(<Harness project={ALPHA} />)
    const opener = button('opener')
    opener.focus()
    key(opener, { key: 'Tab', shiftKey })
    expect(document.activeElement).toBe(lands())
  })

  it('Escape never reaches a document listener of the page behind, even one registered before the dialog opened (capture phase)', () => {
    // A bubble-phase listener on `document`, added first, runs before a bubble-phase dialog's.
    // Only a capture-phase listener that stops propagation keeps the Escape from it.
    const behind = vi.fn()
    document.addEventListener('keydown', behind)
    try {
      render(<Harness />)
      key(nameField(), { key: 'Escape' })
      expect([screen.queryByRole('dialog'), behind.mock.calls.length]).toEqual([null, 0])
      // Control: the same listener hears a key the dialog does not handle.
      render(<Harness />)
      key(nameField(), { key: 'x' })
      expect(behind).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', behind)
    }
  })

  it('registers one capture-phase keydown listener while open, and removes THAT listener with the same capture flag on close', () => {
    // A removal without the flag leaves the capture listener behind (the flag is part of a
    // listener's identity). It finds no dialog and does nothing today, so no key press shows it;
    // this pins the pairing directly.
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    try {
      render(<Harness />)
      const added = add.mock.calls.filter(([type, , opts]) => type === 'keydown' && opts === true)
      expect(added).toHaveLength(1)
      fireEvent.click(button('Cancel'))
      const removed = remove.mock.calls.filter(([type, fn, opts]) => type === 'keydown' && fn === added[0][1] && opts === true)
      expect(removed).toHaveLength(1)
    } finally {
      add.mockRestore()
      remove.mockRestore()
    }
  })

  it('Escape closes it and comes back handled (defaultPrevented), and once closed its listener is gone', () => {
    render(<Harness />)
    expect(key(nameField(), { key: 'Escape' })).toBe(false) // false = defaultPrevented
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(isModalSurfaceOpen()).toBe(false)
    // With the dialog gone, Escape reaches the page again: a stale capture listener would still stop it.
    const page = vi.fn()
    document.addEventListener('keydown', page)
    try {
      expect(key(document.body, { key: 'Escape' })).toBe(true)
      expect(page).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', page)
    }
  })
})

describe('ProjectDialog over an import preview (D27: Escape closes the dialog only)', () => {
  const Preview = ({ onCancel }: { onCancel: () => void }) => (
    <ImportPreviewSection
      imported={{ exportType: 'spert-forecaster-project-export', projects: [], sprints: [] }}
      conflicts={[]}
      decisions={new Map()}
      mode="merge"
      applying={false}
      existingSprints={[]}
      idPrefix="t"
      accessOf={() => 'owner'}
      replaceAllBlocked={false}
      onModeChange={vi.fn()}
      onDecisionChange={vi.fn()}
      onConfirm={vi.fn()}
      onRequestReplaceAll={vi.fn()}
      onCancel={onCancel}
    />
  )

  it('control (must differ): with no dialog, Escape cancels the preview', () => {
    const onCancel = vi.fn()
    render(<Preview onCancel={onCancel} />)
    key(document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // Each slot keeps its place across the rerender, so whichever mounted first is not remounted.
  const Scene = ({ preview, dialog, onCancel }: { preview: boolean; dialog: boolean; onCancel: () => void }) => (
    <>
      {preview && <Preview onCancel={onCancel} />}
      {dialog && <Harness />}
    </>
  )

  it.each([
    ['a preview waiting, then the dialog opened', false],
    ['the dialog open, then a preview arriving', true],
  ])('%s: Escape closes the dialog, comes back handled, and leaves the preview', (_label, dialogFirst) => {
    const onCancel = vi.fn()
    const view = render(<Scene preview={!dialogFirst} dialog={dialogFirst} onCancel={onCancel} />)
    expect(screen.queryByRole('dialog') !== null).toBe(dialogFirst)
    view.rerender(<Scene preview dialog onCancel={onCancel} />)
    expect(screen.queryByRole('dialog')).not.toBeNull()
    expect(screen.queryByRole('region', { name: /Review import/i })).not.toBeNull()

    const handled = !key(document.activeElement ?? document.body, { key: 'Escape' })
    expect([handled, screen.queryByRole('dialog'), onCancel.mock.calls.length]).toEqual([true, null, 0])
    expect(screen.queryByRole('region', { name: /Review import/i })).not.toBeNull()
  })
})
