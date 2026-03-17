"""
Interview Scorecard Generator.
Uses Ollama to generate structured evaluation after interview ends.
"""
import json
import logging
from typing import Optional

import httpx

from config import get_settings
from .prompts import SCORECARD_PROMPT

logger = logging.getLogger("interviewlens.ai.scorecard")
settings = get_settings()


async def generate_scorecard(
    code: str,
    transcript: str,
    messages: list[dict],
    problem: str,
) -> dict:
    """
    Generate a structured interview scorecard using AI.
    
    Args:
        code: Final code snapshot
        transcript: Voice transcript
        messages: Conversation messages
        problem: Problem description
        
    Returns:
        Scorecard dictionary with scores and feedback
    """
    # Build evaluation context
    conversation_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in messages
        if m.get("content")
    )

    evaluation_prompt = f"""## Problem
{problem}

## Final Code
```
{code}
```

## Voice Transcript
{transcript or "No voice transcript available."}

## Conversation History
{conversation_text or "No conversation recorded."}

Based on the above, generate the evaluation scorecard."""

    messages_payload = [
        {"role": "system", "content": SCORECARD_PROMPT},
        {"role": "user", "content": evaluation_prompt},
    ]

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_HOST}/api/chat",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "messages": messages_payload,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Lower temp for consistent scoring
                        "num_predict": 512,
                    },
                    "format": "json",
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("message", {}).get("content", "")
            
            # Parse JSON response
            scorecard = _parse_scorecard(content)
            logger.info("Scorecard generated: tech=%d, ps=%d, comm=%d",
                       scorecard["technical_score"],
                       scorecard["problem_solving_score"],
                       scorecard["communication_score"])
            return scorecard

    except Exception as e:
        logger.error("Scorecard generation failed: %s", e)
        return _default_scorecard()


def _parse_scorecard(content: str) -> dict:
    """Parse and validate the AI-generated scorecard."""
    try:
        # Try to extract JSON from response
        content = content.strip()
        
        # Handle markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        scorecard = json.loads(content)
        
        # Validate and clamp scores
        for key in ["technical_score", "problem_solving_score", "communication_score"]:
            score = scorecard.get(key, 5)
            scorecard[key] = max(1, min(10, int(score)))
        
        # Ensure required fields exist
        scorecard.setdefault("feedback", "Interview completed.")
        scorecard.setdefault("strengths", [])
        scorecard.setdefault("improvements", [])
        scorecard.setdefault("detailed_feedback", {})
        
        return scorecard

    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning("Failed to parse scorecard JSON: %s", e)
        return _default_scorecard()


def _default_scorecard() -> dict:
    """Return a default scorecard when AI generation fails."""
    return {
        "technical_score": 5,
        "problem_solving_score": 5,
        "communication_score": 5,
        "feedback": "Interview evaluation could not be fully generated. A default score has been assigned.",
        "strengths": ["Completed the interview"],
        "improvements": ["Consider explaining your thought process more clearly"],
        "detailed_feedback": {
            "technical": "Default evaluation — please retry.",
            "problem_solving": "Default evaluation — please retry.",
            "communication": "Default evaluation — please retry.",
        },
    }
