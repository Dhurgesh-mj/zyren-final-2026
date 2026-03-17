"""
Voice Activity Detection using Silero VAD.
Detects speech segments and silence periods.
"""
import logging
import time
from typing import Optional

import numpy as np
import torch

logger = logging.getLogger("interviewlens.vad")

# Lazy load VAD model
_vad_model = None
_vad_utils = None


def _get_vad():
    """Lazy-load the Silero VAD model."""
    global _vad_model, _vad_utils
    if _vad_model is None:
        try:
            logger.info("Loading Silero VAD model...")
            model, utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            _vad_model = model
            _vad_utils = utils
            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.error("Failed to load Silero VAD: %s", e)
            raise
    return _vad_model, _vad_utils


class VoiceActivityDetector:
    """
    Voice Activity Detector using Silero VAD.
    Detects when the user starts/stops speaking.
    Triggers AI response after configurable silence duration.
    """

    def __init__(self, silence_threshold: float = 1.5, sample_rate: int = 16000):
        """
        Args:
            silence_threshold: Seconds of silence before triggering AI response
            sample_rate: Audio sample rate (must be 16000 for Silero)
        """
        self.silence_threshold = silence_threshold
        self.sample_rate = sample_rate
        self.is_speaking = False
        self.last_speech_time: float = 0
        self.speech_started_time: float = 0
        self.accumulated_audio: list[np.ndarray] = []
        self._speech_probability_threshold = 0.5

    def process_chunk(self, audio_chunk: bytes) -> dict:
        """
        Process an audio chunk and return VAD results.
        
        Args:
            audio_chunk: Raw audio bytes (16-bit PCM, 16kHz, mono)
            
        Returns:
            Dictionary with VAD state:
            - is_speech: Whether speech is detected
            - speech_ended: Whether speech just ended (silence > threshold)
            - speech_probability: Confidence score
            - duration: Duration of speech segment
        """
        try:
            model, _ = _get_vad()
            
            # Convert bytes to tensor
            audio_np = np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32) / 32768.0
            audio_tensor = torch.from_numpy(audio_np)
            
            # Ensure correct chunk size (512 samples for 16kHz)
            if len(audio_tensor) < 512:
                audio_tensor = torch.nn.functional.pad(audio_tensor, (0, 512 - len(audio_tensor)))
            elif len(audio_tensor) > 512:
                audio_tensor = audio_tensor[:512]
            
            # Get speech probability
            speech_prob = model(audio_tensor, self.sample_rate).item()
            
            current_time = time.time()
            is_speech = speech_prob > self._speech_probability_threshold
            speech_ended = False
            
            if is_speech:
                if not self.is_speaking:
                    self.speech_started_time = current_time
                    self.accumulated_audio = []
                self.is_speaking = True
                self.last_speech_time = current_time
                self.accumulated_audio.append(audio_np)
            else:
                if self.is_speaking:
                    silence_duration = current_time - self.last_speech_time
                    if silence_duration >= self.silence_threshold:
                        speech_ended = True
                        self.is_speaking = False
            
            return {
                "is_speech": is_speech,
                "speech_ended": speech_ended,
                "speech_probability": round(speech_prob, 3),
                "duration": round(current_time - self.speech_started_time, 2) if self.is_speaking else 0,
                "silence_duration": round(current_time - self.last_speech_time, 2) if self.last_speech_time > 0 else 0,
            }

        except Exception as e:
            logger.error("VAD processing error: %s", e)
            return {
                "is_speech": False,
                "speech_ended": False,
                "speech_probability": 0.0,
                "duration": 0,
                "silence_duration": 0,
            }

    def get_accumulated_audio(self) -> Optional[bytes]:
        """Get all accumulated speech audio as bytes."""
        if not self.accumulated_audio:
            return None
        
        combined = np.concatenate(self.accumulated_audio)
        audio_int16 = (combined * 32768).astype(np.int16)
        return audio_int16.tobytes()

    def reset(self):
        """Reset VAD state."""
        self.is_speaking = False
        self.last_speech_time = 0
        self.speech_started_time = 0
        self.accumulated_audio = []
