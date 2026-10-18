# 독립 QA 보고서

검토일: 2026-10-19 (AEDT)  
범위: `Prototype_plan.md`, `WORK_LOG.md`, `QA_REPORT.md`, `README.md` 및 `core.ts`, `server.ts`, `src/main.ts`, 자산, 기존 자동 QA를 검토했다. PC Edge 브라우저와 프로토콜을 사용했으며 실제 스마트폰이나 실물 카드는 사용하지 않았다. 모든 새 서버 검사는 `qa-output/independent-*` 또는 각 QA 실행의 전용 디렉터리, 별도 포트(5201–5203 또는 테스트별 5191–5196)를 사용했다. 기존 `data/`와 5173 라이브 데모는 건드리지 않았다.

## 발견 사항

### P1 — [수정 및 독립 재검사 통과] 공개 페어링 API가 연구 시행 코드를 노출하고 기기 역할을 선점할 수 있음

`server.ts:46–51`의 `POST /api/pairing`은 인증 없이 가장 최근의 미종료 시행을 찾아 네 자리 코드를 응답한다. WebSocket은 그 코드만으로 checkout 또는 scanner 역할 연결을 허용한다(`server.ts:126–137`).

재현: 인증된 연구자 요청으로 `demo:false`인 B 시행을 만들고, 인증 헤더 없이 `GET /api/trials`와 `POST /api/pairing`을 호출했다. 시행 목록은 401을 반환했지만 페어링 요청은 해당 시행의 실제 코드를 `UMQP`와 trial ID와 함께 반환했다. 이 코드로 `role: checkout` WebSocket 연결을 시도하자 서버가 시행 상태를 보내며 연결을 승인했다.

관찰: 같은 LAN에 접근할 수 있는 다른 클라이언트가 연구자 토큰 없이 활성 시행의 코드를 알아내고, 연구자의 checkout/scanner가 먼저 연결되지 않았다면 역할을 차지할 수 있다. 이는 올바른 기기의 연결을 막거나 다른 장바구니 조작을 일으켜 시행 기록의 무결성을 훼손할 수 있다. 연구자 내보내기 API가 401로 보호된다는 사실만으로 페어링 경로가 보호되지는 않는다.

기대: 연구용 코드는 checkout 화면을 통해 지정된 장치에만 발급되고, 임의 LAN 클라이언트가 활성 시행 코드를 조회하거나 역할을 선점할 수 없어야 한다. 별도 재현 자료: [independent-pairing-disclosure.mjs](qa-output/independent-pairing-disclosure.mjs), [관찰 결과](qa-output/independent-pairing-disclosure-1792343431475/observation.json).

### P2 — [수정 및 독립 재검사 통과] 소리 파일을 재생할 수 없어도 양 기기가 준비 완료로 표시됨

`src/main.ts:76–81`의 `enableSound()`는 준비 단계에서 각 파일의 `play()` 오류를 삼킨 뒤 파일이 준비되지 않았어도 `audioEnabled=true`와 `sound_ready`를 설정한다.

재현: 격리된 Edge 브라우저에서 checkout 컨텍스트의 모든 `/assets/media/*.wav` 요청을 의도적으로 404로 돌리고, 일반 scanner를 연결해 소리 준비를 눌렀다. `/api/trials`의 `connected.ready`는 `true`, Start shopping 버튼은 활성 상태였다. 시작 뒤 두부 스캔을 진행하자 checkout 삑 재생 실패가 `device_error`로 기록됐지만 상품은 장바구니에 추가되고 phase는 `scanning`으로 유지됐다.

기대: 필수 소리의 재생 준비가 실패하면 준비 상태를 완료로 보고하지 않고 참가자에게 복구 안내를 표시해야 한다. 재현 자료: [independent-sound-readiness.mjs](qa-output/independent-sound-readiness.mjs), [관찰 결과](qa-output/independent-sound-1792343274044/observation.json).

### P2 — [수정 및 독립 재검사 통과] 피드백 중 거절된 정상 바코드에 상품 미인식 음성이 나올 수 있음

`src/main.ts:39–42`는 `m.event`가 거절 이벤트라는 이유만으로 checkout에서 `playGuide('unknown')`을 재생한다. 서버 거절 사유에는 알 수 없는 상품뿐 아니라 피드백 중인 스캔도 포함된다.

재현: B 시행에서 beef 스캔을 승인시켜 피드백 상태에 들어간 직후, 동일한 scanner 연결에서 정상 등록된 tofu EAN을 전송했다. 서버는 정확히 `Please wait until scanning is ready`를 기록했고 feedback phase를 유지했다. 하지만 Edge checkout에서는 `unknown.wav` 재생 호출이 관찰됐다.

기대: `unknown.wav`는 실제 `Item not recognised` 거절에만 재생하고, 바쁜 상태·연결 문제 등은 해당 원인을 화면에만 알려야 한다. 일반 카메라 경로는 500ms 잠금과 서버 상태 확인이 있어 이 경계 상황을 일부 막지만, 서버 상태 방송보다 다음 해독이 먼저 처리되는 지연 상황에서 잘못된 음성 안내가 가능하다. 재현 자료: [independent-rejected-scan-voice.mjs](qa-output/independent-rejected-scan-voice.mjs), [관찰 결과](qa-output/independent-rejected-1792343395448/observation.json).

## 수정 후 재확인

메인 구현자가 readiness, 거절 음성 및 페어링 API 수정을 반영했다. 최신 프런트엔드에서 checkout WAV 요청을 404로 만들면 장보기 버튼이 비활성화되고 `connected.ready`가 false로 남으며, 실패 안내가 표시됐다. 요청 차단을 해제하고 다시 준비를 누르면 버튼이 활성화됐고 두부 스캔이 정상 승인됐다. 세부 결과: [관찰 결과](qa-output/independent-sound-1792343663110/observation.json). 해당 실행 중 빌드 산출물이 재생성되는 시점과 겹쳐 서버가 한시적으로 `dist/index.html` 부재 로그를 남겼지만, UI와 검증 흐름은 정상 실행됐다.

페어링 수정 후 동일한 무인증 API 재현은 활성 `demo:false` 시행에서 403을 반환했고 코드가 없었다. 이미 연구자 화면이 checkout 링크에 넣은 lowercase 코드를 요청 본문으로 주면 200으로 같은 코드가 반환되고 checkout 역할 WebSocket 연결이 가능했다. 연결이 이미 가진 코드를 이용하는 경로는 유지됐다. 세부 결과: [관찰 결과](qa-output/independent-pairing-disclosure-1792343729077/observation.json).

거절 음성 수정 후 beef 피드백 중 tofu 스캔을 거절하는 경계 재현에서 서버는 계속 `Please wait until scanning is ready`를 기록하고 phase를 feedback으로 유지했으며, checkout의 `unknown.wav` 재생 호출은 0회였다. 세부 결과: [관찰 결과](qa-output/independent-rejected-1792343736132/observation.json).

따라서 세 항목은 최초 검토 빌드에서 확인된 결함이며, 위 재현으로 최신 수정이 동작함을 독립 확인했다.

## 통과한 검사

- 핵심 로직: 13/13. 네 글자 코드 형식·충돌 회피, 상품/합계, 중복 ID, 피드백, 결제 후 불변 등을 확인했다.
- 기본 브라우저 흐름: 16개 검사 통과. 별도 Edge 컨텍스트에서 카드 해독, 바구니 변경, 결제, 양 조건의 미디어, 실패·생략·내보내기를 확인했다.
- 페어링: 5개 검사 통과. 계산대 코드 생성, 잘못된 코드 후 재시도, 소문자 입력, 실제 스캔 경로, 코드 다시 보기, 스캐너 새로고침 재연결을 확인했다.
- 가상 카메라: 3개 검사 통과. `getUserMedia` → ZXing → 서버 경로, 같은 프레임 중복 방지, 프레임 밖으로 뺐다가 다시 제시하는 동작을 확인했다.
- 저장·복구: 4개 검사 통과. 서버 재시작 후 장바구니와 중복 ID 보존, 5초 피드백 만료, 연결 끊김, 결제 승인 복구를 확인했다.
- 연구자 화면: 6개 검사 통과. 토큰 인증, 조건 잠금, 참가자 페어링, 관찰자 역할, JSON 내보내기, 시행 종료 후 다음 참가자를 확인했다.
- HTTPS/WSS: 시험 인증서를 신뢰 우회 옵션으로 사용하는 PC 검사 1개 통과. 실제 휴대폰의 CA 신뢰는 입증하지 않는다.

처음 기본 샌드박스에서 병렬로 띄운 일부 로컬 서버 검사는 소켓 시작 시간 초과가 있었지만, 앱 오류로 보지 않았다. 동일 검사를 승인된 로컬 QA 환경에서 한 번에 순차 실행해 통과를 확인했다.

## 아직 확인되지 않은 항목

스마트폰 실물 카메라·오디오·CA 신뢰, 테더링 경로, 인쇄 카드 7장의 실물 스캔, 실제 스피커의 음량과 체감 지연은 이번 검토에서 시험하지 않았다. 브라우저·가상 카메라 결과로 이 항목들을 완료 처리하면 안 된다.
