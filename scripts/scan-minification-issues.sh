#!/bin/bash
# Scan for minification spacing issues in bundled JavaScript files
# Looks for patterns where spaces are likely missing in user-facing text

echo "🔍 Scanning for minification spacing issues..."
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

ISSUES_FOUND=0

# Function to check a file
check_file() {
    local file=$1
    local filename=$(basename "$file")
    
    echo "📄 Checking: $filename"
    echo "----------------------------------------"
    
    # Pattern 1: Period followed immediately by capital letter (likely sentence break)
    # But exclude common code patterns like .Portrait, .Character, etc.
    echo "  Pattern 1: Missing space after period..."
    grep -n '\.[A-Z][a-z]' "$file" | \
        grep -E '(text:|message:|notification|toast|modal|narrator|introText|completeText)' | \
        grep -v -E '(\.(Portrait|Character|Auth|Storage|Demo|App|Utils|Config|Service|API|State|Data|Manager))' | \
        head -10 | while read -r line; do
        echo -e "    ${YELLOW}⚠${NC} Line: $line"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    done
    
    # Pattern 2: Comma followed immediately by lowercase letter (missing space after comma)
    echo "  Pattern 2: Missing space after comma..."
    grep -n ',[a-z]' "$file" | \
        grep -E '(text:|message:|notification|toast|modal|narrator|introText)' | \
        grep -v -E '(,async|,get|,set|,on|,error|,name|,description|,tags|,class|,background)' | \
        head -10 | while read -r line; do
        echo -e "    ${YELLOW}⚠${NC} Line: $line"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    done
    
    # Pattern 3: >> (double arrow) which should be "> \n> " in narrator text
    echo "  Pattern 3: Missing newline/space in narrator text..."
    grep -n '>>[A-Z]' "$file" | head -10 | while read -r line; do
        echo -e "    ${YELLOW}⚠${NC} Line: $line"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    done
    
    # Pattern 4: Common phrases that should have spaces
    echo "  Pattern 4: Known problem phrases..."
    grep -n -E '(expired\.[A-Z]|safe,[a-z]|account,[a-z]|cantrips?and|spellsfor)' "$file" | \
        head -10 | while read -r line; do
        echo -e "    ${RED}✗${NC} Line: $line"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    done
    
    echo ""
}

# Check the bundle files
if [ -f "manager.bundle.js" ]; then
    check_file "manager.bundle.js"
fi

if [ -f "character-builder/builder.bundle.js" ]; then
    check_file "character-builder/builder.bundle.js"
fi

echo "========================================"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ No obvious spacing issues found!${NC}"
else
    echo -e "${YELLOW}⚠ Found potential spacing issues${NC}"
    echo "Review the lines above and check if they contain user-facing text."
    echo ""
    echo "Common fixes:"
    echo "  - Use \${' '} to force spaces near variables"
    echo "  - Use \\n explicitly instead of actual newlines"
    echo "  - Use double spaces after > in narrator text"
    echo ""
    echo "After fixing source files, rebuild with:"
    echo "  cd scripts && bash build-bundles.sh"
fi
echo ""





