"""
Shared message conversion utilities for AI services.
"""

import logging

from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# Supported roles with their mapping from LangChain message types
_ROLE_MAP: dict[type[BaseMessage], str] = {
    HumanMessage: "user",
    AIMessage: "assistant",
    SystemMessage: "system",
}

_VALID_DICT_ROLES = frozenset({"user", "assistant", "system"})


def _message_to_dict(msg: BaseMessage) -> dict[str, str] | None:
    """Convert a single LangChain BaseMessage to a role/content dict.

    Returns ``None`` for unsupported message types (e.g. tool calls) so callers
    can skip them cleanly.
    """
    role = _ROLE_MAP.get(type(msg))
    if role is None:
        logger.debug("Skipping unsupported message type: %s", type(msg).__name__)
        return None

    content = msg.content
    if isinstance(content, list):
        # Multi-part content (e.g. vision) — flatten to plain text parts only
        text_parts = [
            p if isinstance(p, str) else p.get("text", "")
            for p in content
            if isinstance(p, (str, dict))
        ]
        content = "".join(text_parts)

    return {"role": role, "content": str(content)}


def _validate_dict_message(msg: dict) -> dict[str, str] | None:
    """Validate and normalize a raw dict message.

    Returns ``None`` when the dict is malformed or uses an unsupported role.
    """
    role = msg.get("role", "")
    content = msg.get("content", "")
    if role not in _VALID_DICT_ROLES:
        logger.debug("Skipping dict message with unsupported role: %r", role)
        return None
    return {"role": role, "content": str(content)}


def convert_history_to_messages(
    message_history: RedisChatMessageHistory | list,
) -> list[dict[str, str]]:
    """Convert message history to a list of role/content dicts for the LLM.

    Handles:
    - ``list`` of ``BaseMessage`` objects or raw dicts (mixed is also tolerated).
    - Any object exposing a ``.messages`` property (e.g. ``RedisChatMessageHistory``).

    Unsupported message types (tool outputs, etc.) are silently skipped so they
    don't pollute the context window.
    """
    messages: list[dict[str, str]] = []

    source: list = (
        message_history
        if isinstance(message_history, list)
        else list(getattr(message_history, "messages", []))
    )

    for msg in source:
        if isinstance(msg, BaseMessage):
            converted = _message_to_dict(msg)
        elif isinstance(msg, dict):
            converted = _validate_dict_message(msg)
        else:
            logger.debug("Skipping unknown history entry type: %s", type(msg).__name__)
            converted = None

        if converted is not None:
            messages.append(converted)

    return messages
