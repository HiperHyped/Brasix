from __future__ import annotations

from datetime import datetime
from math import atan2, cos, exp, isfinite, radians, sin, sqrt
from pathlib import Path
from typing import Any
import unicodedata

from app.config import DIESEL_COST_EDITOR_DIR, DIESEL_COST_SEED_PATH
from app.services.data_loader import load_json, load_map_editor_payload, load_map_viewport_payload, load_ui_payload, save_json
from app.services.map_repository import load_active_map_bundle, load_map_bundle, map_repository_payload


DEFAULT_UNIT = "brl_per_liter"
DEFAULT_INTERPOLATION_RULES = {
    "nearest_anchor_count": 4,
    "minimum_distance_km": 35.0,
    "power": 2.1,
    "same_state_bonus": 1.28,
    "out_of_state_penalty": 0.84,
    "preferred_state_radius_km": 480.0,
    "max_distance_km": 920.0,
    "fallback_blend_radius_km": 260.0,
    "fallback_blend_power": 1.35,
}


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_state_code(value: Any) -> str:
    return _safe_text(value).upper()[:3]


def _safe_number(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not isfinite(numeric) or numeric < 0:
        return None
    return float(round(numeric, 4))


def _normalized_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", _safe_text(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("-", " ").replace("'", " ")
    return " ".join(text.split())


def _document_path(map_id: str) -> Path:
    safe_map_id = _safe_text(map_id).replace("\\", "_").replace("/", "_") or "map"
    return DIESEL_COST_EDITOR_DIR / f"{safe_map_id}.json"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)
    a = sin(delta_phi / 2.0) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2.0) ** 2
    c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
    return radius_km * c


def _timestamp(value: str | None = None) -> str:
    return value or datetime.now().astimezone().isoformat(timespec="seconds")


def _city_priority(city: dict[str, Any]) -> tuple[int, float, str]:
    return (
        1 if city.get("is_user_created") else 0,
        -float(city.get("population_thousands") or 0),
        _safe_text(city.get("label") or city.get("id")),
    )


def _seed_observation_entries() -> list[dict[str, Any]]:
    if not DIESEL_COST_SEED_PATH.exists():
        return []
    payload = load_json(DIESEL_COST_SEED_PATH)
    if not isinstance(payload, dict):
        return []

    entries: list[dict[str, Any]] = []
    for raw_entry in payload.get("observations", []):
        if not isinstance(raw_entry, dict):
            continue
        state_code = _safe_state_code(raw_entry.get("state_code"))
        city_name = _safe_text(raw_entry.get("city_name"))
        price = _safe_number(raw_entry.get("price_brl_per_liter"))
        if not state_code or not city_name or price is None:
            continue
        entries.append(
            {
                "state_code": state_code,
                "city_name": city_name,
                "city_key": _normalized_key(city_name),
                "price_brl_per_liter": price,
                "source_kind": "seed",
                "source_label": _safe_text(raw_entry.get("source_label")) or "Seed Diesel v1",
            }
        )
    return entries


def _materialize_seed_observations(cities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    city_choices_by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for city in cities:
        key = (_normalized_key(city.get("name") or city.get("label")), _safe_state_code(city.get("state_code")))
        city_choices_by_key.setdefault(key, []).append(city)

    for matches in city_choices_by_key.values():
        matches.sort(key=_city_priority)

    observations: list[dict[str, Any]] = []
    seen_city_ids: set[str] = set()
    for seed in _seed_observation_entries():
        key = (seed["city_key"], seed["state_code"])
        city = next((item for item in city_choices_by_key.get(key, []) if _safe_text(item.get("id")) not in seen_city_ids), None)
        if city is None:
            continue
        city_id = _safe_text(city.get("id"))
        if not city_id:
            continue
        seen_city_ids.add(city_id)
        observations.append(
            {
                "city_id": city_id,
                "city_label": _safe_text(city.get("label") or city.get("name") or city_id),
                "state_code": _safe_state_code(city.get("state_code")),
                "price_brl_per_liter": seed["price_brl_per_liter"],
                "source_kind": seed["source_kind"],
                "source_label": seed["source_label"],
            }
        )

    observations.sort(key=lambda item: (_safe_state_code(item.get("state_code")), _safe_text(item.get("city_label"))))
    return observations


def _normalize_observations(raw_items: list[Any], city_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_by_city_id: dict[str, dict[str, Any]] = {}
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        city_id = _safe_text(raw_item.get("city_id"))
        city = city_by_id.get(city_id)
        price = _safe_number(raw_item.get("price_brl_per_liter"))
        if not city_id or city is None or price is None:
            continue
        source_kind = _safe_text(raw_item.get("source_kind")).lower() or "manual"
        if source_kind not in {"seed", "manual"}:
            source_kind = "manual"
        normalized_by_city_id[city_id] = {
            "city_id": city_id,
            "city_label": _safe_text(city.get("label") or city.get("name") or city_id),
            "state_code": _safe_state_code(city.get("state_code")),
            "price_brl_per_liter": price,
            "source_kind": source_kind,
            "source_label": _safe_text(raw_item.get("source_label")) or ("Seed Diesel v1" if source_kind == "seed" else "Manual"),
        }
    return sorted(normalized_by_city_id.values(), key=lambda item: (_safe_state_code(item.get("state_code")), _safe_text(item.get("city_label"))))


def _normalize_overrides(raw_items: list[Any], city_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_by_city_id: dict[str, dict[str, Any]] = {}
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        city_id = _safe_text(raw_item.get("city_id"))
        city = city_by_id.get(city_id)
        final_price = _safe_number(raw_item.get("final_price_brl_per_liter"))
        if not city_id or city is None or final_price is None:
            continue
        normalized_by_city_id[city_id] = {
            "city_id": city_id,
            "city_label": _safe_text(city.get("label") or city.get("name") or city_id),
            "state_code": _safe_state_code(city.get("state_code")),
            "final_price_brl_per_liter": final_price,
        }
    return sorted(normalized_by_city_id.values(), key=lambda item: (_safe_state_code(item.get("state_code")), _safe_text(item.get("city_label"))))


def _normalize_raw_document(payload: dict[str, Any], map_id: str, city_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": _safe_text(payload.get("id")) or f"diesel_cost_editor::{map_id}",
        "map_id": map_id,
        "version": 1,
        "unit": DEFAULT_UNIT,
        "updated_at": payload.get("updated_at") or None,
        "observations": _normalize_observations(list(payload.get("observations") or []), city_by_id),
        "overrides": _normalize_overrides(list(payload.get("overrides") or []), city_by_id),
    }


def _load_raw_document(map_id: str, cities: list[dict[str, Any]]) -> dict[str, Any]:
    city_by_id = {_safe_text(city.get("id")): city for city in cities if _safe_text(city.get("id"))}
    target = _document_path(map_id)
    if not target.exists():
        return {
            "id": f"diesel_cost_editor::{map_id}",
            "map_id": map_id,
            "version": 1,
            "unit": DEFAULT_UNIT,
            "updated_at": None,
            "observations": _materialize_seed_observations(cities),
            "overrides": [],
        }
    payload = load_json(target)
    if not isinstance(payload, dict):
        return {
            "id": f"diesel_cost_editor::{map_id}",
            "map_id": map_id,
            "version": 1,
            "unit": DEFAULT_UNIT,
            "updated_at": None,
            "observations": [],
            "overrides": [],
        }
    return _normalize_raw_document(payload, map_id, city_by_id)


def _estimate_city_value(
    city: dict[str, Any],
    anchors: list[dict[str, Any]],
    observation_by_city_id: dict[str, dict[str, Any]],
    state_mean_by_code: dict[str, float],
    global_mean: float,
    rules: dict[str, float],
) -> dict[str, Any]:
    observed = observation_by_city_id.get(_safe_text(city.get("id")))
    if observed is not None:
        observed_value = float(observed["price_brl_per_liter"])
        return {
            "observed_value": observed_value,
            "estimated_value": observed_value,
            "anchor_count": 1,
            "nearest_distance_km": 0.0,
            "source": "observed",
        }

    if not anchors:
        return {
            "observed_value": None,
            "estimated_value": 0.0,
            "anchor_count": 0,
            "nearest_distance_km": None,
            "source": "none",
        }

    nearest_anchor_count = max(1, int(rules["nearest_anchor_count"]))
    minimum_distance_km = max(float(rules["minimum_distance_km"]), 1.0)
    power = max(float(rules["power"]), 0.2)
    same_state_bonus = max(float(rules["same_state_bonus"]), 0.01)
    out_of_state_penalty = max(float(rules["out_of_state_penalty"]), 0.01)
    preferred_state_radius_km = max(float(rules["preferred_state_radius_km"]), minimum_distance_km)
    max_distance_km = max(float(rules["max_distance_km"]), preferred_state_radius_km)
    blend_radius_km = max(float(rules["fallback_blend_radius_km"]), minimum_distance_km)
    blend_power = max(float(rules["fallback_blend_power"]), 0.1)

    distance_rows = sorted(
        (
            {
                **anchor,
                "distance_km": _haversine_km(
                    float(city.get("latitude") or 0),
                    float(city.get("longitude") or 0),
                    float(anchor["city"].get("latitude") or 0),
                    float(anchor["city"].get("longitude") or 0),
                ),
            }
            for anchor in anchors
        ),
        key=lambda item: item["distance_km"],
    )

    same_state_rows = [
        row
        for row in distance_rows
        if _safe_state_code(row["city"].get("state_code")) == _safe_state_code(city.get("state_code"))
        and row["distance_km"] <= preferred_state_radius_km
    ]
    if not same_state_rows:
        same_state_rows = [
            row
            for row in distance_rows
            if _safe_state_code(row["city"].get("state_code")) == _safe_state_code(city.get("state_code"))
        ]

    selected: list[dict[str, Any]] = []
    seen_city_ids: set[str] = set()
    for row in same_state_rows:
        if len(selected) >= nearest_anchor_count:
            break
        city_id = _safe_text(row["city"].get("id"))
        selected.append(row)
        seen_city_ids.add(city_id)

    for row in distance_rows:
        if len(selected) >= nearest_anchor_count:
            break
        city_id = _safe_text(row["city"].get("id"))
        if city_id in seen_city_ids:
            continue
        if row["distance_km"] <= max_distance_km or not selected:
            selected.append(row)
            seen_city_ids.add(city_id)

    if not selected:
        selected = distance_rows[:nearest_anchor_count]

    weighted_total = 0.0
    weight_sum = 0.0
    for row in selected:
        distance_km = max(float(row["distance_km"]), minimum_distance_km)
        base_weight = 1.0 / (distance_km**power)
        state_weight = same_state_bonus if _safe_state_code(row["city"].get("state_code")) == _safe_state_code(city.get("state_code")) else out_of_state_penalty
        weight = base_weight * state_weight
        weighted_total += float(row["value"]) * weight
        weight_sum += weight

    weighted_average = (weighted_total / weight_sum) if weight_sum > 0 else 0.0
    nearest_distance_km = float(selected[0]["distance_km"]) if selected else None
    fallback_mean = state_mean_by_code.get(_safe_state_code(city.get("state_code")), global_mean)
    if nearest_distance_km is None:
        estimated_value = fallback_mean
    else:
        blend_factor = exp(-((max(nearest_distance_km, minimum_distance_km) / blend_radius_km) ** blend_power))
        estimated_value = (weighted_average * blend_factor) + (fallback_mean * (1.0 - blend_factor))

    return {
        "observed_value": None,
        "estimated_value": round(float(estimated_value), 4),
        "anchor_count": len(selected),
        "nearest_distance_km": None if nearest_distance_km is None else round(float(nearest_distance_km), 2),
        "source": "estimated",
    }


def build_diesel_cost_editor_document(map_id: str, cities: list[dict[str, Any]], raw_document: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized_cities = sorted(cities, key=lambda item: _safe_text(item.get("label") or item.get("name") or item.get("id")))
    city_by_id = {_safe_text(city.get("id")): city for city in normalized_cities if _safe_text(city.get("id"))}
    raw = raw_document or _load_raw_document(map_id, normalized_cities)
    raw = _normalize_raw_document(raw, map_id, city_by_id)

    observations = raw["observations"]
    overrides = raw["overrides"]
    observation_by_city_id = {item["city_id"]: item for item in observations}
    override_by_city_id = {item["city_id"]: item for item in overrides}

    anchors: list[dict[str, Any]] = []
    for observation in observations:
        city = city_by_id.get(observation["city_id"])
        if city is None:
            continue
        anchors.append(
            {
                "city": city,
                "value": float(observation["price_brl_per_liter"]),
                "source_kind": observation.get("source_kind") or "manual",
            }
        )

    global_mean = (sum(anchor["value"] for anchor in anchors) / len(anchors)) if anchors else 0.0
    state_mean_buckets: dict[str, list[float]] = {}
    for anchor in anchors:
        state_mean_buckets.setdefault(_safe_state_code(anchor["city"].get("state_code")), []).append(float(anchor["value"]))
    state_mean_by_code = {
        state_code: sum(values) / len(values)
        for state_code, values in state_mean_buckets.items()
        if values
    }

    city_values: list[dict[str, Any]] = []
    for city in normalized_cities:
        estimate = _estimate_city_value(
            city,
            anchors,
            observation_by_city_id,
            state_mean_by_code,
            global_mean,
            DEFAULT_INTERPOLATION_RULES,
        )
        override = override_by_city_id.get(_safe_text(city.get("id")))
        final_value = float(override["final_price_brl_per_liter"]) if override is not None else float(estimate["estimated_value"])
        source = "override" if override is not None else estimate["source"]
        city_values.append(
            {
                "city_id": _safe_text(city.get("id")),
                "city_label": _safe_text(city.get("label") or city.get("name") or city.get("id")),
                "state_code": _safe_state_code(city.get("state_code")),
                "observed_value": estimate["observed_value"],
                "estimated_value": round(float(estimate["estimated_value"]), 4),
                "final_value": round(float(final_value), 4),
                "source": source,
                "anchor_count": int(estimate["anchor_count"]),
                "nearest_distance_km": estimate["nearest_distance_km"],
            }
        )

    final_values = [float(item["final_value"]) for item in city_values if item.get("final_value") is not None]
    return {
        **raw,
        "interpolation_rules": dict(DEFAULT_INTERPOLATION_RULES),
        "city_values": city_values,
        "summary": {
            "city_count": len(normalized_cities),
            "observed_count": len(observations),
            "override_count": len(overrides),
            "average_final_price_brl_per_liter": round(sum(final_values) / len(final_values), 4) if final_values else None,
            "min_final_price_brl_per_liter": round(min(final_values), 4) if final_values else None,
            "max_final_price_brl_per_liter": round(max(final_values), 4) if final_values else None,
        },
    }


def build_diesel_cost_editor_bootstrap_payload() -> dict[str, Any]:
    active_map = load_active_map_bundle()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    cities.sort(key=lambda item: _safe_text(item.get("label") or item.get("name") or item.get("id")))
    document = build_diesel_cost_editor_document(active_map.id, cities)
    map_editor = load_map_editor_payload()

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
        "cities": cities,
        "diesel_document": document,
        "summary": {
            "city_count": len(cities),
            "observed_count": document["summary"]["observed_count"],
            "override_count": document["summary"]["override_count"],
            "active_map_id": active_map.id,
        },
    }


def save_diesel_cost_editor_document(
    *,
    map_id: str,
    observations: list[dict[str, Any]],
    overrides: list[dict[str, Any]],
    updated_at: str | None = None,
) -> dict[str, Any]:
    active_map = load_active_map_bundle()
    map_bundle = active_map if active_map.id == map_id else load_map_bundle(map_id)
    cities = [city.model_dump(mode="json") for city in map_bundle.cities]
    cities.sort(key=lambda item: _safe_text(item.get("label") or item.get("name") or item.get("id")))
    city_by_id = {_safe_text(city.get("id")): city for city in cities if _safe_text(city.get("id"))}

    raw_document = _normalize_raw_document(
        {
            "id": f"diesel_cost_editor::{map_id}",
            "map_id": map_id,
            "version": 1,
            "unit": DEFAULT_UNIT,
            "updated_at": _timestamp(updated_at),
            "observations": observations,
            "overrides": overrides,
        },
        map_id,
        city_by_id,
    )
    raw_document["updated_at"] = _timestamp(updated_at)
    save_json(_document_path(map_id), raw_document)
    return build_diesel_cost_editor_document(map_id, cities, raw_document=raw_document)