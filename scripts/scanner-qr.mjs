import QRCode from 'qrcode';
import {writeFile} from 'node:fs/promises';
const url='https://anu-human-computer-interaction.onrender.com/scanner';
await QRCode.toFile('public/assets/scanner-entry-qr.png',url,{width:360,margin:4,errorCorrectionLevel:'M'});
await writeFile('public/assets/scanner-entry-qr.svg',await QRCode.toString(url,{type:'svg',margin:4,errorCorrectionLevel:'M'}));
console.log('Scanner QR PNG and SVG generated.');
