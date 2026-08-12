#!/bin/bash
# Usage:
#   ./update-tunnel.sh <cloudflare-url> [ngrok-socket-url]
#
# Examples:
#   ./update-tunnel.sh https://xyz.trycloudflare.com
#   ./update-tunnel.sh https://xyz.trycloudflare.com https://abc.ngrok-free.app
#
# If ngrok-socket-url is omitted, VITE_SOCKET_URL = cloudflare-url (fallback).

set -e

CF_URL="$1"
SOCKET_URL="${2:-$1}"   # default socket URL = cloudflare URL if not provided

if [ -z "$CF_URL" ]; then
  echo "Usage: ./update-tunnel.sh <cloudflare-url> [ngrok-socket-url]"
  exit 1
fi

echo "Mini-app URL  : $CF_URL"
echo "Socket URL    : $SOCKET_URL"

# 1. mini-app/.env
cat > mini-app/.env <<EOF
VITE_API_URL=$CF_URL
VITE_SOCKET_URL=$SOCKET_URL
EOF
echo "✓ mini-app/.env updated"

# 2. telegram-bot/.env
BOT_TOKEN=$(grep BOT_TOKEN telegram-bot/.env | cut -d= -f2-)
cat > telegram-bot/.env <<EOF
# Telegram Bot Configuration
BOT_TOKEN=$BOT_TOKEN
MINI_APP_URL=$CF_URL
BACKEND_API_URL=$CF_URL
EOF
echo "✓ telegram-bot/.env updated"

# 3. Rebuild mini-app
echo "Building mini-app..."
cd mini-app && npm run build
cd ..
echo "✓ mini-app rebuilt"

echo ""
echo "Done! Now:"
echo "  1. Restart backend:  npm run dev"
echo "  2. Restart bot:      cd telegram-bot && npm run dev"
echo "  3. Update BotFather Menu Button URL to: $CF_URL"
