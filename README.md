# NotebookLM to PPTX

**NotebookLM to PPTX**는 Google NotebookLM에서 생성된 나노바나나 기반의 인포그래픽 이미지와 슬라이드 PDF를 분석하여, 텍스트와 배경을 분리하고 편집 가능한 HTML/CSS 및 PPTX로 재구성하는 자동화 도구입니다.

Google Gemini 3.0의 강력한 비전 인식 능력과 OpenCV의 이미지 처리 기술을 결합하여, 단순한 OCR을 넘어 **'디자인 레이아웃을 그대로 복원'**하는 것을 목표로 합니다.

## ✨ 핵심 기능 (Core Features)

- **NotebookLM to PPTX**: 나노바나나 기반의 인포그래픽/PDF를 레이아웃이 살아있는 PPTX로 완벽하게 복원합니다.
- **Pixel-Perfect Reconstruction**: 원본 슬라이드의 레이아웃, 폰트 크기, 색상을 HTML/PPTX로 정밀하게 구현합니다.
- **Smart Text Removal**: 배경 이미지에서 텍스트를 깔끔하게 지워(Inpainting), 텍스트와 배경이 분리된 결과물을 제공합니다.
    - *Advanced*: 워터마크(NotebookLM 등)까지 자동으로 제거하는 정교한 필터링 로직 포함.
- **Custom Font Support & Multi-Format**:
    - `Pretendard`, `Noto Sans KR` 등 한글 폰트 지원 및 HTML/PPTX/PDF(Ultra HD) 다양한 포맷 출력.

## 🛠️ 부가 기능 (Auxiliary Features - for External Integration)

외부 툴과의 유연한 결합을 위해 다음 기능들을 별도로 제공합니다.

- **Image + Text Combination**:
    - 텍스트 원본(Source)과 깨끗한 배경(Clean BG)을 각각 업로드하여 고품질 슬라이드를 결합 생성합니다.
    - 생성형 AI로 만든 이미지 배경에 텍스트를 입히는 등 다양한 외부 툴 워크플로우와 연동 가능합니다.
- **PDF to PNG**:
    - PDF 파일을 고화질 이미지(PNG)로 분리 추출하여 다른 그래픽 툴에서 활용할 수 있도록 돕습니다.
- **Batch Processing**: 여러 장의 슬라이드를 한 번에 변환하고 병합 처리합니다.

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
