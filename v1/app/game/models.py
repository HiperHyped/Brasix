from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


IssueSeverity = Literal["error", "warning"]


class GameWorldValidationIssue(BaseModel):
    severity: IssueSeverity
    code: str
    message: str
    path: str | None = None


class GameWorldValidationReport(BaseModel):
    valid: bool = True
    error_count: int = 0
    warning_count: int = 0
    issues: list[GameWorldValidationIssue] = Field(default_factory=list)


class GameWorldSourceSummary(BaseModel):
    active_map_id: str
    active_map_name: str
    route_network_id: str
    product_catalog_id: str
    product_family_catalog_id: str
    product_logistics_type_catalog_id: str
    supply_matrix_id: str
    demand_matrix_id: str
    region_supply_matrix_id: str
    truck_type_catalog_id: str
    truck_body_catalog_id: str
    truck_category_catalog_id: str


class GameWorldMetadata(BaseModel):
    generated_at: str
    package_version: str = "v1"
    build_source: str = "brasix_v1_authored"
    map_id: str
    map_name: str
    city_count: int = Field(ge=0)
    route_edge_count: int = Field(ge=0)
    route_graph_node_count: int = Field(ge=0)
    product_count: int = Field(ge=0)
    active_product_count: int = Field(ge=0)
    truck_type_count: int = Field(ge=0)
    active_truck_type_count: int = Field(ge=0)


class GameWorldMapSnapshot(BaseModel):
    active_map_id: str
    active_map_name: str
    cities: list[dict[str, Any]] = Field(default_factory=list)
    route_network: dict[str, Any] = Field(default_factory=dict)
    city_count: int = Field(ge=0)
    graph_node_count: int = Field(ge=0)
    edge_count: int = Field(ge=0)


class GameWorldProductSnapshot(BaseModel):
    catalog: dict[str, Any] = Field(default_factory=dict)
    family_catalog: dict[str, Any] = Field(default_factory=dict)
    logistics_type_catalog: dict[str, Any] = Field(default_factory=dict)
    supply_matrix: dict[str, Any] = Field(default_factory=dict)
    demand_matrix: dict[str, Any] = Field(default_factory=dict)
    region_supply_matrix: dict[str, Any] = Field(default_factory=dict)
    inference_rules: dict[str, Any] = Field(default_factory=dict)
    product_ids: list[str] = Field(default_factory=list)
    active_product_ids: list[str] = Field(default_factory=list)
    product_count: int = Field(ge=0)


class GameWorldTruckSnapshot(BaseModel):
    type_catalog: dict[str, Any] = Field(default_factory=dict)
    body_catalog: dict[str, Any] = Field(default_factory=dict)
    category_catalog: dict[str, Any] = Field(default_factory=dict)
    truck_type_ids: list[str] = Field(default_factory=list)
    active_truck_type_ids: list[str] = Field(default_factory=list)
    body_type_ids: list[str] = Field(default_factory=list)
    truck_type_count: int = Field(ge=0)


class GameWorldCatalogSnapshot(BaseModel):
    city_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)
    product_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)
    product_family_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)
    product_logistics_type_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)
    truck_body_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)
    truck_type_by_id: dict[str, dict[str, Any]] = Field(default_factory=dict)


class GameWorldRuntimeDocument(BaseModel):
    id: str = "game_world_runtime_v1"
    version: int = 1
    metadata: GameWorldMetadata
    source_summary: GameWorldSourceSummary
    map: GameWorldMapSnapshot
    products: GameWorldProductSnapshot
    trucks: GameWorldTruckSnapshot
    catalogs: GameWorldCatalogSnapshot
    validation: GameWorldValidationReport = Field(default_factory=GameWorldValidationReport)