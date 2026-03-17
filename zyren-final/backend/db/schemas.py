"""
Pydantic schemas for request/response validation.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ─── User Schemas ─────────────────────────────────────────

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=6)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Interview Schemas ────────────────────────────────────

class InterviewStart(BaseModel):
    problem: str = Field(..., min_length=10)
    problem_title: str = Field(default="Untitled Problem", max_length=255)
    language: str = Field(default="python", pattern="^(python|javascript)$")


class InterviewResponse(BaseModel):
    id: str
    user_id: str
    problem: str
    problem_title: str
    language: str
    status: str
    started_at: datetime
    code_snapshot: Optional[str] = None
    transcript: Optional[str] = None

    class Config:
        from_attributes = True


class InterviewEnd(BaseModel):
    code_snapshot: Optional[str] = None
    transcript: Optional[str] = None


# ─── Scorecard Schemas ────────────────────────────────────

class ScorecardResponse(BaseModel):
    interview_id: str
    technical_score: int = Field(..., ge=1, le=10)
    problem_solving_score: int = Field(..., ge=1, le=10)
    communication_score: int = Field(..., ge=1, le=10)
    overall_score: float
    feedback: str
    strengths: list[str] = []
    improvements: list[str] = []
    detailed_feedback: dict = {}

    class Config:
        from_attributes = True


# ─── Code Execution Schemas ───────────────────────────────

class CodeExecutionRequest(BaseModel):
    code: str
    language: str = Field(default="python", pattern="^(python|javascript)$")
    stdin: str = ""


class CodeExecutionResponse(BaseModel):
    stdout: str
    stderr: str
    execution_time: float
    exit_code: int
    timed_out: bool = False


# ─── AST Analysis Schemas ─────────────────────────────────

class ASTAnalysisResult(BaseModel):
    patterns_detected: list[str] = []
    complexity_hints: list[str] = []
    suggested_questions: list[str] = []
    functions: list[str] = []
    classes: list[str] = []
    imports: list[str] = []
    loops: int = 0
    recursion_detected: bool = False
    nested_loops_detected: bool = False


# ─── WebSocket Message Schemas ────────────────────────────

class WSCodeMessage(BaseModel):
    type: str = "code_update"
    code: str
    language: str = "python"
    interview_id: Optional[str] = None


class WSAIMessage(BaseModel):
    type: str
    content: str
    interview_id: Optional[str] = None
    role: str = "assistant"


class WSVoiceMessage(BaseModel):
    type: str
    audio_data: Optional[str] = None  # base64 encoded
    transcript: Optional[str] = None
    interview_id: Optional[str] = None
