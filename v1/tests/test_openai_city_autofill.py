from __future__ import annotations

import gzip

from app.services import openai_city_autofill as autofill_service
from app.ui.editor_models import CustomCityAutofillRecord, CustomCityRecord


def _city() -> CustomCityRecord:
    return CustomCityRecord(
        id="custom-city-1",
        name="Nova cidade 1",
        label="Nova cidade 1, ZZ",
        state_code="ZZ",
        state_name="Estado manual",
        source_region_name="Cidade criada no editor",
        population_thousands=100,
        latitude=-21.9297,
        longitude=-42.6086,
        is_user_created=True,
        autofill=CustomCityAutofillRecord(status="pending", provider="Autofill"),
    )


def test_normalized_key_removes_accents() -> None:
    assert autofill_service._normalized_key("São José d'El-Rei") == "sao jose del-rei"


def test_population_from_sidra_payload_extracts_population() -> None:
    payload = [
        {"NC": "Nível Territorial", "V": "Valor"},
        {"D1N": "Município", "D2N": "População residente", "V": "1494587"},
        {"D1N": "Município", "D2N": "Densidade demográfica", "V": "1776.74"},
    ]

    assert autofill_service._population_from_sidra_payload(payload) == 1494587


def test_decode_json_payload_supports_gzip() -> None:
    body = gzip.compress(b'{"ok": true, "name": "Nova Vicosa"}')

    payload = autofill_service._decode_json_payload(body, "gzip")

    assert payload == {"ok": True, "name": "Nova Vicosa"}


def test_lookup_ibge_municipality_prefers_exact_name(monkeypatch) -> None:
    monkeypatch.setattr(
        autofill_service,
        "_http_json",
        lambda *args, **kwargs: [
            {"id": 3301209, "nome": "Carmo"},
            {"id": 3300300, "nome": "Barra do Piraí"},
        ],
    )

    result = autofill_service.lookup_ibge_municipality(
        {"municipality_lookup": {"path_template": "https://example/{state_code}"}},
        "Carmo",
        "RJ",
    )

    assert result.municipality_id == "3301209"
    assert result.name == "Carmo"


def test_lookup_ibge_municipality_without_state_uses_national_dataset(monkeypatch) -> None:
    monkeypatch.setattr(
        autofill_service,
        "_http_json",
        lambda *args, **kwargs: [
            {
                "id": 3202306,
                "nome": "Guaçuí",
                "regiao-imediata": {
                    "nome": "Alegre",
                    "regiao-intermediaria": {
                        "nome": "Cachoeiro de Itapemirim",
                        "UF": {"sigla": "ES", "nome": "Espírito Santo"},
                    },
                },
            }
        ],
    )

    result = autofill_service.lookup_ibge_municipality(
        {"municipality_lookup": {"all_path_template": "https://example/municipios"}},
        "Guaçuí",
        "",
        "Região Geográfica Intermediária de Cachoeiro de Itapemirim",
    )

    assert result.municipality_id == "3202306"
    assert result.name == "Guaçuí"
    assert result.state_code == "ES"
    assert result.state_name == "Espírito Santo"


def test_autofill_custom_city_uses_reverse_geocoder_and_ibge(monkeypatch) -> None:
    city = _city()

    monkeypatch.setattr(
        autofill_service,
        "load_city_autofill_config",
        lambda: {
            "enabled": True,
            "provider_label": "Nominatim + IBGE",
        },
    )
    monkeypatch.setattr(
        autofill_service,
        "reverse_geocode_city_candidate",
        lambda _config, _city: autofill_service.ReverseGeocoderCandidate(
            name="Carmo",
            state_name="Rio de Janeiro",
            state_code="RJ",
            region_name="Região Geográfica Intermediária de Petrópolis",
            display_name="Carmo, Rio de Janeiro, Brasil",
            provider="Nominatim",
        ),
    )
    monkeypatch.setattr(
        autofill_service,
        "lookup_ibge_municipality",
        lambda _config, _city_name, _state_code: autofill_service.MunicipalityLookupRecord(
            municipality_id="3301209",
            name="Carmo",
            state_code="RJ",
        ),
    )
    monkeypatch.setattr(
        autofill_service,
        "lookup_ibge_population",
        lambda _config, _municipality_id: 19243,
    )

    result = autofill_service.autofill_custom_city(city)

    assert result.name == "Carmo"
    assert result.label == "Carmo, RJ"
    assert result.state_name == "Rio de Janeiro"
    assert result.source_region_name == "Região Geográfica Intermediária de Petrópolis"
    assert result.population_thousands == 19.243
    assert result.autofill is not None
    assert result.autofill.provider == "Nominatim + IBGE"
    assert result.autofill.confidence == "high"


def test_autofill_custom_city_recovers_missing_state_from_ibge(monkeypatch) -> None:
    city = _city()

    monkeypatch.setattr(
        autofill_service,
        "load_city_autofill_config",
        lambda: {
            "enabled": True,
            "provider_label": "Nominatim + IBGE",
        },
    )
    monkeypatch.setattr(
        autofill_service,
        "reverse_geocode_city_candidate",
        lambda _config, _city: autofill_service.ReverseGeocoderCandidate(
            name="Guaçuí",
            state_name="",
            state_code="",
            region_name="Região Geográfica Intermediária de Cachoeiro de Itapemirim",
            display_name="Guaçuí, Região Geográfica Imediata de Alegre, Região Geográfica Intermediária de Cachoeiro de Itapemirim, Brasil",
            provider="Nominatim",
        ),
    )
    monkeypatch.setattr(
        autofill_service,
        "lookup_ibge_municipality",
        lambda _config, _city_name, _state_code, _region_name: autofill_service.MunicipalityLookupRecord(
            municipality_id="3202306",
            name="Guaçuí",
            state_code="ES",
            state_name="Espírito Santo",
            region_name="Alegre",
            region_names=("Alegre", "Cachoeiro de Itapemirim"),
        ),
    )
    monkeypatch.setattr(
        autofill_service,
        "lookup_ibge_population",
        lambda _config, _municipality_id: 30119,
    )

    result = autofill_service.autofill_custom_city(city)

    assert result.name == "Guaçuí"
    assert result.label == "Guaçuí, ES"
    assert result.state_code == "ES"
    assert result.state_name == "Espírito Santo"
    assert result.population_thousands == 30.119
