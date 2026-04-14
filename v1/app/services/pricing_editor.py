from __future__ import annotations

from datetime import datetime
from typing import Any

from app.config import PRICING_EDITOR_DIR
from app.services.city_editor import build_city_editor_bootstrap_payload
from app.services.data_loader import (
    load_json,
    load_map_editor_payload,
    load_map_viewport_payload,
    load_product_operational_catalog_payload,
    load_truck_operational_catalog_payload,
    load_ui_payload,
    save_json,
)
from app.services.diesel_cost_editor import build_diesel_cost_editor_document
from app.services.map_repository import load_active_map_bundle, map_repository_payload


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_number(value: Any, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    return float(numeric)


def _clamp_number(value: Any, fallback: float, minimum: float = 0.0, maximum: float | None = None) -> float:
    numeric = _safe_number(value, fallback)
    numeric = max(minimum, numeric)
    if maximum is not None:
        numeric = min(maximum, numeric)
    return numeric


def _timestamp(value: Any = None) -> str:
    raw = _safe_text(value)
    if raw:
        return raw
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _document_path(map_id: str):
    safe_map_id = _safe_text(map_id) or "default"
    return PRICING_EDITOR_DIR / f"{safe_map_id}.json"


def _ordered_population_bands(population_bands: Any) -> list[dict[str, Any]]:
    raw_bands = population_bands.get("bands") if isinstance(population_bands, dict) else population_bands
    items = [item for item in (raw_bands or []) if isinstance(item, dict) and _safe_text(item.get("id"))]
    return sorted(
        items,
        key=lambda item: (
            int(_safe_number(item.get("legend_order"), 0)),
            _safe_number(item.get("min_population_thousands"), 0),
        ),
    )


def _interpolate_legacy_opening_price(
    *,
    band_index: int,
    band_count: int,
    small_anchor_brl: float,
    medium_anchor_brl: float,
    large_anchor_brl: float,
) -> float:
    if band_count <= 1:
        ratio = 0.5
    else:
        ratio = band_index / max(1, band_count - 1)

    if ratio <= 0.5:
        blend = ratio / 0.5
        value = small_anchor_brl + ((medium_anchor_brl - small_anchor_brl) * blend)
    else:
        blend = (ratio - 0.5) / 0.5
        value = medium_anchor_brl + ((large_anchor_brl - medium_anchor_brl) * blend)

    return round(value / 5000) * 5000


def _default_opening_band_prices(population_bands: Any) -> dict[str, float]:
    ordered_bands = _ordered_population_bands(population_bands)
    if not ordered_bands:
        return {}

    return {
        _safe_text(band.get("id")): float(
            _interpolate_legacy_opening_price(
                band_index=index,
                band_count=len(ordered_bands),
                small_anchor_brl=90000,
                medium_anchor_brl=160000,
                large_anchor_brl=280000,
            )
        )
        for index, band in enumerate(ordered_bands)
        if _safe_text(band.get("id"))
    }


def _normalize_opening_band_prices(opening: dict[str, Any], population_bands: Any, default_prices: dict[str, float]) -> dict[str, float]:
    ordered_bands = _ordered_population_bands(population_bands)
    if not ordered_bands:
        return {}

    raw_band_prices = opening.get("band_base_prices_brl") if isinstance(opening.get("band_base_prices_brl"), dict) else {}
    legacy_small_brl = _safe_number(opening.get("base_price_small_brl"), 90000)
    legacy_medium_brl = _safe_number(opening.get("base_price_medium_brl"), 160000)
    legacy_large_brl = _safe_number(opening.get("base_price_large_brl"), 280000)

    normalized: dict[str, float] = {}
    for index, band in enumerate(ordered_bands):
        band_id = _safe_text(band.get("id"))
        if not band_id:
            continue
        default_value = _safe_number(
            default_prices.get(band_id),
            _interpolate_legacy_opening_price(
                band_index=index,
                band_count=len(ordered_bands),
                small_anchor_brl=legacy_small_brl,
                medium_anchor_brl=legacy_medium_brl,
                large_anchor_brl=legacy_large_brl,
            ),
        )
        legacy_value = _interpolate_legacy_opening_price(
            band_index=index,
            band_count=len(ordered_bands),
            small_anchor_brl=legacy_small_brl,
            medium_anchor_brl=legacy_medium_brl,
            large_anchor_brl=legacy_large_brl,
        )
        candidate_value = raw_band_prices.get(band_id, legacy_value)
        normalized[band_id] = round(_clamp_number(candidate_value, default_value, 1000), 2)

    return normalized


def _default_document(map_id: str, population_bands: Any = None) -> dict[str, Any]:
    default_band_prices = _default_opening_band_prices(population_bands)
    return {
        "id": f"pricing_editor::{map_id}",
        "map_id": map_id,
        "version": 1,
        "updated_at": _timestamp(),
        "scenario": {
            "selected_difficulty": "standard",
            "sort_mode": "opening_desc",
        },
        "opening": {
            "band_base_prices_brl": default_band_prices,
            "population_weight": 0.40,
            "outbound_weight": 0.35,
            "inbound_weight": 0.25,
            "market_count_weight": 0.35,
            "market_volume_weight": 0.65,
            "city_multiplier_max": 0.45,
        },
        "freight": {
            "base_rate_brl_per_tkm": 0.34,
            "floor_margin_multiplier": 1.12,
            "short_haul_markup_max": 0.18,
            "long_haul_discount_max": 0.12,
            "short_haul_reference_km": 180,
            "long_haul_reference_km": 1400,
            "handling_base_brl": 120,
            "handling_per_t_brl": 4,
            "cycle_distance_multiplier": 1.65,
            "driver_daily_km": 650,
            "hq_origin_bonus": 0.06,
            "hq_destination_bonus": 0.03,
            "hq_bonus_cap": 0.08,
            "specialization_bulk_multiplier": 0.98,
            "specialization_general_multiplier": 1.00,
            "specialization_palletized_multiplier": 1.08,
            "specialization_refrigerated_multiplier": 1.28,
            "specialization_tank_multiplier": 1.26,
            "specialization_live_multiplier": 1.35,
            "specialization_hazardous_multiplier": 1.32,
            "value_class_medium_multiplier": 1.05,
            "value_class_high_multiplier": 1.12,
            "perishable_multiplier": 1.08,
            "fragile_multiplier": 1.06,
            "temperature_control_multiplier": 1.10,
            "hazardous_multiplier": 1.12,
            "diesel_origin_weight": 0.70,
            "diesel_destination_weight": 0.30,
        },
        "capital": {
            "base_initial_cash_brl": 1000000,
            "reserve_days": 20,
            "buffer_percent": 0.08,
            "hard_liquidity_factor": 0.65,
            "standard_liquidity_factor": 1.00,
            "sandbox_liquidity_factor": 1.60,
        },
    }


def _normalize_document(raw_document: dict[str, Any] | None, map_id: str, population_bands: Any = None) -> dict[str, Any]:
    defaults = _default_document(map_id, population_bands)
    source = raw_document if isinstance(raw_document, dict) else {}

    scenario = source.get("scenario") if isinstance(source.get("scenario"), dict) else {}
    opening = source.get("opening") if isinstance(source.get("opening"), dict) else {}
    freight = source.get("freight") if isinstance(source.get("freight"), dict) else {}
    capital = source.get("capital") if isinstance(source.get("capital"), dict) else {}

    selected_difficulty = _safe_text(scenario.get("selected_difficulty")) or defaults["scenario"]["selected_difficulty"]
    if selected_difficulty not in {"hard", "standard", "sandbox"}:
        selected_difficulty = defaults["scenario"]["selected_difficulty"]

    sort_mode = _safe_text(scenario.get("sort_mode")) or defaults["scenario"]["sort_mode"]
    if sort_mode not in {"opening_desc", "opening_asc", "alphabetical"}:
        sort_mode = defaults["scenario"]["sort_mode"]

    return {
        "id": _safe_text(source.get("id")) or defaults["id"],
        "map_id": _safe_text(source.get("map_id")) or map_id,
        "version": 1,
        "updated_at": _timestamp(source.get("updated_at")),
        "scenario": {
            "selected_difficulty": selected_difficulty,
            "sort_mode": sort_mode,
        },
        "opening": {
            "band_base_prices_brl": _normalize_opening_band_prices(
                opening,
                population_bands,
                defaults["opening"]["band_base_prices_brl"],
            ),
            "population_weight": round(_clamp_number(opening.get("population_weight"), defaults["opening"]["population_weight"], 0, 1), 4),
            "outbound_weight": round(_clamp_number(opening.get("outbound_weight"), defaults["opening"]["outbound_weight"], 0, 1), 4),
            "inbound_weight": round(_clamp_number(opening.get("inbound_weight"), defaults["opening"]["inbound_weight"], 0, 1), 4),
            "market_count_weight": round(_clamp_number(opening.get("market_count_weight"), defaults["opening"]["market_count_weight"], 0, 1), 4),
            "market_volume_weight": round(_clamp_number(opening.get("market_volume_weight"), defaults["opening"]["market_volume_weight"], 0, 1), 4),
            "city_multiplier_max": round(_clamp_number(opening.get("city_multiplier_max"), defaults["opening"]["city_multiplier_max"], 0, 2), 4),
        },
        "freight": {
            "base_rate_brl_per_tkm": round(_clamp_number(freight.get("base_rate_brl_per_tkm"), defaults["freight"]["base_rate_brl_per_tkm"], 0.01), 4),
            "floor_margin_multiplier": round(_clamp_number(freight.get("floor_margin_multiplier"), defaults["freight"]["floor_margin_multiplier"], 1, 5), 4),
            "short_haul_markup_max": round(_clamp_number(freight.get("short_haul_markup_max"), defaults["freight"]["short_haul_markup_max"], 0, 2), 4),
            "long_haul_discount_max": round(_clamp_number(freight.get("long_haul_discount_max"), defaults["freight"]["long_haul_discount_max"], 0, 2), 4),
            "short_haul_reference_km": round(_clamp_number(freight.get("short_haul_reference_km"), defaults["freight"]["short_haul_reference_km"], 1), 2),
            "long_haul_reference_km": round(_clamp_number(freight.get("long_haul_reference_km"), defaults["freight"]["long_haul_reference_km"], 50), 2),
            "handling_base_brl": round(_clamp_number(freight.get("handling_base_brl"), defaults["freight"]["handling_base_brl"], 0), 2),
            "handling_per_t_brl": round(_clamp_number(freight.get("handling_per_t_brl"), defaults["freight"]["handling_per_t_brl"], 0), 4),
            "cycle_distance_multiplier": round(_clamp_number(freight.get("cycle_distance_multiplier"), defaults["freight"]["cycle_distance_multiplier"], 1, 4), 4),
            "driver_daily_km": round(_clamp_number(freight.get("driver_daily_km"), defaults["freight"]["driver_daily_km"], 50), 2),
            "hq_origin_bonus": round(_clamp_number(freight.get("hq_origin_bonus"), defaults["freight"]["hq_origin_bonus"], 0, 1), 4),
            "hq_destination_bonus": round(_clamp_number(freight.get("hq_destination_bonus"), defaults["freight"]["hq_destination_bonus"], 0, 1), 4),
            "hq_bonus_cap": round(_clamp_number(freight.get("hq_bonus_cap"), defaults["freight"]["hq_bonus_cap"], 0, 1), 4),
            "specialization_bulk_multiplier": round(_clamp_number(freight.get("specialization_bulk_multiplier"), defaults["freight"]["specialization_bulk_multiplier"], 0.1, 5), 4),
            "specialization_general_multiplier": round(_clamp_number(freight.get("specialization_general_multiplier"), defaults["freight"]["specialization_general_multiplier"], 0.1, 5), 4),
            "specialization_palletized_multiplier": round(_clamp_number(freight.get("specialization_palletized_multiplier"), defaults["freight"]["specialization_palletized_multiplier"], 0.1, 5), 4),
            "specialization_refrigerated_multiplier": round(_clamp_number(freight.get("specialization_refrigerated_multiplier"), defaults["freight"]["specialization_refrigerated_multiplier"], 0.1, 5), 4),
            "specialization_tank_multiplier": round(_clamp_number(freight.get("specialization_tank_multiplier"), defaults["freight"]["specialization_tank_multiplier"], 0.1, 5), 4),
            "specialization_live_multiplier": round(_clamp_number(freight.get("specialization_live_multiplier"), defaults["freight"]["specialization_live_multiplier"], 0.1, 5), 4),
            "specialization_hazardous_multiplier": round(_clamp_number(freight.get("specialization_hazardous_multiplier"), defaults["freight"]["specialization_hazardous_multiplier"], 0.1, 5), 4),
            "value_class_medium_multiplier": round(_clamp_number(freight.get("value_class_medium_multiplier"), defaults["freight"]["value_class_medium_multiplier"], 0.1, 5), 4),
            "value_class_high_multiplier": round(_clamp_number(freight.get("value_class_high_multiplier"), defaults["freight"]["value_class_high_multiplier"], 0.1, 5), 4),
            "perishable_multiplier": round(_clamp_number(freight.get("perishable_multiplier"), defaults["freight"]["perishable_multiplier"], 0.1, 5), 4),
            "fragile_multiplier": round(_clamp_number(freight.get("fragile_multiplier"), defaults["freight"]["fragile_multiplier"], 0.1, 5), 4),
            "temperature_control_multiplier": round(_clamp_number(freight.get("temperature_control_multiplier"), defaults["freight"]["temperature_control_multiplier"], 0.1, 5), 4),
            "hazardous_multiplier": round(_clamp_number(freight.get("hazardous_multiplier"), defaults["freight"]["hazardous_multiplier"], 0.1, 5), 4),
            "diesel_origin_weight": round(_clamp_number(freight.get("diesel_origin_weight"), defaults["freight"]["diesel_origin_weight"], 0, 1), 4),
            "diesel_destination_weight": round(_clamp_number(freight.get("diesel_destination_weight"), defaults["freight"]["diesel_destination_weight"], 0, 1), 4),
        },
        "capital": {
            "base_initial_cash_brl": round(
                _clamp_number(
                    capital.get("base_initial_cash_brl"),
                    defaults["capital"]["base_initial_cash_brl"],
                    0,
                    2000000,
                ),
                2,
            ),
            "reserve_days": round(_clamp_number(capital.get("reserve_days"), defaults["capital"]["reserve_days"], 0), 2),
            "buffer_percent": round(_clamp_number(capital.get("buffer_percent"), defaults["capital"]["buffer_percent"], 0, 2), 4),
            "hard_liquidity_factor": round(_clamp_number(capital.get("hard_liquidity_factor"), defaults["capital"]["hard_liquidity_factor"], 0, 3), 4),
            "standard_liquidity_factor": round(_clamp_number(capital.get("standard_liquidity_factor"), defaults["capital"]["standard_liquidity_factor"], 0, 3), 4),
            "sandbox_liquidity_factor": round(_clamp_number(capital.get("sandbox_liquidity_factor"), defaults["capital"]["sandbox_liquidity_factor"], 0, 4), 4),
        },
    }


def load_pricing_editor_document(map_id: str, population_bands: Any = None) -> dict[str, Any]:
    target = _document_path(map_id)
    if not target.exists():
        return _default_document(map_id, population_bands)
    payload = load_json(target)
    return _normalize_document(payload if isinstance(payload, dict) else {}, map_id, population_bands)


def save_pricing_editor_document(*, map_id: str, document: dict[str, Any], updated_at: str | None = None) -> dict[str, Any]:
    map_editor = load_map_editor_payload()
    normalized = _normalize_document(document, map_id, map_editor.get("population_bands"))
    normalized["updated_at"] = _timestamp(updated_at)
    return save_json(_document_path(map_id), normalized)


def _supported_product_ids_for_truck(truck: dict[str, Any]) -> list[str]:
    direct_ids = [
        _safe_text(product_id)
        for product_id in truck.get("supported_product_ids", [])
        if _safe_text(product_id)
    ]
    if direct_ids:
        return direct_ids
    return [
        _safe_text(cell.get("product_id"))
        for cell in truck.get("cells", [])
        if bool(cell.get("compatible")) and _safe_text(cell.get("product_id"))
    ]


def _build_truck_records(
    *,
    truck_matrix_payload: dict[str, Any] | None = None,
    runtime: Any | None = None,
    operational_by_truck_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    from app.game.runtime import build_game_world_runtime
    from app.game.truck_product_matrix import build_truck_product_matrix_payload

    if truck_matrix_payload is None:
        if runtime is not None:
            truck_matrix_payload = build_truck_product_matrix_payload(runtime=runtime)
        else:
            truck_matrix_payload = build_truck_product_matrix_payload(include_validation=False)

    if operational_by_truck_id is None:
        if runtime is None:
            runtime = build_game_world_runtime(include_validation=False)
        operational_by_truck_id = runtime.catalogs.truck_operational_by_id

    trucks: list[dict[str, Any]] = []
    for truck in truck_matrix_payload.get("trucks", []):
        truck_id = _safe_text(truck.get("id"))
        if not truck_id:
            continue
        operational = operational_by_truck_id.get(truck_id) or {}
        truck_price_brl = _safe_number(operational.get("truck_price_brl"))
        implement_cost_brl = _safe_number(operational.get("implement_cost_brl"))
        supported_product_ids = _supported_product_ids_for_truck(truck)
        trucks.append(
            {
                "id": truck_id,
                "label": _safe_text(truck.get("label")) or truck_id,
                "short_label": _safe_text(truck.get("short_label")) or _safe_text(truck.get("label")) or truck_id,
                "size_tier": _safe_text(truck.get("size_tier")),
                "base_vehicle_kind": _safe_text(truck.get("base_vehicle_kind")),
                "axle_config": _safe_text(truck.get("axle_config")),
                "body_labels": [
                    _safe_text(label)
                    for label in truck.get("body_labels", [])
                    if _safe_text(label)
                ],
                "supported_product_ids": supported_product_ids,
                "supported_product_count": int(truck.get("supported_product_count") or len(supported_product_ids)),
                "payload_weight_kg": _safe_number(operational.get("payload_weight_kg")),
                "cargo_volume_m3": _safe_number(operational.get("cargo_volume_m3")),
                "fuel_tank_l": _safe_number(operational.get("fuel_tank_l")),
                "empty_consumption_per_km": _safe_number(operational.get("empty_consumption_per_km")),
                "loaded_consumption_per_km": _safe_number(operational.get("loaded_consumption_per_km")),
                "truck_price_brl": truck_price_brl,
                "implement_cost_brl": implement_cost_brl,
                "purchase_price_brl": round(truck_price_brl + implement_cost_brl, 2),
                "base_fixed_cost_brl_per_day": _safe_number(operational.get("base_fixed_cost_brl_per_day")),
                "base_variable_cost_brl_per_km": _safe_number(operational.get("base_variable_cost_brl_per_km")),
            }
        )

    trucks.sort(key=lambda item: (item.get("purchase_price_brl") or 0, _safe_text(item.get("label"))))
    return trucks


def _apply_route_planner_distances(
    *,
    cities: list[Any],
    graph_nodes: list[Any],
    edges: list[Any],
    route_surface_types: list[dict[str, Any]],
    freight_flows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not freight_flows:
        return []

    if not cities or not graph_nodes or not edges:
        return [
            {
                **dict(flow),
                "distance_km": round(_safe_number(flow.get("distance_km")), 1),
                "distance_source": _safe_text(flow.get("distance_source")) or "fallback",
            }
            for flow in freight_flows
        ]

    from app.services.route_planner import build_route_plan

    distance_cache: dict[tuple[str, str], float] = {}
    enriched_flows: list[dict[str, Any]] = []

    for flow in freight_flows:
        next_flow = dict(flow)
        origin_id = _safe_text(flow.get("origin_id"))
        destination_id = _safe_text(flow.get("destination_id"))
        fallback_distance_km = round(_safe_number(flow.get("distance_km")), 1)
        planner_distance_km = 0.0

        if origin_id and destination_id and origin_id != destination_id:
            cache_key = (origin_id, destination_id)
            if cache_key not in distance_cache:
                try:
                    plan = build_route_plan(
                        cities,
                        graph_nodes,
                        edges,
                        route_surface_types,
                        route_mode="shortest",
                        origin_node_id=origin_id,
                        destination_node_id=destination_id,
                    )
                except Exception:
                    distance_cache[cache_key] = fallback_distance_km
                else:
                    distance_cache[cache_key] = round(_safe_number(plan.total_distance_km, fallback_distance_km), 1)
            planner_distance_km = distance_cache[cache_key]

        next_flow["distance_km"] = planner_distance_km or fallback_distance_km
        next_flow["distance_source"] = "route_planner" if planner_distance_km > 0 else (_safe_text(flow.get("distance_source")) or "fallback")
        enriched_flows.append(next_flow)

    return enriched_flows


def build_pricing_editor_bootstrap_payload(
    *,
    truck_matrix_payload: dict[str, Any] | None = None,
    runtime: Any | None = None,
    city_payload: dict[str, Any] | None = None,
    product_operational_catalog: dict[str, Any] | None = None,
    truck_operational_catalog: dict[str, Any] | None = None,
    operational_by_truck_id: dict[str, dict[str, Any]] | None = None,
    apply_route_planner_distances: bool = True,
) -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_payload = city_payload or build_city_editor_bootstrap_payload()
    map_editor = load_map_editor_payload()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    product_operational_catalog = product_operational_catalog or load_product_operational_catalog_payload()
    truck_operational_catalog = truck_operational_catalog or load_truck_operational_catalog_payload()
    operational_by_truck_id = operational_by_truck_id or {
        _safe_text(item.get("truck_type_id")): dict(item)
        for item in truck_operational_catalog.get("items", [])
        if _safe_text(item.get("truck_type_id"))
    }
    trucks = _build_truck_records(
        truck_matrix_payload=truck_matrix_payload,
        runtime=runtime,
        operational_by_truck_id=operational_by_truck_id,
    )
    diesel_document = build_diesel_cost_editor_document(active_map.id, cities)
    pricing_document = load_pricing_editor_document(active_map.id, map_editor.get("population_bands"))
    if apply_route_planner_distances:
        route_network = getattr(active_map, "route_network", None)
        route_surface_types = map_editor.get("route_surface_types") if isinstance(map_editor.get("route_surface_types"), dict) else {}
        freight_flows = _apply_route_planner_distances(
            cities=active_map.cities,
            graph_nodes=list(getattr(route_network, "nodes", []) or []),
            edges=list(getattr(route_network, "edges", []) or []),
            route_surface_types=list(route_surface_types.get("types", []) or []),
            freight_flows=list(city_payload.get("freight_flows", [])),
        )
    else:
        freight_flows = [dict(flow) for flow in city_payload.get("freight_flows", [])]

    return {
        "ui": load_ui_payload(),
        "map_repository": map_repository_payload(),
        "active_map": {
            "id": active_map.id,
            "name": active_map.name,
            "slug": active_map.slug,
        },
        "map_viewport": load_map_viewport_payload(),
        "map_editor": {
            "themes": map_editor.get("themes"),
            "leaflet_settings": map_editor.get("leaflet_settings"),
            "population_bands": map_editor.get("population_bands"),
            "pin_library": map_editor.get("pin_library"),
        },
        "cities": list(city_payload.get("cities", [])),
        "freight_flows": freight_flows,
        "products": list(city_payload.get("products", [])),
        "product_operational_catalog": product_operational_catalog,
        "diesel_document": diesel_document,
        "trucks": trucks,
        "pricing_document": pricing_document,
        "default_pricing_document": _default_document(active_map.id, map_editor.get("population_bands")),
        "summary": {
            "city_count": len(city_payload.get("cities", [])),
            "freight_flow_count": len(freight_flows),
            "truck_count": len(trucks),
            "selected_city_id": city_payload.get("summary", {}).get("selected_city_id"),
            "active_map_id": active_map.id,
        },
    }