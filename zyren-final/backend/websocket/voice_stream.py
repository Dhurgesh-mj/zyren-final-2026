"""
WebSocket handler for voice streaming.
Handles audio input, VAD processing, and STT transcription.
"""
import json
import logging
import base64
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from stt.whisper_stt import WhisperSTT
from stt.vad import VoiceActivityDetector

logger = logging.getLogger("interviewlens.ws.voice")

router = APIRouter()

# Active voice connections
voice_connections: Dict[str, dict] = {}


@router.websocket("/ws/voice-stream")
async def voice_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for voice streaming.
    
    Messages from client:
    - { "type": "audio_chunk", "audio_data": "<base64>", "interview_id": "..." }
    - { "type": "start_recording" }
    - { "type": "stop_recording" }
    
    Messages to client:
    - { "type": "vad_status", "data": { ... } }
    - { "type": "transcript", "text": "...", "final": true/false }
    - { "type": "speech_ended" }
    """
    await websocket.accept()
    connection_id = str(id(websocket))
    
    # Initialize per-connection state
    stt = WhisperSTT()
    vad = VoiceActivityDetector(silence_threshold=1.5)
    
    voice_connections[connection_id] = {
        "websocket": websocket,
        "stt": stt,
        "vad": vad,
        "recording": False,
        "transcript_buffer": [],
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
                vad.reset()
                await websocket.send_json({"type": "recording_started"})
            elif msg_type == "stop_recording":
                await _handle_stop_recording(connection_id)
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
                    await websocket.send_json({
                        "type": "speech_ended",
                        "transcript": transcript,
                        "full_transcript": " ".join(conn["transcript_buffer"]),
                    })
            
            vad.reset()

    except Exception as e:
        logger.error("Audio chunk processing error: %s", e)


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
