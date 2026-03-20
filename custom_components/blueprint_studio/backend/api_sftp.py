"""SFTP action dispatcher for Blueprint Studio API."""
from __future__ import annotations

import logging
import os

from aiohttp import web

from .util import json_response, json_message

_LOGGER = logging.getLogger(__name__)

# All SFTP action names
SFTP_ACTIONS = frozenset({
    "sftp_test", "sftp_list", "sftp_read", "sftp_write", "sftp_create",
    "sftp_delete", "sftp_delete_multi", "sftp_rename", "sftp_mkdir",
    "sftp_copy", "sftp_upload_folder", "sftp_download_folder",
    "sftp_serve_file",
})


async def sftp_action(sftp_manager, action: str, data: dict, hass, request=None):
    """Dispatch an SFTP action."""
    conn = data.get("connection", {})
    host = conn.get("host", "")
    port = int(conn.get("port", 22))
    username = conn.get("username", "")
    auth = conn.get("auth", {})

    if not host or not username:
        return json_message("Missing connection parameters", status_code=400)

    # --- sftp_serve_file: stream raw bytes with Range support ---
    if action == "sftp_serve_file":
        path = data.get("path")
        if not path:
            return json_message("Missing path", status_code=400)
        try:
            result = await hass.async_add_executor_job(
                sftp_manager.read_file_raw, host, port, username, auth, path
            )
            if not result.get("success"):
                return json_message(result.get("message", "Read failed"), status_code=500)

            raw_data = result["data"]
            file_size = result["size"]
            mime_type = result["mime_type"]
            filename = os.path.basename(path)

            # Parse Range header from the original request
            range_header = request.headers.get("Range") if request else None
            start = 0
            end = file_size - 1
            status_code = 200

            if range_header and range_header.startswith("bytes="):
                range_spec = range_header[6:]
                parts = range_spec.split("-")
                if parts[0]:
                    start = int(parts[0])
                if len(parts) > 1 and parts[1]:
                    end = int(parts[1])
                end = min(end, file_size - 1)
                status_code = 206

            content_length = end - start + 1
            headers = {
                "Content-Type": mime_type,
                "Content-Disposition": f'inline; filename="{filename}"',
                "Content-Length": str(content_length),
                "Accept-Ranges": "bytes",
            }
            if status_code == 206:
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

            response = web.StreamResponse(status=status_code, headers=headers)
            await response.prepare(request)
            await response.write(raw_data[start:start + content_length])
            return response
        except Exception as exc:
            _LOGGER.error("sftp_serve_file failed: %s", exc)
            return json_message(str(exc), status_code=500)

    sftp_handlers = {
        "sftp_test":   lambda: hass.async_add_executor_job(sftp_manager.test_connection, host, port, username, auth),
        "sftp_list":   lambda: hass.async_add_executor_job(sftp_manager.list_directory, host, port, username, auth, data.get("path", "/"), data.get("show_hidden", False)),
        "sftp_read":   lambda: hass.async_add_executor_job(sftp_manager.read_file, host, port, username, auth, data.get("path")) if data.get("path") else None,
        "sftp_write":  lambda: hass.async_add_executor_job(sftp_manager.write_file, host, port, username, auth, data.get("path"), data.get("content", "")) if data.get("path") else None,
        "sftp_create": lambda: hass.async_add_executor_job(sftp_manager.create_file, host, port, username, auth, data.get("path"), data.get("content", ""), data.get("overwrite", False), data.get("is_base64", False)) if data.get("path") else None,
        "sftp_delete": lambda: hass.async_add_executor_job(sftp_manager.delete_path, host, port, username, auth, data.get("path")) if data.get("path") else None,
        "sftp_delete_multi": lambda: hass.async_add_executor_job(sftp_manager.delete_multi, host, port, username, auth, data.get("paths", [])) if data.get("paths") else None,
        "sftp_rename": lambda: hass.async_add_executor_job(sftp_manager.rename_path, host, port, username, auth, data.get("source"), data.get("destination"), data.get("overwrite", False)) if data.get("source") and data.get("destination") else None,
        "sftp_copy":   lambda: hass.async_add_executor_job(sftp_manager.copy_path, host, port, username, auth, data.get("source"), data.get("destination"), data.get("overwrite", False)) if data.get("source") and data.get("destination") else None,
        "sftp_mkdir":  lambda: hass.async_add_executor_job(sftp_manager.make_directory, host, port, username, auth, data.get("path")) if data.get("path") else None,
        "sftp_upload_folder": lambda: hass.async_add_executor_job(sftp_manager.upload_folder, host, port, username, auth, data.get("path"), data.get("zip_data"), data.get("mode", "merge"), data.get("overwrite", False)) if data.get("path") and data.get("zip_data") else None,
        "sftp_download_folder": lambda: hass.async_add_executor_job(sftp_manager.download_folder, host, port, username, auth, data.get("path")) if data.get("path") else None,
    }

    # Validate required params
    if action in ("sftp_read", "sftp_write", "sftp_create", "sftp_delete", "sftp_mkdir", "sftp_upload_folder", "sftp_download_folder"):
        if not data.get("path"):
            return json_message("Missing path", status_code=400)
    elif action in ("sftp_rename", "sftp_copy"):
        if not data.get("source") or not data.get("destination"):
            return json_message("Missing source or destination", status_code=400)

    try:
        handler = sftp_handlers.get(action)
        if not handler:
            return json_message("Unknown SFTP action", status_code=400)
        result = await handler()

        status_code = result.pop("status_code", 200) if isinstance(result, dict) else 200
        return json_response(result, status_code=status_code)
    except Exception as exc:
        _LOGGER.error("SFTP action %s failed: %s", action, exc)
        return json_response({"success": False, "message": str(exc)})
