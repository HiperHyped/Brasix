from __future__ import annotations

import heapq
import math
from dataclasses import dataclass

from app.domain import City
from app.maptools.models import RouteEdgeRecord


@dataclass(frozen=True)
class RoutePath:
    city_ids: list[str]
    edge_ids: list[str]
    distance_km: float

    @property
    def steps(self) -> int:
        return len(self.edge_ids)


class RouteGraph:
    def __init__(self, cities: list[City], edges: list[RouteEdgeRecord]) -> None:
        self.cities_by_id = {city.id: city for city in cities}
        self.edges = [edge for edge in edges if edge.from_city_id in self.cities_by_id and edge.to_city_id in self.cities_by_id]
        self.adjacency: dict[str, list[tuple[str, RouteEdgeRecord, float]]] = {city.id: [] for city in cities}
        for edge in self.edges:
            distance = edge.distance_km or self._geo_distance_km(edge.from_city_id, edge.to_city_id)
            self.adjacency[edge.from_city_id].append((edge.to_city_id, edge, distance))
            self.adjacency[edge.to_city_id].append((edge.from_city_id, edge, distance))

    def shortest_path(self, start_city_id: str, end_city_id: str) -> RoutePath:
        if start_city_id not in self.cities_by_id or end_city_id not in self.cities_by_id:
            raise ValueError("Cidade de origem ou destino nao encontrada.")
        if start_city_id == end_city_id:
            return RoutePath(city_ids=[start_city_id], edge_ids=[], distance_km=0.0)
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

        city_ids: list[str] = []
        edge_ids: list[str] = []
        cursor: str | None = end_city_id
        while cursor is not None:
            city_ids.append(cursor)
            edge_id = previous_edge.get(cursor)
            if edge_id:
                edge_ids.append(edge_id)
            cursor = previous_city.get(cursor)

        city_ids.reverse()
        edge_ids.reverse()
        return RoutePath(city_ids=city_ids, edge_ids=edge_ids, distance_km=round(distances[end_city_id], 1))

    def _geo_distance_km(self, from_city_id: str, to_city_id: str) -> float:
        left = self.cities_by_id[from_city_id]
        right = self.cities_by_id[to_city_id]
        return _haversine_km(left.latitude, left.longitude, right.latitude, right.longitude)


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
