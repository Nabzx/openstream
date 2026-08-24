#!/usr/bin/env bash
#
# Shared helpers for pinned, checksum-verified build artifacts. See #92.
#
# Sourced by scripts/build-whisper.sh and scripts/build-llama.sh, not meant
# to be run directly. Both scripts previously carried their own copy of this
# logic; this is the one place it's written now.
#
# Callers are expected to have `set -euo pipefail` already active - these
# functions rely on that to stop the caller's script on a `return 1`.

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# fetch_verified <url> <dest> <expected_sha256> [label]
#
# Downloads $url to $dest unless $dest already matches $expected_sha256, in
# which case it's left alone. Verifies after downloading and removes the
# file on mismatch - so a corrupted or tampered download can never be left
# behind for a later run to mistake for a good cache hit, and never runs.
fetch_verified() {
  local url="$1" dest="$2" expected_sha256="$3" label="${4:-$(basename "$2")}"

  mkdir -p "$(dirname "$dest")"

  if [ -f "$dest" ] && [ "$(sha256 "$dest")" = "$expected_sha256" ]; then
    echo "    $label already present and verified, skipping fetch"
    return 0
  fi

  rm -f "$dest"
  echo "    fetching $label"
  curl -fL --progress-bar -o "$dest" "$url"

  local actual
  actual="$(sha256 "$dest")"
  if [ "$actual" != "$expected_sha256" ]; then
    rm -f "$dest"
    echo "error: $label checksum mismatch" >&2
    echo "       expected $expected_sha256" >&2
    echo "       got      $actual" >&2
    return 1
  fi
  echo "    verified: $dest"
}

# clone_pinned <repo_url> <tag> <expected_commit> <dest_dir> [label]
#
# Clones $repo_url at $tag into $dest_dir unless $dest_dir is already a
# checkout at $expected_commit. Fails if the tag resolves to a different
# commit than expected - the tag has moved upstream since this was pinned -
# rather than silently building an unverified checkout.
clone_pinned() {
  local repo="$1" tag="$2" expected_commit="$3" dest="$4" label="${5:-$(basename "$4")}"

  if [ -d "$dest" ] && [ "$(git -C "$dest" rev-parse HEAD 2>/dev/null)" = "$expected_commit" ]; then
    echo "    $label already at $expected_commit, skipping clone"
    return 0
  fi

  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  git clone --branch "$tag" --depth 1 "$repo" "$dest"

  local actual
  actual="$(git -C "$dest" rev-parse HEAD)"
  if [ "$actual" != "$expected_commit" ]; then
    echo "error: $label $tag resolved to $actual, expected $expected_commit" >&2
    echo "       the tag has moved since this script was pinned - stopping rather than building an unverified checkout." >&2
    return 1
  fi
}
