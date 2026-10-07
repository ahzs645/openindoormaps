import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { readIndoorProject } from '../../app/indoor-project/package';
import type { Map, GeoJSONSource } from 'maplibre-gl';
const input = process.env.INDOOR_PROJECT_ZIP;
const output = process.env.EASY_APPLY_SCREENSHOT_DIR ?? 'work/pinned-offices-20261005/applied/browser';
type W = typeof globalThis & { easyApplyMap: Map };
for (const mobile of [false, true]) test(`Applied pinned office geometry on ${mobile ? 'mobile' : 'desktop'}`, async ({page}) => {
  test.skip(!input, 'Provide regenerated candidate master');
  test.setTimeout(600000);
  const project = await readIndoorProject(readFileSync(input!));
  expect(project.dataset.windowDisplay?.mode).toBe('native');
  expect(project.dataset.boundaryPatchState?.regenerated).toBe(true);
  const patch = project.rooms.nativeBoundaryPatches!.patches.find(p => p.levelId === 400176 && p.wallEvidence.some(w => w.nativeElementId === 1081440))!;
  expect(patch.status).toBe('applied');
  expect(project.dataset.walls.some(w => w.reviewPatchId === patch.id)).toBe(true);
  const errors: string[] = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.setViewportSize(mobile ? {width:390,height:844} : {width:1440,height:1000});
  await page.goto('/openindoormaps/#/projects/indoor');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(r=>r.name.includes('/deps/maplibre-gl.js')))).toBe(true);
  await page.evaluate(async()=>{
    const path=performance.getEntriesByType('resource').map(r=>r.name).find(r=>r.includes('/deps/maplibre-gl.js'))!;
    const {default:lib}=await import(path), add=lib.Map.prototype.addSource;
    lib.Map.prototype.addSource=function(this:Map,...args:Parameters<Map['addSource']>){if(args[0]==='project-areas')(globalThis as W).easyApplyMap=this;return add.apply(this,args)};
  });
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import project ZIP',exact:true}).click();
  await (await chooser).setFiles(input!);
  await expect(page.locator('.project-status')).toContainText('Loaded',{timeout:90000});
  await page.getByRole('button',{name:'Room review',exact:true}).click();
  await expect(page.getByLabel('Window detail',{exact:true})).toHaveValue('native');
  await expect(page.getByTestId('enclosure-counts')).toBeVisible({timeout:300000});
  mkdirSync(output,{recursive:true});
  writeFileSync(`${output}/${mobile?'mobile':'desktop'}-coverage.txt`,await page.getByTestId('enclosure-counts').innerText());
  const detail=page.getByRole('region',{name:'Selected enclosure evidence',exact:true});
  async function select(number:string){
    await page.getByRole('button',{name:'Geometry finding',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'All places',exact:true}).click();
    await page.getByLabel('Find room enclosure',{exact:true}).fill(number);
    await page.getByRole('button',{name:`Review ${number} · Office`,exact:true}).click();
    await expect(detail).toContainText('Room block present');
    await expect(detail).toContainText('1 / 1');
  }
  async function capture(name:string){
    await expect(page.getByTestId('floor-preparation')).toBeHidden({timeout:90000});
    await page.locator('.maplibregl-canvas').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.evaluate(()=>(globalThis as W).easyApplyMap?.loaded())).toBe(true);
    mkdirSync(output,{recursive:true});
    await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-${name}.png`});
  }
  for (const number of ['03-2085','03-2017']) {
    await select(number);
    await detail.getByRole('button',{name:'2D',exact:true}).click();
    await capture(number+'-2d');
    await detail.getByRole('button',{name:'3D',exact:true}).click();
    await capture(number+'-3d');
    await detail.getByRole('button',{name:'Native heights',exact:true}).click();
    await capture(number+'-native-heights');
  }
  expect(errors).toEqual([]);
});
