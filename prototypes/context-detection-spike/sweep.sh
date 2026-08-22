#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #28. Walks the frontmost app through a
# list of target apps via AppleScript activation while the probe polls, so the
# app-level half of the map can be collected without a human clicking around.
#
# Field focus mostly still needs a human clicking into a text field. This only
# automates "which app is in front", plus whatever focus the app lands on by
# itself when activated.
set -u
cd "$(dirname "$0")"

APPS=(
  "Terminal"
  "TextEdit"
  "Notes"
  "Safari"
  "Google Chrome"
  "Visual Studio Code"
  "Cursor"
  "Obsidian"
  "WhatsApp"
  "Finder"
)

RETURN_TO="${RETURN_TO:-Visual Studio Code}"

for app in "${APPS[@]}"; do
  if osascript -e "tell application \"$app\" to activate" >/dev/null 2>&1; then
    echo "### activated: $app"
  else
    echo "### NOT TESTABLE HERE: $app (activation failed / not installed)"
  fi
  sleep 3
done

osascript -e "tell application \"$RETURN_TO\" to activate" >/dev/null 2>&1
echo "### sweep done, returned to $RETURN_TO"
