"""
WebSocket handler for real-time code streaming.
Receives code updates, runs AST analysis, and sends back results.
"""
import json
import logging
import asyncio
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ast_analyzer.analyzer import CodeAnalyzer
from db.database import async_session
from db.models import CodeSnapshot

logger = logging.getLogger("interviewlens.ws.code")

router = APIRouter()

# Active code streaming connections
active_connections: Dict[str, WebSocket] = {}
# Code analyzer instance
analyzer = CodeAnalyzer()
# Debounce timers
_analysis_tasks: Dict[str, asyncio.Task] = {}


@router.websocket("/ws/code-stream")
async def code_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time code streaming.
    
    Messages from client:
    - { "type": "code_update", "code": "...", "language": "python", "interview_id": "..." }
    - { "type": "run_code", "code": "...", "language": "python" }
    
    Messages to client:
    - { "type": "analysis", "data": { ... } }
    - { "type": "execution_result", "data": { ... } }
    """
    await websocket.accept()
    connection_id = id(websocket)
    active_connections[str(connection_id)] = websocket
    logger.info("Code stream connected: %s", connection_id)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "")

            if msg_type == "code_update":
                await _handle_code_update(websocket, message, connection_id)
            elif msg_type == "run_code":
                await _handle_run_code(websocket, message)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info("Code stream disconnected: %s", connection_id)
    except Exception as e:
        logger.error("Code stream error: %s", e)
    finally:
        active_connections.pop(str(connection_id), None)
        # Cancel any pending analysis
        task = _analysis_tasks.pop(str(connection_id), None)
        if task:
            task.cancel()


async def _handle_code_update(websocket: WebSocket, message: dict, connection_id: int):
    """Handle code update with debounced AST analysis."""
    code = message.get("code", "")
    language = message.get("language", "python")
    interview_id = message.get("interview_id")

    # Cancel previous analysis task if exists (debounce)
    conn_key = str(connection_id)
    task = _analysis_tasks.get(conn_key)
    if task:
        task.cancel()

    # Schedule analysis with debounce (500ms)
    async def delayed_analysis():
        await asyncio.sleep(0.5)  # Debounce
        
        # Run AST analysis
        analysis = analyzer.analyze(code, language)
        
        # Send analysis results
        await websocket.send_json({
            "type": "analysis",
            "data": analysis,
        })

        # Save code snapshot if interview is active
        if interview_id:
            try:
                async with async_session() as session:
                    snapshot = CodeSnapshot(
                        interview_id=interview_id,
                        code=code,
                        language=language,
                        analysis=analysis,
                    )
                    session.add(snapshot)
                    await session.commit()
            except Exception as e:
                logger.error("Failed to save code snapshot: %s", e)

    _analysis_tasks[conn_key] = asyncio.create_task(delayed_analysis())


async def _handle_run_code(websocket: WebSocket, message: dict):
    """Handle code execution request."""
    from sandbox.executor import execute_code
    
    code = message.get("code", "")
    language = message.get("language", "python")
    stdin = message.get("stdin", "")

    await websocket.send_json({
        "type": "execution_started",
    })

    result = await execute_code(code, language, stdin)

    await websocket.send_json({
        "type": "execution_result",
        "data": result,
    })


async def broadcast_analysis(interview_id: str, analysis: dict):
    """Broadcast analysis results to all connections for an interview."""
    for ws in active_connections.values():
        try:
            await ws.send_json({
                "type": "analysis_broadcast",
                "interview_id": interview_id,
                "data": analysis,
            })
        except Exception:
            pass
