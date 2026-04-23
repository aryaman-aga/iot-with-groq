from __future__ import annotations

import hashlib
import os
import random
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock, Thread
from time import time
from typing import Any

from flask import Flask, jsonify, render_template, request
from groq import Groq

from quiz_loader import load_question_payload

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_PATH = PROJECT_ROOT / "quiz_data" / "questions.json"


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key.removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        if key:
            # .env should be the source of truth for local development.
            os.environ[key] = value


_load_env_file(PROJECT_ROOT / ".env")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_CLIENT = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

payload = load_question_payload(PROJECT_ROOT, DATA_PATH)
SOURCE_CATALOG: list[dict[str, Any]] = payload["sources"]
QUESTION_LIST: list[dict[str, Any]] = payload["questions"]
QUESTION_LOOKUP: dict[str, dict[str, Any]] = {question["id"]: question for question in QUESTION_LIST}
SOURCE_LABEL_LOOKUP: dict[str, str] = {source["source_id"]: source["label"] for source in SOURCE_CATALOG}

# Aggregate available weeks per source
SOURCE_WEEKS: dict[str, list[int]] = {}
for q in QUESTION_LIST:
    s_id = q["source_id"]
    week = q.get("week")
    if week is not None:
        try:
            week_int = int(week)
            SOURCE_WEEKS.setdefault(s_id, set()).add(week_int)
        except (ValueError, TypeError):
            pass

# Convert sets to sorted lists for JSON serialization
SOURCE_WEEKS_SERIALIZABLE = {k: sorted(list(v)) for k, v in SOURCE_WEEKS.items()}


@dataclass
class QuizSession:
    quiz_id: str
    question_ids: list[str]
    selected_sources: list[str]
    shuffle_enabled: bool
    shuffle_options: bool = False
    current_index: int = 0
    score: int = 0
    answer_log: list[dict[str, Any]] = field(default_factory=list)
    started_at: float = field(default_factory=time)


QUIZ_SESSIONS: dict[str, QuizSession] = {}
QUIZ_LOCK = Lock()

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000


@app.after_request
def add_header(response):
    """Add cache control headers to static files."""
    if 'Cache-Control' not in response.headers:
        if request.path.startswith('/static/'):
            response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response


def _get_groq_explanation(question: dict[str, Any], selected_option: str, correct_option: str) -> str | None:
    """Get AI explanation from Groq for an answer."""
    if not GROQ_CLIENT:
        return None

    is_correct = selected_option == correct_option
    try:
        if is_correct:
            prompt = f"""The user answered CORRECTLY on this question:

Question: {question['question']}

Options:
A) {question['options']['a']}
B) {question['options']['b']}
C) {question['options']['c']}
D) {question['options']['d']}

The user selected the correct answer: {selected_option.upper()}) {question['options'][selected_option]}

Briefly explain why this answer is correct. Be concise (2-3 sentences)."""
        else:
            prompt = f"""The user answered INCORRECTLY on this question:

Question: {question['question']}

Options:
A) {question['options']['a']}
B) {question['options']['b']}
C) {question['options']['c']}
D) {question['options']['d']}

The user selected: {selected_option.upper()}) {question['options'][selected_option]}
Correct answer: {correct_option.upper()}) {question['options'][correct_option]}

Briefly explain why the correct answer is right and the user's selection was wrong. Be concise (2-3 sentences)."""

        chat_completion = GROQ_CLIENT.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            max_tokens=150,
        )
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"Groq API error: {e}")
        return None


def _public_question(question: dict[str, Any], session_id: str | None = None, shuffle_options: bool = False) -> dict[str, Any]:
    options_list = [{"key": key, "text": value} for key, value in question["options"].items()]
    
    if shuffle_options and session_id:
        seed_str = f"{session_id}_{question['id']}"
        seed_val = int(hashlib.md5(seed_str.encode()).hexdigest(), 16)
        rng = random.Random(seed_val)
        rng.shuffle(options_list)

    return {
        "id": question["id"],
        "source_id": question["source_id"],
        "source_label": question["source_label"],
        "source_file": question.get("source_file"),
        "week": question.get("week"),
        "page": question.get("page"),
        "question_number": question["question_number"],
        "text": question["question"],
        "options": options_list,
    }


def _normalize_source_selection(raw_sources: Any) -> list[str]:
    valid_ids = {source["source_id"] for source in SOURCE_CATALOG}

    if not isinstance(raw_sources, list) or not raw_sources:
        return [source["source_id"] for source in SOURCE_CATALOG]

    requested = [str(source_id).strip() for source_id in raw_sources]
    filtered = [source_id for source_id in requested if source_id in valid_ids]
    if not filtered:
        return [source["source_id"] for source in SOURCE_CATALOG]

    return filtered


    return sorted(stats.values(), key=lambda entry: entry["source_label"])


def _build_week_breakdown(answer_log: list[dict[dict[str, Any]]]) -> list[dict[str, Any]]:
    stats: dict[int, dict[str, Any]] = {}

    for item in answer_log:
        question_id = item["question_id"]
        question = QUESTION_LOOKUP.get(question_id)
        if not question:
            continue
            
        week = question.get("week")
        if week is None:
            continue
            
        bucket = stats.setdefault(
            week,
            {
                "week": week,
                "correct": 0,
                "total": 0,
            },
        )
        bucket["total"] += 1
        if item["correct"]:
            bucket["correct"] += 1

    # Convert to list and sort by week number
    return sorted(stats.values(), key=lambda entry: entry["week"])


@app.get("/")
def index() -> str:
    return render_template(
        "index.html",
        sources=SOURCE_CATALOG,
        source_weeks=SOURCE_WEEKS_SERIALIZABLE,
        total_questions=len(QUESTION_LIST),
    )


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.post("/api/start")
def start_quiz() -> Any:
    body = request.get_json(silent=True) or {}
    selected_sources = _normalize_source_selection(body.get("sources", []))
    selected_weeks = body.get("weeks")  # Expecting a list of integers or None for "all"
    shuffle_enabled = bool(body.get("shuffle", False))
    shuffle_options_enabled = bool(body.get("shuffle_options", False))

    selected_questions = [
        question for question in QUESTION_LIST if question["source_id"] in selected_sources
    ]

    # Apply week filtering if specified
    if isinstance(selected_weeks, list) and selected_weeks:
        try:
            week_ints = [int(w) for w in selected_weeks]
            selected_questions = [
                q for q in selected_questions if q.get("week") in week_ints
            ]
        except (ValueError, TypeError):
            pass

    if not selected_questions:
        return jsonify({"error": "No questions available for selected sources/weeks."}), 400

    question_ids = [question["id"] for question in selected_questions]
    if shuffle_enabled:
        random.shuffle(question_ids)

    quiz_id = uuid.uuid4().hex
    session = QuizSession(
        quiz_id=quiz_id,
        question_ids=question_ids,
        selected_sources=selected_sources,
        shuffle_enabled=shuffle_enabled,
        shuffle_options=shuffle_options_enabled,
    )

    with QUIZ_LOCK:
        QUIZ_SESSIONS[quiz_id] = session

    first_question = QUESTION_LOOKUP[question_ids[0]]
    return jsonify(
        {
            "quiz_id": quiz_id,
            "shuffle_enabled": shuffle_enabled,
            "selected_sources": selected_sources,
            "total_questions": len(question_ids),
            "current_question_index": 1,
            "active_question_index": 1,
            "score": 0,
            "question": _public_question(first_question, session_id=quiz_id, shuffle_options=shuffle_options_enabled),
        }
    )


@app.post("/api/question")
def get_question() -> Any:
    body = request.get_json(silent=True) or {}
    quiz_id = str(body.get("quiz_id", "")).strip()
    requested_index = body.get("question_index")

    try:
        question_index = int(requested_index)
    except (TypeError, ValueError):
        return jsonify({"error": "A valid question index is required."}), 400

    with QUIZ_LOCK:
        session = QUIZ_SESSIONS.get(quiz_id)

    if not session:
        return jsonify({"error": "Quiz session expired. Please start again."}), 404

    total_questions = len(session.question_ids)
    if question_index < 1 or question_index > total_questions:
        return jsonify({"error": "Question index is out of range."}), 400

    active_question_index = min(session.current_index + 1, total_questions)
    if question_index > active_question_index:
        return jsonify({"error": "Please answer the current question before moving ahead."}), 409

    question_id = session.question_ids[question_index - 1]
    question = QUESTION_LOOKUP[question_id]

    response_payload: dict[str, Any] = {
        "question": _public_question(question, session_id=quiz_id, shuffle_options=session.shuffle_options),
        "current_question_index": question_index,
        "active_question_index": active_question_index,
        "total_questions": total_questions,
        "score": session.score,
        "answered": question_index <= len(session.answer_log),
    }

    if response_payload["answered"]:
        answer_entry = session.answer_log[question_index - 1]
        response_payload.update(
            {
                "correct": answer_entry["correct"],
                "selected_option": answer_entry["selected_option"],
                "correct_option": answer_entry["correct_option"],
                "correct_option_text": question["options"][answer_entry["correct_option"]],
            }
        )

    return jsonify(response_payload)


@app.post("/api/answer")
def submit_answer() -> Any:
    body = request.get_json(silent=True) or {}
    quiz_id = str(body.get("quiz_id", "")).strip()
    selected_option = str(body.get("selected_option", "")).strip().lower()
    question_id = str(body.get("question_id", "")).strip()

    with QUIZ_LOCK:
        session = QUIZ_SESSIONS.get(quiz_id)

    if not session:
        return jsonify({"error": "Quiz session expired. Please start again."}), 404

    if session.current_index >= len(session.question_ids):
        return jsonify({"error": "Quiz has already finished."}), 400

    active_question_id = session.question_ids[session.current_index]
    if question_id and question_id != active_question_id:
        return jsonify({"error": "Out-of-sync question. Please refresh and start again."}), 409

    question = QUESTION_LOOKUP[active_question_id]
    valid_options = set(question["options"].keys())
    if selected_option not in valid_options:
        return jsonify({"error": "Please choose a valid option."}), 400

    correct_option = question["answer"]
    is_correct = selected_option == correct_option

    if is_correct:
        session.score += 1

    session.answer_log.append(
        {
            "question_id": active_question_id,
            "source_id": question["source_id"],
            "correct": is_correct,
            "selected_option": selected_option,
            "correct_option": correct_option,
        }
    )

    session.current_index += 1
    answered_questions = session.current_index
    total_questions = len(session.question_ids)

    response_payload: dict[str, Any] = {
        "correct": is_correct,
        "selected_option": selected_option,
        "correct_option": correct_option,
        "correct_option_text": question["options"][correct_option],
        "score": session.score,
        "answered_questions": answered_questions,
        "total_questions": total_questions,
        "finished": answered_questions >= total_questions,
    }

    # Note: Groq explanation is fetched separately via /api/explanation endpoint
    # to avoid blocking the quiz flow

    if answered_questions >= total_questions:
        score_percent = round((session.score / total_questions) * 100, 2)
        response_payload["summary"] = {
            "score": session.score,
            "total": total_questions,
            "percent": score_percent,
            "source_breakdown": _build_source_breakdown(session.answer_log),
            "week_breakdown": _build_week_breakdown(session.answer_log),
        }
        with QUIZ_LOCK:
            QUIZ_SESSIONS.pop(quiz_id, None)
        return jsonify(response_payload)

    next_question_id = session.question_ids[session.current_index]
    next_question = QUESTION_LOOKUP[next_question_id]
    response_payload["active_question_index"] = session.current_index + 1
    response_payload["next_question_index"] = session.current_index + 1
    response_payload["next_question"] = _public_question(next_question, session_id=quiz_id, shuffle_options=session.shuffle_options)
    return jsonify(response_payload)


@app.post("/api/explanation")
def get_explanation() -> Any:
    """Get AI explanation for a wrong answer (async endpoint)."""
    if not GROQ_CLIENT:
        return jsonify({"explanation": None}), 200

    body = request.get_json(silent=True) or {}
    secret_code = str(body.get("secret_code", "")).strip()
    if secret_code != "arya21":
        return jsonify({"explanation": None}), 200

    question_id = str(body.get("question_id", "")).strip()
    selected_option = str(body.get("selected_option", "")).strip().lower()

    question = QUESTION_LOOKUP.get(question_id)
    if not question:
        return jsonify({"error": "Question not found."}), 404

    correct_option = question["answer"]
    
    # If the answer is correct, we ONLY show an explanation if the secret code is correct
    # (incorrect answers already show explanations if the code is correct)
    # The frontend calls this for all answers now.
    
    explanation = _get_groq_explanation(question, selected_option, correct_option)
    return jsonify({"explanation": explanation})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
