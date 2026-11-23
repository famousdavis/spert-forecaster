// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Link from 'next/link'
import { APP_VERSION } from '@/shared/constants'
import { TOS_URL, PRIVACY_URL } from '@/features/auth/lib/tos'
import { AI_PRIVACY_URL } from '@/features/connect-ai/constants'

/**
 * The frame's footer (FRAME26, contract §3, v0.52.0): a full-width 69 px band with a 1 px top rule and two centred
 * lines, flowing after `main`. Wording and destinations are unchanged. The links' colour is the frame's `--sf-link`
 * (`#155dfc` / `#51a2ff`: 5.25 and 6.73 : 1 on the page ground) and their hover underline is the frame's too, never a
 * utility here: the stylesheet is unlayered, so a utility would lose anyway. `Footer.contrast.test.tsx` holds it.
 */
export function Footer() {
  return (
    <footer className="sf-footer" data-sf="footer">
      <div className="sf-col">
        <div>
          &copy; {new Date().getFullYear()} William W. Davis, MSPM, PMP |{' '}
          <Link href="/changelog">Version {APP_VERSION}</Link>{' '}
          | Licensed under GNU GPL v3
        </div>
        <div>
          <a href="https://spertsuite.com" target="_blank" rel="noopener noreferrer">
            SPERT® Suite
          </a>
          {' | '}
          <a href={TOS_URL} target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          {' | '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          {' | '}
          <a href={AI_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            AI Privacy Notice
          </a>
          {' | '}
          <a href="https://github.com/famousdavis/spert-forecaster/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
            License
          </a>
        </div>
      </div>
    </footer>
  )
}
