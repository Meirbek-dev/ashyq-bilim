import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from src.app.factory import create_app
from src.infra.db.session import get_db_session
from src.db.users import PublicUser

@pytest.fixture
def app():
    app = create_app()
    # Mock database session
    mock_session = MagicMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    yield app
    app.dependency_overrides = {}

@pytest.mark.asyncio
async def test_login_invalid_credentials(app):
    """Test login with invalid password."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Patch the actual UserManager class used in get_user_manager
        with patch("src.auth.manager.UserManager.authenticate", return_value=None):
            response = await ac.post("/api/v1/auth/login", data={
                "username": "test@example.com",
                "password": "wrongpassword"
            })
            # fastapi-users might return 400 for bad credentials
            assert response.status_code == 400

@pytest.mark.asyncio
async def test_register_duplicate_email(app):
    """Test registration with an already existing email."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        from fastapi_users import exceptions
        with patch("src.auth.manager.UserManager.create", side_effect=exceptions.UserAlreadyExists()):
            response = await ac.post("/api/v1/auth/register", json={
                "email": "exists@example.com",
                "password": "password123",
                "username": "exists",
                "first_name": "John",
                "last_name": "Doe"
            })
            assert response.status_code == 400

@pytest.mark.asyncio
async def test_me_endpoint_requires_auth(app):
    """Test that /me endpoint is protected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/auth/me")
        assert response.status_code == 401

@pytest.mark.asyncio
async def test_rbac_privilege_escalation_vulnerability(app):
    """
    SECURITY TEST: Attempt to access admin data as a regular user.
    """
    regular_user = PublicUser(
        id=1,
        user_uuid="user_uuid",
        username="user",
        email="user@example.com",
        first_name="User",
        last_name="Test",
        theme="default",
        locale="en-US",
        avatar_image="",
        bio="",
        details={},
        profile={}
    )

    # We mock the current user to be a regular user
    from src.auth.users import get_public_user
    app.dependency_overrides[get_public_user] = lambda: regular_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Attempt to create a user group, which should require usergroup:create:platform
        response = await ac.post("/api/v1/usergroups", json={"name": "Attacker Group", "description": "test"})
        
        # If the endpoint is correctly protected by checker.require(), it should return 403
        assert response.status_code == 403
