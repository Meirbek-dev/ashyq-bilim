#!/usr/bin/env bash
set -euo pipefail

echo "[DEPLOY] Fetching latest code..."
git fetch --all

echo "[DEPLOY] Resetting to origin/main..."
git reset --hard origin/main

echo "[DEPLOY] Rebuilding containers..."
docker compose up -d --build --remove-orphans

echo "[DEPLOY] Cleaning unused images..."
docker image prune -f

echo "[DEPLOY] Done."
