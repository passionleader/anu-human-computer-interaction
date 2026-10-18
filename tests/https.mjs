import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const run = path.resolve('qa-output/https-' + Date.now());
await mkdir(run, { recursive: true });
const base = 'https://localhost:5194', token = 'qa-https-only';
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: '5194', DATA_DIR: path.join(run, 'data'), STUDY_TOKEN: token, TLS_CERT: path.resolve('qa-output/tls/cert.pem'), TLS_KEY: path.resolve('qa-output/tls/key.pem') }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
const results = [];
async function until(fn, label, timeout = 15000) { let start = Date.now(); while (Date.now() - start < timeout) {
    if (await fn())
        return;
    await sleep(150);
} throw Error('Timed out: ' + label); }
try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const k = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } }), p = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const request = k.request;
    await until(async () => { try {
        return (await request.get(base + '/api/products')).ok();
    }
    catch {
        return false;
    } }, 'TLS server');
    const create = await request.post(base + '/api/trials', { headers: { Authorization: 'Bearer ' + token }, data: { participantId: 'QA_HTTPS', condition: 'A', demo: true } });
    const t = (await create.json()).trial;
    const c = await k.newPage(), s = await p.newPage();
    const connections = [];
    s.on('websocket', ws => connections.push(ws.url()));
    await c.goto(`${base}/checkout?code=${t.code}`);
    await s.goto(`${base}/scanner?code=${t.code}`);
    await c.getByRole('button', { name: 'Enable checkout sound', exact: true }).click();
    await s.locator('summary').click();
    await s.getByRole('button', { name: 'Enable & test scanner sound', exact: true }).click();
    await c.getByRole('button', { name: 'Start shopping', exact: false }).click();
    await s.locator('summary').click();
    await s.locator('#barcode-image').setInputFiles('public/assets/cards/tofu.png');
    await c.getByRole('button', { name: 'Pay $5.00' }).waitFor();
    assert.ok(connections.some(u => u.startsWith('wss://')));
    assert.equal(await s.evaluate(() => isSecureContext), true);
    results.push('PASS HTTPS pages and WSS sync, independent contexts, real EAN image → $5 basket');
    results.push('TEST CERTIFICATE ONLY: ignoreHTTPSErrors enabled; real phone CA trust remains unverified');
    await c.screenshot({ path: path.join(run, 'https-checkout.png'), fullPage: true });
    console.log(results.join('\n'));
}
catch (e) {
    results.push('FAIL ' + e);
    console.error(e);
    process.exitCode = 1;
}
finally {
    await browser?.close();
    child.kill();
    await writeFile(path.join(run, 'results.json'), JSON.stringify({ time: new Date().toISOString(), results }, null, 2));
    console.log(run);
}
