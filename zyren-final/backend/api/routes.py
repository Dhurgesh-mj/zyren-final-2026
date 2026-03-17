"""
REST API Routes for InterviewLens.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from db.database import get_db
from db.models import User, Interview, InterviewMessage, GeneratedProblem
from db.schemas import (
    InterviewStart, InterviewResponse, InterviewEnd,
    ScorecardResponse, CodeExecutionRequest, CodeExecutionResponse,
    UserCreate, UserResponse,
)
from ai.scorecard import generate_scorecard
from sandbox.executor import execute_code

logger = logging.getLogger("interviewlens.api")

router = APIRouter()

# In-memory session storage (use Redis in production)
sessions = {}

# ─── Demo user ID for MVP ─────────────────────────────────
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


# ═══════════════════════════════════════════════════════════
# ─── AUTH ENDPOINTS ──────────────────────────────────────
# ═══════════════════════════════════════════════════════════


class AuthRequest(BaseModel):
    email: str
    password: str
    name: str = ""


@router.post("/auth/register")
async def register(
    request: AuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user."""
    # Check if user exists
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password (simple hash for demo - use bcrypt in production)
    import hashlib
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    
    # Create user
    user = User(
        id=str(uuid.uuid4()),
        name=request.name,
        email=request.email,
        password_hash=password_hash,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create session
    session_token = str(uuid.uuid4())
    sessions[session_token] = user.id
    
    return {
        "token": session_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        }
    }


@router.post("/auth/login")
async def login(
    request: AuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login user."""
    # Hash password
    import hashlib
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    
    # Find user
    result = await db.execute(
        select(User).where(User.email == request.email, User.password_hash == password_hash)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create session
    session_token = str(uuid.uuid4())
    sessions[session_token] = user.id
    
    return {
        "token": session_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
        }
    }


@router.post("/auth/logout")
async def logout(token: str):
    """Logout user."""
    sessions.pop(token, None)
    return {"message": "Logged out successfully"}


@router.get("/auth/me")
async def get_current_user(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get current user from token."""
    user_id = sessions.get(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "skills": user.skills or [],
        "total_interviews": user.total_interviews,
    }


def get_current_user_id(token: Optional[str] = None) -> str:
    """Helper to get user ID from token."""
    if not token:
        return DEMO_USER_ID
    return sessions.get(token, DEMO_USER_ID)


async def get_user_from_token(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get user from Authorization header."""
    token = None
    if authorization and authorization.startswith('Bearer '):
        token = authorization[7:]
    
    user_id = get_current_user_id(token)
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Create demo user if not found
        user = User(
            id=DEMO_USER_ID,
            name="Demo User",
            email="demo@interviewlens.dev",
            password_hash="demo",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    return user


@router.get("/profile")
async def get_profile(
    user: User = Depends(get_user_from_token),
):
    """Get the current user's profile."""
    
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "phone": user.phone,
        "location": user.location,
        "github_url": user.github_url,
        "linkedin_url": user.linkedin_url,
        "website_url": user.website_url,
        "skills": user.skills or [],
        "experience_years": user.experience_years,
        "education": user.education or [],
        "preferred_languages": user.preferred_languages or ["python"],
        "total_interviews": user.total_interviews,
        "avg_technical_score": user.avg_technical_score,
        "avg_problem_solving_score": user.avg_problem_solving_score,
        "avg_communication_score": user.avg_communication_score,
        "streak_days": user.streak_days,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }





@router.put("/profile")
async def update_profile(
    data: dict,
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile."""
    # Re-fetch so we can modify within this session
    result = await db.execute(
        select(User).where(User.id == user.id)
    )
    db_user = result.scalar_one_or_none()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    updatable = ["name", "bio", "phone", "location", "github_url", "linkedin_url", 
                 "website_url", "skills", "experience_years", "education", 
                 "preferred_languages", "avatar_url"]
    
    for field in updatable:
        if field in data:
            setattr(db_user, field, data[field])
    
    await db.commit()
    await db.refresh(db_user)
    
    return {"message": "Profile updated successfully"}


@router.get("/profile/stats")
async def get_profile_stats(
    user: User = Depends(get_user_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Get user's interview statistics."""
    
    result = await db.execute(
        select(Interview).where(Interview.user_id == user.id)
    )
    interviews = result.scalars().all()
    
    completed = [i for i in interviews if i.status == "completed" and i.overall_score]
    
    total = len(completed)
    if total > 0:
        avg_technical = sum(i.technical_score or 0 for i in completed) / total
        avg_problem_solving = sum(i.problem_solving_score or 0 for i in completed) / total
        avg_communication = sum(i.communication_score or 0 for i in completed) / total
        avg_overall = sum(i.overall_score or 0 for i in completed) / total
    else:
        avg_technical = avg_problem_solving = avg_communication = avg_overall = 0
    
    # Recent interviews
    recent = sorted(interviews, key=lambda x: x.created_at, reverse=True)[:5]
    
    return {
        "total_interviews": len(interviews),
        "completed_interviews": total,
        "average_scores": {
            "technical": round(avg_technical, 1),
            "problem_solving": round(avg_problem_solving, 1),
            "communication": round(avg_communication, 1),
            "overall": round(avg_overall, 1),
        },
        "recent_interviews": [
            {
                "id": str(i.id),
                "problem_title": i.problem_title,
                "overall_score": i.overall_score,
                "status": i.status,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in recent
        ],
    }


# ═══════════════════════════════════════════════════════════
# ─── AI PROBLEM GENERATION ENDPOINTS ─────────────────────
# ═══════════════════════════════════════════════════════════


@router.post("/generate-problem")
async def generate_problem_endpoint(
    difficulty: str = "Medium",
    category: str = "Arrays",
    topic: str = "",
):
    """Generate a new coding problem using AI."""
    from ai.question_generator import generate_problem
    
    problem = await generate_problem(
        difficulty=difficulty,
        category=category,
        topic=topic,
    )
    
    if not problem:
        raise HTTPException(status_code=500, detail="Failed to generate problem")
    
    return problem


@router.post("/generate-problems")
async def generate_problems_batch(
    count: int = 5,
    difficulty: str = "Mixed",
    categories: list = None,
):
    """Generate multiple problems using AI."""
    from ai.question_generator import generate_problem_batch
    
    problems = await generate_problem_batch(
        count=count,
        difficulty=difficulty,
        categories=categories,
    )
    
    return {"problems": problems}


@router.get("/categories")
async def get_categories():
    """Get available problem categories."""
    from ai.question_generator import CATEGORIES
    return {"categories": CATEGORIES}


@router.post("/save-problem")
async def save_generated_problem(
    problem_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """Save a generated problem to the database."""
    from db.models import GeneratedProblem
    
    problem = GeneratedProblem(
        user_id=DEMO_USER_ID,
        title=problem_data.get("title"),
        description=problem_data.get("description"),
        difficulty=problem_data.get("difficulty", "Medium"),
        category=problem_data.get("category"),
        tags=problem_data.get("tags", []),
        generated_by="ai",
        starter_code=problem_data.get("starter_code"),
        test_cases=problem_data.get("test_cases", []),
        solution_code=problem_data.get("solution_code"),
        solution_explanation=problem_data.get("solution_explanation"),
    )
    
    db.add(problem)
    await db.commit()
    await db.refresh(problem)
    
    return {"id": str(problem.id), "message": "Problem saved successfully"}


# Built-in interview problems
INTERVIEW_PROBLEMS = [
    {
        "id": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.",
        "category": "Arrays",
        "starter_code": {
            "python": "def two_sum(nums, target):\n    # Your code here\n    pass\n",
            "javascript": "function twoSum(nums, target) {\n    // Your code here\n}\n",
            "java": "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your code here\n        return new int[]{};\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your code here\n        return {};\n    }\n};\n",
        },
    },
    {
        "id": "reverse-linked-list",
        "title": "Reverse Linked List",
        "difficulty": "Easy",
        "description": "Given the head of a singly linked list, reverse the list, and return the reversed list.",
        "category": "Linked Lists",
        "starter_code": {
            "python": "class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head):\n    # Your code here\n    pass\n",
            "javascript": "class ListNode {\n    constructor(val = 0, next = null) {\n        this.val = val;\n        this.next = next;\n    }\n}\n\nfunction reverseList(head) {\n    // Your code here\n}\n",
        },
    },
    {
        "id": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "Easy",
        "description": "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
        "category": "Strings",
        "starter_code": {
            "python": "def is_valid(s):\n    # Your code here\n    pass\n",
            "javascript": "function isValid(s) {\n    // Your code here\n}\n",
        },
    },
    {
        "id": "merge-sort",
        "title": "Merge Sort",
        "difficulty": "Medium",
        "description": "Implement the merge sort algorithm. Your function should take an unsorted array and return a sorted array.",
        "category": "Sorting",
        "starter_code": {
            "python": "def merge_sort(arr):\n    # Your code here\n    pass\n",
            "javascript": "function mergeSort(arr) {\n    // Your code here\n}\n",
        },
    },
    {
        "id": "binary-search",
        "title": "Binary Search",
        "difficulty": "Easy",
        "description": "Implement binary search to find a target value in a sorted array. Return the index if found, -1 otherwise.",
        "category": "Searching",
        "starter_code": {
            "python": "def binary_search(nums, target):\n    # Your code here\n    return -1\n",
            "javascript": "function binarySearch(nums, target) {\n    // Your code here\n    return -1;\n}\n",
        },
    },
]


@router.get("/problems")
async def get_problems():
    """Get list of available interview problems."""
    return INTERVIEW_PROBLEMS


@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str):
    """Get a specific problem by ID."""
    for problem in INTERVIEW_PROBLEMS:
        if problem["id"] == problem_id:
            return problem
    raise HTTPException(status_code=404, detail="Problem not found")


# ═══════════════════════════════════════════════════════════
# ─── INTERVIEW ENDPOINTS ─────────────────────────────────
# ═══════════════════════════════════════════════════════════


@router.post("/start-interview")
async def start_interview(
    data: InterviewStart,
    db: AsyncSession = Depends(get_db),
):
    """Start a new interview session."""
    interview = Interview(
        id=str(uuid.uuid4()),
        user_id=DEMO_USER_ID,
        problem=data.problem,
        problem_title=data.problem_title,
        language=data.language,
        status="active",
        started_at=datetime.now(timezone.utc),
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)
    
    return {
        "id": interview.id,
        "status": interview.status,
        "started_at": interview.started_at.isoformat() if interview.started_at else None,
    }


@router.post("/end-interview/{interview_id}")
async def end_interview(
    interview_id: str,
    data: InterviewEnd,
    db: AsyncSession = Depends(get_db),
):
    """End an interview and generate scorecard."""
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    # Get messages for this interview
    msg_result = await db.execute(
        select(InterviewMessage).where(InterviewMessage.interview_id == interview_id)
    )
    messages = msg_result.scalars().all()
    
    # Update interview record
    interview.code_snapshot = data.code_snapshot or interview.code_snapshot
    interview.transcript = data.transcript or interview.transcript
    interview.status = "completed"
    interview.ended_at = datetime.now(timezone.utc)
    
    # Generate scorecard
    try:
        scorecard = await generate_scorecard(
            problem=interview.problem,
            code=interview.code_snapshot or "",
            transcript=interview.transcript or "",
            language=interview.language,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        interview.scorecard = scorecard
        interview.overall_score = scorecard.get("overall_score", 0)
        interview.technical_score = scorecard.get("technical_score", 0)
        interview.problem_solving_score = scorecard.get("problem_solving_score", 0)
        interview.communication_score = scorecard.get("communication_score", 0)
        interview.feedback = scorecard.get("feedback", "")
    except Exception as e:
        logger.error(f"Scorecard generation failed: {e}")
        scorecard = {
            "overall_score": 5,
            "technical_score": 5,
            "problem_solving_score": 5,
            "communication_score": 5,
            "feedback": "Score generation encountered an error. Please try again.",
            "strengths": [],
            "improvements": ["Could not evaluate fully"],
        }
        interview.scorecard = scorecard
        interview.overall_score = 5
    
    await db.commit()
    
    return {
        "id": interview.id,
        "status": "completed",
        "scorecard": scorecard,
    }


@router.get("/scorecard/{interview_id}")
async def get_scorecard(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get scorecard for a completed interview."""
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    return {
        "interview_id": interview.id,
        "scorecard": interview.scorecard,
        "overall_score": interview.overall_score,
        "status": interview.status,
    }


@router.get("/interviews")
async def get_interviews(
    db: AsyncSession = Depends(get_db),
):
    """Get list of user's interviews."""
    result = await db.execute(
        select(Interview)
        .where(Interview.user_id == DEMO_USER_ID)
        .order_by(Interview.created_at.desc())
    )
    interviews = result.scalars().all()
    
    return [
        {
            "id": i.id,
            "problem_title": i.problem_title,
            "language": i.language,
            "status": i.status,
            "overall_score": i.overall_score,
            "started_at": i.started_at.isoformat() if i.started_at else None,
            "ended_at": i.ended_at.isoformat() if i.ended_at else None,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in interviews
    ]


@router.get("/interviews/{interview_id}")
async def get_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific interview with its messages."""
    result = await db.execute(
        select(Interview)
        .where(Interview.id == interview_id)
        .options(selectinload(Interview.messages))
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    return {
        "id": interview.id,
        "problem_title": interview.problem_title,
        "language": interview.language,
        "status": interview.status,
        "code_snapshot": interview.code_snapshot,
        "scorecard": interview.scorecard,
        "overall_score": interview.overall_score,
        "started_at": interview.started_at.isoformat() if interview.started_at else None,
        "ended_at": interview.ended_at.isoformat() if interview.ended_at else None,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.created_at.isoformat() if m.created_at else None,
            }
            for m in interview.messages
        ],
    }


# ═══════════════════════════════════════════════════════════
# ─── CODE EXECUTION & TESTING ────────────────────────────
# ═══════════════════════════════════════════════════════════


@router.post("/execute")
async def execute_code_endpoint(
    request: CodeExecutionRequest,
):
    """Execute code in sandbox."""
    result = await execute_code(
        code=request.code,
        language=request.language,
        stdin=request.stdin or "",
    )
    return result


class RunTestsRequest(BaseModel):
    code: str


@router.post("/run-tests")
async def run_tests(
    body: RunTestsRequest,
    problem_id: str = "two-sum",
    language: str = "python",
):
    """Run test cases for a problem."""
    # Find the problem
    problem = None
    for p in INTERVIEW_PROBLEMS:
        if p["id"] == problem_id:
            problem = p
            break
    
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    
    test_cases = problem.get("test_cases", [])
    if not test_cases:
        return {
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "results": [],
            "message": "No test cases available for this problem.",
        }
    
    results = []
    passed = 0
    failed = 0
    
    for i, tc in enumerate(test_cases):
        test_code = f"{body.code}\n\nprint({tc['input']})"
        try:
            exec_result = await execute_code(
                code=test_code,
                language=language,
            )
            actual = exec_result.get("stdout", "").strip()
            expected = tc["expected"].strip()
            is_pass = actual == expected
            if is_pass:
                passed += 1
            else:
                failed += 1
            results.append({
                "test_case": i + 1,
                "input": tc["input"],
                "expected": expected,
                "actual": actual,
                "passed": is_pass,
                "error": exec_result.get("stderr", ""),
            })
        except Exception as e:
            failed += 1
            results.append({
                "test_case": i + 1,
                "input": tc["input"],
                "expected": tc["expected"],
                "actual": "",
                "passed": False,
                "error": str(e),
            })
    
    return {
        "total_tests": len(test_cases),
        "passed": passed,
        "failed": failed,
        "results": results,
    }


# ═══════════════════════════════════════════════════════════
# ─── ACTIVITY TRACKING ───────────────────────────────────
# ═══════════════════════════════════════════════════════════


@router.post("/activity")
async def track_activity(
    data: dict = {},
):
    """Track user activity (stub for now)."""
    return {"status": "ok"}


@router.get("/status")
async def get_status():
    """Get backend status for health checks."""
    return {
        "status": "online",
        "ollama": True,
        "version": "1.0.0",
    }


@router.get("/my-problems")
async def get_my_problems(
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    """Get user's saved/generated problems."""
    result = await db.execute(
        select(GeneratedProblem)
        .where(GeneratedProblem.user_id == DEMO_USER_ID)
        .order_by(GeneratedProblem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    problems = result.scalars().all()
    
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "description": p.description[:200] + "..." if len(p.description or "") > 200 else p.description,
            "difficulty": p.difficulty,
            "category": p.category,
            "tags": p.tags,
            "times_used": p.times_used,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in problems
    ]
