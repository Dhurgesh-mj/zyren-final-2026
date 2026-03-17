"""
AI Question Generator using Ollama.
Generates dynamic coding problems based on difficulty, category, and user preferences.
"""
import json
import logging
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger("interviewlens.ai_question_gen")
settings = get_settings()

# Problem categories
CATEGORIES = [
    "Arrays", "Strings", "Linked Lists", "Trees", "Graphs",
    "Dynamic Programming", "Sorting", "Searching", "Hash Tables",
    "Stacks & Queues", "Recursion", "Math", "Bit Manipulation"
]

# Difficulty levels
DIFFICULTIES = ["Easy", "Medium", "Hard"]


PROBLEM_GENERATION_PROMPT = """You are an expert coding problem generator. Generate a coding problem with the following specifications:

Difficulty: {difficulty}
Category: {category}
Topic: {topic}
User Level: {user_level}

Generate a complete problem in JSON format with these fields:
{{
    "title": "Clear, descriptive problem title",
    "description": "Full problem description with examples and constraints",
    "difficulty": "Easy/Medium/Hard",
    "category": "The category from the list",
    "tags": ["relevant", "tags"],
    "examples": [
        {{
            "input": "example input",
            "output": "expected output",
            "explanation": "optional explanation"
        }}
    ],
    "constraints": ["constraint1", "constraint2"],
    "hints": ["hint1", "hint2"],
    "starter_code": {{
        "python": "function signature and comments",
        "javascript": "function signature and comments",
        "java": "class signature",
        "cpp": "function signature"
    }},
    "test_cases": [
        {{"input": "...", "expected": "..."}}
    ],
    "solution_code": "reference solution in python",
    "solution_explanation": "how the solution works"
}}

Generate ONLY valid JSON, no additional text:"""

CATEGORY_TOPICS = {
    "Arrays": ["two pointers", "sliding window", "prefix sum", "binary search"],
    "Strings": ["palindrome", "anagram", "substring", "pattern matching"],
    "Linked Lists": ["reversal", "merge", "cycle detection", "dummy node"],
    "Trees": ["DFS", "BFS", "BST", "traversal"],
    "Graphs": ["BFS", "DFS", "topological sort", "shortest path"],
    "Dynamic Programming": ["memoization", "tabulation", "optimal substructure"],
    "Sorting": ["merge sort", "quick sort", "binary search"],
    "Searching": ["binary search", "linear search"],
    "Hash Tables": ["collision handling", "frequency count"],
    "Stacks & Queues": ["monotonic stack", "BFS"],
    "Recursion": ["backtracking", "divide and conquer"],
    "Math": ["prime numbers", "modular arithmetic"],
    "Bit Manipulation": ["XOR", "bit masking"],
}


class AIQuestionGenerator:
    """Generates coding problems using AI."""

    def __init__(self):
        self.model = settings.OLLAMA_MODEL

    async def generate_problem(
        self,
        difficulty: str = "Medium",
        category: str = "Arrays",
        topic: str = "",
        user_level: str = "intermediate",
    ) -> Optional[dict]:
        """
        Generate a coding problem using AI.
        
        Args:
            difficulty: Easy, Medium, or Hard
            category: Problem category
            topic: Specific topic within category
            user_level: beginner, intermediate, advanced
            
        Returns:
            Dictionary with problem details or None on failure
        """
        # Select random topic if not provided
        if not topic and category in CATEGORY_TOPICS:
            import random
            topic = random.choice(CATEGORY_TOPICS[category])

        prompt = PROBLEM_GENERATION_PROMPT.format(
            difficulty=difficulty,
            category=category,
            topic=topic,
            user_level=user_level,
        )

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{settings.OLLAMA_HOST}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.8,
                            "top_p": 0.9,
                            "num_predict": 1024,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                content = data.get("response", "").strip()
                
                # Parse JSON from response
                problem = self._parse_problem_json(content)
                
                if problem:
                    # Ensure required fields
                    problem.setdefault("difficulty", difficulty)
                    problem.setdefault("category", category)
                    problem.setdefault("tags", [category.lower()])
                    problem.setdefault("generated_by", "ai")
                    
                    # Ensure starter code for supported languages
                    if "starter_code" not in problem:
                        problem["starter_code"] = self._generate_starter_code(category, difficulty)
                    
                    return problem
                
                logger.warning("Failed to parse generated problem JSON")
                return self._fallback_problem(difficulty, category)
                
        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama for problem generation")
            return self._fallback_problem(difficulty, category)
        except Exception as e:
            logger.error(f"Problem generation error: {e}")
            return self._fallback_problem(difficulty, category)

    def _parse_problem_json(self, content: str) -> Optional[dict]:
        """Parse JSON from AI response."""
        import re
        
        # Try to find JSON in the response
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Try parsing whole content as JSON
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None

    def _generate_starter_code(self, category: str, difficulty: str) -> dict:
        """Generate starter code templates for a problem."""
        return {
            "python": f"# Write your solution for {category}\ndef solution():\n    # Your code here\n    pass\n",
            "javascript": f"// Write your solution for {category}\nfunction solution() {{\n    // Your code here\n}}\n",
            "java": f"// Write your solution for {category}\nclass Solution {{\n    // Your code here\n}}\n",
            "cpp": f"// Write your solution for {category}\n#include <iostream>\nusing namespace std;\n\nint main() {{\n    // Your code here\n    return 0;\n}}\n",
            "c": f"// Write your solution for {category}\n#include <stdio.h>\n\nint main() {{\n    // Your code here\n    return 0;\n}}\n",
            "go": f"// Write your solution for {category}\npackage main\n\nfunc main() {{\n    // Your code here\n}}\n",
            "rust": f"// Write your solution for {category}\nfn main() {{\n    // Your code here\n}}\n",
            "typescript": f"// Write your solution for {category}\nfunction solution(): void {{\n    // Your code here\n}}\n",
        }

    def _fallback_problem(self, difficulty: str, category: str) -> dict:
        """Return a fallback problem if AI generation fails."""
        fallback_problems = {
            ("Easy", "Arrays"): {
                "title": "Find Maximum Element",
                "description": "Given an array of integers, find the maximum element.",
                "examples": [{"input": "[1, 5, 3, 9, 2]", "output": "9"}],
                "constraints": ["Array length > 0", "Elements are integers"],
                "hints": ["Think about iterating through the array"],
            },
            ("Medium", "Arrays"): {
                "title": "Subarray Sum Equals K",
                "description": "Find the number of continuous subarrays whose sum equals k.",
                "examples": [{"input": "[1,1,1], k=2", "output": "2"}],
                "constraints": ["Array length up to 10^5"],
                "hints": ["Use prefix sum and hash map"],
            },
            ("Hard", "Dynamic Programming"): {
                "title": "Edit Distance",
                "description": "Find the minimum edit operations to convert one string to another.",
                "examples": [{"input": "horse, ros", "output": "3"}],
                "constraints": ["Both strings length up to 500"],
                "hints": ["Think DP with two dimensions"],
            },
        }
        
        problem = fallback_problems.get((difficulty, category))
        if not problem:
            # Default fallback
            problem = {
                "title": f"Solve the {category} Problem",
                "description": f"Implement a solution for a {difficulty.lower()} {category} problem.",
                "examples": [],
                "constraints": [],
                "hints": ["Read the problem carefully"],
            }
        
        problem["difficulty"] = difficulty
        problem["category"] = category
        problem["tags"] = [category.lower()]
        problem["generated_by"] = "fallback"
        problem["starter_code"] = self._generate_starter_code(category, difficulty)
        
        return problem

    async def generate_batch(
        self,
        count: int = 5,
        difficulty: str = "Mixed",
        categories: list = None,
    ) -> list:
        """Generate multiple problems."""
        import random
        
        problems = []
        cats = categories or CATEGORIES
        
        for _ in range(count):
            diff = difficulty if difficulty != "Mixed" else random.choice(DIFFICULTIES)
            cat = random.choice(cats)
            
            problem = await self.generate_problem(
                difficulty=diff,
                category=cat,
                user_level="intermediate",
            )
            
            if problem:
                problems.append(problem)
        
        return problems


# Singleton instance
question_generator = AIQuestionGenerator()


async def generate_problem(
    difficulty: str = "Medium",
    category: str = "Arrays",
    topic: str = "",
    user_level: str = "intermediate",
) -> Optional[dict]:
    """Generate a single problem."""
    return await question_generator.generate_problem(difficulty, category, topic, user_level)


async def generate_problem_batch(
    count: int = 5,
    difficulty: str = "Mixed",
    categories: list = None,
) -> list:
    """Generate multiple problems."""
    return await question_generator.generate_batch(count, difficulty, categories)
