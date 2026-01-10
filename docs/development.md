# 개발자 가이드 (Development Guide)

이 문서는 슬라이드 재구성 프로젝트(`make_slide`)의 유지보수 및 인계를 위한 핵심 가이드입니다. 프로젝트 구조, 스펙, 그리고 **크리티컬한 이슈 대처 방법**을 포함하고 있습니다.

## 1. 프로젝트 개요 (Overview)
- **목표**: 슬라이드 이미지를 분석하여 텍스트와 배경을 분리하고, 이를 반응형 HTML/CSS로 재구성하는 자동화 도구입니다.
- **핵심 가치**:
    - **Pixel-Perfect**: 원본 슬라이드와 거의 동일한 레이아웃 복원.
    - **Responsive**: `cqw` 단위를 사용하여 브라우저 크기에 따라 자동 조절되는 타이포그래피.
    - **Separation**: 텍스트와 배경을 분리하여 편집 용이성 확보.

## 2. 기술 스펙 (Development Specifications)
- **Backend Framework**: Python 3.10+, FastAPI (비동기 처리)
- **AI Model**: Google Gemini 3.0 Flash Preview (`gemini-3-flash-preview`)
    - 역할: OCR, 레이아웃 분석, 시각적 QA, 텍스트 제거.
- **Image Processing**: OpenCV, NumPy
    - 역할: Telea 알고리즘 기반 배경 복원 (Inpainting).
- **Frontend**: Vanilla JS, HTML5, CSS3
    - 특징: 별도의 빌드 과정 없는 순수 구현.
- **Deployment**: `uvicorn` 기반 로컬 서버 (추후 Dockerize 권장).

## 3. 주요 기능 및 아키텍처 (Key Features & Architecture)

### A. 이미지 분석 (`src/analyzer.py`)
- **Gemini Vision**: 이미지를 입력받아 텍스트 위치(BBox), 내용, 스타일을 추출.
- **Two-Step Call**: 정확도를 높이기 위해 Gemini를 **총 2번 호출**.
    1.  **Initial Analysis**: 1차 초안(Layout Data) 작성.
    2.  **Refine Layout (Feedback Loop)**: 디자인 감수자 페르소나로 시각적 검증 및 오타 수정.
- **JSON Schema**: 프롬프트를 통해 엄격한 JSON 형식을 강제하여 파싱 오류 최소화.

### B. 배경 처리 (`src/image_processor.py`)
- **Dynamic Masking**: 추출된 BBox 정보를 기반으로 마스크 생성.
- **Inpainting**: OpenCV `cv2.inpaint` 사용.
    - **Telea (Default)**: Fast Marching Method 기반. 텍스트 제거에 최적화되어 있으며 매우 빠름.
    - **Navier-Stokes**: 유체 역학 기반. 더 자연스럽지만 연산 속도가 느림.
- **Padding**: 텍스트 잔상이 남지 않도록 영역을 미세하게 확장(`dilate`)하여 처리.

### C. 코드 생성 (`src/code_generator.py`)
- **Algorithmic Logic**: 기본 설정에서는 Gemini를 부르지 않고, 수집된 데이터를 바탕으로 수학적 계산을 통해 HTML 조립. (일반적인 경우 분석 2회 + 생성 0회 = 총 2회 호출)
- **Custom Font Support**:
    - `Pretendard Medium`, `Noto Sans KR` 등 사용자 선택 폰트 지원.
    - 웹폰트(CDN/Google Fonts) 자동 주입으로 클라이언트 환경 무관하게 폰트 렌더링.
- **Coordinate Mapping**: 0-1000 정규화 좌표를 실제 픽셀 및 `%` 좌표로 변환.
- **Visual Grouping**: 유사한 크기의 폰트를 클러스터링하여 스타일 일관성 유지.
- **Responsive CSS**: Container Query Width(`cqw`) 단위를 사용하여 반응형 구현.

### D. AI 텍스트 제거 (Photoroom Integration)
- **Library**: `requests` (안정성 및 타임아웃 관리 용이).
- **Endpoint**: `/remove-text-photoroom`
- **Key Parameters**:
    - `removeBackground=false`: 텍스트만 제거하고 배경은 유지.
    - `referenceBox=originalImage`: 원본 해상도 및 비율 유지.
- **Modes**:
    - `ai.all` (모든 객체/텍스트 제거), `ai.artificial` (인공 텍스트만 제거), `ai.natural` (자연물 텍스트 제거) 지원.

### E. 이미지 + 텍스트 조합 (Combine Mode)
- **Concept**: 사용자가 '텍스트 원본'과 '텍스트가 없는 배경'을 쌍(Pair)으로 제공. Inpainting 단계를 생략하여 고속 처리.
- **Validation**:
    - **Count Check**: 원본 vs 배경 파일 개수 불일치 시 차단.
    - **Matching**: 단순 순서 매칭의 위험을 줄이기 위해 `Natural Sort`(숫자 정렬) 도입. UI에서 썸네일로 확인 유도.
- **Processing**:
    - `src/analyzer.py`: 원본 이미지로 텍스트/레이아웃 분석 (Text Exclusion 적용).
    - **Image Resize**: 배경 이미지의 해상도가 원본과 다를 경우, PPTX 생성 시 좌표 오차를 막기 위해 **배경을 원본 크기로 리사이징 (`process_combine_task` 내)**.

### F. PDF 설정 및 UI 아키텍처
- **Settings Split**: `settings.json` 내 `pdf_pptx`와 `pdf_png` 설정을 분리하여 탭별 독립적인 설정 관리. `updatePdfUi` 함수로 즉각적인 UI 반영.
- **Client-Side PPTX**: PDF 탭 및 Standalone 도구는 `pdf.js`로 렌더링된 이미지를 `PptxGenJS`를 통해 브라우저에서 직접 PPTX로 생성. 서버 부하 "Zero".
- **UI Standardization**: `static/css/layout.css` 도입. `tab-content-wrapper`, `control-panel-group` 클래스로 모든 탭의 레이아웃 일관성 확보.

---

## 4. 상세 처리 프로세스 (Processing Pipeline)
`docs/processing_details.md`에 기술된 상세 로직을 요약합니다.

1.  **이미지 레이아웃 분석**
    - `Gemini 3.0 Flash Preview` + `Visual Feedback Loop`
    - 좌표 정규화 (0-1000)
    - **Dual JSON Strategy**:
        - `_layout.json`: 워터마크 텍스트 포함 (배경 복원용)
        - `_layout_filtered.json`: 워터마크 제거됨 (생성용)
2.  **배경 복원 (Inpainting)**
    - **Split Logic**: `_layout.json`의 전체 텍스트 영역을 마스킹.
    - NotebookLM 워터마크 제거됨.
3.  **HTML/PPTX 코드 생성**
    - **Source**: `_layout_filtered.json` 사용.
    - **Font**: 사용자 설정(`font_family`) 적용.
    - **PDF/PPTX**: 
        - PDF: Ultra HD(3.0) 고정.
        - PPTX: Batch 작업 시 `_filtered.json` 우선 사용.
4.  **AI 텍스트 제거**
    - Multimodal Generation (Text removal)

---

## 5. 크리티컬 이슈 및 대처 가이드 (Critical Troubleshooting)
> [!IMPORTANT]
> **이 섹션은 반드시 숙지해야 합니다.** 사소한 설정 차이로 서비스 전체가 중단될 수 있습니다.

### A. Gemini 모델 명칭 주의 (Model Name Sensitivity)
- **증상**: API 호출 시 `404 Not Found` 또는 `400 Bad Request` 에러 발생.
- **원인**: Google Gemini API는 프리뷰/실험적 특성상 모델 ID 문자열이 엄격하고 자주 변경됨.
- **해결**:
    - **정확한 명칭**: `gemini-3-flash-preview` (2024년 12월 기준)
    - `gemini-3.0-flash`, `gemini-3-flash`, `gemini-flash` 등 유사 명칭 사용 시 **절대 동작하지 않음**.
    - 만약 에러 발생 시, Google AI Studio에서 현재 유효한 모델 ID를 교차 검증해야 함.
    - `app.py`, `src/analyzer.py`, `templates/index.html` 등 여러 곳에 하드코딩 되어 있을 수 있으므로 전체 검색 필참.

### B. 한글 파일 경로 문제 (Windows)
- **증상**: OpenCV `cv2.imread` 실행 시 에러 없이 `None`을 반환하거나, 이미지 처리가 중단됨.
- **원인**: Windows 환경의 OpenCV는 기본 파일 입출력 시 'CP949'/'EUC-KR' 인코딩 문제로 한글 경로를 인식하지 못함.
- **해결**: `src/image_processor.py`에 구현된 **바이트 스트림 방식**을 반드시 유지해야 함.
    ```python
    # 올바른 예시
    stream = open(image_path, "rb")
    bytes = bytearray(stream.read())
    numpyarray = np.asarray(bytes, dtype=np.uint8)
    img = cv2.imdecode(numpyarray, cv2.IMREAD_UNCHANGED)
    ```
    - 절대 `cv2.imread(path)` 로 롤백하지 말 것.

### C. Gemini Vision API의 JSON 파싱
- **증상**: `src/analyzer.py`에서 `json.loads` 실패로 500 에러 발생.
- **원인**: LLM은 종종 순수 JSON 대신 Markdown Code Block(```json ... ```)을 포함하여 응답함.
- **해결**:
    - 현재 프롬프트로 강제하고 있으나 완벽하지 않음.
    - 필요 시 응답 문자열에서 ```json 및 ```를 제거하는 전처리 로직(`strip`)이 유효한지 확인.
    - 재시도(Retry) 로직을 추가하는 것도 고려할 수 있음.

## 6. 핵심 파일 구조 (Core File Structure)

프로젝트 파악을 위한 핵심 파일 리스트와 설명입니다.

```
/
├── app.py                  # FastAPI 메인 애플리케이션 (엔드포인트 및 전체 흐름 제어)
├── src/
│   ├── analyzer.py         # Gemini Vision API: 이미지 분석 및 레이아웃 추출
│   ├── image_processor.py  # OpenCV: 이미지 전처리 및 텍스트 제거(Inpainting)
│   ├── code_generator.py   # 분석 데이터를 바탕으로 HTML/CSS 코드 생성
│   └── pptx_generator.py   # 분석 데이터를 바탕으로 PPTX 파일 생성
├── templates/
│   └── index.html          # 메인 웹 인터페이스 (Jinja2 Template)
├── static/
│   ├── js/
│   │   ├── main.js         # 메인 엔트리 포인트: 이벤트 바인딩, JobQueue 관리, 초기화
│   │   ├── config.js       # 설정 관리: API 호출, 상태 저장/로드, 탭 컨텍스트
│   │   ├── ui.js           # UI 조작: 탭 전환, 모달/토스트, DOM 업데이트
│   │   └── pdf_handler.js  # PDF 처리: 업로드, 미리보기, 다운로드 로직
│   └── css/
│       └── layout.css      # 탭 간 일관된 레이아웃을 위한 공통 스타일
├── settings.json           # 프로젝트 전역 설정 파일 (모델, 폰트, 동시성 제어 등)
├── requirements.txt        # 프로젝트 의존성 패키지 목록
└── standalone_pdf_tool.html # [Standalone] 서버 없이 동작하는 클라이언트 사이드 PDF 변환 도구
```

### 문서 (Documentation)
- `README.md`: 프로젝트 개요, 설치 및 실행 방법
- `docs/development.md`: 개발자 가이드 (아키텍처, 파이프라인 상세, 트러블슈팅)
