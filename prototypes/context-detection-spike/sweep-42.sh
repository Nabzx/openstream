#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. App-level (layer 1) sweep over the
# three slots issue #28 could not install, plus the three apps whose layer-2
# cells came back inconclusive because a person was stealing focus with Chrome
# during that pass.
#
# Same shape as sweep.sh, two differences: the new app list, and a much longer
# dwell. Issue #28's inconclusive cells are a dwell artifact, so this pass does
# not repeat a three-second dwell.
set -u
cd "$(dirname "$0")"

DWELL="${DWELL:-10}"

APPS=(
  "Slack"
  "Hyper"
  "IntelliJ IDEA CE"
  "Safari"
  "Notes"
  "WhatsApp"
)

RETURN_TO="${RETURN_TO:-Terminal}"

for app in "${APPS[@]}"; do
  if [ ! -d "/Applications/$app.app" ]; then
    echo "### NOT INSTALLED: $app"
    continue
  fi
  if osascript -e "tell application \"$app\" to activate" >/dev/null 2>&1; then
    echo "### activated: $app"
  else
    echo "### ACTIVATION FAILED: $app"
  fi
  sleep "$DWELL"
done

osascript -e "tell application \"$RETURN_TO\" to activate" >/dev/null 2>&1
echo "### sweep-42 done, returned to $RETURN_TO"
