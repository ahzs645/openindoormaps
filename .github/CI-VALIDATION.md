# Validation scope and local commands

Indoor checks run once for feature PRs or deliberate manual runs; main still validates and publishes through deploy-pages.yml. Both now use the same pinned compiler revision. No routing, browser, campus-map or artifact tests were removed.

## Local entry points

```sh
npm ci
npm ci --prefix ../reviter
npx tsc -p tsconfig.indoor-project.json
# Routing/campus tests: exact commands in indoor-checks.yml.
npm run build:pages
npm run test:pages
```

Feature branches without an open PR use local commands. A local pass does not replace validation of the submitted revision. Main/release publication keeps the workflow's existing authorization and artifact conditions.

CI optimization batch: November 7, 2026. Workflow syntax and focused orchestration/selection checks are separate from complete application, native-platform and research validation.
