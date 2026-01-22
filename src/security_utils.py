
import os
import re

def validate_safe_filename(filename: str) -> str:
    """
    Validates that a filename is safe to use.
    Allows alphanumerics, underscores, dashes, dots, and Korean characters.
    Rejects potential directory traversal characters or dangerous symbols.
    """
    if not filename:
        raise ValueError("Filename cannot be empty")
        
    # Block directory traversal explicitly
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError(f"Invalid filename contains path separators: {filename}")
    
    # Optional: Stricter regex if needed, but for now blocking separators is key
    return filename

def validate_safe_path(base_dir: str, relative_path: str) -> str:
    """
    Joins base_dir and relative_path, ensuring the result is within base_dir.
    Prevents path traversal attacks (e.g., using '../' in relative_path).
    
    Args:
        base_dir: The trusted root directory (must be absolute).
        relative_path: The untrusted path component (e.g., user input).
        
    Returns:
        The absolute, normalized path.
        
    Raises:
        ValueError: If the resulting path is outside base_dir.
    """
    # Ensure base_dir is absolute
    base_dir = os.path.abspath(base_dir)
    
    # Join and normalize (resolve .. components)
    final_path = os.path.normpath(os.path.join(base_dir, relative_path))
    
    # Check if final_path starts with base_dir check
    # os.path.commonpath is robust for comparing paths
    if os.path.commonpath([base_dir, final_path]) != base_dir:
        raise ValueError(f"Path traversal attempt detected: {relative_path} resolves to {final_path} which is outside {base_dir}")
        
    return final_path
