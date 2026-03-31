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
GAME_JSON_DIR = JSON_DIR / "game"
MAPS_DIR = _env_path("BRASIX_MAPS_DIR", ROOT_DIR / "maps")
ASSETS_DIR = _env_path("BRASIX_ASSETS_DIR", ROOT_DIR / "assets")
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
UI_LAYOUT_DESKTOP_MAP_EDITOR_V2_PATH = JSON_DIR / "ui_layout_desktop_map_editor_v2.json"
UI_MAP_EDITOR_V2_SCREEN_PATH = JSON_DIR / "ui_map_editor_v2_screen.json"
UI_LAYOUT_DESKTOP_ROUTE_PLANNER_PATH = JSON_DIR / "ui_layout_desktop_route_planner.json"
UI_ROUTE_PLANNER_SCREEN_PATH = JSON_DIR / "ui_route_planner_screen.json"
UI_SHORTCUTS_ROUTE_PLANNER_PATH = JSON_DIR / "ui_shortcuts_route_planner.json"
UI_LAYOUT_DESKTOP_TRUCK_GALLERY_PATH = JSON_DIR / "ui_layout_desktop_truck_gallery.json"
UI_TRUCK_GALLERY_SCREEN_PATH = JSON_DIR / "ui_truck_gallery_screen.json"
UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_PATH = GAME_JSON_DIR / "ui_layout_desktop_product_editor.json"
UI_PRODUCT_EDITOR_SCREEN_PATH = GAME_JSON_DIR / "ui_product_editor_screen.json"
UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V1_PATH = GAME_JSON_DIR / "ui_layout_desktop_product_editor_v1.json"
UI_PRODUCT_EDITOR_V1_SCREEN_PATH = GAME_JSON_DIR / "ui_product_editor_v1_screen.json"
UI_SHORTCUTS_PRODUCT_EDITOR_V1_PATH = GAME_JSON_DIR / "ui_shortcuts_product_editor_v1.json"
UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V2_PATH = GAME_JSON_DIR / "ui_layout_desktop_product_editor_v2.json"
UI_PRODUCT_EDITOR_V2_SCREEN_PATH = GAME_JSON_DIR / "ui_product_editor_v2_screen.json"
UI_SHORTCUTS_PRODUCT_EDITOR_V2_PATH = GAME_JSON_DIR / "ui_shortcuts_product_editor_v2.json"
ROUTE_AUTO_ENGINE_CONFIG_PATH = JSON_DIR / "route_auto_engine_config.json"
AI_CITY_AUTOFILL_CONFIG_PATH = JSON_DIR / "ai_city_autofill_config.json"
CITY_CATALOG_PATH = JSON_DIR / "city_catalog.json"
CITY_USER_CATALOG_PATH = JSON_DIR / "city_catalog_user.json"
PRODUCT_CATALOG_PATH = JSON_DIR / "product_catalog.json"
CITY_PRODUCT_MATRIX_PATH = JSON_DIR / "city_product_matrix.json"
CITY_PRODUCT_DEMAND_SEED_PATH = JSON_DIR / "city_product_demand_matrix.json"
PRODUCT_FAMILY_CATALOG_PATH = GAME_JSON_DIR / "product_family_catalog.json"
PRODUCT_LOGISTICS_TYPE_CATALOG_PATH = GAME_JSON_DIR / "product_logistics_type_catalog.json"
PRODUCT_CATALOG_V2_PATH = GAME_JSON_DIR / "product_catalog_v2.json"
PRODUCT_MASTER_V1_1_PATH = GAME_JSON_DIR / "product_master_v1_1.json"
CITY_PRODUCT_SUPPLY_MATRIX_PATH = GAME_JSON_DIR / "city_product_supply_matrix.json"
CITY_PRODUCT_DEMAND_MATRIX_PATH = GAME_JSON_DIR / "city_product_demand_matrix.json"
REGION_PRODUCT_SUPPLY_MATRIX_PATH = GAME_JSON_DIR / "region_product_supply_matrix.json"
PRODUCT_INFERENCE_RULES_PATH = GAME_JSON_DIR / "product_inference_rules.json"
PRODUCT_FIELD_EDITS_DIR = GAME_JSON_DIR / "product_field_edits"
PRODUCT_FIELD_BAKED_DIR = GAME_JSON_DIR / "product_field_baked"
MAP_VIEWPORT_CONFIG_PATH = JSON_DIR / "map_viewport_config.json"
ROUTE_NETWORK_PATH = JSON_DIR / "route_network.json"
TRUCK_TYPE_CATALOG_PATH = JSON_DIR / "truck_type_catalog.json"
TRUCK_CUSTOM_CATALOG_PATH = JSON_DIR / "truck_custom_catalog.json"
TRUCK_BODY_CATALOG_PATH = JSON_DIR / "truck_body_catalog.json"
TRUCK_SPRITE_2D_CATALOG_PATH = JSON_DIR / "truck_sprite_2d_catalog.json"
TRUCK_BRAND_FAMILY_CATALOG_PATH = JSON_DIR / "truck_brand_family_catalog.json"
TRUCK_SILHOUETTE_CATALOG_PATH = JSON_DIR / "truck_silhouette_catalog.json"
TRUCK_IMAGE_VISUAL_DEFINITIONS_PATH = JSON_DIR / "truck_image_visual_definitions.json"
TRUCK_IMAGE_GENERATION_CONFIG_PATH = JSON_DIR / "truck_image_generation_config.json"
TRUCK_IMAGE_PROMPT_OVERRIDES_PATH = JSON_DIR / "truck_image_prompt_overrides.json"
TRUCK_IMAGE_ASSET_REGISTRY_PATH = JSON_DIR / "truck_image_asset_registry.json"
TRUCK_IMAGE_REVIEW_QUEUE_PATH = JSON_DIR / "truck_image_review_queue.json"
TRUCK_CATALOG_EDITS_PATH = JSON_DIR / "truck_catalog_edits.json"
TRUCK_CATEGORY_CATALOG_PATH = JSON_DIR / "truck_category_catalog.json"
TRUCK_CATALOG_HIDDEN_PATH = JSON_DIR / "truck_catalog_hidden.json"
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
