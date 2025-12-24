import cv2
import numpy as np
import os
from src.utils import get_logger

logger = get_logger(__name__)

class ImageProcessor:
    def __init__(self):
        pass

    def create_clean_background(self, image_path, layout_data, output_path):
        logger.info(f"Processing background for: {image_path}")
        
        # Read image
        # cv2 handles korean paths poorly, so we read as byte stream
        stream = open(image_path, "rb")
        bytes = bytearray(stream.read())
        numpyarray = np.asarray(bytes, dtype=np.uint8)
        img = cv2.imdecode(numpyarray, cv2.IMREAD_UNCHANGED)
        
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")
            
        if img.shape[2] == 4:
             img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
             
        height, width = img.shape[:2]
        mask = np.zeros((height, width), dtype=np.uint8)
        
        # Create Mask with Padding (Logic from colab_success.py)
        for item in layout_data:
            x, y, w, h = item['bbox_px']
            # Proportional padding based on height (Crucial for correct coverage)
            pad = int(h * 0.05) + 3 
            cv2.rectangle(mask, (x-pad, y-pad), (x+w+pad, y+h+pad), 255, -1)

        # Dilate slightly to smooth edges (not too aggressive)
        kernel = np.ones((3, 3), np.uint8)
        dilated_mask = cv2.dilate(mask, kernel, iterations=2)
        
        # Inpaint with Telea, Radius 3 (Standard)
        clean_bg = cv2.inpaint(img, dilated_mask, 3, cv2.INPAINT_TELEA)
        
        # Save result
        cv2.imwrite(output_path, clean_bg)
        logger.info(f"Clean background saved to: {output_path}")
        
        return output_path
