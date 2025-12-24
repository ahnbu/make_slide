import os
import logging
from datetime import datetime

# 로거 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

def get_logger(name):
    return logging.getLogger(name)

def generate_timestamp():
    return datetime.now().strftime("%H%M%S_%f")

def ensure_directory(path):
    if not os.path.exists(path):
        os.makedirs(path)
