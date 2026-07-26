// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The prompt the user pastes into their AI client.
//
// This text leaves the app, so it uses the same vocabulary as the tool
// descriptions and says nothing about how the app is built beyond what a user
// can see on screen.

/**
 * Build the pairing prompt for a session code.
 *
 * Every line earns its place by heading off a specific way an AI gets this
 * wrong: describing SPERT as three-point PERT, computing its own dates,
 * quoting a distribution the user cannot see, quoting stale numbers, joining
 * scopes to milestones by label, treating an independently-derived value as
 * screen truth, or offering to make an edit it cannot make.
 */
export function buildPairingPrompt(code: string): string {
  return `I'm working in SPERT® Forecaster and I'd like your help understanding my forecast.

My pairing code is ${code}.

Please:
1. Call resolve_session_code with that code, then get_session_info.
2. Call forecaster_get_project to read my project.

A few things to know before you interpret it:

- SPERT Forecaster is a MONTE CARLO simulation over sprint velocity. It is NOT
  three-point PERT — there is no (O + 4M + P) / 6 anywhere in it. Call
  forecaster_explain_method before you explain the method, and
  forecaster_get_glossary if a term is unfamiliar; several words mean something
  specific here.
- Don't compute completion dates yourself. Quote the dates in the snapshot.
- Check results.status first. "fresh" means the numbers match my current
  inputs. "stale" means I changed something after the run, and statusReason
  says what. "recomputing" means a run is in progress. "absent" means I haven't
  run one.
- Check visibleDistributions before quoting a distribution. The app computes
  six; I may only be looking at one. modeExcludedDistributions tells you which
  ones are invalid for my current mode versus which ones I chose to hide.
- Join scopes to milestones by milestoneIndex, never by label.
- Anything marked derivedIndependently was recomputed from the stored run and
  may differ slightly from what my screen shows.
- userSelections tells you what my three summary dropdowns display. It does NOT
  carry the big percentage in the headline — that figure is a different
  calculation and reads higher.

This connection is READ-ONLY. You can't change anything in my project, so if
something should change, just tell me what and where.`
}
