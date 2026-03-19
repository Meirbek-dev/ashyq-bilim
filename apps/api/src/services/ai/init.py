import logging
from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from config.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def get_embedding_function(model_name: str) -> OpenAIEmbeddings | None:
    """Get cached embedding function with optimized batch processing."""
    try:
        config = get_settings()
        api_key = getattr(config.ai_config, "openai_api_key", None)

        if not api_key:
            logger.warning("OpenAI API key not configured")
            return None

        batch_size = getattr(
            getattr(config.ai_config, "vector_store", None),
            "embedding_batch_size",
            2048,
        )

        logger.info(
            "Creating embedding function: model=%s batch_size=%d",
            model_name,
            batch_size,
        )
        return OpenAIEmbeddings(
            model=model_name,
            api_key=api_key,
            chunk_size=batch_size,
            max_retries=3,
            request_timeout=30,
            retry_min_seconds=1,
            retry_max_seconds=10,
            dimensions=512,
        )

    except Exception as e:
        logger.exception(
            "Failed to create embedding function (model=%s): %s", model_name, e
        )
        return None


@lru_cache(maxsize=8)
def get_llm(
    model_name: str,
    streaming: bool = True,
    max_tokens: int | None = None,
) -> ChatOpenAI | None:
    """Get cached LLM instance with OpenAI configuration."""
    try:
        config = get_settings()
        api_key = getattr(config.ai_config, "openai_api_key", None)

        if not api_key:
            logger.warning("OpenAI API key not configured")
            return None

        logger.info(
            "Creating LLM: model=%s streaming=%s max_tokens=%s",
            model_name,
            streaming,
            max_tokens,
        )
        kwargs: dict = {
            "model": model_name,
            "api_key": api_key,
            "max_retries": 3,
            "streaming": streaming,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "request_timeout": 30.0,
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        return ChatOpenAI(**kwargs)

    except Exception as e:
        logger.exception("Failed to create LLM (model=%s): %s", model_name, e)
        return None


def clear_ai_cache() -> None:
    """Clear all AI-related caches. Useful for configuration changes."""
    get_embedding_function.cache_clear()
    get_llm.cache_clear()
    logger.info("AI caches cleared")
