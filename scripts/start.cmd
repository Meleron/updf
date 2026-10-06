@echo off
rem Builds and starts the stack, waiting until it is healthy.
cd /d "%~dp0.."
if not exist .env copy .env.example .env >nul
docker compose up -d --build --wait
