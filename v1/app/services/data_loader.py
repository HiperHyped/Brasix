from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import (
    AI_CITY_AUTOFILL_CONFIG_PATH,
    CITY_CATALOG_PATH,
    CITY_USER_CATALOG_PATH,
    CITY_PRODUCT_DEMAND_MATRIX_PATH,
    CITY_PRODUCT_DEMAND_SEED_PATH,
    CITY_PRODUCT_MATRIX_PATH,
    CITY_PRODUCT_SUPPLY_MATRIX_PATH,
    MAP_EDITOR_GRAPH_NODE_STYLES_PATH,
    MAP_EDITOR_PIN_LIBRARY_PATH,
    MAP_EDITOR_POPULATION_BANDS_PATH,
    MAP_EDITOR_TOOL_MODES_PATH,
    MAP_DISPLAY_SETTINGS_PATH,
    MAP_VIEWPORT_CONFIG_PATH,
    MAP_LEAFLET_SETTINGS_PATH,
    PRODUCT_FAMILY_CATALOG_PATH,
    PRODUCT_CATALOG_PATH,
    PRODUCT_CATALOG_V2_PATH,
    PRODUCT_INFERENCE_RULES_PATH,
    PRODUCT_MASTER_V1_1_PATH,
    PRODUCT_LOGISTICS_TYPE_CATALOG_PATH,
    REGION_PRODUCT_SUPPLY_MATRIX_PATH,
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
    UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_PATH,
    UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V1_PATH,
    UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V2_PATH,
    UI_LAYOUT_DESKTOP_ROUTE_PLANNER_PATH,
    UI_LAYOUT_DESKTOP_TRUCK_GALLERY_PATH,
    UI_MAP_EDITOR_SCREEN_PATH,
    UI_NAVIGATION_ITEMS_PATH,
    UI_PRODUCT_EDITOR_SCREEN_PATH,
    UI_PRODUCT_EDITOR_V1_SCREEN_PATH,
    UI_PRODUCT_EDITOR_V2_SCREEN_PATH,
    UI_MAP_REPOSITORY_CONTROLS_PATH,
    UI_SHORTCUTS_ROUTE_PLANNER_PATH,
    UI_SHORTCUTS_MAP_EDITOR_PATH,
    UI_SHORTCUTS_PRODUCT_EDITOR_V1_PATH,
    UI_SHORTCUTS_PRODUCT_EDITOR_V2_PATH,
    UI_TRUCK_GALLERY_SCREEN_PATH,
    PRODUCT_FIELD_EDITS_DIR,
    PRODUCT_FIELD_BAKED_DIR,
)
from app.domain import City, CommodityProfile, MapConfig, ReferenceData


DEFAULT_PRODUCT_FAMILY_DOCUMENT = {
    "id": "product_family_catalog_v1",
    "families": [
        {"id": "agro", "label": "Agro", "color": "#5b8f4d", "order": 1},
        {"id": "pecuaria", "label": "Pecuaria", "color": "#8a5b34", "order": 2},
        {"id": "florestal", "label": "Florestal", "color": "#2d7a63", "order": 3},
        {"id": "mineral", "label": "Mineral", "color": "#b46a2b", "order": 4},
        {"id": "energia", "label": "Energia", "color": "#c8501e", "order": 5},
        {"id": "derivado", "label": "Derivado", "color": "#486b88", "order": 6},
    ],
}

DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT = {
    "id": "product_logistics_type_catalog_v1",
    "types": [
        {
            "id": "granel_seco",
            "label": "Granel seco",
            "description": "Carga solta ou ensacada.",
            "order": 1,
            "body_type_ids": ["truck_body_graneleiro", "truck_body_basculante", "truck_body_carga_seca"],
        },
        {
            "id": "carga_geral_perecivel",
            "label": "Carga perecivel",
            "description": "Produto in natura de giro rapido.",
            "order": 2,
            "body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_container"],
        },
        {
            "id": "animais_vivos",
            "label": "Animais vivos",
            "description": "Carga viva em boiadeiro.",
            "order": 3,
            "body_type_ids": ["truck_body_boiadeiro"],
        },
        {
            "id": "granel_liquido",
            "label": "Granel liquido",
            "description": "Liquido a granel em tanque.",
            "order": 4,
            "body_type_ids": ["truck_body_tanque"],
        },
        {
            "id": "carga_geral_paletizada",
            "label": "Carga geral paletizada",
            "description": "Carga geral industrial em bau, sider ou container.",
            "order": 5,
            "body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_container"],
        },
        {
            "id": "carga_aberta",
            "label": "Carga aberta",
            "description": "Carga aberta ou alongada.",
            "order": 6,
            "body_type_ids": ["truck_body_prancha", "truck_body_madeireiro", "truck_body_carga_seca"],
        },
        {
            "id": "frigorificado",
            "label": "Frigorificado",
            "description": "Carga com cadeia fria.",
            "order": 7,
            "body_type_ids": ["truck_body_frigorifico"],
        },
        {
            "id": "granel_mineral",
            "label": "Granel mineral",
            "description": "Minerais pesados a granel.",
            "order": 8,
            "body_type_ids": ["truck_body_basculante", "truck_body_graneleiro"],
        },
        {
            "id": "carga_valiosa",
            "label": "Carga valiosa",
            "description": "Carga de alto valor.",
            "order": 9,
            "body_type_ids": ["truck_body_bau", "truck_body_container"],
        },
        {
            "id": "granel_gasoso_pressurizado",
            "label": "Gasoso pressurizado",
            "description": "Tanque especializado para gas.",
            "order": 10,
            "body_type_ids": ["truck_body_tanque"],
        },
        {
            "id": "cana_in_natura",
            "label": "Cana in natura",
            "description": "Cana colhida com implemento canavieiro.",
            "order": 11,
            "body_type_ids": ["truck_body_canavieiro"],
        },
        {
            "id": "transporte_veiculos",
            "label": "Transporte de veiculos",
            "description": "Veiculos novos em implemento cegonheiro.",
            "order": 12,
            "body_type_ids": ["truck_body_cegonheiro"],
        },
    ],
}

DEFAULT_LOGISTICS_BODY_IDS_BY_TYPE = {
    str(item.get("id") or ""): [str(body_id).strip() for body_id in item.get("body_type_ids", []) if str(body_id).strip()]
    for item in DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT.get("types", [])
    if str(item.get("id") or "").strip()
}

CATEGORY_PRODUCT_DEFAULTS = {
    "agro": {
        "family_id": "agro",
        "density_class": "medium",
        "value_class": "medium",
        "perishable": False,
        "fragile": False,
        "hazardous": False,
        "temperature_control_required": False,
    },
    "pecuaria": {
        "family_id": "pecuaria",
        "density_class": "medium",
        "value_class": "medium",
        "perishable": False,
        "fragile": False,
        "hazardous": False,
        "temperature_control_required": False,
    },
    "florestal": {
        "family_id": "florestal",
        "density_class": "medium",
        "value_class": "medium",
        "perishable": False,
        "fragile": False,
        "hazardous": False,
        "temperature_control_required": False,
    },
    "mineral": {
        "family_id": "mineral",
        "density_class": "high",
        "value_class": "medium",
        "perishable": False,
        "fragile": False,
        "hazardous": False,
        "temperature_control_required": False,
    },
    "energia": {
        "family_id": "energia",
        "density_class": "high",
        "value_class": "high",
        "perishable": False,
        "fragile": False,
        "hazardous": True,
        "temperature_control_required": False,
    },
    "derivado": {
        "family_id": "derivado",
        "density_class": "medium",
        "value_class": "medium",
        "perishable": False,
        "fragile": False,
        "hazardous": False,
        "temperature_control_required": False,
    },
}

LEGACY_PRODUCT_LOGISTICS_TYPES = {
    "soja": "granel_seco",
    "milho": "granel_seco",
    "cana-de-acucar": "cana_in_natura",
    "algodao": "carga_geral_paletizada",
    "cafe": "granel_seco",
    "arroz": "granel_seco",
    "trigo": "granel_seco",
    "laranja": "carga_geral_perecivel",
    "feijao": "granel_seco",
    "mandioca": "granel_seco",
    "bovinos": "animais_vivos",
    "suinos": "animais_vivos",
    "aves": "animais_vivos",
    "leite": "granel_liquido",
    "ovinos": "animais_vivos",
    "papel-celulose": "carga_geral_paletizada",
    "madeira": "carga_aberta",
    "pesca": "frigorificado",
    "ferro": "granel_mineral",
    "ouro": "carga_valiosa",
    "bauxita": "granel_mineral",
    "manganes": "granel_mineral",
    "niobio": "carga_valiosa",
    "cobre": "granel_mineral",
    "fosfato": "granel_mineral",
    "carvao": "granel_mineral",
    "sal-marinho": "granel_mineral",
    "petroleo": "granel_liquido",
    "gas-natural": "granel_gasoso_pressurizado",
    "etanol": "granel_liquido",
}

PRODUCT_METADATA_OVERRIDES = {
    "algodao": {"density_class": "low"},
    "cafe": {"value_class": "high"},
    "laranja": {"perishable": True, "value_class": "high"},
    "leite": {"perishable": True, "temperature_control_required": True, "value_class": "high"},
    "papel-celulose": {"fragile": True},
    "madeira": {"density_class": "high"},
    "pesca": {"perishable": True, "temperature_control_required": True, "value_class": "high"},
    "ferro": {"density_class": "very_high"},
    "ouro": {"density_class": "very_high", "value_class": "premium"},
    "bauxita": {"density_class": "very_high"},
    "manganes": {"density_class": "very_high"},
    "niobio": {"density_class": "very_high", "value_class": "premium"},
    "cobre": {"density_class": "very_high", "value_class": "high"},
    "fosfato": {"density_class": "high"},
    "carvao": {"density_class": "high"},
    "sal-marinho": {"density_class": "high"},
    "petroleo": {"value_class": "strategic"},
    "gas-natural": {"density_class": "low", "value_class": "strategic"},
    "etanol": {"value_class": "high"},
}

MASTER_PRODUCT_LOGISTICS_TYPES = {
    "soja": "granel_seco",
    "milho": "granel_seco",
    "cana-de-acucar": "cana_in_natura",
    "algodao": "carga_geral_paletizada",
    "cafe": "granel_seco",
    "arroz": "granel_seco",
    "trigo": "granel_seco",
    "laranja": "carga_geral_perecivel",
    "feijao": "granel_seco",
    "mandioca": "granel_seco",
    "bovinos": "animais_vivos",
    "suinos": "animais_vivos",
    "aves": "animais_vivos",
    "leite": "granel_liquido",
    "celulose": "carga_geral_paletizada",
    "madeira": "carga_aberta",
    "pesca": "frigorificado",
    "ferro": "granel_mineral",
    "aluminio": "granel_mineral",
    "terras-raras": "carga_valiosa",
    "cobre": "granel_mineral",
    "fosfato": "granel_mineral",
    "carvao": "granel_mineral",
    "sal-marinho": "granel_mineral",
    "petroleo": "granel_liquido",
    "gas-natural": "granel_gasoso_pressurizado",
    "etanol": "granel_liquido",
    "acucar": "granel_seco",
    "tecido": "carga_geral_paletizada",
    "pao": "carga_geral_perecivel",
    "bebida": "carga_geral_paletizada",
    "lacteos": "frigorificado",
    "carne": "frigorificado",
    "ovo": "carga_geral_perecivel",
    "moveis": "carga_geral_paletizada",
    "aco": "carga_aberta",
    "fertilizante": "granel_seco",
    "plastico": "carga_geral_paletizada",
    "embalagem": "carga_geral_paletizada",
    "eletronicos": "carga_valiosa",
    "veiculos": "transporte_veiculos",
    "ouro": "carga_valiosa",
    "ovinos": "animais_vivos",
    "manganes": "granel_mineral",
}

MASTER_PRODUCT_UNIT_OVERRIDES = {
    "bovinos": "mil cab",
    "suinos": "mil cab",
    "aves": "mil cab",
    "ovinos": "mil cab",
    "leite": "mil l",
    "pesca": "mil t",
    "eletronicos": "mil un",
    "veiculos": "mil un",
}

MASTER_PRODUCT_METADATA_OVERRIDES = {
    "aluminio": {"density_class": "high", "value_class": "high"},
    "terras-raras": {"density_class": "high", "value_class": "premium"},
    "acucar": {"density_class": "high", "value_class": "high"},
    "tecido": {"density_class": "low", "fragile": True},
    "pao": {"perishable": True, "fragile": True},
    "bebida": {"value_class": "high", "fragile": True},
    "lacteos": {"perishable": True, "temperature_control_required": True, "value_class": "high"},
    "carne": {"perishable": True, "temperature_control_required": True, "value_class": "high"},
    "ovo": {"perishable": True, "fragile": True, "value_class": "high"},
    "moveis": {"fragile": True, "value_class": "high"},
    "aco": {"density_class": "very_high", "value_class": "high"},
    "fertilizante": {"density_class": "high", "hazardous": True},
    "plastico": {"density_class": "medium", "value_class": "high"},
    "embalagem": {"density_class": "low", "fragile": True},
    "eletronicos": {"fragile": True, "value_class": "premium"},
    "veiculos": {"fragile": True, "value_class": "premium"},
}

DEFAULT_PRODUCT_INFERENCE_RULES = {
    "id": "product_inference_rules_v1",
    "supply_interpolation": {
        "method": "inverse_distance_weighting",
        "nearest_anchor_count": 4,
        "power": 1.8,
        "max_distance_km": 900,
        "minimum_distance_km": 35,
        "same_state_bonus": 1.35,
    },
    "demand_estimation": {
        "method": "population_weighted_seed",
        "default_multiplier": 0.22,
        "population_exponent": 0.85,
        "minimum_reference_population_thousands": 40,
        "family_weights": {
            "agro": 0.55,
            "pecuaria": 0.6,
            "florestal": 0.45,
            "mineral": 0.35,
            "energia": 0.75,
        },
    },
    "manual_influence_defaults": {
        "radius_km": 160,
        "minimum_radius_km": 40,
        "maximum_radius_km": 600,
        "intensity": 1.0,
        "falloff": "smooth",
    },
}

DEFAULT_PRODUCT_EDITOR_V1_SHORTCUTS = {
    "id": "ui_shortcuts_product_editor_v1",
    "items": [
        {"id": "product_editor_v1_shortcut_select", "key": "C", "description": "Ativa o modo de selecao de cidade."},
        {"id": "product_editor_v1_shortcut_modify", "key": "M", "description": "Ativa o modo de modificacao por pincel."},
        {"id": "product_editor_v1_shortcut_radius_1", "key": "1", "description": "Seleciona o pincel muito fino."},
        {"id": "product_editor_v1_shortcut_radius_2", "key": "2", "description": "Seleciona o pincel fino."},
        {"id": "product_editor_v1_shortcut_radius_3", "key": "3", "description": "Seleciona o pincel medio."},
        {"id": "product_editor_v1_shortcut_radius_4", "key": "4", "description": "Seleciona o pincel grosso."},
        {"id": "product_editor_v1_shortcut_radius_5", "key": "5", "description": "Seleciona o pincel muito grosso."},
        {"id": "product_editor_v1_shortcut_intensity_down", "key": "[", "description": "Reduz a intensidade do pincel."},
        {"id": "product_editor_v1_shortcut_intensity_up", "key": "]", "description": "Aumenta a intensidade do pincel."},
        {"id": "product_editor_v1_shortcut_undo", "key": "Z", "description": "Desfaz a ultima operacao da camada atual."},
        {"id": "product_editor_v1_shortcut_redo", "key": "Y", "description": "Refaz a ultima operacao desfeita."},
        {"id": "product_editor_v1_shortcut_left_click", "key": "Mouse esquerdo", "description": "Adiciona valor no modo modificar."},
        {"id": "product_editor_v1_shortcut_right_click", "key": "Mouse direito", "description": "Subtrai valor no modo modificar."},
        {"id": "product_editor_v1_shortcut_shift", "key": "Shift", "description": "Aplica uma passada mais forte."},
        {"id": "product_editor_v1_shortcut_alt", "key": "Alt", "description": "Aplica uma passada mais suave."},
    ],
}


def _normalize_product_record(product: dict[str, Any], default_order: int) -> dict[str, Any]:
    normalized = dict(product)
    normalized["id"] = str(normalized.get("id") or f"produto_{default_order}").strip()
    normalized["order"] = int(normalized.get("order") or default_order)
    normalized["name"] = str(normalized.get("name") or normalized["id"]).strip() or normalized["id"]
    normalized["short_name"] = str(normalized.get("short_name") or normalized["name"]).strip() or normalized["name"]
    normalized["emoji"] = str(normalized.get("emoji") or "\U0001F4E6")
    normalized["family_id"] = str(normalized.get("family_id") or "agro").strip() or "agro"
    normalized["logistics_type_id"] = str(normalized.get("logistics_type_id") or "carga_geral_paletizada").strip()
    normalized["unit"] = str(normalized.get("unit") or "un").strip() or "un"
    normalized["color"] = str(normalized.get("color") or "#4f8593").strip() or "#4f8593"
    normalized["source_kind"] = str(normalized.get("source_kind") or "editor_custom").strip() or "editor_custom"
    normalized["source_column"] = str(normalized.get("source_column") or "").strip()
    normalized["legacy_category"] = str(normalized.get("legacy_category") or "").strip()
    normalized["is_active"] = bool(normalized.get("is_active", True))
    normalized["density_class"] = str(normalized.get("density_class") or "medium").strip() or "medium"
    normalized["value_class"] = str(normalized.get("value_class") or "medium").strip() or "medium"
    normalized["perishable"] = bool(normalized.get("perishable", False))
    normalized["fragile"] = bool(normalized.get("fragile", False))
    normalized["hazardous"] = bool(normalized.get("hazardous", False))
    normalized["temperature_control_required"] = bool(normalized.get("temperature_control_required", False))
    derived_compatible_body_type_ids = [
        str(item).strip()
        for item in _logistics_body_ids_by_type().get(normalized["logistics_type_id"], [])
        if str(item).strip()
    ]
    normalized["compatible_body_type_ids"] = derived_compatible_body_type_ids
    normalized["notes"] = str(normalized.get("notes") or "").strip()
    return normalized


def _logistics_body_ids_by_type(logistics_catalog: dict[str, Any] | None = None) -> dict[str, list[str]]:
    catalog = logistics_catalog or load_product_logistics_type_catalog_payload()
    return {
        str(item.get("id") or "").strip(): [str(body_id).strip() for body_id in item.get("body_type_ids", []) if str(body_id).strip()]
        for item in catalog.get("types", [])
        if str(item.get("id") or "").strip()
    }


def _normalize_product_logistics_type_record(
    logistics_type: dict[str, Any],
    default_order: int,
    *,
    default_record: dict[str, Any] | None = None,
    truck_body_labels_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    base_record = dict(default_record or {})
    normalized = {**base_record, **dict(logistics_type)}
    normalized["id"] = str(normalized.get("id") or f"product_logistics_type_{default_order}").strip()
    normalized["order"] = int(normalized.get("order") or default_order)
    normalized["label"] = str(normalized.get("label") or normalized["id"]).strip() or normalized["id"]
    normalized["description"] = str(normalized.get("description") or "").strip()
    body_type_ids = normalized.get("body_type_ids")
    if body_type_ids is None:
        body_type_ids = base_record.get("body_type_ids") or DEFAULT_LOGISTICS_BODY_IDS_BY_TYPE.get(normalized["id"], [])
    normalized["body_type_ids"] = [str(item).strip() for item in (body_type_ids or []) if str(item).strip()]
    labels_by_id = truck_body_labels_by_id or {}
    normalized["body_labels"] = [labels_by_id.get(body_id, body_id) for body_id in normalized["body_type_ids"]]
    return normalized


def _build_product_record_from_legacy(legacy_item: dict[str, Any], order: int) -> dict[str, Any]:
    category = str(legacy_item.get("category") or "").strip()
    defaults = CATEGORY_PRODUCT_DEFAULTS.get(category, CATEGORY_PRODUCT_DEFAULTS["agro"])
    logistics_type_id = LEGACY_PRODUCT_LOGISTICS_TYPES.get(legacy_item["id"], "carga_geral_paletizada")
    record = {
        "id": legacy_item["id"],
        "order": order,
        "name": legacy_item.get("name") or legacy_item["id"],
        "short_name": legacy_item.get("name") or legacy_item["id"],
        "emoji": legacy_item.get("icon") or "\U0001F4E6",
        "family_id": defaults["family_id"],
        "logistics_type_id": logistics_type_id,
        "unit": legacy_item.get("unit") or "un",
        "color": legacy_item.get("color") or "#4f8593",
        "source_kind": "legacy_seed",
        "source_column": legacy_item.get("source_column") or "",
        "legacy_category": category,
        "is_active": True,
        "density_class": defaults["density_class"],
        "value_class": defaults["value_class"],
        "perishable": defaults["perishable"],
        "fragile": defaults["fragile"],
        "hazardous": defaults["hazardous"],
        "temperature_control_required": defaults["temperature_control_required"],
        "notes": "",
    }
    record.update(PRODUCT_METADATA_OVERRIDES.get(legacy_item["id"], {}))
    return _normalize_product_record(record, order)


def _build_legacy_product_catalog_v2_document() -> dict[str, Any]:
    legacy_products = list(load_json(PRODUCT_CATALOG_PATH))
    return {
        "id": "product_catalog_v2",
        "seed_source": {"kind": "legacy_product_catalog", "path": "../product_catalog.json"},
        "products": [
            _build_product_record_from_legacy(item, index)
            for index, item in enumerate(legacy_products, start=1)
        ],
    }


def _merge_product_catalog_documents(seed_document: dict[str, Any], override_document: dict[str, Any]) -> dict[str, Any]:
    merged_by_id: dict[str, dict[str, Any]] = {
        item["id"]: _normalize_product_record(item, index)
        for index, item in enumerate(seed_document.get("products", []), start=1)
    }
    next_order = max((item["order"] for item in merged_by_id.values()), default=0) + 1
    for raw_item in override_document.get("products", []):
        item_id = str(raw_item.get("id") or "").strip()
        if not item_id:
            continue
        base_item = dict(merged_by_id.get(item_id, {}))
        combined = {**base_item, **dict(raw_item)}
        if "order" not in combined or not combined.get("order"):
            combined["order"] = next_order
            next_order += 1
        merged_by_id[item_id] = _normalize_product_record(combined, int(combined["order"]))

    products = sorted(merged_by_id.values(), key=lambda item: (int(item.get("order") or 0), item.get("name", "")))
    return {
        "id": override_document.get("id") or seed_document.get("id") or "product_catalog_v2",
        "seed_source": override_document.get("seed_source") or seed_document.get("seed_source"),
        "products": products,
    }


def _merge_matrix_items(base_items: list[dict[str, Any]], override_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged_by_id = {str(item.get("id") or ""): dict(item) for item in base_items if str(item.get("id") or "").strip()}
    for item in override_items:
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        merged_by_id[item_id] = dict(item)
    return list(merged_by_id.values())


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_json(path: Path, payload: Any) -> Any:
    path.parent.mkdir(parents=True, exist_ok=True)
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


def load_city_product_demand_seed_payload(path: Path | None = None) -> list[dict[str, Any]]:
    return list(load_json(path or CITY_PRODUCT_DEMAND_SEED_PATH))


def load_product_family_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or PRODUCT_FAMILY_CATALOG_PATH
    families_document = dict(DEFAULT_PRODUCT_FAMILY_DOCUMENT)
    if target.exists():
        payload = load_json(target)
        if isinstance(payload, dict):
            families_document = payload
    merged_by_id = {
        str(item.get("id") or ""): dict(item)
        for item in families_document.get("families", [])
        if str(item.get("id") or "").strip()
    }
    for default_item in DEFAULT_PRODUCT_FAMILY_DOCUMENT.get("families", []):
        merged_by_id.setdefault(default_item["id"], dict(default_item))
    families = sorted(merged_by_id.values(), key=lambda item: (int(item.get("order") or 0), str(item.get("label") or "")))
    return {
        "id": families_document.get("id") or DEFAULT_PRODUCT_FAMILY_DOCUMENT["id"],
        "families": families,
    }


def load_product_logistics_type_catalog_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or PRODUCT_LOGISTICS_TYPE_CATALOG_PATH
    payload = dict(DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT)
    if target.exists():
        raw_payload = load_json(target)
        if isinstance(raw_payload, dict):
            payload = raw_payload
        else:
            payload = {"id": DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT["id"], "types": list(raw_payload)}

    default_types_by_id = {
        str(item.get("id") or ""): dict(item)
        for item in DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT.get("types", [])
        if str(item.get("id") or "").strip()
    }
    truck_body_labels_by_id = {
        str(item.get("id") or ""): str(item.get("label") or item.get("id") or "").strip()
        for item in load_truck_body_catalog_payload().get("types", [])
        if str(item.get("id") or "").strip()
    }

    merged_by_id: dict[str, dict[str, Any]] = {}
    for index, default_item in enumerate(DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT.get("types", []), start=1):
        normalized = _normalize_product_logistics_type_record(
            default_item,
            index,
            truck_body_labels_by_id=truck_body_labels_by_id,
        )
        merged_by_id[normalized["id"]] = normalized

    next_order = max((int(item.get("order") or 0) for item in merged_by_id.values()), default=0) + 1
    for raw_item in payload.get("types", []):
        item_id = str(raw_item.get("id") or "").strip()
        if not item_id:
            continue
        base_record = default_types_by_id.get(item_id)
        order = int(raw_item.get("order") or (base_record or {}).get("order") or next_order)
        if item_id not in merged_by_id and (not raw_item.get("order")):
            next_order += 1
        merged_by_id[item_id] = _normalize_product_logistics_type_record(
            raw_item,
            order,
            default_record=base_record,
            truck_body_labels_by_id=truck_body_labels_by_id,
        )

    return {
        "id": payload.get("id") or DEFAULT_PRODUCT_LOGISTICS_TYPE_DOCUMENT["id"],
        "types": sorted(merged_by_id.values(), key=lambda item: (int(item.get("order") or 0), str(item.get("label") or ""))),
    }
    return load_json(target)


def load_product_catalog_v2_payload(path: Path | None = None) -> dict[str, Any]:
    seed_document = _build_legacy_product_catalog_v2_document()
    target = path or PRODUCT_CATALOG_V2_PATH
    if not target.exists():
        return seed_document
    payload = load_json(target)
    if isinstance(payload, dict) and payload.get("seed_source", {}).get("kind") == "legacy_product_catalog":
        return _merge_product_catalog_documents(seed_document, payload)
    if isinstance(payload, dict) and "products" in payload:
        products = [
            _normalize_product_record(item, index)
            for index, item in enumerate(payload.get("products", []), start=1)
        ]
        return {
            "id": payload.get("id") or "product_catalog_v2",
            "seed_source": payload.get("seed_source"),
            "products": products,
        }
    return seed_document


def load_product_master_v1_1_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or PRODUCT_MASTER_V1_1_PATH
    if not target.exists():
        return {"id": "product_master_v1_1", "version": "v1.1", "products": []}
    payload = load_json(target)
    if isinstance(payload, dict):
        payload.setdefault("id", "product_master_v1_1")
        payload.setdefault("version", "v1.1")
        payload.setdefault("products", [])
        return payload
    return {"id": "product_master_v1_1", "version": "v1.1", "products": list(payload)}


def save_product_master_v1_1_payload(payload: dict[str, Any], path: Path | None = None) -> dict[str, Any]:
    return save_json(path or PRODUCT_MASTER_V1_1_PATH, payload)


def _family_color_lookup() -> dict[str, str]:
    return {
        str(item.get("id") or ""): str(item.get("color") or "#4f8593")
        for item in load_product_family_catalog_payload().get("families", [])
        if str(item.get("id") or "").strip()
    }


def _build_product_record_from_master(master_item: dict[str, Any], order: int, seed_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    product_id = str(master_item.get("id") or "").strip() or f"produto_master_{order}"
    legacy_source_id = str(master_item.get("legacy_source_product_id") or "").strip()
    base_seed = dict(seed_by_id.get(product_id) or seed_by_id.get(legacy_source_id) or {})
    family_id = str(master_item.get("family_id") or base_seed.get("family_id") or "agro").strip() or "agro"
    defaults = CATEGORY_PRODUCT_DEFAULTS.get(family_id, CATEGORY_PRODUCT_DEFAULTS["agro"])
    family_colors = _family_color_lookup()
    logistics_type_id = str(
        master_item.get("logistics_type_id")
        or MASTER_PRODUCT_LOGISTICS_TYPES.get(product_id)
        or base_seed.get("logistics_type_id")
        or "carga_geral_paletizada"
    ).strip()
    record = {
        **base_seed,
        "id": product_id,
        "order": order,
        "name": master_item.get("name") or base_seed.get("name") or product_id,
        "short_name": master_item.get("name") or base_seed.get("short_name") or base_seed.get("name") or product_id,
        "emoji": master_item.get("emoji") or base_seed.get("emoji") or "\U0001F4E6",
        "family_id": family_id,
        "logistics_type_id": logistics_type_id,
        "unit": MASTER_PRODUCT_UNIT_OVERRIDES.get(
            product_id,
            str(base_seed.get("unit") or "mil t").strip() or "mil t",
        ),
        "color": str(base_seed.get("color") or family_colors.get(family_id) or "#4f8593"),
        "source_kind": "master_v1_1_seed",
        "source_column": str(base_seed.get("source_column") or "").strip(),
        "legacy_category": str(base_seed.get("legacy_category") or family_id).strip(),
        "legacy_source_product_id": legacy_source_id or None,
        "is_active": bool(master_item.get("visible", True)),
        "visible": bool(master_item.get("visible", True)),
        "density_class": str(base_seed.get("density_class") or defaults["density_class"]).strip() or defaults["density_class"],
        "value_class": str(base_seed.get("value_class") or defaults["value_class"]).strip() or defaults["value_class"],
        "perishable": bool(base_seed.get("perishable", defaults["perishable"])),
        "fragile": bool(base_seed.get("fragile", defaults["fragile"])),
        "hazardous": bool(base_seed.get("hazardous", defaults["hazardous"])),
        "temperature_control_required": bool(
            base_seed.get("temperature_control_required", defaults["temperature_control_required"])
        ),
        "notes": str(base_seed.get("notes") or "").strip(),
        "inputs": list(master_item.get("inputs") or []),
        "outputs": list(master_item.get("outputs") or []),
        "status": "visible" if bool(master_item.get("visible", True)) else "hidden",
    }
    record.update(MASTER_PRODUCT_METADATA_OVERRIDES.get(product_id, {}))
    return _normalize_product_record(record, order)


def load_product_catalog_v2_master_payload() -> dict[str, Any]:
    legacy_seed_document = _build_legacy_product_catalog_v2_document()
    seed_by_id = {
        str(item.get("id") or ""): dict(item)
        for item in legacy_seed_document.get("products", [])
        if str(item.get("id") or "").strip()
    }
    master_document = load_product_master_v1_1_payload()
    seed_document = {
        "id": "product_catalog_v2_master",
        "seed_source": {"kind": "product_master_v1_1", "path": "product_master_v1_1.json"},
        "products": [
            _build_product_record_from_master(item, index, seed_by_id)
            for index, item in enumerate(master_document.get("products", []), start=1)
        ],
    }

    target = PRODUCT_CATALOG_V2_PATH
    if not target.exists():
        return seed_document
    payload = load_json(target)
    if isinstance(payload, dict) and "products" in payload:
        return _merge_product_catalog_documents(seed_document, payload)
    return seed_document


def load_city_product_supply_matrix_payload(path: Path | None = None) -> dict[str, Any]:
    legacy_items = load_city_product_matrix_payload()
    seed_document = {
        "id": "city_product_supply_matrix_v1",
        "seed_source": {"kind": "legacy_city_product_matrix", "path": "../city_product_matrix.json"},
        "items": legacy_items,
    }
    target = path or CITY_PRODUCT_SUPPLY_MATRIX_PATH
    if not target.exists():
        return seed_document
    payload = load_json(target)
    if not isinstance(payload, dict):
        return seed_document

    items = list(payload.get("items", []))
    seed_source = payload.get("seed_source") or {}
    if seed_source.get("kind") == "legacy_city_product_matrix":
        items = _merge_matrix_items(legacy_items, items)

    return {
        "id": payload.get("id") or seed_document["id"],
        "seed_source": seed_source or seed_document["seed_source"],
        "items": items,
    }


def load_city_product_demand_matrix_payload(path: Path | None = None) -> dict[str, Any]:
    legacy_items = load_city_product_demand_seed_payload()
    seed_document = {
        "id": "city_product_demand_matrix_v1",
        "seed_source": {"kind": "legacy_city_product_demand_matrix", "path": "../city_product_demand_matrix.json"},
        "items": legacy_items,
    }
    target = path or CITY_PRODUCT_DEMAND_MATRIX_PATH
    if not target.exists():
        return seed_document
    payload = load_json(target)
    if isinstance(payload, dict):
        items = list(payload.get("items", []))
        seed_source = payload.get("seed_source") or {}
        if seed_source.get("kind") == "legacy_city_product_demand_matrix":
            items = _merge_matrix_items(legacy_items, items)
        return {
            "id": payload.get("id") or seed_document["id"],
            "seed_source": seed_source or seed_document["seed_source"],
            "items": items,
        }
    return seed_document


def load_region_product_supply_matrix_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or REGION_PRODUCT_SUPPLY_MATRIX_PATH
    if not target.exists():
        return {"id": "region_product_supply_matrix_v1", "items": []}
    payload = load_json(target)
    if isinstance(payload, dict):
        payload.setdefault("id", "region_product_supply_matrix_v1")
        payload.setdefault("items", [])
        return payload
    return {"id": "region_product_supply_matrix_v1", "items": list(payload)}


def load_product_inference_rules_payload(path: Path | None = None) -> dict[str, Any]:
    target = path or PRODUCT_INFERENCE_RULES_PATH
    if not target.exists():
        return dict(DEFAULT_PRODUCT_INFERENCE_RULES)
    return load_json(target)


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


def load_product_editor_payload() -> dict[str, Any]:
    return {
        "screen": load_json(UI_PRODUCT_EDITOR_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
    }


def load_product_editor_v1_payload() -> dict[str, Any]:
    shortcuts = dict(DEFAULT_PRODUCT_EDITOR_V1_SHORTCUTS)
    if UI_SHORTCUTS_PRODUCT_EDITOR_V1_PATH.exists():
        shortcuts = load_json(UI_SHORTCUTS_PRODUCT_EDITOR_V1_PATH)
    return {
        "screen": load_json(UI_PRODUCT_EDITOR_V1_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V1_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
        "shortcuts": shortcuts,
    }


def load_product_editor_v2_payload() -> dict[str, Any]:
    shortcuts = dict(DEFAULT_PRODUCT_EDITOR_V1_SHORTCUTS)
    if UI_SHORTCUTS_PRODUCT_EDITOR_V2_PATH.exists():
        shortcuts = load_json(UI_SHORTCUTS_PRODUCT_EDITOR_V2_PATH)
    return {
        "screen": load_json(UI_PRODUCT_EDITOR_V2_SCREEN_PATH),
        "layout_desktop": load_json(UI_LAYOUT_DESKTOP_PRODUCT_EDITOR_V2_PATH),
        "themes": load_json(UI_MAP_EDITOR_THEMES_PATH),
        "shortcuts": shortcuts,
    }


def _safe_product_field_segment(value: str | None, fallback: str) -> str:
    safe_value = str(value or "").strip().replace("\\", "_").replace("/", "_")
    return safe_value or fallback


def _legacy_product_field_document_path(root_dir: Path, product_id: str, layer: str) -> Path:
    safe_product_id = str(product_id or "").strip() or "produto"
    safe_layer = str(layer or "").strip() or "supply"
    return root_dir / f"{safe_product_id}__{safe_layer}.json"


def _product_field_document_path(root_dir: Path, map_id: str | None, product_id: str, layer: str) -> Path:
    safe_map_id = _safe_product_field_segment(map_id, "map")
    safe_product_id = _safe_product_field_segment(product_id, "produto")
    safe_layer = _safe_product_field_segment(layer, "supply")
    return root_dir / safe_map_id / f"{safe_product_id}__{safe_layer}.json"


def load_product_field_edit_document(product_id: str, layer: str, map_id: str | None = None) -> dict[str, Any]:
    target = _product_field_document_path(PRODUCT_FIELD_EDITS_DIR, map_id, product_id, layer)
    legacy_target = _legacy_product_field_document_path(PRODUCT_FIELD_EDITS_DIR, product_id, layer)
    source_target = target if target.exists() else legacy_target
    if not source_target.exists():
        return {
            "id": f"product_field_edit::{map_id or 'default'}::{product_id}::{layer}",
            "map_id": map_id,
            "product_id": product_id,
            "layer": layer,
            "version": 1,
            "strokes": [],
            "baked_city_values": [],
            "updated_at": None,
        }
    payload = load_json(source_target)
    if not isinstance(payload, dict):
        return {
            "id": f"product_field_edit::{map_id or 'default'}::{product_id}::{layer}",
            "map_id": map_id,
            "product_id": product_id,
            "layer": layer,
            "version": 1,
            "strokes": [],
            "baked_city_values": [],
            "updated_at": None,
        }
    payload.setdefault("id", f"product_field_edit::{map_id or 'default'}::{product_id}::{layer}")
    payload.setdefault("map_id", map_id)
    payload.setdefault("product_id", product_id)
    payload.setdefault("layer", layer)
    payload.setdefault("version", 1)
    payload.setdefault("strokes", [])
    payload.setdefault("baked_city_values", [])
    payload.setdefault("updated_at", None)
    return payload


def save_product_field_edit_document(product_id: str, layer: str, payload: dict[str, Any], map_id: str | None = None) -> dict[str, Any]:
    target = _product_field_document_path(PRODUCT_FIELD_EDITS_DIR, map_id, product_id, layer)
    target.parent.mkdir(parents=True, exist_ok=True)
    return save_json(target, payload)


def load_product_field_baked_document(product_id: str, layer: str, map_id: str | None = None) -> dict[str, Any]:
    target = _product_field_document_path(PRODUCT_FIELD_BAKED_DIR, map_id, product_id, layer)
    legacy_target = _legacy_product_field_document_path(PRODUCT_FIELD_BAKED_DIR, product_id, layer)
    source_target = target if target.exists() else legacy_target
    if not source_target.exists():
        return {
            "id": f"product_field_baked::{map_id or 'default'}::{product_id}::{layer}",
            "map_id": map_id,
            "product_id": product_id,
            "layer": layer,
            "city_values": [],
            "generated_at": None,
        }
    payload = load_json(source_target)
    if not isinstance(payload, dict):
        return {
            "id": f"product_field_baked::{map_id or 'default'}::{product_id}::{layer}",
            "map_id": map_id,
            "product_id": product_id,
            "layer": layer,
            "city_values": [],
            "generated_at": None,
        }
    payload.setdefault("id", f"product_field_baked::{map_id or 'default'}::{product_id}::{layer}")
    payload.setdefault("map_id", map_id)
    payload.setdefault("product_id", product_id)
    payload.setdefault("layer", layer)
    payload.setdefault("city_values", [])
    payload.setdefault("generated_at", None)
    return payload


def save_product_field_baked_document(product_id: str, layer: str, payload: dict[str, Any], map_id: str | None = None) -> dict[str, Any]:
    target = _product_field_document_path(PRODUCT_FIELD_BAKED_DIR, map_id, product_id, layer)
    target.parent.mkdir(parents=True, exist_ok=True)
    return save_json(target, payload)


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
    default_document = {
        "id": "truck_category_catalog_v1",
        "size_tiers": [
            {"id": "leve", "label": "Leve"},
            {"id": "medio", "label": "Medio"},
            {"id": "pesado", "label": "Pesado"},
            {"id": "especial", "label": "Especial"},
        ],
        "base_vehicle_kinds": [
            {"id": "rigido", "label": "Rigido"},
            {"id": "cavalo", "label": "Cavalo"},
            {"id": "combinacao", "label": "Combinacao"},
            {"id": "especial", "label": "Especial"},
        ],
        "axle_configs": [],
        "combination_kinds": [],
        "cargo_scopes": [],
    }

    def merge_locked_options(defaults: list[dict[str, str]], provided: list[dict[str, Any]]) -> list[dict[str, str]]:
        provided_by_id = {
            str(item.get("id") or "").strip(): str(item.get("label") or "").strip()
            for item in provided
            if str(item.get("id") or "").strip()
        }
        return [
            {
                "id": item["id"],
                "label": provided_by_id.get(item["id"], item["label"]),
            }
            for item in defaults
        ]

    target = path or TRUCK_CATEGORY_CATALOG_PATH
    if not target.exists():
        return dict(default_document)
    payload = load_json(target)
    return {
        "id": str(payload.get("id") or default_document["id"]),
        "size_tiers": merge_locked_options(default_document["size_tiers"], list(payload.get("size_tiers") or [])),
        "base_vehicle_kinds": merge_locked_options(default_document["base_vehicle_kinds"], list(payload.get("base_vehicle_kinds") or [])),
        "axle_configs": list(payload.get("axle_configs") or []),
        "combination_kinds": list(payload.get("combination_kinds") or []),
        "cargo_scopes": list(payload.get("cargo_scopes") or []),
    }


TRUCK_SIZE_TIER_ALIASES = {
    "smallest": "leve",
    "small": "leve",
    "medium": "medio",
    "medium_plus": "medio",
    "large": "pesado",
    "large_plus": "pesado",
    "extra_large": "pesado",
    "tractor_small": "pesado",
    "tractor_large": "pesado",
    "tractor_extra_large": "pesado",
    "articulated_large": "pesado",
    "drawbar_large": "pesado",
    "combination_extra_large": "especial",
    "combination_massive": "especial",
    "specialized_max_length": "especial",
    "van": "leve",
    "camionete": "leve",
    "mini_pick_up": "leve",
    "leve": "leve",
    "medio": "medio",
    "pesado": "pesado",
    "especial": "especial",
}

TRUCK_BASE_KIND_ALIASES = {
    "rigid": "rigido",
    "rigido": "rigido",
    "tractor_unit": "cavalo",
    "cavalo": "cavalo",
    "articulated_combination": "combinacao",
    "drawbar_combination": "combinacao",
    "combination": "combinacao",
    "combinacao": "combinacao",
    "special_combination": "especial",
    "specialized": "especial",
    "especial": "especial",
}

TRUCK_COMBINATION_KIND_BY_BASE = {
    "rigido": "single_unit",
    "cavalo": "articulated",
    "combinacao": "combination",
    "especial": "specialized",
}


def _normalize_truck_size_tier(raw_value: Any) -> str:
    source = str(raw_value or "").strip().lower()
    if source in TRUCK_SIZE_TIER_ALIASES:
        return TRUCK_SIZE_TIER_ALIASES[source]
    if any(token in source for token in ("van", "pick", "camionete")):
        return "leve"
    return "pesado"


def _normalize_truck_base_vehicle_kind(raw_value: Any) -> str:
    source = str(raw_value or "").strip().lower()
    if source in TRUCK_BASE_KIND_ALIASES:
        return TRUCK_BASE_KIND_ALIASES[source]
    if "cavalo" in source:
        return "cavalo"
    if any(token in source for token in ("combo", "articul", "reboque")):
        return "combinacao"
    if any(token in source for token in ("especial", "cegonh")):
        return "especial"
    return "rigido"


def _normalize_truck_body_type_ids(raw_ids: list[Any] | tuple[Any, ...] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_ids or []:
        value = str(raw_value or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def normalize_truck_type_record(raw_item: dict[str, Any]) -> dict[str, Any]:
    item = dict(raw_item)
    item["size_tier"] = _normalize_truck_size_tier(item.get("size_tier"))
    item["base_vehicle_kind"] = _normalize_truck_base_vehicle_kind(item.get("base_vehicle_kind"))
    item["combination_kind"] = TRUCK_COMBINATION_KIND_BY_BASE.get(item["base_vehicle_kind"], "single_unit")
    item["cargo_scope"] = ""
    body_ids = _normalize_truck_body_type_ids(
        list(item.get("canonical_body_type_ids") or [])
        or ([item.get("canonical_body_type_id")] if item.get("canonical_body_type_id") else [])
        or ([item.get("preferred_body_type_id")] if item.get("preferred_body_type_id") else [])
    )
    item["canonical_body_type_ids"] = body_ids
    preferred_body_type_id = str(
        item.get("preferred_body_type_id")
        or item.get("canonical_body_type_id")
        or (body_ids[0] if body_ids else "")
        or ""
    ).strip()
    if preferred_body_type_id:
        item["preferred_body_type_id"] = preferred_body_type_id
    else:
        item.pop("preferred_body_type_id", None)
    item.pop("canonical_body_type_id", None)
    item["notes"] = str(item.get("notes") or "").strip()
    if item.get("short_label") is not None:
        item["short_label"] = str(item.get("short_label") or item.get("label") or "").strip()
    return item


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
            item["notes"] = str(edit.get("notes") or item.get("notes") or "").strip()
            preferred_body_type_id = str(edit.get("preferred_body_type_id") or edit.get("canonical_body_type_id") or "").strip()
            if preferred_body_type_id:
                item["preferred_body_type_id"] = preferred_body_type_id
        item = normalize_truck_type_record(item)
        item["is_custom"] = False
        types.append(item)
    for raw_item in custom_document.get("items", []):
        item = dict(raw_item)
        if str(item.get("id") or "") in hidden_ids:
            continue
        item = normalize_truck_type_record(item)
        item["is_custom"] = True
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
