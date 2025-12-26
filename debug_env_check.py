import os
from dotenv import load_dotenv

# 1. Check BEFORE loading .env (System Env)
print(f"1. System Env Key: {os.environ.get('GOOGLE_API_KEY', 'Not Set')[:10]}...")

# 2. Load .env with default settings
load_dotenv()
print(f"2. After load_dotenv(): {os.environ.get('GOOGLE_API_KEY', 'Not Set')[:10]}...")

# 3. Load .env with override=True
load_dotenv(override=True)
print(f"3. After load_dotenv(override=True): {os.environ.get('GOOGLE_API_KEY', 'Not Set')[:10]}...")
