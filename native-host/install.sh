#!/bin/bash
set -euo pipefail

# SessionBridge Native Messaging Host Installer
# Supports macOS (Chrome + Chromium) and Linux

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.sessionbridge.native"
HOST_JS="$SCRIPT_DIR/sessionbridge-host.js"
SESSION_DIR="$HOME/.sessionbridge"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================"
echo "  SessionBridge Native Host Installer"
echo "============================================"
echo ""

# Check Node.js
NODE_PATH=$(which node 2>/dev/null || true)
if [ -z "$NODE_PATH" ]; then
  echo -e "${RED}Error: Node.js not found. Please install Node.js first.${NC}"
  exit 1
fi
echo -e "${GREEN}Found Node.js:${NC} $NODE_PATH"

# Prompt for extension ID
if [ -z "${EXTENSION_ID:-}" ]; then
  echo ""
  echo "Enter your SessionBridge Chrome extension ID."
  echo "(Find it at chrome://extensions with Developer mode on)"
  read -rp "Extension ID: " EXTENSION_ID
fi

if [ -z "$EXTENSION_ID" ]; then
  echo -e "${RED}Error: Extension ID is required.${NC}"
  exit 1
fi

# Copy host script to ~/.sessionbridge/ (Chrome may block hosts in Downloads/)
INSTALLED_HOST_JS="$SESSION_DIR/sessionbridge-host.js"
cp "$HOST_JS" "$INSTALLED_HOST_JS"
chmod 700 "$INSTALLED_HOST_JS"
echo -e "${GREEN}Installed host script:${NC} $INSTALLED_HOST_JS"

# Create wrapper script in ~/.sessionbridge/
WRAPPER="$SESSION_DIR/native-host.sh"
cat > "$WRAPPER" << WRAPPER_EOF
#!/bin/bash
exec "$NODE_PATH" "$INSTALLED_HOST_JS"
WRAPPER_EOF
chmod +x "$WRAPPER"
echo -e "${GREEN}Created wrapper script:${NC} $WRAPPER"

# Create native messaging manifest
MANIFEST_CONTENT=$(cat << MANIFEST_EOF
{
  "name": "$HOST_NAME",
  "description": "SessionBridge Native Messaging Host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
MANIFEST_EOF
)

# Determine install directories
install_manifest() {
  local dir="$1"
  local label="$2"
  mkdir -p "$dir"
  echo "$MANIFEST_CONTENT" > "$dir/$HOST_NAME.json"
  echo -e "${GREEN}Installed for $label:${NC} $dir/$HOST_NAME.json"
}

OS="$(uname -s)"
case "$OS" in
  Darwin)
    # macOS
    install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" "Chrome (macOS)"
    install_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts" "Chromium (macOS)"
    ;;
  Linux)
    install_manifest "$HOME/.config/google-chrome/NativeMessagingHosts" "Chrome (Linux)"
    install_manifest "$HOME/.config/chromium/NativeMessagingHosts" "Chromium (Linux)"
    ;;
  *)
    echo -e "${RED}Unsupported OS: $OS${NC}"
    echo "Please manually install the native messaging manifest."
    exit 1
    ;;
esac

# Create session directory
mkdir -p "$SESSION_DIR"
chmod 700 "$SESSION_DIR"
echo -e "${GREEN}Created session directory:${NC} $SESSION_DIR"

# Create default config if it doesn't exist
CONFIG_FILE="$SESSION_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << CONFIG_EOF
{
  "domains": {
    "*.service-now.com": {
      "csrfSelectors": ["input[name='sysparm_ck']", "#sn-composer-bridge[data-csrf-token]"],
      "csrfHeader": "X-UserToken",
      "refreshInterval": 600,
      "sessionTTL": 1800
    },
    "*.atlassian.net": {
      "csrfSelectors": ["meta[name='ajs-atl-token']"],
      "csrfHeader": "X-Atlassian-Token",
      "refreshInterval": 600,
      "sessionTTL": 3600
    }
  }
}
CONFIG_EOF
  chmod 600 "$CONFIG_FILE"
  echo -e "${GREEN}Created default config:${NC} $CONFIG_FILE"
fi

echo ""
echo "============================================"
echo -e "  ${GREEN}Installation complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Restart Chrome"
echo "  2. Visit a configured domain"
echo "  3. Check: ls ~/.sessionbridge/"
echo ""
echo "To verify the host works:"
echo "  echo '{\"action\":\"ping\"}' | node $HOST_JS"
echo ""
