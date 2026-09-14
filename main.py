"""Compatibility entry point: uvicorn main:app still runs the new backend."""

from backend.app.main import app  # noqa: F401

if __name__ == "__main__":
    from backend.app.launcher import main

    main()
