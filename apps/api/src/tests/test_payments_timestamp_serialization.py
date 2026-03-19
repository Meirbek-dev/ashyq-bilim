from datetime import datetime

from src.db.payments.payments import PaymentsConfigRead
from src.db.payments.payments_products import (
    PaymentPriceTypeEnum,
    PaymentProductTypeEnum,
    PaymentsProductRead,
)


def test_payments_config_read_parses_legacy_string_timestamps() -> None:
    model = PaymentsConfigRead.model_validate(
        {
            "id": 1,
            "enabled": True,
            "active": False,
            "provider": "stripe",
            "provider_specific_id": None,
            "provider_config": {},
            "creation_date": "2026-01-22 10:50:39.783536",
            "update_date": "2026-01-22 11:21:38.282338",
        }
    )

    assert isinstance(model.creation_date, datetime)
    assert isinstance(model.update_date, datetime)


def test_payments_product_read_parses_legacy_string_timestamps() -> None:
    model = PaymentsProductRead.model_validate(
        {
            "id": 7,
            "payments_config_id": 3,
            "name": "Starter",
            "description": "",
            "product_type": PaymentProductTypeEnum.ONE_TIME,
            "price_type": PaymentPriceTypeEnum.FIXED_PRICE,
            "benefits": "",
            "amount": 1000.0,
            "currency": "KZT",
            "creation_date": "2025-11-07 11:56:27.025634",
            "update_date": "2025-11-17 11:16:25.309176",
        }
    )

    assert isinstance(model.creation_date, datetime)
    assert isinstance(model.update_date, datetime)
