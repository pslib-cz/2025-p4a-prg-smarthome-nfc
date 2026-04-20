export type ItemState = "available" | "borrowed";

export interface Item {
  id: string;            // e.g. "usb_c_cable"
  entityId: string;      // "input_select.item_usb_c_cable"
  holderEntityId: string;// "input_text.holder_usb_c_cable"
  nfcEntityId: string;   // "input_text.last_nfc_usb_c_cable"
  toggleScript: string;  // "script.smartlend_toggle_usb_c_cable"
  label: string;         // "USB-C cable"
  icon: string;          // emoji
  state: ItemState;
  holder: string;
  lastNfc: string;       // NFC UID used to borrow this item (empty if available)
}

export const ITEMS: Omit<Item, "state" | "holder" | "lastNfc">[] = [
  {
    id: "usb_c_cable",
    entityId: "input_select.item_usb_c_cable",
    holderEntityId: "input_text.holder_usb_c_cable",
    nfcEntityId: "input_text.last_nfc_usb_c_cable",
    toggleScript: "script.smartlend_toggle_usb_c_cable",
    label: "USB-C cable",
    icon: "🔌",
  },
  {
    id: "adapter",
    entityId: "input_select.item_adapter",
    holderEntityId: "input_text.holder_adapter",
    nfcEntityId: "input_text.last_nfc_adapter",
    toggleScript: "script.smartlend_toggle_adapter",
    label: "Adapter",
    icon: "🔋",
  },
  {
    id: "meter",
    entityId: "input_select.item_meter",
    holderEntityId: "input_text.holder_meter",
    nfcEntityId: "input_text.last_nfc_meter",
    toggleScript: "script.smartlend_toggle_meter",
    label: "Meter",
    icon: "📏",
  },
  {
    id: "tripod",
    entityId: "input_select.item_tripod",
    holderEntityId: "input_text.holder_tripod",
    nfcEntityId: "input_text.last_nfc_tripod",
    toggleScript: "script.smartlend_toggle_tripod",
    label: "Stativ",
    icon: "📷",
  },
  {
    id: "microphone",
    entityId: "input_select.item_microphone",
    holderEntityId: "input_text.holder_microphone",
    nfcEntityId: "input_text.last_nfc_microphone",
    toggleScript: "script.smartlend_toggle_microphone",
    label: "Mikrofon",
    icon: "🎤",
  },
  {
    id: "ring_light",
    entityId: "input_select.item_ring_light",
    holderEntityId: "input_text.holder_ring_light",
    nfcEntityId: "input_text.last_nfc_ring_light",
    toggleScript: "script.smartlend_toggle_ring_light",
    label: "Ring light",
    icon: "💡",
  },
  {
    id: "hdmi_cable",
    entityId: "input_select.item_hdmi_cable",
    holderEntityId: "input_text.holder_hdmi_cable",
    nfcEntityId: "input_text.last_nfc_hdmi_cable",
    toggleScript: "script.smartlend_toggle_hdmi_cable",
    label: "HDMI kabel",
    icon: "📺",
  },
  {
    id: "headphones",
    entityId: "input_select.item_headphones",
    holderEntityId: "input_text.holder_headphones",
    nfcEntityId: "input_text.last_nfc_headphones",
    toggleScript: "script.smartlend_toggle_headphones",
    label: "Sluchátka",
    icon: "🎧",
  },
  {
    id: "sd_reader",
    entityId: "input_select.item_sd_reader",
    holderEntityId: "input_text.holder_sd_reader",
    nfcEntityId: "input_text.last_nfc_sd_reader",
    toggleScript: "script.smartlend_toggle_sd_reader",
    label: "SD čtečka",
    icon: "💾",
  },
];

export const KNOWN_BORROWERS = ["David", "Petr", "Jana", "Adam", "Host (Guest)"];
