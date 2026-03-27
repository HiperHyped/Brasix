from __future__ import annotations

import os
from pathlib import Path


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default
    return Path(value).expanduser()


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = _env_path("BRASIX_DATA_DIR", ROOT_DIR / "data")
STATIC_DIR = ROOT_DIR / "app" / "static"
TEMPLATE_DIR = ROOT_DIR / "app" / "ui" / "templates"
RAW_DATA_DIR = _env_path("BRASIX_RAW_DATA_DIR", ROOT_DIR / "dados")
COMMODITIES_PATH = DATA_DIR / "commodities.json"
CITIES_PATH = DATA_DIR / "cities.json"
MAP_CONFIG_PATH = DATA_DIR / "map_config.json"
ROUTES_PATH = DATA_DIR / "routes.json"
