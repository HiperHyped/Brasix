from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import AI_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG_PATH, runtime_env
from app.services.data_loader import load_json, load_product_family_catalog_payload, load_product_logistics_type_catalog_payload


class ProductOperationalAutofillError(RuntimeError):
    """Raised when product operational autofill cannot complete."""


DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG = {
    "id": "product_operational_autofill_config_v1",
    "enabled": True,
    "provider": "openai_responses_web_search",
    "provider_label": "OpenAI Responses + Web Search",
    "api_base_url": "https://api.openai.com/v1/responses",
    "primary_model": "gpt-5.4",
    "fallback_model": "gpt-4.1",
    "request_timeout_seconds": 120,
    "max_output_tokens": 2200,
    "web_search_tool": {"type": "web_search_preview"},
}

SEASONALITY_FIELDS = [
    "seasonality_index_jan",
    "seasonality_index_feb",
    "seasonality_index_mar",
    "seasonality_index_apr",
    "seasonality_index_may",
    "seasonality_index_jun",
    "seasonality_index_jul",
    "seasonality_index_aug",
    "seasonality_index_sep",
    "seasonality_index_oct",
    "seasonality_index_nov",
    "seasonality_index_dec",
]


def load_product_operational_autofill_config() -> dict[str, Any]:
    payload = dict(DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG)
    if AI_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG_PATH.exists():
        payload.update(dict(load_json(AI_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG_PATH)))
    payload["api_base_url"] = runtime_env(
        "BRASIX_PRODUCT_OPERATIONAL_AUTOFILL_API_BASE_URL",
        str(payload.get("api_base_url") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["api_base_url"]),
    )
    payload["primary_model"] = runtime_env(
        "BRASIX_PRODUCT_OPERATIONAL_AUTOFILL_MODEL_PRIMARY",
        runtime_env(
            "BRASIX_PRODUCT_OPERATIONAL_AUTOFILL_MODEL",
            str(payload.get("primary_model") or payload.get("model") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["primary_model"]),
        ),
    )
    payload["fallback_model"] = runtime_env(
        "BRASIX_PRODUCT_OPERATIONAL_AUTOFILL_MODEL_FALLBACK",
        str(payload.get("fallback_model") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["fallback_model"]),
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


def _compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _family_label(family_id: str) -> str:
    for item in load_product_family_catalog_payload().get("families", []):
        if str(item.get("id") or "").strip() == family_id:
            return str(item.get("label") or family_id).strip() or family_id
    return family_id


def _logistics_label(logistics_type_id: str) -> str:
    for item in load_product_logistics_type_catalog_payload().get("types", []):
        if str(item.get("id") or "").strip() == logistics_type_id:
            return str(item.get("label") or logistics_type_id).strip() or logistics_type_id
    return logistics_type_id


def _schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "unit": {"type": ["string", "null"]},
            "weight_per_unit_kg": {"type": ["number", "null"]},
            "volume_per_unit_m3": {"type": ["number", "null"]},
            "price_reference_brl_per_unit": {"type": ["number", "null"]},
            "price_min_brl_per_unit": {"type": ["number", "null"]},
            "price_max_brl_per_unit": {"type": ["number", "null"]},
            "is_seasonal": {"type": ["boolean", "null"]},
            **{field: {"type": ["number", "null"]} for field in SEASONALITY_FIELDS},
            "confidence": {"type": ["string", "null"], "enum": ["low", "medium", "high", None]},
            "research_basis": {
                "type": ["string", "null"],
                "enum": ["official_statistic", "market_estimate", "derived_estimate", "mixed_sources", None],
            },
            "source_urls": {"type": "array", "items": {"type": "string"}},
            "notes": {"type": "string"},
        },
        "required": [
            "unit",
            "weight_per_unit_kg",
            "volume_per_unit_m3",
            "price_reference_brl_per_unit",
            "price_min_brl_per_unit",
            "price_max_brl_per_unit",
            "is_seasonal",
            *SEASONALITY_FIELDS,
            "confidence",
            "research_basis",
            "source_urls",
            "notes",
        ],
    }


def build_product_operational_autofill_prompt(
    product_record: dict[str, Any],
    *,
    current_operational_record: dict[str, Any] | None = None,
) -> str:
    product_id = str(product_record.get("id") or "").strip()
    name = str(product_record.get("name") or product_id).strip()
    family_id = str(product_record.get("family_id") or "").strip()
    logistics_type_id = str(product_record.get("logistics_type_id") or "").strip()
    current_notes_parts = [str(product_record.get("notes") or "").strip()]
    if current_operational_record:
        current_notes_parts.append(f"Dados atuais do workspace: {_compact_json(current_operational_record)}")
    current_notes = " | ".join(part for part in current_notes_parts if part) or "-"

    return f"""Você é um pesquisador de dados operacionais de produtos para o projeto Brasix.

Sua tarefa é pesquisar somente os dados técnicos, econômicos e sazonais do produto selecionado abaixo e devolver apenas um JSON válido, sem texto extra.

Você NÃO tem acesso direto ao workspace do VS Code. Use apenas o contexto estruturado enviado abaixo e, quando isso não for suficiente, complemente com pesquisa web em fontes públicas confiáveis.

Produto selecionado:
product_id: {product_id}
name: {name}
short_name: {str(product_record.get('short_name') or '').strip() or '-'}
family_id: {family_id or '-'}
family_label: {_family_label(family_id) if family_id else '-'}
logistics_type_id: {logistics_type_id or '-'}
logistics_type_label: {_logistics_label(logistics_type_id) if logistics_type_id else '-'}
unit: {str(product_record.get('unit') or '').strip() or '-'}
is_active: {bool(product_record.get('is_active', True))}
inputs: {_compact_json(list(product_record.get('inputs') or []))}
outputs: {_compact_json(list(product_record.get('outputs') or []))}
current_project_context: {current_notes}

Regras obrigatórias:
1. Considere primeiro o contexto estruturado já fornecido para este produto.
2. Se o contexto fornecido não for suficiente, pesquise na web em fontes públicas confiáveis.
3. Preencha somente estes campos: unit, weight_per_unit_kg, volume_per_unit_m3, price_reference_brl_per_unit, price_min_brl_per_unit, price_max_brl_per_unit, is_seasonal, seasonality_index_jan, seasonality_index_feb, seasonality_index_mar, seasonality_index_apr, seasonality_index_may, seasonality_index_jun, seasonality_index_jul, seasonality_index_aug, seasonality_index_sep, seasonality_index_oct, seasonality_index_nov, seasonality_index_dec, confidence, research_basis, source_urls, notes.
4. Em unit, preserve a unidade já usada pelo produto no Brasix quando ela existir.
5. weight_per_unit_kg e volume_per_unit_m3 devem representar a unidade base do produto.
6. price_reference_brl_per_unit deve ser um preço médio representativo do mercado brasileiro atual para a unidade base.
7. price_min_brl_per_unit e price_max_brl_per_unit devem representar uma faixa plausível do mercado brasileiro atual.
8. is_seasonal deve ser true apenas quando houver sazonalidade econômica relevante no preço do produto ao longo do ano.
9. Se is_seasonal for false, retorne os 12 índices mensais como 1.0.
10. Se is_seasonal for true, retorne os 12 índices mensais como multiplicadores do preço médio, em que 1.0 representa o mês neutro.
11. Não invente precisão falsa. Se não houver evidência suficiente para um campo, retorne null nesse campo e explique a lacuna em notes.
12. Em confidence use apenas: low, medium ou high.
13. Em research_basis use apenas: official_statistic, market_estimate, derived_estimate ou mixed_sources.
14. Em source_urls retorne somente URLs realmente usadas.
15. Responda somente com JSON válido neste formato:

{{
  "unit": "string ou null",
  "weight_per_unit_kg": number ou null,
  "volume_per_unit_m3": number ou null,
  "price_reference_brl_per_unit": number ou null,
  "price_min_brl_per_unit": number ou null,
  "price_max_brl_per_unit": number ou null,
  "is_seasonal": boolean ou null,
  "seasonality_index_jan": number ou null,
  "seasonality_index_feb": number ou null,
  "seasonality_index_mar": number ou null,
  "seasonality_index_apr": number ou null,
  "seasonality_index_may": number ou null,
  "seasonality_index_jun": number ou null,
  "seasonality_index_jul": number ou null,
  "seasonality_index_aug": number ou null,
  "seasonality_index_sep": number ou null,
  "seasonality_index_oct": number ou null,
  "seasonality_index_nov": number ou null,
  "seasonality_index_dec": number ou null,
  "confidence": "low|medium|high" ou null,
  "research_basis": "official_statistic|market_estimate|derived_estimate|mixed_sources" ou null,
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
    raise ProductOperationalAutofillError("A OpenAI nao retornou texto utilizavel para o autofill operacional de produtos.")


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
    raise ProductOperationalAutofillError("A resposta da IA nao retornou um JSON valido para o autofill operacional de produtos.")


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


def _optional_bool(value: Any) -> bool | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "sim", "yes"}:
        return True
    if text in {"false", "0", "nao", "não", "no"}:
        return False
    return None


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
    if research_basis not in {None, "official_statistic", "market_estimate", "derived_estimate", "mixed_sources"}:
        research_basis = None
    normalized = {
        "unit": str(raw_payload.get("unit") or "").strip() or None,
        "weight_per_unit_kg": _optional_number(raw_payload.get("weight_per_unit_kg")),
        "volume_per_unit_m3": _optional_number(raw_payload.get("volume_per_unit_m3")),
        "price_reference_brl_per_unit": _optional_number(raw_payload.get("price_reference_brl_per_unit")),
        "price_min_brl_per_unit": _optional_number(raw_payload.get("price_min_brl_per_unit")),
        "price_max_brl_per_unit": _optional_number(raw_payload.get("price_max_brl_per_unit")),
        "is_seasonal": _optional_bool(raw_payload.get("is_seasonal")),
        "confidence": confidence,
        "research_basis": research_basis,
        "source_urls": _string_list(raw_payload.get("source_urls")),
        "notes": str(raw_payload.get("notes") or "").strip(),
    }
    for field in SEASONALITY_FIELDS:
        normalized[field] = _optional_number(raw_payload.get(field))
    if normalized["is_seasonal"] is False:
        for field in SEASONALITY_FIELDS:
            normalized[field] = 1.0
    return normalized


def _request_openai_autofill_payload(prompt: str, *, config: dict[str, Any]) -> dict[str, Any]:
    api_key = runtime_env("OPENAI_API_KEY", "")
    if not api_key:
        raise ProductOperationalAutofillError("OPENAI_API_KEY não configurada no v1/.env para autofill operacional de produtos.")

    api_url = str(config.get("api_base_url") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["api_base_url"])
    timeout_seconds = float(config.get("request_timeout_seconds") or 120)
    model_candidates = [
        str(config.get("primary_model") or "").strip(),
        str(config.get("fallback_model") or "").strip(),
    ]
    models = [model for model in model_candidates if model]
    if not models:
        raise ProductOperationalAutofillError("Nenhum modelo foi configurado para o autofill operacional de produtos.")

    last_error: str | None = None
    for model in models:
        request_payload = {
            "model": model,
            "input": prompt,
            "max_output_tokens": int(config.get("max_output_tokens") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["max_output_tokens"]),
            "tools": [dict(config.get("web_search_tool") or DEFAULT_PRODUCT_OPERATIONAL_AUTOFILL_CONFIG["web_search_tool"])],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "product_operational_autofill",
                    "schema": _schema(),
                    "strict": True,
                }
            },
        }
        try:
            response_payload = _post_json(
                api_url,
                request_payload,
                headers=_headers_for_openai(api_key),
                timeout_seconds=timeout_seconds,
            )
            response_payload["_used_model"] = model
            return response_payload
        except HTTPError as exc:
            last_error = _decode_http_error(exc)
        except URLError as exc:
            last_error = str(exc.reason or exc)
        except TimeoutError:
            last_error = "Tempo esgotado ao consultar a OpenAI."

    raise ProductOperationalAutofillError(last_error or "Falha ao consultar a OpenAI para o autofill operacional de produtos.")


def autofill_product_operational_record(
    product_record: dict[str, Any],
    *,
    current_operational_record: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = load_product_operational_autofill_config()
    if not bool(config.get("enabled", True)):
        raise ProductOperationalAutofillError("O autofill operacional de produtos está desabilitado.")

    prompt = build_product_operational_autofill_prompt(
        product_record,
        current_operational_record=current_operational_record,
    )
    response_payload = _request_openai_autofill_payload(prompt, config=config)
    raw_text = _extract_output_text(response_payload)
    parsed_payload = _parse_json_text(raw_text)
    normalized_payload = _normalize_payload(parsed_payload)
    model_used = str(response_payload.get("_used_model") or config.get("primary_model") or "").strip() or None
    provider_label = str(config.get("provider_label") or config.get("provider") or "OpenAI").strip()
    return {
        "payload": normalized_payload,
        "summary": f"Dados operacionais pesquisados para {product_record.get('name') or product_record.get('id')}.".strip(),
        "provider": provider_label,
        "model": model_used,
        "prompt": prompt,
    }