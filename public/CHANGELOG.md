# Changelog

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
