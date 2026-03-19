from datetime import datetime
from enum import Enum, StrEnum

from pydantic import field_validator
from sqlmodel import BigInteger, Column, Field, ForeignKey, String

from src.db.strict_base_model import SQLModelStrictBaseModel


class PaymentProductTypeEnum(StrEnum):
    SUBSCRIPTION = "subscription"
    ONE_TIME = "one_time"


class PaymentPriceTypeEnum(StrEnum):
    CUSTOMER_CHOICE = "customer_choice"
    FIXED_PRICE = "fixed_price"


class PaymentsProductBase(SQLModelStrictBaseModel):
    name: str = ""
    description: str | None = ""
    product_type: PaymentProductTypeEnum = PaymentProductTypeEnum.ONE_TIME
    price_type: PaymentPriceTypeEnum = PaymentPriceTypeEnum.FIXED_PRICE
    benefits: str = ""
    amount: float = 0.0
    currency: str = "KZT"

    @field_validator("product_type", mode="before")
    @classmethod
    def validate_product_type(cls, v):
        if isinstance(v, str):
            return PaymentProductTypeEnum(v)
        return v

    @field_validator("price_type", mode="before")
    @classmethod
    def validate_price_type(cls, v):
        if isinstance(v, str):
            return PaymentPriceTypeEnum(v)
        return v


class PaymentsProduct(PaymentsProductBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    payments_config_id: int = Field(
        sa_column=Column(
            BigInteger, ForeignKey("paymentsconfig.id", ondelete="CASCADE")
        )
    )
    provider_product_id: str = Field(sa_column=Column(String))
    creation_date: datetime = Field(default=datetime.now())
    update_date: datetime = Field(default=datetime.now())


class PaymentsProductCreate(PaymentsProductBase):
    pass


class PaymentsProductUpdate(SQLModelStrictBaseModel):
    name: str | None = None
    description: str | None = None
    product_type: PaymentProductTypeEnum | None = None
    price_type: PaymentPriceTypeEnum | None = None
    benefits: str | None = None
    amount: float | None = None
    currency: str | None = None

    @field_validator("product_type", mode="before")
    @classmethod
    def validate_product_type(cls, v):
        if v is not None and isinstance(v, str):
            return PaymentProductTypeEnum(v)
        return v

    @field_validator("price_type", mode="before")
    @classmethod
    def validate_price_type(cls, v):
        if v is not None and isinstance(v, str):
            return PaymentPriceTypeEnum(v)
        return v


class PaymentsProductRead(PaymentsProductBase):
    id: int
    payments_config_id: int
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
