from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pypdf import PdfReader

PDF_SOURCES = [
    "2024 iiot.pdf",
    "2026 iiot assignments.pdf",
    "2025 iiot assignments.pdf",
]

QUESTION_PATTERN = re.compile(r"^QUESTION\s*(\d+)\s*[:\.)-]?\s*(.*)$", re.IGNORECASE)
QUESTION_MARKER_ANYWHERE_PATTERN = re.compile(r"QUESTION\s*\d+\s*[:\.)-]?", re.IGNORECASE)
OPTION_PATTERN = re.compile(
    r"^(?:[-*\u2022\u25cf\u25aa\u00b7]\s*)?(?:\(\s*([a-dA-D1-4])\s*\)|([a-dA-D1-4])\s*[\.)])\s*(.*)$"
)
INLINE_OPTION_MARKER_PATTERN = re.compile(r"(?:\(\s*([a-dA-D1-4])\s*\)|([a-dA-D1-4])[\.)])")
CORRECT_PATTERN = re.compile(r"Correct\s*Answer\s*[:\-]?\s*([a-dA-D1-4])[\.)]?\s*(.*)$", re.IGNORECASE)
YEAR_PATTERN = re.compile(r"(20\d{2})")
ASSIGNMENT_WEEK_PATTERN = re.compile(r"assignment\s*[-–]?\s*week\s*[:\-\s]*([0-9]{1,2})", re.IGNORECASE)
ASSIGNMENT_WEEK_ONLY_PATTERN = re.compile(r"assignment\s*[-–]?\s*week\s*[:\-\s]*$", re.IGNORECASE)
WEEK_NUMBER_ONLY_PATTERN = re.compile(r"^([0-9]{1,2})$")
TRAILING_NOISE_PATTERN = re.compile(
    r"\b(See lecture|NPTEL Online Certification Courses|Indian Institute of Technology Kharagpur).*",
    re.IGNORECASE,
)
DETAILED_SOLUTION_PATTERN = re.compile(r"\bDetailed\s*Solution\b", re.IGNORECASE)
SEPARATOR_PATTERN = re.compile(r"^[_*=\-]{6,}$")

NOISE_PREFIXES = (
    "nptel online certification courses",
    "indian institute of technology kharagpur",
    "introduction to",
    "internet of things",
    "assignment-week",
    "type of question",
    "number of questions",
    "total marks",
)

OPTION_KEY_MAP = {
    "a": "a",
    "b": "b",
    "c": "c",
    "d": "d",
    "1": "a",
    "2": "b",
    "3": "c",
    "4": "d",
}


def _normalize_whitespace(text: str) -> str:
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return re.sub(r"\s+", " ", text).strip()


def _is_noise_line(text: str) -> bool:
    lowered = text.lower()
    return lowered.startswith(NOISE_PREFIXES)


def _is_separator_line(text: str) -> bool:
    return bool(SEPARATOR_PATTERN.match(text))


def _clean_final_text(text: str) -> str:
    cleaned = DETAILED_SOLUTION_PATTERN.split(text, maxsplit=1)[0]
    cleaned = TRAILING_NOISE_PATTERN.sub("", cleaned)
    return _normalize_whitespace(cleaned)


def _normalize_option_key(raw_key: str) -> str | None:
    return OPTION_KEY_MAP.get(raw_key.lower().strip())


def _extract_inline_options(line: str) -> tuple[str, list[tuple[str, str]]]:
    stripped = _normalize_whitespace(line)
    stripped = re.sub(r"^(?:[-*\u2022\u25cf\u25aa\u00b7]\s*)+", "", stripped)

    matches = list(INLINE_OPTION_MARKER_PATTERN.finditer(stripped))
    if len(matches) < 2:
        return stripped, []

    def _has_valid_start_boundary(index: int) -> bool:
        if index == 0:
            return True
        return stripped[index - 1].isspace() or stripped[index - 1] in "([{:-;,.?"

    indexed_markers: list[tuple[int, int, str]] = []
    for index, match in enumerate(matches):
        raw_key = match.group(1) or match.group(2)
        key = _normalize_option_key(raw_key)
        if key is None:
            continue
        indexed_markers.append((index, match.start(), key))

    if len(indexed_markers) < 2:
        return stripped, []

    first_boundary_marker = next(
        ((index, start, key) for index, start, key in indexed_markers if _has_valid_start_boundary(start)),
        None,
    )
    if first_boundary_marker is None:
        return stripped, []

    start_marker_index = first_boundary_marker[0]
    if first_boundary_marker[2] != "a":
        return stripped, []

    accepted_indices: list[int] = [start_marker_index]
    last_key = "a"
    for idx, _, key in indexed_markers[start_marker_index + 1 :]:
        if key <= last_key:
            continue
        accepted_indices.append(idx)
        last_key = key
        if key == "d":
            break

    if len(accepted_indices) < 2:
        return stripped, []

    first_match = matches[accepted_indices[0]]
    question_prefix = _normalize_whitespace(stripped[: first_match.start()])

    segments: list[tuple[str, str]] = []
    for offset, marker_index in enumerate(accepted_indices):
        marker = matches[marker_index]
        raw_key = marker.group(1) or marker.group(2)
        key = _normalize_option_key(raw_key)
        if key is None:
            continue
        start = marker.end()
        if offset + 1 < len(accepted_indices):
            end = matches[accepted_indices[offset + 1]].start()
        else:
            end = len(stripped)
        text = _normalize_whitespace(stripped[start:end])
        segments.append((key, text))

    return question_prefix, segments


def _derive_source_id(file_name: str) -> str:
    year_match = YEAR_PATTERN.search(file_name)
    if year_match:
        return year_match.group(1)
    stem = Path(file_name).stem.lower()
    return re.sub(r"[^a-z0-9]+", "_", stem).strip("_")


def _derive_source_label(file_name: str) -> str:
    year_match = YEAR_PATTERN.search(file_name)
    if year_match:
        return f"{year_match.group(1)} IIOT"
    return Path(file_name).stem


def _finalize_question(current: dict[str, Any]) -> dict[str, Any] | None:
    if not current:
        return None

    normalized_options: dict[str, str] = {}
    for key, raw_value in current["options"].items():
        cleaned = _clean_final_text(raw_value)
        if cleaned:
            normalized_options[key] = cleaned

    if len(normalized_options) < 2:
        return None

    question_text = _clean_final_text(" ".join(current["question_parts"]))
    if not question_text:
        return None

    answer = current.get("answer", "").lower()
    answer_inferred = False
    if answer not in normalized_options:
        lowered_question = question_text.lower()
        if "mqtt" in lowered_question and "paradigm" in lowered_question:
            publish_subscribe_matches = [
                key
                for key, option_text in normalized_options.items()
                if "publish-subscribe" in option_text.lower()
            ]
            if len(publish_subscribe_matches) == 1:
                answer = publish_subscribe_matches[0]
                answer_inferred = True

    if answer not in normalized_options:
        return None

    answer_text = _clean_final_text(current.get("answer_text", normalized_options[answer]))
    if not answer_text:
        answer_text = normalized_options[answer]

    record = {
        "question_number": current["question_number"],
        "question": question_text,
        "options": normalized_options,
        "answer": answer,
        "answer_text": answer_text,
    }
    if answer_inferred:
        record["answer_inferred"] = True
    if isinstance(current.get("week"), int):
        record["week"] = current["week"]
    if isinstance(current.get("page"), int):
        record["page"] = current["page"]
    return record


def _new_question(question_number: int, week: int | None, page: int, initial_text: str = "") -> dict[str, Any]:
    question_parts = [initial_text] if initial_text else []
    return {
        "question_number": question_number,
        "question_parts": question_parts,
        "options": {},
        "answer": "",
        "answer_text": "",
        "week": week,
        "page": page,
    }


def _append_finalized_question(parsed: list[dict[str, Any]], current: dict[str, Any] | None) -> None:
    finalized = _finalize_question(current or {})
    if finalized:
        parsed.append(finalized)


def _extract_text_from_pdf(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    chunks: list[str] = []
    for i, page in enumerate(reader.pages):
        chunks.append(f"__PAGE_MARKER_{i+1}__")
        chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def _split_embedded_question_markers(line: str) -> list[str]:
    matches = list(QUESTION_MARKER_ANYWHERE_PATTERN.finditer(line))
    if not matches:
        return [line]
    if len(matches) == 1 and matches[0].start() == 0:
        return [line]

    segments: list[str] = []
    cursor = 0
    for index, match in enumerate(matches):
        start = match.start()
        if start > cursor:
            prefix = _normalize_whitespace(line[cursor:start])
            if prefix:
                segments.append(prefix)

        end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
        segment = _normalize_whitespace(line[start:end])
        if segment:
            segments.append(segment)
        cursor = end

    if cursor < len(line):
        suffix = _normalize_whitespace(line[cursor:])
        if suffix:
            segments.append(suffix)

    return segments


def parse_questions_from_pdf(file_path: Path, source_id: str, source_label: str) -> list[dict[str, Any]]:
    raw_text = _extract_text_from_pdf(file_path)
    lines: list[str] = []
    for raw_line in raw_text.splitlines():
        normalized = _normalize_whitespace(raw_line)
        if not normalized:
            continue
        lines.extend(_split_embedded_question_markers(normalized))

    current: dict[str, Any] | None = None
    current_option_key: str | None = None
    pending_option_keys: list[str] = []
    in_solution_section = False
    current_week: int | None = None
    pending_week_number = False
    expect_implicit_question = False
    parsed: list[dict[str, Any]] = []
    current_page = 1

    for line in lines:
        if not line:
            continue

        if line.startswith("__PAGE_MARKER_"):
            try:
                current_page = int(line.split("_")[4])
            except (IndexError, ValueError):
                pass
            continue

        if pending_week_number:
            week_only_match = WEEK_NUMBER_ONLY_PATTERN.match(line)
            pending_week_number = False
            if week_only_match:
                _append_finalized_question(parsed, current)
                current = None
                current_option_key = None
                pending_option_keys = []
                in_solution_section = False
                current_week = int(week_only_match.group(1))
                expect_implicit_question = True
                continue

        week_match = ASSIGNMENT_WEEK_PATTERN.search(line)
        if week_match:
            _append_finalized_question(parsed, current)
            current = None
            current_option_key = None
            pending_option_keys = []
            in_solution_section = False
            current_week = int(week_match.group(1))
            expect_implicit_question = True
            continue

        if ASSIGNMENT_WEEK_ONLY_PATTERN.search(line):
            pending_week_number = True
            continue

        question_match = QUESTION_PATTERN.match(line)
        if question_match:
            _append_finalized_question(parsed, current)
            current = _new_question(
                question_number=int(question_match.group(1)),
                week=current_week,
                page=current_page,
                initial_text=question_match.group(2),
            )
            current_option_key = None
            pending_option_keys = []
            in_solution_section = False
            expect_implicit_question = False
            continue

        if current is None:
            if not expect_implicit_question:
                continue
            if _is_noise_line(line) or _is_separator_line(line):
                continue

            current = _new_question(question_number=1, week=current_week, page=current_page)
            current_option_key = None
            pending_option_keys = []
            in_solution_section = False
            expect_implicit_question = False

        if _is_noise_line(line) or _is_separator_line(line):
            continue

        if in_solution_section:
            continue

        answer_match = CORRECT_PATTERN.search(line)
        line_before_answer = line
        if answer_match:
            line_before_answer = _normalize_whitespace(line[: answer_match.start()])
            raw_answer = answer_match.group(1)
            current["answer"] = _normalize_option_key(raw_answer) or ""
            current["answer_text"] = DETAILED_SOLUTION_PATTERN.split(answer_match.group(2), maxsplit=1)[0]

        prefix_text, inline_options = _extract_inline_options(line_before_answer)
        if inline_options:
            if prefix_text:
                current["question_parts"].append(prefix_text)

            pending_option_keys = []
            current_option_key = None
            for option_key, option_text in inline_options:
                current["options"][option_key] = option_text
                if option_text:
                    current_option_key = option_key
                else:
                    pending_option_keys.append(option_key)

            if answer_match:
                current_option_key = None
                pending_option_keys = []
            if DETAILED_SOLUTION_PATTERN.search(line):
                in_solution_section = True
            continue

        option_match = OPTION_PATTERN.match(line_before_answer)
        if option_match:
            raw_option_key = option_match.group(1) or option_match.group(2)
            option_key = _normalize_option_key(raw_option_key)
            if option_key is None:
                continue
            option_text = option_match.group(3)
            current["options"][option_key] = option_text
            if option_text:
                current_option_key = option_key
            else:
                pending_option_keys.append(option_key)
                current_option_key = None

            if answer_match:
                current_option_key = None
                pending_option_keys = []
            if DETAILED_SOLUTION_PATTERN.search(line):
                in_solution_section = True
            continue

        if answer_match:
            current_option_key = None
            pending_option_keys = []
            if DETAILED_SOLUTION_PATTERN.search(line):
                in_solution_section = True
            continue

        if DETAILED_SOLUTION_PATTERN.search(line):
            in_solution_section = True
            current_option_key = None
            pending_option_keys = []
            continue

        if pending_option_keys:
            option_key = pending_option_keys.pop(0)
            previous = current["options"].get(option_key, "")
            current["options"][option_key] = _normalize_whitespace(f"{previous} {line}")
            current_option_key = option_key
            continue

        if current_option_key:
            previous = current["options"].get(current_option_key, "")
            current["options"][current_option_key] = _normalize_whitespace(f"{previous} {line}")
        else:
            current["question_parts"].append(line)

    finalized = _finalize_question(current or {})
    if finalized:
        parsed.append(finalized)

    for index, question in enumerate(parsed, start=1):
        question["id"] = f"{source_id}-{index}"
        question["source_id"] = source_id
        question["source_label"] = source_label
        question["source_file"] = file_path.name

    return parsed


def build_question_payload(project_root: Path) -> dict[str, Any]:
    all_questions: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    for source_name in PDF_SOURCES:
        pdf_path = project_root / source_name
        if not pdf_path.exists():
            continue

        source_id = _derive_source_id(source_name)
        source_label = _derive_source_label(source_name)
        questions = parse_questions_from_pdf(pdf_path, source_id=source_id, source_label=source_label)

        sources.append(
            {
                "source_id": source_id,
                "label": source_label,
                "file_name": source_name,
                "question_count": len(questions),
            }
        )
        all_questions.extend(questions)

    if not all_questions:
        raise RuntimeError("No quiz questions were extracted from the PDF files.")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "questions": all_questions,
    }


def write_question_payload(project_root: Path, output_path: Path) -> dict[str, Any]:
    payload = build_question_payload(project_root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def ensure_question_data(project_root: Path, output_path: Path) -> Path:
    source_paths = [project_root / source for source in PDF_SOURCES if (project_root / source).exists()]
    if not source_paths:
        if output_path.exists():
            return output_path
        raise FileNotFoundError("No expected PDF sources found in project root.")

    should_regenerate = not output_path.exists()
    if not should_regenerate:
        latest_source_mtime = max(path.stat().st_mtime for path in source_paths)
        should_regenerate = output_path.stat().st_mtime < latest_source_mtime

    if should_regenerate:
        write_question_payload(project_root, output_path)

    return output_path


def load_question_payload(project_root: Path, output_path: Path) -> dict[str, Any]:
    ensure_question_data(project_root, output_path)
    return json.loads(output_path.read_text(encoding="utf-8"))
