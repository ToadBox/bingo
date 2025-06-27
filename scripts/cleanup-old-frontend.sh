#!/bin/bash

# Cleanup script for old frontend files during React migration
# This script removes old HTML, CSS, and JS files but preserves useful assets

echo "🧹 Cleaning up old frontend files..."

# Remove old HTML files
echo "Removing old HTML files..."
rm -f src/public/boards.html
rm -f src/public/board.html
rm -f src/public/admin.html
rm -f src/public/admin-login.html
rm -f src/public/account-rejected.html
rm -f src/public/pending-approval.html
rm -f src/public/offline.html

# Remove old JavaScript files
echo "Removing old JavaScript files..."
rm -rf src/public/js/

# Remove old CSS files
echo "Removing old CSS files..."
rm -rf src/public/css/

# Remove old service worker (we'll create a new one for React)
echo "Removing old service worker..."
rm -f src/public/service-worker.js

# Keep these useful assets:
# - src/public/images/ (game assets)
# - src/public/manifest.json (PWA manifest)

echo "✅ Old frontend cleanup completed!"
echo ""
echo "Preserved assets:"
echo "  📁 src/public/images/ - Game assets"
echo "  📄 src/public/manifest.json - PWA manifest"
echo ""
echo "The React frontend is now in the 'frontend/' directory"
echo "Use 'npm run dev:full' to start both backend and frontend servers" 