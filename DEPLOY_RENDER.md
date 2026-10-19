# Render 배포

공개 저장소: https://github.com/passionleader/anu-human-computer-interaction

## 무료 시연 서버

1. Render에서 **New → Web Service → Public Git Repository**를 선택하고 위 저장소 주소를 입력한다. 또는 **New → Blueprint**에서 저장소의 `render.yaml`을 사용한다.
2. Web Service 직접 생성 시 Runtime **Node**, Branch **main**, Root Directory **빈칸**, Build Command `npm ci --include=dev && npm run build`, Start Command `npm start`, Instance Type **Free**, Health Check Path `/healthz`를 설정한다.
3. 환경 변수 `NODE_VERSION=22`, `NODE_ENV=production`, `DATA_DIR=./data`, `DATA_PERSISTENT=false`, `STUDY_TOKEN=<연구자만 아는 긴 임의 문자열>`을 지정한다. Blueprint는 STUDY_TOKEN을 자동 생성한다. 실제 토큰은 GitHub에 올리지 않는다.
4. 배포 완료 후 Render의 HTTPS 주소에서 `/checkout`과 `/scanner`를 연다. 계산대의 **Connect phone scanner**를 누른 뒤 큰 QR을 스마트폰 카메라로 찍으면 바로 연결된다. 필요하면 **Connect with code**에서 영문 4글자로 수동 연결한다. 스마트폰에서 카메라 권한을 허용한다.
5. 실제 연구 설정은 `/study`에서 한다. 토큰은 Render 서비스의 **Environment → STUDY_TOKEN**에서 확인한다. 같은 서비스 주소를 양쪽 기기에서 사용한다. Render가 `RENDER_EXTERNAL_URL`을 제공하므로 로컬 IP 설정은 필요 없다. 별도 도메인을 쓸 때만 `PUBLIC_BASE_URL=https://도메인`을 지정한다.

무료 서비스는 유휴 상태에서 대기할 수 있으므로 첫 접속에 시간이 걸린다. **무료 파일 시스템의 연구 데이터는 재배포·재시작 때 사라질 수 있다.** 시연용으로 사용하고 필요한 CSV/JSON은 `/study`에서 즉시 내려받는다. 실제 참가자 평가를 무료 서버에만 보관하지 않는다.

## 수정본 재배포와 버전 확인

Public Git Repository URL로 만든 서비스는 GitHub push 후 자동 배포되지 않는다. Render에서 **Manual Deploy → Deploy latest commit**을 선택한다. GitHub 계정을 연결해 만든 서비스는 Settings의 Auto-Deploy 설정에 따라 자동 배포된다. [Render 공식 배포 문서](https://render.com/docs/deploys)를 참고한다. 새 배포가 Live가 된 다음 PC와 스마트폰 페이지를 새로고침하고 소리를 다시 활성화한다. 브라우저 새로고침만으로 서버에 없는 최신 코드를 가져올 수는 없다.

## 연구 데이터 유지가 필요한 경우

`render.research.yaml`은 **유료 Starter 서비스와 1GB 영구 디스크**를 사용하는 선택 사항이다. 비용을 확인한 뒤 해당 파일을 Blueprint로 지정한다. 디스크를 `/var/data`에 연결하고 `DATA_DIR=/var/data`, `DATA_PERSISTENT=true`를 사용한다. 직접 생성하는 경우에도 같은 설정을 적용한다. 데이터는 JSON 파일에 저장하므로 **인스턴스는 1개**를 유지하고 별도 내보내기 백업을 남긴다.

## 배포 전 검증과 문제 해결

- `npm ci --include=dev`, `npm test`, `npm run build`, `npm start`로 실제 배포 경로를 실행할 수 있다. `/healthz`는 `{ "ok": true }`를 반환한다.
- HTTPS는 Render가 처리한다. Render에 `TLS_CERT`, `TLS_KEY` 또는 로컬 인증서를 올리지 않는다. 앱은 제공된 `PORT`에서 HTTP와 WebSocket을 함께 처리하고 브라우저는 HTTPS/WSS로 접속한다.
- 카메라가 켜지는 동안 상태가 갱신돼도 동일한 영상 요소를 유지한다. 재시도 버튼은 이전 스트림을 종료하고 새 스트림을 연결한다. 스마트폰 실물 검증 항목은 `QA_REPORT.md`에 남아 있다.
- 스마트폰이 이전 코드를 실행하면 페이지를 새로고침하고 카메라 권한을 다시 확인한다. 다른 앱이 카메라를 사용 중이면 종료한다.
- `.env`, `data/`, `.cert/`, QA 실행 데이터와 개인 작업 기록은 저장소에서 제외한다. 상품 이미지·음원·바코드·인쇄 PDF는 `public/assets/`에 포함한다.

공식 문서: [Node 서비스](https://render.com/docs/deploy-node-express-app), [WebSocket](https://render.com/docs/websocket), [무료 서비스 제한](https://render.com/docs/free), [영구 디스크](https://render.com/docs/disks), [Blueprint](https://render.com/docs/blueprint-spec).
