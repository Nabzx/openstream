#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. The third-category test.
#
# Issue #28's map has two verdicts per app: the focused element reads, or it
# does not. A JetBrains IDE may need a third: it reads ONLY IF the user has
# turned on an in-app setting. JetBrains renders its editor in Swing, and Swing
# publishes an accessibility tree only when the IDE's
# "Support screen readers" option is on. macOS Accessibility trust does not
# reach it, and neither does AXManualAccessibility - that knob is a Chromium
# thing and JetBrains is not Chromium.
#
# If arm A fails and arm B works, the mode mapping needs a third category and a
# way to tell the user "turn this on in your IDE", because the helper cannot fix
# it from outside.
#
# The knob is stored on disk, so both arms can be driven without a human:
#   ~/Library/Application Support/JetBrains/IdeaIC*/options/ide.general.xml
#     <option name="SUPPORT_SCREEN_READERS" value="true|false" />
# It is read at startup only, so each arm gets a full quit and cold relaunch.
#
# Run from the Accessibility-trusted Terminal. No manual first launch is needed:
# the licence agreement and privacy policy are pre-accepted on disk (see below),
# and each arm opens a real source file directly rather than launching the app
# bare, which would land on the project chooser instead of an editor.
#
#   ~/Library/Preferences/jetbrains.privacy.policy
#   ~/Library/Application Support/JetBrains/consentOptions/accepted
set -u
cd "$(dirname "$0")"
mkdir -p logs

APP="IntelliJ IDEA CE"
SCRATCH="${SCRATCH:-$HOME/idea-prototype-scratch/Scratch.java}"
[ -d "/Applications/$APP.app" ] || { echo "### NOT INSTALLED: $APP - nothing to test"; exit 0; }

if [ ! -f "$SCRATCH" ]; then
  mkdir -p "$(dirname "$SCRATCH")"
  printf 'public class Scratch {\n    public static void main(String[] args) {\n    }\n}\n' > "$SCRATCH"
  echo "### created scratch source $SCRATCH"
fi

CFGDIR=$(ls -d "$HOME/Library/Application Support/JetBrains/"IdeaIC* 2>/dev/null | tail -1)
if [ -z "$CFGDIR" ]; then
  echo "### no JetBrains config dir - launch IntelliJ by hand once, then re-run"
  exit 0
fi
XML="$CFGDIR/options/ide.general.xml"
echo "### config: $XML"

set_knob() {  # $1 = true|false
  mkdir -p "$(dirname "$XML")"
  cat > "$XML" <<EOF
<application>
  <component name="GeneralSettings">
    <option name="SUPPORT_SCREEN_READERS" value="$1" />
  </component>
</application>
EOF
  echo "### SUPPORT_SCREEN_READERS = $1"
}

run_arm() {  # $1 = label, $2 = true|false
  local label="$1" knob="$2"

  osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1
  sleep 10
  pkill -f "IntelliJ IDEA CE" 2>/dev/null
  sleep 3

  set_knob "$knob"

  swift probe.swift --poke > "logs/jetbrains-$label.log" 2>&1 &
  local pid=$!
  sleep 8   # swift compiles the script before it starts sampling
  echo "### probe started for arm: $label"

  # Open a real source file directly. Launching the app bare lands on the
  # project chooser ("Welcome to IntelliJ IDEA"), whose focused element is an
  # AXOutline or AXButton - a Swing dialog, not the Swing EDITOR, which is the
  # only surface this A/B is about.
  open -a "$APP" "$SCRATCH" >/dev/null 2>&1
  sleep 40  # cold JetBrains start

  # Opening a loose file raises a modal "Open in Project" chooser. If it is left
  # up, the arm measures a Swing DIALOG (AXButton) instead of the Swing EDITOR,
  # and the two arms stop being comparable - which is exactly what happened on
  # the first attempt. Accept the default explicitly rather than hoping a later
  # keystroke dismisses it.
  osascript -e 'tell application "System Events" to key code 36' >/dev/null 2>&1
  sleep 35  # project open plus indexing; do not shorten this
  echo "### $APP relaunched cold on $SCRATCH, modal dismissed"

  osascript >/dev/null 2>&1 <<EOF
tell application "$APP" to activate
delay 8
tell application "System Events" to keystroke "hello world"
EOF
  echo "### typed 'hello world' into whatever had focus"
  sleep 15

  kill "$pid" 2>/dev/null
  pkill -f "probe.swift" 2>/dev/null
  sleep 2
  echo "### arm $label done -> logs/jetbrains-$label.log"
}

echo "### JetBrains knob A/B starting"
run_arm "knob-off" "false"
run_arm "knob-on"  "true"
echo "### JetBrains knob A/B done"
echo "### compare: grep -A9 'IntelliJ' logs/jetbrains-knob-off.log logs/jetbrains-knob-on.log"
