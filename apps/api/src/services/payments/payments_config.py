from typing import Literal

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.payments.payments import (
    PaymentProviderEnum,
    PaymentsConfig,
    PaymentsConfigRead,
    PaymentsConfigUpdate,
)
from src.db.users import AnonymousUser, InternalUser, PublicUser
from src.security.rbac import PermissionChecker


async def init_payments_config(
    request: Request,
    provider: Literal["stripe"],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> PaymentsConfig:
    # Verify permissions
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "platform:create")

    # Check for existing config
    existing_config = db_session.exec(select(PaymentsConfig)).first()

    if existing_config:
        raise HTTPException(
            status_code=409,
            detail="Payments config already exists for this platform",
        )

    # Initialize new config
    new_config = PaymentsConfig(
        provider=PaymentProviderEnum.STRIPE,
        provider_config={
            "onboarding_completed": False,
        },
        provider_specific_id=None,
    )

    # Save to database
    db_session.add(new_config)
    db_session.commit()
    db_session.refresh(new_config)

    return new_config


async def get_payments_config(
    request: Request,
    current_user: PublicUser | AnonymousUser | InternalUser,
    db_session: Session,
) -> list[PaymentsConfigRead]:
    # Get payments config
    statement = select(PaymentsConfig)
    configs = db_session.exec(statement).all()

    return [PaymentsConfigRead.model_validate(config) for config in configs]


async def update_payments_config(
    request: Request,
    payments_config: PaymentsConfigUpdate,
    current_user: PublicUser | AnonymousUser | InternalUser,
    db_session: Session,
) -> PaymentsConfig:
    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "platform:update")

    # Get existing payments config
    statement = select(PaymentsConfig)
    config = db_session.exec(statement).first()
    if not config:
        raise HTTPException(status_code=404, detail="Payments config not found")
    # Update config
    update_data = payments_config.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    db_session.add(config)
    db_session.commit()
    db_session.refresh(config)

    return config


async def delete_payments_config(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> None:
    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "platform:delete")

    # Get existing payments config
    statement = select(PaymentsConfig)
    config = db_session.exec(statement).first()
    if not config:
        raise HTTPException(status_code=404, detail="Payments config not found")

    # Delete config
    db_session.delete(config)
    db_session.commit()
