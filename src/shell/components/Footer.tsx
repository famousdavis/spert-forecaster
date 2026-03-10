// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Link from 'next/link'
import { APP_VERSION } from '@/shared/constants'

export function Footer() {
  return (
    <footer className="mt-16 pt-8 border-t-2 border-gray-100 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400 text-sm pb-6">
      © {new Date().getFullYear()} William W. Davis, MSPM, PMP |{' '}
      <Link
        href="/changelog"
        className="text-blue-500 hover:text-blue-600 transition-colors"
      >
        Version {APP_VERSION}
      </Link>
      {' '}| Licensed under GNU GPL v3
    </footer>
  )
}
