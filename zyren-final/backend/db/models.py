"""
SQLAlchemy ORM Models for InterviewLens.
Uses String-based UUIDs for SQLite compatibility.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Text, Integer, Float, DateTime,
    ForeignKey, Index, JSON
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    interviews = relationship("Interview", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    problem = Column(Text, nullable=False)
    problem_title = Column(String(255), nullable=False, default="Untitled Problem")
    language = Column(String(50), nullable=False, default="python")
    code_snapshot = Column(Text)
    transcript = Column(Text)
    ast_analysis = Column(JSON)
    technical_score = Column(Integer)
    problem_solving_score = Column(Integer)
    communication_score = Column(Integer)
    overall_score = Column(Float)
    feedback = Column(Text)
    scorecard = Column(JSON)
    status = Column(String(50), default="in_progress", index=True)
    started_at = Column(DateTime, default=utcnow)
    ended_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    user = relationship("User", back_populates="interviews")
    messages = relationship("InterviewMessage", back_populates="interview", cascade="all, delete-orphan")
    snapshots = relationship("CodeSnapshot", back_populates="interview", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Interview(id={self.id}, status={self.status})>"


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id = Column(String(36), primary_key=True, default=new_uuid)
    interview_id = Column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    message_type = Column(String(50), default="text")
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    interview = relationship("Interview", back_populates="messages")

    __table_args__ = (
        Index("idx_interview_messages_interview_id", "interview_id"),
    )

    def __repr__(self):
        return f"<InterviewMessage(id={self.id}, role={self.role})>"


class CodeSnapshot(Base):
    __tablename__ = "code_snapshots"

    id = Column(String(36), primary_key=True, default=new_uuid)
    interview_id = Column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False)
    code = Column(Text, nullable=False)
    language = Column(String(50), nullable=False)
    analysis = Column(JSON)
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    interview = relationship("Interview", back_populates="snapshots")

    __table_args__ = (
        Index("idx_code_snapshots_interview_id", "interview_id"),
    )

    def __repr__(self):
        return f"<CodeSnapshot(id={self.id}, language={self.language})>"
