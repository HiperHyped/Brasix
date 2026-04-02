from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.ui import server
from app.ui.editor_models import ProductOperationalSaveRequest


@pytest.fixture()
def product_operational_catalog_env(monkeypatch: pytest.MonkeyPatch) -> Path:
    workspace = Path(__file__).resolve().parent / "_tmp_product_operational_save"
    source_path = Path(__file__).resolve().parents[1] / "json" / "game" / "product_operational_catalog.json"
    catalog_path = workspace / "product_operational_catalog.json"

    shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")

    monkeypatch.setattr(server, "PRODUCT_OPERATIONAL_CATALOG_PATH", catalog_path)

    try:
        yield catalog_path
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def test_save_product_operational_record_preserves_hidden_seasonality_curve(
    product_operational_catalog_env: Path,
) -> None:
    expected_curve = {
        "seasonality_index_jan": 1.1,
        "seasonality_index_feb": 1.12,
        "seasonality_index_mar": 1.08,
        "seasonality_index_apr": 1.0,
        "seasonality_index_may": 0.95,
        "seasonality_index_jun": 0.9,
        "seasonality_index_jul": 0.88,
        "seasonality_index_aug": 0.88,
        "seasonality_index_sep": 0.92,
        "seasonality_index_oct": 0.95,
        "seasonality_index_nov": 1.05,
        "seasonality_index_dec": 1.1,
    }
    request = ProductOperationalSaveRequest.model_validate(
        {
            "product_id": "cana-de-acucar",
            "unit": "mil t",
            "weight_per_unit_kg": 1000,
            "volume_per_unit_m3": 1.6,
            "price_reference_brl_per_unit": 140,
            "price_min_brl_per_unit": 100,
            "price_max_brl_per_unit": 180,
            "is_seasonal": False,
            **expected_curve,
            "confidence": "medium",
            "research_basis": "market_estimate",
            "source_urls": [],
            "notes": "Teste de preservação da curva sazonal.",
        }
    )

    response = server._save_product_operational_record(request)

    assert response.operational_record["is_seasonal"] is False
    for field, expected_value in expected_curve.items():
        assert response.operational_record[field] == expected_value

    saved_document = json.loads(product_operational_catalog_env.read_text(encoding="utf-8"))
    saved_record = next(
        item for item in saved_document["items"] if str(item.get("product_id") or "").strip() == "cana-de-acucar"
    )

    assert saved_record["is_seasonal"] is False
    for field, expected_value in expected_curve.items():
        assert saved_record[field] == expected_value