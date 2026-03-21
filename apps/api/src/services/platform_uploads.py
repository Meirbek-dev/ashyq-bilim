from fastapi import UploadFile

from src.services.utils.upload_content import upload_file


async def upload_platform_logo(logo_file: UploadFile) -> str:
    """Upload platform logo."""
    return await upload_file(
        file=logo_file,
        directory="logos",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="logo",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_thumbnail(thumbnail_file: UploadFile) -> str:
    """Upload platform thumbnail."""
    return await upload_file(
        file=thumbnail_file,
        directory="thumbnails",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="thumbnail",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_preview(file: UploadFile) -> str:
    """Upload platform preview image."""
    return await upload_file(
        file=file,
        directory="previews",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="preview",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_landing_content(file: UploadFile) -> str:
    """Upload platform landing content."""
    return await upload_file(
        file=file,
        directory="landing",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image", "video", "document"],
        filename_prefix="landing",
        max_size=50 * 1024 * 1024,
    )
