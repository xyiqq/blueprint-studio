"""WebSocket API for Blueprint Studio."""
from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

_LOGGER = logging.getLogger(__name__)

@callback
def async_register_websockets(hass: HomeAssistant):
    """Register websocket commands."""
    _LOGGER.debug("Registering Blueprint Studio websocket commands")
    websocket_api.async_register_command(hass, websocket_subscribe_updates)
    websocket_api.async_register_command(hass, websocket_subscribe_settings)

@websocket_api.require_admin
@websocket_api.async_response
@websocket_api.websocket_command({
    vol.Required("type"): "blueprint_studio/subscribe_updates",
})
async def websocket_subscribe_updates(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]):
    """Subscribe to Blueprint Studio updates."""

    @callback
    def forward_update(event):
        """Forward custom event to websocket."""
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    # Standard subscription pattern
    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        "blueprint_studio_update", forward_update
    )

    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.async_response
@websocket_api.websocket_command({
    vol.Required("type"): "blueprint_studio/subscribe_settings",
})
async def websocket_subscribe_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]):
    """Subscribe to Blueprint Studio settings changes."""

    @callback
    def forward_settings_change(event):
        """Forward settings change event to websocket."""
        connection.send_message(websocket_api.event_message(msg["id"], {
            "type": "settings_changed",
            "data": event.data.get("settings", {})
        }))

    # Listen for settings changes
    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        "blueprint_studio_settings_changed", forward_settings_change
    )

    connection.send_result(msg["id"])
