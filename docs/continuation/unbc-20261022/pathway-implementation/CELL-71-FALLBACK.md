# Cell 71 shared-guide refusal and normal fallback

The single lost baseline guide in `native-cell:0.000000:71` is an explained shared-guide coverage tradeoff. Complete-cell attachment selection changes both receiving joins and gains six other incident original guides. The shared proposal fails the unchanged distance cap. The original walk remains present, and ordinary physical refinement passes with the complete visitor context. No compiler or native source change was made for this review.

[CELL-71-FALLBACK.json](CELL-71-FALLBACK.json) retains full original IDs, exact coordinates, checkpoint hashes, compiler binding and the direct refinement results. The reviewed code is `0136c83d88500f98bbc394345b99683a39d430c1`. The input visitor ZIP is SHA-256 `8ad33533e28c387da03567e7979ced4268c7bc1cc3c8727b3762ea908d44546e`; its complete `viewer/indoor.json` is SHA-256 `951b2539d8e1df676bf376cfce5b6f71ed156e4d2be8b4928ff99f9190584e37`.

The affected edge is:

```text
native-cell:0.000000:71:walk:arrival:rm-311-6ecd9309a135|opening:recovered-circulation-seam:rm-311-6ecd9309a135:rm-311-ac7069426f1f:0:1:0
```

Its actual source orientation runs from the opening to the arrival; the order within the edge ID does not determine orientation.

## Exact refusal and geometry

The source walk measures **17.2523122681 ft**. The original acceptance formula, `source length × 1.15 + 0.6 + 2 × 12 ft`, gives **44.4401591084 ft**. The bound candidate checkpoint explicitly records `guide-distance-limit` and emits no replacement guide for this edge.

The baseline accepted guide measured **17.7777889461 ft** with four points. The complete-cell candidate selects these checked joins (display values rounded here; the JSON preserves exact coordinates):

| Terminal | Baseline join, feet      | Candidate join, feet     |
| -------- | ------------------------ | ------------------------ |
| Opening  | (136.429583, 248.146934) | (139.514464, 242.328343) |
| Arrival  | (140.698069, 260.003813) | (135.734646, 260.658451) |

Six other existing walks incident to these two terminals change from `no-supported-shared-route` to accepted. The other previously accepted incident guide remains accepted. Across the full cell, accepted shared guides increase from **407 to 419 of 453**, with **13 gained and one lost**. The candidate attaches 265 of 268 terminals and structurally connects 435 of 453 original edge requirements. Structural connectivity alone does not waive final distance or physical checks.

A coordinate-union diagnostic assembled from emitted guide cores and the selected approaches measures **44.7041426561 ft**, 0.2639835478 ft above the cap. This helps explain the detour, but is not the refused path replay: coordinate union can merge coincident points with distinct graph identities, and emitted guides omit unused core segments. The checkpoint refusal is the authoritative result. The cell was not recompiled for this supplement.

## Direct ordinary refinement

The scoped check loaded the complete checksummed visitor, retaining all 5,493 nodes, 7,337 edges, native cells, floors, holes, obstacles, doors, original ownership and policy context. It initialized the native exact GEOS overlay and used the original edge in `app/indoor-project/viewer-centered-route.ts`:

```ts
const normal = centeredRoutePaths(
  data,
  [edge],
  [edge.from, edge.to],
  true,
  false,
);
const fixedEndpointGuide = prepareWalkingGuide(data, edge);
```

Neither an existing prepared guide nor a shared guide was present for this edge in the source visitor; no candidate guide was supplied. Both calls completed using ordinary refinement:

- `centeredRoutePaths` returns a **15.2898222049 ft**, three-point path with `centered`, `nativeFloorSupported` and `nativeCirculationUsed` all true. The physical opening stays exact. The circulation arrival recenters by 4.6124594610 ft under the existing `!fixedAnchors` arrival rule; no saved source node is moved.
- `prepareWalkingGuide`, which enables fixed anchors, returns a **14.4490939775 ft**, two-point path preserving **both exact original endpoint coordinates**. Its normal refinement and native floor checks pass. The original target edge remains byte-for-byte equal under JSON serialization before and after both calls.

These results support ordinary physical fallback for this existing walk while keeping the shared network's fixed joins and distance threshold. They do not install the two-point result, change connectivity or grant permission. This is one-edge physical qualification, distinct from the normal whole-master import, graph-search and route-profile acceptance, publication checks, or wheelchair certification.
