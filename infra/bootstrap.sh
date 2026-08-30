#!/usr/bin/env bash
# Hardens a fresh machine and lays out the directories the site needs.
# Run once as root on a new box. Idempotent — re-running changes nothing.
#
#   scp infra/bootstrap.sh root@kunhua.sh:/tmp/ && ssh root@kunhua.sh 'bash /tmp/bootstrap.sh'
set -euo pipefail

DEPLOY_USER=deploy
SITE_ROOT=/srv/kunhua.sh

# --- deploy user -------------------------------------------------------------

if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
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

# passwordless sudo, so CI can run the release without a TTY
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"

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

# Providers ship drop-ins that re-enable password auth and outrank the main
# file, which silently undoes the two lines above.
if [ -d /etc/ssh/sshd_config.d ]; then
  printf 'PasswordAuthentication no\nPermitRootLogin no\nKbdInteractiveAuthentication no\n' \
    > /etc/ssh/sshd_config.d/99-hardening.conf
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

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
  "$SITE_ROOT" "$SITE_ROOT/releases" "$SITE_ROOT/data" "$SITE_ROOT/backup"

echo "bootstrap done"
