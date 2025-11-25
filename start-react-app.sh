#!/bin/bash
# React launcher removed
# ----------------------
# The React/Vite frontend that used to live under `web/` has been fully removed
# from this branch on this machine. There is no React app to start here.
#
# Current supported flows (no React required):
#   - Start the backend API:   ./start-backend.sh
#   - Start the classic UI:    ./start-frontend.sh
#       (serves the HTML/JS frontends on http://localhost:8080)
#
# If you ever need the old React app again, check out the `react-archive` branch
# in git, which still contains the `web/` directory and original tooling.

cd "$(dirname "$0")"

echo "React/Vite frontend has been removed from this branch."
echo ""
echo "Use the non-React flows instead:"
echo "  • Backend API:       ./start-backend.sh"
echo "  • Classic frontend:  ./start-frontend.sh  (serves the HTML/JS frontends on http://localhost:8080)"
echo ""
echo "No React or Node processes were started because the React app no longer exists here."

exit 0

