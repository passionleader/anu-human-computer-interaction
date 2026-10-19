import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const run=path.resolve('qa-output/receipt-return-'+Date.now());await mkdir(run,{recursive:true});
const base='http://localhost:5217',token='qa-receipt-return';
const server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,NODE_ENV:'production',PORT:'5217',DATA_DIR:path.join(run,'data'),STUDY_TOKEN:token},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let i=0;i<130;i++){if(await f())return;await sleep(100);}throw Error('Timed out: '+label);}
const api=async(route)=>await(await fetch(base+route,{headers:{Authorization:'Bearer '+token}})).json();
const current=async()=>(await api('/api/trials')).at(-1);
let browser;const results=[],errors=[];
try{
 await until(async()=>{try{return(await fetch(base+'/healthz')).ok;}catch{return false;}},'server');
 browser=await chromium.launch({channel:'msedge',headless:true});
 const c=await browser.newPage({viewport:{width:1366,height:768}}),s=await browser.newPage({viewport:{width:390,height:844}});
 for(const page of [c,s])page.on('pageerror',error=>errors.push(String(error)));
 await s.addInitScript(()=>{window.__audioPlayed=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.muted)window.__audioPlayed.push(this.src);return play.call(this);};});
 async function pair(){
  await c.goto(base+'/checkout');await c.getByRole('button',{name:'Connect phone scanner',exact:true}).click();await c.locator('#pairing-code').waitFor();
  const code=(await c.locator('#pairing-code').textContent()).trim();await s.goto(base+'/scanner?code='+code);
  await c.getByRole('button',{name:'Enable checkout sound',exact:true}).click();await s.locator('summary').click();await s.getByRole('button',{name:'Enable & test scanner sound',exact:true}).click();
  await until(async()=>(await current()).connected.ready,'sound ready');await c.getByRole('button',{name:'Start shopping',exact:false}).click();return code;
 }
 async function pay(total){await c.getByRole('button',{name:'Pay '+total,exact:false}).click();await c.getByRole('button',{name:'Skip',exact:true}).click();await c.locator('.terminal').click();await c.getByRole('heading',{name:'Thank you.',exact:true}).waitFor();await s.getByRole('heading',{name:'Payment complete.',exact:true}).waitFor();}
 const code=await pair();await s.evaluate(()=>window.__audioPlayed=[]);await s.locator('#barcode-image').setInputFiles('public/assets/barcodes/lamb.png');
 await until(async()=>{const t=await current();return t.cart.lamb===1&&t.phase==='scanning';},'lamb feedback');
 const played=await s.evaluate(()=>window.__audioPlayed);assert.ok(played.some(src=>src.endsWith('/sheep.wav')));assert.ok(!played.some(src=>src.endsWith('/cow.wav')));
 const sheep=Buffer.from(await(await fetch(base+'/assets/media/sheep.wav')).arrayBuffer());const cow=await readFile('public/assets/media/cow.wav');
 const sha=buffer=>createHash('sha256').update(buffer).digest('hex');assert.equal(sha(sheep),sha(await readFile('public/assets/media/sheep.wav')));assert.notEqual(sha(sheep),sha(cow));
 results.push('PASS lamb scan plays the replaced sheep asset on scanner, not cow audio');
 await pay('$10.00');const started=Date.now(),paid=await current();
 await sleep(3500);await c.getByRole('button',{name:'Help',exact:true}).click();await c.reload();await c.getByRole('heading',{name:'Thank you.',exact:true}).waitFor();
 await c.getByRole('button',{name:'Connect phone scanner',exact:true}).waitFor({timeout:8500});const elapsed=Date.now()-started;assert.ok(elapsed>=9500&&elapsed<13500,'return at original ten-second deadline: '+elapsed);
 assert.equal(new URL(c.url()).searchParams.has('code'),false);assert.equal(await c.evaluate(()=>sessionStorage.getItem('checkoutCode')),null);assert.equal(await c.locator('.basket').count(),0);
 await s.getByRole('heading',{name:'Payment complete.',exact:true}).waitFor();assert.ok((await s.locator('.phone-receipt-items').textContent()).includes('Lamb Pieces'));
 assert.equal((await current()).receiptId,paid.receiptId);assert.equal((await current()).totalCents,1000);
 assert.ok((await(await fetch(base+`/api/receipt/${paid.receiptId}?code=${code}`)).text()).includes('TOTAL AUD $10.00'));
 await c.screenshot({path:path.join(run,'returned-start.png'),fullPage:true});await s.screenshot({path:path.join(run,'retained-phone-receipt.png'),fullPage:true});
 results.push('PASS ten-second return survives Help rerender and reload; desktop clears while phone receipt and records remain');
 const nextCode=await pair();assert.notEqual(nextCode,code);assert.deepEqual((await current()).cart,{});
 await s.locator('#barcode-image').setInputFiles('public/assets/barcodes/tofu.png');await c.getByRole('button',{name:'Pay $5.00',exact:false}).waitFor();await pay('$5.00');
 const manualStarted=Date.now();await c.getByRole('button',{name:'Return to start',exact:true}).click();await c.getByRole('button',{name:'Connect phone scanner',exact:true}).waitFor();assert.ok(Date.now()-manualStarted<2000);
 await s.getByRole('heading',{name:'Payment complete.',exact:true}).waitFor();await c.reload();await c.getByRole('button',{name:'Connect phone scanner',exact:true}).waitFor();
 const records=await api('/api/export');assert.equal(records.trials.length,2);for(const t of records.trials)assert.equal(t.events.filter(e=>e.eventType==='checkout_completed').length,1);
 results.push('PASS manual return is immediate, fresh session has empty cart, both completed trial records preserved');
 assert.deepEqual(errors,[]);console.log(results.join('\n'));
}catch(error){results.push('FAIL '+error);console.error(error);process.exitCode=1;}finally{await browser?.close();server.kill();await writeFile(path.join(run,'results.json'),JSON.stringify({time:new Date().toISOString(),results,errors},null,2));console.log(run);}
