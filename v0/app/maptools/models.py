from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


RouteMode = Literal["road", "rail", "river", "sea", "air", "custom"]
RouteStatus = Literal["planned", "active", "blocked"]


class RouteEdgeRecord(BaseModel):
    id: str
    from_city_id: str
    to_city_id: str
    mode: RouteMode = "road"
    status: RouteStatus = "planned"
    distance_km: float | None = Field(default=None, ge=0)
    notes: str = ""


class RouteWorkspaceSnapshot(BaseModel):
    edges: list[RouteEdgeRecord] = Field(default_factory=list)
