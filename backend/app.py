"""Flask entrypoint - wires up the routes and serves the dashboard."""

import os
import sqlite3
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

from config import HOST, PORT, SECRET_KEY
from models import init_db, purge_expired_exports
from routes.login import login_bp
from routes.presence import presence_bp
from routes.reports import reports_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(os.path.dirname(BASE_DIR), "dashboard")

app = Flask(__name__, static_folder=DASHBOARD_DIR, static_url_path="")
app.secret_key = SECRET_KEY

app.register_blueprint(presence_bp, url_prefix="/api")
app.register_blueprint(reports_bp, url_prefix="/api")
app.register_blueprint(login_bp)


@app.route("/")
def dashboard_index():
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.after_request
def add_cors_headers(response):
    """The extension POSTs from meet.google.com, so the API must allow cross-origin calls."""
    if request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
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
        except sqlite3.Error:
            app.logger.exception("Failed to purge expired exported meetings")


threading.Thread(target=_retention_worker, daemon=True).start()

if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=True)
