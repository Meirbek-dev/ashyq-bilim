from datetime import datetime
from enum import Enum, StrEnum

from pydantic import field_validator
from sqlmodel import JSON, BigInteger, Column, Field, ForeignKey

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class PaymentStatusEnum(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    ACTIVE = "active"
    CANCELLED = "cancelled"
    FAILED = "failed"
    REFUNDED = "refunded"


class ProviderSpecificData(PydanticStrictBaseModel):
    stripe_customer: dict | None = None
    custom_customer: dict | None = None


class PaymentsUserBase(SQLModelStrictBaseModel):
    status: PaymentStatusEnum = PaymentStatusEnum.PENDING
    provider_specific_data: dict = Field(default_factory=dict, sa_column=Column(JSON))

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        if isinstance(v, str):
            return PaymentStatusEnum(v)
        return v


class PaymentsUser(PaymentsUserBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="CASCADE"))
    )
    payment_product_id: int = Field(
        sa_column=Column(
            BigInteger, ForeignKey("paymentsproduct.id", ondelete="CASCADE")
        )
    )
    creation_date: datetime = Field(default=datetime.now())
    update_date: datetime = Field(default=datetime.now())
