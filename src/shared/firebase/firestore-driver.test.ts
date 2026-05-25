// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { PROJECT_MERGE_FIELDS, SETTINGS_MERGE_FIELDS } from './firestore-driver'

// Runtime documentation of the mergeFields contract (C1/C2).
// Compile-time exhaustiveness is enforced inside firestore-driver.ts by the
// _PROJECT_WRITE_KEYS_GUARD and _SETTINGS_WRITE_KEYS_GUARD literals — these
// runtime asserts complement that with a hard pass/fail signal if either
// constant drifts from the documented contract.

describe('PROJECT_MERGE_FIELDS', () => {
  it('covers all writable FirestoreProjectDoc fields (excluding owner/members)', () => {
    expect(new Set(PROJECT_MERGE_FIELDS)).toEqual(new Set([
      'name', 'unitOfMeasure', 'sprintCadenceWeeks',
      'projectStartDate', 'projectFinishDate', 'firstSprintStartDate',
      'productivityAdjustments', 'milestones', 'sprints',
      'createdAt', 'updatedAt', '_originRef', '_changeLog', 'schemaVersion',
    ]))
  })

  it('does NOT contain owner or members (ACL fields must not be touched by debounced saves)', () => {
    expect(PROJECT_MERGE_FIELDS).not.toContain('owner' as never)
    expect(PROJECT_MERGE_FIELDS).not.toContain('members' as never)
  })
})

describe('SETTINGS_MERGE_FIELDS', () => {
  it('covers all FirestoreSettingsDoc fields', () => {
    expect(new Set(SETTINGS_MERGE_FIELDS)).toEqual(new Set([
      'autoRecalculate', 'trialCount', 'defaultChartFontSize',
      'defaultCustomPercentile', 'defaultCustomPercentile2',
      'defaultResultsPercentiles', 'distributionsEnabled',
    ]))
  })
})
