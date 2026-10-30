# Visitor preferences and worker verification

The compact visitor can now explicitly allow paths through other rooms.
Its default is hallway-only transit with inside-room arrival. The full viewer
and compact visitor preserve that preference in the exact `roomTransit=1`
link parameter. Changing it clears directions, cancels pending work and rejects
stale responses before the next calculation.

Both the client and worker accept only arrival mode and ordinary-room transit.
They reject source overrides, access policies and compiler flags. The worker
still performs the normal physical/access calculation and keeps hallway
preference. Allowing room transit does not make a staff area public or certify
unknown step-free edges. Existing warnings stay visible.

## Verification retained here

- 36 named visitor/decoder tests passed; one existing optional real-companion
  fixture test was skipped because that separate fixture was not supplied.
- Scoped strict TypeScript passed. ESLint reported zero errors and twelve
  existing warnings outside the changed lines of the full viewer page.
- The production Pages build passed and refreshed all three generated runtime
  bindings. Its existing bundle-size warnings remain in the log.
- Five browser cases passed against that build, including desktop and mobile
  calculations through the actual bundled progressive route worker.

The screenshots use an explicitly synthetic three-room routing source. They
prove that default hallway-only refusal, opt-in walking, uncertainty disclosure,
preference clearing, strict step-free refusal, search, link reload and retry
work in the interface. They are **not UNBC geometry or route acceptance**.
The complete UNBC normal/production-worker replay is recorded separately under
`../connections`.

Run the browser cases after installing the pinned dependencies and Chromium:

```sh
npm run build:pages
npx playwright test --config playwright.visitor-flow.config.ts
```

An existing compatible Chromium binary can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The configuration starts the built Pages
preview on port 42554 and runs one worker. The source fixture is generated with
the current runtime bindings; no old acceptance receipt is reused.

## Deployment compatibility

The display-engine, route-runtime and visitor-plan bindings changed. Existing
progressive manifests tied to the previous display engine are rejected; they
must be regenerated with their floor assets. Route/plan receipts must likewise
be rebuilt and verified for any publication. Updating an application bundle
alone does not publish a compatible UNBC map. No Site or visitor publication was
changed by this worktree experiment.

The review-companion decoder change avoids an intermediate numeric array while
retaining the same input validation, decompression bounds, checksums and bytes.
It is not a fix for the native compiler's worker-pool memory scaling.
