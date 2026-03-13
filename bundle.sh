#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version"' manifest.json | grep -o -E '[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$VERSION" ]; then
    echo "Error: Could not extract version from manifest.json. Fallback to default name."
    OUTPUT_FILE="stepsnap-extension.zip"
else
    OUTPUT_FILE="stepsnap-v${VERSION}.zip"
fi

# Remove the old zip if it exists
if [ -f "$OUTPUT_FILE" ]; then
    rm "$OUTPUT_FILE"
fi

echo "Bundling extension into $OUTPUT_FILE..."

# Zip the necessary files and folders
# We only include the required files for the extension to work
zip -r "$OUTPUT_FILE" \
    manifest.json \
    src/ \
    -x "*.DS_Store"

echo "Done! The file $OUTPUT_FILE is ready for upload to the Chrome Web Store."
