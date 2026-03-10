// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Centralized color constants for SPERT
// Used by Recharts components (which require JS color values) and
// as the single source of truth for the color palette.
// For DOM styling, prefer Tailwind classes (e.g., text-spert-blue, bg-spert-error)
// which reference the same values via CSS custom properties in globals.css.

export const COLORS = {
  // Brand
  brand: {
    blue: '#0070f3',
    blueLight: '#0099ff',
    blueDark: '#0051cc',
  },

  // Text
  text: {
    primary: '#333',
    secondary: '#555',
    muted: '#666',
    light: '#999',
    helper: '#888',
  },

  // Borders
  border: {
    default: '#ddd',
    light: '#e5e7eb',
    medium: '#ccc',
  },

  // Status
  status: {
    error: '#dc3545',
    errorDark: '#c53030',
    errorBorder: '#e53e3e',
    errorRed: '#dc2626',
    success: '#28a745',
    successGreen: '#10b981',
    successDark: '#059669',
    warning: '#ffc107',
    warningDark: '#d97706',
    warningText: '#856404',
    info: '#2563eb',
  },

  // Backgrounds
  bg: {
    input: '#f9f9f9',
    highlight: '#f0f7ff',
    disabled: '#e9ecef',
    hover: '#f5f5f5',
    errorLight: '#f8d7da',
    errorVeryLight: '#fff3f3',
    errorRow: '#fee2e2',
    warningLight: '#fff3cd',
    warningRow: '#fef3c7',
    infoLight: '#e7f3ff',
    infoRow: '#dbeafe',
    successRow: '#d1fae5',
  },

  // Chart — distribution line colors
  chart: {
    tNormal: '#0070f3',
    lognormal: '#10b981',
    gamma: '#f59e0b',
    bootstrap: '#8b5cf6',
    triangular: '#ec4899',
    uniform: '#6366f1',
  },

  // Burn-up chart
  burnUp: {
    backlog: '#22c55e',
    done: '#8b5cf6',
    optimistic: '#f97316',
    expected: '#eab308',
    conservative: '#3b82f6',
  },

  // Copy button feedback
  copy: {
    success: '#10b981',
    error: '#ef4444',
  },
} as const
