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

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=[prompt_text, pil_image],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        initial_layout_data = json.loads(response.text.strip())
        logger.info(f"Initial detection: {len(initial_layout_data)} text blocks.")
        return initial_layout_data, width, height

    def analyze_image(self, image_path):
        """
        Legacy wrapper for full analysis pipeline
        """
        try:
            # 1. Initial Detection
            initial_data, width, height = self.detect_initial_layout(image_path)
            
            # 2. Feedback Loop
            refined_data = self.refine_layout(image_path, initial_data)
            
            # 3. Pixel Conversion
            final_data = self.convert_to_pixels(refined_data, width, height)
            
            return final_data, width, height

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            raise e
