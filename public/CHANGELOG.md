# Changelog

## v0.33.4 - 2026-05-18

Fixes a backup/restore-blocking bug for any project containing a completed milestone, including the sample project itself. Before v0.33.4, loading the sample project, exporting it, deleting it, and re-importing the exported file failed with *"Project 0, milestone at index 0 has invalid backlogSize (must be > 0 and <= 999999)."* The same failure affected every user-created project that contained a milestone the user had marked completed — round-tripping such a project through Export All / Import was silently broken. Two days before NCCI train-the-trainer week, with the sample project as the headline onboarding artifact, this needed to ship.

### Fixed

- **Import validator now accepts `backlogSize === 0` as the "completed milestone" sentinel.** [src/shared/state/import-validation.ts:211](src/shared/state/import-validation.ts:211) previously called `isValidNumber(m.backlogSize, 0.01, MAX_NUMERIC_VALUE)`, which rejected any value below `0.01` — including the exact value `0` that the v0.31.2 user-maintained milestone model uses to mean *"this milestone has been completed."* The floor is now `0`, so completed milestones survive `JSON.stringify` → file → `JSON.parse` → `validateImportData`. The negative-value rejection still works (`isValidNumber` uses a `>=` comparison, so `min = 0` accepts `0` while still excluding `-5`, `NaN`, and non-numbers), and the upper bound of `999999` is unchanged. The error-message text was also corrected from *"must be > 0"* to *"must be >= 0"* so users editing JSON by hand aren't pointed at the wrong bound.
- **`MilestoneForm` lets the user submit `0` as the Remaining Work value, restoring UI parity with the domain model.** Two contradictions on the same form: [src/features/forecast/components/MilestoneForm.tsx:47](src/features/forecast/components/MilestoneForm.tsx:47) required `parsedBacklog > 0` for the Save button to enable, and [src/features/forecast/components/MilestoneForm.tsx:96](src/features/forecast/components/MilestoneForm.tsx:96) enforced `min="0.01"` on the number input. Both flipped to `>= 0` / `min="0"`. Behavioral consequence the user can now actually use: typing `0` into Remaining Work marks the milestone completed, and the italic "completed" rendering introduced in v0.31.2 is finally reachable through the UI rather than only through the sample-project seeder. Sharp edge fixed: previously, opening the seeded "MVP Release" milestone for editing initialized the form with `backlogSize: '0'` and was *immediately invalid* — users couldn't rename it or change its color without first bumping the value above 0 (a phantom edit). That's gone.

### Internal

- **`import-validation.test.ts` flips the regression-guard polarity.** The existing *"rejects backlogSize of 0"* test ([line 285](src/shared/state/import-validation.test.ts:285)) becomes *"accepts backlogSize of 0 (the 'completed milestone' sentinel)"* and asserts `.toBe(true)` instead of `.toThrow('invalid backlogSize')`. A sibling boundary test *"accepts backlogSize at boundary 0 (lower bound, completed milestone)"* is added next to the existing *"accepts backlogSize at boundary 0.01"* — two adjacent acceptance assertions make the new floor intentional and visible. The *"rejects negative backlogSize"* and *"rejects backlogSize exceeding 999999"* boundary tests are untouched: both correctness invariants survive.
- **New round-trip regression test in [src/features/projects/lib/sample-project.test.ts](src/features/projects/lib/sample-project.test.ts)** under a new `describe('sample project export → import round-trip')` block. The test loads the sample project, asserts the seeded `MVP Release` milestone exists at `backlogSize === 0`, builds a subset export via `buildProjectSubsetExport`, runs the payload through `JSON.stringify` + `JSON.parse` (to exercise the same serialization path a real file export + file import would go through), and then asserts `validateImportData(roundTripped)` does not throw. This is the exact reproduction the user reported, encoded as a unit test — if the milestone model ever shifts again, or if someone tightens the validator and forgets the sentinel, this test fails before the bug ships.
- **No new helpers, no abstraction layers, no data migration.** Existing milestones with `backlogSize > 0` continue to behave identically; the only change is widening what's accepted as valid input. Total test delta: one assertion flipped, one new boundary test, one new round-trip test (+2 tests net).
- **No Firestore-rules change.** This is an in-app validator + form bug, not a security or persistence change.

## v0.33.3 - 2026-05-18

First-touch polish on the Projects tab — the new-project form is now hidden until the user signals intent, replacing four-things-on-screen (form fields + welcome card + storage warning + page heading) with three (welcome card + storage warning + page heading). Pure UI; no schema, no math, no persistence.

### Changed

- **`ProjectForm` is hidden on first-touch until the user clicks "Create New Project."** Before v0.33.3, the new-project form rendered unconditionally above the welcome empty-state in [src/features/projects/components/ProjectsTab.tsx](src/features/projects/components/ProjectsTab.tsx) — the empty-state's "Create New Project" CTA called `projectFormRef.current?.focusNameInput()` on a form that was already visible, so the CTA was essentially a focus shortcut with no visual change. This made the first-touch experience needlessly busy: a brand-new user landed on the page seeing input fields they hadn't asked for, plus the welcome card asking them to make a choice, plus the local-storage warning notification awaiting a "Got it" dismissal. Now the form is gated on `showProjectForm = editingProject || projects.length > 0 || wantsToCreateNew || shouldFocusNewProjectForm` — meaning it's hidden in the only state where it added clutter (the genuine first-touch case) and visible everywhere else: when editing an existing project, when at least one project exists (the form is the always-on "add another" surface for populated lists), when the user just clicked the welcome CTA, or when a sibling tab's empty-state CTA is routing a focus request here.
- **In-tab and cross-tab "Create New Project" paths unified onto the same focus mechanism.** The in-tab welcome CTA previously called `projectFormRef.current?.focusNameInput()` directly; the cross-tab path from the Forecast-tab empty-state set the `shouldFocusNewProjectForm` Zustand flag and let an effect handle it. v0.33.3 collapses both onto the flag-based path — the in-tab CTA is now one line, `setShouldFocusNewProjectForm(true)`, and the existing effect handles three things: (1) flip `wantsToCreateNew` so the form stays mounted past the flag reset, (2) call `focusNameInput()` on the now-mounted form, and (3) reset the flag so subsequent renders don't re-focus. Single pipeline instead of two parallel ones; the cross-tab path is unchanged from the user's perspective.

### Internal

- **Four new tests in [src/features/projects/components/ProjectsTab.test.tsx](src/features/projects/components/ProjectsTab.test.tsx)** assert the gate's four branches: form is hidden on first-touch (zero projects, no edit, no flag); form shows after clicking the welcome CTA via `fireEvent.click`; form shows when `shouldFocusNewProjectForm` is set on mount (the cross-tab handoff scenario); and form shows when at least one project exists (always-visible-on-populated). All four use `screen.getByLabelText('Project Name')` / `queryByLabelText` to assert form presence — `<label htmlFor="name">Project Name</label>` already lives in `ProjectForm.tsx:153`, so no test-only attributes were added.
- **Existing tests unaffected.** The toolbar tests (Import, Export All, Load Sample, hidden file input) all touch only the toolbar div, which lives outside `ProjectForm`. The Forecast-tab cross-tab handoff path is verified indirectly by the "shouldFocusNewProjectForm flag is set on mount" test — same observable behavior, simpler unit-test scope than a full multi-tab integration test.
- **`handleFormSubmit` and `handleFormCancel` also clear `wantsToCreateNew`** so the flag is always in a clean state after a form transaction. Submit doesn't strictly need it (a successful add makes `projects.length > 0` and the gate stays open anyway), but resetting both pathways keeps the state machine boring. Cancel from a blank first-touch returns the user to the welcome view — they get a "back out" path if they clicked Create New Project by mistake.
- **No version bump on dependencies, no Firestore touch, no settings-store change.** ~30 lines added to one component plus tests.

## v0.33.2 - 2026-05-18

Makes the sample project re-loadable at any time. Before v0.33.2, the "Load Sample Project" button lived only inside the empty-state placeholder, which itself only rendered when the user had zero projects — so once the sample was loaded (or any project at all created), the affordance disappeared and the seeder's name-idempotency guard further prevented re-triggering even if a hand-rolled call sneaked through. Trainees who modified the seeded sample and wanted a fresh comparison copy had no path back short of deleting every project in their workspace.

### Added

- **Persistent "Load Sample Project" button in the Projects-tab toolbar** ([src/features/projects/components/ProjectsTab.tsx](src/features/projects/components/ProjectsTab.tsx)). Sits as a peer to "Export All" and "Import" — gated on `projects.length > 0` so it doesn't double up with the empty-state's twin-CTA when zero projects exist (the empty-state remains the friendlier first-touch surface for true cold starts). The button uses a purple sun/sparkle icon and reuses the existing `handleLoadSample` callback that already drives the empty-state CTA, so the entry point is new but the underlying invocation path is the same code that has shipped since v0.31.1. Mirrors the pattern in SPERT Story Map's product-list toolbar, where Load Sample is a permanent peer of New / Import / Export rather than gated on emptiness.

### Changed

- **`loadSampleProject` switches from "no-op on name collision" to "auto-rename with numeric `(N)` suffix"** in [src/features/projects/lib/sample-project.ts](src/features/projects/lib/sample-project.ts). The original v0.31.1 design used the project name as an idempotency key — if a project named `"Sample: Mobile App Launch"` already existed (regardless of whether the seeder or the user created it), the second call no-op'd and toasted *"A project named ... already exists."* That worked when the only entry point was the empty-state CTA (which disappeared on first project creation, so the only way to re-trigger was a double-click race). With v0.33.2's persistent toolbar button making re-loads explicit, idempotency-as-no-op is wrong — the user clicking the button *wants* a new copy, not a silent rejection. The new strategy walks `(2)`, `(3)`, ... until an unused name is found and creates the new project under that name. The existing project (whatever its content) is never touched. Toast on success now interpolates the actual chosen name, so users can see at a glance whether they got the canonical name or a suffixed duplicate.
- **`generateUniqueProjectName(baseName, existingNames)` extracted as a named export** for direct unit testing. Pure function — takes a `ReadonlySet<string>` of existing names and returns either the unmodified base or the first available `${base} (N)` form. Tested in isolation with five cases covering base-free, "(2)" walk, "(3)" walk, gap-handling when only `(3)` is taken (base is still preferred), and gap-handling when `(2)` and `(4)` are taken but `(3)` is free (walker finds the lowest available).

### Internal

- **Three rewrites in [src/features/projects/lib/sample-project.test.ts](src/features/projects/lib/sample-project.test.ts)** flip the idempotency-era expectations: *"is idempotent against double-click: the second call no-ops"* becomes *"appends '(2)' on a second call"*; *"no-ops when a project with the sample name already exists (any origin)"* becomes *"uses '(2)' when a user-created project occupies the canonical sample name"* and additionally asserts the user's project is untouched. A new *"appends '(3)' when both the base name and '(2)' already exist"* test exercises the walker advancing two steps. A new `describe('generateUniqueProjectName')` block adds five pure-function tests against the extracted helper.
- **Two new assertions in [src/features/projects/components/ProjectsTab.test.tsx](src/features/projects/components/ProjectsTab.test.tsx)** mirror the existing Export-All gating tests: *"hides Load Sample toolbar button when projects array is empty"* and *"shows Load Sample toolbar button when at least one project exists"*. The Forecast-tab and Projects-tab empty-state CTAs remain unchanged — they continue to render only when `projects.length === 0`.
- **File-header comment in `sample-project.ts` updated** to record the v0.33.2 strategy change (idempotency → auto-rename) and the reason — preserved as institutional context for the next contributor reading the file cold.
- **No schema, no persistence, no math, no Firestore change.** Pure UI plus seeder-logic refinement.

## v0.33.1 - 2026-05-18

Moves Lognormal to the first position across every distribution-ordered surface in the app. Single-line code change in two source files plus the corresponding test-fixture flip. No math, schema, or persistence change.

### Changed

- **Lognormal is now the first distribution everywhere the order is rendered.** Lognormal has been the v0.32.0 app default for three weeks (`distributionsEnabled: ['lognormal']` in [settings-store.ts:97](src/shared/state/settings-store.ts:97); `DEFAULT_BURN_UP_CONFIG.distribution: 'lognormal'`; `firestoreDocToSettings` fallback `['lognormal']`), but every surface that *listed* distributions in a fixed order still put Truncated Normal first. The v0.32.0 entry called this out explicitly: *"Reordered the keys in `DISTRIBUTION_DESCRIPTIONS` so Lognormal appears first in source — reading-order touch only; the on-screen checkbox grid still iterates `DISTRIBUTION_TYPES` from src/shared/types/burn-up.ts and so still renders Truncated Normal first."* That intentional half-measure is now resolved. The two source-of-truth ordered lists — `DISTRIBUTION_TYPES` in [src/shared/types/burn-up.ts](src/shared/types/burn-up.ts) (which iterates the Settings → "Statistical methods to show" checkbox grid and Firestore's defensive-coercion filter) and the two hardcoded mode-set arrays in `getVisibleDistributions` in [src/features/forecast/types.ts](src/features/forecast/types.ts) (which drives the Forecast Results table column order, the Deadline Probability panel column order, the Cumulative Probability Distribution chart legend order, and the Probability Distribution Histogram legend order) — all flip Lognormal into first position and Truncated Normal into second. T-Normal is intentionally second because it remains the most-common opt-in alternative under the classical PERT framing; reordering Lognormal in front of it without losing T-Normal as the natural neighbor preserves the historical hand-off for users who learned the app under v0.31.x.
- **Forecast Results blue-highlighting now means "differs from Lognormal," restoring the "differs from the default" semantic.** The blue-highlight rule in [ResultsTable.tsx:122-141](src/features/forecast/components/ResultsTable.tsx:122) compares every column past the first against `row.values[0]` (the leftmost distribution at that percentile) — Sprint cells go blue when `sprintsRequired !== base.sprintsRequired`, Date cells go blue when `finishDate !== base.finishDate`. With Truncated Normal as column 0, "blue" silently meant *"this distribution disagrees with T-Normal at this percentile"* — a comparison that stopped mapping to anything meaningful once T-Normal stopped being the default. With Lognormal as column 0, "blue" now means *"this distribution disagrees with the app's default forecast at this percentile"* — which is what users were already reading into the highlight. No code in `ResultsTable` moves; the property is restored entirely by the column reorder upstream.

### Internal

- **Five test assertions in [src/features/forecast/constants.test.ts](src/features/forecast/constants.test.ts) flip** to the new mode-set order: the two `toEqual([...])` shape assertions for subjective and history+bootstrap modes, the two `enabledDistributions` "returns mode-visible set unchanged" assertions, and the four-distribution history-without-bootstrap shape assertion. The "intersection preserves mode-set ordering" test (`'history' + hasBootstrap=true`) is rewritten so the swap is actually visible: input changes from `['bootstrap', 'truncatedNormal', 'gamma']` to `['bootstrap', 'lognormal', 'gamma']`, expected output from `['truncatedNormal', 'gamma', 'bootstrap']` to `['lognormal', 'gamma', 'bootstrap']`. The "all four common distributions are always included regardless of mode" test is order-agnostic (uses `.toContain`) and is unchanged.
- **`ResultsTable.test.ts` and `ForecastResults.test.ts` are unaffected** — both construct their column fixtures by hand (passing `[{ key: 'truncatedNormal', label: 'T-Normal' }, { key: 'lognormal', label: 'Lognormal' }]` directly to `buildDynamicPercentileRows` / `ResultsTable`) rather than going through `getVisibleDistributions`. They test that the rendering preserves whatever column order the caller passes in — a property unchanged by this PR.
- **Test count: 981 / 981 pass**, 48/48 files. Build clean, lint 0/0.

## v0.33.0 - 2026-05-17

Adds a Deadline Probability panel that inverts the existing forecast question and closes a consistency gap on the hero callout. Pure read against already-computed Monte Carlo data — no new simulations, no schema changes.

### Added

- **Deadline Probability panel on the Forecast tab** answers "given a target date, what is my probability of completing by then?" — the mathematical inverse of the existing "given a percentile, what is the date?" flow that runs through the hero callout and the Custom Percentile selector. The panel lives in [src/features/forecast/components/DeadlineProbabilityPanel.tsx](src/features/forecast/components/DeadlineProbabilityPanel.tsx), sits between Forecast Results and "Explore a custom percentile" in the post-results stack, and is collapsible (collapsed by default, matching the sibling sections). Three controls — Target Date, Scope (Entire Project or any not-yet-completed milestone), Distribution — drive a per-distribution table plus a narrative sentence that names the scope, the date, and the absolute sprint number at which the probability is computed. The probability is taken at the end of the last forecast sprint whose finish date is on or before the target date (conservative quantization — "by this date" is interpreted as "by this *sprint boundary*"). The arithmetic reads from the same `QuadSimulationData` arrays the hero callout already consumes via `cumulativeProbabilityAtSprint`; the new helpers `targetDateToSprintCount` and `calculateDeadlineProbability` live in [src/features/forecast/lib/deadline.ts](src/features/forecast/lib/deadline.ts) and total ~30 lines of pure logic with 14 unit tests covering exact-finish, mid-sprint, weekend, pre-window, beyond-MAX, empty-array, and cap-boundary cases. Sprint quantization uses binary search rather than a floor-division formula because `calculateSprintFinishDate` applies a weekend-adjustment offset via `getPrecedingBusinessDay` — the search converges in ≈10 iterations and is exact. The narrative routes through four cases (`case1`: exact match; `case2`: normal "by date X, which is before your target"; `case3`: target before forecast window; `case4`: target inside sprint 1 before any sprint completes), each with project-scope and milestone-scope renderings — six total templates. Milestone scope uses "will be reached by" and omits the unit/backlog clause to match the existing hero-callout pattern at [ForecastSummary.tsx:336-352](src/features/forecast/components/ForecastSummary.tsx:336). All probabilities are capped at 99% — *"Forecast caps probability at 99% — no completion date can be predicted with complete certainty."* — applied AFTER `Math.round` so 99.4 displays naturally as 99% with no footnote, but 99.5 (which rounds to 100) displays as 99% with the cap footnote, signaling the cap was load-bearing. A separate sprint-boundary footnote always appears for cases 1 and 2, naming the exact sprint and date at which the probability was evaluated so users can audit the quantization. Form-control hygiene is fully compliant: `useId()`-derived `id`/`name` pairs on every control (per the [ProjectsTab.tsx](src/features/projects/components/ProjectsTab.tsx) convention), visible `<label htmlFor>` associations, `aria-invalid` on the date input when the typed value fails `isValidDateRange`, `aria-live="polite"` on the narrative paragraph, `<th scope="col">` on table headers, and the standard `min={forecastStartDate}` / `max="2050-12-31"` constraints on the date picker. Target date is session-only state, hosted in `useForecastState` and cleared on project switch alongside the other forecast outputs — a deadline from project A never bleeds into project B.

### Changed

- **Hero callout `trueCdfPercent` now also caps at 99% for consistency with the new panel.** Before v0.33.0, the hero callout at [ForecastSummary.tsx:236-239](src/features/forecast/components/ForecastSummary.tsx:236) computed `Math.round(cumulativeProbabilityAtSprint(...))` with no upper bound — so on a highly-confident forecast (e.g., conservative percentile + mature project) it could read "100% chance the project will finish by …" while the new panel immediately below would read "99%" on the same input. Two adjacent forward-looking probability assertions on the same page disagreeing on the ceiling was the kind of inconsistency that erodes trust in the forecast as a whole. The hero now applies the identical `Math.min(99, Math.round(...))` cap, with an inline comment naming the rationale and the symmetry. **Important:** the cap applies *only* to forward-looking headline assertions. The CDF curve in the Cumulative Probability Distribution chart and the percentile axis on the Probability Distribution Histogram are mathematical CDF visualizations and correctly reach 100% — they are not subject to this cap and continue to render unchanged. This is a copy/display change only; no underlying simulation math moves.

### Internal

- **New shared `src/features/forecast/lib/scope.ts`** holds `PROJECT_SCOPE` and `ScopeSelection` so both `ForecastSummary` (which previously defined them locally at lines 51–53) and the new `DeadlineProbabilityPanel` consume the same sentinel without duplication. Behavior is unchanged; the local definitions in `ForecastSummary` were deleted in favor of the import. No barrel-export update needed in `src/features/forecast/index.ts` — the panel is consumed only by `ForecastTab`.
- **`useForecastState` exposes `targetDate` and `setTargetDate`** and clears the value in the existing `prevProjectIdRef` reset block, so switching projects clears the deadline cleanly alongside `results`, `simulationData`, `customResults`, and the other per-project state that already resets there.
- **`ForecastTab` wires the panel** between `ForecastResults` and the Custom Percentile section, inside the existing `{hasResults && (...)}` block. The `sprintCadenceWeeks` and other non-null project fields use the same `!` assertions already in place for the sibling components in that block.
- **Test count: ~957 / 48 files** (+~24 from `deadline.test.ts` and `DeadlineProbabilityPanel.test.tsx`). Build clean. Lint 0 errors / 0 warnings.

## v0.32.2 - 2026-05-17

### Changed

- **Lognormal distribution renamed from the abbreviated "Lognorm" to the full "Lognormal" everywhere in the UI and exports.** The compact label `'Lognorm'` was a holdover from the early dropdown/legend rendering — it saved two characters at the cost of using an abbreviation that has no established meaning outside code identifiers (e.g., `scipy.stats.lognorm`) and that disagreed with the leading word of every description string the app already used ("Lognormal — right-skewed curve always above zero…"). The full name now appears in the `DISTRIBUTION_LABELS` map at [src/shared/types/burn-up.ts:51](src/shared/types/burn-up.ts:51), which propagates through every consumer that reads the map: the Settings → "Statistical methods to show" checkbox label, the Forecast Summary's distribution dropdown and prose summary, the Forecast Results column header, the Burn-Up Config dropdown, the per-distribution PercentileSelector, and the PDF report (which inherits via the same data path). The two chart legends in the Forecast tab ([DistributionChart.tsx:208](src/features/forecast/components/DistributionChart.tsx:208) and [HistogramChart.tsx:201](src/features/forecast/components/HistogramChart.tsx:201)) hardcoded `name="Lognorm"` inline (the chart-legend pattern in those files inlines every distribution's display name rather than reading from `DISTRIBUTION_LABELS`) and have been updated to `name="Lognormal"`. The CSV export's three header rows at [src/features/forecast/lib/export-csv.ts:183, 248, 301](src/features/forecast/lib/export-csv.ts:183) — *PERCENTILE RESULTS*, *FREQUENCY DISTRIBUTION*, and *RAW TRIAL DATA* — also flip from `"Lognorm Sprints"` / `"Lognorm Count"` / `"Lognorm %"` etc. to the `"Lognormal …"` forms, keeping the on-screen label and the downloaded CSV column names consistent. T-Normal is intentionally **not** renamed: "T-Normal" is a recognized abbreviation in statistics, expanding it to "Truncated Normal" would inflate every column header by eight characters with no readability win, and unlike "Lognorm" the abbreviated form is already what a statistically-literate reader expects.

### Internal

- **Tests updated for the new label.** Three component-level test files asserted the literal string `'Lognorm'` — [ForecastSummary.test.ts:39, 58, 114](src/features/forecast/components/ForecastSummary.test.ts:39) (three assertions in the `buildSummaryText` suite that pass a distribution label and assert it appears in the prose output), [ForecastResults.test.ts:24](src/features/forecast/components/ForecastResults.test.ts:24) (column fixture), and [ResultsTable.test.ts:24](src/features/forecast/components/ResultsTable.test.ts:24) (column fixture) — all flip to `'Lognormal'`. The CSV column-count test comment at [export-csv.test.ts:153](src/features/forecast/lib/export-csv.test.ts:153) is updated for the new column name; the actual column-count assertion is unchanged because the number of columns hasn't moved. The JSDoc on `getVisibleDistributions` at [src/features/forecast/types.ts:25](src/features/forecast/types.ts:25) is also updated.

- **No data-shape change.** The internal `DistributionType` discriminant remains `'lognormal'`; only the human-readable display label changed. Existing persisted state and Firestore documents round-trip unchanged.

## v0.32.1 - 2026-05-17

### Fixed

- **Cumulative Probability Distribution and Probability Distribution Histogram chart dropdowns now hide completed milestones.** The Milestone selector on both charts in the Forecast tab previously listed every milestone with `showOnChart !== false`, including milestones the user had zeroed out (`backlogSize === 0`). Picking a completed milestone from that dropdown was not just visually noisy — it silently rendered an *incorrect* forecast: because the simulation forecasts each milestone's *cumulative* threshold and completed milestones contribute zero to the running sum (see [src/features/forecast/hooks/useForecastInputs.ts:56-66](src/features/forecast/hooks/useForecastInputs.ts:56)), selecting a completed milestone produced a chart identical to the preceding milestone's forecast under a misleading label, with no indication that the selected milestone was actually done. The filter at [src/features/forecast/components/ChartToolbar.tsx](src/features/forecast/components/ChartToolbar.tsx) now also excludes milestones where `milestoneCompletionInfo[idx]?.completed === true`, bringing the two chart dropdowns into parity with the Forecast Summary scope picker ([src/features/forecast/components/ForecastSummary.tsx:189](src/features/forecast/components/ForecastSummary.tsx:189)) and the per-milestone forecast tables in Forecast Results ([src/features/forecast/components/ForecastResults.tsx:185](src/features/forecast/components/ForecastResults.tsx:185)). All three forecast-control surfaces in the Forecast tab now treat "completed = no forecast option" uniformly. The existing auto-correct effect transparently moves the user's selection to the first visible milestone if the previously-selected one becomes invisible because of a completion edit, and the existing "(Total)" suffix on the last visible milestone remains semantically correct under filtering — completed milestones add zero to the cumulative scope, so the last visible milestone's cumulative threshold always equals the project's total remaining cumulative scope.

### Internal

- **New shared helper `computeVisibleForecastMilestones` in [src/features/forecast/lib/milestones.ts](src/features/forecast/lib/milestones.ts).** Encapsulates the two-clause filter (`showOnChart !== false` AND `!completionInfo[idx]?.completed`) that decides which milestones appear in forecast-control dropdowns. `ChartToolbar` consumes the helper; `ForecastSummary` and `ForecastResults` keep their existing inline filters for now (their inline logic is identical in spirit but is interleaved with surface-specific concerns — scope-picker labels in one, table-row construction in the other — and refactoring them to consume the shared helper is a non-goal of this patch). Seven new unit tests in [src/features/forecast/lib/milestones.test.ts](src/features/forecast/lib/milestones.test.ts) cover: all visible (none filtered), `showOnChart=false` filter, completed filter (the new behavior — with a comment naming v0.32.1 as its motivation), composition of both filters, all-completed → empty result, original-index preservation, and missing `completionInfo` defaulting to no completion filter.

- **Prop wiring**: [src/features/forecast/components/DistributionChart.tsx](src/features/forecast/components/DistributionChart.tsx) and [src/features/forecast/components/HistogramChart.tsx](src/features/forecast/components/HistogramChart.tsx) gain a new optional `milestoneCompletionInfo` prop that they pass through to `<ChartToolbar>`. [src/features/forecast/components/ForecastTab.tsx](src/features/forecast/components/ForecastTab.tsx) supplies the value from `useForecastState` to both chart components — the same `milestoneCompletionInfo` already passed to `<ForecastSummary>` and `<ForecastResults>`, so there is no new computation in the tab.

## v0.32.0 - 2026-05-17

### Changed

- **Default forecast distribution flipped from Truncated Normal to Lognormal for new installs and new projects.** Three source-level defaults move in lockstep: the Settings → "Statistical methods to show" default selection at [src/shared/state/settings-store.ts:93](src/shared/state/settings-store.ts:93) (`distributionsEnabled: ['lognormal']`), the burn-up chart's per-project default at [src/shared/types/burn-up.ts:38](src/shared/types/burn-up.ts:38) (`DEFAULT_BURN_UP_CONFIG.distribution: 'lognormal'`), and the Forecast Summary's initial dropdown selection at [src/features/forecast/components/ForecastSummary.tsx:157](src/features/forecast/components/ForecastSummary.tsx:157). The Firestore defensive coercion at [src/shared/firebase/firestore-converters.ts:117](src/shared/firebase/firestore-converters.ts:117) also moves: cloud-mode documents with a missing, empty, or fully-corrupted `distributionsEnabled` field now fall back to `['lognormal']` instead of `['truncatedNormal']`. Existing per-project distribution selections are *not* migrated — a user who picked Truncated Normal on a project in v0.31.x still sees Truncated Normal on that project in v0.32.0; the new default applies only to projects created after the upgrade and to fresh installs with no persisted Settings. Truncated Normal stays fully available from the Settings → "Statistical methods to show" checkboxes for users who want classical PERT semantics. The motivation is calibration: Truncated Normal's lower-bound truncation at zero asymmetrically biases effective mean velocity upward whenever the coefficient of variation σ/μ exceeds roughly 0.3, making forecasts on uncertain teams artificially optimistic in exactly the regime where calibration matters most. Concrete impact on the "Wildly uncertain" preset (backlog=1000, μ=100, σ=65, 10k Monte Carlo trials): under Truncated Normal, P50 lands at 10 sprints with a ≈ 67% cumulative probability of finishing by sprint 10 (the truncation lifts effective mean velocity to ≈ 108, so the median compresses); under Lognormal, the same inputs yield P50 ≈ 11 sprints and a ≈ 45% cumulative probability at sprint 10. Lognormal is naturally non-negative, preserves the specified mean exactly, and matches the empirical right-skew of sprint velocity (bad sprints are worse than good sprints are good — outages, scope surprises, sick weeks) — the more conservative and more empirically defensible answer in exactly the high-variability regime where the choice of distribution materially changes the forecast.

- **Settings → "Statistical methods to show" — Lognormal and Truncated Normal descriptions rewritten to reflect the new default.** Lognormal's one-line description now explicitly identifies it as the recommended default, mentioning right-skew matching of sprint velocity and calibration stability at high variability. Truncated Normal's description now identifies it as the classical PERT-style alternative and explicitly calls out the upward mean bias at high variability — so a user who picks Truncated Normal off the menu does so with eyes open rather than because the copy framed it as "a reasonable default." The other four descriptions (Gamma, Bootstrap, Triangular, Uniform) are unchanged from the v0.31.3 rewrite. Reordered the keys in `DISTRIBUTION_DESCRIPTIONS` so Lognormal appears first in source — reading-order touch only; the on-screen checkbox grid still iterates `DISTRIBUTION_TYPES` from [src/shared/types/burn-up.ts](src/shared/types/burn-up.ts) and so still renders Truncated Normal first.

### Internal

- **Legacy `runSimulation` and `runForecast` defaults in [src/features/forecast/lib/monte-carlo.ts](src/features/forecast/lib/monte-carlo.ts) flipped to Lognormal for consistency.** Neither entry point sits on the live app pipeline (the production forecast goes through `runQuadrupleForecast` via the simulation worker), but both are public exports whose hardcoded `'truncatedNormal'` defaults would read as stale once the app-level default is Lognormal. The destructuring default at line 246 (`runSimulation`'s `distributionType`) and the hardcoded value at line 343 (`runForecast`'s wrapper call) both move to `'lognormal'`; the JSDoc on `runForecast` is updated from "backward compatible - uses truncated normal distribution" to identify it as a convenience wrapper around the v0.32.0 app default and to point callers at `runQuadrupleForecast` for the full distribution sweep. Caller audit confirmed these defaults are reached only from shape-property tests in [monte-carlo.test.ts](src/features/forecast/lib/monte-carlo.test.ts) (sorted output, monotonic percentile ordering, defined fields) — no test asserts distribution-specific behavior at these entry points, so the change is mechanically safe.

- **High-σ directionality regression test added at [src/features/forecast/lib/monte-carlo.test.ts](src/features/forecast/lib/monte-carlo.test.ts).** Asserts that at the "Wildly uncertain" preset (backlog=1000, μ=100, σ=65, trialCount=10000) Lognormal P50 sprintsRequired strictly exceeds Truncated Normal P50, with absolute-magnitude sanity guards on each (T-Normal 8–11, Lognormal 9–13 — wide enough to absorb Monte Carlo noise but narrow enough that a directional inversion would still trip the test). Locks in the calibration property motivating the v0.32.0 default flip so a future sampler refactor cannot silently invert the relationship and quietly re-introduce the optimism this release was meant to remove.

- **Settings default regression test added at [src/shared/state/settings-store.test.ts](src/shared/state/settings-store.test.ts)** using `useSettingsStore.getInitialState()` to read the factory default independent of any `beforeEach` reset state. Asserts `distributionsEnabled` initializes to exactly `['lognormal']`.

- **Firestore defensive-coercion tests updated** at [src/shared/firebase/firestore-converters.test.ts](src/shared/firebase/firestore-converters.test.ts) so the four fallback assertions (missing field, empty array, non-array value, all-keys-unknown) now expect `['lognormal']`. The "filters out unknown keys" assertion (input contains valid `truncatedNormal` + `lognormal` plus an unknown) is unchanged — it tests the filter, not the fallback.

## v0.31.5 - 2026-05-16

Fixes a silent-failure bug where clicking "Run Forecast" on a freshly-created project (no sprint history yet, subjective mode) appeared to do nothing — no chart appeared, no error surfaced, no toast, no message. Centralizes the "can the forecast run?" check so the button, the auto-recalculate effect, the inline helper text, and the handler all read from a single source.

### Fixed

- **"Run Forecast" silently does nothing on a freshly-created project with no sprint history.** Reported by William creating a new project (no sprints), switching to subjective mode, entering backlog and estimated velocity, then clicking the button — nothing happened. Root cause was a drift between two prerequisite checks: `handleRunForecast` at [useForecastState.ts:190](src/features/forecast/hooks/useForecastState.ts:190) bailed silently if `selectedProject.sprintCadenceWeeks` or `selectedProject.firstSprintStartDate` was missing, but the `canRun` prop computed at [ForecastTab.tsx:226](src/features/forecast/components/ForecastTab.tsx:226) that drove the button's disabled-state only checked backlog and effective velocity — `canRun !== !canRunReally`. Result: the button stayed enabled and clickable while the handler silently exited the moment the user clicked it. The same drift affected the auto-recalculate effect at [useForecastState.ts:291](src/features/forecast/hooks/useForecastState.ts:291), which used an even thinner local copy of the check and silently called the handler on every input change — two layers of silent fail. `sprintCadenceWeeks` is intentionally *not* set on the Projects-tab creation form (see the comment at [ProjectForm.tsx:101](src/features/projects/components/ProjectForm.tsx:101)) — it gets set the first time the user configures sprint history, so subjective-mode users who never add sprint history hit this every time. Now: a single centralized prereq check lives in the new [src/features/forecast/lib/run-forecast-prereqs.ts](src/features/forecast/lib/run-forecast-prereqs.ts) and is shared by all four call sites (button disabled-state, handler guard, auto-recalc gate, inline helper text). Cadence-less projects now show a disabled button and the inline helper text reads *"Set sprint cadence on the Sprint History tab."* — the user discovers the cause without having to guess.

### Added

- **Inline helper text under the Run Forecast button** now surfaces the specific missing prerequisite when the button is disabled. The existing helper-text slot at [ForecastForm.tsx:338](src/features/forecast/components/ForecastForm.tsx:338) was previously hard-coded to show only *"Velocity must be > 0"* and only when both backlog had been entered AND velocity was non-positive. It now renders whichever prereq is currently missing, in priority order:
  - **Missing sprint cadence** → *"Set sprint cadence on the Sprint History tab."* (shows immediately on a freshly-created project, before the user has typed anything in the form — this is a project-level prereq that won't fix itself as the user types, so surfacing it upfront avoids the otherwise-confusing experience of filling out the whole form before discovering the blocker)
  - **Missing first-sprint start date** → *"Set the first sprint start date on the Sprint History tab."* (same surface; both project-level prereqs share the same fix location)
  - **Velocity must be > 0** → existing message, unchanged in copy and trigger condition (only fires when backlog has been entered, so it doesn't fire prematurely on an empty form)
- **New library file `src/features/forecast/lib/run-forecast-prereqs.ts`** exports `canRunForecast(inputs)` and `getRunForecastBlockedReason(inputs)`. Centralizing the check here means the four call sites (manual handler, auto-recalc effect, button-disabled prop, inline helper text) all read from the same source — they cannot drift again. The file's header comment documents the v0.31.5 drift incident so a future contributor knows why the abstraction exists rather than seeing it as ceremony.

### Internal

- **`handleRunForecast` rewritten to gate on the centralized `canRun`** instead of inlining its own prereq checks. The original five-line guard (cadence, start date, backlog, mean, std-dev) is replaced with `if (!selectedProject || !canRun) return` followed by a comment-justified type-narrowing re-check (cadence + start date) so TypeScript can narrow `number | undefined → number` at every downstream use site without affecting runtime semantics.
- **Auto-recalculate effect rewritten to gate on the same `canRun`** instead of its own stripped-down `!!debouncedBacklog && inputs.effectiveMean > 0` check. Adds `canRun` to the effect's dep array so the effect re-fires when any project-level prereq becomes satisfied (e.g., the user navigates to Sprint History, sets cadence, and returns to Forecast tab — auto-recalc fires immediately).
- **`runForecastRef.current = handleRunForecast` moved inside an effect** to satisfy the `react-hooks/refs` lint rule (in-render ref assignment was flagged as a footgun for React Compiler's render-purity analysis). Functionally equivalent — the auto-recalc effect runs after the ref-update effect on any given render, so the ref is always current when the auto-recalc fires.
- **Project-change reset effect annotated with a targeted `eslint-disable react-hooks/set-state-in-effect`** wrapping the seven `setX(null)` calls inside its `if (prev !== current)` branch. The rule's recommended alternative for "reset all state when a watched value changes" is a `key`-prop-based forced remount on a parent — too invasive for the tab-switch boundary that owns this many separate result states. The setStates are resetting-to-empty (not cascading derivations), so the cascading-renders concern the rule warns about does not apply here.
- **Test count: 942 / 46 files** (+9 from the new `run-forecast-prereqs.test.ts` covering: all-prereqs-satisfied returns null, empty form is silent, missing cadence wins priority over all other missing prereqs, missing start date is flagged when cadence is set, velocity-must-be->0 only fires when backlog has been entered, negative velocity flagged same as zero, and `canRunForecast` boolean for each missing prereq case).

## v0.31.4 - 2026-05-16

Settings layout consistency pass + Cloud Storage modal trim + bug fix on the sample project's productivity adjustment. No math, schema, or persistence changes.

### Fixed

- **Sample project's productivity adjustment had no forecast effect — latent since v0.31.1.** The seeded adjustment was placed via `addWeeks(firstSprintStartDate, 10)`, which with 8 completed sprints at 2-week cadence (= 16 weeks of history) put its date range ~6 weeks before the forecast period begins. `preCalculateSprintFactors` in [src/features/forecast/lib/productivity.ts](src/features/forecast/lib/productivity.ts) filters adjustments whose `endDate < firstForecastStart`, so the seeded adjustment was silently dropped before the Monte Carlo simulator ever saw it. Toggling it on or off produced no change in the forecast — exactly the behavior the seeded example was meant to demonstrate to new users. The previous shape-only test in `sample-project.test.ts` asserted name / factor / enabled but not position-in-forecast-period, which is why the bug shipped undetected through v0.31.1, v0.31.2, and v0.31.3. The adjustment is now placed at `addWeeks(firstSprintStartDate, 22)` — the start of forecast sprint 4 (project sprint 12, late June from the current ship date) — with `adjEnd = addDays(adjStart, 13)` so the 14-day window at factor 0 covers a full sprint's worth of working days. Toggling on shifts the overall project finish by exactly +1 sprint; toggling off restores. Beta Release (~sprint 11 in the sample) delivers before the break and is unaffected by the toggle, while GA Release and v2 Release deliver after and each shift by +1 sprint — extra pedagogical benefit at no extra code cost.
- **Sample project's productivity adjustment renamed "Spring Break" → "Summer Break".** The new calendar position (late June) is no longer literally Spring Break by US-calendar conventions; the new label matches.
- **Regression test added at [sample-project.test.ts:111](src/features/projects/lib/sample-project.test.ts:111).** Asserts (a) the seeded adjustment's `endDate >= firstForecastStart` (proves it's in the forecast period, not the past); (b) `preCalculateSprintFactors` produces a factor of `0` at the expected forecast-sprint index (3, i.e., forecast sprint 4) when the seeded adjustment is enabled; and (c) the same call returns all-`1.0` factors when no adjustments are passed. Tests forecast effect, not just shape — this class of regression cannot reappear silently.

### Changed

- **Settings — every narrow value-entry row now uses the same `Label [Control]` inline pattern with the description below.** Three dropdowns (Number of simulations in the Simulation section, Chart font size in the Chart Defaults section, Theme in the Appearance section) and two number inputs (Default custom percentile 1 and 2 in the Chart Defaults section) all moved off the prior pattern. The previous pattern was a flex row containing a label-and-description block on the left and the control marked `ml-auto flex-shrink-0` on the right — which looked balanced for wide dropdowns like "Medium" but left tiny 2-digit number inputs visually orphaned at the right edge of the row, separated from their label by a wide empty band of description text. The new pattern groups the label and control on the top line in a `flex items-center gap-3` row and renders the description below. Every narrow value-entry row in Settings now shares the same idiom; the only remaining patterns on the page are checkbox-rows (toggles) and label-on-top stacks (for wide pill/checkbox grids like "Default results table percentiles" and "Statistical methods to show").
- **Settings → Export Attribution — labels stack above their inputs.** Previously each `<label>` used the browser default `display: inline`, which put the label text immediately to the left of each input. Because "Name" (4 chars) and "Identifier" (10 chars) are different widths, the two inputs started at different x-positions — a visible misalignment. The labels now carry `block mb-1` so they sit above each input; both inputs render at the same left edge of the wide-control column. Matches the convention already used by the other wide controls on the same page ("Default results table percentiles", "Statistical methods to show").
- **Cloud Storage modal slimmed to sign-in only.** The Export Attribution section (Name + Identifier inputs) and the Notifications section ("Warn me on startup when using local storage" checkbox) have been removed from [src/features/auth/components/CloudStorageModal.tsx](src/features/auth/components/CloudStorageModal.tsx). Both still live under Settings, which remains the single place to edit them. The modal is now a focused sign-in surface — Storage mode toggle + sign-in buttons (signed out) or IdentityCard (signed in). Net change: −78 lines; the dead `useSettingsStore` destructure for the removed fields was pruned along with an unused local `inputClass` constant.

### Internal

- **Test count: 933 / 45 files** (+1 from the new Summer Break regression test). Build clean. Lint 0 errors / 0 warnings.

## v0.31.3 - 2026-05-16

Three small polish items surfaced during hands-on review of v0.31.2 on production, ahead of the NCCI train-the-trainer kickoff Monday 2026-05-18. UI defaults and copy only; no math, schema, or persistence changes.

### Changed

- **Forecast Results section now collapsed by default on the Forecast tab.** The detailed per-distribution / per-percentile results table previously rendered expanded on first mount via `useState(true)` at [ForecastResults.tsx:171](src/features/forecast/components/ForecastResults.tsx:171). It was the only collapsible section on the Forecast tab that opened expanded — every other collapsible (Custom Percentile, Burn-Up Chart, Distribution Chart, Histogram Chart, Volatility Adjuster) already defaulted to collapsed. Now consistent with those siblings: defaults to collapsed (`useState(false)`); one click on the section header expands it. The "Your forecast" hero callout above it still conveys the headline percentage and date in plain language, so a first-time user is not stranded by the table being hidden. Brings the Forecast tab visually in line with its established convention and makes the first-load surface less intimidating for the NCCI training audience.
- **Sample project's productivity adjustment renamed "Production Issues" → "Spring Break".** Friendlier first-impression framing for the seeded example; same dates (5-day window 10 weeks into the seeded timeline) and same factor (0.5) in this release. (Note: this rename was superseded later the same day in v0.31.4, which renamed it again to "Summer Break" alongside a placement bug fix — see the v0.31.4 entry for details.)
- **Settings → "Statistical methods to show" — all six distribution descriptions rewritten to a consistent `Name — shape; usage guidance` pattern.** The descriptions in `DISTRIBUTION_DESCRIPTIONS` at [src/features/settings/components/SettingsTab.tsx:36](src/features/settings/components/SettingsTab.tsx:36) had been inconsistent — some led with shape, some with use case, some referenced sibling distributions, the T-Normal entry was technically incorrect, and the Triangular entry implied user-entered three-point values that the app does not collect.
  - **Truncated Normal** — was *"Bell-curve velocity assumption; the standard PERT default."* Now *"Truncated normal — symmetric bell curve restricted to non-negative velocities; a reasonable default when sprint-to-sprint variation is roughly balanced around the average."* The previous "standard PERT default" framing was technically misleading: traditional PERT uses a Beta distribution, not a truncated normal. The new copy also explicitly expands the "T-Normal" abbreviation that appears in chart legends and table columns so first-time users can tell what they're picking.
  - **Triangular** — was *"Simple low/most-likely/high estimate, no statistical assumption."* Now *"Triangular — a simple peaked shape with hard limits at ±3 standard deviations from the mean; useful when you want a transparent, bounded forecast without long tails."* The previous "low/most-likely/high estimate" language implied the user entered three control points directly; in this app, Triangular bounds are derived as `mean ± 3·stdDev` (capped so lower never goes negative) — the user controls mean and standard deviation but not the bounds themselves. The new copy describes what the user is actually choosing.
  - **Lognormal** — was *"For teams whose velocity has occasional big-positive outliers."* Now *"Lognormal — right-skewed curve always above zero, with a long upper tail; useful when your team has occasional unusually high-throughput sprints."* Adds the shape description and clarifies the use case.
  - **Gamma** — was *"Similar shape to Lognormal but with a different tail."* Now *"Gamma — right-skewed like Lognormal but with a thinner upper tail; useful when faster sprints happen but extreme breakouts are unlikely."* The previous "different tail" was too coy to be actionable; the new copy says *thinner* and gives a concrete reason to pick Gamma over Lognormal.
  - **Bootstrap** — was *"Resamples your actual sprint history (needs 5+ sprints)."* Now *"Bootstrap — resamples directly from your actual sprint history; the most data-driven option, assuming only that future sprints will look like past ones, but needs 5+ recorded sprints."* Adds the epistemic claim (assumes only "future will resemble past") that explains why Bootstrap is qualitatively different from the parametric distributions.
  - **Uniform** — was *"All velocities equally likely; the most conservative assumption."* Now *"Uniform — every velocity in the range equally likely; the most conservative shape, useful when you have little basis to prefer any one value."* Light rewrite for cadence consistency with the other entries.

### Internal

- **Test count: 932 / 45 files** (unchanged from v0.31.2 — only an in-place assertion edit in `sample-project.test.ts`).

## v0.31.2 - 2026-05-16

v0.31.2 re-introduces the v0.31.0 + v0.31.1 work (rolled back from production via PR [#112](https://github.com/famousdavis/spert-forecaster/pull/112) / commit `5ba50a4` the morning of the same day after a surface-level review of v0.31.1 on prod surfaced multiple issues) with the corrections that emerged from hands-on review. Net result: NCCI train-the-trainer trainees opening the Forecast tab on the sample project land on an internally consistent forecast that explains itself, rather than a forecast that looks correct but reads as broken. v0.31.0 introduced the single-distribution default + Firestore round-trip + "Your forecast" hero callout; v0.31.1 added the sample project loader, the collapsible custom percentile, the help tooltips, and the "Variability" rename. v0.31.2 ships both with corrections.

### Added

- **"Load Sample Project" CTA on the Projects-tab and Forecast-tab empty states.** A new button next to "Create New Project" seeds a complete runnable example with one click: eight sprints of history with hand-chosen velocities `[25, 50, 18, 55, 22, 62, 48, 60]` (mean ~42.5, CV ~42% — realistic messy variability that produces a visible P10/P90 spread, vs. a too-tight sequence that would collapse the spread and make the forecast look hard-pinned even with the custom percentile slider); a declining backlog series ending at 460 remaining; four ordered milestones (MVP Release seeded at `backlogSize: 0` to demonstrate the completed-milestone state under the user-maintained dynamic model; Beta Release 100, GA Release 150, v2 Release 210, summing to 460); and one productivity adjustment ("Production Issues" — renamed to "Spring Break" in v0.31.3, then to "Summer Break" alongside a placement bug fix in v0.31.4). The seeder is idempotent against double-clicks via a name-guard at [src/features/projects/lib/sample-project.ts:67](src/features/projects/lib/sample-project.ts:67) — if a project with the sample's name already exists (regardless of who created it), the call returns and fires a friendly sonner toast rather than producing a duplicate. All sprint dates flow through `calculateSprintStartDate` / `calculateSprintFinishDate` so finish dates always land on business days. New users land on a working forecast immediately on first session instead of staring at empty form fields.

- **Custom percentile selector is collapsible on the Forecast tab.** Previously rendered always-expanded, contributing to the ~50-control wall on first load that first-time users found overwhelming. The chip selector now defaults to collapsed under a header reading *"Explore a custom percentile"* with the chevron pointing right; one click on the header expands the existing selector with all functionality preserved. State is local React `useState` (session-only, not persisted) and resets to collapsed on project switch or page reload. Header label rendered at [ForecastTab.tsx:320](src/features/forecast/components/ForecastTab.tsx:320).

- **"Std Dev" / "Standard Deviation" relabeled to "Variability" with a help-tooltip.** The velocity-spread input on the Forecast form ([ForecastForm.tsx:219](src/features/forecast/components/ForecastForm.tsx:219)) and the Sprint History stats panel ([VelocityStats.tsx:35](src/features/sprint-history/components/VelocityStats.tsx:35)) both previously read "Std Dev" or "Standard Deviation". They now read "Variability" with an ⓘ info chip (via the new `HelpTooltip` wrapper introduced this release) whose hover content reads *"Standard deviation — how much velocity varies sprint to sprint."* Plain-language label for the audience that doesn't read statistical jargon; the tooltip preserves the precise meaning for the audience that does. CSV export rows ([export-csv.ts:134](src/features/forecast/lib/export-csv.ts:134)) intentionally still use the technical "Velocity Std Dev" header so downstream tools that parse the export keep working unchanged.

- **History / Subjective mode tooltip on the forecast-mode toggle.** The mode toggle ([ForecastModeToggle.tsx:31](src/features/forecast/components/ForecastModeToggle.tsx:31)) now carries an ⓘ tooltip with the content *"History uses your sprint data; Subjective uses your judgment."* — disambiguates the two modes for first-time users without requiring them to switch modes and observe the input differences.

- **Settings → "Statistical methods to show" section** added under Chart Defaults. One checkbox per distribution (Truncated Normal, Lognormal, Gamma, Bootstrap, Triangular, Uniform) plus a one-line description under each (descriptions overhauled in v0.31.3). New installs and the upgrade default both ship with Truncated Normal only checked — the cleanest first-touch view, removing five distributions worth of visual density from a first-time user's Forecast tab. Re-enable any combination from Settings; at least one must remain checked (the at-least-one constraint is enforced in the store setter `setDistributionsEnabled`, not just the UI, so a malformed cloud document or a bypassed UI cannot result in zero distributions enabled). Bootstrap is still gated by 5+ sprints of history regardless of this setting. The setting persists in `localStorage` for local-mode users and round-trips through Firestore for cloud-mode users via the same emit-on-user-change pattern used by other settings fields. The defensive Firestore coercion in `firestoreDocToSettings` handles non-array, empty-array, and partially-invalid-array inputs by falling back to `['truncatedNormal']` rather than crashing or rendering an empty distribution set.

- **"Your forecast" hero callout** at the top of the Forecast Summary panel. A blue-bordered left-rail section renders before the existing summary controls and reads, for example, *"Based upon your forecast judgments, there is a 90% chance the project will finish by [date]."* (with "an 80%" / "an 87%" / "a 90%" computed by pronunciation via the new `indefiniteArticle()` grammar helper). Two important correctness properties: (1) the percent shown is the *true* cumulative probability at the displayed sprint-end date, computed via the new `cumulativeProbabilityAtSprint()` Monte Carlo helper — *not* the user's selected percentile. Because forecast dates round up to sprint-end (sprint quantization), the actual cumulative probability at that date is typically *higher* than the selected percentile — sometimes much higher when the surrounding sprint bucket holds many simulated outcomes. Showing the true CDF keeps the (percent, date) pair internally consistent. (2) The lead phrase *"Based upon your forecast judgments,"* is mode-agnostic — it works equally for history mode (sprint data as the user's judgment about the team's pace) and subjective mode (the direct velocity estimate as the user's judgment) without privileging either vocabulary. The hero reuses the existing `if (!selectedResult) return null` guard, so it never renders with stale or missing data. Implementation at [ForecastSummary.tsx:331](src/features/forecast/components/ForecastSummary.tsx:331).

- **Scope picker in the forecast summary controls row.** A new dropdown to the left of the distribution + percentile pickers lets the user choose either "Entire Project" (the existing behavior, default) or any single not-yet-completed milestone. The hero callout and the lower-section summary sentence both reflect the choice — for milestone scope, the headline reads *"...Milestone X will be reached by [date]"* and the summary references the milestone's incremental `backlogSize` rather than the project total. Completed milestones (`backlogSize === 0`) are filtered out of the picker (they have nothing to forecast) but still appear in the per-milestone breakdown below as italicized "completed" lines. If the user selects a milestone and then later deletes or completes it, the picker silently falls back to "Entire Project" rather than rendering a broken selection. Scope option list built at [ForecastSummary.tsx:181](src/features/forecast/components/ForecastSummary.tsx:181).

- **Per-milestone breakdown under the summary sentence.** A colored-dot list of each charted milestone's forecast date (filtered to milestones with `showOnChart !== false`, excluding the currently-selected scope so the headline isn't duplicated). Completed milestones render in italic past-tense (e.g., *"MVP Release: completed"*) so the boundary between delivered and ahead-of-team is eye-scannable; not-yet-completed milestones render in normal-weight future-tense pulled from the per-milestone Monte Carlo results. Completion is detected from `backlogSize === 0` only — never auto-derived from sprint history — because milestone scope can change independently of sprint delivery (descopes, additions) and the user is the source of truth on what remains to ship.

- **Burn-up chart legend ordered Scope → Done → forecast lines in ascending percentile.** Recharts 3.x's default `<Legend>` auto-collects entries from rendered chart children and sorts them alphabetically — which produced legends like *"Done, P10, P50, P90, Scope"* with chart series in a different order than they appear left-to-right on the chart, confusing first-time readers. A new pure helper `buildBurnUpLegendPayload()` at [src/features/forecast/lib/burn-up-legend.ts](src/features/forecast/lib/burn-up-legend.ts) builds the explicit payload in the desired display order, and the chart canvas passes both `payload={...}` and `itemSorter={null}` to `<Legend>` to opt out of the default alphabetical sort. Custom percentile labels and arbitrary percentile combinations are supported (e.g., P15 / P50 / P85 still come out ascending). Tested for stability against reverse-ordered inputs.

- **Distribution dropdown ⓘ info-tooltip in the summary controls row.** Hover reads *"Only Truncated Normal is shown by default. Add more distributions in Settings → Statistical methods to show."* — points users at the new Settings checkbox section so they can discover how to expand the dropdown beyond the single default option. Implementation at [ForecastSummary.tsx:377](src/features/forecast/components/ForecastSummary.tsx:377).

### Changed

- **Auto-simulation now runs on first valid input.** Previously, even with auto-recalculate enabled in Settings, the Forecast tab required one manual "Run Forecast" button click before auto-recalculate took effect — a discoverability papercut where first-time users had no signal that input changes would trigger anything. The first-click gate (`hasRunOnceRef.current` check) is removed for the initial trigger; once inputs are valid, the simulation kicks off automatically. The manual "Run Forecast" button still works for users who prefer explicit triggering and for users who have auto-recalculate disabled in Settings.

- **Default selected percentile pills shrunk** from `[P10, P20, P50, P80, P90]` to `[P10, P50, P90]` for new sessions, at [constants.ts:20](src/features/forecast/constants.ts:20). The five-pill default surfaced too many percentile dates at once for users meeting Monte Carlo forecasting for the first time; three pills (optimistic / median / conservative) communicate the spread without the visual density. The full picker still offers all 19 selectable values `[P5, P10, P15, P20, P25, P30, P35, P40, P45, P50, P55, P60, P65, P70, P75, P80, P85, P90, P95]` — users add or remove pills in the Forecast Results table to suit their preference; the change only affects what's checked by default for a new session.

- **Custom-percentile dropdown extended downward to P10–P40** for optimistic forecasting. Was previously `[P50, P60, P70, P80, P85, P90, P95]` only — a "conservative end" dropdown that couldn't represent best-case forecasts. Now `[P10, P20, P30, P40, P50, P60, P70, P80, P85, P90, P95]` ([ForecastSummary.tsx:48](src/features/forecast/components/ForecastSummary.tsx:48)), ordered ascending so the dropdown reads naturally top-to-bottom. Useful for users who want to compare "if everything goes well" against "if it goes typically" within the same forecast.

- **Forecast Results table no longer stretches to fill its container with few distributions selected.** Was previously a free-flowing layout that filled the available width regardless of column count, leaving cells with awkward extra padding when only Truncated Normal was visible (the new default). Now `table-layout: fixed` with `<colgroup>` widths of 4rem / 4.5rem / 7.5rem ([ResultsTable.tsx:96](src/features/forecast/components/ResultsTable.tsx:96)) so the table is left-anchored at its natural width and trailing whitespace fills the right side of the container. Narrow viewports still scroll because the parent supplies `overflow-x-auto`.

- **Summary sentence reframed to "there is at least an X% chance that…"** Was previously *"there is an X% chance"* — technically incorrect under sprint quantization. Because the displayed date is the *earliest* sprint-end where the cumulative distribution function reaches the selected percentile, the actual cumulative probability at that date is `≥ selected percentile`. *"At least"* is true; the bare percent could be read as a point estimate that the math doesn't support. The hero callout (which shows the *true* CDF percentage) reads *"there is an X%"* — appropriate because that's the actual CDF value; the lower-section summary (which shows the *selected* percentile against the same date) reads *"there is at least an X%"* — appropriate for the displayed-percentile-vs-true-CDF gap.

- **Indefinite article computed by pronunciation** via the new `indefiniteArticle(n)` helper at [src/shared/lib/grammar.ts](src/shared/lib/grammar.ts). Generates *"an 80%"* / *"an 87%"* / *"an 11%"* / *"an 18%"* / *"a 90%"* / *"a 50%"* — accounting for the cases where the spelled-out first digit starts with a vowel sound (eight, eighteen, eleven) vs. a consonant sound (one, two, three…). Used by both the hero callout and the lower-section summary so the article is always correct regardless of which percentile or true-CDF value lands in the sentence.

### Internal

- **shadcn `tooltip` component installed (Radix UI–backed via `radix-ui ^1.4.3`).** A new `HelpTooltip` wrapper at [src/shared/components/HelpTooltip.tsx](src/shared/components/HelpTooltip.tsx) renders ⓘ info chips with content sized to `max-w-[14rem]` for compact reads (originally wider; narrowed after initial review found the typical 1-sentence content read visually heavy at the wider size). `TooltipProvider` is mounted in `AppShell` so any descendant can render tooltips without per-call provider setup.

- **Monte Carlo helper `cumulativeProbabilityAtSprint(sortedSimData, sprints)`** at [src/features/forecast/lib/cdf.ts](src/features/forecast/lib/cdf.ts). Returns the true cumulative probability (as a percent in `[0, 100]`) that the project finishes at or before the given sprint count, computed from the sorted per-trial sprints-required array. Powers the hero callout's headline percentage so it stays internally consistent with the displayed sprint-end date.

- **Grammar helper `indefiniteArticle(n)`** at [src/shared/lib/grammar.ts](src/shared/lib/grammar.ts). Derives "a" vs. "an" from the pronunciation of the leading digit of the number being read out as a percentage. Tested at the documented edge cases (8 / 18 / 80 / 87 / 11 → "an"; 1 / 2 / 3 / ... / 9 → "a"; 100 → "a"; etc.).

- **Milestones lib `computeCumulativeScope` + `computeMilestoneCompletionInfo`** at [src/features/forecast/lib/milestones.ts](src/features/forecast/lib/milestones.ts). Computes the cumulative thresholds `[0, m[0].backlogSize, m[0].backlogSize + m[1].backlogSize, ...]` that the Monte Carlo simulation reads as "delivered-in-trial ≥ threshold," and derives per-milestone completion state from `backlogSize === 0` only. Completion is **not** auto-derived from sprint history — milestone scope can change independently of sprint delivery (descopes, additions), so auto-inference is unsafe; the user is the source of truth on what remains. Release-history (when a milestone actually shipped) lives in GanttApp, which this tool feeds into. Shared by `ForecastSummary`, `ForecastResults`, and `useForecastState` so the completion computation is single-sourced.

- **Burn-up legend payload** built explicitly via the new helper at [src/features/forecast/lib/burn-up-legend.ts](src/features/forecast/lib/burn-up-legend.ts) with `itemSorter={null}` on `<Legend>` to opt out of Recharts 3.x's default alphabetical sort. Tested for stability against reverse-ordered inputs, custom percentile sets, and configurations with `showScopeLine: false`.

- **`getVisibleDistributions` chokepoint** gained an `enabledDistributions` parameter so all three call sites (`ForecastSummary`, `PercentileSelector`, `ResultsTable` via `ForecastResults`) pass through the Settings value rather than separately re-deriving it. The Bootstrap-OR-Uniform mutual exclusion is enforced here — never more than 5 visible distributions in any combination.

- **State-fallback `useEffect`s in `ForecastSummary` and `BurnUpConfigUI`** added for the case where the user disables the currently-selected distribution via Settings — the component falls back to the first available distribution from the visible set. Both depend on a `useMemo`'d availability set with explicit reference-stability inline comments (`// do not drop — array reference stability is load-bearing; dropping triggers an infinite render loop`) on the dep arrays. Verified against React DevTools profiler with rapid Settings toggling to confirm no render loops.

- **Sample-project seeder** at [src/features/projects/lib/sample-project.ts](src/features/projects/lib/sample-project.ts). Plain module function (not a hook) — invoked from event handlers via `useProjectStore.getState()` rather than React render paths. All sprint dates flow through `calculateSprintStartDate` / `calculateSprintFinishDate` so finish dates always land on business days. Required project fields per `src/shared/types/index.ts` are set explicitly; every seeded sprint has `includedInForecast: true` so the auto-derivation of `remainingBacklog` in `useForecastInputs` reads the seeded values correctly. The last sprint's `backlogAtSprintEnd: 460` is the pre-fill source — no `setForecastInput` call is needed because sprints are persisted while `forecastInputs` are session-only. (Note: the seeded productivity adjustment had a placement bug from v0.31.1 through v0.31.3 — it landed in completed history and was filtered out before reaching the simulator. Fixed in v0.31.4; see that release's entry for details.)

- **Test count: 932 / 45 files at the v0.31.2 baseline.**

## v0.30.2 - 2026-05-15

### Changed

- **Productivity Adjustments Edit/Delete now use icon buttons.** The yellow "Edit" pill and red "Delete" pill on each Productivity Adjustments row (Forecast tab) are replaced with the shared `PencilIconButton` and `TrashIconButton` components introduced in v0.29.x. The pencil shows a persistent blue active tint while that adjustment is being edited.
- **Milestones Edit/Delete updated by the same change.** The shared `ListRowActions` component powers both Productivity Adjustments and Milestones rows, so Milestones receive the identical icon-button treatment in this release. After v0.30.2, every Edit/Delete control in the app — Projects tab, Sprint History, Productivity Adjustments, and Milestones — uses the same icon-button vocabulary.

### Internal

- **`ListRowActions` accepts an `isEditing` prop** that drives `PencilIconButton`'s `active` state. The host list passes `adj.id === editingId` (or `m.id === editingId` for milestones).
- **`CollapsibleCrudPanel.renderList` callback** now also receives the panel's current `editingItem`, so list components can compute per-row editing state without duplicating the editing-state store. No behavior change for existing callers that ignore the new field.

## v0.30.1 - 2026-05-14

### Changed

- **Sprint History Edit/Delete now use the same icon buttons as Projects tab.** The yellow "Edit" pill and red "Delete" pill on each Sprint History row are replaced with the shared `PencilIconButton` and `TrashIconButton` components (subtle gray icons that tint blue/red on hover, with a 1.5px colored focus ring). The pencil shows a persistent blue tint while the row's sprint is being edited, matching the Projects tab's active-state pattern. Confirmation flow, the "only the most recent sprint can be deleted" gate, and all behavior are unchanged — visual change only.

## v0.30.0 - 2026-05-14

### Added

- **Smart Import (Level 4) — per-project conflict resolution with an inline preview.** When a project-export or Story Map file contains projects that already exist in the workspace, a "Review import" section now renders between the toolbar and the project list before any data is changed. Each conflicting project shows three radio options: **Keep existing, ignore imported** (default for all same-project ID conflicts), **Add as a copy** (default for same-name, different-origin conflicts), and **Replace existing with imported** (opt-in). Non-conflicting projects are listed in a green "New projects (N)" block for review. The preview section renders as a `role="region"` landmark; the heading receives programmatic focus on mount for screen-reader announcement; radio groups carry `aria-labelledby`; Escape closes the preview. Decisions survive a mode toggle — switching between Merge and Replace-All does not reset per-project choices.
- **Dual conflict detection.** Incoming projects are checked against the existing workspace on both project ID ("Already exists — same project") and case-insensitive, trimmed project name ("Already exists — same name, different origin"). ID conflicts take precedence when both match. The two labels surface different information: an ID conflict is a definite match; a name conflict is a likely match from a different origin. Known limitation: an incoming project whose ID matches one existing project and whose name matches a different existing project surfaces only the ID conflict — the name collision is silently undetected. Planned for a future release.
- **Inline result banners.** After every import — fast-path or confirmed — a dismissible banner replaces the preview with a specific count summary: "3 projects added, 1 copied, 1 replaced, 2 skipped." Clauses with zero count are omitted. If no action was taken the banner reads "No projects were imported." instead of a bare period. Success banners use `role="status"`; error banners use `role="alert"`.
- **Stale-data guard operating at two layers.** If the workspace changes while the conflict preview is open, the import is safely aborted. Layer 1 (hook): immediately before calling the store action, conflicts are re-detected against the current store state and compared to the original preview-time conflicts using full `(incomingId, type, existingId)` tuples — a conflict-type change from `'name'` to `'id'` for the same incoming project is detected as drift. Layer 2 (store): `applySmartImport` re-detects conflicts inside Zustand's `set()` updater against `state.projects` at write time, then compares against the hook's snapshot. If they differ, the updater returns the unchanged state and the action returns `{ ok: false }` — the import is aborted without modifying the store. This closes the concurrent-delete drift window that Layer 1 cannot reach. An error banner asks the user to try again.

### Changed

- **Breaking — 'Replace existing' now fully substitutes sprint history.** Choosing 'Replace existing with imported' for a conflicting project removes all existing sprints for that project and inserts the incoming file's sprints in their place. Previously, project-export merges and Story Map merges preserved existing sprint history and only added sprint numbers not yet recorded. Use 'Keep existing' or 'Add as a copy' to preserve sprint history.
- **Default conflict resolution changed for same-project ID conflicts.** The default choice is now 'Keep existing, ignore imported' (skip) for all ID conflicts, regardless of whether the project names match. Previously, when the existing and incoming project shared both ID and name, the default was 'Replace existing with imported'. That default became a data-loss footgun once 'Replace' adopted full sprint-history substitution semantics — a user who imports a prior backup into a workspace with newer sprint data would silently lose those sprints by clicking Confirm without reading. Users who intend to replace must now opt in by selecting the radio explicitly.
- **'Replace' effect on per-project session data.** Sprint history, milestones, and productivity adjustments: fully substituted from the incoming file. Burn-up chart configurations: cleared for all replaced projects because incoming milestones may carry different IDs, leaving prior configs referencing non-existent milestone IDs. Configurations for projects not involved in the replace are preserved. Forecast inputs (remaining backlog, velocity estimates): carried over from the displaced existing project for name-conflict replacements, where the project ID changes; preserved unchanged for ID-conflict replacements, where the project ID is the same. **Copied projects start with blank forecast inputs** — re-enter estimates on the Forecast tab. A copy is a new planning entity; carrying forward estimates from the source would be misleading if scope or velocity assumptions differ.
- **Story Map imports now preserve session data for untouched projects.** Previously, every Story Map import called `mergeImportData`, which explicitly set `forecastInputs: {}`, `burnUpConfigs: {}`, and `viewingProjectId: null` for the entire workspace — wiping estimates and chart configurations for every project regardless of whether it appeared in the Story Map file. Story Map imports now route through the same `applySmartImport` path as project-export imports, which clears session data only for the specific projects involved in the import and leaves all others intact.
- **Project-export imports now correctly migrate forecast inputs for name-conflict updated projects.** Previously, when an incoming project matched an existing project by name (different IDs), the merge applied the incoming project at the existing project's array slot but left `forecastInputs` keyed to the old project ID. The new entry was orphaned — the forecast inputs were never visible because the key no longer matched any project ID. `applySmartImport` now renames the `forecastInputs` entry from `existingId` to `winner.id` as part of the same atomic write.
- **Story Map imports now route through the inline state machine, replacing the modal dialog.** Previously, detecting a Story Map export (`source: 'spert-story-map'`) opened a `MergeImportDialog` modal showing a per-project plan summary. Story Map files now receive the same full Level 4 flow — inline preview, dual conflict detection, per-project tri-choice, accurate banner counts — and the modal is gone.
- **Legacy full-workspace imports offer a merge-vs-replace-all toggle.** Importing a native Forecaster export (no `_exportType` or `source` tag) now shows the inline preview in "Replace entire workspace" mode by default, with a radio toggle to switch to "Merge into workspace" mode. In Replace mode, a "Replace All Data" button in the preview opens a `ConfirmDialog` (danger variant) requiring a second deliberate click before the workspace is overwritten. Previously, importing a native Forecaster file showed only a single `ConfirmDialog` with no per-project options.
- **In cloud mode, all imports show the conflict preview regardless of conflict count.** Zero-conflict project-export and Story Map imports that would normally apply via fast path in local mode instead display the preview with only the "New projects (N)" block — one extra click, no data risk. During the 1–2 seconds after sign-in before the first Firestore snapshot arrives, `projects` is briefly empty and `detectImportConflicts` returns no conflicts for every incoming project. Suppressing the fast paths during this hydration window prevents silent duplicate creation and prevents a Replace-All from overwriting cloud data that has not yet loaded.

### Fixed

- **`isStoryMapExport` was checking the wrong field and always returning `false`.** The type guard was checking `._exportType === 'spert-story-map'` but Story Map exports set `.source = 'spert-story-map'` — a field defined on `ExportData` itself, not on the Story Map subtype. The guard never matched a real Story Map file; every Story Map import was falling through to the legacy native-export branch and presenting the full-replace confirmation dialog. The guard now checks `.source` to match the actual export format.
- **`viewingProjectId` was updated in a separate Zustand `set()` call after the merge write, causing a one-tick flicker.** Between the two calls, the store held post-merge `projects` while `viewingProjectId` still pointed at the displaced existing project. `selectViewingProject` resolved to `projects[0]` for one render tick — a visible flash to the wrong project. `viewingProjectId` reconciliation now runs inside `applySmartImport`'s single `set()` updater, atomically with the merge.

### Internal

- **`MergeImportDialog` component removed** (`src/shared/components/MergeImportDialog.tsx`).
- **`merge-import.ts` and `merge-import.test.ts` deleted.** `buildMergePlan`, `applyMergePlan`, `buildSubsetMergePlan`, `applySubsetMerge`, `isStoryMapExport`, and `isProjectSubsetExport` have been removed or moved. `isProjectSubsetExport` and `isStoryMapExport` (with corrected field) now live in `src/shared/state/import-utils.ts`.
- **Store actions `mergeImportData`, `mergeProjectSubset`, and `importData` removed** from `project-store.ts` and the `ProjectState` interface. Replaced by `applySmartImport` and `importDataAndSelectFirst`.
- **`applySmartImport` returns `SmartImportOutcome` (`{ ok: true; result } | { ok: false; reason }`)** rather than `void`. The hook uses the returned `result` for banner counts, guaranteeing the counts reflect what was actually committed rather than a pre-computed estimate that may have diverged under concurrent drift. `syncBus.emit({ type: 'project:import' })` fires only on `outcome.ok === true`.
- **Merge computation is fully atomic.** `applySmartImport` calls `applyImportDecisions` inside Zustand's `set()` updater against `state.projects` at write time — not against a snapshot captured in the hook. A project added concurrently by a cross-tab cloud sync between the hook's `getState()` read and the store write is preserved in the merged output.
- **New files:** `src/shared/state/import-utils.ts` (utility functions and types), `src/features/projects/hooks/useImportState.ts` (state machine hook), `src/features/projects/components/ImportPreviewSection.tsx` (controlled preview UI), and their co-located test files.
- **`_changeLog` source values** now include `'spert-legacy-export'` for legacy full-workspace imports processed in Merge mode. Previously emitted as `'spert-forecaster-project-export'`, which was incorrect. `ChangeLogEntry.source` is typed `string`; this is a purely additive value.
- **N new tests** across `import-utils.test.ts` (~57), `ImportPreviewSection.test.tsx` (~22), `useImportState.test.ts` (~27), `ProjectsTab.test.tsx` (~8), and additions to `project-store.test.ts` (~39 new, 8 migrated from deleted blocks). Total: approximately 825 tests / 36 files.

### Known Limitations

- In cloud mode, all imports show the conflict preview before applying, even for zero-conflict files. This prevents silent duplicate creation during the Firestore hydration window after sign-in.
- Importing the same file twice using 'Add as a copy' produces two projects with identical names (e.g., two "Widget Project (2)" entries). The ' (2)' suffix does not iterate — intentional for bulk import ergonomics.
- An incoming project whose ID matches one existing project and whose name matches a different existing project surfaces only the ID conflict. Choosing 'Replace existing' in this case may produce two projects sharing the same name. Planned: richer conflict model in a future release.

## v0.29.4 - 2026-05-11

### Fixed
- **Data-loss bug**: Local-only users no longer lose their projects from localStorage
  on cold page load. `AuthProvider` previously treated the initial
  `onAuthStateChanged(null)` event — which Firebase fires once on subscribe for any
  unauthenticated session — as a sign-out, calling `clearProjectsOnSignOut()`
  unconditionally. A `previousUserRef` guard now ensures sign-out cleanup runs only
  on a true `User → null` transition. Explicit sign-out, session expiry, and
  ToS-mismatch forced sign-out are unaffected.

## v0.29.3 - 2026-05-11

### Added

- **Clone project — violet icon button between Edit and Delete.** A new `CloneIconButton` (violet `#8b5cf6` accent, rect-over-rect glyph) sits between the pencil and trash icons on every project row, matching GanttApp v0.25.0. Clicking it creates a full deep-clone of the project and inserts it immediately after the source in the list. Cloned name follows the GanttApp pattern: `"X - Copy (1)"`, `"X - Copy (2)"`, etc., with collision-checking up to `(99)` and a UUID-tagged fallback beyond.
- **Deep clone scope**: the new project carries forward all embedded milestones, all productivity adjustments, and all sprint history records — every embedded entity gets a fresh ID, sprints get rebound `projectId`. The source project is untouched.
- **No confirmation dialog** — clone is immediate, with a sonner success toast (`Cloned: <project name>`) for feedback. Matches GanttApp's UX.
- **Cloud-mode fork pattern**: in cloud mode, the clone button is shown to anyone with access to the project (owner, editor, viewer). The cloned project's `owner` field is set to the current user by `projectToFirestoreDoc` (because the new project has no entry in the cloud-sync doc-meta cache, so the converter falls back to `uid`). This enables forking a shared project to own it — same behavior as GanttApp.

### Internal

- New shared component: `src/shared/components/CloneIconButton.tsx`.
- New store action `cloneProject(sourceId: string): string | null` in `src/shared/state/project-store.ts`. Returns the new project ID, or `null` if the source is not found.
- New `onClone` prop on `ProjectList`; new `handleClone` in `ProjectsTab` wires the action and the toast.
- 9 new tests in `project-store.test.ts` covering: null on missing source, name suffix and collision handling, insertion position, milestone/adjustment/sprint deep-clone with fresh IDs, source untouched, change-log entry, and `project:save` sync event emission. Total now 740 tests / 35 files.

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
