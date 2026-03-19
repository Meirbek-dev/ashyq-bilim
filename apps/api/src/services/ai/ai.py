import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.courses.activities import Activity, ActivityRead
from src.db.courses.courses import Course, CourseRead
from src.db.users import PublicUser
from src.services.ai.base import ChatSessionInfo, ask_ai, get_chat_session_history
from src.services.ai.cache_manager import get_ai_cache_manager
from src.services.ai.exceptions import (
    ActivityNotFoundError,
    AIProcessingError,
    AIServiceException,
    AITimeoutError,
    ChatSessionError,
    VectorStoreError,
)
from src.services.ai.schemas.ai import (
    ActivityAIChatSessionResponse,
    SendActivityAIChatMessage,
    StartActivityAIChatSession,
)
from src.services.ai.streaming import ask_ai_stream, format_sse_message
from src.services.courses.activities.utils import (
    serialize_activity_text_to_ai_comprehensible_text,
    structure_activity_content_by_type,
)

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "text-embedding-3-small"


@dataclass(frozen=True, slots=True)
class _ChatContext:
    activity: ActivityRead
    course: CourseRead
    ai_text: str
    structured_sections: list[str]
    system_message: str
    ai_model: str
    max_tokens: int
    chat_session: ChatSessionInfo
    streaming_enabled: bool


async def _get_activity_data(
    activity_uuid: str, db_session: Session
) -> tuple[ActivityRead, CourseRead]:
    """Fetch and cache activity + course data for AI chat requests."""

    cache_manager = get_ai_cache_manager()
    cache_key = f"activity_{activity_uuid}"

    cached_pair = cache_manager.db_cache.get(cache_key)
    if cached_pair:
        logger.info("Activity data cache HIT: %s", activity_uuid)
        activity, course = cached_pair
    else:
        try:
            activity = db_session.exec(
                select(Activity).where(Activity.activity_uuid == activity_uuid)
            ).first()

            if not activity:
                raise ActivityNotFoundError(activity_uuid)

            course = db_session.get(Course, activity.course_id)

            if not course:
                raise ActivityNotFoundError(
                    activity_uuid, details={"course_not_found": True}
                )

            cache_manager.db_cache.set(cache_key, (activity, course))

        except ActivityNotFoundError:
            raise
        except Exception as e:
            raise ActivityNotFoundError(
                activity_uuid, details={"error": str(e), "type": type(e).__name__}
            ) from e

    return activity, course


async def _prepare_context(
    activity_uuid: str,
    aichat_uuid: str | None,
    db_session: Session,
    user_id: int | None = None,
) -> _ChatContext:
    """Build the full context needed for any AI chat request."""
    activity, course = await _get_activity_data(activity_uuid, db_session)

    # Cache the expensive content-structuring + serialization step so that
    # follow-up messages in the same session don't repeat CPU work.
    cache_manager = get_ai_cache_manager()
    context_text_key = f"context_text_{activity_uuid}"
    cached_text_pair = cache_manager.db_cache.get(context_text_key)
    if cached_text_pair:
        structured, ai_text = cached_text_pair
        logger.debug("Context text cache HIT: %s", activity_uuid)
    else:
        structured = await asyncio.to_thread(
            structure_activity_content_by_type, activity.content
        )
        ai_text = serialize_activity_text_to_ai_comprehensible_text(
            structured, course, activity, isActivityEmpty=not structured
        )
        cache_manager.db_cache.set(context_text_key, (structured, ai_text))
        logger.debug("Context text cache MISS: %s — cached", activity_uuid)

    chat_session = await asyncio.to_thread(
        get_chat_session_history, aichat_uuid, user_id
    )

    system_message = (
        f"You are an educational assistant for the course '{course.name}', "
        f"specifically helping with the lecture '{activity.name}'.\n\n"
        "Instructions:\n"
        "- Use the find_context_text tool to retrieve relevant lecture content before answering.\n"
        "- You may call the tool multiple times with different queries if needed.\n"
        "- Base your answers on the lecture content when available.\n"
        "- If the lecture content doesn't cover the topic, use your general knowledge but note this.\n"
        "- Stay on topic — only answer questions related to the course material or the subject area.\n"
        "- Politely decline requests unrelated to education or the course.\n"
        "- Respond in the same language the student uses.\n"
        "- Use clear, educational explanations appropriate for a student.\n"
        "- Format responses with markdown when helpful (headings, lists, code blocks)."
    )

    ai_model = "gpt-5.4-nano"
    streaming_enabled = True

    return _ChatContext(
        activity=activity,
        course=course,
        ai_text=ai_text,
        structured_sections=structured,
        system_message=system_message,
        ai_model=ai_model,
        max_tokens=4000,
        chat_session=chat_session,
        streaming_enabled=streaming_enabled,
    )


def _map_ai_errors_to_http(e: Exception) -> HTTPException:
    """Convert AI service exceptions to appropriate HTTP responses."""
    if isinstance(e, ActivityNotFoundError):
        return HTTPException(status_code=404, detail=e.message)
    if isinstance(e, AITimeoutError):
        return HTTPException(status_code=504, detail=e.message)
    if isinstance(e, (AIProcessingError, VectorStoreError, ChatSessionError)):
        return HTTPException(
            status_code=500, detail=f"AI processing failed: {e.message}"
        )
    return HTTPException(
        status_code=500, detail="An unexpected error occurred. Please try again later."
    )


# ---------------------------------------------------------------------------
# Shared non-streaming handler
# ---------------------------------------------------------------------------


async def _handle_ai_chat(
    activity_uuid: str,
    aichat_uuid: str | None,
    message: str,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
    user_id: int | None = None,
) -> ActivityAIChatSessionResponse:
    """Shared logic for non-streaming start/send AI chat."""
    trace_start = time.perf_counter()

    ctx = await _prepare_context(
        activity_uuid, aichat_uuid, db_session, user_id=user_id
    )

    ai_process_start = time.perf_counter()
    response = await ask_ai(
        message,
        ctx.chat_session.windowed_history,
        ctx.ai_text,
        ctx.system_message,
        _EMBEDDING_MODEL,
        ctx.ai_model,
        session_id=ctx.chat_session.aichat_uuid,
        cancel_event=cancel_event,
        collection_name=f"activity_{ctx.activity.activity_uuid}",
        max_tokens=ctx.max_tokens,
        documents=ctx.structured_sections or None,
    )
    ai_ms = (time.perf_counter() - ai_process_start) * 1000

    ai_message = response.get("output", "")
    if not ai_message:
        raise AIProcessingError("AI returned an empty response")

    logger.info(
        "AI chat %s completed in %.1fms (AI: %.1fms)",
        ctx.chat_session.aichat_uuid,
        (time.perf_counter() - trace_start) * 1000,
        ai_ms,
    )

    return ActivityAIChatSessionResponse(
        aichat_uuid=ctx.chat_session.aichat_uuid,
        activity_uuid=ctx.activity.activity_uuid,
        message=ai_message,
    )


# ---------------------------------------------------------------------------
# Shared streaming handler
# ---------------------------------------------------------------------------


def _map_ai_error_to_sse(e: Exception) -> str:
    """Convert AI service exceptions to SSE error messages."""
    if isinstance(e, ActivityNotFoundError):
        return format_sse_message({"type": "error", "error": e.message, "status": 404})
    if isinstance(e, AITimeoutError):
        return format_sse_message({"type": "error", "error": e.message, "status": 504})
    if isinstance(e, (AIProcessingError, VectorStoreError, ChatSessionError)):
        return format_sse_message(
            {
                "type": "error",
                "error": f"AI processing failed: {e.message}",
                "status": 500,
            }
        )
    return format_sse_message(
        {"type": "error", "error": "An unexpected error occurred.", "status": 500}
    )


async def _handle_ai_chat_stream(
    activity_uuid: str,
    aichat_uuid: str | None,
    message: str,
    request: Request,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> AsyncGenerator[str]:
    """Shared logic for streaming start/send AI chat."""
    try:
        ctx = await _prepare_context(
            activity_uuid, aichat_uuid, db_session, user_id=current_user.id
        )

        if not ctx.streaming_enabled:
            logger.info(
                "Streaming disabled for this org, falling back to non-streaming"
            )
            # Reuse the already-prepared context instead of calling _prepare_context
            # a second time (which would re-fetch activity data and rebuild the prompt).
            response = await ask_ai(
                message,
                ctx.chat_session.windowed_history,
                ctx.ai_text,
                ctx.system_message,
                _EMBEDDING_MODEL,
                ctx.ai_model,
                session_id=ctx.chat_session.aichat_uuid,
                cancel_event=cancel_event,
                collection_name=f"activity_{ctx.activity.activity_uuid}",
                max_tokens=ctx.max_tokens,
                documents=ctx.structured_sections or None,
            )
            ai_message = response.get("output", "")
            yield format_sse_message(
                {
                    "type": "final",
                    "aichat_uuid": ctx.chat_session.aichat_uuid,
                    "activity_uuid": ctx.activity.activity_uuid,
                    "content": ai_message,
                }
            )
            return

        # `ask_ai_stream` emits its own initial status=processing event;
        # we must NOT emit a duplicate here.
        logger.info("Streaming AI chat for activity %s", ctx.activity.activity_uuid)

        async for chunk in ask_ai_stream(
            message,
            ctx.chat_session.windowed_history,
            ctx.ai_text,
            ctx.system_message,
            _EMBEDDING_MODEL,
            ctx.ai_model,
            session_id=ctx.chat_session.aichat_uuid,
            cancel_event=cancel_event,
            collection_name=f"activity_{ctx.activity.activity_uuid}",
            max_tokens=ctx.max_tokens,
            documents=ctx.structured_sections or None,
        ):
            yield chunk

        logger.info("Streaming completed: %s", ctx.chat_session.aichat_uuid)

    except AIServiceException as e:
        yield _map_ai_error_to_sse(e)
    except Exception as e:
        logger.exception("Unexpected error in streaming AI chat: %s", e)
        yield _map_ai_error_to_sse(e)


# ---------------------------------------------------------------------------
# Public service functions (called by routers)
# ---------------------------------------------------------------------------


async def ai_start_activity_chat_session(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> ActivityAIChatSessionResponse:
    """Start a new AI chat session."""
    try:
        return await _handle_ai_chat(
            chat_session_object.activity_uuid,
            None,
            chat_session_object.message,
            db_session,
            cancel_event,
            user_id=current_user.id,
        )
    except (AIServiceException, HTTPException) as e:
        if isinstance(e, HTTPException):
            raise
        raise _map_ai_errors_to_http(e) from e
    except Exception as e:
        logger.exception("Unexpected error in AI start: %s", e)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again later.",
        ) from e


async def ai_send_activity_chat_message(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> ActivityAIChatSessionResponse:
    """Send a message in an existing AI chat session."""
    try:
        return await _handle_ai_chat(
            chat_session_object.activity_uuid,
            chat_session_object.aichat_uuid,
            chat_session_object.message,
            db_session,
            cancel_event,
            user_id=current_user.id,
        )
    except (AIServiceException, HTTPException) as e:
        if isinstance(e, HTTPException):
            raise
        raise _map_ai_errors_to_http(e) from e
    except Exception as e:
        logger.exception("Unexpected error sending AI message: %s", e)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again later.",
        ) from e


async def ai_start_activity_chat_session_stream(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
):
    """Streaming version of AI chat session start."""
    async for chunk in _handle_ai_chat_stream(
        chat_session_object.activity_uuid,
        None,
        chat_session_object.message,
        request,
        current_user,
        db_session,
        cancel_event,
    ):
        yield chunk


async def ai_send_activity_chat_message_stream(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
):
    """Streaming version of AI chat message sending."""
    async for chunk in _handle_ai_chat_stream(
        chat_session_object.activity_uuid,
        chat_session_object.aichat_uuid,
        chat_session_object.message,
        request,
        current_user,
        db_session,
        cancel_event,
    ):
        yield chunk
