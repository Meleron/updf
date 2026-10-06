#!/usr/bin/env sh
# Builds and starts the stack, waiting until it is healthy.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
docker compose up -d --build --wait
