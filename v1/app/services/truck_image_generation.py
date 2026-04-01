from __future__ import annotations

import base64
import json
import mimetypes
import shutil
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image

from app.config import (
    ASSETS_DIR,
    TRUCK_IMAGE_ASSET_REGISTRY_PATH,
    TRUCK_IMAGE_GENERATION_CONFIG_PATH,
    TRUCK_IMAGE_PROMPT_OVERRIDES_PATH,
    TRUCK_IMAGE_REVIEW_QUEUE_PATH,
    runtime_env,
)
from app.services.data_loader import (
    load_truck_category_catalog_payload,
    load_effective_truck_type_catalog_payload,
    load_json,
    load_truck_body_catalog_payload,
    load_truck_image_visual_definitions_payload,
    load_truck_silhouette_catalog_payload,
    load_truck_type_catalog_payload,
    save_json,
)
from app.ui.editor_models import (
    TruckImageAssetRecord,
    TruckImageAssetRegistryDocument,
    TruckImageGenerateRequest,
    TruckImagePromptOverrideRecord,
    TruckImagePromptOverridesDocument,
    TruckImageReviewQueueDocument,
    TruckImageReviewRequest,
)


class TruckImageGenerationError(RuntimeError):
    """Raised when single-item truck image generation cannot complete."""


@dataclass(slots=True)
class _GeneratedImagePayload:
    image_bytes: bytes
    model_used: str
    width_px: int | None
    height_px: int | None


BODY_KIND_HINT_FALLBACKS = {
    "box_closed": "bau reto fechado",
    "curtain_side": "sider reto fechado",
    "flatbed": "plataforma aberta",
    "grain": "graneleiro com laterais mais altas",
    "refrigerated_box": "bau frigorifico",
    "tank": "tanque cilindrico",
    "tipper": "cacamba basculante",
    "container_chassis": "chassi com um conteiner",
    "lowboy": "prancha rebaixada",
    "mixer": "betoneira",
    "crane_flatbed": "plataforma com munck compacto",
    "garbage_compactor": "compactador de lixo",
    "livestock": "boiadeiro",
    "sugarcane": "canavieiro com fueiros",
    "logs": "madeireiro com toras",
    "vehicle_carrier": "cegonheiro com dois niveis",
}

COMBINATION_KIND_HINTS = {
    "single_unit": "um caminhao rigido unico",
    "semi_trailer": "um cavalo mecanico e um semirreboque",
    "drawbar_trailer": "um caminhao rigido puxando um reboque separado",
    "multi_trailer": "combinacao rodoviaria com multiplos implementos articulados",
    "articulated": "um cavalo mecanico preparado para semirreboque",
    "combination": "combinacao rodoviaria completa",
    "specialized": "combinacao especial do tipo correto",
}

SIZE_TIER_LABELS = {
    "super_leve": "super-leve",
    "leve": "leve",
    "medio": "medio",
    "pesado": "pesado",
    "super_pesado": "super-pesado",
    "especial": "super-pesado",
    "smallest": "super-leve",
    "small": "leve",
    "medium": "medio",
    "medium_plus": "medio plus",
    "large": "grande",
    "large_plus": "grande plus",
    "extra_large": "pesado",
    "tractor_small": "cavalo pequeno",
    "tractor_large": "cavalo grande",
    "tractor_extra_large": "super-pesado",
    "articulated_large": "pesado",
    "drawbar_large": "pesado",
    "combination_extra_large": "super-pesado",
}

BASE_VEHICLE_KIND_LABELS = {
    "rigido": "rigido",
    "cavalo": "cavalo",
    "combinacao": "combinacao",
    "especial": "especial",
    "rigid": "rigido",
    "tractor_unit": "cavalo mecanico",
    "articulated_combination": "combinacao articulada",
    "drawbar_combination": "combinacao com reboque",
}

CARGO_SCOPE_LABELS = {
    "urban_last_mile": "urbano ultima milha",
    "urban_and_regional": "urbano e regional",
    "urban_zero_emission": "urbano emissao zero",
    "regional_general_cargo": "carga geral regional",
    "regional_and_national": "regional e nacional",
    "national_general_cargo": "carga geral nacional",
    "mixed_road_and_vocational": "rodoviario e vocacional",
    "high_capacity_rigid": "rigido alta capacidade",
    "construction_and_mining": "construcao e mineracao",
    "offroad_heavy_duty": "fora de estrada pesado",
    "regional_articulated": "articulado regional",
    "national_articulated": "articulado nacional",
    "heavy_articulated_and_vocational": "articulado pesado e vocacional",
    "standard_articulated": "articulado padrao",
    "regional_drawbar": "regional com reboque",
    "high_capacity_road": "rodoviario alta capacidade",
    "sugarcane_and_forest": "cana e floresta",
    "extreme_road_capacity": "capacidade rodoviaria extrema",
    "agricultural_multi_combo": "combinacao agricola",
    "vehicle_transport": "transporte de veiculos",
}

LEGACY_GENERATED_PROMPT_PREFIXES = (
    "tipo:",
    "apelido curto:",
    "eixos:",
    "estrutura:",
    "combinacao:",
    "implemento:",
    "respeitar ",
    "usar a mesma cabine da imagem de referencia",
    "manter o mesmo estilo grafico da imagem de referencia",
)

LEGACY_GENERATED_PROMPT_EXACT = {
    "silhueta tecnica lateral de um caminhao brasileiro",
    "silhueta tecnica lateral de um caminhao",
    "fundo transparente",
    "veiculo isolado, sem cenario",
    "perfil lateral puro, sem perspectiva",
    "preto e branco, estilo prancha tecnica",
    "sem texto, logo, pessoas, estrada ou sombras",
    "respeitar proporcoes reais brasileiras",
    "desenho simples e limpo, com pouco detalhe",
    "desenho simples e limpo, com minimo de detalhe",
    "nao fazer estilo cartoon, brinquedo ou icone colorido",
}


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _emit_log(event: str, **payload: Any) -> None:
    try:
        serialized = json.dumps(payload, ensure_ascii=False, default=str)
    except TypeError:
        serialized = str(payload)
    print(f"[Brasix/TruckImage][{event}] {serialized}", flush=True)


def _load_registry_document(path: Path | None = None) -> TruckImageAssetRegistryDocument:
    return TruckImageAssetRegistryDocument.model_validate(load_json(path or TRUCK_IMAGE_ASSET_REGISTRY_PATH))


def _save_registry_document(
    document: TruckImageAssetRegistryDocument,
    path: Path | None = None,
) -> TruckImageAssetRegistryDocument:
    save_json(path or TRUCK_IMAGE_ASSET_REGISTRY_PATH, document.model_dump(mode="json"))
    return document


def _load_review_queue_document(path: Path | None = None) -> TruckImageReviewQueueDocument:
    return TruckImageReviewQueueDocument.model_validate(load_json(path or TRUCK_IMAGE_REVIEW_QUEUE_PATH))


def _save_review_queue_document(
    document: TruckImageReviewQueueDocument,
    path: Path | None = None,
) -> TruckImageReviewQueueDocument:
    save_json(path or TRUCK_IMAGE_REVIEW_QUEUE_PATH, document.model_dump(mode="json"))
    return document


def _load_prompt_overrides_document(path: Path | None = None) -> TruckImagePromptOverridesDocument:
    return TruckImagePromptOverridesDocument.model_validate(load_json(path or TRUCK_IMAGE_PROMPT_OVERRIDES_PATH))


def load_truck_image_generation_config() -> dict[str, Any]:
    payload = dict(load_json(TRUCK_IMAGE_GENERATION_CONFIG_PATH))
    image_api = dict(payload.get("image_api") or {})
    payload["output_directory"] = runtime_env("BRASIX_TRUCK_IMAGE_OUTPUT_DIR", str(payload.get("output_directory") or "trucks/generated"))
    image_api["primary_model"] = runtime_env("BRASIX_TRUCK_IMAGE_MODEL_PRIMARY", str(image_api.get("primary_model") or "gpt-image-1.5"))
    image_api["fallback_model"] = runtime_env("BRASIX_TRUCK_IMAGE_MODEL_FALLBACK", str(image_api.get("fallback_model") or "gpt-image-1"))
    image_api["edit_api_base_url"] = runtime_env("BRASIX_TRUCK_IMAGE_EDIT_API_BASE_URL", str(image_api.get("edit_api_base_url") or "https://api.openai.com/v1/images/edits"))
    image_api["size"] = runtime_env("BRASIX_TRUCK_IMAGE_SIZE", str(image_api.get("size") or "1024x1024"))
    image_api["quality"] = runtime_env("BRASIX_TRUCK_IMAGE_QUALITY", str(image_api.get("quality") or "high"))
    image_api["background"] = runtime_env("BRASIX_TRUCK_IMAGE_BACKGROUND", str(image_api.get("background") or "transparent"))
    image_api["output_format"] = runtime_env("BRASIX_TRUCK_IMAGE_OUTPUT_FORMAT", str(image_api.get("output_format") or "png"))
    image_api["reference_input_fidelity"] = runtime_env("BRASIX_TRUCK_IMAGE_REFERENCE_INPUT_FIDELITY", str(image_api.get("reference_input_fidelity") or "high"))
    payload["image_api"] = image_api
    return payload


def _find_type_record(truck_type_id: str) -> dict[str, Any]:
    types = load_effective_truck_type_catalog_payload().get("types", [])
    for item in types:
        if item.get("id") == truck_type_id:
            return dict(item)
    raise TruckImageGenerationError(f"Tipo de caminhao nao encontrado: {truck_type_id}.")


def _find_body_record(body_id: str) -> dict[str, Any]:
    bodies = load_truck_body_catalog_payload().get("types", [])
    for item in bodies:
        if item.get("id") == body_id:
            return dict(item)
    raise TruckImageGenerationError(f"Implemento canonico nao encontrado: {body_id}.")


def _find_silhouette_spec(truck_type_id: str) -> dict[str, Any]:
    specs = load_truck_silhouette_catalog_payload().get("specs", [])
    for item in specs:
        if item.get("type_id") == truck_type_id:
            return dict(item)
    raise TruckImageGenerationError(f"Silhueta tecnica nao encontrada para: {truck_type_id}.")


def _find_visual_definition(truck_type_id: str) -> dict[str, Any] | None:
    payload = load_truck_image_visual_definitions_payload()
    for item in payload.get("definitions", []):
        if item.get("type_id") == truck_type_id:
            return dict(item)
    return None


def _override_for_type(truck_type_id: str) -> dict[str, Any] | None:
    document = _load_prompt_overrides_document()
    for item in document.overrides:
        if item.truck_type_id == truck_type_id and item.enabled:
            return item.model_dump(mode="json")
    return None


def _save_prompt_overrides_document(
    document: TruckImagePromptOverridesDocument,
    path: Path | None = None,
) -> TruckImagePromptOverridesDocument:
    save_json(path or TRUCK_IMAGE_PROMPT_OVERRIDES_PATH, document.model_dump(mode="json"))
    return document


def _current_asset_image_rel_path(record: TruckImageAssetRecord | None) -> str | None:
    if record is None:
        return None
    if record.candidate_image_rel_path and record.status in {"generated", "rejected", "failed"}:
        return record.candidate_image_rel_path
    return record.approved_image_rel_path or record.candidate_image_rel_path


def _size_to_dimensions(raw_size: str) -> tuple[int | None, int | None]:
    width, _, height = str(raw_size or "").partition("x")
    try:
        return int(width), int(height)
    except ValueError:
        return None, None


def _body_hint_for(body_record: dict[str, Any], config: dict[str, Any]) -> str:
    explicit_hint = str(body_record.get("prompt_hint") or "").strip()
    if explicit_hint:
        return explicit_hint
    module_kind = str(body_record.get("sprite_module_kind") or "")
    prompt_builder = dict(config.get("prompt_builder") or {})
    body_hints = dict(prompt_builder.get("body_kind_hints") or {})
    return str(
        body_hints.get(module_kind)
        or BODY_KIND_HINT_FALLBACKS.get(module_kind)
        or str(body_record.get("label") or "").strip().lower()
        or "implemento do tipo"
    )


def _combination_hint_for(type_record: dict[str, Any], config: dict[str, Any]) -> str:
    combination_kind = str(type_record.get("combination_kind") or "")
    prompt_builder = dict(config.get("prompt_builder") or {})
    hints = dict(prompt_builder.get("combination_kind_hints") or {})
    return str(hints.get(combination_kind) or COMBINATION_KIND_HINTS.get(combination_kind) or "combinacao rodoviaria correta do tipo")


def _silhouette_notes(spec: dict[str, Any]) -> str:
    module_specs = list(spec.get("module_specs") or [])
    axle_specs = list(spec.get("axle_specs") or [])
    group_counter = Counter(str(item.get("group") or "single") for item in axle_specs)
    module_count = len(module_specs)
    articulation_count = max(0, module_count - 1)
    total_length_units = spec.get("total_length_units")
    parts = []
    if module_count:
        parts.append(f"{module_count} modulo(s) de carga")
    if articulation_count:
        parts.append(f"{articulation_count} articulacao(oes)")
    if group_counter:
        groups = ", ".join(f"{count} grupo(s) {group}" for group, count in sorted(group_counter.items()))
        parts.append(groups)
    if total_length_units:
        parts.append(f"proporcao tecnica longa de cerca de {total_length_units} unidades")
    if not parts:
        return "respeitar a proporcao tecnica desse tipo"
    return "respeitar " + "; ".join(parts)


def _normalize_prompt_items(prompt_items: list[str] | tuple[str, ...] | None) -> list[str]:
    cleaned_items: list[str] = []
    for raw_item in prompt_items or []:
        item = str(raw_item or "").strip()
        if not item:
            continue
        if "Ã" in item or "â" in item:
            try:
                item = item.encode("latin-1").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
        item = item.lstrip("-").lstrip("•").strip()
        if item:
            cleaned_items.append(item)
    return cleaned_items


def _humanize_lookup(value: str, labels: dict[str, str]) -> str:
    source = str(value or "").strip()
    if not source:
        return ""
    return labels.get(source, source.replace("_", " "))


def _category_label_from_catalog(group: str, value: str, labels: dict[str, str]) -> str:
    source = str(value or "").strip()
    if not source:
        return ""
    payload = load_truck_category_catalog_payload()
    group_key = {
        "size_tier": "size_tiers",
        "base_vehicle_kind": "base_vehicle_kinds",
        "axle_config": "axle_configs",
        "combination_kind": "combination_kinds",
        "cargo_scope": "cargo_scopes",
    }.get(group)
    if group_key:
        for item in payload.get(group_key, []):
            if str(item.get("id") or "").strip() == source:
                return str(item.get("label") or source).strip()
    return _humanize_lookup(source, labels)


def build_truck_prompt_items_from_classification(
    *,
    truck_type_id: str,
    label: str,
    size_tier: str,
    base_vehicle_kind: str,
    axle_config: str,
    preferred_body_type_id: str,
    notes: str = "",
    config: dict[str, Any] | None = None,
) -> list[str]:
    active_config = config or load_truck_image_generation_config()
    body_record = _find_body_record(preferred_body_type_id)
    prompt_builder = dict(active_config.get("prompt_builder") or {})
    prompt_items = _normalize_prompt_items(prompt_builder.get("base_instructions") or [])
    prompt_items.extend(
        [
            f"veiculo de carga brasileiro do tipo {str(label or truck_type_id).strip().lower()}",
            f"porte { _category_label_from_catalog('size_tier', size_tier, SIZE_TIER_LABELS) }",
            f"tipo { _category_label_from_catalog('base_vehicle_kind', base_vehicle_kind, BASE_VEHICLE_KIND_LABELS) }",
            f"eixos {str(axle_config or '').strip()}",
            f"implemento: {_body_hint_for(body_record, active_config)}",
            "usar poucos detalhes",
        ]
    )
    if str(notes or "").strip():
        prompt_items.append(f"observacoes importantes: {str(notes).strip()}")
    prompt_items.extend(_normalize_prompt_items(prompt_builder.get("final_constraints") or []))
    return _normalize_prompt_items(prompt_items)


def _normalize_reference_aspects(reference_aspects: list[str] | tuple[str, ...] | None) -> list[str]:
    allowed = {"cabine", "estilo"}
    normalized: list[str] = []
    for raw_aspect in reference_aspects or []:
        aspect = str(raw_aspect or "").strip().lower()
        if aspect in allowed and aspect not in normalized:
            normalized.append(aspect)
    return normalized


def _reference_defaults(config: dict[str, Any]) -> dict[str, Any]:
    return dict((config.get("prompt_builder") or {}).get("reference_defaults") or {})


def _normalize_reference_choice(
    truck_type_id: str,
    reference_truck_type_id: str | None,
    reference_aspects: list[str] | tuple[str, ...] | None,
    *,
    config: dict[str, Any],
) -> tuple[str | None, list[str]]:
    normalized_type_id = str(reference_truck_type_id or "").strip() or None
    normalized_aspects = _normalize_reference_aspects(reference_aspects)
    defaults = _reference_defaults(config)
    default_aspects = _normalize_reference_aspects(defaults.get("default_aspects") or ["cabine"])

    if normalized_type_id == truck_type_id:
        _emit_log("reference_ignored_same_type", truck_type_id=truck_type_id)
        return None, []
    if normalized_type_id and not normalized_aspects:
        normalized_aspects = default_aspects or ["cabine"]
    return normalized_type_id, normalized_aspects


def _is_legacy_generated_prompt_item(item: str) -> bool:
    normalized = str(item or "").strip().lower()
    return normalized in LEGACY_GENERATED_PROMPT_EXACT or normalized.startswith(LEGACY_GENERATED_PROMPT_PREFIXES)


def _looks_like_legacy_generated_prompt(prompt_items: list[str]) -> bool:
    return sum(1 for item in prompt_items if _is_legacy_generated_prompt_item(item)) >= 3


def _override_prompt_items(
    truck_type_id: str,
    prompt_items: list[str] | tuple[str, ...] | None,
    *,
    default_prompt_items: list[str],
) -> tuple[list[str], bool]:
    normalized_items = _normalize_prompt_items(prompt_items)
    if not normalized_items:
        return list(default_prompt_items), False
    if not _looks_like_legacy_generated_prompt(normalized_items):
        return normalized_items, False

    custom_items = [
        item
        for item in normalized_items
        if not _is_legacy_generated_prompt_item(item) and item not in default_prompt_items
    ]
    if not custom_items:
        return list(default_prompt_items), True

    _emit_log("legacy_prompt_override_sanitized", truck_type_id=truck_type_id, custom_item_count=len(custom_items))
    return _normalize_prompt_items([*default_prompt_items, *custom_items]), True


def _reference_prompt_items(reference_label: str, reference_aspects: list[str]) -> list[str]:
    normalized_aspects = _normalize_reference_aspects(reference_aspects)
    if not reference_label or not normalized_aspects:
        return []

    items = [f"usar {reference_label} apenas como referencia parcial"]
    if "cabine" in normalized_aspects:
        items.append("copiar apenas a cabine da referencia")
    if "estilo" in normalized_aspects:
        items.append("copiar apenas o estilo do desenho da referencia")
    items.append("nao copiar eixos, modulos, implementos ou comprimento da referencia")
    return items


def _spec_total_height_units(spec: dict[str, Any]) -> float:
    deck_height_units = float(spec.get("deck_height_units") or 0)
    cab_height_units = float(spec.get("cab_height_units") or 0)
    module_height_units = 0.0
    for module_spec in spec.get("module_specs") or []:
        module_height_units = max(
            module_height_units,
            deck_height_units
            + float(module_spec.get("height_units") or 0)
            + max(0.0, -float(module_spec.get("offset_y_units") or 0)),
        )
    return max(cab_height_units, module_height_units, 1.0)


def _default_prompt_items(
    truck_type_id: str,
    *,
    config: dict[str, Any],
    allow_override_prompt_items: bool,
    reference_label: str | None = None,
    reference_aspects: list[str] | None = None,
) -> tuple[list[str], str, str]:
    type_record = _find_type_record(truck_type_id)
    visual_definition = _find_visual_definition(truck_type_id)
    override = (_override_for_type(truck_type_id) or {}) if allow_override_prompt_items else {}
    body_id = str(
        override.get("preferred_body_type_id")
        or type_record.get("preferred_body_type_id")
        or type_record.get("canonical_body_type_ids", [""])[0]
        or ""
    )
    body_record = _find_body_record(body_id)

    prompt_builder = dict(config.get("prompt_builder") or {})
    default_prompt_items = _normalize_prompt_items(prompt_builder.get("base_instructions") or [])
    if visual_definition:
        default_prompt_items.extend(_normalize_prompt_items(list(visual_definition.get("prompt_items") or [])))
        default_prompt_items.extend(_normalize_prompt_items([f"implemento: {_body_hint_for(body_record, config)}"]))
        default_prompt_items.extend(_normalize_prompt_items(prompt_builder.get("final_constraints") or []))
    else:
        default_prompt_items = build_truck_prompt_items_from_classification(
            truck_type_id=truck_type_id,
            label=str(type_record.get("label") or truck_type_id),
            size_tier=str(type_record.get("size_tier") or ""),
            base_vehicle_kind=str(type_record.get("base_vehicle_kind") or ""),
            axle_config=str(type_record.get("axle_config") or ""),
            preferred_body_type_id=body_id,
            notes=str(type_record.get("notes") or ""),
            config=config,
        )
    prompt_items = list(default_prompt_items)
    raw_override_prompt_items = list(override.get("prompt_items") or [])
    if allow_override_prompt_items:
        prompt_items, _is_legacy = _override_prompt_items(
            truck_type_id,
            raw_override_prompt_items,
            default_prompt_items=default_prompt_items,
        )
        extra_instructions = str(override.get("extra_instructions") or "").strip()
        if extra_instructions:
            prompt_items.append(extra_instructions)
        if not reference_label:
            override_reference_id, override_reference_aspects = _normalize_reference_choice(
                truck_type_id,
                str(override.get("reference_truck_type_id") or "").strip() or None,
                [] if _looks_like_legacy_generated_prompt(raw_override_prompt_items) else (override.get("reference_aspects") or []),
                config=config,
            )
            if override_reference_id:
                try:
                    reference_label = _find_type_record(override_reference_id)["label"]
                    reference_aspects = override_reference_aspects
                except TruckImageGenerationError:
                    reference_label = None
    if reference_label:
        prompt_items.extend(_reference_prompt_items(reference_label, _normalize_reference_aspects(reference_aspects)))

    summary = f"{type_record['label']} com {body_record['label']} e {len(prompt_items)} item(ns) de prompt."
    return prompt_items, summary, body_id


def _compose_prompt_text(prompt_items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in _normalize_prompt_items(prompt_items))


def build_truck_image_prompt(
    truck_type_id: str,
    *,
    config: dict[str, Any] | None = None,
    prompt_items_override: list[str] | None = None,
    allow_override_prompt_items: bool = True,
    reference_label: str | None = None,
    reference_aspects: list[str] | None = None,
) -> tuple[str, str, str, list[str]]:
    active_config = config or load_truck_image_generation_config()
    normalized_reference_aspects = _normalize_reference_aspects(reference_aspects)
    prompt_items, summary, body_id = _default_prompt_items(
        truck_type_id,
        config=active_config,
        allow_override_prompt_items=allow_override_prompt_items,
        reference_label=reference_label,
        reference_aspects=normalized_reference_aspects,
    )
    override_items = _normalize_prompt_items(prompt_items_override)
    if override_items:
        prompt_items = override_items
        if reference_label:
            prompt_items = prompt_items + _reference_prompt_items(reference_label, normalized_reference_aspects)
    prompt = _compose_prompt_text(prompt_items)
    return prompt, summary, body_id, prompt_items


def build_truck_image_prompt_defaults_payload(config: dict[str, Any] | None = None) -> dict[str, list[str]]:
    active_config = config or load_truck_image_generation_config()
    payload: dict[str, list[str]] = {}
    for item in load_effective_truck_type_catalog_payload().get("types", []):
        truck_type_id = str(item.get("id") or "").strip()
        if not truck_type_id:
            continue
        prompt_items, _, _ = _default_prompt_items(
            truck_type_id,
            config=active_config,
            allow_override_prompt_items=False,
        )
        payload[truck_type_id] = prompt_items
    return payload


def _persist_prompt_override(
    truck_type_id: str,
    prompt_items: list[str],
    *,
    canonical_body_type_id: str,
    reference_truck_type_id: str | None = None,
    reference_aspects: list[str] | None = None,
) -> None:
    document = _load_prompt_overrides_document()
    normalized = _normalize_prompt_items(prompt_items)
    updated_override = {
        "truck_type_id": truck_type_id,
        "preferred_body_type_id": canonical_body_type_id,
        "prompt_items": normalized,
        "reference_truck_type_id": reference_truck_type_id,
        "reference_aspects": _normalize_reference_aspects(reference_aspects),
        "extra_instructions": "",
        "enabled": True,
    }
    for index, item in enumerate(document.overrides):
        if item.truck_type_id == truck_type_id:
            document.overrides[index] = item.model_copy(update=updated_override)
            _save_prompt_overrides_document(document)
            return
    document.overrides.append(TruckImagePromptOverrideRecord(**updated_override))
    _save_prompt_overrides_document(document)


def _asset_root_from_config(config: dict[str, Any]) -> Path:
    output_directory = str(config.get("output_directory") or "trucks/generated").replace("\\", "/").strip("/")
    return ASSETS_DIR / output_directory


def _type_asset_dir(truck_type_id: str, config: dict[str, Any]) -> Path:
    directory = _asset_root_from_config(config) / truck_type_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _rel_path_from_assets(path: Path) -> str:
    return path.relative_to(ASSETS_DIR).as_posix()


def _url_path_from_assets(path: Path) -> str:
    return f"/assets/{_rel_path_from_assets(path)}"


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


def _call_openai_image_api(prompt: str, *, config: dict[str, Any]) -> _GeneratedImagePayload:
    api_key = runtime_env("OPENAI_API_KEY", "")
    if not api_key:
        raise TruckImageGenerationError("OPENAI_API_KEY nao configurada no v1/.env para gerar imagens de caminhoes.")

    image_api = dict(config.get("image_api") or {})
    api_url = str(image_api.get("api_base_url") or "https://api.openai.com/v1/images/generations")
    timeout_seconds = float(image_api.get("request_timeout_seconds") or 180)
    primary_model = str(image_api.get("primary_model") or "gpt-image-1.5")
    fallback_model = str(image_api.get("fallback_model") or "gpt-image-1")
    models = [model for model in [primary_model, fallback_model] if model]
    if not models:
        raise TruckImageGenerationError("Nenhum modelo de imagem foi configurado para o pipeline de caminhoes.")

    max_attempts = int(((image_api.get("retries") or {}).get("max_attempts")) or 1)
    retryable_status_codes = {
        int(item) for item in ((image_api.get("retries") or {}).get("retryable_status_codes") or [])
    }

    last_error: str | None = None
    for model_name in models:
        request_payload = {
            "model": model_name,
            "prompt": prompt,
            "size": str(image_api.get("size") or "1024x1024"),
            "quality": str(image_api.get("quality") or "high"),
            "background": str(image_api.get("background") or "transparent"),
            "output_format": str(image_api.get("output_format") or "png"),
            "moderation": str(image_api.get("moderation") or "auto"),
            "output_compression": int(image_api.get("output_compression") or 100),
            "n": 1,
        }
        _emit_log("request", model=model_name, size=request_payload["size"], quality=request_payload["quality"])

        for attempt in range(1, max_attempts + 1):
            try:
                payload = _post_json(
                    api_url,
                    request_payload,
                    headers=_headers_for_openai(api_key),
                    timeout_seconds=timeout_seconds,
                )
                data = payload.get("data") if isinstance(payload, dict) else None
                first_item = data[0] if isinstance(data, list) and data else None
                image_b64 = first_item.get("b64_json") if isinstance(first_item, dict) else None
                if not image_b64:
                    raise TruckImageGenerationError("A OpenAI nao retornou uma imagem codificada para este caminhao.")
                width_px, height_px = _size_to_dimensions(request_payload["size"])
                return _GeneratedImagePayload(
                    image_bytes=base64.b64decode(image_b64),
                    model_used=model_name,
                    width_px=width_px,
                    height_px=height_px,
                )
            except HTTPError as exc:
                detail = _decode_http_error(exc)
                _emit_log("http_error", model=model_name, attempt=attempt, status_code=exc.code, detail=detail)
                last_error = detail
                if exc.code in retryable_status_codes and attempt < max_attempts:
                    continue
                break
            except URLError as exc:
                detail = f"Falha de rede ao consultar a OpenAI: {exc.reason}."
                _emit_log("network_error", model=model_name, attempt=attempt, detail=detail)
                last_error = detail
                if attempt < max_attempts:
                    continue
                break

    raise TruckImageGenerationError(last_error or "Falha ao gerar a imagem do caminhao via OpenAI.")


def _encode_multipart_form(
    *,
    fields: list[tuple[str, str]],
    files: list[tuple[str, str, bytes, str]],
) -> tuple[bytes, str]:
    boundary = f"----BrasixBoundary{uuid4().hex}"
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    for field_name, file_name, file_bytes, content_type in files:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{file_name}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(file_bytes)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), boundary


def _post_multipart(
    url: str,
    *,
    fields: list[tuple[str, str]],
    files: list[tuple[str, str, bytes, str]],
    api_key: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    body, boundary = _encode_multipart_form(fields=fields, files=files)
    request = Request(
        url=url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _call_openai_image_edit_api(
    prompt: str,
    *,
    config: dict[str, Any],
    reference_image_paths: list[Path],
) -> _GeneratedImagePayload:
    api_key = runtime_env("OPENAI_API_KEY", "")
    if not api_key:
        raise TruckImageGenerationError("OPENAI_API_KEY nao configurada no v1/.env para gerar imagens de caminhoes.")

    image_api = dict(config.get("image_api") or {})
    api_url = str(image_api.get("edit_api_base_url") or "https://api.openai.com/v1/images/edits")
    timeout_seconds = float(image_api.get("request_timeout_seconds") or 180)
    primary_model = str(image_api.get("primary_model") or "gpt-image-1.5")
    fallback_model = str(image_api.get("fallback_model") or "gpt-image-1")
    models = [model for model in [primary_model, fallback_model] if model]
    max_attempts = int(((image_api.get("retries") or {}).get("max_attempts")) or 1)
    retryable_status_codes = {
        int(item) for item in ((image_api.get("retries") or {}).get("retryable_status_codes") or [])
    }
    fidelity = str(image_api.get("reference_input_fidelity") or "high")
    output_format = str(image_api.get("output_format") or "png")
    quality = str(image_api.get("quality") or "high")
    size = str(image_api.get("size") or "1024x1024")
    background = str(image_api.get("background") or "transparent")
    output_compression = int(image_api.get("output_compression") or 100)

    file_parts: list[tuple[str, str, bytes, str]] = []
    for index, image_path in enumerate(reference_image_paths, start=1):
        if not image_path.exists():
            raise TruckImageGenerationError(f"Imagem de referencia ausente: {image_path.name}.")
        mime_type = mimetypes.guess_type(image_path.name)[0] or "image/png"
        file_parts.append(("image", image_path.name, image_path.read_bytes(), mime_type))
        _emit_log("reference_image", index=index, file_name=image_path.name, mime_type=mime_type)

    last_error: str | None = None
    for model_name in models:
        fields = [
            ("model", model_name),
            ("prompt", prompt),
            ("size", size),
            ("quality", quality),
            ("background", background),
            ("output_format", output_format),
            ("moderation", str(image_api.get("moderation") or "auto")),
            ("output_compression", str(output_compression)),
            ("input_fidelity", fidelity),
            ("n", "1"),
        ]
        _emit_log("edit_request", model=model_name, size=size, quality=quality, reference_count=len(file_parts))
        for attempt in range(1, max_attempts + 1):
            try:
                payload = _post_multipart(
                    api_url,
                    fields=fields,
                    files=file_parts,
                    api_key=api_key,
                    timeout_seconds=timeout_seconds,
                )
                data = payload.get("data") if isinstance(payload, dict) else None
                first_item = data[0] if isinstance(data, list) and data else None
                image_b64 = first_item.get("b64_json") if isinstance(first_item, dict) else None
                if not image_b64:
                    raise TruckImageGenerationError("A OpenAI nao retornou uma imagem editada codificada.")
                width_px, height_px = _size_to_dimensions(size)
                return _GeneratedImagePayload(
                    image_bytes=base64.b64decode(image_b64),
                    model_used=model_name,
                    width_px=width_px,
                    height_px=height_px,
                )
            except HTTPError as exc:
                detail = _decode_http_error(exc)
                _emit_log("edit_http_error", model=model_name, attempt=attempt, status_code=exc.code, detail=detail)
                last_error = detail
                if exc.code in retryable_status_codes and attempt < max_attempts:
                    continue
                break
            except URLError as exc:
                detail = f"Falha de rede ao consultar a OpenAI: {exc.reason}."
                _emit_log("edit_network_error", model=model_name, attempt=attempt, detail=detail)
                last_error = detail
                if attempt < max_attempts:
                    continue
                break

    raise TruckImageGenerationError(last_error or "Falha ao editar a imagem do caminhao via OpenAI.")


def _resolve_reference_asset(
    request: TruckImageGenerateRequest,
    *,
    config: dict[str, Any],
    registry: TruckImageAssetRegistryDocument,
) -> tuple[str | None, list[str], Path | None, str | None]:
    reference_truck_type_id, reference_aspects = _normalize_reference_choice(
        request.truck_type_id,
        request.reference_truck_type_id,
        request.reference_aspects,
        config=config,
    )
    if not reference_truck_type_id:
        override = _override_for_type(request.truck_type_id) or {}
        reference_truck_type_id, override_aspects = _normalize_reference_choice(
            request.truck_type_id,
            override.get("reference_truck_type_id"),
            [] if _looks_like_legacy_generated_prompt(list(override.get("prompt_items") or [])) else (override.get("reference_aspects") or []),
            config=config,
        )
        reference_aspects = reference_aspects or override_aspects
    if not reference_truck_type_id:
        return None, [], None, None
    reference_entry = next((item for item in registry.items if item.truck_type_id == reference_truck_type_id), None)
    if reference_entry is None:
        raise TruckImageGenerationError("A imagem de referencia escolhida nao existe no catalogo.")
    reference_rel_path = _current_asset_image_rel_path(reference_entry)
    if not reference_rel_path:
        raise TruckImageGenerationError("O caminhao de referencia ainda nao possui imagem gerada.")
    reference_path = ASSETS_DIR / Path(reference_rel_path)
    if not reference_path.exists():
        raise TruckImageGenerationError("O arquivo da imagem de referencia nao foi encontrado em assets.")
    reference_label = _find_type_record(reference_truck_type_id)["label"]
    return reference_truck_type_id, reference_aspects, reference_path, reference_label


def _write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _asset_variant_path(base_path: Path, suffix: str) -> Path:
    return base_path.with_name(f"{base_path.stem}_{suffix}{base_path.suffix}")


def _postprocess_generated_image(
    image_bytes: bytes,
    *,
    truck_type_id: str,
    config: dict[str, Any],
) -> tuple[bytes, int | None, int | None]:
    postprocess = dict(config.get("postprocess") or {})
    if not bool(postprocess.get("enabled", True)):
        return image_bytes, None, None

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    alpha_threshold = int(postprocess.get("alpha_threshold") or 4)
    pixels = [
        (0, 0, 0, alpha if alpha > alpha_threshold else 0)
        for _red, _green, _blue, alpha in image.getdata()
    ]
    image.putdata(pixels)

    mask = image.getchannel("A").point(lambda alpha: 255 if alpha > alpha_threshold else 0)
    bounds = mask.getbbox()
    if not bounds:
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue(), image.width, image.height

    cropped = image.crop(bounds)
    silhouette_payload = load_truck_silhouette_catalog_payload()
    specs = list(silhouette_payload.get("specs") or [])
    spec = _find_silhouette_spec(truck_type_id)
    max_total_length_units = max(float(item.get("total_length_units") or 1) for item in specs)
    max_total_height_units = max(_spec_total_height_units(item) for item in specs)
    total_length_units = float(spec.get("total_length_units") or 1)
    total_height_units = _spec_total_height_units(spec)

    canvas_width_px = int(postprocess.get("canvas_width_px") or image.width or 1024)
    canvas_height_px = int(postprocess.get("canvas_height_px") or image.height or 1024)
    content_max_width_px = int(postprocess.get("content_max_width_px") or round(canvas_width_px * 0.88))
    content_max_height_px = int(postprocess.get("content_max_height_px") or round(canvas_height_px * 0.52))
    baseline_y_px = int(postprocess.get("baseline_y_px") or round(canvas_height_px * 0.80))

    target_width_px = max(32, round(content_max_width_px * (total_length_units / max_total_length_units)))
    target_height_px = max(32, round(content_max_height_px * (total_height_units / max_total_height_units)))
    scale = min(target_width_px / max(cropped.width, 1), target_height_px / max(cropped.height, 1))
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        resample=Image.Resampling.LANCZOS,
    )

    normalized = Image.new("RGBA", (canvas_width_px, canvas_height_px), (0, 0, 0, 0))
    paste_x = max(0, round((canvas_width_px - resized.width) / 2))
    paste_y = max(0, baseline_y_px - resized.height)
    normalized.alpha_composite(resized, (paste_x, paste_y))

    buffer = BytesIO()
    normalized.save(buffer, format="PNG")
    return buffer.getvalue(), normalized.width, normalized.height


def _save_manifest(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _upsert_registry_item(registry: TruckImageAssetRegistryDocument, entry: TruckImageAssetRecord) -> None:
    for index, item in enumerate(registry.items):
        if item.truck_type_id == entry.truck_type_id:
            registry.items[index] = entry
            return
    registry.items.append(entry)


def _queue_add_pending(queue: TruckImageReviewQueueDocument, truck_type_id: str) -> None:
    if truck_type_id not in queue.pending_type_ids:
        queue.pending_type_ids.append(truck_type_id)
    queue.updated_at = _now_iso()


def _queue_remove_pending(queue: TruckImageReviewQueueDocument, truck_type_id: str) -> None:
    queue.pending_type_ids = [item for item in queue.pending_type_ids if item != truck_type_id]
    queue.updated_at = _now_iso()


def generate_truck_image_asset(request: TruckImageGenerateRequest) -> tuple[TruckImageAssetRecord, TruckImageReviewQueueDocument]:
    config = load_truck_image_generation_config()
    if not bool(config.get("enabled", True)):
        raise TruckImageGenerationError("A geracao de imagens de caminhoes esta desativada no JSON de configuracao.")

    registry = _load_registry_document()
    reference_truck_type_id, reference_aspects, reference_image_path, reference_label = _resolve_reference_asset(
        request,
        config=config,
        registry=registry,
    )
    prompt, prompt_summary, canonical_body_type_id, prompt_items = build_truck_image_prompt(
        request.truck_type_id,
        config=config,
        prompt_items_override=request.prompt_items,
        allow_override_prompt_items=True,
        reference_label=reference_label,
        reference_aspects=reference_aspects,
    )
    manual_prompt_items = _normalize_prompt_items(request.prompt_items)
    if manual_prompt_items or reference_truck_type_id:
        _persist_prompt_override(
            request.truck_type_id,
            manual_prompt_items,
            canonical_body_type_id=canonical_body_type_id,
            reference_truck_type_id=reference_truck_type_id,
            reference_aspects=reference_aspects,
        )
    queue = _load_review_queue_document()
    existing = next((item for item in registry.items if item.truck_type_id == request.truck_type_id), None)
    now = _now_iso()
    asset_dir = _type_asset_dir(request.truck_type_id, config)
    manifest_path = asset_dir / "manifest.json"
    candidate_path = asset_dir / "candidate.png"
    candidate_raw_path = _asset_variant_path(candidate_path, "original")
    approved_path = asset_dir / "main.png"
    approved_raw_path = _asset_variant_path(approved_path, "original")
    image_api = dict(config.get("image_api") or {})
    model_requested = str(image_api.get("primary_model") or "gpt-image-1.5")

    try:
        if request.dry_run:
            entry = TruckImageAssetRecord(
                truck_type_id=request.truck_type_id,
                canonical_body_type_id=canonical_body_type_id,
                status="skipped",
                prompt_items=prompt_items,
                reference_truck_type_id=reference_truck_type_id,
                reference_aspects=reference_aspects,
                reference_image_rel_path=_rel_path_from_assets(reference_image_path) if reference_image_path else None,
                reference_image_url_path=_url_path_from_assets(reference_image_path) if reference_image_path else None,
                prompt=prompt,
                prompt_summary=prompt_summary,
                provider=str(config.get("provider") or "openai_gpt_image"),
                requested_model=model_requested,
                used_model=None,
                dry_run=True,
                approved_image_rel_path=existing.approved_image_rel_path if existing else None,
                approved_image_url_path=existing.approved_image_url_path if existing else None,
                candidate_image_rel_path=existing.candidate_image_rel_path if existing else None,
                candidate_image_url_path=existing.candidate_image_url_path if existing else None,
                manifest_rel_path=_rel_path_from_assets(manifest_path),
                output_format=str(image_api.get("output_format") or "png"),
                background=str(image_api.get("background") or "transparent"),
                generated_at=existing.generated_at if existing else None,
                reviewed_at=existing.reviewed_at if existing else None,
                approved_at=existing.approved_at if existing else None,
                updated_at=now,
                error_message=None,
            )
            _save_manifest(
                manifest_path,
                {
                    **entry.model_dump(mode="json"),
                    "mode": "dry_run",
                    "truck_type_label": _find_type_record(request.truck_type_id)["label"],
                },
            )
            _upsert_registry_item(registry, entry)
            _save_registry_document(registry)
            return entry, queue

        generated = (
            _call_openai_image_edit_api(prompt, config=config, reference_image_paths=[reference_image_path])
            if reference_image_path
            else _call_openai_image_api(prompt, config=config)
        )
        _write_bytes(candidate_raw_path, generated.image_bytes)
        normalized_image_bytes, normalized_width_px, normalized_height_px = _postprocess_generated_image(
            generated.image_bytes,
            truck_type_id=request.truck_type_id,
            config=config,
        )
        _write_bytes(candidate_path, normalized_image_bytes)
        entry = TruckImageAssetRecord(
            truck_type_id=request.truck_type_id,
            canonical_body_type_id=canonical_body_type_id,
            status="generated",
            prompt_items=prompt_items,
            reference_truck_type_id=reference_truck_type_id,
            reference_aspects=reference_aspects,
            reference_image_rel_path=_rel_path_from_assets(reference_image_path) if reference_image_path else None,
            reference_image_url_path=_url_path_from_assets(reference_image_path) if reference_image_path else None,
            prompt=prompt,
            prompt_summary=prompt_summary,
            provider=str(config.get("provider") or "openai_gpt_image"),
            requested_model=model_requested,
            used_model=generated.model_used,
            dry_run=False,
            approved_image_rel_path=existing.approved_image_rel_path if existing else (_rel_path_from_assets(approved_path) if approved_path.exists() else None),
            approved_image_url_path=existing.approved_image_url_path if existing else (_url_path_from_assets(approved_path) if approved_path.exists() else None),
            candidate_image_rel_path=_rel_path_from_assets(candidate_path),
            candidate_image_url_path=_url_path_from_assets(candidate_path),
            manifest_rel_path=_rel_path_from_assets(manifest_path),
            output_format=str(image_api.get("output_format") or "png"),
            background=str(image_api.get("background") or "transparent"),
            width_px=normalized_width_px or generated.width_px,
            height_px=normalized_height_px or generated.height_px,
            generated_at=now,
            reviewed_at=existing.reviewed_at if existing else None,
            approved_at=existing.approved_at if existing else None,
            updated_at=now,
            error_message=None,
        )
        _save_manifest(
            manifest_path,
            {
                **entry.model_dump(mode="json"),
                "truck_type_label": _find_type_record(request.truck_type_id)["label"],
            },
        )
        _queue_add_pending(queue, request.truck_type_id)
    except TruckImageGenerationError as exc:
        entry = TruckImageAssetRecord(
            truck_type_id=request.truck_type_id,
            canonical_body_type_id=canonical_body_type_id,
            status="failed",
            prompt_items=prompt_items,
            reference_truck_type_id=reference_truck_type_id,
            reference_aspects=reference_aspects,
            reference_image_rel_path=_rel_path_from_assets(reference_image_path) if reference_image_path else None,
            reference_image_url_path=_url_path_from_assets(reference_image_path) if reference_image_path else None,
            prompt=prompt,
            prompt_summary=prompt_summary,
            provider=str(config.get("provider") or "openai_gpt_image"),
            requested_model=model_requested,
            used_model=None,
            dry_run=request.dry_run,
            approved_image_rel_path=existing.approved_image_rel_path if existing else None,
            approved_image_url_path=existing.approved_image_url_path if existing else None,
            candidate_image_rel_path=existing.candidate_image_rel_path if existing else None,
            candidate_image_url_path=existing.candidate_image_url_path if existing else None,
            manifest_rel_path=_rel_path_from_assets(manifest_path),
            output_format=str(image_api.get("output_format") or "png"),
            background=str(image_api.get("background") or "transparent"),
            generated_at=existing.generated_at if existing else None,
            reviewed_at=existing.reviewed_at if existing else None,
            approved_at=existing.approved_at if existing else None,
            updated_at=now,
            error_message=str(exc),
        )
        _save_manifest(
            manifest_path,
            {
                **entry.model_dump(mode="json"),
                "truck_type_label": _find_type_record(request.truck_type_id)["label"],
            },
        )
        _queue_remove_pending(queue, request.truck_type_id)
        _upsert_registry_item(registry, entry)
        _save_registry_document(registry)
        _save_review_queue_document(queue)
        raise

    _upsert_registry_item(registry, entry)
    _save_registry_document(registry)
    _save_review_queue_document(queue)
    return entry, queue


def review_truck_image_asset(request: TruckImageReviewRequest) -> tuple[TruckImageAssetRecord, TruckImageReviewQueueDocument]:
    registry = _load_registry_document()
    queue = _load_review_queue_document()
    try:
        current_entry = next(item for item in registry.items if item.truck_type_id == request.truck_type_id)
    except StopIteration as exc:
        raise TruckImageGenerationError(f"Nenhuma geracao encontrada para: {request.truck_type_id}.") from exc

    if not current_entry.candidate_image_rel_path:
        raise TruckImageGenerationError("Nao existe imagem candidata para revisar neste caminhao.")

    candidate_path = ASSETS_DIR / Path(current_entry.candidate_image_rel_path)
    if not candidate_path.exists():
        raise TruckImageGenerationError("O arquivo candidato nao existe mais no diretorio de assets.")

    reviewed_at = _now_iso()
    asset_dir = candidate_path.parent
    approved_path = asset_dir / "main.png"
    candidate_raw_path = _asset_variant_path(candidate_path, "original")
    approved_raw_path = _asset_variant_path(approved_path, "original")
    manifest_path = asset_dir / "manifest.json"

    if request.decision == "approved":
        shutil.copyfile(candidate_path, approved_path)
        if candidate_raw_path.exists():
            shutil.copyfile(candidate_raw_path, approved_raw_path)
        updated_entry = current_entry.model_copy(
            update={
                "status": "approved",
                "approved_image_rel_path": _rel_path_from_assets(approved_path),
                "approved_image_url_path": _url_path_from_assets(approved_path),
                "approved_at": reviewed_at,
                "reviewed_at": reviewed_at,
                "updated_at": reviewed_at,
                "error_message": None,
            }
        )
    else:
        updated_entry = current_entry.model_copy(
            update={
                "status": "rejected",
                "reviewed_at": reviewed_at,
                "updated_at": reviewed_at,
            }
        )

    _queue_remove_pending(queue, request.truck_type_id)
    queue.last_reviewed_type_id = request.truck_type_id

    _upsert_registry_item(registry, updated_entry)
    _save_registry_document(registry)
    _save_review_queue_document(queue)
    _save_manifest(
        manifest_path,
        {
            **updated_entry.model_dump(mode="json"),
            "decision": request.decision,
        },
    )
    return updated_entry, queue
