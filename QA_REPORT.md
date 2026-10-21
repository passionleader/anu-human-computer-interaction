# QA 보고서

최종 갱신: **2026-10-19**. PC에서 수행 가능한 구현·검증·오류 수정·재검증을 완료했다. 실제 스마트폰·인쇄물·물리 스피커 검증은 아래 별도 체크리스트에 남겼다. 실제 참가자 평가는 수행하지 않았다.

## 추가 수정: 검은 카메라 화면과 Render 배포

- 카메라 권한 대기 중 서버 상태가 갱신되면 영상 요소가 교체되어, ZXing이 화면에서 제거된 요소에 스트림을 연결하는 문제를 실제로 재현했다. 수정 전에는 보이는 영상의 stream 없음·해상도 0×0·검은 프레임이었다. 수정 후 동일한 영상 요소와 640×480 실제 가상 카메라 프레임을 확인했다. 시작 중 표시, 프레임 수신 확인, muted/playsinline, 재시도·오래된 요청 정리도 적용했다.
- 재현 전: `qa-output/camera-startup-1792344266513/results.json` FAIL. 최종 재검증: `qa-output/camera-startup-1792345552905/results.json` PASS. 카메라 바코드 인식·정지 중복 방지·다시 제시: `qa-output/camera-1792345252623/results.json` 3 PASS.
- Render의 PORT·HTTPS 프록시·공개 주소·헬스 체크를 지원하며 프런트와 Node 서버를 빌드한다. 무료 Blueprint와 선택적 유료 영구 디스크 Blueprint를 구분했다. 무료 호스팅의 연구 기록 소실 가능성을 연구자 화면과 배포 안내에 표시했다.
- Render와 같은 `npm ci --include=dev` 새 설치 및 `npm run build` 성공. 취약한 Vite와 ws를 각각 7.3.7 / 8.22.0으로 갱신했고 npm 감사 결과 0 vulnerabilities.
- 빌드된 `server-dist/server.mjs`로 `/healthz`, 공개 HTTPS 스캐너 링크, 연구자 인증, WebSocket, 카드 PDF·영상·상품 사진 제공 4항목 PASS: `qa-output/production-1792345560377/results.json`. 실제 Render 서비스 배포 자체를 검증한 것은 아니다.
- 회귀 검증: core 14, 전체 브라우저 16, 페어링 5, 페어링 권한 3, 미디어 보호 4, 복구 4, HTTPS 1, 연구자 화면 6 모두 PASS. 전체 브라우저 근거: `qa-output/run-1792345564806/results.json`. 독립 검토자를 중복 실행하지 않았다.
- 스마트폰에서 Render HTTPS 주소로 후면 카메라 미리보기와 실물 인쇄 바코드를 다시 확인해야 한다. 아래 실물 체크리스트는 미검증 상태를 유지한다.

- Windows 설치 상태에서 생성한 npm 잠금 파일에 Linux용 Rollup 패키지가 빠져 첫 원격 빌드가 실패했다. 빈 폴더에서 플랫폼 전체 잠금 파일을 생성해 수정했다. GitHub Ubuntu / Node 22에서 npm ci·core 14개·프로덕션 빌드·빌드 서버 HTTP/WebSocket/상품 자료 검증까지 통과: [Linux CI 실행 결과](https://github.com/passionleader/anu-human-computer-interaction/actions/runs/39150985401). CI의 스마트폰 브라우저 단계는 명시적으로 제외하며 PC 브라우저에서 별도 검증했다.

## 2026-10-19 12:53 AEDT — iPhone scanner follow-up

- User reported an iPhone 11 showing clear bars but no products added. Their screenshot showed **Ready when you are.**, which is the pre-shopping `ready` phase. Camera decoding cannot add items until the laptop starts shopping. The scanner now explicitly displays **Scanning has not started** and tells the user to enable sound and select **Start shopping** on the laptop. A camera test verifies the notice before start and its removal afterwards.
- Camera decoding now uses EAN-13 `TRY_HARDER` searches beyond centre rows and explicit canvas rotation with corrected width/height for non-square frames. It requests 1920×1080 where available and offers camera selection. Continuous autofocus, zoom, and light controls depend on reported browser capabilities; unsupported optional settings do not prevent camera startup.
- Real ZXing browser benchmark: all 7 products × 6 positions/orientations = **42/42 PASS**, blank frame rejected. The previous configuration missed **21/42**. PC maximum decode time was 101 ms. Evidence: `qa-output/scanner-quality-1792374627863/measurements.json` and `results.json`. This is a controlled PC benchmark, not iPhone performance evidence.
- Regression: real getUserMedia → decoder → server, stationary deduplication, removal/re-presentation **3 PASS** (`qa-output/camera-1792374735652`); permission-delay rerender **PASS** (`qa-output/camera-startup-1792374745232`); whole browser flow **16 PASS** (`qa-output/run-1792374751983`); four-letter pairing **5 PASS** (`qa-output/pairing-1792374782012`).
- Simulated camera capability checks using a real fake-camera stream: autofocus request, light toggle, zoom and switching to another camera **PASS** (`qa-output/camera-1792374785860`). Normal fake-camera execution also passes without those capabilities.
- The scaled camera region of the supplied screenshot was not decoded in a separate local check. The screenshot is not a raw camera frame, and this does not establish how the live iPhone decoder performs. The user image is excluded from the repository. **After deployment, verify on the iPhone 11 after Start shopping, including real printed cards, alternate camera choice and physical focus.**

## 독립 검토와 통합 책임

04:05 이후 5시간 사용 한도 초기화(usedPercent=0)를 확인하고, **gpt-6-luna / high 서브에이전트 정확히 1명**을 `fork_turns=none`으로 실행했다. 검토자는 앱 소스를 수정하지 않고 격리 재현과 코드 리뷰를 수행했다. 메인이 수정·통합과 최종 재검증을 맡았다. 독립 상세 근거는 [QA_INDEPENDENT.md](QA_INDEPENDENT.md)에 있다.

독립 검토에서 재현한 3건은 모두 수정했고, 검토자도 각각 수정 후 동작을 다시 확인했다. 알려진 미해결 PC 핵심 흐름 오류는 없다.

## 발견·수정·재검증

| 문제 | 최종 처리 |
|---|---|
| P1: 무인증 페어링 API가 활성 실제 연구 시행 코드를 공개 | `demo=false` 시행에서는 연구자 권한 또는 이미 가진 계산대 코드가 필요. 무인증·잘못된 코드는 403, 코드·시행 ID 미노출. 별도 연구 기록 권한 유지. 무인증 즉시 생성은 시연 시행에서만 허용. |
| P2: 필수 WAV 준비 실패를 무시하고 ready=true 처리 | 계산대의 삑·고정 안내, B 스캐너의 동물·감사 음원을 실제 로드·재생 준비. 실패·시간 초과면 ready=false와 복구 안내, 시작·새 스캔 차단. 파일 복구 후 명시적 재시도 성공 확인. 이미 승인한 ID 재전송은 수량 보존. |
| P2: 피드백 중 정상 상품 스캔 거절에도 미인식 음성 재생 | 실제 Item not recognised 사유에만 해당 음성. 대기 중 스캔은 원인 표시만 하고 동물 피드백 유지. 독립 Edge 재현에서 미인식 음성 0회 확인. |
| 최종 통합 재검증: 상태 갱신이 스캐너 연구자 메뉴를 닫아 누르던 버튼·입력을 지울 수 있음 | 메뉴 펼침 상태·수동 입력 초안 보존. 전체 브라우저 suite와 연구자·페어링 흐름 재검증 통과. |
| 재렌더링이 재생 중 동물 영상·카메라 DOM을 교체할 수 있음 | 기존 video DOM을 유지. 3종 재생 완료, 가상 카메라 정지 중복 방지·제거 후 재제시 통과. |
| 승인 ID 재전송 시 미디어 승인 이벤트 재방송 가능 | 저장된 응답만 반환하고 실시간 승인 방송 억제. 수량·로그 중복 방지. |
| 개발 서버가 연구 데이터·키 파일을 정적으로 제공할 위험 | 일반 실행은 production build 제공, 개발 서버 fs deny 추가. 별도 토큰 없는 export는 401. |
| 연구자 관찰 화면이 참가자 미디어 완료를 보낼 가능성 | 참가자 역할만 미디어 이벤트 처리. 실제 관찰자 연결 상태에서 검증. |
| 시행 종료 뒤 다음 참가자 폼이 중복 갱신으로 초기화 | 중복 타이머 제거, 초안 보존, 대기 중 갱신 요청 반영. 다음 참가자·반대 조건 생성 통과. |
| 반납·도움·잘못된 바코드 안내가 갱신에 사라짐 | 안내 유지와 양쪽 인식 실패 표시 수정. 전체 흐름 재검증. |
| CSV의 기기·실패 사유·스캔 ID 일부 누락 | device/reason/scanId/feedbackId/receiptId/totalCents 열 추가, JSON 상세 기록 유지. |
| 브라우저 TTS 목소리 차이 | 고정 영어 WAV 사용. 상태 진입 때 재생하고 상태 변경·스캔 시 이전 안내 중지. |
| 비정상 WebSocket Origin 헤더의 파싱 예외 | 잘못된 출처·구문은 연결 종료, 알 수 없는 production upgrade도 종료. |

처음 샌드박스의 로컬 소켓 제한으로 연결 검사가 실패한 실행, 이미 preload된 파일의 네트워크 차단이 적용되지 않은 초기 테스트, 종료 상태의 부정확한 테스트 선택자는 앱 오류와 구분했다. 미디어 실패 검사는 준비 단계 파일 누락과 정상 준비 이후 런타임 재생 거부를 별도로 재현했다.

## 최종 검증 결과와 재현 근거

모든 서버 QA는 별도 DATA_DIR, `demo=true` 또는 권한 검사용 격리 `demo=false` 더미 시행을 썼다. 실제 `data/`와 5173의 사용자 시연 장바구니를 테스트로 수정하지 않았다. Edge의 독립 브라우저 컨텍스트와 실제 WebSocket을 사용했고 공유 저장소로 통신을 흉내 내지 않았다.

| 검사 | 결과 | 명령 / 최종 증거 |
|---|---|---|
| 타입 검사·production 빌드 | 통과 | `pnpm build`, 최종 bundle `index-Bm1tk5K9.js` |
| 핵심 상태·금액·권한·중복·코드 | **14/14** | `pnpm test`, 준비 상실 후 새 스캔 차단·기존 승인 재전송 보존 포함 |
| 전체 브라우저 흐름 | **16/16**, 예외 0 | `pnpm qa`, `qa-output/run-1792343870546/results.json` |
| 소리 준비·복구·거절 음성·런타임 실패 | **4/4** | `pnpm qa:media`, `qa-output/media-guards-1792343899275/results.json` |
| 4글자 코드 생성·입력·재시도·재연결 | **5/5** | `pnpm qa:pairing`, `qa-output/pairing-1792343904729/results.json` |
| 실제 연구용 코드 보호 | **3/3** | `pnpm qa:pairing-auth`, `qa-output/pairing-auth-1792343751708/results.json` |
| 가상 카메라 입력 경로 | **3/3** | `pnpm qa:camera`, `qa-output/camera-1792343911425/results.json` |
| 서버·연결·결제 복구 | **4/4** | `pnpm qa:recovery`, `qa-output/recovery-1792343741544/results.json` |
| HTTPS/WSS | 통과 | `pnpm qa:https`, `qa-output/https-1792343921138/results.json` |
| 연구자 UI | **6/6** | `pnpm qa:study`, `qa-output/study-1792343926061/results.json` |
| PDF·음원 파일 감사 | 통과 | `qa-output/asset-audit.json` |

구체적으로 확인한 동작:

- 7종 바코드 PNG와 **사진을 포함한 전체 A6 카드 PNG 7종**을 앱의 ZXing으로 해독. 각 1개 총 $75, 각 2개 총 $150 확인. 수동 번호 입력만으로 검증했다고 보고하지 않았다.
- 상품 수량·Remove one·전체 취소·기록 유지·재선택·회원카드 Skip/Demo·뒤로·모의 탭 결제·연속 클릭 단일 승인·영수증 저장·승인 후 변경 차단.
- A 조건 추가 피드백 없음, B 조건 3종 동물 영상/음원 및 2종 감사 음원 매핑. 영상은 무음·3초이고 목록·합계 유지. 두부·유청은 중립 매핑.
- 피드백 완료는 양 기기 확인을 기다리고 생략·재생 실패·5초 무응답·연결 종료에서 복구하며 해당 사실을 기록.
- 가상 카메라의 실제 getUserMedia → ZXing → 서버 경로에서 고정 프레임은 1회 추가, 프레임 밖 1.5초 후 재제시는 1회 더 추가.
- 서버 재시작 이후 장바구니·스캔 승인 ID 보존, 중단된 결제 단일 승인·영수증 복원.
- CSV/JSON의 조건·입력 방식·미디어 결과·최종 장바구니 일치, 연구자 인증·연결 QR/코드·내보내기·종료·다음 시행.
- 노트북 1366/1440px, 스캐너 390px 레이아웃과 화면 PNG 확인. 가로 넘침 없음.
- PDF 7쪽은 각각 105×148mm이며 정확한 상품명·가격·EAN 텍스트 포함. 모든 WAV가 비어 있지 않고 클리핑이 없으며 동물·감사 음원은 3초 이내.

HTTPS 검사는 **시험 자체서명 인증서 + ignoreHTTPSErrors**를 사용했다. HTTPS 페이지와 WSS 통신 경로는 확인했지만 실제 휴대폰 CA 신뢰를 입증하지 않는다. 소리의 종 구분·울부짖는 느낌·소 캐릭터 감사 표현·음량과 체감 지연은 파일 길이·파형이나 헤드리스 재생 성공만으로 입증할 수 없으므로 실물 청취 확인이 남아 있다. 합성 음원과 출처는 ASSET_MANIFEST.md에 명시했다.

## 사용자가 나중에 확인할 스마트폰·실물 항목

- [ ] 실제 테더링 방식에서 휴대폰 → 노트북 주소 접근, 개인 네트워크 방화벽 허용 확인.
- [ ] 휴대폰이 로컬 CA를 신뢰하고 인증서 경고 없이 HTTPS 및 WSS 연결. iOS는 전체 신뢰 설정 포함.
- [ ] 후면 카메라 권한, 거부 후 재시도, 화면 회전·잠금·배경 탭 복귀 확인.
- [ ] A6 카드 7장 100% 출력 후 각 실물 바코드 인식 및 정확한 상품 추가.
- [ ] 카드가 프레임 안에 있는 동안 1개만 추가, 프레임 밖 약 0.85초 후 다시 제시하면 1개 더 추가.
- [ ] 삑·안내는 노트북만, 고기 종별 울음·감사는 스마트폰만. 두부·유청은 스마트폰 무음.
- [ ] 소·양·돼지 음색이 구분되고 요청한 울부짖는 느낌인지 청취. 돼지 음원은 합성 표현이다.
- [ ] 소의 “Thank you”가 명료하고 소 캐릭터로 들리는지 확인. 임시 무가공 사람 TTS 완성품이라는 주장은 하지 않음.
- [ ] 실제 스피커 음량·체감 지연·삑과 추가 피드백 간격(현재 180ms), 갑작스러운 과도한 음량 없음.
- [ ] 동물 영상은 노트북에서 무음 3초, 목록·합계 유지. Skip이 양 기기를 멈추고 다음 스캔 허용.
- [ ] Safari/Chrome의 사용자 동작 후 오디오 재생 제한 및 카메라 활성화 유지.
- [ ] 핫스팟 잠시 끊기·재연결 시 수량·영수증·로그 일치, 참여 중단/스킵 가능.

이 항목은 PC 에뮬레이션으로 완료 표시하지 않는다. 실제 참가자 평가·실제 행동 데이터 수집은 수행하지 않았다.

## 2026-10-19 — Checkout beep follow-up

- User reports prerecorded PC instructions and animal video work, but neither the checkout beep test nor scan beep is audible. The WAV itself contains a valid 1 kHz / 120 ms signal (peak 0.15997, RMS 0.10223); it is not silent. The exact physical speaker/browser cause was not established.
- Replaced short-clip HTMLMediaElement playback with a decoded AudioBuffer on the already unlocked Web Audio context. Every beep uses a fresh BufferSource, gain 2, connected to the audio destination; nodes disconnect after completion. Both the test button and accepted scans use this path. The WAV remains 120 ms and extra feedback still starts after 180 ms.
- A missing, invalid or silent beep prevents checkout sound readiness. Playback errors still disable readiness and show recovery instructions.
- Actual browser audio-graph verification: missing WAV recovery, silent decoded WAV rejection, enable/test button nonzero output, one accepted-scan beep on checkout only, and no clipping all PASS. Evidence: `qa-output/beep-1792375199200/results.json` and `output-levels.json`. The first test implementation raced against the previous error notice; synchronization was corrected before the successful run.
- Regression: media guards 4 PASS (`qa-output/media-guards-1792375041011`); full browser checkout 16 PASS (`qa-output/run-1792375046191`). This verifies the audio graph rather than physical speaker audibility. User must reload the deployed PC page, enable sound, and listen to Test checkout sound.

## 2026-10-19 — Checkout split layout

- PC checkout now fills the viewport with a fixed left stage and independently scrolling right basket. The basket heading, total and Pay button remain outside the scrollable list. Windows at least 560 px wide retain the two columns, including a narrow 581 px browser panel; smaller phone checkout windows retain the stacked fallback. The phone scanner and researcher layout are not changed.
- Basket scroll position is restored after UI/server rerenders. The list is keyboard focusable and labelled Scanned items. Extremely short windows retain an internal left-panel overflow fallback for access to controls; adding items does not grow the page.
- The first layout run exposed the duplicated itemized receipt overflowing the left panel. Removed that duplicate from the completion stage; all items remain in the right basket and full downloadable receipt. Retested successfully.
- Automated layout checks cover seven PC sizes from 581×700 to 1920×1080, all seven product rows, independent scrolling, no page scrolling/overflow, visible total/payment controls, preserved scroll position, membership/payment/receipt, and animal video plus Skip on a short 1280×600 viewport. Results and screenshots are in the latest `qa-output/checkout-layout-*` directory.
- Regression: full browser suite 16 PASS (`qa-output/run-1792375644516`) and beep/output suite 4 PASS (`qa-output/beep-1792375675012`). Local type check and production builds passed. No real participant data or user screenshot was published.

## 2026-10-19 — Cola, whey classification and deployed beep diagnosis

- Added unrelated neutral control Cola, 375 mL / $3.00, EAN-13 2000000000084. It produces the ordinary checkout beep but no animal/thank-you feedback. Product data, generated photo, SVG/PNG barcode and print card are included.
- Rebuilt eight A6 PDF pages and eight card PNGs, inspected the rendered contact sheet and Cola page, and verified all page names/EAN text and 105×148 mm dimensions. `scripts/cards.py` now rebuilds print assets independently from audio/video generation. Source media are not required for card-only updates.
- Whey protein is milk-derived, not vegan. Added ingredientCategory=milk_derived. Existing neutral feedback is preserved pending the user's optional choice; neutral does not mean vegan. No participant-facing vegan claim was added.
- Public service inferred from the configured Render name and verified at https://anu-human-computer-interaction.onrender.com: serves old index-DD-NNphd.js / index-DEE8NyCP.css. Its JS lacks the new beep player and its CSS lacks the split checkout layout. The deployed beep WAV returns 200 and has the exact same SHA-256 as the local file (3EB3D0DD88E86293695AF61AA527CD45EA30140A004F690D70266302E69D3D3B). This identifies an outdated deployment, not a changed/missing audio asset. No researcher token or trial data was used. The user was asked to confirm their service URL.
- Latest code must be deployed via Render Manual Deploy → Deploy latest commit if the service uses a public Git repository URL; a browser refresh alone cannot update server code. Do not claim actual speaker audibility is verified remotely.
- Checks: core15 PASS; 48 barcode position/orientation frames PASS (`qa-output/scanner-quality-1792376141690`); eight barcode PNGs and eight full card PNGs decoded in browser suite16 PASS (`qa-output/run-1792376146130`); split layout4 PASS with 8 rows (`qa-output/checkout-layout-1792376175442`); beep regression4 PASS. PDF has 8 pages, 23,757,327 bytes. Deployment evidence remains local at `qa-output/deployment-audit.json`.

## 2026-10-19 — Confirmed whey feedback change

- User confirmed the Render service URL matches the audited host. A fresh unauthenticated root-page check still returned old index-DD-NNphd.js / index-DEE8NyCP.css; latest code is not yet reflected there.
- User explicitly chose cow video and sound for whey. Changed whey-protein to feedbackType=animal, animal=cow, cow.wav and cow.mp4. Condition A still omits extra feedback; condition B now treats whey like beef. Cola and tofu remain neutral.
- Added a core A/B regression and expanded the browser animal-feedback sequence to include whey. Browser assertions check the cow video source, two cow-audio plays across beef+whey, and successful per-device completion. No product artwork or printable barcode changed.
- Final verification: core 16/16 PASS, production build PASS, browser suite 16 PASS including actual whey cow video/audio completion. Evidence: `run-1792379150305` in `qa-output/`.

## 2026-10-19 — Public scanner entry QR

- Added committed PNG/SVG QR assets for the exact user-specified HTTPS `/scanner` URL, with no query string, pairing capability or researcher token. Generated locally with the existing qrcode package; regeneration script included.
- PC checkout upper-right Scanner button opens a larger native QR dialog. It is available before and after trial pairing, displays the current four-letter code when available, preserves its open state through rerenders, and supports Close/Escape. The phone scanner is unchanged. The button is hidden on phone-sized checkout windows below 560 px.
- Actual QR decode and UI checks 3 PASS: `qa-output/scanner-entry-qr-1792379505512`. The QR decoded to https://anu-human-computer-interaction.onrender.com/scanner exactly. Screenshots visually inspected.
- Pairing regression5 PASS (`qa-output/pairing-1792379510950`) and split-layout regression4 PASS across seven PC viewport sizes (`qa-output/checkout-layout-1792379517804`). Type check and production build passed. No extra packages, external QR service, or actual participant data used.


## 2026-10-19 — Female guidance, direct QR pairing, phone payment/receipt, updated video

- Five human checkout guidance files now use fixed Microsoft Zira female English recordings. Payment asks users to tap their card or pay directly on the smartphone. Completion announces that the receipt has been sent to the smartphone. Animal/character sounds and cow video are unchanged.
- Checkout ready screen shows a prominent 220px session QR (160px in short PC windows), with a separate **Connect with code** button beside it. The header opens a 300px version. The QR points at the current origin's scanner URL with the checkout code; decoding/opening it joins directly, without manual input. It contains no researcher token. Initial **Connect phone scanner** action creates/reuses the permitted demonstration session; research pairing protections remain.
- Payment can be completed at the desktop terminal or the connected phone's demo Pay button. Only the payment phase permits scanner tap commands; both devices must be connected. Duplicate/cross-device taps produce one approval. The scanner releases active camera tracks at payment and displays quantities, prices, total and receipt ID after approval. Reload restores the receipt from the server. Desktop download button is removed; optional Save receipt remains on the phone. This is WebSocket delivery, not email/SMS or a real payment service.
- Latest user-provided lamb_gemini.mp4 and pork_gemini.mp4 replace sheep/pig video: seconds 1–4, 3s, H.264/yuv420p, 960×540, 30fps, muted, faststart. Original files unchanged. Outputs about 350KB/300KB. Frames and metadata inspected; no distorted aspect ratio. Reproduction script and asset provenance updated.

### Validation

- Core 17/17 PASS, type check and production build PASS.
- Full browser regression 16 PASS: all eight barcode/card decodes, exact totals, desktop payment, sheep/pig/cow/whey playback, feedback recovery and exports (`run-1792381644160`).
- Direct QR/phone checkout 5 groups PASS (`phone-checkout-1792381771681`): actual ZXing QR decode; no typing; code fallback dialog; phone double-tap and one approval; private receipt endpoint rejects wrong code; receipt reload; live fake-camera tracks stop at payment; back restores scanner controls; payment/receipt guidance playback; no browser errors. Ready QR and phone receipt screenshots visually inspected.
- Split checkout layout 4 groups PASS across seven PC sizes (`checkout-layout-1792381613437`). Desktop membership/payment/receipt and animal feedback preserve left/right panels.
- Beep 4 groups PASS (`beep-1792381676660`), code pairing 5 PASS (`pairing-1792381780730`), media failure/retry 4 PASS (`media-guards-1792381787161`), compiled production server 4 PASS (`production-1792381852359`), delayed camera permission/preview race PASS (`camera-startup-1792381856042`).
- Video/audio metadata and extracted frames: local `qa-output/media-refresh`. All guidance files are nonempty mono 44.1kHz recordings. Latest videos are 3 seconds at 960×540/30fps. No actual participant data used.

### Physical iPhone / deployed checks remaining

- After deploying the latest commit and reloading both devices, scan the large checkout QR with the iPhone Camera app and confirm immediate pairing; also test the separate four-letter fallback. Use the Render HTTPS origin for camera access.
- Confirm female voice audibility/naturalness and payment/receipt wording through the real PC speakers. Automated playback does not prove physical speaker output.
- On iPhone 11, scan printed product cards, then test desktop terminal and phone Pay routes. Confirm camera indicator turns off at payment, quantities/total match the desktop, receipt scrolling/Save receipt works, and reloading restores it.
- Check updated sheep/pig clips and existing animal audio timing on both real devices. These checks require physical hardware and were not claimed as completed.
- Render deployment remains a user action. Receipts depend on the server records; free temporary storage can be reset by a restart/redeploy. No SMS/email delivery or persistent external receipt inbox is implemented.

- Final connection-error handling recheck: header QR generates a valid connection when no session is loaded and does not open a misleading QR if pairing fails. Build and core17 PASS; phone checkout5 PASS again at phone-checkout-1792381914506.

## 2026-10-19 — Lamb-source audio and checkout return

- Replaced sheep.wav with seconds 1–3.8 of the latest user-provided lamb_gemini.mp4: mono 44.1kHz, 2.8s, loudnorm -21 LUFS / peak -4 dB, 40ms fade-in and final 250ms fade-out. Updated scripts/refresh-media.py so future regeneration preserves this source. Cow/pig/character audio and product mappings remain unchanged.
- Desktop receipt now offers Return to start and returns automatically 10 seconds after receipt display. The saved deadline survives server/UI updates and a desktop reload. Return cancels media/reconnection, clears only the desktop code/URL and opens the initial connection screen. Completed trial/cart/events remain on the server, and the smartphone receipt remains visible. A new connection creates a fresh demo session; actual studies still open their next trial from /study.
- Focused browser checks 3 PASS: lamb uses the new sheep asset rather than cow; real ten-second return across Help rerender/reload; immediate button return, empty next cart, retained phone receipt, receipt endpoint and two trial records (receipt-return-1792410554726). Screenshots visually inspected.
- Core17 PASS; phone checkout5 PASS (phone-checkout-1792410582365); beep4 PASS (beep-1792410598703); production build/type check PASS. Layout4 PASS across seven sizes (checkout-layout-1792410631052). First layout run raced the browser's asynchronous wheel update; the test now waits for actual scroll movement instead of an arbitrary 100ms delay, and all assertions pass on rerun. No layout CSS change was needed.
- Audio source/output hashes and metadata are recorded locally in qa-output/lamb-audio-refresh/metadata.json. Source hash ba2f04abb70381b9e3a61c0ee3b18f971edecd896f93d56acfd2d23b0a566cf9; new sheep.wav hash 247d5595900bfdafb94c8305a8d237b7d9d04056c51df5f75390994fd128231a. Audio extraction identity and browser playback were checked; actual iPhone speaker audibility still requires physical confirmation.
- After latest Render deployment, reload both PC and phone to replace preloaded audio. Physically confirm lamb-source sound, ten-second desktop return, manual return, and continued phone receipt access. No real participant data was used or reset.

## 2026-10-21 — Vegan labels and visible Delete buttons

- Added explicit isVegan metadata for Plant-Based Mince, Firm Tofu and Pea Protein. Desktop checkout shows a green check/Vegan pill below the product name in both the main product stage and basket. Labels appear consistently in A and B, independently of animal/thanks feedback. Whey and meat are excluded; no vegan status is assumed for the unbranded Cola control.
- Replaced small Remove one text links with larger red-outline/pale-red Delete buttons, trash icon, 42px minimum height and a strong hover state. Each button has a product-specific accessible name and still removes exactly one unit. Separate grid placement prevents long product names, prices and buttons from colliding in narrow PC baskets. Editing remains available during scanning, as before.
- Type check, production build and core17 PASS. Extended existing layout suite: six groups PASS, including all eight Delete controls, three intended basket badges, main-stage label, real delete/re-add and exact $73/$78 totals, both A/B displays, no basket horizontal overflow, independent scroll, membership/payment/receipt and video across seven PC sizes. Evidence: checkout-layout-1792564978066. Screenshots visually inspected.
- First layout run exposed a 19px main-stage overflow at 1280×600 after adding the badge. Reduced only the vegan-stage product image height on short PC windows and reran the suite successfully. No smartphone hardware check is required for this desktop-only display change; actual participant results are not claimed.

## 2026-10-21 — Latest scan at bottom and Normal/Vegan start modes

- Added persisted cartOrder to the trial model. Every new accepted scan moves that product's grouped row to the end, including repeated products. Deduplicated retransmissions do not move/add items; deleting the final unit removes its order entry and clearing resets order. Startup migrates older records from scan_accepted events without deleting history. Desktop basket and phone receipt use this order.
- Checkout follows the latest accepted scan to the list bottom, including when the user was reviewing older items. It stays at the bottom when feedback ends and row heights change. Manual review position survives unrelated updates; reload reconnects to the stored order and latest row. No page-level scroll is used.
- Added Start shopping (normal) / Start shopping (vegan) buttons. Demo trials select A/B at start and record mode_selected, then lock the mode. Actual research trials keep the researcher-assigned condition; the other button is disabled and server tampering is rejected. Scanner audio is prepared for both demo modes before start. Normal retains ordinary beep/guidance; only B adds animal/thank-you media. No budget enforcement added.
- Core20/type check/production build PASS. Dedicated browser suite3 PASS (cart-modes-1792577090576): both buttons visible at 1366×768, 581×700 and 1280×600; explicit B→A Normal and A→B Vegan selection; normal has no extra media; Vegan plays cow feedback; deliberately non-catalogue scan order; repeated Cola groups/moves to bottom; scroll down from top, persisted reload order, manual Help scroll preservation, and final-row visibility after feedback. Both screenshots visually inspected.
- Full browser regression16 PASS (run-1792577159200); recovery4 PASS (recovery-1792577159255); seven-size layout6 PASS (checkout-layout-1792577199757); receipt return3 PASS (receipt-return-1792577212542). Existing UI suites target their assigned mode to preserve their intended A/B coverage after introducing two buttons. Tests use separate local demo data, not participant records.
- Physical-device follow-up after deploying: reload both devices; scan cards in a different order and re-scan one, confirm newest row is visible; confirm Normal has only the ordinary beep and Vegan retains animal/thank-you feedback. No actual physical speaker/phone result is claimed.
