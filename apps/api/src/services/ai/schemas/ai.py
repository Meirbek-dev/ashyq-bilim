from typing import Annotated

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel

MessageStr = Annotated[str, Field(min_length=1, max_length=20000)]


class StartActivityAIChatSession(PydanticStrictBaseModel):
    activity_uuid: str
    message: MessageStr


class ActivityAIChatSessionResponse(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: str


class SendActivityAIChatMessage(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: MessageStr
