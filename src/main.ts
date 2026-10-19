import './style.css';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {EANCameraReader} from './barcode-reader';
import {CheckoutBeep} from './checkout-beep';
import catalogue from '../products.json';
type Product = typeof catalogue[number];
const app = document.querySelector<HTMLDivElement>('#app')!, role = location.pathname.startsWith('/scanner') ? 'scanner' : location.pathname.startsWith('/study') ? 'study' : 'checkout';
const money = (c: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(c / 100);
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
let state: any = null, ws: WebSocket | null = null, online = false, code = new URLSearchParams(location.search).get('code') || sessionStorage.getItem(role + 'Code') || '', studyToken = sessionStorage.getItem('studyToken') || '';
let audioEnabled = false, audioContext: AudioContext | null = null, activeAudio: HTMLAudioElement | null = null, activeVideo: HTMLVideoElement | null = null, mediaTimer: ReturnType<typeof setTimeout> | undefined, feedbackId: string | null = null, lastPhase = '', notice = '', reconnectTimer: ReturnType<typeof setTimeout> | undefined, cameraStarted = false, guideAudio: HTMLAudioElement | null = null, stopCamera: (() => void) | null = null;
let readySent = false, participantNotice='', soundPreparing=false,cameraStarting=false,cameraRequest=0;
let cameraStream:MediaStream|null=null;
let checkoutBeep:CheckoutBeep|null=null;
function scannerLink(){const url=new URL('/scanner',location.origin);if(code)url.searchParams.set('code',code);return url.href;}
function scannerQR(){return '/api/qr?url='+encodeURIComponent(scannerLink());}
let cameraDeviceId='',cameraDevices:MediaDeviceInfo[]=[],cameraTorch=false,cameraZoom:number|null=null;
let cameraCaps:{torch?:boolean;zoom?:{min:number;max:number;step?:number};focusMode?:string[]}={};
const pending = new Map<string, any>(), processed = new Set<string>();
const soundFiles = ['cow', 'sheep', 'pig', 'thanks','welcome','unknown','membership','payment','complete'];
const sounds = Object.fromEntries(soundFiles.map(n => { const a = new Audio(`/assets/media/${n}.wav`); a.preload = 'auto'; return [n, a]; }));
const send = (m: any) => { if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...m, requestId: crypto.randomUUID() }));
    return true;
} notice = 'Connection lost. Reconnecting…'; render(); return false; };
function connect() { clearTimeout(reconnectTimer); if ((role==='study'&&!studyToken)||(!code && role !== 'study'))
    return; ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); ws.onopen = () => ws!.send(JSON.stringify({ type: 'join', role, code, token: studyToken })); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'joined') {
    online = true;
    renderStudy();
} if (m.type === 'state') {
    online = true;
    const previous = state;
    state = m.state;
    if(role==='scanner'&&['payment','processing','receipt','ended'].includes(state.phase)&&(cameraStream||cameraStarting)){++cameraRequest;cameraStarting=false;releaseCamera();}
    if(role!=='study'&&/^[A-Z]{4}$/.test(state.code)){code=state.code;sessionStorage.setItem(role+'Code',code);const url=new URL(location.href);url.searchParams.set('code',code);history.replaceState(null,'',url);}
    notice = ['ready','scanning','feedback'].includes(state.phase)?participantNotice:'';
    if (previous?.trialId !== state.trialId) {
        processed.clear();
        lastPhase = '';
    }
    if (role !== 'study' && m.event && !processed.has(m.event.id)) {
        processed.add(m.event.id);
        if (m.event.type === 'accepted') {
            participantNotice='';notice='';
            onAccepted(m.event);
        }
        else {
            notice = m.event.reason;
            if(role==='checkout'&&String(m.event.reason).includes('Item not recognised'))playGuide('unknown');
        }
    }
    if (state.phase !== 'feedback')
        stopMedia();
    render();
    if (audioEnabled && online && !state.connected.ready && !readySent) {
        send({ type: 'sound_ready' });
        readySent = true;
    }
    if (role === 'checkout' && state.phase !== lastPhase) {
        speakPhase(state.phase);
        lastPhase = state.phase;
    }
    if (role === 'scanner' && previous?.phase === 'feedback' && state.phase === 'scanning')
        notice = 'Ready for the next item';
    for (const m of pending.values())
        send(m);
} if (m.type === 'result') {
    if (m.scanId)
        pending.delete(m.scanId);
    if (!m.ok) {
        notice = m.reason;
        render();
        if (role === 'checkout' && m.reason?.includes('not recognised'))
            playGuide('unknown');
    }
    else if (role === 'checkout' && notice === '') { }
} }; ws.onclose = e => { online = false; readySent = false; stopMedia(); if (e.code === 1008) {
    notice = e.reason || 'Invalid pairing. Ask the researcher to reconnect.';
    render();
    return;
} render(); reconnectTimer = setTimeout(connect, 1500); }; }
setInterval(() => { if (online)
    send({ type: 'ping' }); }, 15000);
function soundFailure(detail:string){audioEnabled=false;readySent=false;participantNotice=notice='Sound unavailable. Check this device’s sound and try Enable sound again.';send({type:'sound_ready',ready:false});send({type:'device_error',detail});render();}
async function enableSound():Promise<boolean> {
    if(soundPreparing||state?.phase==='feedback')return false;
    soundPreparing=true;audioEnabled=false;readySent=false;
    try {
        audioContext??=new AudioContext();await audioContext.resume();
        if(role==='checkout')checkoutBeep=new CheckoutBeep(audioContext);
        const required=role==='checkout'?['beep','welcome','unknown','membership','payment','complete']:state?.condition==='B'?['cow','sheep','pig','thanks']:[];
        const results=await Promise.allSettled(required.map(async name=>{
            if(name==='beep'){await checkoutBeep!.prepare();return;}
            const a=sounds[name];let timeout:ReturnType<typeof setTimeout>|undefined;a.muted=true;a.load();
            try {await Promise.race([a.play(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error(name+' audio timed out')),4000);})]);}
            finally {clearTimeout(timeout);a.pause();a.currentTime=0;a.muted=false;}
        }));
        const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
        audioEnabled=true;participantNotice=notice='';send({type:'sound_ready',ready:true});readySent=true;return true;
    }catch(e){soundFailure('Sound preparation failed: '+e);return false;}
    finally {soundPreparing=false;render();}
}
async function testSound(name:string){try{if(name==='beep'){guideAudio?.pause();if(!checkoutBeep)throw Error('Enable checkout sound first');await checkoutBeep.play();}else{sounds[name].currentTime=0;await sounds[name].play();}}catch(e){soundFailure('Sound test failed: '+e);}}
function playGuide(name: string) { guideAudio?.pause(); speechSynthesis.cancel(); if (!audioEnabled)
    return; guideAudio = new Audio(`/assets/media/${name}.wav`); guideAudio.play().catch(e => { send({ type: 'device_error', detail: 'Guidance failed: ' + e }); notice = 'Audio unavailable. Ask the researcher for help.'; }); }
function speakPhase(phase: string) { guideAudio?.pause(); const names: Record<string, string> = { scanning: 'welcome', membership: 'membership', payment: 'payment', receipt: 'complete' }; if (phase === 'scanning' && Object.keys(state.cart).length)
    return; if (names[phase])
    playGuide(names[phase]); }
function stopMedia() { clearTimeout(mediaTimer); activeAudio?.pause(); if (activeAudio)
    activeAudio.currentTime = 0; activeVideo?.pause(); activeAudio = null; activeVideo = null; feedbackId = null; }
async function onAccepted(event: any) {
    const p = catalogue.find(p => p.id === event.productId)!;
    if (role === 'checkout') {
        speechSynthesis.cancel();
        guideAudio?.pause();
        try {
            if (!audioEnabled)
                throw Error('Checkout sound not enabled');
            if(!checkoutBeep)throw Error('Checkout beep is not prepared');
            await checkoutBeep.play();
        }
        catch (e) {
            send({ type: 'media', feedbackId: event.feedbackId, status: 'failed', detail: String(e) });
            soundFailure('Checkout beep failed: '+e);
        }
    }
    if (!event.feedbackId)
        return;
    feedbackId = event.feedbackId;
    // The beep lasts 120 ms; additional feedback starts just after it.
    setTimeout(async () => {
        if (state?.feedback?.id !== event.feedbackId)
            return;
        try {
            if (role === 'scanner') {
                if (!audioEnabled)
                    throw Error('Scanner sound not enabled');
                activeAudio = sounds[p.feedbackType === 'vegan_thanks' ? 'thanks' : p.animal!];
                activeAudio.currentTime = 0;
                await activeAudio.play();
                await new Promise<void>((resolve, reject) => { const a = activeAudio!; a.onended = () => resolve(); a.onerror = () => reject(Error('Audio load failed')); mediaTimer = setTimeout(() => { a.pause(); resolve(); }, 3000); });
            }
            else if (role === 'checkout' && p.videoPath) {
                activeVideo = document.querySelector<HTMLVideoElement>('#animal-video');
                if (!activeVideo)
                    throw Error('Video element missing');
                activeVideo.muted = true;
                await activeVideo.play();
                await new Promise<void>((resolve, reject) => { activeVideo!.onerror = () => reject(Error('Video load failed')); mediaTimer = setTimeout(() => { activeVideo?.pause(); resolve(); }, 3000); });
            }
            if (state?.feedback?.id === event.feedbackId)
                send({ type: 'media', feedbackId: event.feedbackId, status: 'ok' });
        }
        catch (e) {
            send({ type: 'media', feedbackId: event.feedbackId, status: 'failed', detail: String(e) });
            notice = 'Feedback could not play. You can continue scanning.';
        }
    }, 180);
}
function shell(content: string) {
    const qrOpen=document.querySelector<HTMLDialogElement>('#scanner-qr-dialog')?.open||false;
    const codeOpen=document.querySelector<HTMLDialogElement>('#code-pairing-dialog')?.open||false;
    const scannerUrl=scannerLink();
    const qrButton=role==='checkout'?`<button id="open-scanner-qr" class="scanner-qr-trigger" aria-label="Open phone scanner QR code" title="Open phone scanner QR code"><img src="${scannerQR()}" alt="" width="52" height="52"><span>Connect phone</span></button>`:'';
    app.classList.toggle('checkout-layout',role==='checkout'&&Boolean(state));
    app.innerHTML=`<header><a class="brand" href="/checkout">field<span>SELF CHECKOUT</span></a><div class="header-tools"><div class="status ${online?'good':''}" aria-live="polite">● ${online?'Connected':'Not connected'}</div>${qrButton}</div></header>${content}<footer class="site-footer"><span>© 2026 <a href="mailto:u8321477@anu.edu.au">u8321477@anu.edu.au</a> · All rights reserved.</span><span>ANU COMP6390 HCI assignment prototype · No real payments</span><span><a href="https://render.com" target="_blank" rel="noopener">Hosted on Render</a> · <a href="https://github.com/passionleader" target="_blank" rel="noopener">GitHub</a> · <a href="https://github.com/passionleader/anu-human-computer-interaction" target="_blank" rel="noopener">Source code</a></span></footer>${role==='checkout'?`<dialog id="scanner-qr-dialog" class="scanner-qr-dialog" aria-labelledby="scanner-qr-title"><h2 id="scanner-qr-title">Open the phone scanner</h2><p>Scan with your phone’s camera to connect automatically.</p><img id="scanner-entry-qr-image" src="${scannerQR()}" width="300" height="300" alt="QR code for the smartphone scanner"><p>${/^[A-Z]{4}$/.test(code)?`Or connect with this code:<strong class="scanner-qr-code">${esc(code)}</strong>`:'Generate a connection on the checkout first to link your phone directly.'}</p><a class="scanner-qr-link" href="${scannerUrl}" target="_blank" rel="noopener">Open scanner link ↗</a><form method="dialog"><button class="primary">Close QR code</button></form></dialog><dialog id="code-pairing-dialog" class="scanner-qr-dialog" aria-labelledby="code-pairing-title"><h2 id="code-pairing-title">Connect with code</h2><p>Open the scanner on your phone and enter:</p><strong class="scanner-qr-code">${esc(code)}</strong><form method="dialog"><button class="primary">Close code</button></form></dialog>`:''}`;
    const dialog=document.querySelector<HTMLDialogElement>('#scanner-qr-dialog');
    document.querySelector('#open-scanner-qr')?.addEventListener('click',async()=>{if(!state){if(!await generateCode())return;render();}document.querySelector<HTMLDialogElement>('#scanner-qr-dialog')?.showModal();});
    if(qrOpen&&dialog)dialog.showModal();
    const codeDialog=document.querySelector<HTMLDialogElement>('#code-pairing-dialog');
    document.querySelectorAll('[data-code-pairing]').forEach(button=>button.addEventListener('click',()=>codeDialog?.showModal()));
    if(codeOpen&&codeDialog)codeDialog.showModal();
}
async function generateCode(){
    try {
        const response=await fetch('/api/pairing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checkoutCode:code})});
        const result=await response.json();if(!response.ok)throw Error(result.error);
        code=result.code;sessionStorage.setItem('checkoutCode',code);
        const url=new URL(location.href);url.searchParams.set('code',code);history.replaceState(null,'',url);
        if(state?.trialId===result.trialId&&online){state.code=code;render();}
        else{if(ws){ws.onclose=null;ws.close();}state=null;online=false;connect();}
        return true;
    }catch(e){notice=String(e);render();return false;}
}
function pair(){
    const scanner=role==='scanner';
    shell(`<main class="pair"><p class="eyebrow">${scanner?'YOUR HANDHELD SCANNER':'WELCOME TO FIELD'}</p><h1>${scanner?'Connect your scanner.':'Your shopping, at your pace.'}</h1><p>${scanner?'Enter the four letters shown on the checkout screen.':'Connect your phone to use it as a barcode scanner. A large QR code will appear next.'}</p>${scanner?`<form id="pair-form"><label>Four-letter pairing code<input id="code" required minlength="4" maxlength="4" pattern="[A-Za-z]{4}" value="${/^[a-z]{4}$/i.test(code)?esc(code.toUpperCase()):''}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:0.3em"></label><button class="primary">Connect</button></form>`:'<button id="generate-code" class="primary large">Connect phone scanner</button>'}<p class="alert" role="status">${esc(notice)}</p></main>`);
    document.querySelector('#generate-code')?.addEventListener('click',()=>void generateCode());
    document.querySelector('#pair-form')?.addEventListener('submit',e=>{e.preventDefault();code=document.querySelector<HTMLInputElement>('#code')!.value.trim().toUpperCase();sessionStorage.setItem('scannerCode',code);if(ws){ws.onclose=null;ws.close();}connect();});
}
function render() { if (role === 'study') {
    void renderStudy();
    return;
} if (!state) {
    pair();
    return;
} if (role === 'scanner') {
    renderScanner();
    return;
} renderCheckout(); }
function renderCheckout() {
    const retainedVideo = activeVideo;
    const basketScroll=document.querySelector<HTMLUListElement>('.basket ul')?.scrollTop||0;
    const p = catalogue.find(p => p.id === state.lastProduct), blocked = !online || !state.connected.scanner;
    let panel = '';
    if (state.phase === 'ready')
        panel = `<div class="intro"><p class="eyebrow">A LITTLE SPACE TO CHOOSE</p><h1>Welcome.<br>Let’s check out.</h1><p>${state.connected.scanner ? "Your phone is connected. Enable sound, then start shopping." : "Scan the QR code with your phone’s camera to connect."}</p><div class="scanner-connect"><img id="pairing-qr" src="${scannerQR()}" width="220" height="220" alt="Scan to connect this checkout to your phone"><div><b>Scan to connect</b><p>No code entry needed.</p><button data-code-pairing>Connect with code</button></div></div><button data-action="start" class="primary large" ${blocked || !state.connected.ready ? 'disabled' : ''}>Start shopping <span>→</span></button></div>`;
    else if (['scanning', 'feedback'].includes(state.phase))
        panel = state.phase === 'feedback' && p?.videoPath ? `<div class="video-wrap"><video id="animal-video" src="${p.videoPath}" muted playsinline preload="auto"></video><div class="video-controls"><span>Please wait…</span><button data-action="skip">Skip feedback</button></div></div>` : `<div class="scan-stage"><p class="eyebrow">${state.phase === 'feedback' ? 'PLEASE WAIT…' : 'SCAN • REVIEW • CHOOSE'}</p>${p ? `<img class="hero-product" src="${p.imagePath}" alt="${p.name}"><h1>${p.name}</h1><p>${p.packSize} <b>${money(p.priceCents)}</b></p>` : `<div class="scan-symbol">▥</div><h1>Scan your first item</h1><p>Hold a product barcode inside the scanner frame.</p>`}${state.phase === 'feedback' ? '<button data-action="skip">Skip feedback</button>' : '<p class="muted">Keep shopping whenever you like.</p>'}</div>`;
    else if (state.phase === 'membership')
        panel = `<div class="intro"><p class="eyebrow">01 / MEMBERSHIP</p><h1>Have a<br>membership card?</h1><p>Scan your membership card, or select Skip.</p><div class="actions"><button data-action="membership-demo" class="primary">Demo membership</button><button data-action="membership">Skip</button></div><button data-action="back" class="text-button">← Back to shopping</button></div>`;
    else if (['payment', 'processing'].includes(state.phase))
        panel = `<div class="intro"><p class="eyebrow">02 / DEMO PAYMENT</p><h1>${state.phase === 'processing' ? 'Processing…' : 'Ready when you are.'}</h1><p>Tap your card, or pay directly on your smartphone.<br>Demo only: tap the terminal below or the Pay button on your phone.</p><button data-action="tap" class="terminal" ${state.phase === 'processing' || blocked ? 'disabled' : ''}><span>◉</span><b>${money(state.totalCents)}</b><small>${state.phase === 'processing' ? 'Processing…' : 'Tap to pay · simulation'}</small></button>${state.phase === 'payment' ? '<button data-action="back" class="text-button">← Back to shopping</button>' : ''}</div>`;
    else if (state.phase === 'receipt')
        panel = `<div class="intro receipt"><p class="eyebrow">03 / ALL DONE</p><div class="checkmark">✓</div><h1>Thank you.</h1><p>Your receipt has been sent to your smartphone.<br>View your purchases on the connected scanner.</p><p class="receipt-id">${esc(state.receiptId)}</p><div class="receipt-line total"><span>Total</span><b>${money(state.totalCents)}</b></div><p>Demo payment — no charge made</p></div>`;
    else
        panel = '<div class="intro"><h1>This session has ended.</h1><p>Thank you for taking part.</p></div>';
    const rows = catalogue.filter(p => state.cart[p.id]).map(p => `<li><img src="${p.imagePath}" alt=""><div><b>${p.name}</b><small>${state.cart[p.id]} × ${money(p.priceCents)} · ${p.packSize}</small>${state.phase === 'scanning' ? `<button class="remove" data-remove="${p.id}" ${blocked ? 'disabled' : ''}>Remove one</button>` : ''}</div><strong>${money(p.priceCents * state.cart[p.id])}</strong></li>`).join('');
    shell(`${/^[A-Z]{4}$/.test(code)?`<div class="pairing-banner"><span>SCANNER PAIRING CODE</span><strong id="pairing-code">${esc(code)}</strong><small>QR connection available in the top-right corner.</small></div>`:''}<main class="checkout"><section class="experience">${panel}</section><aside class="basket"><div class="basket-heading"><h2>Your basket</h2><span>${Object.values(state.cart).reduce((a: any, b: any) => a + b, 0)} items</span></div><ul tabindex="0" aria-label="Scanned items">${rows || '<li class="empty">Your basket is ready for something good.</li>'}</ul><div class="basket-bottom"><div class="subtotal"><span>Total <small>AUD</small></span><b>${money(state.totalCents)}</b></div><button class="primary pay" data-action="pay" ${state.phase !== 'scanning' || !state.totalCents || blocked ? 'disabled' : ''}>Pay ${money(state.totalCents)} <span>→</span></button>${state.phase === 'scanning' ? `<button class="text-button" data-action="clear" ${blocked ? 'disabled' : ''}>Start again</button>` : ''}</div></aside></main><div class="bottom-tools">${!audioEnabled ? '<button id="enable-sound">Enable checkout sound</button>' : '<button id="test-sound">Test checkout sound</button>'}<button id="pair-scanner">Pair scanner</button><button id="help">Help</button></div><p class="notice" role="status">${esc(notice || (blocked ? 'Connect the scanner to continue.' : !state.connected.ready ? 'Enable and test sound on both devices.' : ''))}</p>`);
    document.querySelector<HTMLUListElement>('.basket ul')!.scrollTop=basketScroll;
    if (retainedVideo && state.phase === 'feedback' && document.querySelector('#animal-video'))
        document.querySelector('#animal-video')!.replaceWith(retainedVideo);
    document.querySelector('#enable-sound')?.addEventListener('click', async () => {if(await enableSound())await testSound('beep');});
    document.querySelector('#test-sound')?.addEventListener('click', () => {if(state.phase!=='feedback')void testSound('beep');});
    document.querySelector('#pair-scanner')?.addEventListener('click',()=>void generateCode());
    document.querySelector('#help')?.addEventListener('click', () => { participantNotice='Please ask the researcher for help. You may skip feedback or stop at any time.';send({type:'help'}); notice = participantNotice; render(); });
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.onclick = () => { const action = b.dataset.action!; if (action === 'clear' && !confirm('Return all selected cards to the tray and start again?'))
        return; send({ type: action === 'membership-demo' ? 'membership' : action, demo: action === 'membership-demo' }); if (action === 'remove' || action === 'clear')
        participantNotice=notice = 'Place the item in the return tray.'; });
    document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(b => b.onclick = () => {participantNotice=notice='Place the item in the return tray.';send({ type: 'remove', productId: b.dataset.remove }); });
}
let lastSeen = '', lastDetected = 0, scanLock = false;
function observeBarcode(value: string | null) { const now = Date.now(); if (!value) {
    if (now - lastDetected > 850)
        lastSeen = '';
    return;
} lastDetected = now; if (value === lastSeen || scanLock || !online || state?.phase !== 'scanning')
    return; lastSeen = value; scan(value, 'camera'); }
function scan(barcode: string, inputMethod: string) { if (!online || state?.phase !== 'scanning') {
    notice = 'Please wait until scanning is ready.';
    renderScanner();
    return;
} const m = { type: 'scan', barcode, scanId: crypto.randomUUID(), inputMethod }; pending.set(m.scanId, m); send(m); scanLock = true; setTimeout(() => scanLock = false, 500); }
function releaseCamera(){stopCamera?.();stopCamera=null;cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;cameraStarted=false;cameraTorch=false;cameraZoom=null;cameraCaps={};}
async function adjustCamera(value:Record<string,unknown>){
    const track=cameraStream?.getVideoTracks()[0];if(!track)return;
    try{await track.applyConstraints({advanced:[value as MediaTrackConstraintSet]});
        const settings=track.getSettings() as MediaTrackSettings&{zoom?:number;torch?:boolean};
        cameraTorch=settings.torch??(typeof value.torch==='boolean'?value.torch:cameraTorch);cameraZoom=settings.zoom??(typeof value.zoom==='number'?value.zoom:cameraZoom);
    }catch{notice='This camera could not apply that setting. Try another camera or move farther from the barcode.';}
    renderScanner();
}
async function startCamera(){
    if(cameraStarting)return;
    const request=++cameraRequest;cameraStarting=true;renderScanner();
    let acquired:MediaStream|null=null;
    try{
        if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Open this scanner over HTTPS to use the camera.');
        if(!await enableSound())return;
        if(request!==cameraRequest||document.hidden)return;
        releaseCamera();
        const videoConstraints:MediaTrackConstraints={width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}};
        if(cameraDeviceId)videoConstraints.deviceId={exact:cameraDeviceId};else videoConstraints.facingMode={ideal:'environment'};
        acquired=await navigator.mediaDevices.getUserMedia({video:videoConstraints,audio:false});
        if(request!==cameraRequest||document.hidden){acquired.getTracks().forEach(track=>track.stop());return;}
        cameraStream=acquired;
        const track=acquired.getVideoTracks()[0];
        cameraDeviceId=track.getSettings().deviceId||cameraDeviceId;
        try{cameraDevices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');}catch{cameraDevices=[];}
        if(request!==cameraRequest||document.hidden){acquired.getTracks().forEach(track=>track.stop());return;}
        try{cameraCaps=track.getCapabilities?.() as typeof cameraCaps||{};}catch{cameraCaps={};}
        if(cameraCaps.focusMode?.includes('continuous')){
            try{await track.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]});}catch{/* Optional; unsupported focus must not prevent scanning. */}
        }
        if(request!==cameraRequest||document.hidden){acquired.getTracks().forEach(track=>track.stop());return;}
        cameraZoom=(track.getSettings() as MediaTrackSettings&{zoom?:number}).zoom??null;
        const video=document.querySelector<HTMLVideoElement>('#camera')!;
        video.muted=true;video.defaultMuted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
        const reader=new EANCameraReader();
        const controls=await reader.decodeFromStream(acquired,video,result=>observeBarcode(result?.getText()||null));
        if(request!==cameraRequest||document.hidden){controls.stop();acquired.getTracks().forEach(track=>track.stop());return;}
        stopCamera=()=>controls.stop();await video.play();
        await new Promise<void>((resolve,reject)=>{const started=performance.now();const frame=()=>{if(request!==cameraRequest)return reject(Error('Camera start cancelled'));if(video.videoWidth>0&&video.videoHeight>0&&video.readyState>=2)return resolve();if(performance.now()-started>8000)return reject(Error('No camera frames received. Close other camera tabs and retry.'));requestAnimationFrame(frame);};frame();});
        cameraStarted=true;notice='';
    }catch(e){acquired?.getTracks().forEach(track=>track.stop());if(request!==cameraRequest)return;releaseCamera();send({type:'device_error',detail:'Camera failed: '+e});participantNotice=notice=`Camera unavailable: ${e instanceof Error?e.message:e} Check camera permission and select Retry camera.`;}
    finally{if(request===cameraRequest){cameraStarting=false;renderScanner();}}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) {
    ++cameraRequest;cameraStarting=false;releaseCamera();
    send({ type: 'media', feedbackId: state?.feedback?.id, status: 'failed', detail: 'Scanner tab hidden' });
}
else if (role === 'scanner')
    renderScanner(); });
function renderPhonePayment(){
    const receipt=state.phase==='receipt';
    const rows=catalogue.filter(p=>state.cart[p.id]).map(p=>`<li><img src="${p.imagePath}" alt=""><div><b>${esc(p.name)}</b><small>${state.cart[p.id]} × ${money(p.priceCents)} · ${esc(p.packSize)}</small></div><strong>${money(p.priceCents*state.cart[p.id])}</strong></li>`).join('');
    shell(`<main class="scanner phone-purchases"><p class="eyebrow">${receipt?'DIGITAL RECEIPT':'DEMO PAYMENT'}</p>${receipt?'<div class="checkmark">✓</div>':''}<h1>${receipt?'Payment complete.':state.phase==='processing'?'Processing…':'Pay on your phone.'}</h1><p>${receipt?'Your receipt is here. Review your purchases below.':'Tap Pay below, or use the terminal on the checkout screen.'}</p>${receipt?`<p class="receipt-id">${esc(state.receiptId)}</p>`:''}<ul class="phone-receipt-items" aria-label="Purchased items">${rows}</ul><div class="receipt-line total"><span>Total AUD</span><b>${money(state.totalCents)}</b></div><p>Demo payment — no charge made.</p>${receipt?`<a class="button" href="/api/receipt/${encodeURIComponent(state.receiptId)}?code=${encodeURIComponent(code)}">Save receipt</a>`:`<button id="phone-pay" class="primary pay" ${state.phase!=='payment'||!online||!state.connected.checkout?'disabled':''}>${state.phase==='processing'?'Processing…':'Pay '+money(state.totalCents)+' · demo'}</button>`}<p class="alert" role="status">${esc(!online?'Connection lost. Reconnecting…':notice)}</p></main>`);
    document.querySelector('#phone-pay')?.addEventListener('click',()=>send({type:'tap'}));
}
function renderScanner() { if (!state) {
    pair();
    return;
} if(['payment','processing','receipt'].includes(state.phase)){renderPhonePayment();return;} const toolsOpen=document.querySelector<HTMLDetailsElement>('details')?.open||false,manualDraft=document.querySelector<HTMLInputElement>('#barcode')?.value||'';const oldVideo = document.querySelector<HTMLVideoElement>('#camera'); const p = catalogue.find(p => p.id === state.lastProduct); shell(`<main class="scanner"><p class="eyebrow">HANDHELD SCANNER</p><h1>${state.phase === 'feedback' ? 'Please wait…' : state.phase === 'scanning' ? 'Ready to scan.' : state.phase === 'ready' ? 'Ready when you are.' : 'Follow the checkout screen.'}</h1><p>${state.phase === 'ready' ? 'Waiting for the laptop checkout to start shopping.' : state.phase === 'feedback' ? 'Wait for the checkout feedback to finish before the next scan.' : 'Centre the barcode, including its white margins. Move farther away if the bars look blurry.'}</p>${state.phase === 'ready' ? '<div class="scanner-waiting" role="status"><b>Scanning has not started</b><p>Enable sound on both devices, then select <strong>Start shopping</strong> on the laptop checkout.</p></div>' : ''}<div class="camera-box"><video id="camera" autoplay muted playsinline></video><div class="camera-frame"></div>${!cameraStarted?(cameraStarting?'<div class="camera-starting" role="status">Starting camera…<br>Allow camera access when asked.</div>':'<button class="primary" id="enable-camera">Enable camera & sound</button>'):''}</div>${cameraStarted?`<div class="camera-controls">${cameraDevices.length>1?`<label>Camera<select id="camera-select">${cameraDevices.map((device,index)=>`<option value="${esc(device.deviceId)}" ${device.deviceId===cameraDeviceId?'selected':''}>${esc(device.label||`Camera ${index+1}`)}</option>`).join('')}</select></label>`:''}${cameraCaps.zoom&&cameraZoom!==null?`<label>Zoom<input id="camera-zoom" type="range" min="${cameraCaps.zoom.min}" max="${Math.min(cameraCaps.zoom.max,Math.max(cameraCaps.zoom.min,3))}" step="${cameraCaps.zoom.step||0.1}" value="${cameraZoom}"></label>`:''}${cameraCaps.torch?`<button id="camera-light" aria-pressed="${cameraTorch}">Light ${cameraTorch?'on':'off'}</button>`:''}<p>If the barcode stays blurry, try another rear camera. Keep the whole barcode in view.</p></div>`:''}<div class="last-item"><span>LAST ADDED</span><b>${p ? esc(p.name) : 'No items yet'}</b></div>${state.phase === 'feedback' ? '<button data-skip>Skip feedback</button>' : ''}<p class="alert" role="status">${esc(notice || (!online ? 'Connection lost. Reconnecting…' : ''))}</p><details><summary>Researcher tools</summary><p>Manual entry is recorded separately from camera scans.</p><form id="manual"><label>EAN-13<input inputmode="numeric" id="barcode" pattern="[0-9]{13}" required maxlength="13"></label><button ${state.phase !== 'scanning' || !online ? 'disabled' : ''}>Add barcode manually</button></form><label>Developer: decode a barcode image<input id="barcode-image" type="file" accept="image/*"></label><button id="sound-test">Enable & test scanner sound</button><button id="retry-camera">Retry camera</button></details><p class="muted">Keep this tab open and the screen awake.<br>Camera images stay on this device.</p></main>`); if (oldVideo)
    document.querySelector('#camera')!.replaceWith(oldVideo);document.querySelector<HTMLDetailsElement>('details')!.open=toolsOpen;document.querySelector<HTMLInputElement>('#barcode')!.value=manualDraft; document.querySelector('#camera-select')?.addEventListener('change',e=>{cameraDeviceId=(e.target as HTMLSelectElement).value;releaseCamera();void startCamera();});document.querySelector('#camera-zoom')?.addEventListener('change',e=>void adjustCamera({zoom:Number((e.target as HTMLInputElement).value)}));document.querySelector('#camera-light')?.addEventListener('click',()=>void adjustCamera({torch:!cameraTorch})); document.querySelector('#enable-camera')?.addEventListener('click', () => void startCamera()); document.querySelector('#retry-camera')?.addEventListener('click', () => {releaseCamera();void startCamera();}); document.querySelector('#sound-test')?.addEventListener('click', async () => { if(await enableSound())await testSound('cow'); }); document.querySelector('[data-skip]')?.addEventListener('click', () => send({ type: 'skip' })); document.querySelector('#barcode-image')?.addEventListener('change', async (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file)
    return; const url = URL.createObjectURL(file); try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(url);
    scan(result.getText(), 'image');
}
catch {
    notice = 'No EAN-13 found in the image.';
    renderScanner();
}
finally {
    URL.revokeObjectURL(url);
} }); document.querySelector('#manual')?.addEventListener('submit', e => { e.preventDefault(); scan(document.querySelector<HTMLInputElement>('#barcode')!.value.trim(), 'manual'); }); }
async function api(path: string, init?: RequestInit) { const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studyToken}`, ...init?.headers } }); if (!r.ok)
    throw Error((await r.json()).error || r.statusText); return r; }
let studyRendering = false, studyRenderQueued=false;
async function renderStudy() {
    if (studyRendering) { studyRenderQueued=true; return; }
    studyRendering = true;
    try {
        if (!studyToken) {
            shell(`<main class="study"><p class="eyebrow">RESEARCHER</p><h1>Study console</h1><p>Enter the researcher token from Render environment settings (STUDY_TOKEN), or your local data/study-token.txt.</p><form id="study-auth"><label>Researcher token<input id="token" type="password" required></label><button class="primary">Unlock console</button></form><p>${esc(notice)}</p></main>`);
            document.querySelector('#study-auth')!.addEventListener('submit', e => { e.preventDefault(); studyToken = document.querySelector<HTMLInputElement>('#token')!.value.trim(); sessionStorage.setItem('studyToken', studyToken); connect(); void renderStudy(); });
            return;
        }
        const trials = await (await api('/api/trials')).json();
        const current = trials.at(-1);
        const config = await (await fetch('/api/config')).json();
        const draft=[...document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('.study input,.study select')].map(el=>({id:el.id,value:el.value,checked:el instanceof HTMLInputElement?el.checked:false}));
        const cloudBase=config.publicBaseUrl||(location.hostname!=='localhost'&&location.hostname!=='127.0.0.1'?location.origin:'');
        const base=localStorage.getItem('pairingBase')||cloudBase||`${location.protocol}//${config.addresses[0]||location.hostname}:${config.port}`;
        const checkout = current ? `${base}/checkout?code=${current.code}` : '', scanner = current ? `${base}/scanner?code=${current.code}` : '';
        shell(`<main class="study"><p class="eyebrow">RESEARCHER WORKSPACE</p><h1>Study console</h1><p>Anonymous trials. Exportable records. No real payments.</p><div class="study-grid"><section class="study-card"><h2>New trial</h2><form id="new-trial"><label>Anonymous participant ID<input id="participant" required pattern="[A-Za-z0-9_-]{1,40}" placeholder="P01"></label><label>Condition<select id="condition"><option value="A">A · Standard checkout</option><option value="B">B · Animal feedback</option></select></label><label class="check"><input id="demo" type="checkbox" checked>Developer / demonstration data</label><button class="primary">Create trial</button></form><p>Conditions are locked after creation. Alternate A→B and B→A across participants.</p></section><section class="study-card"><h2>Device pairing</h2><label>Laptop address accessible from the phone<input id="base" value="${esc(base)}"></label><button id="save-base">Update address</button>${current ? `<p><b>${esc(current.participantId)} · ${current.condition} · ${current.demo ? 'DEMO' : 'RESEARCH'}</b><br>${esc(current.phase)} · ${money(current.totalCents)}</p><p>Checkout: ${current.connected.checkout ? 'connected' : 'offline'} · Scanner: ${current.connected.scanner ? 'connected' : 'offline'}</p><a class="button" href="${esc(checkout)}" target="_blank" rel="noopener">Open checkout</a><a class="button" href="${esc(scanner)}" target="_blank" rel="noopener">Open scanner</a><img class="qr" src="/api/qr?url=${encodeURIComponent(scanner)}" alt="Scanner pairing QR"><p class="code">${esc(current.code)}</p><p class="muted break">${esc(scanner)}</p><button id="end-trial">End trial</button>` : '<p>Create a trial to pair devices.</p>'}</section><section class="study-card"><h2>Media & readiness</h2><p>Test audio on each device using its own button. Ensure camera permission and trusted HTTPS. Confirm all four clips before research.</p>${['cow', 'sheep', 'pig', 'thanks'].map(n => `<label>${n}<audio controls preload="metadata" src="/assets/media/${n}.wav"></audio></label>`).join('')}${['cow','sheep','pig'].map(n=>`<label>${n} video<video controls muted playsinline preload="metadata" style="width:100%;border-radius:8px" src="/assets/media/${n}.mp4"></video></label>`).join('')}<p><a href="/assets/cards/product-cards.pdf" target="_blank">Printable A6 product cards</a></p></section><section class="study-card"><h2>Study records</h2>${config.dataPersistent === false ? '<p class="alert">Temporary hosting storage: export records before restarting or redeploying this service.</p>' : ''}<p>${trials.length} trials · ${trials.reduce((n: number, t: any) => n + t.eventCount, 0)} events</p><button id="export-json">Export JSON + trial summaries</button><button id="export-csv">Export event CSV</button><ul class="trial-list">${trials.map((t: any) => `<li>${esc(t.participantId)} / ${t.condition} / ${t.demo ? 'demo' : 'research'} · ${t.phase}<small>${esc(t.trialId)}</small></li>`).join('')}</ul><button id="lock">Lock console</button></section></div><p class="alert" role="status">${esc(notice)}</p></main>`);
        for(const field of draft){const el=document.getElementById(field.id) as HTMLInputElement|HTMLSelectElement|null;if(el){el.value=field.value;if(el instanceof HTMLInputElement)el.checked=field.checked;}}
        document.querySelector('#new-trial')!.addEventListener('submit', async (e) => { e.preventDefault(); try {
            await api('/api/trials', { method: 'POST', body: JSON.stringify({ participantId: document.querySelector<HTMLInputElement>('#participant')!.value, condition: document.querySelector<HTMLSelectElement>('#condition')!.value, demo: document.querySelector<HTMLInputElement>('#demo')!.checked }) });
            notice = 'Trial created. Enable and test sound on both devices.';
            void renderStudy();
        }
        catch (e) {
            notice = String(e);
            void renderStudy();
        } });
        document.querySelector('#save-base')!.addEventListener('click', () => { try {
            const url = new URL(document.querySelector<HTMLInputElement>('#base')!.value);
            if (!['https:', 'http:'].includes(url.protocol))
                throw Error('Use HTTPS');
            localStorage.setItem('pairingBase', url.origin);
            void renderStudy();
        }
        catch {
            notice = 'Enter a full https://laptop-address:port URL';
            void renderStudy();
        } });
        document.querySelector('#end-trial')?.addEventListener('click', () => { if (confirm('End this trial? The event history will be preserved.')) {
            send({ type: 'end', trialId: current.trialId });
        } });
        for (const format of ['json', 'csv'])
            document.querySelector(`#export-${format}`)!.addEventListener('click', async () => { const blob = await (await api('/api/export?format=' + format)).blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'study-records.' + format; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
        document.querySelector('#lock')!.addEventListener('click', () => { studyToken = ''; sessionStorage.removeItem('studyToken'); ws?.close(); void renderStudy(); });
    }
    catch (e) {
        notice = String(e);
        studyToken = '';
        sessionStorage.removeItem('studyToken');
        setTimeout(() => void renderStudy(), 50);
    }
    finally {
        studyRendering = false;
        if(studyRenderQueued){studyRenderQueued=false;setTimeout(()=>void renderStudy(),0);}
    }
}
render();
if (code || studyToken)
    connect();
