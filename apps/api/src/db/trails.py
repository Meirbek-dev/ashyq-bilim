from pydantic import ConfigDict
from pydantic import Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.db.trail_runs import TrailRunRead


class TrailBase(SQLModelStrictBaseModel):
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"))
    )


class Trail(TrailBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"))
    )
    trail_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""


class TrailCreate(TrailBase):
    pass


class TrailRead(PydanticStrictBaseModel):
    id: int | None = PydanticField(default=None)
    trail_uuid: str | None = None
    user_id: int
    creation_date: str | None = None
    update_date: str | None = None
    runs: list[TrailRunRead]

    model_config = ConfigDict(from_attributes=True)


def rebuild_trail_models() -> None:
    """
    Rebuild models to resolve Pydantic V2 forward references.
    This function is called during database initialization to ensure
    all model references are properly resolved.
    """
    # Rebuild models that may have forward references
    TrailRead.model_rebuild()
    Trail.model_rebuild()
    TrailCreate.model_rebuild()
    TrailBase.model_rebuild()
