// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// FRAME26 pass 3 (v0.54.0): every word on the About page is approved, contract §7's shared words or Forecaster's own in
// FRAME26-ABOUT-WORDS.md (William, 2026-11-27). Each paragraph and list item is compared with a LITERAL copy here, never
// with a constant the component imports, so a changed word in either place turns this red. The text is read as a
// screen reader would get it minus the "(opens in a new tab)" warnings (`.sf-sr`), whitespace collapsed; the visible
// "↗" stays in.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render } from '@testing-library/react'

import { AboutTab } from './AboutTab'
import { APP_VERSION } from '@/shared/constants'

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 5, 15)) })
afterAll(() => vi.useRealTimers())

const text = (el: Element) => {
  const c = el.cloneNode(true) as Element
  c.querySelectorAll('.sf-sr').forEach((s) => s.remove())
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const EXPECTED: [string, string[]][] = [
  ['What is SPERT® Forecaster?', [
    'SPERT® Forecaster forecasts when your team will finish its remaining backlog, and how likely each date is, from your sprint history or, before you have one, your own estimate of your velocity.',
    "Statistical PERT® (SPERT®) makes statistical modeling accessible to project managers, Scrum Masters, students, businesspeople, and others who need to model uncertain outcomes using a lightweight, highly accessible approach. PERT stands for Program Evaluation and Review Technique, a classic project management technique to model project uncertainties, like project duration and budget. Statistical PERT (SPERT) is a modern approach to estimating project uncertainties using a variety of statistical probability distributions, Monte Carlo simulation, and unique approaches that operate with subjective expert judgement or historical data (when it's available).",
  ]],
  ['How it works', [
    'Create a project, then set its sprint cadence on the Sprint History tab',
    'Record your sprint history with "done" values',
    'Enter your remaining backlog size',
    'Run a Monte Carlo simulation to get probabilistic finish dates',
  ]],
  ['About the simulation', [
    'The forecast runs thousands of Monte Carlo trials using multiple probability distributions (Truncated Normal, Lognormal, Gamma, Bootstrap, Triangular, and Uniform). Each trial simulates completing the remaining backlog by drawing random velocities for each sprint until the work is done. The percentile results show the likelihood of finishing by each date.',
  ]],
  ['Connect AI', [
    'Pair a compatible AI assistant with your project so it can read your sprint history and forecast results, and explain what the numbers mean. The connection is read-only.',
    "To connect, follow the steps for your assistant on the Help Center's Connect AI setup page ↗. The Connect AI User Guide ↗ explains what your assistant can do in SPERT® Forecaster. What it reads or changes passes through the SPERT® Suite relay, whichever storage you use; the AI Privacy Notice ↗ says what is kept and for how long.",
  ]],
  ['Guides', [
    'More help in the Help Center ↗',
  ]],
  ['Your data and storage', [
    "Unless you sign in and choose cloud storage, SPERT® Forecaster keeps your projects in this browser, on this device, and sends them to no server except through Connect AI, while an assistant is connected. Clearing this site's data deletes them, so export a backup from time to time.",
    'If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your projects are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then open them on any device and share them with other people.',
  ]],
  ['Version and license', [
    `Version ${APP_VERSION} · What's new`,
    'Created by William W. Davis, MSPM, PMP · Source code on GitHub ↗',
    '© 2026 William W. Davis, MSPM, PMP. SPERT® Forecaster is free software: you may use, change and share it under the GNU General Public License, version 3, with the additional terms its LICENSE ↗ adds under Section 7 of that license: attribution and legal notices, trademarks, the marking of modified versions, endorsement, and indemnification.',
    'SPERT®, Statistical PERT® and Estimation Made Easy® are registered trademarks of famousdavis, LLC. GanttApp™ and MyScrumBudget™ are trademarks of famousdavis, LLC.',
    'THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.',
  ]],
]

// The Help Center's two guides for Forecaster (spert-landing src/data/help.ts at 6792169), word for word.
const GUIDE_ROWS = [
  ['Quick Reference Guide', 'What Forecaster is and how it forecasts release dates from your sprint history with Monte Carlo simulation.', 'Open PDF ↗', ': Quick Reference Guide (opens in a new tab)'],
  ['Connect AI User Guide', 'How to pair an AI assistant with a project so it can read your forecast and explain it.', 'Open PDF ↗', ': Connect AI User Guide (opens in a new tab)'],
]

describe('the About page’s words (v0.54.0)', () => {
  it('has the seven sections, in §7’s order, each with exactly its approved words', () => {
    const { container } = render(<AboutTab />)
    const sections = [...container.querySelectorAll('.sf-about > section')]
    const got = sections.map((s): [string, string[]] => [
      text(s.querySelector(':scope > h2')!),
      [...s.querySelectorAll(':scope > p, :scope > ol > li, :scope > ul:not(.sf-guides) > li')].map(text),
    ])
    expect(got).toEqual(EXPECTED)
  })

  it('lists the Help Center’s guides, word for word, each with "Open PDF" and its title for screen readers', () => {
    const { container } = render(<AboutTab />)
    const rows = [...container.querySelectorAll('.sf-guides > li.sf-guide')].map((li) => [
      text(li.querySelector('.sf-guide-title')!),
      text(li.querySelector('.sf-guide-text')!),
      text(li.querySelector('a.sf-guide-open')!),
      li.querySelector('a.sf-guide-open .sf-sr')?.textContent,
    ])
    expect(rows).toEqual(GUIDE_ROWS)
  })

  it('bolds nothing: no list item here opens with a label (William, 2026-11-27), and the running text stays plain', () => {
    const { container } = render(<AboutTab />)
    expect(container.querySelectorAll('strong, b').length).toBe(0)
  })
})
