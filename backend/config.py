"""Runtime configuration for the Meet Monitor backend."""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# SQLite file used by models.get_db(); created automatically on first run.
DATABASE_PATH = os.path.join(BASE_DIR, "db.sqlite3")

# Change this via environment variable before sharing the app with real users.
SECRET_KEY = os.environ.get("MEET_MONITOR_SECRET", "dev-secret-change-me")

HOST = os.environ.get("MEET_MONITOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("MEET_MONITOR_PORT", "5000"))
