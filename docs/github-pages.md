# GitHub Pages

The public app is deployed from `main` by `.github/workflows/deploy-pages.yml`.
The workflow checks project types and route links, builds the static app, runs
browser import/export tests, and deploys `dist` through GitHub Pages. It also
supports a manual run from the Actions tab.

Open the project workspace at:

https://projects.ahmadjalil.com/openindoormaps/#/projects/indoor

The GitHub address redirects to the configured Pages domain:

https://ahzs645.github.io/openindoormaps/#/projects/indoor

Choose **Import project ZIP** and select `UNBC.final/UNBC.master.reviter.zip`
from your device. The source ZIP is processed locally in your browser. It is
not bundled in the public website or sent to GitHub. Export the reviewed master
to preserve edits; browser storage is a convenience, not your only backup.
The smaller `UNBC.campus-viewer.zip` also loads, but cannot regenerate a master.

Pages uses hash routes so links and refresh work without server-side rewrites.
The `pages` build mode sets `/openindoormaps/` as the default asset base. The
workflow uses `configure-pages` to select the base path, including custom domains.
Regular development and builds retain browser routes at `/`.

For local deployment checks:

```sh
npm run build:pages
npm run test:pages
```

Browser checks generate a small source-project fixture for CI. To test a real
master, set `INDOOR_PROJECT_ZIP` to its local absolute path when running
`npm run test:pages`. On another repository, override `PAGES_BASE_PATH` with
its full base path and trailing slash for both the build and browser checks.

Repository settings: the default branch is `main`; Pages publishing source is
**GitHub Actions**. The `github-pages` environment permits deployments from
`main`. Pushing new commits to `main` rebuilds and updates the public site.
