from __future__ import annotations

import os
from pathlib import Path


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default
    return Path(value).expanduser()


def read_local_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    payload: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        payload[key] = value
    return payload


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE_PATH = ROOT_DIR / ".env"
DATA_DIR = _env_path("BRASIX_DATA_DIR", ROOT_DIR / "data")
JSON_DIR = _env_path("BRASIX_JSON_DIR", ROOT_DIR / "json")
MAPS_DIR = _env_path("BRASIX_MAPS_DIR", ROOT_DIR / "maps")
STATIC_DIR = ROOT_DIR / "app" / "static"
TEMPLATE_DIR = ROOT_DIR / "app" / "ui" / "templates"
RAW_DATA_DIR = _env_path("BRASIX_RAW_DATA_DIR", ROOT_DIR / "dados")
UI_DESIGN_TOKENS_PATH = JSON_DIR / "ui_design_tokens.json"
UI_LAYOUT_DESKTOP_MAIN_PATH = JSON_DIR / "ui_layout_desktop_main.json"
UI_LAYOUT_DESKTOP_MAP_EDITOR_PATH = JSON_DIR / "ui_layout_desktop_map_editor.json"
UI_COMPONENT_REGISTRY_PATH = JSON_DIR / "ui_component_registry.json"
UI_NAVIGATION_ITEMS_PATH = JSON_DIR / "ui_navigation_items.json"
UI_MAP_EDITOR_SCREEN_PATH = JSON_DIR / "ui_map_editor_screen.json"
UI_MAP_EDITOR_THEMES_PATH = JSON_DIR / "ui_map_editor_themes.json"
UI_SHORTCUTS_MAP_EDITOR_PATH = JSON_DIR / "ui_shortcuts_map_editor.json"
UI_MAP_DISPLAY_CONTROLS_PATH = JSON_DIR / "ui_map_display_controls.json"
UI_MAP_LEAFLET_CONTROLS_PATH = JSON_DIR / "ui_map_leaflet_controls.json"
UI_MAP_SHORTCUTS_PANEL_PATH = JSON_DIR / "ui_map_shortcuts_panel.json"
UI_MAP_REPOSITORY_CONTROLS_PATH = JSON_DIR / "ui_map_repository_controls.json"
AI_CITY_AUTOFILL_CONFIG_PATH = JSON_DIR / "ai_city_autofill_config.json"
CITY_CATALOG_PATH = JSON_DIR / "city_catalog.json"
CITY_USER_CATALOG_PATH = JSON_DIR / "city_catalog_user.json"
PRODUCT_CATALOG_PATH = JSON_DIR / "product_catalog.json"
CITY_PRODUCT_MATRIX_PATH = JSON_DIR / "city_product_matrix.json"
MAP_VIEWPORT_CONFIG_PATH = JSON_DIR / "map_viewport_config.json"
ROUTE_NETWORK_PATH = JSON_DIR / "route_network.json"
MAP_EDITOR_PIN_LIBRARY_PATH = JSON_DIR / "map_editor_pin_library.json"
MAP_EDITOR_GRAPH_NODE_STYLES_PATH = JSON_DIR / "map_editor_graph_node_styles.json"
MAP_EDITOR_POPULATION_BANDS_PATH = JSON_DIR / "map_editor_population_bands.json"
MAP_EDITOR_TOOL_MODES_PATH = JSON_DIR / "map_editor_tool_modes.json"
MAP_DISPLAY_SETTINGS_PATH = JSON_DIR / "map_display_settings.json"
MAP_LEAFLET_SETTINGS_PATH = JSON_DIR / "map_leaflet_settings.json"
ROUTE_SURFACE_TYPES_PATH = JSON_DIR / "route_surface_types.json"
ROUTE_GEOMETRY_TYPES_PATH = JSON_DIR / "route_geometry_types.json"
MAPS_REGISTRY_PATH = MAPS_DIR / "maps_registry.json"


def runtime_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value not in (None, ""):
        return value
    return read_local_env(ENV_FILE_PATH).get(name, default)
