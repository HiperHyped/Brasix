from __future__ import annotations

from datetime import datetime

from app.game.models import (
    GameWorldCatalogSnapshot,
    GameWorldMapSnapshot,
    GameWorldMetadata,
    GameWorldProductSnapshot,
    GameWorldRuntimeDocument,
    GameWorldSourceSummary,
    GameWorldTruckSnapshot,
)
from app.game.validators import validate_game_world_runtime
from app.services import (
    load_active_map_bundle,
    load_city_product_demand_matrix_payload,
    load_city_product_supply_matrix_payload,
    load_effective_truck_type_catalog_payload,
    load_product_catalog_v2_master_payload,
    load_product_family_catalog_payload,
    load_product_inference_rules_payload,
    load_product_logistics_type_catalog_payload,
    load_region_product_supply_matrix_payload,
    load_truck_body_catalog_payload,
    load_truck_category_catalog_payload,
    load_truck_operational_catalog_payload,
)


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def build_game_world_runtime(*, include_validation: bool = True) -> GameWorldRuntimeDocument:
    active_map = load_active_map_bundle()
    cities = [city.model_dump(mode="json") for city in active_map.cities]
    route_network = active_map.route_network.model_dump(mode="json")

    product_catalog = load_product_catalog_v2_master_payload()
    product_family_catalog = load_product_family_catalog_payload()
    product_logistics_type_catalog = load_product_logistics_type_catalog_payload()
    supply_matrix = load_city_product_supply_matrix_payload()
    demand_matrix = load_city_product_demand_matrix_payload()
    region_supply_matrix = load_region_product_supply_matrix_payload()
    inference_rules = load_product_inference_rules_payload()

    truck_type_catalog = load_effective_truck_type_catalog_payload()
    truck_body_catalog = load_truck_body_catalog_payload()
    truck_category_catalog = load_truck_category_catalog_payload()
    truck_operational_catalog = load_truck_operational_catalog_payload()

    product_ids = [
        str(item.get("id") or "").strip()
        for item in product_catalog.get("products", [])
        if str(item.get("id") or "").strip()
    ]
    active_product_ids = [
        str(item.get("id") or "").strip()
        for item in product_catalog.get("products", [])
        if str(item.get("id") or "").strip() and bool(item.get("is_active", True))
    ]

    truck_type_ids = [
        str(item.get("id") or "").strip()
        for item in truck_type_catalog.get("types", [])
        if str(item.get("id") or "").strip()
    ]
    active_truck_type_ids = [
        str(item.get("id") or "").strip()
        for item in truck_type_catalog.get("types", [])
        if str(item.get("id") or "").strip()
    ]
    body_type_ids = [
        str(item.get("id") or "").strip()
        for item in truck_body_catalog.get("types", [])
        if str(item.get("id") or "").strip()
    ]

    runtime = GameWorldRuntimeDocument(
        metadata=GameWorldMetadata(
            generated_at=_now_iso(),
            map_id=active_map.id,
            map_name=active_map.name,
            city_count=len(cities),
            route_edge_count=len(active_map.route_network.edges),
            route_graph_node_count=len(active_map.route_network.nodes),
            product_count=len(product_ids),
            active_product_count=len(active_product_ids),
            truck_type_count=len(truck_type_ids),
            active_truck_type_count=len(active_truck_type_ids),
        ),
        source_summary=GameWorldSourceSummary(
            active_map_id=active_map.id,
            active_map_name=active_map.name,
            route_network_id=active_map.route_network.id,
            product_catalog_id=str(product_catalog.get("id") or "product_catalog_v2_master"),
            product_family_catalog_id=str(product_family_catalog.get("id") or "product_family_catalog_v1"),
            product_logistics_type_catalog_id=str(
                product_logistics_type_catalog.get("id") or "product_logistics_type_catalog_v1"
            ),
            supply_matrix_id=str(supply_matrix.get("id") or "city_product_supply_matrix_v1"),
            demand_matrix_id=str(demand_matrix.get("id") or "city_product_demand_matrix_v1"),
            region_supply_matrix_id=str(region_supply_matrix.get("id") or "region_product_supply_matrix_v1"),
            truck_type_catalog_id=str(truck_type_catalog.get("id") or "truck_type_catalog_v1"),
            truck_body_catalog_id=str(truck_body_catalog.get("id") or "truck_body_catalog_v1"),
            truck_category_catalog_id=str(truck_category_catalog.get("id") or "truck_category_catalog_v1"),
            truck_operational_catalog_id=str(truck_operational_catalog.get("id") or "truck_operational_catalog_v1"),
        ),
        map=GameWorldMapSnapshot(
            active_map_id=active_map.id,
            active_map_name=active_map.name,
            cities=cities,
            route_network=route_network,
            city_count=len(cities),
            graph_node_count=len(active_map.route_network.nodes),
            edge_count=len(active_map.route_network.edges),
        ),
        products=GameWorldProductSnapshot(
            catalog=product_catalog,
            family_catalog=product_family_catalog,
            logistics_type_catalog=product_logistics_type_catalog,
            supply_matrix=supply_matrix,
            demand_matrix=demand_matrix,
            region_supply_matrix=region_supply_matrix,
            inference_rules=inference_rules,
            product_ids=product_ids,
            active_product_ids=active_product_ids,
            product_count=len(product_ids),
        ),
        trucks=GameWorldTruckSnapshot(
            type_catalog=truck_type_catalog,
            body_catalog=truck_body_catalog,
            category_catalog=truck_category_catalog,
            operational_catalog=truck_operational_catalog,
            truck_type_ids=truck_type_ids,
            active_truck_type_ids=active_truck_type_ids,
            body_type_ids=body_type_ids,
            truck_type_count=len(truck_type_ids),
        ),
        catalogs=GameWorldCatalogSnapshot(
            city_by_id={item["id"]: item for item in cities if str(item.get("id") or "").strip()},
            product_by_id={
                item["id"]: item
                for item in product_catalog.get("products", [])
                if str(item.get("id") or "").strip()
            },
            product_family_by_id={
                item["id"]: item
                for item in product_family_catalog.get("families", [])
                if str(item.get("id") or "").strip()
            },
            product_logistics_type_by_id={
                item["id"]: item
                for item in product_logistics_type_catalog.get("types", [])
                if str(item.get("id") or "").strip()
            },
            truck_body_by_id={
                item["id"]: item
                for item in truck_body_catalog.get("types", [])
                if str(item.get("id") or "").strip()
            },
            truck_type_by_id={
                item["id"]: item
                for item in truck_type_catalog.get("types", [])
                if str(item.get("id") or "").strip()
            },
            truck_operational_by_id={
                item["truck_type_id"]: item
                for item in truck_operational_catalog.get("items", [])
                if str(item.get("truck_type_id") or "").strip()
            },
        ),
    )

    if include_validation:
        runtime.validation = validate_game_world_runtime(runtime)

    return runtime