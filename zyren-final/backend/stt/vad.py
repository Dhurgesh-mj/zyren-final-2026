"""
Voice Activity Detection.
Tries Silero VAD first, falls back to energy-based detection.
"""
import logging
import time
from typing import Optional

import numpy as np

logger = logging.getLogger("interviewlens.vad")

# Lazy load VAD model
_vad_model = None
_vad_failed = False


def _get_vad():
    """Lazy-load the Silero VAD model, returns None if unavailable."""
    global _vad_model, _vad_failed
    if _vad_failed:
        return None
    if _vad_model is None:
        try:
            import torch
            logger.info("Loading Silero VAD model...")
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
                trust_repo=True,
            )
            _vad_model = model
            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.warning("Silero VAD unavailable (%s), using energy-based fallback", e)
            _vad_failed = True
            return None
    return _vad_model


class VoiceActivityDetector:
    """
    Voice Activity Detector.
    Uses Silero VAD when available, otherwise falls back to simple
    energy-based speech detection.
    """

    def __init__(self, silence_threshold: float = 1.5, sample_rate: int = 16000):
        self.silence_threshold = silence_threshold
        self.sample_rate = sample_rate
        self.is_speaking = False
        self.last_speech_time: float = 0
        self.speech_started_time: float = 0
        self.accumulated_audio: list[np.ndarray] = []
        self._speech_probability_threshold = 0.5
        # Energy-based fallback threshold (RMS)
        self._energy_threshold = 0.02

    def _detect_speech_energy(self, audio_np: np.ndarray) -> tuple[bool, float]:
        """Simple energy-based speech detection (fallback)."""
        rms = float(np.sqrt(np.mean(audio_np ** 2)))
        is_speech = rms > self._energy_threshold
        # Map RMS to a 0-1 probability-like score
        prob = min(rms / 0.1, 1.0)
        return is_speech, prob

    def _detect_speech_silero(self, audio_np: np.ndarray) -> tuple[bool, float]:
        """Silero VAD speech detection."""
        import torch
        model = _get_vad()
        if model is None:
            return self._detect_speech_energy(audio_np)

        audio_tensor = torch.from_numpy(audio_np)
        # Silero expects 512-sample chunks at 16kHz
        if len(audio_tensor) < 512:
            audio_tensor = torch.nn.functional.pad(audio_tensor, (0, 512 - len(audio_tensor)))
        elif len(audio_tensor) > 512:
            audio_tensor = audio_tensor[:512]

        speech_prob = model(audio_tensor, self.sample_rate).item()
        is_speech = speech_prob > self._speech_probability_threshold
        return is_speech, speech_prob

    def process_chunk(self, audio_chunk: bytes) -> dict:
        """
        Process an audio chunk and return VAD results.

        Args:
            audio_chunk: Raw audio bytes (16-bit PCM, 16kHz, mono)

        Returns:
            Dictionary with VAD state
        """
        try:
            # Convert bytes to float32 normalized audio
            audio_np = np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32) / 32768.0

            if len(audio_np) == 0:
                return self._empty_result()

            # Try Silero first, fall back to energy
            try:
                is_speech, speech_prob = self._detect_speech_silero(audio_np)
            except Exception:
                is_speech, speech_prob = self._detect_speech_energy(audio_np)

            current_time = time.time()
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
            return self._empty_result()

    def _empty_result(self) -> dict:
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
