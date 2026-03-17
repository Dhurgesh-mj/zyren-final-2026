"""
WebSocket handler for voice streaming with TTS integration.
Handles audio input, VAD processing, STT transcription, and TTS responses.
Enables full voice-to-voice conversation.
"""
import json
import logging
import base64
import asyncio
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from stt.whisper_stt import WhisperSTT
from stt.vad import VoiceActivityDetector

# TTS is optional - stub if not available
class _StubTTS:
    async def synthesize_speech(self, text):
        return None

try:
    from stt.tts import TTSEngine
except ImportError:
    TTSEngine = _StubTTS

logger = logging.getLogger("interviewlens.ws.voice")

router = APIRouter()

# Active voice connections
voice_connections: Dict[str, dict] = {}


@router.websocket("/ws/voice-stream")
async def voice_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for voice streaming with voice-to-voice support.
    
    Messages from client:
    - { "type": "audio_chunk", "audio_data": "<base64>", "interview_id": "..." }
    - { "type": "start_recording" }
    - { "type": "stop_recording" }
    - { "type": "get_ai_response", "text": "...", "interview_id": "..." }
    - { "type": "stop_tts" }
    
    Messages to client:
    - { "type": "vad_status", "data": { ... } }
    - { "type": "transcript", "text": "...", "final": true/false }
    - { "type": "speech_ended", "transcript": "..." }
    - { "type": "ai_response", "text": "...", "audio": "<base64>" }
    - { "type": "tts_started" }
    - { "type": "tts_ended" }
    - { "type": "tts_chunk", "audio": "<base64>" }
    """
    await websocket.accept()
    connection_id = str(id(websocket))
    
    # Initialize per-connection state
    stt = WhisperSTT()
    vad = VoiceActivityDetector(silence_threshold=1.5)
    tts = TTSEngine()
    
    voice_connections[connection_id] = {
        "websocket": websocket,
        "stt": stt,
        "vad": vad,
        "tts": tts,
        "recording": False,
        "transcript_buffer": [],
        "tts_active": False,
        "interview_id": None,
    }
    
    logger.info("Voice stream connected: %s", connection_id)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "")

            if msg_type == "audio_chunk":
                await _handle_audio_chunk(connection_id, message)
            elif msg_type == "start_recording":
                voice_connections[connection_id]["recording"] = True
                voice_connections[connection_id]["interview_id"] = message.get("interview_id")
                vad.reset()
                await websocket.send_json({"type": "recording_started"})
            elif msg_type == "stop_recording":
                await _handle_stop_recording(connection_id)
            elif msg_type == "get_ai_response":
                await _handle_ai_response(connection_id, message)
            elif msg_type == "stop_tts":
                await _handle_stop_tts(connection_id)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("Voice stream disconnected: %s", connection_id)
    except Exception as e:
        logger.error("Voice stream error: %s", e)
    finally:
        voice_connections.pop(connection_id, None)


async def _handle_audio_chunk(connection_id: str, message: dict):
    """Process incoming audio chunk through VAD and optionally STT."""
    conn = voice_connections.get(connection_id)
    if not conn or not conn["recording"]:
        return

    websocket = conn["websocket"]
    vad = conn["vad"]
    stt = conn["stt"]
    audio_b64 = message.get("audio_data", "")

    if not audio_b64:
        return

    try:
        # Decode audio
        audio_bytes = base64.b64decode(audio_b64)
        
        # Process through VAD
        vad_result = vad.process_chunk(audio_bytes)
        
        # Send VAD status
        await websocket.send_json({
            "type": "vad_status",
            "data": vad_result,
        })
        
        # If speech ended (silence > 1.5s), transcribe accumulated audio
        if vad_result["speech_ended"]:
            accumulated = vad.get_accumulated_audio()
            if accumulated:
                # Transcribe the speech segment
                transcript = await stt.transcribe_audio(accumulated)
                
                if transcript:
                    conn["transcript_buffer"].append(transcript)
                    
                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript,
                        "final": True,
                    })
                    
                    # Signal that speech ended (AI can now respond)
                    full_transcript = " ".join(conn["transcript_buffer"])
                    await websocket.send_json({
                        "type": "speech_ended",
                        "transcript": transcript,
                        "full_transcript": full_transcript,
                    })
                    
                    # Auto-get AI response for voice-to-voice
                    interview_id = conn.get("interview_id")
                    if interview_id:
                        await _trigger_ai_response(connection_id, full_transcript, interview_id)
            
            vad.reset()

    except Exception as e:
        logger.error("Audio chunk processing error: %s", e)


async def _trigger_ai_response(connection_id: str, transcript: str, interview_id: str):
    """Trigger AI response and convert to speech."""
    conn = voice_connections.get(connection_id)
    if not conn:
        return
    
    websocket = conn["websocket"]
    
    try:
        # Get AI response from the interviewer
        from websocket.ai_interviewer import ai_sessions
        
        # Find the AI session for this interview
        ai_session = None
        for session in ai_sessions.values():
            if session.get("interview_id") == interview_id:
                ai_session = session
                break
        
        if not ai_session:
            logger.warning("No AI session found for interview: %s", interview_id)
            return
        
        interviewer = ai_session.get("interviewer")
        if not interviewer:
            return
        
        # Get AI response
        conn["tts_active"] = True
        await websocket.send_json({"type": "tts_started"})
        
        response = await interviewer.chat(
            user_message=transcript,
            code=ai_session.get("last_code"),
            ast_analysis=ai_session.get("last_analysis"),
        )
        
        # Send text response
        await websocket.send_json({
            "type": "ai_response",
            "text": response,
        })
        
        # Convert to speech and stream
        await _stream_tts(connection_id, response)
        
    except Exception as e:
        logger.error("AI response error: %s", e)
    finally:
        conn["tts_active"] = False
        await websocket.send_json({"type": "tts_ended"})


async def _stream_tts(connection_id: str, text: str):
    """Stream TTS audio to the client."""
    conn = voice_connections.get(connection_id)
    if not conn:
        return
    
    websocket = conn["websocket"]
    tts = conn["tts"]
    
    try:
        # Get audio from TTS
        audio_bytes = await tts.synthesize_speech(text)
        
        if audio_bytes:
            # Convert to base64
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            
            await websocket.send_json({
                "type": "tts_audio",
                "audio": audio_b64,
                "text": text,
            })
        else:
            logger.warning("TTS synthesis returned no audio")
            
    except Exception as e:
        logger.error("TTS streaming error: %s", e)


async def _handle_ai_response(connection_id: str, message: dict):
    """Handle request for AI response with TTS."""
    text = message.get("text", "")
    if text:
        await _stream_tts(connection_id, text)


async def _handle_stop_tts(connection_id: str):
    """Stop any active TTS playback."""
    conn = voice_connections.get(connection_id)
    if conn:
        conn["tts_active"] = False


async def _handle_stop_recording(connection_id: str):
    """Handle recording stop - transcribe any remaining audio."""
    conn = voice_connections.get(connection_id)
    if not conn:
        return

    conn["recording"] = False
    websocket = conn["websocket"]
    vad = conn["vad"]
    stt = conn["stt"]

    # Transcribe any remaining audio
    accumulated = vad.get_accumulated_audio()
    if accumulated:
        transcript = await stt.transcribe_audio(accumulated)
        if transcript:
            conn["transcript_buffer"].append(transcript)
            await websocket.send_json({
                "type": "transcript",
                "text": transcript,
                "final": True,
            })

    # Send full transcript
    full_transcript = " ".join(conn["transcript_buffer"])
    await websocket.send_json({
        "type": "recording_stopped",
        "full_transcript": full_transcript,
    })

    # Reset
    vad.reset()
    conn["transcript_buffer"] = []
