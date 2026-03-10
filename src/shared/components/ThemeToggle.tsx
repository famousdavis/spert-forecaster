// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useTheme, type Theme } from '@/shared/hooks'

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

// Next theme in the cycle: light → dark → system → light
const NEXT_THEME: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#eab308" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" fill="#e5e7eb" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

const CURRENT_THEME_ICON: Record<Theme, () => React.JSX.Element> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
}

/** Compact icon button for the app header. Shows the current theme's icon. */
export function HeaderThemeToggle() {
  const { theme, setTheme, isInitialized } = useTheme()

  if (!isInitialized) {
    return <div className="w-8 h-8 rounded bg-muted animate-pulse" />
  }

  const nextTheme = NEXT_THEME[theme]
  const Icon = CURRENT_THEME_ICON[theme]

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      className="p-1.5 rounded transition-opacity opacity-70 hover:opacity-100 cursor-pointer"
      aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme]}`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      <Icon />
    </button>
  )
}

/** Dropdown select for the Settings page. */
export function ThemeToggle() {
  const { theme, setTheme, isInitialized } = useTheme()

  if (!isInitialized) {
    return (
      <div className="w-[90px] h-[28px] bg-muted rounded animate-pulse" />
    )
  }

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      className="px-2 py-1 text-xs border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-spert-text dark:text-gray-200 cursor-pointer"
      aria-label="Select color theme"
    >
      {(['light', 'dark', 'system'] as Theme[]).map((t) => (
        <option key={t} value={t}>
          {THEME_LABELS[t]}
        </option>
      ))}
    </select>
  )
}
