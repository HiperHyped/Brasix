from __future__ import annotations

from app.services import load_reference_data


def test_reference_data_loads_generated_files() -> None:
    data = load_reference_data()

    assert len(data.commodities) == 30
    assert len(data.cities) == 137
    assert "soja" in data.commodities
    assert any(city.state_code == "MT" for city in data.cities.values())
    assert all(city.latitude is not None for city in data.cities.values())
