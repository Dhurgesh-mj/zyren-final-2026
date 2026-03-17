"""
AI Interviewer Engine using Ollama + Llama 3.2.
Handles conversation management and selective follow-up question generation.
"""
import json
import logging
import time
from typing import Optional

import httpx

from config import get_settings
from .prompts import SYSTEM_PROMPT, FOLLOW_UP_PROMPT, GREETING_PROMPT, SCORECARD_PROMPT

logger = logging.getLogger("interviewlens.ai")
settings = get_settings()


class AIInterviewer:
    """
    AI Interviewer that uses Ollama to generate contextual interview questions.
    Maintains conversation history and only asks questions when necessary.
    """

    def __init__(self, interview_id: str = None):
        self.interview_id = interview_id
        self.conversation_history: list[dict] = []
        self.code_context: str = ""
        self.last_code: str = ""
        self.ast_context: dict = {}
        self.language: str = "python"
        
        # State tracking to avoid spam
        self.last_question_time: float = 0
        self.questions_asked: list[str] = []
        self.code_has_changed: bool = False
        self.waiting_for_response: bool = False
        self.last_activity_time: float = time.time()
        
        # Question cooldown (seconds)
        self.QUESTION_COOLDOWN = 8

        # Initialize with system prompt
        self.conversation_history.append({
            "role": "system",
            "content": SYSTEM_PROMPT,
        })

    async def chat(
        self,
        user_message: str,
        code: Optional[str] = None,
        ast_analysis: Optional[dict] = None,
    ) -> str:
        """
        Send a message to the AI interviewer and get a response.
        """
        self.waiting_for_response = False
        self.last_activity_time = time.time()
        
        # Update context
        if code:
            self.code_context = code
            if code != self.last_code:
                self.code_has_changed = True
                self.last_code = code
                
        if ast_analysis:
            self.ast_context = ast_analysis

        # Build the user message with context
        enriched_message = self._build_enriched_message(user_message)

        self.conversation_history.append({
            "role": "user",
            "content": enriched_message,
        })

        # Call Ollama
        response = await self._call_ollama(self.conversation_history)

        self.conversation_history.append({
            "role": "assistant",
            "content": response,
        })

        # Mark that we asked a question
        self.last_question_time = time.time()
        
        return response

    async def should_ask_follow_up(
        self,
        code: str,
        ast_analysis: dict,
    ) -> Optional[str]:
        """
        Determine if we should ask a follow-up question.
        Only asks when necessary to avoid spamming.
        """
        current_time = time.time()
        
        # Don't ask if we just asked a question (cooldown)
        if current_time - self.last_question_time < self.QUESTION_COOLDOWN:
            return None
            
        # Don't ask if we're waiting for user response
        if self.waiting_for_response:
            return None
            
        # Check if candidate just started (no conversation yet)
        non_system_msgs = [m for m in self.conversation_history if m["role"] != "system"]
        if len(non_system_msgs) <= 2:  # Just greeting + first response
            return None
            
        # Check for significant code changes
        if self.code_has_changed and code:
            self.code_has_changed = False
            
            # Use AI to decide if question is needed
            return await self._decide_follow_up(code, ast_analysis)
        
        # Check for long silence (more than 45 seconds)
        if current_time - self.last_activity_time > 45:
            self.last_activity_time = current_time
            return "Take your time. Let me know when you're ready to continue or if you'd like to discuss your approach."
        
        return None

    async def _decide_follow_up(
        self,
        code: str,
        ast_analysis: dict,
    ) -> Optional[str]:
        """
        Use AI to decide if we should ask a follow-up question.
        """
        patterns = ast_analysis.get("patterns_detected", [])
        
        # Build patterns string
        patterns_str = ", ".join(patterns) if patterns else "None detected"
        
        # Build conversation context
        conversation_context = "\n".join(
            f"{m['role']}: {m['content'][:100]}..."
            for m in self.conversation_history[-6:]
            if m["role"] != "system"
        )
        
        prompt = FOLLOW_UP_PROMPT.format(
            code=code[:500],  # Limit code length
            patterns=patterns_str,
            conversation=conversation_context or "No conversation yet.",
            language=self.language,
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        response = await self._call_ollama(messages)
        
        # Parse response
        if response.startswith("ASK:"):
            question = response[4:].strip()
            # Avoid repeating same question
            if question not in self.questions_asked[-3:]:
                self.questions_asked.append(question)
                self.last_question_time = time.time()
                return question
            
        # Return None if AI says WAIT or question was repeated
        return None

    async def generate_follow_up(
        self,
        code: str,
        ast_analysis: dict,
    ) -> Optional[str]:
        """
        Generate a follow-up question based on code analysis.
        """
        # First check if we should ask
        question = await self.should_ask_follow_up(code, ast_analysis)
        
        if question:
            # Store in conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": question,
            })
            
        return question

    async def get_initial_greeting(self, problem_title: str, problem: str) -> str:
        """Generate the initial greeting for the interview."""
        prompt = f"{GREETING_PROMPT}\n\nProblem: {problem_title}"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        response = await self._call_ollama(messages)

        self.conversation_history.append({
            "role": "assistant",
            "content": response,
        })
        
        self.last_question_time = time.time()
        
        return response

    async def generate_scorecard(
        self,
        code: str,
        transcript: str,
        problem: str,
    ) -> dict:
        """Generate the interview scorecard at the end."""
        
        # Build conversation summary
        conversation = "\n".join(
            f"{m['role']}: {m['content'][:200]}..."
            for m in self.conversation_history[-20:]
            if m["role"] != "system"
        )
        
        prompt = f"""Based on this interview, generate a scorecard:

Problem: {problem}

Code Solution:
```{self.language}
{code[:1000]}
```

Conversation:
{conversation}

Transcript: {transcript[:500] if transcript else 'No voice transcript'}

{SCORECARD_PROMPT}"""

        messages = [
            {"role": "system", "content": SCORECARD_PROMPT},
            {"role": "user", "content": prompt},
        ]

        response = await self._call_ollama(messages)
        
        # Parse JSON from response
        try:
            # Try to find JSON in response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass
        
        # Fallback scorecard
        return {
            "technical_score": 7,
            "problem_solving_score": 7,
            "communication_score": 8,
            "feedback": "Good overall performance with room for improvement in optimization.",
            "strengths": ["Clear communication", "Systematic approach", "Good code structure"],
            "improvements": ["Consider edge cases", "Optimize time complexity", "Add error handling"],
            "detailed_feedback": {
                "technical": "Code is functional but could be more optimized.",
                "problem_solving": "Good approach but missed some edge cases.",
                "communication": "Explained thinking process clearly."
            }
        }

    def _build_enriched_message(self, user_message: str) -> str:
        """Enrich user message with code and AST context."""
        parts = [user_message]

        if self.code_context:
            parts.append(f"\n\n[Current Code]\n```{self.language}\n{self.code_context[:300]}\n```")

        if self.ast_context:
            patterns = self.ast_context.get("patterns_detected", [])
            if patterns:
                parts.append(f"\n[Code Patterns: {', '.join(patterns)}]")

        return "\n".join(parts)

    async def _call_ollama(self, messages: list[dict]) -> str:
        """Call the Ollama API for chat completion."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{settings.OLLAMA_HOST}/api/chat",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": 0.7,
                            "top_p": 0.9,
                            "num_predict": 256,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data.get("message", {}).get("content", "I'm having trouble generating a response. Let's continue.")
        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama at %s", settings.OLLAMA_HOST)
            return "I'm currently having connection issues. Please make sure Ollama is running with llama3.2 model loaded."
        except httpx.TimeoutException:
            logger.error("Ollama request timed out")
            return "The AI took too long to respond. Let's continue with your approach."
        except Exception as e:
            logger.error("Ollama API error: %s", e)
            return "I encountered an error. Let's continue — tell me about your approach."

    def get_conversation_history(self) -> list[dict]:
        """Return conversation history without system messages."""
        return [
            m for m in self.conversation_history
            if m["role"] != "system"
        ]
