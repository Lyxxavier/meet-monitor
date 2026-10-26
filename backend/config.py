"""Runtime configuration for the Meet Monitor backend."""

import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Use SQLite for local development and PostgreSQL when DATABASE_URL is configured.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DATABASE_PATH = os.path.join(BASE_DIR, "db.sqlite3")

SECRET_KEY = os.environ.get("MEET_MONITOR_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
PRESENCE_API_TOKEN = os.environ.get("PRESENCE_API_TOKEN", "")
IS_PRODUCTION = os.environ.get("FLASK_ENV", "").lower() == "production" or bool(
    os.environ.get("RENDER")
)
SESSION_COOKIE_SECURE = os.environ.get(
    "SESSION_COOKIE_SECURE", "true" if IS_PRODUCTION else "false"
).lower() in {"1", "true", "yes"}

if IS_PRODUCTION:
    missing_settings = [
        name
        for name, value in (
            ("DATABASE_URL", DATABASE_URL),
            ("MEET_MONITOR_SECRET", SECRET_KEY),
            ("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID),
            ("GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET),
            ("PRESENCE_API_TOKEN", PRESENCE_API_TOKEN),
        )
        if not value
    ]
    if missing_settings:
        raise RuntimeError(
            "Missing required production settings: " + ", ".join(missing_settings)
        )

HOST = os.environ.get("MEET_MONITOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("MEET_MONITOR_PORT", "5000"))
EXPORT_RETENTION_SECONDS = 15 * 24 * 60 * 60
