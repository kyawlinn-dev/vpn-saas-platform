#!/usr/bin/env bash
set -euo pipefail

base=/opt/novanet-dev-runner
config=/etc/novanet-dev-runner
marker=novanet-isolated-dev-runner-v1
stage=${1:-}
test "$(id -u)" = 0
test ! -L "$base"
test ! -L "$config"
if [[ -e "$base" && ! -f "$base/.managed-by-novanet" ]]; then
  echo 'RUNNER_PATH_NOT_MANAGED' >&2; exit 1
fi
if [[ -f "$base/.managed-by-novanet" ]] && ! grep -qx "$marker" "$base/.managed-by-novanet"; then
  echo 'RUNNER_MARKER_MISMATCH' >&2; exit 1
fi
if [[ "$stage" == prepare ]]; then
  if [[ ! -e "$base" ]]; then
    test ! -e "$config"
    if getent passwd novanet-dev-runner >/dev/null; then echo RUNNER_ACCOUNT_COLLISION >&2; exit 1; fi
    if getent passwd novanet-dev-link >/dev/null; then echo RUNNER_ACCOUNT_COLLISION >&2; exit 1; fi
    if systemctl cat novanet-dev-runner.service >/dev/null 2>&1; then echo RUNNER_SERVICE_COLLISION >&2; exit 1; fi
    install -d -m 0755 "$base"
    printf '%s\n' "$marker" > "$base/.managed-by-novanet"
  fi
  for account in novanet-dev-runner novanet-dev-link; do
    if ! getent passwd "$account" >/dev/null; then
      useradd --system --create-home --home-dir "/var/lib/$account" --shell /usr/sbin/nologin "$account"
    fi
    getent passwd "$account" | awk -F: -v home="/var/lib/$account" '$3 != 0 && $6 == home && $7 == "/usr/sbin/nologin" { valid=1 } END { exit !valid }'
  done
  # Key-only forwarding is required; no usable password or shell is enabled.
  usermod --password '*' novanet-dev-link
  install -d -m 0700 "$base/incoming"
  install -d -m 0755 "$base/releases"
  install -d -m 0750 -o root -g novanet-dev-runner "$config"
  install -d -m 0700 -o novanet-dev-link -g novanet-dev-link /var/lib/novanet-dev-link/.ssh
  echo RUNNER_PRIVATE_PATHS_PREPARED
  exit 0
fi

test "$stage" = install
release=${2:-}
digest=${3:-}
[[ "$release" =~ ^[a-z0-9-]{1,64}$ ]]
[[ "$digest" =~ ^[a-f0-9]{64}$ ]]
test ! -e "$base/releases/$release"
printf '%s  %s\n' "$digest" "$base/incoming/release.tar.gz" | sha256sum --check --status
install -d -m 0755 "$base/releases/$release"
tar -xzf "$base/incoming/release.tar.gz" -C "$base/releases/$release" --no-same-owner
test -f "$base/releases/$release/src/infrastructureRunner.js"
test ! -e "$base/releases/$release/.env"
test ! -e "$base/releases/$release/.env.production"
cd "$base/releases/$release"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
/usr/bin/node --check src/infrastructureRunner.js

install -o novanet-dev-runner -g novanet-dev-runner -m 0400 "$base/incoming/runner.env" "$config/runner.env"
install -o novanet-dev-runner -g novanet-dev-runner -m 0400 "$base/incoming/operator.json" "$config/operator.json"
install -o novanet-dev-runner -g novanet-dev-runner -m 0400 "$base/incoming/bootstrap.key" "$config/bootstrap.key"
install -o novanet-dev-link -g novanet-dev-link -m 0600 "$base/incoming/authorized_keys" /var/lib/novanet-dev-link/.ssh/authorized_keys

sshd_config=/etc/ssh/sshd_config.d/90-novanet-dev-link.conf
/usr/sbin/sshd -t
previous_ssh=false
if [[ -e "$sshd_config" ]]; then
  grep -qx '# novanet-isolated-dev-runner-v1' "$sshd_config"
  cp -- "$sshd_config" "$base/incoming/sshd.previous"
  previous_ssh=true
fi
restore_ssh() {
  if [[ "$previous_ssh" == true ]]; then
    install -o root -g root -m 0644 "$base/incoming/sshd.previous" "$sshd_config"
  else
    rm -f -- /etc/ssh/sshd_config.d/90-novanet-dev-link.conf
  fi
}
install -o root -g root -m 0644 "$base/incoming/sshd.conf" "$sshd_config"
if ! /usr/sbin/sshd -t; then restore_ssh; exit 1; fi
if ! systemctl reload ssh; then restore_ssh; exit 1; fi
install -o root -g root -m 0644 "$base/incoming/runner.service" /etc/systemd/system/novanet-dev-runner.service
if [[ -e "$base/current" && ! -L "$base/current" ]]; then echo 'RUNNER_CURRENT_NOT_SYMLINK' >&2; exit 1; fi
ln -sfn "$base/releases/$release" "$base/current"
systemctl daemon-reload
systemctl enable novanet-dev-runner.service >/dev/null
systemctl restart novanet-dev-runner.service
echo RUNNER_ISOLATED_SERVICE_INSTALLED
