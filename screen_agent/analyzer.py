from __future__ import annotations

import json
from typing import Any

from anthropic import Anthropic
from openai import OpenAI

from .config import Settings

MODES = ("coding", "ai_assessment", "general", "system_design")

SYSTEM_PROMPTS = {
    "coding": """You are an expert coding interview assistant. The user shares a screenshot of a coding practice or assessment site (Codility, HackerRank, LeetCode, etc.).

Extract everything visible about the problem and respond ONLY with valid JSON matching this schema:
{
  "title": "short problem title",
  "summary": "1-2 sentence restatement of the task",
  "constraints": ["list of constraints and limits"],
  "examples": [{"input": "...", "output": "...", "explanation": "..."}],
  "approach": "step-by-step solution strategy in plain language",
  "solution_code": "complete working code in the language shown or Python if unclear",
  "language": "programming language used",
  "time_complexity": "Big-O time",
  "space_complexity": "Big-O space",
  "edge_cases": ["things to watch for"],
  "confidence": "high|medium|low"
}

If text is unreadable, set confidence to low and explain gaps in summary.""",
    "ai_assessment": """You are an expert at AI fluency and prompt-engineering assessments. The user shares a screenshot of an AI assessment, chat exercise, or evaluation task.

Respond ONLY with valid JSON matching this schema:
{
  "task_summary": "what the assessment is asking the user to do",
  "assessment_type": "prompt writing|evaluation|roleplay|analysis|other",
  "recommended_prompt": "the exact prompt the user should paste — complete, ready to copy",
  "follow_up_prompts": ["optional follow-ups if the task is multi-turn"],
  "why_this_works": "brief rationale for the prompt strategy",
  "pitfalls": ["common mistakes to avoid"],
  "evaluation_criteria": ["what graders likely look for"],
  "confidence": "high|medium|low"
}

Make recommended_prompt concrete and actionable, not generic advice.""",
    "general": """You are a helpful screen-reading assistant. The user shares a screenshot and wants answers about what is visible.

Respond ONLY with valid JSON matching this schema:
{
  "question_detected": "the main question or task on screen",
  "answer": "clear, direct answer",
  "key_points": ["supporting bullet points"],
  "suggested_actions": ["concrete next steps for the user"],
  "confidence": "high|medium|low"
}""",
    "system_design": """You are a principal-level system design interviewer and architect. The user shares a screenshot of a system design question or prompt.

Produce a staff/principal-engineer quality design. If the user provides extra context or constraints in their message, incorporate them directly into assumptions, calculations, APIs, and tradeoffs.

Respond ONLY with valid JSON matching this schema:
{
  "title": "short system name",
  "problem_summary": "1-2 sentence restatement of the design problem",
  "clarifying_questions": ["questions you would ask the interviewer before designing"],
  "assumptions": ["explicit assumptions made, including any user-provided constraints"],
  "back_of_envelope": [
    {
      "metric": "what is being estimated",
      "calculation": "show the math step by step",
      "result": "final estimate with units"
    }
  ],
  "apis": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/resource",
      "description": "what the endpoint does",
      "request": "key request fields or body shape",
      "response": "key response fields or body shape"
    }
  ],
  "architecture_diagram_mermaid": "valid Mermaid flowchart/graph syntax showing labeled components and data flow. Example: flowchart LR\\n  Client[Mobile App] --> LB[Load Balancer] --> API[API Gateway]",
  "architecture_components": [
    {"name": "Component", "role": "what it does", "tech": "suggested technology"}
  ],
  "low_level_design": {
    "database_tables": [
      {"name": "table_name", "columns": ["col TYPE - purpose"], "notes": "indexing/partitioning notes"}
    ],
    "data_calculations": [
      {"label": "metric name", "formula": "how calculated", "estimate": "numeric estimate with units"}
    ],
    "bandwidth_storage": [
      {"label": "what is measured", "estimate": "daily/monthly estimate with reasoning"}
    ]
  },
  "bottlenecks_and_tradeoffs": [
    {
      "topic": "area e.g. consistency vs availability",
      "bottleneck": "what breaks at scale",
      "tradeoff": "decision and why",
      "mitigation": "how to address it"
    }
  ],
  "confidence": "high|medium|low"
}

Use realistic numbers in back-of-envelope and storage/bandwidth sections. Keep Mermaid syntax simple and valid.""",
}


def _parse_json_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        return {
            "error": "Failed to parse model response as JSON.",
            "raw_response": raw,
            "parse_error": str(exc),
        }


def _max_tokens_for_mode(mode: str) -> int:
    if mode == "system_design":
        return 8192
    return 4096


def _user_text(user_context: str, mode: str) -> str:
    text = "Analyze this screenshot and respond with JSON only."
    if mode == "system_design":
        text += (
            " Produce a principal-level system design with clarifying questions, "
            "back-of-envelope math, APIs, architecture diagram, low-level design, "
            "and bottlenecks/tradeoffs."
        )
    if user_context.strip():
        text += f"\n\nAdditional context or constraints from the user (must incorporate):\n{user_context.strip()}"
    return text


def _finalize_result(
    parsed: dict[str, Any],
    *,
    mode: str,
    provider: str,
    model: str,
) -> dict[str, Any]:
    parsed["mode"] = mode
    parsed["provider"] = provider
    parsed["model"] = model
    return parsed


def _analyze_with_openai(
    *,
    settings: Settings,
    image_base64: str,
    mode: str,
    user_context: str,
) -> dict[str, Any]:
    client = OpenAI(api_key=settings.openai_api_key)

    user_parts: list[dict[str, Any]] = [
        {"type": "text", "text": _user_text(user_context, mode)},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{image_base64}"},
        },
    ]

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPTS[mode]},
            {"role": "user", "content": user_parts},
        ],
        temperature=0.2,
        max_tokens=_max_tokens_for_mode(mode),
    )

    content = response.choices[0].message.content or ""
    parsed = _parse_json_response(content)
    return _finalize_result(
        parsed,
        mode=mode,
        provider="openai",
        model=settings.openai_model,
    )


def _analyze_with_anthropic(
    *,
    settings: Settings,
    image_base64: str,
    mode: str,
    user_context: str,
) -> dict[str, Any]:
    client = Anthropic(api_key=settings.anthropic_api_key)

    request_kwargs: dict[str, Any] = {
        "model": settings.anthropic_model,
        "max_tokens": _max_tokens_for_mode(mode),
        "system": SYSTEM_PROMPTS[mode],
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64,
                        },
                    },
                    {"type": "text", "text": _user_text(user_context, mode)},
                ],
            }
        ],
    }

    if settings.anthropic_model.startswith("claude-opus-4-"):
        request_kwargs["output_config"] = {"effort": "medium"}

    response = client.messages.create(**request_kwargs)

    text_blocks = [
        block.text for block in response.content if getattr(block, "type", None) == "text"
    ]
    content = "".join(text_blocks)
    parsed = _parse_json_response(content)
    return _finalize_result(
        parsed,
        mode=mode,
        provider="anthropic",
        model=settings.anthropic_model,
    )


def analyze_screenshot(
    *,
    settings: Settings,
    image_base64: str,
    mode: str,
    user_context: str = "",
) -> dict[str, Any]:
    config_error = settings.configuration_error()
    if config_error:
        return {"error": config_error}

    if mode not in MODES:
        return {"error": f"Invalid mode '{mode}'. Use one of: {', '.join(MODES)}."}

    provider = settings.active_provider()
    if provider == "anthropic":
        return _analyze_with_anthropic(
            settings=settings,
            image_base64=image_base64,
            mode=mode,
            user_context=user_context,
        )
    if provider == "openai":
        return _analyze_with_openai(
            settings=settings,
            image_base64=image_base64,
            mode=mode,
            user_context=user_context,
        )

    return {"error": "No vision provider is configured."}
