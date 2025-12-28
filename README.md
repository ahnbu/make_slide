# Make Slide (슬라이드 재구성 도구)

**Make Slide**는 슬라이드 이미지를 분석하여 텍스트와 배경을 분리하고, 이를 편집 가능한 HTML/CSS 및 PPTX로 재구성하는 자동화 도구입니다. 

Google Gemini 3.0의 강력한 비전 인식 능력과 OpenCV의 이미지 처리 기술을 결합하여, 단순한 OCR을 넘어 **'디자인 레이아웃을 그대로 복원'**하는 것을 목표로 합니다.

## ✨ 주요 기능 (Key Features)

- **Pixel-Perfect Reconstruction**: 원본 슬라이드의 레이아웃, 폰트 크기, 색상을 거의 완벽하게 HTML로 복원합니다.
- **Smart Text Removal**: 배경 이미지에서 텍스트를 깔끔하게 지워(Inpainting), 텍스트와 배경이 분리된 결과물을 제공합니다.
    - *Advanced*: 워터마크(NotebookLM 등)까지 자동으로 제거하는 정교한 필터링 로직 포함.
- **Custom Font Support**: 
    - `Pretendard`, `Noto Sans KR` 등 다양한 한글 폰트 지원.
    - 웹폰트 자동 적용으로 어디서나 동일한 디자인 경험 제공.
- **Multi-Format Export**:
    - **HTML**: 반응형(`cqw`) 웹 슬라이드.
    - **PPTX**: 파워포인트 편집 가능 파일 (Batch 변환 지원).
    - **PDF**: 고해상도(Ultra HD) 인쇄용 PDF 변환.
- **Batch Processing**: 여러 장의 슬라이드를 한 번에 변환하고, 하나의 PPTX로 병합할 수 있습니다.

## 🛠️ 기술 스택 (Tech Stack)

- **Backend**: Python 3.10+, FastAPI
- **AI/ML**: Google Gemini 3.0 Flash Preview, OpenCV (Telea Inpainting)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **DevOps**: Local Server (`uvicorn`)

## 🚀 설치 및 실행 (Installation & Setup)

1. **환경 설정**:
   Python 3.10 이상이 설치되어 있어야 합니다.

2. **클론 및 패키지 설치**:
   ```bash
   git clone https://github.com/your-repo/make-slide.git
   cd make-slide
   pip install -r requirements.txt
   ```

3. **API 키 설정**:
   `.env` 파일을 생성하고 Google Gemini API 키를 입력하세요.
   ```
   GOOGLE_API_KEY=your_api_key_here
   ```

4. **서버 실행**:
   ```bash
   python app.py
   ```
   브라우저에서 `http://localhost:8000`으로 접속하여 사용합니다.

## 📂 폴더 구조 (Structure)

- `src/`: 핵심 분석 및 생성 로직
- `templates/`: 웹 UI 템플릿
- `static/`: 정적 리소스 (JS, CSS)
- `output/`: 변환 결과물 저장소
- `docs/`: 개발자 문서

## 📝 라이선스 (License)

This project is licensed under the MIT License.
