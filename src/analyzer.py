import os
import json
from PIL import Image
from google import genai
from google.genai import types
from src.utils import get_logger

logger = get_logger(__name__)

class Analyzer:
    def __init__(self, model_name='gemini-3-flash-preview'):
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is not set")
        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name

    def refine_layout(self, image_path, initial_layout_data):
        logger.info(f"Refining layout with visual feedback loop using {self.model_name}...")
        try:
            pil_image = Image.open(image_path)
            
            # Convert JSON to string for prompt
            layout_str = json.dumps(initial_layout_data, ensure_ascii=False)
            
            prompt_text = f"""
            You are a Design QA Expert. Perform a visual quality check on the provided Layout Data against the Original Image.
            
            **Input Data**:
            {layout_str}
            
            **Goal**: Improve the accuracy of text bounding boxes and visual hierarchy.
            
            **Instructions**:
            1. **Compare**: Look at the image and the provided bounding boxes (normalized 0-1000: [ymin, xmin, ymax, xmax]).
            2. **Fix Position**: If a box is slightly off, too large, or cuts off text, adjust the coordinates.
            3. **Fix Content**: If 'text' has typos compared to the image, correct them.
            4. **Strict Format**: Return ONLY the corrected JSON list. Do not explain.
            """

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt_text, pil_image],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            
            refined_data = json.loads(response.text.strip())
            
            # --- Logging Improvements ---
            changes_count = 0
            details = []
            
            # Simple matching by index assuming order is preserved or similar
            # Ideally we should match by content overlap, but for now index/text similarity
            for i, refined_item in enumerate(refined_data):
                if i < len(initial_layout_data):
                    init_item = initial_layout_data[i]
                    
                    # Check text change
                    if refined_item.get('text') != init_item.get('text'):
                        changes_count += 1
                        details.append(f"Text corrected: '{init_item.get('text')[:20]}...' -> '{refined_item.get('text')[:20]}...'")
                    
                    # Check bbox change (simple tolerance)
                    r_bbox = refined_item.get('bbox', [])
                    i_bbox = init_item.get('bbox', [])
                    if r_bbox and i_bbox and r_bbox != i_bbox:
                         # Calculate shift magnitude
                         diff = sum([abs(r - i) for r, i in zip(r_bbox, i_bbox)])
                         if diff > 10: # Ignore negligible changes (normalized 0-1000)
                            changes_count += 1
                            details.append(f"BBox adjusted: {i_bbox} -> {r_bbox} (Diff: {diff})")
            
            logger.info(f"Refined {len(refined_data)} text blocks. Total Corrections: {changes_count}")
            if changes_count > 0:
                for d in details[:5]: # Log top 5 changes
                    logger.info(f"   - {d}")
            if changes_count > 5:
                logger.info(f"   - ... and {changes_count - 5} more changes.")
                
            return refined_data
            
        except Exception as e:
            logger.warning(f"Refinement failed, returning initial data: {e}")
            return initial_layout_data

    def convert_to_pixels(self, layout_data, width, height):
        for item in layout_data:
            if 'bbox_px' not in item:
                ymin, xmin, ymax, xmax = item['bbox']
                item['bbox_px'] = [
                    int((xmin / 1000) * width),    # x
                    int((ymin / 1000) * height),   # y
                    int(((xmax - xmin) / 1000) * width), # w
                    int(((ymax - ymin) / 1000) * height) # h
                ]
        return layout_data

    def detect_initial_layout(self, image_path):
        logger.info(f"Detecting initial layout: {image_path}")
        pil_image = Image.open(image_path)
        width, height = pil_image.size
        
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

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt_text, pil_image],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
        except Exception as e:
            error_msg = str(e)
            # Model mismatch error capture (Google API error message pattern matching)
            if "404" in error_msg or "Not Found" in error_msg or "Publisher Model" in error_msg:
                logger.error(f"Model '{self.model_name}' not found.")
                raise ValueError(f"오류: 설정된 모델 '{self.model_name}'을 찾을 수 없습니다. settings.json에서 모델명을 최신으로 변경해주세요.")
            raise e
        
        initial_layout_data = json.loads(response.text.strip())
        logger.info(f"Initial detection: {len(initial_layout_data)} text blocks.")
        return initial_layout_data, width, height

    def analyze_image_v2(self, image_path, exclude_text=None):
        """
        Legacy wrapper for full analysis pipeline (Forced Update V2)
        """
        try:
            # 1. Initial Detection
            initial_data, width, height = self.detect_initial_layout(image_path)
            
            # 2. Feedback Loop
            refined_data = self.refine_layout(image_path, initial_data)
            
            # 3. Pixel Conversion
            final_data = self.convert_to_pixels(refined_data, width, height)
            logger.info("DEBUG: Finished convert_to_pixels")
            
            # 4. Text Exclusion Logic
            # Always check for 'notebooklm' watermark by default
            default_exclusions = ['notebooklm']
            
            # Add user-defined exclusions if any
            user_exclusions = []
            if exclude_text:
                user_exclusions = [t.strip().replace(" ", "").lower() for t in exclude_text.split(',') if t.strip()]
            
            # Merge unique
            target_keywords = list(set(default_exclusions + user_exclusions))
            logger.info(f"DEBUG: target_keywords = {target_keywords}")
            
            if target_keywords:
                logger.info(f"Applying text exclusion. Keywords: {target_keywords}")
                filtered_data = []
                for item in final_data:
                    text_content = item.get('text', '').replace(" ", "").lower()
                    bbox = item.get('bbox', [0, 0, 0, 0])
                    ymin, xmin, ymax, xmax = bbox
                    
                    should_exclude = False
                    for keyword in target_keywords:
                        if keyword in text_content:
                            # Special handling for NotebookLM watermark
                            if keyword == 'notebooklm':
                                # Check position: Bottom 10% (ymin > 900) AND Right 20% (xmin > 800)
                                # Note: 'bbox' uses normalized coordinates (0-1000), so 900 = 90%, 800 = 80%.
                                # This ensures it works across different image resolutions.
                                is_bottom_right = (ymin > 900) and (xmin > 800)
                                if is_bottom_right:
                                    should_exclude = True
                                    logger.info(f"Detected NotebookLM Watermark at [{ymin}, {xmin}]. Removing.")
                                    break 
                                else:
                                    # It matches 'notebooklm' but is NOT in the footer -> Keep it (Body text)
                                    pass 
                            else:
                                # Generic exclusion for other user-defined keywords (Apply strict removal)
                                should_exclude = True
                                break

                    if not should_exclude:
                        filtered_data.append(item)
                    elif should_exclude and keyword != 'notebooklm': # Log generic exclusions
                         logger.info(f"Excluded text block: '{item.get('text')}' (Matched '{keyword}')")
                
                final_data = filtered_data
            
            return final_data, width, height

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            raise e
    def apply_text_exclusion(self, layout_data, exclude_text=None):
        # Always check for 'notebooklm' watermark by default
        default_exclusions = ['notebooklm']
        
        # Add user-defined exclusions if any
        user_exclusions = []
        if exclude_text:
            user_exclusions = [t.strip().replace(" ", "").lower() for t in exclude_text.split(',') if t.strip()]
        
        # Merge unique
        target_keywords = list(set(default_exclusions + user_exclusions))
        
        if target_keywords:
            logger.info(f"Applying text exclusion. Keywords: {target_keywords}")
            filtered_data = []
            for item in layout_data:
                text_content = item.get('text', '').replace(" ", "").lower()
                bbox = item.get('bbox', [0, 0, 0, 0])
                ymin, xmin, ymax, xmax = bbox
                
                should_exclude = False
                for keyword in target_keywords:
                    if keyword in text_content:
                        # Special handling for NotebookLM watermark
                        if keyword == 'notebooklm':
                            # Check position: Bottom 10% (ymin > 900) AND Right 20% (xmin > 800)
                            is_bottom_right = (ymin > 900) and (xmin > 800)
                            if is_bottom_right:
                                should_exclude = True
                                logger.info(f"Detected NotebookLM Watermark at [{ymin}, {xmin}]. Removing.")
                                break 
                            else:
                                pass 
                        else:
                            should_exclude = True
                            break

                if not should_exclude:
                    filtered_data.append(item)
                elif should_exclude and keyword != 'notebooklm':
                        logger.info(f"Excluded text block: '{item.get('text')}' (Matched '{keyword}')")
            
            return filtered_data
        
        return layout_data
