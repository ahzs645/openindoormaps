# CI-equivalent checks — November 2, 2026

The `deploy-pages` workflow runs only on `main` or by manual dispatch, and a
dispatch would deploy Pages from this branch, so its check steps were run
locally on `claude/dazzling-curie-id7wh1` at `c33b155` with the workflow's
Node major version (Node 24.19.0 via `npx node@24.19.0`).

| Workflow step                                                                                  | Result                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc -p tsconfig.indoor-project.json`                                                      | pass                                                                                                                                                                                       |
| Routing and worker lifecycle (14 test files)                                                   | 138 / 138 pass                                                                                                                                                                             |
| Shared pathways and candidate checkpoints (8 files, plus `corridor-terminal-approach.test.ts`) | 69 / 69 pass, including `shared-corridor-route-parity` (production worker message path)                                                                                                    |
| `npm run build:pages`                                                                          | pass                                                                                                                                                                                       |
| `npm run test:pages` (Chromium from `/opt/pw-browsers/chromium`)                               | 5 / 6 pass on the first run; `overlapping imports keep the latest selection…` timed out on a 5 s poll while an 8 GB export ran on the same 4-core host, then passed in two isolated reruns |

On Node 22 the production-worker parity test cannot load its worker
(`Cannot find module …/heavy-worker-schedule`), on this branch and on the
unmodified base alike; on Node 24 it passes. Release checks should use
Node 24.19.0 as the repository documents.

## Branch CI added

`.github/workflows/indoor-checks.yml` now runs the same check steps on every
non-`main` push, pull request or manual dispatch, without configuring or
deploying Pages. It adds `corridor-terminal-approach`, the progressive delivery
and published-directions tests (54 / 54 pass locally on Node 24.19.0) and a
`campus-map` job that runs the self-contained hard-rule verifier, the
wall-shortcut regression and the floor-selection race test on the committed
map (all pass locally).
