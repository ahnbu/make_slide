
# -*- coding: utf-8 -*-
import os
import io
from PIL import Image
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")

if not API_KEY:
    print("❌ Error: GOOGLE_API_KEY not found in .env")
    exit(1)

client = genai.Client(api_key=API_KEY)

# Use a test image (make sure one exists or update hardcoded path)
# We will use the uploaded file logic or a fixed path if available
# For this script, let's try to list files in test_result/ to pick one, or use a placeholder
import glob
test_files = glob.glob("test_result/*_bg_*.png") # Use an existing BG (even though it has artifacts) or original
if not test_files:
    # Try inputs
    test_files = glob.glob("input/*")

if not test_files:
    print("❌ Error: No test images found in input/ or test_result/")
    exit(1)

IMAGE_PATH = test_files[0]
print(f"🖼 Testing with image: {IMAGE_PATH}")

try:
    image = Image.open(IMAGE_PATH)
    
    # Model: Start with gemini-3-flash-preview as it's often more capable for multimodal generation than 1.5
    # or try the user suggested 'gemini-2.5-flash' if accessible.
    # Note: 'gemini-2.5-flash' might not support image output yet in public beta, but let's try as requested.
    MODEL_NAME = "gemini-3-flash-preview" 
    
    print(f"🤖 User Prompt: Remove all text using model {MODEL_NAME}...")
    
    prompt = "Remove all text from this image completely. Fill the text areas with matching background seamlessly. Keep everything else identical."

    # Need to check if response_modalities is supported in this SDK version's types
    # or just try without any config regarding mime type first.
    # The user example used: response_modalities=["TEXT", "IMAGE"]
    
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
             response_modalities=["TEXT", "IMAGE"]
        )
    )
    
    # Check for image parts
    # Note: Google GenAI SDK handles image output differently depending on model version.
    # Usually it's in response.parts as inline_data or distinct implementation.
    
    print("Response received.")
    # print(response.text) # Check if it returned text describing the image instead
    
    # If the model does not support native image generation, this will likely fail or return text.
    # Imagen is separate.
    
    # Let's inspect capabilities
    if response.candidates and response.candidates[0].content.parts:
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                 print("✅ Image data found in response!")
                 # Save
                 img_data = part.inline_data.data
                 output_img = Image.open(io.BytesIO(img_data))
                 output_img.save("test_gemini_removal_result.png")
                 print("Saved to test_gemini_removal_result.png")
            else:
                 print(f"Text response: {part.text}")

except Exception as e:
    print(f"❌ Error: {e}")
    print("\n💡 Tip: Gemini Flash might not support 'Text-to-Image' editing directly without Vertex AI Imagen or specific endpoint.")
