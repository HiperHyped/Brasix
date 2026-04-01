from __future__ import annotations

import app.game.truck_product_matrix as truck_product_matrix_module
from app.game import build_truck_product_matrix_payload
from app.game.models import (
    GameWorldCatalogSnapshot,
    GameWorldMapSnapshot,
    GameWorldMetadata,
    GameWorldProductSnapshot,
    GameWorldRuntimeDocument,
    GameWorldSourceSummary,
    GameWorldTruckSnapshot,
    GameWorldValidationReport,
)


def test_build_truck_product_matrix_payload_is_consistent() -> None:
    payload = build_truck_product_matrix_payload()

    products = list(payload["products"])
    trucks = list(payload["trucks"])
    products_by_id = {item["id"]: item for item in products}
    trucks_by_id = {item["id"]: item for item in trucks}

    assert payload["summary"]["truck_type_count"] == len(trucks)
    assert payload["summary"]["product_count"] == len(products)
    assert len(trucks) > 0
    assert len(products) > 0

    compatible_pair_count = 0
    for truck in trucks:
        supported_product_count = 0
        truck_body_ids = set(truck["body_type_ids"])

        assert len(truck["cells"]) == len(products)

        for cell in truck["cells"]:
            product = products_by_id[cell["product_id"]]
            expected_overlap = truck_body_ids & set(product["logistics_body_type_ids"])
            expected_effective = bool(expected_overlap)
            if cell.get("manual_override_compatible") is not None:
                expected_effective = bool(cell["manual_override_compatible"])

            assert cell["base_compatible"] is bool(expected_overlap)
            assert cell["compatible"] is expected_effective
            assert set(cell["matched_body_type_ids"]) == expected_overlap
            assert cell["compatibility_source"] in {"logistics_type", "manual"}

            if cell["compatible"]:
                supported_product_count += 1
                compatible_pair_count += 1

        assert truck["supported_product_count"] == supported_product_count

    assert payload["summary"]["compatible_pair_count"] == compatible_pair_count
    assert payload["summary"]["covered_product_count"] == sum(
        1 for product in products if product["compatible_truck_count"] > 0
    )
    assert all(product["compatibility_source"] == "logistics_type" for product in products)
    assert all("preview_image_url_path" in truck for truck in trucks)

    carreta_ls = next((truck for truck in trucks if truck["id"] == "truck_type_carreta_ls"), None)
    assert carreta_ls is not None
    assert carreta_ls["preview_image_url_path"]

    assert products_by_id["laranja"]["logistics_type_id"] == "granel_liquido"
    assert products_by_id["gas-natural"]["logistics_type_id"] == "granel_gasoso_pressurizado"

    liquid_combo = trucks_by_id["truck_type_custom_novo_caminhao_29"]
    assert liquid_combo["body_type_ids"] == ["truck_body_tanque"]
    liquid_combo_base_cells = {cell["product_id"]: cell for cell in liquid_combo["cells"]}
    assert liquid_combo_base_cells["petroleo"]["base_compatible"] is True
    assert liquid_combo_base_cells["etanol"]["base_compatible"] is True
    assert liquid_combo_base_cells["laranja"]["base_compatible"] is True

    gas_combo = trucks_by_id["truck_type_custom_novo_caminhao_30"]
    assert gas_combo["body_type_ids"] == ["truck_body_custom_gás_comprimido"]
    gas_cells_by_product_id = {cell["product_id"]: cell for cell in gas_combo["cells"]}
    assert gas_cells_by_product_id["gas-natural"]["base_compatible"] is True
    assert gas_cells_by_product_id["petroleo"]["base_compatible"] is False
    assert gas_cells_by_product_id["etanol"]["base_compatible"] is False
    assert gas_cells_by_product_id["laranja"]["base_compatible"] is False


def test_build_truck_product_matrix_payload_includes_runtime_trucks_automatically(monkeypatch) -> None:
    body = {
        "id": "truck_body_tanque",
        "label": "Tanque",
        "order": 1,
        "category": "liquid_bulk",
        "cargo_role": "liquid_bulk",
    }
    logistics_type = {
        "id": "granel_liquido",
        "label": "Granel liquido",
        "order": 1,
        "description": "Liquidos em tanque.",
        "body_type_ids": ["truck_body_tanque"],
    }
    product = {
        "id": "produto_teste",
        "order": 1,
        "name": "Produto teste",
        "short_name": "Produto teste",
        "emoji": "🧪",
        "family_id": "energia",
        "logistics_type_id": "granel_liquido",
        "is_active": True,
        "status": "visible",
    }
    base_truck = {
        "id": "truck_type_base_teste",
        "order": 1,
        "label": "Truck base teste",
        "short_label": "Base",
        "size_tier": "pesado",
        "base_vehicle_kind": "rigido",
        "axle_config": "6x2",
        "canonical_body_type_ids": ["truck_body_tanque"],
    }
    injected_truck = {
        "id": "truck_type_injetado_sem_hardcode",
        "order": 2,
        "label": "Truck injetado",
        "short_label": "Injetado",
        "size_tier": "pesado",
        "base_vehicle_kind": "cavalo",
        "axle_config": "6x4",
        "canonical_body_type_ids": ["truck_body_tanque"],
    }

    runtime = GameWorldRuntimeDocument(
        metadata=GameWorldMetadata(
            generated_at="2026-03-31T00:00:00-03:00",
            map_id="mapa_teste",
            map_name="Mapa teste",
            city_count=0,
            route_edge_count=0,
            route_graph_node_count=0,
            product_count=1,
            active_product_count=1,
            truck_type_count=2,
            active_truck_type_count=2,
        ),
        source_summary=GameWorldSourceSummary(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            route_network_id="rede_teste",
            product_catalog_id="produto_teste",
            product_family_catalog_id="familias_teste",
            product_logistics_type_catalog_id="logistica_teste",
            supply_matrix_id="supply_teste",
            demand_matrix_id="demand_teste",
            region_supply_matrix_id="region_teste",
            truck_type_catalog_id="truck_type_catalog_teste",
            truck_body_catalog_id="truck_body_catalog_teste",
            truck_category_catalog_id="truck_category_catalog_teste",
        ),
        map=GameWorldMapSnapshot(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            cities=[],
            route_network={},
            city_count=0,
            graph_node_count=0,
            edge_count=0,
        ),
        products=GameWorldProductSnapshot(
            catalog={"products": [product]},
            family_catalog={"families": [{"id": "energia", "label": "Energia"}]},
            logistics_type_catalog={"types": [logistics_type]},
            supply_matrix={"items": []},
            demand_matrix={"items": []},
            region_supply_matrix={"items": []},
            inference_rules={},
            product_ids=["produto_teste"],
            active_product_ids=["produto_teste"],
            product_count=1,
        ),
        trucks=GameWorldTruckSnapshot(
            type_catalog={"types": [base_truck, injected_truck]},
            body_catalog={"types": [body]},
            category_catalog={"size_tiers": [], "base_vehicle_kinds": []},
            truck_type_ids=["truck_type_base_teste", "truck_type_injetado_sem_hardcode"],
            active_truck_type_ids=["truck_type_base_teste", "truck_type_injetado_sem_hardcode"],
            body_type_ids=["truck_body_tanque"],
            truck_type_count=2,
        ),
        catalogs=GameWorldCatalogSnapshot(
            city_by_id={},
            product_by_id={"produto_teste": product},
            product_family_by_id={"energia": {"id": "energia", "label": "Energia"}},
            product_logistics_type_by_id={"granel_liquido": logistics_type},
            truck_body_by_id={"truck_body_tanque": body},
            truck_type_by_id={
                "truck_type_base_teste": base_truck,
                "truck_type_injetado_sem_hardcode": injected_truck,
            },
        ),
        validation=GameWorldValidationReport(valid=True, error_count=0, warning_count=0, issues=[]),
    )

    monkeypatch.setattr(truck_product_matrix_module, "build_game_world_runtime", lambda include_validation=True: runtime)
    monkeypatch.setattr(truck_product_matrix_module, "load_truck_image_asset_registry_payload", lambda: {"items": []})
    monkeypatch.setattr(truck_product_matrix_module, "load_truck_product_compatibility_overrides_payload", lambda: {"items": []})

    payload = truck_product_matrix_module.build_truck_product_matrix_payload()
    trucks_by_id = {item["id"]: item for item in payload["trucks"]}

    assert payload["summary"]["truck_type_count"] == 2
    assert "truck_type_injetado_sem_hardcode" in trucks_by_id
    assert trucks_by_id["truck_type_injetado_sem_hardcode"]["supported_product_ids"] == ["produto_teste"]


def test_build_truck_product_matrix_payload_applies_manual_overrides(monkeypatch) -> None:
    body_tank = {
        "id": "truck_body_tanque",
        "label": "Tanque",
        "order": 1,
        "category": "liquid_bulk",
        "cargo_role": "liquid_bulk",
    }
    body_box = {
        "id": "truck_body_bau",
        "label": "Bau",
        "order": 2,
        "category": "dry",
        "cargo_role": "dry",
    }
    logistics_type = {
        "id": "granel_liquido",
        "label": "Granel liquido",
        "order": 1,
        "description": "Liquidos em tanque.",
        "body_type_ids": ["truck_body_tanque"],
    }
    product = {
        "id": "produto_teste",
        "order": 1,
        "name": "Produto teste",
        "short_name": "Produto teste",
        "emoji": "🧪",
        "family_id": "energia",
        "logistics_type_id": "granel_liquido",
        "is_active": True,
        "status": "visible",
    }
    automatic_truck = {
        "id": "truck_type_automatico",
        "order": 1,
        "label": "Truck automatico",
        "short_label": "Automatico",
        "size_tier": "pesado",
        "base_vehicle_kind": "rigido",
        "axle_config": "6x2",
        "canonical_body_type_ids": ["truck_body_tanque"],
    }
    manual_truck = {
        "id": "truck_type_manual",
        "order": 2,
        "label": "Truck manual",
        "short_label": "Manual",
        "size_tier": "pesado",
        "base_vehicle_kind": "rigido",
        "axle_config": "6x2",
        "canonical_body_type_ids": ["truck_body_bau"],
    }

    runtime = GameWorldRuntimeDocument(
        metadata=GameWorldMetadata(
            generated_at="2026-03-31T00:00:00-03:00",
            map_id="mapa_teste",
            map_name="Mapa teste",
            city_count=0,
            route_edge_count=0,
            route_graph_node_count=0,
            product_count=1,
            active_product_count=1,
            truck_type_count=2,
            active_truck_type_count=2,
        ),
        source_summary=GameWorldSourceSummary(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            route_network_id="rede_teste",
            product_catalog_id="produto_teste",
            product_family_catalog_id="familias_teste",
            product_logistics_type_catalog_id="logistica_teste",
            supply_matrix_id="supply_teste",
            demand_matrix_id="demand_teste",
            region_supply_matrix_id="region_teste",
            truck_type_catalog_id="truck_type_catalog_teste",
            truck_body_catalog_id="truck_body_catalog_teste",
            truck_category_catalog_id="truck_category_catalog_teste",
        ),
        map=GameWorldMapSnapshot(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            cities=[],
            route_network={},
            city_count=0,
            graph_node_count=0,
            edge_count=0,
        ),
        products=GameWorldProductSnapshot(
            catalog={"products": [product]},
            family_catalog={"families": [{"id": "energia", "label": "Energia"}]},
            logistics_type_catalog={"types": [logistics_type]},
            supply_matrix={"items": []},
            demand_matrix={"items": []},
            region_supply_matrix={"items": []},
            inference_rules={},
            product_ids=["produto_teste"],
            active_product_ids=["produto_teste"],
            product_count=1,
        ),
        trucks=GameWorldTruckSnapshot(
            type_catalog={"types": [automatic_truck, manual_truck]},
            body_catalog={"types": [body_tank, body_box]},
            category_catalog={"size_tiers": [], "base_vehicle_kinds": []},
            truck_type_ids=["truck_type_automatico", "truck_type_manual"],
            active_truck_type_ids=["truck_type_automatico", "truck_type_manual"],
            body_type_ids=["truck_body_tanque", "truck_body_bau"],
            truck_type_count=2,
        ),
        catalogs=GameWorldCatalogSnapshot(
            city_by_id={},
            product_by_id={"produto_teste": product},
            product_family_by_id={"energia": {"id": "energia", "label": "Energia"}},
            product_logistics_type_by_id={"granel_liquido": logistics_type},
            truck_body_by_id={
                "truck_body_tanque": body_tank,
                "truck_body_bau": body_box,
            },
            truck_type_by_id={
                "truck_type_automatico": automatic_truck,
                "truck_type_manual": manual_truck,
            },
        ),
        validation=GameWorldValidationReport(valid=True, error_count=0, warning_count=0, issues=[]),
    )

    monkeypatch.setattr(truck_product_matrix_module, "build_game_world_runtime", lambda include_validation=True: runtime)
    monkeypatch.setattr(truck_product_matrix_module, "load_truck_image_asset_registry_payload", lambda: {"items": []})
    monkeypatch.setattr(
        truck_product_matrix_module,
        "load_truck_product_compatibility_overrides_payload",
        lambda: {
            "items": [
                {
                    "truck_type_id": "truck_type_automatico",
                    "product_id": "produto_teste",
                    "compatible": False,
                    "updated_at": "2026-03-31T11:00:00-03:00",
                },
                {
                    "truck_type_id": "truck_type_manual",
                    "product_id": "produto_teste",
                    "compatible": True,
                    "updated_at": "2026-03-31T11:05:00-03:00",
                },
            ]
        },
    )

    payload = truck_product_matrix_module.build_truck_product_matrix_payload()
    trucks_by_id = {item["id"]: item for item in payload["trucks"]}

    automatic_cell = trucks_by_id["truck_type_automatico"]["cells"][0]
    assert automatic_cell["base_compatible"] is True
    assert automatic_cell["compatible"] is False
    assert automatic_cell["compatibility_source"] == "manual"
    assert automatic_cell["manual_override_compatible"] is False

    manual_cell = trucks_by_id["truck_type_manual"]["cells"][0]
    assert manual_cell["base_compatible"] is False
    assert manual_cell["compatible"] is True
    assert manual_cell["compatibility_source"] == "manual"
    assert manual_cell["manual_override_compatible"] is True
    assert manual_cell["display_count"] == 1

    assert payload["summary"]["manual_override_count"] == 2
    assert trucks_by_id["truck_type_automatico"]["supported_product_ids"] == []
    assert trucks_by_id["truck_type_manual"]["supported_product_ids"] == ["produto_teste"]


def test_build_truck_product_matrix_payload_sorts_trucks_by_size_tier_then_label(monkeypatch) -> None:
    body = {
        "id": "truck_body_bau",
        "label": "Bau",
        "order": 1,
        "category": "dry",
        "cargo_role": "dry",
    }
    logistics_type = {
        "id": "carga_geral_paletizada",
        "label": "Carga geral paletizada",
        "order": 1,
        "description": "Carga geral em bau.",
        "body_type_ids": ["truck_body_bau"],
    }
    product = {
        "id": "produto_teste",
        "order": 1,
        "name": "Produto teste",
        "short_name": "Produto teste",
        "emoji": "📦",
        "family_id": "energia",
        "logistics_type_id": "carga_geral_paletizada",
        "is_active": True,
        "status": "visible",
    }
    trucks = [
        {
            "id": "truck_type_super_pesado_a",
            "order": 1,
            "label": "Alpha super pesado",
            "short_label": "Alpha super pesado",
            "size_tier": "super_pesado",
            "base_vehicle_kind": "combinacao",
            "axle_config": "especial",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_pesado_b",
            "order": 40,
            "label": "Zulu pesado",
            "short_label": "Zulu pesado",
            "size_tier": "pesado",
            "base_vehicle_kind": "rigido",
            "axle_config": "6x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_super_leve_b",
            "order": 99,
            "label": "Bravo super leve",
            "short_label": "Bravo super leve",
            "size_tier": "super_leve",
            "base_vehicle_kind": "rigido",
            "axle_config": "4x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_leve_b",
            "order": 98,
            "label": "Bravo leve",
            "short_label": "Bravo leve",
            "size_tier": "leve",
            "base_vehicle_kind": "rigido",
            "axle_config": "4x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_medio_a",
            "order": 50,
            "label": "Alpha medio",
            "short_label": "Alpha medio",
            "size_tier": "medio",
            "base_vehicle_kind": "rigido",
            "axle_config": "4x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_pesado_a",
            "order": 2,
            "label": "Alpha pesado",
            "short_label": "Alpha pesado",
            "size_tier": "pesado",
            "base_vehicle_kind": "rigido",
            "axle_config": "6x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_leve_a",
            "order": 10,
            "label": "Alpha leve",
            "short_label": "Alpha leve",
            "size_tier": "leve",
            "base_vehicle_kind": "rigido",
            "axle_config": "4x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
        {
            "id": "truck_type_super_leve_a",
            "order": 9,
            "label": "Alpha super leve",
            "short_label": "Alpha super leve",
            "size_tier": "super_leve",
            "base_vehicle_kind": "rigido",
            "axle_config": "4x2",
            "canonical_body_type_ids": ["truck_body_bau"],
        },
    ]

    runtime = GameWorldRuntimeDocument(
        metadata=GameWorldMetadata(
            generated_at="2026-03-31T00:00:00-03:00",
            map_id="mapa_teste",
            map_name="Mapa teste",
            city_count=0,
            route_edge_count=0,
            route_graph_node_count=0,
            product_count=1,
            active_product_count=1,
            truck_type_count=len(trucks),
            active_truck_type_count=len(trucks),
        ),
        source_summary=GameWorldSourceSummary(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            route_network_id="rede_teste",
            product_catalog_id="produto_teste",
            product_family_catalog_id="familias_teste",
            product_logistics_type_catalog_id="logistica_teste",
            supply_matrix_id="supply_teste",
            demand_matrix_id="demand_teste",
            region_supply_matrix_id="region_teste",
            truck_type_catalog_id="truck_type_catalog_teste",
            truck_body_catalog_id="truck_body_catalog_teste",
            truck_category_catalog_id="truck_category_catalog_teste",
        ),
        map=GameWorldMapSnapshot(
            active_map_id="mapa_teste",
            active_map_name="Mapa teste",
            cities=[],
            route_network={},
            city_count=0,
            graph_node_count=0,
            edge_count=0,
        ),
        products=GameWorldProductSnapshot(
            catalog={"products": [product]},
            family_catalog={"families": [{"id": "energia", "label": "Energia"}]},
            logistics_type_catalog={"types": [logistics_type]},
            supply_matrix={"items": []},
            demand_matrix={"items": []},
            region_supply_matrix={"items": []},
            inference_rules={},
            product_ids=["produto_teste"],
            active_product_ids=["produto_teste"],
            product_count=1,
        ),
        trucks=GameWorldTruckSnapshot(
            type_catalog={"types": trucks},
            body_catalog={"types": [body]},
            category_catalog={"size_tiers": [], "base_vehicle_kinds": []},
            truck_type_ids=[truck["id"] for truck in trucks],
            active_truck_type_ids=[truck["id"] for truck in trucks],
            body_type_ids=["truck_body_bau"],
            truck_type_count=len(trucks),
        ),
        catalogs=GameWorldCatalogSnapshot(
            city_by_id={},
            product_by_id={"produto_teste": product},
            product_family_by_id={"energia": {"id": "energia", "label": "Energia"}},
            product_logistics_type_by_id={"carga_geral_paletizada": logistics_type},
            truck_body_by_id={"truck_body_bau": body},
            truck_type_by_id={truck["id"]: truck for truck in trucks},
        ),
        validation=GameWorldValidationReport(valid=True, error_count=0, warning_count=0, issues=[]),
    )

    monkeypatch.setattr(truck_product_matrix_module, "build_game_world_runtime", lambda include_validation=True: runtime)
    monkeypatch.setattr(truck_product_matrix_module, "load_truck_image_asset_registry_payload", lambda: {"items": []})
    monkeypatch.setattr(truck_product_matrix_module, "load_truck_product_compatibility_overrides_payload", lambda: {"items": []})

    payload = truck_product_matrix_module.build_truck_product_matrix_payload()

    assert [truck["id"] for truck in payload["trucks"]] == [
        "truck_type_super_leve_a",
        "truck_type_super_leve_b",
        "truck_type_leve_a",
        "truck_type_leve_b",
        "truck_type_medio_a",
        "truck_type_pesado_a",
        "truck_type_pesado_b",
        "truck_type_super_pesado_a",
    ]
