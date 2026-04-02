from __future__ import annotations

from app.game import build_game_world_runtime, validate_game_world_runtime


def _build_runtime_copy():
    return build_game_world_runtime(include_validation=False).model_copy(deep=True)


def test_build_game_world_runtime_contains_core_snapshots() -> None:
    runtime = build_game_world_runtime(include_validation=False)

    assert runtime.map.active_map_id
    assert runtime.map.city_count > 0
    assert runtime.products.product_count > 0
    assert runtime.products.active_product_ids
    assert runtime.trucks.truck_type_count > 0
    assert runtime.trucks.active_truck_type_ids
    assert runtime.trucks.operational_catalog["id"] == "truck_operational_catalog_v1"
    assert runtime.catalogs.city_by_id
    assert runtime.catalogs.product_by_id
    assert runtime.catalogs.truck_type_by_id
    assert runtime.catalogs.truck_operational_by_id
    assert runtime.source_summary.truck_operational_catalog_id == runtime.trucks.operational_catalog["id"]

    vuc_operational = runtime.catalogs.truck_operational_by_id["truck_type_vuc_4x2"]
    vuc_type = runtime.catalogs.truck_type_by_id["truck_type_vuc_4x2"]
    assert vuc_type["payload_weight_kg"] == vuc_operational["payload_weight_kg"]
    assert vuc_type["cargo_volume_m3"] == vuc_operational["cargo_volume_m3"]
    assert vuc_type["energy_source"] == vuc_operational["energy_source"] == "diesel"
    assert vuc_type["consumption_unit"] == vuc_operational["consumption_unit"] == "l_per_km"
    assert vuc_type["base_fixed_cost_brl_per_day"] == vuc_operational["base_fixed_cost_brl_per_day"] == 240
    assert vuc_type["supported_surface_codes"] == vuc_operational["supported_surface_codes"] == ["double_road", "single_road"]
    assert vuc_type["load_time_minutes"] == vuc_operational["load_time_minutes"] == 35
    assert vuc_type["operational"]["catalog_id"] == runtime.trucks.operational_catalog["id"]


def test_build_game_world_runtime_validation_has_no_errors_for_seed_data() -> None:
    runtime = build_game_world_runtime(include_validation=True)

    assert runtime.validation.error_count == 0
    assert runtime.validation.valid is True


def test_validate_game_world_runtime_detects_unknown_product_output() -> None:
    runtime = _build_runtime_copy()
    product = runtime.products.catalog["products"][0]
    product["outputs"] = ["produto-inexistente"]

    report = validate_game_world_runtime(runtime)

    assert any(issue.code == "product_unknown_outputs" for issue in report.issues)
    assert report.error_count >= 1


def test_validate_game_world_runtime_detects_duplicate_supply_matrix_pair() -> None:
    runtime = _build_runtime_copy()
    city_id = next(iter(runtime.catalogs.city_by_id))
    product_id = next(iter(runtime.catalogs.product_by_id))

    runtime.products.supply_matrix.setdefault("items", []).extend(
        [
            {
                "id": "synthetic_supply_pair_1",
                "city_id": city_id,
                "product_id": product_id,
                "value": 10,
            },
            {
                "id": "synthetic_supply_pair_2",
                "city_id": city_id,
                "product_id": product_id,
                "value": 12,
            },
        ]
    )

    report = validate_game_world_runtime(runtime)

    assert any(issue.code == "supply_matrix_duplicate_city_product" for issue in report.issues)
    assert report.error_count >= 1


def test_validate_game_world_runtime_detects_unknown_region_supply_entry() -> None:
    runtime = _build_runtime_copy()
    product_id = next(iter(runtime.catalogs.product_by_id))

    runtime.products.region_supply_matrix["items"] = [
        {
            "id": "synthetic_region_supply_1",
            "state_code": "ZZ",
            "source_region_name": "Regiao Fantasma",
            "product_id": product_id,
            "value": 25,
        }
    ]

    report = validate_game_world_runtime(runtime)

    assert any(issue.code == "region_supply_matrix_unknown_region" for issue in report.issues)
    assert report.error_count >= 1


def test_validate_game_world_runtime_detects_unknown_inference_family_weight() -> None:
    runtime = _build_runtime_copy()
    runtime.products.inference_rules.setdefault("demand_estimation", {}).setdefault("family_weights", {})["familia-fantasma"] = 0.5

    report = validate_game_world_runtime(runtime)

    assert any(issue.code == "inference_unknown_family_weight" for issue in report.issues)
    assert report.error_count >= 1