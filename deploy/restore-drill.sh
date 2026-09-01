#!/usr/bin/env bash
# Pull a backup out of B2 and prove it is a database that holds the notes.
#
# Run on your own machine, never on the server. It needs the read-only key,
# which lives in your password manager and deliberately not on the host: the
# machine's key can write and nothing else, so taking the machine does not mean
# being able to read or destroy the history.
#
#   B2_READ_KEY_ID=… B2_READ_KEY=… ./restore-drill.sh [YYYY-MM-DD]
#
# With no date it takes the most recent copy.

set -euo pipefail

BUCKET="${B2_BUCKET:-kunhua-sh-backup}"
KEY_ID="${B2_READ_KEY_ID:?set B2_READ_KEY_ID to the read-only key id}"
KEY="${B2_READ_KEY:?set B2_READ_KEY to the read-only application key}"
API="https://api.backblazeb2.com/b2api/v4/b2_authorize_account"

command -v jq >/dev/null || { echo "this needs jq" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "this needs sqlite3" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "→ authorizing"
auth=$(curl -fsS -u "$KEY_ID:$KEY" "$API")
token=$(jq -r '.authorizationToken' <<<"$auth")
api_url=$(jq -r '.apiInfo.storageApi.apiUrl' <<<"$auth")
download_url=$(jq -r '.apiInfo.storageApi.downloadUrl' <<<"$auth")
bucket_id=$(jq -r --arg b "$BUCKET" '.apiInfo.storageApi.buckets[] | select(.name==$b) | .id' <<<"$auth")

[ -n "$bucket_id" ] || { echo "the key does not name the bucket $BUCKET" >&2; exit 1; }

if [ $# -ge 1 ]; then
  name="app-$1.db"
else
  echo "→ finding the most recent copy"
  name=$(curl -fsS -H "Authorization: $token" \
    -H 'Content-Type: application/json' \
    -d "{\"bucketId\":\"$bucket_id\",\"maxFileCount\":1000}" \
    "$api_url/b2api/v4/b2_list_file_names" \
    | jq -r '.files[].fileName' | sort | tail -1)
fi
[ -n "$name" ] || { echo "no backups found in $BUCKET" >&2; exit 1; }

echo "→ downloading $name"
curl -fsS -H "Authorization: $token" \
  "$download_url/file/$BUCKET/$name" -o "$work/restored.db"

echo "→ checking it is a database and not a corrupted file"
integrity=$(sqlite3 "$work/restored.db" 'PRAGMA integrity_check;')
[ "$integrity" = "ok" ] || { echo "integrity_check said: $integrity" >&2; exit 1; }

echo "→ reading what cannot be fetched again"
notes=$(sqlite3 "$work/restored.db" 'SELECT count(*) FROM album_notes;')
echo
echo "  $name"
echo "  $(du -h "$work/restored.db" | cut -f1), integrity ok, $notes album notes"
echo
sqlite3 -box "$work/restored.db" \
  'SELECT artist, album, substr(note,1,48) AS note FROM album_notes ORDER BY updated_at DESC LIMIT 5;'
echo
# The count is the assertion. A backup that restores to an empty database
# passes every check that only asks whether the file opens.
[ "$notes" -gt 0 ] || { echo "the backup holds no notes — restoring it would lose everything" >&2; exit 1; }
echo "drill passed"
