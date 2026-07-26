// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// resolveScopeGrowthPerSprint moved to @/shared/lib/forecast-derivations in
// v0.36.0: buildForecastInputSnapshot calls it, and shared/ must not import
// features/. Re-exported here so existing import sites and its unit tests
// keep resolving through this module.
//
// It still returns `number | undefined`. The `?? null` normalization that
// RunConfig requires happens ONLY inside buildForecastInputSnapshot. Adding a
// second one here would defeat the point of having a single normalization
// site.
export { resolveScopeGrowthPerSprint } from '@/shared/lib/forecast-derivations'
