"""Constants for the Blueprint Studio integration."""

import json
from pathlib import Path

DOMAIN = "blueprint_studio"
NAME = "Blueprint Studio"
VERSION = json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]

# File extensions shown in the file browser listing.
# Does NOT restrict upload/write/read — users can work with any file type.
LISTED_EXTENSIONS = {
    # Config / data
    ".yaml", ".yml", ".json", ".toml", ".csv", ".conf", ".cfg", ".ini",
    ".env", ".properties", ".plist", ".lock",
    # Markup / docs
    ".html", ".htm", ".xml", ".md", ".rst", ".txt", ".log",
    # Templates
    ".jinja", ".jinja2", ".j2",
    # Scripts / languages
    ".py", ".js", ".ts", ".jsx", ".tsx", ".css",
    ".sh", ".bash", ".zsh",
    ".go", ".rs", ".c", ".cpp", ".h", ".java", ".kt", ".swift",
    ".rb", ".php", ".lua", ".r", ".cs", ".sql",
    # Infra / system
    ".service", ".gradle", ".dockerignore", ".gitignore",
    # Crypto / firmware
    ".pem", ".crt", ".key", ".der", ".bin", ".ota",
    # Database
    ".db", ".sqlite",
    # Archives
    ".tar", ".gz", ".zip",
    # Images
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp", ".ico",
    # PDF
    ".pdf",
    # Video
    ".mp4", ".webm", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".m4v",
    # Audio
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
}

# Binary file extensions that should be base64 encoded
BINARY_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".ico", ".pdf", ".zip",
    ".db", ".sqlite",
    ".der", ".bin", ".ota", ".tar", ".gz",
    ".mp4", ".webm", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".m4v",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
}

# Specific filenames shown in listings even without a recognised extension
ALLOWED_FILENAMES = {
    ".gitignore",
    ".ha_run.lock",
    ".env",
    ".dockerignore",
    ".editorconfig",
    ".eslintrc",
    ".prettierrc",
}

# Directories/patterns to exclude
EXCLUDED_PATTERNS = {
    "__pycache__",
    ".git",
    ".cache",
    "deps",
    "tts",
    ".git_credential_helper",
}

# Protected paths that cannot be deleted
PROTECTED_PATHS = {
    "configuration.yaml",
    "secrets.yaml",
    "home-assistant.log",
    ".storage",
}
