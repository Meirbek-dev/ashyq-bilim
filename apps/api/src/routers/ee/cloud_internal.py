import hmac
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from config.config import get_settings
from src.core.events.database import get_db_session
from src.db.platform import PlatformUpdate
from src.security.rbac import InternalAuthFailed
from src.services.platform import get_platform

router = APIRouter()


# Utils
def check_internal_cloud_key(request: Request) -> None:
    expected = get_settings().internal.cloud_internal_key
    provided = request.headers.get("CloudInternalKey", "")

    if not expected or not hmac.compare_digest(provided, expected):
        raise InternalAuthFailed(reason="Invalid internal cloud key")


@router.put("/update_platform_config")
async def update_platform_config(
    request: Request,
    config_object: PlatformUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    check_internal_cloud_key(request)
    platform_record = get_platform(db_session)
    update_data = config_object.model_dump(exclude_unset=True)
    update_data.pop("slug", None)
    for field, value in update_data.items():
        if value is not None:
            setattr(platform_record, field, value)
    platform_record.update_date = str(datetime.now())
    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)
    return {"detail": "Platform config updated"}
