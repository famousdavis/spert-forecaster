# Architecture

SPERT® (Statistical PERT®) — Agile Release Forecasting with Monte Carlo Simulation.

## Tech Stack

- **Framework**: Next.js 16.1.6 (App Router, Turbopack)
- **Language**: TypeScript 5.9
- **UI**: React 19.2.4, Tailwind CSS 4.x, shadcn/ui
- **Charts**: Recharts 3.x
- **State**: Zustand 5.x with localStorage persistence
- **Cloud**: Firebase 12.x (optional — Firestore, Auth, Google/Microsoft OAuth)
- **Testing**: Vitest 4.x, Testing Library, jsdom
- **Linting**: ESLint 9.x (flat config) with eslint-config-next
- **Deployment**: Vercel (auto-deploy from main)

## Directory Structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page (renders AppShell)
│   └── changelog/page.tsx      # Changelog route
├── features/                   # Feature-first modules
│   ├── about/                  # About tab content
│   ├── changelog/              # Changelog page (parses CHANGELOG.md at build time)
│   ├── forecast/               # Monte Carlo simulation & charts
│   │   ├── components/         # UI: ForecastTab, charts, forms, mode toggle, ChartToolbar
│   │   │   ├── BurnUpChart.tsx           # Burn-up orchestration (config, data prep)
│   │   │   ├── BurnUpChartCanvas.tsx     # Pure Recharts burn-up rendering
│   │   │   ├── ForecastForm.tsx          # Forecast input form
│   │   │   ├── ForecastModeToggle.tsx    # History/Subjective pill-style toggle
│   │   │   ├── ResultsTable.tsx          # Percentile results table, row builders, column helpers
│   │   │   ├── SubjectiveInputs.tsx      # CV elicitation for Subjective mode
│   │   │   ├── VolatilityAdjuster.tsx    # SD multiplier radio panel for History mode
│   │   │   ├── ScopeGrowthSection.tsx    # Scope growth modeling controls
│   │   │   ├── ReportButton.tsx          # Report generation button with section selector popover
│   │   │   └── ...                       # ForecastResults, CDF, histogram, milestones, etc.
│   │   ├── hooks/              # State orchestration
│   │   │   ├── useForecastState.ts       # Top-level simulation orchestration
│   │   │   ├── useScopeGrowthState.ts    # Scope growth state + resolution
│   │   │   ├── useSprintData.ts          # Sprint statistics & dates
│   │   │   ├── useForecastInputs.ts      # Form inputs & milestone thresholds
│   │   │   ├── useChartSettings.ts       # Chart config state
│   │   │   └── useSimulationWorker.ts    # Web Worker bridge
│   │   ├── lib/                # Pure logic: monte-carlo, burn-up, export-csv, productivity
│   │   │   ├── monte-carlo.ts            # Simulation engine (SimulationContext, runAllDistributions)
│   │   │   ├── monte-carlo.worker.ts     # Web Worker entry point
│   │   │   ├── scope-growth.ts           # Scope growth resolution helper
│   │   │   ├── burn-up.ts                # Burn-up chart data calculation
│   │   │   ├── export-csv.ts             # CSV generation & download
│   │   │   ├── generate-report.ts        # Print-friendly HTML report generation
│   │   │   ├── productivity.ts           # Productivity adjustment factors
│   │   │   ├── statistics.ts             # Scope change analysis
│   │   │   └── cdf.ts                    # CDF calculation utilities
│   │   ├── constants.ts        # DEFAULT_TRIAL_COUNT, percentile bounds
│   │   └── types.ts            # Forecast-specific types
│   ├── auth/                   # Firebase auth UI (SignInButtons, UserMenu, StorageModeSection, SharingSection)
│   ├── projects/               # Projects dashboard (tiles, one dialog, archive, tile colour) and the import pipeline
│   │   ├── components/
│   │   │   ├── ProjectsTab.tsx           # Heading row + toolbar, notices, tile grid, one New/Edit Project dialog
│   │   │   ├── ProjectList.tsx           # The tile grid; drag-to-reorder by a tile's grip
│   │   │   ├── ProjectTile.tsx           # One tile: name opens Sprint History; Delete; the revealed icon row
│   │   │   ├── ProjectDialog.tsx         # New/Edit Project modal (portal, page `inert`, capture-phase Escape)
│   │   │   ├── ProjectColorControl.tsx   # Tile color button + popover (v0.50.0)
│   │   │   └── ArchiveControls.tsx       # "Show archived (N)", the all-archived line, the live region (v0.50.0)
│   │   ├── hooks/
│   │   │   ├── useImportState.ts         # Import state machine + `ingestPayload` seam
│   │   │   ├── useCrosslinkReceiver.ts   # Story Map handover receiver (postMessage)
│   │   │   ├── useProjectDialog.ts       # The dialog's open/close and where focus returns
│   │   │   └── useProjectArchive.ts      # Archive, Unarchive, "Show archived", tile colour, focus after each
│   │   └── lib/
│   │       ├── crosslinkProtocol.ts      # Pure reducer + ALLOWED_SENDER_ORIGINS
│   │       └── crosslinkLatch.ts         # Module-load capture of ?crosslink / xid
│   ├── settings/               # Global settings (simulation, chart defaults, theme)
│   └── sprint-history/         # Sprint data entry & velocity stats
├── shared/                     # Cross-feature utilities
│   ├── components/             # UI primitives (CopyImageButton, CollapsibleCrudPanel, ListRowActions, ConfirmDialog, the icon buttons, AllArchivedNotice)
│   ├── constants.ts            # APP_VERSION, APP_NAME
│   ├── firebase/               # Firebase infrastructure (config, auth, driver, converters, sync-bus, sharing, migration)
│   ├── hooks/                  # Infrastructure hooks (useDebounce, useIsClient, useStorageMode, useCloudSync)
│   ├── lib/                    # Pure utilities: math, dates, copy-image, colors, project-prefs (tile colour + archive map)
│   ├── providers/              # React context providers (AuthProvider, StorageProvider)
│   ├── state/                  # Zustand stores (project-store, settings-store, import-validation, storage) + viewed-project
│   └── types/                  # Shared types (burn-up config, project/sprint)
├── shell/                      # App layout & navigation
│   └── components/             # AppShell, TabNavigation, Footer
└── lib/                        # shadcn utility (cn function)
```

## Key Design Decisions

**Feature-first modules**: Each feature owns its components, lib, constants, and types. No cross-feature imports except through shared/.

**Vertical slices**: Features are self-contained slices. No Clean Architecture layers or ceremony.

**~300 LOC cap**: Components are kept under ~300 lines. Larger components get split (e.g., BurnUpChartCanvas from BurnUpChart, ScopeGrowthSection from ForecastForm).

**Constants in narrowest scope**: Feature constants live in feature directories. Only truly global constants live in shared/constants.ts.

**Pure simulation logic**: Monte Carlo simulation, productivity calculations, burn-up projections, and CSV export are pure functions in `lib/` directories with colocated tests. The simulation engine uses:
- **Sampler factory pattern** (`createSampler`, `createBootstrapSampler`) to decouple distribution selection from trial execution
- **`SimulationContext`** interface to group related simulation parameters (config, velocities, productivity factors, scope growth)
- **`runAllDistributions<T>()`** generic helper to sweep all six distributions (T-Normal, Lognormal, Gamma, Bootstrap, Triangular, Uniform) with a single callback

**Crosslink transport (v0.42.0)**: SPERT Story Map can hand a project directly to this app in the
same browser, replacing the JSON download/upload round trip. Story Map opens this app with
`?crosslink=storymap&xid=…` and transfers the export over `postMessage`; the wire is
`OPEN → OFFER → ACK|NACK`, keyed on `opcode` / `protocol` / `exchangeId`.

- **File import is unchanged and retained** — `postMessage` is same-browser only, so the file
  remains the cross-device path.
- **One shared seam**: `ingestPayload(content, transport)` takes both transports from `JSON.parse`
  onward, *including* `validateImportData`. The `transport` argument affects message wording only
  and never what is imported — the same payload must produce an identical outcome either way.
- **The receiver queues rather than gates.** Cloud readiness is not monotonic, so an offer arriving
  before Firestore hydration is held and applied once ready, not refused. Its hold expiry derives
  from the sender's own deadline, so the two cannot drift apart.
- **Security surface**: sender origins are allowlisted and environment-split (production never
  contains `localhost`), the sender window identity is checked against `window.opener`, and
  `Cross-Origin-Opener-Policy` must not be set — it would sever the channel the check depends on.
- **`useImportState()` is owned by `AppShell`**, not `ProjectsTab`, and passed down as one prop.
  `ProjectsTab` unmounts on tab switch and would otherwise take a held payload with it. Consequence
  on the file path too: import preview state now survives tab switches.

**Hook decomposition**: `useForecastState` orchestrates forecast lifecycle by composing focused hooks: `useSprintData` (statistics), `useForecastInputs` (form state), `useChartSettings` (chart config), `useScopeGrowthState` (scope growth state + resolution), and `useSimulationWorker` (Web Worker bridge). It maintains separate `simulationData` (swapped per milestone for CDF/histogram) and `overallSimulationData` (always total-backlog, used by burn-up chart).

**Projects dashboard (v0.49.0)**: `ProjectsTab` is a heading row with the toolbar (Export All, Import, Load Sample, New Project), the notices, a grid of tiles (`ProjectList`: one column, two from 560 px of the grid's own width, three from 860, by container query), and one New Project / Edit Project dialog that replaced the inline form above the list.

- **One dialog, rendered once at the tab, never inside a tile.** A portal's events bubble through its React ancestors, so inside a tile its fields' drag events would reach the tile's drop handlers. `ProjectDialog` portals to `document.body`, makes every other child of `body` `inert` while open, and returns focus only after removing `inert` (a browser ignores focus on an inert element; jsdom does not, so a test there passes either way). Escape is one capture-phase `keydown` listener on `document` that calls `preventDefault`: the import preview's own Escape listener skips an Escape that is already handled or that arrives while a dialog is in the page, and the dialog may already be gone by the time it looks, so without `preventDefault` one Escape would close the dialog and discard a waiting import. The dialog asks for the name, unit of measure and optional project start and finish dates; sprint cadence and the first sprint start date are set on Sprint History (`SprintConfig`).
- **The whole tile opens Sprint History through the name button's `::after`**, which covers the tile. The tile root deliberately has no click handler: every icon's click would bubble into it and navigate. Delete sits beside the name; the revealed row (Share for a cloud owner, Export, Edit, Clone, Archive, Tile color) shows on hover, on focus within the tile, while the colour popover is open, and always where the device has no hover (`REVEAL` in `dashboard-styles.ts`). An archived tile has no Archive in that row; its Unarchive sits beside the row and is always shown.

**Per-person tile colour and archive (v0.50.0)**: each person's colour and archive flag per project id live in their own settings, never on a project (`shared/lib/project-prefs.ts`; storage under Data Flow item 2), so colouring or archiving a shared project changes nothing for its other members, and an exported file carries neither. Archive, Unarchive and Tile color are therefore offered for every role and access state. An archived project leaves the Sprint History and Forecast pickers, and what those tabs and Connect AI show is the archive-aware viewed project:

- **`useViewedProject()` / `getViewedProject()`** (`shared/state/viewed-project.ts`): `viewingProjectId` if that project is unarchived, else the first unarchived project, else none. Derived and never written back, so unarchiving a project brings its selection back. It reads two stores (the projects and the selection from the project store, the archive map from the settings store), which is why it is a hook subscribing to both rather than a project-store selector; the project store's `selectViewingProjectIgnoringArchive` applies the same rule to every project and is not for screens.
- **The pickers list `useUnarchivedProjects()`.** With every project archived, Sprint History and Forecast show `AllArchivedNotice` (each keeps its own empty state for no projects at all), and the Connect AI button hides: its count is of unarchived projects, and with no viewed project a live pairing's uploaded copy is deleted.
- **On the Projects tab**, "Show archived (N)" appears while anything is archived; it is off by default, not saved, and turns itself off when N returns to 0. A click on an archived tile unarchives it and opens Sprint History.

**Reusable CRUD pattern**: `CollapsibleCrudPanel<T>` provides a generic expand/collapse panel with add/edit/delete state machine, used by Milestones and Productivity Adjustments. The list always remains visible while adding or editing — the form renders below the list to preserve context. Name fields auto-focus on form open. `ListRowActions` provides shared Edit/Delete button markup. Both MilestoneList and ProjectList support HTML5 drag-and-drop reordering, by two different mechanisms, and **the difference is correct — do not unify them.** Which mechanism is right follows from what the list draws to mark its drop target:

- **ProjectList draws a box around a whole tile.** A box surrounds a *slot*, so it promises "the dragged project will take this position". Tracking the hovered tile's index (`draggedIndex`/`dragOverIndex`, splice at that index) keeps that promise in both directions: the dragged project's new index among the shown tiles is always the hovered tile's old index. Only a tile's grip is draggable. Since v0.50.0 the grid can hide archived projects, so the splice reorders the *shown* tiles, and `reorderShown` (`shared/lib/project-prefs.ts`) hands `reorderProjects` the full list with each hidden project in its own slot: `reorderProjects` drops every project it is not given. Pinned by `ProjectList.test.tsx`, including the drag with archived tiles hidden.
- **MilestoneList draws an insertion line.** A line has no slot to sit in — it can only denote a boundary — so it must name a *gap*, which a row index cannot express. It tracks `draggedIndex`/`dropGap` via `forecast/lib/drag-reorder.ts`, resolving the pointer's position within the hovered row to the gap above or below it.

The v0.40.1 bug was a line drawn over a row-index drop: the row index cannot say above-or-below, and the splice-out shift resolved it one way going down and the other going up, so only upward drags were wrong. Moving ProjectList onto the gap model would reintroduce that shape in mirror image — downward drags would land one slot short while upward drags stayed correct.

**Single-source changelog**: `CHANGELOG.md` is the single source of truth. The `/changelog` page is a server component that reads and parses the markdown at build time via `parseChangelog()`, passing structured entries to the client `ChangelogContent` component. No hardcoded array to maintain.

**Date handling**: UTC for arithmetic (avoids DST drift), local timezone for user-facing display. Sprint finish dates always land on business days.

**Optional cloud persistence**: Firebase Firestore sync is available when `NEXT_PUBLIC_FIREBASE_*` environment variables are configured. The sync bus pattern decouples Zustand mutations from async Firestore writes. `AuthProvider` → `StorageProvider` → `AppShell` provider hierarchy resolves auth state before activating cloud sync. Zustand `persist` middleware continues writing to localStorage even in cloud mode for fast hydration — the cloud sync hook overwrites with fresh Firestore data once the snapshot arrives.

## Data Flow

1. **Projects & Sprints** are persisted in localStorage via Zustand middleware (`spert-data` key), along with workspace reconciliation tokens (`_originRef`, `_changeLog`) for data provenance tracking, and `cloudAccountId` — the account whose first cloud load last succeeded in this browser (`''` in local mode), so a different account's sync clears the stored projects before its own first load. Import detects Story Map exports (`source: "spert-story-map"`) and merges by project name instead of full-replacing
1a. **Workspace identity** persisted in separate localStorage key (`spert-workspace-id`). Used for data provenance tokens (`_originRef`, `_storageRef`) in export pipeline. `_originRef` is set on first structural mutation and preserved across imports. `_storageRef` is injected at export time from the current workspace token. `appendChangeLogEntry()` maintains a capped (500-entry) structural operation log for export pipeline diagnostics
1b. **Cloud sync** (optional): When storage mode is "cloud", the sync bus emits events on every store mutation. `useCloudSync` subscribes to these events and writes debounced updates to Firestore. Incoming `onSnapshot` updates are merged into Zustand by `mergeCloudView` (the store's project order is kept; a project with a local write not yet in the cloud view keeps the store's version; raises that arrive together are merged once) and applied via `replaceProjectsFromCloud`/`replaceSettingsFromCloud` with echo prevention (`_isCloudUpdate` flag). Until the first cloud load succeeds, no project write is sent and the project tabs show a loading, waiting or error panel. Project order is kept per device: reordering writes nothing to the cloud. Each project is a monolithic Firestore document with denormalized sprints. Sharing uses owner/members model with editor/viewer roles. Each project's access (owner, editor, viewer, or `not-in-cloud` for a stored project no cloud view of this account contains) is derived from every cloud view into a transient map, and an import writes only the ids it saved and deletes only the ids it removed that the cloud view holds. Controls that would change a project the user cannot edit (a viewer's, or a `not-in-cloud` one) are disabled with a reason, and the store refuses the same 13 mutations with a message; an add or edit form is tied to the project it was opened for, and closes, saving nothing, if that project leaves the list.
2. **Global settings** (trial count, auto-recalc, chart defaults, results percentile selection, custom percentile defaults, theme, export attribution) persisted separately (`spert-settings` key). The same store holds `projectPrefs` (v0.50.0): this person's tile colour and archive flag, keyed by project id, sanitised on rehydrate by the store's `persist` `merge`, which keeps every other setting as stored. In cloud mode it is a field of the person's own settings document (`spertforecaster_settings/{uid}`), outside `SETTINGS_MERGE_FIELDS`, written entry by entry on its own `prefs:save` event: one `setDoc` whose `mergeFields` mask has one `FieldPath` per changed (project id, field), with `deleteField()` to clear (`saveProjectPrefs` in `firestore-driver.ts`), never through `sanitizeForFirestore` or `buildMergeWrite`, which would store the sentinel as data or drop the nested paths. Sign-out and an account change clear the map; the switches from cloud to local keep it
3. **Forecast inputs** (backlog, velocity overrides, forecast mode, CV selection, volatility multiplier) are session-only state per project
3a. **Results table percentiles** (P10–P90 toggle chips) and **dual custom percentile sliders** are session-only state initialized from settings defaults. Dynamic percentile computation uses `calculatePercentileResult()` on-the-fly from sorted simulation arrays — no pre-computed `PercentileResults` needed
4. **Monte Carlo simulation** runs in a Web Worker with configurable trial count (default 10,000) across six distributions (T-Normal, Lognormal, Gamma, Bootstrap, Triangular, Uniform); History mode displays five (T-Normal, Lognormal, Gamma, Triangular, Bootstrap), Subjective mode displays five (T-Normal, Lognormal, Gamma, Triangular, Uniform)
5. **Scope growth modeling** resolves per-sprint scope injection from calculated or custom rates via `resolveScopeGrowthPerSprint()`
6. **Productivity adjustments** modify velocity per sprint based on date-range overlap
7. **Milestone forecasts** use cumulative thresholds with remaining-backlog checks, correctly accounting for scope growth. Backlog is independent of milestones (never auto-overridden). The Custom Percentile dropdown filters to chart-visible milestones, mapping `originalIndex` for correct simulation data lookup
8. **Auto-recalculation** (when enabled) debounces text inputs at 400ms, triggers immediately for toggles/dropdowns
9. **Charts** (CDF, burn-up, histogram) render from simulation results using Recharts

## Testing

Tests are colocated as `*.test.ts` files alongside source. Pure logic in `lib/` directories has the highest coverage priority. Deterministic tests (stdDev=0) verify exact sprint counts for scope growth and milestone scenarios. Run with `npm test`.
