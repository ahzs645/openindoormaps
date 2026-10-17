# UNBC published package download

The full viewer now exposes **Download latest map ZIP** before map import
finishes. It opens a lightweight download page in another tab, keeping the map
session available. The direct hosted entry is `/download/`.

The download page revalidates the current package descriptor, verifies each
content-addressed part and the assembled ZIP, then offers an explicit Save link.
It displays the filename, decimal MB size and SHA-256; supports cancellation,
retry and checking for a newer package; and releases generated Blob URLs.
It does not import the project, prepare floors, construct a graph or start any
workers. Personal viewer preferences remain browser settings.

This viewer release does not change the published map geometry. The visitor
package is 45,290,239 bytes, SHA-256
`6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`,
exported 2026-10-15T15:35:28.571Z. The original geometry regeneration continues
separately. All held stair links and the previous seven exclusion defaults
remain unchanged. The authoring master is not this visitor download.

Validation: eight hosted transport tests, scoped TypeScript and the production
Pages build passed. Real desktop/mobile Chromium downloaded and saved the ZIP
with matching full length/hash, tested rechecking, verified no download-page
workers or floor/route assets, and captured the download controls. A separate
synthetic cancellation check followed by a real retry passed. The publication
checker passed on ordinary local URLs and its cache-refresh action. Existing
235 data/binary files are byte-identical; the ordered 179-module preparation
binding is unchanged. Protected 955/1031 source/configuration hashes match.

This bounded UI/download verification does not repeat full-campus geometry or
route acceptance; the prior version's hallway/lift browser evidence remains
applicable to its unchanged routing source and map data. Cold navigation latency
and physical-phone performance are not improved or certified by this change.

An asset-only follow-up retains 39 prior small assets (5,889,112 bytes) so
already-open UNBC tabs can finish their previous dynamic imports and workers.
The prior full/compact UNBC page modules evaluate successfully against the
retained dependency closure, and every restored file matches its original bytes.
The unrelated old 14.55 MB hospital data module is not duplicated; the current
hospital module remains available. The hosted total stays below 256 MiB.
No application source, map data, preparation binding or routing implementation
changes in this follow-up; the existing download browser acceptance is retained.
