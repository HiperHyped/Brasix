from __future__ import annotations

from pathlib import Path

from app.services import data_loader
from app.services import (
    load_city_product_demand_matrix_payload,
    load_effective_truck_type_catalog_payload,
    load_product_catalog_v2_payload,
    load_product_editor_payload,
    load_product_editor_v1_payload,
    load_product_family_catalog_payload,
    load_product_field_baked_document,
    load_product_field_edit_document,
    load_product_inference_rules_payload,
    load_product_logistics_type_catalog_payload,
    load_map_editor_payload,
    load_city_product_supply_matrix_payload,
    load_region_product_supply_matrix_payload,
    load_reference_data,
    load_truck_body_catalog_payload,
    load_truck_brand_family_catalog_payload,
    load_truck_category_catalog_payload,
    load_truck_gallery_payload,
    load_truck_image_asset_registry_payload,
    load_truck_image_generation_config_payload,
    load_truck_image_prompt_overrides_payload,
    load_truck_image_review_queue_payload,
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
    body_payload = load_truck_body_catalog_payload()
    sprite_payload = load_truck_sprite_2d_catalog_payload()
    brand_payload = load_truck_brand_family_catalog_payload()
    silhouette_payload = load_truck_silhouette_catalog_payload()
    visual_definition_payload = load_truck_image_visual_definitions_payload()
    generation_payload = load_truck_image_generation_config_payload()
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

    assert body_payload["id"] == "truck_body_catalog_v1"
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


def test_product_editor_payloads_load() -> None:
    editor_payload = load_product_editor_payload()
    editor_v1_payload = load_product_editor_v1_payload()
    family_payload = load_product_family_catalog_payload()
    logistics_payload = load_product_logistics_type_catalog_payload()
    product_catalog_payload = load_product_catalog_v2_payload()
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

    assert family_payload["id"] == "product_family_catalog_v1"
    assert [item["id"] for item in family_payload["families"]] == ["agro", "pecuaria", "florestal", "mineral", "energia"]

    assert logistics_payload["id"] == "product_logistics_type_catalog_v1"
    assert any(item["id"] == "granel_seco" for item in logistics_payload["types"])
    assert any(item["id"] == "granel_liquido" for item in logistics_payload["types"])

    assert product_catalog_payload["id"] == "product_catalog_v2"
    assert len(product_catalog_payload["products"]) == 30
    assert product_catalog_payload["products"][0]["id"] == "soja"
    assert any(item["id"] == "petroleo" and item["hazardous"] is True for item in product_catalog_payload["products"])
    assert any(item["id"] == "pesca" and item["temperature_control_required"] is True for item in product_catalog_payload["products"])

    assert supply_payload["id"] == "city_product_supply_matrix_v1"
    assert supply_payload["seed_source"]["kind"] == "legacy_city_product_matrix"
    assert len(supply_payload["items"]) >= 2800
    assert any(item["product_id"] == "soja" for item in supply_payload["items"])

    assert demand_payload["id"] == "city_product_demand_matrix_v1"
    assert demand_payload["seed_source"]["kind"] == "legacy_city_product_demand_matrix"
    assert len(demand_payload["items"]) >= 2000
    assert any(item["product_id"] == "petroleo" for item in demand_payload["items"])

    assert region_supply_payload["id"] == "region_product_supply_matrix_v1"
    assert region_supply_payload["items"] == []

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

    payload = data_loader.load_effective_truck_type_catalog_payload()
    types_by_id = {item["id"]: item for item in payload["types"]}

    assert types_by_id["truck_type_vuc_4x2"]["label"] == "VUC revisado"
    assert types_by_id["truck_type_vuc_4x2"]["canonical_body_type_ids"] == ["truck_body_carga_seca"]
    assert types_by_id["truck_type_vuc_4x2"]["notes"] == "catalogo editado"
    assert types_by_id["truck_type_vuc_4x2"]["is_custom"] is False

    assert types_by_id["truck_type_custom_van_1"]["label"] == "Van de carga"
    assert types_by_id["truck_type_custom_van_1"]["canonical_body_type_ids"] == ["truck_body_bau"]
    assert types_by_id["truck_type_custom_van_1"]["is_custom"] is True
