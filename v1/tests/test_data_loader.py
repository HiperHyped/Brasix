from __future__ import annotations

from pathlib import Path

from app.services import data_loader
from app.services import (
    load_city_product_demand_matrix_payload,
    load_effective_truck_type_catalog_payload,
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
    load_product_operational_catalog_payload,
    load_map_editor_payload,
    load_city_product_supply_matrix_payload,
    load_region_product_supply_matrix_payload,
    load_reference_data,
    load_truck_body_catalog_payload,
    load_truck_brand_family_catalog_payload,
    load_truck_category_catalog_payload,
    load_truck_custom_catalog_payload,
    load_truck_gallery_payload,
    load_truck_image_asset_registry_payload,
    load_truck_image_generation_config_payload,
    load_truck_operational_catalog_payload,
    load_truck_image_prompt_overrides_payload,
    load_truck_image_review_queue_payload,
    load_truck_product_compatibility_overrides_payload,
    load_truck_image_visual_definitions_payload,
    load_truck_silhouette_catalog_payload,
    load_truck_sprite_2d_catalog_payload,
    load_truck_type_catalog_payload,
)
from app.services.data_loader import load_user_city_catalog_payload


def test_reference_data_loads_generated_files() -> None:
    data = load_reference_data()

    assert len(data.commodities) == 30
    assert len(data.cities) == 137
    assert "soja" in data.commodities
    assert any(city.state_code == "MT" for city in data.cities.values())
    assert all(city.latitude is not None for city in data.cities.values())


def test_map_editor_payload_includes_graph_node_styles() -> None:
    payload = load_map_editor_payload()

    assert payload["graph_node_styles"]["default_style_id"] == "graph_node_style_junction_diamond"
    assert len(payload["graph_node_styles"]["styles"]) >= 3
    assert any(style["id"] == "graph_node_style_junction_circle" for style in payload["graph_node_styles"]["styles"])
    assert payload["city_autofill"]["provider"] == "deterministic_geocoder"
    assert payload["city_autofill"]["reverse_geocoder"]["provider"] == "nominatim"


def test_user_city_catalog_sanitizes_legacy_openai_autofill() -> None:
    document_path = Path(__file__).resolve().parent / "_tmp_user_cities.json"
    try:
        document_path.write_text(
            """
            {
              "id": "city_catalog_user_v1",
              "cities": [
                {
                  "id": "custom-city-1",
                  "name": "Barra do PiraÃ­",
                  "label": "Barra do PiraÃ­, rj",
                  "state_code": "rj",
                  "state_name": "Rio de Janeiro",
                  "source_region_name": "RegiÃ£o de Barra do PiraÃ­",
                  "population_thousands": 103.0,
                  "latitude": -21.9,
                  "longitude": -42.6,
                  "is_user_created": true,
                  "autofill": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "status": "completed",
                    "summary": "Texto legado"
                  }
                }
              ]
            }
            """.strip(),
            encoding="utf-8",
        )

        payload = load_user_city_catalog_payload(document_path)

        assert payload["cities"][0]["name"] == "Barra do Piraí"
        assert payload["cities"][0]["label"] == "Barra do Piraí, RJ"
        assert payload["cities"][0]["source_region_name"] == "Região de Barra do Piraí"
        assert payload["cities"][0]["autofill"] is None
    finally:
        document_path.unlink(missing_ok=True)


def test_truck_catalog_payloads_load() -> None:
    gallery_payload = load_truck_gallery_payload()
    type_payload = load_truck_type_catalog_payload()
    effective_type_payload = load_effective_truck_type_catalog_payload()
    custom_payload = load_truck_custom_catalog_payload()
    body_payload = load_truck_body_catalog_payload()
    sprite_payload = load_truck_sprite_2d_catalog_payload()
    brand_payload = load_truck_brand_family_catalog_payload()
    silhouette_payload = load_truck_silhouette_catalog_payload()
    visual_definition_payload = load_truck_image_visual_definitions_payload()
    generation_payload = load_truck_image_generation_config_payload()
    operational_payload = load_truck_operational_catalog_payload()
    overrides_payload = load_truck_image_prompt_overrides_payload()
    registry_payload = load_truck_image_asset_registry_payload()
    review_queue_payload = load_truck_image_review_queue_payload()
    category_payload = load_truck_category_catalog_payload()

    assert gallery_payload["screen"]["id"] == "ui_truck_gallery_screen_v1"
    assert gallery_payload["layout_desktop"]["id"] == "ui_layout_desktop_truck_gallery_v1"
    assert gallery_payload["themes"]["default_theme_id"] == "map_editor_theme_day"

    assert type_payload["id"] == "truck_type_catalog_v1"
    assert len(type_payload["types"]) >= 20
    assert type_payload["types"][0]["id"] == "truck_type_vuc_4x2"
    assert type_payload["types"][-1]["id"] == "truck_type_cegonheiro"
    assert effective_type_payload["id"] == "truck_type_catalog_v1"
    assert len(effective_type_payload["types"]) >= len(type_payload["types"])
    edited_vuc = next(item for item in effective_type_payload["types"] if item["id"] == "truck_type_vuc_4x2")
    assert edited_vuc["size_tier"] == "super_leve"
    assert edited_vuc["base_vehicle_kind"] == "rigido"
    assert edited_vuc["preferred_body_type_id"] == "truck_body_bau"
    assert len(edited_vuc["canonical_body_type_ids"]) == 4
    assert edited_vuc["payload_weight_kg"] == 2250
    assert edited_vuc["cargo_volume_m3"] == 4
    assert edited_vuc["energy_source"] == "diesel"
    assert edited_vuc["consumption_unit"] == "l_per_km"
    assert edited_vuc["empty_consumption_per_km"] == 0.19
    assert edited_vuc["loaded_consumption_per_km"] == 0.24
    assert edited_vuc["base_fixed_cost_brl_per_day"] == 240
    assert edited_vuc["base_variable_cost_brl_per_km"] == 0.78
    assert edited_vuc["urban_access_level"] == "urban_preferred"
    assert edited_vuc["road_access_level"] == "standard_network"
    assert edited_vuc["supported_surface_codes"] == ["double_road", "single_road"]
    assert edited_vuc["load_time_minutes"] == 35
    assert edited_vuc["unload_time_minutes"] == 30
    assert edited_vuc["operational"]["catalog_id"] == "truck_operational_catalog_v1"

    assert body_payload["id"] == "truck_body_catalog_v1"
    assert any(item["id"] == "truck_body_boiadeiro" and item["label"] == "Carga viva" for item in body_payload["types"])
    assert any(item["id"] == "truck_body_canavieiro" for item in body_payload["types"])
    assert any(item["id"] == "truck_body_cegonheiro" for item in body_payload["types"])

    assert sprite_payload["id"] == "truck_sprite_2d_catalog_v1"
    assert any(item["id"] == "truck_sprite_bitrem" for item in sprite_payload["profiles"])
    assert any(item["id"] == "truck_sprite_cegonheiro" for item in sprite_payload["profiles"])

    assert brand_payload["id"] == "truck_brand_family_catalog_v1"
    assert any(item["id"] == "truck_family_volvo_fh" for item in brand_payload["families"])
    assert any(item["id"] == "truck_family_scania_r_s" for item in brand_payload["families"])

    assert silhouette_payload["id"] == "truck_silhouette_catalog_v1"
    assert len(silhouette_payload["specs"]) >= 20
    assert any(item["type_id"] == "truck_type_bitrem" for item in silhouette_payload["specs"])

    assert visual_definition_payload["id"] == "truck_image_visual_definitions_v1"
    assert len(visual_definition_payload["definitions"]) >= 20
    assert any(item["type_id"] == "truck_type_bitrem" for item in visual_definition_payload["definitions"])

    assert generation_payload["id"] == "truck_image_generation_config_v1"
    assert generation_payload["image_api"]["primary_model"] == "gpt-image-1.5"
    assert generation_payload["image_api"]["output_format"] == "png"

    assert operational_payload["id"] == "truck_operational_catalog_v1"
    assert operational_payload["source_file"] == "merged_truck_data.json"
    assert len(operational_payload["items"]) == 37
    assert any(item["truck_type_id"] == "truck_type_vuc_4x2" for item in operational_payload["items"])
    electric_toco = next(item for item in operational_payload["items"] if item["truck_type_id"] == "truck_type_toco_leve_eletrico_4x2")
    assert electric_toco["energy_source"] == "electric"
    assert electric_toco["consumption_unit"] == "kwh_per_km"

    assert overrides_payload["id"] == "truck_image_prompt_overrides_v1"
    assert isinstance(overrides_payload["overrides"], list)

    assert registry_payload["id"] == "truck_image_asset_registry_v1"
    assert isinstance(registry_payload["items"], list)
    if registry_payload["items"]:
        first_item = registry_payload["items"][0]
        assert "truck_type_id" in first_item
        assert "status" in first_item

    assert review_queue_payload["id"] == "truck_image_review_queue_v1"
    assert isinstance(review_queue_payload["pending_type_ids"], list)
    assert category_payload["id"] == "truck_category_catalog_v1"
    assert isinstance(category_payload["size_tiers"], list)
    assert [item["id"] for item in category_payload["size_tiers"]] == ["super_leve", "leve", "medio", "pesado", "super_pesado"]
    assert [item["id"] for item in category_payload["base_vehicle_kinds"]] == ["rigido", "cavalo", "combinacao", "especial"]

    refrigerated_combo = next(item for item in custom_payload["items"] if item["id"] == "truck_type_custom_novo_caminhao_27")
    assert refrigerated_combo["label"] == "Carreta frigorificada"
    assert refrigerated_combo["base_vehicle_kind"] == "combinacao"
    assert refrigerated_combo["preferred_body_type_id"] == "truck_body_frigorifico"

    liquid_combo = next(item for item in custom_payload["items"] if item["id"] == "truck_type_custom_novo_caminhao_29")
    assert liquid_combo["canonical_body_type_ids"] == ["truck_body_tanque"]
    assert liquid_combo["preferred_body_type_id"] == "truck_body_tanque"

    gas_combo = next(item for item in custom_payload["items"] if item["id"] == "truck_type_custom_novo_caminhao_30")
    assert gas_combo["canonical_body_type_ids"] == ["truck_body_custom_gás_comprimido"]
    assert gas_combo["preferred_body_type_id"] == "truck_body_custom_gás_comprimido"

    live_cargo_toco = next(item for item in custom_payload["items"] if item["id"] == "truck_type_custom_novo_caminhao_37")
    assert live_cargo_toco["canonical_body_type_ids"] == ["truck_body_boiadeiro"]
    assert live_cargo_toco["preferred_body_type_id"] == "truck_body_boiadeiro"


def test_normalize_truck_type_record_preserves_visual_body_outside_canonical_list() -> None:
    normalized = data_loader.normalize_truck_type_record(
        {
            "id": "truck_type_test_visual_only",
            "label": "Teste visual",
            "short_label": "Teste visual",
            "size_tier": "pesado",
            "base_vehicle_kind": "cavalo",
            "axle_config": "6x4",
            "canonical_body_type_ids": ["truck_body_basculante"],
            "preferred_body_type_id": "truck_body_carga_seca",
        }
    )

    assert normalized["canonical_body_type_ids"] == ["truck_body_basculante"]
    assert normalized["preferred_body_type_id"] == "truck_body_carga_seca"


def test_normalize_truck_type_record_syncs_custom_body_to_preferred() -> None:
    normalized = data_loader.normalize_truck_type_record(
        {
            "id": "truck_type_test_custom_body",
            "label": "Teste custom",
            "short_label": "Teste custom",
            "size_tier": "medio",
            "base_vehicle_kind": "rigido",
            "axle_config": "6x2",
            "canonical_body_type_ids": ["truck_body_bau"],
            "preferred_body_type_id": "truck_body_tanque",
            "is_custom": True,
        }
    )

    assert normalized["canonical_body_type_ids"] == ["truck_body_tanque"]
    assert normalized["preferred_body_type_id"] == "truck_body_tanque"


def test_load_truck_product_compatibility_overrides_payload_normalizes_duplicates() -> None:
    document_path = Path(__file__).resolve().parent / "_tmp_truck_product_compatibility_overrides.json"
    try:
        document_path.write_text(
            """
            {
              "id": "truck_product_compatibility_overrides_v1",
              "items": [
                {"truck_type_id": "truck_a", "product_id": "produto_x", "compatible": false, "updated_at": "2026-03-31T10:00:00-03:00"},
                {"truck_type_id": "truck_a", "product_id": "produto_x", "compatible": true, "updated_at": "2026-03-31T10:05:00-03:00"},
                {"truck_type_id": "", "product_id": "produto_invalido", "compatible": true}
              ]
            }
            """.strip(),
            encoding="utf-8",
        )

        payload = load_truck_product_compatibility_overrides_payload(document_path)

        assert payload["id"] == "truck_product_compatibility_overrides_v1"
        assert payload["items"] == [
            {
                "truck_type_id": "truck_a",
                "product_id": "produto_x",
                "compatible": True,
                "updated_at": "2026-03-31T10:05:00-03:00",
            }
        ]
    finally:
        document_path.unlink(missing_ok=True)


def test_product_editor_payloads_load() -> None:
    editor_payload = load_product_editor_payload()
    editor_v1_payload = load_product_editor_v1_payload()
    editor_v2_payload = load_product_editor_v2_payload()
    editor_v3_payload = load_product_editor_v3_payload()
    family_payload = load_product_family_catalog_payload()
    logistics_payload = load_product_logistics_type_catalog_payload()
    product_catalog_payload = load_product_catalog_v2_payload()
    product_catalog_master_payload = load_product_catalog_v2_master_payload()
    product_operational_payload = load_product_operational_catalog_payload()
    supply_payload = load_city_product_supply_matrix_payload()
    demand_payload = load_city_product_demand_matrix_payload()
    region_supply_payload = load_region_product_supply_matrix_payload()
    inference_payload = load_product_inference_rules_payload()

    assert editor_payload["screen"]["id"] == "ui_product_editor_screen_v1"
    assert editor_payload["layout_desktop"]["id"] == "ui_layout_desktop_product_editor_v1"
    assert editor_payload["themes"]["default_theme_id"] == "map_editor_theme_day"
    assert editor_v1_payload["screen"]["id"] == "ui_product_editor_v1_screen_v1"
    assert editor_v1_payload["layout_desktop"]["id"] == "ui_layout_desktop_product_editor_v1"
    assert editor_v1_payload["themes"]["default_theme_id"] == "map_editor_theme_day"
    assert any(item["key"] == "Mouse direito" for item in editor_v1_payload["shortcuts"]["items"])
    assert editor_v2_payload["screen"]["id"] == "ui_product_editor_v2_screen_v1"
    assert editor_v2_payload["layout_desktop"]["id"] == "ui_layout_desktop_product_editor_v2"
    assert editor_v2_payload["themes"]["default_theme_id"] == "map_editor_theme_day"
    assert editor_v3_payload["screen"]["id"] == "ui_product_editor_v3_screen_v1"
    assert editor_v3_payload["layout_desktop"]["id"] == "ui_layout_desktop_product_editor_v3"
    assert editor_v3_payload["themes"]["default_theme_id"] == "map_editor_theme_day"

    assert family_payload["id"] == "product_family_catalog_v1"
    assert [item["id"] for item in family_payload["families"]] == ["agro", "pecuaria", "florestal", "mineral", "energia", "derivado"]

    assert logistics_payload["id"] == "product_logistics_type_catalog_v1"
    assert any(item["id"] == "granel_seco" for item in logistics_payload["types"])
    assert any(item["id"] == "granel_liquido" for item in logistics_payload["types"])
    assert any(
        item["id"] == "granel_gasoso_pressurizado"
        and "truck_body_custom_gás_comprimido" in item["body_type_ids"]
        for item in logistics_payload["types"]
    )
    assert any(item["id"] == "cana_in_natura" and item["body_type_ids"] == ["truck_body_canavieiro"] for item in logistics_payload["types"])
    assert any(item["id"] == "transporte_veiculos" and item["body_type_ids"] == ["truck_body_cegonheiro"] for item in logistics_payload["types"])

    assert product_catalog_payload["id"] == "product_catalog_v2"
    assert len(product_catalog_payload["products"]) == 30
    assert product_catalog_payload["products"][0]["id"] == "soja"
    assert any(item["id"] == "petroleo" and item["hazardous"] is True for item in product_catalog_payload["products"])
    assert any(item["id"] == "pesca" and item["temperature_control_required"] is True for item in product_catalog_payload["products"])
    assert any(
        item["id"] == "laranja"
        and item["logistics_type_id"] == "granel_liquido"
        and item["compatible_body_type_ids"] == ["truck_body_tanque"]
        for item in product_catalog_payload["products"]
    )
    assert any(
        item["id"] == "cana-de-acucar"
        and item["logistics_type_id"] == "cana_in_natura"
        and item["compatible_body_type_ids"] == ["truck_body_canavieiro"]
        for item in product_catalog_payload["products"]
    )
    assert product_catalog_master_payload["id"] == "product_catalog_v2"
    assert len(product_catalog_master_payload["products"]) == 46
    assert any(item["id"] == "veiculos" and item["emoji"] for item in product_catalog_master_payload["products"])
    assert any(
        item["id"] == "laranja"
        and item["logistics_type_id"] == "granel_liquido"
        and item["compatible_body_type_ids"] == ["truck_body_tanque"]
        for item in product_catalog_master_payload["products"]
    )
    assert any(
        item["id"] == "veiculos"
        and item["logistics_type_id"] == "transporte_veiculos"
        and item["compatible_body_type_ids"] == ["truck_body_cegonheiro"]
        for item in product_catalog_master_payload["products"]
    )
    assert any(item["id"] == "derivado" for item in family_payload["families"])

    assert supply_payload["id"] == "city_product_supply_matrix_v3"
    assert supply_payload["seed_source"]["kind"] == "workbook_rewrite"
    assert len(supply_payload["items"]) >= 2800
    assert any(item["product_id"] == "soja" for item in supply_payload["items"])

    assert demand_payload["id"] == "city_product_demand_matrix_v3"
    assert demand_payload["seed_source"]["kind"] == "workbook_rewrite"
    assert len(demand_payload["items"]) >= 2000
    assert any(item["product_id"] == "petroleo" for item in demand_payload["items"])

    assert region_supply_payload["id"] == "region_product_supply_matrix_v1"
    assert region_supply_payload["items"] == []

    assert product_operational_payload["id"] == "product_operational_catalog_v1"
    assert isinstance(product_operational_payload["items"], list)
    assert len(product_operational_payload["items"]) == 46
    assert any(
        item["product_id"] == "soja"
        and item["price_reference_brl_per_unit"] == 2270
        and item["is_seasonal"] is True
        for item in product_operational_payload["items"]
    )
    assert any(
        item["product_id"] == "veiculos"
        and item["unit"] == "unidade"
        and item["price_reference_brl_per_unit"] == 90000
        for item in product_operational_payload["items"]
    )

    assert inference_payload["id"] == "product_inference_rules_v1"
    assert inference_payload["supply_interpolation"]["method"] == "inverse_distance_weighting"
    assert inference_payload["demand_estimation"]["family_weights"]["energia"] == 0.75


def test_product_field_documents_default_to_empty() -> None:
    field_payload = load_product_field_edit_document("soja", "supply")
    baked_payload = load_product_field_baked_document("soja", "demand")

    assert field_payload["product_id"] == "soja"
    assert field_payload["layer"] == "supply"
    assert field_payload["strokes"] == []
    assert baked_payload["product_id"] == "soja"
    assert baked_payload["layer"] == "demand"
    assert isinstance(baked_payload["city_values"], list)
    if baked_payload["city_values"]:
        first_entry = baked_payload["city_values"][0]
        assert "city_id" in first_entry
        assert "final_value" in first_entry


def test_effective_truck_catalog_includes_custom_items(monkeypatch) -> None:
    monkeypatch.setattr(
        data_loader,
        "load_truck_catalog_hidden_payload",
        lambda: {"id": "truck_catalog_hidden_v1", "hidden_type_ids": []},
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_type_catalog_payload",
        lambda: {
            "id": "truck_type_catalog_v1",
            "types": [
                {
                    "id": "truck_type_vuc_4x2",
                    "order": 1,
                    "label": "VUC 4x2",
                    "short_label": "VUC",
                    "size_tier": "smallest",
                    "base_vehicle_kind": "rigid",
                    "axle_config": "4x2",
                    "combination_kind": "single_unit",
                    "cargo_scope": "urban_last_mile",
                    "canonical_body_type_ids": ["truck_body_bau"],
                }
            ],
        },
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_catalog_edits_payload",
        lambda: {
            "id": "truck_catalog_edits_v1",
            "items": [
                {
                    "truck_type_id": "truck_type_vuc_4x2",
                    "label": "VUC revisado",
                    "size_tier": "small",
                    "base_vehicle_kind": "rigid",
                    "axle_config": "4x2",
                    "combination_kind": "single_unit",
                    "cargo_scope": "urban_and_regional",
                    "canonical_body_type_id": "truck_body_carga_seca",
                    "notes": "catalogo editado",
                }
            ],
        },
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_custom_catalog_payload",
        lambda: {
            "id": "truck_custom_catalog_v1",
            "items": [
                {
                    "id": "truck_type_custom_van_1",
                    "order": 99,
                    "label": "Van de carga",
                    "short_label": "Van",
                    "size_tier": "small",
                    "base_vehicle_kind": "rigid",
                    "axle_config": "4x2",
                    "combination_kind": "single_unit",
                    "cargo_scope": "urban_last_mile",
                    "canonical_body_type_id": "truck_body_bau",
                    "notes": "item customizado",
                }
            ],
        },
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_operational_catalog_payload",
        lambda: {
            "id": "truck_operational_catalog_v1",
            "items": [
                {
                    "truck_type_id": "truck_type_vuc_4x2",
                    "payload_weight_kg": 2200,
                    "cargo_volume_m3": 4,
                    "overall_length_m": 6.3,
                    "overall_width_m": 2.1,
                    "overall_height_m": 2.6,
                    "energy_source": "diesel",
                    "consumption_unit": "l_per_km",
                    "empty_consumption_per_km": 0.19,
                    "loaded_consumption_per_km": 0.24,
                    "truck_price_brl": 198000,
                    "base_fixed_cost_brl_per_day": 240,
                    "base_variable_cost_brl_per_km": 0.78,
                    "urban_access_level": "urban_preferred",
                    "road_access_level": "standard_network",
                    "supported_surface_codes": ["double_road", "single_road"],
                    "load_time_minutes": 35,
                    "unload_time_minutes": 30,
                    "confidence": "high",
                    "research_basis": "test_fixture",
                    "source_urls": ["https://example.com/vuc"],
                    "notes": "operacional base",
                },
                {
                    "truck_type_id": "truck_type_custom_van_1",
                    "payload_weight_kg": 1500,
                    "cargo_volume_m3": 3,
                    "overall_length_m": 5.9,
                    "overall_width_m": 2.0,
                    "overall_height_m": 2.3,
                    "energy_source": "diesel",
                    "consumption_unit": "l_per_km",
                    "empty_consumption_per_km": 0.15,
                    "loaded_consumption_per_km": 0.18,
                    "truck_price_brl": 132000,
                    "base_fixed_cost_brl_per_day": 175,
                    "base_variable_cost_brl_per_km": 0.55,
                    "urban_access_level": "urban_free",
                    "road_access_level": "standard_network",
                    "supported_surface_codes": ["double_road", "single_road"],
                    "load_time_minutes": 30,
                    "unload_time_minutes": 25,
                    "confidence": "medium",
                    "research_basis": "test_fixture",
                    "source_urls": [],
                    "notes": "operacional custom",
                },
            ],
        },
    )

    payload = data_loader.load_effective_truck_type_catalog_payload()
    types_by_id = {item["id"]: item for item in payload["types"]}

    assert types_by_id["truck_type_vuc_4x2"]["label"] == "VUC revisado"
    assert types_by_id["truck_type_vuc_4x2"]["canonical_body_type_ids"] == ["truck_body_bau"]
    assert types_by_id["truck_type_vuc_4x2"]["preferred_body_type_id"] == "truck_body_carga_seca"
    assert types_by_id["truck_type_vuc_4x2"]["notes"] == "catalogo editado"
    assert types_by_id["truck_type_vuc_4x2"]["is_custom"] is False
    assert types_by_id["truck_type_vuc_4x2"]["payload_weight_kg"] == 2200
    assert types_by_id["truck_type_vuc_4x2"]["energy_source"] == "diesel"
    assert types_by_id["truck_type_vuc_4x2"]["truck_price_brl"] == 198000
    assert types_by_id["truck_type_vuc_4x2"]["supported_surface_codes"] == ["double_road", "single_road"]
    assert types_by_id["truck_type_vuc_4x2"]["operational"]["notes"] == "operacional base"

    assert types_by_id["truck_type_custom_van_1"]["label"] == "Van de carga"
    assert types_by_id["truck_type_custom_van_1"]["canonical_body_type_ids"] == ["truck_body_bau"]
    assert types_by_id["truck_type_custom_van_1"]["is_custom"] is True
    assert types_by_id["truck_type_custom_van_1"]["truck_price_brl"] == 132000
    assert types_by_id["truck_type_custom_van_1"]["base_fixed_cost_brl_per_day"] == 175
    assert types_by_id["truck_type_custom_van_1"]["load_time_minutes"] == 30
    assert types_by_id["truck_type_custom_van_1"]["cargo_volume_m3"] == 3
    assert types_by_id["truck_type_custom_van_1"]["operational"]["research_basis"] == "test_fixture"


def test_effective_truck_catalog_sorts_by_size_tier_then_label(monkeypatch) -> None:
    monkeypatch.setattr(
        data_loader,
        "load_truck_catalog_hidden_payload",
        lambda: {"id": "truck_catalog_hidden_v1", "hidden_type_ids": []},
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_catalog_edits_payload",
        lambda: {"id": "truck_catalog_edits_v1", "items": []},
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_type_catalog_payload",
        lambda: {
            "id": "truck_type_catalog_v1",
            "types": [
                {
                    "id": "truck_type_pesado_zulu",
                    "order": 50,
                    "label": "Zulu pesado",
                    "short_label": "Zulu pesado",
                    "size_tier": "pesado",
                    "base_vehicle_kind": "rigido",
                    "axle_config": "6x2",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
                {
                    "id": "truck_type_super_pesado_omega",
                    "order": 1,
                    "label": "Omega super pesado",
                    "short_label": "Omega super pesado",
                    "size_tier": "super_pesado",
                    "base_vehicle_kind": "especial",
                    "axle_config": "8x4",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
                {
                    "id": "truck_type_medio_alpha",
                    "order": 10,
                    "label": "Alpha medio",
                    "short_label": "Alpha medio",
                    "size_tier": "medio",
                    "base_vehicle_kind": "rigido",
                    "axle_config": "4x2",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
                {
                    "id": "truck_type_leve_beta",
                    "order": 99,
                    "label": "Beta leve",
                    "short_label": "Beta leve",
                    "size_tier": "leve",
                    "base_vehicle_kind": "rigido",
                    "axle_config": "4x2",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
                {
                    "id": "truck_type_super_leve_alpha",
                    "order": 120,
                    "label": "Alpha super leve",
                    "short_label": "Alpha super leve",
                    "size_tier": "super_leve",
                    "base_vehicle_kind": "rigido",
                    "axle_config": "4x2",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
            ],
        },
    )
    monkeypatch.setattr(
        data_loader,
        "load_truck_custom_catalog_payload",
        lambda: {
            "id": "truck_custom_catalog_v1",
            "items": [
                {
                    "id": "truck_type_custom_alpha_leve",
                    "order": 120,
                    "label": "Alpha leve",
                    "short_label": "Alpha leve",
                    "size_tier": "leve",
                    "base_vehicle_kind": "rigido",
                    "axle_config": "4x2",
                    "canonical_body_type_ids": ["truck_body_bau"],
                    "preferred_body_type_id": "truck_body_bau",
                    "notes": "",
                }
            ],
        },
    )

    payload = data_loader.load_effective_truck_type_catalog_payload()

    assert [item["id"] for item in payload["types"]] == [
        "truck_type_super_leve_alpha",
        "truck_type_custom_alpha_leve",
        "truck_type_leve_beta",
        "truck_type_medio_alpha",
        "truck_type_pesado_zulu",
        "truck_type_super_pesado_omega",
    ]


def test_active_truck_operational_records_are_complete() -> None:
    effective_payload = load_effective_truck_type_catalog_payload()
    operational_payload = load_truck_operational_catalog_payload()

    active_ids = {
        str(item.get("id") or "").strip()
        for item in effective_payload.get("types", [])
        if str(item.get("id") or "").strip()
    }
    operational_by_id = {
        str(item.get("truck_type_id") or "").strip(): dict(item)
        for item in operational_payload.get("items", [])
        if str(item.get("truck_type_id") or "").strip()
    }

    required_scalar_fields = [
        "payload_weight_kg",
        "cargo_volume_m3",
        "overall_length_m",
        "overall_width_m",
        "overall_height_m",
        "energy_source",
        "consumption_unit",
        "empty_consumption_per_km",
        "loaded_consumption_per_km",
        "truck_price_brl",
        "base_fixed_cost_brl_per_day",
        "base_variable_cost_brl_per_km",
        "implement_cost_brl",
        "urban_access_level",
        "road_access_level",
        "load_time_minutes",
        "unload_time_minutes",
    ]

    missing_records: list[str] = []
    incomplete_fields: list[str] = []

    for truck_type_id in sorted(active_ids):
        record = operational_by_id.get(truck_type_id)
        if record is None:
            missing_records.append(truck_type_id)
            continue

        for field in required_scalar_fields:
            value = record.get(field)
            if value is None:
                incomplete_fields.append(f"{truck_type_id}:{field}")
                continue
            if isinstance(value, str) and not value.strip():
                incomplete_fields.append(f"{truck_type_id}:{field}")

        supported_surface_codes = list(record.get("supported_surface_codes") or [])
        if not supported_surface_codes:
            incomplete_fields.append(f"{truck_type_id}:supported_surface_codes")

        empty_consumption = record.get("empty_consumption_per_km")
        loaded_consumption = record.get("loaded_consumption_per_km")
        if (
            empty_consumption is not None
            and loaded_consumption is not None
            and float(loaded_consumption) < float(empty_consumption)
        ):
            incomplete_fields.append(f"{truck_type_id}:consumption_order")

        load_time_minutes = record.get("load_time_minutes")
        unload_time_minutes = record.get("unload_time_minutes")
        if load_time_minutes is not None and float(load_time_minutes) <= 0:
            incomplete_fields.append(f"{truck_type_id}:load_time_minutes")
        if unload_time_minutes is not None and float(unload_time_minutes) <= 0:
            incomplete_fields.append(f"{truck_type_id}:unload_time_minutes")

    assert not missing_records, f"Missing operational records for active trucks: {missing_records}"
    assert not incomplete_fields, f"Incomplete operational fields for active trucks: {incomplete_fields}"
