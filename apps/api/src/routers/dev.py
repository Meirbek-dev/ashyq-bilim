from fastapi import APIRouter

from config.config import get_settings

router = APIRouter()


@router.get("/config")
async def config():
    settings = get_settings()
    return settings.model_dump(exclude={"internal", "bootstrap", "integrations"})
