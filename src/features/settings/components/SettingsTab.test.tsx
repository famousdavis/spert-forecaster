// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useSettingsStore } from '@/shared/state/settings-store'
import { SettingsTab } from './SettingsTab'

// Isolate from Firebase / cloud / theme infrastructure. Tests focus on the
// percentile inputs only.
vi.mock('@/features/auth/components/StorageModeSection', () => ({
  StorageModeSection: () => null,
}))
vi.mock('./ExportProjectsSection', () => ({
  ExportProjectsSection: () => null,
}))
vi.mock('@/shared/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light' as const,
    effectiveTheme: 'light' as const,
    setTheme: vi.fn(),
  }),
}))

const LABEL_1 = /Default custom percentile 1/i
const LABEL_2 = /Default custom percentile 2/i

beforeEach(() => {
  useSettingsStore.setState({
    autoRecalculate: true,
    trialCount: 10000,
    defaultChartFontSize: 'medium',
    defaultCustomPercentile: 85,
    defaultCustomPercentile2: 50,
    defaultResultsPercentiles: [50, 80],
    distributionsEnabled: ['lognormal'],
    exportName: '',
    exportId: '',
    suppressLocalStorageWarning: false,
    _isCloudUpdate: false,
  })
})

// percentile1 — full coverage (snap, commit, revert, focus-guard, sync)
describe('percentile1 input buffering (A3)', () => {
  it('does not snap to MIN_PERCENTILE while typing a leading zero', () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_1)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0' } })
    // Without buffering: store clamps 0 → 1 and re-renders value as 1
    expect((input as HTMLInputElement).value).toBe('0')
    expect(useSettingsStore.getState().defaultCustomPercentile).toBe(85)  // store unchanged
  })

  it('commits clamped value to store on blur', () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_1)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '70' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().defaultCustomPercentile).toBe(70)
    expect((input as HTMLInputElement).value).toBe('70')
  })

  it('reverts to store value on blur when input is unparseable', () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_1)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('85')
    expect(useSettingsStore.getState().defaultCustomPercentile).toBe(85)
  })

  it('focus guard: cloud restore does not overwrite in-progress draft', async () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_1)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })

    await act(async () => {
      useSettingsStore.getState().replaceSettingsFromCloud({
        autoRecalculate: true,
        trialCount: 10000,
        defaultChartFontSize: 'medium',
        defaultCustomPercentile: 90,  // cloud pushes 90 mid-typing
        defaultCustomPercentile2: 50,
        defaultResultsPercentiles: [50, 80],
        distributionsEnabled: ['lognormal'],
      })
    })

    await waitFor(() => expect((input as HTMLInputElement).value).toBe('7'))  // draft preserved
  })

  it('syncs draft from store when not focused', async () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_1)
    await act(async () => {
      useSettingsStore.getState().setDefaultCustomPercentile(75)
    })
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('75'))
  })
})

// percentile2 — sibling input, independent state machine; key tests only
describe('percentile2 input buffering (A3)', () => {
  it('does not snap while typing a leading zero', () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_2)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0' } })
    expect((input as HTMLInputElement).value).toBe('0')
    expect(useSettingsStore.getState().defaultCustomPercentile2).toBe(50)
  })

  it('commits value to store on blur', () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_2)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().defaultCustomPercentile2).toBe(60)
  })

  it('focus guard: cloud restore does not overwrite in-progress draft', async () => {
    render(<SettingsTab />)
    const input = screen.getByLabelText(LABEL_2)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '3' } })

    await act(async () => {
      useSettingsStore.getState().replaceSettingsFromCloud({
        autoRecalculate: true,
        trialCount: 10000,
        defaultChartFontSize: 'medium',
        defaultCustomPercentile: 85,
        defaultCustomPercentile2: 75,  // cloud pushes 75 mid-typing
        defaultResultsPercentiles: [50, 80],
        distributionsEnabled: ['lognormal'],
      })
    })

    await waitFor(() => expect((input as HTMLInputElement).value).toBe('3'))
  })
})
