"""
Sandbox Runner - Standalone script for Docker-based code execution.
Can be used independently of the main application.
"""
import sys
import json
import subprocess
import tempfile
import os
import time
import argparse


def run_code(code: str, language: str, timeout: int = 5) -> dict:
    """
    Execute code in a temporary file with timeout.
    This runs INSIDE the Docker container.
    """
    start_time = time.time()
    
    try:
        if language == "python":
            with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
                f.write(code)
                f.flush()
                result = subprocess.run(
                    ["python3", f.name],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
                os.unlink(f.name)
                
        elif language == "javascript":
            with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
                f.write(code)
                f.flush()
                result = subprocess.run(
                    ["node", f.name],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
                os.unlink(f.name)
        else:
            return {
                "stdout": "",
                "stderr": f"Unsupported language: {language}",
                "execution_time": 0,
                "exit_code": 1,
                "timed_out": False,
            }
        
        execution_time = time.time() - start_time
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "execution_time": round(execution_time, 3),
            "exit_code": result.returncode,
            "timed_out": False,
        }

    except subprocess.TimeoutExpired:
        execution_time = time.time() - start_time
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {timeout} seconds",
            "execution_time": round(execution_time, 3),
            "exit_code": 124,
            "timed_out": True,
        }

    except Exception as e:
        execution_time = time.time() - start_time
        return {
            "stdout": "",
            "stderr": str(e),
            "execution_time": round(execution_time, 3),
            "exit_code": 1,
            "timed_out": False,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute code in sandbox")
    parser.add_argument("--language", default="python", choices=["python", "javascript"])
    parser.add_argument("--timeout", type=int, default=5)
    parser.add_argument("--code", type=str, help="Code to execute")
    parser.add_argument("--stdin", action="store_true", help="Read code from stdin")
    
    args = parser.parse_args()
    
    if args.stdin:
        code = sys.stdin.read()
    elif args.code:
        code = args.code
    else:
        print("Error: Provide --code or --stdin", file=sys.stderr)
        sys.exit(1)
    
    result = run_code(code, args.language, args.timeout)
    print(json.dumps(result))
