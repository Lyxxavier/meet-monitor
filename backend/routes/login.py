"""Google OpenID Connect sign-in for verified Google accounts."""

from flask import Blueprint, jsonify, redirect, request, session, url_for
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.flask_client import OAuth

from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from models import get_db

login_bp = Blueprint("login", __name__)
oauth = OAuth()
VALID_ROLES = {"student", "professor"}


@login_bp.route("/login/google", methods=["GET"])
def login_google():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({"error": "Google sign-in has not been configured"}), 503

    role = (request.args.get("role") or "").strip().lower()
    if role not in VALID_ROLES:
        return jsonify({"error": "a valid role is required"}), 400

    session["requested_role"] = role
    client = oauth.create_client("google")
    return client.authorize_redirect(
        url_for("login.google_callback", _external=True),
        prompt="select_account",
    )


@login_bp.route("/auth/google/callback", methods=["GET"])
def google_callback():
    client = oauth.create_client("google")
    try:
        token = client.authorize_access_token()
        user_info = token.get("userinfo") or client.userinfo()
    except OAuthError:
        return redirect("/login.html?error=Google+sign-in+was+cancelled+or+failed")

    email = str(user_info.get("email") or "").strip().lower()
    google_sub = str(user_info.get("sub") or "").strip()
    email_verified = user_info.get("email_verified") is True
    role = session.pop("requested_role", None)

    if not email or not google_sub or not email_verified:
        return jsonify({"error": "Google did not provide a verified account"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": "sign-in flow expired; please try again"}), 400

    conn = get_db()
    try:
        user = conn.execute(
            "SELECT id FROM users WHERE google_sub = ? OR email = ? LIMIT 1",
            (google_sub, email),
        ).fetchone()
        if user is None:
            conn.execute(
                "INSERT INTO users (email, role, google_sub) VALUES (?, ?, ?)",
                (email, role, google_sub),
            )
        else:
            conn.execute(
                "UPDATE users SET email = ?, role = ?, google_sub = ? WHERE id = ?",
                (email, role, google_sub, user["id"]),
            )
        conn.commit()
    finally:
        conn.close()

    session.clear()
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
