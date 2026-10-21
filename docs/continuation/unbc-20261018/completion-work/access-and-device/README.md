# Access and physical-device completion work

The software can calculate diagnostic routes while access remains unknown. This pack adds a separate, stricter gate for advertising confirmed-public or step-free routes; it changes no runtime routing rule and grants no access. It also preserves the original identity-specific decisions and prepares the evidence needed to finish venue and real-phone qualification.

## Completed

- Inventoried the actual accepted dataset against the preserved source annotations: 1,864 room records, four public, eight staff and 1,852 unknown. All twelve explicit flags match their original annotations. No unknown record was made public.
- Preserved the exact four public/eight staff scopes and staff-zone boundary in [preserved-policy-scopes.md](preserved-policy-scopes.md) and [preserved-access-inventory.json](preserved-access-inventory.json), with model/dataset/room-entry and identity geometry hashes.
- Recovered the immutable original Hall A–Q authorization. Scope recovery is documented in [hall-a-q-recovery.md](hall-a-q-recovery.md); the temporary letter-to-source mapping remains unresolved and no letter has been guessed.
- Created a source-bound [room-access checklist](missing-access-review.csv) for all 1,852 unknown records and [step-free checklist](missing-step-free-review.csv) for all 7,030 unknown edges. Blank approval fields are deliberate. A historical route-owner priority is only a triage hint, not a current path or permission assertion.
- Extracted a smaller [current route-owner review list](current-route-access-priority.csv) from ten actual production-worker baseline cases: 137 unique reported unknown owners, all resolved to the preserved source identities. Its [binding receipt](current-route-access-priority.json) pins the original result file and dataset/engine hashes. The result's owner census is a policy-review priority, not proof that every listed room was physically traversed or approved; all 1,852 source access values remain unknown.
- Added and tested a reusable access-only audit that accepts route requests, loads the real source package and uses the current route calculator. It checks actual source owners and physical door dependencies, and refuses unowned connections. Step-free qualification additionally requires confirmed current source-edge evidence. Seven unit tests pass; the owned scripts/tests pass lint. The global typecheck passed during this work; final integration checks must cover the frozen release.
- Checked [official UNBC context](official-sources.md) without inferring blanket public access or unread measurements.
- Inventoried actual device capabilities and prepared the [physical-device protocol](physical-device-protocol.md) and [result template](physical-device-result-template.json). No connected physical phone or completed physical-device test was observed.

## Exact access audit

Run from the repository root against a frozen candidate and its actual SHA-256:

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-advertised-route-access.ts \
  SOURCE.zip EXPECTED_SHA256 ROUTE_CASES.json NEW_REPORT.json
```

The request schema matches `systemic-pathways/route-cases.json`: unique `id`, actual `from`/`to` room keys, `mode` public or accessible and supported optional routing options. A caller cannot supply an asserted successful path or public owner list. The CLI verifies package/case hashes and the compiled engine binding before/after, refuses stale sources, writes a new report and returns exit status 1 when any advertised profile lacks confirmed access. It records `geometryAuthority:false`, `operationalHoursAuthority:false` and `physicalDeviceAuthority:false`; passing access alone cannot be promoted to full release approval.

[advertised-route-access.json](advertised-route-access.json) pins the accepted ZIP SHA-256 `09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a` and dataset `87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b`. Its thirteen requests all have unresolved endpoint access and are refused before graph warming: `routesComputed:0`, `advertisedAccessPassed:false`. This is an access qualification refusal, not a claim that thirteen physical routes were attempted and failed. Regenerate the audit against the next exact candidate after any source/engine change.

## Remaining evidence

1. Recover the original Q3.4 Hall A–Q legend or question-renderer data and bind each approved letter to the stable identity or exact native polygon it described. Existing authorization is preserved; it does not need to be requested again. The private artifact's page shell is reachable but its content endpoint returns 401 in this environment.
2. Obtain venue-authorized audience/hours and step-free evidence for the actual endpoints and source dependencies of each route selected for confirmed advertising. Review the smaller selected release scope first; the complete unknown checklists prevent silent gaps in later expansion. Public hallway authorization alone does not establish the destination room's audience or schedule.
3. Execute and record the frozen-release protocol on actual phones and separately verify on-campus route/access facts. Cloud browser/mobile viewport tests do not fill these fields.

The capability and access reports do not modify the source, certify geometry or claim a completed physical test. No external messages were sent.
