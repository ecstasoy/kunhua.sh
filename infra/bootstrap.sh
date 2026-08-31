#!/usr/bin/env bash
# Hardens a fresh machine, lays out the site directories, and installs Caddy.
#
# Idempotent, which here means specifically: re-running must not destroy state
# the machine has acquired since. Anything holding a credential is created when
# absent and otherwise left alone. That claim went untested until the first real
# re-run, which wiped the CI key and broke deploys while the site stayed up.
#
# Upload Caddyfile alongside it; this script looks for it next to itself.
#
#   scp infra/bootstrap.sh infra/Caddyfile deploy@kunhua.sh:~/
#   ssh deploy@kunhua.sh 'sudo bash ~/bootstrap.sh'
#
# On a blank machine root is still reachable, so use root@ and drop the sudo.
# After the first run root login is disabled and only deploy@ works.
set -euo pipefail

DEPLOY_USER=deploy
CI_USER=ci
API_USER=kunhua-api
SITE_GROUP=web
SITE_ROOT=/srv/kunhua.sh

# --- deploy user -------------------------------------------------------------

if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# Seed from root's keys on a blank machine only. Re-running must never rewrite
# an authorized_keys file that is already in use: keys added since would be
# silently dropped, and the first symptom is being locked out.
if [ ! -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ] && [ -f /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

# Locking root out before the deploy user can actually log in would strand us
# outside the machine, recoverable only through the provider's console. Refuse
# to continue instead.
if ! [ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]; then
  echo "refusing to disable root login: $DEPLOY_USER has no authorized_keys" >&2
  exit 1
fi

# deploy is the human admin identity; CI has its own unprivileged user below.
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"

# -- ci user: GitHub Actions runner ---------------------------------------------------

if ! id "$CI_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" --shell /bin/bash "$CI_USER"
fi
install -d -m 700 -o "$CI_USER" -g "$CI_USER" "/home/$CI_USER/.ssh"
# Create the file, never truncate it. `install /dev/null` empties whatever is
# there, so re-running this script used to delete the CI deploy key and break
# every pipeline — while the site stayed up, which is what made it hard to see.
if [ ! -f "/home/$CI_USER/.ssh/authorized_keys" ]; then
  install -m 600 -o "$CI_USER" -g "$CI_USER" /dev/null "/home/$CI_USER/.ssh/authorized_keys"
fi

getent group "$SITE_GROUP" >/dev/null || groupadd "$SITE_GROUP"
usermod -aG "$SITE_GROUP" "$DEPLOY_USER"
usermod -aG "$SITE_GROUP" "$CI_USER"

# --- api service user --------------------------------------------------------
# A third identity, deliberately not a member of the web group: it can neither
# publish nor escalate. deploy administers, ci publishes, this one only runs
# the service. Compromising the service therefore buys neither of the others.

if ! id "$API_USER" &>/dev/null; then
  adduser --system --group --no-create-home --shell /usr/sbin/nologin "$API_USER"
fi

# --- sshd --------------------------------------------------------------------

sshd_set() { # key value
  if grep -qE "^#?$1[[:space:]]" /etc/ssh/sshd_config; then
    sed -i "s|^#\?$1[[:space:]].*|$1 $2|" /etc/ssh/sshd_config
  else
    echo "$1 $2" >> /etc/ssh/sshd_config
  fi
}
sshd_set PasswordAuthentication no
sshd_set PermitRootLogin no
sshd_set KbdInteractiveAuthentication no

# Provider images ship drop-ins that re-enable password auth — Debian on Vultr
# ships 50-cloud-init.conf with `PasswordAuthentication yes`. sshd takes the
# FIRST occurrence of a keyword, and Include sits near the top of the main file,
# so a drop-in beats the main config and a lower-numbered drop-in beats a higher
# one. The hardening file therefore has to sort before anything the provider
# ships, not after it.
if [ -d /etc/ssh/sshd_config.d ]; then
  rm -f /etc/ssh/sshd_config.d/99-hardening.conf   # earlier, ineffective name
  printf 'PasswordAuthentication no\nPermitRootLogin no\nKbdInteractiveAuthentication no\n' \
    > /etc/ssh/sshd_config.d/00-hardening.conf
fi

sshd -t                                   # never restart into a broken config
systemctl restart ssh 2>/dev/null || systemctl restart sshd

# --- firewall ----------------------------------------------------------------

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ufw unattended-upgrades

ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- unattended security updates ---------------------------------------------

dpkg-reconfigure -f noninteractive unattended-upgrades

# --- directories -------------------------------------------------------------
# data/ and backup/ belong to the next phase; creating them now keeps the
# layout in one place.

install -d -o "$DEPLOY_USER" -g "$SITE_GROUP" -m 2775 \
  "$SITE_ROOT" "$SITE_ROOT/releases" "$SITE_ROOT/backup" \
  "$SITE_ROOT/api" "$SITE_ROOT/api/releases"
chgrp -R "$SITE_GROUP" "$SITE_ROOT"
chmod -R g+w "$SITE_ROOT"

# The database is the one directory the publishing identity must not reach.
# It is handled after the recursive fixups above rather than alongside the
# others, because those would otherwise hand it back to the web group on every
# re-run — a hand-made chown on the machine would not survive the next bootstrap.
install -d -o "$API_USER" -g "$API_USER" -m 0750 "$SITE_ROOT/data"
chown -R "$API_USER:$API_USER" "$SITE_ROOT/data"
chmod -R go-w "$SITE_ROOT/data"

# --- api secrets, unit and the one sudo rule ---------------------------------
# Secrets do not live under $SITE_ROOT. That directory has to stay
# group-writable so ci can rename the release symlink, and write permission on
# a directory is permission to delete what is inside it — a 0640 file there
# would still be replaceable by ci. /etc is not writable by ci at all.

install -d -m 755 -o root -g root /etc/kunhua.sh
[ -f /etc/kunhua.sh/api.env ] || \
  install -m 640 -o root -g "$API_USER" /dev/null /etc/kunhua.sh/api.env
chown root:"$API_USER" /etc/kunhua.sh/api.env
chmod 640 /etc/kunhua.sh/api.env

UNIT="$(dirname "$0")/kunhua-api.service"
if [ -f "$UNIT" ]; then
  install -m 644 "$UNIT" /etc/systemd/system/kunhua-api.service
  # Without this the machine keeps running the previous unit: the file changes,
  # the deploy reports success, and the confinement silently stays as it was.
  systemctl daemon-reload
  systemctl enable kunhua-api.service
fi

# Restarting one named unit is the only privileged thing ci ever does.
# Not a wildcard, which could restart something else, and not a script — a
# script ci can edit is a script ci can turn into a root shell.
echo "$CI_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart kunhua-api.service" \
  > /etc/sudoers.d/95-ci-api
chmod 440 /etc/sudoers.d/95-ci-api
# A syntax error here disables sudo for everyone, deploy included, and the only
# way back in is the provider's console. Validate before trusting it.
visudo -cf /etc/sudoers.d/95-ci-api

# Outbound TLS uses the host trust store. Installing it explicitly rather than
# relying on the image is the whole of that decision: without it every fetch
# fails as an unknown certificate authority, which reads like an upstream fault.
apt-get install -y ca-certificates

# -- caddy --------------------------------------------------------------------

if ! command -v caddy &>/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

CADDYFILE="$(dirname "$0")/Caddyfile"
if [ -f "$CADDYFILE" ]; then
  install -m 644 "$CADDYFILE" /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
fi

echo "bootstrap done"
