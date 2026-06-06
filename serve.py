"""Local full-stack development server.

Usage:
    python serve.py

Then open http://localhost:8080

This starts the FastAPI app, which serves both frontend files and /api routes
from the same origin. Secrets are read from .env by backend/app/config.py.
"""
from __future__ import annotations

import os
import webbrowser

import uvicorn


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8080"))
    url = f"http://localhost:{port}"

    print("\n  Leisure Done local dev")
    print(f"  Serving frontend + API at {url}")
    print("  Press Ctrl+C to stop\n")

    if os.environ.get("OPEN_BROWSER", "1") == "1":
        webbrowser.open(url)

    uvicorn.run("backend.app.main:app", host=host, port=port, reload=False)
