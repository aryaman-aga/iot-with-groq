from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from quiz_loader import write_question_payload  # noqa: E402


def main() -> None:
    output_path = PROJECT_ROOT / "quiz_data" / "questions.json"
    payload = write_question_payload(PROJECT_ROOT, output_path)
    print(
        json.dumps(
            {
                "generated_at": payload["generated_at"],
                "sources": payload["sources"],
                "total_questions": len(payload["questions"]),
                "output": str(output_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
