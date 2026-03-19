from datetime import datetime

from sqlmodel import BigInteger, Column, Field, ForeignKey

from src.db.strict_base_model import SQLModelStrictBaseModel


class PaymentsCourseBase(SQLModelStrictBaseModel):
    course_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("course.id", ondelete="CASCADE"))
    )


class PaymentsCourse(PaymentsCourseBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    payment_product_id: int = Field(
        sa_column=Column(
            BigInteger, ForeignKey("paymentsproduct.id", ondelete="CASCADE")
        )
    )
    creation_date: datetime = Field(default=datetime.now())
    update_date: datetime = Field(default=datetime.now())
