// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The read-only texts are owner-approved wording (Brief 39 §7 + amendments,
// 2026-10-08): this file pins each one, so a change shows up as a red test
// rather than in front of a user. And it pins which text each access gets.

import { describe, it, expect } from 'vitest'
import type { ProjectAccess } from '@/shared/state/project-access'
import {
  accessBadge,
  accessBanner,
  accessReason,
  deleteReason,
  NOT_IN_CLOUD_BADGE,
  NOT_IN_CLOUD_BANNER,
  NOT_IN_CLOUD_LIST_NOTE,
  NOT_IN_CLOUD_REASON,
  OWNER_ONLY_DELETE_REASON,
  PROJECT_LEFT_TEXT,
  VIEW_ONLY_BADGE,
  VIEW_ONLY_BANNER,
  VIEW_ONLY_LOCK_NOTE,
  VIEW_ONLY_REASON,
} from './access-texts'

describe('the approved texts, word for word (known-bad: a text changed without the owner)', () => {
  it.each([
    ['T1', VIEW_ONLY_BANNER, 'View only — this project is shared with you as a viewer. You can run forecasts, export and copy charts. To change it, ask its owner for edit access.'],
    ['T1b', NOT_IN_CLOUD_BANNER, 'Not in your cloud account — this project is view only. It may have been unshared from you or deleted, or made while you were signed out. You can still export it. It leaves this list when your projects next update.'],
    ['T2', VIEW_ONLY_REASON, 'View only — this project is shared with you as a viewer.'],
    ['T2b', NOT_IN_CLOUD_REASON, "View only — this project isn't in your cloud account."],
    ['T3', OWNER_ONLY_DELETE_REASON, "Only the project's owner can delete it. To remove it from your list, ask the owner to stop sharing it with you."],
    ['T4', VIEW_ONLY_BADGE, 'View only'],
    ['T4b', NOT_IN_CLOUD_BADGE, 'Not in cloud'],
    ['T4c', NOT_IN_CLOUD_LIST_NOTE, 'Projects marked "Not in cloud" aren\'t in your cloud account and are view only. Export any you want to keep: they leave this list when your projects next update — adding, copying or importing a project counts.'],
    ['T5', VIEW_ONLY_LOCK_NOTE, '(View only)'],
    ['T15', PROJECT_LEFT_TEXT('Q3 Launch'), '"Q3 Launch" is no longer in your list, so what you were typing wasn\'t saved. It may have been unshared from you or deleted.'],
  ])('%s', (_id, actual, approved) => {
    expect(actual).toBe(approved)
  })

  it('neither banner names Clone (V7; known-bad: the old "or clone it")', () => {
    expect([VIEW_ONLY_BANNER, NOT_IN_CLOUD_BANNER].some((t) => /clone/i.test(t))).toBe(false)
  })
})

describe('which text each access gets (known-bads: a viewer told nothing; an editor locked out; an owner badged)', () => {
  const ACCESS: ProjectAccess[] = ['owner', 'editor', 'viewer', 'not-in-cloud']
  it('the reason, the Delete reason, the banner and the badge', () => {
    expect(ACCESS.map((a) => [accessReason(a), deleteReason(a), accessBanner(a), accessBadge(a)])).toEqual([
      [null, null, null, null],
      [null, OWNER_ONLY_DELETE_REASON, null, null],
      [VIEW_ONLY_REASON, OWNER_ONLY_DELETE_REASON, VIEW_ONLY_BANNER, VIEW_ONLY_BADGE],
      [NOT_IN_CLOUD_REASON, NOT_IN_CLOUD_REASON, NOT_IN_CLOUD_BANNER, NOT_IN_CLOUD_BADGE],
    ])
  })
})
