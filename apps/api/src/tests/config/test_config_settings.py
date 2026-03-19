import pytest

from config.config import (
    AIConfig,
    ChromaDBConfig,
    CookieConfig,
    DatabaseConfig,
    GeneralConfig,
    HostingConfig,
    InternalConfig,
    InternalPaymentsConfig,
    MailingConfig,
    PlatformConfig,
    RBACConfig,
    RedisConfig,
    SecurityConfig,
)


def test_chromadb_false_string_stays_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLATFORM_CHROMADB_SEPARATE", "false")

    cfg = ChromaDBConfig(_env_file=None)

    assert cfg.separate_db_enabled is False


def test_hosting_config_parses_comma_separated_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.com")
    monkeypatch.setenv(
        "PLATFORM_ALLOWED_ORIGINS",
        " https://one.example , https://two.example ",
    )
    monkeypatch.setenv("PLATFORM_COOKIE_DOMAIN", ".example.com")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https?://example\.com$")

    cfg = HostingConfig(_env_file=None)

    assert cfg.allowed_origins == ["https://one.example", "https://two.example"]
    assert cfg.cookie_config.domain == "example.com"


def test_internal_config_ignores_empty_cloud_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLOUD_INTERNAL_KEY", "")

    cfg = InternalConfig(_env_file=None)

    assert cfg.cloud_internal_key is None


def test_platform_config_rejects_insecure_secret_outside_dev() -> None:
    with pytest.raises(ValueError, match="insecure default"):
        PlatformConfig(
            contact_email="contact@example.com",
            general_config=GeneralConfig.model_construct(
                development_mode=False,
                logfire_enabled=False,
                timezone="UTC",
            ),
            hosting_config=HostingConfig.model_construct(
                domain="example.com",
                ssl=True,
                port=9000,
                allowed_origins=["https://example.com"],
                allowed_regexp=r"^https?://example\.com$",
                cookie_config=CookieConfig(domain="example.com"),
                cookie_domain=None,
            ),
            database_config=DatabaseConfig.model_construct(
                sql_connection_string="postgresql+psycopg://openu:openu@db:5432/openu"
            ),
            redis_config=RedisConfig.model_construct(
                redis_connection_string="redis://redis:6379/openu"
            ),
            security_config=SecurityConfig.model_construct(
                auth_jwt_secret_key="secret"
            ),
            rbac_config=RBACConfig.model_construct(
                audit_logging_enabled=True,
                cache_enabled=True,
                cache_ttl_seconds=300,
            ),
            ai_config=AIConfig(),
            mailing_config=MailingConfig.model_construct(
                resend_api_key=None,
                system_email_address=None,
            ),
            payments_config=InternalPaymentsConfig(),
        )
