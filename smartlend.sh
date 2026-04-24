#!/usr/bin/env bash
# SmartLend project launcher.
#
# Usage:  ./smartlend.sh <command>
#
#   install     First-time setup: generate secrets, TLS cert, MQTT password.
#   start       Start the full stack (HA + MQTT + ESPHome + UI).
#   stop        Stop all services.
#   restart     Restart all services.
#   status      Show health of every component.
#   logs [svc]  Tail logs (ha / ui / esphome / mosquitto).
#   flash       Flash the ESP32 firmware over USB.
#   reset       Reset all items to available.
#   urls        Print the URLs you can open in a browser.
#   help        Show this help.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$REPO_ROOT/stack"

C_RED='\033[0;31m'; C_GRN='\033[0;32m'; C_YLW='\033[0;33m'; C_BLU='\033[0;34m'; C_BLD='\033[1m'; C_RST='\033[0m'
info()  { echo -e "${C_BLU}ℹ${C_RST}  $*"; }
ok()    { echo -e "${C_GRN}✓${C_RST}  $*"; }
warn()  { echo -e "${C_YLW}⚠${C_RST}  $*"; }
err()   { echo -e "${C_RED}✗${C_RST}  $*" >&2; }
step()  { echo -e "\n${C_BLD}▸ $*${C_RST}"; }

rand_b64_32() { openssl rand -base64 32 | tr -d '\n'; }
rand_pw()     { openssl rand -hex 16; }

need_docker() {
  command -v docker >/dev/null || { err "docker not found — install Docker Desktop / Engine first"; exit 1; }
  docker compose version >/dev/null 2>&1 || { err "docker compose v2 not found — update Docker"; exit 1; }
}

need_openssl() { command -v openssl >/dev/null || { err "openssl not found — apt install openssl"; exit 1; }; }

ensure_file_from_template() {
  local real="$1" template="$2"
  if [[ -f "$real" ]]; then return 1; fi
  if [[ ! -f "$template" ]]; then err "Missing template $template"; exit 1; fi
  cp "$template" "$real"
  info "Created $real from template"
  return 0
}

# --------------------------------------------------------------------------
# install
# --------------------------------------------------------------------------
cmd_install() {
  need_docker; need_openssl
  step "1/6 · Bootstrapping secrets files from templates"
  local created=0
  ensure_file_from_template "$STACK_DIR/.env" "$STACK_DIR/.env.example" && created=1 || true
  ensure_file_from_template "$STACK_DIR/homeassistant/config/secrets.yaml" "$STACK_DIR/homeassistant/config/secrets.yaml.example" && created=1 || true
  ensure_file_from_template "$STACK_DIR/esphome/config/secrets.yaml" "$STACK_DIR/esphome/config/secrets.yaml.example" && created=1 || true

  step "2/6 · Prompting for Wi-Fi credentials the ESP32 will join"
  local current_ssid; current_ssid="$(iwgetid -r 2>/dev/null || true)"
  local default_ssid="${current_ssid:-}"
  read -rp "Wi-Fi SSID [${default_ssid}]: " ssid; ssid="${ssid:-$default_ssid}"
  read -rsp "Wi-Fi password: " wpass; echo
  if [[ -z "$ssid" || -z "$wpass" ]]; then
    warn "Wi-Fi fields empty — skipping ESP Wi-Fi update (edit secrets.yaml manually later)"
  else
    sed -i "s|^wifi_ssid:.*|wifi_ssid: \"$ssid\"|"     "$STACK_DIR/esphome/config/secrets.yaml"
    sed -i "s|^wifi_password:.*|wifi_password: \"$wpass\"|" "$STACK_DIR/esphome/config/secrets.yaml"
    ok "ESP Wi-Fi set to $ssid"
  fi

  step "3/6 · Generating random secrets (fallback AP pass, API key, OTA pass, MQTT pass)"
  local esp_sec="$STACK_DIR/esphome/config/secrets.yaml"
  if grep -q "CHANGE_ME_FALLBACK_AP_PASSWORD" "$esp_sec"; then
    sed -i "s|CHANGE_ME_FALLBACK_AP_PASSWORD|$(rand_pw)|" "$esp_sec"
    ok "Generated fallback AP password"
  fi
  if grep -q "GENERATED_BASE64_32_BYTE_KEY" "$esp_sec"; then
    sed -i "s|GENERATED_BASE64_32_BYTE_KEY|$(rand_b64_32)|" "$esp_sec"
    ok "Generated ESPHome API encryption key (32-byte Noise)"
  fi
  if grep -q "CHANGE_ME_OTA_PASSWORD" "$esp_sec"; then
    sed -i "s|CHANGE_ME_OTA_PASSWORD|$(rand_pw)|" "$esp_sec"
    ok "Generated OTA password"
  fi

  local ha_sec="$STACK_DIR/homeassistant/config/secrets.yaml"
  local mqtt_pass
  if grep -q "CHANGE_ME_MQTT_PASSWORD" "$ha_sec"; then
    mqtt_pass="$(rand_pw)"
    sed -i "s|CHANGE_ME_MQTT_PASSWORD|$mqtt_pass|" "$ha_sec"
    ok "Generated MQTT password"
  else
    mqtt_pass="$(grep -E '^mqtt_password:' "$ha_sec" | sed -E 's/.*:\s*"?([^"]*)"?/\1/')"
  fi

  step "4/6 · Writing MQTT broker passwd (hashed) and ACL"
  mkdir -p "$STACK_DIR/mosquitto/config"
  if [[ ! -f "$STACK_DIR/mosquitto/config/passwd" ]] || grep -q "smartlend:" "$STACK_DIR/mosquitto/config/passwd" 2>/dev/null; then
    # Use the mosquitto container itself to hash the password — no local tool needed.
    docker run --rm -v "$STACK_DIR/mosquitto/config":/mosquitto/config eclipse-mosquitto:2 \
      mosquitto_passwd -b -c /mosquitto/config/passwd smartlend "$mqtt_pass" >/dev/null
    ok "Wrote $STACK_DIR/mosquitto/config/passwd"
  fi

  step "5/6 · Generating self-signed TLS cert for Home Assistant (if missing)"
  mkdir -p "$STACK_DIR/ssl"
  if [[ ! -f "$STACK_DIR/ssl/fullchain.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -keyout "$STACK_DIR/ssl/privkey.pem" \
      -out    "$STACK_DIR/ssl/fullchain.pem" \
      -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
    ok "Self-signed cert generated (valid 10 years). Browser will warn once — accept it."
  else
    info "TLS cert already exists — keeping it"
  fi

  step "6/6 · Building UI image and starting the stack"
  (cd "$STACK_DIR" && docker compose build ui >/dev/null)
  ok "UI image built"
  (cd "$STACK_DIR" && docker compose up -d)
  ok "Stack started"

  echo
  ok "Install complete. Next step: create a long-lived HA token."
  echo
  cat <<EOF
 1. Open https://localhost:8123 in a browser (accept the self-signed cert).
 2. Create an account on first load, or log in.
 3. Click your user avatar (bottom-left) → Security → Long-lived access tokens.
 4. Create one named "SmartLend UI" — copy the token.
 5. Paste it into $STACK_DIR/.env  (replace PASTE_YOUR_HA_LONG_LIVED_TOKEN_HERE).
 6. Rebuild the UI to pick up the new token:   ./smartlend.sh restart

 Then flash the ESP32 (USB connected):        ./smartlend.sh flash
EOF
}

# --------------------------------------------------------------------------
# start / stop / restart
# --------------------------------------------------------------------------
cmd_start()   { need_docker; (cd "$STACK_DIR" && docker compose up -d); ok "Started"; cmd_urls; }
cmd_stop()    { need_docker; (cd "$STACK_DIR" && docker compose down); ok "Stopped"; }
cmd_restart() { need_docker; (cd "$STACK_DIR" && docker compose restart); ok "Restarted"; cmd_urls; }

# --------------------------------------------------------------------------
# status
# --------------------------------------------------------------------------
cmd_status() {
  need_docker
  step "Container status"
  docker ps --filter "name=smartlend" --format 'table {{.Names}}\t{{.Status}}'

  step "HTTP endpoints"
  local ha ui
  ha=$(curl -sk --max-time 3 https://localhost:8123/ -o /dev/null -w "%{http_code}" 2>/dev/null || echo "—")
  ui=$(curl -s  --max-time 3 http://localhost:3001/  -o /dev/null -w "%{http_code}" 2>/dev/null || echo "—")
  echo "  HA  (https://localhost:8123):  $ha"
  echo "  UI  (http://localhost:3001):   $ui"

  step "ESP32 (via HA API)"
  local token
  token=$(grep -E "^HA_TOKEN=" "$STACK_DIR/.env" 2>/dev/null | cut -d= -f2-)
  if [[ -z "$token" || "$token" == "PASTE_YOUR_HA_LONG_LIVED_TOKEN_HERE" ]]; then
    warn "HA_TOKEN not set in $STACK_DIR/.env — run ./smartlend.sh install first"
  else
    curl -sk -H "Authorization: Bearer $token" \
      https://localhost:8123/api/states/sensor.smartlend_nfc_wifi_signal 2>/dev/null | \
      python3 -c "import sys,json; s=json.load(sys.stdin); print(f\"  Wi-Fi signal: {s['state']} dBm · last seen {s['last_reported']}\")" \
      2>/dev/null || warn "ESP entity unreachable"
  fi
}

# --------------------------------------------------------------------------
# logs
# --------------------------------------------------------------------------
cmd_logs() {
  need_docker
  local svc="${1:-}"
  case "$svc" in
    ha|homeassistant)  docker logs -f --tail 100 smartlend-ha ;;
    ui)                docker logs -f --tail 100 smartlend-ui ;;
    esphome|esp)       docker logs -f --tail 100 smartlend-esphome ;;
    mqtt|mosquitto)    docker logs -f --tail 100 smartlend-mqtt ;;
    "")                (cd "$STACK_DIR" && docker compose logs -f --tail 50) ;;
    *)                 err "Unknown service '$svc'. Use: ha / ui / esphome / mqtt"; exit 1 ;;
  esac
}

# --------------------------------------------------------------------------
# flash
# --------------------------------------------------------------------------
cmd_flash() {
  need_docker
  local dev="${1:-/dev/ttyACM0}"
  if [[ ! -e "$dev" ]]; then err "$dev not found — connect ESP32 via USB"; exit 1; fi
  # Make sure the ESPHome container sees the device (compose mounts it at start).
  if ! docker exec smartlend-esphome test -e "$dev" 2>/dev/null; then
    warn "ESPHome container does not see $dev — restarting container"
    (cd "$STACK_DIR" && docker compose restart esphome)
    sleep 3
  fi
  info "Compiling + flashing (logs stream until you Ctrl-C)…"
  docker exec -it smartlend-esphome esphome run /config/smartlend-nfc.yaml --device "$dev"
}

# --------------------------------------------------------------------------
# reset
# --------------------------------------------------------------------------
cmd_reset() {
  local token
  token=$(grep -E "^HA_TOKEN=" "$STACK_DIR/.env" 2>/dev/null | cut -d= -f2-)
  if [[ -z "$token" || "$token" == "PASTE_YOUR_HA_LONG_LIVED_TOKEN_HERE" ]]; then
    err "HA_TOKEN not set — paste it into $STACK_DIR/.env first"; exit 1
  fi
  curl -sk -H "Authorization: Bearer $token" -X POST \
    https://localhost:8123/api/services/script/smartlend_reset_all -d '{}' \
    -o /dev/null -w "HTTP %{http_code}\n"
  ok "All items reset to available"
}

# --------------------------------------------------------------------------
# urls
# --------------------------------------------------------------------------
cmd_urls() {
  echo
  info "Open in your browser:"
  echo "  UI kiosk:  http://localhost:3001"
  echo "  HA admin:  https://localhost:8123  (accept the self-signed cert once)"
  local lanip
  lanip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E "^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)" | head -1 || true)
  if [[ -n "$lanip" ]]; then
    echo "  From other devices on the same Wi-Fi:  http://$lanip:3001"
  fi
}

# --------------------------------------------------------------------------
cmd_help() { sed -n '4,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

case "${1:-help}" in
  install)          shift; cmd_install    "$@" ;;
  start|up)         shift; cmd_start      "$@" ;;
  stop|down)        shift; cmd_stop       "$@" ;;
  restart)          shift; cmd_restart    "$@" ;;
  status|health)    shift; cmd_status     "$@" ;;
  logs|log)         shift; cmd_logs       "$@" ;;
  flash|upload)     shift; cmd_flash      "$@" ;;
  reset)            shift; cmd_reset      "$@" ;;
  urls|url)         shift; cmd_urls       "$@" ;;
  help|-h|--help)   shift; cmd_help       "$@" ;;
  *) err "Unknown command '${1:-}'. Try './smartlend.sh help'."; exit 1 ;;
esac
