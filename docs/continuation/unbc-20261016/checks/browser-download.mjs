import { chromium, expect } from '/workspace/openindoormaps/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'qa/browser');
await fs.mkdir(out,{recursive:true});
const origin='http://127.0.0.1:8956';
const published=JSON.parse(await fs.readFile(path.join(root,'qa-preview/data/unbc-full/project.json'),'utf8'));
const url='/openindoormaps/#/projects/indoor?package=%2Fdata%2Funbc-full%2Fproject.json&manifest=%2Fdata%2Funbc%2Fmanifest.json&preview=%2Fbinary%2F&view=2d';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--disable-dev-shm-usage']});
const outcomes=[];
try {
  for(const device of ['desktop','mobile']) {
    const errors=[],requests=[];
    const context=await browser.newContext({viewport:device==='desktop'?{width:1440,height:1000}:{width:390,height:844},isMobile:device==='mobile',hasTouch:device==='mobile',acceptDownloads:true,timezoneId:'America/Vancouver'});
    await context.addInitScript(()=>{
      window.__downloadWorkers=[];
      const Native=window.Worker;
      window.Worker=new Proxy(Native,{construct(target,args,newTarget){window.__downloadWorkers.push(String(args[0]));return Reflect.construct(target,args,newTarget);}});
    });
    const map=await context.newPage();map.setDefaultTimeout(45000);
    await map.goto(origin+url);
    const link=map.getByRole('link',{name:'Download latest map ZIP',exact:true});
    await expect(link).toBeVisible();
    await map.screenshot({path:path.join(out,device+'-viewer-download-link.png')});
    const popup=context.waitForEvent('page');await link.click();
    const page=await popup;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>requests.push(r.url()));
    await map.close(); // Targeted header test only; do not repeat map preparation.
    await page.waitForLoadState();
    await expect(page.getByRole('heading',{name:'Download the latest published map'})).toBeVisible();
    await page.getByRole('button',{name:'Prepare latest map ZIP'}).click();
    await expect(page.getByRole('status')).toHaveText('Package verified. Save the ZIP below.',{timeout:60000});
    const save=page.getByRole('link',{name:'Save UNBC.campus-viewer.zip · 45.29 MB',exact:true});
    await expect(save).toBeVisible();
    await page.getByText('Package fingerprint',{exact:true}).click();
    await expect(page.locator('code')).toHaveText(published.sha256);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(out,device+'-verified-download.png'),fullPage:true});
    const event=page.waitForEvent('download');await save.click();const download=await event;
    assert.equal(download.suggestedFilename(),published.fileName);
    const destination=path.join(out,device+'-'+published.fileName);await download.saveAs(destination);
    const bytes=await fs.readFile(destination);
    assert.equal(bytes.length,published.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),published.sha256);
    assert.deepEqual(await page.evaluate(()=>window.__downloadWorkers),[],'Downloading must not initialize any worker');
    assert(!requests.some(x=>/\/data\/unbc\/(?!full)|worker-|\.wasm/.test(new URL(x).pathname)),'Download page must not prepare floors or routing');
    const initialRequests=requests.slice();
    await page.getByRole('button',{name:'Check for a newer package'}).click();
    await expect(page.getByRole('status')).toHaveText('Package verified. Save the ZIP below.',{timeout:60000});
    assert.equal(requests.filter(x=>new URL(x).pathname==='/data/unbc-full/project.json').length,2,'Explicit newer-package check revalidates the descriptor');
    assert.deepEqual(errors,[]);
    outcomes.push({device,passed:true,zipBytes:bytes.length,zipSha256:published.sha256,workers:[],initialRequests,downloadOnly:true,recheck:true});
    await context.close();
  }
  // Synthetic cancellation guard only; successful downloads above use real assets.
  const page=await browser.newPage();await page.goto(origin+'/openindoormaps/#/projects/download?package=%2Fdata%2Funbc-full%2Fproject.json');
  await expect(page.getByRole('heading')).toBeVisible();
  await page.route('**/data/unbc-full/project.json',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue().catch(()=>{});});
  await page.getByRole('button',{name:'Prepare latest map ZIP'}).click();
  await page.getByRole('button',{name:'Cancel download',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Download cancelled. You can try again.');
  await expect(page.getByRole('link',{name:/^Save /})).toHaveCount(0);
  await page.unroute('**/data/unbc-full/project.json');
  await page.getByRole('button',{name:'Prepare latest map ZIP'}).click();
  await expect(page.getByRole('status')).toHaveText('Package verified. Save the ZIP below.',{timeout:60000});
  outcomes.push({case:'synthetic-cancellation-and-real-retry',passed:true});
} finally {
  await browser.close();
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:outcomes.length===3&&outcomes.every(x=>x.passed),scope:'Consolidated GitHub main build: targeted real desktop/mobile download and header link, ZIP integrity, no download-page map/route preparation; synthetic cancellation explicitly separated. Viewer header closed before full import. No new floor/render/routing acceptance claimed.',outcomes},null,2)+'\n');
}
