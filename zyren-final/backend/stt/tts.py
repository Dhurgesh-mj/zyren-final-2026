"""
Text-to-Speech engine for AI voice responses.
Uses Coqui TTS for high-quality local synthesis.
"""
import logging
import asyncio
from typing import Optional

import numpy as np

logger = logging.getLogger("interviewlens.tts")

_tts_model = None


def _get_model():
    """Lazy-load the TTS model."""
    global _tts_model
    if _tts_model is None:
        try:
            from TTS.api import TTS
            logger.info("Loading Coqui TTS model...")
            _tts_model = TTS(model_name="tts_models/en/ljspeech/fast_pitch", gpu=False)
            logger.info("Coqui TTS model loaded successfully")
        except Exception as e:
            logger.error("Failed to load TTS model: %s", e)
            raise
    return _tts_model


class TTSEngine:
    """
    Text-to-Speech engine using Coqui TTS.
    Converts AI text responses to audio for voice-to-voice conversation.
    """

    def __init__(self):
        self.sample_rate = 22050

    async def synthesize_speech(self, text: str) -> Optional[bytes]:
        """
        Convert text to speech audio.
        
        Args:
            text: Text to synthesize
            
        Returns:
            Audio bytes (16-bit PCM, 16kHz) or None on failure
        """
        if not text or not text.strip():
            return None
            
        try:
            model = _get_model()
            
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            audio_np = await loop.run_in_executor(
                None, 
                lambda: model.tts(text)
            )
            
            # Convert to numpy array if needed
            if isinstance(audio_np, list):
                audio_np = np.array(audio_np)
            
            # Resample to 16kHz for consistent playback
            audio_16k = self._resample(audio_np, self.sample_rate, 16000)
            
            # Convert to 16-bit PCM
            audio_int16 = (audio_16k * 32767).astype(np.int16)
            
            return audio_int16.tobytes()
            
        except Exception as e:
            logger.error("TTS synthesis failed: %s", e)
            return None

    def _resample(self, audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """Simple resampling using linear interpolation."""
        if orig_sr == target_sr:
            return audio
            
        duration = len(audio) / orig_sr
        target_length = int(duration * target_sr)
        
        indices = np.linspace(0, len(audio) - 1, target_length)
        return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)

    async def synthesize_streaming(self, text: str, chunk_size: int = 1024):
        """
        Synthesize speech in chunks for streaming playback.
        
        Yields:
            Audio chunks (bytes)
        """
        try:
            model = _get_model()
            loop = asyncio.get_event_loop()
            
            # Generate full audio first (simpler for now)
            audio_np = await loop.run_in_executor(
                None,
                lambda: model.tts(text)
            )
            
            if isinstance(audio_np, list):
                audio_np = np.array(audio_np)
            
            # Resample
            audio_16k = self._resample(audio_np, self.sample_rate, 16000)
            audio_int16 = (audio_16k * 32767).astype(np.int16)
            
            # Yield in chunks
            for i in range(0, len(audio_int16), chunk_size):
                yield audio_int16[i:i + chunk_size].tobytes()
                
        except Exception as e:
            logger.error("Streaming TTS failed: %s", e)
