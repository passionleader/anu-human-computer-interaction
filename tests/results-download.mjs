import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const run=path.resolve('qa-output/results-download-'+Date.now());await mkdir(run,{recursive:true});
const base='http://localhost:5219',token='qa-results-download';
const server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,NODE_ENV:'production',PORT:'5219',DATA_DIR:path.join(run,'data'),STUDY_TOKEN:token},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(f,label){for(let i=0;i<150;i++){if(await f())return;await sleep(100);}throw Error('Timed out: '+label);}
const api=async(route,options={})=>await(await fetch(base+route,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}})).json();
const current=async()=>(await api('/api/trials')).at(-1);
let browser;const results=[],errors=[],desktopDownloads=[],phoneDownloads=[];
try{
 await until(async()=>{try{return(await fetch(base+'/healthz')).ok;}catch{return false;}},'server');
 browser=await chromium.launch({channel:'msedge',headless:true});
 const c=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true}),s=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
 c.on('download',download=>desktopDownloads.push(download));s.on('download',download=>phoneDownloads.push(download));
 for(const page of [c,s])page.on('pageerror',error=>errors.push(String(error)));
 async function pair(id,mode='normal'){
  const t=(await api('/api/trials',{method:'POST',body:JSON.stringify({participantId:id,condition:'A',demo:true})})).trial;
  await c.goto(base+'/checkout?code='+t.code);await s.goto(base+'/scanner?code='+t.code);
  await c.getByRole('button',{name:'Enable checkout sound',exact:true}).click();await s.locator('summary').click();await s.getByRole('button',{name:'Enable & test scanner sound',exact:true}).click();
  await until(async()=>(await current()).connected.ready,'paired');await c.getByRole('button',{name:`Start shopping (${mode})`,exact:true}).click();return t;
 }
 async function scan(id,expected){await s.locator('#barcode-image').setInputFiles('public/assets/barcodes/'+id+'.png');await until(async()=>(await current()).cart[id]===expected,id+' scanned');}
 async function pay(total){await c.getByRole('button',{name:'Pay '+total,exact:false}).click();await c.getByRole('button',{name:'Skip',exact:true}).click();await c.locator('.terminal').click();await c.getByRole('heading',{name:'Thank you.',exact:true}).waitFor();await s.getByRole('heading',{name:'Payment complete.',exact:true}).waitFor();}
 const t=await pair('QA_AUTO');await scan('beef',1);await scan('tofu',1);await c.getByRole('button',{name:'Delete one Beef Mince',exact:true}).click();await until(async()=>!(await current()).cart.beef,'beef removed');
 const downloadEvent=c.waitForEvent('download');await pay('$5.00');const download=await downloadEvent;
 assert.match(download.suggestedFilename(),/^field-results-QA_AUTO-A-DEMO-.*\.json$/);await download.saveAs(path.join(run,download.suggestedFilename()));assert.equal(await download.failure(),null);
 const data=JSON.parse(await readFile(path.join(run,download.suggestedFilename()),'utf8'));
 assert.equal(data.trial.participantId,'QA_AUTO');assert.equal(data.trial.condition,'A');assert.equal(data.summary.totalCents,500);assert.equal(data.summary.deletedUnits,1);assert.equal(data.summary.totalUnits,1);
 assert.ok(data.summary.shoppingSeconds>0&&data.summary.totalCompletionSeconds>=data.summary.shoppingSeconds);assert.deepEqual(data.purchases.map(p=>p.productId),['tofu']);
 assert.equal(data.productActions.find(p=>p.productId==='beef').deletedUnits,1);assert.ok(data.events.some(e=>e.eventType==='checkout_completed'));assert.equal('code' in data.trial,false);
 assert.equal((await fetch(base+'/api/results/'+data.trial.receiptId+'?code=WRNG')).status,404);assert.equal((await fetch(base+'/api/results/unknown?code='+t.code)).status,404);
 results.push('PASS automatic desktop download contains timings, final purchases, Delete evidence and raw events; wrong capability denied');
 await c.getByRole('button',{name:'Help',exact:true}).click();await c.reload();await c.getByRole('heading',{name:'Thank you.',exact:true}).waitFor();await sleep(400);assert.equal(desktopDownloads.length,1);assert.equal(phoneDownloads.length,0);
 await s.getByRole('button',{name:'Return to start',exact:true}).click();await s.getByRole('button',{name:'Connect',exact:true}).waitFor();assert.equal(await s.locator('#code').inputValue(),'');assert.equal(new URL(s.url()).searchParams.has('code'),false);
 assert.equal(await s.evaluate(()=>sessionStorage.getItem('scannerCode')),null);await until(async()=>!(await current()).connected.scanner,'scanner disconnected');await s.reload();await s.getByRole('button',{name:'Connect',exact:true}).waitFor();
 await c.getByRole('button',{name:'Return to start',exact:true}).click();await c.getByRole('button',{name:'Connect phone scanner',exact:true}).waitFor();
 const next=await pair('QA_NEXT','vegan');assert.notEqual(next.code,t.code);await scan('cola',1);await until(async()=>(await current()).cart.cola===1,'new session usable');
 results.push('PASS no duplicate export on Help/reload; smartphone return clears code/socket and next test can pair and scan');
 await c.route('**/api/results/**',route=>route.fulfill({status:503,body:'QA interrupted download'}));await pay('$3.00');await c.getByRole('button',{name:'Retry data download',exact:true}).waitFor();
 await sleep(10300);await c.getByRole('heading',{name:'Thank you.',exact:true}).waitFor();assert.equal(await c.getByRole('button',{name:'Connect phone scanner',exact:true}).count(),0);assert.equal(desktopDownloads.length,1);
 await c.screenshot({path:path.join(run,'failed-download-preserves-results.png'),fullPage:true});await c.unroute('**/api/results/**');const retried=c.waitForEvent('download');await c.getByRole('button',{name:'Retry data download',exact:true}).click();const second=await retried;await second.saveAs(path.join(run,second.suggestedFilename()));
 await c.getByRole('button',{name:'Connect phone scanner',exact:true}).waitFor();assert.equal(desktopDownloads.length,2);assert.equal((await api('/api/trials')).length,2);
 const secondData=JSON.parse(await readFile(path.join(run,second.suggestedFilename()),'utf8'));assert.equal(secondData.summary.totalCents,300);assert.equal(secondData.trial.trialId,next.trialId);assert.equal(secondData.trial.condition,'B');assert.equal(secondData.trial.mode,'vegan');
 await s.screenshot({path:path.join(run,'phone-return-button.png'),fullPage:true});
 results.push('PASS failed download blocks timed return; successful retry downloads only its trial and resumes return');
 assert.deepEqual(errors,[]);console.log(results.join('\n'));
}catch(error){results.push('FAIL '+error);console.error(error);process.exitCode=1;}finally{await browser?.close();server.kill();await writeFile(path.join(run,'results.json'),JSON.stringify({time:new Date().toISOString(),results,errors},null,2));console.log(run);}
