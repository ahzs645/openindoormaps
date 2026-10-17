# Hosted project manifest revalidation — 2026-10-16

`fetchHostedProject` now requests mutable `project.json` with `cache: "no-cache"`, asking the HTTP cache to revalidate that descriptor before its package identity is used. The request retains the original AbortSignal. Content-addressed `parts/<sha256>.bin` requests and their existing cache policy are unchanged. Verified saved ZIP bytes still avoid every part download after the manifest and complete saved-byte hash are checked.

The new fetch-spy regression failed against the original source (`cache` was undefined), then passed with the one-line source change. **6/6 hosted-project tests pass**, including fresh and saved-byte paths, signal identity on every request, progress, corrupt part/whole archive rejection, unsafe path/size refusal and cancellation. Scoped strict TypeScript also passed. Tests establish request semantics; they do not prove freshness in a hosted browser or CDN.

Both edited files are outside the **946-file** active compiler freeze and the official preparation closure. A read-only check found zero frozen-file changes, an identical **193-module** engine graph (`5c3c7e4c…`) and byte-identical generated engine source compared with its retained frozen before-image. No Vite build or engine-binding writer ran for this fix; no publication pins, geometry, validation or access policy changed.

Source and test before/after bytes, exact patch, failed-before/passed-after logs, TypeScript configuration and freeze proof are indexed in [hosted-manifest-revalidation-evidence/evidence-index.json](hosted-manifest-revalidation-evidence/evidence-index.json).

```sh
node --import tsx --test tests/unit/hosted-project.test.ts
node --max-old-space-size=1024 node_modules/typescript/bin/tsc --project /workspace/scratch/unbc-pathway-repair-20261015/hosted-manifest-revalidation-qa/tsconfig.scoped.json --pretty false
```
