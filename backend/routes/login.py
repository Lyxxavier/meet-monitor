"""Simple email + role login (POC, no OAuth)."""

from flask import Blueprint, jsonify, redirect, request, session

from models import get_db

login_bp = Blueprint("login", __name__)

VALID_ROLES = {"student", "professor"}


@login_bp.route("/login", methods=["POST"])
def login():
    email = (request.form.get("email") or "").strip().lower()
    role = (request.form.get("role") or "").strip().lower()

    if not email or role not in VALID_ROLES:
        return jsonify({"error": "email and a valid role are required"}), 400

    conn = get_db()
    try:
        user = conn.execute(
            "SELECT id, role FROM users WHERE email = ?", (email,)
        ).fetchone()

        if user is None:
            conn.execute(
                "INSERT INTO users (email, role) VALUES (?, ?)", (email, role)
            )
            conn.commit()
        elif user["role"] != role:
            conn.execute("UPDATE users SET role = ? WHERE email = ?", (role, email))
            conn.commit()
    finally:
        conn.close()

    session["user_email"] = email
    session["role"] = role
    return redirect(f"/{role}.html")


@login_bp.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    return redirect("/login.html")


@login_bp.route("/api/me", methods=["GET"])
def me():
    return jsonify({"email": session.get("user_email"), "role": session.get("role")})
