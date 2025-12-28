import statistics
import os
from src.utils import get_logger

logger = get_logger(__name__)

class CodeGenerator:
    def __init__(self):
        pass

    def normalize_font_sizes(self, layout_data, image_width):
        """
        Groups similar font sizes and snaps them to the median value.
        """
        if not layout_data:
            return layout_data

        # 1. Calculate raw font sizes
        for item in layout_data:
            _, _, _, h = item['bbox_px']
            raw_text = item['text']
            line_count = len(raw_text.split('\n')) or 1
            single_line_height = h / line_count
            # Estimate font size (75% of line height)
            item['raw_font_size'] = single_line_height * 0.75

        # 2. Cluster
        # Simple clustering: Sort by size, if difference < 10%, group them.
        sorted_items = sorted(layout_data, key=lambda x: x['raw_font_size'])
        
        groups = []
        if sorted_items:
            current_group = [sorted_items[0]]
            
            for i in range(1, len(sorted_items)):
                prev = current_group[-1]
                curr = sorted_items[i]
                
                # Check percentage difference
                diff_pct = abs(curr['raw_font_size'] - prev['raw_font_size']) / prev['raw_font_size']
                
                if diff_pct < 0.15: # 15% tolerance
                    current_group.append(curr)
                else:
                    groups.append(current_group)
                    current_group = [curr]
            groups.append(current_group)

        # 3. Apply Median
        for group in groups:
            sizes = [x['raw_font_size'] for x in group]
            median_size = statistics.median(sizes)
            for item in group:
                item['normalized_font_size_px'] = median_size
                # Calculate cqw
                item['font_size_cqw'] = (median_size / image_width) * 100

        return layout_data

    def generate_html(self, layout_data, width, height, bg_image_path, output_path, normalize=True, font_family="Malgun Gothic"):
        logger.info(f"Generating HTML (with embedded BG): {output_path}")
        
        if normalize:
            layout_data = self.normalize_font_sizes(layout_data, width)
        
        # Read and encode background image
        import base64
        try:
            with open(bg_image_path, "rb") as img_file:
                b64_string = base64.b64encode(img_file.read()).decode('utf-8')
                # Guess mime type based on extension
                ext = os.path.splitext(bg_image_path)[1].lower()
                mime_type = "image/png" if ext == ".png" else "image/jpeg"
                bg_data_uri = f"data:{mime_type};base64,{b64_string}"
        except Exception as e:
            logger.error(f"Failed to embed background image: {e}")
            bg_data_uri = "" # Fallback to empty or placeholder

        html_elements = []
        
        for item in layout_data:
            x, y, w, h = item['bbox_px']
            style = item['style']
            raw_text = item['text']
            font_size_cqw = item.get('font_size_cqw', 2) # Fallback
            
            left_pct = (x / width) * 100
            top_pct = (y / height) * 100
            width_pct = (w / width) * 100
            # Add a buffer to width to prevent unexpected wrapping
            width_pct_buffered = width_pct * 1.05 
            
            # HTML Text Process
            text_content = raw_text.replace('\n', '<br>')
            
            element_css = (
                f"position: absolute; "
                f"left: {left_pct:.2f}%; "
                f"top: {top_pct:.2f}%; "
                f"width: {width_pct:.2f}%; "
                f"color: {style.get('color', '#000000')}; "
                f"font-size: {font_size_cqw:.2f}cqw; " # Geometrically calculated size
                f"font-weight: {style.get('font_weight', 'normal')}; "
                f"text-align: {style.get('align', 'left')}; "
                f"font-family: '{font_family}', sans-serif; "
                f"line-height: 1.3;" # Fixed line height matching calculation
                f"white-space: normal;" # Allow wrapping
                f"z-index: 10;"
            )
            
            div = f'<div class="slide-text" style="{element_css}">{text_content}</div>'
            html_elements.append(div)

        # Google Font / CDN Injection logic
        google_font_link = ""
        if "Noto Sans" in font_family:
            google_font_link = '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">'
        elif "Nanum" in font_family:
             google_font_link = '<link href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap" rel="stylesheet">'
        elif "Pretendard" in font_family:
            google_font_link = '<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />'

        # CSS Font Family Name Normalization
        # If user selected "Pretendard Medium", we use "Pretendard" for CSS family, 
        # but might want to enforce weight if we really wanted to. 
        # For now, let's just use the family name "Pretendard".
        css_font_family = font_family
        if "Pretendard" in font_family:
            css_font_family = "Pretendard"

        full_html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Slide Reconstructor Result</title>
    {google_font_link}
    <style>
        body {{
            margin: 0;
            padding: 0;
            background-color: #222;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: '{css_font_family}', sans-serif;
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
            aspect-ratio: {width} / {height};
            background-image: url('{bg_data_uri}');
            background-size: 100% 100%;
            background-repeat: no-repeat;
            overflow: hidden;
        }}
        .slide-text {{
            transition: outline 0.2s;
        }}
        .slide-text:hover {{
            outline: 1px dashed rgba(255, 255, 0, 0.7);
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
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_html)
        
        return output_path
