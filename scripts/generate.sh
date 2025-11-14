#!/bin/bash
# Quick run script for portrait generation

set -e

echo "🎭 D&D Portrait Generator"
echo "=========================="
echo ""

# Check if API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY environment variable not set"
    echo ""
    echo "Please set it first:"
    echo "  export OPENAI_API_KEY='sk-your-key-here'"
    echo ""
    echo "Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "📚 Installing dependencies..."
pip install -q -r requirements.txt

# Run the generator
echo ""
echo "🚀 Starting portrait generation..."
echo "   This will take approximately 30-45 minutes"
echo "   Cost: ~$4.68 for 117 portraits"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    python generate_all_portraits.py --create-js "$@"
    
    echo ""
    echo "✅ Generation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Check the generated portraits in: ../generated_portraits/"
    echo "  2. Import portraits.js into your web app"
    echo "  3. Update your character builder to use the portraits"
else
    echo "❌ Cancelled"
    exit 1
fi


