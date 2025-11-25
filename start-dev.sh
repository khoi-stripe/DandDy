#!/bin/bash
# Start both backend and frontend servers for DandDy development

cd "$(dirname "$0")"

echo "🎮 Starting DandDy Development Environment"
echo "=========================================="
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend in background
echo "📦 Starting Backend API (port 8000)..."
./start-backend.sh > backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend started successfully
if ! lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Backend failed to start. Check backend.log for errors."
    exit 1
fi

echo "✅ Backend running on http://localhost:8000"
echo ""

# Start frontend in background
echo "🎨 Starting Frontend (port 8080)..."
./start-frontend.sh > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 2

# Check if frontend started successfully
if ! lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Frontend failed to start. Check frontend.log for errors."
    kill $BACKEND_PID
    exit 1
fi

echo "✅ Frontend running on http://localhost:8080"
echo ""
echo "=========================================="
echo "✨ DandDy is ready!"
echo ""
echo "📂 Open in browser:"
echo "   Character Manager: http://localhost:8080/character-manager.html"
echo "   Character Builder: http://localhost:8080/character-builder/index.html"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "=========================================="

# Wait for user to stop
wait $BACKEND_PID $FRONTEND_PID

