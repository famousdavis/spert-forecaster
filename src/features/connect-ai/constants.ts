// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/** Suite-wide AI privacy notice (shared across SPERT apps). */
export const AI_PRIVACY_URL = 'https://spertsuite.com/ai-privacy'

/** Session id for the current AI pairing, if any. */
export const AI_SESSION_ID_KEY = 'spert_forecaster_ai_session_id'

/** Recorded consent, so a returning browser can resume without re-prompting. */
export const AI_CONSENT_KEY = 'spert_forecaster_ai_consent'

/** Bump when the consent copy changes materially enough to need re-acceptance. */
export const AI_CONSENT_VERSION = 1

/** Firestore's document limit is 1 MB; 900 KB leaves headroom for metadata. */
export const SNAPSHOT_BYTE_BUDGET = 900_000

/** Most recent N sprints carried in the snapshot; velocityStats covers them all. */
export const MAX_SNAPSHOT_SPRINTS = 60

/** Effect B's debounce. Bypassed on a project switch and on a run starting. */
export const SNAPSHOT_DEBOUNCE_MS = 2_000

/** Effect C's cadence. The server treats a browser as connected for 90 s. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/** Session lifetime, refreshed by every heartbeat. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Length caps on user-authored text carried into the snapshot.
 *
 * These bound what a *user* can put in the payload. They are not a defence
 * against a hostile writer: the snapshot subcollection is writable by anyone
 * holding the session id, and such a write bypasses this builder entirely.
 */
export const SNAPSHOT_TEXT_CAPS = {
  projectName: 200,
  unitOfMeasure: 100,
  milestoneName: 200,
  adjustmentName: 200,
  adjustmentReason: 500,
} as const
