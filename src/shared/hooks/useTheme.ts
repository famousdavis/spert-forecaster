// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'spert-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme

  if (effectiveTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

/**
 * Applies the stored preference to <html>, as the layout's pre-paint script does: "light" or "dark", anything else (or
 * no storage) System. For a screen with no theme switch mounted: the outermost crash screen (v0.53.0), where the
 * `dark` class can be gone, since a crash while the page hydrates makes React render the document again without it.
 */
export function applyStoredTheme(): void {
  // Never throws: its caller is the crash screen, where a throw would bring the boundary straight back to itself.
  try {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage blocked: System.
    }
    applyTheme(stored === 'light' || stored === 'dark' ? stored : 'system')
  } catch {
    // No matchMedia (an old browser, a test DOM): leave the class as it is.
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const initialTheme: Theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    /* eslint-disable react-hooks/set-state-in-effect -- intentional post-hydration read of persisted theme; full useSyncExternalStore migration deferred (requires coordinated changes to isInitialized consumers in ThemeToggle) */
    setThemeState(initialTheme)
    applyTheme(initialTheme)
    setIsInitialized(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme('system')

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(newTheme)
  }, [theme, setTheme])

  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme

  return {
    theme,
    effectiveTheme,
    setTheme,
    toggleTheme,
    isInitialized,
  }
}
