# SmartLend implementation details

## Aktualni situace

Mame hardware pro SmartLend NFC pujcovnu:

- ESP32-C3 SuperMini v breadboardu
- cerveny PN532 NFC modul
- bily NFC card tag
- NFC samolepky
- WS2812B LED ring
- dupont kabely

Nemame potvrzeny `330 ohm` rezistor ani kondenzator `470-1000 uF`.
Podle fotek to vypada, ze tyhle soucastky nejsou k dispozici.

## Stav po debugovani 2026-04-16

Docker stack bezi:

- Home Assistant: `https://172.20.10.7:8123`
- ESPHome dashboard: `http://172.20.10.7:6052`
- MQTT broker: `127.0.0.1:1883` pro HA, `8883` TLS pro LAN

ESP32-C3 je pripojene na iPhone hotspot:

```text
ESP IP: 172.20.10.8
Wi-Fi SSID: iPhone
API port 6053: otevreny
```

`wifi_ssid` v ESPHome secrets znamena nazev Wi-Fi site/hotspotu.
`wifi_password` znamena heslo k teto Wi-Fi.

Puvodni chyba `Auth Expired` zmizela po uprave ESPHome:

- framework prepnuty z `esp-idf` na `arduino`
- `fast_connect: true`
- `output_power: 10dB`
- `power_save_mode: NONE`

NFC cast - aktualni stav a fix:

```text
I2C scan: Found no devices
PN532: Error sending version command
```

Tohle byla spatna kombinace: software cekal I2C, ale z fotky cervene desky pouzivame UART/HSU stranu s piny:

```text
RXD / TXD / VCC / GND
```

ESPHome konfigurace je proto opravena z I2C na UART. Aby ctecka fungovala, cervena NFC deska musi byt prepnuta do `HSU/UART` rezimu:

```text
HSU / UART mode: 0 0
ne I2C mode:     1 0
```

Prakticky: na DIP/mode prepinaci dej oba male prepinace do polohy `0` podle tabulky na cervene desce.

Aktualni spravne zapojeni NFC:

```text
NFC GND -> ESP G
NFC VCC -> ESP 3.3
NFC TXD -> ESP GPIO5
NFC RXD -> ESP GPIO6
```

Pozor: `TXD` a `RXD` se krizuje logicky. `TXD` z NFC jde do prijmu ESP (`GPIO5`) a `RXD` z NFC jde z vysilani ESP (`GPIO6`).

Po zmene DIP nebo dratu odpoj USB, zkontroluj zapojeni a pak ESP znovu pripoj.

## Dulezite rozhodnuti

Jdeme bez rezistoru a bez kondenzatoru, protoze nic jineho nemame.
Pro skolni kratke demo je to pouzitelne, pokud se dodrzi bezpecne zapojeni a nizky jas.

Neni to nejlepsi dlouhodoba verze. Idealni verze by mela:

- `330 ohm` nebo `470 ohm` rezistor mezi ESP GPIO a LED ring `IN`
- kondenzator `470-1000 uF` mezi `5V` a `GND` u LED ringu
- idealne level shifter `74AHCT125` nebo `74HCT245` pro prevod ESP 3.3V dat na 5V data pro WS2812B

## Co je opravdu nebezpecne

Nejdulezitejsi je nikdy neposlat `5V` do ESP GPIO pinu.

To znamena:

- `5V` muze jit na ring `VCC`
- `5V` nesmi jit na ring `IN`
- `5V` nesmi jit na ESP `GPIO3`
- ESP `GPIO3` jde jen do ring `IN`
- vsechny `GND` musi byt spojene

## LED ring bez rezistoru

Zapojovat az po tom, co funguje NFC.
Pred zapojenim odpoj USB z ESP.

Zapojeni:

```text
ESP GND   -> ring GND
ESP 5V    -> ring VCC
ESP pin 3 / GPIO3 -> ring IN
```

Pouzij spodni trojici pinu na ringu podle fotky:

```text
IN
VCC
GND
```

Horni trojice pinu na ringu je:

```text
GND
VCC
OUT
```

Tu ted nepouzivat. `OUT` je vystup pro dalsi LED ring/strip.

## Proc je to bez rezistoru jeste ok pro demo

`GPIO3` z ESP posila 3.3V datovy signal do vstupu `IN` na ringu.
Na fyzicke desce hledej potisk `3`; v ESPHome se stejny pin pise jako `GPIO3`.
To by nemelo ring ani ESP spalit, protoze signal jde spravnym smerem z ESP do ringu.

Problem muze byt spis spolehlivost:

- ring muze nekdy nereagovat
- ring muze blikat spatne
- barvy muzou byt nahodne

Kdyz se to stane, neni to nutne spalene. Spis chybi odpor/level shifter, nebo je spatne `GND`.

## Jas LED ringu

Nepoustet plny bily jas.
24 LED na plny bily jas muze brat moc proudu.

Pro demo pouzit nizky jas:

- idealne 10-20 %
- maximum 20-40 %
- testovat zelenou/modrou/cervenou, ne dlouho bilou

## ESPHome pin pro ring

V YAML pouzit `GPIO3`:

```yaml
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

## Finalni doporuceny postup

1. Nechat LED ring odpojeny.
2. Zapojit jen ESP + PN532.
3. Overit v ESPHome logu, ze NFC cte tag/kartu.
4. Vypnout/odpojit USB.
5. Pridat LED ring podle zapojeni vyse.
6. Zapnout ESP.
7. V Home Assistantu/ESPHome pustit ring jen na nizky jas.
8. Pokud ring blika divne, vypnout a zkontrolovat `GND`, `VCC`, `IN`.

## Soubory s diagramy

- `smartlend-krok1-nfc.svg` - zapojeni ESP + PN532
- `smartlend-krok1-nfc.png` - nahled zapojeni ESP + PN532
- `smartlend-krok2-led-ring.svg` - zapojeni LED ringu
- `smartlend-krok2-led-ring.png` - nahled zapojeni LED ringu
- `smartlend-zapojeni.svg` - celkove schema
- `smartlend-zapojeni.png` - nahled celkoveho schematu

## Aktualni diagnostika NFC ctecky

Do firmware bylo pridane detailni logovani:

- ESPHome `uart.debug` ukazuje raw UART bajty na dratech.
- Komponenta `pn532_uart` loguje pokusy o handshake, ocekavane zapojeni a stav ctecky.
- ESP posila PN532 wakeup a prikaz `GetFirmwareVersion`.

Aktualni vysledek z logu:

```text
Wi-Fi connected, IP: 172.20.10.8
UART TX Pin: GPIO6
UART RX Pin: GPIO5
TX wakeup: 55 55 00 00 00
TX command 0x02 frame: 00 00 FF 02 FE D4 02 2A 00
RX frame start timeout. Bytes seen: (none)
Diagnostic: ESP transmitted a PN532 command, but RX saw 0 bytes.
```

Vyklad:

- notebook / Docker / Home Assistant nejsou ted hlavni problem
- ESP je na Wi-Fi a firmware bezi
- ESP opravdu vysila data do NFC modulu
- z NFC modulu se nevraci ani jeden byte

Po dalsim testu:

- DIP prepinace byly nastaveny na `OFF/OFF` podle popisu uzivatele.
- Firmware zkousel i delsi PN532 UART wakeup preamble:

```text
55 55 00 00 00 00 00 00 00 00 00 00 00 00 00 00
```

- Vysledek je porad stejny: `RX saw 0 bytes`.

To znamena, ze chyba je skoro urcite fyzicka:

1. NFC modul neni v HSU/UART rezimu.
2. TXD/RXD jsou prehozene nebo nejsou na spravnych pinech ESP.
3. VCC/GND nejsou opravdu na `3.3` a `G`.
4. Modul je zapojen do spatne strany/pinu nebo ma spatny kontakt v breadboardu.

## Dalsi debug: ESP UART loopback test

Tenhle test overi, jestli ESP pin `5`, ESP pin `6` a kabely vubec funguji.
Je bezpecny, protoze propojujeme jen dva 3.3V signaly na ESP.

Diagram k tomuhle testu je v souboru:

- `smartlend-loopback-test.svg`

Postup:

1. Odpoj USB z ESP.
2. Odpoj z cervene NFC desky jen datove draty `TXD` a `RXD`.
3. Konce tech dvou dratu, ktere vedou do ESP pinu `5` a `6`, propoj spolu:

```text
ESP pin 5 <-> ESP pin 6
```

Muzes je dat do stejne radky na breadboardu.

4. NFC VCC/GND pro tenhle test klidne nech odpojene.
5. Pripoj USB.
6. Spust ESPHome log.

Ocekavany vysledek, pokud ESP piny a kabely funguji:

```text
>>> 55:55:00...
<<< 55:55:00...
```

Pokud se ukaze `<<<`, ESP a kabely jsou OK a problem je na cervene NFC desce / jejim rezimu / jejim konektoru.

Pokud se `<<<` neukaze, problem je v ESP pinech, v tom ze kabel neni opravdu v pinu `5/6`, nebo ve spatnem kontaktu na breadboardu/headeru.

Bezpecny dalsi krok:

1. Odpoj USB z ESP.
2. Na cervene NFC desce zkontroluj rezim `HSU/UART = OFF/OFF` (`0 0`).
3. Podle potisku na cervene desce zapoj:

```text
NFC GND -> ESP G
NFC VCC -> ESP 3.3
NFC TXD -> ESP pin 5 / GPIO5
NFC RXD -> ESP pin 6 / GPIO6
```

4. Znovu pripoj USB.
5. V logu cekej na:

```text
Found PN532 firmware
PN532 UART reader ready
```

Teprve potom priloz bilou kartu nebo samolepku na cervenou NFC antenu.
