import express from 'express';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import {studyResults} from './study-results';
import { products, createTrial, generatePairingCode, command, finishFeedback, approve, log, total, restoreCartOrder, type Trial, type Role } from './core';
const root = process.cwd(), dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
const stateFile = resolve(dataDir, 'trials.json'), tokenFile = resolve(dataDir, 'study-token.txt');
const token = process.env.STUDY_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : randomBytes(24).toString('base64url'));
if (!existsSync(tokenFile))
    writeFileSync(tokenFile, token, { mode: 0o600 });
let trials: Trial[] = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : [];
for (const t of trials) {
    restoreCartOrder(t);
    if (t.feedback)
        finishFeedback(t, 'failed', { reason: 'server_restart' });
    if (t.phase === 'processing')
        approve(t);
}
const clients = new Map<WebSocket, {
    role: Role;
    trialId: string | null;
    ready: boolean;
}>();
function save() { writeFileSync(stateFile + '.tmp', JSON.stringify(trials, null, 2)); renameSync(stateFile + '.tmp', stateFile); }
function connection(t: Trial) { const roles = ['checkout', 'scanner'] as const; const connected = Object.fromEntries(roles.map(role => [role, [...clients.values()].some(c => c.trialId === t.trialId && c.role === role)])) as {
    checkout: boolean;
    scanner: boolean;
}; return { ...connected, ready: roles.every(role => [...clients.values()].some(c => c.trialId === t.trialId && c.role === role && c.ready)) }; }
function snapshot(t: Trial) { const { seen, events, participantId, ...safe } = t; return { ...safe, totalCents: total(t), connected: connection(t) }; }
function broadcast(t: Trial, event?: any) { for (const [ws, c] of clients)
    if ((c.trialId === t.trialId || c.role === 'study') && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'state', state: snapshot(t), event })); }
const app = express();
const hosted=process.env.RENDER==='true';
const publicBaseUrl=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||'';
if(hosted||process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.use(express.json({ limit: '32kb' }));
app.use((_q, r, next) => { r.setHeader('Permissions-Policy', 'camera=(self), microphone=()'); r.setHeader('Referrer-Policy', 'no-referrer'); r.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
const auth = (q: any, r: any, next: any) => q.headers.authorization === `Bearer ${token}` ? next() : r.status(401).json({ error: 'Researcher token required' });
function uniqueCode(){return generatePairingCode(trials.map(t=>t.code));}
const pairingAttempts=new Map<string,{count:number;reset:number}>();
function allowPairing(ip:string){let entry=pairingAttempts.get(ip);if(!entry||entry.reset<Date.now()){entry={count:0,reset:Date.now()+60000};pairingAttempts.set(ip,entry);}return ++entry.count<=30;}
setInterval(()=>{for(const [ip,entry] of pairingAttempts)if(entry.reset<Date.now())pairingAttempts.delete(ip);},60000).unref();
app.post('/api/pairing',(q,r)=>{
    if(!allowPairing(q.ip||'local'))return r.status(429).json({error:'Too many pairing attempts. Please wait one minute.'});
    let t=[...trials].reverse().find(t=>!['ended','receipt'].includes(t.phase));
    const supplied=typeof q.body?.checkoutCode==='string'?q.body.checkoutCode.trim():'';
    const knownCode=/^[a-z]{4}$/i.test(supplied)?supplied.toUpperCase():supplied;
    if(t&&!t.demo&&q.headers.authorization!==`Bearer ${token}`&&knownCode!==t.code)return r.status(403).json({error:'A study trial is active. Open the checkout link from the researcher console.'});
    if(!t){t=createTrial('DEMO_'+Date.now(),'B',true);t.code=uniqueCode();trials.push(t);}
    else if(!/^[A-Z]{4}$/.test(t.code)||t.expires<Date.now()){t.code=uniqueCode();t.expires=Date.now()+8*3600000;}
    log(t,'pairing_code_shown',{inputMethod:'checkout'});save();broadcast(t);r.json({code:t.code,trialId:t.trialId,expires:t.expires});
});
app.get('/api/products', (_q, r) => r.json(products));
app.get('/healthz',(_q,r)=>r.json({ok:true}));
app.get('/api/config', (_q, r) => r.json({ https: !!process.env.TLS_CERT||publicBaseUrl.startsWith('https://'),publicBaseUrl, dataPersistent:!hosted||process.env.DATA_PERSISTENT==='true',addresses:hosted?[]:Object.values(networkInterfaces()).flat().filter(a => a?.family === 'IPv4' && !a.internal).map(a => a!.address), port: Number(process.env.PORT || 5173) }));
app.post('/api/trials', auth, (q, r) => { const id = String(q.body.participantId || '').trim(); if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || !['A', 'B'].includes(q.body.condition))
    return r.status(400).json({ error: 'Use an anonymous ID (letters, digits, _ or -), and A/B condition' }); if (trials.some(t => !['ended', 'receipt'].includes(t.phase)))
    return r.status(409).json({ error: 'End the current trial first' }); const t = createTrial(id, q.body.condition, q.body.demo === true);t.code=uniqueCode(); trials.push(t); save(); r.json({ trial: t }); });
app.get('/api/trials', auth, (_q, r) => r.json(trials.map(t => ({ ...snapshot(t), participantId: t.participantId, eventCount: t.events.length }))));
app.get('/api/export', auth, (q, r) => { if (q.query.format === 'csv') {
    const fields = ['eventId', 'sessionId', 'participantId', 'trialId', 'condition', 'serverTimestamp', 'eventType', 'productId', 'inputMethod', 'cartSnapshot', 'mediaStatus', 'device', 'reason', 'scanId', 'feedbackId', 'receiptId', 'totalCents', 'detail'];
    const cell = (v: any) => '"' + String(typeof v === 'object' ? JSON.stringify(v) : v ?? '').replaceAll('"', '""') + '"';
    r.type('text/csv').attachment('study-events.csv').send('\uFEFF' + [fields.join(','), ...trials.flatMap(t => t.events.map(e => fields.map(f => cell(e[f])).join(',')))].join('\r\n'));
}
else
    r.attachment('study-records.json').json({ exported: new Date().toISOString(), products, trials: trials.map(t => ({ ...t, seen: undefined, summary: { totalCents: total(t), finalCart: t.cart, completed: t.receiptId !== null } })) }); });
app.get('/api/qr', async (q, r) => { try {
    const url = new URL(String(q.query.url));
    if (!['https:', 'http:'].includes(url.protocol))
        throw Error();
    r.type('image/svg+xml').send(await QRCode.toString(url.href, { type: 'svg', margin: 3, width: 340 }));
}
catch {
    r.status(400).send('Invalid URL');
} });
app.get('/api/results/:id',(q,r)=>{
    const t=trials.find(t=>t.code===q.query.code&&t.receiptId===q.params.id);
    if(!t)return r.sendStatus(404);
    r.setHeader('Cache-Control','no-store');
    r.attachment(`field-results-${t.participantId}-${t.condition}-${t.receiptId}.json`).json(studyResults(t));
});
app.get('/api/receipt/:id', (q, r) => { const t = trials.find(t => t.code === q.query.code && t.receiptId === q.params.id); if (!t)
    return r.sendStatus(404); r.attachment(t.receiptId + '.txt').type('text/plain').send(['FIELD / DIGITAL RECEIPT', t.receiptId, t.created, ...products.filter(p => t.cart[p.id]).map(p => `${p.name} | ${t.cart[p.id]} x $${(p.priceCents / 100).toFixed(2)} = $${(p.priceCents * t.cart[p.id] / 100).toFixed(2)}`), `TOTAL AUD $${(total(t) / 100).toFixed(2)}`, 'Demo payment - no charge made'].join('\n')); });
app.use('/assets', express.static(resolve(root, 'public/assets')));
let vite: any;
if (process.env.NODE_ENV !== 'development' && existsSync(resolve(root, 'dist/index.html'))) {
    app.use(express.static(resolve(root, 'dist')));
    app.get(/^(?!\/api).*/, (_q, r) => r.sendFile(resolve(root, 'dist/index.html')));
}
else {
    const { createServer } = await import('vite');
    vite = await createServer({ server: { middlewareMode: true, fs: { deny: ['**/data/**', '**/.cert/**', '**/.git/**', '**/asset-sources/**', '**/*.pem', '**/.env*'] } }, appType: 'spa' });
    app.use(vite.middlewares);
}
const server = process.env.TLS_CERT && process.env.TLS_KEY ? httpsServer({ cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }, app) : httpServer(app);
const wss = new WebSocketServer({ noServer: true });
const alive = new WeakMap<WebSocket, boolean>();
setInterval(() => { for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
        socket.terminate();
        continue;
    }
    alive.set(socket, false);
    socket.ping();
} }, 3000).unref();
server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws') { if(process.env.NODE_ENV!=='development')socket.destroy(); return; }
    try { if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;} }
    catch {socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection', (ws, req) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    let joined = false;
    const deadline = setTimeout(() => { if (!joined)
        ws.close(1008, 'Join required'); }, 5000);
    ws.on('message', raw => {
        try {
            if (raw.toString().length > 8192)
                return ws.close(1009);
            const m = JSON.parse(raw.toString());
            if (!joined) {
                if (m.type !== 'join' || !['checkout', 'scanner', 'study'].includes(m.role))
                    return ws.close(1008);
                if (m.role === 'study') {
                    if (m.token !== token)
                        return ws.close(1008, 'Invalid researcher token');
                    clients.set(ws, { role: 'study', trialId: null, ready: false });
                    ws.send(JSON.stringify({ type: 'joined' }));
                }
                else {
                    const suppliedCode=typeof m.code==='string'?m.code.trim():'';
                    const normalizedCode=/^[a-z]{4}$/i.test(suppliedCode)?suppliedCode.toUpperCase():suppliedCode;
                    const t = trials.find(t => t.code === normalizedCode && t.expires > Date.now()&&t.phase!=='ended');
                    if(!t&&!allowPairing(req.socket.remoteAddress||'local'))return ws.close(1008,'Too many attempts. Please wait one minute.');
                    if (!t)
                        return ws.close(1008, 'Invalid or expired code');
                    if ([...clients.values()].some(c => c.trialId === t.trialId && c.role === m.role))
                        return ws.close(1008, 'This device role is already connected');
                    clients.set(ws, { role: m.role, trialId: t.trialId, ready: false });
                    log(t, 'connection_restored', { device: m.role });
                    broadcast(t);
                    save();
                }
                joined = true;
                clearTimeout(deadline);
                return;
            }
            const c = clients.get(ws)!;
            if (m.type === 'ping')
                return ws.send(JSON.stringify({ type: 'pong' }));
            const t = trials.find(t => t.trialId === (c.role === 'study' ? m.trialId : c.trialId));
            if (!t)
                return;
            if (m.type === 'sound_ready' && c.role !== 'study') {
                c.ready = m.ready!==false;
                log(t, c.ready?'device_sound_enabled':'device_sound_failed', { device: c.role });
                save();
                broadcast(t);
                return;
            }
            if (m.type === 'device_error') {
                log(t, 'device_error', { device: c.role, detail: String(m.detail || '').slice(0, 200) });
                save();
                return;
            }
            const result = command(t, c.role, m, connection(t));
            save();
            ws.send(JSON.stringify({ type: 'result', requestId: m.requestId, scanId: m.scanId, ...result }));
            broadcast(t, (result as any).duplicate ? undefined : (result as any).event || (!result.ok && m.type === 'scan' ? { id: m.scanId, type: 'rejected', reason: (result as any).reason } : undefined));
            if ((result as any).payment)
                setTimeout(() => { approve(t); save(); broadcast(t); }, 1000);
        }
        catch (e) {
            ws.send(JSON.stringify({ type: 'error', reason: 'Invalid request' }));
        }
    });
    ws.on('close', () => { clearTimeout(deadline); const c = clients.get(ws); clients.delete(ws); const t = trials.find(t => t.trialId === c?.trialId); if (t) {
        log(t, 'connection_lost', { device: c?.role });
        if (t.feedback)
            finishFeedback(t, 'failed', { reason: 'device_disconnected' });
        save();
        broadcast(t);
    } });
});
setInterval(() => { for (const t of trials)
    if (t.feedback && Date.now() - t.feedback.started > 5000) {
        finishFeedback(t, 'failed', { reason: 'timeout' });
        save();
        broadcast(t);
    } }, 250).unref();
save();
server.listen(Number(process.env.PORT || 5173), '0.0.0.0', () => { console.log(`Checkout: ${publicBaseUrl||`${process.env.TLS_CERT ? 'https' : 'http'}://localhost:${process.env.PORT || 5173}`}/checkout`); console.log(process.env.STUDY_TOKEN?'Researcher token: use the STUDY_TOKEN environment setting. Open /study.':`Researcher token is in ${tokenFile}. Open /study and enter it. Do not share it with participants.`); });
