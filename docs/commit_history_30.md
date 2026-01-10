## PDF 설정 분리, UI 표준화 및 Photoroom 탭 레이아웃 개선
- **Date**: 2026-01-07 19:55:19
- **Details**:
1. PDF 설정 분리 (PPTX/PNG)
- settings.json & app.py: 기존 단일 [pdf](cci:1://file:///d:/Vibe_Coding/make_slide/app.py:1013:0-1050:92) 설정을 `pdf_pptx`와 `pdf_png`로 분리하여 변환 모드별 독립 설정 지원.
- static/js/script.js:
  - 탭 전환 시 해당 모드(`pdf_pptx` vs `pdf_png`)의 설정값을 UI에 즉시 반영하는 [updatePdfUi](cci:1://file:///d:/Vibe_Coding/make_slide/static/js/script.js:471:2-493:3) 함수 구현.
  - [saveSettings](cci:1://file:///d:/Vibe_Coding/make_slide/static/js/script.js:548:2-640:3): 현재 활성화된 탭을 감지하여 올바른 설정 섹션에 저장하도록 로직 고도화.

2. UI 표준화 및 레이아웃 수정
- templates/index.html:
  - '이미지 텍스트 제거(Photoroom)' 탭에 `tab-content-wrapper` 및 `settings-panel` 클래스를 적용하여 PDF 탭과 동일한 일관된 레이아웃(최대 너비 제한 등) 적용.
  - 모든 탭(재구성, PDF, 조합)의 '동시 처리 개수(Max Concurrent)' 드롭다운 옵션을 `[2, 3, 4, 5, 10, 15]`로 통일.

3. 기타 개선 사항
- 설정 저장 시 변경된 항목과 값을 구체적으로 표시하도록 Toast 메시지 개선.
- 설정 저장 버튼 클릭 시 발생하던 ReferenceError 수정.



## fix: 탭 UI 겹침 현상 해결 및 자바스크립트 성능 최적화
- **Date**: 2026-01-07 19:17:54
- **Details**:
[Frontend] templates/index.html
- '이미지 재구성' 및 'PDF 업로드' 탭 콘텐츠 구조 개선
- 분리되어 있던 `reconstructSettings`와 `uploadSection`을 `reconstructSection` 컨테이너로 감싸 탭 전환 시 일괄 숨김/표시가 가능하도록 수정

[Script] static/js/script.js
- 탭 버튼 클릭 이벤트 리스너 중복 등록(Nested Loop) 버그 수정
- 불필요한 중첩 루프를 제거하여 이벤트 핸들러가 한 번만 실행되도록 최적화 (성능 개선 및 오작동 방지)

[Docs] .agent/rules.md
- 프로젝트 수행 가이드라인 및 AI 에이전트 규칙 파일 추가



## fix: Photoroom API 텍스트 제거 기능 정상화 및 오류 수정
- **Date**: 2026-01-07 18:39:05
- **Details**:
[Backend] app.py
- Photoroom API 호출 방식을 기존 `urllib`에서 `requests` 라이브러리로 마이그레이션하여 안정성 및 코드 가독성 개선
- 텍스트 제거 시 원본 훼손을 방지하기 위한 핵심 파라미터 추가 적용:
  1. `removeBackground=false`: 텍스트 제거 과정에서 배경이 투명하게 날아가는 문제 해결 (배경 유지)
  2. `referenceBox=originalImage`: 결과 이미지가 텍스트 영역으로 크롭되지 않고 원본 캔버스 크기를 유지하도록 설정

[Frontend] templates/index.html
- '텍스트 제거 실행' 시 발생하던 자바스크립트 `TypeError: Cannot read properties of null` 수정
- 원인: JS 코드는 라디오 버튼(`input[name="prMode"]`)을 찾고 있었으나, 실제 UI는 셀렉트 박스(`<select>`)로 구현되어 있어 요소를 찾지 못함
- 조치: `document.getElementById('textRemovalMode_photoroom').value`를 사용하여 사용자가 선택한 모드 값을 올바르게 가져오도록 수정



## feat: 이미지 텍스트 제거 탭 추가 및 UI 구조 표준화 리팩토링
- **Date**: 2026-01-07 18:23:57
- **Details**:
- **기능 추가 (Feat)**:
    - '이미지 텍스트 제거 (Photoroom)' 탭 신설 (프론트엔드 UI 및 탭 전환 로직)
    - 텍스트 제거 모드 선택 (AI.All, Artificial, Natural) UI 구현
- **UI 표준화 및 리팩토링 (Refactor)**:
    - layout.css 도입: 공통 스타일 컴포넌트(tab-content-wrapper 등) 정의
    - 'IMG to PPTX/HTML' 및 'PDF to PPTX' 탭 구조를 표준 컴포넌트 기반으로 전면 재구축
    - 탭 간 레이아웃 불일치 문제 해결
- **버그 수정 (Fix)**:
    - 탭 전환 시 설정/업로드 패널 가시성 동기화 오류 수정 (script.js)
    - 스크립트 문법 오류(SyntaxError) 수정



## feat: PPTX 다운로드 파일명 형식 변경
- **Date**: 2026-01-03 17:46:02
- **Details**:
- standalone_pdf_tool.html: PPTX 변환 파일 다운로드 시 '{기존파일명}_변환.pptx' 형식으로 저장되도록 수정

- 기존 타임스탬프 기반 파일명 생성 로직 대체



## fix : 로컬 PPTX변환 파일에 "플래닝하이"로고 추가
- **Date**: 2026-01-03 12:21:11
- **Details**:



## feat: 클라이언트 사이드 PPTX 변환 및 단독 실행 PDF 도구 추가
- **Date**: 2026-01-03 12:10:42
- **Details**:
[주요 변경 사항]

1. PPTX 다운로드 기능 개선 (Client-side Only)
   - 서버 부하 감소 및 비용 절감을 위해 PPTX 생성 로직을 백엔드(python-pptx)에서 프론트엔드(PptxGenJS)로 전면 이관.
   - 불필요해진 app.py의 `/pdf-to-pptx-download` 엔드포인트 제거 (코드 다이어트).
   - `index.html` 및 `script.js`: 브라우저 내에서 변환된 이미지 블롭(Blob)을 사용하여 즉시 PPTX 파일을 생성하고 다운로드하도록 구현.

2. 독립 실행형 PDF 도구 추가 (Standalone Tool)
   - `standalone_pdf_tool.html` 생성: 백엔드 서버 구동 없이도 브라우저만 있으면 어디서든 PDF를 PNG/PPTX로 변환 가능.
   - 단일 파일 구성: HTML, CSS, JS 로직을 하나로 통합하여 배포 및 로컬 사용 편의성 증대.
   - 주요 기능:
     - PDF 드래그 앤 드롭 업로드 (서버 전송 없음).
     - 페이지별 썸네일 미리보기 및 선택 기능.
     - 개별 이미지 다운로드 (Zip 압축 없이 순차 다운로드).
     - 클라이언트 사이드 PPTX 생성 다운로드.

3. UI/UX 개선
   - 결과 그리드: 한 줄에 약 3개의 카드가 보이도록 반응형 그리드(`minmax(320px, 1fr)`) 적용.
   - 썸네일: 불필요한 공백을 제거하고 이미지 비율에 맞춰 꽉 차게 표시.
   - 아이콘: '크게 보기' 텍스트를 직관적인 눈 모양 아이콘(Lucide Icon)으로 변경.
   - 파비콘: 단독 실행 파일에 식별 용이한 SVG 파비콘 추가.



## [Feat] PDF to PPTX 단순 변환 다운로드 기능 추가
- **Date**: 2026-01-03 11:11:49
- **Details**:
- 'PDF to PNG' 탭에 AI 분석 없는 단순 'PPTX 다운로드' 버튼 추가
- 전체 페이지 또는 선택된 이미지만 PPTX로 병합하여 다운로드하는 기능 구현
- Backend: /pdf-to-pptx-download 엔드포인트 추가 (app.py)
- Frontend: 버튼 UI 배치 및 서버 요청/다운로드 JS 로직 구현
- Fix: script.js 중복 변수 선언 제거 및 스크립트 캐시 버전 업데이트



## feat: add run.bat for one-click server start
- **Date**: 2026-01-03 10:55:34
- **Details**:



## feat: API 키 테스트 로직 개선 및 UI 스타일 정렬 수정
- **Date**: 2026-01-01 16:22:05
- **Details**:
[API 키 테스트 개선]
- Backend: 하드코딩된 모델 대신 `settings.json`의 `vision_model` 설정값을 사용하도록 로직 변경
- Backend: API 키 에러(400)와 서버 에러(500) 구분 처리 및 진단 로직 강화
- Frontend: 테스트 진행 시 실제 테스트 중인 모델명(예: gemini-3-flash-preview)을 UI에 명시

[UI 스타일 리팩토링]
- Settings Modal: API Key 입력창과 버튼 간의 높이 불일치 해결 (height: 2.25rem, flex 정렬 적용)
- Settings Modal: 입력창 폰트를 monospace에서 시스템 기본 폰트로 변경하여 디자인 일관성 확보
- Batch Panel: "PPTX 다운" 등 버튼이 로딩 상태일 때 레이아웃이 깨지는 현상 수정 (.batch-actions에 flex 정렬 추가)



## feat & fix: 설정 저장 로직 수정 및 Gemini 2.5/3.0 모델 옵션 추가
- **Date**: 2026-01-01 14:40:41
- **Details**:
## 🔧 수정 및 개선 사항

### 1. 환경 설정 저장 및 로직 미반영 오류 수정
- **문제 해결**: '정밀 분석 모드(Refine Layout)'와 '글꼴(Font Family)' 설정이 저장되지 않거나, 저장 후에도 실제 분석 로직에 반영되지 않던 문제를 해결했습니다.
- **Frontend ([script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0))**:
  - `fontFamily` 선택 박스에 `change` 이벤트 리스너가 누락되어 값이 갱신되지 않던 버그 수정.
  - [refine_layout](cci:1://file:///d:/Vibe_Coding/make_slide/src/analyzer.py:17:4-86:38) 설정을 서버로 전송하고, 로드 시 UI에 반영하는 로직 추가.
- **Backend ([app.py](cci:7://file:///d:/Vibe_Coding/make_slide/app.py:0:0-0:0))**:
  - [process_slide_task](cci:1://file:///d:/Vibe_Coding/make_slide/app.py:350:0-534:90) 함수가 [refine_layout](cci:1://file:///d:/Vibe_Coding/make_slide/src/analyzer.py:17:4-86:38) 인자를 받아, **사용자가 활성화했을 때만** 정밀 분석 루프(`analyzer.refine_layout`)를 실행하도록 조건부 로직 적용.
  - `DEFAULT_SETTINGS`에 누락된 키 추가.

### 2. 최신 Gemini 모델 옵션 추가
- **비전 모델 (Vision Model)**:
  - `Gemini 2.5 Flash (Experimental)` 선택지 추가.
- **HTML 생성 모델 (Codegen Model)**:
  - 기존 `Gemini 2.0 Flash` 제거.
  - `Gemini 3.0 Flash (Preview)` 및 `Gemini 2.5 Flash (Experimental)` 추가.
- **Backend 연동**:
  - [app.py](cci:7://file:///d:/Vibe_Coding/make_slide/app.py:0:0-0:0)에서 `codegen_model` 파라미터를 받아 `CodeGenerator.generate_html`로 전달하도록 인터페이스 개선 ([src/code_generator.py](cci:7://file:///d:/Vibe_Coding/make_slide/src/code_generator.py:0:0-0:0) 서명 수정 포함).

### 3. 기타
- Gemini 2.5 Flash 모델의 가용성을 확인하기 위한 테스트 스크립트(`test_gemini_2_5.py`) 추가.



## docs: enhance beginner guide with Antigravity workflow and installation steps
- **Date**: 2025-12-31 16:37:45
- **Details**:



## feat: rebrand project to 'NotebookLM to PPTX'
- **Date**: 2025-12-31 16:03:05
- **Details**:
- Update index.html: Change title and header

- Update README.md: Redefine project concept and features



## chore: remove logs/execution_log.txt from git and ignore it
- **Date**: 2025-12-31 15:50:36
- **Details**:



## feat: '이미지 + 텍스트 조합' 모드 UX 개선 및 파이프라인 최적화
- **Date**: 2025-12-28 16:22:04
- **Details**:
[Summary]
'이미지 + 텍스트 조합' 모드의 사용자 경험(UX)을 대폭 개선하고, PPTX 생성 시 발생하는 크기 오류 및 워터마크 잔존 문제를 해결했습니다. 또한 관련 문서를 최신화했습니다.

[Detailed Changes]

1. Frontend (UI/UX)
   - **스마트 정렬 도입 ([script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0))**: 파일 업로드 시 단순히 문자열 기준이 아닌 'Natural Sort(숫자 인식 정렬)'를 적용하여, `slide_1` -> `slide_2` ... -> `slide_12` 순서가 올바르게 유지되도록 개선.
   - **썸네일 프리뷰**: 단순 텍스트 리스트 대신 2열 그리드 형태의 이미지 썸네일 뷰를 구현하여 원본과 배경의 매칭 여부를 시각적으로 검증 가능하게 함.
   - **Drag & Drop 지원**: 원본(Source) 및 배경(BG) 업로드 영역에 드래그 앤 드롭 이벤트 핸들러 추가 및 시각적 피드백(Highlight) 구현.
   - **스타일 통일 ([index.html](cci:7://file:///d:/Vibe_Coding/make_slide/templates/index.html:0:0-0:0))**: 파일 선택 버튼을 메인 UI의 Primary 버튼 스타일로 통일하고 가시성 확보.
   - **캐시 갱신**: 스크립트 로드 버전을 `v3.13`으로 상향하여 변경된 로직이 즉시 반영되도록 조치.

2. Backend (Pipeline Logic)
   - **PPTX 스케일링 이슈 수정 ([app.py](cci:7://file:///d:/Vibe_Coding/make_slide/app.py:0:0-0:0))**: 원본 이미지와 배경 이미지의 해상도가 다를 경우 PPTX 텍스트 위치/크기가 왜곡되는 현상을 발견. 처리 과정에서 배경 이미지를 원본 이미지 크기에 맞춰 리사이징(Resizing)하는 로직 추가.
   - **워터마크 제거 로직 적용**: Combine 모드에서도 'Text Exclusion' 파라미터를 처리하도록 엔드포인트를 수정하여, 결과물에서 "NotebookLM" 등의 불필요한 텍스트가 자동 제외되도록 함.

3. Documentation
   - [README.md](cci:7://file:///d:/Vibe_Coding/make_slide/README.md:0:0-0:0): 신규 기능(Combine Mode) 소개 섹션 추가.
   - [docs/development.md](cci:7://file:///d:/Vibe_Coding/make_slide/docs/development.md:0:0-0:0): Combine 모드의 상세 구현 스펙(검증 로직, 처리 파이프라인, 기술적 이슈 해결) 업데이트.



## docs: 개발문서 업데이트, readme.md 생성
- **Date**: 2025-12-28 12:42:46
- **Details**:



## feat: 구현된 기능 추가 및 버그 수정 (폰트 선택, 워터마크 제거 로직 개선, PDF 화질 고정)
- **Date**: 2025-12-28 12:40:14
- **Details**:
[주요 변경 사항]

1. 워터마크 제거 로직 고도화
   - [app.py](cci:7://file:///d:/Vibe_Coding/make_slide/app.py:0:0-0:0): 레이아웃 데이터를 '전체 데이터(Inpainting용)'와 '필터링된 데이터(생성용)'로 분리하여 처리하는 로직 적용.
   - 워터마크 텍스트는 배경 복원(Inpainting)에는 사용되지만, 최종 결과물(HTML/PPTX) 생성 시에는 제외되도록 수정.
   - 디버깅 편의를 위해 `_layout.json`(원본)과 `_layout_filtered.json`(제외 후) 두 가지 버전을 모두 저장하도록 변경.

2. 사용자 폰트 선택 기능 추가
   - Frontend ([index.html](cci:7://file:///d:/Vibe_Coding/make_slide/templates/index.html:0:0-0:0), [script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0)):
     - 설정 패널에 '글꼴(Font)' 선택 드롭다운 추가.
     - 지원 폰트: 맑은 고딕(기본), Noto Sans KR, Apple SD Gothic Neo, Arial, Pretendard Medium.
     - 사용자 선택값을 서버 설정에 저장([saveSettings](cci:1://file:///d:/Vibe_Coding/make_slide/static/js/script.js:431:2-452:3))하고 유지하도록 로직 구현.
   - Backend ([app.py](cci:7://file:///d:/Vibe_Coding/make_slide/app.py:0:0-0:0), [code_generator.py](cci:7://file:///d:/Vibe_Coding/make_slide/src/code_generator.py:0:0-0:0), [pptx_generator.py](cci:7://file:///d:/Vibe_Coding/make_slide/src/pptx_generator.py:0:0-0:0)):
     - API 파라미터에 `font_family` 추가 및 파이프라인 전반에 전달.
     - HTML 생성 시 선택된 폰트에 맞춰 Google Fonts 또는 CDN(Pretendard) 링크 자동 주입 로직 구현.
     - PPTX 생성 시 텍스트 객체의 폰트 속성 적용 로직 추가.

3. PDF 변환 화질 '인쇄용' 고정 및 UI 숨김
   - [index.html](cci:7://file:///d:/Vibe_Coding/make_slide/templates/index.html:0:0-0:0): PDF 화질 선택 UI를 `display: none`으로 숨김 처리.
   - [script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0): UI 요소가 없더라도 기본값을 '3.0 (Ultra HD - 인쇄용)'으로 강제 적용하도록 안전 장치(fallback) 추가.

4. 일괄(Batch) PPTX 다운로드 기능 개선 및 버그 수정
   - 워터마크 문제 해결: 일괄 PPTX 생성 시 원본 JSON 대신 [_filtered.json](cci:7://file:///d:/Vibe_Coding/make_slide/output/multi_20251228_123011/page_002_layout_20251228_123011_965990_filtered.json:0:0-0:0)을 우선적으로 사용하도록 필터링 로직 개선.
   - 400 Bad Request 해결: [_filtered.json](cci:7://file:///d:/Vibe_Coding/make_slide/output/multi_20251228_123011/page_002_layout_20251228_123011_965990_filtered.json:0:0-0:0) 사용 시 배경 이미지 경로를 유추하지 못하던 버그를 수정(파일명 파싱 로직 개선).

5. UX 개선 (프로그레스바)
   - [script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0): 일괄 작업 및 개별 작업 완료 시, 프로그레스바가 100% 상태로 남아있지 않고 자동으로 사라지도록 동작 수정.

[파일별 변경 요약]
- app.py: 워터마크 분기 처리, 폰트 파라미터 처리, Batch PPTX 생성 로직 수정.
- src/code_generator.py: 웹폰트 CDN 주입 및 CSS 폰트 적용.
- src/pptx_generator.py: PPTX 폰트 적용 메서드 업데이트.
- static/js/script.js: 설정 관리, Progress Bar UI 로직, PDF 기본값 로직 수정.
- templates/index.html: 폰트 UI 추가, PDF 화질 UI 숨김.



## feat: PDF to PPTX 일괄 변환 기능 추가 및 UI 개선
- **Date**: 2025-12-28 11:03:04
- **Details**:
- **Frontend (PDF to PPTX 탭 추가)**
  - [index.html](cci:7://file:///d:/Vibe_Coding/make_slide/templates/index.html:0:0-0:0): 상단 탭에 'PDF to PPTX' 메뉴 추가 및 PDF 업로드/변환 섹션 구성
  - [script.js](cci:7://file:///d:/Vibe_Coding/make_slide/static/js/script.js:0:0-0:0): PDF 파일을 클라이언트에서 이미지로 변환 후, 기존 일괄 처리 큐(JobQueue)로 연동하는 로직 구현
  - PDF 변환 화질 및 슬라이드 재구성 환경설정(Vision Model 등) 통합 UI 제공

- **Logic Improvements**
  - 클라이언트 사이드 PDF 렌더링(pdf.js)과 백엔드 슬라이드 재구성 프로세스 연결
  - [JobQueue](cci:2://file:///d:/Vibe_Coding/make_slide/static/js/script.js:66:2-377:3)를 통한 안정적인 일괄 처리 및 진행률 모니터링 지원
  - 생성된 이미지의 개별 결과 확인 및 통합 PPTX 다운로드 기능 연결

- **Bug Fixes**
  - 탭 전환 이벤트 리스너 로직 수정 ('PDF to PPTX' 탭 클릭 불가 문제 해결)
  - PDF 모드에서 진행률 모니터링이 누락되던 문제 수정 (`undefined reading 'html_url'` 에러 해결)



## feat: PDF to PNG 기능 추가 _2차
- **Date**: 2025-12-28 00:54:41
- **Details**:
[주요 변경]
- **PDF to PNG 변환 기능 구현**: PDF 파일을 고화질 이미지로 변환하는 핵심 기능 추가
- **UI/UX 전면 개편**: 3단 레이아웃(정보/툴바/그리드) 및 반응형 디자인 적용
- **서버 자동 백업**: 변환된 이미지를 'output/pdftoimage_{timestamp}'에 자동 저장
- **개별 다중 다운로드**: ZIP 압축 없이 선택한 이미지를 연속으로 다운로드하는 로직 구현

[상세 변경]
- FastAPI 엔드포인트 '/save-pdf-images' 추가
- script.js 리팩토링 (업로드/다운로드 로직 분리, 캐시 버스팅 적용)
- 선택 관리 시스템 (전체 선택, 개별 체크) 도입



## feat: PDF to PNG 기능 추가 (서버 자동 백업 및 다중 다운로드 포함)
- **Date**: 2025-12-28 00:53:59
- **Details**:
[주요 변경]
- **PDF to PNG 변환 기능 구현**: PDF 파일을 고화질 이미지로 변환하는 핵심 기능 추가
- **UI/UX 전면 개편**: 3단 레이아웃(정보/툴바/그리드) 및 반응형 디자인 적용
- **서버 자동 백업**: 변환된 이미지를 'output/pdftoimage_{timestamp}'에 자동 저장
- **개별 다중 다운로드**: ZIP 압축 없이 선택한 이미지를 연속으로 다운로드하는 로직 구현

[상세 변경]
- FastAPI 엔드포인트 '/save-pdf-images' 추가
- script.js 리팩토링 (업로드/다운로드 로직 분리, 캐시 버스팅 적용)
- 선택 관리 시스템 (전체 선택, 개별 체크) 도입



## Feat(PPTX): HTML/PPTX Export 옵션 추가 및 스타일 일관성 개선
- **Date**: 2025-12-27 23:49:36
- **Details**:
- Feat: 환경 설정에 '출력 포맷(Output Format)' 옵션 추가 (HTML/PPTX/Both)
- Feat: 단일 파일 처리 시에도 PPTX 생성 및 다운로드 기능 구현
- Fix: 모달 창 내 다운로드 버튼 ID 중복(btnDownloadHtml)으로 인한 오작동 수정
- Fix: PPTX 생성 시 3자리 색상 코드(#F00) 파싱 오류 수정 및 폰트 크기 계산 로직 개선
- Refactor: HTML/PPTX 간 일관된 스타일 적용을 위해 폰트 정규화 로직을 저장 단계로 이동
- UI: 상단 헤더 중복 버전 배지 제거



## gitignore 업데이트
- **Date**: 2025-12-27 17:23:43
- **Details**:



## 불필요한 파일 정리
- **Date**: 2025-12-27 12:52:19
- **Details**:



## feat: 설정 로직 리팩토링, UI 최적화 및 파일 저장소 통합
- **Date**: 2025-12-26 11:45:54
- **Details**:
[설정 및 동시성]
- Frontend 설정 관리를 AppSettings 객체로 중앙화
- 동적 동시성 제어 구현: max_concurrent가 요청별로 동기화되어 런타임에 즉시 반영됨
- 런타임 설정과 기본값 설정을 분리; '저장' 버튼은 이제 영구 저장(Persistence)만 담당함

[아키텍처 및 저장소]
- 파일 저장소 리팩토링: 업로드 파일을 static/uploads/를 거치지 않고 output/{batch_folder}/로 직접 저장하도록 변경
- 배치 폴더 명명 규칙을 정렬이 용이한 YYYYMMDD_HHMMSS 형식으로 업데이트
- static/uploads/를 .gitignore에 추가
- src/image_processor.py에서 윈도우/한글 파일명 처리 문제 수정 (cv2.imencode로 전환)

[UI/UX]
- 작업 카드 레이아웃 재설계: 상태 배지와 파일명을 Flexbox로 나란히 배치
- 상태 표시 최적화: 완료 시 불필요한 'Complete' 텍스트를 숨겨 화면 정돈
- 설정 패널에 동시 작업 제어(Concurrent Task control) 추가
- 설정 레이블 수정 (예: 'HTML생성' 등)

[기타]
- app.py에서 .env 변수 로딩 우선순위 강제 적용



## chore: ignore output directory
- **Date**: 2025-12-26 10:46:37
- **Details**:
Untracked output/ directory and added it to .gitignore. This prevents generated artifacts from cluttering the repository.



## security: remove .env from git tracking
- **Date**: 2025-12-24 14:20:55
- **Details**:
The .env file was accidentally committed. Removing it from the repository but keeping it locally. It is now ignored via .gitignore.



## security: untrack docs/colab_success.py and add .env support
- **Date**: 2025-12-24 14:19:09
- **Details**:
Untracked docs/colab_success.py containing reference code with secrets. Added .env to .gitignore and created .env.example template.



## Initial commit
- **Date**: 2025-12-24 12:06:15
- **Details**:


