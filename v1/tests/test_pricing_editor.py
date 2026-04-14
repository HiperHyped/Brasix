from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.services import pricing_editor as pricing_service


def _population_bands() -> dict[str, object]:
    return {
        "bands": [
            {
                "id": "band_small",
                "label": "Pequena",
                "legend_order": 1,
                "min_population_thousands": 0,
                "max_population_thousands": 300,
            },
            {
                "id": "band_large",
                "label": "Grande",
                "legend_order": 2,
                "min_population_thousands": 300,
                "max_population_thousands": None,
            },
        ]
    }


@pytest.fixture()
def pricing_editor_env(monkeypatch: pytest.MonkeyPatch) -> Path:
    workspace = Path(__file__).resolve().parent / "_tmp_pricing_editor"
    shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(pricing_service, "PRICING_EDITOR_DIR", workspace)
    monkeypatch.setattr(pricing_service, "load_map_editor_payload", lambda: {"population_bands": _population_bands()})

    try:
        yield workspace
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def test_load_pricing_editor_document_defaults_base_initial_cash_to_zero(pricing_editor_env: Path) -> None:
    document = pricing_service.load_pricing_editor_document("map_test", _population_bands())

    assert document["capital"]["base_initial_cash_brl"] == 1000000


def test_save_pricing_editor_document_persists_base_initial_cash(pricing_editor_env: Path) -> None:
    saved = pricing_service.save_pricing_editor_document(
        map_id="map_test",
        document={
            "capital": {
                "base_initial_cash_brl": 150000,
                "reserve_days": 18,
                "buffer_percent": 0.1,
                "hard_liquidity_factor": 0.7,
                "standard_liquidity_factor": 1.1,
                "sandbox_liquidity_factor": 1.8,
            }
        },
        updated_at="2026-04-13T12:00:00-03:00",
    )

    assert saved["capital"]["base_initial_cash_brl"] == 150000

    payload = json.loads((pricing_editor_env / "map_test.json").read_text(encoding="utf-8"))
    assert payload["capital"]["base_initial_cash_brl"] == 150000

    loaded = pricing_service.load_pricing_editor_document("map_test", _population_bands())
    assert loaded["capital"]["base_initial_cash_brl"] == 150000