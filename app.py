from __future__ import annotations

import os
from pathlib import Path
from flask import Flask, jsonify, render_template, send_from_directory, request
from quiz_loader import load_question_payload

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_PATH = PROJECT_ROOT / "quiz_data" / "questions.json"

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000

# Pre-load to ensure data exists
payload = load_question_payload(PROJECT_ROOT, DATA_PATH)

@app.after_request
def add_header(response):
    """Add cache control headers to static files."""
    if 'Cache-Control' not in response.headers:
        if '/static/' in request.path:
            response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

@app.get("/")
def index() -> str:
    # We no longer need to pass variables since app.js handles everything
    return render_template("index.html")

@app.get("/quiz_data/questions.json")
def get_questions_json():
    """Serve the questions JSON directly."""
    return send_from_directory(PROJECT_ROOT / "quiz_data", "questions.json")

@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200

# Keep old endpoints as stubs to prevent 404s if any old client is active
@app.route("/api/start", methods=["POST"])
@app.route("/api/question", methods=["POST"])
@app.route("/api/answer", methods=["POST"])
@app.route("/api/explanation", methods=["POST"])
def deprecated():
    return jsonify({"error": "This endpoint is deprecated. Please refresh your browser."}), 410

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
