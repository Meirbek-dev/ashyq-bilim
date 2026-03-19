from datetime import datetime
from enum import Enum, StrEnum

from pydantic import field_validator
from sqlalchemy import JSON
from sqlmodel import BigInteger, Column, Field, ForeignKey

from src.db.strict_base_model import SQLModelStrictBaseModel


# PaymentsConfig
class PaymentProviderEnum(StrEnum):
    STRIPE = "stripe"


class PaymentsConfigBase(SQLModelStrictBaseModel):
    enabled: bool = True
    active: bool = False
    provider: PaymentProviderEnum = PaymentProviderEnum.STRIPE
    provider_specific_id: str | None = None
    provider_config: dict = Field(default_factory=dict, sa_column=Column(JSON))

    @field_validator("provider", mode="before")
    @classmethod
    def validate_provider(cls, v):
        if isinstance(v, str):
            return PaymentProviderEnum(v)
        return v


class PaymentsConfig(PaymentsConfigBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    creation_date: datetime = Field(default=datetime.now())
    update_date: datetime = Field(default=datetime.now())


class PaymentsConfigCreate(PaymentsConfigBase):
    pass


class PaymentsConfigUpdate(PaymentsConfigBase):
    enabled: bool | None = True
    provider_config: dict | None = None
    provider_specific_id: str | None = None


class PaymentsConfigRead(PaymentsConfigBase):
    id: int
    creation_date: datetime
    update_date: datetime

    @field_validator("creation_date", "update_date", mode="before")
    @classmethod
    def validate_datetimes(cls, value):
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class PaymentsConfigDelete(SQLModelStrictBaseModel):
    id: int
