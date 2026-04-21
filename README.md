# SmartLend - NFC pujcovna veci v Home Assistantu

SmartLend je lokalni IoT pripadova studie pro dvouclenny tym. Projekt simuluje pujcovnu skolnich/laboratornich pomucek: kabelu, adapteru, meraku, karet nebo jinych veci. Kazda vec ma NFC tag. Po prilozene tagu ke ctecce se v Home Assistantu zmeni stav veci, zapise se log a stav je videt na dashboardu.

Primarni cil je provoz na notebooku. Raspberry Pi je jen zalozni varianta, pokud by notebook/virtualizace delaly problemy.

## Co mame podle fotek

Fotky jsou ve slozce [`IMGS`](./IMGS/).

Zapojeni je nakreslene v samostatnem SVG diagramu [`smartlend-zapojeni.svg`](./smartlend-zapojeni.svg) a PNG nahledu [`smartlend-zapojeni.png`](./smartlend-zapojeni.png).

| Soucastka | Fotky | Pouziti v projektu |
| --- | --- | --- |
| ESP32-C3 SuperMini | [`IMG1.jpg`](./IMGS/IMG1.jpg), [`img2.jpg`](./IMGS/img2.jpg), [`img3.jpg`](./IMGS/img3.jpg), [`img4.jpg`](./IMGS/img4.jpg) | Wi-Fi zarizeni s ESPHome firmwarem. Cte NFC pres PN532 a posila udalosti do Home Assistantu. |
| PN532 NFC modul | [`IMG5.jpg`](./IMGS/IMG5.jpg), [`IMG7.jpg`](./IMGS/IMG7.jpg) | NFC ctecka v rezimu I2C. Cte UID tagu a karet. |
| WS2812B LED ring | [`IMG6.jpg`](./IMGS/IMG6.jpg) | Volitelna stavova indikace: zelena = vypujceno/OK, modra = vraceno, cervena = chyba. |
| NFC samolepky a bila karta | [`Cable.jpg`](./IMGS/Cable.jpg) | Samolepky patri na veci. Bila karta muze byt karta uzivatele. |
| Breadboard a Dupont kabely | [`Cable.jpg`](./IMGS/Cable.jpg) | Prototypove zapojeni bez plosneho spoje. |

## Splneni zadani pro N = 2

| Pozadavek | Minimum pro N=2 | Co mame | Pomer |
| --- | :-: | :-: | :-: |
| Lokalni integrace | 1 | **3** (ESPHome, MQTT/Mosquitto, Sun) | **3x** |
| Scenare | 2 | **10** (borrow, smart-return, DENIED, sunset, sunrise, 2 sceny, 3 servisni automatizace) | **5x** |
| Entity | 4 | **102** (z toho ~64 vlastnich) | **25x** |
| Centralni rizeni z HA | ano | **ano**, zadna externi db ani web-server | ✅ |
| Web klient jako dashboard | ano | **Next.js 15 kiosk**, HA WebSocket (wss://) | ✅ |
| TLS/SSL + autorizace | ano | **HTTPS, MQTT TLS 8883, ESPHome API encryption, OTA password, IP ban** | ✅ |

## Aktualni funkce systemu

### 9 polozek k pujcovani (3x3 grid)

| Polozka | Emoji | Entita | Holder | NFC UID |
| --- | :-: | --- | --- | --- |
| USB-C cable | 🔌 | `input_select.item_usb_c_cable` | `input_text.holder_usb_c_cable` | `input_text.last_nfc_usb_c_cable` |
| Adapter | 🔋 | `input_select.item_adapter` | `input_text.holder_adapter` | `input_text.last_nfc_adapter` |
| Meter | 📏 | `input_select.item_meter` | `input_text.holder_meter` | `input_text.last_nfc_meter` |
| Stativ | 📷 | `input_select.item_tripod` | `input_text.holder_tripod` | `input_text.last_nfc_tripod` |
| Mikrofon | 🎤 | `input_select.item_microphone` | `input_text.holder_microphone` | `input_text.last_nfc_microphone` |
| Ring light | 💡 | `input_select.item_ring_light` | `input_text.holder_ring_light` | `input_text.last_nfc_ring_light` |
| HDMI kabel | 📺 | `input_select.item_hdmi_cable` | `input_text.holder_hdmi_cable` | `input_text.last_nfc_hdmi_cable` |
| Sluchatka | 🎧 | `input_select.item_headphones` | `input_text.holder_headphones` | `input_text.last_nfc_headphones` |
| SD ctecka | 💾 | `input_select.item_sd_reader` | `input_text.holder_sd_reader` | `input_text.last_nfc_sd_reader` |

### Scenare

1. **Pujceni (borrow)** — tap karty → vyber jmena → vyber veci → zelena LED 2.5s, vec `borrowed`.
2. **Vraceni se smart-return** — tap **stejne karty** preskoci identity picker i item picker a rovnou otevre modal "Vratit X?". UI si pamatuje UID karty u kazde pujcene veci; pri dalsim prilozeni matchuje UID vuci `input_text.last_nfc_*`.
3. **DENIED guard** — pokud **jina karta** zkusi vratit cizi vec (uzivatel != holder), script vetev `is_denied` v `scripts.yaml` zabrani zmene stavu, blikne cervena LED a UI zobrazi cerveny banner s logem.
4. **Denni/nocni rezim (Sun integrace)** — pri zapadu slunce (+30 min) se automaticky zapne `input_boolean.quiet_mode`; LED pak blikaji tlumene na 5 % misto 55 %. Pri vychodu slunce se obnovi plny jas. V UI header jsou demo tlacitka 🌙 Zapad / ☀️ Vychod pro rucni spusteni pri obhajobe.
5. **Presentation / Maintenance sceny** — `scene.smartlend_presentation` a `scene.smartlend_maintenance` jsou predpripravene konfigurace pro prezentacni a servisni rezim.
6. **Servisni automatizace na pozadi** — pulnocni reset `counter.borrow_count_today`, MQTT heartbeat `smartlend/bridge/status` kazdou minutu, bila LED pri kazdem scanu.

### Dashboard (Next.js kiosk, `stack/ui/`)

- **Header**: pocet dnesnich pujcek, ESP teplota, WiFi dBm, pocet entit (live), Rezim (☀️ Active / 🌙 Quiet), demo tlacitka + Reset.
- **Hero + 3x3 grid** polozek s barevnym stavem a emoji.
- **Panel "🔒 Aktualne pujceno"** vpravo — seznam drzitelu vsech momentalne pujcenych veci.
- **Activity log** vpravo — chronologicky barevne kodovany zaznam kazde akce (scan, borrow, return, DENIED, quiet mode, chyby).
- **Modal flow** — identity → item → confirm-return / result — vse pres HA WebSocket, zadne polling.

### Zabezpeceni (6 vrstev)

1. **HTTPS** mezi UI a HA — `ssl_certificate: /ssl/fullchain.pem` v `configuration.yaml`.
2. **MQTT TLS** na portu 8883 + user/password auth (lokalni port 1883 jen pro HA bridge).
3. **ESPHome API encryption key** — sifrovana komunikace ESP ↔ HA.
4. **OTA password** — firmware update po WiFi chraneny heslem.
5. **HA long-lived token** pro UI autentikaci + `ip_ban_enabled: true` s thresholdem 5 pokusu.
6. **Fallback AP s heslem** + vsechny secrets v `.gitignore` (`secrets.yaml`, `.env`, `*.pem`, `passwd`).

## Ocekavane hodnoceni (max 100)

| Kriterium | Max | Odhad |
| --- | :-: | :-: |
| Mnozstvi integraci (ESPHome + MQTT + Sun + HA core) | 10 | 9 |
| Mnozstvi entit (102 celkem, 64 vlastnich) | 10 | 10 |
| Cistota/komplexita HW (ESP32-C3 + PN532 + WS2812B, dokumentovane schema, fallback AP, OTA) | 10 | 8 |
| Napaditost a realnost automatizaci (pujcovna, DENIED guard, sun/quiet mode) | 20 | 17 |
| Unikatnost (smart-return pres NFC UID, DENIED guard) | 10 | 9 |
| Dashboard monitoring (live WS, activity log, reservations panel) | 15 | 14 |
| Dashboard interakce (modal flow, demo tlacitka) | 15 | 14 |
| Zabezpeceni (HTTPS, MQTT TLS, API encryption, OTA, IP ban, gitignored secrets) | 10 | 9 |
| **Celkem** | **100** | **~90** |

Odhadovana znamka: **1 (vyborne)**.

## Koncept pouziti

Priklad realne situace: ve skole nebo labu se pujcuji kabely, adaptery, meraky nebo kalkulacky. Bez evidence se veci ztraci. SmartLend to resi lokalne:

1. Na kazdou vec nalepime jednu NFC samolepku.
2. Volitelne pouzijeme bilou NFC kartu jako kartu cloveka.
3. Uzivatel prilozi tag/kartu ke ctecce.
4. ESP32-C3 pres PN532 precte UID tagu.
5. ESPHome posle udalost do Home Assistantu.
6. Home Assistant podle UID zmeni stav veci na `available` nebo `borrowed`.
7. Dashboard ukaze aktualni stav a log akci.

Zakladni demo muze fungovat jen s tagy veci: kazde prilozene veci prepina stav `available -> borrowed -> available`. Bonusova varianta pouzije bilou kartu jako identitu cloveka: nejdriv se pipne karta cloveka, potom tag veci.

## Architektura bez Raspberry Pi

```text
NFC samolepka / bila karta
        |
        v
PN532 NFC ctecka --I2C--> ESP32-C3 SuperMini --Wi-Fi--> Home Assistant OS ve VM na notebooku
                                                            |
                                                            v
                                                Dashboard + logbook + automations
```

Notebook musi byt pri demu zapnuty a pripojeny do stejne Wi-Fi site jako ESP32. Home Assistant doporucuji spustit jako Home Assistant OS ve virtualnim stroji, protoze tato instalace ma Supervisor a add-ony. Cisty Home Assistant Container v Dockeru je pouzitelny, ale nema add-ony; ESPHome by se potom musel spoustet bokem.

## Fyzicke zapojeni

Samostatne diagramy pro zapojeni:

- Krok 1 NFC: [`smartlend-krok1-nfc.svg`](./smartlend-krok1-nfc.svg), nahled [`smartlend-krok1-nfc.png`](./smartlend-krok1-nfc.png)
- Krok 2 LED ring: [`smartlend-krok2-led-ring.svg`](./smartlend-krok2-led-ring.svg), nahled [`smartlend-krok2-led-ring.png`](./smartlend-krok2-led-ring.png)
- Celkove schema: [`smartlend-zapojeni.svg`](./smartlend-zapojeni.svg), nahled [`smartlend-zapojeni.png`](./smartlend-zapojeni.png)

### Bezpecnost pred zapojenim

- ESP32-C3 GPIO piny jsou pouze 3.3V logika. Nikdy na ne nepripojuj 5V signal.
- PN532 napajej z `3V3`, ne z `5V`.
- WS2812B ring napajej z `5V`, ne z `3V3`.
- Vsechny moduly musi mit spolecnou zem `GND`.
- Nezapinej LED ring na plny bily jas. Pro demo nastav jas max. 20-40 %.
- Nepripojuj externi 5V zdroj na `5V` pin ESP32 zaroven s USB-C z notebooku.
- Data z ESP (`GPIO3`) jsou 3.3V. To ring nespali, ale u 5V WS2812B to nemusi byt 100% spolehlive.
- Pro nejjistejsi verzi dej mezi ESP a `IN` level shifter `74AHCT125`/`74HCT245`; pro kratke demo bez nej drzte kabel kratky.
- Nejdriv zprovozni jen ESP32 + PN532. Ring pridej az po overeni NFC.

### Orientace soucastek

ESP32-C3 SuperMini dej pres stredovou mezeru breadboardu tak, aby kazda strana pinu byla v jine polovine breadboardu. Na vasem ESP32 je u USB-C na prave strane videt napajeni `5V`, `G`/`GND` a `3.3`/`3V3`. GPIO piny ber podle potisku na desce, ne podle cisel radku na breadboardu.

PN532 pouzij na strane s piny `GND`, `VCC`, `SDA`, `SCL`. Na modulu nastav I2C rezim podle tabulky vytistene na desce. Na fotce je tabulka `HSU / I2C / SPI`; pro I2C je obvykle nastaveni DIP/prepinacu `1 0` (switch 1 ON, switch 2 OFF). Pokud ctecka v logu nebude videt, tohle je prvni vec ke kontrole.

LED ring pouzivej na vstupni strane `GND`, `VCC`, `IN`. Druha strana `OUT`, `VCC`, `GND` je vystup pro dalsi ring a pro tento projekt se nepouziva.

### Krok 1 - PN532 bez LED ringu

Nejdriv zapoj jen NFC ctecku.

| PN532 pin | ESP32-C3 pin | Popis | Dop. barva kabelu |
| --- | --- | --- | --- |
| `GND` | `GND` / `G` | spolecna zem | cerna |
| `VCC` | `3V3` / `3.3` | napajeni PN532 | cervena |
| `SDA` | `GPIO5` | I2C data | modra |
| `SCL` | `GPIO6` | I2C clock | zluta |

Schema:

```text
ESP32-C3 SuperMini        PN532
-----------------        -----
3V3 / 3.3          ---->  VCC
GND / G            ---->  GND
GPIO5              ---->  SDA
GPIO6              ---->  SCL
```

Po zapojeni pripoj ESP32 pres USB-C do notebooku. V ESPHome logu musi byt videt I2C scan a PN532. PN532 miva na I2C typicky adresu `0x24`.

### Krok 2 - pridani WS2812B LED ringu

Ring pridej az po tom, co PN532 cte tagy.

| LED ring pin | ESP32-C3 pin | Popis |
| --- | --- | --- |
| `GND` na vstupni strane | `GND` / `G` | spolecna zem |
| `VCC` na vstupni strane | `5V` / `VBUS` | napajeni LED ringu |
| `IN` na vstupni strane | `GPIO3` | data pro LED |

Doporuceni pro stabilitu:

- Mezi `GPIO3` a `IN` dej seriovy rezistor 330 ohm, pokud ho mate.
- Mezi `5V` a `GND` u ringu dej kondenzator 470-1000 uF, pokud ho mate.
- Nepouzivej `GPIO2` jako prvni volbu pro ring. U ESP32-C3 je to boot/strapping pin a muze zlobit pri startu.
- Pokud ring nereaguje nebo blika spatne i pri spravne GND, problem muze byt 3.3V data do 5V ringu. Reseni je level shifter.

Schema:

```text
ESP32-C3 SuperMini        WS2812B ring
-----------------        ------------
5V / VBUS          ---->  VCC
GND / G            ---->  GND
GPIO3              ---->  IN
```

## Instalace Home Assistantu na notebook

Doporucena varianta pro skolni projekt je Home Assistant OS ve virtualnim stroji.

1. Nainstaluj VirtualBox, VMware Workstation nebo Hyper-V podle systemu notebooku.
2. Stahni Home Assistant OS image pro virtualizaci:
   - Windows: `https://www.home-assistant.io/installation/windows/`
   - Linux: `https://www.home-assistant.io/installation/linux/`
   - obecne VM info: `https://developers.home-assistant.io/docs/operating-system/boards/ova`
3. VM nastav minimalne na `2 GB RAM` a `2 vCPU`.
4. Zapni UEFI/EFI boot.
5. Sit VM nastav jako `Bridged Adapter`, ne NAT. ESP32 a HA pak budou ve stejne siti.
6. Spust VM.
7. Otevri v prohlizeci:

```text
http://homeassistant.local:8123
```

Pokud adresa nefunguje, zjisti IP adresu VM ve VirtualBox/VMware konzoli nebo v routeru a otevri:

```text
http://<IP_ADRESA_VM>:8123
```

8. Vytvor uzivatelsky ucet pro Home Assistant.
9. V `Settings -> Add-ons -> Add-on Store` nainstaluj `ESPHome Device Builder`.
10. Spust add-on a otevri jeho web UI.

## ESPHome firmware pro ESP32-C3

V ESPHome vytvor nove zarizeni `smartlend-nfc`. Po wizardu otevri YAML a uprav ho podle tohoto vzoru.

```yaml
substitutions:
  device_name: smartlend-nfc
  friendly_name: SmartLend NFC

esphome:
  name: ${device_name}
  friendly_name: ${friendly_name}

esp32:
  board: esp32-c3-devkitm-1
  variant: ESP32C3
  framework:
    type: esp-idf

logger:

api:
  encryption:
    key: !secret smartlend_api_key

ota:
  - platform: esphome
    password: !secret smartlend_ota_password

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "SmartLend Fallback"
    password: !secret smartlend_fallback_password

captive_portal:

i2c:
  sda: GPIO5
  scl: GPIO6
  scan: true
  frequency: 100kHz

pn532_i2c:
  id: pn532_board
  update_interval: 1s
  on_tag:
    then:
      - text_sensor.template.publish:
          id: last_nfc_tag
          state: !lambda "return x;"
      - homeassistant.tag_scanned: !lambda "return x;"

text_sensor:
  - platform: template
    name: "Last NFC Tag"
    id: last_nfc_tag

light:
  - platform: esp32_rmt_led_strip
    id: status_ring
    name: "Status Ring"
    pin: GPIO3
    num_leds: 24
    rgb_order: GRB
    chipset: WS2812
    restore_mode: ALWAYS_OFF
```

Do ESPHome `secrets.yaml` dopln:

```yaml
wifi_ssid: "NAZEV_WIFI"
wifi_password: "HESLO_WIFI"
smartlend_api_key: "VYGENEROVANY_BASE64_KLIC"
smartlend_ota_password: "SILNE_HESLO_PRO_OTA"
smartlend_fallback_password: "SILNE_HESLO_FALLBACK_AP"
```

API encryption key nech vygenerovat ESPHome wizardem, pokud ho nabidne. Pokud klic generujes sam, musi to byt base64 hodnota ve formatu, ktery ESPHome prijima.

## Prvni oziveni NFC

1. Nech zapojeny jen ESP32 + PN532.
2. V ESPHome dej `Validate`.
3. Prvni flash proved pres USB-C.
4. Po nahrani otevri `Logs`.
5. Zkontroluj, ze I2C scan nasel PN532.
6. Priloz NFC samolepku nebo bilou kartu.
7. V logu hledej UID ve tvaru napr. `74-10-37-94`.
8. Kazde UID si zapis do tabulky.

Navrh mapovani tagu:

| Typ tagu | Fyzicky tag | Navrh nazvu v HA |
| --- | --- | --- |
| Vec | kulata samolepka na USB-C kabelu | `USB-C Cable` |
| Vec | kulata samolepka na adapteru | `Adapter` |
| Vec | kulata samolepka na meraku/kalkulacce | `Meter` |
| Uzivatel | bila karta | `User Card - David` nebo `User Card - Team` |

## Home Assistant entity

V HA vytvor helpery v `Settings -> Devices & services -> Helpers`.

Minimum pro zadani:

| Entity | Typ | Ucel |
| --- | --- | --- |
| `input_select.item_usb_c_cable` | Dropdown | stav USB-C kabelu: `available` / `borrowed` |
| `input_select.item_adapter` | Dropdown | stav adapteru: `available` / `borrowed` |
| `input_text.last_action` | Text | posledni akce pro dashboard |
| `sensor.smartlend_nfc_last_nfc_tag` | ESPHome text sensor | posledni nactene UID |

Doporucene entity navic:

| Entity | Typ | Ucel |
| --- | --- | --- |
| `input_text.active_user` | Text | posledni nacteny uzivatel |
| `input_select.system_mode` | Dropdown | `normal`, `maintenance`, `presentation` |
| `input_boolean.quiet_mode` | Toggle | vypnuti zvukove signalizace, pokud pridate bzucak |
| `light.smartlend_nfc_status_ring` | ESPHome light | stavova LED indikace |
| `counter.borrow_count_today` | Counter | pocet pujcek za den |

## Automatizace Borrow/Return

Nejjednodussi varianta: kazdy tag veci prepina stav veci. Pokud je vec `available`, nacteni tagu znamena vypujceni. Pokud je `borrowed`, nacteni stejneho tagu znamena vraceni.

Ukazka pro jeden tag veci:

```yaml
alias: "SmartLend - USB-C cable toggle"
mode: single
trigger:
  - platform: tag
    tag_id: "SEM_VLOZ_UID_TAGU_USB_C_KABELU"
action:
  - choose:
      - conditions: "{{ is_state('input_select.item_usb_c_cable', 'available') }}"
        sequence:
          - action: input_select.select_option
            target:
              entity_id: input_select.item_usb_c_cable
            data:
              option: borrowed
          - action: input_text.set_value
            target:
              entity_id: input_text.last_action
            data:
              value: "USB-C cable borrowed"
          - action: logbook.log
            data:
              name: SmartLend
              message: "USB-C cable borrowed"
              entity_id: input_select.item_usb_c_cable
          - action: light.turn_on
            target:
              entity_id: light.smartlend_nfc_status_ring
            data:
              rgb_color: [0, 255, 0]
              brightness_pct: 25
          - delay: "00:00:01"
          - action: light.turn_off
            target:
              entity_id: light.smartlend_nfc_status_ring

      - conditions: "{{ is_state('input_select.item_usb_c_cable', 'borrowed') }}"
        sequence:
          - action: input_select.select_option
            target:
              entity_id: input_select.item_usb_c_cable
            data:
              option: available
          - action: input_text.set_value
            target:
              entity_id: input_text.last_action
            data:
              value: "USB-C cable returned"
          - action: logbook.log
            data:
              name: SmartLend
              message: "USB-C cable returned"
              entity_id: input_select.item_usb_c_cable
          - action: light.turn_on
            target:
              entity_id: light.smartlend_nfc_status_ring
            data:
              rgb_color: [0, 80, 255]
              brightness_pct: 25
          - delay: "00:00:01"
          - action: light.turn_off
            target:
              entity_id: light.smartlend_nfc_status_ring
```

Pro dalsi veci zkopiruj automatizaci a zmen:

- `tag_id`
- `input_select.item_usb_c_cable`
- texty `USB-C cable`

Bonus pro bilou kartu uzivatele:

1. Vytvor `input_text.active_user`.
2. Automatizace pro bilou kartu nastavi `active_user` na jmeno.
3. Automatizace veci zapise do `last_action` text typu `USB-C cable borrowed by David`.
4. Po uspesnem Borrow/Return nastav `active_user` zpet na prazdnou hodnotu nebo `unknown`.

## Dashboard

V Home Assistantu vytvor dashboard `SmartLend`.

Doporucene karty:

- `Entities` karta: vsechny `input_select.item_*`.
- `Entities` karta: `sensor.smartlend_nfc_last_nfc_tag`, `input_text.last_action`, `input_text.active_user`.
- `History graph`: stavy pujcovanych veci.
- `Logbook` nebo `Activity`: log udalosti SmartLend.
- Tlacitko/skript `Reset all items to available`.
- Ovladani `light.smartlend_nfc_status_ring` pro rucni test LED.

## Zabezpeceni

Minimum pro obhajobu:

1. Home Assistant ma vlastni uzivatelske ucty a silne heslo.
2. ESPHome pouziva `api.encryption.key`.
3. OTA ma heslo.
4. Tokeny ani hesla nejsou v JS souborech nebo verejne dokumentaci.
5. Dashboard je dostupny jen v lokalni siti.

HTTPS pro lokalni demo:

1. V HA OS nainstaluj `Terminal & SSH` add-on.
2. Vytvor self-signed certifikat:

```bash
openssl req -x509 -newkey rsa:4096 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -days 365 -nodes -subj "/CN=homeassistant.local"
```

3. Do `configuration.yaml` pridej:

```yaml
http:
  ssl_certificate: /ssl/fullchain.pem
  ssl_key: /ssl/privkey.pem
  ip_ban_enabled: true
  login_attempts_threshold: 5
```

4. Restartuj Home Assistant.
5. Otevrej:

```text
https://homeassistant.local:8123
```

Prohlizec muze hlasit varovani, protoze jde o self-signed certifikat. Pro skolni LAN demo je to prijatelne, pokud vysvetlite, ze komunikace je sifrovana, ale certifikat neni podepsany verejnou autoritou.

## Demo scenar do skoly

1. Otevrit dashboard SmartLend na notebooku.
2. Ukazat, ze veci jsou `available`.
3. Prilozit NFC samolepku `USB-C Cable`.
4. Stav se zmeni na `borrowed`, LED blikne zelene, v logu pribude zaznam.
5. Prilozit stejny tag znovu.
6. Stav se zmeni na `available`, LED blikne modre, v logu pribude zaznam.
7. Ukazat posledni UID/tag v ESPHome senzoru.
8. Volitelne prilozit bilou kartu uzivatele a potom tag veci.
9. Vysvetlit zabezpeceni: lokalni HA, ucet, HTTPS, ESPHome encryption.

## Troubleshooting

| Problem | Pravdepodobna pricina | Reseni |
| --- | --- | --- |
| ESPHome nevidi PN532 | PN532 neni v I2C rezimu | Nastav DIP/prepinace podle tabulky na PN532: I2C obvykle `1 0`. |
| I2C scan nic nenajde | prohozene SDA/SCL nebo chybi GND | Zkontroluj `SDA -> GPIO5`, `SCL -> GPIO6`, spolecnou GND a napajeni 3V3. |
| ESP32 se nepripoji k HA | VM je za NATem | Ve VM nastav sit na `Bridged Adapter`. |
| Tag se nacte v logu, ale automatizace nereaguje | spatne UID v `tag_id` | Zkopiruj UID presne vcetne pomlcek. |
| LED ring blika nahodne | dlouhe kabely, chybi GND, moc vysoky jas | Zkrat kabely, pridej spolecnou GND, sniz jas, pridej 330 ohm a kondenzator. |
| ESP32 po pridani ringu nebootuje | data ringu jsou omylem na boot pinu nebo je spatne GND | Over, ze data ringu jdou na `GPIO3`, ne na `GPIO2`, a ze GND je spolecna. |
| Notebook HA nejde otevrit | firewall nebo spatna IP | Zkus `http://<IP_VM>:8123`, povol port 8123, zkontroluj bridged sit. |

## Zalozni varianta s Raspberry Pi

Raspberry Pi pouzijte az jako posledni resort. Architektura projektu se tim nemeni, jen Home Assistant OS bezi na Raspberry Pi misto VM na notebooku.

Postup:

1. Flashnout Home Assistant OS na microSD.
2. Spustit Raspberry Pi v LAN/Wi-Fi.
3. Otevrit `http://homeassistant.local:8123`.
4. Pokracovat stejne od instalace ESPHome add-onu.

## Zdroje dohledane pres MCP web search a Context7

- Home Assistant - Windows VM instalace: https://www.home-assistant.io/installation/windows/
- Home Assistant - Linux VM/container instalace: https://www.home-assistant.io/installation/linux/
- Home Assistant OS VM poznamky: https://developers.home-assistant.io/docs/operating-system/boards/ova
- ESPHome Device Builder v HA: https://www.esphome.io/guides/getting_started_hassio.html
- ESPHome PN532 NFC/RFID: https://esphome.io/components/binary_sensor/pn532.html
- ESPHome ESP32 RMT LED Strip: https://esphome.io/components/light/esp32_rmt_led_strip/
- ESP32-C3 SuperMini pinout reference pro overeni potisku: https://sudo.is/docs/esphome/boards/esp32c3supermini
- Adafruit NeoPixel best practices: https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices
- Adafruit NeoPixel level shifting: https://learn.adafruit.com/neopixel-levelshifter
- WS2812B datasheet: https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf
