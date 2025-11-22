#!/usr/bin/env bash

set -euo pipefail

echo "Starting DandDy local servers for testing..."

# Resolve project root as the directory one level above this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

echo "Project root: ${PROJECT_ROOT}"
echo "Backend dir:  ${BACKEND_DIR}"
echo

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "Error: backend directory not found at ${BACKEND_DIR}"
  exit 1
fi

start_backend() {
  cd "${BACKEND_DIR}"

  # Activate virtualenv if it exists
  if [ -d "venv" ]; then
    echo "Activating virtualenv at ${BACKEND_DIR}/venv"
    # shellcheck disable=SC1091
    source "venv/bin/activate"
  else
    echo "Warning: no virtualenv found at ${BACKEND_DIR}/venv"
    echo "         Using system Python environment instead."
  fi

  echo "Starting backend API with uvicorn on http://127.0.0.1:8000 ..."
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
}

start_static_server() {
  cd "${PROJECT_ROOT}"
  echo "Starting static file server on http://127.0.0.1:8001 ..."
  echo "Serving directory: ${PROJECT_ROOT}"
  python3 -m http.server 8001
}

# Start both servers in the background and keep track of their PIDs
start_backend &
BACKEND_PID=$!

start_static_server &
STATIC_PID=$!

cleanup() {
  echo
  echo "Shutting down servers..."
  if ps -p "${BACKEND_PID}" > /dev/null 2>&1; then
    echo "Stopping backend (PID ${BACKEND_PID})"
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  if ps -p "${STATIC_PID}" > /dev/null 2>&1; then
    echo "Stopping static server (PID ${STATIC_PID})"
    kill "${STATIC_PID}" 2>/dev/null || true
  fi
  wait "${BACKEND_PID}" "${STATIC_PID}" 2>/dev/null || true
  echo "All servers stopped."
}

trap cleanup INT TERM EXIT

echo
echo "Servers are starting..."
echo
echo "  Backend API:        http://127.0.0.1:8000"
echo "  OpenAPI docs:       http://127.0.0.1:8000/docs"
echo
echo "  Character Builder:  http://127.0.0.1:8001/character-builder/index.html"
echo "  Character Manager:  http://127.0.0.1:8001/character-manager.html"
echo
echo "Press Ctrl+C in this terminal to stop both servers."
echo

# Wait for both background jobs
wait


