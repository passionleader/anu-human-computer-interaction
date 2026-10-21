import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const run=path.resolve('qa-output/cart-modes-'+Date.now());await mkdir(run,{recursive:true});
const base='http://localhost:5218',token='qa-cart-modes';
const server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,NODE_ENV:'production',PORT:'5218',DATA_DIR:path.join(run,'data'),STUDY_TOKEN:token},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(f,label){for(let i=0;i<150;i++){if(await f())return;await sleep(100);}throw Error('Timed out: '+label);}
const api=async(route,options={})=>await(await fetch(base+route,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}})).json();
const current=async()=>(await api('/api/trials')).at(-1);
let browser;const results=[],errors=[];
try{
 await until(async()=>{try{return(await fetch(base+'/healthz')).ok;}catch{return false;}},'server');
 browser=await chromium.launch({channel:'msedge',headless:true});const c=await browser.newPage({viewport:{width:1366,height:768}}),s=await browser.newPage({viewport:{width:390,height:844}});
 for(const pg of [c,s]){pg.on('pageerror',error=>errors.push(String(error)));await pg.addInitScript(()=>{window.__plays=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.muted)window.__plays.push(this.src);return play.call(this);};});}
 await c.goto(base+'/checkout');await c.getByRole('button',{name:'Connect phone scanner',exact:true}).click();await c.locator('#pairing-code').waitFor();const code=(await current()).code;
 await s.goto(base+'/scanner?code='+code);assert.equal(await c.getByRole('button',{name:'Start shopping (normal)',exact:true}).isDisabled(),true);assert.equal(await c.getByRole('button',{name:'Start shopping (vegan)',exact:true}).isDisabled(),true);
 await c.getByRole('button',{name:'Enable checkout sound',exact:true}).click();await s.locator('summary').click();await s.getByRole('button',{name:'Enable & test scanner sound',exact:true}).click();await until(async()=>(await current()).connected.ready,'sound ready');
 for(const viewport of [{width:1366,height:768},{width:581,height:700},{width:1280,height:600}]){await c.setViewportSize(viewport);assert.ok(await c.evaluate(()=>{const a=document.querySelector('.experience').getBoundingClientRect();return [...document.querySelectorAll('.start-mode')].every(button=>{const r=button.getBoundingClientRect();return r.top>=a.top&&r.bottom<=a.bottom+1;})&&document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1;}),'both ready buttons visible '+viewport.width);}
 await c.setViewportSize({width:1366,height:768});await c.screenshot({path:path.join(run,'two-start-modes.png'),fullPage:true});
 await c.getByRole('button',{name:'Start shopping (normal)',exact:true}).click();await until(async()=>(await current()).phase==='scanning','normal started');assert.equal((await current()).condition,'A');await s.evaluate(()=>window.__plays=[]);
 const ids=async()=>await c.locator('.basket li[data-product]').evaluateAll(rows=>rows.map(row=>row.dataset.product));
 const atBottom=async()=>await c.locator('.basket ul').evaluate(list=>list.scrollHeight-list.clientHeight-list.scrollTop<=2);
 async function scan(id){const before=(await current()).cart[id]||0;await s.locator('#barcode-image').setInputFiles('public/assets/barcodes/'+id+'.png');await until(async()=>(await current()).cart[id]===before+1,id+' added');await until(async()=>(await ids()).at(-1)===id&&await atBottom(),id+' bottom');}
 const sequence=['cola','beef','tofu','pork','pea-protein','lamb','whey-protein','vegan-mince'];for(const id of sequence)await scan(id);
 assert.deepEqual(await ids(),sequence);assert.equal((await current()).phase,'scanning');assert.equal(await c.locator('#animal-video').count(),0);assert.deepEqual(await s.evaluate(()=>window.__plays),[]);
 results.push('PASS both start buttons fit PC sizes; Normal selects A and has no animal/video/thank-you playback');
 await c.locator('.basket ul').evaluate(list=>list.scrollTop=0);await scan('cola');const expected=[...sequence.slice(1),'cola'];assert.deepEqual(await ids(),expected);assert.equal((await current()).cart.cola,2);
 await c.screenshot({path:path.join(run,'latest-scan-bottom.png'),fullPage:true});await c.reload();await c.locator('[data-product="cola"]').waitFor();assert.deepEqual(await ids(),expected);await until(atBottom,'reloaded basket at bottom');
 await c.locator('.basket ul').evaluate(list=>list.scrollTop=120);await c.getByRole('button',{name:'Help',exact:true}).click();await sleep(200);assert.equal(await c.locator('.basket ul').evaluate(list=>list.scrollTop),120);
 results.push('PASS out-of-catalogue scan sequence, repeat grouping, scroll to bottom and reload persistence; manual scroll survives Help');
 // Complete the first transaction before creating another demonstration trial.
 await c.getByRole('button',{name:'Pay $81.00',exact:false}).click();await c.getByRole('button',{name:'Skip',exact:true}).click();await c.locator('.terminal').click();await c.getByRole('button',{name:'Return to start',exact:true}).click();
 const t=(await api('/api/trials',{method:'POST',body:JSON.stringify({participantId:'QA_VEGAN',condition:'A',demo:true})})).trial;
 await c.goto(base+'/checkout?code='+t.code);await s.goto(base+'/scanner?code='+t.code);await c.getByRole('button',{name:'Enable checkout sound',exact:true}).click();await s.locator('summary').click();await s.getByRole('button',{name:'Enable & test scanner sound',exact:true}).click();await until(async()=>(await current()).connected.ready,'B ready');
 await c.getByRole('button',{name:'Start shopping (vegan)',exact:true}).click();await until(async()=>(await current()).condition==='B','vegan selected');
 await s.evaluate(()=>window.__plays=[]);for(const id of ['cola','tofu','cola','tofu','cola','tofu'])await scan(id);
 await scan('beef');await c.locator('#animal-video').waitFor();await until(async()=>(await current()).phase==='scanning','beef feedback complete');await until(atBottom,'feedback completion keeps bottom');assert.ok((await s.evaluate(()=>window.__plays)).some(src=>src.endsWith('/cow.wav')));
 results.push('PASS Vegan selects B, plays cow feedback and keeps newest item visible after feedback layout changes');
 assert.deepEqual(errors,[]);console.log(results.join('\n'));
}catch(error){results.push('FAIL '+error);console.error(error);process.exitCode=1;}finally{await browser?.close();server.kill();await writeFile(path.join(run,'results.json'),JSON.stringify({time:new Date().toISOString(),results,errors},null,2));console.log(run);}
