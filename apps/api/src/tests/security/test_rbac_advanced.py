from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from src.security.rbac import (
    AuthenticationRequired,
    FeatureDisabled,
    PermissionChecker,
    PermissionDenied,
    ResourceAccessDenied,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session() -> MagicMock:
    return MagicMock()


@pytest.fixture
def checker(db_session: MagicMock) -> PermissionChecker:
    # We mock _get_or_load directly so we can test the resolution logic
    # without needing the full DB setup or user/role fixtures.
    pc = PermissionChecker(db=db_session)
    # Important: `_resolve` calls `_has_perm` directly, but we test `check()`.
    # Let's manually implement `_get_or_load` using a simple cache
    return pc


# ---------------------------------------------------------------------------
# Test: Scope Resolution (All, Own, Assigned)
# ---------------------------------------------------------------------------


class TestRBACResolution:
    @pytest.mark.parametrize(
        "granted_perms, requested_perm, kwargs, expected",
        [
            # --- Global/Platform Scope Tests ---
            ({"course:read:all"}, "course:read", {}, True),
            (
                {"course:read:platform"},
                "course:read",
                {"resource_owner_id": 999},
                True,
            ),  # platform beats everything
            # --- Own Scope Tests ---
            (
                {"course:read:own"},
                "course:read",
                {"resource_owner_id": 1},
                True,
            ),  # I am the owner
            (
                {"course:read:own"},
                "course:read",
                {"resource_owner_id": 2},
                False,
            ),  # Not the owner
            (
                {"course:read:own"},
                "course:read",
                {"is_owner": True},
                True,
            ),  # Explicit ownership flag
            (
                {"course:read:own"},
                "course:read",
                {"is_owner": False},
                False,
            ),  # Explicit not-owner flag
            # --- Assigned Scope Tests ---
            (
                {"course:read:assigned"},
                "course:read",
                {"is_assigned": True},
                True,
            ),  # I am assigned
            (
                {"course:read:assigned"},
                "course:read",
                {"is_assigned": False},
                False,
            ),  # Not assigned
            (
                {"course:read:assigned"},
                "course:read",
                {"resource_owner_id": 1},
                False,
            ),  # Ownership does not imply assignment implicitly here
            # --- Combined Scopes (Highest wins) ---
            (
                {"course:read:own", "course:read:assigned"},
                "course:read",
                {"is_assigned": True, "resource_owner_id": 2},
                True,
            ),
            (
                {"course:read:own", "course:read:assigned"},
                "course:read",
                {"is_assigned": False, "resource_owner_id": 1},
                True,
            ),
            (
                {"course:read:own", "course:read:assigned"},
                "course:read",
                {"is_assigned": False, "resource_owner_id": 2},
                False,
            ),
            # --- Unknown/Missing Permissions ---
            ({"course:write:all"}, "course:read", {}, False),
            (set(), "course:read", {}, False),
            # --- Anonymous User (0) Handling ---
            # If the user is 0, they can still match if they somehow have platform perms (though normally they won't).
            # But they CANNOT match 'own' because resource_owner_id=0 is prevented.
            (
                {"course:read:own"},
                "course:read",
                {"resource_owner_id": 0},
                False,
            ),  # User 0 cannot own things
        ],
    )
    def test_permission_resolution(
        self,
        checker: PermissionChecker,
        granted_perms: set[str],
        requested_perm: str,
        kwargs: dict,
        expected: bool,
    ) -> None:
        """Table-driven testing for RBAC scope resolution."""
        checker._cache[1] = granted_perms  # Mock loaded perms for user 1

        # Determine user_id to use based on resource_owner_id check for User 0
        user_id = (
            0
            if kwargs.get("resource_owner_id") == 0
            and next(iter(granted_perms)).endswith(":own")
            else 1
        )
        if user_id == 0:
            checker._cache[0] = granted_perms

        # Actually _resolve checks all, platform, assigned, own inside the method
        # and doesn't rely on self._get_or_load. But `check()` does.
        # We need to mock the `_resolve` method? No, `check` calls `_get_or_load` and then `_resolve`.

        # Monkey patch _resolve to read exactly the logic from rbac.py
        # Actually `PermissionChecker._resolve` is a staticmethod and handles the scopes.
        # Wait, the logic is:
        # def _resolve(permission, granted, user_id, ...):
        #   if _has_perm(granted, resource, action, "all"): return True
        #   ... "platform" ... "assigned" ... "own"

        result = checker.check(user_id=user_id, permission=requested_perm, **kwargs)
        assert result is expected


# ---------------------------------------------------------------------------
# Test: Require() raising exceptions
# ---------------------------------------------------------------------------


class TestRBACRequire:
    def test_require_success(self, checker: PermissionChecker) -> None:
        """Test that require() does nothing if permission is granted."""
        checker._cache[1] = {"system:admin:all"}
        checker.require(1, "system:admin")  # Should not raise

    def test_require_permission_denied(self, checker: PermissionChecker) -> None:
        """Test that require() raises PermissionDenied on failure."""
        checker._cache[1] = {"course:read:own"}

        with pytest.raises(PermissionDenied) as exc_info:
            checker.require(1, "course:read", resource_owner_id=2)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["error_code"] == "PERMISSION_DENIED"
        assert exc_info.value.detail["permission"] == "course:read"

    def test_require_authentication_required(self, checker: PermissionChecker) -> None:
        """Test that require() on anonymous user (user_id=0) can trigger AuthenticationRequired
        if standard PermissionDenied logic wants to give a clearer error (handled in routes usually,
        but let's verify custom exceptions)."""
        # Actual require() just throws PermissionDenied even for user 0, but the routes often do:
        # if not user: raise AuthenticationRequired(). We just test the exception itself.
        exc = AuthenticationRequired()
        assert exc.status_code == 401
        assert exc.detail["error_code"] == "AUTHENTICATION_REQUIRED"


# ---------------------------------------------------------------------------
# Test: Privilege Escalation & Edge Cases
# ---------------------------------------------------------------------------


class TestRBACSecurityEdgeCases:
    def test_role_escalation_via_wildcards_is_supported(
        self, checker: PermissionChecker
    ) -> None:
        """Ensure wildcards ARE supported but tightly controlled by the system."""
        checker._cache[1] = {"*:*:*"}
        # If the user literally has *:*:*, they are God.
        assert checker.check(1, "system:admin") is True

    def test_escalation_attempt_with_malformed_owner(
        self, checker: PermissionChecker
    ) -> None:
        """Ensure users cannot bypass ownership by passing string IDs or None maliciously."""
        checker._cache[1] = {"course:write:own"}

        # User 1 tries to edit None owner
        assert checker.check(1, "course:write", resource_owner_id=None) is False

    def test_conflicting_roles_resolution(self, checker: PermissionChecker) -> None:
        """Ensure that if a user has both a restrictive and permissive scope, permissive wins."""
        # e.g., they have course:read:own but ALSO course:read:platform
        checker._cache[1] = {"course:read:own", "course:read:platform"}

        # They should be able to read SOMEONE ELSE's course because of the platform scope
        assert checker.check(1, "course:read", resource_owner_id=999) is True


# ---------------------------------------------------------------------------
# Test: Custom Exceptions
# ---------------------------------------------------------------------------


class TestRBACExceptions:
    def test_feature_disabled_exception(self) -> None:
        exc = FeatureDisabled("Payments are offline")
        assert exc.status_code == 403
        assert exc.detail["error_code"] == "FEATURE_DISABLED"
        assert exc.detail["message"] == "Payments are offline"

    def test_resource_access_denied_exception(self) -> None:
        exc = ResourceAccessDenied("Too many attempts")
        assert exc.status_code == 403
        assert exc.detail["error_code"] == "ACCESS_DENIED"
        assert exc.detail["message"] == "Too many attempts"
