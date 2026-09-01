#!/usr/bin/env bash
# Create a genuinely write-only B2 key and install it on the host.
#
# The web console's "Write Only" preset also grants deleteFiles and
# writeBucketLifecycleRules, so a key made there lets whoever holds the machine
# destroy the history the backup exists for. Only the API can ask for
# writeFiles alone.
#
#   ./b2-write-key.sh [bucket]
#
# The master key is read from the terminal and never stored, echoed, or passed
# as an argument — arguments are visible in ps to every user on the machine.
# The new key goes straight to the host; it is never printed either.

set -euo pipefail

BUCKET="${1:-kunhua-sh-backup}"
HOST="${DEPLOY_HOST:-kunhua.sh}"
ENV_FILE=/etc/kunhua.sh/api.env
API=https://api.backblazeb2.com/b2api/v4/b2_authorize_account

command -v jq >/dev/null || { echo "this needs jq" >&2; exit 1; }

# curl -f discards the response body, which is where B2 explains itself. This
# keeps the body and prints it when the status is not 200.
api_call() {
  local label=$1; shift
  local out status
  out=$(curl -sS -w '\n%{http_code}' "$@")
  status=${out##*$'\n'}
  out=${out%$'\n'*}
  if [ "$status" != "200" ]; then
    echo "$label returned $status:" >&2
    jq . <<<"$out" 2>/dev/null >&2 || echo "$out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

read -rp  "B2 master key id: " MASTER_ID
read -rsp "B2 master key    : " MASTER_KEY
echo

echo "→ authorizing"
auth=$(api_call "authorize" -u "$MASTER_ID:$MASTER_KEY" "$API")
token=$(jq -r '.authorizationToken' <<<"$auth")
api_url=$(jq -r '.apiInfo.storageApi.apiUrl' <<<"$auth")
account=$(jq -r '.accountId' <<<"$auth")

echo "→ finding $BUCKET"
bucket_id=$(api_call "list buckets" -H "Authorization: $token" -H 'Content-Type: application/json' \
  -d "{\"accountId\":\"$account\"}" \
  "$api_url/b2api/v4/b2_list_buckets" \
  | jq -r --arg b "$BUCKET" '.buckets[] | select(.bucketName==$b) | .bucketId')
[ -n "$bucket_id" ] || { echo "no bucket named $BUCKET" >&2; exit 1; }

echo "→ creating a key that can only write"
created=$(api_call "create key" -H "Authorization: $token" -H 'Content-Type: application/json' \
  -d "{\"accountId\":\"$account\",
       \"keyName\":\"kunhua-api-writeonly\",
       \"capabilities\":[\"writeFiles\"],
       \"bucketIds\":[\"$bucket_id\"]}" \
  "$api_url/b2api/v4/b2_create_key")

new_id=$(jq -r '.applicationKeyId' <<<"$created")
new_key=$(jq -r '.applicationKey' <<<"$created")
caps=$(jq -r '.capabilities | join(",")' <<<"$created")
[ -n "$new_id" ] && [ "$new_id" != "null" ] || { echo "no key was created" >&2; exit 1; }

# The point of the exercise, checked rather than assumed.
[ "$caps" = "writeFiles" ] || { echo "the new key has capabilities: $caps" >&2; exit 1; }

# v4 takes bucketIds as a list; v3 took a single bucketId. Confirm the key came
# back scoped, since an unscoped one would reach every bucket in the account.
scope=$(jq -r '(.bucketIds // [.bucketId] | map(select(. != null)) | join(","))' <<<"$created")
[ "$scope" = "$bucket_id" ] || { echo "the new key is scoped to: ${scope:-nothing}" >&2; exit 1; }
echo "  capabilities: $caps"

echo "→ installing on $HOST"
# Three calls rather than one script over stdin: a heredoc and a pipe compete
# for the same stdin and the heredoc wins, so the remote read would consume the
# script instead of the key. Only the middle call carries a secret, and it
# carries it on stdin — an argument would be visible in ps to every user there.
ssh "deploy@$HOST" "sudo sed -i '/^B2_KEY_ID=/d; /^B2_KEY=/d' $ENV_FILE"

printf 'B2_KEY_ID=%s\nB2_KEY=%s\n' "$new_id" "$new_key" \
  | ssh "deploy@$HOST" "sudo tee -a $ENV_FILE >/dev/null"

# sed -i replaces the file, so the mode and group have to be restored: the
# service user must be able to read it and nobody else.
ssh "deploy@$HOST" "sudo chown root:kunhua-api $ENV_FILE && sudo chmod 640 $ENV_FILE \
  && sudo systemctl restart kunhua-api.service"

echo
echo "installed and restarted. Delete the old key in the B2 console."
echo "Watch the next backup with:"
echo "  ssh deploy@$HOST 'sudo journalctl -u kunhua-api -f | grep backup'"
