"""Meeting-scoped dashboard reports, exports, and professor controls."""

import csv
import io
import time

from flask import Blueprint, jsonify, make_response, request, session

from models import get_db

reports_bp = Blueprint("reports", __name__)
STALE_AFTER_SECONDS = 45


def _professor_required():
    if session.get("role") != "professor":
        return jsonify({"error": "professor access required"}), 403
    return None


def _latest_meeting(conn):
    return conn.execute(
        "SELECT id, meeting_code, started_at, exported_at FROM meetings "
        "ORDER BY started_at DESC, id DESC LIMIT 1"
    ).fetchone()


def _meeting_id_arg(conn):
    raw_id = request.args.get("meeting_id")
    if raw_id is None:
        meeting = _latest_meeting(conn)
        return meeting["id"] if meeting else None
    try:
        return int(raw_id)
    except ValueError:
        return -1


def _csv_cell(value):
    text = str(value or "")
    if text.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


@reports_bp.route("/meetings", methods=["GET"])
def meetings():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, meeting_code, started_at, ended_at, exported_at, "
            "(SELECT MAX(timestamp) FROM presence_logs "
            " WHERE meeting_id = meetings.id) AS last_activity_at "
            "FROM meetings ORDER BY started_at DESC, id DESC"
        ).fetchall()
    finally:
        conn.close()
    now = int(time.time())
    meetings_list = []
    for row in rows:
        item = dict(row)
        item["is_current"] = (
            not item["ended_at"]
            and item["last_activity_at"] is not None
            and now - item["last_activity_at"] >= -60
            and now - item["last_activity_at"] <= STALE_AFTER_SECONDS
        )
        meetings_list.append(item)
    return jsonify(meetings_list)


@reports_bp.route("/reports", methods=["GET"])
def reports():
    student = (request.args.get("student") or "").strip()
    conn = get_db()
    try:
        meeting_id = _meeting_id_arg(conn)
        if meeting_id is None:
            return jsonify([])
        query = """
            SELECT p.participant_id, p.student_name, p.status, p.timestamp
            FROM presence_logs p
            WHERE p.meeting_id = ?
              AND p.id = (
                  SELECT latest.id
                  FROM presence_logs latest
                  WHERE latest.meeting_id = p.meeting_id
                    AND latest.participant_id = p.participant_id
                  ORDER BY latest.timestamp DESC, latest.id DESC
                  LIMIT 1
              )
        """
        params = [meeting_id]
        if student:
            query += " AND p.student_name = ?"
            params.append(student)
        query += " ORDER BY p.student_name"
        rows = conn.execute(query, params).fetchall()
        meeting = conn.execute(
            "SELECT meeting_code FROM meetings WHERE id = ?", (meeting_id,)
        ).fetchone()
    finally:
        conn.close()

    now = int(time.time())
    result = []
    for row in rows:
        item = dict(row)
        if item["status"] in {"active", "idle"} and now - item["timestamp"] > STALE_AFTER_SECONDS:
            item["status"] = "stale"
        item["meeting_code"] = meeting["meeting_code"] if meeting else None
        result.append(item)
    return jsonify(result)


@reports_bp.route("/reports/history", methods=["GET"])
def report_history():
    student = (request.args.get("student") or "").strip()
    try:
        limit = int(request.args.get("limit", "100"))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400
    limit = max(1, min(limit, 500))

    conn = get_db()
    try:
        meeting_id = _meeting_id_arg(conn)
        if meeting_id is None:
            return jsonify([])
        query = (
            "SELECT participant_id, student_name, status, timestamp "
            "FROM presence_logs WHERE meeting_id = ?"
        )
        params = [meeting_id]
        if student:
            query += " AND student_name = ?"
            params.append(student)
        query += " ORDER BY timestamp DESC, id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()
    return jsonify([dict(row) for row in rows])


@reports_bp.route("/reports/export", methods=["POST"])
def export_report():
    denied = _professor_required()
    if denied:
        return denied

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "expected a JSON object with meeting_id"}), 400
    try:
        meeting_id = int(payload.get("meeting_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "meeting_id is required"}), 400

    conn = get_db()
    try:
        meeting = conn.execute(
            "SELECT id, meeting_code FROM meetings WHERE id = ?", (meeting_id,)
        ).fetchone()
        if meeting is None:
            return jsonify({"error": "meeting not found"}), 404
        rows = conn.execute(
            "SELECT participant_id, student_name, status, timestamp "
            "FROM presence_logs WHERE meeting_id = ? "
            "ORDER BY timestamp, id",
            (meeting_id,),
        ).fetchall()

        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(
            ["meeting_code", "participant_id", "student_name", "status", "timestamp_utc"]
        )
        for row in rows:
            writer.writerow(
                [
                    _csv_cell(meeting["meeting_code"]),
                    _csv_cell(row["participant_id"]),
                    _csv_cell(row["student_name"]),
                    _csv_cell(row["status"]),
                    time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(row["timestamp"])
                    ),
                ]
            )
        conn.execute(
            "UPDATE meetings SET exported_at = ? WHERE id = ?",
            (int(time.time()), meeting_id),
        )
        conn.commit()
    finally:
        conn.close()

    response = make_response(output.getvalue())
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = (
        f'attachment; filename="meet-monitor-{meeting["meeting_code"]}.csv"'
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@reports_bp.route("/meetings/<int:meeting_id>", methods=["DELETE"])
def delete_meeting(meeting_id):
    denied = _professor_required()
    if denied:
        return denied

    conn = get_db()
    try:
        meeting = conn.execute(
            "SELECT id FROM meetings WHERE id = ?", (meeting_id,)
        ).fetchone()
        if meeting is None:
            return jsonify({"error": "meeting not found"}), 404
        conn.execute("DELETE FROM presence_logs WHERE meeting_id = ?", (meeting_id,))
        conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"status": "deleted", "meeting_id": meeting_id})
