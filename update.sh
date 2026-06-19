#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Workshop & CTF All in One — Updater   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check we're in the right directory
if [ ! -f "server/index.js" ]; then
  echo "❌ Run this script from the app root directory."
  exit 1
fi

echo "📡 Fetching latest changes from GitHub..."
git fetch origin --tags

LOCAL=$(git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD)
REMOTE=$(git describe --tags --abbrev=0 origin/main 2>/dev/null || git rev-parse --short origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ Already up to date ($LOCAL)."
  exit 0
fi

echo "🔄 Update available:"
git log --oneline HEAD..origin/main
echo ""

git pull origin main
echo ""

echo "📦 Installing dependencies..."
npm install --production
echo ""

echo "🔁 Restarting server..."
pkill -f "node server/index.js" 2>/dev/null || true
sleep 1
nohup node server/index.js > /tmp/workshop-server.log 2>&1 &
sleep 2

if curl -s http://localhost:3000 -o /dev/null -w "%{http_code}" | grep -q "200"; then
  echo "✅ Server restarted successfully."
else
  echo "⚠️  Server may not have started — check /tmp/workshop-server.log"
fi

echo ""
echo "✅ Update complete. Version: $(git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD)"
echo ""
