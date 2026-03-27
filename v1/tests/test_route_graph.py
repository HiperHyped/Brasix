from __future__ import annotations

from app.domain import City
from app.maptools import RouteEdgeRecord, RouteGraph, RouteGraphNodeRecord


def _city(city_id: str, lat: float, lon: float) -> City:
    return City(
        id=city_id,
        name=city_id.upper(),
        label=city_id.upper(),
        state_code="TS",
        state_name="Teste",
        source_region_name="Teste",
        population_thousands=100.0,
        latitude=lat,
        longitude=lon,
        commodity_values={},
        dominant_commodity_id=None,
    )


def test_route_graph_prefers_shorter_distance() -> None:
    cities = [
        _city("a", -10.0, -50.0),
        _city("b", -11.0, -51.0),
        _city("c", -12.0, -52.0),
    ]
    edges = [
        RouteEdgeRecord(id="edge-ab", from_city_id="a", to_city_id="b", distance_km=10.0),
        RouteEdgeRecord(id="edge-bc", from_city_id="b", to_city_id="c", distance_km=10.0),
        RouteEdgeRecord(id="edge-ac", from_city_id="a", to_city_id="c", distance_km=30.0),
    ]

    graph = RouteGraph(cities, edges)
    path = graph.shortest_path("a", "c")

    assert path.city_ids == ["a", "b", "c"]
    assert path.edge_ids == ["edge-ab", "edge-bc"]
    assert path.distance_km == 20.0


def test_route_graph_can_cross_junction_nodes() -> None:
    cities = [
        _city("a", -10.0, -50.0),
        _city("c", -12.0, -52.0),
    ]
    graph_nodes = [
        RouteGraphNodeRecord(
            id="junction-1",
            label="Ligacao 01",
            latitude=-11.0,
            longitude=-51.0,
        ),
    ]
    edges = [
        RouteEdgeRecord(id="edge-a-j1", from_node_id="a", to_node_id="junction-1", distance_km=9.0),
        RouteEdgeRecord(id="edge-j1-c", from_node_id="junction-1", to_node_id="c", distance_km=11.0),
    ]

    graph = RouteGraph(cities, edges, graph_nodes)
    path = graph.shortest_path("a", "c")

    assert path.node_ids == ["a", "junction-1", "c"]
    assert path.edge_ids == ["edge-a-j1", "edge-j1-c"]
    assert path.distance_km == 20.0
