"""Endpoint the extension POSTs activity to."""

import time

from flask import Blueprint, jsonify, request

from models import get_db

presence_bp = Blueprint("presence", __name__)

MS_EPOCH_THRESHOLD = 10_000_000_000  # anything larger than this is a millisecond timestamp


def _to_seconds(timestamp):
    """content.js sends Date.now() (milliseconds); store seconds like the spec."""
    if not isinstance(timestamp, (int, float)):
        return int(time.time())
    if timestamp > MS_EPOCH_THRESHOLD:
        return int(timestamp / 1000)
    return int(timestamp)


@presence_bp.route("/presence", methods=["POST"])
def log_presence():
    payload = request.get_json(silent=True)

    if not isinstance(payload, list):
        return jsonify({"error": "expected a JSON array of presence entries"}), 400

    rows = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue

        name = str(entry.get("name") or "").strip()
        if not name:
            continue

        rows.append(
            (
                name,
                "active" if entry.get("micOn") else "idle",
                _to_seconds(entry.get("timestamp")),
            )
        )

    if not rows:
        return jsonify({"status": "ok", "inserted": 0})

    conn = get_db()
    try:
        conn.executemany(
            "INSERT INTO presence_logs (student_name, status, timestamp) VALUES (?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()

    return jsonify({"status": "ok", "inserted": len(rows)})
