#!/usr/bin/env python3
"""
Project Map Generator Script
=============================

PURPOSE:
    This script generates a comprehensive "skeleton" view of the project structure,
    solving the "Context Blindness" problem by creating a persistent map that allows
    understanding the codebase structure and high-level logic without reading every file.

HOW IT WORKS:
    1. Traverses the entire project directory tree recursively
    2. Aggressively filters out noise (node_modules, venv, .git, etc.)
    3. For each code file, parses and extracts ONLY signatures:
       - Classes (class MyClass...)
       - Functions/Methods (def, function, const ... = () =>)
       - Shell script functions
    4. Preserves indentation to show code hierarchy
    5. Outputs everything to PROJECT_MAP.md in the root directory

SUPPORTED FILE TYPES:
    - Python: .py
    - TypeScript/JavaScript: .ts, .tsx, .js, .jsx
    - Shell scripts: .sh

USAGE:
    python3 dev_tools/generate_repo_map.py

OUTPUT:
    Creates/overwrites PROJECT_MAP.md in the project root directory.
"""

import os
import re
from pathlib import Path
from datetime import datetime

# =============================================================================
# CONFIGURATION
# =============================================================================

# Directories to completely ignore during traversal
IGNORE_DIRS = {
    'node_modules',
    'venv',
    '.git',
    '__pycache__',
    'dist',
    'build',
    '.next',
    'coverage',
    '.cursor',
    '.vscode',
    'logs',
    'uploads',
    'data',
    '.gemini',
}

# File extensions to completely ignore
IGNORE_EXTENSIONS = {
    '.png', '.svg', '.ico', '.jpg', '.jpeg', '.gif', '.webp',  # Images
    '.woff', '.woff2', '.ttf', '.eot',  # Fonts
    '.map',  # Source maps
    '.min.js', '.min.css',  # Minified files
    '.lock',  # Lock files
}

# Specific filenames to ignore
IGNORE_FILES = {
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.DS_Store',
    'Thumbs.db',
}

# Code file extensions that should be parsed for signatures
CODE_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.sh'}

# =============================================================================
# SIGNATURE EXTRACTION PATTERNS
# =============================================================================

# Python patterns
PY_CLASS_PATTERN = re.compile(r'^(\s*)(class\s+\w+[^:]*):')
PY_FUNC_PATTERN = re.compile(r'^(\s*)((?:async\s+)?def\s+\w+\s*\([^)]*\)[^:]*):')
PY_DECORATOR_PATTERN = re.compile(r'^(\s*)(@\w+(?:\.\w+)*(?:\([^)]*\))?)')

# JavaScript/TypeScript patterns
JS_CLASS_PATTERN = re.compile(r'^(\s*)((?:export\s+)?(?:default\s+)?class\s+\w+[^{]*)')
JS_FUNC_PATTERN = re.compile(r'^(\s*)((?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)[^{]*)')
JS_ARROW_PATTERN = re.compile(r'^(\s*)((?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)')
JS_ARROW_SIMPLE_PATTERN = re.compile(r'^(\s*)((?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\w+\s*=>)')
JS_METHOD_PATTERN = re.compile(r'^(\s*)((?:async\s+)?(?:get\s+|set\s+)?\w+\s*\([^)]*\)\s*\{)')
JS_INTERFACE_PATTERN = re.compile(r'^(\s*)((?:export\s+)?interface\s+\w+[^{]*)')
JS_TYPE_PATTERN = re.compile(r'^(\s*)((?:export\s+)?type\s+\w+\s*=)')
JS_COMPONENT_PATTERN = re.compile(r'^(\s*)((?:export\s+)?(?:default\s+)?(?:const|function)\s+\w+.*(?:React\.FC|JSX\.Element|\:\s*FC))')

# Control flow keywords to EXCLUDE from signatures (these are NOT function definitions)
CONTROL_FLOW_KEYWORDS = {
    'if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'try', 'finally',
    'return', 'throw', 'break', 'continue', 'do', 'with'
}

# Shell script patterns
SH_FUNC_PATTERN = re.compile(r'^(\s*)(\w+\s*\(\)\s*\{)')
SH_FUNC_KEYWORD_PATTERN = re.compile(r'^(\s*)(function\s+\w+)')

# =============================================================================
# CORE FUNCTIONS
# =============================================================================

def should_ignore_dir(dirname: str) -> bool:
    """
    Check if a directory should be ignored during traversal.
    
    Args:
        dirname: Name of the directory to check
        
    Returns:
        True if the directory should be ignored, False otherwise
    """
    return dirname in IGNORE_DIRS or dirname.startswith('.')


def should_ignore_file(filename: str) -> bool:
    """
    Check if a file should be ignored.
    
    Args:
        filename: Name of the file to check
        
    Returns:
        True if the file should be ignored, False otherwise
    """
    if filename in IGNORE_FILES:
        return True
    
    # Check for ignored extensions
    for ext in IGNORE_EXTENSIONS:
        if filename.endswith(ext):
            return True
    
    # Check for minified files
    if '.min.' in filename:
        return True
    
    return False


def get_file_extension(filename: str) -> str:
    """
    Get the file extension from a filename.
    
    Args:
        filename: Name of the file
        
    Returns:
        The file extension including the dot (e.g., '.py')
    """
    return Path(filename).suffix.lower()


def extract_python_signatures(filepath: str) -> list:
    """
    Extract class and function signatures from a Python file.
    
    Args:
        filepath: Path to the Python file
        
    Returns:
        List of signature strings with preserved indentation
    """
    signatures = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Check for decorators (capture them with the following function/class)
            decorator_match = PY_DECORATOR_PATTERN.match(line)
            if decorator_match:
                decorators = [decorator_match.group(2)]
                indent = decorator_match.group(1)
                i += 1
                # Collect all consecutive decorators
                while i < len(lines):
                    next_decorator = PY_DECORATOR_PATTERN.match(lines[i])
                    if next_decorator and next_decorator.group(1) == indent:
                        decorators.append(next_decorator.group(2))
                        i += 1
                    else:
                        break
                # Now check for the class/function
                if i < len(lines):
                    class_match = PY_CLASS_PATTERN.match(lines[i])
                    func_match = PY_FUNC_PATTERN.match(lines[i])
                    if class_match:
                        for dec in decorators:
                            signatures.append(f"{indent}{dec}")
                        signatures.append(f"{class_match.group(1)}{class_match.group(2)}")
                    elif func_match:
                        for dec in decorators:
                            signatures.append(f"{indent}{dec}")
                        signatures.append(f"{func_match.group(1)}{func_match.group(2)}")
                continue
            
            # Check for class definitions
            class_match = PY_CLASS_PATTERN.match(line)
            if class_match:
                signatures.append(f"{class_match.group(1)}{class_match.group(2)}")
                i += 1
                continue
            
            # Check for function definitions
            func_match = PY_FUNC_PATTERN.match(line)
            if func_match:
                signatures.append(f"{func_match.group(1)}{func_match.group(2)}")
                i += 1
                continue
            
            i += 1
    except Exception as e:
        signatures.append(f"  # Error reading file: {e}")
    
    return signatures


def extract_js_signatures(filepath: str) -> list:
    """
    Extract class, function, and component signatures from JavaScript/TypeScript files.
    Explicitly EXCLUDES control flow statements (if, for, while, switch, etc.)
    
    Args:
        filepath: Path to the JS/TS file
        
    Returns:
        List of signature strings with preserved indentation
    """
    signatures = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        for line in lines:
            stripped = line.strip()
            
            # CRITICAL: Skip control flow statements - they are NOT signatures!
            # This prevents matching "if (status) {" as a function
            if stripped:
                parts = stripped.split('(')[0].split()
                first_word = parts[0] if parts else ''
                if first_word.lower() in CONTROL_FLOW_KEYWORDS:
                    continue
            
            # Check for interfaces (TypeScript)
            interface_match = JS_INTERFACE_PATTERN.match(line)
            if interface_match:
                signatures.append(f"{interface_match.group(1)}{interface_match.group(2).strip()}")
                continue
            
            # Check for type aliases (TypeScript)
            type_match = JS_TYPE_PATTERN.match(line)
            if type_match:
                signatures.append(f"{type_match.group(1)}{type_match.group(2).strip()}")
                continue
            
            # Check for class definitions
            class_match = JS_CLASS_PATTERN.match(line)
            if class_match:
                signatures.append(f"{class_match.group(1)}{class_match.group(2).strip()}")
                continue
            
            # Check for function declarations
            func_match = JS_FUNC_PATTERN.match(line)
            if func_match:
                signatures.append(f"{func_match.group(1)}{func_match.group(2).strip()}")
                continue
            
            # Check for arrow functions with parameters
            arrow_match = JS_ARROW_PATTERN.match(line)
            if arrow_match:
                signatures.append(f"{arrow_match.group(1)}{arrow_match.group(2).strip()}")
                continue
            
            # Check for simple arrow functions
            arrow_simple_match = JS_ARROW_SIMPLE_PATTERN.match(line)
            if arrow_simple_match:
                signatures.append(f"{arrow_simple_match.group(1)}{arrow_simple_match.group(2).strip()}")
                continue
            
            # Check for class methods (only at indentation level > 0)
            method_match = JS_METHOD_PATTERN.match(line)
            if method_match and len(method_match.group(1)) > 0:
                # Clean up the method signature
                sig = method_match.group(2).rstrip('{').strip()
                signatures.append(f"{method_match.group(1)}{sig}()")
                continue
    except Exception as e:
        signatures.append(f"  // Error reading file: {e}")
    
    return signatures


def extract_shell_signatures(filepath: str) -> list:
    """
    Extract function definitions from shell scripts.
    
    Args:
        filepath: Path to the shell script file
        
    Returns:
        List of signature strings with preserved indentation
    """
    signatures = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        for line in lines:
            # Check for function_name() { style
            func_match = SH_FUNC_PATTERN.match(line)
            if func_match:
                signatures.append(f"{func_match.group(1)}{func_match.group(2)}")
                continue
            
            # Check for "function name" style
            func_keyword_match = SH_FUNC_KEYWORD_PATTERN.match(line)
            if func_keyword_match:
                signatures.append(f"{func_keyword_match.group(1)}{func_keyword_match.group(2)}")
                continue
    except Exception as e:
        signatures.append(f"  # Error reading file: {e}")
    
    return signatures


def extract_signatures(filepath: str, extension: str) -> list:
    """
    Extract signatures from a code file based on its extension.
    
    Args:
        filepath: Path to the code file
        extension: File extension (e.g., '.py')
        
    Returns:
        List of signature strings
    """
    if extension == '.py':
        return extract_python_signatures(filepath)
    elif extension in {'.js', '.jsx', '.ts', '.tsx'}:
        return extract_js_signatures(filepath)
    elif extension == '.sh':
        return extract_shell_signatures(filepath)
    return []


def generate_project_map(root_dir: str) -> str:
    """
    Generate the complete project map as a string.
    
    Args:
        root_dir: Root directory of the project
        
    Returns:
        The complete project map as a markdown string
    """
    lines = []
    root_path = Path(root_dir)
    project_name = root_path.name
    
    # Header
    lines.append(f"# 🗺️ PROJECT MAP: {project_name}")
    lines.append("")
    lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append("> **Note:** This map shows the project structure and code signatures (classes, functions, methods).")
    lines.append("> Run `python3 dev_tools/generate_repo_map.py` to regenerate after significant changes.")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # Walk the directory tree
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter out ignored directories (modify in place to prevent descending)
        dirnames[:] = [d for d in dirnames if not should_ignore_dir(d)]
        dirnames.sort()
        
        # Calculate relative path and depth
        rel_path = Path(dirpath).relative_to(root_path)
        depth = len(rel_path.parts)
        
        # Add directory header
        if depth == 0:
            lines.append(f"## 📁 / (root)")
        else:
            indent = "  " * (depth - 1)
            lines.append(f"{indent}### 📁 {rel_path.name}/")
        
        # Process files in this directory
        filenames.sort()
        for filename in filenames:
            if should_ignore_file(filename):
                continue
            
            filepath = os.path.join(dirpath, filename)
            extension = get_file_extension(filename)
            file_indent = "  " * depth
            
            # Check if it's a code file that should be parsed
            if extension in CODE_EXTENSIONS:
                lines.append(f"{file_indent}#### 📄 {filename}")
                signatures = extract_signatures(filepath, extension)
                if signatures:
                    lines.append(f"{file_indent}```")
                    for sig in signatures:
                        lines.append(f"{file_indent}{sig}")
                    lines.append(f"{file_indent}```")
                else:
                    lines.append(f"{file_indent}*(no signatures found)*")
            else:
                # Just list non-code files
                lines.append(f"{file_indent}- 📄 {filename}")
        
        lines.append("")
    
    return "\n".join(lines)


def main():
    """
    Main entry point: generates the project map and writes it to PROJECT_MAP.md.
    """
    # Determine the project root (parent of dev_tools)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    print(f"🗺️  Generating project map for: {project_root}")
    print(f"📁 Ignoring directories: {', '.join(sorted(IGNORE_DIRS))}")
    print()
    
    # Generate the map
    project_map = generate_project_map(str(project_root))
    
    # Write to file
    output_path = project_root / "PROJECT_MAP.md"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(project_map)
    
    print(f"✅ Project map written to: {output_path}")
    print(f"📊 Total lines: {len(project_map.splitlines())}")


if __name__ == "__main__":
    main()
