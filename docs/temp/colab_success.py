from google import genai
from google.genai import types
import os

# 2. API Key 설정
API_KEY = "AIzaSyCM9oVLjxJ0atKjRDhhItpmeSeBNAWpCow"
os.environ["GOOGLE_API_KEY"] = API_KEY

# 3. Gemini API 연결 테스트
print("🤖 Gemini API (google-genai) 연결 테스트 중...")

try:
    client = genai.Client(api_key=API_KEY)

    # [수정] 3.0 모델이 아직 배포되지 않았거나 엔드포인트가 다를 경우를 대비해
    # 현재 사용 가능한 최신 실험 모델(gemini-3-flash-preview)을 기본값으로 설정합니다.
    # 만약 3.0이 출시되었다면 'gemini-3.0-flash'로 변경하세요.
    # MODEL_NAME = 'gemini-3-flash-preview'
    MODEL_NAME = 'gemini-3-flash-preview'
    # MODEL_NAME = 'gemini-2.5-flash-image'

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents="API 연결 확인"
    )
    print(f"✅ API 연결 성공! (사용 모델: {MODEL_NAME})")
    print(f"응답: {response.text}")

except Exception as e:
    print(f"❌ API 연결 실패: {e}")
    print("API Key 또는 모델명을 확인해주세요.")


# ==========================================
# [블록 2] 슬라이드 이미지 업로드 및 재구성 실행 (v3: 기하학 기반 폰트 보정)
# ==========================================

import cv2
import numpy as np
import json
from google.colab import files
from PIL import Image
import io
import re
from datetime import datetime

# --- SlideReconstructor 클래스 정의 (v3) ---
class SlideReconstructor:
    def __init__(self, image_path, model_name='gemini-3-flash-preview'):
        self.image_path = image_path
        self.model_name = model_name
        
        # 이미지 로드 및 전처리
        stream = open(image_path, "rb")
        bytes = bytearray(stream.read())
        numpyarray = np.asarray(bytes, dtype=np.uint8)
        self.img = cv2.imdecode(numpyarray, cv2.IMREAD_UNCHANGED)
        
        if self.img is None:
            raise ValueError(f"이미지를 불러올 수 없습니다: {image_path}")
        
        if self.img.shape[2] == 4:
             self.img = cv2.cvtColor(self.img, cv2.COLOR_BGRA2BGR)
            
        self.height, self.width = self.img.shape[:2]
        self.layout_data = []
        # 타임스탬프 생성 (파일명 중복 방지)
        self.timestamp = datetime.now().strftime("%H%M%S")
        self.client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

    def step1_vision_analysis(self):
        print(f"🔍 [Analysis] Gemini API({self.model_name}) 기하학 분석 중...")
        
        try:
            pil_image = Image.open(self.image_path)
            
            # 프롬프트: 폰트 크기 추정 요청을 줄이고, 정확한 박스와 텍스트 줄바꿈 식별에 집중
            prompt_text = """
            Analyze this slide layout for pixel-perfect HTML reconstruction.
            
            1. **Text Blocks**: Identify every text element.
            2. **Geometry**: The bounding box must tightly enclose the text.
            3. **Content**: Preserve line breaks (\\n) exactly as they appear visually.
            
            Return JSON list:
            [
                {
                    "text": "Content string with \\n",
                    "bbox": [ymin, xmin, ymax, xmax] (Normalized 0-1000),
                    "style": {
                        "color": "#HEX",
                        "font_weight": "bold/normal",
                        "align": "left/center/right"
                    }
                }
            ]
            """

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt_text, pil_image],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            
            self.layout_data = json.loads(response.text.strip())
            print(f"✅ [Analysis] {len(self.layout_data)}개 블록 감지.")

            # 픽셀 좌표 변환
            for item in self.layout_data:
                ymin, xmin, ymax, xmax = item['bbox']
                item['bbox_px'] = [
                    int((xmin / 1000) * self.width),    # x
                    int((ymin / 1000) * self.height),   # y
                    int(((xmax - xmin) / 1000) * self.width), # w
                    int(((ymax - ymin) / 1000) * self.height) # h
                ]
            return self.layout_data

        except Exception as e:
            print(f"❌ [Error] 분석 실패: {e}")
            self.layout_data = []
            return []

    def step2_background_cleaning(self):
        print("🎨 [Cleaning] 배경 복원(Inpainting) 수행 중...")
        
        mask = np.zeros(self.img.shape[:2], dtype=np.uint8)
        
        for item in self.layout_data:
            x, y, w, h = item['bbox_px']
            pad = int(h * 0.05) + 3 # 패딩 미세 조정
            cv2.rectangle(mask, (x-pad, y-pad), (x+w+pad, y+h+pad), 255, -1)
            
        clean_bg = cv2.inpaint(self.img, mask, 3, cv2.INPAINT_TELEA)
        
        # 타임스탬프 적용된 파일명
        output_bg_name = f"clean_background_{self.timestamp}.png"
        cv2.imwrite(output_bg_name, clean_bg)
        print(f"✅ [Cleaning] 배경 저장: '{output_bg_name}'")
        return output_bg_name

    def step3_html_generation(self, bg_image_name):
        print("💻 [Coding] HTML 생성 (기하학 기반 폰트 계산)...")
        
        html_elements = []
        
        for item in self.layout_data:
            x, y, w, h = item['bbox_px']
            style = item['style']
            raw_text = item['text']
            
            # --- [핵심 로직 변경] 폰트 크기 기하학적 역산 ---
            # 1. 줄 수 계산 (최소 1줄)
            line_count = len(raw_text.split('\n'))
            if line_count == 0: line_count = 1
            
            # 2. 한 줄이 차지하는 높이(px) 계산
            single_line_height_px = h / line_count
            
            # 3. 폰트 크기는 줄 높이의 약 75%로 추정 (line-height 여백 고려)
            # (한글/영문에 따라 다르지만 통상 0.7~0.8 계수가 적절)
            calculated_font_size_px = single_line_height_px * 0.75
            
            # 4. 안전장치: 너무 작거나 큰 값 보정
            if calculated_font_size_px < 10: calculated_font_size_px = 10
            
            # 5. cqw 단위로 변환 (이미지 너비 기준 비율)
            font_size_cqw = (calculated_font_size_px / self.width) * 100
            # ----------------------------------------------

            # 좌표 % 변환
            left_pct = (x / self.width) * 100
            top_pct = (y / self.height) * 100
            width_pct = (w / self.width) * 100
            
            # HTML 텍스트 처리
            text_content = raw_text.replace('\n', '<br>')

            element_css = (
                f"position: absolute; "
                f"left: {left_pct:.2f}%; "
                f"top: {top_pct:.2f}%; "
                f"width: {width_pct:.2f}%; "
                f"color: {style.get('color', '#000000')}; "
                f"font-size: {font_size_cqw:.2f}cqw; " # 기하학 계산된 크기 적용
                f"font-weight: {style.get('font_weight', 'normal')}; "
                f"text-align: {style.get('align', 'left')}; "
                f"font-family: 'Apple SD Gothic Neo', sans-serif; "
                f"line-height: 1.3;" # 줄간격 고정 (계산 로직과 맞춤)
                f"white-space: normal;" # 줄바꿈 허용
                f"z-index: 10;"
            )
            
            div = f'<div class="slide-text" style="{element_css}">{text_content}</div>'
            html_elements.append(div)

        full_html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reconstructed Slide {self.timestamp}</title>
    <style>
        body {{
            margin: 0;
            padding: 0;
            background-color: #222;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }}
        .slide-wrapper {{
            width: 90vw;
            max-width: 1200px;
            container-type: inline-size;
            background: #000;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            border-radius: 8px;
        }}
        .slide-container {{
            position: relative;
            width: 100%;
            aspect-ratio: {self.width} / {self.height};
            background-image: url('{bg_image_name}');
            background-size: 100% 100%;
            background-repeat: no-repeat;
            overflow: hidden;
        }}
        .slide-text:hover {{
            outline: 1px dashed rgba(255,0,0,0.5);
            cursor: default;
        }}
    </style>
</head>
<body>
    <div class="slide-wrapper">
        <div class="slide-container">
            {''.join(html_elements)}
        </div>
    </div>
</body>
</html>"""
        
        output_file = f"reconstructed_slide_{self.timestamp}.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(full_html)
        print(f"✅ [Coding] HTML 저장: '{output_file}'")
        return output_file, bg_image_name

# --- 실행 로직 ---
print("📂 분석할 슬라이드 이미지 파일을 업로드해주세요.")
uploaded = files.upload()

if not uploaded:
    print("❌ 업로드된 파일이 없습니다.")
else:
    image_path = next(iter(uploaded))
    print(f"▶️ 처리 시작: {image_path}")

    try:
        # 블록 1에서 설정된 MODEL_NAME 사용 (없을 시 기본값)
        target_model = MODEL_NAME if 'MODEL_NAME' in globals() else 'gemini-3-flash-preview'
        
        reconstructor = SlideReconstructor(image_path, model_name=target_model)
        
        layout_data = reconstructor.step1_vision_analysis()
        
        if layout_data:
            bg_name = reconstructor.step2_background_cleaning()
            html_file, bg_file = reconstructor.step3_html_generation(bg_name)
            
            print("📥 결과물 다운로드 중...")
            files.download(html_file)
            files.download(bg_file)
            print("✅ 완료!")
        else:
            print("❌ 분석 데이터 없음.")
            
    except Exception as e:
        print(f"❌ 오류 발생: {e}")