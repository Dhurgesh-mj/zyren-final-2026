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
    
    # Profile fields
    avatar_url = Column(String(500))
    bio = Column(Text)
    phone = Column(String(20))
    location = Column(String(100))
    github_url = Column(String(200))
    linkedin_url = Column(String(200))
    website_url = Column(String(200))
    skills = Column(JSON)  # List of skills
    experience_years = Column(Integer, default=0)
    education = Column(JSON)  # List of education entries
    preferred_languages = Column(JSON)  # Preferred coding languages
    
    # Stats
    total_interviews = Column(Integer, default=0)
    avg_technical_score = Column(Float, default=0.0)
    avg_problem_solving_score = Column(Float, default=0.0)
    avg_communication_score = Column(Float, default=0.0)
    streak_days = Column(Integer, default=0)
    last_interview_date = Column(DateTime)
    
    # Settings
    is_active = Column(Integer, default=1)
    settings = Column(JSON, default={})
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    interviews = relationship("Interview", back_populates="user", cascade="all, delete-orphan")
    problems = relationship("GeneratedProblem", back_populates="user", cascade="all, delete-orphan")

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


class GeneratedProblem(Base):
    __tablename__ = "generated_problems"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Problem content
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    difficulty = Column(String(20), nullable=False)  # Easy, Medium, Hard
    category = Column(String(50))  # Arrays, Trees, Graphs, DP, etc.
    tags = Column(JSON)  # List of tags
    
    # Generated by AI
    generated_by = Column(String(50), default="ai")  # ai, system, manual
    
    # Starter code templates
    starter_code = Column(JSON)  # {python: "...", javascript: "...", etc.}
    
    # Test cases
    test_cases = Column(JSON)  # List of test cases
    solution_code = Column(Text)  # Reference solution
    solution_explanation = Column(Text)
    
    # Usage stats
    times_used = Column(Integer, default=0)
    avg_score = Column(Float, default=0.0)
    
    # Metadata
    is_public = Column(Integer, default=0)  # 0 = private, 1 = public
    is_favorite = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    user = relationship("User", back_populates="problems")

    __table_args__ = (
        Index("idx_problems_user_id", "user_id"),
        Index("idx_problems_difficulty", "difficulty"),
    )

    def __repr__(self):
        return f"<GeneratedProblem(id={self.id}, title={self.title})>"
