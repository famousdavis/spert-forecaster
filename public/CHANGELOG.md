# Changelog

## v0.29.2 - 2026-05-10

### Changed

- Middle button (project name → Sprint History) hit area now spans the full tile height *and* width between the drag handle and the icon group, matching GanttApp v0.25.0. Padding moved from the inner flex row (`p-4`) onto the button itself (`py-4 px-3`); the row's `gap-3` was removed so children sit edge-to-edge. Visible spacing between the button text and its neighbors (handle, share) stays identical (~12px / ~18px) — what changes is that the cursor remains `pointer` across the whole strip instead of dropping to `default` in the former 12px gap zones. The button now extends from the tile's inner top border to its inner bottom border and from immediately right of the drag handle to immediately left of the share / icon-group cluster.

## v0.29.1 - 2026-05-10

### Changed

- Project tiles in the Projects tab now show a faint blue hover shading when the cursor is over the project name area, matching the GanttApp tile-hover pattern. Hover state is tracked by project ID so it survives reorder and delete; mouse-leave and blur use a functional-updater clear to avoid a fast-mouse race between adjacent tiles. The `transition-colors duration-[120ms]` on the tile incidentally smooths the drag-over border-color flip as well — desirable polish.

## v0.29.0 - 2026-05-10

### Changed

- **Projects tab UI refresh — icon-button parity with GanttApp v0.25.0.** Visual/UX-only update; no data, business, or import/export behavior changes.
  - **Hover ring on all action icon buttons.** `ExportIconButton`, `PencilIconButton`, and `TrashIconButton` now grow a 1.5px colored glow ring (matching their accent: emerald / blue / red) on hover and focus, in addition to the existing background tint. Transition widened from `transition-colors` to `transition-[color,background-color,box-shadow]` so the ring animates in instead of snapping. Disabled state explicitly strips the ring (`disabled:[box-shadow:none]`).
  - **`PencilIconButton` gains an `active` prop.** When `active={true}` and `!disabled`, the button renders permanently in its hover state (blue text, blue tint background, blue ring) regardless of cursor position — used to mark the row whose form is currently open above the list. CSS specificity guarantees `disabled` overrides `active`: `disabled:bg-transparent`, `disabled:text-gray-400`, and `disabled:[box-shadow:none]` (added in this release) win via `:disabled` pseudo-class specificity over the static active classes. `ProjectsTab` plumbs `editingProjectId={editingProject?.id ?? null}` into `ProjectList`, which forwards `active={project.id === editingProjectId}` to each pencil.
  - **New shared component: `ShareIconButton`.** Cyan-accented icon button (person-plus glyph) with the same prop shape, focus/hover/disabled states, and class pattern as the existing trio. Replaces the bordered purple `Share` text button in `ProjectList`.
  - **New shared component: `DragHandle`.** Six-dot grid (2 columns × 3 rows of 4×4px `bg-gray-400 dark:bg-gray-500` dots, 2px gap) with `cursor-grab active:cursor-grabbing`, `aria-hidden`. Replaces the inline domino-pattern SVG.
  - **Drag scope: handle-only.** The `draggable` attribute and `onDragStart`/`onDragEnd` handlers moved off the outer tile div onto a new wrapper that holds only the `DragHandle`. The tile keeps `onDragOver`/`onDragLeave`/`onDrop` so the entire row is still a valid drop target. The new `onDragStart` walks up from the handle wrapper to the tile (via `data-tile="true"`) and calls `setDragImage` so the drag preview shows the full rounded tile — matching the GanttApp drag feel.
  - **Project name area → full-height navigation button.** The project name + summary block became a `<button>` with `onClick={() => onViewHistory(project.id)}`, replacing both the previous `<div>` wrapper and the standalone `View History` text button. `flex-1 min-w-0 flex items-center self-stretch px-0` keeps the visual layout identical (single-line, midline-aligned name + summary) while extending the click target to the full row height. `title="View history"` and `aria-label="View history for {name}"` cover tooltip + screen-reader parity. `focus-visible:ring-2 focus-visible:ring-spert-blue` adds a missing keyboard-focus indicator.
  - **Share gated → icon button + same-size placeholder.** When the share gate (`isCloudMode && onShare && ownedProjectIds?.has(project.id)`) fails, an empty `w-8 h-8 flex-shrink-0` placeholder div renders in the share slot, holding the icon group's horizontal position so non-owned rows don't visually shift their action cluster.
  - **Icon group regrouped at 2px gap.** Export / Pencil / Trash now sit inside `flex items-center gap-0.5` (was `gap-1 ml-1`). The Share icon button (or placeholder) sits outside this wrapper as a direct sibling of the inner flex row, with the row's new `gap-3` providing 12px separation between handle, info button, share element, and icon group. The previous `<div className="flex items-center gap-2">` actions wrapper was removed entirely to flatten the row.
  - **Toolbar Export All / Import → ghost-style buttons.** Above the project list, the bordered blue text buttons became transparent-rest ghost buttons that bloom into colored hover states: green (`#10b981`) for Export All, blue (`#0070f3`) for Import. Each gets a leading 18×18 download/upload-arrow SVG whose `stroke="currentColor"` lets a single text-color class animate both icon and label together. `text-gray-500` rest passes WCAG AA contrast (~4.6:1) for the text + icon. `border border-transparent` at rest avoids a 1px hover layout shift. Wrapper uses `cn('flex gap-2', projects.length === 0 ? 'justify-center' : 'justify-end')` so a lone Import button centers in the empty state.

### Internal

- New shared components: `src/shared/components/ShareIconButton.tsx`, `src/shared/components/DragHandle.tsx`.
- Modified: `src/shared/components/{Export,Pencil,Trash}IconButton.tsx`, `src/features/projects/components/ProjectList.tsx`, `src/features/projects/components/ProjectsTab.tsx`.
- Test count unchanged: 731 tests / 35 files passing. Lint baseline preserved at 0/0. No test edits required (no UI tests exist for `ProjectList`/`ProjectsTab`; only data/state tests cover this surface).

## v0.28.4 - 2026-05-09

### Internal

- **Lint baseline reset to 0 errors / 0 warnings** (was 0 errors / 15 warnings since v0.25.1). Three categories of cleanup:
  - **ESLint config — underscore-prefix convention.** New override block in `eslint.config.mjs` adds `varsIgnorePattern: '^_'` (plus `argsIgnorePattern`, `caughtErrorsIgnorePattern`, `destructuredArrayIgnorePattern`) to `@typescript-eslint/no-unused-vars`. Codifies the existing destructure-to-strip idiom used in `firestore-driver.ts` (stripping `owner`/`members` from save payloads — the v0.22.2 C3 protection), `firestore-sanitize.ts`, and `project-store.ts`. Suppresses 7 of the 15 warnings without any code changes.
  - **Dead-declaration removal.** Deleted unused imports and props: `cumulativeThresholds` from `ForecastSummary` (declared in props but never read inside the component; also dropped from the call-site at `ForecastTab.tsx`); `activeProjectId` from `ProjectList` (same pattern; dropped from the `ProjectsTab.tsx` call-site, plus the now-unused `selectActiveProject` import and `activeProject` selector); `WorkerInput` type import from `useSimulationWorker.ts`; `Project` type import from `firebase/types.ts`; `ExportData` type import from `import-validation.test.ts`; `sumY2` accumulator from `trend.ts` (vestige of an abandoned closed-form R² formulation — the function instead uses the explicit two-pass `ssTot`/`ssRes` loop, which is mathematically equivalent and well-tested by 8 R² test cases).
  - **React hooks exhaustive-deps fixes.** `useForecastState`'s project-change effect now extracts `resetScopeGrowth` to a local binding (`const { resetScopeGrowth } = scopeGrowth`) and lists it as the dep. The function has stable identity (wrapped in `useCallback([])` inside `useScopeGrowthState`), so this is functionally equivalent to the implicit capture but free of the lint warning. The extraction matters because exhaustive-deps would otherwise demand the whole `scopeGrowth` object — including frequently-changing toggle state — as a dep, which would over-trigger the effect. `useSprintData`'s anchor-date `useMemo` drops `completedSprintCount` from its deps array (it was never referenced in the memo body).
- No behavioral changes; tests still 731/731 across 35 files.

## v0.28.3 - 2026-05-09

### Security

- **M1 — Import field allowlist.** `validateImportData` now strips unknown keys at every nesting level (project, sprint, milestone, productivity adjustment, `_changeLog` entry). Previously, a crafted Story Map or Forecaster export JSON could smuggle arbitrary properties into the Zustand store and — via `setDoc(..., { merge: true })` — into Firestore. The `owner`/`members` keys were already explicitly destructured by `saveProject`, but every OTHER unknown key would have round-tripped to the cloud. No exploit was observed; this is a defense-in-depth improvement.
- **L2 — Activity-timeline fingerprint cleared on sign-out.** `clearProjectsOnSignOut` now resets `_changeLog: []` in addition to the previously-cleared user-scoped fields. On a shared device, the next user signing in would otherwise inherit the prior user's structural-operation history (timestamps, op types, entity IDs). `_originRef` is intentionally preserved as the per-browser workspace identity used for cross-import reconciliation.
- **L4 — CSV formula injection prevention.** The CSV escape helper now prefixes any cell whose first character is `=`, `+`, `-`, `@`, or Tab with a single quote. Without this, a project name like `=cmd|'/c calc'!A1` would execute as a formula when the exported CSV is opened in Excel/Sheets/Numbers and the macro warning is dismissed.

### Fixed

- **L3 (UX, not security) — Stale-auth toast spam on sign-out + tab-close.** The `useCloudSync` `beforeunload` handler now checks `auth.currentUser` before flushing pending writes. If the user clicks Sign Out and immediately closes the tab, the listener can fire AFTER `firebaseSignOut()` has revoked the token but BEFORE React commits `setUser(null)`. Flushing in that window dispatched Firestore writes against a stale auth context — Firestore correctly rejected them, but the user saw failed-save toasts on the way out. The post-sign-out window now routes to `cancelPendingSaves()` instead.

### Internal

- 12 new tests added in `import-validation.test.ts` (6) and `export-csv.test.ts` (6) covering the M1 and L4 fixes; one existing `clearProjectsOnSignOut` test split into two to reflect L2's new behavior.
- Defers L1 (`spertforecaster_profiles` enumeration guard) — applies suite-wide, addressed in a separate canonical-rules PR.

## v0.28.2 - 2026-05-09

### Fixed

- **`getProjectMembers` is now resilient to per-profile fetch failures.** Profile reads now fan out via `Promise.allSettled` (Lesson 64) instead of a sequential `await getDoc()` loop. A single rejected profile fetch — transient network blip or permission denial — used to throw out of the entire function, blanking the Sharing UI's member list for that project. The owner-fetch and each member-fetch are now independent: a rejected read substitutes a placeholder member (empty `email`/`displayName`) and logs `[firestore-sharing] profile fetch failed for {uid}`, while the rest of the list still renders. Fulfilled-but-missing profile docs (the normal "profile not yet written" path) continue to placeholder quietly without a warning.

### Internal

- **`tailwind-merge` 3.4.0 → 3.5.0** — minor bump, well clear of the 60-day rule.
- 5 new tests in `src/shared/firebase/firestore-sharing.test.ts` covering the happy path, owner-profile rejection, single-member rejection, missing-profile-doc, and missing-project-doc paths for `getProjectMembers`.

## v0.28.1 - 2026-05-09

### Fixed

- **`CLAIM_GRACE_MS` raised from 10s to 30s in `useInvitationLanding`** to match the canonical Lesson 7 value used by the other six SPERT apps. At 10s, a slow-but-valid Cloud Function claim (cold-start p95 5–15s) could time out before the `spert:models-changed` event landed, briefly dropping the user back to `idle` with a misleading "didn't match your account" implication. Companion test-fixture updates: `describe` label and timeout-path `advanceTimersByTime` advanced from 10000 to 30000.

## v0.28.0 - 2026-05-08

### Added

- **`captureInviteTokenFromUrl(enabled)` exported from `src/features/auth/lib/inviteCapture.ts`** so URL-token capture is unit-testable in isolation (Lesson 58). Runs once at module load with the live `INVITATIONS_ENABLED` flag; tests pass `true`/`false` directly without `vi.resetModules()`.
- **Centralized callable wrappers in `src/shared/firebase/callables.ts`** — `requireFunctions()` guard plus four named wrappers (`callSendInvitationEmail`, `callClaimPendingInvitations`, `callRevokeInvite`, `callResendInvite`) with descriptive errors instead of the SDK's opaque `TypeError: Cannot read properties of null (reading 'name')` on a misconfigured Firebase environment (Lesson 61).
- **`OwnerStatus` four-state enum** in `SharingSection` — `'loading' | 'owner' | 'not-owner' | 'error'`. Members-fetch failures now surface a visible "Couldn't load sharing details" message instead of silently hiding the section, so owners mid-edit don't lose context (Lesson 60).
- **Profile-write helpers extracted to `src/shared/firebase/profileWrites.ts`** — `writeUserProfile` plus the underlying `upsertProfile` / `upsertSuiteProfile` upserts. Eight new smoke tests cover field shape, email lowercasing, null-email fallback, the `lastSignIn` asymmetry between app-specific and suite-wide rows, `serverTimestamp()` sentinel survival through the spread (Lesson 29), and the background-write contract that one rejection does NOT throw (Lesson 62).

### Changed

- **`parseBulkEmails` returns `{ valid: string[]; invalid: string[] }`** instead of `string[]`. Malformed tokens used to vanish silently; they now surface as red `(invalid-format)` chips alongside CF-side rejections (Lesson 42).
- **Bulk-invite textarea-clear is now gated on success.** When all addresses are invalid-format, the textarea retains content and the Cloud Function is not called. When at least one address lands (added or invited), the textarea clears (Lesson 43).
- **Member + pending refresh in `SharingSection.loadMembers` uses `Promise.allSettled`** instead of sequential awaits with silently-swallowed errors. Each source's failure is logged with a `[SharingSection]` prefix; the other source still updates (Lesson 64).
- **`useInvitationLanding` initial state is now a lazy `useState` initializer** reading `SESSION_KEY` at mount. The previous `eslint-disable-next-line react-hooks/set-state-in-effect` workaround is gone (Lesson 66). Effect 1's responsibility is now narrowed to URL-strip via `router.replace` and the `localProjectCount === 0` cloud-mode flip.
- **`InvitationBanner` is now a centered card** (`max-w-lg mx-auto`) with absolute-positioned dismiss button, distinguishing it visually from passive informational banners. Both `pre_auth` and `claimed` branches restyled. Inner `max-w-md` SignInButtons wrapper removed — the outer card already constrains width (Lesson 56).

### Fixed

- **`removeProjectMember` is now a three-guard `runTransaction`** (caller can't remove themselves; caller must still be owner; the project owner cannot be removed). Closes a TOCTOU window where the document could be modified concurrently between the previous `verifyProjectOwner` pre-flight read and the non-transactional `updateDoc(deleteField())` write. The owner-removal block prevents bricking the document — once `members` no longer contains the owner UID, every subsequent `get`/`list` rule check fails and the project becomes permanently inaccessible (Lesson 50).
- **`claimPendingInvitations` is now gated on `firebaseUser.emailVerified`.** Microsoft personal accounts (`@outlook.com`, `@hotmail.com`) are reported by Firebase with `emailVerified: false`, so the previous code fired a wasted Cloud Function round-trip on every page load by such a user. The user-visible toast was already suppressed via a sessionStorage gate, but the CF call itself still happened (Lesson 26).

### Internal

- New `src/shared/firebase/profileWrites.ts`, `src/shared/firebase/callables.ts`, and `src/features/auth/lib/inviteCapture.ts` modules. `firestore-driver.ts` and `config.ts` shed responsibilities into these new homes; `firestore-migration.ts` now imports `upsertProfile` from `profileWrites`.
- 98 new tests added across the bulk-sharing audit (615 historical baseline → 713 after this PR): 15 `parseBulkEmails` cases (9 reshape, 6 new), 7 `captureInviteTokenFromUrl` cases, 8 `profileWrites` cases, plus existing test infrastructure adapted for `vi.hoisted` to satisfy module-load-order requirements introduced by the new exports.
- Test mocking: where direct spy passthrough was applicable, wrappers like `(...args) => spy(...args)` were avoided to head off TypeScript TS2556 spread-tuple violations (Lesson 69).

## v0.27.1 - 2026-05-07

### Fixed

- **Share button on the Projects tab is no longer visible to non-owners.** Editors and viewers (who can't actually share) previously saw the Share button anyway, which was visually misleading and inconsistent with GanttApp/Story Map (where the same affordance is properly gated on `project.owner === user.uid`). The data was always safe — `SharingSection` already gates management UI on the asynchronously-loaded `isOwner` — but the affordance itself shouldn't appear for users who can't act on it.
  - New helper `loadOwnedProjectIds(uid)` in `src/shared/firebase/firestore-driver.ts` issues one `where('owner', '==', uid)` query and returns a `Set<string>` of project IDs the user owns.
  - `ProjectsTab` calls it on mount (and refreshes when the project list length changes, so a newly-created project flips into the owned set immediately) and threads the set through as a new `ownedProjectIds` prop on `ProjectList`.
  - `ProjectList` now gates the Share button on `isCloudMode && onShare && ownedProjectIds?.has(project.id)`. Non-owners see no Share button. The internal `isOwner` check inside `SharingSection` is preserved as a second line of defense.

## v0.27.0 - 2026-05-05

### Added

- **Per-tile project Export icon (download arrow, green hover)** on each row of the Projects tab. Single click downloads `spert-forecaster-{slug}-{date}.json` containing just that project + its sprints + relevant change-log entries. Files re-import additively: existing projects merge by ID-or-name, sprints with overlapping `sprintNumber` are skipped, unrelated workspace data is preserved.
- **Settings → Export Projects section** lets you select any subset of projects (with select-all) and export them as one combined JSON file. Mirrors GanttApp's pattern but adapted to the Forecaster data model (no snapshot concept).
- **Subset-import detection + additive merge flow.** New `_exportType: 'spert-forecaster-project-export'` is detected on Import; a confirmation dialog summarizes additions, updates, and skipped duplicates before merging.

### Changed

- **Projects tab Edit/Delete buttons replaced with pencil and trash icon buttons** — borderless, gray default, color (blue/red) on hover, matching the GanttApp pattern. New shared components: `PencilIconButton`, `TrashIconButton`, `ExportIconButton`.
- **Export / Import buttons relocated** from the page header to a right-aligned toolbar above the project list, matching GanttApp. The "Export" button is now labeled **Export All** to clarify it bundles every project. Emoji icons removed.
- **Footer pinned to the bottom of the viewport** when content is short — same pattern as SPERT Scheduler (`min-h-screen flex flex-col` on the root, `flex-1` on `<main>`). Long pages still scroll naturally with the footer below content.
- **Export Attribution Name + Identifier inputs capped at `max-w-[400px]` and `maxLength={100}`** to match GanttApp. They no longer stretch the full width of the Settings panel.

### Internal

- New helper `src/features/projects/lib/export-project.ts` (slugify, build payload, single + multi export).
- New `mergeProjectSubset` action on the project store; appends a `merge-import` change-log entry tagged with the subset source.
- New tests: `export-project.test.ts` (slugify + payload builder), additional `merge-import.test.ts` cases (`isProjectSubsetExport`, `buildSubsetMergePlan`, `applySubsetMerge`).

## v0.26.1 - 2026-05-05

### Fixed

- **InvitationBanner sign-in buttons no longer stretch across the full banner width.** The pre_auth state of `<InvitationBanner />` rendered `<SignInButtons fullLabel />` directly inside a 1200px-max-width banner, causing each button to grow to ~600px on wide viewports — visually unbalanced and disconnected from the surrounding text. The buttons are now wrapped in a `max-w-md` (448px) container, matching the proven proportions used in `CloudStorageModal`. Buttons remain side-by-side, left-aligned with the banner copy, and stack via `flex-wrap` on narrow viewports as before. Pure presentation change; no behavior, no schema, no flag, no test changes.

## v0.26.0 - 2026-05-05

### Added

- **Bulk email invitations** *(feature flag `INVITATIONS_ENABLED = false` in this release — ship-gate PR will follow once the Cloud Functions deploy on the SPERT Suite Landing Page)*: project owners will be able to invite multiple collaborators by email in a single batch. Existing-user invites auto-add immediately; new-user emails receive an invitation link they claim by signing in with the matching address. New: `useInvitationLanding` hook and `InvitationBanner` shell component (state machine: `idle` → `pre_auth` → `claimed`); `firestore-invitations.ts` (Firestore queries, callable wrappers, bulk-email parsing, error mapping with send/resend/revoke discriminator); four new typed callable factories on `firebase/config.ts` (`getSendInvitationEmail`, `getClaimPendingInvitations`, `getRevokeInvite`, `getResendInvite`); flag-branched `SharingSection` with bulk textarea, pending-invitations list, Resend (with `n/5` cap counter), and Revoke (gated by `ConfirmDialog`).

### Changed

- **User profile now dual-writes to `spertforecaster_profiles/{uid}` and `spertsuite_profiles/{uid}` on every auth resolution.** Previously the per-app collection was written only on cloud-mode activation. The new suite-wide collection enables cross-app email→uid resolution required by `sendInvitationEmail`. Both writes use `merge:true` and are idempotent. Pre-populates the suite-wide collection ahead of the v0.26.0 ship-gate flip — write fires regardless of `INVITATIONS_ENABLED`.
- **Display-name normalization is now sourced from `src/lib/auth-name.ts`.** `normalizeDisplayName` delegates to a canonical `denormalizeLastFirst` helper that mirrors the server-side implementation in `spert-landing-page/functions/src/mailHeaders.ts`, so display names rendered in the UI match the From-line the invitation mailer writes. Behavior unchanged for all existing single-comma inputs (verified by full pass of the existing display-name test suite).
- **`FirestoreProfileDoc` now requires `photoURL: string | null`.** Added to the schema for cross-app avatar consistency. Three migration call sites (`StorageModeSection`, `UploadConfirmPanel`, `CloudStorageModal`) now plumb `user.photoURL ?? null` end-to-end.

### Internal

- CSP `connect-src` extended to allow `https://*.cloudfunctions.net` and `https://*.run.app` for Firebase v2 callable endpoints (production-only; verify on Vercel preview before flipping the ship-gate flag).
- Removed redundant `upsertProfile` call from `useCloudSync.ts`. Profile writes now sourced exclusively from `AuthProvider` (single source of truth, fires on every auth resolution).
- Added `serverTimestamp` import to `firestore-driver.ts` and a new `upsertSuiteProfile` writer that stamps `updatedAt` server-side on the suite-wide collection.
- Added 52 new tests across three test files: `auth-name.test.ts` (9), `firestore-invitations.test.ts` (27, covering `parseBulkEmails` and full `mapInvitationError` × send/resend/revoke matrix), `useInvitationLanding.test.tsx` (16, covering URL capture, sessionStorage restore, C1 storage-mode gate, 10s grace timer happy/timeout paths, H2 sign-out behavior, dispatch-from-any-state). Total test count: 615 → 667.

## v0.25.5 - 2026-05-03

### Fixed

- **Form-field hygiene residual sweep**: Added `name` attributes to 20 form controls across 14 files that previously carried neither `id` nor `name`, eliminating the corresponding Chrome DevTools "Form field element should have an id or name attribute" issues. Touched: BurnUpConfig forecast-line color/label/percentile inputs (3 inputs × 3 lines, parameterized name per line); MilestoneForm hidden color picker; checkbox in MilestoneList, ProductivityAdjustmentList, SprintList row loops; ReportButton "Include Forecast Results" checkbox; ConsentModal ToS-agree checkbox; CloudStorageModal "warn on local storage" checkbox; ForecastTab and SprintHistoryTab project selectors; ForecastSummary distribution + percentile selects; PercentileSelector milestone select; SharingSection email/role/member-role selects; ProjectsTab hidden file input; ThemeToggle settings-page select. No behavior changes; no `autoComplete` additions (prior pass covered them); no Rule 3/4/5 violations remained. Two bonus `aria-label` additions (ForecastTab and SprintHistoryTab project selectors) were applied in passing since those elements were already being modified.

## v0.25.4 - 2026-05-03

### Fixed

- **Surfaced Firestore write failures to the user via toast notifications**: Errors from debounced project saves, settings saves, profile upserts, project deletes, import-time saves, and Terms-of-Service acceptance writes were previously logged to the console only and never reached the user. Each swallowed-error site now fires a `toast.error(...)` alongside the existing `console.error`, using the already-installed Sonner toast renderer in `AppShell`. The `flushPendingSaves` path on `beforeunload` intentionally still log-only (the page is unmounting and a toast cannot render).
- **Added error callbacks to all `onSnapshot` listeners**: The three real-time subscriptions in `subscribeToUserProjects()` (owned, editor-member, viewer-member) used the two-argument form, leaving transport and permission errors unhandled by the app. They now use the three-argument form with a per-scope error handler that logs and emits a single `toast.error` ("Lost real-time connection to the cloud. Refresh to reconnect."). A full reconnect mechanism remains a deferred follow-up.
- **Added `autoComplete` attributes to three form inputs**: `SharingSection.tsx` email input (`autoComplete="off"` — invitation field for *another* person, not the user's own email), and the "Name" input on both `SettingsTab.tsx` (Export Attribution) and `CloudStorageModal.tsx` (`autoComplete="name"` — collects the user's own name). The `Identifier` field is intentionally left without `autoComplete` because its placeholder ("e.g., student ID, email, or team name") describes a multi-purpose value and does not map to a single browser autofill category.

## v0.25.2 - 2026-04-30

### Added

- **Branded favicon and header icon**: New `spert-favicon-forecaster.png` (192×192 PNG, blue `#0070f3` panels with rounded corners) now appears as the browser tab icon and immediately to the left of the "SPERT® Forecaster" title in the app header. A charcoal-on-black dark-mode variant (`spert-favicon-forecaster-dark.png`) auto-swaps when the active theme is dark, using the existing `useTheme` hook so it tracks the user's chosen theme (not just OS `prefers-color-scheme`).

## v0.25.1 - 2026-04-24

### Internal

- **Lint debt paydown**: Cleared all 17 eslint errors on `main` (baseline was 32 problems / 17 errors / 15 warnings; now 15 problems / 0 errors / 15 warnings). No user-facing behavior change. Warnings are a separate paydown pass.
  - `burn-up.test.ts` (×6): replaced `any` tuple types with `BurnUpConfig['lines']`.
  - `MilestoneList.tsx` + `useForecastInputs.ts`: refactored `let`-reassigning accumulators to `Array.reduce` (`react-hooks/immutability`).
  - `AuthProvider.tsx`: reordered `handleAuthenticatedUser` above its `useEffect` consumer (TDZ); migrated `firebaseReady` to `useSyncExternalStore` (hydration-safe snapshot of module-level `isFirebaseAvailable`); boot-path `setIsLoading(false)` retains a targeted disable with justification.
  - `ConsentModal.tsx`: switched to unmount-on-close lifecycle (parent in `SignInButtons.tsx` uses `{show && <ConsentModal />}`); all three internal effects updated, `isOpen` prop removed.
  - `ProjectForm.tsx` + `ProjectsTab.tsx`: replaced form-init `useEffect` with `useState` initializers + a `key={project?.id ?? 'new'}` remount at the single call site.
  - `LocalStorageWarningBanner.tsx`: split into derivation shell + inner `DismissibleBanner` with remount-key for ephemeral dismissal reset (no state-in-effect).
  - `useIsClient.ts`: migrated to `useSyncExternalStore`. All three consumers (`ProjectsTab`, `SprintHistoryTab`, `ForecastTab` via `useForecastState`) use the safe steady-state `if (!isClient) return <Loading />` pattern — confirmed unaffected by the post-hydration single-render diff.
  - `FirstRunBanner.tsx`: migrated to `useSyncExternalStore` over the `storage` event + ephemeral `dismissed` state.
  - **Targeted `eslint-disable`** (three sites, each with inline justification):
    - `useTheme.ts`: full `useSyncExternalStore` migration deferred — requires coordinated changes to `isInitialized` consumers in `ThemeToggle`. Tracked for a dedicated refactor.
    - `SharingSection.tsx`: Firestore fetch on mount is the rule's documented exception for external-system sync.
    - `useCloudSync.ts`: intentional latest-value ref write during render — moving to `useEffect` would introduce a stale-ref window inside sync-bus callbacks.

## v0.25.0 - 2026-04-24

### Changed

- **Unified Cloud Storage modal (replaces "Storage & Sign In")**: The header auth chip now opens a single standardized modal that handles all three auth × storage states — signed-out, signed-in + local, and signed-in + cloud — in one place, consistent with the rest of the SPERT® Suite. Modal title is "Cloud Storage". Radio labels are "Local (browser only)" and "Cloud (sync across devices)". Sign-in buttons show full-width "Sign in with Google" / "Sign in with Microsoft" labels with native full-color logos in a side-by-side equal-width layout. Signed-in states show an identity card with the normalized display name, email, and a red "Sign out" link. The Settings Storage section is retained as a secondary access path.
- **Auth chip click collapsed into a single handler**: The signed-in-local popover ("Switch to Cloud Storage" / "Sign Out") and the signed-in-cloud popover ("Sign Out") have been removed. In all three states, clicking the chip opens the Cloud Storage modal. The chip's three visual variants are unchanged.
- **Modal open state hoisted from `UserMenu` to `AppShell`**: `UserMenu` now accepts `onRequestOpen` and is presentation-only; the modal is rendered as a sibling of the header so it survives auth state transitions without prop drilling.
- **`SignInButtons` gains a `fullLabel` prop**: Existing call sites (Settings Account) continue to render the compact two-chip layout with responsive label hiding. The new Cloud Storage modal passes `fullLabel` for the full-label primary-blue treatment.

### Added

- **Export Attribution section inside the Cloud Storage modal**: Exposes `Name` and `Identifier` fields wired to the existing `setExportName` / `setExportId` setters in `settings-store.ts`. These fields are deliberately local-only (architectural decision confirmed in `types.ts`). The Settings Export Attribution section remains a valid second entry point — both surfaces read and write the same Zustand state.
- **Notifications section inside the Cloud Storage modal**: Adds a second entry point for the existing "Warn me on startup when using local storage" toggle, bound to `suppressLocalStorageWarning`. The Settings Notifications toggle is retained — the two entry points stay in sync via shared Zustand state.
- **`normalizeDisplayName()` utility** (`src/features/auth/lib/display-name.ts`): Normalizes Azure AD / Entra ID "Last, First MI" display names into natural "First MI Last" reading order for both the identity card and the chip's first-name segment. Includes `firstNameFromDisplayName()` for the chip.
- **`sanitizeFirebaseError()` + `normalizeSignInError()` utility** (`src/features/auth/lib/sign-in-errors.ts`): New error-code normalization for sign-in. Silent return for `popup-closed-by-user` and `cancelled-popup-request`; "Allow pop-ups in your browser to sign in." for `popup-blocked`; sanitized fallback for all others. Error text renders below the sign-in button row in the new modal.
- **Shared `UploadConfirmPanel`** (`src/features/auth/components/UploadConfirmPanel.tsx`): Extracted the local-to-cloud upload confirm UI from `StorageModeSection` into a reusable component. Both the Settings Storage section and the new Cloud Storage modal now consume the same confirm flow, so migration logic is defined once.

### Removed

- `StorageLoginModal` (superseded by `CloudStorageModal`).
- `AccountPopover` and `AccountPopoverLocal` (superseded by the unified modal's identity card).

## v0.24.4 - 2026-04-19

### Fixed

- **Post-signin "Upload & Switch to Cloud Storage" CTA disappeared before the user could see it (regression introduced in v0.24.3)**: v0.24.3 added a third render branch to `UserMenu` for the signed-in + local-mode chip. Because `StorageLoginModal` was only rendered inside the signed-out branch's return, completing a sign-in flipped the user from the signed-out branch to the `isSignedInLocal` branch — unmounting the modal before it could re-render into its post-signin state. The user ended up on the Projects tab with a signed-in chip and no one-click path to enable cloud storage (the v0.24.1 flow required the modal to stay open across the auth state change). Restructured `UserMenu` to render all three chip branches as a ternary inside a single Fragment, with `StorageLoginModal` as a sibling of the ternary — so the modal stays mounted across auth state transitions and correctly re-renders into its post-signin "Upload & Switch to Cloud Storage" CTA.

## v0.24.3 - 2026-04-19

### Fixed

- **Auth chip showed "Sign in" for already-authenticated users in local mode**: When a user was signed in but had not switched to cloud storage (signed in + local mode), the auth chip displayed "Local only / Sign in" — implying the user was not authenticated. This state now renders a distinct split-pill (avatar + first name on the left, lock icon on the right) matching the cloud pill layout. Clicking opens a new popover showing the user's display name and email with two actions: "Switch to Cloud Storage" (navigates to the Settings tab) and "Sign Out".

## v0.24.2 - 2026-04-19

### Fixed

- **Sign-out leaves cloud projects visible to next user (privacy)**: Previously, signing out only cleared the Firebase auth session — the Zustand store and its `spert-data` localStorage snapshot still contained the signed-out user's cloud projects, so the next person to open the same browser saw the previous user's data. `AuthProvider` now runs a four-step sign-out sequence on `onAuthStateChanged(null)`: cancel queued Firestore writes, clear the project store (new `clearProjectsOnSignOut` action that zeros `projects`, `sprints`, `viewingProjectId`, `forecastInputs`, `burnUpConfigs` while preserving the browser-scoped `_originRef` and `_changeLog` identity tokens), reset storage mode to `'local'`, then flip the React auth state. The localStorage snapshot is rewritten by the Zustand persist middleware during the clear.

- **Storage mode stuck at `'cloud'` after sign-out**: The `spert-storage-mode` localStorage key was never reset when the user signed out, so the next page load booted in cloud mode before Firebase had a chance to resolve auth. Sign-out now explicitly resets the mode to `'local'`.

- **Stale `useStorageMode` state across components (root cause of post-migration UI drift)**: Each of the 7 `useStorageMode` consumers had its own independent `useState`, so a `setMode` call in one component (e.g. the v0.24.1 "Upload & Switch to Cloud Storage" modal CTA) did not propagate to `StorageProvider`, `UserMenu`, or any other consumer. Observable consequences this release fixes: after a successful migration the live Firestore sync would not activate without a page refresh; the auth chip would continue to display "Local only / Sign in" after the user was signed in; and `StorageModeSection.handleConfirmLocal` would flip its own radio to local while `StorageProvider` continued syncing to Firestore in the background. Replaced the hook's per-instance `useState` with a shared Zustand store (`src/shared/state/storage-mode-store.ts`) so all consumers subscribe to the same source of truth.

- **Switching to local via Settings did not clear projects (Bug 3)**: `StorageModeSection.handleConfirmLocal` now calls `clearProjectsOnSignOut()` before `setMode('local')`. The confirmation dialog's stated contract ("cloud data will remain in Firebase but won't sync until you switch back") is now honored — local mode starts fresh. Users who want cloud projects available locally should use Export before switching and Import after.

- **`useCloudSync` teardown fired Firestore writes against revoked credentials**: The cleanup return used to call `flushPendingSaves()` unconditionally, which on sign-out attempted to push debounced writes after auth was already revoked, producing noisy permission errors. Teardown now calls `cancelPendingSaves()` instead; the `beforeunload` handler remains the only path that flushes pending writes.

- **Auth redirect fallback fired on user-dismissed popup**: The `catch {}` blocks in `signInWithGoogle` and `signInWithMicrosoft` fell back to `signInWithRedirect` on any error, including `auth/popup-closed-by-user` — so closing the OAuth popup would navigate the user away from the app. The fallback now triggers only for `auth/popup-blocked` and `auth/cancelled-popup-request`; every other error rethrows so the caller can surface it.

### Internal

- New file `src/shared/state/storage-mode-store.ts` — Zustand store that owns the storage mode. Custom persist adapter handles legacy raw-string localStorage format from pre-v0.24.2 installs without a one-shot migration script.
- `useStorageMode` hook reimplemented as a thin wrapper over the new store. Return shape (`{ mode, setMode, isFirebaseAvailable }`) is preserved so all 7 existing consumers compile unchanged. New `broadcastStorageModeChange(mode)` named export for non-React callers.
- `clearProjectsOnSignOut` action added to project store — does not emit to `syncBus` (the sign-out path revokes credentials before it fires; a cloud-side delete storm is not the intent).

## v0.24.1 - 2026-04-19

### Fixed

- **Auth chip sign-in modal — post-signin dead end**: After successfully signing in via the chip's sign-in modal, the modal previously showed the decorative storage radio with no actionable buttons (the embedded `SignInButtons` component correctly hid itself once authenticated, leaving the modal empty). The modal now detects the signed-in + local-mode state and replaces the sign-in buttons with an **Upload & Switch to Cloud Storage** button that runs the full local-to-cloud migration inline and closes the modal on success. The decorative radio now reflects the proposed target mode (Cloud highlighted) so the user sees where they're heading. The modal also auto-closes if the user is already in cloud mode, and the backdrop/Escape dismissal is disabled while the migration is in flight

## v0.24.0 - 2026-04-18

*Dedicated to the EGS6629 graduate students at the University of Florida, spring 2026 semester — whose careful, hands-on feedback while using SPERT® Forecaster for real project work directly shaped every improvement in this release.*

### Fixed

- **Report and Copy-as-Image dark-mode rendering**: Forecast report and Copy-as-Image captures now render correctly when the app is in dark mode. Previously, captured text was invisible on the forced-white capture background. Applies to the results table, burn-up chart, CDF chart, and histogram captures
- **Excluded-sprint backlog drift**: Excluding a sprint via the Include toggle no longer causes the Forecast tab's Remaining Backlog field to reflect the excluded sprint's ending value. A small "Reset to N" action now appears next to the Backlog field whenever the stored value differs from the most recent *included* sprint's `backlogAtSprintEnd`, giving the user one-click recovery without destroying manual edits

### Changed

- **Sprint History labels**: `Backlog at End` form label now includes the project's unit of measure. `Done` form label now reads `Done this sprint ({unit})` to clarify per-sprint scope. SprintList column headers remain compact but add full-label tooltips on hover
- **CV option label**: Renamed `Somewhat volatile` to `Often disrupted` to remove semantic overlap with the adjacent `Somewhat variable` option. CV values are unchanged
- **Model Scope Growth hint**: Toggle label now includes the parenthetical `(if backlog tends to grow each sprint)` to help new users decide whether the feature applies
- **Productivity Adjustments section**: Title now reads `Productivity Adjustments (Holidays, Breaks, Events)`. Panel description now includes a note explaining that forecasts report sprint finish dates (not intra-sprint completion dates), so small adjustments may not shift the projected end date if work still falls within the same sprint
- **Productivity Adjustment factor slider**: Endpoint labels expanded to include a midpoint anchor (`0% (no work) · 50% (half velocity) · 100% (full velocity)`) and a one-line helper text clarifying what the factor means
- **Auto-recalculate default**: Changed from OFF to ON for new users. Existing users' saved preferences are preserved. A cold-mount gate ensures the simulation still waits for the user's first manual Run Forecast click before auto-recalc engages

### Added

- **Bootstrap availability indicator**: In History mode, a discreet footnote below the results table explains that the Bootstrap distribution unlocks at 5 or more included sprints (showing the current count). The indicator disappears once bootstrap is available
- **Low sprint count warning**: In History mode with fewer than 4 included sprints, a discreet amber warning near the forecast results notes that the forecast spread may be understated with limited history
- **Reset overrides link**: When velocity mean, std dev, or volatility multiplier are overridden from their calculated values, a small `Reset overrides` link appears in the Forecast form. Clicking it clears all three values and closes the Volatility Adjuster panel if open
- **Subjective velocity divergence warning**: In Subjective mode, when the user's velocity estimate is more than 2× or less than 0.5× the historical mean (and 2+ sprints are included), a soft amber warning appears inline asking the user to verify that the estimate is intentional
- **Recent sprints summary**: When the Add Sprint form is open, a compact read-only summary of the 3 most recent sprints now appears above the form so the user can reference prior entries without closing the form

## v0.23.6 - 2026-04-10

### Fixed

- **Auth chip sign-in modal**: Clicking the auth chip in local storage mode now opens a sign-in modal instead of navigating to the Settings tab
- **Auth chip full-pill click target**: The entire auth chip pill is now clickable when in local storage mode (previously only the "Sign in" text segment was a button)

## v0.23.5 - 2026-04-09

### Changed

- **Auth chip in-place sign out**: Clicking anywhere on the signed-in auth chip (avatar, name, or cloud icon) now opens a lightweight popover showing the user's display name and email with a Sign Out button. The chip no longer navigates to Settings when signed in. Popover dismisses via Escape key or outside click; Sign Out button disables and shows "Signing out…" during the Firebase request. Signed-out "Sign in" behavior is unchanged.

## v0.23.4 - 2026-04-05

### Legal

- Updated Terms of Service and Privacy Policy to v04-05-2026
- Added SPERT® AHP to list of covered apps
- Updated effective date to April 5, 2026

## v0.23.3 - 2026-04-05

### Changed

- **Standardized auth chip**: Replaced header UserMenu dropdown with Option C split pill — consistent across all SPERT® Suite apps. Signed-in cloud mode shows avatar circle (first initial, `#0070f3`) + first name + cloud icon linking to Settings. Local/signed-out mode shows lock icon + "Local only" + "Sign in" link to Settings

## v0.23.2 - 2026-04-02

### Features

- **localStorage warning banner**: An amber caution banner now appears on every app load when the user is in local storage mode, reminding them to export at the end of each session. The banner dismisses for the session with an × button. A new **Notifications** section in Settings ("Warn me on startup when using local storage") permanently suppresses it. The setting is local-only and does not sync to cloud

## v0.23.1 - 2026-03-31

### Maintenance

- Updated Terms of Service and Privacy Policy to v03-31-2026
- Updated canonical legal document URLs to spertsuite.com
- Updated consent UI text to SPERT® Suite branding
- Standardized LICENSE to SPERT® Suite format (GPL v3 + lettered additional terms)
- Added License footer link to GitHub LICENSE file

## v0.23.0 - 2026-03-23

### Features

- **Custom sprint finish dates**: Historical sprints can now have their finish date overridden to reflect non-standard sprint durations (e.g., spring break extending a 2-week sprint to 3 weeks). Custom dates cascade forward — subsequent sprint start dates shift accordingly. Forecast projections anchor from the last historical sprint's actual finish date. A pencil icon (&#9998;) indicates sprints with custom dates in the sprint list
- **Quick Reference Guide opens in browser**: The QRG PDF now opens in a new browser tab instead of downloading, served from the app's `public/` directory

### Bug Fixes

- **Copy image browser compatibility**: Copy image button is now shown as disabled with an explanatory tooltip in browsers that do not support image clipboard writes (Firefox). Chrome, Edge, Safari, and Brave are unaffected

### UX

- **Export filename**: JSON export filename changed from `spert-data-` to `spert-forecaster-` prefix for clarity across the SPERT suite

### Technical

- New cascade-aware date utilities: `resolveAllSprintDates()` (O(n) batch), `resolveAnchorDate()`, `getNextBusinessDay()`
- Productivity adjustment call site updated to use cascade-resolved anchor date
- Burn-up chart uses resolved dates for historical points and cascade-aware projections
- Import validation extended for `customFinishDate` field
- 14 new tests for cascade date resolution logic

## v0.22.4 - 2026-03-16

### UX

- **First-run banner wording**: Updated to establish browsewrap agreement — using the app implies acceptance of Terms of Service and Privacy Policy. Added clickable links to both documents. Cloud Storage still requires explicit consent via the existing ConsentModal

## v0.22.3 - 2026-03-11

### Infrastructure

- **Node.js version pinning**: Added `engines` field (`>=22`) to `package.json` and `.nvmrc` for Node 22 LTS — ensures Vercel deploys on Node 22 before Node 20 EOL (April 30, 2026)
- **`@types/node` alignment**: Corrected from `^24` to `^22` to match the target deployment runtime

## v0.22.2 - 2026-03-11

### Security Hardening

- **Report generation CSP bypass**: Replaced `window.open()` + `document.write()` with blob URL approach — new report window now inherits the origin's Content Security Policy instead of running in an unrestricted context
- **Firestore project list enumeration**: Tightened `list` rule from `isAuth()` to require owner/member membership, matching the existing `get` rule — prevents authenticated users from enumerating all project IDs in the collection
- **Missing Firestore rules for users collection**: Added `users/{uid}` rules restricting read/write to the authenticated UID owner — the ToS acceptance flow (`tos.ts`) reads/writes this collection but had no corresponding security rules in the reference file
- **CSP directive tightening**: Removed `wasm-unsafe-eval` from `script-src` — the app does not use WebAssembly, so this directive unnecessarily widened the attack surface
- **Email validation in sharing**: Added format validation (RFC 5321 length limit, basic format check) to `findUserByEmail()` as defense-in-depth before Firestore query
- **Environment example cleanup**: Removed actual Firebase project ID from `.env.example`, replaced with empty placeholder

## v0.22.1 - 2026-03-11

### Bug Fixes

- **Sprint order assumption**: `useForecastInputs` used array insertion order (`sprints[sprints.length - 1]`) instead of highest `sprintNumber` to determine the last sprint's backlog — backfilling history out of order displayed the wrong sprint's value for backlog pre-fill and "Last sprint" text. Extracted `getLastSprintBacklog()` pure helper that uses `reduce()` to find the sprint with the highest number
- **Worker race condition**: In `useSimulationWorker`, starting a new simulation while the worker was still processing an old one could resolve the new promise with stale data. Added `_messageId` correlation counter — worker echoes the ID back, and `onmessage` silently discards responses with mismatched IDs

### Refactoring

- **Decomposed `ForecastResults.tsx`**: Extracted `ResultsTable.tsx` (133 LOC) containing the table component, row builders, distribution column helpers, and related types. `ForecastResults.tsx` reduced from 473 to 356 LOC

### Dependencies

- Updated within semver range: zustand 5.0.10→5.0.11, @vitejs/plugin-react 5.1.2→5.1.4, recharts 3.7.0→3.8.0, tailwind-merge 3.4.0→3.5.0, tailwindcss→4.2.1, @tailwindcss/postcss→4.2.1
- Bumped lucide-react range: `^0.563.0` → `^0.577.0` (updated to 0.577.0)

### Test Coverage

- 574 tests passing (was 568): added 6 tests for `getLastSprintBacklog` covering empty array, single sprint, in-order, out-of-order, undefined backlog, and zero backlog edge cases

## v0.22.0 - 2026-03-11

### Legal Compliance

- **Footer legal links**: Added persistent Terms of Service and Privacy Policy links to the app footer, visible on every page regardless of authentication state
- **First-run banner**: Added a dismissible informational banner on first app load, explaining that the app is free to use and no account is required; Cloud Storage prompts for ToS/Privacy agreement
- **Cloud Storage consent modal**: Added clickwrap consent gate before Firebase Authentication — users must check a checkbox agreeing to the Terms of Service and Privacy Policy before enabling Cloud Storage
- **Firestore acceptance records**: After successful authentication, writes a ToS acceptance record to `users/{uid}` in Firestore using a read-before-write pattern that preserves the original first-acceptance app ID across re-acceptance
- **Returning user version check**: On app load, verifies the authenticated user's ToS acceptance version against the current version; signs out users with outdated or missing acceptance records and routes them through the consent flow

## v0.21.5 - 2026-03-09

### Copyright Attribution

- **Copyright headers**: Added copyright and license headers to all 144 human-authored source files (`.ts`, `.tsx`, `.css`, `.mjs`, `.rules`)
- **LICENSE file**: Updated with full author attribution, trademark notice, and Section 7(b) non-permissive additional restrictions (attribution retention, trademark protection)
- **Standing instructions**: Added copyright section to CLAUDE.md requiring headers on all new source files

### Improvements

- **About tab**: Updated "Your Data & Privacy" section to "Your Data & Storage" — now documents both Local Storage (default) and Cloud Storage (optional) modes, including sign-in providers, encryption details, project sharing roles, and export/import guidance

## v0.21.4 - 2026-03-09

### Bug Fixes

- **Import fails silently in cloud mode**: `importData()` and `mergeImportData()` updated Zustand store but never emitted sync bus events, so Firestore was never notified — the next cloud snapshot overwrote local state back to pre-import data. Added `project:import` sync event type that deletes stale cloud projects and saves all imported projects via `saveProjectImmediate`
- **Cloud → local switch has no safeguard**: Switching from cloud to local mode immediately called `setMode('local')` with no confirmation, orphaning any cloud-only projects. Added a confirmation dialog warning that cloud-only data won't be accessible in local mode
- **Echo-prevention race condition**: `replaceProjectsFromCloud` and `replaceSettingsFromCloud` set `_isCloudUpdate: true` then reset it in a separate `set()` call — Zustand subscribers firing between the two calls could read the stale flag and skip sync bus emissions. Deferred the reset via `queueMicrotask` so all synchronous subscribers see the correct flag value
- **`STORAGE_MODE_KEY` defined in two places**: `useStorageMode.ts` defined its own copy instead of importing from `storage.ts` — consolidated to single source of truth
- **Stale debounced saves can overwrite import**: Pending debounced `saveProject` calls (with old data and `merge: true`) could fire after `saveProjectImmediate` during import, partially reverting imported data. Import handler now cancels all pending debounced saves before writing

## v0.21.3 - 2026-03-09

### Features

- **Quick Reference Guide**: Added downloadable PDF quick reference guide to the About tab — a 3-page printable overview of all features, workflow steps, forecast inputs, results, milestones, productivity adjustments, sprint history, and data/settings. PDF hosted on GitHub main branch.
- **Theme toggle icon**: Icon now shows the current theme (sun = light, moon = dark, monitor = system) instead of the next theme in the cycle

## v0.21.2 - 2026-03-08

### Security Hardening

- **HSTS header**: Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` to prevent protocol downgrade attacks
- **Real-time sync for shared projects**: `subscribeToOwnedProjects` renamed to `subscribeToUserProjects` — now subscribes to owned, editor-member, and viewer-member project queries instead of only owned projects. All three snapshot listeners must deliver their first result before the callback fires, preventing shared projects from briefly disappearing from the store

### Security Audit Summary

Full audit of Firebase config, Firestore rules, auth flows, input validation, XSS/injection, data exposure, dependencies, and security headers. No critical vulnerabilities found. Verified secure: CSP headers, Firestore CRUD rules, OAuth implementation, HTML/CSV escaping, import validation, file upload restrictions, data sanitization, sharing authorization, cloud sync guards, localStorage handling, dependency versions, and worker communication.

## v0.21.1 - 2026-03-08

### Bug Fixes

- **Data-loss prevention**: Added guard in `useCloudSync` to prevent empty Firestore results from wiping non-empty local data — if cloud returns 0 projects but local store has projects, the replacement is skipped
- **Migration required for cloud mode**: Replaced "Skip" with "Cancel" on the migration prompt — Cancel stays in local mode instead of switching to cloud without uploading. Cloud mode now requires successful migration (zero errors) to activate
- **reorderProjects sync bus emit**: Project reordering now emits to the sync bus, matching every other store mutation — ensures cloud sync consistency
- **useCloudSync race condition**: Initial Firestore load is now awaited before the snapshot listener attaches, preventing duplicate `replaceProjectsFromCloud` calls with conflicting data; added `cancelled` flag to prevent listener attachment after unmount

### Improvements

- **Error handling in sharing operations**: `shareProject`, `removeProjectMember`, and `updateMemberRole` now wrap Firestore writes in try-catch blocks, returning structured error results instead of throwing unhandled exceptions
- **DRY ownership verification**: Extracted `verifyProjectOwner()` helper in `firestore-sharing.ts` — three functions no longer duplicate the same 8-line ownership check
- **DRY doc-processing**: Extracted `processProjectDocs()` helper in `useCloudSync.ts` — eliminates duplicated Firestore-to-Zustand conversion loop
- **DRY forecast inputs default**: Extracted `DEFAULT_FORECAST_INPUTS` constant in `project-store.ts` — was duplicated inline in two places

### Test Coverage

- 568 tests passing (was 561): added 7 tests for `firestore-migration.ts` covering successful migration, ID collision detection, permission-denied fallback, error accumulation, originRef fallback, and empty project list

## v0.21.0 - 2026-03-08

### New Features

- **Firebase cloud persistence**: Optional cloud sync via Firebase Firestore — app continues to work in local-only mode (localStorage) when Firebase environment variables are not configured
- **Google & Microsoft sign-in**: OAuth popup authentication via Firebase Auth with sign-in buttons in the header
- **User menu**: Header dropdown showing avatar, display name, email, current storage mode, and sign-out button
- **Storage mode switching**: Local/Cloud toggle in Settings with one-way migration that uploads local projects to Firestore with collision detection
- **Project sharing**: Share individual projects with other users by email with owner/editor/viewer roles (cloud mode only)

### Architecture

- **Sync bus pattern** (`src/shared/firebase/sync-bus.ts`): Typed event emitter decoupling Zustand store mutations from async Firestore writes — no-op when no listeners (local mode)
- **Monolithic Firestore documents**: Each project is a single document with denormalized sprints (converter layer translates between flat Zustand array and per-project embedded sprints)
- **Conditional Firebase initialization** (`src/shared/firebase/config.ts`): `isFirebaseAvailable` feature flag gates all cloud code — zero Firebase execution without env vars
- **Echo prevention**: `hasPendingWrites` check on `onSnapshot` to skip local echoes; `_isCloudUpdate` transient flag prevents sync bus re-emission during cloud updates
- **Provider hierarchy**: `AuthProvider` → `StorageProvider` → `AppShell` — auth resolves first, then cloud sync activates based on storage mode
- **500ms debounced Firestore saves** with `beforeunload` flush for pending writes
- **Firestore security rules** (`firestore.rules`): Owner/editor/viewer access control with `diff()`-based ownership protection on updates

### Collections

- `spertforecaster_projects` — Project documents with embedded sprints, owner field, members map
- `spertforecaster_settings` — Per-user settings (keyed by Firebase UID)
- `spertforecaster_profiles` — User profiles (display name, email) readable by all authenticated users

### Data Provenance (Cloud Mode)

- `_originRef` and `_changeLog` become per-project (copied during local-to-cloud migration)
- `_storageRef` uses Firebase UID in cloud mode (workspace ID in local mode)
- Export attribution preserved: exported files include correct provenance regardless of storage mode

### Test Coverage

- 561 tests passing (was 541): added 20 tests for Firestore sanitizers, sync bus, and converter round-trips

## v0.20.2 - 2026-03-07

### Changes

- **App renamed** — Shortened app name from "SPERT® Release Forecaster" to "SPERT® Forecaster" across header, About page, browser tab title, changelog, and back-link on changelog page

## v0.20.1 - 2026-03-04

### Changes

- **App renamed** — App is now "SPERT® Release Forecaster" across the homepage header, About page, browser tab title, changelog, and report footer, reflecting SPERT's expansion into a suite of web apps for agile project management

## v0.20.0 - 2026-02-19

### New Features

- **Export attribution** — New section in Settings for attaching name and identifier to JSON exports for team workflow traceability
- **Workspace reconciliation tokens** — Exports include `_originRef` and `_storageRef` for cross-session data provenance tracking and localStorage hydration recovery
- **Export pipeline diagnostics** — Dataset maintains a lightweight `_changeLog` of structural operations for client-side telemetry

### Technical

- New localStorage key `spert-workspace-id` for deterministic workspace binding
- `_originRef` set on first structural operation, preserved across imports for data lineage
- `_storageRef` injected at export time from workspace token
- `appendChangeLogEntry()` utility with 500-entry cap
- Audit trail logging for structural mutations (add/delete projects, sprints, adjustments, milestones)
- Import preserves `_originRef` and `_changeLog` from source data for provenance chain continuity

### Test Coverage

- 541 tests passing (was 514): added 7 tests for workspace identity and changelog utilities, 20 tests for workspace provenance in project store (origin ref, changelog, export, import, merge-import)

## v0.19.1 - 2026-02-15

### Bug Fixes

- **Import clears session state**: Both full-replace and merge imports now reset `viewingProjectId`, `forecastInputs`, and `burnUpConfigs` to prevent stale UI state referencing deleted projects

### Housekeeping

- Removed dead code: `parseDate()` and `daysBetween()` from `dates.ts` — both were unused and had timezone bugs (missing `T00:00:00` suffix unlike every other date function in the file)

### Test Coverage

- 514 tests passing (was 447): added 72 dedicated edge-case tests for import-validation (milestones, dates, boundaries, sprint fields)
- Milestone validation: backlogSize boundaries (0, negative, > 999999), missing color, non-boolean showOnChart, > 10 milestones, duplicate IDs
- Date validation: auto-corrected dates (Feb 30), invalid leap year (2025-02-29), non-YYYY-MM-DD formats
- Sprint validation: sprintNumber boundaries (0, 10001), fractional sprintNumber, doneValue/backlogAtSprintEnd ranges
- Top-level structure: null/primitive input, missing arrays, source field

## v0.19.0 - 2026-02-15

### New Features

- **Import from SPERT Story Map**: Importing a Story Map export (`source: "spert-story-map"`) triggers a merge flow instead of a full replace. Projects are matched by name (case-insensitive); milestones are replaced with the Story Map's release breakdown, new sprints are added without overwriting existing ones, and productivity adjustments are preserved. A confirmation dialog summarizes what will be updated or added before proceeding.
- **Import confirmation dialog**: Native Forecaster imports now show a "Replace All Data" warning before overwriting localStorage, advising users to export first. Previously, importing replaced all data silently with no confirmation.

### Architecture

- **Merge-import module** (`src/shared/state/merge-import.ts`): Pure functions for Story Map format detection (`isStoryMapExport`), merge plan building (`buildMergePlan`), and plan application (`applyMergePlan`). Fully testable with no store dependencies.
- **MergeImportDialog** (`src/shared/components/MergeImportDialog.tsx`): Accessible merge confirmation dialog following ConfirmDialog patterns (focus trap, Escape, ARIA, body scroll lock)

### Test Coverage

- 447 tests passing (was 421): added 26 tests for merge-import logic (detection, name matching, sprint overlap counting, milestone replacement, data preservation)

## v0.18.0 - 2026-02-10

### New Features

- **Shareable Forecast Report**: Generate Report icon (next to CSV export and copy-image) opens a popover to generate a print-friendly HTML report in a new browser tab. Expanded charts (burn-up, CDF, histogram) are included automatically; a checkbox controls whether Forecast Results is included. Collapse any chart to exclude it. Use Cmd+P / Ctrl+P to save as PDF.
- **Consolidated action icons**: Copy-image, Generate Report, and Export CSV icons now appear together on the Forecast Results heading row

### Bug Fixes

- **Milestone filtering in results**: Forecast Results table and Forecast Summary now only show milestones where "Show on Chart" is checked, matching the existing behavior of the Burn-Up Chart and Custom Percentile selector. Previously, unchecked milestones showed misleading dates when the backlog input didn't account for their scope.
- **Chart toolbar milestone dropdown** (PR #47): CDF and histogram milestone dropdowns now filter by `showOnChart`, matching burn-up chart behavior. Auto-corrects selected milestone if it becomes hidden.
- **Burn-up chart toolbar layout** (PR #48): All controls (distribution, Show scope, 3 forecast lines, Text size, copy icon) fit on a single row. Label inputs narrowed to 88px, gap tightened. CopyImageButton moved from absolute overlay into the toolbar row.

### Test Coverage

- 421 tests passing (was 404): added 17 tests for report HTML generation and XSS escaping

## v0.17.4 - 2026-02-10

### Enhancements

- **Header theme toggle**: sun/moon/monitor icon in the top-right corner cycles through Light, Dark, and System themes without navigating to Settings
- Icon shows the next theme you'll switch to on click (moon when light, monitor when dark, sun when system)

### Housekeeping

- Removed 7 accidental duplicate files (`* 2.tsx` / `* 2.ts`) from the worktree

## v0.17.3 - 2026-02-10

### Enhancements

- **Collapsible Forecast Results**: disclosure triangle on the "Forecast Results" heading to expand/collapse the results table
- **User-selectable confidence percentiles**: P10–P90 toggle chips replace the fixed P50–P90 columns — default selection: P10/P20/P50/P80/P90
- **Dual Custom Percentile sliders**: two independent sliders with their own finish-date cards for quick confidence interval lookups
- Default percentile selections and both slider defaults are configurable in Settings and persist across sessions

### Test Coverage

- 404 tests passing (was 398)

## v0.17.2 - 2026-02-09

### UX

- **Milestone list stays visible during add/edit**: clicking "+ Add Milestone" or Edit no longer hides existing milestones — the form appears below the list so users retain full context
- **Auto-focus on form open**: Name field auto-focuses when adding or editing milestones and productivity adjustments
- Both improvements also apply to Productivity Adjustments (shared `CollapsibleCrudPanel`)

### Infrastructure

- **Single-source changelog**: `/changelog` page now parses `CHANGELOG.md` at build time instead of maintaining a separate hardcoded array — one file to update, no more drift
- Added `parseChangelog()` utility with 8 unit tests for markdown parsing
- Restored 3 missing version entries (v0.10.0, v0.11.0, v0.12.0) and enriched detail for v0.14.0–v0.17.0 that were lost during consolidation

### Test Coverage

- 398 tests passing (was 390)

## v0.17.1 - 2026-02-09

### Bug Fixes

- **Burn-up chart milestone data**: burn-up chart now uses overall simulation data instead of per-milestone data, so selecting a milestone in the Custom Percentile dropdown no longer corrupts forecast lines
- **Milestone dropdown index sync**: selecting the first visible milestone in Custom Percentile now shows correct results (auto-corrects stale index when milestones are filtered)
- **Burn-up scope line**: scope line no longer capped to milestone threshold when backlog exceeds it
- **Productivity adjustment date display**: restored year in date range display while keeping compact font

### Enhancements

- **Preset color swatches**: milestone color picker now shows 5 quick-pick swatches alongside the full custom color picker
- **Milestone dropdown filtering**: Custom Percentile dropdown only shows milestones checked for chart display
- **Milestone drag reorder**: milestones can be reordered via drag handles in the milestone list
- **Forecast summary sentence**: reordered to lead with distribution type ("Using the X distribution, there is a Y% chance...")
- **Burn-up chart sliders**: percentile sliders now step by 5 (range P5-P95) for easier control
- **Productivity end date auto-seed**: end date auto-adjusts to start + 1 day when creating/editing adjustments
- **Productivity form layout**: Name field shrunk, Memo field expanded for better space utilization
- **About page**: expanded SPERT description with full context on PERT origins and modern approach

### Decoupling

- **Backlog independence**: backlog field is fully decoupled from milestones — always editable, never auto-overridden by milestone totals

### Refactoring

- Introduced `overallSimulationData` state to separate burn-up chart data from per-milestone CDF/histogram data
- Removed dead `milestoneTotal` from `useForecastInputs` (leftover from backlog/milestone coupling)
- Hoisted duplicate `escCsv` helper to module scope in `export-csv.ts`
- Extracted milestone visibility filtering with `originalIndex` mapping for correct simulation data lookup

### Test Coverage

- Added test for CSV export with per-milestone data (`PER-MILESTONE PERCENTILE RESULTS` section)
- Added float-parsing edge cases for scope growth custom input
- Added sentence-order assertion for forecast summary text
- 390 tests passing (was 363)

## v0.17.0 - 2026-02-07

### Features

- **Subjective Forecasting (Cold-Start Mode)**: Teams with no sprint history can now produce probabilistic forecasts using a velocity estimate and variability level
- Forecast mode toggle: pill-style switch between History and Subjective modes
- Auto-detects mode based on sprint count (5+ sprints → History, otherwise Subjective)
- CV elicitation UI: 6 radio buttons (Very Low to Extreme) with dynamic velocity range labels
- Two new probability distributions: Triangular and Uniform
- Mode-aware results tables: Subjective shows T-Normal, Lognormal, Triangular, Uniform; History shows T-Normal, Lognormal, Gamma, Bootstrap
- All 6 distributions available in burn-up chart distribution selector regardless of mode
- CDF, histogram, and burn-up charts render mode-appropriate distributions
- CSV export includes forecast mode metadata and mode-appropriate distribution columns

### Volatility Adjuster (History Mode)

- **Opt-in volatility adjustment** for History mode: adjust the calculated standard deviation with human-readable multipliers
- 4 radio options: Less volatile (0.75x), Match history (1.0x), Slightly more volatile (1.25x), Much more volatile (1.5x)
- Each option shows a rounded velocity range preview (e.g., "45–95") using the existing `roundRange()` function
- Inline toggle link ("Adjust" / "Close") in the Std Dev helper text — zero layout disruption
- Std Dev field becomes read-only when adjuster is active; reverts to editable when closed
- Collapsing the adjuster resets multiplier to 1.0; expanding clears any manual SD override
- Amber color scheme distinguishes from Subjective mode's blue CV selector
- Volatility multiplier included in CSV export when ≠ 1.0

### Engine

- `createSampler` expanded with optional bounds parameter for Triangular/Uniform distributions
- `runAllDistributions` now sweeps all 6 distributions (was 4)
- `randomTriangular` and `randomUniform` math functions with floor-at-zero safety
- Expanded `QuadSimulationData`, `QuadCustomResults`, and milestone types for 6 distributions
- `effectiveStdDev` in History mode now applies `calculatedStdDev * volatilityMultiplier`

### UX

- Forecast summary shows data source context (sprint history, subjective judgment, or manual overrides)
- Forecast results footer shows effective mean, SD, and CV values used in simulation
- Last sprint backlog shown under Backlog field as helper text
- Subjective mode pre-seeds velocity from calculated history when available
- Tab order skips read-only fields (Start Date, milestone-controlled Backlog) and decorative elements (sparkline chart)

### Test Coverage

- New tests for `randomTriangular`, `randomUniform`, CV rounding helpers
- New tests for `VOLATILITY_OPTIONS` ordering, values, and `DEFAULT_VOLATILITY_MULTIPLIER`
- New tests for volatility multiplier in CSV export
- Updated existing tests for expanded data structures
- 363 tests passing (was 338)

## v0.16.1 - 2026-02-06

### Bug Fixes

- Burn-up chart forecast lines now target highest visible milestone instead of always extending to total project scope
- Historical scope line capped to milestone target, eliminating misleading cliff at forecast boundary

### Dark Mode

- Active tab dimmed to `blue-700` for reduced glare against dark backgrounds
- Export/Import buttons switch to ghost variants (outlined with tinted background) in dark mode
- Add Milestone/Add Adjustment buttons use matching ghost variant in dark mode
- Tab container border visible in dark mode (`gray-700`)

## v0.16.0 - 2026-02-05

### Features

- Custom scope growth override: choose between calculated rate (from sprint history) or a user-specified custom rate
- Radio button selection between Calculated and Custom when scope growth is enabled
- Custom input allows negative values for scope shrinking scenarios
- Warning indicator applies to whichever mode is active (calculated or custom)
- Summary text indicates source: "(calculated)" or "(custom)"
- Auto-recalculation supports both modes with debounced custom input

### Bug Fixes

- Fixed scope growth not affecting milestone forecasts (milestone check now uses remaining backlog instead of cumulative velocity)
- Fixed truthiness check allowing zero scope growth to be modeled correctly
- Fixed Windows scrollbar jitter with scrollbar gutter reservation
- Dynamic copyright year derived from system date

### Refactoring

- Extracted `resolveScopeGrowthPerSprint` helper (eliminates 3x duplicated IIFE)
- Introduced `SimulationContext` interface grouping related simulation parameters
- Added `runAllDistributions<T>()` generic sweep helper (adding a distribution is now a one-line change)
- Extracted `useScopeGrowthState` hook from `useForecastState` (392 → 367 LOC)
- Extracted `BurnUpChartCanvas` from `BurnUpChart` (349 → 179 + 195 LOC)
- Extracted `ScopeGrowthSection` from `ForecastForm` (298 → 228 + 115 LOC)
- `WorkerInput` extends `SimulationContext` instead of duplicating fields

### Test Coverage

- Added deterministic scope growth tests with exact sprint count assertions and sprint-by-sprint traces
- Added `resolveScopeGrowthPerSprint` unit tests (6 cases)
- 312 tests passing (was 305)

## v0.15.0 - 2026-02-04

### Settings

- New Settings tab with persisted global preferences
- Auto-recalculate toggle: re-runs forecast automatically when inputs change (after first manual run)
- Configurable simulation trial count (1,000–50,000) with default of 10,000
- Default chart font size preference (Small/Medium/Large)
- Default custom percentile preference (1–99)
- Theme selector (Light/Dark/System) moved from header to Settings

### User Experience

- Debounced auto-recalculation (400ms) for text inputs, immediate for toggles and dropdowns
- Productivity Adjustments moved below forecast form as a set-and-forget section
- Keyboard shortcut 4 → Settings, 5 → About

### Forecast Enhancements

- Forecast Summary Card with key metrics
- Velocity Sparkline on forecast form
- Velocity Trend Chart on Sprint History tab
- Scope creep forecasting with growth model

### Architecture

- New settings-store (Zustand + localStorage) separate from project data store
- Trial count now configurable via settings instead of hard-coded constant

### Refactoring

- Decomposed `useForecastState` into focused hooks (useSprintData, useForecastInputs, useChartSettings)

## v0.14.0 - 2026-02-03

### Milestones

- Ordered release milestones with per-milestone forecast dates
- Per-milestone forecast dates at all percentiles (P50, P60, P70, P80, P90)
- Single simulation with checkpoint recording preserves statistical correlation between milestones
- Milestone reference lines on burn-up chart at cumulative scope levels
- Milestone dropdown selector on CDF and histogram charts to view per-milestone distributions
- Custom percentile selector supports per-milestone results
- Remaining Backlog auto-computed from milestones when defined (read-only)

### Chart Controls

- Show/hide individual milestone lines on burn-up chart via checkbox toggle
- Show/hide scope line on burn-up chart for cleaner visualization

### Data & Export

- CSV export includes milestone definitions, per-milestone percentile results
- Import/export validation supports milestone data
- Milestone CRUD with edit, delete, and confirmation dialogs

### Refactoring

- Extracted generic `CollapsibleCrudPanel` component, reducing Milestones and Productivity Adjustments by ~200 LOC
- Extracted import validation from project-store into dedicated module (~170 LOC moved)
- Consolidated Monte Carlo simulation with sampler factory pattern (665 → 445 LOC)
- Extracted shared `ChartToolbar` component for CDF and histogram charts (~90 LOC saved)
- Removed dead code and unused props across forecast components

### Test Coverage

- Added 10 new tests for milestone-aware simulation logic (264 → 271 net, 3 removed with dead code)

## v0.13.0 - 2026-02-03

### Visualization

- Histogram chart showing probability density distribution across sprint ranges
- Confidence interval shading on burn-up chart (toggleable)
- Scope change trend analysis with sparkline on Sprint History tab

### User Experience

- Dark mode support with system preference detection and manual toggle
- Keyboard shortcuts for tab navigation (1-4) and help modal (?)

### Test Coverage

- Added 22 new tests (242 → 264 total) for histogram binning and scope analysis

## v0.12.0 - 2026-02-03

### Accessibility

- Added ARIA attributes to all collapsible sections (aria-expanded, aria-controls, aria-label)
- Replaced browser confirm dialogs with accessible modal dialog component
- Added aria-label to icon-only buttons (copy, export)
- Added keyboard support (Enter/Space) to sortable column header
- Added aria-label to sprint include/exclude checkboxes

### Security

- Strengthened import validation with numeric ranges, string length limits, and date format validation
- Added file type and size validation (10MB limit) on import
- Added Content-Security-Policy header for defense-in-depth
- Improved JSON parse error messages with specific failure context
- Added duplicate ID detection in import validation

### UI Polish

- Responsive padding and text sizing for mobile devices

### Refactoring

- Extracted CDF chart helpers to lib/cdf.ts (component now 232 LOC)
- Removed console.log statements from CopyImageButton

### Test Coverage

- Added 5 new validation tests (237 → 242 total)

## v0.11.0 - 2026-02-02

### Enhancements

- Toast notifications for export, import, and clipboard operations (Sonner)
- Monte Carlo simulation moved to Web Worker for non-blocking UI
- Real loading state feedback during simulation runs
- Form validation tightened with max value constraints and NaN guards

### Refactoring

- Centralized 43 hardcoded colors into shared color constants
- Added SPERT color palette to Tailwind CSS theme
- Migrated 258 inline styles to Tailwind classes across 23 components

## v0.10.0 - 2026-02-02

### Bug Fixes

- Fixed viewingProjectId not reset when deleting the viewed project
- Fixed package.json version mismatch
- Added missing viewport export for mobile rendering
- Fixed changelog date formatting to use shared utility

### Resilience

- Added import data validation with descriptive error messages
- Added clipboard API availability check before copy-to-image
- Added delete confirmations for projects, sprints, and productivity adjustments
- Added gamma distribution iteration limit to prevent infinite loops
- Added truncated normal rejection sampling fallback warning
- Added React error boundaries around all tab components
- Added HTTP security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)

### Refactoring

- Extracted ForecastTab state and logic into useForecastState hook (410 → 186 LOC)

### Test Coverage

- Added 74 new tests (151 → 225 total) covering store selectors, mutations, import validation, math edge cases, date utilities, and simulation boundaries

## v0.9.0 - 2026-02-02

### Dependencies

- Upgraded Next.js 16.1.4 → 16.1.6 (security patches for CVE-2025-55183, CVE-2025-55184)
- Upgraded React/React-DOM 19.2.3 → 19.2.4 (DoS mitigations, Server Components hardening)
- Upgraded eslint-config-next to 16.1.6
- Upgraded @types/node ^20 → ^24
- All caret-range dependencies resolved to latest stable

## v0.8.0 - 2026-01-29

### Bug Fixes

- Fixed productivity factor truncation that could silently bias forecasts when trials exceed 200 sprints
- Fixed burn-up chart crash when no forecast lines intersect scope
- Fixed CSV export not escaping newlines in adjustment names and memos
- Fixed percentile calculation for out-of-range input values

### Refactoring

- Consolidated 8 redundant trial functions into generic `runTrial()` with thin wrappers
- Removed deprecated dual-forecast API
- Extracted SprintConfig component from SprintHistoryTab (322 → 198 LOC)

### Test Coverage

- Added 62 new tests (89 → 151 total) for math, burn-up, export-csv, and monte-carlo edge cases

### Enhancements

- Console warnings for distribution parameter fallbacks
- Version mismatch logging on data import
- Orphaned session state cleaned up on project delete
- Import errors shown as dismissible inline messages instead of browser alerts

## v0.7.0 - 2026-01-27

### Burn-Up Chart

- Probabilistic burn-up chart on Forecast tab showing work completed vs total scope
- Three configurable forecast lines with customizable labels, percentiles (P1-P99), and colors
- Selectable distribution (T-Normal, Lognormal, Gamma, Bootstrap) for projections
- Copy-to-clipboard button for chart image

### Sprint History

- Optional "Backlog at End" field enables stepped scope line on burn-up chart

### User Experience

- Custom Percentile selector moved above chart sections
- Burn-up chart configuration persists per project during session

## v0.6.0 - 2026-01-27

### Productivity Adjustments

- Define periods of reduced productivity (holidays, vacations, company events) that adjust forecasted velocity
- Each adjustment has name, date range, productivity factor (0-100%), and optional memo
- Enable/disable toggle for what-if scenario analysis without deleting adjustments
- Adjustments apply weighted factors per sprint based on working days overlap
- Only enabled adjustments are used in Monte Carlo simulation and CSV export

### User Experience

- Forecast form inputs (backlog, velocity overrides) now persist when navigating between tabs
- Each project maintains its own forecast inputs independently
- Sprint cadence displayed alongside start date in forecast form
- Shortened "Remaining Backlog" label to "Backlog" for compact display

### Code Quality

- Refactored forecast types and helper functions to monte-carlo.ts for better organization
- Added comprehensive test coverage for productivity factor calculations (70 tests total)

## v0.5.0 - 2026-01-26

### Features

- "View History" button on Projects tab navigates directly to Sprint History for that project
- Sprint configuration (cadence and start date) now required before adding sprints
- Forecast results show absolute sprint numbers (completed + remaining)
- Copy-to-clipboard buttons for forecast inputs/results, CDF chart, and custom percentile

## v0.4.0 - 2026-01-25

### Visualization

- Added CDF (Cumulative Distribution Function) chart to Forecast tab
- Chart shows probability of completing backlog within X sprints for all distributions
- X-axis displays sprint count with finish dates (Mon DD format)
- Horizontal reference line marks selected custom percentile (P85 default)
- Collapsible chart panel with discreet expand/collapse triangle
- Interactive tooltips show probability and date on hover

## v0.3.0 - 2026-01-25

### User Experience

- Project selection syncs between Sprint History and Forecast tabs
- Compact sprint form with visual cues for required fields

## v0.2.0 - 2026-01-25

### Distributions

- Truncated Normal, Gamma, and Bootstrap distributions added
- Four-column forecast display with highlighting for differences

## v0.1.0 - 2026-01-24

### Initial Release

- Project management with CRUD operations
- Sprint history tracking
- Monte Carlo simulation with normal distribution
- Percentile-based forecasting (P50-P90)
- Custom percentile selector (P1-P99)
- LocalStorage persistence
