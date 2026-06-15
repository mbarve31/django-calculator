#!/usr/bin/env python3
"""Run the Screen Agent web app."""

import socket
import sys
from pathlib import Path

import uvicorn

from screen_agent.config import Settings


def _port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def main() -> None:
    settings = Settings.from_env()
    screen_agent_dir = Path(__file__).resolve().parent / "screen_agent"

    if _port_in_use(settings.host, settings.port):
        print(
            f"Error: port {settings.port} is already in use on {settings.host}.\n"
            f"Either stop the existing Screen Agent process, or run on another port:\n"
            f"  export SCREEN_AGENT_PORT=8766\n"
            f"  python3 run_screen_agent.py\n\n"
            f"To stop the process on port {settings.port}:\n"
            f"  kill $(lsof -t -i:{settings.port})",
            file=sys.stderr,
        )
        sys.exit(1)

    config_error = settings.configuration_error()
    if config_error:
        print(f"Warning: {config_error}", file=sys.stderr)

    uvicorn.run(
        "screen_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_dirs=[str(screen_agent_dir)],
    )


if __name__ == "__main__":
    main()
