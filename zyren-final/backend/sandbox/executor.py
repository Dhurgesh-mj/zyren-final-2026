"""
Docker-based sandboxed code execution engine.
Creates isolated containers for each code run with resource limits.
"""
import time
import logging
import asyncio
from typing import Optional

import docker
from docker.errors import ContainerError, ImageNotFound, APIError

from config import get_settings

logger = logging.getLogger("interviewlens.sandbox")
settings = get_settings()

# Docker client (lazy init)
_docker_client = None


def _get_docker_client():
    """Get or create Docker client."""
    global _docker_client
    if _docker_client is None:
        try:
            _docker_client = docker.from_env()
            _docker_client.ping()
            logger.info("Docker client connected")
        except Exception as e:
            logger.error("Docker connection failed: %s", e)
            _docker_client = None
    return _docker_client


async def execute_code(
    code: str,
    language: str = "python",
    stdin: str = "",
) -> dict:
    """
    Execute code in an isolated Docker container.
    
    Args:
        code: Source code to execute
        language: Programming language (python/javascript)
        stdin: Standard input
        
    Returns:
        Dictionary with stdout, stderr, execution_time, exit_code, timed_out
    """
    if not settings.SANDBOX_ENABLED:
        return _execute_locally(code, language, stdin)
    
    client = _get_docker_client()
    if client is None:
        logger.warning("Docker not available, falling back to local execution")
        return _execute_locally(code, language, stdin)

    # Determine execution command based on language
    lang_configs = {
        "python": ("python:3.11-slim", ["python", "-c", code]),
        "javascript": ("node:20-slim", ["node", "-e", code]),
        "java": ("eclipse-temurin:17-jdk", ["bash", "-c", f"echo '{code}' > Main.java && javac Main.java && java Main"]),
        "cpp": ("gcc:13", ["bash", "-c", f"echo '{code}' > main.cpp && g++ -o main main.cpp && ./main"]),
        "c": ("gcc:13", ["bash", "-c", f"echo '{code}' > main.c && gcc -o main main.c && ./main"]),
        "go": ("golang:1.21", ["bash", "-c", f"echo 'package main\nfunc main(){{\n{code}\n}}' > main.go && go run main.go"]),
        "rust": ("rust:1.75", ["bash", "-c", "echo 'fn main() { ' > main.rs && echo \"" + code.replace('"', '\\"') + "\" >> main.rs && echo '}' >> main.rs && rustc main.rs && ./main"]),
        "typescript": ("node:20-slim", ["bash", "-c", f"npm install -g typescript && tsc --version && echo '{code}' > main.ts && tsc main.ts && node main.js"]),
    }
    
    if language not in lang_configs:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language}. Supported: {', '.join(lang_configs.keys())}",
            "execution_time": 0,
            "exit_code": 1,
            "timed_out": False,
        }
    
    image, cmd = lang_configs[language]

    container = None
    start_time = time.time()

    try:
        # Run in isolated container with resource limits
        container = client.containers.run(
            image=image,
            command=cmd,
            stdin_open=bool(stdin),
            detach=True,
            mem_limit=settings.SANDBOX_MEMORY_LIMIT,
            cpu_quota=int(settings.SANDBOX_CPU_LIMIT * 100000),
            network_disabled=True,  # No network access
            read_only=True,  # Read-only filesystem
            tmpfs={"/tmp": "size=10M"},  # Small writable tmp
            security_opt=["no-new-privileges:true"],
            user="nobody",
        )

        # Wait for completion with timeout
        try:
            result = container.wait(timeout=settings.SANDBOX_TIMEOUT)
            execution_time = time.time() - start_time
            
            # Get logs
            stdout = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
            stderr = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")
            exit_code = result.get("StatusCode", 1)

            return {
                "stdout": stdout.strip(),
                "stderr": stderr.strip(),
                "execution_time": round(execution_time, 3),
                "exit_code": exit_code,
                "timed_out": False,
            }

        except Exception:
            # Timeout
            execution_time = time.time() - start_time
            try:
                container.kill()
            except Exception:
                pass
            
            return {
                "stdout": "",
                "stderr": f"Execution timed out after {settings.SANDBOX_TIMEOUT} seconds",
                "execution_time": round(execution_time, 3),
                "exit_code": 124,
                "timed_out": True,
            }

    except ImageNotFound:
        logger.error("Docker image not found: %s", image)
        # Try to pull the image
        try:
            client.images.pull(image)
            return await execute_code(code, language, stdin)
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Docker image {image} not found and could not be pulled: {e}",
                "execution_time": 0,
                "exit_code": 1,
                "timed_out": False,
            }

    except Exception as e:
        execution_time = time.time() - start_time
        logger.error("Sandbox execution error: %s", e)
        return {
            "stdout": "",
            "stderr": str(e),
            "execution_time": round(execution_time, 3),
            "exit_code": 1,
            "timed_out": False,
        }

    finally:
        # Always clean up the container
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


def _execute_locally(code: str, language: str, stdin: str = "") -> dict:
    """
    Fallback: execute code locally when Docker is not available.
    WARNING: This is less secure, used only for development.
    """
    import subprocess
    
    start_time = time.time()
    
    if language == "python":
        cmd = ["python3", "-c", code]
    elif language == "javascript":
        cmd = ["node", "-e", code]
    else:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language}",
            "execution_time": 0,
            "exit_code": 1,
            "timed_out": False,
        }

    try:
        result = subprocess.run(
            cmd,
            input=stdin,
            capture_output=True,
            text=True,
            timeout=settings.SANDBOX_TIMEOUT,
        )
        execution_time = time.time() - start_time
        
        return {
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "execution_time": round(execution_time, 3),
            "exit_code": result.returncode,
            "timed_out": False,
        }

    except subprocess.TimeoutExpired:
        execution_time = time.time() - start_time
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {settings.SANDBOX_TIMEOUT} seconds",
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
