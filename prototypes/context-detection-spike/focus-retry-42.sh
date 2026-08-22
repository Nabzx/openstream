#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. Third focus pass for the three
# cells issue #28 left inconclusive: Safari, Notes and WhatsApp.
#
# Those cells are NOT app verdicts. During the #28 retry pass a person was
# actively using Chrome on the same machine and Chrome reclaimed focus within
# about a second each time; the window title came back kAXErrorNoValue in those
# samples, meaning the app had no focused window at that instant. That is a test
# artifact.
#
# Same fix as controlled-ab-42.sh: re-assert activation every two seconds across
# the dwell, so no other app can hold focus for more than two seconds, and the
# result stops depending on whether anyone is at the keyboard.
#
# Run from the Accessibility-trusted Terminal with the probe running
# (./run.sh --poke in another window).
set -u
cd "$(dirname "$0")"

DWELL="${DWELL:-24}"

hold() {  # $1 = app, $2 = description, $3 = osascript body to open a field
  local app="$1" what="$2" body="$3"
  if [ ! -d "/Applications/$app.app" ] && [ ! -d "/System/Applications/$app.app" ]; then
    echo "### NOT INSTALLED: $app"
    return
  fi
  local reasserts=$(( DWELL / 2 ))
  osascript >/dev/null 2>&1 <<EOF
tell application "$app" to activate
delay 4
$body
EOF
  osascript -e 'tell application "System Events" to keystroke "hello world"' >/dev/null 2>&1
  local i=0
  while [ "$i" -lt "$reasserts" ]; do
    osascript -e "tell application \"$app\" to activate" >/dev/null 2>&1
    sleep 2
    i=$(( i + 1 ))
  done
  echo "### $app: $what, typed 'hello world', held ~${DWELL}s over $reasserts re-assertions"
}

echo "### focus retry (issue #42) starting"

# Safari needs a window to exist before it can have a focused field at all.
hold "Safari" "address bar" '
tell application "Safari"
  if (count of windows) = 0 then make new document
end tell
delay 2
tell application "System Events" to keystroke "l" using {command down}
delay 2'

hold "Notes" "search field" '
tell application "System Events" to keystroke "f" using {command down}
delay 2'

# WhatsApp is native (Catalyst), not Electron - it rejected AXManualAccessibility
# with kAXErrorAttributeUnsupported, same as Terminal and Finder. Its cell is
# still worth settling because it is the only Catalyst app in the map.
hold "WhatsApp" "search / composer" '
tell application "System Events" to keystroke "f" using {command down}
delay 2'

echo "### focus retry (issue #42) done"
