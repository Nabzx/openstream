#!/usr/bin/env bash
# Point git at the tracked .githooks directory. Idempotent, and a no-op
# outside a git checkout (CI tarballs, npm-published installs) so it can
# sit in postinstall without breaking anything.
set -euo pipefail

if git rev-parse --git-dir >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  chmod +x .githooks/* 2>/dev/null || true
  echo "git hooks: core.hooksPath -> .githooks"
fi
