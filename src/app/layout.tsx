// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { AuthProvider } from '@/shared/providers/AuthProvider'
import { StorageProvider } from '@/shared/providers/StorageProvider'
import { AppShell } from '@/shell'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SPERT® Forecaster - Agile Release Forecasting',
  description: 'SPERT® Forecaster - Monte Carlo simulation for agile release forecasting',
  icons: {
    icon: '/spert-favicon-forecaster.png',
    apple: '/spert-favicon-forecaster.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// Inline script to prevent flash of wrong theme on page load
const themeScript = `
(function() {
  try {
    const stored = localStorage.getItem('spert-theme');
    const theme = stored || 'system';
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <StorageProvider>
            {/* The SPERT® Suite frame holds every route (FRAME26, v0.52.0). Held HERE, by the layout, so it never
                remounts between "/" and "/changelog": the tab, the Connect AI provider, a held crosslink transfer
                and the notices' dismissals survive the visit. "/" renders the tabs (AppShell's own state); every
                other route renders its page inside the frame's main. */}
            <AppShell>{children}</AppShell>
          </StorageProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
