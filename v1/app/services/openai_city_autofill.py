from __future__ import annotations

import gzip
import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import AI_CITY_AUTOFILL_CONFIG_PATH, runtime_env
from app.services.data_loader import load_json
from app.ui.editor_models import CustomCityAutofillRecord, CustomCityRecord


class CityAutofillError(RuntimeError):
    """Raised when deterministic city autofill cannot complete."""


@dataclass(slots=True)
class ReverseGeocoderCandidate:
    name: str
    state_name: str
    state_code: str
    region_name: str
    display_name: str
    provider: str


@dataclass(slots=True)
class MunicipalityLookupRecord:
    municipality_id: str
    name: str
    state_code: str
    state_name: str = ""
    region_name: str = ""
    region_names: tuple[str, ...] = ()


BRAZIL_STATE_CODE_BY_NAME = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "goias": "GO",
    "maranhao": "MA",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    "minas gerais": "MG",
    "para": "PA",
    "paraiba": "PB",
    "parana": "PR",
    "pernambuco": "PE",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
}

BRAZIL_STATE_CODES = set(BRAZIL_STATE_CODE_BY_NAME.values())


def _emit_autofill_log(event: str, **payload: Any) -> None:
    try:
        serialized = json.dumps(payload, ensure_ascii=False, default=str)
    except TypeError:
        serialized = str(payload)
    print(f"[Brasix/Autofill][{event}] {serialized}", flush=True)


def load_city_autofill_config() -> dict[str, Any]:
    return dict(load_json(AI_CITY_AUTOFILL_CONFIG_PATH))


def _normalized_key(value: str) -> str:
    replacement_table = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "â": "a",
            "ã": "a",
            "ä": "a",
            "é": "e",
            "ê": "e",
            "ë": "e",
            "í": "i",
            "ï": "i",
            "ó": "o",
            "ô": "o",
            "õ": "o",
            "ö": "o",
            "ú": "u",
            "ü": "u",
            "ç": "c",
            "'": "",
            "\"": "",
        }
    )
    compact = str(value or "").strip().lower().translate(replacement_table)
    compact = re.sub(r"\s+", " ", compact)
    return compact


def _normalized_label(name: str, state_code: str) -> str:
    trimmed_name = str(name or "").strip() or "Nova cidade"
    trimmed_state_code = str(state_code or "").strip().upper()[:3] or "ZZ"
    return f"{trimmed_name}, {trimmed_state_code}"


def _normalized_state_code(value: Any) -> str:
    code = str(value or "").strip().upper()
    return code if code in BRAZIL_STATE_CODES else ""


def _decode_json_payload(body: bytes, content_encoding: str | None = None) -> Any:
    normalized_encoding = str(content_encoding or "").strip().lower()
    raw_body = body
    if "gzip" in normalized_encoding or raw_body.startswith(b"\x1f\x8b"):
        raw_body = gzip.decompress(raw_body)
    return json.loads(raw_body.decode("utf-8"))


def _http_json(url: str, *, headers: dict[str, str], timeout_seconds: float, log_name: str) -> Any:
    request = Request(url=url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            body = response.read()
            content_encoding = response.headers.get("Content-Encoding")
            return _decode_json_payload(body, content_encoding)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        _emit_autofill_log(log_name, detail=detail or f"HTTP {exc.code}", url=url)
        raise CityAutofillError(detail or f"Falha HTTP ao consultar {url}.") from exc
    except URLError as exc:
        _emit_autofill_log(log_name, reason=str(exc.reason), url=url)
        raise CityAutofillError(f"Falha de rede ao consultar {url}: {exc.reason}.") from exc


def _extract_state_code_from_address(address: dict[str, Any], state_name: str) -> str:
    for key, value in address.items():
        if key.startswith("ISO3166-2") and isinstance(value, str) and value.startswith("BR-"):
            return value.split("-", 1)[1].upper()
    return BRAZIL_STATE_CODE_BY_NAME.get(_normalized_key(state_name), "")


def _pick_address_city_name(address: dict[str, Any], payload: dict[str, Any]) -> str:
    for key in ("city", "town", "village", "municipality", "suburb", "county"):
        value = address.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    fallback_name = payload.get("name")
    return str(fallback_name).strip() if isinstance(fallback_name, str) else ""


def reverse_geocode_city_candidate(config: dict[str, Any], city: CustomCityRecord) -> ReverseGeocoderCandidate:
    geocoder_config = dict(config.get("reverse_geocoder") or {})
    query = {
        "lat": f"{city.latitude:.6f}",
        "lon": f"{city.longitude:.6f}",
        "format": str(geocoder_config.get("format") or "jsonv2"),
        "addressdetails": int(geocoder_config.get("addressdetails") or 1),
        "zoom": int(geocoder_config.get("zoom") or 10),
        "layer": str(geocoder_config.get("layer") or "address"),
    }
    url = f"{str(geocoder_config.get('api_base_url') or 'https://nominatim.openstreetmap.org/reverse')}?{urlencode(query)}"
    accept_language = str(geocoder_config.get("accept_language") or "pt-BR,pt,en")
    contact_email = runtime_env("NOMINATIM_CONTACT_EMAIL", "")
    if contact_email:
        url = f"{url}&email={contact_email}"

    payload = _http_json(
        url,
        headers={
            "Accept": "application/json",
            "Accept-Language": accept_language,
            "User-Agent": str(geocoder_config.get("user_agent") or "Brasix/0.1"),
        },
        timeout_seconds=float(geocoder_config.get("request_timeout_seconds") or 10),
        log_name="reverse_geocoder_error",
    )
    address = payload.get("address") or {}
    country_code = str(address.get("country_code") or "").lower()
    if country_code and country_code != "br":
        raise CityAutofillError("O reverse geocoder retornou um ponto fora do Brasil.")

    city_name = _pick_address_city_name(address, payload)
    state_name = str(address.get("state") or "").strip()
    state_code = _normalized_state_code(_extract_state_code_from_address(address, state_name)) or _normalized_state_code(city.state_code)
    region_name = (
        str(address.get("state_district") or "").strip()
        or str(address.get("municipality") or "").strip()
        or str(address.get("county") or "").strip()
        or f"Região de {city_name}"
    )
    if not city_name:
        raise CityAutofillError("O Nominatim nao conseguiu identificar o municipio para este ponto.")

    candidate = ReverseGeocoderCandidate(
        name=city_name,
        state_name=state_name,
        state_code=state_code,
        region_name=region_name,
        display_name=str(payload.get("display_name") or city_name),
        provider=str(geocoder_config.get("provider_label") or "Nominatim"),
    )
    _emit_autofill_log(
        "reverse_geocoder_candidate",
        city_id=city.id,
        candidate_name=candidate.name,
        candidate_state_code=candidate.state_code,
        candidate_region_name=candidate.region_name,
    )
    return candidate


def _municipality_name_from_record(record: dict[str, Any]) -> str:
    for key in ("nome", "municipio", "nome_municipio"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _municipality_id_from_record(record: dict[str, Any]) -> str:
    value = record.get("id")
    if value is not None:
        return str(value)
    return ""


def _nested_mapping_value(record: dict[str, Any], path: tuple[str, ...]) -> dict[str, Any] | None:
    current: Any = record
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, dict) else None


def _municipality_state_from_record(record: dict[str, Any]) -> tuple[str, str]:
    for path in (
        ("regiao-imediata", "regiao-intermediaria", "UF"),
        ("microrregiao", "mesorregiao", "UF"),
    ):
        uf_payload = _nested_mapping_value(record, path)
        if not uf_payload:
            continue
        state_code = _normalized_state_code(uf_payload.get("sigla"))
        state_name = str(uf_payload.get("nome") or "").strip()
        if state_code or state_name:
            return state_code, state_name
    return "", ""


def _municipality_region_names_from_record(record: dict[str, Any]) -> tuple[str, ...]:
    raw_values = [
        str((_nested_mapping_value(record, ("regiao-imediata",)) or {}).get("nome") or "").strip(),
        str((_nested_mapping_value(record, ("regiao-imediata", "regiao-intermediaria")) or {}).get("nome") or "").strip(),
        str((_nested_mapping_value(record, ("microrregiao",)) or {}).get("nome") or "").strip(),
        str((_nested_mapping_value(record, ("microrregiao", "mesorregiao")) or {}).get("nome") or "").strip(),
    ]
    seen: set[str] = set()
    normalized: list[str] = []
    for value in raw_values:
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return tuple(normalized)


def _resolve_municipality_candidate(
    candidates: list[MunicipalityLookupRecord],
    *,
    city_name: str,
    state_code: str,
    region_name: str,
) -> MunicipalityLookupRecord | None:
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    normalized_region = _normalized_key(region_name)
    narrowed = list(candidates)
    if normalized_region:
        region_matches = [
            candidate
            for candidate in narrowed
            if any(
                _normalized_key(region_value)
                and (
                    normalized_region in _normalized_key(region_value)
                    or _normalized_key(region_value) in normalized_region
                )
                for region_value in candidate.region_names
            )
        ]
        if len(region_matches) == 1:
            return region_matches[0]
        if region_matches:
            narrowed = region_matches

    normalized_state = _normalized_state_code(state_code)
    if normalized_state:
        state_matches = [candidate for candidate in narrowed if candidate.state_code == normalized_state]
        if len(state_matches) == 1:
            return state_matches[0]
        if state_matches:
            narrowed = state_matches

    if len(narrowed) == 1:
        return narrowed[0]

    options = ", ".join(sorted({f"{candidate.name}/{candidate.state_code or '??'}" for candidate in narrowed}))
    raise CityAutofillError(
        f"O IBGE encontrou mais de um municipio para '{city_name}'. Ajuste o ponto manualmente ou informe uma UF valida. Opcoes: {options}."
    )


def lookup_ibge_municipality(
    config: dict[str, Any],
    city_name: str,
    state_code: str,
    region_name: str = "",
) -> MunicipalityLookupRecord:
    municipality_config = dict(config.get("municipality_lookup") or {})
    normalized_state_code = _normalized_state_code(state_code)
    if normalized_state_code:
        path_template = str(
            municipality_config.get("path_template")
            or "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{state_code}/municipios"
        )
        url = path_template.format(state_code=normalized_state_code)
    else:
        url = str(
            municipality_config.get("all_path_template")
            or "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
        )
    payload = _http_json(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": str(municipality_config.get("user_agent") or "Brasix/0.1"),
        },
        timeout_seconds=float(municipality_config.get("request_timeout_seconds") or 10),
        log_name="ibge_municipality_lookup_error",
    )

    normalized_target = _normalized_key(city_name)
    exact_matches: list[MunicipalityLookupRecord] = []
    fuzzy_matches: list[MunicipalityLookupRecord] = []
    for record in payload if isinstance(payload, list) else []:
        if not isinstance(record, dict):
            continue
        record_name = _municipality_name_from_record(record)
        record_id = _municipality_id_from_record(record)
        if not record_name or not record_id:
            continue
        normalized_record_name = _normalized_key(record_name)
        record_state_code, record_state_name = _municipality_state_from_record(record)
        if not record_state_code:
            record_state_code = normalized_state_code
        region_names = _municipality_region_names_from_record(record)
        candidate = MunicipalityLookupRecord(
            municipality_id=record_id,
            name=record_name,
            state_code=record_state_code,
            state_name=record_state_name,
            region_name=region_names[0] if region_names else "",
            region_names=region_names,
        )
        if normalized_record_name == normalized_target:
            exact_matches.append(candidate)
            continue
        if normalized_target in normalized_record_name or normalized_record_name in normalized_target:
            fuzzy_matches.append(candidate)

    resolved = _resolve_municipality_candidate(
        exact_matches or fuzzy_matches,
        city_name=city_name,
        state_code=normalized_state_code,
        region_name=region_name,
    )
    if resolved is None:
        state_hint = normalized_state_code or "BR"
        raise CityAutofillError(f"O IBGE nao encontrou o municipio '{city_name}/{state_hint}'.")

    _emit_autofill_log(
        "ibge_municipality_match",
        city_name=city_name,
        state_code=resolved.state_code,
        municipality_id=resolved.municipality_id,
        municipality_name=resolved.name,
    )
    return resolved


def _parse_numeric_string(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text in {"...", "-", "X"}:
        return None
    compact = text.replace(".", "").replace(",", ".")
    try:
        return float(compact)
    except ValueError:
        return None


def _population_from_sidra_payload(payload: Any) -> int | None:
    if not isinstance(payload, list):
        return None

    for record in payload:
        if not isinstance(record, dict):
            continue
        text_fields = [_normalized_key(str(value)) for value in record.values() if isinstance(value, str)]
        if not any("populacao" in field for field in text_fields):
            continue
        parsed_value = _parse_numeric_string(record.get("V"))
        if parsed_value is not None:
            return int(round(parsed_value))
    return None


def lookup_ibge_population(config: dict[str, Any], municipality_id: str) -> int | None:
    population_config = dict(config.get("population_lookup") or {})
    path_template = str(
        population_config.get("path_template")
        or "https://apisidra.ibge.gov.br/values/t/{table_id}/n6/{municipality_id}/v/all/p/{period}?formato=json"
    )
    url = path_template.format(
        table_id=population_config.get("table_id") or "4714",
        municipality_id=municipality_id,
        period=population_config.get("period") or "2022",
    )
    payload = _http_json(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": str(population_config.get("user_agent") or "Brasix/0.1"),
        },
        timeout_seconds=float(population_config.get("request_timeout_seconds") or 10),
        log_name="ibge_population_lookup_error",
    )
    population = _population_from_sidra_payload(payload)
    _emit_autofill_log(
        "ibge_population_result",
        municipality_id=municipality_id,
        population=population,
    )
    return population


def autofill_custom_city(city: CustomCityRecord) -> CustomCityRecord:
    config = load_city_autofill_config()
    if not bool(config.get("enabled", True)):
        raise CityAutofillError("O autofill de cidades esta desativado no JSON do editor.")

    reverse_candidate = reverse_geocode_city_candidate(config, city)
    municipality = lookup_ibge_municipality(
        config,
        reverse_candidate.name,
        reverse_candidate.state_code,
        reverse_candidate.region_name,
    )
    population = lookup_ibge_population(config, municipality.municipality_id)

    resolved_state_code = (
        _normalized_state_code(reverse_candidate.state_code)
        or _normalized_state_code(municipality.state_code)
        or _normalized_state_code(city.state_code)
        or "ZZ"
    )
    resolved_state_name = (
        str(reverse_candidate.state_name or "").strip()
        or str(municipality.state_name or "").strip()
        or str(city.state_name or "").strip()
    )
    resolved_region_name = (
        str(reverse_candidate.region_name or "").strip()
        or str(municipality.region_name or "").strip()
        or str(city.source_region_name or "").strip()
    )

    population_thousands = float(city.population_thousands)
    if population is not None:
        population_thousands = max(0.0, float(population)) / 1000.0

    summary_parts = [
        f"Municipio identificado por {reverse_candidate.provider}: {reverse_candidate.display_name}.",
    ]
    if population is not None:
        summary_parts.append(f"Populacao consultada no IBGE: {population}.")
    else:
        summary_parts.append("Populacao nao encontrada na consulta publica do IBGE.")

    return city.model_copy(
        update={
            "name": reverse_candidate.name,
            "label": _normalized_label(reverse_candidate.name, resolved_state_code),
            "state_code": resolved_state_code,
            "state_name": resolved_state_name,
            "source_region_name": resolved_region_name,
            "population_thousands": population_thousands,
            "autofill": CustomCityAutofillRecord(
                provider=str(config.get("provider_label") or "Nominatim + IBGE"),
                model=None,
                status="completed",
                confidence="high" if population is not None else "medium",
                summary=" ".join(summary_parts),
                last_error=None,
            ),
        }
    )
