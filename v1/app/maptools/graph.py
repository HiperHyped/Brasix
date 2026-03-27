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
        self.adjacency: dict[str, list[tuple[str, RouteEdgeRecord, float]]] = {
            node_id: [] for node_id in self.nodes_by_id
        }
        for edge in self.edges:
            distance = edge.distance_km or self._geometry_distance_km(edge)
            self.adjacency[edge.from_node_id].append((edge.to_node_id, edge, distance))
            if edge.bidirectional:
                self.adjacency[edge.to_node_id].append((edge.from_node_id, edge, distance))

    def shortest_path(self, start_city_id: str, end_city_id: str) -> RoutePath:
        if start_city_id not in self.nodes_by_id or end_city_id not in self.nodes_by_id:
            raise ValueError("No de origem ou destino nao encontrado.")
        if start_city_id == end_city_id:
            return RoutePath(node_ids=[start_city_id], edge_ids=[], distance_km=0.0)
        if not self.edges:
            raise ValueError("Nenhuma rota foi definida ainda.")

        distances: dict[str, float] = {start_city_id: 0.0}
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
                candidate = current_distance + edge_distance
                if candidate >= distances.get(neighbor_id, math.inf):
                    continue
                distances[neighbor_id] = candidate
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
        return RoutePath(node_ids=node_ids, edge_ids=edge_ids, distance_km=round(distances[end_city_id], 1))

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
