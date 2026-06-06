import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from .services import CalculatorError, evaluate_expression


@require_GET
def index(request):
    return render(request, "calculator/index.html")


@require_POST
def calculate(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON payload."}, status=400)

    expression = payload.get("expression", "")
    try:
        result = evaluate_expression(expression)
    except CalculatorError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"expression": expression.strip(), "result": result})
