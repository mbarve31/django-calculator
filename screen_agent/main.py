from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .analyzer import MODES, analyze_screenshot
from .chat import chat_message
from .config import PROVIDERS, Settings

STATIC_DIR = Path(__file__).resolve().parent / "static"
settings = Settings.from_env()

app = FastAPI(title="Screen Agent", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded PNG/JPEG without data URL prefix")
    mode: str = Field(default="general")
    context: str = Field(default="")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)
    image: str = Field(default="")
    include_screen: bool = Field(default=False)
    analysis_context: str = Field(default="")


@app.get("/api/health")
def health():
    provider = settings.active_provider()
    config_error = settings.configuration_error()

    return {
        "status": "ok" if provider else "misconfigured",
        "configured": provider is not None,
        "provider": provider,
        "model": settings.active_model(),
        "provider_setting": settings.provider,
        "providers": list(PROVIDERS),
        "openai_configured": bool(settings.openai_api_key),
        "anthropic_configured": bool(settings.anthropic_api_key),
        "openai_model": settings.openai_model,
        "anthropic_model": settings.anthropic_model,
        "modes": list(MODES),
        "message": config_error,
    }


@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest):
    if not payload.image.strip():
        raise HTTPException(status_code=400, detail="Image payload is required.")

    result = analyze_screenshot(
        settings=settings,
        image_base64=payload.image.strip(),
        mode=payload.mode,
        user_context=payload.context,
    )

    if "error" in result and len(result) == 1:
        raise HTTPException(status_code=503, detail=result["error"])

    return result


@app.post("/api/chat")
def chat(payload: ChatRequest):
    if not payload.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    image = payload.image.strip() if payload.include_screen else None
    if payload.include_screen and not image:
        raise HTTPException(
            status_code=400,
            detail="Screen share is required when include_screen is enabled.",
        )

    result = chat_message(
        settings=settings,
        messages=[message.model_dump() for message in payload.messages],
        image_base64=image,
        analysis_context=payload.analysis_context,
    )

    if "error" in result and len(result) == 1:
        raise HTTPException(status_code=503, detail=result["error"])

    return result


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
