import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const run = path.resolve('qa-output/camera-' + Date.now());
await mkdir(run, { recursive: true });
const base = 'http://localhost:5192', token = 'qa-camera-local';
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: '5192', DATA_DIR: path.join(run, 'data'), STUDY_TOKEN: token }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(f, label, timeout = 15000) { const start = Date.now(); while (Date.now() - start < timeout) {
    if (await f())
        return;
    await sleep(100);
} throw Error('Timed out: ' + label); }
const api = async (route, opts = {}) => await fetch(base + route, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
const state = async () => (await (await api('/api/trials')).json()).at(-1);
let browser;
const results = [];
try {
    await until(async () => { try {
        return (await fetch(base + '/api/products')).ok;
    }
    catch {
        return false;
    } }, 'server');
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + path.resolve('qa-output/camera.y4m')] });
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } }), phone = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
    if(process.env.QA_CAMERA_CONTROLS==='1')await phone.addInitScript(()=>{
        const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.__cameraRequests=[];window.__cameraConstraints=[];
        navigator.mediaDevices.enumerateDevices=async()=>['primary','secondary'].map(id=>({kind:'videoinput',deviceId:'qa-'+id,label:'Rear '+id,groupId:'qa'}));
        navigator.mediaDevices.getUserMedia=async constraints=>{
            const selected=constraints.video.deviceId?.exact||'qa-primary';window.__cameraRequests.push(selected);
            const video={...constraints.video};delete video.deviceId;
            const stream=await getMedia({...constraints,video});const track=stream.getVideoTracks()[0];
            const settings=track.getSettings.bind(track);let torch=false,zoom=1;
            track.getCapabilities=()=>({focusMode:['continuous'],torch:true,zoom:{min:1,max:4,step:0.5}});
            track.getSettings=()=>({...settings(),deviceId:selected,torch,zoom});
            track.applyConstraints=async value=>{window.__cameraConstraints.push(value);for(const item of value.advanced||[]){if('torch'in item)torch=item.torch;if('zoom'in item)zoom=item.zoom;}};
            return stream;
        };
    });
    const c = await laptop.newPage(), s = await phone.newPage();
    const t = (await (await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: 'QA_CAMERA', condition: 'A', demo: true }) })).json()).trial;
    await c.goto(`${base}/checkout?code=${t.code}`);
    await s.goto(`${base}/scanner?code=${t.code}`);
    await c.getByRole('button', { name: 'Enable checkout sound', exact: true }).click();
    await s.locator('summary').click();
    await s.getByRole('button', { name: 'Enable & test scanner sound', exact: true }).click();
    await until(async () => (await state()).connected.ready, 'sounds');
    await s.getByText('Scanning has not started', { exact: true }).waitFor();
    await c.getByRole('button', { name: 'Start shopping', exact: false }).click();
    await until(async () => (await state()).phase === 'scanning', 'scanning');
    await until(async () => (await s.getByText('Scanning has not started', { exact: true }).count()) === 0, 'waiting message cleared');
    await s.getByRole('button', { name: 'Enable camera & sound', exact: true }).click();
    await until(async () => (await state()).cart.tofu === 1, 'camera decodes first frame');
    const first = Date.now();
    await sleep(1400);
    assert.equal((await state()).cart.tofu, 1, 'stationary barcode must add once');
    results.push('PASS actual getUserMedia → ZXing → server scan inputMethod=camera');
    results.push('PASS stationary camera barcode adds once');
    await until(async () => (await state()).cart.tofu === 2, 'barcode leaves frame and returns', 9000);
    results.push('PASS absent 1.5s then re-presented barcode adds exactly one more');
    const all = await (await api('/api/export')).json();
    assert.equal(all.trials[0].events.filter(e => e.eventType === 'scan_accepted' && e.inputMethod === 'camera').length, 2);
    if(process.env.QA_CAMERA_CONTROLS==='1'){
        assert.equal(await s.evaluate(()=>window.__cameraConstraints.some(c=>c.advanced?.some(a=>a.focusMode==='continuous'))),true);
        await s.getByRole('button',{name:'Light off',exact:true}).click();
        await s.getByRole('button',{name:'Light on',exact:true}).waitFor();
        await s.locator('#camera-zoom').press('End');
        await until(async()=>s.evaluate(()=>window.__cameraConstraints.some(c=>c.advanced?.some(a=>a.zoom===3))),'zoom applied');
        await s.locator('#camera-select').selectOption('qa-secondary');
        await until(async()=>s.evaluate(()=>window.__cameraRequests.includes('qa-secondary')&&document.querySelector('#camera')?.videoWidth>0),'camera switched');
        await s.getByRole('button',{name:'Light off',exact:true}).waitFor();
        results.push('PASS supported autofocus, light, zoom and camera switching controls (simulated capabilities, real video stream)');
    }
    await s.screenshot({ path: path.join(run, 'scanner-camera.png'), fullPage: true });
    await c.screenshot({ path: path.join(run, 'checkout-camera.png'), fullPage: true });
    console.log(results.join('\n'));
}
catch (e) {
    results.push('FAIL ' + e);
    console.error(e);
    process.exitCode = 1;
}
finally {
    await browser?.close();
    server.kill();
    await writeFile(path.join(run, 'results.json'), JSON.stringify({ time: new Date().toISOString(), results }, null, 2));
    console.log(run);
}
