# Visitor review controls — 2026-10-16

The full viewer now hides its **Room review** entry and outer author inspector for a genuine campus-viewer package. This closes a path that could expose **Review connection** after entering room review. Author projects keep those controls. The public connector card, Walking / Step-free menu, ordinary place selection and combined-floor code remain unchanged.

Hosted startup determines viewer identity from the checked **inner ZIP manifest** (`format: openindoormaps-viewer`), not the filename or the progressive manifest URL. Successful import resets review/editing state to false. Missing fast-import admission runs complete normal import and preserves that viewer identity; it does not turn a visitor ZIP into an author package. Current visitor directions use Walking / Step-free. The old Public review wording belongs to the author Route test section. An older deployed bundle may differ; this change has not been built or deployed.

The original leak was separate from startup: the Room review entry accepted any project, including viewers. Its right-hand inspector lacked a viewer guard and supplied the optional callback that causes the native stair inspector to render Review connection. The fix adds the same `!isViewerProject(project)` predicate at those **two page gates only**.

Verification uses **simulated React DOM with happy-dom**, actual page JSX gates/handlers and the actual native stair inspector's source. Controlled connection metadata and an auxiliary child replace physical/map dependencies. Before the change both visitor controls fail their absence assertions; the author open/connection-callback/close control passes. After the change **all three cases pass**, including a viewer with stale review state. Peak process RSS was **144,344 KiB**, under the invocation's 384 MiB old-space cap. This is not full-app/WebGL/browser/mobile or source-route proof.

Before editing, the actual page path was checked against the runtime955, official195-module snapshot, current899-file planner inventory, door291, drawing291/292 and boundary294 algorithm inventories, plus seven additionally protected app files. Every protected byte/hash remained unchanged afterward. The page is outside all those inventories. A complete source comparison confirms that only the two explicit guards changed; all other page bytes, including public selection and floor behavior, remain exact. Full-page syntax transpilation reports no diagnostics; no full-project typecheck, Vite build or engine writer was run during the active compiler freeze.

Actual page: `app/pages/indoor-project-page.tsx`.

- Before SHA256: `e47563f1f68490f299066e8d2d9c81416dcd936d833a06d8ae37d68ccd990380`.
- After SHA256: `48dcb47bd49befdd1e5f38c0702816c450b14024f2e75a13c79c7e4c98d26f50`.
- Complete before-image, exact patch, reusable DOM regression, before/after protected inventories and receipt: `/workspace/scratch/unbc-pathway-repair-20261015/visitor-ui-gating-audit/`.

Reproduce the bounded component check without a build:

```sh
node --max-old-space-size=384 /workspace/scratch/unbc-pathway-repair-20261015/visitor-ui-gating-audit/dom-regression.mjs
```

The release still requires a fresh matching app build, staged browser/worker checks and deliberate adoption. No current deployment or final R2 route success is asserted by this UI fix.
