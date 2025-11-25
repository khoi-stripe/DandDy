#!/bin/bash
# ARCHIVED: React launcher disabled
# --------------------------------
# This project previously included a React/Vite frontend under `web/` that was
# started by this script. For now, the React app is **disabled** so that you
# don't need Node/npm or any React tooling on this machine.
#
# If you want to work on DandDy without React:
#   - Start the backend API:   ./start-backend.sh
#   - Start the classic UI:    ./start-frontend.sh
#
# If you ever want to re-enable the React app in the future, you can:
#   - Restore the old contents of this script from git history, and
#   - Follow the docs in WEB_README.md.

cd "$(dirname "$0")"

echo "⚠️  React frontend is currently archived/disabled."
echo ""
echo "Use the non-React flows instead:"
echo "  • Backend API:       ./start-backend.sh"
echo "  • Classic frontend:  ./start-frontend.sh  (serves the HTML/JS frontends on http://localhost:8080)"
echo ""
echo "No React or Node processes were started."

exit 0

