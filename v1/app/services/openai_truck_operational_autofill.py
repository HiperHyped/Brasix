from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import AI_TRUCK_OPERATIONAL_AUTOFILL_CONFIG_PATH, runtime_env
from app.services.data_loader import load_json, load_truck_brand_family_catalog_payload


class TruckOperationalAutofillError(RuntimeError):
    """Raised when truck operational autofill cannot complete."""


DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG = {
    "id": "truck_operational_autofill_config_v1",
    "enabled": True,
    "provider": "openai_responses_web_search",
    "provider_label": "OpenAI Responses + Web Search",
    "api_base_url": "https://api.openai.com/v1/responses",
    "primary_model": "gpt-5.4",
    "fallback_model": "gpt-4.1",
    "request_timeout_seconds": 120,
    "max_output_tokens": 1800,
    "web_search_tool": {"type": "web_search_preview"},
}


def load_truck_operational_autofill_config() -> dict[str, Any]:
    payload = dict(DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG)
    if AI_TRUCK_OPERATIONAL_AUTOFILL_CONFIG_PATH.exists():
        payload.update(dict(load_json(AI_TRUCK_OPERATIONAL_AUTOFILL_CONFIG_PATH)))
    payload["api_base_url"] = runtime_env(
        "BRASIX_TRUCK_OPERATIONAL_AUTOFILL_API_BASE_URL",
        str(payload.get("api_base_url") or DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG["api_base_url"]),
    )
    payload["primary_model"] = runtime_env(
        "BRASIX_TRUCK_OPERATIONAL_AUTOFILL_MODEL_PRIMARY",
        runtime_env(
            "BRASIX_TRUCK_OPERATIONAL_AUTOFILL_MODEL",
            str(payload.get("primary_model") or payload.get("model") or DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG["primary_model"]),
        ),
    )
    payload["fallback_model"] = runtime_env(
        "BRASIX_TRUCK_OPERATIONAL_AUTOFILL_MODEL_FALLBACK",
        str(payload.get("fallback_model") or DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG["fallback_model"]),
    )
    return payload


def _headers_for_openai(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _decode_http_error(exc: HTTPError) -> str:
    detail = exc.read().decode("utf-8", errors="ignore").strip()
    if not detail:
        return f"HTTP {exc.code}"
    try:
        payload = json.loads(detail)
    except json.JSONDecodeError:
        return detail
    error_payload = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error_payload, dict):
        return str(error_payload.get("message") or detail)
    return detail


def _post_json(url: str, payload: dict[str, Any], *, headers: dict[str, str], timeout_seconds: float) -> dict[str, Any]:
    request = Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _family_labels_for_type(truck_type_id: str) -> list[str]:
    families = load_truck_brand_family_catalog_payload().get("families", [])
    labels: list[str] = []
    for family in families:
        canonical_type_ids = {str(item).strip() for item in family.get("canonical_type_ids", [])}
        if truck_type_id in canonical_type_ids:
            label = str(family.get("label") or "").strip()
            if label:
                labels.append(label)
    return labels


def _compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "payload_weight_kg": {"type": ["number", "null"]},
            "cargo_volume_m3": {"type": ["number", "null"]},
            "overall_length_m": {"type": ["number", "null"]},
            "overall_width_m": {"type": ["number", "null"]},
            "overall_height_m": {"type": ["number", "null"]},
            "truck_price_brl": {"type": ["number", "null"]},
            "implement_cost_brl": {"type": ["number", "null"]},
            "base_fixed_cost_brl_per_day": {"type": ["number", "null"]},
            "base_variable_cost_brl_per_km": {"type": ["number", "null"]},
            "confidence": {"type": ["string", "null"], "enum": ["low", "medium", "high", None]},
            "research_basis": {
                "type": ["string", "null"],
                "enum": ["manufacturer_sheet", "market_estimate", "derived_estimate", None],
            },
            "source_urls": {
                "type": "array",
                "items": {"type": "string"},
            },
            "notes": {"type": "string"},
        },
        "required": [
            "payload_weight_kg",
            "cargo_volume_m3",
            "overall_length_m",
            "overall_width_m",
            "overall_height_m",
            "truck_price_brl",
            "implement_cost_brl",
            "base_fixed_cost_brl_per_day",
            "base_variable_cost_brl_per_km",
            "confidence",
            "research_basis",
            "source_urls",
            "notes",
        ],
    }


def build_truck_operational_autofill_prompt(
    type_record: dict[str, Any],
    *,
    current_operational_record: dict[str, Any] | None = None,
) -> str:
    truck_type_id = str(type_record.get("id") or "").strip()
    label = str(type_record.get("label") or truck_type_id).strip()
    current_notes_parts = [str(type_record.get("notes") or "").strip()]
    if current_operational_record:
        current_notes_parts.append(f"Dados atuais do workspace: {_compact_json(current_operational_record)}")
    current_notes = " | ".join(part for part in current_notes_parts if part) or "-"
    family_labels = _family_labels_for_type(truck_type_id)

    return f"""Você é um pesquisador de dados operacionais de frota para o projeto Brasix.

Sua tarefa é pesquisar somente os dados de dimensões e custos do caminhão selecionado abaixo e devolver apenas um JSON válido, sem texto extra.

Você NÃO tem acesso direto ao workspace do VS Code. Use apenas o contexto estruturado enviado abaixo e, quando isso não for suficiente, complemente com pesquisa web em fontes públicas confiáveis.

Caminhão selecionado:
truck_type_id: {truck_type_id}
label: {label}
short_label: {str(type_record.get('short_label') or '').strip() or '-'}
size_tier: {str(type_record.get('size_tier') or '').strip() or '-'}
base_vehicle_kind: {str(type_record.get('base_vehicle_kind') or '').strip() or '-'}
axle_config: {str(type_record.get('axle_config') or '').strip() or '-'}
preferred_body_type_id: {str(type_record.get('preferred_body_type_id') or '').strip() or '-'}
canonical_body_type_ids: {_compact_json(list(type_record.get('canonical_body_type_ids') or []))}
family_labels: {_compact_json(family_labels)}
current_project_context: {current_notes}

Regras obrigatórias:
1. Considere primeiro o contexto estruturado já fornecido para este caminhão.
2. Se o contexto fornecido não for suficiente, pesquise na web em fontes públicas confiáveis.
3. Preencha somente estes campos: payload_weight_kg, cargo_volume_m3, overall_length_m, overall_width_m, overall_height_m, truck_price_brl, implement_cost_brl, base_fixed_cost_brl_per_day, base_variable_cost_brl_per_km, confidence, research_basis, source_urls, notes.
4. Considere sempre o tipo de caminhão selecionado e o implemento preferido ao estimar implement_cost_brl.
5. Se encontrar valor exato em fonte confiável, use esse valor.
6. Se houver apenas faixa, média de mercado ou aproximação técnica, escolha um valor representativo do mercado brasileiro atual e explique a decisão em notes.
7. Não invente precisão falsa. Se não houver evidência suficiente para um campo, retorne null nesse campo e explique a lacuna em notes.
8. Em confidence use apenas: low, medium ou high.
9. Em research_basis use apenas: manufacturer_sheet, market_estimate ou derived_estimate.
10. Em source_urls retorne somente URLs realmente usadas.
11. Responda somente com JSON válido neste formato:

{{
  "payload_weight_kg": number ou null,
  "cargo_volume_m3": number ou null,
  "overall_length_m": number ou null,
  "overall_width_m": number ou null,
  "overall_height_m": number ou null,
  "truck_price_brl": number ou null,
  "implement_cost_brl": number ou null,
  "base_fixed_cost_brl_per_day": number ou null,
  "base_variable_cost_brl_per_km": number ou null,
  "confidence": "low|medium|high" ou null,
  "research_basis": "manufacturer_sheet|market_estimate|derived_estimate" ou null,
  "source_urls": ["url1", "url2"],
  "notes": "resumo curto da base usada e das incertezas"
}}"""


def _extract_output_text(response_payload: dict[str, Any]) -> str:
    direct = response_payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    fragments: list[str] = []
    for item in response_payload.get("output", []) if isinstance(response_payload.get("output"), list) else []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                fragments.append(text.strip())
    if fragments:
        return "\n".join(fragments)
    raise TruckOperationalAutofillError("A OpenAI nao retornou texto utilizavel para o autofill operacional.")


def _parse_json_text(raw_text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", raw_text, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    raise TruckOperationalAutofillError("A resposta da IA nao retornou um JSON valido para o autofill operacional.")


def _optional_number(value: Any) -> float | int | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace(".", "").replace(",", ".")
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else parsed


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    elif value in (None, ""):
        raw_items = []
    else:
        raw_items = [value]
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_item in raw_items:
        item = str(raw_item or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


def _normalize_payload(raw_payload: dict[str, Any]) -> dict[str, Any]:
    confidence = str(raw_payload.get("confidence") or "").strip() or None
    if confidence not in {None, "low", "medium", "high"}:
        confidence = None
    research_basis = str(raw_payload.get("research_basis") or "").strip() or None
    if research_basis not in {None, "manufacturer_sheet", "market_estimate", "derived_estimate"}:
        research_basis = None
    return {
        "payload_weight_kg": _optional_number(raw_payload.get("payload_weight_kg")),
        "cargo_volume_m3": _optional_number(raw_payload.get("cargo_volume_m3")),
        "overall_length_m": _optional_number(raw_payload.get("overall_length_m")),
        "overall_width_m": _optional_number(raw_payload.get("overall_width_m")),
        "overall_height_m": _optional_number(raw_payload.get("overall_height_m")),
        "truck_price_brl": _optional_number(raw_payload.get("truck_price_brl")),
        "implement_cost_brl": _optional_number(raw_payload.get("implement_cost_brl")),
        "base_fixed_cost_brl_per_day": _optional_number(raw_payload.get("base_fixed_cost_brl_per_day")),
        "base_variable_cost_brl_per_km": _optional_number(raw_payload.get("base_variable_cost_brl_per_km")),
        "confidence": confidence,
        "research_basis": research_basis,
        "source_urls": _string_list(raw_payload.get("source_urls")),
        "notes": str(raw_payload.get("notes") or "").strip(),
    }


def _request_openai_autofill_payload(prompt: str, *, config: dict[str, Any]) -> dict[str, Any]:
    api_key = runtime_env("OPENAI_API_KEY", "")
    if not api_key:
        raise TruckOperationalAutofillError("OPENAI_API_KEY não configurada no v1/.env para autofill operacional de caminhões.")

    api_url = str(config.get("api_base_url") or DEFAULT_TRUCK_OPERATIONAL_AUTOFILL_CONFIG["api_base_url"])
    timeout_seconds = float(config.get("request_timeout_seconds") or 120)
    model_candidates = [
        str(config.get("primary_model") or "").strip(),
        str(config.get("fallback_model") or "").strip(),
    ]
    models = [model for model in model_candidates if model]
    if not models:
        raise TruckOperationalAutofillError("Nenhum modelo foi configurado para o autofill operacional de caminhões.")

    last_error: str | None = None
    for model in models:
        request_payload = {
            "model": model,
            "input": prompt,
            "tools": [dict(config.get("web_search_tool") or {"type": "web_search_preview"})],
            "max_output_tokens": int(config.get("max_output_tokens") or 1800),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "truck_operational_autofill",
                    "schema": _schema(),
                    "strict": True,
                }
            },
        }
        try:
            return _post_json(
                api_url,
                request_payload,
                headers=_headers_for_openai(api_key),
                timeout_seconds=timeout_seconds,
            )
        except TruckOperationalAutofillError as exc:
            last_error = str(exc)
            continue
        except HTTPError as exc:
            last_error = _decode_http_error(exc)
            continue
        except URLError as exc:
            last_error = f"Falha de rede ao consultar a OpenAI: {exc.reason}."
            continue

    raise TruckOperationalAutofillError(last_error or "Falha ao consultar a OpenAI para o autofill operacional.")


def autofill_truck_operational_record(
    type_record: dict[str, Any],
    *,
    current_operational_record: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = load_truck_operational_autofill_config()
    if not bool(config.get("enabled", True)):
        raise TruckOperationalAutofillError("O autofill operacional de caminhões está desativado no JSON de configuração.")

    prompt = build_truck_operational_autofill_prompt(
        type_record,
        current_operational_record=current_operational_record,
    )
    response_payload = _request_openai_autofill_payload(prompt, config=config)

    raw_text = _extract_output_text(response_payload)
    normalized_payload = _normalize_payload(_parse_json_text(raw_text))
    summary = f"Dados pesquisados por IA para {str(type_record.get('label') or type_record.get('id') or 'caminhão')} preenchidos no rascunho atual."
    return {
        "payload": normalized_payload,
        "summary": summary,
        "provider": str(config.get("provider_label") or config.get("provider") or "OpenAI"),
        "model": str(response_payload.get("model") or config.get("primary_model") or config.get("fallback_model") or ""),
        "prompt": prompt,
    }