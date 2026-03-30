from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.maptools import RouteEdgeRecord, RouteGraph, RouteGraphNodeRecord


class RoutePlannerError(RuntimeError):
    pass


@dataclass(frozen=True)
class RoutePlannerStep:
    sequence: int
    edge_id: str
    from_node_id: str
    to_node_id: str
    from_label: str
    to_label: str
    distance_km: float
    duration_hours: float
    surface_type_id: str
    surface_code: str
    surface_label: str
    surface_shortcut_key: str


@dataclass(frozen=True)
class RoutePlannerLeg:
    index: int
    start_node_id: str
    end_node_id: str
    start_label: str
    end_label: str
    distance_km: float
    duration_hours: float
    node_ids: list[str]
    edge_ids: list[str]
    steps: list[RoutePlannerStep]


@dataclass(frozen=True)
class RoutePlannerPlan:
    route_mode: str
    node_ids: list[str]
    edge_ids: list[str]
    total_distance_km: float
    total_duration_hours: float
    total_steps: int
    legs: list[RoutePlannerLeg]


def build_route_plan(
    cities: list[Any],
    graph_nodes: list[RouteGraphNodeRecord],
    edges: list[RouteEdgeRecord],
    route_surface_types: list[dict[str, Any]],
    *,
    route_mode: str = "shortest",
    origin_node_id: str,
    destination_node_id: str,
    stop_node_ids: list[str] | None = None,
) -> RoutePlannerPlan:
    itinerary = [origin_node_id, *(stop_node_ids or []), destination_node_id]
    if len(itinerary) < 2:
        raise RoutePlannerError("Defina origem e destino para calcular a rota.")

    for left, right in zip(itinerary, itinerary[1:], strict=False):
        if left == right:
            raise RoutePlannerError("Dois pontos consecutivos da rota nao podem ser iguais.")

    graph = RouteGraph(cities, edges, graph_nodes, route_surface_types)
    allowed_node_ids = set(graph.nodes_by_id)
    invalid_node_ids = [node_id for node_id in itinerary if node_id not in allowed_node_ids]
    if invalid_node_ids:
        raise RoutePlannerError(
            f"Os pontos selecionados precisam existir no mapa ativo: {', '.join(invalid_node_ids)}."
        )

    surface_types_by_id = {item["id"]: item for item in route_surface_types}
    all_node_ids: list[str] = []
    all_edge_ids: list[str] = []
    total_distance_km = 0.0
    total_duration_hours = 0.0
    total_steps = 0
    legs: list[RoutePlannerLeg] = []

    for leg_index, (start_node_id, end_node_id) in enumerate(zip(itinerary, itinerary[1:], strict=False), start=1):
        try:
            path = graph.shortest_path(start_city_id=start_node_id, end_city_id=end_node_id, route_mode=route_mode)
        except ValueError as exc:
            raise RoutePlannerError(str(exc)) from exc

        steps: list[RoutePlannerStep] = []
        for step_index, edge_id in enumerate(path.edge_ids, start=1):
            from_node_id = path.node_ids[step_index - 1]
            to_node_id = path.node_ids[step_index]
            edge = graph.edge_record(edge_id)
            surface_type = surface_types_by_id.get(edge.surface_type_id, {})
            step = RoutePlannerStep(
                sequence=step_index,
                edge_id=edge_id,
                from_node_id=from_node_id,
                to_node_id=to_node_id,
                from_label=graph.node_label(from_node_id),
                to_label=graph.node_label(to_node_id),
                distance_km=round(graph.edge_distance_km(edge_id), 1),
                duration_hours=round(graph.edge_duration_hours(edge_id), 2),
                surface_type_id=edge.surface_type_id,
                surface_code=edge.surface_code,
                surface_label=surface_type.get("label", edge.surface_type_id),
                surface_shortcut_key=str(surface_type.get("shortcut_key", "")),
            )
            steps.append(step)

        leg = RoutePlannerLeg(
            index=leg_index,
            start_node_id=start_node_id,
            end_node_id=end_node_id,
            start_label=graph.node_label(start_node_id),
            end_label=graph.node_label(end_node_id),
            distance_km=round(path.distance_km, 1),
            duration_hours=round(path.duration_hours, 2),
            node_ids=path.node_ids,
            edge_ids=path.edge_ids,
            steps=steps,
        )
        legs.append(leg)
        total_distance_km += path.distance_km
        total_duration_hours += path.duration_hours
        total_steps += len(path.edge_ids)
        if all_node_ids:
            all_node_ids.extend(path.node_ids[1:])
        else:
            all_node_ids.extend(path.node_ids)
        all_edge_ids.extend(path.edge_ids)

    return RoutePlannerPlan(
        route_mode=route_mode,
        node_ids=all_node_ids,
        edge_ids=all_edge_ids,
        total_distance_km=round(total_distance_km, 1),
        total_duration_hours=round(total_duration_hours, 2),
        total_steps=total_steps,
        legs=legs,
    )
