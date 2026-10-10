# Floor 1 2D→3D crash: fixed (browser/3D agent final results, 2026-10-10; transcribed by coordinator)

Prepared 04-128 ZIP (review-ready 1086cb6a…), production build on pinned engine c653b913, real UI, headless Chromium 141.
Root cause: all isolates in one renderer share a ~4 GB V8 heap; the MapLibre GeoJSON worker held ~2–2.5 GB of live tiled geometry
(tolerance 0, maxzoom 22–23) alongside main (~0.9–1.6 GB), floor worker and route warmup.

| Run | Mode | Import s | 2D peak MB | 3D switch peak MB | 3D load s | Result |
|---|---|---|---|---|---|---|
| prod3 (property slimming) | desktop | 714 | 3759 | 3448 | 85 | pass |
| prod3 | mobile | 713 | 3607 | 4090 | — | crash |
| prod4 (+ hidden wall sources emptied) | desktop | 702 | 3302 | 3132 | 79 | pass |
| prod4 | mobile | 721 | 3168 | 3052 | 73 | pass |
| prod5 (+ map recreate behind Preparing overlay) | desktop | 743 | 3306 | 2091 | 80 | pass |
| prod5 | mobile | 742 | 3112 | 3062 | 88 | pass |
| prod6 (+ d6f7005 wall dedupe) | desktop | 702 | 3202 | 3100 | 106 | pass |
| prod6 | mobile | 690 | 3087 | 3078 | 76 | pass |

The step that made mobile survive: prod4 (MapLibre worker ~2.35 → ~2.0 GB). Map recreate preserves camera/selection/floor/mode (prod5 3D screenshots pixel-identical to prod4).
Wall dedupe (d6f7005): Floor 1 3D precision walls 38,556 → 14,905 features, 1.47 M → 0.55 M vertices (−62%), mesh 35.3 → 13.3 MB; Floor 2 unchanged; visually one band per wall, 07-410 one highlight.
2D selection screenshots bit-identical to prod3 (one mobile 0.12% anti-aliasing diff; desktop 2d.png captured before paint).
Open: e2e specs reading hidden wall sources via getData() not yet re-run; next memory lever (GeoJSON tolerance/maxzoom) needs owner approval.
