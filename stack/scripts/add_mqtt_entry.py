"""Inject MQTT config entry into HA storage. HA must be STOPPED."""
import json
import uuid

path = '/config/.storage/core.config_entries'
with open(path, 'r') as f:
    data = json.load(f)

entries = data['data']['entries']
if any(e.get('domain') == 'mqtt' for e in entries):
    print('MQTT entry already present, skipping')
else:
    entry = {
        'entry_id': uuid.uuid4().hex,
        'version': 1,
        'minor_version': 2,
        'domain': 'mqtt',
        'title': 'Mosquitto local',
        'data': {
            'broker': '127.0.0.1',
            'port': 1883,
            'username': 'smartlend',
            'password': 'WXxGPikLM56lPW6fEzQAxR79XWdQNW4',
            'discovery': True,
            'discovery_prefix': 'homeassistant',
        },
        'options': {},
        'pref_disable_new_entities': False,
        'pref_disable_polling': False,
        'source': 'user',
        'unique_id': None,
        'disabled_by': None,
        'created_at': '2026-04-16T00:00:00+00:00',
        'modified_at': '2026-04-16T00:00:00+00:00',
        'discovery_keys': {},
        'subentries': [],
    }
    entries.append(entry)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print('Added MQTT entry:', entry['entry_id'])
