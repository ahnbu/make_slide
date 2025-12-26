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
    "codegen_model": "algorithmic"
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
    max_concurrent: int = Form(3) # Receive concurrency setting
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
        batch_folder
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

async def process_slide_task(task_id, input_path, original_name, vision_model, inpainting_model, codegen_model, batch_folder):
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
            
            # Save things
            json_filename = f"{original_name}_layout_{file_id}.json"
            json_path = os.path.join(target_dir, json_filename)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(layout_data, f, indent=4, ensure_ascii=False)
                
            # result_input_path = os.path.join(target_dir, f"{original_name}_{file_id}{os.path.splitext(input_path)[1]}")
            # Input is already in target dir, no need to copy
            # shutil.copy2(input_path, result_input_path)

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
            await asyncio.to_thread(image_processor.create_clean_background, input_path, layout_data, bg_path)
            
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
            await asyncio.to_thread(code_generator.generate_html, layout_data, width, height, bg_path, html_path)
            
            # Log execution
            log_execution(original_name, current_vision_model, inpainting_model, codegen_model)

            # Complete
            progress_store[task_id] = {
                "status": "complete", 
                "message": "[완료] 모든 작업 처리가 끝났습니다.", 
                "percent": 100,
                "data": {
                    "html_url": f"/output/{batch_folder}/{html_filename}",
                    "bg_url": f"/output/{batch_folder}/{bg_filename}",
                    "preview_url": f"/output/{batch_folder}/{html_filename}" 
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
            
        analyzer.model_name = vision_model
        layout_data, width, height = analyzer.analyze_image(input_path)
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
