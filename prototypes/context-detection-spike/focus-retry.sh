#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #28. Second focus pass for the three
# apps the first pass failed to test properly: Safari had no window open, and
# Notes and Obsidian lost focus before their keystroke landed.
#
# Longer settle delays, and Safari gets a window made for it first. Run from
# the Accessibility-trusted Terminal, same as focus.sh.
set -u
cd "$(dirname "$0")"

echo "### retry pass starting"

osascript >/dev/null 2>&1 <<'EOF'
tell application "Safari"
  activate
  if (count of windows) = 0 then make new document
end tell
delay 3
tell application "System Events" to keystroke "l" using {command down}
EOF
echo "### Safari -> window made, address bar"
sleep 5

osascript >/dev/null 2>&1 <<'EOF'
tell application "Notes" to activate
delay 3
tell application "System Events" to keystroke "f" using {command down}
EOF
echo "### Notes -> search field"
sleep 5

osascript >/dev/null 2>&1 <<'EOF'
tell application "Obsidian" to activate
delay 3
tell application "System Events" to keystroke "o" using {command down}
EOF
echo "### Obsidian -> quick switcher input"
sleep 5

echo "### retry pass done"
