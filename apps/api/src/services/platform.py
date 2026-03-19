from __future__ import annotations

from sqlmodel import Session, select

from src.db.organizations import Organization


def get_platform_organization(db_session: Session) -> Organization:
    platform_org = db_session.exec(
        select(Organization).order_by(Organization.creation_date.asc())
    ).first()
    if not platform_org:
        raise RuntimeError(
            "Platform organization not found. Run the install/bootstrap flow first."
        )
    return platform_org


