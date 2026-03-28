from __future__ import annotations

import math
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.maptools.models import RouteEdgeRecord, RouteWorkspaceSnapshot


class PopulationBandRecord(BaseModel):
    id: str
    label: str
    min_population_thousands: float = Field(ge=0)
    max_population_thousands: float | None = Field(default=None, ge=0)
    pin_id: str
    marker_size_px: int = Field(ge=8, le=64)
    legend_order: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_range(self) -> "PopulationBandRecord":
        if self.max_population_thousands is not None and self.max_population_thousands <= self.min_population_thousands:
            raise ValueError("A faixa populacional precisa ter maximo maior que minimo.")
        return self


class PopulationBandDocument(BaseModel):
    id: str = "map_editor_population_bands_v1"
    unit: str = "population_thousands"
    bands: list[PopulationBandRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_bands(self) -> "PopulationBandDocument":
        if not self.bands:
            raise ValueError("O editor precisa de pelo menos uma faixa populacional.")

        ids = [band.id for band in self.bands]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada faixa populacional precisa de um id unico.")

        ordered = sorted(
            self.bands,
            key=lambda band: (band.min_population_thousands, band.max_population_thousands or math.inf),
        )

        previous_max: float | None = None
        for band in ordered:
            if previous_max is not None and band.min_population_thousands < previous_max:
                raise ValueError("As faixas populacionais nao podem se sobrepor.")
            previous_max = band.max_population_thousands
            if previous_max is None:
                break

        return self


class CustomCityAutofillRecord(BaseModel):
    provider: str | None = None
    model: str | None = None
    status: Literal["manual", "pending", "loading", "completed", "failed"] = "manual"
    confidence: Literal["low", "medium", "high"] | None = None
    summary: str | None = None
    last_error: str | None = None


class MapCityRecord(BaseModel):
    id: str
    name: str = Field(min_length=1)
    label: str = Field(min_length=1)
    state_code: str = Field(min_length=1, max_length=3)
    state_name: str = Field(min_length=1)
    source_region_name: str = Field(min_length=1)
    population_thousands: float = Field(ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_user_created: bool = False
    autofill: CustomCityAutofillRecord | None = None


class CustomCityRecord(MapCityRecord):
    is_user_created: bool = True


class CustomCityCatalogDocument(BaseModel):
    id: str = "city_catalog_user_v1"
    cities: list[CustomCityRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cities(self) -> "CustomCityCatalogDocument":
        ids = [city.id for city in self.cities]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada cidade criada no editor precisa de um id unico.")
        return self


class MapCityCatalogDocument(BaseModel):
    id: str = "map_city_catalog_v1"
    cities: list[MapCityRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cities(self) -> "MapCityCatalogDocument":
        ids = [city.id for city in self.cities]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada cidade do mapa precisa de um id unico.")
        return self


class CityAutofillRequest(BaseModel):
    city: CustomCityRecord


class CityAutofillResponse(BaseModel):
    city: CustomCityRecord


class MapSourceOptionsRecord(BaseModel):
    include_base_cities: bool = True
    include_created_cities: bool = True
    include_routes: bool = True
    include_graph_nodes: bool = True


class MapRegistryEntryRecord(BaseModel):
    id: str
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    description: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    updated_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    path: str = Field(min_length=1)
    city_count: int = Field(default=0, ge=0)
    route_count: int = Field(default=0, ge=0)
    graph_node_count: int = Field(default=0, ge=0)


class MapRegistryDocument(BaseModel):
    id: str = "maps_registry_v1"
    active_map_id: str
    maps: list[MapRegistryEntryRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_registry(self) -> "MapRegistryDocument":
        if not self.maps:
            raise ValueError("O repositorio de mapas precisa de pelo menos um mapa.")
        map_ids = [item.id for item in self.maps]
        if len(map_ids) != len(set(map_ids)):
            raise ValueError("Cada mapa do repositorio precisa de um id unico.")
        if self.active_map_id not in set(map_ids):
            raise ValueError("O mapa ativo precisa existir no registro.")
        return self


class MapBundleDocument(BaseModel):
    id: str
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    description: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    updated_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    source_options: MapSourceOptionsRecord = Field(default_factory=MapSourceOptionsRecord)
    cities: list[MapCityRecord] = Field(default_factory=list)
    route_network: RouteWorkspaceSnapshot = Field(default_factory=RouteWorkspaceSnapshot)

    @model_validator(mode="after")
    def validate_bundle(self) -> "MapBundleDocument":
        city_ids = [city.id for city in self.cities]
        if len(city_ids) != len(set(city_ids)):
            raise ValueError("Cada cidade do mapa precisa de um id unico.")
        return self


class MapCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    options: MapSourceOptionsRecord = Field(default_factory=MapSourceOptionsRecord)


class MapSaveRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class MapActivateRequest(BaseModel):
    map_id: str = Field(min_length=1)


class AutoRoutePreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_node_id: str = Field(min_length=1, alias="from_city_id")
    to_node_id: str = Field(min_length=1, alias="to_city_id")
    surface_type_id: str = Field(min_length=1)
    resolution_km: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def validate_distinct_endpoints(self) -> "AutoRoutePreviewRequest":
        if self.from_node_id == self.to_node_id:
            raise ValueError("A rota automatica precisa ligar dois pontos diferentes.")
        return self


class AutoRoutePreviewResponse(BaseModel):
    engine: str = "osrm"
    profile_id: str = "driving"
    surface_type_id: str
    resolution_km: int = Field(ge=1, le=50)
    raw_point_count: int = Field(ge=2)
    simplified_point_count: int = Field(ge=2)
    distance_km: float = Field(ge=0)
    edge: RouteEdgeRecord


class AutoRouteSaveRequest(BaseModel):
    edge: RouteEdgeRecord
    engine: str = "osrm"
    resolution_km: int = Field(default=20, ge=1, le=50)


class MapDisplayVisibilityRecord(BaseModel):
    show_cities: bool = True
    show_routes: bool = True
    show_graph_nodes: bool = True
    show_population_legend: bool = True


class MapDisplayCityRenderRecord(BaseModel):
    color_mode: str = "commodity"
    uniform_fill_color: str = "#2d5a27"
    selected_fill_color: str = "#8c4f10"
    opacity: float = Field(default=0.96, ge=0.2, le=1.0)


class MapDisplayRouteRenderRecord(BaseModel):
    opacity_scale: float = Field(default=1.0, ge=0.25, le=1.4)
    highlight_color: str = "#2d5a27"
    selected_color: str = "#8c4f10"


class MapDisplayGraphNodeRenderRecord(BaseModel):
    opacity: float = Field(default=0.98, ge=0.2, le=1.0)
    use_style_colors: bool = True
    override_fill_color: str = "#8c4f10"
    override_stroke_color: str = "#fff9ea"


class MapDisplaySettingsDocument(BaseModel):
    id: str = "map_display_settings_v1"
    visibility: MapDisplayVisibilityRecord = Field(default_factory=MapDisplayVisibilityRecord)
    city_render: MapDisplayCityRenderRecord = Field(default_factory=MapDisplayCityRenderRecord)
    route_render: MapDisplayRouteRenderRecord = Field(default_factory=MapDisplayRouteRenderRecord)
    graph_node_render: MapDisplayGraphNodeRenderRecord = Field(default_factory=MapDisplayGraphNodeRenderRecord)


class MapLeafletInteractionRecord(BaseModel):
    dragging_enabled: bool = True
    scroll_wheel_zoom_enabled: bool = True
    double_click_zoom_enabled: bool = True
    keyboard_enabled: bool = True
    keyboard_pan_delta_px: int = Field(default=80, ge=20, le=240)
    wheel_px_per_zoom_level: int = Field(default=60, ge=20, le=240)
    wheel_debounce_time_ms: int = Field(default=40, ge=0, le=200)


class MapLeafletZoomRecord(BaseModel):
    min_zoom: int = Field(default=3, ge=0, le=18)
    max_zoom: int = Field(default=18, ge=1, le=18)
    zoom_snap: float = Field(default=1.0, ge=0.0, le=2.0)
    zoom_delta: float = Field(default=1.0, ge=0.1, le=2.0)

    @model_validator(mode="after")
    def validate_zoom_bounds(self) -> "MapLeafletZoomRecord":
        if self.max_zoom < self.min_zoom:
            raise ValueError("O zoom maximo nao pode ser menor que o zoom minimo.")
        return self


class MapLeafletMotionRecord(BaseModel):
    inertia_enabled: bool = True
    inertia_deceleration: int = Field(default=3000, ge=500, le=8000)
    max_bounds_viscosity: float = Field(default=0.0, ge=0.0, le=1.0)
    zoom_animation_enabled: bool = True
    fade_animation_enabled: bool = True
    marker_zoom_animation_enabled: bool = True


class MapLeafletTileRecord(BaseModel):
    update_when_idle: bool = True
    update_interval_ms: int = Field(default=200, ge=50, le=1000)
    keep_buffer: int = Field(default=4, ge=0, le=12)
    detect_retina: bool = False
    min_native_zoom: int | None = Field(default=None, ge=0, le=18)
    max_native_zoom: int | None = Field(default=None, ge=0, le=18)

    @model_validator(mode="after")
    def validate_native_zoom_bounds(self) -> "MapLeafletTileRecord":
        if (
            self.min_native_zoom is not None
            and self.max_native_zoom is not None
            and self.max_native_zoom < self.min_native_zoom
        ):
            raise ValueError("O max native zoom nao pode ser menor que o min native zoom.")
        return self


class MapLeafletVisualRecord(BaseModel):
    base_opacity: float = Field(default=1.0, ge=0.15, le=1.0)
    labels_enabled: bool = True
    label_opacity: float = Field(default=0.9, ge=0.0, le=1.0)
    brightness: float = Field(default=1.0, ge=0.4, le=1.6)
    contrast: float = Field(default=1.0, ge=0.4, le=1.6)
    saturate: float = Field(default=1.0, ge=0.0, le=1.8)
    blur_px: float = Field(default=0.0, ge=0.0, le=3.0)


class MapLeafletSettingsDocument(BaseModel):
    id: str = "map_leaflet_settings_v1"
    base_tile_layer_id: str
    label_tile_layer_id: str | None = None
    visual: MapLeafletVisualRecord = Field(default_factory=MapLeafletVisualRecord)
    zoom: MapLeafletZoomRecord = Field(default_factory=MapLeafletZoomRecord)
    interaction: MapLeafletInteractionRecord = Field(default_factory=MapLeafletInteractionRecord)
    motion: MapLeafletMotionRecord = Field(default_factory=MapLeafletMotionRecord)
    tile_render: MapLeafletTileRecord = Field(default_factory=MapLeafletTileRecord)
