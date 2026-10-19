# Field: Animal-Voice Self-Checkout

A working prototype for ANU COMP6390 Human–Computer Interaction. A laptop checkout, smartphone barcode scanner, and researcher console communicate through a shared Node.js server and WebSocket connection. Participant screens and prerecorded instructions are in English. Payments, membership cards, and terminal taps are simulated; the app does not process real payments, NFC, membership details, or email.

## Deploy on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/passionleader/anu-human-computer-interaction)

Use the button above or create a Render Web Service from this public repository. The default `render.yaml` describes a free demonstration service.

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22 |
| Root directory | Leave blank |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/healthz` |

The Blueprint generates a private `STUDY_TOKEN` environment variable. Read it in the Render service's Environment settings to unlock `/study`. If creating the service manually, set a long, random `STUDY_TOKEN` yourself; see [deployment instructions](DEPLOY_RENDER.md) for the other environment settings. That supporting guide is currently in Korean.

Open `/checkout` on the laptop and `/scanner` on the phone using the same Render HTTPS address. No local IP address or local certificate is needed for this route. `RENDER_EXTERNAL_URL` supplies the public pairing address automatically. Set `PUBLIC_BASE_URL` only when using a custom domain.

**Free hosting uses temporary storage. Research records can disappear after a restart or redeployment.** Export CSV/JSON records from `/study` and keep a separate copy. The optional `render.research.yaml` uses a **paid** service and persistent disk; review the cost before choosing it. Keep a single server instance because records are stored in a JSON file.

**Updates:** Services created using a Public Git Repository URL require **Manual Deploy → Deploy latest commit** after a GitHub push. Services connected through a Git provider follow their Auto-Deploy setting. Wait for the new deployment to become Live before reloading both devices and enabling sound again. [Render deployment documentation](https://render.com/docs/deploys).

## Pair the scanner with four letters

1. Open `/checkout` and select **Generate pairing code**.
2. Enter the four letters, such as `ABCD`, at `/scanner` and select **Connect**. Lowercase input is accepted.
3. On an already connected checkout, select **Pair scanner** to show the current code again. This preserves the trial, cart, and code. Older long codes are upgraded to four letters when shown.

Codes expire after eight hours. End the current trial and create another to get a new code; ended trials do not accept new connections. Code generation avoids collisions, and repeated invalid pairing attempts are rate limited.

If no trial exists, the checkout button creates a **condition B demonstration trial**. For an actual study, create an anonymous participant ID and condition in `/study` first, then use **Open checkout**. A device without the code cannot use the public pairing button to discover an active research trial (`demo=false`). The four-letter code does not grant access to research exports.

## Run locally

Use Node.js **22.12 or later within major versions 22–24**. Node.js 22 is the deployment default. From this repository's root directory:

```sh
npm ci --include=dev
npm run build
npm start
```

On Windows, after installing dependencies and building, you can also start the app in PowerShell:

```powershell
./Start.ps1 -Http
```

### Set up a study trial

1. Open `http://localhost:5173/study` on the laptop.
2. Enter the token from `data/study-token.txt`. If you configured `STUDY_TOKEN`, use that value instead. Keep the token private and do not share it with participants.
3. Enter an anonymous ID, such as `P01`, choose condition A or B, and create a trial. Clear **Developer / demonstration data** for an actual evaluation.
4. For PC checks, set **Device pairing** to `http://localhost:5173` and select **Update address**. Open **Open checkout** and **Open scanner** in separate browser contexts.
5. Select **Enable checkout sound** on the checkout. On the scanner, use **Enable & test scanner sound** under **Researcher tools**, or **Enable camera & sound** when scanning with a camera. Confirm sound on both devices before starting.
6. Select **Start shopping**, scan product cards, and try **Remove one**, **Start again**, and **Pay**. Continue through membership **Demo** or **Skip**, the simulated terminal tap, and receipt saving.

Use one checkout window and one scanner window per trial. Duplicate roles display an error. End the trial before creating the next participant's trial. The condition is fixed at trial creation.

**A visible camera preview does not mean shopping has started.** While the scanner says **Ready when you are.**, enable sound on both devices and select **Start shopping** on the laptop. Scan items once the phone says **Ready to scan.** The scanner displays a waiting notice until the checkout starts.

The camera reader searches beyond the centre of the frame and handles horizontal and vertical EAN-13 codes. Keep the whole barcode and its white margins visible. If the bars look blurry, move farther away or use the **Camera** selector to try another rear lens. Automatic continuous focus, **Zoom**, and **Light** are used or shown only when the browser reports support. Actual iPhone performance still requires a device check.

The checkout prepares its beep and instruction audio, while a condition B scanner prepares animal and thank-you audio. Missing or blocked required audio prevents readiness and displays **Sound unavailable**. Restore the files or sound settings and explicitly retry. A reconnected device must prepare sound before new scans are accepted; resending an already accepted scan does not add another item.

The checkout beep uses the unlocked Web Audio output rather than starting a short HTML audio clip. It retains its 120 ms duration and plays at twice the source amplitude. Use **Test checkout sound** to confirm it on the PC speakers after enabling sound; browser signal checks do not replace listening on the actual device.

## Use a smartphone with local HTTPS

For a locally hosted scanner, use HTTPS trusted by the phone. `localhost` refers to the device opening the page, so it does not point a phone to the laptop. Plain HTTP at a laptop IP address and bypassed certificate warnings are not a completed camera setup. Physical smartphone verification remains pending.

1. Connect the laptop to the phone's hotspot, or connect the phone to the laptop's mobile hotspot. Check device-to-device connectivity separately if using USB tethering.
2. Find the laptop's IPv4 address for that network using `Get-NetIPAddress -AddressFamily IPv4` in PowerShell or the researcher console's suggested address. Avoid VPN and virtual adapter addresses.
3. Install the Windows executable from the official [mkcert project](https://github.com/FiloSottile/mkcert). It creates a local development certificate authority. Replace the sample IP below with the laptop's actual address:

   ```powershell
   ./scripts/Setup-Https.ps1 -LaptopAddress 192.168.137.1 -Mkcert C:\Tools\mkcert.exe
   ./Start.ps1
   ```

4. Transfer and install only `.cert/phone-rootCA.crt` on the phone. **Do not transfer the CA private key `rootCA-key.pem` or the server private key `localhost-key.pem`.**
5. On iPhone/iPad, install the certificate profile, then enable full trust for the development CA under Settings → General → About → Certificate Trust Settings. On Android, install it as a CA certificate through the security/credentials settings; menus vary by device. Follow [mkcert's mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices).
6. Open the researcher console at `https://localhost:5173/study` and set the pairing address to `https://YOUR_LAPTOP_IP:5173`. Open the scanner QR code on the phone and confirm there is **no certificate warning**. HTTPS connections automatically use WSS.
7. Enable camera and sound, then check all eight printed cards and the physical speakers. Beeps/instructions should come from the laptop and animal sounds from the phone. The scanner requests the rear camera where available and does not request microphone access.

If the laptop's IP changes, regenerate the certificate with the new address. Certificates and private keys are excluded by `.gitignore`. Check the address, port, server binding (`0.0.0.0`), and inbound firewall rule. Allow Node.js or TCP 5173 on **private networks** in Windows Firewall; keep the firewall enabled. Hotspot client isolation can prevent devices from reaching each other.

See [MDN's getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) for secure-context requirements. Barcode decoding uses bundled [ZXing Browser](https://github.com/zxing-js/browser), without relying on the built-in BarcodeDetector API. No runtime CDN or external product API is required.

## Products, print cards, and media

| Resource | Location |
| --- | --- |
| Eight products, EAN-13 codes, integer-cent prices, and feedback mapping | `products.json` |
| AI-generated images of fictional, unbranded products | `public/assets/products/*.png` |
| EAN-13 barcode originals | `public/assets/barcodes/*.svg` and PNG files |
| Individual card images | `public/assets/cards/*.png` |
| Eight-page A6 print document | [product-cards.pdf](public/assets/cards/product-cards.pdf) |
| Audio and video | `public/assets/media/` |
| Creation methods, sources, and licenses | [ASSET_MANIFEST.md](ASSET_MANIFEST.md) |

Print cards at **actual size / 100%**, with fit-to-page scaling disabled. Each page is **105 × 148 mm**. If printing multiple cards on A4, use the print application's multiple-page layout and measure the output to confirm A6 sizing. Each complete barcode label is 70 mm wide; preserve its blank margins.

The three animal videos are silent, three-second clips. Animal audio is no longer than three seconds, and the beep lasts 120 ms. Video and audio play separately. Prerecorded instructions use Windows Microsoft David. The cow's thank-you voice combines pitch-shifted English speech with a synthesized cow character sound; the pig sound combines a short recorded call with procedural squeals. Species recognition, voice clarity, the intended distressed sound, and comfortable volume require physical listening checks. These assets are not presented as recordings of an animal actually suffering.

Cola (375 mL, $3.00) is an unrelated neutral control and produces no animal or thank-you feedback. Whey protein is milk-derived and is not vegan; its existing neutral feedback setting does not classify it as vegan. Tofu and whey protein currently produce no extra phone audio. Pea protein and plant-based mince play the thank-you sound. Condition A omits the additional animal/thank-you feedback and waiting period while retaining the beep and payment instructions. Skipping feedback stops playback on both devices and is recorded.

## Checkout layout

On PC and tablet windows at least 560 px wide, the main checkout stays in the left panel while scanned items scroll independently in the right basket. The basket heading, total and payment button stay visible. Scroll position is preserved when the app updates. The receipt screen keeps its item list in the right basket; the download still contains the full itemized receipt. Very small phone checkout windows use a stacked layout, and the dedicated phone scanner is unaffected.

## Research records and recovery

The server saves trials, carts, accepted scan IDs, and events to `data/trials.json` using atomic file replacement. Participant IDs are anonymous, and `data/` is excluded from the repository. The `demo` field separates demonstration data from evaluation data. JSON exports include events and trial summaries with final carts and totals; CSV exports contain event rows.

Record condition order, interviews, questionnaires, and observations of the participant's first product choice separately. The app cannot infer which card a participant chose before scanning it.

Resending the same scan ID does not duplicate an item or its feedback. To add the same card again, remove it from the camera frame for approximately 0.85 seconds before presenting it again. Scanning and payment are blocked during feedback. The server waits for both devices to finish; after five seconds it records a failure and recovers. A disconnection blocks progress, and reconnecting restores server state. Refreshing does not replay old animal feedback. Approved payments prevent further cart changes and scans. Manual entry and uploaded-image decoding are recorded separately from camera scans.

Automated results and pending smartphone, print, and speaker checks are documented in [QA_REPORT.md](QA_REPORT.md). Physical smartphone checks must be completed before treating the prototype as ready for a field evaluation. The QA report and some supporting documents are currently in Korean.

## Development and verification

```sh
npm test
npm run build
npm run qa
```

The repository also includes a pnpm lockfile; `pnpm install`, `pnpm build`, `pnpm test`, and `pnpm qa` are available as alternatives.

Browser QA uses Microsoft Edge, temporary test servers, separate browser contexts, and isolated dummy storage. Results and screenshots go to `qa-output/`; tests do not use actual evaluation records. Additional scripts cover the camera startup race, camera decoding, pairing, authorization, media failures, recovery, HTTPS, the study console, and the compiled production server. See the `qa:*` scripts in `package.json`. Camera fixtures and test certificates can be generated with `scripts/fake-camera.py` and `scripts/qa-cert.py`.

For the development server in PowerShell:

```powershell
$env:NODE_ENV='development'
node --import tsx server.ts
```

Normal `Start.ps1` execution serves the production build. Run `npm run build` again after changing source files.

Regenerating assets requires Pillow, NumPy, ReportLab, PyMuPDF, and imageio-ffmpeg. Run `scripts/voices.ps1` to create source TTS audio, then `python scripts/assets.py` to build cards and media. Use `python scripts/cards.py` to rebuild barcode labels, card PNGs and the PDF from existing product photos without regenerating media. Asset regeneration also requires the original source files in the local `asset-sources/` folder, which is excluded from the public repository. Finished images, cards, and media are already included, so regeneration is not needed to run or deploy the app.
