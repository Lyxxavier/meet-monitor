"""Flask entrypoint - wires up the routes and serves the dashboard."""

import os
import sqlite3
import threading
import time

import psycopg
from flask import Flask, jsonify, redirect, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix

from config import (
    HOST,
    PORT,
    SECRET_KEY,
    SESSION_COOKIE_SECURE,
)
from models import init_db, purge_expired_exports
from routes.login import login_bp, oauth
from routes.presence import presence_bp
from routes.reports import reports_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(os.path.dirname(BASE_DIR), "dashboard")

app = Flask(__name__, static_folder=DASHBOARD_DIR, static_url_path="")
app.config.update(
    SECRET_KEY=SECRET_KEY or "local-development-secret-change-me",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE,
    SESSION_COOKIE_SAMESITE="Lax",
)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
oauth.init_app(app)
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=os.environ.get("GOOGLE_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    client_kwargs={"scope": "openid email profile"},
)

app.register_blueprint(presence_bp, url_prefix="/api")
app.register_blueprint(reports_bp, url_prefix="/api")
app.register_blueprint(login_bp)


@app.before_request
def require_login_for_private_pages():
    private_pages = {"/student.html", "/professor.html"}
    private_api = {
        "/api/meetings",
        "/api/reports",
        "/api/reports/history",
        "/api/reports/export",
    }
    is_meeting_delete = request.path.startswith("/api/meetings/")
    if request.path not in private_pages | private_api and not is_meeting_delete:
        return None
    if not session.get("user_email"):
        if request.path.startswith("/api/"):
            return jsonify({"error": "sign-in required"}), 401
        return redirect("/login.html")

    required_role = {
        "/student.html": "student",
        "/professor.html": "professor",
        "/api/reports/export": "professor",
    }.get(request.path)
    if request.path.startswith("/api/meetings/") and request.method == "DELETE":
        required_role = "professor"
    if required_role and session.get("role") != required_role:
        if request.path.startswith("/api/"):
            return jsonify({"error": f"{required_role} access required"}), 403
        return redirect(f"/{session['role']}.html")
    return None


@app.route("/")
def dashboard_index():
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.after_request
def add_cors_headers(response):
    """The extension POSTs from meet.google.com, so the API must allow cross-origin calls."""
    if request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "not found"}), 404


init_db()
purge_expired_exports()


def _retention_worker():
    while True:
        time.sleep(60 * 60)
        try:
            purge_expired_exports()
        except (sqlite3.Error, psycopg.Error):
            app.logger.exception("Failed to purge expired exported meetings")


threading.Thread(target=_retention_worker, daemon=True).start()

if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=False)
