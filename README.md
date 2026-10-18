# Field: 동물의 목소리가 나는 셀프 계산대

**Render 호스팅 준비 완료:** [배포 안내](DEPLOY_RENDER.md)의 공개 Git 저장소 방식 또는 `render.yaml` Blueprint를 사용한다. Build: `npm ci --include=dev && npm run build`, Start: `npm start`. HTTPS 주소에서 계산대와 스마트폰을 영문 4글자로 연결한다. 무료 서버의 저장 공간은 임시이므로 연구 기록을 내보내 보관한다.

`Prototype_plan.md`를 구현한 로컬 모의 계산대다. 참가자 UI·고정 안내 음성은 영어다. 노트북 `/checkout`, 스마트폰 `/scanner`, 연구자 `/study`가 같은 Node 서버와 실제 WebSocket으로 연결된다. 실제 결제·NFC·회원번호·이메일 전송은 없다.

## 빠른 실행: PC에서 기능 확인

**4자리 코드로 바로 연결:** `/checkout`에서 **Generate pairing code**를 누르면 대문자 영문 4자리(예: `ABCD`)가 표시된다. `/scanner`에서 그 네 글자를 입력하고 **Connect**를 누른다. 대소문자는 구분하지 않는다. 기존 계산대에 이미 연결했다면 **Pair scanner**로 현재 코드를 표시할 수 있다. 다시 눌러도 장바구니·시행·코드는 유지한다. 이전 긴 코드는 이때 4자리로 갱신된다. 새 코드가 필요하면 시행을 종료하고 새 시행을 만든다. 코드 유효기간은 8시간이며, 종료된 시행에는 새로 연결할 수 없다.

연구자가 만든 시행이 없으면 이 버튼은 **B 조건의 시연용 시행**을 만든다. 실제 평가에서는 아래 연구자 화면에서 익명 ID·조건을 먼저 설정한다. 4자리 연결 코드는 연구 기록 내보내기 권한을 포함하지 않는다. 코드는 충돌 없이 생성하고 반복된 잘못된 연결 시도는 제한한다.

실제 연구 시행(`demo=false`)이 열려 있으면 연구자 화면의 **Open checkout** 링크로 계산대를 연다. 코드를 모르는 기기가 Generate pairing code를 눌러 연구 시행 코드를 알아내는 요청은 거부한다. 이미 연결한 계산대의 Pair scanner는 기존 코드를 유지해 정상 동작한다.

PowerShell에서 이 폴더로 이동한 뒤 실행한다. 이 컴퓨터에는 필요한 패키지와 빌드가 준비되어 있다.

```powershell
./Start.ps1 -Http
```

1. 노트북에서 `http://localhost:5173/study`를 연다.
2. `data/study-token.txt`의 토큰을 입력한다. 이 토큰은 연구자 전용이며 참가자에게 보내지 않는다.
3. 익명 ID(예: `P01`), A/B 조건, 개발·시연 데이터 여부를 선택하고 시행을 만든다. 실제 평가에서는 Developer / demonstration 체크를 해제한다.
4. PC 점검 때 Device pairing 주소를 `http://localhost:5173`으로 바꾸고 Update address를 누른다. Open checkout과 Open scanner를 각각 별도 창/브라우저에서 연다.
5. 계산대의 Enable checkout sound, 스캐너 Researcher tools의 Enable & test scanner sound를 누르고 실제 출력음을 확인한다. 카메라를 쓸 때는 Enable camera & sound를 누른다. 양쪽에서 소리를 활성화해야 시작 버튼이 열린다.
6. Start shopping → 카드 스캔 → Remove one / Start again / Pay → 회원카드 Demo 또는 Skip → 단말기 탭 → 영수증 저장을 사용한다.

한 시행에 계산대와 스캐너는 각각 한 창만 연결한다. 중복 창이면 역할 중복 오류를 표시한다. 다음 참가자는 End trial 후 새 시행을 만든다. 조건은 시행 생성 후 바꿀 수 없다. 시행 코드 유효기간은 8시간이다.

계산대는 삑과 고정 안내 음원, B 조건 스캐너는 동물·감사 음원을 실제로 로드·재생 준비한 뒤 준비 완료가 된다. 필수 파일이 없거나 재생이 거부되면 시작을 막고 **Sound unavailable** 안내를 표시한다. 파일·소리 설정을 복구한 뒤 Enable sound를 다시 누른다. 연결이 복구돼도 소리 준비가 끝나기 전의 새 스캔은 서버가 거부하며, 이미 승인한 스캔의 재전송은 중복 추가 없이 복원한다.

## 스마트폰 테더링 + 신뢰되는 HTTPS

스마트폰 카메라는 신뢰되는 HTTPS에서 사용한다. `http://노트북IP` 또는 인증서 경고를 단순 무시하는 방법을 완료된 설정으로 취급하지 않는다. `localhost`는 접속한 기기 자신을 가리킨다. 이 단계의 실물 검증은 아직 남아 있다.

1. 스마트폰 핫스팟에 노트북을 연결하거나, 노트북 모바일 핫스팟에 스마트폰을 연결한다. USB 테더링은 단말 간 통신 가능 여부를 별도 확인한다.
2. PowerShell의 `Get-NetIPAddress -AddressFamily IPv4` 또는 연구자 화면의 기본 주소에서 해당 네트워크의 노트북 IPv4 주소를 확인한다. VPN·가상 어댑터 주소를 고르지 않는다.
3. [mkcert 공식 프로젝트](https://github.com/FiloSottile/mkcert)의 Windows 실행 파일을 설치한다. 로컬 개발용 인증기관을 설치·신뢰시키는 도구다. 아래 예시의 주소를 실제 노트북 IP로 바꾼다.

```powershell
./scripts/Setup-Https.ps1 -LaptopAddress 192.168.137.1 -Mkcert C:\Tools\mkcert.exe
./Start.ps1
```

4. `.cert/phone-rootCA.crt`만 휴대폰으로 전송하고 설치한다. **CA 개인키 `rootCA-key.pem`과 서버 개인키 `localhost-key.pem`은 보내지 않는다.**
5. iPhone/iPad: 인증서 프로파일을 설치한 뒤 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 해당 개발 인증기관에 대한 전체 신뢰를 켠다. Android: 설정의 보안/인증 정보에서 CA 인증서로 설치한다(기종별 메뉴가 다름). 신뢰 설정은 [mkcert 모바일 안내](https://github.com/FiloSottile/mkcert#mobile-devices)를 따른다.
6. 연구자 화면은 `https://localhost:5173/study`, 참가자 페어링 주소는 `https://실제노트북IP:5173`으로 설정한다. 스마트폰으로 스캐너 QR을 열고 **인증서 경고가 없는지** 확인한다. HTTPS에서는 WSS를 자동 사용한다.
7. 카메라·소리 버튼을 누르고 7종 실물 카드와 음량을 점검한다. 노트북 삑/안내와 스마트폰 동물 소리가 분리돼야 한다. 카메라는 후면을 우선 요청하며 마이크는 요청하지 않는다.

IP가 바뀌면 인증서를 새 주소를 포함해 다시 만든다. 인증서와 개인키는 `.gitignore`로 제외된다. 주소·포트·서버 바인딩(0.0.0.0)·인바운드 방화벽 규칙을 순서대로 확인한다. Windows 방화벽에서는 Node 앱 또는 TCP 5173을 **개인 네트워크**에 한해 허용하고, 방화벽 전체를 끄지 않는다. 핫스팟의 클라이언트 격리가 켜져 있으면 기기 간 접속이 안 될 수 있다.

카메라 API의 보안 컨텍스트 요구는 [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)를 참고했다. 해독기는 내장 BarcodeDetector에 의존하지 않고 앱에 번들된 [ZXing Browser](https://github.com/zxing-js/browser)를 사용한다. 설치 후 런타임 CDN·외부 상품 API가 필요 없다.

## 상품·인쇄·미디어

- 단일 상품 데이터: `products.json` (정수 센트, 7종 매핑).
- 사진: `public/assets/products/*.png` (AI 생성, 가상 무브랜드 상품).
- 바코드 원본: `public/assets/barcodes/*.svg`와 PNG.
- 카드 PNG 및 A6 PDF: `public/assets/cards/` (7쪽, 각 105 × 148 mm).
- **인쇄는 실제 크기/100%**로 하고 용지 맞춤 축소를 끈다. A4 여러 장 배치는 인쇄 프로그램의 페이지 모음 기능을 쓰되 A6 크기가 유지되는지 자로 확인한다. 각 바코드 전체 라벨은 70 mm 폭이며 좌우 여백을 유지한다.
- 미디어: `public/assets/media/`. 3종 영상은 3초·무음 파일, 동물 음원은 3초 이내, 삑은 120 ms. 영상과 오디오는 별도로 재생한다.
- 안내는 Windows Microsoft David로 만든 고정 WAV를 사용한다. 소의 감사 음원은 피치를 낮춘 영어 음성에 소 음색을 합성한 캐릭터 표현이다. 돼지 음원은 실제 짧은 울음 + 절차적 끽끽거림 합성이다. **종 구분·감사 표현의 명료함·의도한 울부짖음의 느낌은 실제 스피커 청취로 최종 확인해야 한다.** 생물의 실제 고통을 녹음했다는 주장은 하지 않는다.
- 생성·편집·출처·라이선스: `ASSET_MANIFEST.md`.

일반 상품(두부·유청)은 스마트폰 무음이다. 완두 단백질·식물성 다짐육은 감사 음원이다. A 조건에서는 추가 음원·영상·대기를 생략하고 삑과 결제 안내는 유지한다. 피드백 생략은 양쪽 기기의 재생을 중지하며 기록에 남는다.

## 연구 기록·오류 복구

서버는 `data/trials.json`에 시행·장바구니·스캔 승인 ID·이벤트를 원자적 파일 교체로 저장한다. `data/`는 개인정보 수집 범위를 줄이기 위해 익명 ID만 사용하고 제출 소스에서 제외한다. 시연 데이터와 실제 평가 데이터는 `demo` 필드로 구분한다. Export JSON은 전체 이벤트와 시행별 최종 장바구니·합계 요약을, CSV는 이벤트 행을 저장한다. 조건 순서·참가자 인터뷰·설문·최초 카드 선택 관찰은 별도 연구 기록지에 남긴다. 스캔 전에 고른 카드가 무엇인지 시스템이 자동으로 알 수는 없다.

동일 스캔 ID 재전송은 수량·미디어를 중복 처리하지 않는다. 같은 카드를 다시 추가하려면 카메라 프레임에서 빼고 약 0.85초 후 다시 제시한다. 피드백 중 스캔과 결제를 막는다. 양 기기 종료 확인을 기다리되 5초를 넘기면 실패로 기록하고 복귀한다. 연결이 끊기면 진행을 막고 재연결 시 서버 상태를 받는다. 새로고침은 이전 동물 피드백을 재생하지 않는다. 결제 승인 뒤에는 수정·추가 스캔이 막힌다. 연구자 수동 입력·이미지 해독은 실제 카메라 스캔과 구분해 기록한다.

브라우저 자동 검사 결과와 실물 대기 항목은 `QA_REPORT.md`에 분리했다. 스마트폰 실물 확인 없이 현장 평가 준비가 끝났다고 판단하지 않는다.

## 개발·재검증

Node.js 22 이상과 pnpm을 권장한다. 새 컴퓨터에서 `pnpm install` 또는 `npm install` 후:

```powershell
pnpm build
pnpm test
pnpm qa
```

브라우저 QA는 Edge를 사용하고 임시 서버(5191)·독립 컨텍스트·별도 더미 저장소를 만든다. 결과·스크린샷은 `qa-output/`에 남긴다. 실제 평가 데이터는 건드리지 않는다. 개발 서버를 쓰려면 `$env:NODE_ENV='development'; node --import tsx server.ts`로 실행한다. 일반 Start.ps1은 빌드 결과를 제공한다. 소스를 수정했다면 `pnpm build`를 다시 실행한다.

자산 재생성에는 Pillow·numpy·reportlab·pymupdf·imageio-ffmpeg가 필요하다. `scripts/voices.ps1`로 원본 TTS를 만들고 `python scripts/assets.py`로 카드·미디어를 만든다. 기존 상위 영상은 읽기만 한다. 생성 사진은 자산에 포함돼 있어 다시 생성할 필요가 없다.
