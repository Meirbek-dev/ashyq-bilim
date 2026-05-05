from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.auth.users import get_public_user
from src.routers.courses.activities import blocks as blocks_router_module
from src.routers.courses.activities.blocks import router


def _build_client(monkeypatch, *, attempts_enabled: bool, stats_enabled: bool) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/blocks")
    app.dependency_overrides[get_public_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[blocks_router_module.get_db_session] = lambda: None
    monkeypatch.setattr(
        blocks_router_module,
        "get_settings",
        lambda: SimpleNamespace(
            assessment_feature_flags=SimpleNamespace(
                legacy_quiz_attempts_route_enabled=attempts_enabled,
                legacy_quiz_stats_route_enabled=stats_enabled,
            )
        ),
    )
    monkeypatch.setattr(
        blocks_router_module,
        "get_quiz_attempts",
        lambda **_kwargs: [],
    )
    monkeypatch.setattr(
        blocks_router_module,
        "get_quiz_stats",
        lambda **_kwargs: [],
    )
    return TestClient(app)


def test_quiz_attempts_route_respects_legacy_flag(monkeypatch) -> None:
    client = _build_client(monkeypatch, attempts_enabled=False, stats_enabled=True)

    response = client.get("/blocks/quiz/12/attempts")

    assert response.status_code == 404
    assert response.json()["detail"] == "Legacy quiz attempts route disabled"


def test_quiz_stats_route_respects_legacy_flag(monkeypatch) -> None:
    client = _build_client(monkeypatch, attempts_enabled=True, stats_enabled=False)

    response = client.get("/blocks/quiz/12/stats")

    assert response.status_code == 404
    assert response.json()["detail"] == "Legacy quiz stats route disabled"
