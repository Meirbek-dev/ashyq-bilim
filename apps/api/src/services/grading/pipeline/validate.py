"""Pipeline stage: validate and parse submission answers.

This stage normalizes the raw answers payload into canonical typed answers
keyed by item_uuid. No legacy fallback paths — only the canonical format
is accepted.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError

from src.db.assessments import ITEM_ANSWER_ADAPTER
from src.services.grading.pipeline.context import ParsedAnswers


def validate_and_parse(answers_payload: dict) -> ParsedAnswers:
    """Parse a raw answers payload into canonical typed answers.

    Accepts two canonical formats:
      1. {"answers": {"item_uuid": {...answer...}, ...}}  (dict keyed by uuid)
      2. {"answers": [{"item_uuid": "...", "answer": {...}}, ...]}  (list of entries)

    Raises 422 if the payload contains no parseable canonical answers.
    """
    answers_by_item_uuid = _extract_canonical_answers(answers_payload)
    return ParsedAnswers(
        answers_by_item_uuid=answers_by_item_uuid,
        raw_payload=answers_payload,
    )


def _extract_canonical_answers(answers_payload: object) -> dict[str, Any]:
    """Extract canonical answers from the payload.

    Supports dict-keyed and list-of-entries formats.
    """
    if not isinstance(answers_payload, dict):
        return {}

    raw_answers = answers_payload.get("answers")

    # Format 1: dict keyed by item_uuid
    if isinstance(raw_answers, dict):
        normalized: dict[str, Any] = {}
        for item_uuid, raw_answer in raw_answers.items():
            if not isinstance(item_uuid, str):
                continue
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except ValidationError:
                if isinstance(raw_answer, dict):
                    normalized[item_uuid] = raw_answer
        return normalized

    # Format 2: list of {item_uuid, answer} entries
    if isinstance(raw_answers, list):
        normalized = {}
        for entry in raw_answers:
            if not isinstance(entry, dict):
                continue
            item_uuid = entry.get("item_uuid")
            raw_answer = entry.get("answer")
            if not isinstance(item_uuid, str) or not isinstance(raw_answer, dict):
                continue
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except ValidationError:
                normalized[item_uuid] = raw_answer
        return normalized

    return {}
