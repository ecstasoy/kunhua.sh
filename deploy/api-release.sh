#!/usr/bin/env bash
# Point the API at a release and prove it came up. Runs on the server as ci.
#   ./api-release.sh <sha>
#
# Restarting is the one privileged step, and it is privileged through sudoers,
# not through this script: ci may run exactly `systemctl restart
# kunhua-api.service` and nothing else. That is why RESTART_CMD below can be
# overridden for tests without weakening anything — the boundary is the sudo
# rule, and a script ci can edit was never the thing holding the line.

set -euo pipefail

SHA="${1:?usage: api-release.sh <sha>}"
ROOT="${SITE_ROOT:-/srv/kunhua.sh}"
API="$ROOT/api"
TARGET="$API/releases/$SHA"

RESTART_CMD="${RESTART_CMD:-sudo systemctl restart kunhua-api.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/healthz}"
# The probe itself is overridable so the script can be tested without a
# listening service. -f makes curl fail on a 5xx, which is the whole point:
# a 503 from the health handler must not read as success.
HEALTH_CMD="${HEALTH_CMD:-curl -fsS --max-time 2 $HEALTH_URL}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"

# Refuse before swapping, not after. An empty or missing release must leave the
# running service alone.
[ -d "$TARGET" ] || { echo "release $SHA not found" >&2; exit 1; }
[ -x "$TARGET/server" ] || { echo "release $SHA has no executable server" >&2; exit 1; }

# Installing a unit needs root, and ci has none — deliberately, since a unit it
# could write is a unit that runs anything as root. So the unit cannot be
# deployed here. What can be done is refuse to pretend: if the release carries
# a unit that differs from the one the host is running, the change did not take
# effect, and a green pipeline would say it had.
UNIT_SRC="${UNIT_SRC:-$ROOT/kunhua-api.service}"
UNIT_LIVE="${UNIT_LIVE:-/etc/systemd/system/kunhua-api.service}"
if [ -f "$UNIT_SRC" ] && ! diff -q "$UNIT_SRC" "$UNIT_LIVE" >/dev/null 2>&1; then
  echo "the unit in this release differs from the one on the host" >&2
  echo "installing it needs root: re-run infra/bootstrap.sh as deploy" >&2
  diff -u "$UNIT_LIVE" "$UNIT_SRC" >&2 || true
  exit 1
fi

cd "$API"

PREVIOUS=""
[ -L current ] && PREVIOUS=$(basename "$(readlink -f current)")

# Rename is atomic; ln -sfn is not, and would briefly leave no symlink at all.
ln -sfT "releases/$SHA" current.tmp
mv -T current.tmp current

$RESTART_CMD

# systemd reports success once the process has exec'd, which says nothing about
# whether it can serve. Without this poll a green pipeline would mean "the
# binary started", and a service that crashes two seconds in — restarting on
# failure, forever — would deploy as a success.
echo -n "waiting for $HEALTH_URL "
deadline=$((SECONDS + HEALTH_TIMEOUT))
until $HEALTH_CMD >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo
    echo "release $SHA did not become healthy within ${HEALTH_TIMEOUT}s" >&2
    [ -n "$PREVIOUS" ] && echo "roll back: bash $0 $PREVIOUS" >&2
    exit 1
  fi
  echo -n .
  sleep 1
done
echo " ok"

# Deliberately no automatic rollback. A failing health check is as likely to be
# the database or the host as the new binary, and rolling back would churn the
# service without fixing it while hiding that the deploy was broken. The
# previous release is still on disk and the command to use it is printed above.

# Keep the five most recent, but never delete what is currently being served —
# a retention rule that can remove the live release is worse than none.
CURRENT=$(basename "$(readlink -f current)")
ls -1dt releases/*/ | tail -n +6 | while read -r d; do
  [ "$(basename "$d")" = "$CURRENT" ] && continue
  rm -rf "$d"
done

echo "released $SHA"
