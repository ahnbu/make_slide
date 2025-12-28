import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from dotenv import load_dotenv
import asyncio

from src.analyzer import Analyzer
from src.image_processor import ImageProcessor
from src.code_generator import CodeGenerator
from src.pptx_generator import PPTXGenerator
from src.utils import generate_timestamp, ensure_directory, get_logger
from datetime import datetime
import json
import uuid

load_dotenv(override=True)
logger = get_logger(__name__)

app = FastAPI(title="Slide Reconstructor")

# Directory Setup
# Directory Setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, "input")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")

for d in [INPUT_DIR, OUTPUT_DIR, STATIC_DIR, TEMPLATES_DIR, UPLOAD_DIR]:
    ensure_directory(d)

# Mount Static & Templates
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Default Settings
DEFAULT_SETTINGS = {
    "vision_model": "gemini-3-flash-preview",
    "inpainting_model": "opencv-telea",
    "codegen_model": "algorithmic",
    "output_format": "both"
}

SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")

def load_settings():
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
    return DEFAULT_SETTINGS.copy()

def save_settings_to_file(settings):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False

# Initialize Core Modules
current_settings = load_settings()
analyzer = Analyzer(model_name=current_settings["vision_model"])
image_processor = ImageProcessor()
code_generator = CodeGenerator()
pptx_generator = PPTXGenerator()

@app.get("/settings")
async def get_settings():
    return JSONResponse(load_settings())

@app.post("/settings")
async def update_settings(request: Request):
    new_settings = await request.json()
    save_settings_to_file(new_settings)
    
    # Update active analyzer implementation if vision model changed
    if "vision_model" in new_settings:
        analyzer.model_name = new_settings["vision_model"]
        
    return JSONResponse({"status": "success", "settings": new_settings})


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Progress tracking storage (Simple in-memory for demo)
progress_store = {}

@app.get("/progress/{task_id}")
async def progress_stream(task_id: str):
    async def event_generator():
        while True:
            if task_id in progress_store:
                data = progress_store[task_id]
                yield f"data: {json.dumps(data)}\n\n"
                if data['status'] in ['complete', 'error']:
                    break
            await asyncio.sleep(0.5)
            
            # Timeout/Cleanup logic could be added here
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    vision_model: str = Form("gemini-3-flash-preview"),
    inpainting_model: str = Form("opencv-telea"),
    codegen_model: str = Form("algorithmic"),
    batch_folder: str = Form("single"),
    max_concurrent: int = Form(3), # Receive concurrency setting
    exclude_text: str = Form(None),
    font_family: str = Form("Malgun Gothic") # Default font
):
    # Dynamic Concurrency Update (Runtime)
    global MAX_CONCURRENT_TASKS, semaphore
    if max_concurrent != MAX_CONCURRENT_TASKS:
        MAX_CONCURRENT_TASKS = max_concurrent
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)
        logger.info(f"Runtime Concurrency Updated to: {MAX_CONCURRENT_TASKS}")

    timestamp = generate_timestamp()
    task_id = str(uuid.uuid4()) # Use UUID for unique task tracking
    
    original_name = os.path.splitext(file.filename)[0]
    ext = os.path.splitext(file.filename)[1]
    input_filename = f"{original_name}_{timestamp}{ext}"
    
    # SAVE DIRECTLY TO OUTPUT DIR (User Request)
    target_dir = os.path.join(OUTPUT_DIR, batch_folder)
    ensure_directory(target_dir)
    input_path = os.path.join(target_dir, input_filename)
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    logger.info(f"File uploaded to Output Dir: {input_path}")
    
    # Initialize progress
    progress_store[task_id] = {"status": "starting", "message": "Starting process...", "percent": 0}

    # Run processing in background
    logger.info(f"Adding background task for {task_id}")
    background_tasks.add_task(
        process_slide_task, 
        task_id, 
        input_path, 
        original_name, 
        vision_model, 
        inpainting_model, 
        codegen_model,
        batch_folder,
        exclude_text,
        font_family
    )

    return JSONResponse({"status": "processing", "task_id": task_id})

# Concurrency Limit
MAX_CONCURRENT_TASKS = int(current_settings.get("max_concurrent", 3))
semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)

# Cancellation Store
cancelled_tasks = set()

# Pause Control
pause_event = asyncio.Event()
pause_event.set() # Initially True (Running)

@app.post("/pause")
async def pause_processing():
    pause_event.clear()
    logger.info(" Global Processing PAUSED")
    return JSONResponse({"status": "paused"})

@app.post("/resume")
async def resume_processing():
    pause_event.set()
    logger.info(" Global Processing RESUMED")
    return JSONResponse({"status": "resumed"})

async def wait_if_paused(task_id):
    """
    Checks if global pause is active. If so, waits until resumed.
    Also handles cancellation during pause.
    """
    if not pause_event.is_set():
        logger.info(f"Task {task_id} entering PAUSE state...")
        
        # Save previous state to restore later if needed, or just update to paused
        if task_id in progress_store:
             progress_store[task_id]['status'] = 'paused'
             progress_store[task_id]['message'] = "⏸️ 일시정지됨 (재개 대기 중...)"
        
        while not pause_event.is_set():
            if task_id in cancelled_tasks:
                return # Exit loop to handle cancellation in main flow
            await asyncio.sleep(0.5)
        
        logger.info(f"Task {task_id} RESUMING...")
        if task_id in progress_store and task_id not in cancelled_tasks:
             progress_store[task_id]['status'] = 'processing'

@app.post("/cancel/{task_id}")
async def cancel_task(task_id: str):
    cancelled_tasks.add(task_id)
    # Also update progress immediately to stop frontend polling if possible
    if task_id in progress_store:
        progress_store[task_id]["status"] = "cancelled"
        progress_store[task_id]["message"] = "작업이 취소되었습니다."
    return JSONResponse({"status": "cancelled"})

    return JSONResponse({"status": "cancelled"})

async def process_combine_task(task_id, source_path, bg_path, original_name, vision_model, codegen_model, batch_folder, font_family="Malgun Gothic", refine_layout=False, exclude_text=None):
    async with semaphore:
        if task_id in cancelled_tasks:
            cancelled_tasks.discard(task_id)
            return

        logger.info(f"Starting process_combine_task for {task_id} (Refine: {refine_layout})")
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        ensure_directory(target_dir)

        try:
             await wait_if_paused(task_id)
             if task_id in cancelled_tasks: return
             
             # 1. Analyze Source
             # Update model
             analyzer.model_name = vision_model
             
             file_id = generate_timestamp()
             
             progress_store[task_id] = {"status": "processing", "message": "[1단계] 원본 텍스트 분석 중...", "percent": 20}
             
             # 1.1 Initial Detection
             layout_data, width, height = await asyncio.to_thread(analyzer.detect_initial_layout, source_path)
             
             # 1.2 Refinement (Optional)
             if refine_layout:
                 progress_store[task_id] = {"status": "processing", "message": "[1.5단계] 정밀 분석 (Refinement) 수행 중...", "percent": 40}
                 layout_data = await asyncio.to_thread(analyzer.refine_layout, source_path, layout_data)
             
             # 1.3 Pixel Convert
             layout_data = analyzer.convert_to_pixels(layout_data, width, height)
             
             # 1.4 Normalize
             layout_data = code_generator.normalize_font_sizes(layout_data, width)
             
             # 1.5 Text Exclusion (Fix for Watermark)
             # Use provided exclude_text or default
             if not exclude_text:
                 exclude_text = "NotebookLM, 워터마크" # Default as per user request
             
             full_layout_data = layout_data
             filtered_layout_data = analyzer.apply_text_exclusion(layout_data, exclude_text)
             
             # Save JSON
             json_filename = f"{original_name}_layout_{file_id}.json"
             # Also save as filtered for PPTX batch compatibility logic
             json_filename_filtered = f"{original_name}_layout_{file_id}_filtered.json"
             
             json_path = os.path.join(target_dir, json_filename)
             with open(json_path, "w", encoding="utf-8") as f:
                 json.dump(full_layout_data, f, indent=4, ensure_ascii=False)
                 
             json_path_filtered = os.path.join(target_dir, json_filename_filtered)
             with open(json_path_filtered, "w", encoding="utf-8") as f:
                 json.dump(filtered_layout_data, f, indent=4, ensure_ascii=False)

             await wait_if_paused(task_id) 
             if task_id in cancelled_tasks: return

             # Step 2: Skip Inpainting, Use Provided BG
             # Fix for PPTX Size: Resize Provided BG to Match Source Dimensions
             # User reported text size issues in batch. Batch uses BG image size. 
             # If BG size != Source Size, Layout (based on Source) is mismatched.
             # We must resize BG to Source (width, height).
             
             final_bg_filename = f"{original_name}_bg_{file_id}.png"
             final_bg_path = os.path.join(target_dir, final_bg_filename)
             
             # Resize logic using PIL in thread
             def resize_bg(src_bg, target_w, target_h, dest_path):
                 from PIL import Image
                 with Image.open(src_bg) as img:
                     msg_log = f"Resizing BG from {img.size} to ({target_w}, {target_h})"
                     img_resized = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
                     img_resized.save(dest_path)
                     return msg_log

             msg = await asyncio.to_thread(resize_bg, bg_path, width, height, final_bg_path)
             logger.info(msg)
             
             # Step 3: Generate HTML
             progress_store[task_id] = {"status": "processing", "message": "[2단계] HTML 생성 중...", "percent": 60}
             html_filename = f"{original_name}_slide_{file_id}.html"
             html_path = os.path.join(target_dir, html_filename)
             
             await asyncio.to_thread(code_generator.generate_html, filtered_layout_data, width, height, final_bg_path, html_path, normalize=False, font_family=font_family)

             # Step 4: Generate PPTX
             progress_store[task_id] = {"status": "processing", "message": "[3단계] PPTX 생성 중...", "percent": 80}
             
             # Check settings
             current_settings_local = load_settings() 
             output_fmt = current_settings_local.get("output_format", "both")
             
             pptx_url = None
             if output_fmt in ["pptx", "both"]:
                  pptx_filename = f"{original_name}_slide_{file_id}.pptx"
                  pptx_path = os.path.join(target_dir, pptx_filename)
                  pptx_gen_single = PPTXGenerator()
                  pptx_gen_single.add_slide(filtered_layout_data, final_bg_path, width, height, font_family=font_family)
                  pptx_gen_single.save(pptx_path)
                  pptx_url = f"/output/{batch_folder}/{pptx_filename}"

             # Complete
             progress_store[task_id] = {
                "status": "complete", 
                "message": "[완료] 조합 작업이 끝났습니다.", 
                "percent": 100,
                "data": {
                    "html_url": f"/output/{batch_folder}/{html_filename}",
                    "bg_url": f"/output/{batch_folder}/{final_bg_filename}",
                    "pptx_url": pptx_url
                }
            }
             
        except Exception as e:
            logger.error(f"Combine Task Error: {e}")
            progress_store[task_id] = {"status": "error", "message": str(e), "percent": 0}

async def process_slide_task(task_id, input_path, original_name, vision_model, inpainting_model, codegen_model, batch_folder, exclude_text=None, font_family="Malgun Gothic"):
    async with semaphore:
        if task_id in cancelled_tasks:
            logger.info(f"Task {task_id} cancelled before starting.")
            cancelled_tasks.discard(task_id)
            return

        logger.info(f"Starting process_slide_task for {task_id} with model {vision_model} (Active Tasks: {MAX_CONCURRENT_TASKS - semaphore._value})")
        
        # Determine Output Directory
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        ensure_directory(target_dir)
        
        try:
            await wait_if_paused(task_id) # Check pause at start
            if task_id in cancelled_tasks: return

            current_vision_model = vision_model
            if "gemini-2.5-flash-image" in vision_model:
                 pass 
                 
            # Update model name
            analyzer.model_name = current_vision_model
            logger.info(f"Analyzer model set to: {analyzer.model_name}")

            # Generate timestamp ID for filenames (User preferred)
            file_id = generate_timestamp()

            # Step 1: Layout Analysis (Split for Pause support)
            progress_store[task_id] = {"status": "processing", "message": "[1단계 of 4단계] 이미지 레이아웃 1차 분석 중...", "percent": 10}
            
            # Check Cancellation
            if task_id in cancelled_tasks:
                logger.info(f"Task {task_id} cancelled during Step 1.")
                cancelled_tasks.discard(task_id)
                progress_store[task_id] = {"status": "cancelled", "message": "사용자에 의해 작업이 취소되었습니다.", "percent": 0}
                return

            # 1.1 Initial Detection
            layout_data, width, height = await asyncio.to_thread(analyzer.detect_initial_layout, input_path)
            logger.info(f"Initial Analysis complete for {task_id}. Width: {width}, Height: {height}")

            # --- PAUSE CHECK (User Request: Pause between calls) ---
            await wait_if_paused(task_id) 
            if task_id in cancelled_tasks:
                 progress_store[task_id] = {"status": "cancelled", "message": "취소됨", "percent": 0}
                 return
            # -------------------------------------------------------

            progress_store[task_id] = {"status": "processing", "message": "[2단계 of 4단계] 디자인 전문가 피드백 루프 수행 중...", "percent": 30}

            # 1.2 Refinement (Feedback Loop)
            layout_data = await asyncio.to_thread(analyzer.refine_layout, input_path, layout_data)
            
            # 1.3 Pixel Conversion
            layout_data = analyzer.convert_to_pixels(layout_data, width, height)
            
            # --- Pre-Normalize Layout (New Step) ---
            # Ensure HTML and PPTX usage consistent font sizes
            layout_data = code_generator.normalize_font_sizes(layout_data, width)
            
            # 1.4 Text Exclusion Strategy
            # Strategy: We need FULL layout for Inpainting (to erase the watermark pixels)
            #           But FILTERED layout for Generation (to not re-render the watermark text)
            full_layout_data = layout_data
            filtered_layout_data = analyzer.apply_text_exclusion(layout_data, exclude_text)
            
            # Save things
            # 1. Save FULL Original Layout (for debugging and inpainting reference)
            json_filename_raw = f"{original_name}_layout_{file_id}.json"
            json_path_raw = os.path.join(target_dir, json_filename_raw)
            with open(json_path_raw, "w", encoding="utf-8") as f:
                json.dump(full_layout_data, f, indent=4, ensure_ascii=False)

            # 2. Save FILTERED Layout (which is used for generation)
            json_filename_filtered = f"{original_name}_layout_{file_id}_filtered.json"
            json_path_filtered = os.path.join(target_dir, json_filename_filtered)
            with open(json_path_filtered, "w", encoding="utf-8") as f:
                json.dump(filtered_layout_data, f, indent=4, ensure_ascii=False)
                
            # Check Cancellation
            if task_id in cancelled_tasks:
                logger.info(f"Task {task_id} cancelled before Step 2.")
                cancelled_tasks.discard(task_id)
                progress_store[task_id] = {"status": "cancelled", "message": "사용자에 의해 작업이 취소되었습니다.", "percent": 0}
                return
            
            await wait_if_paused(task_id) # PAUSE CHECK
            if task_id in cancelled_tasks: return

            # Step 2: Inpaint
            progress_store[task_id] = {"status": "processing", "message": "[3단계 of 4단계] 텍스트 제거 및 배경 복원 중...", "percent": 60}
            bg_filename = f"{original_name}_bg_{file_id}.png"
            bg_path = os.path.join(target_dir, bg_filename) 
            
            # Run blocking inpainting in thread pool
            # CRITICAL: Use full_layout_data here to ensure Watermarks are ERASED from background
            await asyncio.to_thread(image_processor.create_clean_background, input_path, full_layout_data, bg_path)
            
            # Check Cancellation
            if task_id in cancelled_tasks:
                logger.info(f"Task {task_id} cancelled before Step 3.")
                cancelled_tasks.discard(task_id)
                progress_store[task_id] = {"status": "cancelled", "message": "사용자에 의해 작업이 취소되었습니다.", "percent": 0}
                return

            await wait_if_paused(task_id) # PAUSE CHECK
            if task_id in cancelled_tasks: return

            # Step 3: Generate HTML
            progress_store[task_id] = {"status": "processing", "message": "[4단계 of 4단계] HTML 코드 생성 중...", "percent": 80}
            html_filename = f"{original_name}_slide_{file_id}.html"
            html_path = os.path.join(target_dir, html_filename)
            # bg_url = bg_filename # No longer used for generation, only for return
            
            # Run blocking HTML generation in thread pool
            # Now passing bg_path (absolute) instead of relative filename
            # normalize=False because we already did it
            # USE FILTERED LAYOUT
            # PASS FONT FAMILY
            await asyncio.to_thread(code_generator.generate_html, filtered_layout_data, width, height, bg_path, html_path, normalize=False, font_family=font_family)
            
            # Log execution
            log_execution(original_name, current_vision_model, inpainting_model, codegen_model)

            # --- PPTX Generation (New Step) ---
            # Check settings for output format
            # We can reload settings or use what was passed? 
            # ideally we should have passed it, but for now let's load or assume "both" if not present
            # But wait, app.py has `current_settings` global? No, it loads at top.
            # Best is to reload settings here or pass it. 
            # Let's read from the settings file to be sure (since user might have changed it)
            # Or better, read from global since we update it.
            # actually `process_slide_task` is async background.
            
            # Let's read the latest settings safely
            current_settings_local = load_settings() 
            output_fmt = current_settings_local.get("output_format", "both")
            
            pptx_url = None
            if output_fmt in ["pptx", "both"]:
                try:
                    progress_store[task_id]["message"] = "[추가 작업] PPTX 생성 중..."
                    
                    pptx_filename = f"{original_name}_slide_{file_id}.pptx"
                    pptx_path = os.path.join(target_dir, pptx_filename)
                    
                    # Need original width/height. We have them from Step 1.
                    # layout_data, width, height
                    
                    pptx_gen_single = PPTXGenerator()
                    # We need to recreate the generator or use a method that adds one slide and saves.
                    # Current PPTXGenerator is designed for multi-slide if we call add_slide multiple times.
                    # Here we just want one slide.
                    
                    # USE FILTERED LAYOUT
                    # PASS FONT FAMILY
                    pptx_gen_single.add_slide(filtered_layout_data, bg_path, width, height, font_family=font_family)
                    pptx_gen_single.save(pptx_path)
                    
                    pptx_url = f"/output/{batch_folder}/{pptx_filename}"
                    logger.info(f"PPTX generated: {pptx_path}")
                    
                except Exception as e:
                    logger.error(f"Failed to generate single PPTX: {e}")
                    # Don't fail the whole task for this optional step


            # Complete
            progress_store[task_id] = {
                "status": "complete", 
                "message": "[완료] 모든 작업 처리가 끝났습니다.", 
                "percent": 100,
                "data": {
                    "html_url": f"/output/{batch_folder}/{html_filename}",
                    "bg_url": f"/output/{batch_folder}/{bg_filename}",
                    "preview_url": f"/output/{batch_folder}/{html_filename}",
                    "pptx_url": pptx_url
                }
            }

        except Exception as e:
            logger.error(f"Processing error: {str(e)}")
            progress_store[task_id] = {"status": "error", "message": str(e), "percent": 0}

def log_execution(filename, vision, inpaint, codegen):
    try:
        log_dir = os.path.join(BASE_DIR, "logs")
        ensure_directory(log_dir)
        log_file = os.path.join(log_dir, "execution_log.txt")
        
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] File: {filename} | Vision: {vision} | Inpaint: {inpaint} | CodeGen: {codegen}\n"
        
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_entry)
            
        logger.info(f"Execution logged to {log_file}")
    except Exception as e:
        logger.error(f"Failed to write execution log: {e}")

@app.post("/remove-text")
async def remove_text(
    file: UploadFile = File(...), 
    vision_model: str = Form("gemini-3-flash-preview"),
    inpainting_model: str = Form("opencv-telea"),
    batch_folder: str = Form("single")
):
    try:
        timestamp = generate_timestamp()
        original_name = os.path.splitext(file.filename)[0]
        ext = os.path.splitext(file.filename)[1]
        input_filename = f"{original_name}_{timestamp}{ext}"
        
        # Save to Output Dir directly
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        ensure_directory(target_dir)
        input_path = os.path.join(target_dir, input_filename)
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
          # 1. Analyze
        # Pass exclude_text to analyzer
        # FORCE NEW METHOD CALL
        import sys
        if 'src.analyzer' in sys.modules:
             logger.info(f"DEBUG: Analyzer loaded from {sys.modules['src.analyzer'].__file__}")
        
        analyzer.model_name = vision_model # Keep this line as it sets the model for the analyzer instance
        layout_data, width, height = analyzer.analyze_image_v2(input_path, exclude_text) # Changed to analyze_image_v2 and passed exclude_text
        
        # target_dir already defined above

        bg_filename = f"{original_name}_bg_only_{timestamp}.png"
        bg_path = os.path.join(target_dir, bg_filename)
        
        image_processor.create_clean_background(input_path, layout_data, bg_path)
        
        return JSONResponse({
            "status": "success",
            "data": {
                "bg_url": f"/output/{batch_folder}/{bg_filename}"
            }
        })
    except Exception as e:
        logger.error(f"Remove Text Error: {e}")
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.post("/remove-text-ai")
async def remove_text_ai(
    file: UploadFile = File(...), 
    vision_model: str = Form("gemini-3-flash-preview"), # Use 3.0 flash preview
    batch_folder: str = Form("single")
):
    try:
        timestamp = generate_timestamp()
        original_name = os.path.splitext(file.filename)[0]
        ext = os.path.splitext(file.filename)[1]
        input_filename = f"{original_name}_{timestamp}{ext}"
        
        # Save to Output Dir
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        ensure_directory(target_dir)
        input_path = os.path.join(target_dir, input_filename)
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Use simple client to ask for clean text (No layout needed theoretically but we use analyzer for now? No, direct prompt)
        # But wait, original code likely used analyzer or direct call. I should keep original logic but update path.
        # Original code used `process_remove_text_ai` or similar. Let's check context.
        # Assuming removing text uses analyzer.
        
        analyzer.model_name = vision_model
        # ... (rest of logic) ...
        # logic below depends on input_path.
        
        # Just update path setup above.
        pass
        
        # The surrounding code is not fully visible so I will substitute blindly but carefully.
        # Wait, the tool requires EXACT match. I can't guess.
        # I only viewed up to line 400. `remove_text_ai` starts at 391.
        # I need to see more lines to safely replace `remove_text_ai`.
        # I will skip `remove_text_ai` for now and do it in next step after viewing.
            
        # Call Gemini for Text Removal
        from google.genai import types
        from PIL import Image
        import io
        
        # Configure client with API key from environment
        client = analyzer.client 
        
        # Load image for Gemini
        image = Image.open(input_path)
        
        # Prompt for text removal
        prompt = "Remove all text from this image completely. Fill the text areas with matching background seamlessly. Keep everything else identical."
        
        # Use the model selected by user
        model_to_use = vision_model
        
        # User insists on 2.5 flash working. 
        # Ensure we request IMAGE modality explicitly as it helped in the test script.
        response = client.models.generate_content(
            model=model_to_use,
            contents=[prompt, image],
            config=types.GenerateContentConfig(
                 response_modalities=["TEXT", "IMAGE"]
            )
        )
        
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        ensure_directory(target_dir)

        output_bg_filename = f"{original_name}_bg_ai_{timestamp}.png"
        output_bg_path = os.path.join(target_dir, output_bg_filename)
        
        image_saved = False
        
        # Official sample style response handling
        # Note: response.parts is a property that iterates over candidates[0].content.parts
        if response.parts:
            for part in response.parts:
                if part.inline_data:
                    # Use SDK helper if available, otherwise manual
                    if hasattr(part, 'as_image'):
                        output_img = part.as_image()
                    else:
                        img_data = part.inline_data.data
                        output_img = Image.open(io.BytesIO(img_data))
                        
                    output_img.save(output_bg_path)
                    image_saved = True
                    break
        
        if not image_saved:
             # Check for text in response similar to sample
             text_content = ""
             if response.parts:
                 for part in response.parts:
                     if part.text:
                         text_content += part.text
             raise Exception(f"Gemini returned text instead of image: {text_content}")

        return JSONResponse({
            "status": "success",
            "data": {
                "bg_url": f"/output/{batch_folder}/{output_bg_filename}"
            }
        })
    except Exception as e:
        logger.error(f"Remove Text AI Error: {e}")
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.post("/generate-pptx-batch/{batch_folder}")
async def generate_pptx_batch(batch_folder: str):
    try:
        target_dir = os.path.join(OUTPUT_DIR, batch_folder)
        if not os.path.exists(target_dir):
            return JSONResponse(status_code=404, content={"message": "Batch folder not found"})

        # Find all JSON layout files
        all_json_files = [f for f in os.listdir(target_dir) if f.endswith(".json") and "_layout_" in f]
        
        if not all_json_files:
            return JSONResponse(status_code=400, content={"message": "No processed slides found in this batch"})

        # Intelligent Filtering: Prefer _filtered.json over raw .json
        filtered_files = {f for f in all_json_files if "_filtered.json" in f}
        json_files = []
        
        # Add all filtered files
        json_files.extend(list(filtered_files))
        
        # Add raw files ONLY if their filtered counterpart is missing
        # Raw file: "name_layout_id.json" -> Expected filtered: "name_layout_id_filtered.json"
        for f in all_json_files:
            if "_filtered.json" in f:
                continue # Already added
            
            # Construct expected filtered name
            expected_filtered = f.replace(".json", "_filtered.json")
            if expected_filtered not in filtered_files:
                json_files.append(f)

        # Sort files to ensure order (optional, by timestamp usually)
        json_files.sort()

        # Create PPTX
        pptx_gen = PPTXGenerator() 
        
        slides_added = 0
        for json_file in json_files:
            # Parse IDs to find matching BG
            # Format: {original}_{timestamp}_layout_{id}.json
            # We need to load JSON to be sure about the image size or deduce it.
            # actually app.py saved metadata: layout_data = ...
            # and logic: bg_filename = f"{original_name}_bg_{file_id}.png"
            
            # Helper to find matching bg file
            json_path = os.path.join(target_dir, json_file)
            
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    layout_data = json.load(f)
            except Exception as e:
                logger.warning(f"Skipping bad JSON {json_file}: {e}")
                continue

            # Need width/height.
            # In process_slide_task, we saved the JSON. Currently JSON doesn't strictly have width/height in root.
            # But convert_to_pixels put 'bbox_px' which is absolute.
            # Refine_layout returns list of items.
            # Missing: Original Image Dimensions.
            # Workaround: Open the BG image to get dimensions.
            
            # Infer BG Filename
            # Naming convention: {original_name}_layout_{file_id}.json (or ..._filtered.json)
            # BG convention:     {original_name}_bg_{file_id}.png
            
            # Fix: If json_file has _filtered.json, strip it first to find the raw BG image name
            raw_json_name = json_file.replace("_filtered.json", ".json")
            base_part = raw_json_name.replace("_layout_", "_bg_").replace(".json", ".png")
            bg_path = os.path.join(target_dir, base_part)
            
            if not os.path.exists(bg_path):
                # Try fallback or loose search?
                # Let's try to match by file_id if strict replacement fails
                parts = json_file.split('_layout_')
                if len(parts) == 2:
                    prefix = parts[0]
                    suffix = parts[1].replace('.json', '.png')
                    bg_path_candidate = os.path.join(target_dir, f"{prefix}_bg_{suffix}")
                    if os.path.exists(bg_path_candidate):
                        bg_path = bg_path_candidate
                    else:
                        logger.warning(f"BG image not found for {json_file}")
                        continue
                else:
                    continue
            
            # Get dimensions from BG image
            from PIL import Image
            with Image.open(bg_path) as img:
                w, h = img.size
            
            pptx_gen.add_slide(layout_data, bg_path, w, h)
            slides_added += 1

        if slides_added == 0:
             return JSONResponse(status_code=400, content={"message": "Could not create any slides (missing backgrounds?)"})

        timestamp = generate_timestamp()
        pptx_filename = f"batch_presentation_{batch_folder}_{timestamp}.pptx"
        output_pptx_path = os.path.join(target_dir, pptx_filename)
        
        pptx_gen.save(output_pptx_path)
        
        return JSONResponse({
            "status": "success",
            "download_url": f"/output/{batch_folder}/{pptx_filename}",
            "filename": pptx_filename
        })

    except Exception as e:
        logger.error(f"Generate PPTX Batch Error: {e}")
        return JSONResponse(status_code=500, content={"message": str(e)})


@app.post("/save-pdf-images")
async def save_pdf_images(images: list[UploadFile] = File(...)):
    """
    Client sends multiple image files.
    Server saves them to output/pdftoimage_{yyyymmdd}_{hhmmss}/
    """
    try:
        if not images:
            return JSONResponse(status_code=400, content={'status': 'error', 'message': 'No files received'})

        # Create timestamped folder
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        folder_name = f"pdftoimage_{timestamp}"
        save_path = os.path.join("output", folder_name)
        os.makedirs(save_path, exist_ok=True)

        count = 0
        for file in images:
            if file.filename:
                # Simple sanitization
                safe_filename = os.path.basename(file.filename)
                file_path = os.path.join(save_path, safe_filename)
                
                # Write file
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                count += 1

        logger.info(f"Saved {count} PDF images to {save_path}")
        return JSONResponse(content={
            'status': 'success', 
            'message': f'Saved {count} images', 
            'folder': folder_name
        })

    except Exception as e:
        logger.error(f"Error saving PDF images: {e}")
        return JSONResponse(status_code=500, content={'status': 'error', 'message': str(e)})

@app.post("/combine-upload")
async def combine_upload(
    background_tasks: BackgroundTasks,
    source_file: UploadFile = File(...),
    background_file: UploadFile = File(...),
    vision_model: str = Form("gemini-3-flash-preview"),
    codegen_model: str = Form("algorithmic"),
    batch_folder: str = Form("combine_single"), # Receive batch folder
    max_concurrent: int = Form(3),
    font_family: str = Form("Malgun Gothic"),
    refine_layout: str = Form("false"), # Receives string 'true'/'false'
    exclude_text: str = Form(None)
):
    global MAX_CONCURRENT_TASKS, semaphore
    if max_concurrent != MAX_CONCURRENT_TASKS:
        MAX_CONCURRENT_TASKS = max_concurrent
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)
        
    timestamp = generate_timestamp()
    task_id = str(uuid.uuid4())
    
    original_name = os.path.splitext(source_file.filename)[0]
    
    # Target Directory
    target_dir = os.path.join(OUTPUT_DIR, batch_folder)
    ensure_directory(target_dir)
    
    # Save Source
    source_ext = os.path.splitext(source_file.filename)[1]
    source_filename = f"{original_name}_source_{timestamp}{source_ext}"
    source_path = os.path.join(target_dir, source_filename)
    with open(source_path, "wb") as buffer:
        shutil.copyfileobj(source_file.file, buffer)
        
    # Save Background
    bg_ext = os.path.splitext(background_file.filename)[1]
    bg_filename = f"{original_name}_bg_clean_{timestamp}{bg_ext}"
    bg_path = os.path.join(target_dir, bg_filename)
    with open(bg_path, "wb") as buffer:
        shutil.copyfileobj(background_file.file, buffer)
        
    # Init Progress
    progress_store[task_id] = {"status": "starting", "message": "조합 작업 대기 중...", "percent": 0}
    
    background_tasks.add_task(
        process_combine_task,
        task_id,
        source_path,
        bg_path,
        original_name,
        vision_model,
        codegen_model,
        batch_folder,
        font_family,
        refine_layout.lower() == 'true',
        exclude_text
    )
    
    return JSONResponse({"status": "processing", "task_id": task_id})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
