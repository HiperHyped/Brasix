from __future__ import annotations

from app.services import diesel_cost_editor as diesel_service


def _cities() -> list[dict[str, object]]:
    return [
        {
            "id": "go-goiania",
            "name": "Goiania",
            "label": "Goiania, GO",
            "state_code": "GO",
            "state_name": "Goias",
            "source_region_name": "Centro Goiano",
            "population_thousands": 1494.0,
            "latitude": -16.6864,
            "longitude": -49.2643,
            "is_user_created": False,
        },
        {
            "id": "go-anapolis",
            "name": "Anapolis",
            "label": "Anapolis, GO",
            "state_code": "GO",
            "state_name": "Goias",
            "source_region_name": "Centro Goiano",
            "population_thousands": 398.0,
            "latitude": -16.3286,
            "longitude": -48.9534,
            "is_user_created": False,
        },
        {
            "id": "mt-cuiaba",
            "name": "Cuiaba",
            "label": "Cuiaba, MT",
            "state_code": "MT",
            "state_name": "Mato Grosso",
            "source_region_name": "Centro-Sul Mato-Grossense",
            "population_thousands": 650.0,
            "latitude": -15.6014,
            "longitude": -56.0979,
            "is_user_created": False,
        },
    ]


def test_build_diesel_cost_editor_document_interpolates_and_applies_override() -> None:
    document = diesel_service.build_diesel_cost_editor_document(
        "map_test",
        _cities(),
        raw_document={
            "observations": [
                {"city_id": "go-goiania", "price_brl_per_liter": 5.92, "source_kind": "manual"},
                {"city_id": "mt-cuiaba", "price_brl_per_liter": 6.18, "source_kind": "manual"},
            ],
            "overrides": [
                {"city_id": "go-anapolis", "final_price_brl_per_liter": 6.04},
            ],
        },
    )

    rows = {item["city_id"]: item for item in document["city_values"]}

    assert rows["go-goiania"]["source"] == "observed"
    assert rows["go-goiania"]["final_value"] == 5.92
    assert rows["go-anapolis"]["source"] == "override"
    assert 5.92 <= rows["go-anapolis"]["estimated_value"] <= 6.18
    assert rows["go-anapolis"]["final_value"] == 6.04
    assert document["summary"]["observed_count"] == 2
    assert document["summary"]["override_count"] == 1


def test_materialize_seed_observations_prefers_base_city() -> None:
    cities = [
        {
            "id": "sp-sao-paulo",
            "name": "Sao Paulo",
            "label": "Sao Paulo, SP",
            "state_code": "SP",
            "population_thousands": 11451.0,
            "is_user_created": False,
        },
        {
            "id": "custom-city-1",
            "name": "Sao Paulo",
            "label": "Sao Paulo, SP",
            "state_code": "SP",
            "population_thousands": 10.0,
            "is_user_created": True,
        },
    ]

    original = diesel_service._seed_observation_entries
    diesel_service._seed_observation_entries = lambda: [
        {
            "state_code": "SP",
            "city_name": "Sao Paulo",
            "city_key": "sao paulo",
            "price_brl_per_liter": 6.02,
            "source_kind": "seed",
            "source_label": "Seed Diesel v1",
        }
    ]
    try:
        observations = diesel_service._materialize_seed_observations(cities)
    finally:
        diesel_service._seed_observation_entries = original

    assert observations[0]["city_id"] == "sp-sao-paulo"
    assert observations[0]["source_kind"] == "seed"
    assert observations[0]["price_brl_per_liter"] == 6.02