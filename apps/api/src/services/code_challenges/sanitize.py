"""
Code sanitization utilities for security
"""

import re

# Maximum allowed source code size (10 MB)
MAX_CODE_SIZE = 10 * 1024 * 1024

# Maximum lines of code
MAX_CODE_LINES = 10000


class CodeValidationError(Exception):
    """Raised when code validation fails"""


def sanitize_code(source_code: str) -> str:
    """
    Sanitize source code for submission.

    Args:
        source_code: Raw source code

    Returns:
        Sanitized source code

    Raises:
        CodeValidationError: If code fails validation
    """
    if not source_code:
        msg = "Source code cannot be empty"
        raise CodeValidationError(msg)

    # Check size
    if len(source_code) > MAX_CODE_SIZE:
        msg = f"Source code exceeds maximum size of {MAX_CODE_SIZE // (1024 * 1024)} MB"
        raise CodeValidationError(msg)

    # Check for null bytes
    if "\x00" in source_code:
        msg = "Source code contains invalid characters"
        raise CodeValidationError(msg)

    # Check line count
    line_count = source_code.count("\n") + 1
    if line_count > MAX_CODE_LINES:
        msg = f"Source code exceeds maximum of {MAX_CODE_LINES} lines"
        raise CodeValidationError(msg)

    return source_code


def sanitize_stderr(stderr: str | None, max_length: int = 5000) -> str | None:
    """
    Sanitize stderr output for display.

    - Removes ANSI escape codes
    - Removes system paths
    - Truncates to max length

    Args:
        stderr: Raw stderr output
        max_length: Maximum length of output

    Returns:
        Sanitized stderr or None
    """
    if not stderr:
        return None

    # Remove ANSI escape codes
    ansi_pattern = re.compile(r"\x1b\[[0-9;]*m")
    sanitized = ansi_pattern.sub("", stderr)

    # Remove common system paths that might leak info
    path_patterns = [
        r"/box/[^\s]+",  # Judge0 sandbox paths
        r"/usr/[^\s]+",
        r"/tmp/[^\s]+",
        r"/home/[^\s]+",
        r"C:\\[^\s]+",  # Windows paths
    ]

    for pattern in path_patterns:
        sanitized = re.sub(pattern, "[PATH]", sanitized, flags=re.IGNORECASE)

    # Truncate if too long
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "\n... (output truncated)"

    return sanitized


def sanitize_stdout(stdout: str | None, max_length: int = 10000) -> str | None:
    """
    Sanitize stdout output for display.

    Args:
        stdout: Raw stdout output
        max_length: Maximum length of output

    Returns:
        Sanitized stdout or None
    """
    if not stdout:
        return None

    # Remove ANSI escape codes
    ansi_pattern = re.compile(r"\x1b\[[0-9;]*m")
    sanitized = ansi_pattern.sub("", stdout)

    # Truncate if too long
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "\n... (output truncated)"

    return sanitized


def extract_error_location(
    stderr: str | None,
    compile_output: str | None,
) -> tuple[int | None, int | None]:
    """
    Extract line and column number from error output.

    Args:
        stderr: Standard error output
        compile_output: Compilation error output

    Returns:
        Tuple of (line_number, column_number) or (None, None)
    """
    output = compile_output or stderr
    if not output:
        return None, None

    # Common error patterns
    patterns = [
        # GCC/Clang: "file.c:10:5: error:"
        r":(\d+):(\d+):",
        # Python: "line 10"
        r"line (\d+)",
        # Java: "Error on line 10"
        r"line (\d+)",
        # Generic: "(10, 5)"
        r"\((\d+),\s*(\d+)\)",
    ]

    for pattern in patterns:
        match = re.search(pattern, output)
        if match:
            groups = match.groups()
            line = int(groups[0]) if groups[0] else None
            col = int(groups[1]) if len(groups) > 1 and groups[1] else None
            return line, col

    return None, None
