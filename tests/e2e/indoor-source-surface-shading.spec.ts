import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { Map } from 'maplibre-gl';
type W = typeof globalThis & { sourceShadingMap: Map };
const input = process.env.INDOOR_PROJECT_ZIP;
const output = process.env.SOURCE_SHADING_SCREENSHOT_DIR ?? 'work/source-surface-shading/browser';
for (const mobile of [false, true]) test(`Source slab shading at multiple zooms on ${mobile ? 'mobile' : 'desktop'}`, async ({page}) => {
  test.skip(!input, 'Provide the reviewed master');
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(mobile ? {width:390,height:844} : {width:1440,height:1000});
  await page.goto('/openindoormaps/#/projects/indoor');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('/deps/maplibre-gl.js')))).toBe(true);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(r => r.name).find(r => r.includes('/deps/maplibre-gl.js'))!;
    const {default: lib} = await import(path), add = lib.Map.prototype.addSource;
    lib.Map.prototype.addSource = function(this: Map, ...args: Parameters<Map['addSource']>) {
      if (args[0] === 'project-areas') (globalThis as W).sourceShadingMap = this;
      return add.apply(this, args);
    };
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import project ZIP',exact:true}).click();
  await (await chooser).setFiles(input!);
  await expect(page.locator('.project-status')).toContainText('Loaded',{timeout:90000});
  await page.getByRole('button',{name:'Review project',exact:true}).click();
  await page.getByLabel('Project floor',{exact:true}).selectOption('storey:400176+1487353');
  await expect(page.getByTestId('floor-preparation')).toBeHidden({timeout:90000});
  await expect.poll(() => page.evaluate(() => (globalThis as W).sourceShadingMap?.loaded())).toBe(true);
  await page.getByRole('button',{name:'Review pin 37',exact:true}).click();
  await page.getByRole('button',{name:'Source model',exact:true}).click();
  await expect(page.getByText('Native 3D model · selected floor section',{exact:false})).toBeVisible({timeout:90000});
  await page.getByRole('button',{name:'Show pin on map',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (globalThis as W).sourceShadingMap?.getZoom()), {timeout:10000}).toBeGreaterThan(21.9);
  await expect.poll(() => page.evaluate(() => (globalThis as W).sourceShadingMap?.isMoving())).toBe(false);
  mkdirSync(output,{recursive:true});
  for (let zoom = 0; zoom < 3; zoom++) {
    if (zoom) await page.getByRole('button',{name:'Zoom out',exact:true}).click();
    await page.locator('.maplibregl-canvas').scrollIntoViewIfNeeded();
    // Wait for the map's camera transition to finish before the visual evidence.
    await expect.poll(() => page.evaluate(() => (globalThis as W).sourceShadingMap?.isMoving())).toBe(false);
    expect(await page.evaluate(() => (globalThis as W).sourceShadingMap.getZoom())).toBeGreaterThan(19);
    await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-source-zoom-${zoom}.png`});
  }
  await page.getByRole('button',{name:'Full model context',exact:true}).click();
  await expect(page.getByText('Full native 3D model · no floor clipping',{exact:false})).toBeVisible({timeout:90000});
  await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-full-context.png`});
  expect(errors).toEqual([]);
});
