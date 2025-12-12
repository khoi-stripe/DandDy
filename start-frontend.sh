#!/bin/bash
# Start the DandDy frontend server on port 8080

cd "$(dirname "$0")"

# Check if port 8080 is already in use
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 8080 is already in use"
    if [[ "${DANDDY_KILL_8080:-}" == "1" ]]; then
        lsof -ti:8080 | xargs -r kill -9
        echo "✓ Killed existing process (DANDDY_KILL_8080=1)"
    elif [[ -t 0 ]]; then
        echo "Kill existing process? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            lsof -ti:8080 | xargs -r kill -9
            echo "✓ Killed existing process"
        else
            exit 1
        fi
    else
        echo "Non-interactive shell detected; refusing to prompt. Set DANDDY_KILL_8080=1 to auto-kill."
        exit 1
    fi
fi

echo "🚀 Starting DandDy Frontend on http://localhost:8080"
echo "📝 Press Ctrl+C to stop"
echo ""
echo "📂 Access points:"
echo "   Character Manager: http://localhost:8080/index.html"
echo "   Character Builder: http://localhost:8080/character-builder/index.html"
echo ""

python3 -m http.server 8080

