# Slide Reconstruction Processing Details

이 문서는 슬라이드 재구성을 위한 각 처리 단계의 모델, 프롬프트, 그리고 기술적 기법을 상세히 설명합니다.

## 1. 단계: 이미지 레이아웃 분석 (Image Layout Analysis)

이미지에서 텍스트 요소, 위치(Bounding Box), 스타일을 추출하는 단계입니다.

*   **사용 모델 (Model)**: `gemini-3-flash-preview` (설정에 따라 변경 가능)
*   **파일 위치**: `src/analyzer.py`

### 기법 (Techniques)
1.  **JSON 스키마 유도**: 모델에게 명시적인 JSON 구조를 반환하도록 요청하여 파싱 오류를 최소화합니다.
2.  **Visual Feedback Loop (시각적 피드백 루프)**:
    *   1차 분석 후, "Design QA Expert" 페르소나를 부여한 모델에게 원본 이미지와 1차 분석 결과를 다시 입력합니다.
    *   모델이 스스로 Bounding Box의 정확도와 텍스트 오타를 검증하고 수정하도록 하여 정밀도를 높입니다.
3.  **좌표 정규화**: 0-1000 범위의 정규화된 좌표계를 사용하여 해상도 독립적인 분석을 수행합니다.

### 프롬프트 (Prompts)

#### A. 초기 분석 (Initial Analysis)
```text
Analyze this slide layout for pixel-perfect HTML reconstruction.

1. **Text Blocks**: Identify every text element.
2. **Geometry**: The bounding box must tightly enclose the text.
3. **Content**: Preserve line breaks (\n) exactly as they appear visually.

Return JSON list:
[
    {
        "text": "Content string with \n",
        "bbox": [ymin, xmin, ymax, xmax] (Normalized 0-1000),
        "style": {
            "color": "#HEX",
            "font_weight": "bold/normal",
            "align": "left/center/right"
        }
    }
]
```

#### B. 레이아웃 정제 (Refine Layout - Feedback Loop)
```text
You are a Design QA Expert. Perform a visual quality check on the provided Layout Data against the Original Image.

**Input Data**:
{layout_str}

**Goal**: Improve the accuracy of text bounding boxes and visual hierarchy.

**Instructions**:
1. **Compare**: Look at the image and the provided bounding boxes (normalized 0-1000: [ymin, xmin, ymax, xmax]).
2. **Fix Position**: If a box is slightly off, too large, or cuts off text, adjust the coordinates.
3. **Fix Content**: If 'text' has typos compared to the image, correct them.
4. **Strict Format**: Return ONLY the corrected JSON list. Do not explain.
```

---

### 세부 프로세스 설명 (Detailed Process Flow)

1.  **분석(Analyze) 단계 (`src/analyzer.py`)**
    *   현재 로직은 정확도를 높이기 위해 Gemini를 **총 2번 호출**합니다.
    *   **첫 번째 호출 (`analyze_image`)**: 이미지를 처음 스캔하여 "어디에 어떤 텍스트가 있는지" 1차 초안(Layout Data)을 잡습니다.
    *   **두 번째 호출 (`refine_layout`)**: 이것이 말씀하신 **Feedback Loop**입니다. "디자인 감수자(Design QA Expert)" 페르소나를 쓴 AI에게, 1차 분석 결과와 원본 이미지를 함께 보여주며 **"위치가 빗나가지 않았는지, 텍스트 오타는 없는지 검수하라"**고 시킵니다.

---

## 2. 단계: 배경 복원 (Background Inpainting)

(중략... OpenCV 내용 유지)

---

## 3. 단계: HTML 코드 생성 (Code Generation)

분석된 데이터와 복원된 배경을 합성하여 HTML/CSS로 변환하는 단계입니다.

*   **사용 모델 (Model)**: Python Algorithmic Logic (No LLM used)
*   **파일 위치**: `src/code_generator.py`

### 세부 프로세스 설명

*   현재 기본 설정(Standard Algorithmic)에서는 더 이상 Gemini를 부르지 않고, 수집된 데이터를 바탕으로 알고리즘(수학적 계산)을 통해 HTML을 조립합니다.
*   따라서, 일반적인 경우 **총 호출 횟수는 2회(초안 1회 + 피드백 1회)**가 맞습니다.
*   피드백 루프를 통해 초기 분석에서 미세하게 어긋난 박스 좌표나 오타를 한 번 더 잡아내므로, 훨씬 정교한 결과물이 나오게 됩니다.

### 기법 (Techniques)
1.  **반응형 타이포그래피 (Responsive Typography)**:
    *   `cqw` 단위 사용: 컨테이너 너비 비례 단위(Container Query Width)를 사용하여 슬라이드 크기에 따라 글자 크기가 자동으로 조절되도록 구현했습니다.
2.  **폰트 크기 정규화 (Font Size Normalization)**:
    *   **클러스터링 (Clustering)**: 유사한 크기의 폰트들을 그룹화합니다 (오차 15% 이내).
    *   **Median Snap**: 그룹 내 폰트 크기를 중간값(Median)으로 통일하여, 미세한 분석 오차로 인해 글자 크기가 들쭉날쭉해지는 것을 방지합니다.
3.  **위치 매핑**: 절대 좌표(%)를 사용하여 원본 레이아웃을 그대로 유지합니다.

---

## 보너스 기능: AI 텍스트 제거 (AI Text Removal)

사용자가 "AI로 텍스트 제거" 옵션을 선택했을 때 사용되는 기능입니다.

*   **사용 모델 (Model)**: `gemini-3-flash-preview` (설정에 따라 변경 가능)
*   **파일 위치**: `app.py` (`/remove-text-ai` endpoint)

### 기법 (Techniques)
1.  **Image-to-Image Generation**: 텍스트 명령어를 통해 이미지 자체를 수정하여 반환받습니다.
2.  **Modalities 설정**: `response_modalities=["TEXT", "IMAGE"]`를 사용하여 이미지를 반환받도록 명시합니다.

### 프롬프트 (Prompt)
```text
Remove all text from this image completely. Fill the text areas with matching background seamlessly. Keep everything else identical.
```
