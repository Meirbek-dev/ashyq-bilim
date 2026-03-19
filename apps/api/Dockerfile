FROM python:3.14.3-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_PROJECT_ENVIRONMENT=/app/.venv \
  PYTHONUNBUFFERED=1 \
  PYTHONIOENCODING=utf-8 \
  PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

# Install deps in a separate layer for better caching
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-dev --no-install-project

# Copy application source
COPY . .

# Sync the project itself (no-op if no src install needed, but keeps lockfile integrity)
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-dev

RUN useradd --system --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PLATFORM_PORT\",\"8000\")}/', timeout=5).read()" || exit 1

CMD ["uv", "run", "--no-sync", "app.py"]
