# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: published-visitor-plan.spec.ts >> actual compact plan rejects a corrupt carrier and retries the checked floor
- Location: tests/e2e/published-visitor-plan.spec.ts:218:1

# Error details

```
Error: locator.click: Test ended.
Call log:
  - waiting for getByRole('button', { name: 'Retry floor', exact: true })
    - locator resolved to <button>Retry floor</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <canvas width="988" tabindex="0" height="655" role="region" aria-label="Map" class="maplibregl-canvas" data-engine="three.js r185"></canvas> from <div data-testid="map-canvas-root" class="relative size-full overflow-hidden">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <canvas width="988" tabindex="0" height="655" role="region" aria-label="Map" class="maplibregl-canvas" data-engine="three.js r185"></canvas> from <div data-testid="map-canvas-root" class="relative size-full overflow-hidden">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    320 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <canvas width="988" tabindex="0" height="655" role="region" aria-label="Map" class="maplibregl-canvas" data-engine="three.js r185"></canvas> from <div data-testid="map-canvas-root" class="relative size-full overflow-hidden">…</div> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms

```

# Test source

```ts
  158 |     expect(
  159 |       requests.filter((url) =>
  160 |         ["prepared-chunk", "presentation-context", "routing"].includes(
  161 |           known.get(url) ?? "",
  162 |         ),
  163 |       ),
  164 |     ).toEqual([]);
  165 |     expect(
  166 |       workers.filter((url) =>
  167 |         /progressive-floor|floor-display|native-explore/.test(url),
  168 |       ),
  169 |     ).toEqual([]);
  170 |     await page.screenshot({
  171 |       path: test.info().outputPath("compact-cold-painted.png"),
  172 |     });
  173 |     const second = [...receipts]
  174 |       .filter((receipt) => receipt.scopeId !== manifest.defaultScopeId)
  175 |       .sort((a, b) => a.compressedBytes - b.compressedBytes)[0];
  176 |     expect(second).toBeTruthy();
  177 |     await page
  178 |       .getByLabel("Floor", { exact: true })
  179 |       .selectOption(second.scopeId);
  180 |     await ready(page);
  181 |     expect(requests.includes(new URL(second.url, manifestUrl!).href)).toBe(
  182 |       true,
  183 |     );
  184 |     await page
  185 |       .getByLabel("Floor", { exact: true })
  186 |       .selectOption(manifest.defaultScopeId);
  187 |     await ready(page);
  188 |     expect(
  189 |       requests.filter((url) =>
  190 |         ["prepared-chunk", "presentation-context", "routing"].includes(
  191 |           known.get(url) ?? "",
  192 |         ),
  193 |       ),
  194 |     ).toEqual([]);
  195 |     // Map-data requests are unavailable; the already loaded app remains online.
  196 |     // This checks persistent map caching, not service-worker app installation.
  197 |     const mapDirectory = new URL(".", manifestUrl!).href;
  198 |     await page.route(`${mapDirectory}**`, (route) =>
  199 |       route.abort("internetdisconnected"),
  200 |     );
  201 |     await page
  202 |       .getByRole("button", { name: "Open saved map", exact: true })
  203 |       .click();
  204 |     await ready(page);
  205 |     await expect(
  206 |       page.getByText("Using the saved map revision.", { exact: true }),
  207 |     ).toBeVisible();
  208 |     await page
  209 |       .getByLabel("Floor", { exact: true })
  210 |       .selectOption(second.scopeId);
  211 |     await ready(page);
  212 |     await page.screenshot({
  213 |       path: test.info().outputPath("compact-cached-floor.png"),
  214 |     });
  215 |     expect(errors).toEqual([]);
  216 |   });
  217 | 
  218 | test("actual compact plan rejects a corrupt carrier and retries the checked floor", async ({
  219 |   page,
  220 | }) => {
  221 |   test.skip(!manifestUrl, "Supply a matching real compiled plan publication.");
  222 |   test.setTimeout(300_000);
  223 |   const { manifest, receipts, known } = await source();
  224 |   const receipt = receipts.find(
  225 |     (entry) => entry.scopeId === manifest.defaultScopeId,
  226 |   )!;
  227 |   let corrupt = true;
  228 |   const requests: string[] = [];
  229 |   page.on("request", (request) => requests.push(request.url()));
  230 |   await page.addInitScript(() =>
  231 |     localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  232 |   );
  233 |   await page.route(new URL(receipt.url, manifestUrl!).href, (route) =>
  234 |     corrupt
  235 |       ? route.fulfill({
  236 |           status: 200,
  237 |           contentType: "application/octet-stream",
  238 |           body: "invalid checked plan",
  239 |         })
  240 |       : route.continue(),
  241 |   );
  242 |   await page.goto(
  243 |     `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  244 |   );
  245 |   await expect(page.getByRole("alert")).toContainText("checksum", {
  246 |     timeout: 180_000,
  247 |   });
  248 |   await expect(page.locator(".visitor-map")).toHaveAttribute(
  249 |     "data-floor-plan",
  250 |     "false",
  251 |   );
  252 |   expect(
  253 |     requests.filter((url) =>
  254 |       ["prepared-chunk", "presentation-context"].includes(known.get(url) ?? ""),
  255 |     ),
  256 |   ).toEqual([]);
  257 |   corrupt = false;
> 258 |   await page.getByRole("button", { name: "Retry floor", exact: true }).click();
      |                                                                        ^ Error: locator.click: Test ended.
  259 |   await ready(page);
  260 | });
  261 | 
  262 | test("actual compact room pick, route overlay and explicit 3D round trip retain the floor", async ({
  263 |   page,
  264 | }) => {
  265 |   test.skip(
  266 |     !manifestUrl,
  267 |     "Supply a matching real compiled UNBC plan publication.",
  268 |   );
  269 |   test.setTimeout(1_200_000);
  270 |   const { manifest, receipts, shell } = await source();
  271 |   const errors: string[] = [];
  272 |   page.on("pageerror", (error) => errors.push(error.message));
  273 |   await page.setViewportSize({ width: 1440, height: 1000 });
  274 |   await page.addInitScript(() =>
  275 |     localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  276 |   );
  277 |   await page.goto(
  278 |     `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  279 |   );
  280 |   await ready(page);
  281 |   const start = shell.records.find(
  282 |     (record) =>
  283 |       record.number === (process.env.PROGRESSIVE_ROUTE_START ?? "05-136"),
  284 |   )!;
  285 |   const end = shell.records.find(
  286 |     (record) =>
  287 |       record.number === (process.env.PROGRESSIVE_ROUTE_END ?? "05-173"),
  288 |   )!;
  289 |   expect(start?.geographic).toBeTruthy();
  290 |   expect(end).toBeTruthy();
  291 |   await page.getByLabel("Find a place", { exact: true }).fill(start.number);
  292 |   await page
  293 |     .getByRole("button", { name: `${start.number} ${start.name}`, exact: true })
  294 |     .click();
  295 |   await ready(page);
  296 |   await expect(page.locator(".visitor-map")).toHaveAttribute(
  297 |     "data-zoom",
  298 |     "20.00",
  299 |   );
  300 |   const bounds = (await page.locator(".maplibregl-canvas").boundingBox())!;
  301 |   const mercatorY = (latitude: number) =>
  302 |     (1 -
  303 |       Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) /
  304 |     2;
  305 |   const scale = 512 * 2 ** 20;
  306 |   const target = shell.records
  307 |     .flatMap((record) => {
  308 |       if (
  309 |         record.key === start.key ||
  310 |         !record.number ||
  311 |         !record.geographic ||
  312 |         record.levelId !== start.levelId ||
  313 |         record.circulation ||
  314 |         record.stair ||
  315 |         !record.walkable
  316 |       )
  317 |         return [];
  318 |       const dx = ((record.geographic[0] - start.geographic![0]) / 360) * scale;
  319 |       const dy =
  320 |         (mercatorY(record.geographic[1]) - mercatorY(start.geographic![1])) *
  321 |         scale;
  322 |       return Math.abs(dx) < bounds.width / 2 - 30 &&
  323 |         Math.abs(dy) < bounds.height / 2 - 30 &&
  324 |         Math.hypot(dx, dy) > 150
  325 |         ? [{ record, dx, dy }]
  326 |         : [];
  327 |     })
  328 |     .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];
  329 |   expect(
  330 |     target,
  331 |     "Require a real neighboring room inside the camera for map picking",
  332 |   ).toBeTruthy();
  333 |   await page.locator(".maplibregl-canvas").click({
  334 |     position: {
  335 |       x: bounds.width / 2 + target.dx,
  336 |       y: bounds.height / 2 + target.dy,
  337 |     },
  338 |   });
  339 |   await expect
  340 |     .poll(async () => {
  341 |       const selected = await page.getByTestId("selected-place").textContent();
  342 |       const expected = `${target.record.number} ${target.record.name}`;
  343 |       if (selected?.includes(expected)) return true;
  344 |       const choicePanel = page.getByRole("region", {
  345 |         name: "Choose a place",
  346 |         exact: true,
  347 |       });
  348 |       const choices =
  349 |         (await choicePanel.count()) > 0 ? await choicePanel.textContent() : "";
  350 |       return `${selected} ${choices}`.includes(
  351 |         `${target.record.number} ${target.record.name}`,
  352 |       );
  353 |     })
  354 |     .toBe(true);
  355 |   await page.getByLabel("Find a place", { exact: true }).fill(start.number);
  356 |   await page
  357 |     .getByRole("button", { name: `${start.number} ${start.name}`, exact: true })
  358 |     .click();
```