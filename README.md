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

## 🔰 초보자를 위한 사용 가이드 (with Antigravity Project)

**Google Antigravity**는 단순한 코딩 도구가 아닌, 스스로 계획하고 실행하는 **AI 에이전트 IDE**입니다. 복잡한 명령어 없이 AI와 대화하며 프로젝트를 진행해보세요.

### 0. 필수 준비물 (Prerequisites)
이 프로그램은 **Python**으로 만들어졌으며, **Git**을 통해 다운로드됩니다. 시작 전 꼭 설치해주세요!

1.  **Python 설치 (실행기)**
    - [Python 다운로드](https://www.python.org/downloads/)에서 설치 파일을 받으세요.
    - ⚠️ **중요**: 설치 화면 맨 아래 **Running `Add python.exe to PATH`** 체크박스를 **반드시** 선택해야 합니다. (이걸 안 하면 실행이 안 됩니다!)
2.  **Git 설치 (배달부)**
    - [Git for Windows](https://git-scm.com/download/win)를 다운로드하여 기본 설정대로 쭉 설치하세요.
    - *팁: GitHub 회원가입은 필요 없습니다! 설치만 하면 바로 쓸 수 있습니다.*

---

### 1단계: 실행 환경 만들기

1.  **Antigravity 설치**:
    - **Why?**: AI가 코드를 이해하고 대신 실행해주는 작업 공간입니다.
    - [공식 홈페이지](https://antigravity.google)에서 IDE를 다운로드하고 설치하세요.
2.  **프로젝트 가져오기 (Git Clone)**:
    - **Why?**: 인터넷에 있는 `NotebookLM to PPTX` 소스 코드를 내 컴퓨터로 가져오는 과정입니다.
    - **Action**: Antigravity 채팅창(`Cmd/Ctrl+I`)에 아래와 같이 입력하세요.
    > "https://github.com/ahnbu/make_slide.git 주소를 현재 폴더에 복제(clone)해줘."
    - ⚠️ **문제 발생 시**: "git 명령어를 찾을 수 없다"고 하면, Git이 제대로 설치되지 않은 것입니다. 재부팅 후 다시 시도해보세요.

### 2단계: AI 설정 및 실행

3.  **Gemini API 키 설정**:
    - **Why?**: AI 모델(Gemini)을 사용하기 위한 무료 이용권입니다.
    - **Action**: [Google AI Studio](https://aistudio.google.com/app/apikey)에서 키를 발급받고, 채팅창에 입력하세요.
    > "내 API 키는 `AIza...` 야. 이걸로 `.env` 파일을 만들어서 저장해줘."
4.  **바로 실행하기 (Run)**:
    - **Why?**: 필요한 부품(라이브러리)을 조립하고 서버를 켜는 과정입니다.
    - **Action**: 채팅창에 아래 명령어를 복사해서 붙여넣으세요.
    > "가상환경을 만들고 의존성을 설치(`requirements.txt`)한 뒤, 서버(`app.py`)를 실행하고 브라우저를 띄워줘."
    - ⚠️ **문제 발생 시**: "`python`을 찾을 수 없다"고 하면, Python 설치 시 **PATH 추가**를 안 한 것입니다. Python을 지우고 다시 설치하며 체크박스를 꼭 확인하세요.

### 3단계: AI와 함께 사용 및 확장하기

5.  **테스트 및 실행**:
    - **Why?**: 설치된 도구가 내 컴퓨터에서 제대로 돌아가는지 확인하는 첫 단계입니다.
    - **Action**: 브라우저 창이 뜨면 준비한 PDF나 이미지를 업로드해보세요. AI에게 "이 파일로 변환 테스트를 진행하고 결과를 알려줘"라고 시킬 수도 있습니다.
6.  **문제 대응 및 최적화**:
    - **Why?**: 실행 중 오류가 나거나 변환 품질이 마음에 들지 않을 때 AI의 도움을 받습니다.
    - **Action**: "에러 메시지가 떴어, 해결해줘" 또는 "방금 변환된 파일의 배경 제거가 깔끔하지 않아. 알고리즘을 개선해줘"라고 요청하세요.
7.  **기능 추가 및 코드 수정**:
    - **Why?**: 기존 기능을 바꾸거나 나만의 새로운 기능을 추가하여 도구를 발전시킵니다.
    - **Action**: "결과물에 회사 로고를 자동으로 삽입하는 기능을 추가해줘" 또는 "HTML 출력물의 디자인을 좀 더 세련되게 CSS를 수정해줘"라고 지시해보세요.

---

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
