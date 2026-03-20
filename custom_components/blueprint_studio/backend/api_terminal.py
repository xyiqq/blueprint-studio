"""Terminal WebSocket and exec handlers for Blueprint Studio API."""
from __future__ import annotations

import json
import logging
import os
import signal

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

from .util import json_message, json_response
from .terminal_manager import TerminalManager

_LOGGER = logging.getLogger(__name__)


class TerminalWebSocketView(HomeAssistantView):
    """Dedicated view for terminal WebSocket connections.

    Uses requires_auth = False because browser WebSocket connections cannot
    send Authorization headers. Token is validated manually from the query
    string using hass.auth.async_validate_access_token().
    """

    url = "/api/blueprint_studio/terminal_ws"
    name = "api:blueprint_studio:terminal_ws"
    requires_auth = False

    def __init__(self) -> None:
        """Initialize the view."""
        self.terminal: TerminalManager | None = None

    async def get(self, request: web.Request) -> web.WebSocketResponse:
        """Authenticate via query-string token, then upgrade to WebSocket."""
        hass = request.app["hass"]

        # Validate token from query string
        token = request.query.get("token", "")
        if not token:
            _LOGGER.warning("Blueprint Studio: Terminal WS missing token")
            return web.Response(status=401, text="Missing token")

        # async_validate_access_token is sync despite its name (HA convention)
        refresh_token = hass.auth.async_validate_access_token(token)
        if refresh_token is None:
            _LOGGER.warning("Blueprint Studio: Terminal WS invalid token")
            return web.Response(status=401, text="Invalid token")

        user = refresh_token.user
        if not user or not user.is_active:
            return web.Response(status=401, text="User not active")
        if not user.is_admin:
            _LOGGER.warning("Blueprint Studio: Non-admin user %s attempted terminal access", user.name)
            return web.Response(status=403, text="Admin access required")

        if not self.terminal:
            self.terminal = TerminalManager(hass)
        else:
            self.terminal.hass = hass

        return await handle_terminal_ws(request, user, hass, self.terminal)


async def handle_terminal_ws(request, user, hass, terminal_manager):
    """Handle terminal WebSocket upgrade."""

    _LOGGER.debug("Blueprint Studio: Starting Terminal WebSocket for %s", user.name)
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    def cleanup_pty(pty_pid, pty_fd):
        """Helper to clean up PTY resources."""
        try:
            os.kill(pty_pid, signal.SIGTERM)
            os.waitpid(pty_pid, os.WNOHANG)
        except OSError:
            pass
        try:
            os.close(pty_fd)
        except OSError:
            pass

    async def spawn_pty(username=None, host=None, port=22, password=None, private_key=None, key_passphrase=None):
        """Spawn a PTY session - either regular shell or SSH."""
        try:
            if username and host and private_key:
                _LOGGER.info("Spawning SSH PTY with key auth for %s@%s", username, host)
                master_fd, pid = await hass.async_add_executor_job(
                    terminal_manager.spawn_ssh_pty,
                    username, host, port, None, private_key, key_passphrase
                )
            elif username and host:
                _LOGGER.info("Spawning SSH PTY with password auth for %s@%s", username, host)
                master_fd, pid = await hass.async_add_executor_job(
                    terminal_manager.spawn_ssh_pty,
                    username, host, port, password or ""
                )
            else:
                _LOGGER.debug("Blueprint Studio: Spawning regular shell PTY")
                master_fd, pid = await hass.async_add_executor_job(terminal_manager.spawn)
            return master_fd, pid
        except Exception as e:
            _LOGGER.error("Failed to spawn PTY: %s", e)
            raise

    # Initial PTY spawn
    try:
        master_fd, pid = await spawn_pty()
        _LOGGER.debug("Blueprint Studio: PTY spawned (pid %s)", pid)
    except Exception as e:
        _LOGGER.error("Failed to spawn terminal: %s", e)
        await ws.close()
        return ws

    def forward_output():
        try:
            data = os.read(master_fd, 1024)
            if data:
                try:
                    hass.async_create_task(ws.send_bytes(data))
                except Exception as e:
                    _LOGGER.warning("Failed to send terminal data to WS: %s", e)
                    hass.loop.remove_reader(master_fd)
                    hass.async_create_task(ws.close())
            else:
                _LOGGER.info("Terminal PTY EOF - shell process has exited")
                hass.loop.remove_reader(master_fd)
                hass.async_create_task(ws.close())
        except OSError as e:
            if e.errno != 5:
                _LOGGER.warning("Terminal PTY Read Error (errno %s): %s", e.errno, e)
            hass.loop.remove_reader(master_fd)
            hass.async_create_task(ws.close())
        except Exception as e:
            _LOGGER.error("Unexpected error in terminal reader: %s", e)
            hass.loop.remove_reader(master_fd)
            hass.async_create_task(ws.close())

    hass.loop.add_reader(master_fd, forward_output)
    try:
        async for msg in ws:
            try:
                if msg.type == web.WSMsgType.BINARY:
                    os.write(master_fd, msg.data)
                elif msg.type == web.WSMsgType.TEXT:
                    try:
                        # Check if this is an SSH key authentication marker
                        if msg.data.startswith("__SSH_KEY__"):
                            try:
                                json_str = msg.data[len("__SSH_KEY__"):]
                                ssh_config = json.loads(json_str)

                                old_master_fd = master_fd
                                old_pid = pid

                                hass.loop.remove_reader(old_master_fd)
                                cleanup_pty(old_pid, old_master_fd)

                                try:
                                    master_fd, pid = await spawn_pty(
                                        username=ssh_config.get('username'),
                                        host=ssh_config.get('host'),
                                        port=ssh_config.get('port', 22),
                                        private_key=ssh_config.get('privateKey'),
                                        key_passphrase=ssh_config.get('privateKeyPassphrase')
                                    )
                                    hass.loop.add_reader(master_fd, forward_output)
                                    _LOGGER.info("SSH PTY spawned successfully")
                                except Exception as spawn_error:
                                    _LOGGER.error("Failed to spawn SSH PTY: %s", spawn_error)
                                    await ws.send_str(f"Error: SSH connection failed: {str(spawn_error)}\r\n")
                                    master_fd, pid = await spawn_pty()
                                    hass.loop.add_reader(master_fd, forward_output)
                            except (json.JSONDecodeError, ValueError) as e:
                                _LOGGER.error("Invalid SSH key command format: %s", e)
                                await ws.send_str("Error: Invalid SSH authentication configuration\r\n")
                        # Check if this is an SSH password authentication marker
                        elif msg.data.startswith("__SSH_PASSWORD__"):
                            try:
                                json_str = msg.data[len("__SSH_PASSWORD__"):]
                                ssh_config = json.loads(json_str)

                                old_master_fd = master_fd
                                old_pid = pid

                                hass.loop.remove_reader(old_master_fd)
                                cleanup_pty(old_pid, old_master_fd)

                                try:
                                    master_fd, pid = await spawn_pty(
                                        username=ssh_config.get('username'),
                                        host=ssh_config.get('host'),
                                        port=ssh_config.get('port', 22),
                                        password=ssh_config.get('password')
                                    )
                                    hass.loop.add_reader(master_fd, forward_output)
                                    _LOGGER.info("SSH PTY with password spawned successfully")
                                except Exception as spawn_error:
                                    _LOGGER.error("Failed to spawn SSH PTY with password: %s", spawn_error)
                                    await ws.send_str(f"Error: SSH connection failed: {str(spawn_error)}\r\n")
                                    master_fd, pid = await spawn_pty()
                                    hass.loop.add_reader(master_fd, forward_output)
                            except (json.JSONDecodeError, ValueError) as e:
                                _LOGGER.error("Invalid SSH password command format: %s", e)
                                await ws.send_str("Error: Invalid SSH authentication configuration\r\n")
                        else:
                            # Regular input
                            data = msg.json() if isinstance(msg.data, str) else json.loads(msg.data)
                            if isinstance(data, dict):
                                if data.get('type') == 'resize':
                                    await hass.async_add_executor_job(terminal_manager.resize, master_fd, data['rows'], data['cols'])
                                elif data.get('type') == 'input':
                                    os.write(master_fd, data['data'].encode())
                                else:
                                    os.write(master_fd, msg.data.encode())
                            else:
                                os.write(master_fd, msg.data.encode())
                    except (ValueError, json.JSONDecodeError):
                        os.write(master_fd, msg.data.encode())
            except OSError as e:
                _LOGGER.warning("Terminal PTY Write Error: %s", e)
                break
            except Exception as e:
                _LOGGER.error("Unexpected error in terminal writer: %s", e)
                break
            if msg.type == web.WSMsgType.ERROR:
                _LOGGER.error('Terminal WS error: %s', ws.exception())
    finally:
        hass.loop.remove_reader(master_fd)
        cleanup_pty(pid, master_fd)
    return ws


async def terminal_exec(terminal_manager, data, user):
    """Execute a non-interactive terminal command."""
    if not terminal_manager:
        return json_message("Terminal not initialized", status_code=500)
    if not user.is_admin:
        return json_message("Unauthorized: Admin access required", status_code=403)
    result = await terminal_manager.execute_command(
        data.get("command", ""), user=user.name or "Unknown", cwd=data.get("cwd")
    )
    return json_response(result)
