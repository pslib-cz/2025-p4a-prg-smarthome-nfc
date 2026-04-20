#!/usr/bin/env python3
"""Patch HA entity_registry to expose SmartLend entities to Assist/MCP.
HA must be STOPPED before running this."""
import json
import sys

path = '/config/.storage/core.entity_registry'

EXPOSE_PREFIXES = (
    'input_select.item_',
    'input_select.system_mode',
    'input_text.last_action',
    'input_text.active_user',
    'input_boolean.quiet_mode',
    'counter.borrow_count_today',
    'sensor.smartlend_',
    'light.smartlend_',
    'script.smartlend_',
    'scene.smartlend_',
)

with open(path, 'r') as f:
    data = json.load(f)

changed = 0
touched = []
for e in data['data']['entities']:
    eid = e.get('entity_id') or ''
    if eid.startswith(EXPOSE_PREFIXES):
        opts = e.setdefault('options', {})
        conv = opts.setdefault('conversation', {})
        if conv.get('should_expose') is not True:
            conv['should_expose'] = True
            changed += 1
            touched.append(eid)

with open(path, 'w') as f:
    json.dump(data, f, indent=2)

print(f'Exposed {changed} entities:', file=sys.stderr)
for t in touched:
    print(f'  + {t}', file=sys.stderr)
