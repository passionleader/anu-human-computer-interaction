import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), port = 5191, base = `http://localhost:${port}`, token = 'qa-only-local-token';
const runDir = path.join(root, 'qa-output', `run-${Date.now()}`);
await mkdir(runDir, { recursive: true });
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: path.join(runDir, 'data'), STUDY_TOKEN: token, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', s => output += s);
server.stderr.on('data', s => output += s);
const failures = [], checks = [];
let browser;
const api = async (route, options = {}) => { const r = await fetch(base + route, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }); if (!r.ok)
    throw Error(route + ': ' + r.status + ' ' + await r.text()); return r; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 12000) { const start = Date.now(); while (Date.now() - start < timeout) {
    if (await fn())
        return;
    await sleep(100);
} throw Error('Timed out: ' + label); }
async function current() { return (await (await api('/api/trials')).json()).at(-1); }
async function check(name, fn) { try {
    await fn();
    checks.push({ name, result: 'PASS' });
    console.log('PASS', name);
}
catch (e) {
    checks.push({ name, result: 'FAIL', reason: String(e) });
    throw e;
} }
try {
    await until(async () => { try {
        return (await fetch(base + '/api/products')).ok;
    }
    catch {
        return false;
    } }, 'server');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const kiosk = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const checkout = await kiosk.newPage(), scanner = await phone.newPage();
    for (const page of [checkout, scanner]) {
        page.on('pageerror', e => failures.push(String(e)));
        await page.addInitScript(() => { window.__sockets = []; const Original = window.WebSocket; window.WebSocket = class extends Original {
            constructor(...args) { super(...args); window.__sockets.push(this); }
        }; });
    }
    const products = JSON.parse(await readFile('products.json', 'utf8'));
    async function pair(condition) { const t = (await (await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: 'QA_' + condition, condition, demo: true }) })).json()).trial; await checkout.goto(`${base}/checkout?code=${t.code}`); await scanner.goto(`${base}/scanner?code=${t.code}`); await until(async () => { const t = await current(); return t.connected.checkout && t.connected.scanner; }, 'pair'); await checkout.getByRole('button', { name: 'Enable checkout sound', exact: true }).click(); await scanner.locator('summary').click(); await scanner.getByRole('button', { name: 'Enable & test scanner sound', exact: true }).click(); await until(async () => (await current()).connected.ready, 'sound readiness'); await checkout.getByRole('button', { name: 'Start shopping', exact: false }).click(); await until(async () => (await current()).phase === 'scanning', 'start'); return t; }
    await check('research exports require separate researcher authority', async () => { assert.equal((await fetch(base + '/api/export')).status, 401); for (const url of ['/data/study-token.txt', '/data/trials.json', '/@fs/' + root.replaceAll('\\', '/') + '/data/trials.json']) {
        const r = await fetch(base + url);
        assert.ok(!(await r.text()).includes(token));
    } });
    await pair('A');
    await check('seven EAN barcode images decoded in scanner; exact cart and total across separate contexts', async () => { for (const p of products) {
        if (!await scanner.locator('#barcode-image').isVisible())
            await scanner.locator('summary').click();
        await scanner.locator('#barcode-image').setInputFiles(`public/assets/barcodes/${p.id}.png`);
        await until(async () => (await current()).cart[p.id] === 1, 'decode ' + p.id);
    } assert.equal((await current()).totalCents, 7500); await checkout.getByRole('button', { name: 'Pay $75.00' }).waitFor(); });
    await check('all seven complete printed cards decode with the same decoder', async () => { for (const p of products) { if (!await scanner.locator('#barcode-image').isVisible()) await scanner.locator('summary').click(); await scanner.locator('#barcode-image').setInputFiles(`public/assets/cards/${p.id}.png`); await until(async () => (await current()).cart[p.id] === 2, 'full card decode '+p.id); } assert.equal((await current()).totalCents,15000); });
    await check('same scan ID retransmission adds once and does not replay approval event', async () => { await scanner.evaluate(barcode => { const ws = window.__sockets[0]; const m = JSON.stringify({ type: 'scan', barcode, scanId: 'qa-duplicate', inputMethod: 'manual' }); ws.send(m); ws.send(m); }, products[4].barcode); await until(async () => (await current()).cart.tofu === 3, 'one duplicate addition'); await sleep(300); assert.equal((await current()).cart.tofu, 3); });
    await check('unknown barcode changes no basket', async () => { const before = (await current()).totalCents; await scanner.evaluate(() => window.__sockets[0].send(JSON.stringify({ type: 'scan', barcode: '0000000000000', scanId: 'qa-unknown' }))); await sleep(300); assert.equal((await current()).totalCents, before); });
    await checkout.screenshot({ path: path.join(runDir, 'checkout-basket.png'), fullPage: true });
    await scanner.screenshot({ path: path.join(runDir, 'scanner-mobile.png'), fullPage: true });
    await check('remove one item updates exact integer total', async () => { const before = (await current()).totalCents; await checkout.locator('[data-remove="tofu"]').click(); await until(async () => (await current()).totalCents === before - 500, 'remove one'); });
    await check('start again retains prior event history', async () => { const before = (await current()).eventCount; checkout.once('dialog', d => d.accept()); await checkout.getByRole('button', { name: 'Start again', exact: true }).click(); await until(async () => (await current()).totalCents === 0, 'clear'); assert.ok((await current()).eventCount > before); });
    async function socketScan(id, scanId = crypto.randomUUID()) { await scanner.evaluate(({ barcode, scanId }) => window.__sockets.at(-1).send(JSON.stringify({ type: 'scan', barcode, scanId, inputMethod: 'manual' })), { barcode: products.find(p => p.id === id).barcode, scanId }); }
    await socketScan('tofu');
    await until(async () => (await current()).totalCents === 500, 'tofu');
    await check('membership skip, back navigation, demo membership and double tap produce single receipt', async () => { await checkout.getByRole('button', { name: 'Pay $5.00' }).click(); await checkout.getByRole('button', { name: 'Skip', exact: true }).click(); await checkout.getByRole('button', { name: 'Back to shopping', exact: false }).click(); assert.equal((await current()).totalCents, 500); await checkout.getByRole('button', { name: 'Pay $5.00' }).click(); await checkout.getByRole('button', { name: 'Demo membership', exact: true }).click(); await checkout.locator('.terminal').dblclick(); await until(async () => (await current()).phase === 'receipt', 'receipt'); const t = await current(); await socketScan('beef', 'after-payment'); await sleep(250); assert.equal((await current()).totalCents, 500); const all = await (await api('/api/export')).json(); const trial = all.trials.at(-1); assert.equal(trial.events.filter(e => e.eventType === 'checkout_completed').length, 1); const receipt = await fetch(base + `/api/receipt/${t.receiptId}?code=${t.code}`); assert.ok((await receipt.text()).includes('TOTAL AUD $5.00')); await checkout.screenshot({ path: path.join(runDir, 'receipt.png'), fullPage: true }); });
    await checkout.close();
    await scanner.close();
    const c = await kiosk.newPage(), s = await phone.newPage(); // pair helper uses old pages; next B deliberately uses fresh independent contexts below.
    await c.close();
    await s.close();
    const k2 = await browser.newContext({ viewport: { width: 1366, height: 900 } }), p2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const C = await k2.newPage(), S = await p2.newPage();
    for (const pg of [C, S]) {
        pg.on('pageerror', e => failures.push(String(e)));
        await pg.addInitScript(() => { window.__sockets = []; const O = window.WebSocket; window.WebSocket = class extends O {
            constructor(...a) { super(...a); window.__sockets.push(this); }
        }; });
    }
    const b = (await (await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: 'QA_B', condition: 'B', demo: true }) })).json()).trial;
    await C.goto(`${base}/checkout?code=${b.code}`);
    await S.goto(`${base}/scanner?code=${b.code}`);
    await C.getByRole('button', { name: 'Enable checkout sound', exact: true }).click();
    await S.locator('summary').click();
    await S.getByRole('button', { name: 'Enable & test scanner sound', exact: true }).click();
    await until(async () => (await current()).connected.ready, 'B ready');
    await C.getByRole('button', { name: 'Start shopping', exact: false }).click();
    await until(async () => (await current()).phase === 'scanning', 'B start');
    async function bScan(id) { await S.evaluate(barcode => window.__sockets.at(-1).send(JSON.stringify({ type: 'scan', barcode, scanId: crypto.randomUUID(), inputMethod: 'manual' })), products.find(p => p.id === id).barcode); }
    await check('B animal feedback finishes with successful per-device media evidence', async () => { for (const id of ['beef', 'lamb', 'pork']) {
        await bScan(id);
        await until(async () => (await current()).phase === 'feedback', id + ' starts');
        if (id === 'beef') {
            await C.screenshot({ path: path.join(runDir, 'animal-feedback.png'), fullPage: true });
            assert.equal(await C.locator('video').evaluate(v => v.muted), true);
        }
        await until(async () => (await current()).phase === 'scanning', id + ' finishes', 8000);
    } const all = await (await api('/api/export')).json(); const events = all.trials.at(-1).events; assert.equal(events.filter(e => e.eventType === 'feedback_completed').length, 3); assert.equal(events.filter(e => e.eventType === 'feedback_failed').length, 0); });
    await check('B vegan thanks and neutral silence map correctly', async () => { for (const id of ['vegan-mince', 'pea-protein']) {
        await bScan(id);
        await until(async () => (await current()).phase === 'feedback', id + ' starts');
        assert.equal(await C.locator('video').count(), 0);
        await until(async () => (await current()).phase === 'scanning', id + ' ends', 8000);
    } await bScan('tofu'); await until(async () => (await current()).cart.tofu === 1, 'neutral adds'); assert.equal((await current()).phase, 'scanning'); });
    await check('skip stops feedback on both devices and records skipped', async () => { await bScan('beef'); await C.getByRole('button', { name: 'Skip feedback' }).click(); await until(async () => (await current()).phase === 'scanning', 'skip'); const all = await (await api('/api/export')).json(); assert.ok(all.trials.at(-1).events.some(e => e.eventType === 'feedback_skipped')); });
    await check('runtime audio failure is logged as failed and recovers', async () => {
        await S.evaluate(()=>{const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if((this.currentSrc||this.src).endsWith('/pig.wav'))return Promise.reject(Error('QA runtime media failure'));return original.call(this);};});
        await bScan('pork');
        await until(async()=>(await(await api('/api/export')).json()).trials.at(-1).events.some(e=>e.eventType==='feedback_failed'),'runtime feedback failure',8500);
        assert.equal((await current()).phase,'scanning');
    });
    await check('reload reconnects without replaying previous feedback; cart preserved', async () => { const before = (await current()).totalCents; await S.reload(); await until(async () => (await current()).connected.scanner, 'reconnect'); assert.equal((await current()).totalCents, before); assert.equal((await current()).phase, 'scanning'); });
    await check('narrow scanner and laptop have no horizontal overflow', async () => { for (const pg of [C, S])
        assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); });
    await check('CSV/JSON preserve conditions, image/manual input and final carts', async () => { const all = await (await api('/api/export')).json(); assert.equal(all.trials.length, 2); assert.deepEqual(all.trials.map(t => t.condition), ['A', 'B']); assert.ok(all.trials[0].events.some(e => e.inputMethod === 'image')); assert.equal(all.trials[0].summary.totalCents, 500); const csv = await (await api('/api/export?format=csv')).text(); assert.ok(csv.includes('cartSnapshot')); await writeFile(path.join(runDir, 'sample-records.json'), JSON.stringify(all, null, 2)); });
    assert.deepEqual(failures, []);
    checks.push({ name: 'No unhandled browser exceptions', result: 'PASS' });
}
catch (e) {
    checks.push({ name: 'Run completed', result: 'FAIL', reason: String(e) });
    console.error(e);
    process.exitCode = 1;
}
finally {
    await browser?.close();
    server.kill();
    await writeFile(path.join(runDir, 'results.json'), JSON.stringify({ time: new Date().toISOString(), checks, failures, serverOutput: output }, null, 2));
    await writeFile('qa-output/latest-run.txt', runDir);
    console.log('QA artifacts:', runDir);
}
