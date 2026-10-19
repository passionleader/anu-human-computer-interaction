import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const run=path.resolve('qa-output/scanner-quality-'+Date.now());await mkdir(run,{recursive:true});
const bundle=await build({stdin:{contents:"export {EANCameraReader} from './src/barcode-reader';export {BrowserMultiFormatReader as Baseline} from '@zxing/browser';export {BarcodeFormat,DecodeHintType} from '@zxing/library';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ScannerQA',platform:'browser'});
const products=JSON.parse(await readFile('products.json','utf8'));const inputs=await Promise.all(products.map(async p=>({...p,image:'data:image/png;base64,'+(await readFile('public/assets/barcodes/'+p.id+'.png')).toString('base64')})));
let browser;const results=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.setContent('<canvas id="frame"></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const measurements=await page.evaluate(async inputs=>{
  const {EANCameraReader,Baseline,BarcodeFormat,DecodeHintType}=ScannerQA;
  const reader=new EANCameraReader(),baseline=new Baseline(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13]]]));const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');const measurements=[];
  const cases=[{name:'landscape-centre',w:1280,h:720,x:640,y:360,a:0,bw:480},{name:'landscape-bottom',w:1280,h:720,x:640,y:655,a:0,bw:360},{name:'portrait-vertical',w:720,h:1280,x:360,y:640,a:90,bw:520},{name:'portrait-horizontal',w:720,h:1280,x:360,y:640,a:0,bw:480},{name:'landscape-vertical',w:1280,h:720,x:640,y:360,a:90,bw:480},{name:'slightly-tilted',w:1280,h:720,x:640,y:360,a:12,bw:480}];
  for(const input of inputs){const image=new Image();image.src=input.image;await image.decode();for(const c of cases){canvas.width=c.w;canvas.height=c.h;ctx.fillStyle='white';ctx.fillRect(0,0,c.w,c.h);ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a*Math.PI/180);ctx.drawImage(image,-c.bw/2,-c.bw*0.3/2,c.bw,c.bw*0.3);ctx.restore();let old=null,value=null,error=null;try{old=baseline.decodeFromCanvas(canvas).getText();}catch{}const start=performance.now();try{value=reader.decodeFromCanvas(canvas).getText();}catch(e){error=String(e);}measurements.push({product:input.id,case:c.name,expected:input.barcode,baseline:old,value,error,ms:Math.round(performance.now()-start)});}}
  canvas.width=1280;canvas.height=720;ctx.fillStyle='white';ctx.fillRect(0,0,1280,720);let blankRejected=false;try{reader.decodeFromCanvas(canvas);}catch{blankRejected=true;}
  return {measurements,blankRejected};
 },inputs);
 await writeFile(path.join(run,'measurements.json'),JSON.stringify(measurements,null,2));for(const test of measurements.measurements)assert.equal(test.value,test.expected,test.product+' '+test.case);assert.equal(measurements.blankRejected,true);
 const baselineMisses=measurements.measurements.filter(t=>t.baseline!==t.expected).length;results.push(`PASS ${measurements.measurements.length} frames: all product EANs across centre, edge, portrait, 90-degree and tilted views`);results.push(`PASS blank frame rejected; baseline missed ${baselineMisses} of these frames`);results.push('Maximum decode time on PC: '+Math.max(...measurements.measurements.map(t=>t.ms))+'ms');console.log(results.join('\n'));
}catch(e){results.push('FAIL '+e);console.error(e);process.exitCode=1;}finally{await browser?.close();await writeFile(path.join(run,'results.json'),JSON.stringify({time:new Date().toISOString(),results},null,2));console.log(run);}
