"use client";

import { useEffect, useRef, useState } from "react";
import { HassEntities } from "home-assistant-js-websocket";
import { ITEMS, KNOWN_BORROWERS, Item, ItemState } from "@/lib/types";
import {
  onEntities,
  onTagScanned,
  setBorrower,
  runToggleScript,
  resetBorrowerToUnassigned,
  resetAllItems,
  previewLed,
  triggerAutomation,
} from "@/lib/ha-client";

type ModalMode = null | "identity" | "item" | "confirm-return" | "result" | "denied";
type LogEntry = {
  ts: Date;
  kind: "scan" | "borrow" | "return" | "denied" | "info" | "error";
  text: string;
};

export default function Home() {
  const [entities, setEntities] = useState<HassEntities>({});
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [entityCount, setEntityCount] = useState(0);
  const [lastTagId, setLastTagId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [pickedBorrower, setPickedBorrower] = useState<string>("");
  const [pendingReturnItem, setPendingReturnItem] = useState<Item | null>(null);
  const [resultText, setResultText] = useState<string>("");
  const [flashRed, setFlashRed] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastActionRef = useRef<string>("");
  // Mirror of `connected` for use inside stale setTimeout closures.
  const connectedRef = useRef<boolean>(false);
  // Mirror of `pickedBorrower` for use in async handlers that shouldn't
  // depend on React's batched state update arriving first.
  const pickedBorrowerRef = useRef<string>("");
  // Trace every modalMode transition with its cause, so we can see when a
  // modal flashes open and something else slams it shut.
  const modalModeRef = useRef<ModalMode>(null);
  // Pending "close result modal" timer. We track it so a new tag scan can
  // cancel it — otherwise the stale timer fires 2.5 s after a borrow and
  // slams shut the identity modal the user just opened with a new tap.
  const resultCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest computed items snapshot — used inside onTagScanned (which has
  // `[]` deps and would otherwise see the initial empty entities map).
  const itemsRef = useRef<Item[]>([]);
  // Last scanned NFC UID — threaded into the toggle script call so HA can
  // remember which card borrowed which item (used by smart-return matching).
  const lastTagIdRef = useRef<string>("");
  // Mirror of quiet_mode so onTagScanned ([] deps) can scale LED brightness
  // without re-subscribing on every state tick.
  const quietModeRef = useRef<boolean>(false);

  function addLog(kind: LogEntry["kind"], text: string) {
    setLogs((prev) => [{ ts: new Date(), kind, text }, ...prev].slice(0, 80));
    // Mirror to devtools console so we can still grep after the panel scrolls.
    // eslint-disable-next-line no-console
    console.log(`[smartlend:${kind}]`, text);
  }

  // Trace every modal change — lets us catch a modal flashing open/closed.
  useEffect(() => {
    if (modalModeRef.current !== modalMode) {
      addLog("info", `modal: ${modalModeRef.current ?? "none"} → ${modalMode ?? "none"}`);
      modalModeRef.current = modalMode;
    }
  }, [modalMode]);

  // Subscribe to entity state (with error surfacing)
  useEffect(() => {
    addLog("info", "Connecting to Home Assistant…");
    let cleanup: (() => void) | null = null;
    try {
      cleanup = onEntities((e) => {
        setEntities(e);
        setEntityCount(Object.keys(e).length);
        if (!connectedRef.current) {
          addLog("info", `WebSocket connected · ${Object.keys(e).length} entities`);
        }
        connectedRef.current = true;
        setConnected(true);
        setConnError(null);
      });
    } catch (err: any) {
      setConnError(err?.message || String(err));
      addLog("error", `Connection error: ${err?.message || err}`);
    }
    // If no entity snapshot arrives within 8s, surface that. Check the ref
    // (not the stale `connected` closure value) so we don't false-alarm when
    // the socket connected fine but React hadn't re-rendered yet.
    const t = setTimeout(() => {
      if (!connectedRef.current) {
        setConnError(
          "WebSocket didn't connect in 8s. Check NEXT_PUBLIC_HA_URL and that HA is reachable, then refresh.",
        );
        addLog("error", "WebSocket timeout — no entity snapshot in 8s");
      }
    }, 8000);
    return () => {
      clearTimeout(t);
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to NFC tag scans
  useEffect(() => {
    const unsub = onTagScanned((tagId) => {
      setLastTagId(tagId);
      lastTagIdRef.current = tagId;
      const borrowed = itemsRef.current.filter((it) => it.state === "borrowed");
      addLog(
        "scan",
        `Tag scanned: ${tagId} · was in modal=${modalModeRef.current ?? "none"} · currently borrowed=${borrowed.length}`,
      );
      // Cancel any pending "close result modal" timer from a previous
      // borrow/return — otherwise it fires mid-flow and closes whatever
      // modal the tap just opened.
      if (resultCloseTimerRef.current) {
        clearTimeout(resultCloseTimerRef.current);
        resultCloseTimerRef.current = null;
        addLog("info", "cancelled stale result-close timer");
      }

      // SMART RETURN: only trigger if the tapped card's UID matches the UID
      // recorded at borrow time. That distinguishes "re-tap the same card"
      // (the owner wants to return) from "tap a different card" (someone
      // else arriving to borrow a new item).
      const matchedBorrow = borrowed.find(
        (it) => it.lastNfc && it.lastNfc === tagId,
      );
      if (matchedBorrow && matchedBorrow.holder) {
        addLog(
          "info",
          `smart-return: UID ${tagId} matches ${matchedBorrow.label} (holder=${matchedBorrow.holder}) → skip pickers`,
        );
        setPickedBorrower(matchedBorrow.holder);
        pickedBorrowerRef.current = matchedBorrow.holder;
        setBorrower(matchedBorrow.holder).catch((err: any) =>
          addLog("error", `setBorrower failed: ${err?.message || err}`),
        );
        setPendingReturnItem(matchedBorrow);
        setModalMode("confirm-return");
        previewLed([0, 120, 255], quietModeRef.current ? 5 : 35).catch(() => {});
        return;
      }
      if (borrowed.length > 0) {
        addLog(
          "info",
          `no UID match for ${tagId} (borrowed UIDs: ${borrowed
            .map((b) => `${b.label}=${b.lastNfc || "∅"}`)
            .join(", ")}) → identity flow`,
        );
      }

      // Otherwise fall back to the classic identity → item flow (new borrow,
      // or a different card used to return / borrow something else).
      setPendingReturnItem(null);
      setPickedBorrower("");
      pickedBorrowerRef.current = "";
      setModalMode("identity");
    });
    return unsub;
  }, []);

  // Watch input_text.last_action for DENIED messages and changes
  useEffect(() => {
    const la = entities["input_text.last_action"]?.state ?? "";
    if (la && la !== lastActionRef.current) {
      lastActionRef.current = la;
      if (la.includes("DENIED")) {
        setResultText(la);
        setModalMode("denied");
        setFlashRed(true);
        addLog("denied", la);
        setTimeout(() => setFlashRed(false), 1500);
        setTimeout(() => {
          setModalMode(null);
          resetBorrowerToUnassigned();
        }, 3500);
      } else if (la.includes("borrowed")) {
        addLog("borrow", la);
      } else if (la.includes("returned")) {
        addLog("return", la);
      } else if (la.includes("Quiet mode")) {
        addLog("info", la);
      }
    }
  }, [entities["input_text.last_action"]?.state]);

  // Build item list from entities
  const items: Item[] = ITEMS.map((base) => ({
    ...base,
    state: (entities[base.entityId]?.state as ItemState) ?? "available",
    holder: entities[base.holderEntityId]?.state ?? "",
    lastNfc: entities[base.nfcEntityId]?.state ?? "",
  }));
  itemsRef.current = items;

  const borrowCount = entities["counter.borrow_count_today"]?.state ?? "—";
  const lastAction = entities["input_text.last_action"]?.state ?? "Idle";
  const borrower = entities["input_select.borrower"]?.state ?? "Unassigned";
  const espTemp = entities["sensor.smartlend_nfc_esp_internal_temperature"]?.state;
  const wifiSig = entities["sensor.smartlend_nfc_wifi_signal"]?.state;
  const quietMode = entities["input_boolean.quiet_mode"]?.state === "on";
  quietModeRef.current = quietMode;
  const sunState = entities["sun.sun"]?.state;

  async function handlePickIdentity(name: string) {
    addLog("info", `handlePickIdentity: ${name}`);
    setPickedBorrower(name);
    pickedBorrowerRef.current = name;
    try {
      await setBorrower(name);
      addLog("info", `✓ input_select.borrower → ${name}`);
    } catch (err: any) {
      addLog("error", `setBorrower failed: ${err?.message || err}`);
      return;
    }
    setModalMode("item");
  }

  async function handlePickItem(item: Item) {
    const who = pickedBorrowerRef.current || pickedBorrower;
    addLog(
      "info",
      `handlePickItem: ${item.label} · state=${item.state} · holder=${item.holder || "—"} · picked=${who || "(empty!)"}`,
    );
    if (item.state === "borrowed") {
      setPendingReturnItem(item);
      setModalMode("confirm-return");
      // Scale brightness by quiet_mode so we don't blast the LED at night.
      const b = quietMode ? 5 : 35;
      previewLed([0, 120, 255], b)
        .then(() => addLog("info", `previewLed(blue) at ${b}% ok`))
        .catch((err: any) => addLog("error", `previewLed failed: ${err?.message || err}`));
      return;
    }
    // Available → borrow directly.
    const uid = lastTagIdRef.current;
    try {
      addLog("info", `→ runToggleScript(${item.toggleScript}, hint="${who}", uid="${uid}") [BORROW]`);
      await runToggleScript(item.toggleScript, who, uid);
      addLog("borrow", `✓ script dispatched: ${item.label} by ${who}`);
    } catch (err: any) {
      addLog("error", `BORROW script failed: ${err?.message || err}`);
      return;
    }
    setResultText(`✅ ${item.label} půjčeno komu: ${who}`);
    setModalMode("result");
    resultCloseTimerRef.current = setTimeout(() => {
      resultCloseTimerRef.current = null;
      // Only close if still on the result modal — a tag tap in-between may
      // have already advanced us to "identity" and we must NOT clobber that.
      if (modalModeRef.current === "result") {
        setModalMode(null);
        setPickedBorrower("");
        pickedBorrowerRef.current = "";
        resetBorrowerToUnassigned();
      } else {
        addLog("info", "result timer fired but modal moved on — no-op");
      }
    }, 2500);
  }

  async function handleConfirmReturn() {
    const who = pickedBorrowerRef.current || pickedBorrower;
    addLog(
      "info",
      `handleConfirmReturn · pending=${pendingReturnItem?.label || "NONE"} · picked=${who || "(empty!)"}`,
    );
    if (!pendingReturnItem) {
      addLog("error", "handleConfirmReturn: pendingReturnItem is null — aborting");
      return;
    }
    const item = pendingReturnItem;
    const uid = lastTagIdRef.current;
    try {
      addLog("info", `→ runToggleScript(${item.toggleScript}, hint="${who}", uid="${uid}") [RETURN]`);
      await runToggleScript(item.toggleScript, who, uid);
      addLog("return", `✓ script dispatched: return ${item.label} by ${who}`);
    } catch (err: any) {
      addLog("error", `RETURN script failed: ${err?.message || err}`);
      return;
    }
    setResultText(`↩️ ${item.label} vráceno od: ${who}`);
    setModalMode("result");
    setPendingReturnItem(null);
    resultCloseTimerRef.current = setTimeout(() => {
      resultCloseTimerRef.current = null;
      if (modalModeRef.current === "result") {
        setModalMode(null);
        setPickedBorrower("");
        pickedBorrowerRef.current = "";
        resetBorrowerToUnassigned();
      } else {
        addLog("info", "result timer fired but modal moved on — no-op");
      }
    }, 2500);
  }

  async function handleResetAll() {
    if (!confirm("Opravdu RESETOVAT všechny položky na 'available'?")) return;
    await resetAllItems();
    addLog("info", "🔄 Reset all items");
  }

  async function handleSunTest(kind: "sunset" | "sunrise") {
    const automationId =
      kind === "sunset"
        ? "automation.smartlend_quiet_mode_on_after_sunset"
        : "automation.smartlend_quiet_mode_off_at_sunrise";
    addLog("info", `🖱 Demo ${kind} → ${automationId}`);
    try {
      await triggerAutomation(automationId);
    } catch (err: any) {
      addLog("error", `Demo ${kind} failed: ${err?.message || err}`);
    }
  }

  function handleCancel() {
    addLog("info", `Cancel from modal=${modalMode ?? "none"}`);
    setModalMode(null);
    setPickedBorrower("");
    pickedBorrowerRef.current = "";
    setPendingReturnItem(null);
    resetBorrowerToUnassigned();
  }

  return (
    <main
      className={`relative w-screen h-screen transition-colors duration-200 ${
        flashRed ? "bg-red-900/70 animate-pulse-danger" : ""
      }`}
    >
      <div className="absolute inset-0 flex flex-col p-6 gap-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-4xl">📟</div>
            <div>
              <h1 className="text-3xl font-bold">SmartLend</h1>
              <p className="text-sm text-gray-400">NFC lending library — real-time kiosk</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">Borrows today</div>
              <div className="text-3xl font-bold text-warn">{borrowCount}</div>
            </div>
            {espTemp && (
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase">ESP temp</div>
                <div className="text-xl font-semibold text-gray-300">{parseFloat(espTemp).toFixed(1)}°C</div>
              </div>
            )}
            {wifiSig && (
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase">WiFi</div>
                <div className="text-xl font-semibold text-gray-300">{parseFloat(wifiSig).toFixed(0)} dBm</div>
              </div>
            )}
            <div className="text-right" title={`sun.sun = ${sunState ?? "unknown"}`}>
              <div className="text-xs text-gray-400 uppercase">Režim</div>
              <div className={`text-xl font-semibold ${quietMode ? "text-info" : "text-ok"}`}>
                {quietMode ? "🌙 Quiet" : "☀️ Active"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  connected ? "bg-ok" : "bg-danger"
                } animate-pulse`}
              />
              <span className="text-xs text-gray-400">
                {connected ? `HA · ${entityCount} ent` : "offline"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSunTest("sunset")}
                className="px-3 py-2 rounded-lg bg-info/15 border border-info/40 text-info text-sm font-semibold hover:bg-info/25 transition"
                title="Demo: trigger the sunset automation (enables quiet_mode)"
              >
                🌙 Západ
              </button>
              <button
                onClick={() => handleSunTest("sunrise")}
                className="px-3 py-2 rounded-lg bg-warn/15 border border-warn/40 text-warn text-sm font-semibold hover:bg-warn/25 transition"
                title="Demo: trigger the sunrise automation (disables quiet_mode)"
              >
                ☀️ Východ
              </button>
              <button
                onClick={handleResetAll}
                className="px-4 py-2 rounded-lg bg-warn/20 border border-warn/40 text-warn text-sm font-semibold hover:bg-warn/30 transition"
                title="Reset all items to available"
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </header>

        {/* Connection error banner */}
        {connError && (
          <div className="bg-danger/20 border border-danger/50 text-danger rounded-lg p-4">
            <div className="font-semibold">⚠️ Připojení k HA selhalo</div>
            <div className="text-sm text-gray-300 mt-1">{connError}</div>
            <div className="text-xs text-gray-400 mt-2">
              1. Otevři <a className="underline" href="https://localhost:8123" target="_blank">https://localhost:8123</a> → Advanced → Proceed (přijmi self-signed cert)
              <br />2. Refresh této stránky (Ctrl+Shift+R)
            </div>
          </div>
        )}

        {/* Main layout: Hero + Items + Activity log */}
        <div className="flex-1 grid grid-cols-[1fr_340px] gap-4 min-h-0">
          {/* Left: Hero + items */}
          <div className="flex flex-col gap-4 min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-7xl mb-6 animate-fade-in">👋</div>
              <h2 className="text-4xl font-bold mb-3">Přilož NFC kartu ke čtečce</h2>
              <p className="text-lg text-gray-400">
                {borrower === "Unassigned"
                  ? "Systém je připravený — po přiložení vyber sebe a položku."
                  : `Vybráno: ${borrower}`}
              </p>
              <p className="text-sm text-gray-500 mt-3 max-w-2xl">
                Last action: <span className="text-gray-300">{lastAction}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Right: Reservations + Activity log */}
          <aside className="flex flex-col gap-4 min-h-0">
            {/* Currently borrowed */}
            <div className="bg-panel rounded-xl border border-border p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">🔒 Aktuálně půjčeno</h3>
                <span className="text-xs text-gray-500">
                  {items.filter((i) => i.state === "borrowed").length} / {items.length}
                </span>
              </div>
              {items.filter((i) => i.state === "borrowed").length === 0 ? (
                <div className="text-gray-500 text-xs py-2">
                  Nikdo si nic nepůjčil — všechno je k dispozici.
                </div>
              ) : (
                <ul className="space-y-2">
                  {items
                    .filter((i) => i.state === "borrowed")
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg bg-danger/5 border border-danger/30 px-3 py-2"
                      >
                        <span className="text-2xl">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{item.label}</div>
                          <div className="text-xs text-gray-400 truncate">
                            Drží:{" "}
                            <span className="text-danger font-medium">
                              {item.holder || "?"}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Activity log */}
            <div className="bg-panel rounded-xl border border-border p-4 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">📜 Activity log</h3>
                <span className="text-xs text-gray-500">live</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 text-sm">
                {logs.length === 0 && (
                  <div className="text-gray-500 text-xs">Čeká se na aktivitu…</div>
                )}
                {logs.map((l, i) => (
                  <div key={i} className="flex gap-2 animate-slide-up">
                    <span className="text-xs text-gray-500 font-mono tabular-nums w-14">
                      {l.ts.toLocaleTimeString("cs-CZ", { hour12: false })}
                    </span>
                    <span className="text-base">{iconFor(l.kind)}</span>
                    <span
                      className={`${
                        l.kind === "denied" || l.kind === "error"
                          ? "text-danger"
                          : l.kind === "borrow"
                            ? "text-ok"
                            : l.kind === "return"
                              ? "text-info"
                              : l.kind === "scan"
                                ? "text-accent"
                                : "text-gray-300"
                      } flex-1`}
                    >
                      {l.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Modals */}
      {modalMode === "identity" && (
        <Modal
          title="Kdo jsi?"
          subtitle={`Detekován tag: ${lastTagId}`}
          onCancel={handleCancel}
        >
          <div className="grid grid-cols-2 gap-3">
            {KNOWN_BORROWERS.map((name) => (
              <button
                key={name}
                onClick={() => {
                  addLog("info", `🖱 Identity button: ${name}`);
                  handlePickIdentity(name);
                }}
                className="px-6 py-5 rounded-xl bg-panel border border-border hover:border-accent hover:bg-accent/10 transition text-lg font-semibold"
              >
                {name}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modalMode === "item" && (
        <Modal
          title={`${pickedBorrower}, co si půjčuješ?`}
          subtitle="Vyber položku (nebo počkej a přilož další tag)"
          onCancel={handleCancel}
        >
          <div className="grid grid-cols-1 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  addLog("info", `🖱 Item button: ${item.label} (${item.state})`);
                  handlePickItem(item);
                }}
                className={`px-6 py-5 rounded-xl border transition text-left ${
                  item.state === "borrowed"
                    ? "bg-danger/10 border-danger/50"
                    : "bg-panel border-border hover:border-ok"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{item.icon}</span>
                    <div>
                      <div className="text-lg font-semibold">{item.label}</div>
                      <div className="text-sm text-gray-400">
                        {item.state === "available"
                          ? "🟢 Dostupné — klikni pro půjčení"
                          : `🔴 Drží: ${item.holder || "?"} — ${
                              item.holder === pickedBorrower
                                ? "klikni pro vrácení"
                                : "nemůžeš vrátit"
                            }`}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modalMode === "confirm-return" && pendingReturnItem && (
        <Modal
          title={`↩️ Vrátit: ${pendingReturnItem.label}?`}
          subtitle={
            pendingReturnItem.holder === pickedBorrower
              ? `Máš tuto položku půjčenou. Klikni Vrátit pro potvrzení.`
              : `⚠️ Tato položka je půjčená od: ${pendingReturnItem.holder}. Jen ${pendingReturnItem.holder} ji může vrátit (jinak bude DENIED).`
          }
          onCancel={handleCancel}
        >
          <div className="flex flex-col gap-4">
            <div className={`p-6 rounded-xl border ${pendingReturnItem.holder === pickedBorrower ? "bg-info/10 border-info/40" : "bg-danger/10 border-danger/40"}`}>
              <div className="flex items-center gap-4">
                <div className="text-5xl">{pendingReturnItem.icon}</div>
                <div>
                  <div className="text-xl font-bold">{pendingReturnItem.label}</div>
                  <div className="text-sm text-gray-400">
                    Drží: <span className="text-danger">{pendingReturnItem.holder || "?"}</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Vrací: <span className={pendingReturnItem.holder === pickedBorrower ? "text-ok" : "text-danger"}>{pickedBorrower}</span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                addLog("info", "🖱 VRÁTIT button clicked");
                handleConfirmReturn();
              }}
              className="px-8 py-6 rounded-xl bg-info/20 hover:bg-info/30 border-2 border-info text-info font-bold text-xl transition"
            >
              ↩️ VRÁTIT (flash modrá)
            </button>
          </div>
        </Modal>
      )}

      {modalMode === "result" && (
        <Modal title={resultText} subtitle="" onCancel={null}>
          <div className="text-center text-6xl py-8">🎉</div>
          <p className="text-center text-gray-400">Okno se zavře za 2 sekundy…</p>
        </Modal>
      )}

      {modalMode === "denied" && (
        <Modal title="🚫 Zamítnuto" subtitle="" onCancel={null}>
          <div className="text-center text-6xl py-4">⛔</div>
          <p className="text-center text-danger font-semibold">{resultText}</p>
        </Modal>
      )}
    </main>
  );
}

function iconFor(kind: LogEntry["kind"]) {
  switch (kind) {
    case "scan": return "🔹";
    case "borrow": return "🟢";
    case "return": return "🔵";
    case "denied": return "🚫";
    case "error": return "⚠️";
    default: return "ℹ️";
  }
}

function ItemCard({ item }: { item: Item }) {
  const isBorrowed = item.state === "borrowed";
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        isBorrowed ? "bg-danger/5 border-danger/40" : "bg-panel border-border"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-3xl">{item.icon}</div>
        <div
          className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            isBorrowed ? "bg-danger/20 text-danger" : "bg-ok/20 text-ok"
          }`}
        >
          {isBorrowed ? "borrowed" : "available"}
        </div>
      </div>
      <div className="text-lg font-semibold">{item.label}</div>
      {isBorrowed && (
        <div className="text-sm text-gray-400 mt-1">
          Drží: <span className="text-danger font-medium">{item.holder || "?"}</span>
        </div>
      )}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onCancel,
  children,
}: {
  title: string;
  subtitle: string;
  onCancel: null | (() => void);
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in z-20">
      <div className="bg-panel rounded-2xl border border-border p-8 max-w-2xl w-full shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-bold mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-400 mb-5">{subtitle}</p>}
        {children}
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-6 w-full py-3 rounded-lg bg-border/50 hover:bg-border text-sm text-gray-300 transition"
          >
            Zrušit
          </button>
        )}
      </div>
    </div>
  );
}
