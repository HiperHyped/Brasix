from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime
from threading import Lock
from typing import Any
import unicodedata
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import (
    ASSETS_DIR,
    MAP_DISPLAY_SETTINGS_PATH,
    MAP_EDITOR_POPULATION_BANDS_PATH,
    MAP_LEAFLET_SETTINGS_PATH,
    PRODUCT_CATALOG_V2_PATH,
    PRODUCT_OPERATIONAL_CATALOG_PATH,
    STATIC_DIR,
    TEMPLATE_DIR,
    TRUCK_BODY_CATALOG_PATH,
    TRUCK_CATEGORY_CATALOG_PATH,
    TRUCK_CATALOG_EDITS_PATH,
    TRUCK_CATALOG_HIDDEN_PATH,
    TRUCK_CUSTOM_CATALOG_PATH,
    TRUCK_IMAGE_ASSET_REGISTRY_PATH,
    TRUCK_IMAGE_PROMPT_OVERRIDES_PATH,
    TRUCK_IMAGE_REVIEW_QUEUE_PATH,
    TRUCK_OPERATIONAL_DATA_PATH,
)
from app.game import build_game_world_runtime, build_truck_product_matrix_payload
from app.maptools import RouteGraph, RouteWorkspaceSnapshot
from app.services import (
    AutoRouteError,
    RoutePlannerError,
    build_reference_data_from_city_catalog_payload,
    build_user_city_catalog_payload,
    build_route_plan,
    create_map_bundle,
    delete_map_bundle,
    generate_auto_route_preview,
    generate_truck_image_asset,
    load_active_map_bundle,
    load_city_catalog_payload,
    load_city_product_demand_matrix_payload,
    load_city_product_matrix_payload,
    load_city_product_supply_matrix_payload,
    load_map_editor_payload,
    load_map_editor_v2_payload,
    load_map_viewport_payload,
    load_maps_registry,
    load_product_catalog_v2_master_payload,
    load_product_catalog_v2_payload,
    load_product_editor_payload,
    load_product_editor_v1_payload,
    load_product_editor_v2_payload,
    load_product_editor_v3_payload,
    load_product_family_catalog_payload,
    load_product_field_baked_document,
    load_product_field_edit_document,
    load_product_inference_rules_payload,
    load_product_logistics_type_catalog_payload,
    load_product_master_v1_1_payload,
    load_product_operational_catalog_payload,
    load_product_catalog_payload,
    load_reference_data,
    load_region_product_supply_matrix_payload,
    load_route_planner_payload,
    load_truck_body_catalog_payload,
    load_truck_brand_family_catalog_payload,
    load_truck_category_catalog_payload,
    load_truck_catalog_edits_payload,
    load_truck_catalog_hidden_payload,
    load_truck_custom_catalog_payload,
    load_effective_truck_type_catalog_payload,
    load_truck_gallery_payload,
    load_truck_image_asset_registry_payload,
    load_truck_image_generation_config_payload,
    load_truck_image_prompt_overrides_payload,
    load_truck_image_review_queue_payload,
    load_truck_operational_catalog_payload,
    load_truck_product_compatibility_overrides_payload,
    load_truck_silhouette_catalog_payload,
    load_truck_sprite_2d_catalog_payload,
    load_truck_type_catalog_payload,
    load_ui_payload,
    map_repository_payload,
    review_truck_image_asset,
    save_active_map,
    save_active_map_as,
    save_map_bundle,
    save_product_field_baked_document,
    save_product_field_edit_document,
    save_product_master_v1_1_payload,
    save_product_operational_catalog_payload,
    save_truck_product_compatibility_overrides_payload,
    save_json,
    set_active_map,
)
from app.services.openai_city_autofill import CityAutofillError, autofill_custom_city
from app.services.openai_product_operational_autofill import (
    ProductOperationalAutofillError,
    autofill_product_operational_record,
)
from app.services.openai_truck_operational_autofill import (
    TruckOperationalAutofillError,
    autofill_truck_operational_record,
)
from app.ui.editor_models import (
    CityAutofillRequest,
    CityAutofillResponse,
    CustomCityCatalogDocument,
    AutoRoutePreviewRequest,
    AutoRoutePreviewResponse,
    AutoRouteSaveRequest,
    MapCityCatalogDocument,
    MapActivateRequest,
    MapCreateRequest,
    MapDisplaySettingsDocument,
    MapLeafletSettingsDocument,
    MapSaveRequest,
    PopulationBandDocument,
    ProductEditorCreateRequest,
    ProductMasterCreateRequest,
    ProductFieldLayerSaveRequest,
    ProductEditorUpdateRequest,
    ProductOperationalAutofillRequest,
    ProductOperationalAutofillResponse,
    ProductOperationalAutofillStatusResponse,
    ProductOperationalSaveRequest,
    ProductOperationalSaveResponse,
    RoutePlannerLegResponse,
    RoutePlannerPlanRequest,
    RoutePlannerPlanResponse,
    RoutePlannerStepResponse,
    TruckCatalogClassificationRequest,
    TruckCatalogClassificationResponse,
    TruckCategoryCatalogDocument,
    TruckCategoryCreateRequest,
    TruckCategoryCreateResponse,
    TruckCategoryOptionRecord,
    TruckCatalogHiddenDocument,
    TruckCustomCatalogDocument,
    TruckCustomCreateRequest,
    TruckCustomCreateResponse,
    TruckDeleteRequest,
    TruckDeleteResponse,
    TruckCatalogEditRecord,
    TruckCatalogEditsDocument,
    TruckCustomTypeRecord,
    TruckProductMatrixToggleRequest,
    TruckPromptBuildRequest,
    TruckPromptBuildResponse,
    TruckImageGenerateRequest,
    TruckImageGenerateResponse,
    TruckImageReviewRequest,
    TruckImageReviewResponse,
    TruckOperationalAutofillRequest,
    TruckOperationalAutofillResponse,
    TruckOperationalAutofillStatusResponse,
    TruckOperationalSaveRequest,
    TruckOperationalSaveResponse,
)
from app.services.truck_image_generation import TruckImageGenerationError, build_truck_image_prompt_defaults_payload, build_truck_prompt_items_from_classification


_TRUCK_OPERATIONAL_AUTOFILL_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="brasix-truck-autofill")
_TRUCK_OPERATIONAL_AUTOFILL_LOCK = Lock()
_TRUCK_OPERATIONAL_AUTOFILL_STATUS_BY_TYPE_ID: dict[str, dict[str, Any]] = {}
_PRODUCT_OPERATIONAL_AUTOFILL_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="brasix-product-autofill")
_PRODUCT_OPERATIONAL_AUTOFILL_LOCK = Lock()
_PRODUCT_OPERATIONAL_AUTOFILL_STATUS_BY_PRODUCT_ID: dict[str, dict[str, Any]] = {}


def _truck_operational_autofill_status_defaults(truck_type_id: str) -> dict[str, Any]:
    return {
        "truck_type_id": truck_type_id,
        "status": "idle",
        "message": "",
        "summary": "",
        "provider": None,
        "model": None,
        "error": None,
        "payload": {},
        "started_at": None,
        "finished_at": None,
    }


def _get_truck_operational_autofill_status(truck_type_id: str) -> dict[str, Any]:
    with _TRUCK_OPERATIONAL_AUTOFILL_LOCK:
        current = _TRUCK_OPERATIONAL_AUTOFILL_STATUS_BY_TYPE_ID.get(truck_type_id)
        if current is None:
            return _truck_operational_autofill_status_defaults(truck_type_id)
        return dict(current)


def _product_operational_autofill_status_defaults(product_id: str) -> dict[str, Any]:
    return {
        "product_id": product_id,
        "status": "idle",
        "message": "",
        "summary": "",
        "provider": None,
        "model": None,
        "error": None,
        "payload": {},
        "started_at": None,
        "finished_at": None,
    }


def _get_product_operational_autofill_status(product_id: str) -> dict[str, Any]:
    with _PRODUCT_OPERATIONAL_AUTOFILL_LOCK:
        current = _PRODUCT_OPERATIONAL_AUTOFILL_STATUS_BY_PRODUCT_ID.get(product_id)
        if current is None:
            return _product_operational_autofill_status_defaults(product_id)
        return dict(current)


def _set_truck_operational_autofill_status(truck_type_id: str, **updates: Any) -> dict[str, Any]:
    with _TRUCK_OPERATIONAL_AUTOFILL_LOCK:
        current = dict(_TRUCK_OPERATIONAL_AUTOFILL_STATUS_BY_TYPE_ID.get(truck_type_id) or _truck_operational_autofill_status_defaults(truck_type_id))
        current.update(updates)
        _TRUCK_OPERATIONAL_AUTOFILL_STATUS_BY_TYPE_ID[truck_type_id] = current
        return dict(current)


def _set_product_operational_autofill_status(product_id: str, **updates: Any) -> dict[str, Any]:
    with _PRODUCT_OPERATIONAL_AUTOFILL_LOCK:
        current = dict(
            _PRODUCT_OPERATIONAL_AUTOFILL_STATUS_BY_PRODUCT_ID.get(product_id)
            or _product_operational_autofill_status_defaults(product_id)
        )
        current.update(updates)
        _PRODUCT_OPERATIONAL_AUTOFILL_STATUS_BY_PRODUCT_ID[product_id] = current
        return dict(current)


def _build_truck_operational_autofill_save_request(
    truck_type_id: str,
    current_operational_record: dict[str, Any] | None,
    autofill_payload: dict[str, Any],
) -> TruckOperationalSaveRequest:
    current = dict(current_operational_record or {})

    def pick(field: str) -> Any:
        value = autofill_payload.get(field)
        return current.get(field) if value is None else value

    return TruckOperationalSaveRequest.model_validate(
        {
            "truck_type_id": truck_type_id,
            "payload_weight_kg": pick("payload_weight_kg"),
            "cargo_volume_m3": pick("cargo_volume_m3"),
            "overall_length_m": pick("overall_length_m"),
            "overall_width_m": pick("overall_width_m"),
            "overall_height_m": pick("overall_height_m"),
            "energy_source": current.get("energy_source"),
            "consumption_unit": current.get("consumption_unit"),
            "empty_consumption_per_km": current.get("empty_consumption_per_km"),
            "loaded_consumption_per_km": current.get("loaded_consumption_per_km"),
            "truck_price_brl": pick("truck_price_brl"),
            "base_fixed_cost_brl_per_day": pick("base_fixed_cost_brl_per_day"),
            "base_variable_cost_brl_per_km": pick("base_variable_cost_brl_per_km"),
            "implement_cost_brl": pick("implement_cost_brl"),
            "urban_access_level": current.get("urban_access_level"),
            "road_access_level": current.get("road_access_level"),
            "supported_surface_codes": list(current.get("supported_surface_codes") or []),
            "load_time_minutes": current.get("load_time_minutes"),
            "unload_time_minutes": current.get("unload_time_minutes"),
            "confidence": pick("confidence"),
            "research_basis": pick("research_basis"),
            "source_urls": list(autofill_payload.get("source_urls") or current.get("source_urls") or []),
            "notes": str(autofill_payload.get("notes") or current.get("notes") or "").strip(),
        }
    )


def _run_truck_operational_autofill_job(truck_type_id: str) -> None:
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    _set_truck_operational_autofill_status(
        truck_type_id,
        status="running",
        message="Pesquisando dados operacionais com IA em background.",
        error=None,
        started_at=started_at,
        finished_at=None,
    )

    try:
        effective_catalog = load_effective_truck_type_catalog_payload()
        selected_type = _find_truck_or_404(list(effective_catalog.get("types", [])), truck_type_id)
        current_operational_record = next(
            (
                dict(item)
                for item in load_truck_operational_catalog_payload(TRUCK_OPERATIONAL_DATA_PATH).get("items", [])
                if str(item.get("truck_type_id") or "").strip() == truck_type_id
            ),
            None,
        )
        autofill_result = autofill_truck_operational_record(selected_type, current_operational_record=current_operational_record)
        save_request = _build_truck_operational_autofill_save_request(
            truck_type_id,
            current_operational_record,
            dict(autofill_result.get("payload") or {}),
        )
        save_response = _save_truck_operational_record(save_request)
        finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
        _set_truck_operational_autofill_status(
            truck_type_id,
            status="completed",
            message="Dados operacionais gravados automaticamente no JSON.",
            summary=str(autofill_result.get("summary") or ""),
            provider=str(autofill_result.get("provider") or "") or None,
            model=str(autofill_result.get("model") or "") or None,
            error=None,
            payload=dict(save_response.operational_record or {}),
            started_at=started_at,
            finished_at=finished_at,
        )
    except Exception as exc:
        finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
        _set_truck_operational_autofill_status(
            truck_type_id,
            status="failed",
            message="Falha no autofill operacional em background.",
            error=str(exc),
            finished_at=finished_at,
        )


def _start_truck_operational_autofill_job(truck_type_id: str) -> dict[str, Any]:
    current_status = _get_truck_operational_autofill_status(truck_type_id)
    if current_status.get("status") in {"queued", "running"}:
        return current_status

    queued_at = datetime.now().astimezone().isoformat(timespec="seconds")
    next_status = _set_truck_operational_autofill_status(
        truck_type_id,
        status="queued",
        message="Autofill operacional enviado para processamento em background.",
        summary="",
        error=None,
        payload={},
        started_at=queued_at,
        finished_at=None,
    )
    _TRUCK_OPERATIONAL_AUTOFILL_EXECUTOR.submit(_run_truck_operational_autofill_job, truck_type_id)
    return next_status


def _city_payload(city: Any, reference_data: Any) -> dict[str, Any]:
    top_items = sorted(city.commodity_values.items(), key=lambda item: item[1], reverse=True)
    top_commodities = [
        {
            "id": commodity_id,
            "name": reference_data.commodities[commodity_id].name,
            "icon": reference_data.commodities[commodity_id].icon,
            "unit": reference_data.commodities[commodity_id].unit,
            "color": reference_data.commodities[commodity_id].color,
            "value": value,
        }
        for commodity_id, value in top_items[:5]
        if commodity_id in reference_data.commodities and value > 0
    ]

    return {
        "id": city.id,
        "name": city.name,
        "label": city.label,
        "state_code": city.state_code,
        "state_name": city.state_name,
        "source_region_name": city.source_region_name,
        "population_thousands": city.population_thousands,
        "latitude": city.latitude,
        "longitude": city.longitude,
        "commodity_values": city.commodity_values,
        "commodity_count": len([value for value in city.commodity_values.values() if value > 0]),
        "dominant_commodity_id": city.dominant_commodity_id,
        "top_commodities": top_commodities,
    }


def _build_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_cities = load_city_catalog_payload()
    reference_cities.sort(key=lambda item: item["label"])
    reference_data = build_reference_data_from_city_catalog_payload(city_catalog)
    route_snapshot = active_map.route_network
    products = load_product_catalog_payload()
    products.sort(key=lambda item: (item["category"], item["name"]))
    city_product_matrix = load_city_product_matrix_payload()
    routes = [edge.model_dump(mode="json") for edge in route_snapshot.edges]
    states = sorted({city["state_code"] for city in city_catalog})
    city_payload = [_city_payload(city, reference_data) for city in reference_data.cities.values()]
    city_payload.sort(key=lambda item: item["label"])

    return {
        "ui": load_ui_payload(),
        "map_editor": load_map_editor_payload(
            user_city_catalog=build_user_city_catalog_payload(city_catalog),
        ),
        "map_editor_v2": load_map_editor_v2_payload(),
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "products": products,
        "city_product_matrix": city_product_matrix,
        "routes": routes,
        "route_network": route_snapshot.model_dump(mode="json"),
        "map_viewport": load_map_viewport_payload(),
        "summary": {
            "city_count": len(city_catalog),
            "product_count": len(products),
            "route_count": len(routes),
            "graph_node_count": len(route_snapshot.nodes),
            "states": states,
        },
        "derived": {
            "cities": city_payload,
            "products": [asdict(item) for item in reference_data.commodities.values()],
            "map_config": asdict(reference_data.map_config),
        },
    }


def _build_v2_bootstrap_payload() -> dict[str, Any]:
    payload = _build_bootstrap_payload()
    return {
        "ui": payload["ui"],
        "map_editor": payload["map_editor"],
        "map_editor_v2": payload["map_editor_v2"],
        "map_repository": payload["map_repository"],
        "cities": payload["cities"],
        "routes": payload["routes"],
        "route_network": payload["route_network"],
        "map_viewport": payload["map_viewport"],
        "summary": payload["summary"],
    }


def _build_route_planner_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    route_snapshot = active_map.route_network

    return {
        "ui": load_ui_payload(),
        "route_planner": load_route_planner_payload(),
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "route_network": route_snapshot.model_dump(mode="json"),
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": load_map_editor_payload()["themes"],
            "leaflet_settings": load_map_editor_payload()["leaflet_settings"],
            "display_settings": load_map_editor_payload()["display_settings"],
            "population_bands": load_map_editor_payload()["population_bands"],
            "pin_library": load_map_editor_payload()["pin_library"],
            "graph_node_styles": load_map_editor_payload()["graph_node_styles"],
            "route_surface_types": load_map_editor_payload()["route_surface_types"],
        },
        "summary": {
            "city_count": len(city_catalog),
            "route_count": len(route_snapshot.edges),
            "graph_node_count": len(route_snapshot.nodes),
        },
    }


def _build_product_editor_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_cities = load_city_catalog_payload()
    reference_cities.sort(key=lambda item: item["label"])

    product_catalog = load_product_catalog_v2_master_payload()
    families = load_product_family_catalog_payload()
    logistics_types = load_product_logistics_type_catalog_payload()
    supply_matrix = load_city_product_supply_matrix_payload()
    demand_matrix = load_city_product_demand_matrix_payload()
    region_supply_matrix = load_region_product_supply_matrix_payload()
    inference_rules = load_product_inference_rules_payload()
    product_editor = load_product_editor_payload()
    map_editor = load_map_editor_payload()

    products = sorted(
        product_catalog.get("products", []),
        key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
    )
    selected_product_id = next(
        (item.get("id") for item in products if bool(item.get("is_active", True))),
        products[0].get("id") if products else None,
    )

    return {
        "ui": load_ui_payload(),
        "product_editor": product_editor,
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "reference_cities": reference_cities,
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": map_editor["themes"],
            "leaflet_settings": map_editor["leaflet_settings"],
            "display_settings": map_editor["display_settings"],
        },
        "product_family_catalog": families,
        "product_logistics_type_catalog": logistics_types,
        "product_catalog": {
            **product_catalog,
            "products": products,
        },
        "product_supply_matrix": supply_matrix,
        "product_demand_matrix": demand_matrix,
        "region_product_supply_matrix": region_supply_matrix,
        "product_inference_rules": inference_rules,
        "summary": {
            "city_count": len(city_catalog),
            "product_count": len(products),
            "family_count": len(families.get("families", [])),
            "logistics_type_count": len(logistics_types.get("types", [])),
            "supply_anchor_count": len(supply_matrix.get("items", [])),
            "selected_product_id": selected_product_id,
        },
    }


def _build_product_editor_v1_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_cities = load_city_catalog_payload()
    reference_cities.sort(key=lambda item: item["label"])

    product_catalog = load_product_catalog_v2_master_payload()
    families = load_product_family_catalog_payload()
    logistics_types = load_product_logistics_type_catalog_payload()
    supply_matrix = load_city_product_supply_matrix_payload()
    demand_matrix = load_city_product_demand_matrix_payload()
    region_supply_matrix = load_region_product_supply_matrix_payload()
    inference_rules = load_product_inference_rules_payload()
    product_editor_v1 = load_product_editor_v1_payload()
    map_editor = load_map_editor_payload()

    products = sorted(
        product_catalog.get("products", []),
        key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
    )
    selected_product_id = next(
        (item.get("id") for item in products if bool(item.get("is_active", True))),
        products[0].get("id") if products else None,
    )

    return {
        "ui": load_ui_payload(),
        "product_editor_v1": product_editor_v1,
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "reference_cities": reference_cities,
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": map_editor["themes"],
            "leaflet_settings": map_editor["leaflet_settings"],
            "display_settings": map_editor["display_settings"],
        },
        "product_family_catalog": families,
        "product_logistics_type_catalog": logistics_types,
        "product_catalog": {
            **product_catalog,
            "products": products,
        },
        "product_supply_matrix": supply_matrix,
        "product_demand_matrix": demand_matrix,
        "region_product_supply_matrix": region_supply_matrix,
        "product_inference_rules": inference_rules,
        "summary": {
            "city_count": len(city_catalog),
            "reference_city_count": len(reference_cities),
            "product_count": len(products),
            "family_count": len(families.get("families", [])),
            "logistics_type_count": len(logistics_types.get("types", [])),
            "supply_anchor_count": len(supply_matrix.get("items", [])),
            "selected_product_id": selected_product_id,
        },
    }


def _build_product_editor_v2_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_cities = load_city_catalog_payload()
    reference_cities.sort(key=lambda item: item["label"])

    product_catalog = load_product_catalog_v2_master_payload()
    families = load_product_family_catalog_payload()
    logistics_types = load_product_logistics_type_catalog_payload()
    supply_matrix = load_city_product_supply_matrix_payload()
    demand_matrix = load_city_product_demand_matrix_payload()
    region_supply_matrix = load_region_product_supply_matrix_payload()
    inference_rules = load_product_inference_rules_payload()
    product_editor_v2 = load_product_editor_v2_payload()
    map_editor = load_map_editor_payload()

    products = sorted(
        product_catalog.get("products", []),
        key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
    )
    selected_product_id = next(
        (item.get("id") for item in products if bool(item.get("is_active", True))),
        products[0].get("id") if products else None,
    )

    return {
        "ui": load_ui_payload(),
        "product_editor_v2": product_editor_v2,
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "reference_cities": reference_cities,
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": map_editor["themes"],
            "leaflet_settings": map_editor["leaflet_settings"],
            "display_settings": map_editor["display_settings"],
        },
        "product_family_catalog": families,
        "product_logistics_type_catalog": logistics_types,
        "product_catalog": {
            **product_catalog,
            "products": products,
        },
        "product_supply_matrix": supply_matrix,
        "product_demand_matrix": demand_matrix,
        "region_product_supply_matrix": region_supply_matrix,
        "product_inference_rules": inference_rules,
        "summary": {
            "city_count": len(city_catalog),
            "reference_city_count": len(reference_cities),
            "product_count": len(products),
            "family_count": len(families.get("families", [])),
            "logistics_type_count": len(logistics_types.get("types", [])),
            "supply_anchor_count": len(supply_matrix.get("items", [])),
            "selected_product_id": selected_product_id,
        },
    }


def _build_product_editor_v3_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_cities = load_city_catalog_payload()
    reference_cities.sort(key=lambda item: item["label"])

    product_catalog = load_product_catalog_v2_master_payload()
    families = load_product_family_catalog_payload()
    logistics_types = load_product_logistics_type_catalog_payload()
    supply_matrix = load_city_product_supply_matrix_payload()
    demand_matrix = load_city_product_demand_matrix_payload()
    region_supply_matrix = load_region_product_supply_matrix_payload()
    inference_rules = load_product_inference_rules_payload()
    product_editor_v3 = load_product_editor_v3_payload()
    product_operational_catalog = load_product_operational_catalog_payload()
    map_editor = load_map_editor_payload()

    products = sorted(
        product_catalog.get("products", []),
        key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
    )
    selected_product_id = next(
        (item.get("id") for item in products if bool(item.get("is_active", True))),
        products[0].get("id") if products else None,
    )

    return {
        "ui": load_ui_payload(),
        "product_editor_v3": product_editor_v3,
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "reference_cities": reference_cities,
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": map_editor["themes"],
            "leaflet_settings": map_editor["leaflet_settings"],
            "display_settings": map_editor["display_settings"],
        },
        "product_family_catalog": families,
        "product_logistics_type_catalog": logistics_types,
        "product_catalog": {
            **product_catalog,
            "products": products,
        },
        "product_operational_catalog": product_operational_catalog,
        "product_supply_matrix": supply_matrix,
        "product_demand_matrix": demand_matrix,
        "region_product_supply_matrix": region_supply_matrix,
        "product_inference_rules": inference_rules,
        "summary": {
            "city_count": len(city_catalog),
            "reference_city_count": len(reference_cities),
            "product_count": len(products),
            "family_count": len(families.get("families", [])),
            "logistics_type_count": len(logistics_types.get("types", [])),
            "supply_anchor_count": len(supply_matrix.get("items", [])),
            "operational_product_count": len(product_operational_catalog.get("items", [])),
            "selected_product_id": selected_product_id,
        },
    }


def _build_truck_gallery_bootstrap_payload() -> dict[str, Any]:
    return {
        "ui": load_ui_payload(),
        "truck_gallery": load_truck_gallery_payload(),
        "truck_type_catalog": load_effective_truck_type_catalog_payload(),
        "truck_category_catalog": load_truck_category_catalog_payload(),
        "truck_catalog_edits": load_truck_catalog_edits_payload(),
        "truck_body_catalog": load_truck_body_catalog_payload(),
        "truck_sprite_catalog": load_truck_sprite_2d_catalog_payload(),
        "truck_brand_family_catalog": load_truck_brand_family_catalog_payload(),
        "truck_silhouette_catalog": load_truck_silhouette_catalog_payload(),
        "truck_image_generation": load_truck_image_generation_config_payload(),
        "truck_image_prompt_defaults": build_truck_image_prompt_defaults_payload(),
        "truck_image_prompt_overrides": load_truck_image_prompt_overrides_payload(),
        "truck_image_asset_registry": load_truck_image_asset_registry_payload(),
        "truck_image_review_queue": load_truck_image_review_queue_payload(),
    }


def _build_truck_operational_editor_bootstrap_payload() -> dict[str, Any]:
    gallery_payload = _build_truck_gallery_bootstrap_payload()
    operational_catalog = load_truck_operational_catalog_payload()
    matrix_payload = build_truck_product_matrix_payload()
    products_by_id = {
        str(item.get("id") or ""): dict(item)
        for item in matrix_payload.get("products", [])
        if str(item.get("id") or "").strip()
    }
    related_products_by_truck_type_id: dict[str, list[dict[str, Any]]] = {}
    mpc_summary_by_truck_type_id: dict[str, dict[str, Any]] = {}

    for truck in matrix_payload.get("trucks", []):
        truck_id = str(truck.get("id") or "").strip()
        if not truck_id:
            continue
        related_products_by_truck_type_id[truck_id] = [
            {
                "id": product_id,
                "name": str(product.get("name") or product_id),
                "short_name": str(product.get("short_name") or product.get("name") or product_id),
                "emoji": str(product.get("emoji") or "📦"),
                "family_label": str(product.get("family_label") or ""),
                "logistics_type_label": str(product.get("logistics_type_label") or ""),
                "logistics_body_labels": list(product.get("logistics_body_labels") or []),
            }
            for product_id in truck.get("supported_product_ids", [])
            for product in [products_by_id.get(str(product_id).strip()) or {}]
            if str(product.get("id") or product_id).strip()
        ]
        mpc_summary_by_truck_type_id[truck_id] = {
            "supported_product_count": int(truck.get("supported_product_count") or 0),
            "unsupported_product_count": int(truck.get("unsupported_product_count") or 0),
        }

    return {
        **gallery_payload,
        "truck_operational_catalog": operational_catalog,
        "route_surface_types": load_map_editor_payload().get("route_surface_types", {"types": []}),
        "mpc_products": [
            {
                "id": str(product.get("id") or ""),
                "name": str(product.get("name") or product.get("id") or ""),
                "short_name": str(product.get("short_name") or product.get("name") or product.get("id") or ""),
                "emoji": str(product.get("emoji") or "📦"),
            }
            for product in matrix_payload.get("products", [])
            if str(product.get("id") or "").strip()
        ],
        "mpc_related_products_by_truck_type_id": related_products_by_truck_type_id,
        "mpc_summary_by_truck_type_id": mpc_summary_by_truck_type_id,
        "generated_at": matrix_payload.get("generated_at"),
    }


def _save_truck_operational_record(document: TruckOperationalSaveRequest) -> TruckOperationalSaveResponse:
    effective_catalog = load_effective_truck_type_catalog_payload()
    saved_type = _find_truck_or_404(list(effective_catalog.get("types", [])), document.truck_type_id)
    operational_catalog = load_truck_operational_catalog_payload(TRUCK_OPERATIONAL_DATA_PATH)

    next_record = {
        "truck_type_id": document.truck_type_id,
        "label": str(saved_type.get("label") or document.truck_type_id),
        "size_tier": str(saved_type.get("size_tier") or ""),
        "base_vehicle_kind": str(saved_type.get("base_vehicle_kind") or ""),
        "axle_config": str(saved_type.get("axle_config") or ""),
        "preferred_body_type_id": str(saved_type.get("preferred_body_type_id") or "").strip() or None,
        "payload_weight_kg": document.payload_weight_kg,
        "cargo_volume_m3": document.cargo_volume_m3,
        "overall_length_m": document.overall_length_m,
        "overall_width_m": document.overall_width_m,
        "overall_height_m": document.overall_height_m,
        "energy_source": str(document.energy_source or "").strip() or None,
        "consumption_unit": str(document.consumption_unit or "").strip() or None,
        "empty_consumption_per_km": document.empty_consumption_per_km,
        "loaded_consumption_per_km": document.loaded_consumption_per_km,
        "truck_price_brl": document.truck_price_brl,
        "base_fixed_cost_brl_per_day": document.base_fixed_cost_brl_per_day,
        "base_variable_cost_brl_per_km": document.base_variable_cost_brl_per_km,
        "implement_cost_brl": document.implement_cost_brl,
        "urban_access_level": str(document.urban_access_level or "").strip() or None,
        "road_access_level": str(document.road_access_level or "").strip() or None,
        "supported_surface_codes": [str(item).strip() for item in document.supported_surface_codes if str(item).strip()],
        "load_time_minutes": document.load_time_minutes,
        "unload_time_minutes": document.unload_time_minutes,
        "confidence": str(document.confidence or "").strip() or None,
        "research_basis": str(document.research_basis or "").strip() or None,
        "source_urls": [str(item).strip() for item in document.source_urls if str(item).strip()],
        "notes": str(document.notes or "").strip(),
    }

    next_items = [
        dict(item)
        for item in operational_catalog.get("items", [])
        if str(item.get("truck_type_id") or "").strip() != document.truck_type_id
    ]
    next_items.append(next_record)
    next_items.sort(
        key=lambda item: (
            str(item.get("size_tier") or ""),
            str(item.get("label") or "").strip().lower(),
            str(item.get("truck_type_id") or "").strip(),
        )
    )

    save_json(
        TRUCK_OPERATIONAL_DATA_PATH,
        {
            "id": str(operational_catalog.get("id") or "truck_operational_catalog_v1"),
            "items": next_items,
        },
    )

    refreshed_operational_catalog = load_truck_operational_catalog_payload(TRUCK_OPERATIONAL_DATA_PATH)
    refreshed_effective_catalog = load_effective_truck_type_catalog_payload()
    refreshed_type = _find_truck_or_404(list(refreshed_effective_catalog.get("types", [])), document.truck_type_id)
    refreshed_operational = next(
        (
            dict(item)
            for item in refreshed_operational_catalog.get("items", [])
            if str(item.get("truck_type_id") or "").strip() == document.truck_type_id
        ),
        next_record,
    )
    return TruckOperationalSaveResponse(type_record=refreshed_type, operational_record=refreshed_operational)


def _product_operational_month_value(value: int | float | None, *, fallback: float = 1.0) -> float:
    if value is None:
        return fallback
    return float(value)


def _save_product_operational_record(document: ProductOperationalSaveRequest) -> ProductOperationalSaveResponse:
    catalog_document = load_product_catalog_v2_master_payload()
    saved_product = _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)
    operational_catalog = load_product_operational_catalog_payload(PRODUCT_OPERATIONAL_CATALOG_PATH)

    seasonal = bool(document.is_seasonal)
    next_record = {
        "product_id": document.product_id,
        "name": str(saved_product.get("name") or document.product_id),
        "short_name": str(saved_product.get("short_name") or saved_product.get("name") or document.product_id),
        "family_id": str(saved_product.get("family_id") or "").strip(),
        "logistics_type_id": str(saved_product.get("logistics_type_id") or "").strip(),
        "unit": str(document.unit or saved_product.get("unit") or "").strip() or None,
        "weight_per_unit_kg": document.weight_per_unit_kg,
        "volume_per_unit_m3": document.volume_per_unit_m3,
        "price_reference_brl_per_unit": document.price_reference_brl_per_unit,
        "price_min_brl_per_unit": document.price_min_brl_per_unit,
        "price_max_brl_per_unit": document.price_max_brl_per_unit,
        "is_seasonal": seasonal,
        "seasonality_index_jan": _product_operational_month_value(document.seasonality_index_jan),
        "seasonality_index_feb": _product_operational_month_value(document.seasonality_index_feb),
        "seasonality_index_mar": _product_operational_month_value(document.seasonality_index_mar),
        "seasonality_index_apr": _product_operational_month_value(document.seasonality_index_apr),
        "seasonality_index_may": _product_operational_month_value(document.seasonality_index_may),
        "seasonality_index_jun": _product_operational_month_value(document.seasonality_index_jun),
        "seasonality_index_jul": _product_operational_month_value(document.seasonality_index_jul),
        "seasonality_index_aug": _product_operational_month_value(document.seasonality_index_aug),
        "seasonality_index_sep": _product_operational_month_value(document.seasonality_index_sep),
        "seasonality_index_oct": _product_operational_month_value(document.seasonality_index_oct),
        "seasonality_index_nov": _product_operational_month_value(document.seasonality_index_nov),
        "seasonality_index_dec": _product_operational_month_value(document.seasonality_index_dec),
        "confidence": str(document.confidence or "").strip() or None,
        "research_basis": str(document.research_basis or "").strip() or None,
        "source_urls": [str(item).strip() for item in document.source_urls if str(item).strip()],
        "notes": str(document.notes or "").strip(),
    }

    next_items = [
        dict(item)
        for item in operational_catalog.get("items", [])
        if str(item.get("product_id") or "").strip() != document.product_id
    ]
    next_items.append(next_record)
    next_items.sort(
        key=lambda item: (
            str(item.get("name") or "").strip().lower(),
            str(item.get("product_id") or "").strip(),
        )
    )

    save_product_operational_catalog_payload(
        {
            "id": str(operational_catalog.get("id") or "product_operational_catalog_v1"),
            "items": next_items,
        },
        PRODUCT_OPERATIONAL_CATALOG_PATH,
    )

    refreshed_operational_catalog = load_product_operational_catalog_payload(PRODUCT_OPERATIONAL_CATALOG_PATH)
    refreshed_catalog_document = load_product_catalog_v2_master_payload()
    refreshed_product = _find_product_or_404(list(refreshed_catalog_document.get("products", [])), document.product_id)
    refreshed_operational = next(
        (
            dict(item)
            for item in refreshed_operational_catalog.get("items", [])
            if str(item.get("product_id") or "").strip() == document.product_id
        ),
        next_record,
    )
    return ProductOperationalSaveResponse(product_record=refreshed_product, operational_record=refreshed_operational)


def _build_product_operational_autofill_save_request(
    product_record: dict[str, Any],
    current_operational_record: dict[str, Any] | None,
    autofill_payload: dict[str, Any],
) -> ProductOperationalSaveRequest:
    current = dict(current_operational_record or {})
    merged = {**current, **dict(autofill_payload or {})}
    return ProductOperationalSaveRequest.model_validate(
        {
            "product_id": str(product_record.get("id") or "").strip(),
            "unit": str(merged.get("unit") or product_record.get("unit") or "").strip() or None,
            "weight_per_unit_kg": merged.get("weight_per_unit_kg"),
            "volume_per_unit_m3": merged.get("volume_per_unit_m3"),
            "price_reference_brl_per_unit": merged.get("price_reference_brl_per_unit"),
            "price_min_brl_per_unit": merged.get("price_min_brl_per_unit"),
            "price_max_brl_per_unit": merged.get("price_max_brl_per_unit"),
            "is_seasonal": merged.get("is_seasonal"),
            "seasonality_index_jan": merged.get("seasonality_index_jan"),
            "seasonality_index_feb": merged.get("seasonality_index_feb"),
            "seasonality_index_mar": merged.get("seasonality_index_mar"),
            "seasonality_index_apr": merged.get("seasonality_index_apr"),
            "seasonality_index_may": merged.get("seasonality_index_may"),
            "seasonality_index_jun": merged.get("seasonality_index_jun"),
            "seasonality_index_jul": merged.get("seasonality_index_jul"),
            "seasonality_index_aug": merged.get("seasonality_index_aug"),
            "seasonality_index_sep": merged.get("seasonality_index_sep"),
            "seasonality_index_oct": merged.get("seasonality_index_oct"),
            "seasonality_index_nov": merged.get("seasonality_index_nov"),
            "seasonality_index_dec": merged.get("seasonality_index_dec"),
            "confidence": str(merged.get("confidence") or "").strip() or None,
            "research_basis": str(merged.get("research_basis") or "").strip() or None,
            "source_urls": list(merged.get("source_urls") or []),
            "notes": str(merged.get("notes") or "").strip(),
        }
    )


def _run_product_operational_autofill_job(product_id: str) -> None:
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    _set_product_operational_autofill_status(
        product_id,
        status="running",
        message="Pesquisando dados operacionais do produto...",
        error=None,
        payload={},
        summary="",
        started_at=started_at,
        finished_at=None,
    )
    try:
        catalog_document = load_product_catalog_v2_master_payload()
        selected_product = _find_product_or_404(list(catalog_document.get("products", [])), product_id)
        current_operational_record = next(
            (
                dict(item)
                for item in load_product_operational_catalog_payload(PRODUCT_OPERATIONAL_CATALOG_PATH).get("items", [])
                if str(item.get("product_id") or "").strip() == product_id
            ),
            None,
        )
        autofill_result = autofill_product_operational_record(
            selected_product,
            current_operational_record=current_operational_record,
        )
        save_request = _build_product_operational_autofill_save_request(
            selected_product,
            current_operational_record,
            dict(autofill_result.get("payload") or {}),
        )
        save_response = _save_product_operational_record(save_request)
        finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
        _set_product_operational_autofill_status(
            product_id,
            status="completed",
            message="Dados operacionais do produto gravados automaticamente.",
            summary=str(autofill_result.get("summary") or ""),
            provider=str(autofill_result.get("provider") or "") or None,
            model=str(autofill_result.get("model") or "") or None,
            payload=dict(save_response.operational_record or {}),
            error=None,
            finished_at=finished_at,
        )
    except Exception as exc:
        finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
        _set_product_operational_autofill_status(
            product_id,
            status="failed",
            message="Falha ao gerar os dados operacionais do produto.",
            error=str(exc),
            finished_at=finished_at,
        )


def _start_product_operational_autofill_job(product_id: str) -> dict[str, Any]:
    current_status = _get_product_operational_autofill_status(product_id)
    if str(current_status.get("status") or "") in {"queued", "running"}:
        return current_status
    next_status = _set_product_operational_autofill_status(
        product_id,
        status="queued",
        message="Autofill operacional do produto enfileirado.",
        error=None,
        payload={},
        summary="",
        started_at=None,
        finished_at=None,
    )
    _PRODUCT_OPERATIONAL_AUTOFILL_EXECUTOR.submit(_run_product_operational_autofill_job, product_id)
    return next_status


def _slugify_product(label: str) -> str:
    source = unicodedata.normalize("NFKD", str(label or "")).encode("ascii", "ignore").decode("ascii")
    source = "".join(char.lower() if char.isalnum() else "_" for char in source.strip())
    source = "_".join(part for part in source.split("_") if part)
    return source or "novo_produto"


def _next_product_order(products: list[dict[str, Any]]) -> int:
    orders = [int(item.get("order") or 0) for item in products]
    return (max(orders) if orders else 0) + 1


def _unique_product_id(products: list[dict[str, Any]], label: str) -> str:
    base = _slugify_product(label)
    existing_ids = {str(item.get("id") or "").strip() for item in products}
    candidate = base
    suffix = 2
    while candidate in existing_ids:
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate


def _find_product_or_404(products: list[dict[str, Any]], product_id: str) -> dict[str, Any]:
    product = next((item for item in products if str(item.get("id") or "").strip() == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Produto nao encontrado no catalogo.")
    return product


def _find_truck_or_404(trucks: list[dict[str, Any]], truck_type_id: str) -> dict[str, Any]:
    truck = next((item for item in trucks if str(item.get("id") or "").strip() == truck_type_id), None)
    if truck is None:
        raise HTTPException(status_code=404, detail="Caminhao nao encontrado no catalogo.")
    return truck


def _next_custom_truck_order() -> int:
    effective = load_effective_truck_type_catalog_payload()
    orders = [int(item.get("order") or 0) for item in effective.get("types", [])]
    return (max(orders) if orders else 0) + 1


def _slugify_custom_truck(label: str) -> str:
    source = "".join(char.lower() if char.isalnum() else "_" for char in str(label or "").strip())
    source = "_".join(part for part in source.split("_") if part)
    return source or "novo_caminhao"


def _default_custom_truck_record(label: str) -> TruckCustomTypeRecord:
    order = _next_custom_truck_order()
    slug = _slugify_custom_truck(label)
    return TruckCustomTypeRecord(
        id=f"truck_type_custom_{slug}_{order}",
        order=order,
        label=label,
        short_label=label,
        size_tier="leve",
        base_vehicle_kind="rigido",
        axle_config="4x2",
        canonical_body_type_ids=["truck_body_bau"],
        preferred_body_type_id="truck_body_bau",
        notes="",
    )


def _slugify_category_value(label: str) -> str:
    slug = "".join(char.lower() if char.isalnum() else "_" for char in str(label or "").strip())
    slug = "_".join(part for part in slug.split("_") if part)
    return slug or f"item_{uuid4().hex[:8]}"


def _next_body_order() -> int:
    payload = load_truck_body_catalog_payload()
    orders = [int(item.get("order") or 0) for item in payload.get("types", [])]
    return (max(orders) if orders else 0) + 1


def _category_group_key(group: str) -> str:
    mapping = {
        "axle_config": "axle_configs",
    }
    return mapping[group]


def _auto_route_preview_response(document: AutoRoutePreviewRequest) -> AutoRoutePreviewResponse:
    active_map = load_active_map_bundle()
    cities_by_id = {city.id: city.model_dump(mode="json") for city in active_map.cities}
    graph_nodes_by_id = {node.id: node.model_dump(mode="json") for node in active_map.route_network.nodes}
    nodes_by_id = {**cities_by_id, **graph_nodes_by_id}
    route_surface_types = load_map_editor_v2_payload()["route_surface_types"].get("types", [])
    try:
        preview = generate_auto_route_preview(
            nodes_by_id,
            route_surface_types,
            from_node_id=document.from_node_id,
            to_node_id=document.to_node_id,
            surface_type_id=document.surface_type_id,
            resolution_km=document.resolution_km,
            city_ids=set(cities_by_id),
        )
    except AutoRouteError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AutoRoutePreviewResponse(
        engine=preview.engine,
        profile_id=preview.profile_id,
        surface_type_id=preview.surface_type_id,
        resolution_km=preview.resolution_km,
        raw_point_count=preview.raw_point_count,
        simplified_point_count=preview.simplified_point_count,
        distance_km=preview.distance_km,
        edge=preview.edge,
    )


def _route_planner_plan_response(document: RoutePlannerPlanRequest) -> RoutePlannerPlanResponse:
    active_map = load_active_map_bundle()
    route_surface_types = load_map_editor_payload()["route_surface_types"].get("types", [])
    try:
        plan = build_route_plan(
            active_map.cities,
            active_map.route_network.nodes,
            active_map.route_network.edges,
            route_surface_types,
            route_mode=document.route_mode,
            origin_node_id=document.origin_node_id,
            destination_node_id=document.destination_node_id,
            stop_node_ids=document.stop_node_ids,
        )
    except RoutePlannerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RoutePlannerPlanResponse(
        map_id=active_map.id,
        map_name=active_map.name,
        route_mode=plan.route_mode,
        node_ids=plan.node_ids,
        edge_ids=plan.edge_ids,
        total_distance_km=plan.total_distance_km,
        total_duration_hours=plan.total_duration_hours,
        total_steps=plan.total_steps,
        leg_count=len(plan.legs),
        stop_count=len(document.stop_node_ids),
        legs=[
            RoutePlannerLegResponse(
                index=leg.index,
                start_node_id=leg.start_node_id,
                end_node_id=leg.end_node_id,
                start_label=leg.start_label,
                end_label=leg.end_label,
                distance_km=leg.distance_km,
                duration_hours=leg.duration_hours,
                node_ids=leg.node_ids,
                edge_ids=leg.edge_ids,
                steps=[
                    RoutePlannerStepResponse(
                        sequence=step.sequence,
                        edge_id=step.edge_id,
                        from_node_id=step.from_node_id,
                        to_node_id=step.to_node_id,
                        from_label=step.from_label,
                        to_label=step.to_label,
                        distance_km=step.distance_km,
                        duration_hours=step.duration_hours,
                        surface_type_id=step.surface_type_id,
                        surface_code=step.surface_code,
                        surface_label=step.surface_label,
                        surface_shortcut_key=step.surface_shortcut_key,
                    )
                    for step in leg.steps
                ],
            )
            for leg in plan.legs
        ],
    )


def create_app() -> FastAPI:
    app = FastAPI(title="Brasix")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
    templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def index(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={"page_title": "Brasix | Cidades e Commodities"},
        )

    @app.get("/editores", response_class=HTMLResponse, include_in_schema=False)
    async def editors_hub(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="editors_hub.html",
            context={"page_title": "Brasix | Central de editores"},
        )

    @app.get("/editor/map", response_class=HTMLResponse, include_in_schema=False)
    async def map_editor(request: Request) -> HTMLResponse:
        active_map = load_active_map_bundle()
        editor_ui = load_map_editor_payload(
            user_city_catalog=build_user_city_catalog_payload(
                [city.model_dump(mode="json") for city in active_map.cities],
            ),
        )
        return templates.TemplateResponse(
            request=request,
            name="map_editor.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de mapa")},
        )

    @app.get("/editor/map_v1_1", response_class=HTMLResponse, include_in_schema=False)
    async def map_editor_v1_1(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="map_editor_v1_1.html",
            context={"page_title": "Brasix | Editor de mapa v1.1"},
        )

    @app.get("/editor/map-v2", response_class=HTMLResponse, include_in_schema=False)
    async def map_editor_v2(request: Request) -> HTMLResponse:
        editor_ui = load_map_editor_v2_payload()
        return templates.TemplateResponse(
            request=request,
            name="map_editor_v2.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de mapa v2")},
        )

    @app.get("/planner/route", response_class=HTMLResponse, include_in_schema=False)
    async def route_planner(request: Request) -> HTMLResponse:
        planner_ui = load_route_planner_payload()
        return templates.TemplateResponse(
            request=request,
            name="route_planner.html",
            context={"page_title": planner_ui["screen"].get("page_title", "Brasix | Planejador de rota")},
        )

    @app.get("/editor/fluxos_od_v0", response_class=HTMLResponse, include_in_schema=False)
    async def flow_editor_v0(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="flow_editor_v0.html",
            context={"page_title": "Brasix | Editor de fluxos O/D v0"},
        )

    @app.get("/editor/products", response_class=HTMLResponse, include_in_schema=False)
    async def product_editor(request: Request) -> HTMLResponse:
        editor_ui = load_product_editor_payload()
        return templates.TemplateResponse(
            request=request,
            name="product_editor.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de produtos")},
        )

    @app.get("/editor/products_v1", response_class=HTMLResponse, include_in_schema=False)
    async def product_editor_v1(request: Request) -> HTMLResponse:
        editor_ui = load_product_editor_v1_payload()
        return templates.TemplateResponse(
            request=request,
            name="product_editor_v1.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de produtos v1")},
        )

    @app.get("/editor/products_v2", response_class=HTMLResponse, include_in_schema=False)
    async def product_editor_v2(request: Request) -> HTMLResponse:
        editor_ui = load_product_editor_v2_payload()
        return templates.TemplateResponse(
            request=request,
            name="product_editor_v2.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de produtos v2")},
        )

    @app.get("/editor/products_v3", response_class=HTMLResponse, include_in_schema=False)
    async def product_editor_v3(request: Request) -> HTMLResponse:
        editor_ui = load_product_editor_v3_payload()
        return templates.TemplateResponse(
            request=request,
            name="product_editor_v3.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de produtos v3")},
        )

    @app.get("/viewer/trucks", response_class=HTMLResponse, include_in_schema=False)
    async def truck_gallery(request: Request) -> HTMLResponse:
        gallery_ui = load_truck_gallery_payload()
        return templates.TemplateResponse(
            request=request,
            name="truck_gallery.html",
            context={"page_title": gallery_ui["screen"].get("page_title", "Brasix | Biblioteca de caminhoes")},
        )

    @app.get("/viewer/truck-product-matrix", response_class=HTMLResponse, include_in_schema=False)
    async def truck_product_matrix(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="truck_product_matrix.html",
            context={"page_title": "Brasix | Matriz caminhoes x produtos"},
        )

    @app.get("/viewer/truck-operations", response_class=HTMLResponse, include_in_schema=False)
    async def truck_operational_editor(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="truck_operational_editor.html",
            context={"page_title": "Brasix | Editor operacional de caminhoes"},
        )

    @app.get("/inspector/runtime", response_class=HTMLResponse, include_in_schema=False)
    async def runtime_inspector(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="runtime_inspector.html",
            context={"page_title": "Brasix | Runtime do jogo"},
        )

    @app.get("/api/health")
    async def healthcheck() -> dict[str, Any]:
        payload = _build_bootstrap_payload()
        return {
            "status": "ok",
            "service": "brasix",
            "cities": payload["summary"]["city_count"],
            "products": payload["summary"]["product_count"],
            "routes": payload["summary"]["route_count"],
        }

    @app.get("/api/bootstrap")
    async def bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.get("/api/game/runtime")
    async def game_runtime() -> dict[str, Any]:
        runtime = build_game_world_runtime(include_validation=True)
        return runtime.model_dump(mode="json")

    @app.get("/api/game/runtime/validation")
    async def game_runtime_validation() -> dict[str, Any]:
        runtime = build_game_world_runtime(include_validation=True)
        return runtime.validation.model_dump(mode="json")

    @app.get("/api/editor/map/bootstrap")
    async def map_editor_bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.get("/api/editor/map_v1_1/bootstrap")
    async def map_editor_v1_1_bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.get("/api/editor/map-v2/bootstrap")
    async def map_editor_v2_bootstrap() -> dict[str, Any]:
        return _build_v2_bootstrap_payload()

    @app.get("/api/planner/route/bootstrap")
    async def route_planner_bootstrap() -> dict[str, Any]:
        return _build_route_planner_bootstrap_payload()

    @app.get("/api/editor/products/bootstrap")
    async def product_editor_bootstrap() -> dict[str, Any]:
        return _build_product_editor_bootstrap_payload()

    @app.get("/api/editor/products_v1/bootstrap")
    async def product_editor_v1_bootstrap() -> dict[str, Any]:
        return _build_product_editor_v1_bootstrap_payload()

    @app.get("/api/editor/products_v2/bootstrap")
    async def product_editor_v2_bootstrap() -> dict[str, Any]:
        return _build_product_editor_v2_bootstrap_payload()

    @app.get("/api/editor/products_v3/bootstrap")
    async def product_editor_v3_bootstrap() -> dict[str, Any]:
        return _build_product_editor_v3_bootstrap_payload()

    @app.get("/api/editor/products_v1/field")
    async def product_editor_v1_field(
        map_id: str = Query(min_length=1),
        product_id: str = Query(min_length=1),
        layer: str = Query(pattern="^(supply|demand)$"),
    ) -> dict[str, Any]:
        return {
            "field": load_product_field_edit_document(product_id, layer, map_id=map_id),
            "baked": load_product_field_baked_document(product_id, layer, map_id=map_id),
        }

    @app.get("/api/editor/products_v2/field")
    async def product_editor_v2_field(
        map_id: str = Query(min_length=1),
        product_id: str = Query(min_length=1),
        layer: str = Query(pattern="^(supply|demand)$"),
    ) -> dict[str, Any]:
        return {
            "field": load_product_field_edit_document(product_id, layer, map_id=map_id),
            "baked": load_product_field_baked_document(product_id, layer, map_id=map_id),
        }

    @app.get("/api/editor/products_v3/field")
    async def product_editor_v3_field(
        map_id: str = Query(min_length=1),
        product_id: str = Query(min_length=1),
        layer: str = Query(pattern="^(supply|demand)$"),
    ) -> dict[str, Any]:
        return {
            "field": load_product_field_edit_document(product_id, layer, map_id=map_id),
            "baked": load_product_field_baked_document(product_id, layer, map_id=map_id),
        }

    @app.get("/api/viewer/trucks/bootstrap")
    async def truck_gallery_bootstrap() -> dict[str, Any]:
        return _build_truck_gallery_bootstrap_payload()

    @app.get("/api/viewer/truck-product-matrix")
    async def truck_product_matrix_bootstrap() -> dict[str, Any]:
        return build_truck_product_matrix_payload()

    @app.get("/api/viewer/truck-operations/bootstrap")
    async def truck_operational_editor_bootstrap() -> dict[str, Any]:
        return _build_truck_operational_editor_bootstrap_payload()

    @app.post("/api/viewer/truck-operations/autofill", response_model=TruckOperationalAutofillResponse)
    async def autofill_truck_operational(document: TruckOperationalAutofillRequest) -> TruckOperationalAutofillResponse:
        effective_catalog = load_effective_truck_type_catalog_payload()
        selected_type = _find_truck_or_404(list(effective_catalog.get("types", [])), document.truck_type_id)
        current_operational_record = next(
            (
                dict(item)
                for item in load_truck_operational_catalog_payload(TRUCK_OPERATIONAL_DATA_PATH).get("items", [])
                if str(item.get("truck_type_id") or "").strip() == document.truck_type_id
            ),
            None,
        )

        try:
            result = autofill_truck_operational_record(selected_type, current_operational_record=current_operational_record)
        except TruckOperationalAutofillError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return TruckOperationalAutofillResponse(
            truck_type_id=document.truck_type_id,
            payload=dict(result.get("payload") or {}),
            summary=str(result.get("summary") or ""),
            provider=str(result.get("provider") or "") or None,
            model=str(result.get("model") or "") or None,
        )

    @app.post("/api/viewer/truck-operations/autofill/background", response_model=TruckOperationalAutofillStatusResponse)
    async def start_truck_operational_autofill_background(document: TruckOperationalAutofillRequest) -> TruckOperationalAutofillStatusResponse:
        effective_catalog = load_effective_truck_type_catalog_payload()
        _find_truck_or_404(list(effective_catalog.get("types", [])), document.truck_type_id)
        return TruckOperationalAutofillStatusResponse.model_validate(_start_truck_operational_autofill_job(document.truck_type_id))

    @app.get("/api/viewer/truck-operations/autofill/status", response_model=TruckOperationalAutofillStatusResponse)
    async def truck_operational_autofill_status(truck_type_id: str = Query(min_length=1)) -> TruckOperationalAutofillStatusResponse:
        effective_catalog = load_effective_truck_type_catalog_payload()
        _find_truck_or_404(list(effective_catalog.get("types", [])), truck_type_id)
        return TruckOperationalAutofillStatusResponse.model_validate(_get_truck_operational_autofill_status(truck_type_id))

    @app.put("/api/viewer/truck-operations", response_model=TruckOperationalSaveResponse)
    async def save_truck_operational(document: TruckOperationalSaveRequest) -> TruckOperationalSaveResponse:
        return _save_truck_operational_record(document)

    @app.post("/api/viewer/truck-product-matrix/toggle")
    async def truck_product_matrix_toggle(document: TruckProductMatrixToggleRequest) -> dict[str, Any]:
        current_payload = build_truck_product_matrix_payload()
        truck = _find_truck_or_404(list(current_payload.get("trucks", [])), document.truck_type_id)
        _find_product_or_404(list(current_payload.get("products", [])), document.product_id)

        current_cell = next(
            (
                item
                for item in truck.get("cells", [])
                if str(item.get("product_id") or "").strip() == document.product_id
            ),
            None,
        )
        if current_cell is None:
            raise HTTPException(status_code=404, detail="Celula nao encontrada na matriz.")

        base_compatible = bool(current_cell.get("base_compatible", current_cell.get("compatible")))
        current_effective = bool(current_cell.get("compatible"))
        next_effective = not current_effective
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")

        overrides_document = load_truck_product_compatibility_overrides_payload()
        next_items = [
            item
            for item in overrides_document.get("items", [])
            if not (
                str(item.get("truck_type_id") or "").strip() == document.truck_type_id
                and str(item.get("product_id") or "").strip() == document.product_id
            )
        ]

        if next_effective != base_compatible:
            next_items.append(
                {
                    "truck_type_id": document.truck_type_id,
                    "product_id": document.product_id,
                    "compatible": next_effective,
                    "updated_at": timestamp,
                }
            )

        overrides_document["items"] = sorted(
            next_items,
            key=lambda item: (
                str(item.get("truck_type_id") or ""),
                str(item.get("product_id") or ""),
            ),
        )
        save_truck_product_compatibility_overrides_payload(overrides_document)
        return build_truck_product_matrix_payload()

    @app.post("/api/editor/products/products")
    async def create_product(document: ProductEditorCreateRequest) -> dict[str, Any]:
        catalog_document = load_product_catalog_v2_payload()
        products = list(catalog_document.get("products", []))
        family_ids = {item.get("id") for item in load_product_family_catalog_payload().get("families", [])}
        logistics_type_ids = {item.get("id") for item in load_product_logistics_type_catalog_payload().get("types", [])}

        if document.family_id not in family_ids:
            raise HTTPException(status_code=400, detail="Familia economica invalida para o produto.")
        if document.logistics_type_id not in logistics_type_ids:
            raise HTTPException(status_code=400, detail="Tipo logistico invalido para o produto.")

        source_product = None
        if document.source_product_id:
            source_product = _find_product_or_404(products, str(document.source_product_id).strip())

        product_name = str(document.name or "").strip()
        if not product_name:
            raise HTTPException(status_code=400, detail="O novo produto precisa de um nome.")

        next_order = _next_product_order(products)
        new_product = dict(source_product or {})
        new_product["id"] = _unique_product_id(products, product_name)
        new_product["order"] = next_order
        new_product["name"] = product_name
        new_product["short_name"] = product_name
        new_product["emoji"] = str(document.emoji or new_product.get("emoji") or "\U0001F4E6")
        new_product["family_id"] = document.family_id
        new_product["logistics_type_id"] = document.logistics_type_id
        new_product["unit"] = str(document.unit or new_product.get("unit") or "un").strip() or "un"
        new_product["color"] = str(new_product.get("color") or "#4f8593").strip() or "#4f8593"
        new_product["source_kind"] = "editor_clone" if source_product else "editor_custom"
        new_product["legacy_category"] = str(new_product.get("legacy_category") or "").strip()
        new_product["is_active"] = True
        new_product["density_class"] = str(new_product.get("density_class") or "medium").strip() or "medium"
        new_product["value_class"] = str(new_product.get("value_class") or "medium").strip() or "medium"
        new_product["perishable"] = bool(new_product.get("perishable", False))
        new_product["fragile"] = bool(new_product.get("fragile", False))
        new_product["hazardous"] = bool(new_product.get("hazardous", False))
        new_product["temperature_control_required"] = bool(new_product.get("temperature_control_required", False))
        new_product["notes"] = str(new_product.get("notes") or "").strip()

        products.append(new_product)
        catalog_document["products"] = sorted(
            products,
            key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
        )
        save_json(PRODUCT_CATALOG_V2_PATH, catalog_document)
        saved_catalog_document = load_product_catalog_v2_payload()
        saved_product = _find_product_or_404(list(saved_catalog_document.get("products", [])), new_product["id"])
        return {"product": saved_product}

    @app.put("/api/editor/products/products/{product_id}")
    async def update_product(product_id: str, document: ProductEditorUpdateRequest) -> dict[str, Any]:
        catalog_document = load_product_catalog_v2_payload()
        products = list(catalog_document.get("products", []))
        family_ids = {item.get("id") for item in load_product_family_catalog_payload().get("families", [])}
        logistics_type_ids = {item.get("id") for item in load_product_logistics_type_catalog_payload().get("types", [])}
        product = _find_product_or_404(products, product_id)

        changes = document.model_dump(exclude_none=True)
        if "family_id" in changes and changes["family_id"] not in family_ids:
            raise HTTPException(status_code=400, detail="Familia economica invalida para o produto.")
        if "logistics_type_id" in changes and changes["logistics_type_id"] not in logistics_type_ids:
            raise HTTPException(status_code=400, detail="Tipo logistico invalido para o produto.")

        for key, value in changes.items():
            if key in {"name", "short_name", "emoji", "family_id", "logistics_type_id", "unit", "color", "notes", "density_class", "value_class"}:
                product[key] = str(value).strip()
                continue
            product[key] = value

        if not str(product.get("name") or "").strip():
            raise HTTPException(status_code=400, detail="O produto precisa de um nome.")
        product["short_name"] = str(product.get("short_name") or product["name"]).strip() or product["name"]
        product["id"] = product_id

        catalog_document["products"] = sorted(
            [
                product if str(item.get("id") or "").strip() == product_id else item
                for item in products
            ],
            key=lambda item: (int(item.get("order") or 0), item.get("name", "")),
        )
        save_json(PRODUCT_CATALOG_V2_PATH, catalog_document)
        saved_catalog_document = load_product_catalog_v2_payload()
        saved_product = _find_product_or_404(list(saved_catalog_document.get("products", [])), product_id)
        return {"product": saved_product}

    @app.put("/api/editor/products_v1/field")
    async def save_product_editor_v1_field(document: ProductFieldLayerSaveRequest) -> dict[str, Any]:
        catalog_document = load_product_catalog_v2_payload()
        _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)

        timestamp = document.updated_at or datetime.now().astimezone().isoformat(timespec="seconds")
        field_payload = {
            "id": f"product_field_edit::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "version": 1,
            "updated_at": timestamp,
            "strokes": document.strokes,
            "baked_city_values": document.baked_city_values,
        }
        baked_payload = {
            "id": f"product_field_baked::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "generated_at": timestamp,
            "city_values": document.baked_city_values,
        }

        save_product_field_edit_document(document.product_id, document.layer, field_payload, map_id=document.map_id)
        save_product_field_baked_document(document.product_id, document.layer, baked_payload, map_id=document.map_id)
        return {"field": field_payload, "baked": baked_payload}

    @app.put("/api/editor/products_v2/field")
    async def save_product_editor_v2_field(document: ProductFieldLayerSaveRequest) -> dict[str, Any]:
        catalog_document = load_product_catalog_v2_master_payload()
        _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)

        timestamp = document.updated_at or datetime.now().astimezone().isoformat(timespec="seconds")
        field_payload = {
            "id": f"product_field_edit::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "version": 1,
            "updated_at": timestamp,
            "strokes": document.strokes,
            "baked_city_values": document.baked_city_values,
        }
        baked_payload = {
            "id": f"product_field_baked::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "generated_at": timestamp,
            "city_values": document.baked_city_values,
        }

        save_product_field_edit_document(document.product_id, document.layer, field_payload, map_id=document.map_id)
        save_product_field_baked_document(document.product_id, document.layer, baked_payload, map_id=document.map_id)
        return {"field": field_payload, "baked": baked_payload}

    @app.put("/api/editor/products_v3/field")
    async def save_product_editor_v3_field(document: ProductFieldLayerSaveRequest) -> dict[str, Any]:
        catalog_document = load_product_catalog_v2_master_payload()
        _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)

        timestamp = document.updated_at or datetime.now().astimezone().isoformat(timespec="seconds")
        field_payload = {
            "id": f"product_field_edit::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "version": 1,
            "updated_at": timestamp,
            "strokes": document.strokes,
            "baked_city_values": document.baked_city_values,
        }
        baked_payload = {
            "id": f"product_field_baked::{document.map_id}::{document.product_id}::{document.layer}",
            "map_id": document.map_id,
            "product_id": document.product_id,
            "layer": document.layer,
            "generated_at": timestamp,
            "city_values": document.baked_city_values,
        }

        save_product_field_edit_document(document.product_id, document.layer, field_payload, map_id=document.map_id)
        save_product_field_baked_document(document.product_id, document.layer, baked_payload, map_id=document.map_id)
        return {"field": field_payload, "baked": baked_payload}

    @app.post("/api/editor/products_v2/products")
    async def create_product_v2(document: ProductMasterCreateRequest) -> dict[str, Any]:
        master_document = load_product_master_v1_1_payload()
        master_products = list(master_document.get("products", []))
        family_ids = {item.get("id") for item in load_product_family_catalog_payload().get("families", [])}
        logistics_type_ids = {item.get("id") for item in load_product_logistics_type_catalog_payload().get("types", [])}

        if document.family_id not in family_ids:
            raise HTTPException(status_code=400, detail="Familia economica invalida para o produto.")
        if document.logistics_type_id not in logistics_type_ids:
            raise HTTPException(status_code=400, detail="Tipo logistico invalido para o produto.")

        known_product_ids = {str(item.get("id") or "").strip() for item in master_products}
        for product_id in [*document.inputs, *document.outputs]:
            if product_id not in known_product_ids:
                raise HTTPException(status_code=400, detail=f"Produto relacionado invalido: {product_id}.")

        product_name = str(document.name or "").strip()
        if not product_name:
            raise HTTPException(status_code=400, detail="O novo produto precisa de um nome.")

        product_id = _unique_product_id(master_products, product_name)
        new_master_product = {
            "id": product_id,
            "name": product_name,
            "emoji": str(document.emoji or "\U0001F4E6"),
            "family_id": document.family_id,
            "logistics_type_id": document.logistics_type_id,
            "visible": document.status == "visible",
            "legacy_source_product_id": None,
            "inputs": list(dict.fromkeys(document.inputs)),
            "outputs": list(dict.fromkeys(document.outputs)),
        }
        master_products.append(new_master_product)
        master_document["products"] = master_products
        save_product_master_v1_1_payload(master_document)

        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        for layer in ("supply", "demand"):
            save_product_field_edit_document(
                product_id,
                layer,
                {
                    "id": f"product_field_edit::{document.map_id}::{product_id}::{layer}",
                    "map_id": document.map_id,
                    "product_id": product_id,
                    "layer": layer,
                    "version": 1,
                    "updated_at": timestamp,
                    "strokes": [],
                    "baked_city_values": [],
                },
                map_id=document.map_id,
            )
            save_product_field_baked_document(
                product_id,
                layer,
                {
                    "id": f"product_field_baked::{document.map_id}::{product_id}::{layer}",
                    "map_id": document.map_id,
                    "product_id": product_id,
                    "layer": layer,
                    "generated_at": timestamp,
                    "city_values": [],
                },
                map_id=document.map_id,
            )

        catalog_document = load_product_catalog_v2_master_payload()
        product = _find_product_or_404(list(catalog_document.get("products", [])), product_id)
        return {"product": product}

    @app.post("/api/editor/products_v3/products")
    async def create_product_v3(document: ProductMasterCreateRequest) -> dict[str, Any]:
        return await create_product_v2(document)

    @app.put("/api/editor/products_v3/operational", response_model=ProductOperationalSaveResponse)
    async def save_product_operational(document: ProductOperationalSaveRequest) -> ProductOperationalSaveResponse:
        return _save_product_operational_record(document)

    @app.post("/api/editor/products_v3/operational/autofill", response_model=ProductOperationalAutofillResponse)
    async def autofill_product_operational(document: ProductOperationalAutofillRequest) -> ProductOperationalAutofillResponse:
        catalog_document = load_product_catalog_v2_master_payload()
        selected_product = _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)
        current_operational_record = next(
            (
                dict(item)
                for item in load_product_operational_catalog_payload(PRODUCT_OPERATIONAL_CATALOG_PATH).get("items", [])
                if str(item.get("product_id") or "").strip() == document.product_id
            ),
            None,
        )
        try:
            result = autofill_product_operational_record(selected_product, current_operational_record=current_operational_record)
        except ProductOperationalAutofillError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return ProductOperationalAutofillResponse(
            product_id=document.product_id,
            payload=dict(result.get("payload") or {}),
            summary=str(result.get("summary") or ""),
            provider=str(result.get("provider") or "") or None,
            model=str(result.get("model") or "") or None,
        )

    @app.post("/api/editor/products_v3/operational/autofill/background", response_model=ProductOperationalAutofillStatusResponse)
    async def start_product_operational_autofill_background(document: ProductOperationalAutofillRequest) -> ProductOperationalAutofillStatusResponse:
        catalog_document = load_product_catalog_v2_master_payload()
        _find_product_or_404(list(catalog_document.get("products", [])), document.product_id)
        return ProductOperationalAutofillStatusResponse.model_validate(_start_product_operational_autofill_job(document.product_id))

    @app.get("/api/editor/products_v3/operational/autofill/status", response_model=ProductOperationalAutofillStatusResponse)
    async def product_operational_autofill_status(product_id: str = Query(min_length=1)) -> ProductOperationalAutofillStatusResponse:
        catalog_document = load_product_catalog_v2_master_payload()
        _find_product_or_404(list(catalog_document.get("products", [])), product_id)
        return ProductOperationalAutofillStatusResponse.model_validate(_get_product_operational_autofill_status(product_id))

    @app.post("/api/viewer/trucks/generate", response_model=TruckImageGenerateResponse)
    async def generate_truck_image(document: TruckImageGenerateRequest) -> TruckImageGenerateResponse:
        try:
            asset, review_queue = generate_truck_image_asset(document)
        except TruckImageGenerationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return TruckImageGenerateResponse(asset=asset, review_queue=review_queue)

    @app.post("/api/viewer/trucks/custom-types", response_model=TruckCustomCreateResponse)
    async def create_custom_truck_type(document: TruckCustomCreateRequest) -> TruckCustomCreateResponse:
        custom_document = TruckCustomCatalogDocument.model_validate(load_truck_custom_catalog_payload())
        next_record = _default_custom_truck_record(str(document.label or "Novo caminhao").strip() or "Novo caminhao")
        custom_document.items.append(next_record)
        save_json(TRUCK_CUSTOM_CATALOG_PATH, custom_document.model_dump(mode="json"))
        effective_catalog = load_effective_truck_type_catalog_payload()
        saved_type = next((item for item in effective_catalog.get("types", []) if item.get("id") == next_record.id), None)
        if saved_type is None:
            raise HTTPException(status_code=500, detail="Falha ao criar o novo caminhao.")
        return TruckCustomCreateResponse(type_record=saved_type)

    @app.put("/api/viewer/trucks/delete", response_model=TruckDeleteResponse)
    async def delete_truck_type(document: TruckDeleteRequest) -> TruckDeleteResponse:
        type_id = str(document.truck_type_id or "").strip()
        effective_catalog = load_effective_truck_type_catalog_payload()
        current_type = next((item for item in effective_catalog.get("types", []) if item.get("id") == type_id), None)
        if current_type is None:
            raise HTTPException(status_code=404, detail="Caminhao nao encontrado na galeria.")

        if current_type.get("is_custom"):
            custom_catalog = TruckCustomCatalogDocument.model_validate(load_truck_custom_catalog_payload())
            custom_catalog.items = [item for item in custom_catalog.items if item.id != type_id]
            save_json(TRUCK_CUSTOM_CATALOG_PATH, custom_catalog.model_dump(mode="json"))
        else:
            hidden_catalog = TruckCatalogHiddenDocument.model_validate(load_truck_catalog_hidden_payload())
            hidden_ids = [item for item in hidden_catalog.hidden_type_ids if item != type_id]
            hidden_ids.append(type_id)
            hidden_catalog.hidden_type_ids = hidden_ids
            save_json(TRUCK_CATALOG_HIDDEN_PATH, hidden_catalog.model_dump(mode="json"))

        edits_document = TruckCatalogEditsDocument.model_validate(load_truck_catalog_edits_payload())
        edits_document.items = [item for item in edits_document.items if item.truck_type_id != type_id]
        save_json(TRUCK_CATALOG_EDITS_PATH, edits_document.model_dump(mode="json"))

        prompt_overrides_payload = load_truck_image_prompt_overrides_payload()
        prompt_overrides_payload["overrides"] = [
            item for item in prompt_overrides_payload.get("overrides", [])
            if item.get("truck_type_id") != type_id and item.get("reference_truck_type_id") != type_id
        ]
        save_json(TRUCK_IMAGE_PROMPT_OVERRIDES_PATH, prompt_overrides_payload)

        asset_registry_payload = load_truck_image_asset_registry_payload()
        asset_registry_payload["items"] = [
            item for item in asset_registry_payload.get("items", [])
            if item.get("truck_type_id") != type_id and item.get("reference_truck_type_id") != type_id
        ]
        save_json(TRUCK_IMAGE_ASSET_REGISTRY_PATH, asset_registry_payload)

        review_queue_payload = load_truck_image_review_queue_payload()
        review_queue_payload["pending_type_ids"] = [
            item for item in review_queue_payload.get("pending_type_ids", [])
            if item != type_id
        ]
        if review_queue_payload.get("last_reviewed_type_id") == type_id:
            review_queue_payload["last_reviewed_type_id"] = None
        save_json(TRUCK_IMAGE_REVIEW_QUEUE_PATH, review_queue_payload)

        return TruckDeleteResponse(truck_type_id=type_id)

    @app.post("/api/viewer/trucks/category-options", response_model=TruckCategoryCreateResponse)
    async def create_truck_category_option(document: TruckCategoryCreateRequest) -> TruckCategoryCreateResponse:
        label = str(document.label or "").strip()
        if not label:
            raise HTTPException(status_code=400, detail="O nome da categoria nao pode ficar vazio.")

        if document.group == "canonical_body_type_id":
            body_catalog = load_truck_body_catalog_payload()
            slug = _slugify_category_value(label)
            option_id = f"truck_body_custom_{slug}"
            existing_ids = {str(item.get("id") or "") for item in body_catalog.get("types", [])}
            suffix = 1
            while option_id in existing_ids:
                suffix += 1
                option_id = f"truck_body_custom_{slug}_{suffix}"
            new_body = {
                "id": option_id,
                "order": _next_body_order(),
                "label": label,
                "category": "custom",
                "sprite_module_kind": "custom",
                "cargo_role": "custom",
                "prompt_hint": label.lower(),
            }
            body_catalog.setdefault("types", []).append(new_body)
            save_json(TRUCK_BODY_CATALOG_PATH, body_catalog)
            return TruckCategoryCreateResponse(group=document.group, option=new_body)

        category_catalog = TruckCategoryCatalogDocument.model_validate(load_truck_category_catalog_payload())
        group_key = _category_group_key(document.group)
        option_list = list(getattr(category_catalog, group_key))
        slug = _slugify_category_value(label)
        existing_ids = {item.id for item in option_list}
        option_id = slug
        suffix = 1
        while option_id in existing_ids:
            suffix += 1
            option_id = f"{slug}_{suffix}"
        option = TruckCategoryOptionRecord(id=option_id, label=label)
        option_list.append(option)
        setattr(category_catalog, group_key, option_list)
        save_json(TRUCK_CATEGORY_CATALOG_PATH, category_catalog.model_dump(mode="json"))
        return TruckCategoryCreateResponse(group=document.group, option=option.model_dump(mode="json"))

    @app.put("/api/viewer/trucks/review", response_model=TruckImageReviewResponse)
    async def review_truck_image(document: TruckImageReviewRequest) -> TruckImageReviewResponse:
        try:
            asset, review_queue = review_truck_image_asset(document)
        except TruckImageGenerationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return TruckImageReviewResponse(asset=asset, review_queue=review_queue)

    @app.put("/api/viewer/trucks/classification", response_model=TruckCatalogClassificationResponse)
    async def save_truck_classification(document: TruckCatalogClassificationRequest) -> TruckCatalogClassificationResponse:
        base_catalog = load_truck_type_catalog_payload()
        custom_catalog = TruckCustomCatalogDocument.model_validate(load_truck_custom_catalog_payload())
        is_base_type = any(item.get("id") == document.truck_type_id for item in base_catalog.get("types", []))
        is_custom_type = any(item.id == document.truck_type_id for item in custom_catalog.items)
        if not is_base_type and not is_custom_type:
            raise HTTPException(status_code=404, detail="Caminhao nao encontrado no catalogo.")

        preferred_body_type_id = str(document.preferred_body_type_id or "").strip() or None
        if preferred_body_type_id:
            body_catalog = load_truck_body_catalog_payload()
            if not any(item.get("id") == preferred_body_type_id for item in body_catalog.get("types", [])):
                raise HTTPException(status_code=400, detail="Implemento preferido nao encontrado no catalogo.")

        if is_custom_type:
            next_items: list[TruckCustomTypeRecord] = []
            for item in custom_catalog.items:
                if item.id == document.truck_type_id:
                    next_items.append(
                        item.model_copy(
                            update={
                                "label": document.label,
                                "short_label": document.label,
                                "size_tier": document.size_tier,
                                "base_vehicle_kind": document.base_vehicle_kind,
                                "axle_config": document.axle_config,
                                "canonical_body_type_ids": [preferred_body_type_id] if preferred_body_type_id else list(item.canonical_body_type_ids),
                                "preferred_body_type_id": preferred_body_type_id,
                                "notes": document.notes,
                            }
                        )
                    )
                else:
                    next_items.append(item)
            custom_catalog.items = next_items
            save_json(TRUCK_CUSTOM_CATALOG_PATH, custom_catalog.model_dump(mode="json"))
        else:
            edits_document = TruckCatalogEditsDocument.model_validate(load_truck_catalog_edits_payload())
            next_record = TruckCatalogEditRecord(
                truck_type_id=document.truck_type_id,
                label=document.label,
                size_tier=document.size_tier,
                base_vehicle_kind=document.base_vehicle_kind,
                axle_config=document.axle_config,
                preferred_body_type_id=preferred_body_type_id,
                notes=document.notes,
            )
            replaced = False
            next_items: list[TruckCatalogEditRecord] = []
            for item in edits_document.items:
                if item.truck_type_id == document.truck_type_id:
                    next_items.append(next_record)
                    replaced = True
                else:
                    next_items.append(item)
            if not replaced:
                next_items.append(next_record)
            edits_document.items = next_items
            save_json(TRUCK_CATALOG_EDITS_PATH, edits_document.model_dump(mode="json"))

        if preferred_body_type_id:
            prompt_overrides_payload = load_truck_image_prompt_overrides_payload()
            override_items = list(prompt_overrides_payload.get("overrides", []))
            for item in override_items:
                if item.get("truck_type_id") == document.truck_type_id:
                    item["preferred_body_type_id"] = preferred_body_type_id
            save_json(TRUCK_IMAGE_PROMPT_OVERRIDES_PATH, prompt_overrides_payload)

        if preferred_body_type_id:
            asset_registry_payload = load_truck_image_asset_registry_payload()
            for item in asset_registry_payload.get("items", []):
                if item.get("truck_type_id") == document.truck_type_id:
                    item["canonical_body_type_id"] = preferred_body_type_id
            save_json(TRUCK_IMAGE_ASSET_REGISTRY_PATH, asset_registry_payload)

        effective_catalog = load_effective_truck_type_catalog_payload()
        saved_type = next(
            (item for item in effective_catalog.get("types", []) if item.get("id") == document.truck_type_id),
            None,
        )
        if saved_type is None:
            raise HTTPException(status_code=500, detail="Falha ao reconstruir o catalogo efetivo do caminhao.")
        return TruckCatalogClassificationResponse(type_record=saved_type)

    @app.post("/api/viewer/trucks/build-prompt", response_model=TruckPromptBuildResponse)
    async def build_truck_prompt(document: TruckPromptBuildRequest) -> TruckPromptBuildResponse:
        try:
            prompt_items = build_truck_prompt_items_from_classification(
                truck_type_id=document.truck_type_id,
                label=document.label,
                size_tier=document.size_tier,
                base_vehicle_kind=document.base_vehicle_kind,
                axle_config=document.axle_config,
                preferred_body_type_id=document.preferred_body_type_id,
                notes=document.notes,
            )
        except TruckImageGenerationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return TruckPromptBuildResponse(
            prompt_items=prompt_items,
            prompt_summary=f"{document.label} com {len(prompt_items)} item(ns) de prompt.",
        )

    @app.put("/api/editor/map/population-bands")
    async def save_population_bands(document: PopulationBandDocument) -> dict[str, Any]:
        editor_payload = load_map_editor_payload()
        pin_ids = {pin["id"] for pin in editor_payload["pin_library"].get("pins", [])}
        invalid_pin_ids = sorted({band.pin_id for band in document.bands if band.pin_id not in pin_ids})
        if invalid_pin_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Pins nao encontrados na biblioteca: {', '.join(invalid_pin_ids)}.",
            )

        payload = document.model_dump(mode="json")
        payload["bands"] = sorted(
            payload["bands"],
            key=lambda band: (band["legend_order"], band["min_population_thousands"]),
        )
        return save_json(MAP_EDITOR_POPULATION_BANDS_PATH, payload)

    @app.put("/api/editor/map/display-settings")
    async def save_display_settings(document: MapDisplaySettingsDocument) -> dict[str, Any]:
        return save_json(MAP_DISPLAY_SETTINGS_PATH, document.model_dump(mode="json"))

    @app.put("/api/editor/map/custom-cities")
    async def save_custom_cities(document: CustomCityCatalogDocument) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        graph_node_ids = {node.id for node in active_map.route_network.nodes}
        duplicate_city_ids = sorted({city.id for city in document.cities if city.id in graph_node_ids})
        if duplicate_city_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de cidades nao podem repetir ids de nos de ligacao: {', '.join(duplicate_city_ids)}.",
            )

        base_cities = [city for city in active_map.cities if not city.is_user_created]
        active_map.cities = sorted(
            [*base_cities, *document.cities],
            key=lambda city: city.label,
        )
        save_map_bundle(active_map)
        payload = document.model_dump(mode="json")
        payload["cities"] = sorted(payload["cities"], key=lambda city: city["label"])
        return payload

    @app.put("/api/editor/map/cities")
    async def save_map_cities(document: MapCityCatalogDocument) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        graph_node_ids = {node.id for node in active_map.route_network.nodes}
        duplicate_city_ids = sorted({city.id for city in document.cities if city.id in graph_node_ids})
        if duplicate_city_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de cidades nao podem repetir ids de nos de ligacao: {', '.join(duplicate_city_ids)}.",
            )

        if active_map.id == "map_brasix_default":
            protected_base_cities = [city for city in active_map.cities if not city.is_user_created]
            editable_cities = [city for city in document.cities if city.is_user_created]
            active_map.cities = sorted([*protected_base_cities, *editable_cities], key=lambda city: city.label)
        else:
            active_map.cities = sorted(document.cities, key=lambda city: city.label)

        save_map_bundle(active_map)
        return {
            "id": document.id,
            "cities": [city.model_dump(mode="json") for city in active_map.cities],
        }

    @app.post("/api/editor/map/custom-cities/autofill", response_model=CityAutofillResponse)
    async def autofill_custom_city_payload(document: CityAutofillRequest) -> CityAutofillResponse:
        if not document.city.is_user_created:
            raise HTTPException(status_code=400, detail="O autofill so pode ser usado em cidades criadas no editor.")

        try:
            autofilled_city = autofill_custom_city(document.city)
        except CityAutofillError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return CityAutofillResponse(city=autofilled_city)

    @app.post("/api/editor/map-v2/route-preview", response_model=AutoRoutePreviewResponse)
    async def preview_auto_route(document: AutoRoutePreviewRequest) -> AutoRoutePreviewResponse:
        return _auto_route_preview_response(document)

    @app.post("/api/editor/map_v1_1/route-preview", response_model=AutoRoutePreviewResponse)
    async def preview_auto_route_v1_1(document: AutoRoutePreviewRequest) -> AutoRoutePreviewResponse:
        return _auto_route_preview_response(document)

    @app.post("/api/planner/route/plan", response_model=RoutePlannerPlanResponse)
    async def route_planner_plan(document: RoutePlannerPlanRequest) -> RoutePlannerPlanResponse:
        return _route_planner_plan_response(document)

    @app.put("/api/editor/map/leaflet-settings")
    async def save_leaflet_settings(document: MapLeafletSettingsDocument) -> dict[str, Any]:
        viewport_payload = load_map_viewport_payload()
        tile_layer_ids = {item["id"] for item in viewport_payload.get("tile_layers", [])}
        if document.base_tile_layer_id not in tile_layer_ids:
            raise HTTPException(status_code=400, detail="Camada base do Leaflet nao encontrada.")
        if document.label_tile_layer_id and document.label_tile_layer_id not in tile_layer_ids:
            raise HTTPException(status_code=400, detail="Camada de labels do Leaflet nao encontrada.")
        return save_json(MAP_LEAFLET_SETTINGS_PATH, document.model_dump(mode="json"))

    @app.put("/api/editor/map/route-network")
    async def save_route_network(snapshot: RouteWorkspaceSnapshot) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        city_ids = {city.id for city in active_map.cities}
        graph_node_ids = {node.id for node in snapshot.nodes}
        duplicate_node_ids = sorted(city_ids & graph_node_ids)
        if duplicate_node_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de nos do grafo nao podem repetir ids de cidades: {', '.join(duplicate_node_ids)}.",
            )

        editor_payload = load_map_editor_payload()
        valid_style_ids = {item["id"] for item in editor_payload["graph_node_styles"].get("styles", [])}
        invalid_style_ids = sorted({node.style_id for node in snapshot.nodes if node.style_id not in valid_style_ids})
        if invalid_style_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Estilos de no nao encontrados na biblioteca: {', '.join(invalid_style_ids)}.",
            )

        allowed_node_ids = city_ids | graph_node_ids
        invalid_edges = sorted(
            edge.id
            for edge in snapshot.edges
            if edge.from_node_id not in allowed_node_ids or edge.to_node_id not in allowed_node_ids
        )
        if invalid_edges:
            raise HTTPException(
                status_code=400,
                detail=f"As rotas precisam ligar apenas cidades ou nos do grafo conhecidos: {', '.join(invalid_edges)}.",
            )

        active_map.route_network = snapshot
        save_map_bundle(active_map)
        return snapshot.model_dump(mode="json")

    @app.post("/api/editor/map-v2/route-save")
    async def save_auto_route(document: AutoRouteSaveRequest) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        city_ids = {city.id for city in active_map.cities}
        graph_node_ids = {node.id for node in active_map.route_network.nodes}
        allowed_node_ids = city_ids | graph_node_ids

        edge = document.edge
        if edge.from_node_id not in allowed_node_ids or edge.to_node_id not in allowed_node_ids:
            raise HTTPException(status_code=400, detail="A rota automatica precisa ligar duas cidades do mapa ativo.")

        if any(existing_edge.id == edge.id for existing_edge in active_map.route_network.edges):
            raise HTTPException(status_code=400, detail="O id da rota automatica ja existe no mapa ativo.")

        active_map.route_network.edges.append(edge)
        save_map_bundle(active_map)
        return {
            "edge": edge.model_dump(mode="json"),
            "route_count": len(active_map.route_network.edges),
            "map_id": active_map.id,
        }

    @app.get("/api/editor/maps")
    async def editor_maps() -> dict[str, Any]:
        return map_repository_payload()

    @app.post("/api/editor/maps/new")
    async def create_editor_map(request: MapCreateRequest) -> dict[str, Any]:
        registry, bundle = create_map_bundle(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.post("/api/editor/maps/save")
    async def save_editor_map(request: MapSaveRequest) -> dict[str, Any]:
        registry, bundle = save_active_map(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.post("/api/editor/maps/save-as")
    async def save_editor_map_as(request: MapSaveRequest) -> dict[str, Any]:
        registry, bundle = save_active_map_as(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.put("/api/editor/maps/active")
    async def activate_editor_map(request: MapActivateRequest) -> dict[str, Any]:
        registry, bundle = set_active_map(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.delete("/api/editor/maps/{map_id}")
    async def delete_editor_map(map_id: str) -> dict[str, Any]:
        try:
            registry = delete_map_bundle(map_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        active_entry = next(item for item in registry.maps if item.id == registry.active_map_id)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": active_entry.model_dump(mode="json"),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
        }

    @app.get("/api/routes/path")
    async def route_path(
        start_city_id: str = Query(min_length=1),
        end_city_id: str = Query(min_length=1),
    ) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
        reference_data = build_reference_data_from_city_catalog_payload(city_catalog)
        graph = RouteGraph(list(reference_data.cities.values()), active_map.route_network.edges, active_map.route_network.nodes)

        try:
            path = graph.shortest_path(start_city_id=start_city_id, end_city_id=end_city_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "node_ids": path.node_ids,
            "city_ids": path.city_ids,
            "edge_ids": path.edge_ids,
            "distance_km": path.distance_km,
            "steps": path.steps,
        }

    return app


