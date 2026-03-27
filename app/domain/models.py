from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CommodityProfile:
    id: str
    name: str
    category: str
    category_label: str
    unit: str
    icon: str
    color: str
    source_column: str


@dataclass
class City:
    id: str
    name: str
    label: str
    state_code: str
    state_name: str
    source_region_name: str
    population_thousands: float
    latitude: float
    longitude: float
    commodity_values: dict[str, float] = field(default_factory=dict)
    dominant_commodity_id: str | None = None


@dataclass(frozen=True)
class MapConfig:
    center_lat: float
    center_lon: float
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float


@dataclass(frozen=True)
class RouteLink:
    id: str
    from_city_id: str
    to_city_id: str
    mode: str = "road"
    status: str = "planned"
    distance_km: float | None = None
    notes: str = ""


@dataclass
class ReferenceData:
    commodities: dict[str, CommodityProfile]
    cities: dict[str, City]
    map_config: MapConfig
