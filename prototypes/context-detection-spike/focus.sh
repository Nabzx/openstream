#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #28. Drives each app into a real text
# field so the probe records field-level focus, not just "nothing is focused".
#
# Must run from a process that has Accessibility trust, because it sends
# keystrokes via System Events. Launch it from the same Terminal you granted:
#   osascript -e 'tell application "Terminal" to do script ".../focus.sh"'
#
# Every shortcut below is chosen to be non-destructive: address bars, search
# fields, and untitled scratch buffers. Nothing writes to a user's vault or
# notes library.
set -u
cd "$(dirname "$0")"

focus() {
  local app="$1" key="$2" mods="$3" label="$4"
  osascript >/dev/null 2>&1 <<EOF
tell application "$app" to activate
delay 1.5
tell application "System Events" to keystroke "$key" using {$mods}
EOF
  echo "### $app -> $label"
  sleep 3
}

echo "### focus pass starting"

# Address bars: harmless, always a real text field.
focus "Safari" "l" "command down" "address bar"
focus "Google Chrome" "l" "command down" "address bar"

# Untitled scratch buffers: discarded on close, never saved.
focus "TextEdit" "n" "command down" "new untitled document"
focus "Visual Studio Code" "n" "command down" "new untitled editor"
focus "Cursor" "n" "command down" "new untitled editor"

# Search / quick-open fields: focus a text input without creating any file.
focus "Notes" "f" "command down" "search field"
focus "Obsidian" "o" "command down" "quick switcher input"

# Terminal is already a text area whenever it is frontmost.
osascript -e 'tell application "Terminal" to activate' >/dev/null 2>&1
echo "### Terminal -> shell prompt"
sleep 3

osascript -e 'tell application "Visual Studio Code" to activate' >/dev/null 2>&1
echo "### focus pass done"
