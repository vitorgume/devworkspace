#!/usr/bin/env bash
set -e

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

trap "kill 0" SIGINT SIGTERM

source backend/venv/Scripts/activate && uvicorn backend.main:app --reload --port 8000 &

if command -v npm >/dev/null 2>&1; then
  npm --prefix frontend run dev -- --port 5173 --strictPort &
elif command -v npm.cmd >/dev/null 2>&1; then
  npm.cmd --prefix frontend run dev -- --port 5173 --strictPort &
else
  echo "npm not found. Install Node.js 18+." >&2
  exit 1
fi

wait
