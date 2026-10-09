// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * MilestoneList's inline rename against a refusal (Brief 39, V2): `onRename`
 * reports whether the rename saved, and a refused one keeps the editor and
 * what was typed. A reason set while the editor is open makes it read only,
 * with the reason visible under it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MilestoneList } from './MilestoneList'
import type { Milestone } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const MILESTONES: Milestone[] = [{ id: 'm-1', name: 'MVP Release', backlogSize: 100, color: '#10b981', createdAt: T, updatedAt: T }]
const NOOP = () => {}
const REASON = 'View only — this project is shared with you as a viewer.'

function renderList(onRename: (id: string, name: string) => boolean, readOnlyReason: string | null = null) {
  return render(
    <MilestoneList milestones={MILESTONES} unitOfMeasure="pts" onEdit={NOOP} onDelete={NOOP} onRename={onRename} readOnlyReason={readOnlyReason} />,
  )
}
const editor = () => screen.queryByRole('textbox', { name: 'Rename MVP Release' }) as HTMLInputElement | null
const described = (el: Element) => {
  const ids = el.getAttribute('aria-describedby')
  return ids === null ? null : ids.split(' ').map((id) => document.getElementById(id)?.textContent ?? '<missing>').join(' ')
}

/** The tags of the VISIBLE elements under `root` holding exactly `text`: not hidden, not screen-reader-only. */
const shownTags = (root: Element, text: string) =>
  within(root as HTMLElement).queryAllByText(text).filter((el) => !el.closest('[hidden], .sr-only')).map((el) => el.tagName)

afterEach(() => cleanup())

describe('MilestoneList — a refused inline rename keeps the editor (Brief 39, V2)', () => {
  it.each([
    ['Enter', (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' })],
    ['blur', (input: HTMLElement) => fireEvent.blur(input)],
  ] as const)('%s on a rename onRename refuses (false) → the editor stays open with the draft (known-bad: draft cleared after a refused rename)', (_how, commit) => {
    const onRename = vi.fn(() => false)
    renderList(onRename)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    fireEvent.change(editor()!, { target: { value: 'Renamed' } })
    commit(editor()!)
    expect([onRename.mock.calls, editor()?.value]).toEqual([[['m-1', 'Renamed']], 'Renamed'])
  })

  it('a rename onRename accepts (true) closes the editor (control)', () => {
    renderList(() => true)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    fireEvent.change(editor()!, { target: { value: 'Renamed' } })
    fireEvent.keyDown(editor()!, { key: 'Enter' })
    expect(editor()).toBeNull()
  })

  it('a reason set while renaming: read only, the draft kept, the reason visible and named by the input (known-bads: input disabled or editable; reason not shown)', () => {
    const { rerender } = renderList(() => true)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    fireEvent.change(editor()!, { target: { value: 'Half-typed' } })
    rerender(<MilestoneList milestones={MILESTONES} unitOfMeasure="pts" onEdit={NOOP} onDelete={NOOP} onRename={() => true} readOnlyReason={REASON} />)
    const input = editor()!
    expect([input.value, input.readOnly, input.disabled, described(input), document.activeElement === input])
      .toEqual(['Half-typed', true, false, REASON, true])
    expect(shownTags(document.body, REASON)).toEqual(['P'])
  })

  it.each([
    ['Enter', (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' })],
    ['blur', (input: HTMLElement) => fireEvent.blur(input)],
  ] as const)('read only: %s calls no onRename, and the editor keeps the draft (known-bad: commit attempted while read-only)', (_how, commit) => {
    const onRename = vi.fn(() => true)
    const { rerender } = renderList(onRename)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    fireEvent.change(editor()!, { target: { value: 'Half-typed' } })
    rerender(<MilestoneList milestones={MILESTONES} unitOfMeasure="pts" onEdit={NOOP} onDelete={NOOP} onRename={onRename} readOnlyReason={REASON} />)
    commit(editor()!)
    expect([onRename.mock.calls, editor()?.value, editor()?.readOnly]).toEqual([[], 'Half-typed', true])
  })

  it.each([
    ['the Close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close rename' }))],
    ['Escape', () => fireEvent.keyDown(editor()!, { key: 'Escape' })],
  ] as const)('read only: %s closes the editor and discards the draft, calling no onRename (known-bad: no way out of a read-only editor)', (_how, close) => {
    const onRename = vi.fn(() => true)
    const { rerender } = renderList(onRename)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    fireEvent.change(editor()!, { target: { value: 'Half-typed' } })
    rerender(<MilestoneList milestones={MILESTONES} unitOfMeasure="pts" onEdit={NOOP} onDelete={NOOP} onRename={onRename} readOnlyReason={REASON} />)
    close()
    expect([editor(), onRename.mock.calls, screen.getByRole('button', { name: 'MVP Release' }).textContent]).toEqual([null, [], 'MVP Release'])
  })

  it('read only: the Close button is visible beside the input, labelled for a screen reader (known-bad: Close missing or unlabelled)', () => {
    const { rerender } = renderList(() => true)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    rerender(<MilestoneList milestones={MILESTONES} unitOfMeasure="pts" onEdit={NOOP} onDelete={NOOP} onRename={() => true} readOnlyReason={REASON} />)
    const close = screen.getByRole('button', { name: 'Close rename' }) as HTMLButtonElement
    expect([close.textContent, close.type, close.closest('[hidden], .sr-only'), close.parentElement === editor()!.parentElement])
      .toEqual(['Close', 'button', null, true])
  })

  it('no Close without a reason (control: an editor sees the editor as before)', () => {
    renderList(() => true)
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    expect([editor() !== null, screen.queryByRole('button', { name: 'Close rename' })]).toEqual([true, null])
  })

  it('with a reason, the click-to-rename button is disabled and says why (known-bad: rename offered to a viewer)', () => {
    renderList(() => true, REASON)
    const trigger = screen.getByRole('button', { name: 'MVP Release' }) as HTMLButtonElement
    expect([trigger.disabled, trigger.getAttribute('title'), described(trigger)]).toEqual([true, REASON, REASON])
  })
})
