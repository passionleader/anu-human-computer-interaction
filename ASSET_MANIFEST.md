# 자산 출처·제작 기록

제작일: 2026-10-19 AEDT. 상위 `Beef_gemini.mp4`·`Lamb_gemini.mp4` 원본은 수정하지 않았다. 앱은 네트워크 없이 아래 로컬 파일을 사용한다. 연구 데이터나 참가자 촬영물은 자산에 포함하지 않는다.

| 자산 | 출처 / 도구 | 편집·권한·상태 |
|---|---|---|
| `products/*.png` 7종 | OpenAI 내장 image_gen, 이 작업에서 새로 생성 | 가상 제품, 브랜드·글자·가짜 바코드 없는 스튜디오 사진. 동일한 따뜻한 배경·조명. 생성 결과를 프로젝트에 복사. 실제 제품 사진이 아님. |
| `barcodes/*.svg`, `barcodes/*.png` | `scripts/assets.py`, EAN-13 표준 L/G/R 패턴과 체크섬 | `products.json`의 7개 내부용 번호. 사진과 분리한 흰 바탕 검은 바. 생성 코드 포함. 앱 ZXing 해독으로 검증. 유통 등록 번호라는 의미 없음. |
| `cards/*.png`, `cards/product-cards.pdf` | ReportLab + Pillow + PyMuPDF | 단일 상품 데이터로 정확한 이름·가격·용량·바코드를 조합. A6 105×148 mm, 각 1쪽. 미리보기 렌더 확인. 인쇄물 실물 스캔은 대기. |
| `media/cow.mp4`, `media/sheep.mp4` | 사용자 제공 `../Beef_gemini.mp4`, `../Lamb_gemini.mp4`; 파일 메타데이터 Google | 원본의 1–4초 구간, H.264 960×540, 소리 트랙 제거. 살아 있는 소 / 양·어린양. 사용자가 제공한 생성 영상이며 공개 재배포 권한은 원본의 생성 서비스 약관을 따른다. 앱 내 수업 시연 목적으로 포함. |
| `media/cow.wav`, `media/sheep.wav` | 위 사용자 제공 영상의 소리 | 1–3.8초 구간, mono 44.1kHz, loudnorm -21 LUFS / peak -4 dB 설정, 시작·끝 fade. 실제 고통을 녹음했다는 주장을 하지 않음. |
| `media/pig.mp4` | NaIzletuSi ™, [2024-06-01 LJUBLJANA ZOO LJUBLJANA - pig 4.webm](https://commons.wikimedia.org/wiki/File:2024-06-01_LJUBLJANA_ZOO_LJUBLJANA_-_pig_4.webm), 원 영상 [YouTube](https://www.youtube.com/watch?v=GrDpWL1odxw) | **CC BY 3.0**: https://creativecommons.org/licenses/by/3.0/ . 원본 2024-06-01. 1–4초 자르기, 960×540 H.264 변환, 오디오 제거. 출처·권리자 명시는 이 파일을 함께 제공함으로써 유지. 원본은 `asset-sources/pig-original.webm`. |
| `media/pig.wav`의 실제 울음 층 | Secretlondon, [Mudchute pig 1.ogg](https://commons.wikimedia.org/wiki/File:Mudchute_pig_1.ogg), 2007-04, Mudchute City Farm | **CC BY-SA 2.5** 선택: https://creativecommons.org/licenses/by-sa/2.5/ . mono WAV 변환, 3회 배치, 음량 조정, 절차적 squeal 합성. **결합 파생 음원 pig.wav 전체는 CC BY-SA 2.5로 제공.** 돼지의 종 구분용으로 실제 짧은 oink와 합성 끽끽거림을 조합했으며 실제 고통 소리 녹음은 아님. |
| `media/thanks.wav` | 이 작업에서 제작한 소 캐릭터 합성 | Windows SAPI Microsoft David의 “Thank you!”를 피치 0.78배·속도 보정·저역 통과 처리하고 사용자 제공 소 음원으로 앞뒤 질감을 붙인 약 2.95초 표현. 단순 무가공 사람 TTS와 구별되는 합성 시도이지만, **소가 말하는 듯한 느낌과 명료도는 실물 청취 검증 대기**. |
| `media/beep.wav` | numpy 수식 합성 | 1 kHz, 120 ms, fade-in/out, 최대 진폭 0.16. 직접 만든 무브랜드 성공음. 노트북에서만 사용. 앱은 준비된 Web Audio AudioBuffer를 gain 2로 출력하며 원본 파일은 변경하지 않음. |
| `welcome/unknown/membership/payment/complete.wav` | Windows SAPI, Microsoft David Desktop / English (United States) | 명세의 영어 문장을 고정 녹음, rate -1, mono 44.1kHz, 음량 정규화. 런타임 OS TTS 목소리 차이를 피함. 문구·재생 상태 매핑은 소스에 있음. |

## 이미지 생성 프롬프트

내장 image_gen 모드로 **각 상품마다 별도 호출**했다. 공통 프롬프트:

> Use case: product-mockup. Asset: one square product catalogue photograph for a fictional university grocery checkout. Consistent warm off-white seamless background, soft studio light, subtle shadow, slight three-quarter front view, centered complete package with generous margin. Photorealistic food and packaging. No text, no letters, no logos, no barcodes, no watermark, no people. Accurate product name and barcode will be typeset separately.

| 파일 | Subject |
|---|---|
| lamb.png | fresh raw lamb pieces in a clear rectangular sealed supermarket tray, plain cream blank label |
| beef.png | raw red beef mince in a clear rectangular sealed supermarket tray, plain cream blank label |
| pork.png | raw pink pork mince in a clear rectangular sealed supermarket tray, plain cream blank label |
| vegan-mince.png | plant based mince in a clear sealed supermarket tray, green sleeve with blank label, small pea sprig alongside |
| tofu.png | white firm tofu block in a sealed transparent supermarket pack with a plain ivory blank label |
| pea-protein.png | matte sage green stand-up protein powder pouch, blank cream label, small bowl of pale powder and a few green peas beside it |
| whey-protein.png | matte blue stand-up protein powder pouch, blank cream label, small bowl of pale powder beside it |

## 앱 의존 자료

ZXing Browser / Library(Apache-2.0), Express(MIT), ws(MIT), qrcode(MIT)는 설치 패키지의 라이선스를 유지한다. 번들 제작은 TypeScript·Vite·esbuild를 사용한다. 전체 버전은 `package.json`과 `pnpm-lock.yaml`에 고정했다. 실제 Coles 로고·화면·상표·원본 음성은 사용하지 않았다.

외부 검색에서 찾은 `Single Cow Moo.ogg`는 출처 권리 논란 표시가 있어 **사용하지 않았다**. 공개 소·양 울음 검색 결과도 최종 앱에는 사용하지 않고 사용자 제공 영상의 소리를 선택했다.
