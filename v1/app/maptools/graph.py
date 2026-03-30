from __future__ import annotations

import heapq
import math
from dataclasses import dataclass

from app.domain import City
from app.maptools.models import RouteEdgeRecord, RouteGraphNodeRecord


@dataclass(frozen=True)
class RoutePath:
    node_ids: list[str]
    edge_ids: list[str]
    distance_km: float
    duration_hours: float

    @property
    def steps(self) -> int:
        return len(self.edge_ids)

    @property
    def city_ids(self) -> list[str]:
        return self.node_ids


@dataclass(frozen=True)
class _NetworkNode:
    id: str
    label: str
    latitude: float
    longitude: float


class RouteGraph:
    def __init__(
        self,
        cities: list[City],
        edges: list[RouteEdgeRecord],
        graph_nodes: list[RouteGraphNodeRecord] | None = None,
        surface_types: list[dict[str, object]] | None = None,
    ) -> None:
        self.nodes_by_id: dict[str, _NetworkNode] = {
            city.id: _NetworkNode(
                id=city.id,
                label=city.label,
                latitude=city.latitude,
                longitude=city.longitude,
            )
            for city in cities
        }
        for node in graph_nodes or []:
            self.nodes_by_id[node.id] = _NetworkNode(
                id=node.id,
                label=node.label,
                latitude=node.latitude,
                longitude=node.longitude,
            )
        self.edges = [
            edge
            for edge in edges
            if edge.from_node_id in self.nodes_by_id and edge.to_node_id in self.nodes_by_id
        ]
        self.edges_by_id: dict[str, RouteEdgeRecord] = {edge.id: edge for edge in self.edges}
        self.adjacency: dict[str, list[tuple[str, RouteEdgeRecord, float]]] = {
            node_id: [] for node_id in self.nodes_by_id
        }
        self.edge_distance_by_id: dict[str, float] = {}
        self.edge_duration_by_id: dict[str, float] = {}
        self.surface_speed_kmh_by_id: dict[str, float] = {}
        for surface_type in surface_types or []:
            speed = surface_type.get("average_speed_kmh")
            if isinstance(speed, (int, float)) and speed > 0:
                self.surface_speed_kmh_by_id[str(surface_type.get("id"))] = float(speed)
        for edge in self.edges:
            distance = edge.distance_km or self._geometry_distance_km(edge)
            self.edge_distance_by_id[edge.id] = distance
            self.edge_duration_by_id[edge.id] = self._edge_duration_hours(edge, distance)
            self.adjacency[edge.from_node_id].append((edge.to_node_id, edge, distance))
            if edge.bidirectional:
                self.adjacency[edge.to_node_id].append((edge.from_node_id, edge, distance))

    def shortest_path(
        self,
        start_city_id: str,
        end_city_id: str,
        *,
        route_mode: str = "shortest",
    ) -> RoutePath:
        if start_city_id not in self.nodes_by_id or end_city_id not in self.nodes_by_id:
            raise ValueError("No de origem ou destino nao encontrado.")
        if start_city_id == end_city_id:
            return RoutePath(node_ids=[start_city_id], edge_ids=[], distance_km=0.0, duration_hours=0.0)
        if not self.edges:
            raise ValueError("Nenhuma rota foi definida ainda.")
        if route_mode not in {"shortest", "fastest"}:
            raise ValueError("Modo de rota invalido.")

        distances: dict[str, float] = {start_city_id: 0.0}
        durations: dict[str, float] = {start_city_id: 0.0}
        previous_city: dict[str, str | None] = {start_city_id: None}
        previous_edge: dict[str, str | None] = {start_city_id: None}
        queue: list[tuple[float, str]] = [(0.0, start_city_id)]

        while queue:
            current_distance, current_city = heapq.heappop(queue)
            if current_city == end_city_id:
                break
            if current_distance > distances.get(current_city, math.inf):
                continue

            for neighbor_id, edge, edge_distance in self.adjacency.get(current_city, []):
                edge_duration = self.edge_duration_by_id[edge.id]
                candidate_distance = distances[current_city] + edge_distance
                candidate_duration = durations[current_city] + edge_duration
                candidate = candidate_duration if route_mode == "fastest" else candidate_distance
                best = durations.get(neighbor_id, math.inf) if route_mode == "fastest" else distances.get(neighbor_id, math.inf)
                if candidate >= best:
                    continue
                distances[neighbor_id] = candidate_distance
                durations[neighbor_id] = candidate_duration
                previous_city[neighbor_id] = current_city
                previous_edge[neighbor_id] = edge.id
                heapq.heappush(queue, (candidate, neighbor_id))

        if end_city_id not in distances:
            raise ValueError("Nao existe caminho entre as cidades selecionadas.")

        node_ids: list[str] = []
        edge_ids: list[str] = []
        cursor: str | None = end_city_id
        while cursor is not None:
            node_ids.append(cursor)
            edge_id = previous_edge.get(cursor)
            if edge_id:
                edge_ids.append(edge_id)
            cursor = previous_city.get(cursor)

        node_ids.reverse()
        edge_ids.reverse()
        total_distance_km = round(sum(self.edge_distance_by_id[edge_id] for edge_id in edge_ids), 1)
        total_duration_hours = round(sum(self.edge_duration_by_id[edge_id] for edge_id in edge_ids), 2)
        return RoutePath(
            node_ids=node_ids,
            edge_ids=edge_ids,
            distance_km=total_distance_km,
            duration_hours=total_duration_hours,
        )

    def node_label(self, node_id: str) -> str:
        return self.nodes_by_id[node_id].label

    def edge_record(self, edge_id: str) -> RouteEdgeRecord:
        return self.edges_by_id[edge_id]

    def edge_distance_km(self, edge_id: str) -> float:
        return self.edge_distance_by_id[edge_id]

    def edge_duration_hours(self, edge_id: str) -> float:
        return self.edge_duration_by_id[edge_id]

    def _geometry_distance_km(self, edge: RouteEdgeRecord) -> float:
        points = self._edge_points(edge)
        return round(
            sum(
                _haversine_km(
                    points[index][0],
                    points[index][1],
                    points[index + 1][0],
                    points[index + 1][1],
                )
                for index in range(len(points) - 1)
            ),
            1,
        )

    def _edge_points(self, edge: RouteEdgeRecord) -> list[tuple[float, float]]:
        from_node = self.nodes_by_id[edge.from_node_id]
        to_node = self.nodes_by_id[edge.to_node_id]
        waypoints = [(waypoint.latitude, waypoint.longitude) for waypoint in edge.waypoints]
        return [(from_node.latitude, from_node.longitude), *waypoints, (to_node.latitude, to_node.longitude)]

    def _edge_duration_hours(self, edge: RouteEdgeRecord, distance_km: float) -> float:
        speed_kmh = self.surface_speed_kmh_by_id.get(edge.surface_type_id)
        if not speed_kmh or speed_kmh <= 0:
            speed_kmh = 50.0
        return distance_km / speed_kmh


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c
