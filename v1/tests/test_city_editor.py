from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.services import city_editor as city_service


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
                    "source_region_name": "Sul",
                    "population_thousands": 90.0,
                    "latitude": -15.0,
                    "longitude": -56.0,
                    "is_user_created": False,
                }
            ),
        ],
        route_network=_StubDumpable({"nodes": [], "edges": []}),
    )


def _active_map_bundle_three_cities() -> SimpleNamespace:
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
                    "source_region_name": "Sul",
                    "population_thousands": 90.0,
                    "latitude": -15.0,
                    "longitude": -56.0,
                    "is_user_created": False,
                }
            ),
            _StubDumpable(
                {
                    "id": "city-c",
                    "name": "Gamma",
                    "label": "Gamma, BA",
                    "state_code": "BA",
                    "state_name": "Bahia",
                    "source_region_name": "Nordeste",
                    "population_thousands": 72.0,
                    "latitude": -12.0,
                    "longitude": -41.0,
                    "is_user_created": False,
                }
            ),
        ],
        route_network=_StubDumpable({"nodes": [], "edges": []}),
    )


def test_build_city_editor_bootstrap_payload_applies_freight_overrides(monkeypatch) -> None:
    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(city_service, "load_product_catalog_v2_master_payload", lambda: {
        "products": [
            {"id": "soja", "name": "Soja", "emoji": "S", "unit": "mil t", "color": "#4b7c2f", "visible": True},
            {"id": "milho", "name": "Milho", "emoji": "M", "unit": "mil t", "color": "#c9a227", "visible": True},
        ]
    })
    monkeypatch.setattr(city_service, "load_product_family_catalog_payload", lambda: {"families": []})
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: {
        "city_values": (
            [{"city_id": "city-a", "final_value": 120, "base_value": 100, "manual_delta": 20, "source": "manual"}]
            if product_id == "soja" and layer == "supply"
            else [{"city_id": "city-b", "final_value": 45, "base_value": 45, "manual_delta": 0, "source": "seed"}]
            if product_id == "milho" and layer == "demand"
            else []
        )
    })
    monkeypatch.setattr(city_service, "build_freight_editor_bootstrap_payload", lambda: {
        "products": [
            {
                "id": "soja",
                "name": "Soja",
                "emoji": "S",
                "color": "#4b7c2f",
                "generated": {
                    "flows": [
                        {
                            "id": "soja::city-a::city-b",
                            "origin_id": "city-a",
                            "origin_label": "Alpha, GO",
                            "destination_id": "city-b",
                            "destination_label": "Beta, MT",
                            "distance_km": 220,
                            "quantity_t": 80,
                        }
                    ]
                },
            }
        ]
    })
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "map_id": map_id,
        "overrides": [
            {
                "flow_id": "soja::city-a::city-b",
                "product_id": "soja",
                "origin_id": "city-a",
                "destination_id": "city-b",
                "quantity_t": 95,
                "removed": False,
            }
        ],
    })
    monkeypatch.setattr(city_service, "load_map_editor_payload", lambda: {
        "themes": {"themes": []},
        "leaflet_settings": {},
        "population_bands": {"bands": []},
        "pin_library": {"pins": []},
        "graph_node_styles": {"styles": []},
        "route_surface_types": {"types": []},
        "display_settings": {},
    })
    monkeypatch.setattr(city_service, "load_map_viewport_payload", lambda: {"defaults": {"selected_city_id": "city-b"}})
    monkeypatch.setattr(city_service, "load_ui_payload", lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}})
    monkeypatch.setattr(city_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    payload = city_service.build_city_editor_bootstrap_payload()

    cities_by_id = {item["id"]: item for item in payload["cities"]}

    assert payload["summary"]["selected_city_id"] == "city-b"
    assert payload["freight_flows"][0]["quantity_t"] == 95
    assert cities_by_id["city-a"]["supply_items"][0]["product_id"] == "soja"
    assert cities_by_id["city-a"]["outbound_flow_ids"] == ["soja::city-a::city-b"]
    assert cities_by_id["city-b"]["inbound_flow_ids"] == ["soja::city-a::city-b"]
    assert cities_by_id["city-a"]["dominant_product_id"] == "soja"


def test_update_city_editor_product_value_updates_baked_and_edit_documents(monkeypatch) -> None:
    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": None,
        "topology_frozen": True,
        "frozen_generated_flows": [],
        "overrides": [],
    })

    field_document = {
        "id": "field",
        "map_id": "map_test",
        "product_id": "soja",
        "layer": "supply",
        "strokes": [],
        "baked_city_values": [],
    }
    baked_document = {
        "id": "baked",
        "map_id": "map_test",
        "product_id": "soja",
        "layer": "supply",
        "city_values": [
            {
                "city_id": "city-a",
                "city_label": "Alpha, GO",
                "state_code": "GO",
                "base_value": 100,
                "manual_delta": 0,
                "final_value": 100,
                "source": "seed",
            }
        ],
    }
    saved: dict[str, dict[str, object]] = {}

    monkeypatch.setattr(city_service, "load_product_field_edit_document", lambda product_id, layer, map_id=None: deepcopy(field_document))
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: deepcopy(baked_document))
    monkeypatch.setattr(
        city_service,
        "save_product_field_edit_document",
        lambda product_id, layer, payload, map_id=None: saved.setdefault("field", deepcopy(payload)),
    )
    monkeypatch.setattr(
        city_service,
        "save_product_field_baked_document",
        lambda product_id, layer, payload, map_id=None: saved.setdefault("baked", deepcopy(payload)),
    )

    result = city_service.update_city_editor_product_value("map_test", "city-a", "soja", "supply", 135)

    item = result["item"]
    assert item["final_value"] == 135
    assert item["manual_delta"] == 35
    assert item["source"] == "manual"
    assert saved["baked"]["city_values"][0]["final_value"] == 135
    assert saved["field"]["baked_city_values"][0]["manual_delta"] == 35


def test_build_city_editor_bootstrap_payload_includes_custom_freight(monkeypatch) -> None:
    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(city_service, "load_product_catalog_v2_master_payload", lambda: {
        "products": [
            {"id": "soja", "name": "Soja", "emoji": "S", "unit": "mil t", "color": "#4b7c2f", "visible": True},
        ]
    })
    monkeypatch.setattr(city_service, "load_product_family_catalog_payload", lambda: {"families": []})
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: {"city_values": []})
    monkeypatch.setattr(city_service, "build_freight_editor_bootstrap_payload", lambda: {
        "products": [
            {
                "id": "soja",
                "name": "Soja",
                "emoji": "S",
                "color": "#4b7c2f",
                "generated": {"flows": []},
            }
        ]
    })
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "map_id": map_id,
        "overrides": [
            {
                "flow_id": "custom::soja::city-a::city-b",
                "product_id": "soja",
                "origin_id": "city-a",
                "origin_label": "Alpha, GO",
                "destination_id": "city-b",
                "destination_label": "Beta, MT",
                "distance_km": 220,
                "quantity_t": 70,
                "custom": True,
                "removed": False,
            }
        ],
    })
    monkeypatch.setattr(city_service, "load_map_editor_payload", lambda: {
        "themes": {"themes": []},
        "leaflet_settings": {},
        "population_bands": {"bands": []},
        "pin_library": {"pins": []},
        "graph_node_styles": {"styles": []},
        "route_surface_types": {"types": []},
        "display_settings": {},
    })
    monkeypatch.setattr(city_service, "load_map_viewport_payload", lambda: {"defaults": {"selected_city_id": "city-a"}})
    monkeypatch.setattr(city_service, "load_ui_payload", lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}})
    monkeypatch.setattr(city_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    payload = city_service.build_city_editor_bootstrap_payload()

    assert payload["freight_flows"][0]["id"] == "custom::soja::city-a::city-b"
    assert payload["freight_flows"][0]["custom"] is True
    assert payload["cities"][0]["outbound_flow_ids"] == ["custom::soja::city-a::city-b"]
    assert payload["cities"][1]["inbound_flow_ids"] == ["custom::soja::city-a::city-b"]


def test_update_and_remove_city_editor_freight_value_persist_override(monkeypatch) -> None:
    saved_payloads: list[dict[str, object]] = []

    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle)
    monkeypatch.setattr(city_service, "load_product_catalog_v2_master_payload", lambda: {
        "products": [
            {"id": "soja", "name": "Soja", "emoji": "S", "unit": "mil t", "color": "#4b7c2f", "visible": True},
        ]
    })
    monkeypatch.setattr(city_service, "load_product_family_catalog_payload", lambda: {"families": []})
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: {
        "city_values": (
            [{"city_id": "city-a", "final_value": 100, "base_value": 100, "manual_delta": 0, "source": "seed"}]
            if product_id == "soja" and layer == "supply"
            else []
        )
    })
    monkeypatch.setattr(city_service, "build_freight_editor_bootstrap_payload", lambda: {
        "products": [
            {
                "id": "soja",
                "name": "Soja",
                "emoji": "S",
                "color": "#4b7c2f",
                "generated": {"flows": []},
            }
        ]
    })
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": None,
        "topology_frozen": True,
        "frozen_generated_flows": [],
        "overrides": [],
    })
    monkeypatch.setattr(
        city_service,
        "save_city_editor_freight_document",
        lambda map_id, overrides, frozen_generated_flows=None, topology_frozen=None, updated_at=None: saved_payloads.append({"map_id": map_id, "overrides": deepcopy(overrides)}) or {
            "map_id": map_id,
            "overrides": deepcopy(overrides),
        },
    )

    update_result = city_service.update_city_editor_freight_value(
        "map_test",
        "soja::city-a::city-b",
        "soja",
        "city-a",
        "city-b",
        88,
    )
    remove_result = city_service.remove_city_editor_freight_value(
        "map_test",
        "soja::city-a::city-b",
        "soja",
        "city-a",
        "city-b",
    )

    assert update_result["override"]["quantity_t"] == 88
    assert update_result["override"]["origin_label"] == "Alpha, GO"
    assert update_result["override"]["destination_label"] == "Beta, MT"
    assert saved_payloads[0]["overrides"][0]["removed"] is False
    assert remove_result["removed"] is True
    assert saved_payloads[1]["overrides"][0]["removed"] is True


def test_update_city_editor_freight_value_rejects_quantity_above_available_supply(monkeypatch) -> None:
    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle_three_cities)
    monkeypatch.setattr(city_service, "load_product_catalog_v2_master_payload", lambda: {
        "products": [
            {"id": "soja", "name": "Soja", "emoji": "S", "unit": "mil t", "color": "#4b7c2f", "visible": True},
        ]
    })
    monkeypatch.setattr(city_service, "load_product_family_catalog_payload", lambda: {"families": []})
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: {
        "city_values": (
            [{"city_id": "city-a", "final_value": 100, "base_value": 100, "manual_delta": 0, "source": "seed"}]
            if product_id == "soja" and layer == "supply"
            else []
        )
    })
    monkeypatch.setattr(city_service, "build_freight_editor_bootstrap_payload", lambda: {
        "products": [
            {
                "id": "soja",
                "name": "Soja",
                "emoji": "S",
                "color": "#4b7c2f",
                "generated": {
                    "flows": [
                        {
                            "id": "soja::city-a::city-b",
                            "origin_id": "city-a",
                            "origin_label": "Alpha, GO",
                            "destination_id": "city-b",
                            "destination_label": "Beta, MT",
                            "distance_km": 220,
                            "quantity_t": 40,
                        },
                        {
                            "id": "soja::city-a::city-c",
                            "origin_id": "city-a",
                            "origin_label": "Alpha, GO",
                            "destination_id": "city-c",
                            "destination_label": "Gamma, BA",
                            "distance_km": 360,
                            "quantity_t": 30,
                        },
                    ]
                },
            }
        ]
    })
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": None,
        "topology_frozen": True,
        "frozen_generated_flows": [
            {
                "id": "soja::city-a::city-b",
                "product_id": "soja",
                "origin_id": "city-a",
                "origin_label": "Alpha, GO",
                "destination_id": "city-b",
                "destination_label": "Beta, MT",
                "distance_km": 220,
                "base_quantity_t": 40,
            },
            {
                "id": "soja::city-a::city-c",
                "product_id": "soja",
                "origin_id": "city-a",
                "origin_label": "Alpha, GO",
                "destination_id": "city-c",
                "destination_label": "Gamma, BA",
                "distance_km": 360,
                "base_quantity_t": 30,
            },
        ],
        "overrides": [],
    })

    with pytest.raises(ValueError, match="70"):
        city_service.update_city_editor_freight_value(
            "map_test",
            "soja::city-a::city-b",
            "soja",
            "city-a",
            "city-b",
            71,
        )


def test_build_city_editor_bootstrap_payload_uses_latest_freight_mesh_even_when_document_has_frozen_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(city_service, "load_active_map_bundle", _active_map_bundle_three_cities)
    monkeypatch.setattr(city_service, "load_product_catalog_v2_master_payload", lambda: {
        "products": [
            {"id": "trigo", "name": "Trigo", "emoji": "T", "unit": "mil t", "color": "#c9a227", "visible": True},
        ]
    })
    monkeypatch.setattr(city_service, "load_product_family_catalog_payload", lambda: {"families": []})
    monkeypatch.setattr(city_service, "load_product_field_baked_document", lambda product_id, layer, map_id=None: {
        "city_values": (
            [{"city_id": "city-a", "final_value": 500, "base_value": 0, "manual_delta": 500, "source": "manual"}]
            if product_id == "trigo" and layer == "supply"
            else [{"city_id": "city-b", "final_value": 200, "base_value": 200, "manual_delta": 0, "source": "seed"},
                  {"city_id": "city-c", "final_value": 300, "base_value": 300, "manual_delta": 0, "source": "seed"}]
            if product_id == "trigo" and layer == "demand"
            else []
        )
    })
    monkeypatch.setattr(city_service, "build_freight_editor_bootstrap_payload", lambda: {
        "products": [
            {
                "id": "trigo",
                "name": "Trigo",
                "emoji": "T",
                "color": "#c9a227",
                "generated": {
                    "flows": [
                        {
                            "id": "trigo::city-a::city-b",
                            "origin_id": "city-a",
                            "origin_label": "Alpha, GO",
                            "destination_id": "city-b",
                            "destination_label": "Beta, MT",
                            "distance_km": 220,
                            "quantity_t": 200,
                        },
                        {
                            "id": "trigo::city-a::city-c",
                            "origin_id": "city-a",
                            "origin_label": "Alpha, GO",
                            "destination_id": "city-c",
                            "destination_label": "Gamma, BA",
                            "distance_km": 360,
                            "quantity_t": 300,
                        },
                    ]
                },
            }
        ]
    })
    monkeypatch.setattr(city_service, "load_city_editor_freight_document", lambda map_id: {
        "id": f"city_editor_freights::{map_id}",
        "map_id": map_id,
        "updated_at": None,
        "topology_frozen": True,
        "frozen_generated_flows": [
            {
                "id": "trigo::city-a::city-b",
                "product_id": "trigo",
                "origin_id": "city-a",
                "origin_label": "Alpha, GO",
                "destination_id": "city-b",
                "destination_label": "Beta, MT",
                "distance_km": 220,
                "base_quantity_t": 100,
            }
        ],
        "overrides": [],
    })
    monkeypatch.setattr(city_service, "load_map_editor_payload", lambda: {
        "themes": {"themes": []},
        "leaflet_settings": {},
        "population_bands": {"bands": []},
        "pin_library": {"pins": []},
        "graph_node_styles": {"styles": []},
        "route_surface_types": {"types": []},
        "display_settings": {},
    })
    monkeypatch.setattr(city_service, "load_map_viewport_payload", lambda: {"defaults": {"selected_city_id": "city-a"}})
    monkeypatch.setattr(city_service, "load_ui_payload", lambda: {"design_tokens": {"css_variables": {}}, "layout_desktop_main": {"css_variables": {}}})
    monkeypatch.setattr(city_service, "map_repository_payload", lambda: {"active_map_id": "map_test"})

    payload = city_service.build_city_editor_bootstrap_payload()

    quantities_by_flow_id = {flow["id"]: flow["quantity_t"] for flow in payload["freight_flows"]}

    assert set(quantities_by_flow_id) == {"trigo::city-a::city-b", "trigo::city-a::city-c"}
    assert quantities_by_flow_id["trigo::city-a::city-b"] == 200
    assert quantities_by_flow_id["trigo::city-a::city-c"] == 300