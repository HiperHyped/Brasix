from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


RouteMode = Literal["road", "rail", "river", "sea", "air", "custom"]
RouteStatus = Literal["planned", "active", "blocked"]
RouteSurfaceCode = Literal["double_road", "single_road", "dirt_road", "waterway"]
RouteGeometryCode = Literal["straight", "polycurve"]
RouteGraphNodeKind = Literal["junction"]
RouteGraphNodePlacementMode = Literal["free", "snapped_route"]


class RouteWaypointRecord(BaseModel):
    id: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteGraphNodeRecord(BaseModel):
    id: str
    label: str
    node_kind: RouteGraphNodeKind = "junction"
    placement_mode: RouteGraphNodePlacementMode = "free"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    style_id: str = "graph_node_style_junction_diamond"
    size_px: int | None = Field(default=None, ge=10, le=48)
    snapped_from_edge_id: str | None = None
    notes: str = ""


class RouteEdgeRecord(BaseModel):
    id: str
    from_node_id: str | None = None
    to_node_id: str | None = None
    from_city_id: str | None = None
    to_city_id: str | None = None
    mode: RouteMode = "road"
    surface_type_id: str = "route_surface_single_road"
    surface_code: RouteSurfaceCode = "single_road"
    geometry_type_id: str = "route_geometry_polycurve"
    geometry_code: RouteGeometryCode = "polycurve"
    render_smoothing_enabled: bool = True
    status: RouteStatus = "planned"
    bidirectional: bool = True
    distance_km: float | None = Field(default=None, ge=0)
    notes: str = ""
    waypoints: list[RouteWaypointRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_endpoints(self) -> "RouteEdgeRecord":
        if not self.from_node_id and self.from_city_id:
            self.from_node_id = self.from_city_id
        if not self.to_node_id and self.to_city_id:
            self.to_node_id = self.to_city_id
        if not self.from_node_id or not self.to_node_id:
            raise ValueError("Cada rota precisa informar origem e destino.")
        if self.from_node_id == self.to_node_id:
            raise ValueError("A rota precisa ligar dois nos diferentes.")
        return self


class RouteWorkspaceSnapshot(BaseModel):
    id: str = "route_network_brasix_v1"
    version: int = 3
    nodes: list[RouteGraphNodeRecord] = Field(default_factory=list)
    edges: list[RouteEdgeRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_edges(self) -> "RouteWorkspaceSnapshot":
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Cada no do grafo precisa de um id unico.")
        edge_ids = [edge.id for edge in self.edges]
        if len(edge_ids) != len(set(edge_ids)):
            raise ValueError("Cada rota precisa de um id unico.")
        return self
