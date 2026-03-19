from src.services.analytics.assessments import _attempt_distribution, _score_bucket


def test_score_bucket_groups_scores_into_ranges() -> None:
    assert _score_bucket(12) == "0-19"
    assert _score_bucket(67) == "60-79"
    assert _score_bucket(95) == "80-100"


def test_score_bucket_handles_unknown_values() -> None:
    assert _score_bucket(None) == "Неизвестно"


def test_attempt_distribution_rolls_up_high_attempt_counts() -> None:
    buckets = _attempt_distribution({1: 1, 2: 2, 3: 5, 4: 7})
    lookup = {bucket.label: bucket.count for bucket in buckets}

    assert lookup["1"] == 1
    assert lookup["2"] == 1
    assert lookup["5+"] == 2
