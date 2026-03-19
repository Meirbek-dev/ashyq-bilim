from src.services.analytics.exports import MAX_EXPORT_ROWS, _csv_string


def test_csv_string_includes_header_and_caps_rows() -> None:
    headers = ["a", "b"]
    rows = [[index, index + 1] for index in range(MAX_EXPORT_ROWS + 10)]

    csv_text = _csv_string(headers, rows)
    lines = csv_text.strip().splitlines()

    assert lines[0] == "a,b"
    assert len(lines) == MAX_EXPORT_ROWS + 1
