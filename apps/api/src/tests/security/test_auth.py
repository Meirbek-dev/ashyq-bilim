from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException, Request
from jwt import PyJWTError, decode, encode
from sqlmodel import Session

from src.db.users import AnonymousUser, PublicUser, User
from src.security.auth import (
    Token,
    TokenData,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    get_access_token_from_request,
    get_current_user,
    get_current_user_optional,
    non_public_endpoint,
)
from src.security.security import ALGORITHM, get_secret_key


class TestAuth:
    """Test cases for auth.py module"""

    @pytest.fixture
    def mock_request(self) -> Mock:
        """Create a mock request object"""
        return Mock(spec=Request)

    @pytest.fixture
    def mock_db_session(self) -> Mock:
        """Create a mock database session"""
        return Mock(spec=Session)

    @pytest.fixture
    def mock_user(self) -> Mock:
        """Create a mock user object"""
        user = Mock(spec=User)
        user.email = "test@example.com"
        user.password = "hashed_password"
        user.model_dump.return_value = {
            "id": 1,
            "email": "test@example.com",
            "username": "testuser",
            "first_name": "Test",
            "last_name": "User",
            "user_uuid": "user_123",
        }
        return user

    def test_token_model(self) -> None:
        """Test Token model"""
        token = Token(access_token="test_token", token_type="bearer")
        assert token.access_token == "test_token"
        assert token.token_type == "bearer"

    def test_token_data_model(self) -> None:
        """Test TokenData model"""
        token_data = TokenData(username="test@example.com")
        assert token_data.username == "test@example.com"

    def test_token_data_model_default(self) -> None:
        """Test TokenData model with default values"""
        token_data = TokenData()
        assert token_data.username is None

    @pytest.mark.asyncio
    async def test_authenticate_user_success(
        self, mock_request, mock_db_session, mock_user
    ) -> None:
        """Test successful user authentication"""
        with (
            patch(
                "src.security.auth.security_get_user", new_callable=AsyncMock
            ) as mock_get_user,
            patch("src.security.auth.security_verify_password", return_value=True),
        ):
            mock_get_user.return_value = mock_user

            result = await authenticate_user(
                request=mock_request,
                email="test@example.com",
                password="correct_password",
                db_session=mock_db_session,
            )

            assert result == mock_user
            mock_get_user.assert_called_once_with(
                mock_request, mock_db_session, "test@example.com"
            )

    @pytest.mark.asyncio
    async def test_authenticate_user_user_not_found(
        self, mock_request, mock_db_session
    ) -> None:
        """Test authentication when user is not found"""
        with patch(
            "src.security.auth.security_get_user", new_callable=AsyncMock
        ) as mock_get_user:
            mock_get_user.return_value = None

            result = await authenticate_user(
                request=mock_request,
                email="nonexistent@example.com",
                password="password",
                db_session=mock_db_session,
            )

            assert result is False

    @pytest.mark.asyncio
    async def test_authenticate_user_wrong_password(
        self, mock_request, mock_db_session, mock_user
    ) -> None:
        """Test authentication with wrong password"""
        with (
            patch(
                "src.security.auth.security_get_user", new_callable=AsyncMock
            ) as mock_get_user,
            patch("src.security.auth.security_verify_password", return_value=False),
        ):
            mock_get_user.return_value = mock_user

            result = await authenticate_user(
                request=mock_request,
                email="test@example.com",
                password="wrong_password",
                db_session=mock_db_session,
            )

            assert result is False

    def test_create_access_token_default_expiry(self) -> None:
        """Test access token creation with default expiry"""
        data = {"sub": "test@example.com"}
        token = create_access_token(data)
        secret_key = get_secret_key()

        # Verify token is created
        assert isinstance(token, str)
        assert len(token) > 0

        # Decode and verify token
        decoded = decode(token, secret_key, algorithms=[ALGORITHM])
        assert decoded["sub"] == "test@example.com"
        assert "exp" in decoded
        assert decoded["type"] == "access"

    def test_create_access_token_custom_expiry(self) -> None:
        """Test access token creation with custom expiry"""
        data = {"sub": "test@example.com"}
        expires_delta = timedelta(hours=2)
        token = create_access_token(data, expires_delta)
        secret_key = get_secret_key()

        # Decode and verify token
        decoded = decode(token, secret_key, algorithms=[ALGORITHM])
        assert decoded["sub"] == "test@example.com"

        # Check that expiry time exists and is in the future
        assert "exp" in decoded
        exp_time = datetime.fromtimestamp(decoded["exp"], tz=UTC)
        now = datetime.now(UTC)

        # Verify the token expires in the future
        assert exp_time > now

    def test_create_refresh_token_default_expiry(self) -> None:
        """Test refresh token creation with default expiry"""
        data = {"sub": "test@example.com"}
        token = create_refresh_token(data)
        secret_key = get_secret_key()

        decoded = decode(token, secret_key, algorithms=[ALGORITHM])
        assert decoded["sub"] == "test@example.com"
        assert decoded["type"] == "refresh"
        assert "exp" in decoded

    def test_decode_access_token_success(self) -> None:
        token = create_access_token({"sub": "test@example.com"})
        token_data = decode_access_token(token)
        assert token_data.username == "test@example.com"

    def test_decode_refresh_token_success(self) -> None:
        token = create_refresh_token({"sub": "test@example.com"})
        token_data = decode_refresh_token(token)
        assert token_data.username == "test@example.com"

    def test_decode_access_token_with_wrong_type(self) -> None:
        token = create_refresh_token({"sub": "test@example.com"})
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(token)
        assert exc_info.value.status_code == 401

    def test_decode_refresh_token_with_wrong_type(self) -> None:
        token = create_access_token({"sub": "test@example.com"})
        with pytest.raises(HTTPException) as exc_info:
            decode_refresh_token(token)
        assert exc_info.value.status_code == 401

    def test_decode_access_token_missing_sub(self) -> None:
        secret_key = get_secret_key()

        token = encode(
            {
                "type": "access",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            secret_key,
            algorithm=ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(token)
        assert exc_info.value.status_code == 401

    def test_decode_access_token_expired(self) -> None:
        token = create_access_token(
            {"sub": "test@example.com"},
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(token)
        assert exc_info.value.status_code == 401

    def test_get_access_token_from_request_prefers_header(self, mock_request) -> None:
        mock_request.cookies = {"access_token_cookie": "cookie-token"}
        result = get_access_token_from_request(mock_request, "header-token")
        assert result == "header-token"

    def test_get_access_token_from_request_uses_cookie(self, mock_request) -> None:
        mock_request.cookies = {"access_token_cookie": "cookie-token"}
        result = get_access_token_from_request(mock_request, None)
        assert result == "cookie-token"

    @pytest.mark.asyncio
    async def test_get_current_user_authenticated(
        self, mock_request, mock_db_session, mock_user
    ) -> None:
        """Test getting current user when authenticated"""
        with patch(
            "src.security.auth.security_get_user", new_callable=AsyncMock
        ) as mock_get_user:
            mock_get_user.return_value = mock_user
            token = create_access_token({"sub": "test@example.com"})

            result = await get_current_user(
                request=mock_request,
                token=token,
                db_session=mock_db_session,
            )

            assert isinstance(result, PublicUser)
            mock_get_user.assert_called_once_with(
                mock_request, mock_db_session, email="test@example.com"
            )

    @pytest.mark.asyncio
    async def test_get_current_user_authenticated_from_cookie(
        self, mock_request, mock_db_session, mock_user
    ) -> None:
        with patch(
            "src.security.auth.security_get_user", new_callable=AsyncMock
        ) as mock_get_user:
            mock_get_user.return_value = mock_user
            token = create_access_token({"sub": "test@example.com"})
            mock_request.cookies = {"access_token_cookie": token}

            result = await get_current_user(
                request=mock_request,
                token=None,
                db_session=mock_db_session,
            )

            assert isinstance(result, PublicUser)

    @pytest.mark.asyncio
    async def test_get_current_user_missing_header_and_cookie_raises(
        self, mock_request, mock_db_session
    ) -> None:
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                request=mock_request,
                token=None,
                db_session=mock_db_session,
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_anonymous(
        self, mock_request, mock_db_session
    ) -> None:
        """Test getting current user when anonymous"""
        result = await get_current_user_optional(
            request=mock_request,
            token=None,
            db_session=mock_db_session,
        )

        assert isinstance(result, AnonymousUser)

    @pytest.mark.asyncio
    async def test_get_current_user_jwt_error(
        self, mock_request, mock_db_session
    ) -> None:
        """Test getting current user when JWT is invalid"""
        with patch("src.security.auth.jwt.decode") as mock_decode:
            mock_decode.side_effect = PyJWTError("Invalid token")

            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    request=mock_request,
                    token="invalid-token",
                    db_session=mock_db_session,
                )

        assert exc_info.value.status_code == 401
        assert "Could not validate credentials" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_current_user_user_not_found(
        self, mock_request, mock_db_session
    ) -> None:
        """Test getting current user when user doesn't exist in database"""
        with patch(
            "src.security.auth.security_get_user", new_callable=AsyncMock
        ) as mock_get_user:
            mock_get_user.return_value = None
            token = create_access_token({"sub": "nonexistent@example.com"})

            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    request=mock_request,
                    token=token,
                    db_session=mock_db_session,
                )

            assert exc_info.value.status_code == 401
            assert "Could not validate credentials" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_current_user_optional_invalid_token_raises(
        self, mock_request, mock_db_session
    ) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_optional(
                request=mock_request,
                token="bad-token",
                db_session=mock_db_session,
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_non_public_endpoint_authenticated(self, mock_user) -> None:
        """Test non_public_endpoint with authenticated user"""
        # Should not raise any exception
        await non_public_endpoint(mock_user)

    @pytest.mark.asyncio
    async def test_non_public_endpoint_anonymous(self) -> None:
        """Test non_public_endpoint with anonymous user"""
        anonymous_user = AnonymousUser()

        with pytest.raises(HTTPException) as exc_info:
            await non_public_endpoint(anonymous_user)

        assert exc_info.value.status_code == 401
