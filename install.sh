#!/bin/bash
# Buzz Developer Mode preview installer.
#
#   curl -fsSL https://raw.githubusercontent.com/joahg/buzz-dev-mode/dev-mode-dist/install.sh | bash
#
# Downloads the latest dev-mode preview DMG from joahg/buzz-dev-mode,
# installs Buzz.app to /Applications, and clears the Gatekeeper quarantine
# flag so the ad-hoc-signed preview launches without the "damaged" dialog.
set -euo pipefail

REPO="joahg/buzz-dev-mode"
DEST="${BUZZ_INSTALL_DEST:-/Applications}"
APP="$DEST/Buzz.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: this installer is macOS-only" >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "error: preview builds are Apple Silicon only (this Mac is $(uname -m))" >&2
  exit 1
fi

echo "==> Finding the latest dev-mode preview..."
DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=10" \
  | grep -o '"browser_download_url": *"[^"]*_aarch64\.dmg"' \
  | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
if [[ -z "$DMG_URL" ]]; then
  echo "error: no preview DMG found on https://github.com/$REPO/releases" >&2
  exit 1
fi
echo "    $DMG_URL"

TMP=$(mktemp -d)
MOUNT=""
cleanup() {
  [[ -n "$MOUNT" ]] && hdiutil detach "$MOUNT" -quiet 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "==> Downloading..."
curl -fL --progress-bar -o "$TMP/Buzz.dmg" "$DMG_URL"

echo "==> Installing to $DEST..."
MOUNT=$(hdiutil attach -nobrowse -readonly "$TMP/Buzz.dmg" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
if [[ -z "$MOUNT" || ! -d "$MOUNT/Buzz.app" ]]; then
  echo "error: could not mount the DMG" >&2
  exit 1
fi

if [[ -z "${BUZZ_INSTALL_DEST:-}" ]]; then
  osascript -e 'tell application "Buzz" to quit' >/dev/null 2>&1 || true
  sleep 1
fi

rm -rf "$APP"
ditto "$MOUNT/Buzz.app" "$APP"
hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet
MOUNT=""

# curl downloads are never quarantined, but clear the flag in case the DMG
# was fetched by other means first.
xattr -rd com.apple.quarantine "$APP" 2>/dev/null || true

VERSION=$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "unknown")
echo "==> Installed Buzz $VERSION to $APP"

if [[ -z "${BUZZ_INSTALL_DEST:-}" ]]; then
  open "$APP"
fi
