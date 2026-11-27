// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { APP_VERSION } from '@/shared/constants'
import { AI_PRIVACY_URL } from '@/features/connect-ai/constants'
import { CopyrightYear } from '@/shared/lib/copyright'

// The suite's About page (FRAME26 pass 3, contract §3 About page and §7 About; stylesheet v4's `.sf-about`). The page's
// `h1` "About SPERT® Forecaster" is the frame's heading row, rendered by AppShell above this; this element is `main`'s
// next child and carries its own 16 px gap and 672 px measure. Every word is §7's shared words or the approved words in
// FRAME26-ABOUT-WORDS.md: change none without William's approval. No utility classes: the frame styles the page.

const REPO_URL = 'https://github.com/famousdavis/spert-forecaster'
// This app's Help Center page. Module-local, like TabNavigation's: the tests compare the address as a literal.
const HELP_URL = 'https://spertsuite.com/help/forecaster'
const CONNECT_AI_GUIDE = '/SPERTForecaster_Connect_AI_Guide.pdf'

// The Help Center's guides for this app (spert-landing `src/data/help.ts`, `forecaster`), titles and descriptions
// word for word, in its order.
const GUIDES = [
  {
    file: '/SPERTForecaster_Quick_Reference_Guide.pdf',
    title: 'Quick Reference Guide',
    description:
      'What Forecaster is and how it forecasts release dates from your sprint history with Monte Carlo simulation.',
  },
  {
    file: CONNECT_AI_GUIDE,
    title: 'Connect AI User Guide',
    description: 'How to pair an AI assistant with a project so it can read your forecast and explain it.',
  },
] as const

const R = <span className="sf-mark">®</span>
const TM = <span className="sf-mark sf-mark--tm">™</span>

/** A link that opens in a new tab, as §7 marks it: the arrow hidden from screen readers, the warning read instead. */
function NewTab({ href, children, sr = ' (opens in a new tab)', className }: {
  href: string
  children: ReactNode
  sr?: string
  className?: string
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}<span aria-hidden="true"> ↗</span><span className="sf-sr">{sr}</span>
    </a>
  )
}

export function AboutTab() {
  return (
    <div className="sf-about" data-sf="about">
      <section>
        <h2>What is SPERT{R} Forecaster?</h2>
        <p>
          SPERT{R} Forecaster forecasts when your team will finish its remaining backlog, and how likely each date is,
          from your sprint history or, before you have one, your own estimate of your velocity.
        </p>
        <p>
          Statistical PERT{R} (SPERT{R}) makes statistical modeling accessible to project managers, Scrum Masters,
          students, businesspeople, and others who need to model uncertain outcomes using a lightweight, highly
          accessible approach. PERT stands for Program Evaluation and Review Technique, a classic project management
          technique to model project uncertainties, like project duration and budget. Statistical PERT (SPERT) is a
          modern approach to estimating project uncertainties using a variety of statistical probability
          distributions, Monte Carlo simulation, and unique approaches that operate with subjective expert judgement or
          historical data (when it&apos;s available).
        </p>
      </section>

      <section>
        <h2>How it works</h2>
        <ol>
          <li>Create a project, then set its sprint cadence on the Sprint History tab</li>
          <li>Record your sprint history with &quot;done&quot; values</li>
          <li>Enter your remaining backlog size</li>
          <li>Run a Monte Carlo simulation to get probabilistic finish dates</li>
        </ol>
      </section>

      <section>
        <h2>About the simulation</h2>
        <p>
          The forecast runs thousands of Monte Carlo trials using multiple probability distributions (Truncated Normal,
          Lognormal, Gamma, Bootstrap, Triangular, and Uniform). Each trial simulates completing the remaining backlog
          by drawing random velocities for each sprint until the work is done. The percentile results show the
          likelihood of finishing by each date.
        </p>
      </section>

      <section>
        <h2>Connect AI</h2>
        <p>
          Pair a compatible AI assistant with your project so it can read your sprint history and forecast results,
          and explain what the numbers mean. The connection is read-only.
        </p>
        <p>
          To connect, follow the steps for your assistant on the Help Center&apos;s{' '}
          <NewTab href="https://spertsuite.com/help/connect-ai">Connect AI setup page</NewTab>. The{' '}
          <NewTab href={CONNECT_AI_GUIDE}>Connect AI User Guide</NewTab> explains what your assistant can do in
          SPERT{R} Forecaster. What it reads or changes passes through the SPERT{R} Suite relay, whichever storage you
          use; the <NewTab href={AI_PRIVACY_URL}>AI Privacy Notice</NewTab> says what is kept and for how long.
        </p>
      </section>

      <section>
        <h2>Guides</h2>
        <ul className="sf-guides" data-sf="guides">
          {GUIDES.map(guide => (
            <li key={guide.file} className="sf-guide">
              <div className="sf-guide-body">
                <h3 className="sf-guide-title">{guide.title}</h3>
                <p className="sf-guide-text">{guide.description}</p>
              </div>
              <NewTab href={guide.file} className="sf-guide-open" sr={`: ${guide.title} (opens in a new tab)`}>
                Open PDF
              </NewTab>
            </li>
          ))}
        </ul>
        <p><NewTab href={HELP_URL}>More help in the Help Center</NewTab></p>
      </section>

      <section>
        <h2>Your data and storage</h2>
        <p>
          Unless you sign in and choose cloud storage, SPERT{R} Forecaster keeps your projects in this browser, on this
          device, and sends them to no server except through Connect AI, while an assistant is connected. Clearing this
          site&apos;s data deletes them, so export a backup from time to time.
        </p>
        <p>
          If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your
          projects are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then open
          them on any device and share them with other people.
        </p>
      </section>

      <section className="sf-about-legal" data-sf="about-legal">
        <h2>Version and license</h2>
        <p>Version {APP_VERSION} · <Link href="/changelog">What&apos;s new</Link></p>
        <p>Created by William W. Davis, MSPM, PMP · <NewTab href={REPO_URL}>Source code on GitHub</NewTab></p>
        <p>
          © <CopyrightYear /> William W. Davis, MSPM, PMP. SPERT{R} Forecaster is free software: you may use, change
          and share it under the GNU General Public License, version 3, with the additional terms its{' '}
          <NewTab href={`${REPO_URL}/blob/main/LICENSE`}>LICENSE</NewTab> adds under Section 7 of that license:
          attribution and legal notices, trademarks, the marking of modified versions, endorsement, and
          indemnification.
        </p>
        <p>
          SPERT{R}, Statistical PERT{R} and Estimation Made Easy{R} are registered trademarks of famousdavis, LLC.
          GanttApp{TM} and MyScrumBudget{TM} are trademarks of famousdavis, LLC.
        </p>
        <p>
          THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED
          IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM &quot;AS IS&quot; WITHOUT WARRANTY
          OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
          MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE
          PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING,
          REPAIR OR CORRECTION.
        </p>
      </section>
    </div>
  )
}
