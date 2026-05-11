"""Code execution metadata endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from src.auth.users import get_public_user
from src.db.assessments import Judge0LanguageRead
from src.db.users import PublicUser
from src.services.code_execution import get_code_execution_service

router = APIRouter()


@router.get("/languages", response_model=list[Judge0LanguageRead])
async def api_get_code_execution_languages(
    _current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> list[Judge0LanguageRead]:
    languages = await get_code_execution_service().list_languages()
    return [Judge0LanguageRead.model_validate(language) for language in languages]
