import {createRequire} from 'node:module';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
const require=createRequire('/workspace/openindoormaps/package.json');
const {chromium,expect}=require('@playwright/test');
const output='/workspace/scratch/unbc-repairs-20261017/browser-door-approaches';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
page.on('console',m=>{if(m.text().startsWith('[oim-diag]')) console.log(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('oim:diagnostics','1');
 const Original=Worker;globalThis.pathProbe={requests:[],diagnostics:[]};
 globalThis.Worker=class extends Original {
  constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.diagnostic)globalThis.pathProbe.diagnostics.push(e.data.diagnostic);});}
  postMessage(message,...args){globalThis.pathProbe.requests.push({kind:message?.kind,type:message?.type,levelIds:message?.levelIds,requestId:message?.requestId,start:message?.start,end:message?.end});return super.postMessage(message,...args);}
 };
});
try {
 await page.goto('http://127.0.0.1:42177/openindoormaps/#/projects/indoor?view=2d&paths=1');
 const asset=(await readdir('/workspace/openindoormaps/dist/assets')).find(n=>/^maplibre-.*\.js$/.test(n));
 await page.evaluate(async src=>{const lib=(await import(src)).t();const original=lib.Map.prototype.addSource;lib.Map.prototype.addSource=function(...args){globalThis.pathTestMap=this;return original.apply(this,args);};},'/openindoormaps/assets/'+asset);
 await page.locator('input[type=file]').setInputFiles('/workspace/scratch/unbc-straight-hallway/UNBC.straight-hallways.campus-viewer.zip');
 await expect(page.getByRole('status').filter({hasText:'Loaded'})).toBeVisible({timeout:900000});
 await page.getByLabel('Search indoor map',{exact:true}).fill('05-411');
 await page.getByRole('button',{name:/^05-411 ·/}).click();
 await expect(page.getByRole('progressbar',{name:/^Preparing /})).toBeHidden({timeout:900000});
 await expect.poll(()=>page.evaluate(()=>globalThis.pathTestMap?.getLayer('project-network-approach-line')?globalThis.pathTestMap.queryRenderedFeatures({layers:['project-network-approach-line']}).length:0),{timeout:120000}).toBeGreaterThan(0);
 const styles=await page.evaluate(async()=>{const m=globalThis.pathTestMap;const source=await m.getSource('project-network').getData();return {trunk:m.getLayer('project-network-line'),approach:m.getLayer('project-network-approach-line'),renderedTrunks:m.queryRenderedFeatures({layers:['project-network-line']}).length,renderedApproaches:m.queryRenderedFeatures({layers:['project-network-approach-line']}).length,sourceRoles:source.features.reduce((a,f)=>(a[f.properties.role]=(a[f.properties.role]??0)+1,a),{})};});
 expect(styles.approach.paint['line-dasharray']).toEqual([0.5,2]);
 expect(styles.approach.paint['line-color']).not.toEqual(styles.trunk.paint['line-color']);
 await page.getByRole('button',{name:'All places',exact:true}).click();
 await page.getByRole('button',{name:'Map preferences',exact:true}).click();
 const checkbox=page.getByRole('checkbox',{name:'Show hallway paths',exact:true});
 await expect(checkbox).toBeChecked();
 await expect(page.getByLabel('Hallway path legend',{exact:true})).toBeVisible();
 await page.screenshot({path:output+'/desktop-legend.png'});
 const before=await page.evaluate(()=>globalThis.pathProbe.requests.length);
 for(let i=0;i<3;i++){
  await checkbox.uncheck();expect(new URL(await page.url()).hash).not.toContain('paths=1');
  await expect.poll(()=>page.evaluate(()=>globalThis.pathTestMap.getLayoutProperty('project-network-approach-line','visibility'))).toBe('none');
  await checkbox.check();expect(new URL(await page.url()).hash).toContain('paths=1');
 }
 await page.waitForTimeout(1500);
 const after=await page.evaluate(()=>globalThis.pathProbe.requests.length);
 expect(after,'path toggles must not send a floor or directions worker request').toBe(before);
 await page.getByRole('button',{name:'Map preferences',exact:true}).click();
 await page.screenshot({path:output+'/desktop-door-approaches.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(800);
 await page.screenshot({path:output+'/mobile-door-approaches.png'});
 const proof={status:'passed',sourceZipSha256:'09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a',styles,workerRequestsBeforeToggle:before,workerRequestsAfterToggle:after,errors,...await page.evaluate(()=>globalThis.pathProbe)};
 expect(errors).toEqual([]);
 await writeFile(output+'/proof.json',JSON.stringify(proof));
 console.log('PATH_VIEW_PASSED',JSON.stringify({styles:{trunks:styles.renderedTrunks,approaches:styles.renderedApproaches,sourceRoles:styles.sourceRoles},before,after}));
} catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;} finally {await browser.close();}
