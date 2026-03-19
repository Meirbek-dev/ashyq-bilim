from src.db.strict_base_model import PydanticStrictBaseModel


class BlockFile(PydanticStrictBaseModel):
    file_id: str
    file_format: str
    file_name: str
    file_size: int
    file_type: str
    activity_uuid: str
