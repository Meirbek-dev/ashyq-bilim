# syntax=docker/dockerfile:latest
# Base image for Python backend
FROM python:3.14.3-slim-trixie AS base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONHASHSEED=random \
  PIP_NO_CACHE_DIR=1 \
  UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy

# Install system dependencies
RUN --mount=type=cache,target=/var/cache/apt \
  --mount=type=cache,target=/var/lib/apt \
  apt-get update \
  && apt-get install -y --no-install-recommends curl build-essential ca-certificates gnupg dumb-init supervisor \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Bring in Node.js runtime for the Next.js standalone server
COPY --from=node:25-bullseye-slim /usr/local /usr/local

# Ensure uv is available for dependency management at runtime
RUN pip install --upgrade pip \
  && pip install uv

# Frontend Build
FROM oven/bun:1-alpine AS frontend-base

# Install dependencies only when needed
FROM frontend-base AS frontend-deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY apps/web/package.json ./package.json
COPY bun.lock ./bun.lock
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --no-frozen-lockfile

# Rebuild the source code only when needed
FROM frontend-base AS frontend-builder
WORKDIR /app
COPY --from=frontend-deps /app/node_modules ./node_modules
COPY apps/web .

# Public Next.js env is baked into the bundle at build time, so pass it via build args.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MEDIA_URL

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Remove .env files from the final image
# This is a good practice to avoid leaking sensitive data
# Learn more about it in the Next.js documentation: https://nextjs.org/docs/basic-features/environment-variables
RUN rm -f .env*

RUN bun run build
RUN bun install --production

# Backend dependencies layer for better caching
FROM base AS backend-deps
WORKDIR /app/api
COPY --link ./apps/api/pyproject.toml ./pyproject.toml
COPY --link ./apps/api/uv.lock ./uv.lock
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

# Production image, copy all the files and run next
FROM frontend-base AS frontend-runner
WORKDIR /app
RUN apk add --no-cache curl

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=frontend-builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=frontend-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=frontend-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Final image combining frontend and backend
FROM base AS runner

# Copy the frontend standalone build
COPY --from=frontend-runner /app /app/web

# Backend runtime
WORKDIR /app/api
COPY --link ./apps/api ./
COPY --from=backend-deps /app/api/.venv ./.venv
ENV PATH="/app/api/.venv/bin:${PATH}"

WORKDIR /app

# supervisord manages both Next.js (port 8000) and FastAPI (port 9000)
COPY ./extra/supervisord.conf /etc/supervisor/conf.d/app.conf

ENV PORT=8000 PLATFORM_PORT=9000 HOSTNAME=0.0.0.0

# Both service ports are exposed internally — the nginx proxy container routes to them
EXPOSE 8000 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

# dumb-init is PID 1: proper signal forwarding + zombie reaping
# Shell wrapper merges supervisord's stderr into stdout so Docker sees a single stream (no duplicate lines)
CMD ["dumb-init", "sh", "-c", "exec supervisord -n -c /etc/supervisor/conf.d/app.conf 2>&1"]
