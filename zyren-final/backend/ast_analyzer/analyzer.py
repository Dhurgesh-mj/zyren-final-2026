"""
Code Analysis Engine using Python AST and Tree-sitter.
Detects patterns, complexity hints, and generates questions.
"""
import ast
import logging
from typing import Optional

logger = logging.getLogger("interviewlens.ast")


class CodeAnalyzer:
    """
    Analyzes code using Python's built-in AST module and pattern detection.
    Supports Python and JavaScript analysis.
    """

    def __init__(self):
        self.patterns_detected: list[str] = []
        self.complexity_hints: list[str] = []
        self.suggested_questions: list[str] = []

    def analyze(self, code: str, language: str = "python") -> dict:
        """
        Analyze code and return structured results.
        
        Args:
            code: Source code string
            language: Programming language
            
        Returns:
            Analysis dictionary with patterns, complexity hints, and questions
        """
        self.patterns_detected = []
        self.complexity_hints = []
        self.suggested_questions = []

        if language == "python":
            return self._analyze_python(code)
        elif language == "javascript":
            return self._analyze_javascript(code)
        else:
            return self._empty_result()

    def _analyze_python(self, code: str) -> dict:
        """Analyze Python code using the AST module."""
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return {
                "patterns_detected": ["syntax_error"],
                "complexity_hints": [f"Syntax error at line {e.lineno}: {e.msg}"],
                "suggested_questions": ["It looks like there's a syntax error. Can you check your code?"],
                "functions": [],
                "classes": [],
                "imports": [],
                "loops": 0,
                "recursion_detected": False,
                "nested_loops_detected": False,
            }

        analysis = PythonASTVisitor()
        analysis.visit(tree)

        # Detect patterns
        if analysis.nested_loops:
            self.patterns_detected.append("nested_loops")
            self.complexity_hints.append("O(n²) or higher due to nested loops")
            self.suggested_questions.append(
                "I see you're using nested loops. What is the time complexity of this approach? "
                "Can you think of a way to optimize it?"
            )

        if analysis.recursion:
            self.patterns_detected.append("recursion")
            self.complexity_hints.append("Recursive approach detected")
            self.suggested_questions.append(
                "You're using recursion here. What's the base case? "
                "Have you considered the call stack depth for large inputs?"
            )

        if analysis.brute_force_indicators > 2:
            self.patterns_detected.append("brute_force")
            self.complexity_hints.append("Possible brute force approach")
            self.suggested_questions.append(
                "This seems like a brute force approach. Could you think of any "
                "data structures that might help optimize this?"
            )

        if not analysis.error_handling:
            self.patterns_detected.append("no_error_handling")
            self.suggested_questions.append(
                "What happens if the input is null or empty? How would you handle edge cases?"
            )

        if analysis.global_variables:
            self.patterns_detected.append("global_state")
            self.suggested_questions.append(
                "I notice you're using global variables. How might this affect testability and thread safety?"
            )

        if analysis.list_comprehensions:
            self.patterns_detected.append("list_comprehension")
            self.complexity_hints.append("Uses Pythonic list comprehensions")

        if analysis.sorting_used:
            self.patterns_detected.append("sorting")
            self.complexity_hints.append("O(n log n) due to sorting")
            self.suggested_questions.append(
                "You're using sorting. Is there a way to solve this without sorting, "
                "perhaps with a different data structure?"
            )

        if analysis.dictionary_used:
            self.patterns_detected.append("hash_map")
            self.complexity_hints.append("Hash map usage for O(1) lookups")

        if len(analysis.functions) > 3:
            self.patterns_detected.append("modular_code")
            self.complexity_hints.append("Well-structured modular code")

        return {
            "patterns_detected": self.patterns_detected,
            "complexity_hints": self.complexity_hints,
            "suggested_questions": self.suggested_questions,
            "functions": analysis.functions,
            "classes": analysis.classes,
            "imports": analysis.imports,
            "loops": analysis.loop_count,
            "recursion_detected": analysis.recursion,
            "nested_loops_detected": analysis.nested_loops,
        }

    def _analyze_javascript(self, code: str) -> dict:
        """
        Analyze JavaScript code using pattern matching.
        Uses heuristic analysis since we can't use Python's AST for JS.
        """
        patterns = []
        hints = []
        questions = []
        functions = []
        loops = 0
        recursion = False
        nested_loops = False

        lines = code.split("\n")

        # Detect functions
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("function "):
                name = stripped.split("(")[0].replace("function ", "").strip()
                functions.append(name)
            elif "const " in stripped and "=>" in stripped:
                name = stripped.split("=")[0].replace("const ", "").replace("let ", "").strip()
                functions.append(name)

        # Count loops and detect nesting
        loop_depth = 0
        max_loop_depth = 0
        for line in lines:
            stripped = line.strip()
            if any(kw in stripped for kw in ["for ", "for(", "while ", "while("]):
                loops += 1
                loop_depth += 1
                max_loop_depth = max(max_loop_depth, loop_depth)
            if "}" in stripped:
                loop_depth = max(0, loop_depth - 1)

        if max_loop_depth >= 2:
            nested_loops = True
            patterns.append("nested_loops")
            hints.append("O(n²) or higher due to nested loops")
            questions.append(
                "I see nested loops in your code. What's the time complexity? "
                "Can you optimize it?"
            )

        # Detect recursion
        for func_name in functions:
            for line in lines:
                if func_name + "(" in line and "function" not in line and "//" not in line:
                    recursion = True
                    patterns.append("recursion")
                    hints.append("Recursive approach detected")
                    questions.append(
                        "You're using recursion. What's the base case? "
                        "What about stack overflow for large inputs?"
                    )
                    break
            if recursion:
                break

        # Detect sorting
        if ".sort(" in code:
            patterns.append("sorting")
            hints.append("O(n log n) sorting detected")
            questions.append("You're using sort. Is there a more efficient approach?")

        # Detect hash map usage
        if "new Map(" in code or "new Set(" in code or "{}" in code:
            patterns.append("hash_map")
            hints.append("Hash map/set usage for O(1) lookups")

        # Error handling
        has_error_handling = "try" in code or "catch" in code or "if (" in code
        if not has_error_handling:
            patterns.append("no_error_handling")
            questions.append("How would you handle edge cases like empty or null inputs?")

        return {
            "patterns_detected": patterns,
            "complexity_hints": hints,
            "suggested_questions": questions,
            "functions": functions,
            "classes": [],
            "imports": [],
            "loops": loops,
            "recursion_detected": recursion,
            "nested_loops_detected": nested_loops,
        }

    def _empty_result(self) -> dict:
        return {
            "patterns_detected": [],
            "complexity_hints": [],
            "suggested_questions": [],
            "functions": [],
            "classes": [],
            "imports": [],
            "loops": 0,
            "recursion_detected": False,
            "nested_loops_detected": False,
        }


class PythonASTVisitor(ast.NodeVisitor):
    """AST visitor to extract code structure and patterns."""

    def __init__(self):
        self.functions: list[str] = []
        self.classes: list[str] = []
        self.imports: list[str] = []
        self.loop_count: int = 0
        self.nested_loops: bool = False
        self.recursion: bool = False
        self.error_handling: bool = False
        self.brute_force_indicators: int = 0
        self.global_variables: bool = False
        self.list_comprehensions: bool = False
        self.sorting_used: bool = False
        self.dictionary_used: bool = False
        self._current_function: Optional[str] = None
        self._loop_depth: int = 0
        self._function_names: set[str] = set()

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.functions.append(node.name)
        self._function_names.add(node.name)
        prev_function = self._current_function
        self._current_function = node.name
        self.generic_visit(node)
        self._current_function = prev_function

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.functions.append(f"async {node.name}")
        self._function_names.add(node.name)
        prev_function = self._current_function
        self._current_function = node.name
        self.generic_visit(node)
        self._current_function = prev_function

    def visit_ClassDef(self, node: ast.ClassDef):
        self.classes.append(node.name)
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self.imports.append(alias.name)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        self.imports.append(f"from {node.module}")

    def visit_For(self, node: ast.For):
        self.loop_count += 1
        self._loop_depth += 1
        if self._loop_depth >= 2:
            self.nested_loops = True
        self.brute_force_indicators += 1
        self.generic_visit(node)
        self._loop_depth -= 1

    def visit_While(self, node: ast.While):
        self.loop_count += 1
        self._loop_depth += 1
        if self._loop_depth >= 2:
            self.nested_loops = True
        self.brute_force_indicators += 1
        self.generic_visit(node)
        self._loop_depth -= 1

    def visit_Call(self, node: ast.Call):
        # Detect recursion
        if isinstance(node.func, ast.Name):
            if node.func.id in self._function_names:
                self.recursion = True
            if node.func.id in ("sorted", "sort"):
                self.sorting_used = True
            if node.func.id == "dict":
                self.dictionary_used = True

        # Detect method calls
        if isinstance(node.func, ast.Attribute):
            if node.func.attr in ("sort", "sorted"):
                self.sorting_used = True

        self.generic_visit(node)

    def visit_Try(self, node: ast.Try):
        self.error_handling = True
        self.generic_visit(node)

    def visit_If(self, node: ast.If):
        self.error_handling = True  # Basic check
        self.generic_visit(node)

    def visit_ListComp(self, node: ast.ListComp):
        self.list_comprehensions = True
        self.generic_visit(node)

    def visit_DictComp(self, node: ast.DictComp):
        self.dictionary_used = True
        self.generic_visit(node)

    def visit_Dict(self, node: ast.Dict):
        self.dictionary_used = True
        self.generic_visit(node)

    def visit_Global(self, node: ast.Global):
        self.global_variables = True
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign):
        # Detect top-level assignments (global variables)
        if self._current_function is None:
            for target in node.targets:
                if isinstance(target, ast.Name) and not target.id.startswith("_"):
                    self.global_variables = True
        self.generic_visit(node)
