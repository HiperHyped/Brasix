from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import CITIES_PATH, COMMODITIES_PATH, MAP_CONFIG_PATH
from app.domain import City, CommodityProfile, MapConfig, ReferenceData


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _load_commodities(path: Path) -> dict[str, CommodityProfile]:
    payload = load_json(path)
    return {
        item["id"]: CommodityProfile(
            id=item["id"],
            name=item["name"],
            category=item["category"],
            category_label=item["category_label"],
            unit=item["unit"],
            icon=item["icon"],
            color=item["color"],
            source_column=item["source_column"],
        )
        for item in payload
    }


def _load_cities(path: Path) -> dict[str, City]:
    payload = load_json(path)
    return {
        item["id"]: City(
            id=item["id"],
            name=item["name"],
            label=item["label"],
            state_code=item["state_code"],
            state_name=item["state_name"],
            source_region_name=item["source_region_name"],
            population_thousands=float(item["population_thousands"]),
            latitude=float(item["latitude"]),
            longitude=float(item["longitude"]),
            commodity_values={key: float(value) for key, value in item.get("commodity_values", {}).items()},
            dominant_commodity_id=item.get("dominant_commodity_id"),
        )
        for item in payload
    }


def _load_map_config(path: Path) -> MapConfig:
    payload = load_json(path)
    return MapConfig(
        center_lat=float(payload["center_lat"]),
        center_lon=float(payload["center_lon"]),
        lat_min=float(payload["lat_min"]),
        lat_max=float(payload["lat_max"]),
        lon_min=float(payload["lon_min"]),
        lon_max=float(payload["lon_max"]),
    )


def load_reference_data(
    commodities_path: Path | None = None,
    cities_path: Path | None = None,
    map_config_path: Path | None = None,
) -> ReferenceData:
    commodity_file = commodities_path or COMMODITIES_PATH
    city_file = cities_path or CITIES_PATH
    map_file = map_config_path or MAP_CONFIG_PATH

    return ReferenceData(
        commodities=_load_commodities(commodity_file),
        cities=_load_cities(city_file),
        map_config=_load_map_config(map_file),
    )
