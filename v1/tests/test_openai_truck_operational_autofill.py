from __future__ import annotations

import json

from app.services import openai_truck_operational_autofill as autofill_service


def _type_record() -> dict[str, object]:
    return {
        "id": "truck_type_vuc_4x2",
        "label": "VUC 4x2",
        "short_label": "VUC",
        "size_tier": "leve",
        "base_vehicle_kind": "rigido",
        "axle_config": "4x2",
        "preferred_body_type_id": "truck_body_bau",
        "canonical_body_type_ids": ["truck_body_bau"],
        "notes": "Caminhão urbano leve.",
    }


def test_extract_output_text_reads_direct_field() -> None:
    payload = {"output_text": "{\"notes\": \"ok\"}"}

    assert autofill_service._extract_output_text(payload) == "{\"notes\": \"ok\"}"


def test_build_prompt_describes_real_context_limits(monkeypatch) -> None:
    monkeypatch.setattr(autofill_service, "_family_labels_for_type", lambda _type_id: ["Volkswagen"])

    prompt = autofill_service.build_truck_operational_autofill_prompt(_type_record(), current_operational_record={"notes": "base atual"})

    assert "NÃO tem acesso direto ao workspace do VS Code" in prompt
    assert "Considere primeiro o contexto estruturado já fornecido" in prompt
    assert "current_project_context:" in prompt


def test_autofill_truck_operational_record_normalizes_ai_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        autofill_service,
        "load_truck_operational_autofill_config",
        lambda: {
            "enabled": True,
            "provider_label": "OpenAI Responses + Web Search",
            "provider": "openai_responses_web_search",
            "api_base_url": "https://example.test/v1/responses",
            "primary_model": "gpt-5.4",
            "fallback_model": "gpt-4.1",
            "request_timeout_seconds": 30,
            "max_output_tokens": 1200,
            "web_search_tool": {"type": "web_search_preview"},
        },
    )
    monkeypatch.setattr(
        autofill_service,
        "runtime_env",
        lambda name, default=None: "test-openai-key" if name == "OPENAI_API_KEY" else default,
    )
    monkeypatch.setattr(autofill_service, "_family_labels_for_type", lambda _type_id: ["Volkswagen"])
    monkeypatch.setattr(
        autofill_service,
        "_post_json",
        lambda *args, **kwargs: {
            "model": "gpt-4.1",
            "output_text": json.dumps(
                {
                    "payload_weight_kg": 3500,
                    "cargo_volume_m3": 18.5,
                    "overall_length_m": 6.2,
                    "overall_width_m": 2.2,
                    "overall_height_m": 2.8,
                    "truck_price_brl": 285000,
                    "implement_cost_brl": 42000,
                    "base_fixed_cost_brl_per_day": 260,
                    "base_variable_cost_brl_per_km": 0.88,
                    "confidence": "medium",
                    "research_basis": "market_estimate",
                    "source_urls": ["https://example.com/truck"],
                    "notes": "Estimativa com base em mercado brasileiro atual.",
                },
                ensure_ascii=False,
            ),
        },
    )

    result = autofill_service.autofill_truck_operational_record(
        _type_record(),
        current_operational_record={"truck_type_id": "truck_type_vuc_4x2", "notes": "registro atual"},
    )

    assert result["provider"] == "OpenAI Responses + Web Search"
    assert result["model"] == "gpt-4.1"
    assert result["payload"]["payload_weight_kg"] == 3500
    assert result["payload"]["truck_price_brl"] == 285000
    assert result["payload"]["implement_cost_brl"] == 42000
    assert result["payload"]["confidence"] == "medium"
    assert result["payload"]["research_basis"] == "market_estimate"
    assert result["payload"]["source_urls"] == ["https://example.com/truck"]


def test_request_openai_autofill_payload_falls_back_to_secondary_model(monkeypatch) -> None:
    attempts: list[str] = []

    class _FakeHttpError(Exception):
        pass

    def _fake_post_json(_url, payload, **_kwargs):
        attempts.append(payload["model"])
        if payload["model"] == "gpt-5.4":
            raise autofill_service.TruckOperationalAutofillError("primary unavailable")
        return {"model": payload["model"], "output_text": "{}"}

    monkeypatch.setattr(
        autofill_service,
        "runtime_env",
        lambda name, default=None: "test-openai-key" if name == "OPENAI_API_KEY" else default,
    )
    monkeypatch.setattr(autofill_service, "_post_json", _fake_post_json)

    result = autofill_service._request_openai_autofill_payload(
        "prompt",
        config={
            "api_base_url": "https://example.test/v1/responses",
            "primary_model": "gpt-5.4",
            "fallback_model": "gpt-4.1",
            "request_timeout_seconds": 30,
            "max_output_tokens": 1200,
            "web_search_tool": {"type": "web_search_preview"},
        },
    )

    assert attempts == ["gpt-5.4", "gpt-4.1"]
    assert result["model"] == "gpt-4.1"