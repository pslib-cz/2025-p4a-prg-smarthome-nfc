#!/usr/bin/env bash
# SmartLend UID capture helper.
#
# Prerequisites:
#   - ESP32-C3 is flashed with smartlend-nfc.yaml and connected to Wi-Fi
#   - PN532 is reading tags (check ESPHome dashboard logs first)
#   - Home Assistant is running and has received at least one scan
#
# What it does:
#   1. Reads all tags Home Assistant has seen (from .storage/tag)
#   2. For each UID, asks which label it belongs to
#   3. Writes the labels into homeassistant/config/secrets.yaml
#   4. Restarts Home Assistant so the tag automations pick up the new UIDs
#
# Usage:
#   ./scripts/capture_uids.sh

set -euo pipefail

STACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$STACK_DIR/homeassistant/config"
SECRETS="$CONFIG_DIR/secrets.yaml"
TAG_STORE="$CONFIG_DIR/.storage/tag"

cd "$STACK_DIR"

if [[ ! -f "$TAG_STORE" ]]; then
  echo "No tag store yet at $TAG_STORE"
  echo "Scan at least one NFC tag on the PN532 first, then re-run."
  exit 1
fi

echo "=== Tags Home Assistant has seen ==="
mapfile -t UIDS < <(docker run --rm -v "$CONFIG_DIR":/config python:3-alpine python - <<'PY'
import json
with open('/config/.storage/tag') as f:
    data = json.load(f)
for t in data.get('data', {}).get('items', []):
    uid = t.get('id') or ''
    last = t.get('last_scanned') or ''
    print(f"{uid}\t{last}")
PY
)

if (( ${#UIDS[@]} == 0 )); then
  echo "Tag store is empty. Scan a tag on the PN532 and try again."
  exit 1
fi

for line in "${UIDS[@]}"; do
  IFS=$'\t' read -r UID LAST <<<"$line"
  printf '\n  UID: %s   (last scanned: %s)\n' "$UID" "$LAST"
done

declare -A ASSIGN=(
  [usb_c_cable]="tag_uid_usb_c_cable"
  [adapter]="tag_uid_adapter"
  [meter]="tag_uid_meter"
  [user_card]="tag_uid_user_card"
)

echo
echo "=== Label each UID ==="
echo "Enter one of: usb_c_cable | adapter | meter | user_card | skip"

declare -A CHOSEN=()
for line in "${UIDS[@]}"; do
  IFS=$'\t' read -r UID LAST <<<"$line"
  while :; do
    read -r -p "UID $UID -> " label
    label="${label,,}"
    if [[ "$label" == "skip" || -z "$label" ]]; then
      break
    fi
    if [[ -n "${ASSIGN[$label]:-}" ]]; then
      if [[ -n "${CHOSEN[$label]:-}" ]]; then
        echo "  already assigned to ${CHOSEN[$label]}, pick another label"
        continue
      fi
      CHOSEN[$label]="$UID"
      break
    fi
    echo "  unknown label; valid: usb_c_cable adapter meter user_card skip"
  done
done

if (( ${#CHOSEN[@]} == 0 )); then
  echo "Nothing to write. Exiting."
  exit 0
fi

echo
echo "=== Patching $SECRETS ==="
cp "$SECRETS" "$SECRETS.bak.$(date +%s)"
for label in "${!CHOSEN[@]}"; do
  key="${ASSIGN[$label]}"
  uid="${CHOSEN[$label]}"
  sed -i -E "s|^${key}:.*$|${key}: \"${uid}\"|" "$SECRETS"
  echo "  ${key} = ${uid}"
done

echo
echo "=== Restarting Home Assistant ==="
docker compose restart homeassistant >/dev/null
sleep 18
echo "Done. Tag triggers are live — scan a tag and watch the automation fire in Developer Tools → Events."
