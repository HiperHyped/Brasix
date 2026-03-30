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


def test_route_graph_can_optimize_for_fastest_time() -> None:
    cities = [
        _city("a", -10.0, -50.0),
        _city("b", -11.0, -51.0),
        _city("c", -12.0, -52.0),
    ]
    edges = [
        RouteEdgeRecord(
            id="edge-ab",
            from_city_id="a",
            to_city_id="b",
            surface_type_id="route_surface_dirt_road",
            surface_code="dirt_road",
            distance_km=40.0,
        ),
        RouteEdgeRecord(
            id="edge-bc",
            from_city_id="b",
            to_city_id="c",
            surface_type_id="route_surface_dirt_road",
            surface_code="dirt_road",
            distance_km=40.0,
        ),
        RouteEdgeRecord(
            id="edge-ac",
            from_city_id="a",
            to_city_id="c",
            surface_type_id="route_surface_double_road",
            surface_code="double_road",
            distance_km=90.0,
        ),
    ]
    surface_types = [
        {"id": "route_surface_double_road", "average_speed_kmh": 100},
        {"id": "route_surface_dirt_road", "average_speed_kmh": 40},
    ]

    graph = RouteGraph(cities, edges, surface_types=surface_types)
    path = graph.shortest_path("a", "c", route_mode="fastest")

    assert path.node_ids == ["a", "c"]
    assert path.edge_ids == ["edge-ac"]
    assert path.distance_km == 90.0
    assert path.duration_hours == 0.9
