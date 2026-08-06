// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  { ignores: [".claude/**"] },
  // ⚠️ `.stryker-tmp` is Stryker's sandbox: it holds full copies of every mutated
  // source file. Left behind by a crashed run, ESLint lints those copies too and
  // the problem count jumps by the findings each copied file carries — in
  // spert-scheduler one stale copy of one file moved `npm run lint` from 23 to 24.
  // The count is the ship gate (`expectProblems` in shipgate.config.json), so an
  // uncleaned sandbox reads as a regression that no commit caused.
  { ignores: [".stryker-tmp", "reports/**"] },
  // Cognitive complexity only — NOT sonarjs.configs.recommended. The plugin is
  // here to answer "where is this code hard to change safely?", which is the one
  // question scripts/measure-complexity.mjs needs it present for. Threshold 15
  // matches spert-scheduler.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { sonarjs },
    rules: { "sonarjs/cognitive-complexity": ["error", 15] },
  },
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Allow the underscore-prefix convention for intentionally-unused bindings.
  // Used throughout the codebase for destructure-to-strip patterns (e.g.,
  // `const { owner: _o, members: _m, ...rest } = data` — the names exist to
  // satisfy destructuring syntax; the intent is that they are NOT read).
  // Applies to the @typescript-eslint/no-unused-vars rule that
  // eslint-config-next enables for .ts/.tsx files.
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
