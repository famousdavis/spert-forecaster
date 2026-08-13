# SPERT® Forecaster

*Agile Release Forecasting with Monte Carlo Simulation*

Forecast how many sprints a backlog will take, as a probability rather than a single date.
Statistical PERT® models uncertain outcomes with probability distributions and Monte Carlo
simulation, working from recorded sprint history or from subjective estimates when none exists yet.

**[forecaster.spertsuite.com](https://forecaster.spertsuite.com)**

## What it does

- Monte Carlo simulation, 10,000 trials by default and up to 50,000, across six distributions:
  truncated normal, lognormal, gamma, triangular, uniform, and bootstrap sampling from your own
  sprint history
- Percentile results (P50 through P90, plus any custom percentile), with burn-up, cumulative
  distribution and histogram charts and a deadline probability panel
- Ordered milestones forecast individually, and productivity adjustments that scale velocity over
  named date ranges such as holidays
- CSV export, a print-friendly report, and JSON project import/export
- Local-first: everything runs in your browser. Optional Google or Microsoft sign-in adds cloud sync
  and project sharing; a connected AI assistant can be given a read-only snapshot.

## Development

```bash
npm install
npm run dev          # development server
npm test             # test suite
npm run shipgate     # release gate: version surfaces, lint, typecheck, tests, build
```

Node 24 (see `.nvmrc`). Firebase environment variables are optional — without them the app runs in
local-only mode.

## Legal

Reference copies of the Terms of Service and Privacy Policy are in `/legal`. The canonical versions used by the app at runtime are hosted at:

- https://spertsuite.com/TOS.pdf
- https://spertsuite.com/PRIVACY.pdf

## License

[GNU General Public License v3.0](LICENSE), with non-permissive additional terms under Section 7.

SPERT® and Statistical PERT® are registered trademarks with the United States Patent and Trademark
Office.
