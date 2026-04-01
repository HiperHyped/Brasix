from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
import shutil

import pytest
from PIL import Image

from app.services import truck_image_generation as service
from app.ui.editor_models import TruckImageGenerateRequest, TruckImageReviewRequest


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _png_bytes(width: int = 256, height: int = 256) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for x in range(40, width - 40):
        for y in range(120, 180):
            image.putpixel((x, y), (255, 255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _catalog_fixtures() -> tuple[dict, dict, dict, dict]:
    return (
        {
            "id": "truck_type_catalog_v1",
            "types": [
                {
                    "id": "truck_type_vuc_4x2",
                    "order": 1,
                    "label": "VUC 4x2",
                    "short_label": "VUC",
                    "size_tier": "urban_compact",
                    "base_vehicle_kind": "rigid",
                    "axle_config": "4x2",
                    "combination_kind": "single_unit",
                    "cargo_scope": "urban_distribution",
                    "canonical_body_type_ids": ["truck_body_bau"],
                },
                {
                    "id": "truck_type_carreta_ls",
                    "order": 15,
                    "label": "Carreta simples / LS",
                    "short_label": "Carreta LS",
                    "size_tier": "articulated_large",
                    "base_vehicle_kind": "articulated_combination",
                    "axle_config": "cavalo_4x2_ou_6x2",
                    "combination_kind": "semi_trailer",
                    "cargo_scope": "standard_articulated",
                    "canonical_body_type_ids": ["truck_body_bau"],
                }
            ],
        },
        {
            "id": "truck_body_catalog_v1",
            "types": [
                {
                    "id": "truck_body_bau",
                    "label": "Bau",
                    "sprite_module_kind": "box_closed",
                    "order": 1,
                }
            ],
        },
        {
            "id": "truck_silhouette_catalog_v1",
            "specs": [
                {
                    "type_id": "truck_type_vuc_4x2",
                    "total_length_units": 56,
                    "cab_height_units": 19,
                    "deck_height_units": 6,
                    "module_specs": [
                        {"length_units": 32, "height_units": 13, "offset_y_units": 0}
                    ],
                    "axle_specs": [
                        {"position_units": 8, "group": "single"},
                        {"position_units": 39, "group": "single"},
                    ],
                },
                {
                    "type_id": "truck_type_carreta_ls",
                    "total_length_units": 90,
                    "cab_height_units": 23,
                    "deck_height_units": 6,
                    "module_specs": [
                        {"length_units": 50, "height_units": 18}
                    ],
                    "axle_specs": [
                        {"position_units": 12, "group": "single"},
                        {"position_units": 56, "group": "tandem"},
                    ],
                }
            ],
        },
        {
            "id": "truck_image_visual_definitions_v1",
            "definitions": [
                {
                    "type_id": "truck_type_vuc_4x2",
                    "prompt_items": [
                        "caminhão rígido urbano bem compacto",
                        "cabine curta de vuc com frente cabover",
                        "um único baú curto no mesmo chassi",
                    ],
                },
                {
                    "type_id": "truck_type_carreta_ls",
                    "prompt_items": [
                        "carreta ls com um cavalo mecanico e um semirreboque longo",
                        "apenas um semirreboque na parte traseira",
                        "nao desenhar segundo reboque ou dolly",
                    ],
                }
            ],
        },
    )


def _config_fixture() -> dict:
    return {
        "id": "truck_image_generation_config_v1",
        "enabled": True,
        "provider": "openai_gpt_image",
        "output_directory": "trucks/generated",
        "image_api": {
            "primary_model": "gpt-image-1.5",
            "fallback_model": "gpt-image-1",
            "size": "1024x1024",
            "quality": "high",
            "background": "transparent",
            "output_format": "png",
            "retries": {"max_attempts": 1, "retryable_status_codes": []},
        },
        "postprocess": {
            "enabled": True,
            "alpha_threshold": 4,
            "canvas_width_px": 1024,
            "canvas_height_px": 1024,
            "content_max_width_px": 920,
            "content_max_height_px": 460,
            "baseline_y_px": 820,
        },
        "prompt_builder": {
            "base_instructions": [
                "perfil lateral puro do caminhão",
                "fundo transparente",
                "veículo inteiro em preto sólido",
            ],
            "reference_defaults": {"default_aspects": ["cabine"]},
            "body_kind_hints": {
                "box_closed": "bau reto fechado"
            },
            "combination_kind_hints": {
                "semi_trailer": "um cavalo mecanico e um semirreboque"
            },
            "final_constraints": [
                "não usar carroceria branca ou cinza"
            ],
        },
    }


@pytest.fixture()
def truck_image_env(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = Path(__file__).resolve().parent / "_tmp_truck_image_generation"
    shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)
    registry_path = workspace / "truck_image_asset_registry.json"
    review_queue_path = workspace / "truck_image_review_queue.json"
    prompt_overrides_path = workspace / "truck_image_prompt_overrides.json"
    assets_dir = workspace / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    _write_json(registry_path, {"id": "truck_image_asset_registry_v1", "items": []})
    _write_json(review_queue_path, {"id": "truck_image_review_queue_v1", "pending_type_ids": [], "last_reviewed_type_id": None, "updated_at": None})
    _write_json(prompt_overrides_path, {"id": "truck_image_prompt_overrides_v1", "overrides": []})

    type_payload, body_payload, silhouette_payload, visual_definitions_payload = _catalog_fixtures()
    monkeypatch.setattr(service, "TRUCK_IMAGE_ASSET_REGISTRY_PATH", registry_path)
    monkeypatch.setattr(service, "TRUCK_IMAGE_REVIEW_QUEUE_PATH", review_queue_path)
    monkeypatch.setattr(service, "TRUCK_IMAGE_PROMPT_OVERRIDES_PATH", prompt_overrides_path)
    monkeypatch.setattr(service, "ASSETS_DIR", assets_dir)
    monkeypatch.setattr(service, "load_truck_type_catalog_payload", lambda: type_payload)
    monkeypatch.setattr(service, "load_truck_body_catalog_payload", lambda: body_payload)
    monkeypatch.setattr(service, "load_truck_silhouette_catalog_payload", lambda: silhouette_payload)
    monkeypatch.setattr(service, "load_truck_image_visual_definitions_payload", lambda: visual_definitions_payload)
    monkeypatch.setattr(service, "load_truck_image_generation_config", lambda: _config_fixture())
    try:
        yield
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def test_build_truck_image_prompt_is_deterministic(truck_image_env: None) -> None:
    prompt, summary, body_id, prompt_items = service.build_truck_image_prompt("truck_type_carreta_ls", config=_config_fixture())

    assert "carreta ls com um cavalo mecanico e um semirreboque longo" in prompt
    assert "veículo inteiro em preto sólido" in prompt
    assert "fundo transparente" in prompt
    assert "Bau" in summary
    assert body_id == "truck_body_bau"
    assert prompt_items[0] == "perfil lateral puro do caminhão"
    assert "nao desenhar segundo reboque ou dolly" in prompt_items


def test_generate_truck_image_dry_run_writes_manifest_and_registry(truck_image_env: None) -> None:
    asset, review_queue = service.generate_truck_image_asset(
        TruckImageGenerateRequest(truck_type_id="truck_type_carreta_ls", dry_run=True)
    )

    assert asset.status == "skipped"
    assert asset.dry_run is True
    assert review_queue.pending_type_ids == []
    manifest_path = service.ASSETS_DIR / Path(asset.manifest_rel_path)
    assert manifest_path.exists()

    registry_document = service._load_registry_document()
    assert registry_document.items[0].truck_type_id == "truck_type_carreta_ls"
    assert registry_document.items[0].status == "skipped"
    assert registry_document.items[0].prompt_items


def test_build_truck_prompt_items_from_classification_uses_notes_and_categories(truck_image_env: None) -> None:
    items = service.build_truck_prompt_items_from_classification(
        truck_type_id="truck_type_custom_van",
        label="Van de carga",
        size_tier="super_leve",
        base_vehicle_kind="rigido",
        axle_config="4x2",
        preferred_body_type_id="truck_body_bau",
        notes="utilitario curto com teto alto",
        config=_config_fixture(),
    )

    assert any("tipo van de carga" in item for item in items)
    assert any("porte Super-leve" in item for item in items)
    assert any("tipo rigido" in item for item in items)
    assert any("implemento: bau reto fechado" in item for item in items)
    assert any("observacoes importantes: utilitario curto com teto alto" in item for item in items)


def test_generate_and_approve_truck_image_updates_registry_and_assets(
    truck_image_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "_call_openai_image_api",
        lambda prompt, config: service._GeneratedImagePayload(
            image_bytes=_png_bytes(),
            model_used="gpt-image-1.5",
            width_px=1024,
            height_px=1024,
        ),
    )

    generated_asset, review_queue = service.generate_truck_image_asset(
        TruckImageGenerateRequest(truck_type_id="truck_type_carreta_ls")
    )

    assert generated_asset.status == "generated"
    assert generated_asset.candidate_image_rel_path is not None
    assert review_queue.pending_type_ids == ["truck_type_carreta_ls"]
    candidate_path = service.ASSETS_DIR / Path(generated_asset.candidate_image_rel_path)
    assert candidate_path.exists()

    approved_asset, updated_queue = service.review_truck_image_asset(
        TruckImageReviewRequest(truck_type_id="truck_type_carreta_ls", decision="approved")
    )

    assert approved_asset.status == "approved"
    assert approved_asset.approved_image_rel_path is not None
    approved_path = service.ASSETS_DIR / Path(approved_asset.approved_image_rel_path)
    assert approved_path.exists()
    assert updated_queue.pending_type_ids == []
    assert updated_queue.last_reviewed_type_id == "truck_type_carreta_ls"


def test_generate_failure_persists_failed_registry_entry(
    truck_image_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "_call_openai_image_api",
        lambda prompt, config: (_ for _ in ()).throw(service.TruckImageGenerationError("OPENAI_API_KEY ausente")),
    )

    with pytest.raises(service.TruckImageGenerationError):
        service.generate_truck_image_asset(TruckImageGenerateRequest(truck_type_id="truck_type_carreta_ls"))

    registry_document = service._load_registry_document()
    assert registry_document.items[0].status == "failed"
    assert registry_document.items[0].error_message == "OPENAI_API_KEY ausente"


def test_generate_with_custom_prompt_items_persists_override(truck_image_env: None) -> None:
    custom_items = [
        "silhueta lateral super simples",
        "fundo transparente",
        "poucos detalhes de cabine",
    ]

    asset, _review_queue = service.generate_truck_image_asset(
        TruckImageGenerateRequest(
            truck_type_id="truck_type_carreta_ls",
            dry_run=True,
            prompt_items=custom_items,
        )
    )

    assert asset.prompt_items == custom_items
    overrides_document = service._load_prompt_overrides_document()
    assert overrides_document.overrides[0].truck_type_id == "truck_type_carreta_ls"
    assert overrides_document.overrides[0].prompt_items == custom_items


def test_generate_with_reference_image_uses_edit_api(
    truck_image_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference_dir = service.ASSETS_DIR / "trucks" / "generated" / "truck_type_vuc_4x2"
    reference_dir.mkdir(parents=True, exist_ok=True)
    reference_image_path = reference_dir / "main.png"
    reference_image_path.write_bytes(_png_bytes())

    _write_json(
        service.TRUCK_IMAGE_ASSET_REGISTRY_PATH,
        {
            "id": "truck_image_asset_registry_v1",
            "items": [
                {
                    "truck_type_id": "truck_type_vuc_4x2",
                    "canonical_body_type_id": "truck_body_bau",
                    "status": "approved",
                    "prompt_items": ["silhueta base"],
                    "prompt": "- silhueta base",
                    "prompt_summary": "VUC 4x2 com Bau e 1 item(ns) de prompt.",
                    "provider": "openai_gpt_image",
                    "requested_model": "gpt-image-1.5",
                    "used_model": "gpt-image-1.5",
                    "dry_run": False,
                    "approved_image_rel_path": "trucks/generated/truck_type_vuc_4x2/main.png",
                    "approved_image_url_path": "/assets/trucks/generated/truck_type_vuc_4x2/main.png",
                    "candidate_image_rel_path": None,
                    "candidate_image_url_path": None,
                    "manifest_rel_path": None,
                    "output_format": "png",
                    "background": "transparent",
                    "width_px": 1024,
                    "height_px": 1024,
                    "generated_at": None,
                    "reviewed_at": None,
                    "approved_at": None,
                    "updated_at": "2026-03-29T00:00:00-03:00",
                    "error_message": None,
                }
            ],
        },
    )

    called = {}

    def fake_edit_api(prompt, *, config, reference_image_paths):
        called["prompt"] = prompt
        called["reference_image_paths"] = [path.name for path in reference_image_paths]
        return service._GeneratedImagePayload(
            image_bytes=_png_bytes(),
            model_used="gpt-image-1.5",
            width_px=1024,
            height_px=1024,
        )

    monkeypatch.setattr(service, "_call_openai_image_edit_api", fake_edit_api)
    monkeypatch.setattr(
        service,
        "_call_openai_image_api",
        lambda prompt, config: (_ for _ in ()).throw(AssertionError("Nao deveria usar generations sem referencia.")),
    )

    asset, review_queue = service.generate_truck_image_asset(
        TruckImageGenerateRequest(
            truck_type_id="truck_type_carreta_ls",
            reference_truck_type_id="truck_type_vuc_4x2",
            reference_aspects=["cabine", "estilo"],
        )
    )

    assert asset.status == "generated"
    assert asset.reference_truck_type_id == "truck_type_vuc_4x2"
    assert asset.reference_image_rel_path == "trucks/generated/truck_type_vuc_4x2/main.png"
    assert "copiar apenas a cabine da referencia" in asset.prompt
    assert "copiar apenas o estilo do desenho da referencia" in asset.prompt
    assert called["reference_image_paths"] == ["main.png"]
    assert review_queue.pending_type_ids == ["truck_type_carreta_ls"]


def test_self_reference_is_ignored(truck_image_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "_call_openai_image_api",
        lambda prompt, config: service._GeneratedImagePayload(
            image_bytes=_png_bytes(),
            model_used="gpt-image-1.5",
            width_px=1024,
            height_px=1024,
        ),
    )
    monkeypatch.setattr(
        service,
        "_call_openai_image_edit_api",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Nao deveria usar edicao com auto-referencia.")),
    )

    asset, _review_queue = service.generate_truck_image_asset(
        TruckImageGenerateRequest(
            truck_type_id="truck_type_carreta_ls",
            reference_truck_type_id="truck_type_carreta_ls",
            reference_aspects=["cabine", "estilo"],
        )
    )

    assert asset.reference_truck_type_id is None
    assert "copiar apenas a cabine da referencia" not in asset.prompt


def test_postprocess_forces_black_silhouette_and_canvas_size(truck_image_env: None) -> None:
    image_bytes, width_px, height_px = service._postprocess_generated_image(
        _png_bytes(300, 300),
        truck_type_id="truck_type_carreta_ls",
        config=_config_fixture(),
    )

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    visible_pixels = [pixel for pixel in image.getdata() if pixel[3] > 0]

    assert width_px == 1024
    assert height_px == 1024
    assert visible_pixels
    assert all(pixel[:3] == (0, 0, 0) for pixel in visible_pixels)
