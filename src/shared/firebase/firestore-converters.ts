// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Pure conversion functions between Zustand store shape and Firestore document shape.
// The key difference: sprints are a flat array in the store (linked by projectId)
// but denormalized into each project document in Firestore.

import type { Project, Sprint } from '@/shared/types'
import type { ChangeLogEntry } from '@/shared/state/storage'
import type { FirestoreProjectDoc, FirestoreSettingsDoc } from './types'
import type { TrialCount } from '@/shared/state/settings-store'
import type { ChartFontSize } from '@/shared/types/burn-up'
import { SCHEMA_VERSION } from './types'
import { sanitizeForFirestore } from './firestore-sanitize'

/** Convert a Zustand project + its sprints into a Firestore document (for saving). */
export function projectToFirestoreDoc(
  project: Project,
  sprints: Sprint[],
  uid: string,
  existingDoc?: Partial<FirestoreProjectDoc>,
  originRef?: string,
  changeLog?: ChangeLogEntry[]
): FirestoreProjectDoc {
  const projectSprints = sprints.filter((s) => s.projectId === project.id)

  return sanitizeForFirestore({
    name: project.name,
    unitOfMeasure: project.unitOfMeasure,
    sprintCadenceWeeks: project.sprintCadenceWeeks,
    projectStartDate: project.projectStartDate,
    projectFinishDate: project.projectFinishDate,
    firstSprintStartDate: project.firstSprintStartDate,
    productivityAdjustments: project.productivityAdjustments || [],
    milestones: project.milestones || [],
    sprints: projectSprints,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: existingDoc?.owner ?? uid,
    members: existingDoc?.members ?? {},
    _originRef: originRef,
    _changeLog: changeLog,
    schemaVersion: SCHEMA_VERSION,
  })
}

/** Convert a Firestore document back into a Zustand Project (strips ownership). */
export function firestoreDocToProject(
  docId: string,
  doc: FirestoreProjectDoc
): Project {
  return {
    id: docId,
    name: doc.name,
    unitOfMeasure: doc.unitOfMeasure,
    sprintCadenceWeeks: doc.sprintCadenceWeeks as Project['sprintCadenceWeeks'],
    projectStartDate: doc.projectStartDate,
    projectFinishDate: doc.projectFinishDate,
    firstSprintStartDate: doc.firstSprintStartDate,
    productivityAdjustments: doc.productivityAdjustments || [],
    milestones: doc.milestones || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/** Extract sprints from a Firestore project document. */
export function firestoreDocToSprints(doc: FirestoreProjectDoc): Sprint[] {
  return doc.sprints || []
}

/** Convert Zustand settings to Firestore settings doc (strips local-only fields). */
export function settingsToFirestoreDoc(settings: {
  autoRecalculate: boolean
  trialCount: number
  defaultChartFontSize: string
  defaultCustomPercentile: number
  defaultCustomPercentile2: number
  defaultResultsPercentiles: number[]
}): FirestoreSettingsDoc {
  return {
    autoRecalculate: settings.autoRecalculate,
    trialCount: settings.trialCount,
    defaultChartFontSize: settings.defaultChartFontSize,
    defaultCustomPercentile: settings.defaultCustomPercentile,
    defaultCustomPercentile2: settings.defaultCustomPercentile2,
    defaultResultsPercentiles: settings.defaultResultsPercentiles,
  }
}

/** Convert Firestore settings doc back to partial Zustand settings. */
export function firestoreDocToSettings(doc: FirestoreSettingsDoc): {
  autoRecalculate: boolean
  trialCount: TrialCount
  defaultChartFontSize: ChartFontSize
  defaultCustomPercentile: number
  defaultCustomPercentile2: number
  defaultResultsPercentiles: number[]
} {
  return {
    autoRecalculate: doc.autoRecalculate,
    trialCount: doc.trialCount as TrialCount,
    defaultChartFontSize: doc.defaultChartFontSize as ChartFontSize,
    defaultCustomPercentile: doc.defaultCustomPercentile,
    defaultCustomPercentile2: doc.defaultCustomPercentile2,
    defaultResultsPercentiles: doc.defaultResultsPercentiles,
  }
}
