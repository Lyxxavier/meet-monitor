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
    started_at INTEGER,
    ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS presence_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER REFERENCES meetings(id),
    student_name TEXT,
    status TEXT,
    timestamp INTEGER
);

CREATE INDEX IF NOT EXISTS idx_presence_student
    ON presence_logs (student_name, id);
"""


def get_db():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
