# Visitor zoom and loading follow-up — 2026-10-15

The visitor viewer cancelled its selected-floor preparation when zooming below 17.5, discarded its active display, and replaced all rendering layers at the threshold. The main-floor display exceeds the 128 MiB decoded-floor LRU budget, so repeated crossings could restart the same heavy decode. A full-screen loading veil made the map appear unavailable.

The viewer now retains the selected floor and its in-flight request across ordinary zoom changes, and keeps verified detail layers mounted after decoding. The native renderer supplies its existing continuous room/wall fades. The lightweight overview also interpolates grey/circulation colours to source room colours and labels over zoom 17.5–18.5, using one unchanged precision mesh and a shader uniform updated each frame. Room preview is available before the full display. Camera state updates at zoom end rather than every animation frame. The loading notice is a small nonblocking badge; zoom controls remain visible at the top right and Fit campus is available at the top left. Explicit grey overview lock remains available.

## Loading scope and remaining cost

A recorded cold browser visit fetched only the default main-floor scope: 27 detail chunks, no other scope-only assets and no routing data. The manifest contains seven scopes. The selected scope represents three native level IDs, not every campus floor.

Main-floor detail chunks total 11.77 MB with Brotli or 13.60 MB with gzip. Overview is 1.73 MB Brotli or 2.08 MB gzip. Application code is additional. The current verified format still expands a combined 2D/3D preparation bundle (109,441,947 pooled JSON bytes; 349,125,903 logical JSON bytes) in 2D view. This change does not reduce those asset sizes or claim that a full mobile cold decode is solved. The next format optimization is a verified 2D-only per-floor payload, with 3D and navigation fetched on demand. The 9.73 MB shared binary preview is still a separate prototype and is not silently substituted for the verified visitor package.

The selected decoded floor remains retained even if it exceeds the LRU budget; switching scope releases that active reference, while the existing bounded cache policy remains unchanged.

## Verification and evidence

Evidence directory: `/workspace/scratch/unbc-zoom-fix-20261015/`.

- Production Vite build and scoped application TypeScript check passed. A broad repository check includes unrelated authoring/sibling Reviter dependencies absent from the isolated Site snapshot; it was not claimed as passing.
- Precision preview test checks source rings/holes, triangle area, unchanged positions and paint-only colour buffers.
- Desktop browser regression checks room preview, zoom buttons and wheel during loading, repeated threshold crossings with one floor worker, native layers retained at overview and intermediate zoom, and explicit overview lock without a new decode.
- Mobile regression checks touch zoom controls, visible Fit campus and absence of horizontal overflow; it does not certify completion of the large mobile detail decode.
- `network-proof.json` records the selected-floor-only requests. `browser-proof.json` records the final browser run and JavaScript/WebGL console errors.
- `package-check.json` verifies all 228 encoded representations, unchanged manifest SHA `d66391226d7412a94af32439cb6d69f10a192b2def5a80a4ec8ae798da4f8472`, revision `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`, and preparation engine SHA `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.

No canonical dataset, source geometry, room identity, access policy or navigation evidence changed. All 28 held stair links remain disabled; this UI work grants no new route admission.

The existing private Site is updated in place. Deployment version/commit are recorded separately in `deployment-receipt.json` in the evidence directory. The binary preview link and its data are preserved.
