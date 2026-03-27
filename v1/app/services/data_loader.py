from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import (
    AI_CITY_AUTOFILL_CONFIG_PATH,
    CITY_CATALOG_PATH,
    CITY_USER_CATALOG_PATH,
    CITY_PRODUCT_MATRIX_PATH,
    MAP_EDITOR_GRAPH_NODE_STYLES_PATH,
    MAP_EDITOR_PIN_LIBRARY_PATH,
    MAP_EDITOR_POPULATION_BANDS_PATH,
    MAP_EDITOR_TOOL_MODES_PATH,
    MAP_DISPLAY_SETTINGS_PATH,
    MAP_VIEWPORT_CONFIG_PATH,
    MAP_LEAFLET_SETTINGS_PATH,
    PRODUCT_CATALOG_PATH,
    ROUTE_GEOMETRY_TYPES_PATH,
    ROUTE_SURFACE_TYPES_PATH,
    UI_COMPONENT_REGISTRY_PATH,
    UI_MAP_DISPLAY_CONTROLS_PATH,
    UI_MAP_LEAFLET_CONTROLS_PATH,
    UI_MAP_EDITOR_THEMES_PATH,
    UI_MAP_SHORTCUTS_PANEL_PATH,
    UI_DESIGN_TOKENS_PATH,
    UI_LAYOUT_DESKTOP_MAIN_PATH,
    UI_LAYOUT_DESKTOP_MAP_EDITOR_PATH,
    UI_MAP_EDITOR_SCREEN_PATH,
    UI_NAVIGATION_ITEMS_PATH,
    UI_SHORTCUTS_MAP_EDITOR_PATH,
)
from app.domain import City, CommodityProfile, MapConfig, ReferenceData


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_json(path: Path, payload: Any) -> Any:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def _maybe_fix_mojibake(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if "Ã" not in value and "â" not in value:
        return value
    try:
        return value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def _sanitize_user_city_payload(payload: dict[str, Any]) -> dict[str, Any]:
    document = {"id": payload.get("id") or "city_catalog_user_v1", "cities": []}
    for raw_city in payload.get("cities", []):
        if not isinstance(raw_city, dict):
            continue
        city = dict(raw_city)
        for field in ("id", "name", "label", "state_code", "state_name", "source_region_name"):
            city[field] = _maybe_fix_mojibake(city.get(field))

        city["state_code"] = str(city.get("state_code") or "ZZ").strip().upper()[:3] or "ZZ"
        city["name"] = str(city.get("name") or "Nova cidade").strip() or "Nova cidade"
        city["label"] = f"{city['name']}, {city['state_code']}"
        city["state_name"] = str(city.get("state_name") or "Estado manual").strip() or "Estado manual"
        city["source_region_name"] = (
            str(city.get("source_region_name") or "Cidade criada no editor").strip() or "Cidade criada no editor"
        )
        city["is_user_created"] = True

        autofill = city.get("autofill")
        if isinstance(autofill, dict):
            provider = str(autofill.get("provider") or "").strip().lower()
            if provider == "openai":
                city["autofill"] = None
            else:
                city["autofill"] = {
                    "provider": _maybe_fix_mojibake(autofill.get("provider")),
                    "model": _maybe_fix_mojibake(autofill.get("model")),
                    "status": autofill.get("status"),
                    "confidence": autofill.get("confidence"),
                    "summary": _maybe_fix_mojibake(autofill.get("summary")),
                    "last_error": _maybe_fix_mojibake(autofill.get("last_error")),
                }
        else:
            city["autofill"] = None

        document["cities"].append(city)
    return document


def load_city_catalog_payload(path: Path | None = None) -> list[dict[str, Any]]:
    if path is not None:
        payload = load_json(path)
        if isinstance(payload, dict) and "cities" in payload:
            return list(payload["cities"])
        return list(payload)

    base_cities = list(load_json(CITY_CATALOG_PATH))
    user_document = load_json(CITY_USER_CATALOG_PATH) if CITY_USER_CATALOG_PATH.exists() else {"cities": []}
    user_cities = list(user_document.get("cities", []))
    return base_cities + user_cities


def load_user_city_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target_path = path or CITY_USER_CATALOG_PATH
    if not target_path.exists():
        return {"id": "city_catalog_user_v1", "cities": []}
    payload = load_json(target_path)
    if isinstance(payload, dict) and "cities" in payload:
        return _sanitize_user_city_payload(dict(payload))
    return _sanitize_user_city_payload({"id": "city_catalog_user_v1", "cities": list(payload)})


def load_product_catalog_payload(path: Path | None = None) -> list[dict[str, Any]]:
    return list(load_json(path or PRODUCT_CATALOG_PATH))


def load_city_product_matrix_payload(path: Path | None = None) -> list[dict[str, Any]]:
    return list(load_json(path or CITY_PRODUCT_MATRIX_PATH))


def load_map_viewport_payload(path: Path | None = None) -> dict[str, Any]:
    return dict(load_json(path or MAP_VIEWPORT_CONFIG_PATH))


def load_ui_payload() -> dict[str, Any]:
    return {
        "design_tokens": load_json(UI_DESIGN_TOKENS_PATH),
        "layout_desktop_main": load_json(UI_LAYOUT_DESKTOP_MAIN_PATH),
        "component_registry": load_json(UI_COMPONENT_REGISTRY_PATH),
        "navigation_items": load_json(UI_NAVIGATION_ITEMS_PATH),
    }


def load_map_editor_payload() -> dict[str, Any]:
    return {
        "screen": load_json(UI_MAP_EDITOR_SCREEN_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_MAP_EDITOR_PATH),
        "shortcuts": load_json(UI_SHORTCUTS_MAP_EDITOR_PATH),
        "pin_library": load_json(MAP_EDITOR_PIN_LIBRARY_PATH),
        "graph_node_styles": load_json(MAP_EDITOR_GRAPH_NODE_STYLES_PATH),
        "population_bands": load_json(MAP_EDITOR_POPULATION_BANDS_PATH),
        "tool_modes": load_json(MAP_EDITOR_TOOL_MODES_PATH),
        "display_settings": load_json(MAP_DISPLAY_SETTINGS_PATH),
        "display_controls": load_json(UI_MAP_DISPLAY_CONTROLS_PATH),
        "leaflet_settings": load_json(MAP_LEAFLET_SETTINGS_PATH),
        "leaflet_controls": load_json(UI_MAP_LEAFLET_CONTROLS_PATH),
        "shortcuts_panel": load_json(UI_MAP_SHORTCUTS_PANEL_PATH),
        "city_autofill": load_json(AI_CITY_AUTOFILL_CONFIG_PATH),
        "user_city_catalog": load_user_city_catalog_payload(),
        "route_surface_types": load_json(ROUTE_SURFACE_TYPES_PATH),
        "route_geometry_types": load_json(ROUTE_GEOMETRY_TYPES_PATH),
    }


def _load_commodities(path: Path) -> dict[str, CommodityProfile]:
    payload = load_product_catalog_payload(path)
    return {
        item["id"]: CommodityProfile(
            id=item["id"],
            name=item["name"],
            category=item["category"],
            category_label=item["category_label"],
            unit=item["unit"],
            icon=item["icon"],
            color=item["color"],
            source_column=item["source_column"],
        )
        for item in payload
    }


def _city_matrix_by_city(path: Path) -> dict[str, dict[str, float]]:
    payload = load_city_product_matrix_payload(path)
    matrix: dict[str, dict[str, float]] = {}
    for item in payload:
        city_id = str(item["city_id"])
        product_id = str(item["product_id"])
        value = float(item["value"])
        matrix.setdefault(city_id, {})[product_id] = value
    return matrix


def _load_cities(path: Path, matrix_path: Path) -> dict[str, City]:
    payload = load_city_catalog_payload(path)
    matrix_by_city = _city_matrix_by_city(matrix_path)
    cities: dict[str, City] = {}

    for item in payload:
        commodity_values = matrix_by_city.get(item["id"], {})
        dominant_commodity_id = None
        if commodity_values:
            dominant_commodity_id = max(commodity_values.items(), key=lambda entry: entry[1])[0]

        cities[item["id"]] = City(
            id=item["id"],
            name=item["name"],
            label=item["label"],
            state_code=item["state_code"],
            state_name=item["state_name"],
            source_region_name=item["source_region_name"],
            population_thousands=float(item["population_thousands"]),
            latitude=float(item["latitude"]),
            longitude=float(item["longitude"]),
            commodity_values=commodity_values,
            dominant_commodity_id=dominant_commodity_id,
        )
    return cities


def _load_map_config(path: Path) -> MapConfig:
    payload = load_map_viewport_payload(path)
    return MapConfig(
        center_lat=float(payload["center_lat"]),
        center_lon=float(payload["center_lon"]),
        lat_min=float(payload["lat_min"]),
        lat_max=float(payload["lat_max"]),
        lon_min=float(payload["lon_min"]),
        lon_max=float(payload["lon_max"]),
    )


def load_reference_data(
    products_path: Path | None = None,
    city_catalog_path: Path | None = None,
    city_product_matrix_path: Path | None = None,
    map_viewport_path: Path | None = None,
) -> ReferenceData:
    product_file = products_path or PRODUCT_CATALOG_PATH
    city_file = city_catalog_path or CITY_CATALOG_PATH
    city_product_file = city_product_matrix_path or CITY_PRODUCT_MATRIX_PATH
    map_file = map_viewport_path or MAP_VIEWPORT_CONFIG_PATH

    return ReferenceData(
        commodities=_load_commodities(product_file),
        cities=_load_cities(city_file, city_product_file),
        map_config=_load_map_config(map_file),
    )
