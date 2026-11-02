# UNBC final candidate — preservation bundle (November 2, 2026)

These are the actual tested bytes of the final development candidate. It has
not been accepted for release or published.

| Path                                                                 | What                                                                                                            | SHA-256                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `master/UNBC.master.06-388-link.reviter.zip`                         | Corrected authoring master (06-388 reviewed link)                                                               | `6e7971f8917dafa639afa2e1523a5b1ad48aac55ef5d9db9827162335c47f903` |
| `candidate/PREPARED-ROUTING.json`                                    | Guide catalog, 2,728 guides                                                                                     | `1c3011ffbda15b1f38dd0ecaee52bbbd39f3133622c3d76cff16fb87c2f4487c` |
| `candidate/UNBC.shared-pathways.candidate.reviter.zip`               | Exported candidate (master + catalog)                                                                           | `32c395e1af62235543e69effb91645a76111a6f37cfcf6c5bfd7e7bcd0db85dd` |
| `visitor/progressive.independent-e60634aa8d3e628d.campus-viewer.zip` | Independent visitor; `viewer/indoor.json` is `6abc227a4529df7e33611567273349e8b227f179cb4940eed1b30aa2e06d4559` | `e60634aa8d3e628d3802a940168666a89ca8d003f1b4a7d80115a604701aff8c` |
| `progressive-export/progressive/`                                    | Progressive export, 7 scopes, revision `fa6d2935…`; `manifest.json` is `cd2c48f9…`                              | see `SHA256SUMS`                                                   |
| `directions-cache/`                                                  | Hydrated directions carrier `3d27eaa5…`, its receipt and proof                                                  | see `SHA256SUMS`                                                   |
| `plans/`                                                             | Seven checked 2D plan carriers and their proof                                                                  | see `SHA256SUMS`                                                   |
| `admission/`                                                         | Progressive-floor (gate 4) and plan (gate 5) admission reports and receipts                                     | see `SHA256SUMS`                                                   |

Source code: OpenIndoorMaps `claude/dazzling-curie-id7wh1` at `233bee9` and
Reviter `claude/dazzling-curie-id7wh1` at `2e7875d`. The receipts admitted in
code are in `app/indoor-project/published-*-receipts.ts` on that branch. That
branch has not been merged to `main`.

## Restore

The bundle is split into numbered parts. Put all parts in one folder, then:

```sh
sha256sum -c PARTS.SHA256SUMS
cat unbc-final-20261102.tar.part-* > unbc-final-20261102.tar
tar -xf unbc-final-20261102.tar
cd unbc-final-20261102 && sha256sum -c SHA256SUMS
```

To serve the visitor locally, make a public root with `openindoormaps/` (a
`vite build --mode pages` of the source revision above), `data/unbc` pointing
at `progressive-export/progressive`, `data/unbc-routing/` holding the
directions carrier, and `data/unbc-plans/` holding the plan carriers. See
`docs/continuation/unbc-20261102/plans/tools/build-public-root.sh` in the
repository.
