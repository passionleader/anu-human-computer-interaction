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
    const c = await laptop.newPage(), s = await phone.newPage();
    const t = (await (await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: 'QA_CAMERA', condition: 'A', demo: true }) })).json()).trial;
    await c.goto(`${base}/checkout?code=${t.code}`);
    await s.goto(`${base}/scanner?code=${t.code}`);
    await c.getByRole('button', { name: 'Enable checkout sound', exact: true }).click();
    await s.locator('summary').click();
    await s.getByRole('button', { name: 'Enable & test scanner sound', exact: true }).click();
    await until(async () => (await state()).connected.ready, 'sounds');
    await c.getByRole('button', { name: 'Start shopping', exact: false }).click();
    await until(async () => (await state()).phase === 'scanning', 'scanning');
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
