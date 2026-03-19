import hmac
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from config.config import get_settings
from src.core.events.database import get_db_session
from src.db.organizations import OrganizationUpdate
from src.security.rbac import InternalAuthFailed
from src.services.platform import get_platform_organization

router = APIRouter()


# Utils
def check_internal_cloud_key(request: Request) -> None:
    expected = get_settings().internal.cloud_internal_key
    provided = request.headers.get("CloudInternalKey", "")

    if not expected or not hmac.compare_digest(provided, expected):
        raise InternalAuthFailed(reason="Invalid internal cloud key")


@router.put("/update_org_config")
async def update_org_config(
    request: Request,
    config_object: OrganizationUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    check_internal_cloud_key(request)
    org = get_platform_organization(db_session)
    update_data = config_object.model_dump(exclude_unset=True)
    update_data.pop("slug", None)
    for field, value in update_data.items():
        if value is not None:
            setattr(org, field, value)
    org.update_date = str(datetime.now())
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return {"detail": "Organization config updated"}
