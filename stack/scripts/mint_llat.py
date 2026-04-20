"""Mint a long-lived access token via HA internal API.
Run as: docker exec smartlend-ha python /scripts/mint_llat.py
"""
import asyncio
import os
import sys

sys.path.insert(0, '/usr/src/homeassistant')

from homeassistant import core
from homeassistant.config import async_hass_config_yaml
from homeassistant.helpers import storage
from homeassistant.auth import auth_manager_from_config, AuthManager
from homeassistant.auth.const import GROUP_ID_ADMIN


async def main() -> None:
    hass = core.HomeAssistant('/config')
    await hass.async_start()
    try:
        users = await hass.auth.async_get_users()
        owner = next((u for u in users if u.is_owner), None)
        if not owner:
            print('no owner', file=sys.stderr)
            return
        rts = list(owner.refresh_tokens.values())
        llat = next((r for r in rts if r.token_type == 'long_lived_access_token' and r.client_name == 'smartlend-admin'), None)
        if not llat:
            llat = await hass.auth.async_create_refresh_token(
                owner,
                client_name='smartlend-admin',
                client_icon='mdi:nfc',
                token_type='long_lived_access_token',
                access_token_expiration=__import__('datetime').timedelta(days=365*10),
            )
        access = hass.auth.async_create_access_token(llat)
        print(access)
    finally:
        await hass.async_stop()


asyncio.run(main())
