"""
Whisper-based Speech-to-Text engine.
Uses OpenAI's Whisper model for local transcription.
"""
import io
import logging
import tempfile
import base64
from typing import Optional

import numpy as np

logger = logging.getLogger("interviewlens.stt")

# Lazy load whisper to reduce startup time
_whisper_model = None


def _get_model():
    """Lazy-load the Whisper model."""
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            from config import get_settings
            settings = get_settings()
            model_name = settings.WHISPER_MODEL
            logger.info("Loading Whisper model: %s", model_name)
            _whisper_model = whisper.load_model(model_name)
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error("Failed to load Whisper model: %s", e)
            raise
    return _whisper_model


class WhisperSTT:
    """
    Speech-to-Text engine using OpenAI Whisper.
    Processes audio data and returns transcription text.
    """

    def __init__(self):
        self.sample_rate = 16000

    async def transcribe_audio(self, audio_data: bytes) -> str:
        """
        Transcribe raw audio bytes to text.
        
        Args:
            audio_data: Raw audio bytes (16-bit PCM, 16kHz, mono)
            
        Returns:
            Transcribed text string
        """
        try:
            model = _get_model()
            
            # Convert bytes to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Transcribe
            result = model.transcribe(
                audio_np,
                fp16=False,
                language="en",
                task="transcribe",
            )
            
            text = result.get("text", "").strip()
            logger.debug("Transcribed: %s", text[:100])
            return text

        except Exception as e:
            logger.error("Transcription failed: %s", e)
            return ""

    async def transcribe_base64(self, audio_b64: str) -> str:
        """
        Transcribe base64-encoded audio data.
        
        Args:
            audio_b64: Base64-encoded audio data
            
        Returns:
            Transcribed text string
        """
        try:
            audio_bytes = base64.b64decode(audio_b64)
            return await self.transcribe_audio(audio_bytes)
        except Exception as e:
            logger.error("Base64 transcription failed: %s", e)
            return ""

    async def transcribe_file(self, file_path: str) -> str:
        """
        Transcribe an audio file.
        
        Args:
            file_path: Path to audio file
            
        Returns:
            Transcribed text string
        """
        try:
            model = _get_model()
            result = model.transcribe(
                file_path,
                fp16=False,
                language="en",
            )
            return result.get("text", "").strip()
        except Exception as e:
            logger.error("File transcription failed: %s", e)
            return ""
