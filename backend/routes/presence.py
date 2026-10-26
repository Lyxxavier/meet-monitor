"""Endpoint the extension POSTs meeting-scoped activity to."""

import math
import re
import time

from flask import Blueprint, jsonify, request

from models import get_db

presence_bp = Blueprint("presence", __name__)
MEETING_CODE_PATTERN = re.compile(r"^[a-z0-9-]{1,64}$")
MAX_ENTRIES = 500


def _to_seconds(timestamp):
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)):
        return None
    if isinstance(timestamp, int):
        if timestamp > 10_000_000_000:
            timestamp //= 1000
    else:
        if not math.isfinite(timestamp):
            return None
        if timestamp > 10_000_000_000:
            timestamp /= 1000
    if timestamp <= 0 or timestamp > time.time() + 60:
        return None
    return int(timestamp)


@presence_bp.route("/presence", methods=["POST"])
def log_presence():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "expected a meeting-scoped JSON object"}), 400

    meeting_code = str(payload.get("meetingCode") or "").strip().lower()
    session_key = str(payload.get("sessionKey") or "").strip()
    entries = payload.get("entries")
    if not MEETING_CODE_PATTERN.fullmatch(meeting_code):
        return jsonify({"error": "a valid meeting code is required"}), 400
    if not session_key or len(session_key) > 128:
        return jsonify({"error": "a valid meeting session key is required"}), 400
    if not isinstance(entries, list) or len(entries) > MAX_ENTRIES:
        return jsonify({"error": f"entries must be an array of at most {MAX_ENTRIES} items"}), 400

    rows = []
    for entry in entries:
        if not isinstance(entry, dict):
            return jsonify({"error": "each entry must be an object"}), 400
        participant_id = str(entry.get("participantId") or "").strip()
        name = str(entry.get("name") or "").strip()
        status = entry.get("status")
        timestamp = _to_seconds(entry.get("timestamp"))
        if (
            not participant_id
            or len(participant_id) > 256
            or not name
            or len(name) > 256
        ):
            return jsonify({"error": "each entry needs a participant ID and name"}), 400
        if not isinstance(status, str) or status not in {"active", "idle", "left"}:
            return jsonify({"error": "status must be active, idle, or left"}), 400
        if timestamp is None:
            return jsonify({"error": "each entry needs a valid timestamp"}), 400
        rows.append((participant_id, name, status, timestamp))

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO meetings (meeting_code, session_key, started_at) "
            "VALUES (?, ?, ?) "
            "ON CONFLICT(session_key) DO UPDATE SET "
            "meeting_code = excluded.meeting_code",
            (meeting_code, session_key, int(time.time())),
        )
        meeting = conn.execute(
            "SELECT id FROM meetings WHERE session_key = ?", (session_key,)
        ).fetchone()
        if rows:
            conn.executemany(
                "INSERT INTO presence_logs "
                "(meeting_id, participant_id, student_name, status, timestamp) "
                "VALUES (?, ?, ?, ?, ?)",
                [(meeting["id"], *row) for row in rows],
            )
            latest_states = conn.execute(
                """
                SELECT COUNT(*) AS participant_count,
                       SUM(CASE WHEN status = 'left' THEN 0 ELSE 1 END) AS present_count,
                       MAX(timestamp) AS last_event
                FROM (
                    SELECT status, timestamp,
                           ROW_NUMBER() OVER (
                               PARTITION BY participant_id
                               ORDER BY timestamp DESC, id DESC
                           ) AS rank
                    FROM presence_logs
                    WHERE meeting_id = ?
                )
                WHERE rank = 1
                """,
                (meeting["id"],),
            ).fetchone()
            ended_at = (
                latest_states["last_event"]
                if latest_states["participant_count"] and not latest_states["present_count"]
                else None
            )
            conn.execute(
                "UPDATE meetings SET ended_at = ? WHERE id = ?",
                (ended_at, meeting["id"]),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify({"status": "ok", "inserted": len(rows)})
