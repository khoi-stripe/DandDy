#!/bin/bash
# Quick upload script for pre-generated portraits to R2
# 
# Usage:
#   1. Set your R2 credentials in backend/.env or export them here
#   2. Run: ./upload_portraits.sh

set -e  # Exit on error

echo "🎨 DandDy Portrait Uploader"
echo "=========================="
echo ""

# Check if R2 credentials are set
if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_BUCKET_NAME" ]; then
    echo "⚠️  R2 credentials not found in environment."
    echo ""
    echo "Please set the following environment variables:"
    echo "  export R2_ACCOUNT_ID='your-account-id'"
    echo "  export R2_ACCESS_KEY_ID='your-access-key'"
    echo "  export R2_SECRET_ACCESS_KEY='your-secret-key'"
    echo "  export R2_BUCKET_NAME='your-bucket-name'"
    echo ""
    echo "Or source them from your backend .env file:"
    echo "  cd backend && source .env && cd ../scripts"
    echo ""
    exit 1
fi

echo "✅ R2 credentials found"
echo "📦 Bucket: $R2_BUCKET_NAME"
echo ""

# Check if boto3 is installed
if ! python -c "import boto3" 2>/dev/null; then
    echo "⚠️  boto3 not installed. Installing..."
    pip install boto3
    echo ""
fi

# Ask for confirmation
echo "This will upload 117 PNG files to R2."
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Upload cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting upload..."
echo ""

# Run the upload script
python upload_pre_generated_portraits_to_r2.py

echo ""
echo "✨ Done! Check the output above for results."

