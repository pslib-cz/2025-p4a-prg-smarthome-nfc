# SmartLend Docker stack

Local Home Assistant stack for the SmartLend NFC project.

## Services

| Container | Purpose | Port |
| --- | --- | --- |
| `smartlend-ha` | Home Assistant Core | `8123` (HTTPS) |
| `smartlend-esphome` | ESPHome dashboard (firmware builder for ESP32-C3) | `6052` |
| `smartlend-mqtt` | Mosquitto MQTT broker | `1883` (loopback), `8883` (TLS on LAN) |

HA uses `network_mode: host` so mDNS/zeroconf can discover ESP32 devices on the LAN (standard HA Docker pattern).

## First run

```bash
cd /home/flashy/Rasberry/stack
# TLS cert is created by ./scripts/gen-cert.sh (see below)
docker compose pull
docker compose up -d
docker compose logs -f homeassistant
```

Open `https://10.7.3.203:8123` (or `https://localhost:8123`). The browser will warn about the self-signed cert — that's expected.

## Mosquitto user

Create a user before first start:

```bash
docker run --rm -v $(pwd)/mosquitto/config:/mosquitto/config \
  eclipse-mosquitto:2 mosquitto_passwd -b -c /mosquitto/config/passwd smartlend CHANGE_ME
```

## Stopping

```bash
docker compose down
```
