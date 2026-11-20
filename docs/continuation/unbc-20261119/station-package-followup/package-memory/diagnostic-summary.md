# UNBC companion memory diagnostic

**The full normal qualification remains blocked. There are zero accepted journeys from these attempts.** The diagnostic allowed the unchanged importer to finish all companion evidence, then the process was killed at geometry validation. No complete normal import, source-preserving export or normal/worker route replay passed.

## Preserved input and checks

The exact source master has SHA-256 `8e397ddf461a5ec997269848091972a71a0e5231a5dd9c7a4d8407d285db4f52`. Its `review/companions.bin` member is 88,626,822 bytes and expands to a 188,604,402-byte container holding 890 evidence files. Every diagnostic retained the native SHA-256 checks, bounded expansion, container/header limits, exact whole-container level-9 recompression and per-file content/representation checks. No input was thinned and no validation was skipped.

## Standalone measurements

These runs loaded only the companion and reference, without the full source baseline.

| Mode | Seconds | Peak RSS (KiB) | Files checked |
|---|---:|---:|---:|
| Existing path |37.66|952,140|890|
| Forced GC at internal phases/files |41.83|841,468|890|
| Digest task yield plus forced GC |42.96|823,212|890|

Starting allocator/RSS states differed, so the whole peak differences are not a controlled estimate of one change. The combined run observed a concrete 188,506,112-byte resident-memory drop across a task yield and GC after the 188,604,402-byte raw digest, before canonical recompression. GC alone had not removed that snapshot before recompression. Later file hydration then became the highest observed peak.

## Full normal attempts

| Mode | Seconds | Peak RSS (KiB) | Last observed stage | Accepted journeys |
|---|---:|---:|---|---:|
| Current production code |53.53|3,020,844|Companions|0|
| Same code with diagnostic digest yield/GC preload |102.16|3,021,476|Geometry|0|

The second run reached geometry at RSS3,001,499,648 bytes, heap used 1,009,524,336 bytes and external memory 1,200,347,877 bytes. It was subsequently killed with SIGKILL. The retained/transient breakdown at this next boundary was not isolated. The configured 96 route cases were never completed.

## Unmerged proposal and boundaries

`package-bytes-yield-proposal.patch` proposes one task yield after native digests of at least 1 MiB. It keeps the existing checksum algorithm and ordinary byte-view behavior and does not force GC. **The patch was not applied. Yield-only memory behavior was not separately measured.** Production source remained frozen during this diagnostic; these results do not qualify browser memory or performance.

`artifact-manifest.json` hashes the saved profiles, logs, reference, instrumentation, preload and unmerged proposal. The redundant 88MB companion input is deliberately excluded; its exact member identity and checksums are retained in the JSON summary.
