from __future__ import annotations

from math import ceil, sqrt
from typing import Any

from app.services.data_loader import (
    load_map_editor_payload,
    load_map_viewport_payload,
    load_product_catalog_v2_master_payload,
    load_product_family_catalog_payload,
    load_product_field_baked_document,
    load_ui_payload,
)
from app.services.map_repository import load_active_map_bundle, map_repository_payload


def _safe_number(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric < 0:
        return 0.0
    return numeric


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = lat1 * 3.141592653589793 / 180.0
    phi2 = lat2 * 3.141592653589793 / 180.0
    delta_phi = (lat2 - lat1) * 3.141592653589793 / 180.0
    delta_lambda = (lon2 - lon1) * 3.141592653589793 / 180.0
    sin_delta_phi = __import__("math").sin(delta_phi / 2.0)
    sin_delta_lambda = __import__("math").sin(delta_lambda / 2.0)
    a = sin_delta_phi**2 + __import__("math").cos(phi1) * __import__("math").cos(phi2) * sin_delta_lambda**2
    c = 2.0 * __import__("math").atan2(__import__("math").sqrt(a), __import__("math").sqrt(1.0 - a))
    return radius_km * c


def _compact_city_points(document: dict[str, Any], city_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for row in document.get("city_values", []):
        city_id = str(row.get("city_id") or "").strip()
        value = _safe_number(row.get("final_value"))
        city = city_by_id.get(city_id)
        if not city_id or not city or value <= 0:
            continue
        points.append(
            {
                "city_id": city_id,
                "value": value,
                "label": city.get("label") or city_id,
                "state_code": city.get("state_code") or "",
                "latitude": float(city.get("latitude") or 0),
                "longitude": float(city.get("longitude") or 0),
            }
        )
    points.sort(key=lambda item: (-item["value"], item["label"]))
    return points


def _coverage_slice(points: list[dict[str, Any]], coverage_percent: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ordered = sorted(points, key=lambda item: item["value"], reverse=True)
    total_volume = sum(item["value"] for item in ordered)
    if total_volume <= 0 or not ordered:
        return [], {
            "requested_percent": coverage_percent,
            "count": 0,
            "total_volume_t": 0,
            "covered_volume_t": 0,
            "covered_share": 0,
        }

    target_volume = total_volume * (coverage_percent / 100.0)
    selected: list[dict[str, Any]] = []
    covered_volume = 0.0
    for item in ordered:
        selected.append(item)
        covered_volume += item["value"]
        if covered_volume >= target_volume:
            break

    return selected, {
        "requested_percent": coverage_percent,
        "count": len(selected),
        "total_volume_t": round(total_volume),
        "covered_volume_t": round(covered_volume),
        "covered_share": covered_volume / total_volume if total_volume else 0,
    }


def _pair_count(origins: list[dict[str, Any]], destinations: list[dict[str, Any]]) -> int:
    return sum(1 for origin in origins for destination in destinations if origin["city_id"] != destination["city_id"])


def _default_flow_count(origin_count: int, destination_count: int) -> int:
    baseline = round(4 + (min(origin_count, destination_count) * 0.13))
    return _clamp(baseline, 8, 30)


def _build_candidates(origins: list[dict[str, Any]], destinations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not origins or not destinations:
        return []

    max_origin = max((item["value"] for item in origins), default=1)
    max_destination = max((item["value"] for item in destinations), default=1)
    max_transfer = max((min(origin["value"], destination["value"]) for origin in origins for destination in destinations), default=1)
    candidates: list[dict[str, Any]] = []

    for origin in origins:
        for destination in destinations:
            if origin["city_id"] == destination["city_id"]:
                continue
            distance_km = _haversine_km(origin["latitude"], origin["longitude"], destination["latitude"], destination["longitude"])
            distance_factor = 0.78 + (min(distance_km, 2200.0) / 2200.0 * 0.22)
            origin_share = origin["value"] / max_origin if max_origin else 0
            destination_share = destination["value"] / max_destination if max_destination else 0
            transfer_share = min(origin["value"], destination["value"]) / max_transfer if max_transfer else 0
            score = ((origin_share * 0.38) + (destination_share * 0.38) + (transfer_share * 0.24)) * distance_factor
            candidates.append(
                {
                    "id": f"{origin['city_id']}::{destination['city_id']}",
                    "origin_id": origin["city_id"],
                    "destination_id": destination["city_id"],
                    "origin": origin,
                    "destination": destination,
                    "distance_km": round(distance_km, 1),
                    "score": score,
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


def _selection_profile(flow_count: int, algorithm: str) -> dict[str, Any]:
    if algorithm == "relevancia":
        return {
            "penalty": 0.36,
            "origin_limit": max(2, ceil(flow_count / 2)),
            "destination_limit": max(2, ceil(flow_count / 2)),
            "target_origins": max(3, round(flow_count * 0.35)),
            "target_destinations": max(3, round(flow_count * 0.35)),
        }
    if algorithm == "disperso":
        return {
            "penalty": 1.32,
            "origin_limit": max(1, ceil(flow_count / 4)),
            "destination_limit": max(1, ceil(flow_count / 4)),
            "target_origins": max(4, round(flow_count * 0.7)),
            "target_destinations": max(4, round(flow_count * 0.7)),
        }
    return {
        "penalty": 0.86,
        "origin_limit": max(2, ceil(flow_count / 3)),
        "destination_limit": max(2, ceil(flow_count / 3)),
        "target_origins": max(3, round(flow_count * 0.5)),
        "target_destinations": max(3, round(flow_count * 0.5)),
    }


def _select_flows(candidates: list[dict[str, Any]], flow_count: int, algorithm: str) -> list[dict[str, Any]]:
    if not candidates or flow_count <= 0:
        return []

    profile = _selection_profile(flow_count, algorithm)
    unique_origins = {candidate["origin_id"] for candidate in candidates}
    unique_destinations = {candidate["destination_id"] for candidate in candidates}
    target_origins = min(len(unique_origins), profile["target_origins"])
    target_destinations = min(len(unique_destinations), profile["target_destinations"])

    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    origin_counts: dict[str, int] = {}
    destination_counts: dict[str, int] = {}

    def can_use(candidate: dict[str, Any], origin_limit: int, destination_limit: int) -> bool:
        return (
            origin_counts.get(candidate["origin_id"], 0) < origin_limit
            and destination_counts.get(candidate["destination_id"], 0) < destination_limit
        )

    def remember(candidate: dict[str, Any]) -> None:
        selected.append(candidate)
        selected_ids.add(candidate["id"])
        origin_counts[candidate["origin_id"]] = origin_counts.get(candidate["origin_id"], 0) + 1
        destination_counts[candidate["destination_id"]] = destination_counts.get(candidate["destination_id"], 0) + 1

    for candidate in candidates:
        if len(selected) >= flow_count:
            break
        if not can_use(candidate, profile["origin_limit"], profile["destination_limit"]):
            continue
        adds_origin = candidate["origin_id"] not in origin_counts
        adds_destination = candidate["destination_id"] not in destination_counts
        if adds_origin or adds_destination:
            remember(candidate)
        if len(origin_counts) >= target_origins and len(destination_counts) >= target_destinations:
            break

    relaxed_origin_limit = profile["origin_limit"]
    relaxed_destination_limit = profile["destination_limit"]
    while len(selected) < flow_count:
        best_candidate: dict[str, Any] | None = None
        best_score = -1.0
        for candidate in candidates:
            if candidate["id"] in selected_ids:
                continue
            if not can_use(candidate, relaxed_origin_limit, relaxed_destination_limit):
                continue
            origin_reuse = origin_counts.get(candidate["origin_id"], 0)
            destination_reuse = destination_counts.get(candidate["destination_id"], 0)
            adjusted_score = candidate["score"] / (1.0 + (origin_reuse * profile["penalty"]) + (destination_reuse * profile["penalty"]))
            if algorithm == "disperso" and candidate["origin_id"] not in origin_counts:
                adjusted_score *= 1.18
            if algorithm == "disperso" and candidate["destination_id"] not in destination_counts:
                adjusted_score *= 1.18
            if algorithm == "balanceado" and (candidate["origin_id"] not in origin_counts or candidate["destination_id"] not in destination_counts):
                adjusted_score *= 1.08
            if adjusted_score > best_score:
                best_score = adjusted_score
                best_candidate = candidate

        if best_candidate is None:
            if relaxed_origin_limit >= flow_count and relaxed_destination_limit >= flow_count:
                break
            relaxed_origin_limit += 1
            relaxed_destination_limit += 1
            continue
        remember(best_candidate)

    return selected


def _normalize_weights(values: list[float]) -> list[float]:
    total = sum(values) or 1.0
    return [value / total for value in values]


def _rounded_allocation(total: int, weights: list[float]) -> list[int]:
    raw_values = [weight * total for weight in weights]
    rounded = [int(value) for value in raw_values]
    remainder = max(0, int(round(total - sum(rounded))))
    indexed = sorted(
        ({"index": index, "fraction": raw_values[index] - rounded[index]} for index in range(len(raw_values))),
        key=lambda item: item["fraction"],
        reverse=True,
    )
    for item in indexed:
        if remainder <= 0:
            break
        rounded[item["index"]] += 1
        remainder -= 1
    return rounded


def _quantity_weights(flows: list[dict[str, Any]], quantity_mode: str) -> list[float]:
    base = [max(float(flow["score"]), 0.0001) for flow in flows]
    if quantity_mode == "equilibrada":
        return _normalize_weights([sqrt(value) for value in base])
    if quantity_mode == "concentrada":
        return _normalize_weights([value**1.6 for value in base])
    return _normalize_weights(base)


def _materialize_generation(
    *,
    product_id: str,
    algorithm: str,
    coverage_percent: int,
    flow_count: int,
    quantity_mode: str,
    supply_points: list[dict[str, Any]],
    demand_points: list[dict[str, Any]],
) -> dict[str, Any]:
    selected_origins, origin_stats = _coverage_slice(supply_points, coverage_percent)
    selected_destinations, destination_stats = _coverage_slice(demand_points, coverage_percent)
    candidates = _build_candidates(selected_origins, selected_destinations)
    selected_flows = _select_flows(candidates, flow_count, algorithm)
    transferable_volume = int(round(min(origin_stats["covered_volume_t"], destination_stats["covered_volume_t"])))
    weights = _quantity_weights(selected_flows, quantity_mode) if selected_flows else []
    quantities = _rounded_allocation(transferable_volume, weights) if selected_flows else []

    total_quantity = sum(quantities) or 1
    flows_payload = []
    for index, candidate in enumerate(selected_flows):
        quantity_t = quantities[index]
        flows_payload.append(
            {
                "id": f"{product_id}::{candidate['id']}",
                "rank": index + 1,
                "origin_id": candidate["origin_id"],
                "origin_label": candidate["origin"]["label"],
                "origin_state_code": candidate["origin"]["state_code"],
                "origin_value_t": round(candidate["origin"]["value"]),
                "origin_latitude": candidate["origin"]["latitude"],
                "origin_longitude": candidate["origin"]["longitude"],
                "destination_id": candidate["destination_id"],
                "destination_label": candidate["destination"]["label"],
                "destination_state_code": candidate["destination"]["state_code"],
                "destination_value_t": round(candidate["destination"]["value"]),
                "destination_latitude": candidate["destination"]["latitude"],
                "destination_longitude": candidate["destination"]["longitude"],
                "distance_km": candidate["distance_km"],
                "score": round(candidate["score"], 6),
                "quantity_t": quantity_t,
                "share": quantity_t / total_quantity,
            }
        )

    flows_payload.sort(key=lambda item: (-item["quantity_t"], item["rank"]))
    for index, flow in enumerate(flows_payload, start=1):
        flow["rank"] = index

    return {
        "algorithm": algorithm,
        "coverage_percent": coverage_percent,
        "flow_count": flow_count,
        "quantity_mode": quantity_mode,
        "volume_total_t": transferable_volume,
        "origins": selected_origins,
        "destinations": selected_destinations,
        "coverage_data": {
            "requested_percent": coverage_percent,
            "origins_count": len(selected_origins),
            "destinations_count": len(selected_destinations),
            "pairs": _pair_count(selected_origins, selected_destinations),
            "supply_total_t": origin_stats["total_volume_t"],
            "demand_total_t": destination_stats["total_volume_t"],
            "covered_supply_t": origin_stats["covered_volume_t"],
            "covered_demand_t": destination_stats["covered_volume_t"],
            "covered_supply_share": origin_stats["covered_share"],
            "covered_demand_share": destination_stats["covered_share"],
        },
        "flows": flows_payload,
    }


def build_freight_editor_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    cities.sort(key=lambda item: item["label"])
    city_by_id = {str(city.get("id") or ""): city for city in cities if str(city.get("id") or "").strip()}

    product_catalog = load_product_catalog_v2_master_payload()
    family_catalog = load_product_family_catalog_payload()
    family_colors = {
        str(item.get("id") or ""): str(item.get("color") or "#2d5a27")
        for item in family_catalog.get("families", [])
        if str(item.get("id") or "").strip()
    }
    map_editor = load_map_editor_payload()

    products_payload: list[dict[str, Any]] = []
    for product in sorted(product_catalog.get("products", []), key=lambda item: (int(item.get("order") or 0), str(item.get("name") or ""))):
        product_id = str(product.get("id") or "").strip()
        if not product_id:
            continue
        if product.get("visible") is False or product.get("is_active") is False:
            continue

        supply_points = _compact_city_points(load_product_field_baked_document(product_id, "supply", map_id=active_map.id), city_by_id)
        demand_points = _compact_city_points(load_product_field_baked_document(product_id, "demand", map_id=active_map.id), city_by_id)
        if not supply_points or not demand_points:
            continue

        initial_coverage = 90
        initial_flow_count = _default_flow_count(len(supply_points), len(demand_points))
        defaults = {
            "algorithm": "balanceado",
            "coverage": initial_coverage,
            "flow_count": initial_flow_count,
            "quantity_mode": "proporcional",
        }
        generated = _materialize_generation(
            product_id=product_id,
            algorithm=defaults["algorithm"],
            coverage_percent=defaults["coverage"],
            flow_count=defaults["flow_count"],
            quantity_mode=defaults["quantity_mode"],
            supply_points=supply_points,
            demand_points=demand_points,
        )
        products_payload.append(
            {
                "id": product_id,
                "name": str(product.get("name") or product_id),
                "emoji": str(product.get("emoji") or "📦"),
                "family_id": str(product.get("family_id") or ""),
                "color": family_colors.get(str(product.get("family_id") or ""), "#2d5a27"),
                "defaults": defaults,
                "summary": {
                    "supply_nonzero": len(supply_points),
                    "demand_nonzero": len(demand_points),
                    "supply_total_t": round(sum(item["value"] for item in supply_points)),
                    "demand_total_t": round(sum(item["value"] for item in demand_points)),
                    "candidate_pairs": generated["coverage_data"]["pairs"],
                    "covered_origins": generated["coverage_data"]["origins_count"],
                    "covered_destinations": generated["coverage_data"]["destinations_count"],
                },
                "supply_points": [{"city_id": item["city_id"], "value": round(item["value"], 3)} for item in supply_points],
                "demand_points": [{"city_id": item["city_id"], "value": round(item["value"], 3)} for item in demand_points],
                "generated": generated,
            }
        )

    selected_product_id = products_payload[0]["id"] if products_payload else None
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
        "product_family_catalog": family_catalog,
        "cities": cities,
        "products": products_payload,
        "summary": {
            "city_count": len(cities),
            "product_count": len(products_payload),
            "selected_product_id": selected_product_id,
            "active_map_id": active_map.id,
        },
    }