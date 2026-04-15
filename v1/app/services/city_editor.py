from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.config import CITY_EDITOR_FREIGHT_DIR
from app.services.data_loader import (
    load_map_editor_payload,
    load_map_viewport_payload,
    load_product_catalog_v2_master_payload,
    load_product_family_catalog_payload,
    load_product_field_baked_document,
    load_product_field_edit_document,
    load_ui_payload,
    save_json,
    save_product_field_baked_document,
    save_product_field_edit_document,
)
from app.services.freight_editor import build_freight_editor_bootstrap_payload
from app.services.map_repository import load_active_map_bundle, map_repository_payload


def _safe_number(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric < 0:
        return 0.0
    return numeric


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _freight_document_path(map_id: str) -> Any:
    safe_map_id = str(map_id or "default").strip() or "default"
    return CITY_EDITOR_FREIGHT_DIR / f"{safe_map_id}.json"


def _empty_freight_document(map_id: str) -> dict[str, Any]:
    return {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": None,
        "topology_frozen": False,
        "frozen_generated_flows": [],
        "overrides": [],
    }


def _haversine_distance_km(
    latitude_a: int | float,
    longitude_a: int | float,
    latitude_b: int | float,
    longitude_b: int | float,
) -> float:
    from math import atan2, cos, radians, sin, sqrt

    radius_km = 6371.0
    lat_a = radians(float(latitude_a))
    lon_a = radians(float(longitude_a))
    lat_b = radians(float(latitude_b))
    lon_b = radians(float(longitude_b))
    delta_lat = lat_b - lat_a
    delta_lon = lon_b - lon_a
    base = sin(delta_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    return radius_km * 2 * atan2(sqrt(base), sqrt(1 - base))


def load_city_editor_freight_document(map_id: str) -> dict[str, Any]:
    target = _freight_document_path(map_id)
    if not target.exists():
        return _empty_freight_document(map_id)

    payload = json.loads(target.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        return _empty_freight_document(map_id)

    payload.setdefault("id", f"city_editor_freights::{map_id}")
    payload.setdefault("map_id", map_id)
    payload.setdefault("updated_at", None)
    payload.setdefault("topology_frozen", False)
    payload.setdefault("frozen_generated_flows", [])
    payload.setdefault("overrides", [])
    return payload


def _normalize_frozen_generated_flow_items(raw_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: dict[str, dict[str, Any]] = {}
    for item in raw_items:
        flow_id = str(item.get("id") or item.get("flow_id") or "").strip()
        product_id = str(item.get("product_id") or "").strip()
        origin_id = str(item.get("origin_id") or "").strip()
        destination_id = str(item.get("destination_id") or "").strip()
        if not flow_id or not product_id or not origin_id or not destination_id:
            continue

        normalized[flow_id] = {
            "id": flow_id,
            "product_id": product_id,
            "origin_id": origin_id,
            "origin_label": str(item.get("origin_label") or "").strip(),
            "destination_id": destination_id,
            "destination_label": str(item.get("destination_label") or "").strip(),
            "distance_km": round(_safe_number(item.get("distance_km")), 3),
            "base_quantity_t": round(_safe_number(item.get("base_quantity_t") or item.get("quantity_t")), 3),
        }

    return sorted(normalized.values(), key=lambda item: (item["product_id"], item["id"]))


def save_city_editor_freight_document(
    map_id: str,
    overrides: list[dict[str, Any]],
    frozen_generated_flows: list[dict[str, Any]] | None = None,
    topology_frozen: bool | None = None,
    updated_at: str | None = None,
) -> dict[str, Any]:
    existing = load_city_editor_freight_document(map_id)
    normalized: dict[str, dict[str, Any]] = {}
    for item in overrides:
        flow_id = str(item.get("flow_id") or "").strip()
        product_id = str(item.get("product_id") or "").strip()
        origin_id = str(item.get("origin_id") or "").strip()
        destination_id = str(item.get("destination_id") or "").strip()
        if not flow_id or not product_id or not origin_id or not destination_id:
            continue

        removed = bool(item.get("removed"))
        normalized[flow_id] = {
            "flow_id": flow_id,
            "product_id": product_id,
            "origin_id": origin_id,
            "destination_id": destination_id,
            "origin_label": str(item.get("origin_label") or "").strip(),
            "destination_label": str(item.get("destination_label") or "").strip(),
            "distance_km": round(_safe_number(item.get("distance_km")), 3),
            "custom": bool(item.get("custom")),
            "removed": removed,
            "quantity_t": None if removed else round(_safe_number(item.get("quantity_t")), 3),
        }

    payload = {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": updated_at or _now_iso(),
        "topology_frozen": bool(existing.get("topology_frozen")) if topology_frozen is None else bool(topology_frozen),
        "frozen_generated_flows": _normalize_frozen_generated_flow_items(
            list(existing.get("frozen_generated_flows") or []) if frozen_generated_flows is None else list(frozen_generated_flows or [])
        ),
        "overrides": sorted(normalized.values(), key=lambda item: item["flow_id"]),
    }
    return save_json(_freight_document_path(map_id), payload)


def _product_catalog_payload() -> list[dict[str, Any]]:
    family_catalog = load_product_family_catalog_payload()
    family_colors = {
        str(item.get("id") or ""): str(item.get("color") or "#2d5a27")
        for item in family_catalog.get("families", [])
        if str(item.get("id") or "").strip()
    }

    payload: list[dict[str, Any]] = []
    for raw_product in sorted(
        load_product_catalog_v2_master_payload().get("products", []),
        key=lambda item: (int(item.get("order") or 0), str(item.get("name") or "")),
    ):
        product_id = str(raw_product.get("id") or "").strip()
        if not product_id:
            continue
        if raw_product.get("visible") is False or raw_product.get("is_active") is False:
            continue
        payload.append(
            {
                "id": product_id,
                "name": str(raw_product.get("name") or product_id),
                "emoji": str(raw_product.get("emoji") or "📦"),
                "unit": str(raw_product.get("unit") or "mil t"),
                "color": str(raw_product.get("color") or family_colors.get(str(raw_product.get("family_id") or ""), "#2d5a27")),
            }
        )
    return payload


def _row_value(row: dict[str, Any]) -> float:
    if "final_value" in row:
        return _safe_number(row.get("final_value"))
    if "value" in row:
        return _safe_number(row.get("value"))
    return _safe_number(row.get("base_value"))


def _summarize_city(city_payload: dict[str, Any], products_by_id: dict[str, dict[str, Any]]) -> None:
    supply_items = list(city_payload.get("supply_items", []))
    demand_items = list(city_payload.get("demand_items", []))
    supply_items.sort(key=lambda item: (-float(item.get("value") or 0), str(item.get("product_name") or "")))
    demand_items.sort(key=lambda item: (-float(item.get("value") or 0), str(item.get("product_name") or "")))
    city_payload["supply_items"] = supply_items
    city_payload["demand_items"] = demand_items

    combined: dict[str, float] = {}
    for item in supply_items:
        combined[item["product_id"]] = combined.get(item["product_id"], 0.0) + float(item.get("value") or 0)
    for item in demand_items:
        combined[item["product_id"]] = combined.get(item["product_id"], 0.0) + float(item.get("value") or 0)

    top_products = []
    for product_id, value in sorted(combined.items(), key=lambda entry: (-entry[1], entry[0])):
        product = products_by_id.get(product_id)
        if not product or value <= 0:
            continue
        top_products.append(
            {
                "id": product_id,
                "name": product["name"],
                "emoji": product["emoji"],
                "unit": product["unit"],
                "color": product["color"],
                "value": value,
            }
        )

    city_payload["top_products"] = top_products[:5]
    city_payload["dominant_product_id"] = top_products[0]["id"] if top_products else None
    city_payload["product_count"] = len(top_products)
    city_payload["supply_total_t"] = round(sum(float(item.get("value") or 0) for item in supply_items), 3)
    city_payload["demand_total_t"] = round(sum(float(item.get("value") or 0) for item in demand_items), 3)


def _build_city_products_payload(
    map_id: str,
    cities: list[dict[str, Any]],
    products: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    payload = {
        str(city.get("id") or ""): {
            "supply_items": [],
            "demand_items": [],
            "outbound_flow_ids": [],
            "inbound_flow_ids": [],
        }
        for city in cities
        if str(city.get("id") or "").strip()
    }
    products_by_id = {product["id"]: product for product in products}

    for product in products:
        for layer in ("supply", "demand"):
            document = load_product_field_baked_document(product["id"], layer, map_id=map_id)
            for row in document.get("city_values", []):
                city_id = str(row.get("city_id") or "").strip()
                value = _row_value(row)
                city_payload = payload.get(city_id)
                if city_payload is None or value <= 0:
                    continue
                city_payload[f"{layer}_items"].append(
                    {
                        "id": f"{city_id}::{product['id']}::{layer}",
                        "product_id": product["id"],
                        "product_name": product["name"],
                        "product_emoji": product["emoji"],
                        "product_unit": product["unit"],
                        "product_color": product["color"],
                        "layer": layer,
                        "value": round(value, 3),
                        "source": str(row.get("source") or ""),
                        "base_value": _safe_number(row.get("base_value")),
                        "manual_delta": _safe_number(row.get("manual_delta")),
                    }
                )

    for city_payload in payload.values():
        _summarize_city(city_payload, products_by_id)
    return payload


def _product_value_for_city(
    map_id: str,
    city_id: str,
    product_id: str,
    layer: str,
) -> float:
    document = load_product_field_baked_document(product_id, layer, map_id=map_id)
    for row in document.get("city_values", []):
        if str(row.get("city_id") or "").strip() != city_id:
            continue
        return round(_row_value(row), 3)
    return 0.0


def _normalize_frozen_generated_flows(
    raw_items: list[dict[str, Any]],
    cities_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized = []
    for item in _normalize_frozen_generated_flow_items(raw_items):
        origin_id = str(item.get("origin_id") or "").strip()
        destination_id = str(item.get("destination_id") or "").strip()
        origin = cities_by_id.get(origin_id)
        destination = cities_by_id.get(destination_id)
        if origin is None or destination is None:
            continue
        distance_km = _safe_number(item.get("distance_km")) or _haversine_distance_km(
            origin.get("latitude") or 0,
            origin.get("longitude") or 0,
            destination.get("latitude") or 0,
            destination.get("longitude") or 0,
        )
        normalized.append(
            {
                "id": str(item.get("id") or item.get("flow_id") or "").strip(),
                "product_id": str(item.get("product_id") or "").strip(),
                "origin_id": origin_id,
                "origin_label": str(item.get("origin_label") or origin.get("label") or origin_id),
                "destination_id": destination_id,
                "destination_label": str(item.get("destination_label") or destination.get("label") or destination_id),
                "distance_km": round(distance_km, 3),
                "base_quantity_t": round(_safe_number(item.get("base_quantity_t") or item.get("quantity_t")), 3),
            }
        )
    normalized.sort(key=lambda flow: (flow["product_id"], flow["id"]))
    return normalized


def _snapshot_generated_flows_from_freight_editor(
    cities_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    generated_payload = build_freight_editor_bootstrap_payload()
    raw_items: list[dict[str, Any]] = []
    for product in generated_payload.get("products", []):
        product_id = str(product.get("id") or "").strip()
        if not product_id:
            continue
        generated = product.get("generated") or {}
        for raw_flow in generated.get("flows", []):
            flow_id = str(raw_flow.get("id") or "").strip()
            origin_id = str(raw_flow.get("origin_id") or "").strip()
            destination_id = str(raw_flow.get("destination_id") or "").strip()
            if not flow_id or not origin_id or not destination_id:
                continue
            raw_items.append(
                {
                    "id": flow_id,
                    "product_id": product_id,
                    "origin_id": origin_id,
                    "origin_label": str(raw_flow.get("origin_label") or "").strip(),
                    "destination_id": destination_id,
                    "destination_label": str(raw_flow.get("destination_label") or "").strip(),
                    "distance_km": round(_safe_number(raw_flow.get("distance_km")), 3),
                    "base_quantity_t": round(_safe_number(raw_flow.get("quantity_t")), 3),
                }
            )
    return _normalize_frozen_generated_flows(raw_items, cities_by_id)


def _ensure_city_editor_freight_topology(
    map_id: str,
    cities_by_id: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    document = load_city_editor_freight_document(map_id)
    if bool(document.get("topology_frozen")):
        return document

    resolved_cities_by_id = cities_by_id
    if resolved_cities_by_id is None:
        active_map = load_active_map_bundle()
        resolved_cities_by_id = {city.id: city.model_dump(mode="json") for city in active_map.cities}

    frozen_generated_flows = _snapshot_generated_flows_from_freight_editor(resolved_cities_by_id)
    return save_city_editor_freight_document(
        map_id,
        list(document.get("overrides") or []),
        frozen_generated_flows=frozen_generated_flows,
        topology_frozen=True,
    )


def _city_product_values_index(
    city_payload_by_id: dict[str, dict[str, Any]],
    layer: str,
) -> dict[tuple[str, str], float]:
    index: dict[tuple[str, str], float] = {}
    items_key = f"{layer}_items"
    for city_id, city_payload in city_payload_by_id.items():
        for item in city_payload.get(items_key, []):
            product_id = str(item.get("product_id") or "").strip()
            if not product_id:
                continue
            key = (city_id, product_id)
            index[key] = round(index.get(key, 0.0) + _safe_number(item.get("value")), 3)
    return index


def _allocate_fixed_topology_quantities(
    flows: list[dict[str, Any]],
    supply_by_origin: dict[str, float],
    demand_by_destination: dict[str, float],
) -> dict[str, float]:
    if not flows:
        return {}

    row_targets = {
        origin_id: max(0.0, _safe_number(supply_by_origin.get(origin_id)))
        for origin_id in {str(flow.get("origin_id") or "").strip() for flow in flows}
    }
    column_targets = {
        destination_id: max(0.0, _safe_number(demand_by_destination.get(destination_id)))
        for destination_id in {str(flow.get("destination_id") or "").strip() for flow in flows}
    }
    row_total = sum(row_targets.values())
    column_total = sum(column_targets.values())
    transferable_total = min(row_total, column_total)
    if transferable_total <= 0:
        return {str(flow.get("id") or "").strip(): 0.0 for flow in flows}

    if row_total > transferable_total and row_total > 0:
        factor = transferable_total / row_total
        row_targets = {origin_id: target * factor for origin_id, target in row_targets.items()}
    if column_total > transferable_total and column_total > 0:
        factor = transferable_total / column_total
        column_targets = {destination_id: target * factor for destination_id, target in column_targets.items()}

    quantities = {
        str(flow.get("id") or "").strip(): max(_safe_number(flow.get("base_quantity_t")), 0.001)
        for flow in flows
    }
    flow_ids_by_origin: dict[str, list[str]] = {}
    flow_ids_by_destination: dict[str, list[str]] = {}
    for flow in flows:
        flow_id = str(flow.get("id") or "").strip()
        flow_ids_by_origin.setdefault(str(flow.get("origin_id") or "").strip(), []).append(flow_id)
        flow_ids_by_destination.setdefault(str(flow.get("destination_id") or "").strip(), []).append(flow_id)

    for _iteration in range(32):
        for origin_id, flow_ids in flow_ids_by_origin.items():
            target = row_targets.get(origin_id, 0.0)
            row_sum = sum(quantities[flow_id] for flow_id in flow_ids)
            if target <= 0 or row_sum <= 0:
                for flow_id in flow_ids:
                    quantities[flow_id] = 0.0
                continue
            scale = target / row_sum
            for flow_id in flow_ids:
                quantities[flow_id] *= scale

        for destination_id, flow_ids in flow_ids_by_destination.items():
            target = column_targets.get(destination_id, 0.0)
            column_sum = sum(quantities[flow_id] for flow_id in flow_ids)
            if target <= 0 or column_sum <= 0:
                for flow_id in flow_ids:
                    quantities[flow_id] = 0.0
                continue
            scale = target / column_sum
            for flow_id in flow_ids:
                quantities[flow_id] *= scale

    return {flow_id: round(value, 3) for flow_id, value in quantities.items()}


def _build_flow_payload(
    flow: dict[str, Any],
    product: dict[str, Any],
    quantity_t: float,
    *,
    custom: bool = False,
) -> dict[str, Any]:
    return {
        "id": str(flow.get("id") or flow.get("flow_id") or "").strip(),
        "product_id": product["id"],
        "product_name": product["name"],
        "product_emoji": product["emoji"],
        "product_color": product["color"],
        "origin_id": str(flow.get("origin_id") or "").strip(),
        "origin_label": str(flow.get("origin_label") or flow.get("origin_id") or "").strip(),
        "destination_id": str(flow.get("destination_id") or "").strip(),
        "destination_label": str(flow.get("destination_label") or flow.get("destination_id") or "").strip(),
        "distance_km": round(_safe_number(flow.get("distance_km")), 3),
        "base_quantity_t": round(_safe_number(flow.get("base_quantity_t") or flow.get("quantity_t")), 3),
        "quantity_t": round(_safe_number(quantity_t), 3),
        **({"custom": True} if custom else {}),
    }


def _custom_flow_payload(
    override: dict[str, Any],
    cities_by_id: dict[str, dict[str, Any]],
    products_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    product_id = str(override.get("product_id") or "").strip()
    origin_id = str(override.get("origin_id") or "").strip()
    destination_id = str(override.get("destination_id") or "").strip()
    product = products_by_id.get(product_id)
    origin = cities_by_id.get(origin_id)
    destination = cities_by_id.get(destination_id)
    quantity_t = round(_safe_number(override.get("quantity_t")), 3)
    if not product or not origin or not destination or quantity_t <= 0:
        return None

    raw_distance = _safe_number(override.get("distance_km"))
    distance_km = raw_distance or _haversine_distance_km(
        origin.get("latitude") or 0,
        origin.get("longitude") or 0,
        destination.get("latitude") or 0,
        destination.get("longitude") or 0,
    )
    return _build_flow_payload(
        {
            "id": str(override.get("flow_id") or "").strip(),
            "origin_id": origin_id,
            "origin_label": str(override.get("origin_label") or origin.get("label") or origin_id),
            "destination_id": destination_id,
            "destination_label": str(override.get("destination_label") or destination.get("label") or destination_id),
            "distance_km": round(distance_km, 3),
            "base_quantity_t": quantity_t,
        },
        product,
        quantity_t,
        custom=True,
    )


def _effective_city_editor_freight_flows(map_id: str) -> list[dict[str, Any]]:
    active_map = load_active_map_bundle()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    cities_by_id = {str(city.get("id") or ""): city for city in cities}
    products = _product_catalog_payload()
    products_by_id = {product["id"]: product for product in products}
    city_payload_by_id = _build_city_products_payload(map_id, cities, products)
    flows, _document = _build_freight_payload(map_id, city_payload_by_id, cities_by_id, products_by_id)
    return flows


def _available_outbound_quantity_t(
    map_id: str,
    product_id: str,
    origin_id: str,
    exclude_flow_id: str | None = None,
) -> float:
    supply_t = _product_value_for_city(map_id, origin_id, product_id, "supply")
    allocated_t = 0.0
    for flow in _effective_city_editor_freight_flows(map_id):
        if str(flow.get("product_id") or "").strip() != product_id:
            continue
        if str(flow.get("origin_id") or "").strip() != origin_id:
            continue
        if exclude_flow_id and str(flow.get("id") or "").strip() == exclude_flow_id:
            continue
        allocated_t += _safe_number(flow.get("quantity_t"))
    return round(max(0.0, supply_t - allocated_t), 3)


def _build_freight_payload(
    map_id: str,
    city_payload_by_id: dict[str, dict[str, Any]],
    cities_by_id: dict[str, dict[str, Any]],
    products_by_id: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    document = load_city_editor_freight_document(map_id)
    generated_flows = _snapshot_generated_flows_from_freight_editor(cities_by_id)

    overrides_by_flow_id = {
        str(item.get("flow_id") or ""): item
        for item in document.get("overrides", [])
        if str(item.get("flow_id") or "").strip()
    }

    supply_by_city_product = _city_product_values_index(city_payload_by_id, "supply")
    demand_by_city_product = _city_product_values_index(city_payload_by_id, "demand")

    generated_flow_ids = {flow["id"] for flow in generated_flows}
    generated_flows_by_product: dict[str, list[dict[str, Any]]] = {}
    for flow in generated_flows:
        generated_flows_by_product.setdefault(flow["product_id"], []).append(flow)

    custom_overrides_by_product: dict[str, list[dict[str, Any]]] = {}
    for flow_id, override in overrides_by_flow_id.items():
        if flow_id in generated_flow_ids or override.get("removed"):
            continue
        product_id = str(override.get("product_id") or "").strip()
        if not product_id:
            continue
        custom_overrides_by_product.setdefault(product_id, []).append(override)

    flows: list[dict[str, Any]] = []
    for product_id, generated_flows in generated_flows_by_product.items():
        product = products_by_id.get(product_id)
        if not product:
            continue

        residual_supply_by_origin = {
            str(flow.get("origin_id") or "").strip(): _safe_number(
                supply_by_city_product.get((str(flow.get("origin_id") or "").strip(), product_id), 0)
            )
            for flow in generated_flows
        }
        residual_demand_by_destination = {
            str(flow.get("destination_id") or "").strip(): _safe_number(
                demand_by_city_product.get((str(flow.get("destination_id") or "").strip(), product_id), 0)
            )
            for flow in generated_flows
        }

        custom_flows: list[dict[str, Any]] = []
        for override in custom_overrides_by_product.get(product_id, []):
            custom_flow = _custom_flow_payload(override, cities_by_id, products_by_id)
            if custom_flow is None:
                continue
            custom_flows.append(custom_flow)
            residual_supply_by_origin[custom_flow["origin_id"]] = max(
                0.0,
                residual_supply_by_origin.get(custom_flow["origin_id"], 0.0) - _safe_number(custom_flow.get("quantity_t")),
            )
            residual_demand_by_destination[custom_flow["destination_id"]] = max(
                0.0,
                residual_demand_by_destination.get(custom_flow["destination_id"], 0.0) - _safe_number(custom_flow.get("quantity_t")),
            )

        locked_generated_flows: list[dict[str, Any]] = []
        unlocked_generated_flows: list[dict[str, Any]] = []
        for flow in generated_flows:
            override = overrides_by_flow_id.get(flow["id"]) or {}
            if override.get("removed"):
                continue
            if "quantity_t" in override:
                locked_quantity_t = round(_safe_number(override.get("quantity_t")), 3)
                locked_generated_flows.append(_build_flow_payload(flow, product, locked_quantity_t))
                residual_supply_by_origin[flow["origin_id"]] = max(
                    0.0,
                    residual_supply_by_origin.get(flow["origin_id"], 0.0) - locked_quantity_t,
                )
                residual_demand_by_destination[flow["destination_id"]] = max(
                    0.0,
                    residual_demand_by_destination.get(flow["destination_id"], 0.0) - locked_quantity_t,
                )
                continue
            unlocked_generated_flows.append(flow)

        recalculated_quantities = _allocate_fixed_topology_quantities(
            unlocked_generated_flows,
            residual_supply_by_origin,
            residual_demand_by_destination,
        )
        for flow in unlocked_generated_flows:
            flows.append(_build_flow_payload(flow, product, recalculated_quantities.get(flow["id"], 0.0)))
        flows.extend(locked_generated_flows)
        flows.extend(custom_flows)

    for product_id, custom_overrides in custom_overrides_by_product.items():
        if product_id in generated_flows_by_product:
            continue
        for override in custom_overrides:
            custom_flow = _custom_flow_payload(override, cities_by_id, products_by_id)
            if custom_flow is not None:
                flows.append(custom_flow)

    flows.sort(key=lambda item: (-float(item.get("quantity_t") or 0), str(item.get("product_name") or ""), str(item.get("id") or "")))
    flows_by_id = {item["id"]: item for item in flows}

    for city_payload in city_payload_by_id.values():
        city_payload["outbound_flow_ids"] = []
        city_payload["inbound_flow_ids"] = []

    for flow in flows:
        outbound_city = city_payload_by_id.get(flow["origin_id"])
        inbound_city = city_payload_by_id.get(flow["destination_id"])
        if outbound_city is not None:
            outbound_city["outbound_flow_ids"].append(flow["id"])
        if inbound_city is not None:
            inbound_city["inbound_flow_ids"].append(flow["id"])

    for city_payload in city_payload_by_id.values():
        city_payload["outbound_flow_ids"].sort(key=lambda flow_id: -float(flows_by_id.get(flow_id, {}).get("quantity_t") or 0))
        city_payload["inbound_flow_ids"].sort(key=lambda flow_id: -float(flows_by_id.get(flow_id, {}).get("quantity_t") or 0))

    return flows, document


def build_city_editor_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    cities.sort(key=lambda item: str(item.get("label") or ""))
    cities_by_id = {str(city.get("id") or ""): city for city in cities}
    products = _product_catalog_payload()
    products_by_id = {product["id"]: product for product in products}
    city_payload_by_id = _build_city_products_payload(active_map.id, cities, products)
    freight_flows, freight_document = _build_freight_payload(active_map.id, city_payload_by_id, cities_by_id, products_by_id)
    map_editor = load_map_editor_payload()

    city_payload = []
    for city in cities:
        city_id = str(city.get("id") or "").strip()
        derived = city_payload_by_id.get(city_id, {})
        city_payload.append(
            {
                **city,
                "top_products": list(derived.get("top_products", [])),
                "dominant_product_id": derived.get("dominant_product_id"),
                "product_count": int(derived.get("product_count") or 0),
                "supply_total_t": derived.get("supply_total_t") or 0,
                "demand_total_t": derived.get("demand_total_t") or 0,
                "supply_items": list(derived.get("supply_items", [])),
                "demand_items": list(derived.get("demand_items", [])),
                "outbound_flow_ids": list(derived.get("outbound_flow_ids", [])),
                "inbound_flow_ids": list(derived.get("inbound_flow_ids", [])),
            }
        )

    selected_city_id = load_map_viewport_payload().get("defaults", {}).get("selected_city_id") or (city_payload[0]["id"] if city_payload else None)

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
            "graph_node_styles": map_editor.get("graph_node_styles"),
            "route_surface_types": map_editor.get("route_surface_types"),
            "display_settings": map_editor.get("display_settings"),
        },
        "products": products,
        "cities": city_payload,
        "route_network": active_map.route_network.model_dump(mode="json"),
        "freight_flows": freight_flows,
        "freight_overrides_document": freight_document,
        "summary": {
            "city_count": len(city_payload),
            "product_count": len(products_by_id),
            "selected_city_id": selected_city_id,
            "freight_flow_count": len(freight_flows),
        },
    }


def update_city_editor_product_value(
    map_id: str,
    city_id: str,
    product_id: str,
    layer: str,
    value: int | float,
) -> dict[str, Any]:
    active_map = load_active_map_bundle()
    city_lookup = {city.id: city.model_dump(mode="json") for city in active_map.cities}
    city = city_lookup.get(city_id)
    if city is None:
        raise KeyError(city_id)

    field_document = load_product_field_edit_document(product_id, layer, map_id=map_id)
    baked_document = load_product_field_baked_document(product_id, layer, map_id=map_id)
    timestamp = _now_iso()
    numeric_value = round(_safe_number(value), 3)

    baked_rows = list(baked_document.get("city_values", []))
    row_index = next((index for index, row in enumerate(baked_rows) if str(row.get("city_id") or "") == city_id), -1)
    if row_index >= 0:
        base_value = _safe_number(baked_rows[row_index].get("base_value"))
        baked_rows[row_index] = {
            **baked_rows[row_index],
            "city_id": city_id,
            "city_label": city.get("label") or city_id,
            "state_code": city.get("state_code") or "",
            "manual_delta": round(numeric_value - base_value, 3),
            "final_value": numeric_value,
            "source": "manual",
        }
        item = baked_rows[row_index]
    else:
        item = {
            "city_id": city_id,
            "city_label": city.get("label") or city_id,
            "state_code": city.get("state_code") or "",
            "base_value": 0,
            "manual_delta": numeric_value,
            "final_value": numeric_value,
            "source": "manual",
            "anchor_count": 1,
            "nearest_distance_km": 0,
        }
        baked_rows.append(item)

    baked_rows.sort(key=lambda row: str(row.get("city_label") or row.get("city_id") or ""))
    baked_document["city_values"] = baked_rows
    baked_document["generated_at"] = timestamp
    field_document["baked_city_values"] = baked_rows
    field_document["updated_at"] = timestamp

    save_product_field_baked_document(product_id, layer, baked_document, map_id=map_id)
    save_product_field_edit_document(product_id, layer, field_document, map_id=map_id)
    return {"item": item, "field": field_document, "baked": baked_document}


def remove_city_editor_product_value(
    map_id: str,
    city_id: str,
    product_id: str,
    layer: str,
) -> dict[str, Any]:
    field_document = load_product_field_edit_document(product_id, layer, map_id=map_id)
    baked_document = load_product_field_baked_document(product_id, layer, map_id=map_id)
    timestamp = _now_iso()

    baked_rows = [row for row in baked_document.get("city_values", []) if str(row.get("city_id") or "") != city_id]
    baked_document["city_values"] = baked_rows
    baked_document["generated_at"] = timestamp
    field_document["baked_city_values"] = baked_rows
    field_document["updated_at"] = timestamp

    save_product_field_baked_document(product_id, layer, baked_document, map_id=map_id)
    save_product_field_edit_document(product_id, layer, field_document, map_id=map_id)
    return {"removed": True, "field": field_document, "baked": baked_document}


def update_city_editor_freight_value(
    map_id: str,
    flow_id: str,
    product_id: str,
    origin_id: str,
    destination_id: str,
    quantity_t: int | float,
) -> dict[str, Any]:
    document = load_city_editor_freight_document(map_id)
    active_map = load_active_map_bundle()
    cities_by_id = {city.id: city.model_dump(mode="json") for city in active_map.cities}
    products_by_id = {product["id"]: product for product in _product_catalog_payload()}
    origin = cities_by_id.get(origin_id)
    destination = cities_by_id.get(destination_id)
    if origin is None:
        raise KeyError(origin_id)
    if destination is None:
        raise KeyError(destination_id)
    if origin_id == destination_id:
        raise ValueError("Origem e destino nao podem ser iguais.")

    numeric_quantity_t = round(_safe_number(quantity_t), 3)
    if numeric_quantity_t <= 0:
        raise ValueError("Informe um valor maior que zero.")

    available_quantity_t = _available_outbound_quantity_t(
        map_id,
        product_id,
        origin_id,
        exclude_flow_id=flow_id,
    )
    if numeric_quantity_t > available_quantity_t:
        product_name = str(products_by_id.get(product_id, {}).get("name") or product_id)
        origin_label = str(origin.get("label") or origin_id)
        raise ValueError(
            f"O frete de {product_name} nao pode ultrapassar o saldo de oferta disponivel em {origin_label}: {available_quantity_t} t."
        )

    overrides = [item for item in document.get("overrides", []) if str(item.get("flow_id") or "") != flow_id]
    overrides.append(
        {
            "flow_id": flow_id,
            "product_id": product_id,
            "origin_id": origin_id,
            "destination_id": destination_id,
            "origin_label": str(origin.get("label") or origin_id),
            "destination_label": str(destination.get("label") or destination_id),
            "distance_km": round(
                _haversine_distance_km(
                    origin.get("latitude") or 0,
                    origin.get("longitude") or 0,
                    destination.get("latitude") or 0,
                    destination.get("longitude") or 0,
                ),
                3,
            ),
            "custom": flow_id.startswith("custom::"),
            "quantity_t": numeric_quantity_t,
            "removed": False,
        }
    )
    saved = save_city_editor_freight_document(map_id, overrides)
    override = next(item for item in saved.get("overrides", []) if str(item.get("flow_id") or "") == flow_id)
    return {"document": saved, "override": override}


def remove_city_editor_freight_value(
    map_id: str,
    flow_id: str,
    product_id: str,
    origin_id: str,
    destination_id: str,
) -> dict[str, Any]:
    document = load_city_editor_freight_document(map_id)
    overrides = [item for item in document.get("overrides", []) if str(item.get("flow_id") or "") != flow_id]
    overrides.append(
        {
            "flow_id": flow_id,
            "product_id": product_id,
            "origin_id": origin_id,
            "destination_id": destination_id,
            "custom": flow_id.startswith("custom::"),
            "removed": True,
        }
    )
    saved = save_city_editor_freight_document(map_id, overrides)
    return {"document": saved, "removed": True}