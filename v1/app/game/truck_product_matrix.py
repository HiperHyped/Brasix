from __future__ import annotations

from typing import Any

from app.game.runtime import build_game_world_runtime
from app.services.data_loader import load_truck_image_asset_registry_payload


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _sort_records(items: list[dict[str, Any]], *, label_keys: tuple[str, ...] = ("label", "name", "id")) -> list[dict[str, Any]]:
    def sort_key(item: dict[str, Any]) -> tuple[int, str]:
        order = int(item.get("order") or 0)
        label = ""
        for key in label_keys:
            label = _text(item.get(key))
            if label:
                break
        return order, label.casefold()

    return sorted((dict(item) for item in items), key=sort_key)


def _label_list(ids: list[str], by_id: dict[str, dict[str, Any]]) -> list[str]:
    labels: list[str] = []
    for item_id in ids:
        record = by_id.get(item_id) or {}
        labels.append(_text(record.get("label") or record.get("name") or item_id))
    return labels


def _preview_image_data(asset_entry: dict[str, Any] | None) -> tuple[str, str]:
    entry = asset_entry or {}
    status = _text(entry.get("status"))
    candidate_image_url_path = _text(entry.get("candidate_image_url_path"))
    approved_image_url_path = _text(entry.get("approved_image_url_path"))

    if candidate_image_url_path and status in {"generated", "rejected", "failed"}:
        return candidate_image_url_path, _text(entry.get("generated_at") or entry.get("updated_at"))

    return (
        approved_image_url_path or candidate_image_url_path,
        _text(entry.get("approved_at") or entry.get("generated_at") or entry.get("updated_at")),
    )


def build_truck_product_matrix_payload() -> dict[str, Any]:
    runtime = build_game_world_runtime(include_validation=True)

    product_family_by_id = runtime.catalogs.product_family_by_id
    logistics_type_by_id = runtime.catalogs.product_logistics_type_by_id
    truck_body_by_id = runtime.catalogs.truck_body_by_id
    truck_asset_registry_by_id = {
        _text(item.get("truck_type_id")): dict(item)
        for item in load_truck_image_asset_registry_payload().get("items", [])
        if _text(item.get("truck_type_id"))
    }

    products: list[dict[str, Any]] = []
    for product in _sort_records(list(runtime.products.catalog.get("products", [])), label_keys=("name", "short_name", "id")):
        product_id = _text(product.get("id"))
        if not product_id or not bool(product.get("is_active", True)):
            continue

        family_id = _text(product.get("family_id"))
        logistics_type_id = _text(product.get("logistics_type_id"))
        logistics_type_record = logistics_type_by_id.get(logistics_type_id) or {}
        logistics_body_type_ids = [_text(item) for item in logistics_type_record.get("body_type_ids", []) if _text(item)]
        products.append(
            {
                "id": product_id,
                "order": int(product.get("order") or 0),
                "name": _text(product.get("name") or product_id),
                "short_name": _text(product.get("short_name") or product.get("name") or product_id),
                "emoji": _text(product.get("emoji") or "📦"),
                "family_id": family_id,
                "family_label": _text((product_family_by_id.get(family_id) or {}).get("label") or family_id),
                "logistics_type_id": logistics_type_id,
                "logistics_type_label": _text(logistics_type_record.get("label") or logistics_type_id),
                "logistics_type_description": _text(logistics_type_record.get("description")),
                "logistics_body_type_ids": logistics_body_type_ids,
                "logistics_body_labels": _label_list(logistics_body_type_ids, truck_body_by_id),
                "compatibility_source": "logistics_type",
                "status": _text(product.get("status") or "visible"),
                "notes": _text(product.get("notes")),
                "compatible_truck_type_ids": [],
                "compatible_truck_count": 0,
            }
        )

    products_by_id = {item["id"]: item for item in products}

    trucks: list[dict[str, Any]] = []
    compatible_pair_count = 0
    for truck in _sort_records(list(runtime.trucks.type_catalog.get("types", []))):
        truck_id = _text(truck.get("id"))
        if not truck_id:
            continue

        preview_image_url_path, preview_image_version = _preview_image_data(truck_asset_registry_by_id.get(truck_id))
        body_type_ids = [_text(item) for item in truck.get("canonical_body_type_ids", []) if _text(item)]
        supported_product_ids: list[str] = []
        cells: list[dict[str, Any]] = []

        for product in products:
            matched_body_type_ids = [body_id for body_id in body_type_ids if body_id in set(product["logistics_body_type_ids"])]
            compatible = bool(matched_body_type_ids)
            if compatible:
                compatible_pair_count += 1
                supported_product_ids.append(product["id"])
                product["compatible_truck_type_ids"].append(truck_id)
                product["compatible_truck_count"] += 1

            cells.append(
                {
                    "product_id": product["id"],
                    "compatible": compatible,
                    "matched_body_type_ids": matched_body_type_ids,
                    "matched_body_labels": _label_list(matched_body_type_ids, truck_body_by_id),
                }
            )

        trucks.append(
            {
                "id": truck_id,
                "order": int(truck.get("order") or 0),
                "label": _text(truck.get("label") or truck_id),
                "short_label": _text(truck.get("short_label") or truck.get("label") or truck_id),
                "size_tier": _text(truck.get("size_tier")),
                "base_vehicle_kind": _text(truck.get("base_vehicle_kind")),
                "axle_config": _text(truck.get("axle_config")),
                "combination_kind": _text(truck.get("combination_kind")),
                "cargo_scope": _text(truck.get("cargo_scope")),
                "source_basis": _text(truck.get("source_basis")),
                "body_type_ids": body_type_ids,
                "body_labels": _label_list(body_type_ids, truck_body_by_id),
                "preview_image_url_path": preview_image_url_path,
                "preview_image_version": preview_image_version,
                "supported_product_ids": supported_product_ids,
                "supported_product_count": len(supported_product_ids),
                "unsupported_product_count": len(products) - len(supported_product_ids),
                "cells": cells,
            }
        )

    bodies: list[dict[str, Any]] = []
    for body in _sort_records(list(runtime.trucks.body_catalog.get("types", []))):
        body_id = _text(body.get("id"))
        if not body_id:
            continue

        truck_type_count = sum(1 for truck in trucks if body_id in truck["body_type_ids"])
        product_count = sum(1 for product in products if body_id in product["logistics_body_type_ids"])
        bodies.append(
            {
                "id": body_id,
                "order": int(body.get("order") or 0),
                "label": _text(body.get("label") or body_id),
                "category": _text(body.get("category")),
                "cargo_role": _text(body.get("cargo_role")),
                "truck_type_count": truck_type_count,
                "product_count": product_count,
            }
        )

    families = [
        {
            "id": _text(item.get("id")),
            "label": _text(item.get("label") or item.get("name") or item.get("id")),
        }
        for item in _sort_records(list(runtime.products.family_catalog.get("families", [])), label_keys=("label", "name", "id"))
        if _text(item.get("id"))
    ]

    logistics_types = [
        {
            "id": _text(item.get("id")),
            "label": _text(item.get("label") or item.get("name") or item.get("id")),
            "description": _text(item.get("description")),
            "body_type_ids": [_text(body_id) for body_id in item.get("body_type_ids", []) if _text(body_id)],
            "body_labels": _label_list([_text(body_id) for body_id in item.get("body_type_ids", []) if _text(body_id)], truck_body_by_id),
            "product_count": sum(1 for product in products if product["logistics_type_id"] == _text(item.get("id"))),
            "truck_type_count": sum(
                1
                for truck in trucks
                if set([_text(body_id) for body_id in item.get("body_type_ids", []) if _text(body_id)]) & set(truck["body_type_ids"])
            ),
        }
        for item in _sort_records(list(runtime.products.logistics_type_catalog.get("types", [])), label_keys=("label", "name", "id"))
        if _text(item.get("id"))
    ]

    total_pairs = len(trucks) * len(products)
    covered_product_count = sum(1 for product in products if product["compatible_truck_count"] > 0)
    usable_truck_type_count = sum(1 for truck in trucks if truck["supported_product_count"] > 0)

    return {
        "generated_at": runtime.metadata.generated_at,
        "map": {"id": runtime.metadata.map_id, "name": runtime.metadata.map_name},
        "validation": runtime.validation.model_dump(mode="json"),
        "summary": {
            "truck_type_count": len(trucks),
            "product_count": len(products),
            "body_type_count": len(bodies),
            "compatible_pair_count": compatible_pair_count,
            "incompatible_pair_count": total_pairs - compatible_pair_count,
            "compatibility_ratio_pct": round((compatible_pair_count / total_pairs) * 100, 1) if total_pairs else 0.0,
            "covered_product_count": covered_product_count,
            "uncovered_product_count": len(products) - covered_product_count,
            "usable_truck_type_count": usable_truck_type_count,
            "idle_truck_type_count": len(trucks) - usable_truck_type_count,
        },
        "families": families,
        "logistics_types": logistics_types,
        "bodies": bodies,
        "products": products,
        "products_by_id": products_by_id,
        "trucks": trucks,
    }