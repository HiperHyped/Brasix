from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Literal

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


class RoutePlannerPlanRequest(BaseModel):
    route_mode: Literal["shortest", "fastest"] = "shortest"
    origin_node_id: str = Field(min_length=1)
    destination_node_id: str = Field(min_length=1)
    stop_node_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_route_points(self) -> "RoutePlannerPlanRequest":
        itinerary = [self.origin_node_id, *self.stop_node_ids, self.destination_node_id]
        for left, right in zip(itinerary, itinerary[1:], strict=False):
            if left == right:
                raise ValueError("Dois pontos consecutivos da rota nao podem ser iguais.")
        return self


class RoutePlannerStepResponse(BaseModel):
    sequence: int = Field(ge=1)
    edge_id: str
    from_node_id: str
    to_node_id: str
    from_label: str
    to_label: str
    distance_km: float = Field(ge=0)
    duration_hours: float = Field(ge=0)
    surface_type_id: str
    surface_code: str
    surface_label: str
    surface_shortcut_key: str = ""


class RoutePlannerLegResponse(BaseModel):
    index: int = Field(ge=1)
    start_node_id: str
    end_node_id: str
    start_label: str
    end_label: str
    distance_km: float = Field(ge=0)
    duration_hours: float = Field(ge=0)
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)
    steps: list[RoutePlannerStepResponse] = Field(default_factory=list)


class RoutePlannerPlanResponse(BaseModel):
    map_id: str
    map_name: str
    route_mode: Literal["shortest", "fastest"] = "shortest"
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)
    total_distance_km: float = Field(ge=0)
    total_duration_hours: float = Field(ge=0)
    total_steps: int = Field(ge=0)
    leg_count: int = Field(ge=1)
    stop_count: int = Field(ge=0)
    legs: list[RoutePlannerLegResponse] = Field(default_factory=list)


class MapDisplayVisibilityRecord(BaseModel):
    show_cities: bool = True
    show_routes: bool = True
    show_graph_nodes: bool = True
    show_population_legend: bool = True


class MapDisplayCityRenderRecord(BaseModel):
    color_mode: str = "commodity"
    uniform_fill_color: str = "#2d5a27"
    created_fill_color: str = "#4f8593"
    stroke_color: str = "#ffffff"
    contrast_fill_color: str = "#ffffff"
    selected_fill_color: str = "#8c4f10"
    selected_halo_fill_color: str = "#fff8ec"
    selected_halo_stroke_color: str = "#2d5a27"
    population_band_fill_colors: dict[str, str] = Field(default_factory=dict)
    opacity: float = Field(default=0.96, ge=0.2, le=1.0)


class MapDisplayRouteSurfaceStyleOverrideRecord(BaseModel):
    base_color: str | None = None
    overlay_color: str | None = None


class MapDisplayRouteRenderRecord(BaseModel):
    opacity_scale: float = Field(default=1.0, ge=0.25, le=1.4)
    highlight_color: str = "#2d5a27"
    selected_color: str = "#8c4f10"
    draft_color: str = "#2d5a27"
    highlight_overlay_color: str = "#fff9ea"
    selected_overlay_color: str = "#fff4dd"
    surface_style_overrides: dict[str, MapDisplayRouteSurfaceStyleOverrideRecord] = Field(default_factory=dict)


class MapDisplayGraphNodeRenderRecord(BaseModel):
    opacity: float = Field(default=0.98, ge=0.2, le=1.0)
    use_style_colors: bool = True
    override_fill_color: str = "#8c4f10"
    override_stroke_color: str = "#fff9ea"
    selected_halo_fill_color: str = "#fff8ec"
    selected_halo_stroke_color: str = "#2d5a27"


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


TruckImageStatus = Literal["generated", "failed", "skipped", "approved", "rejected"]
TruckImageReferenceAspect = Literal["cabine", "estilo"]


class TruckImagePromptOverrideRecord(BaseModel):
    truck_type_id: str = Field(min_length=1)
    preferred_body_type_id: str | None = None
    prompt_items: list[str] = Field(default_factory=list)
    reference_truck_type_id: str | None = None
    reference_aspects: list[TruckImageReferenceAspect] = Field(default_factory=list)
    extra_instructions: str = ""
    enabled: bool = True


class TruckImagePromptOverridesDocument(BaseModel):
    id: str = "truck_image_prompt_overrides_v1"
    overrides: list[TruckImagePromptOverrideRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_overrides(self) -> "TruckImagePromptOverridesDocument":
        ids = [item.truck_type_id for item in self.overrides]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada override de prompt precisa de um truck_type_id unico.")
        return self


class TruckImageAssetRecord(BaseModel):
    truck_type_id: str = Field(min_length=1)
    canonical_body_type_id: str = Field(min_length=1)
    status: TruckImageStatus = "skipped"
    prompt_items: list[str] = Field(default_factory=list)
    reference_truck_type_id: str | None = None
    reference_aspects: list[TruckImageReferenceAspect] = Field(default_factory=list)
    reference_image_rel_path: str | None = None
    reference_image_url_path: str | None = None
    prompt: str = Field(min_length=1)
    prompt_summary: str = Field(min_length=1)
    provider: str = "openai_gpt_image"
    requested_model: str | None = None
    used_model: str | None = None
    dry_run: bool = False
    approved_image_rel_path: str | None = None
    approved_image_url_path: str | None = None
    candidate_image_rel_path: str | None = None
    candidate_image_url_path: str | None = None
    manifest_rel_path: str | None = None
    output_format: str = "png"
    background: str = "transparent"
    width_px: int | None = Field(default=None, ge=1)
    height_px: int | None = Field(default=None, ge=1)
    generated_at: str | None = None
    reviewed_at: str | None = None
    approved_at: str | None = None
    updated_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    error_message: str | None = None


class TruckImageAssetRegistryDocument(BaseModel):
    id: str = "truck_image_asset_registry_v1"
    items: list[TruckImageAssetRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_assets(self) -> "TruckImageAssetRegistryDocument":
        ids = [item.truck_type_id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada truck_type_id precisa aparecer uma vez no registry de imagens.")
        return self


class TruckImageReviewQueueDocument(BaseModel):
    id: str = "truck_image_review_queue_v1"
    pending_type_ids: list[str] = Field(default_factory=list)
    last_reviewed_type_id: str | None = None
    updated_at: str | None = None


class TruckImageGenerateRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    prompt_items: list[str] = Field(default_factory=list)
    reference_truck_type_id: str | None = None
    reference_aspects: list[TruckImageReferenceAspect] = Field(default_factory=list)
    dry_run: bool = False
    force_regenerate: bool = False


class TruckImageGenerateResponse(BaseModel):
    asset: TruckImageAssetRecord
    review_queue: TruckImageReviewQueueDocument


class TruckImageReviewRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    decision: Literal["approved", "rejected"]


class TruckImageReviewResponse(BaseModel):
    asset: TruckImageAssetRecord
    review_queue: TruckImageReviewQueueDocument


class TruckCatalogEditRecord(BaseModel):
    truck_type_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    size_tier: str = Field(min_length=1)
    base_vehicle_kind: str = Field(min_length=1)
    axle_config: str = Field(min_length=1)
    preferred_body_type_id: str | None = None
    notes: str = ""
    updated_at: str = Field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_body_field(cls, data: Any) -> Any:
        if isinstance(data, dict) and not data.get("preferred_body_type_id") and data.get("canonical_body_type_id"):
            next_data = dict(data)
            next_data["preferred_body_type_id"] = str(data.get("canonical_body_type_id") or "").strip() or None
            return next_data
        return data


class TruckCatalogEditsDocument(BaseModel):
    id: str = "truck_catalog_edits_v1"
    items: list[TruckCatalogEditRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "TruckCatalogEditsDocument":
        ids = [item.truck_type_id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada edicao de catalogo precisa de um truck_type_id unico.")
        return self


class TruckCatalogClassificationRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    size_tier: str = Field(min_length=1)
    base_vehicle_kind: str = Field(min_length=1)
    axle_config: str = Field(min_length=1)
    preferred_body_type_id: str | None = None
    notes: str = ""


class TruckCatalogClassificationResponse(BaseModel):
    type_record: dict[str, Any]


class TruckCustomTypeRecord(BaseModel):
    id: str = Field(min_length=1)
    order: int = Field(ge=1)
    label: str = Field(min_length=1)
    short_label: str = Field(min_length=1)
    size_tier: str = Field(min_length=1)
    base_vehicle_kind: str = Field(min_length=1)
    axle_config: str = Field(min_length=1)
    canonical_body_type_ids: list[str] = Field(default_factory=list)
    preferred_body_type_id: str | None = None
    canonical_sprite_profile_id: str = "truck_sprite_custom"
    source_basis: str = "custom_manual"
    notes: str = ""
    is_custom: bool = True

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        next_data = dict(data)
        if not next_data.get("preferred_body_type_id") and next_data.get("canonical_body_type_id"):
            next_data["preferred_body_type_id"] = str(next_data.get("canonical_body_type_id") or "").strip() or None
        if not next_data.get("canonical_body_type_ids") and next_data.get("canonical_body_type_id"):
            next_data["canonical_body_type_ids"] = [str(next_data.get("canonical_body_type_id") or "").strip()]
        return next_data

    @model_validator(mode="after")
    def normalize_bodies(self) -> "TruckCustomTypeRecord":
        if self.preferred_body_type_id:
            self.canonical_body_type_ids = [self.preferred_body_type_id]
        if self.canonical_body_type_ids and not self.preferred_body_type_id:
            self.preferred_body_type_id = self.canonical_body_type_ids[0]
        return self


class TruckCustomCatalogDocument(BaseModel):
    id: str = "truck_custom_catalog_v1"
    items: list[TruckCustomTypeRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "TruckCustomCatalogDocument":
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada caminhao customizado precisa de um id unico.")
        return self


class TruckCustomCreateRequest(BaseModel):
    label: str = "Novo caminhÃ£o"


class TruckCustomCreateResponse(BaseModel):
    type_record: dict[str, Any]


class TruckCategoryOptionRecord(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)


class TruckCategoryCatalogDocument(BaseModel):
    id: str = "truck_category_catalog_v1"
    size_tiers: list[TruckCategoryOptionRecord] = Field(default_factory=list)
    base_vehicle_kinds: list[TruckCategoryOptionRecord] = Field(default_factory=list)
    axle_configs: list[TruckCategoryOptionRecord] = Field(default_factory=list)
    combination_kinds: list[TruckCategoryOptionRecord] = Field(default_factory=list)
    cargo_scopes: list[TruckCategoryOptionRecord] = Field(default_factory=list)


class TruckCategoryCreateRequest(BaseModel):
    group: Literal["axle_config", "canonical_body_type_id"]
    label: str = Field(min_length=1)


class TruckCategoryCreateResponse(BaseModel):
    group: str
    option: dict[str, Any]


class TruckCatalogHiddenDocument(BaseModel):
    id: str = "truck_catalog_hidden_v1"
    hidden_type_ids: list[str] = Field(default_factory=list)


class TruckDeleteRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)


class TruckDeleteResponse(BaseModel):
    truck_type_id: str


class TruckPromptBuildRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    size_tier: str = Field(min_length=1)
    base_vehicle_kind: str = Field(min_length=1)
    axle_config: str = Field(min_length=1)
    preferred_body_type_id: str = Field(min_length=1)
    notes: str = ""


class TruckPromptBuildResponse(BaseModel):
    prompt_items: list[str] = Field(default_factory=list)
    prompt_summary: str = ""


class TruckProductMatrixToggleRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    product_id: str = Field(min_length=1)


class TruckOperationalSaveRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)
    payload_weight_kg: int | float | None = Field(default=None, ge=0)
    cargo_volume_m3: int | float | None = Field(default=None, ge=0)
    overall_length_m: int | float | None = Field(default=None, ge=0)
    overall_width_m: int | float | None = Field(default=None, ge=0)
    overall_height_m: int | float | None = Field(default=None, ge=0)
    energy_source: str | None = None
    consumption_unit: str | None = None
    empty_consumption_per_km: int | float | None = Field(default=None, ge=0)
    loaded_consumption_per_km: int | float | None = Field(default=None, ge=0)
    truck_price_brl: int | float | None = Field(default=None, ge=0)
    base_fixed_cost_brl_per_day: int | float | None = Field(default=None, ge=0)
    base_variable_cost_brl_per_km: int | float | None = Field(default=None, ge=0)
    implement_cost_brl: int | float | None = Field(default=None, ge=0)
    urban_access_level: str | None = None
    road_access_level: str | None = None
    supported_surface_codes: list[str] = Field(default_factory=list)
    load_time_minutes: int | float | None = Field(default=None, ge=0)
    unload_time_minutes: int | float | None = Field(default=None, ge=0)
    confidence: str | None = None
    research_basis: str | None = None
    source_urls: list[str] = Field(default_factory=list)
    notes: str = ""


class TruckOperationalSaveResponse(BaseModel):
    type_record: dict[str, Any]
    operational_record: dict[str, Any]


class TruckOperationalAutofillRequest(BaseModel):
    truck_type_id: str = Field(min_length=1)


class TruckOperationalAutofillResponse(BaseModel):
    truck_type_id: str
    payload: dict[str, Any]
    summary: str = ""
    provider: str | None = None
    model: str | None = None


class TruckOperationalAutofillStatusResponse(BaseModel):
    truck_type_id: str
    status: Literal["idle", "queued", "running", "completed", "failed"] = "idle"
    message: str = ""
    summary: str = ""
    provider: str | None = None
    model: str | None = None
    error: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    started_at: str | None = None
    finished_at: str | None = None


class ProductEditorCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    emoji: str = "\U0001F4E6"
    family_id: str = Field(min_length=1)
    logistics_type_id: str = Field(min_length=1)
    unit: str = Field(min_length=1)
    source_product_id: str | None = None


class ProductMasterCreateRequest(BaseModel):
    map_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    emoji: str = "\U0001F4E6"
    family_id: str = Field(min_length=1)
    logistics_type_id: str = Field(min_length=1)
    status: Literal["visible", "hidden"] = "visible"
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class ProductEditorUpdateRequest(BaseModel):
    name: str | None = None
    short_name: str | None = None
    emoji: str | None = None
    family_id: str | None = None
    logistics_type_id: str | None = None
    unit: str | None = None
    color: str | None = None
    is_active: bool | None = None
    density_class: str | None = None
    value_class: str | None = None
    perishable: bool | None = None
    fragile: bool | None = None
    hazardous: bool | None = None
    temperature_control_required: bool | None = None
    notes: str | None = None


class ProductFieldLayerSaveRequest(BaseModel):
    map_id: str = Field(min_length=1)
    product_id: str = Field(min_length=1)
    layer: Literal["supply", "demand"]
    strokes: list[dict[str, Any]] = Field(default_factory=list)
    baked_city_values: list[dict[str, Any]] = Field(default_factory=list)
    updated_at: str | None = None


class DieselCostSaveRequest(BaseModel):
    map_id: str = Field(min_length=1)
    observations: list[dict[str, Any]] = Field(default_factory=list)
    overrides: list[dict[str, Any]] = Field(default_factory=list)
    updated_at: str | None = None


class DieselCostSaveResponse(BaseModel):
    document: dict[str, Any]


class ProductOperationalSaveRequest(BaseModel):
    product_id: str = Field(min_length=1)
    unit: str | None = None
    weight_per_unit_kg: int | float | None = Field(default=None, ge=0)
    volume_per_unit_m3: int | float | None = Field(default=None, ge=0)
    price_reference_brl_per_unit: int | float | None = Field(default=None, ge=0)
    price_min_brl_per_unit: int | float | None = Field(default=None, ge=0)
    price_max_brl_per_unit: int | float | None = Field(default=None, ge=0)
    is_seasonal: bool | None = None
    seasonality_index_jan: int | float | None = Field(default=None, ge=0)
    seasonality_index_feb: int | float | None = Field(default=None, ge=0)
    seasonality_index_mar: int | float | None = Field(default=None, ge=0)
    seasonality_index_apr: int | float | None = Field(default=None, ge=0)
    seasonality_index_may: int | float | None = Field(default=None, ge=0)
    seasonality_index_jun: int | float | None = Field(default=None, ge=0)
    seasonality_index_jul: int | float | None = Field(default=None, ge=0)
    seasonality_index_aug: int | float | None = Field(default=None, ge=0)
    seasonality_index_sep: int | float | None = Field(default=None, ge=0)
    seasonality_index_oct: int | float | None = Field(default=None, ge=0)
    seasonality_index_nov: int | float | None = Field(default=None, ge=0)
    seasonality_index_dec: int | float | None = Field(default=None, ge=0)
    confidence: str | None = None
    research_basis: str | None = None
    source_urls: list[str] = Field(default_factory=list)
    notes: str = ""


class ProductOperationalSaveResponse(BaseModel):
    product_record: dict[str, Any]
    operational_record: dict[str, Any]


class ProductOperationalAutofillRequest(BaseModel):
    product_id: str = Field(min_length=1)


class ProductOperationalAutofillResponse(BaseModel):
    product_id: str
    payload: dict[str, Any]
    summary: str = ""
    provider: str | None = None
    model: str | None = None


class ProductOperationalAutofillStatusResponse(BaseModel):
    product_id: str
    status: Literal["idle", "queued", "running", "completed", "failed"] = "idle"
    message: str = ""
    summary: str = ""
    provider: str | None = None
    model: str | None = None
    error: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    started_at: str | None = None
    finished_at: str | None = None

