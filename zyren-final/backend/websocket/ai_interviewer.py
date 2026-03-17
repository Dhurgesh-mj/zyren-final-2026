"""
WebSocket handler for the AI Interviewer.
Manages real-time conversation between user and AI interviewer.
"""
import json
import logging
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ai.interviewer import AIInterviewer
from ast_analyzer.analyzer import CodeAnalyzer
from db.database import async_session
from db.models import InterviewMessage

logger = logging.getLogger("interviewlens.ws.ai")

router = APIRouter()

# Active AI interview sessions
ai_sessions: Dict[str, dict] = {}

# Shared code analyzer
analyzer = CodeAnalyzer()


@router.websocket("/ws/ai-interviewer")
async def ai_interviewer_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for AI interviewer interaction.
    
    Messages from client:
    - { "type": "start_session", "interview_id": "...", "problem_title": "...", "problem": "..." }
    - { "type": "user_message", "content": "...", "interview_id": "..." }
    - { "type": "code_update", "code": "...", "language": "python", "interview_id": "..." }
    - { "type": "transcript", "text": "...", "interview_id": "..." }
    
    Messages to client:
    - { "type": "ai_message", "content": "...", "role": "assistant" }
    - { "type": "ai_typing", "status": true/false }
    - { "type": "follow_up", "content": "..." }
    - { "type": "analysis_trigger", "patterns": [...] }
    """
    await websocket.accept()
    connection_id = str(id(websocket))
    logger.info("AI interviewer connected: %s", connection_id)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "")

            if msg_type == "start_session":
                await _handle_start_session(websocket, connection_id, message)
            elif msg_type == "user_message":
                await _handle_user_message(websocket, connection_id, message)
            elif msg_type == "code_update":
                await _handle_code_update(websocket, connection_id, message)
            elif msg_type == "transcript":
                await _handle_transcript(websocket, connection_id, message)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info("AI interviewer disconnected: %s", connection_id)
    except Exception as e:
        import traceback
        logger.error("AI interviewer error: %s\n%s", e, traceback.format_exc())
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Server error: {str(e)}",
            })
        except:
            pass
    finally:
        ai_sessions.pop(connection_id, None)


async def _handle_start_session(websocket: WebSocket, connection_id: str, message: dict):
    """Initialize a new AI interview session."""
    interview_id = message.get("interview_id", "")
    problem_title = message.get("problem_title", "Coding Problem")
    problem = message.get("problem", "")

    # Create AI interviewer instance
    interviewer = AIInterviewer(interview_id=interview_id)
    
    ai_sessions[connection_id] = {
        "websocket": websocket,
        "interviewer": interviewer,
        "interview_id": interview_id,
        "last_code": "",
        "last_analysis": {},
        "message_count": 0,
    }

    # Generate initial greeting
    await websocket.send_json({"type": "ai_typing", "status": True})
    
    greeting = await interviewer.get_initial_greeting(problem_title, problem)
    
    await websocket.send_json({"type": "ai_typing", "status": False})
    await websocket.send_json({
        "type": "ai_message",
        "content": greeting,
        "role": "assistant",
    })

    # Save to database
    await _save_message(interview_id, "assistant", greeting)
    
    logger.info("AI session started for interview: %s", interview_id)


async def _handle_user_message(websocket: WebSocket, connection_id: str, message: dict):
    """Handle a text message from the user."""
    session = ai_sessions.get(connection_id)
    if not session:
        await websocket.send_json({
            "type": "error",
            "message": "No active session. Send start_session first.",
        })
        return

    content = message.get("content", "")
    interview_id = session["interview_id"]
    interviewer = session["interviewer"]

    if not content.strip():
        return

    # Save user message
    await _save_message(interview_id, "user", content)

    # Show typing indicator
    await websocket.send_json({"type": "ai_typing", "status": True})

    # Get AI response
    response = await interviewer.chat(
        user_message=content,
        code=session.get("last_code"),
        ast_analysis=session.get("last_analysis"),
    )

    await websocket.send_json({"type": "ai_typing", "status": False})
    await websocket.send_json({
        "type": "ai_message",
        "content": response,
        "role": "assistant",
    })

    # Save AI message
    await _save_message(interview_id, "assistant", response)
    session["message_count"] += 1


async def _handle_code_update(websocket: WebSocket, connection_id: str, message: dict):
    """Handle code updates and trigger follow-up questions when patterns change."""
    session = ai_sessions.get(connection_id)
    if not session:
        return

    code = message.get("code", "")
    language = message.get("language", "python")
    interview_id = session["interview_id"]
    interviewer = session["interviewer"]

    # Skip very short code (user just started typing)
    if len(code.strip()) < 20:
        session["last_code"] = code
        return

    # Update stored code and mark as changed
    session["last_code"] = code
    interviewer.code_context = code
    interviewer.language = language
    if code != interviewer.last_code:
        interviewer.code_has_changed = True
        interviewer.last_code = code

    # Analyze code
    analysis = analyzer.analyze(code, language)
    prev_patterns = set(session.get("last_analysis", {}).get("patterns_detected", []))
    new_patterns = set(analysis.get("patterns_detected", []))
    
    session["last_analysis"] = analysis

    # Check for new patterns (that weren't in previous analysis)
    new_detections = new_patterns - prev_patterns
    
    # Skip patterns that always appear on first keystrokes
    trivial_patterns = {"no_error_handling", "global_state"}
    meaningful_detections = new_detections - trivial_patterns
    
    if meaningful_detections:
        # Notify client about detected patterns
        await websocket.send_json({
            "type": "analysis_trigger",
            "patterns": list(meaningful_detections),
        })

        # Check cooldown
        import time
        current_time = time.time()
        if current_time - interviewer.last_question_time < interviewer.QUESTION_COOLDOWN:
            return

        # Use the analyzer's suggested questions directly, or ask AI
        suggested = analysis.get("suggested_questions", [])
        
        if suggested:
            # Use the first relevant suggested question
            question = suggested[0]
            
            # Avoid repeating the same question
            if question in interviewer.questions_asked[-5:]:
                return
            
            interviewer.questions_asked.append(question)
            interviewer.last_question_time = current_time
            
            await websocket.send_json({"type": "ai_typing", "status": True})
            
            # Use AI to make the question more contextual
            enriched_response = await interviewer.chat(
                user_message=f"[The candidate just wrote code that uses: {', '.join(meaningful_detections)}. "
                             f"Ask them about it naturally, as an interviewer would. "
                             f"Suggested angle: {question}]",
                code=code,
                ast_analysis=analysis,
            )
            
            await websocket.send_json({"type": "ai_typing", "status": False})
            await websocket.send_json({
                "type": "follow_up",
                "content": enriched_response,
                "patterns": list(meaningful_detections),
            })
            await _save_message(interview_id, "assistant", enriched_response)
            session["message_count"] += 1


async def _handle_transcript(websocket: WebSocket, connection_id: str, message: dict):
    """Handle voice transcript (same as user_message but from STT)."""
    transcript = message.get("text", "")
    if transcript.strip():
        message["content"] = transcript
        message["type"] = "user_message"
        await _handle_user_message(websocket, connection_id, message)


async def _save_message(interview_id: str, role: str, content: str):
    """Save a message to the database."""
    if not interview_id:
        return
    try:
        async with async_session() as session:
            msg = InterviewMessage(
                interview_id=interview_id,
                role=role,
                content=content,
            )
            session.add(msg)
            await session.commit()
    except Exception as e:
        logger.error("Failed to save message: %s", e)
