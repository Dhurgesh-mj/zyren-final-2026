"""
Database connection and session management.
Supports both PostgreSQL (production) and SQLite (local development).
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

settings = get_settings()

# Build engine kwargs - SQLite doesn't support pool_size/max_overflow
engine_kwargs = {
    "echo": settings.DEBUG,
}

if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite-specific settings
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL-specific settings
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency: yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
