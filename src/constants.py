
import os

# System Defaults
DEFAULT_FONT = "Malgun Gothic"
DEFAULT_VISION_MODEL = "gemini-3-flash-preview"
DEFAULT_INPAINTING_MODEL = "opencv-telea"
DEFAULT_CODEGEN_MODEL = "algorithmic"
DEFAULT_MAX_CONCURRENT = 15
DEFAULT_OUTPUT_FORMAT = "both"

# Default Settings (Mirroring app.py structure for fallback)
DEFAULT_SETTINGS = {
    "common": {
        "exclude_text": ""
    },
    "reconstruct": {
        "vision_model": DEFAULT_VISION_MODEL,
        "inpainting_model": DEFAULT_INPAINTING_MODEL,
        "codegen_model": DEFAULT_CODEGEN_MODEL,
        "output_format": DEFAULT_OUTPUT_FORMAT,
        "max_concurrent": DEFAULT_MAX_CONCURRENT,
        "font_family": DEFAULT_FONT,
        "refine_layout": False
    },
    # ... other sections can be added as needed or accessed from here
}
