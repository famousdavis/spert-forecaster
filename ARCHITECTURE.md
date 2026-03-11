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
│   ├── projects/               # Project CRUD & reordering
│   ├── settings/               # Global settings (simulation, chart defaults, theme)
│   └── sprint-history/         # Sprint data entry & velocity stats
├── shared/                     # Cross-feature utilities
│   ├── components/             # UI primitives (CopyImageButton, CollapsibleCrudPanel, ListRowActions, MergeImportDialog)
│   ├── constants.ts            # APP_VERSION, APP_NAME
│   ├── firebase/               # Firebase infrastructure (config, auth, driver, converters, sync-bus, sharing, migration)
│   ├── hooks/                  # Infrastructure hooks (useDebounce, useIsClient, useStorageMode, useCloudSync)
│   ├── lib/                    # Pure utilities: math, dates, copy-image, colors
│   ├── providers/              # React context providers (AuthProvider, StorageProvider)
│   ├── state/                  # Zustand stores (project-store, settings-store, import-validation, merge-import, storage)
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

**Hook decomposition**: `useForecastState` orchestrates forecast lifecycle by composing focused hooks: `useSprintData` (statistics), `useForecastInputs` (form state), `useChartSettings` (chart config), `useScopeGrowthState` (scope growth state + resolution), and `useSimulationWorker` (Web Worker bridge). It maintains separate `simulationData` (swapped per milestone for CDF/histogram) and `overallSimulationData` (always total-backlog, used by burn-up chart).

**Reusable CRUD pattern**: `CollapsibleCrudPanel<T>` provides a generic expand/collapse panel with add/edit/delete state machine, used by Milestones and Productivity Adjustments. The list always remains visible while adding or editing — the form renders below the list to preserve context. Name fields auto-focus on form open. `ListRowActions` provides shared Edit/Delete button markup. Both MilestoneList and ProjectList support HTML5 drag-and-drop reordering with the same pattern (draggedIndex/dragOverIndex state, splice-based reorder).

**Single-source changelog**: `CHANGELOG.md` is the single source of truth. The `/changelog` page is a server component that reads and parses the markdown at build time via `parseChangelog()`, passing structured entries to the client `ChangelogContent` component. No hardcoded array to maintain.

**Date handling**: UTC for arithmetic (avoids DST drift), local timezone for user-facing display. Sprint finish dates always land on business days.

**Optional cloud persistence**: Firebase Firestore sync is available when `NEXT_PUBLIC_FIREBASE_*` environment variables are configured. The sync bus pattern decouples Zustand mutations from async Firestore writes. `AuthProvider` → `StorageProvider` → `AppShell` provider hierarchy resolves auth state before activating cloud sync. Zustand `persist` middleware continues writing to localStorage even in cloud mode for fast hydration — the cloud sync hook overwrites with fresh Firestore data once the snapshot arrives.

## Data Flow

1. **Projects & Sprints** are persisted in localStorage via Zustand middleware (`spert-data` key), along with workspace reconciliation tokens (`_originRef`, `_changeLog`) for data provenance tracking. Import detects Story Map exports (`source: "spert-story-map"`) and merges by project name instead of full-replacing
1a. **Workspace identity** persisted in separate localStorage key (`spert-workspace-id`). Used for data provenance tokens (`_originRef`, `_storageRef`) in export pipeline. `_originRef` is set on first structural mutation and preserved across imports. `_storageRef` is injected at export time from the current workspace token. `appendChangeLogEntry()` maintains a capped (500-entry) structural operation log for export pipeline diagnostics
1b. **Cloud sync** (optional): When storage mode is "cloud", the sync bus emits events on every store mutation. `useCloudSync` subscribes to these events and writes debounced updates to Firestore. Incoming `onSnapshot` updates are pushed to Zustand via `replaceProjectsFromCloud`/`replaceSettingsFromCloud` with echo prevention (`hasPendingWrites` + `_isCloudUpdate` flag). Each project is a monolithic Firestore document with denormalized sprints. Sharing uses owner/members model with editor/viewer roles.
2. **Global settings** (trial count, auto-recalc, chart defaults, results percentile selection, custom percentile defaults, theme, export attribution) persisted separately (`spert-settings` key)
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
