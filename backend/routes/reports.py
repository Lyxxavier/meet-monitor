"""Endpoints the dashboard GETs data from."""

from flask import Blueprint, jsonify, request

from models import get_db

reports_bp = Blueprint("reports", __name__)

# Newest row per participant, which is what the professor table shows.
LATEST_QUERY = """
    SELECT p.student_name, p.status, p.timestamp
    FROM presence_logs p
    JOIN (
        SELECT student_name, MAX(id) AS max_id
        FROM presence_logs
        GROUP BY student_name
    ) latest ON latest.max_id = p.id
"""


@reports_bp.route("/reports", methods=["GET"])
def reports():
    student = (request.args.get("student") or "").strip()

    conn = get_db()
    try:
        if student:
            rows = conn.execute(
                LATEST_QUERY + " WHERE p.student_name = ? ORDER BY p.student_name",
                (student,),
            ).fetchall()
        else:
            rows = conn.execute(LATEST_QUERY + " ORDER BY p.student_name").fetchall()
    finally:
        conn.close()

    return jsonify([dict(row) for row in rows])


@reports_bp.route("/reports/history", methods=["GET"])
def report_history():
    student = (request.args.get("student") or "").strip()
    limit = request.args.get("limit", default=100, type=int)
    limit = max(1, min(limit, 500))

    conn = get_db()
    try:
        if student:
            rows = conn.execute(
                "SELECT student_name, status, timestamp FROM presence_logs"
                " WHERE student_name = ? ORDER BY id DESC LIMIT ?",
                (student, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT student_name, status, timestamp FROM presence_logs"
                " ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
    finally:
        conn.close()

    return jsonify([dict(row) for row in rows])
