import os

from pydantic import EmailStr

from config.config import get_settings
from src.core.platform import PLATFORM_BRAND_NAME
from src.db.organizations import OrganizationRead
from src.db.users import UserRead
from src.services.email.utils import send_email


def _get_public_web_origin() -> str:
    explicit_origin = os.getenv("NEXTAUTH_URL")
    if explicit_origin:
        return explicit_origin.rstrip("/")

    settings = get_settings()
    scheme = "https" if settings.hosting_config.ssl else "http"
    return f"{scheme}://{settings.hosting_config.domain}".rstrip("/")


def send_account_creation_email(
    user: UserRead,
    email: EmailStr,
):
    # send email
    return send_email(
        to=email,
        subject=f"Welcome to {PLATFORM_BRAND_NAME}, {user.username}!",
        body=f"""
<html>
    <body>
        <p>Hello {user.username}</p>
        <p>Welcome to {PLATFORM_BRAND_NAME}! Your account is ready to use.</p>
        <p>Need some help to get started ? <a href="https://tou.edu.kz/ru/">Toraighyrov University</a></p>
    </body>
</html>
""",
    )


def send_password_reset_email(
    generated_reset_code: str,
    user: UserRead,
    email: EmailStr,
):
    reset_link = (
        f"{_get_public_web_origin()}/reset"
        f"?email={email}&resetCode={generated_reset_code}"
    )

    # send email
    return send_email(
        to=email,
        subject="Reset your password",
        body=f"""
<html>
    <body>
        <p>Hello {user.username}</p>
        <p>You have requested to reset your password.</p>
        <p>Here is your reset code: {generated_reset_code}</p>
        <p>Click <a href="{reset_link}">here</a> to reset your password.</p>
    </body>
</html>
""",
    )
