"use client";

import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";

const HA_URL = process.env.NEXT_PUBLIC_HA_URL || "https://localhost:8123";
const HA_TOKEN = process.env.NEXT_PUBLIC_HA_TOKEN || "";

let _conn: Connection | null = null;

export async function getConnection(): Promise<Connection> {
  if (_conn) return _conn;
  const auth = createLongLivedTokenAuth(HA_URL, HA_TOKEN);
  _conn = await createConnection({ auth });
  return _conn;
}

export function onEntities(cb: (entities: HassEntities) => void) {
  let unsub: (() => void) | null = null;
  (async () => {
    const conn = await getConnection();
    unsub = subscribeEntities(conn, cb);
  })();
  return () => { if (unsub) unsub(); };
}

export function onTagScanned(cb: (tagId: string) => void) {
  let unsub: (() => void) | null = null;
  (async () => {
    const conn = await getConnection();
    unsub = await conn.subscribeEvents((evt: any) => {
      const id = evt?.data?.tag_id;
      if (id) cb(id);
    }, "tag_scanned");
  })();
  return () => { if (unsub) unsub(); };
}

export async function setBorrower(name: string) {
  const conn = await getConnection();
  await conn.sendMessagePromise({
    type: "call_service",
    domain: "input_select",
    service: "select_option",
    service_data: { entity_id: "input_select.borrower", option: name },
  });
}

export async function runToggleScript(
  script: string,
  userHint: string = "",
  nfcUid: string = "",
) {
  const conn = await getConnection();
  const [domain, object] = script.split(".");
  const data: Record<string, string> = {};
  if (userHint) data.user_hint = userHint;
  if (nfcUid) data.nfc_uid = nfcUid;
  await conn.sendMessagePromise({
    type: "call_service",
    domain,
    service: object,
    service_data: data,
  });
}

export async function resetBorrowerToUnassigned() {
  return setBorrower("Unassigned");
}

// Fire-and-forget LED preview so the user sees an immediate "return mode"
// cue (dim blue) the moment they enter the confirm-return modal, before
// the toggle script runs. The final green/blue flash still comes from the
// HA smartlend_led_on_borrow automation when the state actually flips.
export async function previewLed(rgb: [number, number, number], brightnessPct = 35) {
  const conn = await getConnection();
  await conn.sendMessagePromise({
    type: "call_service",
    domain: "light",
    service: "turn_on",
    service_data: {
      entity_id: "light.smartlend_nfc_status_ring",
      rgb_color: rgb,
      brightness_pct: brightnessPct,
    },
  });
}

export async function resetAllItems() {
  const conn = await getConnection();
  await conn.sendMessagePromise({
    type: "call_service",
    domain: "script",
    service: "smartlend_reset_all",
    service_data: {},
  });
}
