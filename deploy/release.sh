#! /use/bin/env bash
# Point the live site at a release. Runs on the server, needs no root.
#   ./release.sh <sha>

set -euo pipefail

SHA="${1:?usage: release.sh <sha>}"
ROOT=/srv/kunhua.sh
TARGET="$ROOT/releases/$SHA"

# Check for missing or empty directory before swapping
[ -d "$TARGET" ] || { echo "release $SHA not found" >&2; exit 1; }
[ -f "$TARGET/index.html" ] || { echo "release $SHA has no index.html" >&2; exit 1; }

cd "$ROOT"

ln -sfT "releases/$SHA" current.tmp
mv -T current.tmp current

# Keep the five most recent, but never delete what is currently being served
ls -1dt releases/*/ | tail -n +6 | while read -r d; do
  [ "$(basename "$d")" = "$CURRENT" ] && continue
  rm -rf "$d"
done

echo "released $SHA"
