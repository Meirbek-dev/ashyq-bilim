"""
Server-side quiz grading logic.

Handles multiple correct answers, partial credit, and detailed per-question feedback.
"""

from typing import Any


def grade_quiz(
    questions: list[dict],
    user_answers: list[dict],
    max_score: float = 100.0,
) -> dict[str, Any]:
    """
    Grade a quiz submission.

    Args:
        questions: List of question objects from quiz block
        user_answers: List of user's answer objects
        max_score: Maximum possible score for the quiz

    Returns:
        Dictionary containing:
        - total_score: Total points earned
        - max_score: Maximum possible points
        - percentage: Percentage score
        - passed: Whether the quiz was passed (>= 50%)
        - per_question: List of per-question results
    """

    if not questions:
        return {
            "total_score": 0.0,
            "max_score": max_score,
            "percentage": 0.0,
            "passed": False,
            "per_question": [],
        }

    # Create answer lookup for faster access
    answer_lookup = {ans.get("question_id"): ans for ans in user_answers}

    # Calculate points per question
    # If questions provide explicit `points` values, use them proportionally
    total_defined_points = sum(float(q.get("points", 0)) for q in questions)

    if total_defined_points > 0:
        # We'll compute each question's points individually inside the loop below
        points_per_question = None
    else:
        points_per_question = max_score / len(questions)

    total_score = 0.0
    per_question_results = []

    for question in questions:
        question_id = question.get("question_id") or question.get("questionUUID")
        question_type = question.get("type", "multiple_choice")
        question_text = question.get("question") or question.get("questionText", "")

        user_answer = answer_lookup.get(question_id, {})

        # Decide points for this question (respect explicit question.points if present)
        q_points_raw = (
            float(question.get("points"))
            if question.get("points") is not None
            else None
        )
        if q_points_raw is not None and total_defined_points > 0:
            # Scale question raw points to the overall max_score
            points = (q_points_raw / total_defined_points) * max_score
        else:
            points = points_per_question

        # Grade based on question type
        if question_type == "multiple_choice":
            result = _grade_multiple_choice(question, user_answer, points)
        elif question_type == "custom_answer":
            result = _grade_custom_answer(question, user_answer, points)
        else:
            # Unknown question type - give 0 points
            result = {
                "question_id": question_id,
                "question_text": question_text,
                "correct": False,
                "score": 0.0,
                "max_score": points,
                "feedback": "Unknown question type",
            }

        total_score += result["score"]
        per_question_results.append(result)

    percentage = (total_score / max_score * 100) if max_score > 0 else 0.0

    return {
        "total_score": round(total_score, 2),
        "max_score": max_score,
        "percentage": round(percentage, 2),
        "passed": percentage >= 50.0,
        "per_question": per_question_results,
    }


def _grade_multiple_choice(
    question: dict, user_answer: dict, points: float
) -> dict[str, Any]:
    """Grade a multiple choice question."""

    question_id = question.get("question_id") or question.get("questionUUID")
    question_text = question.get("question") or question.get("questionText", "")
    options = question.get("answers") or question.get("options", [])

    # Find all correct answers (support multiple option key names)
    correct_option_ids = set()
    for opt in options:
        opt_id = (
            opt.get("answer_id")
            or opt.get("optionUUID")
            or opt.get("option_id")
            or opt.get("id")
        )
        is_correct = opt.get("correct") or opt.get("assigned_right_answer", False)
        if is_correct:
            correct_option_ids.add(opt_id)

    # Get user's selected answer(s) (support common variant keys)
    user_selected = (
        user_answer.get("answer_id")
        or user_answer.get("selected_option_id")
        or user_answer.get("selected_options")
        or user_answer.get("selected_options_id")
        or user_answer.get("selected_option_ids")
        or user_answer.get("selected_option")
    )

    if not user_selected:
        return {
            "question_id": question_id,
            "question_text": question_text,
            "correct": False,
            "score": 0.0,
            "max_score": points,
            "feedback": "No answer provided",
            "user_answer": None,
            "correct_answers": list(correct_option_ids),
        }

    # Handle multiple selected answers (if it's a list)
    if isinstance(user_selected, list):
        user_selected_set = set(user_selected)
    else:
        user_selected_set = {user_selected}

    # Calculate score based on overlap
    if not correct_option_ids:
        # No correct answer defined - give full points
        score = points
        correct = True
        feedback = "No correct answer defined"
    elif user_selected_set == correct_option_ids:
        # Perfect match
        score = points
        correct = True
        feedback = "Correct"
    elif user_selected_set.intersection(correct_option_ids):
        # Partial credit: proportional to how many correct answers selected
        correct_selected = len(user_selected_set.intersection(correct_option_ids))
        total_correct = len(correct_option_ids)
        incorrect_selected = len(user_selected_set - correct_option_ids)

        # Partial credit formula:
        # (correct_selected / total_correct) - penalty for incorrect
        partial_score = (correct_selected / total_correct) * points
        penalty = (incorrect_selected / max(len(options), 1)) * points * 0.5
        score = max(0, partial_score - penalty)

        correct = False
        feedback = f"Partially correct ({correct_selected}/{total_correct} correct)"
    else:
        # No correct answers selected
        score = 0.0
        correct = False
        feedback = "Incorrect"

    return {
        "question_id": question_id,
        "question_text": question_text,
        "correct": correct,
        "score": round(score, 2),
        "max_score": points,
        "feedback": feedback,
        "user_answer": list(user_selected_set),
        "correct_answers": list(correct_option_ids),
    }


def _grade_custom_answer(
    question: dict, user_answer: dict, points: float
) -> dict[str, Any]:
    """
    Grade a custom/text answer question.

    For now, requires manual grading - returns 0 points but marks as 'needs_grading'.
    """

    question_id = question.get("question_id") or question.get("questionUUID")
    question_text = question.get("question") or question.get("questionText", "")
    user_text = user_answer.get("answer", "")

    return {
        "question_id": question_id,
        "question_text": question_text,
        "correct": False,
        "score": 0.0,
        "max_score": points,
        "feedback": "Requires manual grading",
        "user_answer": user_text,
        "needs_grading": True,
    }


def apply_attempt_penalty(
    base_score: float,
    attempt_number: int,
    max_score_penalty_per_attempt: float | None,
) -> float:
    """
    Apply score penalty for multiple attempts.

    Args:
        base_score: The original score earned
        attempt_number: Which attempt this is (1-indexed)
        max_score_penalty_per_attempt: Max score reduction per attempt (e.g., 10 = -10% per attempt)

    Returns:
        Adjusted score after penalty
    """

    if not max_score_penalty_per_attempt or attempt_number <= 1:
        return base_score

    # Calculate penalty (e.g., 2nd attempt = 1 penalty, 3rd = 2 penalties, etc.)
    penalty_multiplier = attempt_number - 1
    max_score_reduction = max_score_penalty_per_attempt * penalty_multiplier

    # Apply penalty to max achievable score
    penalized_max = max(0, 100 - max_score_reduction)

    # Cap the score at the penalized maximum
    return min(base_score, penalized_max)
