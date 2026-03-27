from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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


class CustomCityRecord(BaseModel):
    id: str
    name: str = Field(min_length=1)
    label: str = Field(min_length=1)
    state_code: str = Field(min_length=1, max_length=3)
    state_name: str = Field(min_length=1)
    source_region_name: str = Field(min_length=1)
    population_thousands: float = Field(ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_user_created: bool = True
    autofill: CustomCityAutofillRecord | None = None


class CustomCityCatalogDocument(BaseModel):
    id: str = "city_catalog_user_v1"
    cities: list[CustomCityRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cities(self) -> "CustomCityCatalogDocument":
        ids = [city.id for city in self.cities]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada cidade criada no editor precisa de um id unico.")
        return self


class CityAutofillRequest(BaseModel):
    city: CustomCityRecord


class CityAutofillResponse(BaseModel):
    city: CustomCityRecord


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
