"""
Custom exceptions for AI services with proper error handling.
"""

from typing import Any


class AIServiceException(Exception):
    """Base exception for all AI service errors."""

    def __init__(
        self,
        message: str,
        error_code: str = "AI_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize AI service exception.

        Args:
            message: Human-readable error message
            error_code: Machine-readable error code
            details: Additional error details
        """
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.message,
            "error_code": self.error_code,
            "details": self.details,
        }


class AIConfigurationError(AIServiceException):
    """Raised when AI configuration is invalid or missing."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "AI_CONFIG_ERROR", details)


class AIModelNotAvailableError(AIServiceException):
    """Raised when requested AI model is not available."""

    def __init__(self, model_name: str, details: dict[str, Any] | None = None) -> None:
        message = f"AI model '{model_name}' is not available"
        super().__init__(message, "AI_MODEL_NOT_AVAILABLE", details)


class AIProcessingError(AIServiceException):
    """Raised when AI processing fails."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "AI_PROCESSING_ERROR", details)


class AITimeoutError(AIServiceException):
    """Raised when AI processing times out."""

    def __init__(self, timeout: int, details: dict[str, Any] | None = None) -> None:
        message = f"AI processing timed out after {timeout} seconds"
        super().__init__(message, "AI_TIMEOUT_ERROR", details)


class AIRateLimitError(AIServiceException):
    """Raised when rate limit is exceeded."""

    def __init__(
        self, limit: int, period: str, details: dict[str, Any] | None = None
    ) -> None:
        message = f"Rate limit exceeded: {limit} requests per {period}"
        super().__init__(message, "AI_RATE_LIMIT_ERROR", details)


class VectorStoreError(AIServiceException):
    """Raised when vector store operations fail."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "VECTOR_STORE_ERROR", details)


class EmbeddingError(AIServiceException):
    """Raised when embedding generation fails."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "EMBEDDING_ERROR", details)


class ChatSessionError(AIServiceException):
    """Raised when chat session operations fail."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "CHAT_SESSION_ERROR", details)


class ActivityNotFoundError(AIServiceException):
    """Raised when activity is not found."""

    def __init__(
        self, activity_uuid: str, details: dict[str, Any] | None = None
    ) -> None:
        message = f"Activity '{activity_uuid}' not found"
        super().__init__(message, "ACTIVITY_NOT_FOUND", details)


class AIFeatureDisabledError(AIServiceException):
    """Raised when the AI feature is disabled for the platform."""

    def __init__(
        self, feature_name: str, platform_id: int, details: dict[str, Any] | None = None
    ) -> None:
        message = f"AI feature '{feature_name}' is disabled for platform {platform_id}"
        super().__init__(message, "AI_FEATURE_DISABLED", details)
