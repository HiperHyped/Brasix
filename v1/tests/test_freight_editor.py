from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

from app.services import freight_editor as freight_service


class _StubDumpable:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def model_dump(self, mode: str = "json") -> dict[str, object]:
        return deepcopy(self.payload)


def _active_map_bundle() -> SimpleNamespace:
    return SimpleNamespace(
        id="map_test",
        name="Mapa teste",
        slug="mapa-teste",
        cities=[
            _StubDumpable(
                {
                    "id": "city-a",
                    "name": "Alpha",
                    "label": "Alpha, GO",
                    "state_code": "GO",
                    "state_name": "Goias",
                    "source_region_name": "Centro",
                    "population_thousands": 150.0,
                    "latitude": -16.0,
                    "longitude": -49.0,
                    "is_user_created": False,
                }
            ),
            _StubDumpable(
                {
                    "id": "city-b",
                    "name": "Beta",
                    "label": "Beta, MT",
                    "state_code": "MT",
                    "state_name": "Mato Grosso",
                    "source_region_name": "Centro-Oeste",
                    "population_thousands": 90.0,
                    "latitude": -15.0,
                    "longitude": -56.0,
                    "is_user_created": False,
                }
            ),
        ],
    )


def _field_document(*rows: tuple[str, float]) -> dict[str, object]:
    return {
        "city_values": [
            {
                "city_id": city_id,
                "final_value": value,
            }
            for city_id, value in rows
        ]
    }


def test_build_freight_editor_bootstrap_keeps_visible_partial_products_and_uses_legacy_fields(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(freight_service, "FREIGHT_EDITOR_DIR", tmp_path)
    monkeypatch.setattr(freight_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(
        freight_service,
        "load_product_catalog_v2_master_payload",
        lambda: {
            "products": [
                {
                    "id": "aluminio",
                    "name": "Aluminio",
                    "emoji": "A",
                    "family_id": "mineral",
                    "legacy_source_product_id": "bauxita",
                    "visible": True,
                    "order": 1,
                },
                {
                    "id": "embalagem",
                    "name": "Embalagem",
                    "emoji": "E",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 2,
                },
                {
                    "id": "milho",
                    "name": "Milho",
                    "emoji": "M",
                    "family_id": "agro",
                    "visible": True,
                    "order": 3,
                },
                {
                    "id": "oculto",
                    "name": "Oculto",
                    "emoji": "O",
                    "family_id": "agro",
                    "visible": False,
                    "order": 4,
                },
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_family_catalog_payload",
        lambda: {
            "families": [
                {"id": "agro", "color": "#5b8f4d"},
                {"id": "mineral", "color": "#b46a2b"},
                {"id": "derivado", "color": "#486b88"},
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_field_baked_document",
        lambda product_id, layer, map_id=None: (
            _field_document(("city-a", 120))
            if product_id == "bauxita" and layer == "supply"
            else _field_document(("city-b", 80))
            if product_id == "bauxita" and layer == "demand"
            else _field_document(("city-a", 60))
            if product_id == "embalagem" and layer == "supply"
            else _field_document(("city-b", 100))
            if product_id == "milho" and layer == "supply"
            else _field_document(("city-a", 110))
            if product_id == "milho" and layer == "demand"
            else _field_document()
        ),
    )
    monkeypatch.setattr(
        freight_service,
        "load_map_editor_payload",
        lambda: {
            "themes": {"themes": []},
            "leaflet_settings": {},
            "population_bands": {"bands": []},
            "pin_library": {"pins": []},
        },
    )
    monkeypatch.setattr(freight_service, "load_map_viewport_payload", lambda: {"defaults": {}})
    monkeypatch.setattr(
        freight_service,
        "load_ui_payload",
        lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}},
    )
    monkeypatch.setattr(freight_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    payload = freight_service.build_freight_editor_bootstrap_payload()
    products_by_id = {item["id"]: item for item in payload["products"]}

    assert payload["summary"]["product_count"] == 3
    assert set(products_by_id) == {"aluminio", "embalagem", "milho"}
    assert products_by_id["aluminio"]["summary"]["supply_nonzero"] == 1
    assert products_by_id["aluminio"]["summary"]["demand_nonzero"] == 1
    assert products_by_id["aluminio"]["generated"]["flows"]
    assert products_by_id["embalagem"]["summary"]["supply_nonzero"] == 1
    assert products_by_id["embalagem"]["summary"]["demand_nonzero"] == 0
    assert products_by_id["embalagem"]["generated"]["flows"] == []
    assert products_by_id["milho"]["generated"]["flows"]


def test_build_freight_editor_bootstrap_infers_missing_layers_for_generation(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(freight_service, "FREIGHT_EDITOR_DIR", tmp_path)
    monkeypatch.setattr(freight_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(
        freight_service,
        "load_product_catalog_v2_master_payload",
        lambda: {
            "products": [
                {
                    "id": "fertilizante",
                    "name": "Fertilizante",
                    "emoji": "F",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 1,
                    "inputs": [],
                    "outputs": ["cana-de-acucar"],
                },
                {
                    "id": "acucar",
                    "name": "Acucar",
                    "emoji": "A",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 2,
                    "inputs": ["cana-de-acucar"],
                    "outputs": [],
                },
                {
                    "id": "etanol",
                    "name": "Etanol",
                    "emoji": "E",
                    "family_id": "energia",
                    "visible": True,
                    "order": 3,
                    "inputs": ["cana-de-acucar"],
                    "outputs": [],
                },
                {
                    "id": "cana-de-acucar",
                    "name": "Cana-de-acucar",
                    "emoji": "C",
                    "family_id": "agro",
                    "visible": True,
                    "order": 4,
                    "inputs": ["fertilizante"],
                    "outputs": ["acucar", "etanol"],
                },
                {
                    "id": "bovinos",
                    "name": "Bovinos",
                    "emoji": "B",
                    "family_id": "pecuaria",
                    "visible": True,
                    "order": 5,
                    "inputs": [],
                    "outputs": ["carne"],
                },
                {
                    "id": "suinos",
                    "name": "Suinos",
                    "emoji": "S",
                    "family_id": "pecuaria",
                    "visible": True,
                    "order": 6,
                    "inputs": [],
                    "outputs": ["carne"],
                },
                {
                    "id": "carne",
                    "name": "Carne",
                    "emoji": "R",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 7,
                    "inputs": ["bovinos", "suinos"],
                    "outputs": [],
                },
                {
                    "id": "ferro",
                    "name": "Ferro",
                    "emoji": "Fe",
                    "family_id": "mineral",
                    "visible": True,
                    "order": 8,
                    "inputs": [],
                    "outputs": [],
                },
                {
                    "id": "eletronicos",
                    "name": "Eletronicos",
                    "emoji": "El",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 9,
                    "inputs": ["cobre"],
                    "outputs": [],
                },
                {
                    "id": "cobre",
                    "name": "Cobre",
                    "emoji": "Cu",
                    "family_id": "mineral",
                    "visible": True,
                    "order": 10,
                    "inputs": [],
                    "outputs": ["eletronicos"],
                },
                {
                    "id": "embalagem",
                    "name": "Embalagem",
                    "emoji": "Pk",
                    "family_id": "derivado",
                    "visible": True,
                    "order": 11,
                    "inputs": ["celulose", "plastico"],
                    "outputs": [],
                },
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_family_catalog_payload",
        lambda: {
            "families": [
                {"id": "agro", "color": "#5b8f4d"},
                {"id": "pecuaria", "color": "#8a5b34"},
                {"id": "mineral", "color": "#b46a2b"},
                {"id": "derivado", "color": "#486b88"},
                {"id": "energia", "color": "#c8501e"},
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_field_baked_document",
        lambda product_id, layer, map_id=None: (
            _field_document(("city-a", 160), ("city-b", 90))
            if product_id == "fertilizante" and layer == "demand"
            else _field_document(("city-a", 120), ("city-b", 60))
            if product_id == "acucar" and layer == "supply"
            else _field_document(("city-b", 110), ("city-a", 40))
            if product_id == "etanol" and layer == "supply"
            else _field_document(("city-a", 70))
            if product_id == "bovinos" and layer == "demand"
            else _field_document(("city-b", 65))
            if product_id == "suinos" and layer == "demand"
            else _field_document(("city-b", 95))
            if product_id == "ferro" and layer == "supply"
            else _field_document(("city-a", 80), ("city-b", 55))
            if product_id == "cobre" and layer == "demand"
            else _field_document(("city-a", 130))
            if product_id == "embalagem" and layer == "supply"
            else _field_document()
        ),
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_inference_rules_payload",
        lambda: {
            "demand_estimation": {
                "minimum_reference_population_thousands": 1,
                "population_exponent": 1.0,
            }
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_map_editor_payload",
        lambda: {
            "themes": {"themes": []},
            "leaflet_settings": {},
            "population_bands": {"bands": []},
            "pin_library": {"pins": []},
        },
    )
    monkeypatch.setattr(freight_service, "load_map_viewport_payload", lambda: {"defaults": {}})
    monkeypatch.setattr(
        freight_service,
        "load_ui_payload",
        lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}},
    )
    monkeypatch.setattr(freight_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    payload = freight_service.build_freight_editor_bootstrap_payload()
    products_by_id = {item["id"]: item for item in payload["products"]}

    assert products_by_id["cana-de-acucar"]["summary"]["supply_nonzero"] > 0
    assert products_by_id["cana-de-acucar"]["summary"]["demand_nonzero"] > 0
    assert products_by_id["cana-de-acucar"]["generated"]["flows"]

    assert products_by_id["carne"]["summary"]["supply_nonzero"] > 0
    assert products_by_id["carne"]["summary"]["demand_nonzero"] > 0
    assert products_by_id["carne"]["generated"]["flows"]

    assert products_by_id["cobre"]["summary"]["supply_nonzero"] > 0
    assert products_by_id["cobre"]["summary"]["demand_nonzero"] > 0
    assert products_by_id["cobre"]["generated"]["flows"]

    assert products_by_id["embalagem"]["summary"]["supply_nonzero"] > 0
    assert products_by_id["embalagem"]["summary"]["demand_nonzero"] > 0
    assert products_by_id["embalagem"]["generated"]["flows"]


def test_build_freight_editor_bootstrap_uses_saved_document_state(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(freight_service, "FREIGHT_EDITOR_DIR", tmp_path)
    monkeypatch.setattr(freight_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(
        freight_service,
        "load_product_catalog_v2_master_payload",
        lambda: {
            "products": [
                {
                    "id": "milho",
                    "name": "Milho",
                    "emoji": "M",
                    "family_id": "agro",
                    "visible": True,
                    "order": 1,
                }
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_family_catalog_payload",
        lambda: {
            "families": [
                {"id": "agro", "color": "#5b8f4d"},
            ]
        },
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_field_baked_document",
        lambda product_id, layer, map_id=None: (
            _field_document(("city-a", 120))
            if product_id == "milho" and layer == "supply"
            else _field_document(("city-b", 80))
            if product_id == "milho" and layer == "demand"
            else _field_document()
        ),
    )
    monkeypatch.setattr(
        freight_service,
        "load_product_inference_rules_payload",
        lambda: {"demand_estimation": {"minimum_reference_population_thousands": 1, "population_exponent": 1.0}},
    )
    monkeypatch.setattr(
        freight_service,
        "load_map_editor_payload",
        lambda: {
            "themes": {"themes": []},
            "leaflet_settings": {},
            "population_bands": {"bands": []},
            "pin_library": {"pins": []},
        },
    )
    monkeypatch.setattr(freight_service, "load_map_viewport_payload", lambda: {"defaults": {}})
    monkeypatch.setattr(
        freight_service,
        "load_ui_payload",
        lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}},
    )
    monkeypatch.setattr(freight_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    freight_service.save_freight_editor_document(
        "map_test",
        {
            "selected_product_id": "milho",
            "product_states": {
                "milho": {
                    "algorithm": "ajustado",
                    "coverage": 95,
                    "flowCount": 20,
                    "scoreOriginWeight": 50,
                    "scoreDestinationWeight": 30,
                    "scoreTransferWeight": 20,
                    "distanceBonus": 40,
                    "reusePenalty": 0.6,
                    "originLimitShare": 50,
                    "destinationLimitShare": 50,
                    "targetOriginsShare": 50,
                    "targetDestinationsShare": 50,
                    "newOriginBonus": 118,
                    "newDestinationBonus": 118,
                    "quantityExponent": 1.6,
                    "quantityMode": "concentrada",
                    "generated": {
                        "algorithm": "ajustado",
                        "coverage_percent": 95,
                        "flow_count": 1,
                        "quantity_mode": "concentrada",
                        "volume_total_t": 77,
                        "origins": [{"city_id": "city-a", "value": 120}],
                        "destinations": [{"city_id": "city-b", "value": 80}],
                        "coverage_data": {
                            "origins_count": 1,
                            "destinations_count": 1,
                            "pairs": 1,
                        },
                        "flows": [
                            {
                                "id": "milho::city-a::city-b",
                                "rank": 1,
                                "origin_id": "city-a",
                                "origin_label": "Alpha, GO",
                                "origin_state_code": "GO",
                                "origin_value_t": 120,
                                "origin_latitude": -16.0,
                                "origin_longitude": -49.0,
                                "destination_id": "city-b",
                                "destination_label": "Beta, MT",
                                "destination_state_code": "MT",
                                "destination_value_t": 80,
                                "destination_latitude": -15.0,
                                "destination_longitude": -56.0,
                                "distance_km": 220,
                                "score": 0.91,
                                "quantity_t": 77,
                                "share": 1.0,
                            }
                        ],
                    },
                }
            },
        },
    )

    payload = freight_service.build_freight_editor_bootstrap_payload()
    milho = next(product for product in payload["products"] if product["id"] == "milho")

    assert payload["summary"]["selected_product_id"] == "milho"
    assert milho["editor_state"]["coverage"] == 95
    assert milho["editor_state"]["quantityMode"] == "concentrada"
    assert milho["generated"]["flows"][0]["quantity_t"] == 77
    assert milho["summary"]["candidate_pairs"] == 1