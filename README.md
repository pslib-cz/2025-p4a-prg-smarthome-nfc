# Případová Studie Chytré Domácnosti / IoT v Home Assistantu

## Přehled

Tento projekt je zaměřen na vytvoření automatizačního systému postaveného na Home Assistantu, který bude simulovat realistické scénáře chytré domácnosti nebo neprůmyslového Internetu věcí.

Cílem je navrhnout a realizovat věrohodnou případovou studii, ve které budou senzory, akční členy, automatizace a dashboardy odpovídat reálnému použití. Celé řešení má být centrálně řízené z Home Assistantu bez závislosti na externím webovém serveru, databázi nebo podobné backendové službě.

## Hlavní Cíl

Vytvořit realistickou případovou studii chytré domácnosti nebo IoT, ve které:

- Home Assistant funguje jako centrální řídicí bod.
- Senzory a akční členy odpovídají zvolenému scénáři.
- Automatizace jsou smysluplné a technicky obhajitelné.
- Monitoring, logování a interakce uživatele jsou dostupné přes připojený webový klient nebo dashboard.
- Je řešeno zabezpečení komunikace a autorizace.

Příklady:

- Pokud systém sleduje teplotu a vlhkost, měl by ovládat ventilátor, klimatizaci, topný člen nebo podobný relevantní akční prvek.
- Pokud je simulováno řízení klimatu, je vhodné použít fyzicky odpovídající akční člen, například ventilátor, a ne nesouvisející LED diodu.

## Základní Požadavky

### Home Assistant jako Centrum Systému

Celý systém musí být řízen lokálně z Home Assistantu.

- Bez závislosti na externím webovém serveru.
- Bez závislosti na externí databázi.
- Preferovat integrace a add-ony Home Assistantu před externími aplikacemi.
- Minimalizovat použití cloudových API, pokud existuje lokální alternativa.

### Dashboard / Webový Klient

Webový klient připojený k Home Assistantu by měl poskytovat:

- monitoring
- logování
- rekonfiguraci
- uživatelskou interakci se systémem

Klient může k Home Assistantu přistupovat pomocí:

- MQTT přes WebSocket
- REST API přes HTTP

V obou případech by mělo být řešeno zabezpečení komunikace, například:

- TLS / SSL
- autentizace a autorizace

## Očekávání Od Případové Studie

Samotný scénář je záměrně otevřený a má odrážet nápaditost realizačního týmu.

Výsledná případová studie by měla:

- co nejvíce odpovídat reálnému použití chytré domácnosti nebo IoT
- používat vhodné senzory a akční členy
- obsahovat více scén nebo scénářů
- ukazovat praktickou automatizační logiku
- řešit bezpečnost komunikace tam, kde je to relevantní

## Požadavky Podle Velikosti Týmu

Požadovaný rozsah závisí na počtu členů týmu `N`.

### Minimální Počet Lokálních Integrací

| Velikost týmu | Minimální počet lokálních integrací |
| --- | --- |
| `N < 3` | `1` |
| `N > 2` | `N - 1` |

### Minimální Počet Scén / Scénářů

| Velikost týmu | Minimální počet scén |
| --- | --- |
| libovolné `N` | `N` |

### Minimální Počet Entit

| Velikost týmu | Minimální počet entit |
| --- | --- |
| `N = 1` | `3` |
| ostatní `N` | `N * 2` |

## Kritéria Hodnocení

| Kritérium | Popis | Body |
| --- | --- | ---: |
| Použité integrace | Počet různých integrací a jejich vhodnost vzhledem ke scénáři | 10 |
| Použité entity | Celkový počet entit v systému, například senzory a akční členy | 10 |
| Kvalita / komplexita HW řešení | Správné zapojení, spolehlivost, nízká chybovost a udržitelnost návrhu | 10 |
| Nápaditost a reálnost automatizací | Jak dobře projekt reflektuje reálné scénáře chytré domácnosti | 20 |
| Unikátnost řešení | Inovativní přístup a originální nápady | 10 |
| Dashboard pro monitoring a logování | Přehlednost, použitelnost a funkčnost dashboardu | 15 |
| Dashboard pro interakci | Možnost uživatelského ovládání systému přes dashboard | 15 |
| Zabezpečení komunikace a autorizace | Použití zabezpečených protokolů a řízení přístupu | 10 |

**Maximální počet bodů: 100**

Hodnocení bude založeno na funkčnosti, technické správnosti a originalitě řešení.

## Doporučené Integrace pro Home Assistant

Lokální integrace a add-ony, které jsou pro tento typ projektu zvlášť vhodné:

- ESPHome
- MQTT
- Hardwario BCG
- Local Tuya
- Zigbee Home Automation (ZHA)
- Zigbee2MQTT

Další užitečné add-ony:

- VS Code Server
- Node-RED
- MariaDB

Možné externí integrace pro doplnění entit:

- Sun
- Generic Camera
- Sensor.Community
- Ping (ICMP)
- Apple HomeKit Bridge
- Google Assistant SDK
- Discord
- Minecraft Server
- Epic Games Store
- PrusaLink

## Relevantní Hardware

### Spotřebitelský Hardware

Tuya kompatibilní Wi-Fi zařízení patří mezi nejdostupnější varianty spotřebitelského hardwaru.

Poznámky:

- Pokud je to možné, preferujte zařízení s lokálním ovládáním.
- Zigbee varianty bývají dražší než Wi-Fi verze, protože komunikují přes IEEE 802.15.4 místo Wi-Fi.

### DIY Hardware s ESPHome

ESPHome umožňuje levně stavět senzory i akční členy například s použitím:

- ESP8266
- ESP32
- modulů založených na ESP-01

Příklady přímo připojitelných senzorů a akčních členů:

- displeje
- relé
- LED ovladače
- WS2812B pásky
- RFID / NFC moduly
- DC výkonové regulátory
- environmentální senzory

## Napájecí Požadavky

Návrh napájení je potřeba řešit pečlivě, zejména u zařízení postavených na ESP8266 a ESP32.

- ESP čipy běžně pracují v rozsahu `2.8V` až `3.3V`.
- V některých případech lze přímo použít dvě alkalické AA baterie.
- Vhodnou variantou může být také jeden LiFePO4 článek.
- V ostatních případech je nutné použít step-down měnič.
- Při napájení z USB nebo z Li-Ion / Li-Pol zdrojů je potřeba počítat s regulací napětí.

U vývojových desek s ESP32:

- deska obvykle obsahuje USB programovací obvod a stabilizátor z `5V` na `3.3V`
- to často stačí pro mikrokontrolér a jeden až dva nízkopříkonové senzory
- nestačí to pro energeticky náročné periferie, jako jsou motory, výkonné LED, větší počet LED nebo větší displeje

## Návrhové Principy

Projekt by měl dodržovat tyto principy:

- Home Assistant je centrální bod pro sběr dat, řízení i prezentaci informací.
- Lokální služby a protokoly mají přednost před cloudovými řešeními.
- Add-ony a integrace Home Assistantu mají přednost před externími aplikacemi.
- Implementace by měla co nejvěrněji kopírovat realitu.
- Počet zařízení, protokolů a automatizací má odpovídat velikosti týmu.
- Zabezpečení by mělo být maximalizováno na všech relevantních úrovních.

## Doporučená Struktura Repozitáře

Jakmile bude implementace růst, je vhodné držet repozitář přehledný a členěný podle odpovědností.

```text
.
├── README.md
├── docs/
│   ├── architecture/
│   ├── dashboard/
│   └── security/
├── home-assistant/
│   ├── automations/
│   ├── dashboards/
│   ├── entities/
│   └── scenes/
├── firmware/
│   ├── esphome/
│   └── mcu/
├── hardware/
│   ├── diagrams/
│   └── bill-of-materials/
└── tests/
```

## Implementační Checklist

- definovat případovou studii a její realistický scénář použití
- vybrat vhodné senzory a akční členy
- připojit všechny entity do Home Assistantu
- implementovat požadovaný počet lokálních integrací
- vytvořit požadovaný počet scén a automatizací
- připravit dashboard pro monitoring a logování
- připravit dashboard pro uživatelskou interakci
- zabezpečit komunikaci a přístup
- zdokumentovat hardwarový návrh
- otestovat chování systému a hraniční případy

## Shrnutí

Projekt má dodat realistický, bezpečný a lokálně řízený systém chytré domácnosti nebo IoT postavený na Home Assistantu. Nejsilnější řešení budou kombinovat:

- realistickou volbu hardwaru
- smysluplnou automatizační logiku
- čistou systémovou integraci
- použitelné dashboardy
- bezpečnou komunikaci
- originální a technicky kvalitní návrh
