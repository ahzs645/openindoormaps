# Portable stepped stair verification

The original-source case is **03-S201 ↔ 03-S301, Building 03, native Floor 3/4**, stair 1696006 / run 1696012. Older `Library` labels in scratch filenames are historical aliases and do not establish a building or room identity.

The browser and worker verifier lives in `app/indoor-project/native-stepped-stair-v2-kernel.ts`; the converter has local mirrors under `reviter/lib/reviter`. These modules contain exact mathematical replay and portable operand types. Their dependency graph contains no source-model container reader, filesystem code, or original-source certificate issuer. The final standalone browser bundle including conservative wire replay is 75,709 bytes, or 23,246 bytes with Brotli quality 6. The application can share its existing exact arithmetic engine. Production qualification remains responsible for original source/package evidence, current compiled geometry binding, source access policy, and admission. A copied receipt, JSON wire, report, boolean or matching hash does not supply those gates.

## Transport and graph binding

The shared dataset field is `nativeSteppedStairV2SourceIndices`; each entry wraps `{id,physical}`. Edges refer to the shared source index and preserve a separate receipt and original graph snapshot. Keep the index shared rather than copying the complete physical census for every stair.

`physical` and `receipt` are plain lossless wire JSON values. Use `encodeSteppedStairV2WireValue` on the source side and `decodeSteppedStairV2WireValue` on the browser side. Rational leaves are explicit `{$rational:[numerator,denominator]}` strings. Generic serialization of Rational instances is not the transport. The decoder rejects malformed, nonnormalized and nonpositive-denominator rationals, sparse/cyclic/nonplain objects, and direct Rational class input to the plain-wire API.

`replayPortableSteppedStairV2(index,receipt,expectedGraphBinding,currentGraphBinding,options)` compares both exact graph snapshots before mathematical replay. `createCurrentSteppedStairGraphBinding` derives the current snapshot from the current dataset; the source producer separately preserves the independently checked original snapshot. The physical index must also preserve `sourceCensusScopeFeet` from the actual original source context. Every approach/station retains a two-foot XY margin and complete six-foot height band inside that scope; every actual swept movement is independently checked against it. Missing, malformed, inverted or exceeded scope refuses. Both graph snapshots retain every original node field and served-level field, edge identity/direction, room identity and permissions. The visitor does not need the 223 MB original canonical dataset. Logical graph XYZ and original physical floor XYZ remain distinct; the exact lower attachment height difference is preserved.

The active profile is two-foot transverse stair width, six-foot headroom, and full two-by-two-foot standing squares at actual flat landings and turns. It is not a humanoid gait model. Every original named finite riser is replayed; stepped lift-then-cross motion does not add a flat floor across the riser. Original own upper flights remain material. A supporting side face can touch the current footplane only through its full reciprocal source cap/side/component/occurrence relationship and exact maximum height; positive material above the footplane and all foreign contacts retain their veto.

## Full and conservative wire replay

The ordinary kernel consumes fully hydrated exact operands. The optional `native-stepped-stair-v2-lazy-wire.ts` first recomputes every cell bound from **every original polygon and closed zero-area coordinate**. It retains the complete original wire and complete physical-body/cell identity census. Only cells strictly disjoint from the entire proposed motion, standing and headroom scope become conservative exact outer boxes during replay. Touching/overlapping cells and every primitive-consumer cell hydrate fully. No serialized bound is trusted, no raw source data is omitted, and a fresh authoring invocation rescans all coordinates. An enclosing box can add a conservative refusal; it cannot remove original material.

This replay still returns `originalSourceAuthorityGranted:false` and `routeApproved:false`. Source membership and complete constructor evidence must be independently supplied by the original source import/finalizer. Current floor/door/material edits must invalidate that prepared binding.

## Current scope-bound v14 measurements

The current wire was exported through the genuine original-source private-proof getter after all frozen source predicates passed again. Detached wire itself carries no source capability or routing approval.

- Exact current wire SHA256: `78caca93d84bfe21d3f59883f1087716ee97544dc6db5b8616d4f30688c49dfc`.
- Shared physical wire SHA256: `d32efece651ea65735958bfd0b0b0f27f5dbe8957b99b1e7f4dd509df212133f`.
- Original source-census scope: X `[-15,6]`, Y `[-328,-300]`, Z `[23,42]` feet. Both original source and browser replay check it independently.
- The index retains 49 supports, 39,814 physical occurrences, 40,322 closed material cells and 24 cap/side component graphs. The complete current export is 56,221,972 bytes.

| Portion | Plain bytes | Gzip9 bytes | Brotli11 bytes |
| --- | ---: | ---: | ---: |
| Shared physical index |56,207,859|7,666,433|5,857,866|
| Per-edge receipt |8,563|1,410|1,186|
| Original graph binding |1,530|561|471|

Both fully hydrated and conservative wire replay passed **both directions**, with 61 checked movements, zero unknown bodies, zero material contacts and the mandatory source-census scope preserved. These measurements retain the complete published raw wire as a real dataset does.

Fully hydrated replay, under a 768 MiB JavaScript heap limit, took 18.97 s to prepare and 38.0 s / 42.6 s for forward/reverse replay on the loaded host. Preparation reached 793 MB RSS; Linux process high-water RSS was **851,103,744 bytes (about 812 MiB)**. This exceeds an 800 MiB worker budget before adding application data. The fully hydrated path should not be used for the ordinary visitor worker.

Conservative wire replay, under a 512 MiB heap limit, scanned every original cell and kept 221 full cells plus 40,101 conservative disjoint outer boxes. Preparation took 5.68 s; forward/reverse replay took 22.8 s / 20.5 s. Prepared/final RSS was 491 MB / 520 MB, and process high-water RSS was **571,498,496 bytes (about 545 MiB)**. It retained both complete raw wire and prepared operands. This leaves about 255 MiB below an 800 MiB budget for other worker data; actual combined viewer/worker import and navigation still require measurement. Completed verification may be reused only within the exact immutable source/current-geometry binding.

Small reports are preserved under `stair-physical-source-evidence/portable-v2/`:

- `browser-1696006-current-v14-full-parity-and-memory.json`
- `browser-1696006-current-v14-lazy-parity-and-memory.json`
- `browser-1696006-current-v14-sizes.json`
- `browser-verifier-source-manifest.json`
- `browser-verifier-final-bundle-report.json`

The immutable current full wire copy is `/workspace/scratch/unbc-pathway-repair-20261015/stair-bodies/browser-1696006-current-v14-78caca93d84bfe21.json`. The earlier `214c9c5a…` v12 wire/report is historical: it lacks the subsequently mandatory portable source-census scope and must not be promoted as current proof.

## Validation

Twenty-five browser-focused tests cover both directions, unchanged inputs, all physical identities, missing/borrowed/unknown bodies, exact raised material and six-foot tangency, own upper flight obstruction, tiny holes and retained uncertainty, skipped/wrong-height stations, finite riser mismatch, changed current node/level/access/source binding, step-free refusal, exact logical/physical height distinction, malformed transport, whole raw-vertex bounds including disjoint malformed operands, fresh geometry mutation, and differential far-cell owner/role/height/physical-census refusals. Strict scoped TypeScript and ESLint pass. Reciprocal source topology tests independently cover actual 1696013 cap 10 / side 13 and 405772 cap 5 / side 92, plus wrong-component/nonreciprocal/null-loop/source-forgery negatives.

The scope-hardened original-RVT v14 source proof and refreshed browser parity establish this one source case with its current source-census coverage. They do not enable the remaining 27 held stair links. Production qualifier, regenerated candidate, actual calculator/worker, and navigation screenshots are separate completion steps owned by the integration team.
