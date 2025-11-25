#!/bin/bash
# Start the DandDy frontend server on port 8080

cd "$(dirname "$0")"

# Check if port 8080 is already in use
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 8080 is already in use"
    echo "Kill existing process? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        lsof -ti:8080 | xargs kill -9
        echo "✓ Killed existing process"
    else
        exit 1
    fi
fi

echo "🚀 Starting DandDy Frontend on http://localhost:8080"
echo "📝 Press Ctrl+C to stop"
echo ""
echo "📂 Access points:"
echo "   Character Manager: http://localhost:8080/character-manager.html"
echo "   Character Builder: http://localhost:8080/character-builder/index.html"
echo ""

python3 -m http.server 8080

