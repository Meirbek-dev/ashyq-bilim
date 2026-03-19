"""
Unit tests for quiz grading logic.

Tests cover:
- Multiple choice questions with single/multiple correct answers
- Partial credit calculation
- Custom answer questions
- Attempt penalties
- Edge cases
"""

import pytest

from src.services.blocks.block_types.quizBlock.grading import (
    apply_attempt_penalty,
    grade_quiz,
)


class TestQuizGrading:
    """Test suite for quiz grading functionality"""

    def test_single_correct_answer_correct_submission(self) -> None:
        """Test grading a quiz with one correct answer selected correctly"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "What is 2+2?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "3", "assigned_right_answer": False},
                    {"optionUUID": "a2", "text": "4", "assigned_right_answer": True},
                    {"optionUUID": "a3", "text": "5", "assigned_right_answer": False},
                ],
            }
        ]

        user_answers = [{"question_id": "q1", "answer_id": "a2"}]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 100.0
        assert result["percentage"] == 100.0
        assert result["passed"] is True
        assert len(result["per_question"]) == 1
        assert result["per_question"][0]["correct"] is True
        assert result["per_question"][0]["score"] == 100.0

    def test_single_correct_answer_wrong_submission(self) -> None:
        """Test grading a quiz with wrong answer selected"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "What is 2+2?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "3", "assigned_right_answer": False},
                    {"optionUUID": "a2", "text": "4", "assigned_right_answer": True},
                    {"optionUUID": "a3", "text": "5", "assigned_right_answer": False},
                ],
            }
        ]

        user_answers = [{"question_id": "q1", "answer_id": "a1"}]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 0.0
        assert result["percentage"] == 0.0
        assert result["passed"] is False
        assert result["per_question"][0]["correct"] is False

    def test_multiple_correct_answers_all_selected(self) -> None:
        """Test grading with multiple correct answers all selected"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "Select all even numbers",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "1", "assigned_right_answer": False},
                    {"optionUUID": "a2", "text": "2", "assigned_right_answer": True},
                    {"optionUUID": "a3", "text": "3", "assigned_right_answer": False},
                    {"optionUUID": "a4", "text": "4", "assigned_right_answer": True},
                ],
            }
        ]

        user_answers = [
            {"question_id": "q1", "selected_option_id": ["a2", "a4"]},
        ]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 100.0
        assert result["percentage"] == 100.0
        assert result["passed"] is True

    def test_multiple_correct_answers_partial_selection(self) -> None:
        """Test grading with only some correct answers selected"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "Select all even numbers",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "1", "assigned_right_answer": False},
                    {"optionUUID": "a2", "text": "2", "assigned_right_answer": True},
                    {"optionUUID": "a3", "text": "3", "assigned_right_answer": False},
                    {"optionUUID": "a4", "text": "4", "assigned_right_answer": True},
                ],
            }
        ]

        # User only selects one of two correct answers
        user_answers = [
            {"question_id": "q1", "selected_option_id": ["a2"]},
        ]

        result = grade_quiz(questions, user_answers, 100.0)

        # Should get partial credit (50% of question points)
        assert 40 < result["total_score"] <= 50  # Approximately 50 points
        assert result["passed"] is True
        assert result["per_question"][0]["correct"] is False

    def test_multiple_questions(self) -> None:
        """Test grading a quiz with multiple questions"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "What is 2+2?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "4", "assigned_right_answer": True},
                    {"optionUUID": "a2", "text": "5", "assigned_right_answer": False},
                ],
            },
            {
                "question_id": "q2",
                "questionText": "What is 3+3?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "b1", "text": "5", "assigned_right_answer": False},
                    {"optionUUID": "b2", "text": "6", "assigned_right_answer": True},
                ],
            },
        ]

        user_answers = [
            {"question_id": "q1", "answer_id": "a1"},  # Correct
            {"question_id": "q2", "answer_id": "b2"},  # Correct
        ]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 100.0
        assert result["percentage"] == 100.0
        assert result["passed"] is True
        assert len(result["per_question"]) == 2
        assert all(q["correct"] for q in result["per_question"])

    def test_mixed_correct_and_wrong_answers(self) -> None:
        """Test grading with some correct and some wrong answers"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "What is 2+2?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "4", "assigned_right_answer": True},
                    {"optionUUID": "a2", "text": "5", "assigned_right_answer": False},
                ],
            },
            {
                "question_id": "q2",
                "questionText": "What is 3+3?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "b1", "text": "5", "assigned_right_answer": False},
                    {"optionUUID": "b2", "text": "6", "assigned_right_answer": True},
                ],
            },
        ]

        user_answers = [
            {"question_id": "q1", "answer_id": "a1"},  # Correct
            {"question_id": "q2", "answer_id": "b1"},  # Wrong
        ]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 50.0  # 50% correct
        assert result["percentage"] == 50.0
        assert result["passed"] is True  # Need 50% to pass

    def test_no_answer_provided(self) -> None:
        """Test grading when user doesn't answer a question"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "What is 2+2?",
                "type": "multiple_choice",
                "options": [
                    {"optionUUID": "a1", "text": "4", "assigned_right_answer": True},
                    {"optionUUID": "a2", "text": "5", "assigned_right_answer": False},
                ],
            }
        ]

        user_answers = []  # No answer provided

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 0.0
        assert result["percentage"] == 0.0
        assert result["passed"] is False
        assert result["per_question"][0]["feedback"] == "No answer provided"

    def test_custom_answer_requires_manual_grading(self) -> None:
        """Test that custom answer questions require manual grading"""
        questions = [
            {
                "question_id": "q1",
                "questionText": "Explain photosynthesis",
                "type": "custom_answer",
                "options": [],
            }
        ]

        user_answers = [
            {
                "question_id": "q1",
                "answer": "Photosynthesis is the process plants use to convert sunlight into energy.",
            }
        ]

        result = grade_quiz(questions, user_answers, 100.0)

        assert result["total_score"] == 0.0  # Requires manual grading
        assert result["per_question"][0]["feedback"] == "Requires manual grading"
        assert result["per_question"][0]["needs_grading"] is True

    def test_empty_quiz(self) -> None:
        """Test grading an empty quiz"""
        result = grade_quiz([], [], 100.0)

        assert result["total_score"] == 0.0
        assert result["percentage"] == 0.0
        assert result["passed"] is False
        assert len(result["per_question"]) == 0


class TestAttemptPenalty:
    """Test suite for attempt penalty calculation"""

    def test_no_penalty_first_attempt(self) -> None:
        """Test that first attempt has no penalty"""
        score = apply_attempt_penalty(100.0, 1, 10.0)
        assert score == 100.0

    def test_penalty_second_attempt(self) -> None:
        """Test penalty on second attempt"""
        score = apply_attempt_penalty(100.0, 2, 10.0)
        # 2nd attempt = 1 penalty = max 90%
        assert score == 90.0

    def test_penalty_third_attempt(self) -> None:
        """Test penalty on third attempt"""
        score = apply_attempt_penalty(100.0, 3, 10.0)
        # 3rd attempt = 2 penalties = max 80%
        assert score == 80.0

    def test_penalty_caps_score(self) -> None:
        """Test that penalty properly caps the score"""
        score = apply_attempt_penalty(95.0, 2, 10.0)
        # Score is 95, but max allowed is 90 on 2nd attempt
        assert score == 90.0

    def test_no_penalty_when_none_configured(self) -> None:
        """Test no penalty when penalty is not configured"""
        score = apply_attempt_penalty(100.0, 5, None)
        assert score == 100.0

    def test_penalty_cannot_go_negative(self) -> None:
        """Test that penalty doesn't result in negative scores"""
        score = apply_attempt_penalty(100.0, 15, 10.0)
        # 15th attempt = 14 penalties = max 0% (not negative)
        assert score == 0.0

    def test_penalty_with_partial_score(self) -> None:
        """Test penalty application on partial scores"""
        score = apply_attempt_penalty(60.0, 2, 10.0)
        # 2nd attempt max = 90%, user got 60%, keep 60%
        assert score == 60.0

    def test_penalty_with_high_rate(self) -> None:
        """Test high penalty rate"""
        score = apply_attempt_penalty(100.0, 2, 50.0)
        # 2nd attempt = max 50%
        assert score == 50.0

    def test_penalty_zero_rate(self) -> None:
        """Test zero penalty rate"""
        score = apply_attempt_penalty(100.0, 5, 0.0)
        # No penalty even on 5th attempt
        assert score == 100.0

    def test_penalty_fractional_rates(self) -> None:
        """Test fractional penalty rates"""
        score = apply_attempt_penalty(100.0, 2, 7.5)
        # 2nd attempt = max 92.5%
        assert score == 92.5


class TestQuizEdgeCases:
    """Test edge cases and boundary conditions"""

    def test_empty_questions_list(self) -> None:
        """Test grading with no questions"""
        result = grade_quiz([], [], 100.0)
        assert result["total_score"] == 0.0
        assert result["percentage"] == 0.0
        assert result["passed"] is False

    def test_no_user_answers(self) -> None:
        """Test when user submits without answering"""
        questions = [
            {
                "question_id": "q1",
                "type": "multiple_choice",
                "points": 50.0,
                "options": [
                    {"option_id": "a", "correct": True},
                    {"option_id": "b", "correct": False},
                ],
            }
        ]
        result = grade_quiz(questions, [], 100.0)
        assert result["total_score"] == 0.0

    def test_answer_to_nonexistent_question(self) -> None:
        """Test answer for question that doesn't exist"""
        questions = [
            {
                "question_id": "q1",
                "type": "multiple_choice",
                "points": 100.0,
                "options": [
                    {"option_id": "a", "correct": True},
                ],
            }
        ]
        user_answers = [{"question_id": "q999", "selected_options": ["a"]}]
        result = grade_quiz(questions, user_answers, 100.0)
        # Should only grade q1, which wasn't answered
        assert result["total_score"] == 0.0

    def test_max_score_distribution(self) -> None:
        """Test that max_score is properly distributed"""
        questions = [
            {
                "question_id": "q1",
                "type": "multiple_choice",
                "points": 30.0,
                "options": [{"option_id": "a", "correct": True}],
            },
            {
                "question_id": "q2",
                "type": "multiple_choice",
                "points": 70.0,
                "options": [{"option_id": "a", "correct": True}],
            },
        ]
        user_answers = [
            {"question_id": "q1", "selected_options": ["a"]},
            {"question_id": "q2", "selected_options": ["a"]},
        ]
        result = grade_quiz(questions, user_answers, 100.0)
        assert result["total_score"] == 100.0

    def test_custom_answer_needs_grading_flag(self) -> None:
        """Test that custom answer questions are flagged for manual grading"""
        questions = [
            {
                "question_id": "q1",
                "type": "custom_answer",
                "points": 100.0,
            }
        ]
        user_answers = [{"question_id": "q1", "answer_text": "My answer"}]
        result = grade_quiz(questions, user_answers, 100.0)

        assert len(result["per_question"]) == 1
        assert result["per_question"][0]["needs_grading"] is True
        assert result["per_question"][0]["score"] == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
