from __future__ import annotations

from pathlib import Path

from app.services import load_map_editor_payload, load_reference_data
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
