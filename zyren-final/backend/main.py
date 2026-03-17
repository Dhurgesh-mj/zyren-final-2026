"""
InterviewLens - AI Technical Interview Simulator
Main FastAPI Application
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db.database import engine, Base
from api.routes import router as api_router
from websocket.code_stream import router as code_ws_router
from websocket.voice_stream import router as voice_ws_router
from websocket.ai_interviewer import router as ai_ws_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("interviewlens")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Starting InterviewLens Backend v%s", settings.APP_VERSION)
    
    # Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified")
    
    # Seed demo user
    from db.database import async_session
    from db.models import User
    from sqlalchemy import select
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.id == "00000000-0000-0000-0000-000000000001")
        )
        if not result.scalar_one_or_none():
            demo_user = User(
                id="00000000-0000-0000-0000-000000000001",
                name="Demo User",
                email="demo@interviewlens.dev",
                password_hash="demo",
            )
            session.add(demo_user)
            await session.commit()
            logger.info("Demo user created")
    
    yield
    
    # Cleanup
    await engine.dispose()
    logger.info("InterviewLens Backend shutdown complete")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered technical interview simulator with live coding, voice interaction, and dynamic scoring.",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST API routes
app.include_router(api_router, prefix="/api")

# WebSocket routes
app.include_router(code_ws_router)
app.include_router(voice_ws_router)
app.include_router(ai_ws_router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }
