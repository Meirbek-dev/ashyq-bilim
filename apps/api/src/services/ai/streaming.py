"""
Streaming AI response support for real-time user feedback using the LangGraph streaming API.
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.messages import AIMessage, HumanMessage

from src.services.ai.exceptions import (
    AIProcessingError,
    AITimeoutError,
    VectorStoreError,
)
from src.services.ai.message_utils import convert_history_to_messages

logger = logging.getLogger(__name__)


def _extract_chunk_text(message_chunk: Any) -> str:
    """Extract plain text from a LangChain/LangGraph message chunk."""
    if isinstance(message_chunk, str):
        return message_chunk

    msg_type = getattr(message_chunk, "type", "")
    if msg_type == "tool":
        return ""

    content = getattr(message_chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(part) for part in content)
    return str(content) if content else ""


async def ask_ai_stream(
    question: str,
    message_history: RedisChatMessageHistory | list,
    text_reference: str,
    message_for_the_prompt: str,
    embedding_model_name: str,
    openai_model_name: str,
    session_id: str = "default",
    cancel_event: asyncio.Event | None = None,
    collection_name: str | None = None,
    max_tokens: int = 4000,
    documents: list[str] | None = None,
) -> AsyncGenerator[str]:
    """
    Stream AI responses using LangChain v1 streaming API.

    Yields SSE-formatted chunks of the response as they're generated, providing
    real-time feedback to users instead of waiting for complete response.

    Args:
        question: User's question
        message_history: Chat history for context
        text_reference: Reference text for RAG
        message_for_the_prompt: System prompt
        embedding_model_name: Embedding model to use
        openai_model_name: LLM model to use
        session_id: Session identifier
        cancel_event: Event to signal cancellation
        collection_name: Collection name for vector store

    Yields:
        SSE-formatted string chunks with response data

    Raises:
        AIProcessingError: If processing fails
        AITimeoutError: If processing times out
        VectorStoreError: If vector store operation fails
    """
    if not question or not question.strip():
        error_msg = "Question cannot be empty"
        logger.warning(error_msg)
        raise AIProcessingError(error_msg)

    if not text_reference or not text_reference.strip():
        error_msg = "Text reference cannot be empty"
        logger.warning(error_msg)
        raise AIProcessingError(error_msg)

    try:
        from src.services.ai.base import prepare_agent

        agent_executor = await prepare_agent(
            text_reference=text_reference,
            message_for_the_prompt=message_for_the_prompt,
            embedding_model_name=embedding_model_name,
            openai_model_name=openai_model_name,
            collection_name=collection_name,
            max_tokens=max_tokens,
            documents=documents,
        )

        # Convert message history to LangChain v1 format
        history_messages = convert_history_to_messages(message_history)

        # Add current question to messages
        messages = [*history_messages, {"role": "user", "content": question.strip()}]

        logger.info("Starting streaming AI query: %s...", question[:100])

        # Stream response chunks
        chunk_count = 0
        full_response = ""
        start_time = time.perf_counter()
        first_chunk_time: float | None = None

        # Send initial status as SSE string — include the session id so the
        # client can correlate the stream back to its request immediately.
        yield format_sse_message(
            {
                "type": "status",
                "status": "processing",
                "aichat_uuid": session_id,
            }
        )

        try:
            # Process with streaming and timeout using asyncio.timeout
            async with asyncio.timeout(60.0):
                # Use LangGraph streaming with stream_mode="messages" for LLM tokens
                # Yields (message_chunk, metadata) tuples for each token.
                async for message_chunk, metadata in agent_executor.astream(
                    {"messages": messages},
                    config={"recursion_limit": 30},
                    stream_mode="messages",
                ):
                    # Check cancellation at the top of the loop to abort promptly
                    if cancel_event and cancel_event.is_set():
                        logger.info(
                            "ask_ai_stream: cancellation requested, aborting stream"
                        )
                        yield format_sse_message(
                            {
                                "type": "status",
                                "status": "aborted",
                                "message": "Request cancelled",
                            }
                        )
                        return

                    # Filter: only stream from the model/agent node, not tool outputs
                    # The langgraph_node metadata tells us which node emitted this chunk
                    node_name = metadata.get("langgraph_node", "")

                    # Emit a progress hint when the agent calls its retrieval tool,
                    # then skip the raw tool output from being sent as response content.
                    if "tool" in node_name.lower():
                        if chunk_count == 0:
                            # First tool call — let the user know we are reading context
                            yield format_sse_message(
                                {
                                    "type": "status",
                                    "status": "reading_context",
                                    "aichat_uuid": session_id,
                                }
                            )
                        continue

                    content = _extract_chunk_text(message_chunk)

                    # Stream content if present
                    if content:
                        chunk_count += 1
                        if first_chunk_time is None:
                            first_chunk_time = time.perf_counter()
                        full_response += content
                        yield format_sse_message(
                            {
                                "type": "chunk",
                                "content": content,
                                "chunk_id": chunk_count,
                            }
                        )

                        # Debug logging for first few chunks
                        if chunk_count <= 3:
                            logger.debug(
                                f"Chunk {chunk_count} from node '{node_name}': {content[:50]}..."
                            )

            # Handle no output case
            if chunk_count == 0:
                logger.error("Agent completed but produced no output")
                error_msg = "AI assistant couldn't generate a response. Please try with a simpler question."
                yield format_sse_message(
                    {"type": "error", "error": error_msg, "error_code": "NO_OUTPUT"}
                )
                return

            # Update message history
            if hasattr(message_history, "add_messages"):
                msgs = [HumanMessage(content=question.strip())]
                if full_response:
                    msgs.append(AIMessage(content=full_response))
                message_history.add_messages(msgs)

            # Send final response
            try:
                yield format_sse_message(
                    {
                        "type": "final",
                        "content": full_response,
                        "chunk_count": chunk_count,
                        "aichat_uuid": session_id,
                    }
                )
            except Exception:
                logger.debug("Unable to yield final SSE message (client disconnected?)")

            total_ms = (time.perf_counter() - start_time) * 1000
            ttfb_ms = (
                (first_chunk_time - start_time) * 1000
                if first_chunk_time is not None
                else total_ms
            )
            logger.info(
                "Streaming query completed: %s chunks, TTFB=%.1fms, total=%.1fms",
                chunk_count,
                ttfb_ms,
                total_ms,
            )

        except TimeoutError as e:
            error_msg = "AI processing timed out after 60 seconds"
            logger.warning(error_msg)
            yield format_sse_message(
                {"type": "error", "error": error_msg, "error_code": "TIMEOUT"}
            )
            raise AITimeoutError(60, details={"question_length": len(question)}) from e

    except AIProcessingError, VectorStoreError, AITimeoutError:
        raise
    except Exception as e:
        # Log full details server-side; send only a generic message to the client
        # to avoid leaking internal paths, stack frames, or credentials.
        logger.exception(
            "Unexpected error during AI streaming (session=%s): %s", session_id, e
        )
        yield format_sse_message(
            {
                "type": "error",
                "error": "Произошла внутренняя ошибка. Пожалуйста, попробуйте снова.",
                "error_code": "PROCESSING_ERROR",
            }
        )
        msg = f"Unexpected error during AI streaming: {e!s}"
        raise AIProcessingError(
            msg,
            details={"error_type": type(e).__name__, "session_id": session_id},
        ) from e


def format_sse_message(data: dict[str, Any]) -> str:
    """
    Format data as Server-Sent Events (SSE) message.

    Args:
        data: Data to send

    Returns:
        Formatted SSE message string
    """
    # Use ensure_ascii=False to preserve unicode, and replace any lone newlines in
    # the JSON string with escaped newline sequences to avoid breaking SSE payloads.
    payload = json.dumps(data, ensure_ascii=False)
    # Replace literal newlines inside the payload to avoid SSE parsing issues
    payload = payload.replace("\n", "\\n")
    return f"data: {payload}\n\n"
