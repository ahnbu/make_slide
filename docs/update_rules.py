import os
import re

files = [
    r"d:\Vibe_Coding\make_slide\.agent\rules.md",
    r"d:\Vibe_Coding\make_slide\.agent\gemini.md"
]

# Regex to match the existing Path Usage bullet point, spanning multiple lines if needed
# Pattern: space* - **Path Usage**: .*? (until end of line or next bullet?)
# The previous rule was:
# - **Path Usage**: Do not include full absolute file paths in commit messages (e.g., `D:\path\to\file`). Use filenames or relative paths (e.g., `app.py`, `src/analyzer.py`) only.

pattern = r"[\t ]*-\s*\*\*Path Usage\*\*:.*?(?=\r?\n[\t ]*-|\Z)"

replacement = """    - **Path Usage**: Use **simple filenames only** (e.g., `main.js`). Do NOT use absolute paths, complex relative paths, or Markdown links (e.g., `[main.js](...)`). Keep it plain text."""

for file_path in files:
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Check if pattern exists (using DOTALL to match across lines if it wrapped, though likely single line)
            # Actually, let's assume it's one line or we match until newline.
            # My regex uses .*? which stops at newline by default without DOTALL.
            
            new_content, count = re.subn(pattern, replacement, content, flags=re.MULTILINE)
            
            if count > 0:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {file_path}")
            else:
                print(f"Pattern not found in {file_path}. Appending...")
                # If not found, append to finding "Git Workflow" section or just end?
                # Let's append to end of file as a fallback, but better to find "Commit Messages" section.
                # Find "### 3. Git Workflow" or similar?
                # Let's just append for now if not found, to ensure rule is present.
                with open(file_path, 'a', encoding='utf-8') as f:
                    f.write("\n" + replacement + "\n")
                print(f"Appended to {file_path}")

        except Exception as e:
            print(f"Error updating {file_path}: {e}")
    else:
        print(f"File not found: {file_path}")
