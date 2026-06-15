from __future__ import annotations

from typing import Any, Optional

from anthropic import Anthropic
from openai import OpenAI

from .config import Settings

CHAT_SYSTEM = """You are a helpful assistant in the Screen Agent interview app.

The user may ask follow-up questions about:
- a coding problem or solution shown on their screen
- an AI assessment or prompt-writing task
- a system design interview (APIs, scaling, tradeoffs, DB schema, diagrams)
- clarifications, optimizations, or walkthroughs

Be concise and practical. Use markdown code blocks with a language tag when showing code.
For system design follow-ups, revise the design to incorporate new constraints the user mentions
(e.g. "must work offline", "100M DAU", "strong consistency"). Update calculations, APIs,
components, and tradeoffs accordingly.

If prior analysis context is provided, treat it as ground truth unless the user corrects it."""


def _chat_with_openai(
    *,
    settings: Settings,
    messages: list[dict[str, str]],
    image_base64: Optional[str],
    analysis_context: str,
) -> dict[str, Any]:
    client = OpenAI(api_key=settings.openai_api_key)

    system = CHAT_SYSTEM
    if analysis_context.strip():
        system += f"\n\nPrior screen analysis:\n{analysis_context.strip()}"

    api_messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for index, message in enumerate(messages):
        role = message["role"]
        content: Any = message["content"]
        is_last_user = role == "user" and index == len(messages) - 1

        if is_last_user and image_base64:
            content = [
                {"type": "text", "text": content},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_base64}"},
                },
            ]

        api_messages.append({"role": role, "content": content})

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=api_messages,
        temperature=0.3,
        max_tokens=4096,
    )

    reply = response.choices[0].message.content or ""
    return {
        "reply": reply,
        "provider": "openai",
        "model": settings.openai_model,
    }


def _chat_with_anthropic(
    *,
    settings: Settings,
    messages: list[dict[str, str]],
    image_base64: Optional[str],
    analysis_context: str,
) -> dict[str, Any]:
    client = Anthropic(api_key=settings.anthropic_api_key)

    system = CHAT_SYSTEM
    if analysis_context.strip():
        system += f"\n\nPrior screen analysis:\n{analysis_context.strip()}"

    api_messages: list[dict[str, Any]] = []
    for index, message in enumerate(messages):
        role = message["role"]
        if role not in ("user", "assistant"):
            continue

        content: Any = message["content"]
        is_last_user = role == "user" and index == len(messages) - 1

        if is_last_user and image_base64:
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": image_base64,
                    },
                },
                {"type": "text", "text": message["content"]},
            ]
        else:
            content = message["content"]

        api_messages.append({"role": role, "content": content})

    request_kwargs: dict[str, Any] = {
        "model": settings.anthropic_model,
        "max_tokens": 4096,
        "system": system,
        "messages": api_messages,
    }

    if settings.anthropic_model.startswith("claude-opus-4-"):
        request_kwargs["output_config"] = {"effort": "medium"}

    response = client.messages.create(**request_kwargs)
    text_blocks = [
        block.text for block in response.content if getattr(block, "type", None) == "text"
    ]
    reply = "".join(text_blocks)

    return {
        "reply": reply,
        "provider": "anthropic",
        "model": settings.anthropic_model,
    }


def chat_message(
    *,
    settings: Settings,
    messages: list[dict[str, str]],
    image_base64: Optional[str] = None,
    analysis_context: str = "",
) -> dict[str, Any]:
    config_error = settings.configuration_error()
    if config_error:
        return {"error": config_error}

    if not messages:
        return {"error": "At least one message is required."}

    if messages[-1]["role"] != "user":
        return {"error": "The last message must be from the user."}

    provider = settings.active_provider()
    if provider == "anthropic":
        return _chat_with_anthropic(
            settings=settings,
            messages=messages,
            image_base64=image_base64,
            analysis_context=analysis_context,
        )
    if provider == "openai":
        return _chat_with_openai(
            settings=settings,
            messages=messages,
            image_base64=image_base64,
            analysis_context=analysis_context,
        )

    return {"error": "No chat provider is configured."}
