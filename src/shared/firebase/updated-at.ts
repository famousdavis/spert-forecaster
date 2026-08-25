// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Normalizes a Firestore `updatedAt` value to an ISO 8601 string.
 *
 * WHY THIS EXISTS — and why it matters MORE here than in a read-only app.
 * ----------------------------------------------------------------------
 * Forecaster is a PRODUCER of the corrupt shape, not just a victim of it.
 * `firestoreDocToProject` read `updatedAt` raw into the store, and
 * `projectToFirestoreDoc` writes `project.updatedAt` straight back out — a
 * pass-through of whatever is sitting there, not a fresh stamp. On the way out
 * `sanitizeForFirestore` matches `typeof === 'object'` on a Firestore
 * `Timestamp` and rebuilds it via `Object.entries` into a plain
 * `{seconds, nanoseconds}` map that is no longer `instanceof Timestamp` and
 * that nothing downstream can parse.
 *
 * So a Timestamp this app merely READ was degraded on the next save, and the
 * original instant was unrecoverable afterwards. Normalizing at the converter
 * is what makes the pass-through correct by construction: the store holds an
 * ISO string, so what goes back out is something that can be read again.
 *
 * ⚠️ THIS IS NOT A PORT OF `spert-admin-tool`'s `normalizeUpdatedAt`.
 * That one carries `import 'server-only'` and matches `instanceof Timestamp`
 * against **firebase-admin**, which does not match a **firebase/firestore**
 * client Timestamp and cannot be bundled for the browser. This duck-types
 * instead. Its CLASSIFICATION is deliberately identical, so a document scanned
 * by the admin tool and the same document read here agree about whether an
 * instant exists.
 *
 * ⚠️ RETURNS `undefined`, NEVER `null`, for a shape carrying no recoverable
 * instant. `sanitizeForFirestore` strips `undefined` only — `null` passes
 * through with the key present and would write a null into the document. The
 * mandated reference returns `millis: null` for these shapes, which makes
 * `null` the tempting choice here and the wrong one.
 *
 * ⚠️ Never a substituted current date and never `createdAt`. Stamping on read
 * would satisfy any "it is an ISO string" assertion while obliterating every
 * real historical instant.
 */
export function normalizeUpdatedAt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined

  // The unresolved serverTimestamp() sentinel, persisted as data. MUST precede
  // the object handling below — and it is the only shape that has ever leaked
  // to production in this suite (Scheduler Q#32).
  if (isServerTimestampSentinel(value)) return undefined

  if (typeof value === 'number') return fromMillis(value)
  if (typeof value === 'string') return fromDateString(value)
  if (typeof value === 'object') return fromTimestampLike(value)
  return undefined
}

/**
 * A string `Date.parse` rejects has no instant to encode and must NOT pass
 * through. `Project.updatedAt` is declared a string, so an unparseable string
 * is the one bad shape the type system still admits after this fix.
 */
function fromDateString(value: string): string | undefined {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : fromMillis(ms)
}

/** The three object spellings that carry a real instant. */
function fromTimestampLike(value: object): string | undefined {
  // A client `Timestamp` — duck-typed, because `instanceof` against the
  // firebase/firestore class would not match an admin-SDK-shaped object.
  const withToDate = value as { toDate?: unknown }
  if (typeof withToDate.toDate === 'function') {
    const d = (withToDate.toDate as () => Date)()
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined
  }

  // The two plain-map spellings, in SEPARATE branches because they have
  // distinct producers and either can be independently forgotten. `seconds` is
  // exactly what `sanitizeForFirestore` manufactures out of a Timestamp in
  // THIS repo; `_seconds` is the Admin SDK's serialization. Both carry a real
  // instant and must be recovered, not discarded — discarding them would throw
  // away the true update time of precisely the documents a later migration has
  // to fix.
  const m = value as {
    _seconds?: unknown; _nanoseconds?: unknown
    seconds?: unknown; nanoseconds?: unknown
  }
  if (typeof m._seconds === 'number') return fromSeconds(m._seconds, m._nanoseconds)
  if (typeof m.seconds === 'number') return fromSeconds(m.seconds, m.nanoseconds)
  return undefined
}

/** The `{ _methodName: 'serverTimestamp' }` map an unresolved sentinel leaves behind. */
function isServerTimestampSentinel(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['_methodName'] === 'serverTimestamp'
  )
}

/** Guarded — `new Date(NaN).toISOString()` throws, which would defeat the point. */
function fromMillis(ms: number): string | undefined {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function fromSeconds(seconds: number, nanoseconds: unknown): string | undefined {
  const nanos = typeof nanoseconds === 'number' && Number.isFinite(nanoseconds) ? nanoseconds : 0
  return fromMillis(seconds * 1000 + Math.floor(nanos / 1e6))
}
