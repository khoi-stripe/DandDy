#!/bin/bash
# Start the DandDy backend API server on port 8000

cd "$(dirname "$0")/backend"

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Activate venv
source venv/bin/activate

# Check if port 8000 is already in use
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 8000 is already in use"
    echo "Kill existing process? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        lsof -ti:8000 | xargs kill -9
        echo "✓ Killed existing process"
    else
        exit 1
    fi
fi

echo "🚀 Starting DandDy Backend API on http://localhost:8000"
echo "📝 Press Ctrl+C to stop"
echo ""

uvicorn main:app --reload --host 127.0.0.1 --port 8000

