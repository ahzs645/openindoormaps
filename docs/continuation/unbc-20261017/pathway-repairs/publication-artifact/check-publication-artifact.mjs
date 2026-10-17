import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire('/workspace/openindoormaps/package.json');
const {chromium,expect}=require('@playwright/test');
const output='/workspace/scratch/unbc-repairs-20261017/publication-artifact';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:42179/publication/');
 await expect(page.getByRole('status')).toHaveText('Current on checked pages',{timeout:120000});
 const rows=await page.locator('#results tr').count();expect(rows).toBe(26);expect(await page.locator('#results').innerText()).not.toContain('Failed');
 await page.screenshot({path:output+'/publication-check.png'});
 await page.goto('http://127.0.0.1:42179/openindoormaps/#/projects/download?package=%2Fdata%2Funbc-full%2Fproject.json');
 await page.getByRole('button',{name:'Prepare latest map ZIP',exact:true}).click();
 await expect(page.getByRole('link',{name:/Save UNBC.hallway-guides.campus-viewer.zip/})).toBeVisible({timeout:60000});
 await page.getByText('Package fingerprint',{exact:true}).click();
 await expect(page.locator('code')).toHaveText('09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a');
 await page.screenshot({path:output+'/latest-download.png'});expect(errors).toEqual([]);
 await writeFile(output+'/proof.json',JSON.stringify({status:'passed',scope:'local publication artifact using ordinary URLs; production sign-in gate still requires signed-in verification',filesChecked:rows,latestPackage:'09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a',errors}));
 console.log('ARTIFACT_CHECK_PASSED',rows);
}finally{await browser.close();}
