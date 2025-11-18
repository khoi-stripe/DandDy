#!/bin/bash
# Switch from OpenAI to Gemini across the project

set -e

echo "=================================================="
echo "🔄 Switching to Google Gemini"
echo "=================================================="
echo

# Check if API key is provided
if [ -z "$1" ]; then
    echo "Usage: ./switch_to_gemini.sh YOUR_GEMINI_API_KEY"
    echo
    echo "Get your API key from: https://makersuite.google.com/app/apikey"
    echo
    echo "Or set it as an environment variable first:"
    echo "  export GOOGLE_AI_API_KEY='your-key-here'"
    echo "  ./switch_to_gemini.sh \$GOOGLE_AI_API_KEY"
    exit 1
fi

API_KEY="$1"

# Set environment variable
export GOOGLE_AI_API_KEY="$API_KEY"
export GEMINI_API_KEY="$API_KEY"

echo "✅ API key set in environment"
echo

# Check if we need to install dependencies
echo "📦 Checking Python dependencies..."
if ! python3 -c "import google.generativeai" 2>/dev/null; then
    echo "Installing google-generativeai..."
    cd "$(dirname "$0")"
    pip3 install -r requirements.txt
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi
echo

# Update the character builder HTML to use Gemini
echo "📝 Creating Gemini-enabled character builder..."

BUILDER_DIR="$(dirname "$0")/../character-builder"
cp "$BUILDER_DIR/index.html" "$BUILDER_DIR/index-gemini.html"

# Update the config in the HTML file to use Gemini
sed -i.bak 's|OPENAI_API_URL: .*|GEMINI_API_URL: "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent",|g' "$BUILDER_DIR/index-gemini.html"
sed -i.bak 's|OPENAI_MODEL: .*|GEMINI_MODEL: "gemini-1.5-pro",|g' "$BUILDER_DIR/index-gemini.html"
sed -i.bak 's|dnd_openai_key|dnd_gemini_key|g' "$BUILDER_DIR/index-gemini.html"
sed -i.bak 's|OpenAI API|Google Gemini API|g' "$BUILDER_DIR/index-gemini.html"

rm "$BUILDER_DIR/index-gemini.html.bak" 2>/dev/null || true

echo "✅ Created: character-builder/index-gemini.html"
echo

# Add to shell profile for persistence
echo "💾 To make this permanent, add to your ~/.bashrc or ~/.zshrc:"
echo "   export GOOGLE_AI_API_KEY='$API_KEY'"
echo

echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo
echo "Next steps:"
echo "  1. Generate portraits with Gemini:"
echo "     cd scripts"
echo "     python3 generate_all_portraits_gemini.py"
echo
echo "  2. Use the Gemini character builder:"
echo "     open character-builder/index-gemini.html"
echo
echo "  3. Or update your default character builder:"
echo "     cp character-builder/index-gemini.html character-builder/index.html"
echo
echo "📖 See GEMINI_SETUP.md for detailed documentation"
echo



