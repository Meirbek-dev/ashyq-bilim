import ipaddress
import json
from functools import lru_cache
from typing import Annotated

from pydantic import (
    EmailStr,
    Field,
    PostgresDsn,
    RedisDsn,
    TypeAdapter,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from src.db.strict_base_model import PydanticStrictBaseModel

_POSTGRES_DSN = TypeAdapter(PostgresDsn)
_REDIS_DSN = TypeAdapter(RedisDsn)
_INSECURE_DEFAULT_SECRETS = {"", "changeme", "secret"}


def _normalize_cookie_domain(raw_domain: str | None) -> str | None:
    if not raw_domain:
        return None

    cleaned = raw_domain.strip()
    if not cleaned:
        return None

    cleaned = cleaned.lstrip(".")
    if not cleaned:
        return None

    lowered = cleaned.lower()
    if lowered == "localhost":
        return None

    try:
        ipaddress.ip_address(cleaned)
        return None
    except ValueError:
        pass

    if ":" in cleaned:
        return None

    return cleaned


def _strip_optional_string(value: str | None) -> str | None:
    if value is None:
        return None

    stripped = value.strip()
    return stripped or None


class PlatformSectionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        env_ignore_empty=True,
        extra="ignore",
        populate_by_name=True,
    )


class CookieConfig(PydanticStrictBaseModel):
    domain: str | None = None

    @field_validator("domain", mode="before")
    @classmethod
    def normalize_domain(cls, value: str | None) -> str | None:
        return _normalize_cookie_domain(value)


class GeneralConfig(PlatformSectionSettings):
    development_mode: bool = Field(
        default=False,
        validation_alias="PLATFORM_DEVELOPMENT_MODE",
    )
    logfire_enabled: bool = Field(
        default=False,
        validation_alias="PLATFORM_LOGFIRE_ENABLED",
    )
    timezone: str = Field(default="UTC", validation_alias="PLATFORM_TIMEZONE")

    @field_validator("timezone", mode="before")
    @classmethod
    def normalize_timezone(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        return stripped or "UTC"


class SecurityConfig(PlatformSectionSettings):
    auth_jwt_secret_key: str = Field(
        min_length=1,
        validation_alias="PLATFORM_AUTH_JWT_SECRET_KEY",
    )

    @field_validator("auth_jwt_secret_key", mode="before")
    @classmethod
    def validate_auth_jwt_secret_key(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_AUTH_JWT_SECRET_KEY must not be empty")

        return stripped


class RBACConfig(PlatformSectionSettings):
    """RBAC configuration."""

    audit_logging_enabled: bool = Field(
        default=True,
        validation_alias="PLATFORM_RBAC_AUDIT_LOGGING_ENABLED",
    )
    cache_enabled: bool = Field(
        default=True,
        validation_alias="PLATFORM_RBAC_CACHE_ENABLED",
    )
    cache_ttl_seconds: int = Field(
        default=300,
        validation_alias="PLATFORM_RBAC_CACHE_TTL_SECONDS",
    )


class ChromaDBConfig(PlatformSectionSettings):
    separate_db_enabled: bool = Field(
        default=False,
        validation_alias="PLATFORM_CHROMADB_SEPARATE",
    )
    db_host: str | None = Field(default=None, validation_alias="PLATFORM_CHROMADB_HOST")
    db_port: int = Field(default=8000, validation_alias="PLATFORM_CHROMADB_PORT")
    persist_path: str = Field(
        default="./chromadb_data",
        validation_alias="PLATFORM_CHROMADB_PERSIST_PATH",
    )

    @field_validator("db_host", mode="before")
    @classmethod
    def normalize_db_host(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)

    @field_validator("persist_path", mode="before")
    @classmethod
    def normalize_persist_path(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_CHROMADB_PERSIST_PATH must not be empty")

        return stripped


class AIPerformanceConfig(PlatformSectionSettings):
    streaming_enabled: bool = True
    cache_enabled: bool = True
    max_concurrent_requests: int = 50
    request_timeout: int = 60


class AICacheConfig(PlatformSectionSettings):
    vector_store_ttl: int = 3600
    response_cache_ttl: int = 1800
    embedding_cache_ttl: int = 7200
    semantic_similarity_threshold: float = 0.95


class AIVectorStoreConfig(PlatformSectionSettings):
    chromadb_pool_size: int = 10
    collection_retention: int = 86400
    embedding_batch_size: int = 8191


class AIChatConfig(PlatformSectionSettings):
    history_window_size: int = 10
    max_history_length: int = 100
    message_retention: int = 86400


class AIRootConfig(PlatformSectionSettings):
    openai_api_key: str | None = Field(
        default=None,
        validation_alias="PLATFORM_OPENAI_API_KEY",
    )

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def normalize_openai_api_key(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)


class AIConfig(PydanticStrictBaseModel):
    openai_api_key: str | None = None
    chromadb_config: ChromaDBConfig = Field(default_factory=ChromaDBConfig)
    performance: AIPerformanceConfig = Field(default_factory=AIPerformanceConfig)
    cache: AICacheConfig = Field(default_factory=AICacheConfig)
    vector_store: AIVectorStoreConfig = Field(default_factory=AIVectorStoreConfig)
    chat: AIChatConfig = Field(default_factory=AIChatConfig)


class HostingConfig(PlatformSectionSettings):
    domain: str = Field(validation_alias="PLATFORM_DOMAIN")
    ssl: bool = Field(default=False, validation_alias="PLATFORM_SSL")
    port: int = Field(default=8000, validation_alias="PLATFORM_PORT")
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="PLATFORM_ALLOWED_ORIGINS",
    )
    allowed_regexp: str = Field(default="", validation_alias="PLATFORM_ALLOWED_REGEXP")
    cookie_config: CookieConfig = Field(
        default_factory=CookieConfig,
        validation_alias="cookie_config",
    )
    cookie_domain: str | None = Field(
        default=None,
        exclude=True,
        validation_alias="PLATFORM_COOKIE_DOMAIN",
    )

    @field_validator("domain", "allowed_regexp", mode="before")
    @classmethod
    def normalize_required_strings(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("Hosting configuration values must not be empty")

        return stripped

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return [
                origin.strip()
                for origin in value
                if isinstance(origin, str) and origin.strip()
            ]

        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            return []

        if stripped.startswith("["):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, list):
                return [
                    origin.strip()
                    for origin in decoded
                    if isinstance(origin, str) and origin.strip()
                ]

        return [origin.strip() for origin in stripped.split(",") if origin.strip()]

    @model_validator(mode="after")
    def apply_cookie_domain_override(self) -> "HostingConfig":
        if self.cookie_domain is not None:
            self.cookie_config = CookieConfig(domain=self.cookie_domain)

        return self


class MailingConfig(PlatformSectionSettings):
    resend_api_key: str | None = Field(
        default=None,
        validation_alias="PLATFORM_RESEND_API_KEY",
    )
    system_email_address: str | None = Field(
        default=None,
        validation_alias="PLATFORM_SYSTEM_EMAIL_ADDRESS",
    )

    @field_validator("resend_api_key", "system_email_address", mode="before")
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)


class DatabaseConfig(PlatformSectionSettings):
    sql_connection_string: str = Field(
        validation_alias="PLATFORM_SQL_CONNECTION_STRING"
    )

    @field_validator("sql_connection_string", mode="before")
    @classmethod
    def validate_sql_connection_string(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_SQL_CONNECTION_STRING must not be empty")

        _POSTGRES_DSN.validate_python(stripped)
        return stripped


class RedisConfig(PlatformSectionSettings):
    redis_connection_string: str = Field(
        validation_alias="PLATFORM_REDIS_CONNECTION_STRING"
    )

    @field_validator("redis_connection_string", mode="before")
    @classmethod
    def validate_redis_connection_string(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_REDIS_CONNECTION_STRING must not be empty")

        _REDIS_DSN.validate_python(stripped)
        return stripped


class InternalStripeConfig(PlatformSectionSettings):
    stripe_secret_key: str | None = Field(
        default=None,
        validation_alias="PLATFORM_STRIPE_SECRET_KEY",
    )
    stripe_publishable_key: str | None = Field(
        default=None,
        validation_alias="PLATFORM_STRIPE_PUBLISHABLE_KEY",
    )
    stripe_webhook_standard_secret: str | None = Field(
        default=None,
        validation_alias="PLATFORM_STRIPE_WEBHOOK_STANDARD_SECRET",
    )
    stripe_webhook_connect_secret: str | None = Field(
        default=None,
        validation_alias="PLATFORM_STRIPE_WEBHOOK_CONNECT_SECRET",
    )
    stripe_client_id: str | None = Field(
        default=None,
        validation_alias="PLATFORM_STRIPE_CLIENT_ID",
    )

    @field_validator(
        "stripe_secret_key",
        "stripe_publishable_key",
        "stripe_webhook_standard_secret",
        "stripe_webhook_connect_secret",
        "stripe_client_id",
        mode="before",
    )
    @classmethod
    def normalize_optional_secret_fields(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)


class InternalPaymentsConfig(PydanticStrictBaseModel):
    stripe: InternalStripeConfig = Field(default_factory=InternalStripeConfig)


class PlatformMetadataConfig(PlatformSectionSettings):
    contact_email: EmailStr = Field(validation_alias="PLATFORM_CONTACT_EMAIL")


class InternalConfig(PlatformSectionSettings):
    cloud_internal_key: str | None = Field(
        default=None,
        validation_alias="CLOUD_INTERNAL_KEY",
    )

    @field_validator("cloud_internal_key", mode="before")
    @classmethod
    def normalize_cloud_internal_key(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)


class BootstrapConfig(PlatformSectionSettings):
    initial_admin_email: EmailStr | None = Field(
        default=None,
        validation_alias="PLATFORM_INITIAL_ADMIN_EMAIL",
    )
    initial_admin_password: str | None = Field(
        default=None,
        validation_alias="PLATFORM_INITIAL_ADMIN_PASSWORD",
    )

    @field_validator("initial_admin_password", mode="before")
    @classmethod
    def normalize_initial_admin_password(cls, value: str | None) -> str | None:
        return _strip_optional_string(value)


class Judge0Config(PlatformSectionSettings):
    base_url: str = Field(
        default="http://judge0_server:2358",
        validation_alias="JUDGE0_URL",
    )

    @field_validator("base_url", mode="before")
    @classmethod
    def normalize_base_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("JUDGE0_URL must not be empty")

        return stripped.rstrip("/")


class PlatformConfig(PydanticStrictBaseModel):
    contact_email: str
    general_config: GeneralConfig
    hosting_config: HostingConfig
    database_config: DatabaseConfig
    redis_config: RedisConfig
    security_config: SecurityConfig
    rbac_config: RBACConfig
    ai_config: AIConfig
    mailing_config: MailingConfig
    payments_config: InternalPaymentsConfig

    @model_validator(mode="after")
    def validate_security_posture(self) -> "PlatformConfig":
        secret = self.security_config.auth_jwt_secret_key.strip().lower()
        if (
            not self.general_config.development_mode
            and secret in _INSECURE_DEFAULT_SECRETS
        ):
            raise ValueError(
                "PLATFORM_AUTH_JWT_SECRET_KEY uses an insecure default. "
                "Set a strong secret before running in non-development mode."
            )

        return self


class IntegrationsConfig(PydanticStrictBaseModel):
    judge0: Judge0Config = Field(default_factory=Judge0Config)


class AppSettings(PlatformConfig):
    internal: InternalConfig = Field(default_factory=InternalConfig)
    bootstrap: BootstrapConfig = Field(default_factory=BootstrapConfig)
    integrations: IntegrationsConfig = Field(default_factory=IntegrationsConfig)


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    metadata = PlatformMetadataConfig()
    return AppSettings(
        contact_email=str(metadata.contact_email),
        general_config=GeneralConfig(),
        hosting_config=HostingConfig(),
        database_config=DatabaseConfig(),
        redis_config=RedisConfig(),
        security_config=SecurityConfig(),
        rbac_config=RBACConfig(),
        ai_config=AIConfig(
            openai_api_key=AIRootConfig().openai_api_key,
            chromadb_config=ChromaDBConfig(),
            performance=AIPerformanceConfig(),
            cache=AICacheConfig(),
            vector_store=AIVectorStoreConfig(),
            chat=AIChatConfig(),
        ),
        mailing_config=MailingConfig(),
        payments_config=InternalPaymentsConfig(stripe=InternalStripeConfig()),
        internal=InternalConfig(),
        bootstrap=BootstrapConfig(),
        integrations=IntegrationsConfig(judge0=Judge0Config()),
    )


def reload_platform_config_cache() -> None:
    """Clear cached platform configuration (mainly for tests or reloads)."""
    get_settings.cache_clear()
