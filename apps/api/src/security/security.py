import secrets
import string

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from config.config import get_settings

### 🔒 JWT ##############################################################

ACCESS_TOKEN_EXPIRE_MINUTES = 30
ALGORITHM = "HS256"


def get_secret_key() -> str:
    return get_settings().security_config.auth_jwt_secret_key


### 🔒 JWT ##############################################################


### 🔒 Secure Random Generation ##############################################################


def generate_secure_password(length: int = 12) -> str:
    """Generate a cryptographically secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_secure_code(length: int = 5) -> str:
    """Generate a cryptographically secure random code."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


### 🔒 Secure Random Generation ##############################################################


### 🔒 Passwords Hashing ##############################################################

# Initialize Argon2 password hasher with secure defaults
pwd_hasher = PasswordHasher()


def security_hash_password(password: str) -> str:
    """Hash a password using Argon2."""
    return pwd_hasher.hash(password)


def security_verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its Argon2 hash."""
    try:
        pwd_hasher.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False


### 🔒 Passwords Hashing ##############################################################
