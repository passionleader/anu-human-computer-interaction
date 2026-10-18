import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import products from './products.json';
export { products };
export type Role = 'checkout' | 'scanner' | 'study';
export type Phase = 'ready' | 'scanning' | 'feedback' | 'membership' | 'payment' | 'processing' | 'receipt' | 'ended';
export type Trial = {
    sessionId: string;
    trialId: string;
    participantId: string;
    condition: 'A' | 'B';
    demo: boolean;
    code: string;
    expires: number;
    phase: Phase;
    cart: Record<string, number>;
    events: any[];
    seen: Record<string, any>;
    feedback: null | {
        id: string;
        productId: string;
        started: number;
        results: Record<string, string>;
    };
    lastProduct: string | null;
    receiptId: string | null;
    created: string;
    ended: string | null;
    membership: string | null;
};
export const total = (t: Trial) => products.reduce((sum, p) => sum + p.priceCents * (t.cart[p.id] || 0), 0);
export function generatePairingCode(existing:Iterable<string>=[]):string {
    const used=new Set([...existing].map(code=>code.toUpperCase()));
    for(let attempt=0;attempt<10000;attempt++){
        const code=Array.from({length:4},()=>String.fromCharCode(65+randomInt(26))).join('');
        if(!used.has(code))return code;
    }
    throw new Error('No pairing code available. Please try again.');
}
export function createTrial(participantId: string, condition: 'A' | 'B', demo = false): Trial {
    return { sessionId: randomUUID(), trialId: randomUUID(), participantId, condition, demo, code: generatePairingCode(), expires: Date.now() + 8 * 3600000, phase: 'ready', cart: {}, events: [], seen: {}, feedback: null, lastProduct: null, receiptId: null, created: new Date().toISOString(), ended: null, membership: null };
}
export function log(t: Trial, eventType: string, extra: Record<string, unknown> = {}) {
    const e = { eventId: randomUUID(), sessionId: t.sessionId, participantId: t.participantId, trialId: t.trialId, condition: t.condition, serverTimestamp: new Date().toISOString(), eventType, productId: null, inputMethod: null, cartSnapshot: { ...t.cart }, mediaStatus: null, ...extra };
    t.events.push(e);
    return e;
}
export function finishFeedback(t: Trial, status: 'completed' | 'skipped' | 'failed', extra: Record<string, unknown> = {}) {
    if (!t.feedback)
        return;
    log(t, `feedback_${status}`, { productId: t.feedback.productId, mediaStatus: { ...t.feedback.results }, feedbackId: t.feedback.id, ...extra });
    t.feedback = null;
    t.phase = 'scanning';
}
export function command(t: Trial, role: Role, m: any, connected: {
    checkout: boolean;
    scanner: boolean;
    ready?: boolean;
}) {
    const reject = (reason: string) => ({ ok: false, reason });
    if(m.type==='help'){log(t,'help_requested',{device:role});return {ok:true};}
    if (m.type === 'scan') {
        if (typeof m.scanId !== 'string' || m.scanId.length > 100 || !m.scanId || ['__proto__', 'constructor', 'prototype'].includes(m.scanId))
            return reject('Invalid scan ID');
        if (Object.hasOwn(t.seen, m.scanId))
            return { ...t.seen[m.scanId], duplicate: true };
        const p = products.find(p => p.barcode === m.barcode);
        const failure = role !== 'scanner' ? 'Scanner only' : !connected.checkout || !connected.scanner ? 'Both devices must be connected' : t.phase !== 'scanning' ? 'Please wait until scanning is ready' : connected.ready===false?'Enable and test sound on both devices first':!p ? 'Item not recognised. Please try again.' : null;
        if (failure) {
            log(t, 'scan_rejected', { barcode: m.barcode, inputMethod: ['camera','image'].includes(m.inputMethod) ? m.inputMethod : 'manual', reason: failure, scanId:m.scanId });
            return t.seen[m.scanId] = reject(failure);
        }
        const method = ['camera', 'image'].includes(m.inputMethod) ? m.inputMethod : 'manual';
        t.cart[p!.id] = (t.cart[p!.id] || 0) + 1;
        t.lastProduct = p!.id;
        log(t, 'scan_accepted', { productId: p!.id, inputMethod: method, scanId: m.scanId });
        log(t, 'item_added', { productId: p!.id, inputMethod: method });
        const feedback = t.condition === 'B' && p!.feedbackType !== 'neutral';
        if (feedback) {
            t.phase = 'feedback';
            t.feedback = { id: randomUUID(), productId: p!.id, started: Date.now(), results: {} };
            log(t, 'feedback_started', { productId: p!.id, feedbackId: t.feedback.id });
        }
        return t.seen[m.scanId] = { ok: true, event: { id: m.scanId, type: 'accepted', productId: p!.id, feedbackId: t.feedback?.id || null } };
    }
    if (m.type === 'media') {
        if (!['checkout', 'scanner'].includes(role) || !t.feedback || t.feedback.id !== m.feedbackId)
            return reject('Stale feedback');
        t.feedback.results[role] = m.status === 'ok' ? 'ok' : 'failed';
        log(t, 'media_result', { productId: t.feedback.productId, device: role, mediaStatus: m.status, detail: String(m.detail || '').slice(0, 200) });
        if (m.status !== 'ok')
            finishFeedback(t, 'failed');
        else if (t.feedback?.results.checkout && t.feedback.results.scanner)
            finishFeedback(t, 'completed');
        return { ok: true };
    }
    if (m.type === 'skip' && ['checkout', 'scanner', 'study'].includes(role)) {
        finishFeedback(t, 'skipped');
        return { ok: true };
    }
    if (role === 'scanner')
        return reject('Not permitted');
    if (m.type === 'start' && t.phase === 'ready') {
        if (!connected.checkout || !connected.scanner || connected.ready === false)
            return reject('Enable and test sound on both devices first');
        t.phase = 'scanning';
        log(t, 'trial_started');
        return { ok: true };
    }
    if (m.type === 'end' && role === 'study' && !['processing', 'ended'].includes(t.phase)) {
        if (t.feedback)
            finishFeedback(t, 'skipped');
        t.phase = 'ended';
        t.ended = new Date().toISOString();
        log(t, 'trial_ended');
        return { ok: true };
    }
    if (!connected.checkout || !connected.scanner)
        return reject('Reconnect both devices to continue');
    if (m.type === 'remove' && t.phase === 'scanning' && (t.cart[m.productId] || 0) > 0) {
        if (--t.cart[m.productId] === 0)
            delete t.cart[m.productId];
        log(t, 'item_removed', { productId: m.productId });
        return { ok: true };
    }
    if (m.type === 'clear' && t.phase === 'scanning') {
        t.cart = {};
        t.lastProduct = null;
        log(t, 'cart_cleared');
        return { ok: true };
    }
    if (m.type === 'pay' && t.phase === 'scanning' && total(t) > 0) {
        t.phase = 'membership';
        log(t, 'membership_prompt');
        return { ok: true };
    }
    if (m.type === 'back' && ['membership', 'payment'].includes(t.phase)) {
        t.phase = 'scanning';
        log(t, 'checkout_resumed');
        return { ok: true };
    }
    if (m.type === 'membership' && t.phase === 'membership') {
        t.membership = m.demo ? 'demo' : 'skipped';
        log(t, m.demo ? 'membership_demo' : 'membership_skipped');
        t.phase = 'payment';
        return { ok: true };
    }
    if (m.type === 'tap' && t.phase === 'payment') {
        t.phase = 'processing';
        log(t, 'payment_started');
        return { ok: true, payment: true };
    }
    return reject('Action unavailable in this step');
}
export function approve(t: Trial) { if (t.phase !== 'processing')
    return; t.phase = 'receipt'; t.receiptId = 'DEMO-' + randomBytes(5).toString('hex').toUpperCase(); log(t, 'checkout_completed', { receiptId: t.receiptId, totalCents: total(t) }); }
