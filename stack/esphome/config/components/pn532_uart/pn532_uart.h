#pragma once

#include "esphome/core/automation.h"
#include "esphome/core/component.h"
#include "esphome/components/uart/uart.h"

#include <string>
#include <vector>

namespace esphome {
namespace pn532_uart {

class PN532UARTTrigger;

class PN532UARTComponent : public PollingComponent, public uart::UARTDevice {
 public:
  void setup() override;
  void update() override;
  void dump_config() override;

  void register_trigger(PN532UARTTrigger *trigger) { this->triggers_.push_back(trigger); }

 protected:
  bool setup_complete_{false};
  uint32_t last_setup_attempt_ms_{0};
  uint32_t setup_attempt_count_{0};
  uint32_t last_waiting_for_card_log_ms_{0};
  bool last_wait_saw_any_bytes_{false};
  std::string last_rx_preview_;
  std::string current_uid_;
  std::vector<PN532UARTTrigger *> triggers_;

  bool try_setup_();
  void wakeup_();
  bool get_firmware_version_();
  bool sam_config_();
  bool write_command_(const std::vector<uint8_t> &payload);
  bool read_ack_(uint32_t timeout_ms);
  bool read_response_(uint8_t expected_command, std::vector<uint8_t> &payload, uint32_t timeout_ms);
  bool read_byte_timeout_(uint8_t *data, uint32_t timeout_ms);
  bool wait_for_frame_start_(uint32_t timeout_ms);
  void clear_rx_();
  void send_ack_();
  std::string format_uid_(const std::vector<uint8_t> &uid);
  std::string format_bytes_(const std::vector<uint8_t> &bytes);
};

class PN532UARTTrigger : public Trigger<std::string> {
 public:
  void process(const std::string &uid) { this->trigger(uid); }
};

}  // namespace pn532_uart
}  // namespace esphome
