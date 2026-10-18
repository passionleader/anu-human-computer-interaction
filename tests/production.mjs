import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import WebSocket from 'ws';
const run=path.resolve('qa-output/production-'+Date.now());await mkdir(run,{recursive:true});
const base='http://localhost:5211',publicUrl='https://checkout-example.onrender.com',token='qa-production-only';
const child=spawn(process.execPath,['server-dist/server.mjs'],{env:{...process.env,NODE_ENV:'production',RENDER:'true',RENDER_EXTERNAL_URL:publicUrl,PORT:'5211',DATA_DIR:path.join(run,'data'),STUDY_TOKEN:token},stdio:'ignore'});
let browser,ws;const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.deepEqual(await(await fetch(base+'/healthz')).json(),{ok:true});
 const config=await(await fetch(base+'/api/config')).json();assert.equal(config.publicBaseUrl,publicUrl);assert.equal(config.https,true);assert.equal(config.dataPersistent,false);assert.deepEqual(config.addresses,[]);
 results.push('PASS compiled production server + health + cloud config, no private network addresses');
 assert.equal((await fetch(base+'/api/trials')).status,401);
 const t=(await(await fetch(base+'/api/trials',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({participantId:'QA_PRODUCTION',condition:'A',demo:true})})).json()).trial;
 assert.match(t.code,/^[A-Z]{4}$/);
 ws=new WebSocket(base.replace('http:','ws:')+'/ws');
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.close();results.push('PASS researcher authorization, pairing and production WebSocket upgrade');
 if(process.env.QA_SKIP_BROWSER!=='1'){browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(base+'/study');await page.locator('input[type="password"]').fill(token);await page.getByRole('button',{name:'Unlock',exact:false}).click();await page.getByRole('link',{name:'Open scanner',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Open scanner',exact:true}).getAttribute('href'),publicUrl+'/scanner?code='+t.code);await page.screenshot({path:path.join(run,'cloud-console.png'),fullPage:true});results.push('PASS study console creates public HTTPS scanner link');}else results.push('SKIP study browser check (QA_SKIP_BROWSER=1; verified separately on PC)');
 for(const asset of ['/assets/cards/product-cards.pdf','/assets/media/pig.mp4','/assets/products/pork.png'])assert.equal((await fetch(base+asset)).status,200,asset);
 results.push('PASS production serves printable cards, animal video and product photo');console.log(results.join('\n'));
}catch(e){results.push('FAIL '+e);console.error(e);process.exitCode=1;}finally{ws?.close();await browser?.close();child.kill();await writeFile(path.join(run,'results.json'),JSON.stringify({time:new Date().toISOString(),results},null,2));console.log(run);}
