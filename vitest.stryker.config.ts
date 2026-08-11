// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Scoped vitest config for Stryker mutation testing.
// Only includes tests that exercise the files in stryker.config.mjs `mutate`.
// Running the whole suite once per mutant is the alternative, and it is what makes
// mutation testing unusable rather than merely slow.
//
// Everything outside `include` is deliberately identical to vitest.config.ts. A
// scoped run that behaves differently from `npm test` measures something other than
// the suite you ship.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Every test file that imports monte-carlo.ts, math.ts or dates.ts directly,
    // enumerated 2026-08-04. 297 tests, ~1.1s — barely more than the three
    // co-located unit files alone (210 tests, ~0.9s), so the indirect exercisers
    // are included: a killer left OUT of this list reports its mutants as
    // `Survived`, and a false GAP costs more analysis time than 0.2s costs runtime.
    //
    // ⚠️ DO NOT ADD TEST FILES TO THIS LIST WITHOUT RE-RECORDING THE BASELINE.
    // A comparison is only valid while the killing power on BOTH sides is the same.
    // New tests are good and belong in `npm test`; adding them HERE gives a later
    // run more killing power than the baseline it is measured against, masking
    // exactly the survivors this scope exists to expose.
    //
    // ⚠️ ONE FILE IS BARRED OUTRIGHT, AND RE-RECORDING DOES NOT MAKE IT SAFE:
    //   src/features/forecast/lib/export-csv-oracle.test.ts
    // It byte-compares generateForecastCsv's entire output against committed
    // fixtures, so it kills very nearly every mutant in that file. Obeying the
    // caution above is NOT enough here — re-record the baseline and the inflated
    // killing power is baked into the baseline itself, permanently, and the
    // survivors this scope exists to expose stay hidden with nothing reporting
    // it. The prohibition is also stated at that file's own header; it is
    // repeated here because this is where the mistake would be made.
    include: [
      'src/features/forecast/lib/monte-carlo.test.ts',
      'src/shared/lib/math.test.ts',
      'src/shared/lib/dates.test.ts',
      'src/features/forecast/lib/burn-up.test.ts',
      'src/features/forecast/lib/deadline.test.ts',
      'src/features/forecast/lib/export-csv.test.ts',
      'src/features/forecast/hooks/useSprintData.test.ts',
      'src/features/forecast/components/DeadlineProbabilityPanel.test.tsx',
      'src/features/projects/lib/sample-project.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
