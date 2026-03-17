"""
AI Interviewer Engine using Ollama + Llama 3.2.
Handles conversation management and dynamic follow-up question generation.
"""
import json
import logging
from typing import Optional

import httpx

from config import get_settings
from .prompts import SYSTEM_PROMPT, FOLLOW_UP_PROMPT

logger = logging.getLogger("interviewlens.ai")
settings = get_settings()


class AIInterviewer:
    """
    AI Interviewer that uses Ollama to generate contextual interview questions.
    Maintains conversation history and integrates code analysis.
    """

    def __init__(self, interview_id: str = None):
        self.interview_id = interview_id
        self.conversation_history: list[dict] = []
        self.code_context: str = ""
        self.ast_context: dict = {}
        self.language: str = "python"

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
        
        Args:
            user_message: The user's message or transcript
            code: Optional current code snapshot
            ast_analysis: Optional AST analysis results
            
        Returns:
            AI interviewer's response
        """
        # Update context
        if code:
            self.code_context = code
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

        return response

    async def generate_follow_up(
        self,
        code: str,
        ast_analysis: dict,
        language: str = "python",
    ) -> Optional[str]:
        """
        Generate a follow-up question based on code analysis.
        Called when significant code changes are detected.
        """
        self.language = language
        
        # Build context from conversation
        conversation_context = "\n".join(
            f"{m['role']}: {m['content']}"
            for m in self.conversation_history[-6:]  # Last 6 messages
            if m["role"] != "system"
        )

        prompt = FOLLOW_UP_PROMPT.format(
            ast_analysis=json.dumps(ast_analysis, indent=2),
            code=code,
            language=language,
            conversation=conversation_context or "No conversation yet.",
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        response = await self._call_ollama(messages)
        
        if response:
            # Store in conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": response,
            })
        
        return response

    async def get_initial_greeting(self, problem_title: str, problem: str) -> str:
        """Generate the initial greeting for the interview."""
        greeting_prompt = (
            f"The candidate is about to solve the following problem:\n\n"
            f"**{problem_title}**\n{problem}\n\n"
            f"Give a brief, warm introduction (2-3 sentences). "
            f"Mention the problem and ask them to start by explaining their approach."
        )

        self.conversation_history.append({
            "role": "user",
            "content": greeting_prompt,
        })

        response = await self._call_ollama(self.conversation_history)

        self.conversation_history.append({
            "role": "assistant",
            "content": response,
        })

        return response

    def _build_enriched_message(self, user_message: str) -> str:
        """Enrich user message with code and AST context."""
        parts = [user_message]

        if self.code_context:
            parts.append(f"\n\n[Current Code]\n```{self.language}\n{self.code_context}\n```")

        if self.ast_context:
            patterns = self.ast_context.get("patterns_detected", [])
            if patterns:
                parts.append(f"\n[Code Patterns Detected: {', '.join(patterns)}]")
            
            hints = self.ast_context.get("complexity_hints", [])
            if hints:
                parts.append(f"\n[Complexity: {', '.join(hints)}]")

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
