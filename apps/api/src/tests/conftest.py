import os
import sys

# Ensure src/ is on the Python path for all tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Set testing environment variable to use SQLite
os.environ["TESTING"] = "true"

# Provide an explicit settings baseline so tests do not rely on a local backend .env file.
os.environ.setdefault("PLATFORM_CONTACT_EMAIL", "tests@example.com")
os.environ.setdefault("PLATFORM_DOMAIN", "example.test")
os.environ.setdefault("PLATFORM_ALLOWED_REGEXP", r"^https?://example\.test(:\d+)?$")
os.environ.setdefault(
    "PLATFORM_SQL_CONNECTION_STRING",
    "postgresql+psycopg://openu:openu@localhost:5432/openu_test",
)
os.environ.setdefault(
    "PLATFORM_REDIS_CONNECTION_STRING",
    "redis://localhost:6379/0",
)
os.environ.setdefault(
    "PLATFORM_AUTH_JWT_SECRET_KEY",
    "test-secret-key-with-sufficient-length-123456",
)

# Suppress logfire warnings in tests
os.environ["LOGFIRE_IGNORE_NO_CONFIG"] = "1"
