#include "pn532_uart.h"
#include "esphome/core/log.h"

#include <cstdio>

namespace esphome {
namespace pn532_uart {

static const char *const TAG = "pn532_uart";

static const uint8_t PN532_HOST_TO_CHIP = 0xD4;
static const uint8_t PN532_CHIP_TO_HOST = 0xD5;
static const uint8_t PN532_CMD_GET_FIRMWARE_VERSION = 0x02;
static const uint8_t PN532_CMD_SAM_CONFIGURATION = 0x14;
static const uint8_t PN532_CMD_IN_LIST_PASSIVE_TARGET = 0x4A;

void PN532UARTComponent::setup() {
  ESP_LOGI(TAG, "Starting PN532 UART/HSU reader");
  ESP_LOGI(TAG, "Expected wiring: NFC TXD -> ESP GPIO5/RX, NFC RXD -> ESP GPIO6/TX, NFC VCC -> ESP 3V3, NFC GND -> ESP GND");
  ESP_LOGI(TAG, "Expected NFC mode: HSU/UART, switch/channel 1 OFF and switch/channel 2 OFF (0 0), baud 115200");
  this->try_setup_();
}

bool PN532UARTComponent::try_setup_() {
  this->last_setup_attempt_ms_ = millis();
  this->setup_attempt_count_++;
  ESP_LOGD(TAG, "Trying PN532 UART handshake attempt #%u at 115200 baud", this->setup_attempt_count_);
  this->clear_rx_();
  this->wakeup_();

  if (!this->get_firmware_version_()) {
    ESP_LOGW(TAG, "PN532 did not answer on UART. Check HSU/UART mode 0 0, TXD/RXD, VCC and GND.");
    if (!this->last_wait_saw_any_bytes_) {
      ESP_LOGW(TAG, "Diagnostic: ESP transmitted a PN532 command, but RX saw 0 bytes. This points to mode/wiring/power, not Home Assistant.");
    } else {
      ESP_LOGW(TAG, "Diagnostic: ESP received bytes, but not a valid PN532 frame: %s", this->last_rx_preview_.c_str());
    }
    this->status_set_warning();
    return false;
  }

  if (!this->sam_config_()) {
    ESP_LOGW(TAG, "PN532 SAM configuration failed");
    this->status_set_warning();
    return false;
  }

  this->setup_complete_ = true;
  this->status_clear_warning();
  this->status_clear_error();
  ESP_LOGI(TAG, "PN532 UART reader ready");
  ESP_LOGI(TAG, "Ready for scan: touch the white card or sticker directly on the red PN532 antenna area.");
  return true;
}

void PN532UARTComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "PN532 UART:");
  LOG_UPDATE_INTERVAL(this);
  ESP_LOGCONFIG(TAG, "  State: %s", this->setup_complete_ ? "ready" : "waiting for PN532 response");
  ESP_LOGCONFIG(TAG, "  UART mode expected: HSU/UART 115200, switch/channel 1 OFF, switch/channel 2 OFF");
  ESP_LOGCONFIG(TAG, "  Wiring expected: NFC TXD -> ESP GPIO5/RX, NFC RXD -> ESP GPIO6/TX, VCC -> 3V3, GND -> GND");
}

void PN532UARTComponent::update() {
  if (!this->setup_complete_) {
    if (millis() - this->last_setup_attempt_ms_ > 3000)
      this->try_setup_();
    return;
  }

  if (!this->write_command_({PN532_CMD_IN_LIST_PASSIVE_TARGET, 0x01, 0x00})) {
    ESP_LOGW(TAG, "Could not request tag scan");
    this->status_set_warning();
    return;
  }

  std::vector<uint8_t> response;
  if (!this->read_response_(PN532_CMD_IN_LIST_PASSIVE_TARGET + 1, response, 650)) {
    this->send_ack_();
    if (!this->current_uid_.empty()) {
      ESP_LOGD(TAG, "Tag removed");
      this->current_uid_.clear();
    } else if (millis() - this->last_waiting_for_card_log_ms_ > 5000) {
      this->last_waiting_for_card_log_ms_ = millis();
      ESP_LOGD(TAG, "Reader ready, no NFC card detected yet");
    }
    return;
  }

  if (response.empty() || response[0] != 1) {
    if (!this->current_uid_.empty()) {
      ESP_LOGD(TAG, "Tag removed");
      this->current_uid_.clear();
    }
    return;
  }

  if (response.size() < 6) {
    ESP_LOGW(TAG, "Invalid passive target response");
    return;
  }

  uint8_t uid_length = response[5];
  if (uid_length == 0 || uid_length > 10 || response.size() < 6 + uid_length) {
    ESP_LOGW(TAG, "Invalid UID length from PN532: %u", uid_length);
    return;
  }

  std::vector<uint8_t> uid(response.begin() + 6, response.begin() + 6 + uid_length);
  std::string uid_text = this->format_uid_(uid);
  if (uid_text == this->current_uid_)
    return;

  this->current_uid_ = uid_text;
  this->status_clear_warning();
  ESP_LOGI(TAG, "Scanned NFC tag: %s", uid_text.c_str());
  for (auto *trigger : this->triggers_)
    trigger->process(uid_text);
}

void PN532UARTComponent::wakeup_() {
  static const uint8_t wakeup[] = {0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  ESP_LOGD(TAG, "TX wakeup: %s", this->format_bytes_(std::vector<uint8_t>(wakeup, wakeup + sizeof(wakeup))).c_str());
  this->write_array(wakeup, sizeof(wakeup));
  this->flush();
  delay(150);
  this->clear_rx_();
}

bool PN532UARTComponent::get_firmware_version_() {
  if (!this->write_command_({PN532_CMD_GET_FIRMWARE_VERSION}))
    return false;

  std::vector<uint8_t> response;
  if (!this->read_response_(PN532_CMD_GET_FIRMWARE_VERSION + 1, response, 1000))
    return false;

  if (response.size() < 4)
    return false;

  ESP_LOGD(TAG, "Firmware response payload: %s", this->format_bytes_(response).c_str());
  ESP_LOGI(TAG, "Found PN5%02X firmware %u.%u", response[0], response[1], response[2]);
  return true;
}

bool PN532UARTComponent::sam_config_() {
  if (!this->write_command_({PN532_CMD_SAM_CONFIGURATION, 0x01, 0x14, 0x01}))
    return false;

  std::vector<uint8_t> response;
  return this->read_response_(PN532_CMD_SAM_CONFIGURATION + 1, response, 1000);
}

bool PN532UARTComponent::write_command_(const std::vector<uint8_t> &payload) {
  this->clear_rx_();

  std::vector<uint8_t> frame;
  frame.reserve(payload.size() + 8);
  frame.push_back(0x00);
  frame.push_back(0x00);
  frame.push_back(0xFF);

  uint8_t length = payload.size() + 1;
  frame.push_back(length);
  frame.push_back(static_cast<uint8_t>(~length + 1));

  frame.push_back(PN532_HOST_TO_CHIP);
  uint8_t checksum = PN532_HOST_TO_CHIP;
  for (uint8_t value : payload) {
    frame.push_back(value);
    checksum += value;
  }

  frame.push_back(static_cast<uint8_t>(~checksum + 1));
  frame.push_back(0x00);

  this->write_array(frame);
  this->flush();
  ESP_LOGD(TAG, "TX command 0x%02X payload: %s", payload.empty() ? 0 : payload[0],
           this->format_bytes_(payload).c_str());
  ESP_LOGD(TAG, "TX command 0x%02X frame: %s", payload.empty() ? 0 : payload[0], this->format_bytes_(frame).c_str());
  return this->read_ack_(1000);
}

bool PN532UARTComponent::read_ack_(uint32_t timeout_ms) {
  if (!this->wait_for_frame_start_(timeout_ms)) {
    ESP_LOGW(TAG, "RX ACK timeout: no PN532 frame start");
    return false;
  }

  uint8_t length;
  uint8_t lcs;
  uint8_t postamble;
  if (!this->read_byte_timeout_(&length, timeout_ms) || !this->read_byte_timeout_(&lcs, timeout_ms) ||
      !this->read_byte_timeout_(&postamble, timeout_ms)) {
    ESP_LOGW(TAG, "RX ACK incomplete");
    return false;
  }

  if (length == 0x00 && lcs == 0xFF && postamble == 0x00) {
    ESP_LOGD(TAG, "RX ACK OK");
    return true;
  }

  ESP_LOGW(TAG, "RX ACK invalid bytes: %02X %02X %02X", length, lcs, postamble);
  return false;
}

bool PN532UARTComponent::read_response_(uint8_t expected_command, std::vector<uint8_t> &payload, uint32_t timeout_ms) {
  const uint32_t start = millis();

  while (millis() - start < timeout_ms) {
    if (!this->wait_for_frame_start_(timeout_ms - (millis() - start))) {
      ESP_LOGD(TAG, "RX response timeout waiting for command 0x%02X", expected_command);
      return false;
    }

    uint8_t length;
    uint8_t lcs;
    if (!this->read_byte_timeout_(&length, timeout_ms) || !this->read_byte_timeout_(&lcs, timeout_ms)) {
      ESP_LOGW(TAG, "RX response incomplete length/checksum");
      return false;
    }

    if (length == 0x00 && lcs == 0xFF) {
      uint8_t postamble;
      this->read_byte_timeout_(&postamble, timeout_ms);
      ESP_LOGD(TAG, "RX skipped ACK while waiting for response");
      continue;
    }

    if (static_cast<uint8_t>(length + lcs) != 0x00) {
      ESP_LOGW(TAG, "RX response invalid length checksum: len=%02X lcs=%02X", length, lcs);
      return false;
    }

    std::vector<uint8_t> data(length);
    for (uint8_t &value : data) {
      if (!this->read_byte_timeout_(&value, timeout_ms)) {
        ESP_LOGW(TAG, "RX response incomplete data");
        return false;
      }
    }

    uint8_t checksum;
    uint8_t postamble;
    if (!this->read_byte_timeout_(&checksum, timeout_ms) || !this->read_byte_timeout_(&postamble, timeout_ms)) {
      ESP_LOGW(TAG, "RX response incomplete checksum/postamble");
      return false;
    }

    uint8_t sum = checksum;
    for (uint8_t value : data)
      sum += value;
    if (sum != 0x00 || postamble != 0x00) {
      ESP_LOGW(TAG, "RX response invalid checksum/postamble: data=%s checksum=%02X postamble=%02X",
               this->format_bytes_(data).c_str(), checksum, postamble);
      return false;
    }

    if (data.size() < 2 || data[0] != PN532_CHIP_TO_HOST || data[1] != expected_command) {
      ESP_LOGW(TAG, "RX response unexpected command: expected=0x%02X data=%s", expected_command,
               this->format_bytes_(data).c_str());
      return false;
    }

    ESP_LOGD(TAG, "RX response command 0x%02X payload: %s", expected_command,
             this->format_bytes_(std::vector<uint8_t>(data.begin() + 2, data.end())).c_str());
    payload.assign(data.begin() + 2, data.end());
    return true;
  }

  return false;
}

bool PN532UARTComponent::read_byte_timeout_(uint8_t *data, uint32_t timeout_ms) {
  const uint32_t start = millis();
  while (millis() - start < timeout_ms) {
    if (this->available() > 0 && this->read_byte(data))
      return true;
    yield();
    delay(1);
  }
  return false;
}

bool PN532UARTComponent::wait_for_frame_start_(uint32_t timeout_ms) {
  const uint32_t start = millis();
  uint8_t a = 0xFF;
  uint8_t b = 0xFF;
  uint8_t c = 0xFF;
  std::vector<uint8_t> seen;

  while (millis() - start < timeout_ms) {
    if (!this->read_byte_timeout_(&c, timeout_ms - (millis() - start))) {
      this->last_wait_saw_any_bytes_ = !seen.empty();
      this->last_rx_preview_ = this->format_bytes_(seen);
      ESP_LOGD(TAG, "RX frame start timeout. Bytes seen: %s", this->last_rx_preview_.c_str());
      return false;
    }
    if (seen.size() < 32)
      seen.push_back(c);
    if (a == 0x00 && b == 0x00 && c == 0xFF) {
      this->last_wait_saw_any_bytes_ = true;
      this->last_rx_preview_ = this->format_bytes_(seen);
      ESP_LOGD(TAG, "RX frame start found after bytes: %s", this->last_rx_preview_.c_str());
      return true;
    }
    a = b;
    b = c;
  }

  this->last_wait_saw_any_bytes_ = !seen.empty();
  this->last_rx_preview_ = this->format_bytes_(seen);
  ESP_LOGD(TAG, "RX frame start timeout. Bytes seen: %s", this->last_rx_preview_.c_str());
  return false;
}

void PN532UARTComponent::clear_rx_() {
  uint8_t ignored;
  std::vector<uint8_t> discarded;
  while (this->available() > 0) {
    this->read_byte(&ignored);
    if (discarded.size() < 32)
      discarded.push_back(ignored);
  }
  if (!discarded.empty())
    ESP_LOGD(TAG, "RX discarded before command: %s", this->format_bytes_(discarded).c_str());
}

void PN532UARTComponent::send_ack_() {
  static const uint8_t ack[] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
  this->write_array(ack, sizeof(ack));
  this->flush();
}

std::string PN532UARTComponent::format_uid_(const std::vector<uint8_t> &uid) {
  std::string out;
  char part[4];
  for (size_t i = 0; i < uid.size(); i++) {
    if (i > 0)
      out += "-";
    std::snprintf(part, sizeof(part), "%02X", uid[i]);
    out += part;
  }
  return out;
}

std::string PN532UARTComponent::format_bytes_(const std::vector<uint8_t> &bytes) {
  std::string out;
  char part[4];
  for (size_t i = 0; i < bytes.size(); i++) {
    if (i > 0)
      out += " ";
    std::snprintf(part, sizeof(part), "%02X", bytes[i]);
    out += part;
  }
  return out.empty() ? "(none)" : out;
}

}  // namespace pn532_uart
}  // namespace esphome
