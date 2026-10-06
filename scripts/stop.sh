#!/usr/bin/env sh
# Stops and removes the stack's containers.
set -e
cd "$(dirname "$0")/.."
docker compose down
