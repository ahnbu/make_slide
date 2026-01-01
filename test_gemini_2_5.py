
import os
import google.genai as genai
from google.genai import types
from dotenv import load_dotenv

# Load env to get key
load_dotenv()

api_key = os.environ.get("GOOGLE_API_KEY")

if not api_key:
    print("Error: GOOGLE_API_KEY not found in environment.")
    exit(1)

client = genai.Client(api_key=api_key)

model_name = "gemini-2.5-flash"

print(f"Testing model: {model_name}...")

try:
    response = client.models.generate_content(
        model=model_name,
        contents="Explain how AI works in a few words"
    )
    print("\n--- Success! Model Response ---")
    print(response.text)
    print("-------------------------------")

except Exception as e:
    print(f"\nError: Model test failed. {e}")
