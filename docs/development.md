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

### D. AI 텍스트 제거 (Bonus Feature)
- **Multimodal GenAI**: OpenCV 방식(알고리즘)보다 더 복잡한 배경의 텍스트 제거 시 Gemini 활용.
- **Endpoint**: `/remove-text-ai`

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

## 6. 폴더 구조 (Directory Structure)
```
/
├── src/                # 핵심 로직 (Analyzer, ImageProcessor, CodeGenerator)
├── docs/               # 개발/기획 문서 (processing_details.md, colab code 등)
├── templates/          # HTML 템플릿 (Jinja2)
├── static/             # CSS, JS, 업로드된 이미지
│   ├── uploads/            # 사용자 업로드 원본
├── output/             # 결과물 저장소 (HTML, Inpainted Image)
├── app.py              # FastAPI 메인 애플리케이션
├── requirements.txt    # 의존성 목록
└── .env                # 환경 변수 (GOOGLE_API_KEY)
```
