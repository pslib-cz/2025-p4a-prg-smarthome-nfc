#!/usr/bin/env bash
# UFW rules for SmartLend stack. Run with: sudo bash scripts/firewall.sh
set -euo pipefail

LAN="10.7.0.0/16"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

ufw allow OpenSSH
ufw allow from "$LAN" to any port 8123 proto tcp comment 'HA HTTPS'
ufw allow from "$LAN" to any port 6052 proto tcp comment 'ESPHome dashboard'
ufw allow from "$LAN" to any port 8883 proto tcp comment 'MQTT TLS'
# 1883 is loopback-only (bound in compose) — no UFW rule

ufw --force enable
ufw status verbose
