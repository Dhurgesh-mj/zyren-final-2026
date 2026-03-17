"""
REST API Routes for InterviewLens.
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from db.database import get_db
from db.models import User, Interview, InterviewMessage
from db.schemas import (
    InterviewStart, InterviewResponse, InterviewEnd,
    ScorecardResponse, CodeExecutionRequest, CodeExecutionResponse,
    UserCreate, UserResponse,
)
from ai.scorecard import generate_scorecard
from sandbox.executor import execute_code

logger = logging.getLogger("interviewlens.api")

router = APIRouter()

# ─── Demo user ID for MVP ─────────────────────────────────
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


# ─── Interview Problems ───────────────────────────────────
PROBLEMS = [
    {
        "id": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "description": (
            "Given an array of integers `nums` and an integer `target`, return indices of the "
            "two numbers such that they add up to `target`.\n\n"
            "You may assume that each input would have exactly one solution, and you may not "
            "use the same element twice.\n\n"
            "**Example:**\n"
            "```\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n"
            "Explanation: nums[0] + nums[1] == 9\n```"
        ),
        "starter_code": {
            "python": "def two_sum(nums, target):\n    # Your code here\n    pass\n",
            "javascript": "function twoSum(nums, target) {\n    // Your code here\n}\n",
        },
        "test_cases": [
            {"input": "two_sum([2,7,11,15], 9)", "expected": "[0, 1]"},
            {"input": "two_sum([3,2,4], 6)", "expected": "[1, 2]"},
        ],
    },
    {
        "id": "reverse-linked-list",
        "title": "Reverse Linked List",
        "difficulty": "Easy",
        "description": (
            "Given the head of a singly linked list, reverse the list, and return the reversed list.\n\n"
            "**Example:**\n"
            "```\nInput: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]\n```"
        ),
        "starter_code": {
            "python": (
                "class ListNode:\n    def __init__(self, val=0, next=None):\n"
                "        self.val = val\n        self.next = next\n\n"
                "def reverse_list(head):\n    # Your code here\n    pass\n"
            ),
            "javascript": (
                "class ListNode {\n    constructor(val = 0, next = null) {\n"
                "        this.val = val;\n        this.next = next;\n    }\n}\n\n"
                "function reverseList(head) {\n    // Your code here\n}\n"
            ),
        },
        "test_cases": [],
    },
    {
        "id": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "Easy",
        "description": (
            "Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, "
            "determine if the input string is valid.\n\n"
            "A string is valid if:\n"
            "- Open brackets must be closed by the same type of brackets.\n"
            "- Open brackets must be closed in the correct order.\n\n"
            "**Example:**\n"
            "```\nInput: s = \"()[]{}\"\nOutput: true\n```"
        ),
        "starter_code": {
            "python": "def is_valid(s):\n    # Your code here\n    pass\n",
            "javascript": "function isValid(s) {\n    // Your code here\n}\n",
        },
        "test_cases": [
            {"input": 'is_valid("()[]{}")', "expected": "True"},
            {"input": 'is_valid("(]")', "expected": "False"},
        ],
    },
    {
        "id": "merge-sort",
        "title": "Merge Sort Implementation",
        "difficulty": "Medium",
        "description": (
            "Implement the merge sort algorithm.\n\n"
            "Your function should take an unsorted array and return a sorted array.\n\n"
            "**Example:**\n"
            "```\nInput: [38, 27, 43, 3, 9, 82, 10]\nOutput: [3, 9, 10, 27, 38, 43, 82]\n```"
        ),
        "starter_code": {
            "python": "def merge_sort(arr):\n    # Your code here\n    pass\n",
            "javascript": "function mergeSort(arr) {\n    // Your code here\n}\n",
        },
        "test_cases": [
            {"input": "merge_sort([38, 27, 43, 3, 9, 82, 10])", "expected": "[3, 9, 10, 27, 38, 43, 82]"},
        ],
    },
    {
        "id": "lru-cache",
        "title": "LRU Cache",
        "difficulty": "Hard",
        "description": (
            "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\n"
            "Implement the `LRUCache` class:\n"
            "- `LRUCache(capacity)` Initialize the LRU cache with positive size capacity.\n"
            "- `get(key)` Return the value of the key if the key exists, otherwise return -1.\n"
            "- `put(key, value)` Update the value of the key if the key exists. Otherwise, add the key-value pair.\n\n"
            "**Example:**\n"
            "```\ncache = LRUCache(2)\ncache.put(1, 1)\ncache.put(2, 2)\ncache.get(1)    # returns 1\n```"
        ),
        "starter_code": {
            "python": (
                "class LRUCache:\n    def __init__(self, capacity):\n"
                "        # Your code here\n        pass\n\n"
                "    def get(self, key):\n        # Your code here\n        pass\n\n"
                "    def put(self, key, value):\n        # Your code here\n        pass\n"
            ),
            "javascript": (
                "class LRUCache {\n    constructor(capacity) {\n"
                "        // Your code here\n    }\n\n"
                "    get(key) {\n        // Your code here\n    }\n\n"
                "    put(key, value) {\n        // Your code here\n    }\n}\n"
            ),
        },
        "test_cases": [],
    },
]


@router.get("/problems")
async def list_problems():
    """List all available coding problems."""
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "difficulty": p["difficulty"],
            "description": p["description"][:200] + "...",
        }
        for p in PROBLEMS
    ]


@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str):
    """Get a specific coding problem by ID."""
    for p in PROBLEMS:
        if p["id"] == problem_id:
            return p
    raise HTTPException(status_code=404, detail="Problem not found")


@router.post("/start-interview", response_model=InterviewResponse)
async def start_interview(
    data: InterviewStart,
    db: AsyncSession = Depends(get_db),
):
    """Start a new interview session."""
    interview = Interview(
        user_id=DEMO_USER_ID,
        problem=data.problem,
        problem_title=data.problem_title,
        language=data.language,
        status="in_progress",
    )
    db.add(interview)
    await db.flush()
    
    # Add system message
    system_msg = InterviewMessage(
        interview_id=interview.id,
        role="system",
        content=f"Interview started for problem: {data.problem_title}",
    )
    db.add(system_msg)
    await db.flush()
    
    logger.info("Interview %s started", interview.id)
    return interview


@router.post("/end-interview/{interview_id}")
async def end_interview(
    interview_id: str,
    data: InterviewEnd,
    db: AsyncSession = Depends(get_db),
):
    """End an interview and generate scorecard."""
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.messages))
        .where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    if interview.status == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed")
    
    # Update interview
    interview.status = "completed"
    interview.ended_at = datetime.now(timezone.utc)
    if data.code_snapshot:
        interview.code_snapshot = data.code_snapshot
    if data.transcript:
        interview.transcript = data.transcript
    
    # Generate scorecard
    messages = [{"role": m.role, "content": m.content} for m in interview.messages]
    scorecard = await generate_scorecard(
        code=interview.code_snapshot or "",
        transcript=interview.transcript or "",
        messages=messages,
        problem=interview.problem,
    )
    
    interview.scorecard = scorecard
    interview.technical_score = scorecard.get("technical_score", 5)
    interview.problem_solving_score = scorecard.get("problem_solving_score", 5)
    interview.communication_score = scorecard.get("communication_score", 5)
    interview.overall_score = round(
        (scorecard.get("technical_score", 5) +
         scorecard.get("problem_solving_score", 5) +
         scorecard.get("communication_score", 5)) / 3, 1
    )
    interview.feedback = scorecard.get("feedback", "")
    
    await db.flush()
    
    logger.info("Interview %s completed with score %.1f", interview_id, interview.overall_score)
    return {
        "message": "Interview completed",
        "interview_id": str(interview_id),
        "scorecard": scorecard,
    }


@router.get("/scorecard/{interview_id}", response_model=ScorecardResponse)
async def get_scorecard(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the scorecard for a completed interview."""
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    if interview.status != "completed":
        raise HTTPException(status_code=400, detail="Interview not yet completed")
    
    scorecard = interview.scorecard or {}
    return ScorecardResponse(
        interview_id=interview.id,
        technical_score=interview.technical_score or 5,
        problem_solving_score=interview.problem_solving_score or 5,
        communication_score=interview.communication_score or 5,
        overall_score=interview.overall_score or 5.0,
        feedback=interview.feedback or "",
        strengths=scorecard.get("strengths", []),
        improvements=scorecard.get("improvements", []),
        detailed_feedback=scorecard.get("detailed_feedback", {}),
    )


@router.post("/execute", response_model=CodeExecutionResponse)
async def execute_code_endpoint(data: CodeExecutionRequest):
    """Execute code in a sandboxed Docker container."""
    result = await execute_code(
        code=data.code,
        language=data.language,
        stdin=data.stdin,
    )
    return result


@router.get("/interviews")
async def list_interviews(
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    """List all interviews for the demo user."""
    result = await db.execute(
        select(Interview)
        .where(Interview.user_id == DEMO_USER_ID)
        .order_by(Interview.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    interviews = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "problem_title": i.problem_title,
            "language": i.language,
            "status": i.status,
            "overall_score": i.overall_score,
            "started_at": i.started_at.isoformat() if i.started_at else None,
            "ended_at": i.ended_at.isoformat() if i.ended_at else None,
        }
        for i in interviews
    ]


@router.get("/interviews/{interview_id}")
async def get_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific interview with messages."""
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.messages))
        .where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    return {
        "id": str(interview.id),
        "problem": interview.problem,
        "problem_title": interview.problem_title,
        "language": interview.language,
        "status": interview.status,
        "code_snapshot": interview.code_snapshot,
        "transcript": interview.transcript,
        "scorecard": interview.scorecard,
        "overall_score": interview.overall_score,
        "started_at": interview.started_at.isoformat() if interview.started_at else None,
        "ended_at": interview.ended_at.isoformat() if interview.ended_at else None,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in interview.messages
        ],
    }
