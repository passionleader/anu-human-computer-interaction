import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
const run = path.resolve('qa-output/recovery-' + Date.now());
await mkdir(run, { recursive: true });
const base = 'http://localhost:5193', token = 'qa-recovery-only', results = [];
let child, sockets = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 12000) { let start = Date.now(); while (Date.now() - start < timeout) {
    if (await fn())
        return;
    await sleep(100);
} throw Error('Timed out: ' + label); }
const api = async (route, opts = {}) => { const r = await fetch(base + route, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }); assert.equal(r.ok, true); return r; };
const current = async () => (await (await api('/api/trials')).json()).at(-1);
async function launch() { child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, PORT: '5193', DATA_DIR: path.join(run, 'data'), STUDY_TOKEN: token, NODE_ENV: 'production' }, stdio: 'ignore' }); await until(async () => { try {
    return (await fetch(base + '/api/products')).ok;
}
catch {
    return false;
} }, 'server starts'); }
async function join(role, code) { const ws = new WebSocket('ws://localhost:5193/ws', { origin: base }); sockets.push(ws); await new Promise((resolve, reject) => { ws.on('error', reject); ws.on('open', () => ws.send(JSON.stringify({ type: 'join', role, code }))); ws.once('message', m => resolve(JSON.parse(m))); }); ws.send(JSON.stringify({type:'sound_ready',ready:true})); return ws; }
const send = (s, m) => s.send(JSON.stringify(m));
try {
    await launch();
    const t = (await (await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: 'QA_RECOVER', condition: 'B', demo: true }) })).json()).trial;
    let c = await join('checkout', t.code), s = await join('scanner', t.code);
    send(c, { type: 'sound_ready' });
    send(s, { type: 'sound_ready' });
    await until(async () => (await current()).connected.ready, 'ready');
    send(c, { type: 'start' });
    await until(async () => (await current()).phase === 'scanning', 'start');
    send(s, { type: 'scan', barcode: '2000000000053', scanId: 'persistent-tofu' });
    await until(async () => (await current()).cart.tofu === 1, 'first scan');
    child.kill();
    for (const socket of sockets)
        socket.terminate();
    sockets = [];
    await sleep(400);
    await launch();
    c = await join('checkout', t.code);
    s = await join('scanner', t.code);
    send(s, { type: 'scan', barcode: '2000000000053', scanId: 'persistent-tofu' });
    await sleep(200);
    assert.equal((await current()).cart.tofu, 1);
    results.push('PASS server restart restores cart, trial and dedup IDs; retransmission does not add');
    send(s, { type: 'scan', barcode: '2000000000022', scanId: 'timeout-beef' });
    await until(async () => (await current()).phase === 'feedback', 'feedback start');
    const start = Date.now();
    await until(async () => (await current()).phase === 'scanning', '5-second timeout', 7000);
    assert.ok(Date.now() - start < 6500);
    results.push('PASS missing completion signals recover in approximately 5 seconds with failed event');
    send(s, { type: 'scan', barcode: '2000000000015', scanId: 'disconnect-lamb' });
    await until(async () => (await current()).phase === 'feedback', 'second feedback');
    s.close();
    await until(async () => { const t = await current(); return t.phase === 'scanning' && !t.connected.scanner; }, 'disconnect recovery');
    const total = (await current()).totalCents;
    send(c, { type: 'pay' });
    await sleep(150);
    assert.equal((await current()).phase, 'scanning');
    assert.equal((await current()).totalCents, total);
    results.push('PASS disconnect during feedback logs failure and blocks payment until both devices reconnect');
    s = await join('scanner', t.code);
    send(c, { type: 'pay' });
    await until(async () => (await current()).phase === 'membership', 'pay');
    send(c, { type: 'membership' });
    await until(async () => (await current()).phase === 'payment', 'membership');
    send(c, { type: 'tap' });
    await until(async () => (await current()).phase === 'processing', 'tap');
    child.kill();
    for (const socket of sockets)
        socket.terminate();
    sockets = [];
    await sleep(300);
    await launch();
    const after = await current();
    assert.equal(after.phase, 'receipt');
    const all = await (await api('/api/export')).json();
    assert.equal(all.trials[0].events.filter(e => e.eventType === 'checkout_completed').length, 1);
    assert.ok(all.trials[0].events.filter(e => e.eventType === 'feedback_failed').length >= 2);
    results.push('PASS interrupted payment recovers exactly one approval/receipt after server restart');
    await writeFile(path.join(run, 'records.json'), JSON.stringify(all, null, 2));
    console.log(results.join('\n'));
}
catch (e) {
    results.push('FAIL ' + e);
    console.error(e);
    process.exitCode = 1;
}
finally {
    for (const s of sockets)
        s.terminate();
    child?.kill();
    await writeFile(path.join(run, 'results.json'), JSON.stringify({ time: new Date().toISOString(), results }, null, 2));
    console.log(run);
}
