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
    ROUTE_AUTO_ENGINE_CONFIG_PATH,
    ROUTE_SURFACE_TYPES_PATH,
    TRUCK_BODY_CATALOG_PATH,
    TRUCK_BRAND_FAMILY_CATALOG_PATH,
    TRUCK_CATEGORY_CATALOG_PATH,
    TRUCK_CATALOG_EDITS_PATH,
    TRUCK_CATALOG_HIDDEN_PATH,
    TRUCK_CUSTOM_CATALOG_PATH,
    TRUCK_IMAGE_ASSET_REGISTRY_PATH,
    TRUCK_IMAGE_GENERATION_CONFIG_PATH,
    TRUCK_IMAGE_PROMPT_OVERRIDES_PATH,
    TRUCK_IMAGE_REVIEW_QUEUE_PATH,
    TRUCK_IMAGE_VISUAL_DEFINITIONS_PATH,
    TRUCK_SILHOUETTE_CATALOG_PATH,
    TRUCK_SPRITE_2D_CATALOG_PATH,
    TRUCK_TYPE_CATALOG_PATH,
    UI_COMPONENT_REGISTRY_PATH,
    UI_MAP_DISPLAY_CONTROLS_PATH,
    UI_MAP_LEAFLET_CONTROLS_PATH,
    UI_MAP_EDITOR_THEMES_PATH,
    UI_MAP_EDITOR_V2_SCREEN_PATH,
    UI_ROUTE_PLANNER_SCREEN_PATH,
    UI_MAP_SHORTCUTS_PANEL_PATH,
    UI_DESIGN_TOKENS_PATH,
    UI_LAYOUT_DESKTOP_MAIN_PATH,
    UI_LAYOUT_DESKTOP_MAP_EDITOR_PATH,
    UI_LAYOUT_DESKTOP_MAP_EDITOR_V2_PATH,
    UI_LAYOUT_DESKTOP_ROUTE_PLANNER_PATH,
    UI_LAYOUT_DESKTOP_TRUCK_GALLERY_PATH,
    UI_MAP_EDITOR_SCREEN_PATH,
    UI_NAVIGATION_ITEMS_PATH,
    UI_MAP_REPOSITORY_CONTROLS_PATH,
    UI_SHORTCUTS_ROUTE_PLANNER_PATH,
    UI_SHORTCUTS_MAP_EDITOR_PATH,
    UI_TRUCK_GALLERY_SCREEN_PATH,
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


def load_base_city_catalog_payload(path: Path | None = None) -> list[dict[str, Any]]:
    return list(load_json(path or CITY_CATALOG_PATH))


def load_user_city_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target_path = path or CITY_USER_CATALOG_PATH
    if not target_path.exists():
        return {"id": "city_catalog_user_v1", "cities": []}
    payload = load_json(target_path)
    if isinstance(payload, dict) and "cities" in payload:
        return _sanitize_user_city_payload(dict(payload))
    return _sanitize_user_city_payload({"id": "city_catalog_user_v1", "cities": list(payload)})


def build_user_city_catalog_payload(city_catalog_payload: list[dict[str, Any]]) -> dict[str, Any]:
    filtered_cities = [city for city in city_catalog_payload if bool(city.get("is_user_created"))]
    return _sanitize_user_city_payload({"id": "city_catalog_user_v1", "cities": filtered_cities})


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


def load_map_editor_payload(user_city_catalog: dict[str, Any] | None = None) -> dict[str, Any]:
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
        "map_repository_controls": load_json(UI_MAP_REPOSITORY_CONTROLS_PATH),
        "shortcuts_panel": load_json(UI_MAP_SHORTCUTS_PANEL_PATH),
        "city_autofill": load_json(AI_CITY_AUTOFILL_CONFIG_PATH),
        "user_city_catalog": user_city_catalog or load_user_city_catalog_payload(),
        "route_surface_types": load_json(ROUTE_SURFACE_TYPES_PATH),
        "route_geometry_types": load_json(ROUTE_GEOMETRY_TYPES_PATH),
    }


def load_map_editor_v2_payload() -> dict[str, Any]:
    return {
        "screen": load_json(UI_MAP_EDITOR_V2_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_MAP_EDITOR_V2_PATH),
        "route_auto_engine": load_json(ROUTE_AUTO_ENGINE_CONFIG_PATH),
        "route_surface_types": load_json(ROUTE_SURFACE_TYPES_PATH),
        "route_geometry_types": load_json(ROUTE_GEOMETRY_TYPES_PATH),
    }


def load_route_planner_payload() -> dict[str, Any]:
    return {
        "screen": load_json(UI_ROUTE_PLANNER_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_ROUTE_PLANNER_PATH),
        "shortcuts": load_json(UI_SHORTCUTS_ROUTE_PLANNER_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
    }


def load_truck_gallery_payload() -> dict[str, Any]:
    return {
        "screen": load_json(UI_TRUCK_GALLERY_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_TRUCK_GALLERY_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
    }


def load_truck_type_catalog_payload() -> dict[str, Any]:
    return load_json(TRUCK_TYPE_CATALOG_PATH)


def load_truck_custom_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or TRUCK_CUSTOM_CATALOG_PATH
    if not target.exists():
        return {"id": "truck_custom_catalog_v1", "items": []}
    return load_json(target)


def load_truck_catalog_edits_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or TRUCK_CATALOG_EDITS_PATH
    if not target.exists():
        return {"id": "truck_catalog_edits_v1", "items": []}
    return load_json(target)


def load_truck_catalog_hidden_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or TRUCK_CATALOG_HIDDEN_PATH
    if not target.exists():
        return {"id": "truck_catalog_hidden_v1", "hidden_type_ids": []}
    payload = load_json(target)
    payload.setdefault("id", "truck_catalog_hidden_v1")
    payload.setdefault("hidden_type_ids", [])
    return payload


def load_truck_category_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or TRUCK_CATEGORY_CATALOG_PATH
    if not target.exists():
        return {
            "id": "truck_category_catalog_v1",
            "size_tiers": [],
            "base_vehicle_kinds": [],
            "axle_configs": [],
            "combination_kinds": [],
            "cargo_scopes": [],
        }
    payload = load_json(target)
    payload.setdefault("id", "truck_category_catalog_v1")
    payload.setdefault("size_tiers", [])
    payload.setdefault("base_vehicle_kinds", [])
    payload.setdefault("axle_configs", [])
    payload.setdefault("combination_kinds", [])
    payload.setdefault("cargo_scopes", [])
    return payload


def load_effective_truck_type_catalog_payload() -> dict[str, Any]:
    payload = dict(load_truck_type_catalog_payload())
    edits_document = load_truck_catalog_edits_payload()
    hidden_document = load_truck_catalog_hidden_payload()
    custom_document = load_truck_custom_catalog_payload()
    hidden_ids = {str(item).strip() for item in hidden_document.get("hidden_type_ids", []) if str(item).strip()}
    edits_by_id = {
        str(item.get("truck_type_id") or ""): dict(item)
        for item in edits_document.get("items", [])
        if str(item.get("truck_type_id") or "").strip()
    }
    types: list[dict[str, Any]] = []
    for raw_type in payload.get("types", []):
        item = dict(raw_type)
        if str(item.get("id") or "") in hidden_ids:
            continue
        edit = edits_by_id.get(str(item.get("id") or ""))
        if edit:
            item["label"] = str(edit.get("label") or item.get("label") or "").strip() or item.get("label")
            item["size_tier"] = str(edit.get("size_tier") or item.get("size_tier") or "").strip() or item.get("size_tier")
            item["base_vehicle_kind"] = str(edit.get("base_vehicle_kind") or item.get("base_vehicle_kind") or "").strip() or item.get("base_vehicle_kind")
            item["axle_config"] = str(edit.get("axle_config") or item.get("axle_config") or "").strip() or item.get("axle_config")
            item["combination_kind"] = str(edit.get("combination_kind") or item.get("combination_kind") or "").strip() or item.get("combination_kind")
            item["cargo_scope"] = str(edit.get("cargo_scope") or item.get("cargo_scope") or "").strip() or item.get("cargo_scope")
            item["notes"] = str(edit.get("notes") or item.get("notes") or "").strip()
            canonical_body_type_id = str(edit.get("canonical_body_type_id") or "").strip()
            if canonical_body_type_id:
                item["canonical_body_type_ids"] = [canonical_body_type_id]
        item["is_custom"] = False
        types.append(item)
    for raw_item in custom_document.get("items", []):
        item = dict(raw_item)
        if str(item.get("id") or "") in hidden_ids:
            continue
        item["is_custom"] = True
        if item.get("canonical_body_type_id") and not item.get("canonical_body_type_ids"):
            item["canonical_body_type_ids"] = [item["canonical_body_type_id"]]
        types.append(item)
    types.sort(key=lambda item: (int(item.get("order") or 9999), str(item.get("label") or "")))
    payload["types"] = types
    return payload


def load_truck_body_catalog_payload() -> dict[str, Any]:
    return load_json(TRUCK_BODY_CATALOG_PATH)


def load_truck_sprite_2d_catalog_payload() -> dict[str, Any]:
    return load_json(TRUCK_SPRITE_2D_CATALOG_PATH)


def load_truck_brand_family_catalog_payload() -> dict[str, Any]:
    return load_json(TRUCK_BRAND_FAMILY_CATALOG_PATH)


def load_truck_silhouette_catalog_payload() -> dict[str, Any]:
    return load_json(TRUCK_SILHOUETTE_CATALOG_PATH)


def load_truck_image_visual_definitions_payload() -> dict[str, Any]:
    return load_json(TRUCK_IMAGE_VISUAL_DEFINITIONS_PATH)


def load_truck_image_generation_config_payload() -> dict[str, Any]:
    return load_json(TRUCK_IMAGE_GENERATION_CONFIG_PATH)


def load_truck_image_prompt_overrides_payload() -> dict[str, Any]:
    return load_json(TRUCK_IMAGE_PROMPT_OVERRIDES_PATH)


def load_truck_image_asset_registry_payload() -> dict[str, Any]:
    return load_json(TRUCK_IMAGE_ASSET_REGISTRY_PATH)


def load_truck_image_review_queue_payload() -> dict[str, Any]:
    return load_json(TRUCK_IMAGE_REVIEW_QUEUE_PATH)


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
    return _build_cities_from_payload(payload, matrix_path)


def _build_cities_from_payload(payload: list[dict[str, Any]], matrix_path: Path) -> dict[str, City]:
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


def build_reference_data_from_city_catalog_payload(
    city_catalog_payload: list[dict[str, Any]],
    products_path: Path | None = None,
    city_product_matrix_path: Path | None = None,
    map_viewport_path: Path | None = None,
) -> ReferenceData:
    product_file = products_path or PRODUCT_CATALOG_PATH
    city_product_file = city_product_matrix_path or CITY_PRODUCT_MATRIX_PATH
    map_file = map_viewport_path or MAP_VIEWPORT_CONFIG_PATH

    return ReferenceData(
        commodities=_load_commodities(product_file),
        cities=_build_cities_from_payload(city_catalog_payload, city_product_file),
        map_config=_load_map_config(map_file),
    )
