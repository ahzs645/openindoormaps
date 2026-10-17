# Copy this to the next AI

Continue the UNBC map work from `ahzs645/openindoormaps` and
`ahzs645/reviter` on main. Clone them as adjacent `openindoormaps` and `reviter`
directories and follow both `AGENTS.md` files. Start with:

- OpenIndoorMaps `docs/continuation/unbc-20261016/HANDOFF.md` and `CHECKS.md`.
- Reviter `docs/UNBC-HANDOFF-2026-10-16.md`.
- OpenIndoorMaps `docs/indoor-local-iteration.md` and the enclosure skill.

Source is pushed separately from the hosted Site. The live Site is version 10,
release `5ea7856475a6`; its existing visitor ZIP remains the October 15 export.
It includes hallway-side door endpoints, hallway preference with checked
ordinary-room fallback, reversible model-bound stair exclusions, a labelled
08-S401 unconnected landing, lazy picking, resident routing reuse, and verified
ZIP download. Current browser preferences do not change exported source data.

The original source rebuild `unbc-native-v3-r2-resume1` has **finished with exit
code 1**, not success. It refused losing previously admitted arrivals
`rm-694-0bed6b73a3bd` and `rm-694-504b25e5319a`. Read its exact log and completion
in the handoff. Nine physical checkpoint pairs exist; there is no accepted new
master or visitor candidate. All 28 held stair links remain disabled.

Read the post-push CI section in `CHECKS.md` as well: Reviter has two failing
full-suite families (deterministic Math and run-owned stair material), plus
Pages lint debt. Do not suppress those guards or assume all CI passed.

First diagnose those two arrival losses using retained full affected source/cell
and physical plane context, preserving original owners, foreign obstacles,
apertures, support and access. Fix and test the demonstrated predicate and
related cases, then replay only the affected cell/planes. Batch stable repairs
before one full regeneration and final acceptance. Never weaken preservation
or clearance gates to get an export. Old R2 source-copy/publication tails are
success-gated plans and must not run blindly over the current Site.

Next integrate durable reviewed outdoor/seating stair contexts using the
isolated helper and exact evidence in the handoff; add typed authoring round
trips and both compiler builder call sites. Only four contexts were previously
reviewed; other exclusions remain unclassified. Continue terminal/landing/body/
clearance qualification and the stricter consumer adoption against a genuinely
complete candidate, then actual up/down/profile navigation and browser checks.

For data: the same workspace already has `/workspace/scratch` inputs. In a new
workspace, use the separately supplied `UNBC-data-handoff-20261017.tar.gz`
(1.27 GB, SHA-256 `24119b663b78afc8250ceeefd13f5a0854a3c94a29f0d566d97961bd5f375253`)
and its README/manifest/verifier, plus both repositories or their Git bundles.
It contains the authoring master, actual failed-run source input, enriched cache,
review evidence and checkpoints. It lists optional omitted caches explicitly.
The 45.29 MB visitor ZIP alone supports viewing/UI work, not native-source repair.
Keep historical input/engine hashes distinct from current main and newly rebuilt
artifacts. No need to ask the user to upload data already available locally.
