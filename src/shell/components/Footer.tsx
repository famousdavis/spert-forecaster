// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Link from 'next/link'
import { APP_VERSION } from '@/shared/constants'
import { TOS_URL, PRIVACY_URL } from '@/features/auth/lib/tos'
import { AI_PRIVACY_URL } from '@/features/connect-ai/constants'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-3 text-sm text-gray-500 dark:text-gray-400">
      <div className="mx-auto w-full max-w-7xl px-4 text-center">
        <div>
          &copy; {new Date().getFullYear()} William W. Davis, MSPM, PMP |{' '}
          <Link
            href="/changelog"
            className="text-blue-600 hover:text-blue-700"
          >
            Version {APP_VERSION}
          </Link>{' '}
          | Licensed under GNU GPL v3
        </div>
        <div className="mt-1">
          <a
            href="https://spertsuite.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            SPERT® Suite
          </a>
          {' | '}
          <a
            href={TOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            Terms of Service
          </a>
          {' | '}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            Privacy Policy
          </a>
          {' | '}
          <a
            href={AI_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            AI Privacy Notice
          </a>
          {' | '}
          <a
            href="https://github.com/famousdavis/spert-forecaster/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            License
          </a>
        </div>
      </div>
    </footer>
  )
}
