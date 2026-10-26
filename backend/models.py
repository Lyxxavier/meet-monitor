"""SQLite connection helper and schema for Meet Monitor."""

import sqlite3

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_code TEXT,
    session_key TEXT,
    started_at INTEGER,
    ended_at INTEGER,
    exported_at INTEGER
);

CREATE TABLE IF NOT EXISTS presence_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    participant_id TEXT,
    student_name TEXT,
    status TEXT,
    timestamp INTEGER
);

"""


def get_db():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        meeting_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(meetings)")
        }
        presence_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(presence_logs)")
        }

        if "session_key" not in meeting_columns:
            conn.execute("ALTER TABLE meetings ADD COLUMN session_key TEXT")
        if "exported_at" not in meeting_columns:
            conn.execute("ALTER TABLE meetings ADD COLUMN exported_at INTEGER")
        if "participant_id" not in presence_columns:
            conn.execute("ALTER TABLE presence_logs ADD COLUMN participant_id TEXT")

        conn.execute(
            "UPDATE meetings SET session_key = 'legacy-meeting-' || id "
            "WHERE session_key IS NULL"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_session_key "
            "ON meetings (session_key)"
        )

        legacy_meeting_id = conn.execute(
            "SELECT id FROM meetings WHERE session_key = 'legacy' LIMIT 1"
        ).fetchone()
        if legacy_meeting_id is None:
            conn.execute(
                "INSERT INTO meetings (meeting_code, session_key, started_at) "
                "SELECT 'legacy', 'legacy', MIN(timestamp) FROM presence_logs "
                "WHERE meeting_id IS NULL HAVING COUNT(*) > 0"
            )
            legacy_meeting_id = conn.execute(
                "SELECT id FROM meetings WHERE session_key = 'legacy' LIMIT 1"
            ).fetchone()
        if legacy_meeting_id is not None:
            conn.execute(
                "UPDATE presence_logs SET meeting_id = ?, participant_id = student_name "
                "WHERE meeting_id IS NULL",
                (legacy_meeting_id["id"],),
            )
        conn.execute(
            "UPDATE presence_logs SET participant_id = student_name "
            "WHERE participant_id IS NULL"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_presence_meeting_participant "
            "ON presence_logs (meeting_id, participant_id, timestamp)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_meetings_exported_at "
            "ON meetings (exported_at)"
        )
        conn.commit()
    finally:
        conn.close()


def purge_expired_exports(now=None):
    """Delete exported meetings and their logs after the configured grace period."""
    import time

    from config import EXPORT_RETENTION_SECONDS

    cutoff = int(now if now is not None else time.time()) - EXPORT_RETENTION_SECONDS
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM presence_logs WHERE meeting_id IN "
            "(SELECT id FROM meetings WHERE exported_at IS NOT NULL AND exported_at <= ?)",
            (cutoff,),
        )
        conn.execute(
            "DELETE FROM meetings WHERE exported_at IS NOT NULL AND exported_at <= ?",
            (cutoff,),
        )
        conn.commit()
    finally:
        conn.close()
