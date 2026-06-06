"""Safe arithmetic expression evaluation."""

import ast
import operator
import re

ALLOWED_CHARS = re.compile(r"^[\d+\-*/().%\s]+$")

OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


class CalculatorError(Exception):
    """Raised when an expression cannot be evaluated safely."""


def _evaluate_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise CalculatorError("Invalid number in expression.")

    if isinstance(node, ast.Num):  # Python 3.8 compatibility
        return float(node.n)

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in OPERATORS:
            raise CalculatorError("Unsupported operator.")
        left = _evaluate_node(node.left)
        right = _evaluate_node(node.right)
        if op_type is ast.Div and right == 0:
            raise CalculatorError("Cannot divide by zero.")
        if op_type is ast.Mod and right == 0:
            raise CalculatorError("Cannot modulo by zero.")
        return OPERATORS[op_type](left, right)

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in OPERATORS:
            raise CalculatorError("Unsupported operator.")
        return OPERATORS[op_type](_evaluate_node(node.operand))

    raise CalculatorError("Invalid expression.")


def evaluate_expression(expression: str) -> str:
    """Evaluate a basic arithmetic expression and return a formatted result."""
    cleaned = expression.strip()
    if not cleaned:
        raise CalculatorError("Expression is empty.")

    if not ALLOWED_CHARS.match(cleaned):
        raise CalculatorError("Expression contains invalid characters.")

    try:
        tree = ast.parse(cleaned, mode="eval")
    except SyntaxError as exc:
        raise CalculatorError("Invalid expression syntax.") from exc

    result = _evaluate_node(tree.body)

    if result == int(result):
        return str(int(result))

    text = f"{result:.10f}".rstrip("0").rstrip(".")
    return text or "0"
