// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// Read-only AI pairing for SPERT Forecaster.
//
// This is a port of the Story Map hook with roughly a third of it removed.
// Forecaster's connection WRITES NOTHING: there is no op-log listener, no
// drain loop, no null-product window recovery, no undo integration, and no op
// vocabulary — all of which exist in the sibling solely to make AI writes
// safe. What is left is a session document, a snapshot the AI reads, and a
// heartbeat.
//
// The session is created with consentWrite: false, and the MCP server refuses
// any write against such a session. Read Mode is the only consent toggle.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  doc, deleteDoc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import type { DocumentSnapshot, FirestoreError } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functionsInstance, isFirebaseAvailable } from '@/shared/firebase/config'
import { sanitizeForFirestore } from '@/shared/firebase/firestore-sanitize'
import { syncBus } from '@/shared/firebase/sync-bus'
import { APP_VERSION } from '@/shared/constants'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore, selectRecordFor } from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { buildSnapshot } from '../lib/build-snapshot'
import {
  AI_CONSENT_KEY, AI_CONSENT_VERSION, AI_SESSION_ID_KEY,
  HEARTBEAT_INTERVAL_MS, SESSION_TTL_MS, SNAPSHOT_DEBOUNCE_MS,
} from '../constants'

const SESSIONS_COL = 'anonymous_sessions'

export interface AiSessionState {
  sessionActive: boolean
  aiConnected: boolean
  consentRead: boolean
  sessionId: string | null
}

export interface UseAiConnectivityResult {
  sessionState: AiSessionState
  startSession: (consentRead: boolean) => Promise<boolean>
  stopSession: () => Promise<void>
  changePermissions: (consentRead: boolean) => Promise<boolean>
}

const expiry = () => new Date(Date.now() + SESSION_TTL_MS)

export function useAiConnectivity(): UseAiConnectivityResult {
  const [sessionState, setSessionState] = useState<AiSessionState>({
    sessionActive: false, aiConnected: false, consentRead: false, sessionId: null,
  })

  const activeSessionIdRef = useRef<string | null>(null)
  const sessionUnsubRef = useRef<(() => void) | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consentReadRef = useRef(false)
  const startInFlightRef = useRef(false)
  // Suppresses a pending debounced snapshot write during teardown, so a timer
  // that fires after the delete cannot re-create what consent just withdrew.
  const tearingDownRef = useRef(false)

  // The resolved viewed project, mirrored into a ref. Effect C's 30-second
  // timer MUST read this rather than a closure, or a timer scheduled before a
  // project switch pins the previous project id onto the session document.
  const viewedProject = useProjectStore(selectViewingProject)
  const viewedProjectRef = useRef(viewedProject)
  useEffect(() => { viewedProjectRef.current = viewedProject }, [viewedProject])
  useEffect(() => { consentReadRef.current = sessionState.consentRead }, [sessionState.consentRead])

  const localTeardown = useCallback(() => {
    sessionUnsubRef.current?.()
    sessionUnsubRef.current = null
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null }
    activeSessionIdRef.current = null
  }, [])

  // ── Effect B: the snapshot ────────────────────────────────────────────────
  const writeSnapshot = useCallback(() => {
    if (!db || !activeSessionIdRef.current) return
    // THE ONLY ENFORCEMENT POINT. firestore.rules grants `allow write: if true`
    // on the snapshot subcollection — it has nothing to key a tighter rule on,
    // since the browser is unauthenticated and the session id IS the
    // capability. Without this line, turning Read Mode off deletes the
    // snapshot and the next digest change re-creates it, serving data the
    // user has withdrawn consent for.
    if (!consentReadRef.current) return
    if (tearingDownRef.current) return

    const sessionId = activeSessionIdRef.current
    const projectState = useProjectStore.getState()
    const project = selectViewingProject(projectState)
    if (!project) {
      deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {})
      return
    }
    const resultsState = useForecastResultsStore.getState()
    const body = buildSnapshot({
      project,
      allSprints: projectState.sprints,
      record: selectRecordFor(resultsState, project.id),
      view: resultsState.viewState[project.id],
      comparand: readForecastInputSnapshot(project),
      storedInputs: projectState.forecastInputs[project.id],
      isSimulatingProjectId: resultsState.isSimulating?.projectId ?? null,
      distributionsEnabled: useSettingsStore.getState().distributionsEnabled,
      capturedAt: new Date().toISOString(),
    })

    setDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current'), {
      project: sanitizeForFirestore(body),
      updatedAt: serverTimestamp(),
      expiresAt: expiry(),
    }).catch((err) => console.error('[AI] Snapshot write failed:', err))
  }, [])

  const scheduleSnapshot = useCallback((immediate = false) => {
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
    if (immediate) { writeSnapshot(); return }
    snapshotTimerRef.current = setTimeout(writeSnapshot, SNAPSHOT_DEBOUNCE_MS)
  }, [writeSnapshot])

  // A CONTENT digest, not object identity: firestoreDocToProject returns a
  // fresh object literal on every cloud delivery, so identity changes
  // constantly while nothing the AI reads has moved. milestones and
  // productivityAdjustments are digested EXPLICITLY rather than relying on
  // updatedAt, because not every mutating action bumps it. The whole lifted
  // view-state slice goes in as one blob — enumerating a subset is what kept
  // going stale.
  const record = useForecastResultsStore((s) => selectRecordFor(s, viewedProject?.id))
  const isSimulating = useForecastResultsStore((s) => s.isSimulating)
  const viewSlice = useForecastResultsStore((s) =>
    viewedProject ? s.viewState[viewedProject.id] : undefined
  )
  const sprints = useProjectStore((s) => s.sprints)
  const forecastInputs = useProjectStore((s) =>
    viewedProject ? s.forecastInputs[viewedProject.id] : undefined
  )
  const distributionsEnabled = useSettingsStore((s) => s.distributionsEnabled)
  const trialCount = useSettingsStore((s) => s.trialCount)

  const digest = JSON.stringify([
    viewedProject?.id ?? null,
    viewedProject?.updatedAt ?? null,
    viewedProject?.milestones ?? null,
    viewedProject?.productivityAdjustments ?? null,
    sprints.filter((s) => s.projectId === viewedProject?.id),
    forecastInputs ?? null,
    distributionsEnabled,
    trialCount,
    sessionState.consentRead,
    record?.runAt ?? null,
    viewSlice ?? null,
    isSimulating?.projectId ?? null,
  ])

  const prevProjectIdRef = useRef<string | undefined>(viewedProject?.id)
  const prevSimulatingRef = useRef<boolean>(false)

  useEffect(() => {
    if (!sessionState.sessionActive || !sessionState.consentRead) return
    const projectChanged = prevProjectIdRef.current !== viewedProject?.id
    prevProjectIdRef.current = viewedProject?.id
    // Bypass the debounce on a project switch, and on isSimulating's RISING
    // edge. Without the latter, results.status: "recomputing" is never
    // published at all: clicking Run changes no other digest input, so the AI
    // keeps reading the prior "fresh" body until the run completes.
    const nowSimulating = !!isSimulating
    const risingEdge = nowSimulating && !prevSimulatingRef.current
    prevSimulatingRef.current = nowSimulating
    scheduleSnapshot(projectChanged || risingEdge)
  }, [
    digest, sessionState.sessionActive, sessionState.consentRead,
    scheduleSnapshot, viewedProject?.id, isSimulating,
  ])

  // ── Effect A: the session document's open project ─────────────────────────
  // Written immediately, undebounced: it is one small field, and the AI uses
  // it to know which project it is talking about.
  useEffect(() => {
    if (!db || !activeSessionIdRef.current || !viewedProject?.id) return
    updateDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current), {
      openProductId: viewedProject.id,
      lastActiveAt: serverTimestamp(),
    }).catch(() => {})
  }, [viewedProject?.id])

  // ── Effect C: the heartbeat ───────────────────────────────────────────────
  const startHeartbeat = useCallback((sessionId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    const fire = async () => {
      // A heartbeat scheduled before a re-pair must not write to the previous
      // session.
      if (!db || activeSessionIdRef.current !== sessionId) return
      try {
        await updateDoc(doc(db, SESSIONS_COL, sessionId), {
          browserConnectedAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          expiresAt: expiry(),
          openProductId: viewedProjectRef.current?.id ?? null,
        })
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        // Without this branch, a session deleted by TTL, by another tab, or by
        // teardown leaves a failing write every 30 seconds for the life of
        // the tab.
        if (code === 'not-found' || code === 'permission-denied') {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
          setSessionState((prev) => ({ ...prev, sessionActive: false }))
        }
        console.error('[AI] Heartbeat error:', err)
      }
    }
    fire()
    heartbeatRef.current = setInterval(fire, HEARTBEAT_INTERVAL_MS)
  }, [])

  // Browsers throttle background-tab intervals aggressively, so a returning
  // tab can be outside the server's 90-second window and read as disconnected
  // to the paired AI. This puts it back inside immediately.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !activeSessionIdRef.current || !db) return
      updateDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current), {
        browserConnectedAt: serverTimestamp(),
        openProductId: viewedProjectRef.current?.id ?? null,
      }).catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ── Session document listener (drives the "AI connected" indicator) ───────
  const subscribeSession = useCallback((sessionId: string) => {
    if (!db) return
    sessionUnsubRef.current?.()
    const onNext = (snap: DocumentSnapshot) => {
      if (!snap.exists()) {
        localTeardown()
        setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null })
        return
      }
      const d = snap.data()!
      const seen = (d.aiLastSeenAt as { toDate?: () => Date } | null)?.toDate?.()
      setSessionState((prev) => ({
        ...prev,
        aiConnected: !!seen && Date.now() - seen.getTime() < 90_000,
      }))
    }
    const onError = (err: FirestoreError) => {
      console.error('[AI] Session listener error:', err)
      setSessionState((prev) => ({ ...prev, sessionActive: false }))
    }
    sessionUnsubRef.current = onSnapshot(doc(db, SESSIONS_COL, sessionId), onNext, onError)
  }, [localTeardown])

  // ── Teardown ──────────────────────────────────────────────────────────────
  // deleteDoc runs FIRST and is load-bearing: the snapshot subcollection is
  // `allow write: if true`, so the delete succeeds even after sign-out
  // revokes credentials, and teardownAiSession is an onCall that never reads
  // request.auth.
  const teardown = useCallback(async (sessionId: string, deleteSession: boolean) => {
    tearingDownRef.current = true
    if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null }
    if (db) {
      await deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {})
    }
    if (deleteSession) {
      localTeardown()
      if (functionsInstance) {
        httpsCallable(functionsInstance, 'teardownAiSession')({ sessionId })
          .catch((err) => console.error('[AI] Teardown callable failed — data TTL-expires in 7 days:', err))
      }
    }
    tearingDownRef.current = false
  }, [localTeardown])

  // ── Start / resume ────────────────────────────────────────────────────────
  const startSession = useCallback(async (consentRead: boolean): Promise<boolean> => {
    if (!db || !isFirebaseAvailable) return false
    if (startInFlightRef.current) return false
    const project = selectViewingProject(useProjectStore.getState())
    if (!project) return false
    startInFlightRef.current = true
    try {
      const storedId = localStorage.getItem(AI_SESSION_ID_KEY)
      let sessionId = storedId ?? crypto.randomUUID()
      let resuming = false

      if (storedId) {
        try {
          const snap = await getDoc(doc(db, SESSIONS_COL, storedId))
          const storedExp = snap.exists() ? snap.data().expiresAt?.toDate?.() : undefined
          resuming = snap.exists() && (!storedExp || storedExp >= new Date())
        } catch (err) {
          console.error('[AI] Session check failed:', err)
          return false
        }
        if (!resuming) sessionId = crypto.randomUUID()
      }

      localStorage.setItem(AI_SESSION_ID_KEY, sessionId)
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
        version: AI_CONSENT_VERSION, date: new Date().toISOString(), read: consentRead,
      }))
      activeSessionIdRef.current = sessionId
      consentReadRef.current = consentRead

      if (resuming) {
        try {
          await updateDoc(doc(db, SESSIONS_COL, sessionId), {
            consentRead,
            openProductId: project.id,
            lastActiveAt: serverTimestamp(),
            browserConnectedAt: serverTimestamp(),
            expiresAt: expiry(),
          })
        } catch (err) {
          console.error('[AI] Resume failed:', err)
          activeSessionIdRef.current = null
          return false
        }
      } else {
        try {
          // EXACTLY ten keys. aiLastSeenAt is MCP-server-owned and must be
          // ABSENT: the create rule's hasOnly() rejects it.
          await setDoc(doc(db, SESSIONS_COL, sessionId), {
            createdAt: serverTimestamp(),
            lastActiveAt: serverTimestamp(),
            expiresAt: expiry(),
            browserConnectedAt: serverTimestamp(),
            openProductId: project.id,
            // Create-fixed and never updated. The update allowlist excludes
            // it, so this value is the session's permanent write posture.
            consentWrite: false,
            consentRead,
            lastSeq: 0,
            appVersion: APP_VERSION,
            appId: 'forecaster',
          })
        } catch (err) {
          console.error('[AI] Session creation failed:', err)
          activeSessionIdRef.current = null
          return false
        }
      }

      subscribeSession(sessionId)
      startHeartbeat(sessionId)
      setSessionState({ sessionActive: true, aiConnected: false, consentRead, sessionId })
      if (consentRead) scheduleSnapshot(true)
      return true
    } finally {
      startInFlightRef.current = false
    }
  }, [subscribeSession, startHeartbeat, scheduleSnapshot])

  const stopSession = useCallback(async () => {
    const sessionId = activeSessionIdRef.current ?? localStorage.getItem(AI_SESSION_ID_KEY)
    if (sessionId) await teardown(sessionId, true)
    localStorage.removeItem(AI_SESSION_ID_KEY)
    localStorage.removeItem(AI_CONSENT_KEY)
    setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null })
  }, [teardown])

  const changePermissions = useCallback(async (consentRead: boolean): Promise<boolean> => {
    const sessionId = activeSessionIdRef.current
    if (!db || !sessionId) return false
    try {
      await updateDoc(doc(db, SESSIONS_COL, sessionId), {
        consentRead, lastActiveAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('[AI] Failed to update Read Mode:', err)
      return false
    }
    consentReadRef.current = consentRead
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
      version: AI_CONSENT_VERSION, date: new Date().toISOString(), read: consentRead,
    }))
    setSessionState((s) => ({ ...s, consentRead }))
    if (consentRead) {
      scheduleSnapshot(true)
    } else {
      // Read Mode off deletes the snapshot but PRESERVES the session, the
      // pairing, and the heartbeat — gating the heartbeat on consentRead
      // would reproduce the very "browser looks disconnected" symptom it
      // exists to prevent.
      await teardown(sessionId, false)
    }
    return true
  }, [scheduleSnapshot, teardown])

  // ── Sign-out and cloud→local: delete the snapshot ─────────────────────────
  useEffect(() => {
    const unsubscribe = syncBus.subscribe((event) => {
      if (event.type !== 'ai:session-teardown') return
      const sessionId = activeSessionIdRef.current
      if (!sessionId) return
      if (event.reason === 'signout') {
        void stopSession()
      } else {
        // A storage-mode switch preserves the pairing; only the snapshot goes.
        void teardown(sessionId, false)
      }
    })
    return unsubscribe
  }, [stopSession, teardown])

  // ── Resume on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!db || !isFirebaseAvailable) return
    const storedId = localStorage.getItem(AI_SESSION_ID_KEY)
    if (!storedId || activeSessionIdRef.current) return
    let cancelled = false
    void (async () => {
      try {
        const snap = await getDoc(doc(db!, SESSIONS_COL, storedId))
        if (cancelled || !snap.exists()) return
        const d = snap.data()
        const exp = d.expiresAt?.toDate?.()
        if (exp && exp < new Date()) return
        activeSessionIdRef.current = storedId
        consentReadRef.current = !!d.consentRead
        subscribeSession(storedId)
        startHeartbeat(storedId)
        setSessionState({
          sessionActive: true, aiConnected: false,
          consentRead: !!d.consentRead, sessionId: storedId,
        })
      } catch {
        // A failed resume simply leaves the panel disconnected.
      }
    })()
    return () => { cancelled = true }
  }, [subscribeSession, startHeartbeat])

  useEffect(() => () => localTeardown(), [localTeardown])

  return { sessionState, startSession, stopSession, changePermissions }
}
