# Screen Agent

Share your screen, capture a frame, and get structured answers from Claude or OpenAI — coding problems, system design, AI assessments, and follow-up chat.

## Requirements

- Python 3.10+
- Chrome or Safari (screen capture and dictation do not work in Cursor’s built-in browser)
- An [Anthropic API key](https://console.anthropic.com/settings/keys) and/or OpenAI API key

## Clone and run

```bash
git clone https://github.com/mbarve31/django-calculator.git
cd django-calculator

cp .env.example .env
# Edit .env — set at least ANTHROPIC_API_KEY (or OPENAI_API_KEY)

python3 -m venv venv
source venv/bin/activate

pip install -r screen_agent/requirements.txt

python3 run_screen_agent.py
```

Open **http://127.0.0.1:8766** in Chrome or Safari.

1. Click **Start screen share** and pick the window or tab with your assessment.
2. Choose a mode (coding, system design, etc.) and click **Analyze current frame**.
3. Use **Chat** for follow-ups; the mic button dictates into the message box (Chrome/Safari).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `ANTHROPIC_MODEL` | Claude model name | `claude-opus-4-8` |
| `OPENAI_API_KEY` | OpenAI API key (optional fallback) | — |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o` |
| `SCREEN_AGENT_PROVIDER` | `auto`, `anthropic`, or `openai` | `auto` |
| `SCREEN_AGENT_HOST` | Bind address | `127.0.0.1` |
| `SCREEN_AGENT_PORT` | HTTP port | `8766` |

Copy `.env.example` to `.env` in the **project root** (same folder as `run_screen_agent.py`).

## Troubleshooting

- **“No API key configured”** — Add `ANTHROPIC_API_KEY` to `.env`, then restart the server.
- **Port in use** — Set `SCREEN_AGENT_PORT` to another value in `.env`, or stop the process: `kill $(lsof -t -i:8766)`.
- **Screen share fails** — Use Chrome or Safari at `http://127.0.0.1:8766`, not an embedded IDE browser.
