@echo off
rem Stops and removes the stack's containers.
cd /d "%~dp0.."
docker compose down
