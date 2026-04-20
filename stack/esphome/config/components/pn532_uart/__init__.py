from esphome import automation
import esphome.codegen as cg
from esphome.components import uart
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_ON_TAG, CONF_TRIGGER_ID

DEPENDENCIES = ["uart"]
MULTI_CONF = True

pn532_uart_ns = cg.esphome_ns.namespace("pn532_uart")
PN532UARTComponent = pn532_uart_ns.class_(
    "PN532UARTComponent", cg.PollingComponent, uart.UARTDevice
)
PN532UARTTrigger = pn532_uart_ns.class_(
    "PN532UARTTrigger", automation.Trigger.template(cg.std_string)
)

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(PN532UARTComponent),
            cv.Optional(CONF_ON_TAG): automation.validate_automation(
                {
                    cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(PN532UARTTrigger),
                }
            ),
        }
    )
    .extend(cv.polling_component_schema("1s"))
    .extend(uart.UART_DEVICE_SCHEMA)
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await uart.register_uart_device(var, config)

    for conf in config.get(CONF_ON_TAG, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID])
        cg.add(var.register_trigger(trigger))
        await automation.build_automation(trigger, [(cg.std_string, "x")], conf)
