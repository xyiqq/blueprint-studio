"""Utility functions for Blueprint Studio."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from aiohttp import web

_LOGGER = logging.getLogger(__name__)

def json_response(data: Any, status_code: int = 200) -> web.Response:
    """Return a JSON response."""
    return web.json_response(data, status=status_code)

def json_message(message: str, success: bool = False, status_code: int = 200) -> web.Response:
    """Return a JSON message response."""
    return web.json_response({"success": success, "message": message}, status=status_code)

def is_path_safe(config_dir: Path, path: str) -> bool:
    """Check if the path is safe (no path traversal).

    Args:
        config_dir: The base configuration directory
        path: The path to check

    Returns:
        True if the path is safe to access, False otherwise
    """
    try:
        full_path = (config_dir / path.lstrip("/")).resolve()
        # Must be within config_dir
        return full_path.is_relative_to(config_dir)
    except (ValueError, OSError):
        return False

def get_safe_path(config_dir: Path, path: str) -> Path | None:
    """Get a safe, resolved path.

    Args:
        config_dir: The base configuration directory
        path: The path to resolve

    Returns:
        Resolved Path if safe, None otherwise
    """
    if not is_path_safe(config_dir, path):
        _LOGGER.warning(
            "Path blocked by safety check: %s (config_dir: %s)",
            path, config_dir
        )
        return None

    full_path = (config_dir / path.lstrip("/")).resolve()
    _LOGGER.debug("Resolved safe path: %s -> %s", path, full_path)
    return full_path


# ============================================================================
# COMPRESSION UTILITIES - Reduce repetitive patterns across codebase
# ============================================================================

class ActionDispatcher:
    """Base class for action routing - eliminates if/elif chains."""

    def __init__(self):
        self.actions: dict[str, Callable] = {}

    def register(self, action: str, handler: Callable) -> None:
        """Register an action handler."""
        self.actions[action] = handler

    async def dispatch(self, action: str, *args, **kwargs) -> web.Response:
        """Dispatch action to registered handler or return error."""
        handler = self.actions.get(action)
        if not handler:
            return json_message("Unknown action", status_code=400)
        try:
            return await handler(*args, **kwargs) if asyncio.iscoroutinefunction(handler) else handler(*args, **kwargs)
        except Exception as err:
            _LOGGER.error("Action %s failed: %s", action, err)
            return json_message(f"Action failed: {str(err)}", status_code=500)


@asynccontextmanager
async def safe_async_executor(operation: str):
    """Context manager for safe async execution with unified error handling."""
    try:
        yield
    except Exception as err:
        _LOGGER.error("%s failed: %s", operation, err)
        raise


def validate_file_path(config_dir: Path, allowed_check: Callable = None):
    """Decorator to validate and resolve file paths - eliminates 18 repetitions."""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(self, path: str, *args, **kwargs):
            safe_path = get_safe_path(config_dir, path)
            if not safe_path:
                return json_message("Path not found or unsafe", status_code=404)
            if allowed_check and not allowed_check(safe_path):
                return json_message("File type not allowed", status_code=403)
            return await func(self, safe_path, *args, **kwargs)

        @wraps(func)
        def sync_wrapper(self, path: str, *args, **kwargs):
            safe_path = get_safe_path(config_dir, path)
            if not safe_path:
                return json_message("Path not found or unsafe", status_code=404)
            if allowed_check and not allowed_check(safe_path):
                return json_message("File type not allowed", status_code=403)
            return func(self, safe_path, *args, **kwargs)

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator


class CredentialManager:
    """Mixin to consolidate credential handling logic - eliminates 40 lines of duplication."""

    def _credential_key(self, provider: str = "github") -> str:
        """Get credential storage key for provider."""
        return f"{provider}_credentials"

    def _get_provider_creds(self, data: dict, provider: str = "github") -> dict:
        """Get credentials for a provider."""
        return data.get(self._credential_key(provider), {})

    def _set_provider_creds(self, data: dict, creds: dict, provider: str = "github") -> None:
        """Set credentials for a provider."""
        data[self._credential_key(provider)] = creds

    def _clear_provider_creds(self, data: dict, provider: str = "github") -> None:
        """Clear credentials for a provider."""
        data.pop(self._credential_key(provider), None)


class ResponseBuilder:
    """Consolidated response builders - reduces boilerplate across handlers."""

    @staticmethod
    def success(data: dict | None = None, message: str = "Success") -> web.Response:
        """Build success response."""
        return json_response({"success": True, "message": message, **(data or {})})

    @staticmethod
    def error(message: str, status_code: int = 400) -> web.Response:
        """Build error response."""
        return json_message(message, success=False, status_code=status_code)

    @staticmethod
    def result(data: dict, status_code: int = 200) -> web.Response:
        """Build generic result response."""
        return json_response(data, status_code=status_code)
