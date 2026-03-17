"""
Test Case Runner for code validation.
Validates user code against predefined test cases.
"""
import logging
import re
from typing import Dict, List, Any, Optional

logger = logging.getLogger("interviewlens.test_runner")

# Test case configurations for each problem
PROBLEM_TEST_CASES: Dict[str, List[dict]] = {
    "two-sum": [
        {
            "input": {"nums": [2, 7, 11, 15], "target": 9},
            "expected": [0, 1],
            "name": "Basic case",
        },
        {
            "input": {"nums": [3, 2, 4], "target": 6},
            "expected": [1, 2],
            "name": "Middle elements",
        },
        {
            "input": {"nums": [3, 3], "target": 6},
            "expected": [0, 1],
            "name": "Duplicate values",
        },
    ],
    "reverse-linked-list": [
        {
            "input": {"head": [1, 2, 3, 4, 5]},
            "expected": [5, 4, 3, 2, 1],
            "name": "Standard case",
        },
        {
            "input": {"head": [1, 2]},
            "expected": [2, 1],
            "name": "Two elements",
        },
        {
            "input": {"head": [1]},
            "expected": [1],
            "name": "Single element",
        },
    ],
    "valid-parentheses": [
        {
            "input": {"s": "()"},
            "expected": True,
            "name": "Simple pair",
        },
        {
            "input": {"s": "()[]{}"},
            "expected": True,
            "name": "Multiple pairs",
        },
        {
            "input": {"s": "(]"},
            "expected": False,
            "name": "Mismatched",
        },
        {
            "input": {"s": "([)]"},
            "expected": False,
            "name": "Nested wrong",
        },
    ],
    "merge-sort": [
        {
            "input": {"arr": [38, 27, 43, 3, 9, 82, 10]},
            "expected": [3, 9, 10, 27, 38, 43, 82],
            "name": "Standard case",
        },
        {
            "input": {"arr": [5, 2, 1, 3, 6, 4]},
            "expected": [1, 2, 3, 4, 5, 6],
            "name": "Unsorted",
        },
        {
            "input": {"arr": [1]},
            "expected": [1],
            "name": "Single element",
        },
    ],
    "lru-cache": [
        {
            "input": {"operations": [
                {"op": "put", "key": 1, "value": 1},
                {"op": "put", "key": 2, "value": 2},
                {"op": "get", "key": 1},
            ]},
            "expected": {"get_1": 1},
            "name": "Basic put/get",
        },
    ],
}


class TestRunner:
    """
    Runs test cases against user code to validate correctness.
    """

    def __init__(self):
        self.results: List[dict] = []

    async def run_tests(
        self,
        code: str,
        language: str,
        problem_id: str,
    ) -> dict:
        """
        Run test cases for a problem.
        
        Args:
            code: User's solution code
            language: python or javascript
            problem_id: Problem identifier
            
        Returns:
            Test results with pass/fail status
        """
        test_cases = PROBLEM_TEST_CASES.get(problem_id, [])
        
        if not test_cases:
            return {
                "problem_id": problem_id,
                "total_tests": 0,
                "passed": 0,
                "failed": 0,
                "results": [],
                "message": "No test cases defined for this problem",
            }

        results = []
        passed = 0
        failed = 0

        for test_case in test_cases:
            result = await self._run_single_test(
                code, language, test_case, problem_id
            )
            results.append(result)
            if result["passed"]:
                passed += 1
            else:
                failed += 1

        return {
            "problem_id": problem_id,
            "total_tests": len(test_cases),
            "passed": passed,
            "failed": failed,
            "all_passed": failed == 0,
            "results": results,
        }

    async def _run_single_test(
        self,
        code: str,
        language: str,
        test_case: dict,
        problem_id: str,
    ) -> dict:
        """Run a single test case."""
        test_name = test_case.get("name", "Unnamed test")
        
        try:
            # Prepare the code with test execution
            wrapped_code = self._wrap_code(code, language, test_case, problem_id)
            
            # Execute the code
            from sandbox.executor import execute_code
            result = await execute_code(wrapped_code, language, "")
            
            # Check if execution was successful
            if result.get("exit_code", 1) != 0:
                return {
                    "name": test_name,
                    "passed": False,
                    "error": result.get("stderr", "Execution failed"),
                    "output": result.get("stdout", ""),
                }
            
            # Parse output
            output = result.get("stdout", "").strip()
            expected = test_case.get("expected")
            
            # Compare output
            passed = self._compare_output(output, expected)
            
            return {
                "name": test_name,
                "passed": passed,
                "expected": str(expected),
                "actual": output,
                "error": None if passed else "Output mismatch",
            }
            
        except Exception as e:
            logger.error(f"Test execution error: {e}")
            return {
                "name": test_name,
                "passed": False,
                "error": str(e),
            }

    def _wrap_code(
        self,
        code: str,
        language: str,
        test_case: dict,
        problem_id: str,
    ) -> str:
        """Wrap user code with test execution logic."""
        test_input = test_case.get("input", {})
        
        if language == "python":
            return self._wrap_python(code, test_input, problem_id)
        else:
            return self._wrap_javascript(code, test_input, problem_id)

    def _wrap_python(self, code: str, test_input: dict, problem_id: str) -> str:
        """Wrap Python code with test harness."""
        input_str = str(test_input)
        
        if problem_id == "two-sum":
            return f"""
{code}

result = two_sum({input_str})
print(result)
"""

        elif problem_id == "reverse-linked-list":
            return f"""
{code}

# Create linked list and reverse
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def create_list(arr):
    if not arr:
        return None
    head = ListNode(arr[0])
    curr = head
    for v in arr[1:]:
        curr.next = ListNode(v)
        curr = curr.next
    return head

def to_list(head):
    result = []
    while head:
        result.append(head.val)
        head = head.next
    return result

head = create_list({input_str}['head'])
result = reverse_list(head)
print(to_list(result))
"""

        elif problem_id == "valid-parentheses":
            return f"""
{code}

result = is_valid({input_str}['s'])
print(result)
"""

        elif problem_id == "merge-sort":
            return f"""
{code}

result = merge_sort({input_str}['arr'])
print(result)
"""

        elif problem_id == "lru-cache":
            # Complex - just run the code
            return f"""
{code}

# Test LRU Cache
cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
print(cache.get(1))
"""

        return code

    def _wrap_javascript(self, code: str, test_input: dict, problem_id: str) -> str:
        """Wrap JavaScript code with test harness."""
        input_str = str(test_input).replace("'", '"')
        
        if problem_id == "two-sum":
            return f"""
{code}

const result = twoSum({input_str}['nums'], {input_str}['target']);
console.log(JSON.stringify(result));
"""

        elif problem_id == "valid-parentheses":
            return f"""
{code}

const result = isValid({input_str}['s']);
console.log(result);
"""

        elif problem_id == "merge-sort":
            return f"""
{code}

const result = mergeSort({input_str}['arr']);
console.log(JSON.stringify(result));
"""

        return code

    def _compare_output(self, output: str, expected: Any) -> bool:
        """Compare actual output with expected result."""
        if expected is True:
            return "True" in output or "true" in output.lower()
        if expected is False:
            return "False" in output or "false" in output.lower()
        
        # Try JSON comparison
        try:
            import json
            actual = json.loads(output)
            return actual == expected
        except:
            pass
        
        # String comparison
        expected_str = str(expected).replace(" ", "").replace("'", '"')
        output_str = output.replace(" ", "").replace("'", '"')
        
        return expected_str in output_str or output_str in expected_str


# Singleton instance
test_runner = TestRunner()


async def run_problem_tests(
    code: str,
    language: str,
    problem_id: str,
) -> dict:
    """Run all tests for a problem."""
    return await test_runner.run_tests(code, language, problem_id)
