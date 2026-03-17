"""STT (Speech-to-Text) package."""
from .whisper_stt import WhisperSTT
from .vad import VoiceActivityDetector

__all__ = ["WhisperSTT", "VoiceActivityDetector"]
