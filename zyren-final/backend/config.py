"""
InterviewLens Backend Configuration
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Determine base directory for SQLite fallback
BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    APP_NAME: str = "InterviewLens"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database
    # Use SQLite by default for local dev; set DATABASE_URL env var for Postgres
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR / 'interviewlens.db'}"
    DATABASE_URL_SYNC: str = f"sqlite:///{BASE_DIR / 'interviewlens.db'}"
    
    # Ollama
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    
    # Whisper
    WHISPER_MODEL: str = "base"
    
    # Sandbox
    SANDBOX_ENABLED: bool = False  # Set True when Docker is available
    SANDBOX_TIMEOUT: int = 5
    SANDBOX_MEMORY_LIMIT: str = "128m"
    SANDBOX_CPU_LIMIT: float = 0.5
    SANDBOX_IMAGE: str = "interviewlens-sandbox"
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # JWT
    SECRET_KEY: str = "interviewlens-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
