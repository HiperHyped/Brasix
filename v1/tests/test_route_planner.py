from __future__ import annotations

from app.domain import City
from app.maptools import RouteEdgeRecord, RouteGraphNodeRecord
from app.services.route_planner import build_route_plan


def test_build_route_plan_supports_multiple_legs_and_step_details():
    cities = [
        City(
            id="city_a",
            name="Cidade A",
            label="Cidade A, AA",
            state_code="AA",
            state_name="Estado A",
            source_region_name="Regiao A",
            population_thousands=100,
            latitude=-10.0,
            longitude=-50.0,
            commodity_values={},
            dominant_commodity_id=None,
        ),
        City(
            id="city_b",
            name="Cidade B",
            label="Cidade B, BB",
            state_code="BB",
            state_name="Estado B",
            source_region_name="Regiao B",
            population_thousands=120,
            latitude=-10.3,
            longitude=-49.4,
            commodity_values={},
            dominant_commodity_id=None,
        ),
        City(
            id="city_c",
            name="Cidade C",
            label="Cidade C, CC",
            state_code="CC",
            state_name="Estado C",
            source_region_name="Regiao C",
            population_thousands=140,
            latitude=-10.8,
            longitude=-48.8,
            commodity_values={},
            dominant_commodity_id=None,
        ),
    ]
    graph_nodes = [
        RouteGraphNodeRecord(
            id="graph_node_1",
            label="Ligacao 01",
            latitude=-10.1,
            longitude=-49.8,
        ),
    ]
    edges = [
        RouteEdgeRecord(
            id="edge_a_1",
            from_node_id="city_a",
            to_node_id="graph_node_1",
            surface_type_id="route_surface_double_road",
            surface_code="double_road",
            distance_km=22,
        ),
        RouteEdgeRecord(
            id="edge_1_b",
            from_node_id="graph_node_1",
            to_node_id="city_b",
            surface_type_id="route_surface_dirt_road",
            surface_code="dirt_road",
            distance_km=11,
        ),
        RouteEdgeRecord(
            id="edge_b_c",
            from_node_id="city_b",
            to_node_id="city_c",
            surface_type_id="route_surface_railway",
            surface_code="railway",
            mode="rail",
            distance_km=31,
        ),
    ]
    route_surface_types = [
        {"id": "route_surface_double_road", "label": "Rodovia dupla", "shortcut_key": "1", "average_speed_kmh": 100},
        {"id": "route_surface_dirt_road", "label": "Rodovia de terra", "shortcut_key": "3", "average_speed_kmh": 40},
        {"id": "route_surface_railway", "label": "Ferrovia", "shortcut_key": "5", "average_speed_kmh": 50},
    ]

    plan = build_route_plan(
        cities,
        graph_nodes,
        edges,
        route_surface_types,
        origin_node_id="city_a",
        destination_node_id="city_c",
        stop_node_ids=["city_b"],
    )

    assert plan.total_distance_km == 64
    assert plan.total_duration_hours == 1.11
    assert plan.total_steps == 3
    assert plan.node_ids == ["city_a", "graph_node_1", "city_b", "city_c"]
    assert plan.edge_ids == ["edge_a_1", "edge_1_b", "edge_b_c"]
    assert len(plan.legs) == 2
    assert plan.legs[0].steps[0].surface_label == "Rodovia dupla"
    assert plan.legs[0].steps[1].surface_label == "Rodovia de terra"
    assert plan.legs[1].steps[0].surface_label == "Ferrovia"
    assert plan.legs[0].duration_hours == 0.49
    assert plan.legs[1].duration_hours == 0.62


def test_build_route_plan_can_optimize_for_fastest_mode():
    cities = [
        City(
            id="city_a",
            name="Cidade A",
            label="Cidade A, AA",
            state_code="AA",
            state_name="Estado A",
            source_region_name="Regiao A",
            population_thousands=100,
            latitude=-10.0,
            longitude=-50.0,
            commodity_values={},
            dominant_commodity_id=None,
        ),
        City(
            id="city_b",
            name="Cidade B",
            label="Cidade B, BB",
            state_code="BB",
            state_name="Estado B",
            source_region_name="Regiao B",
            population_thousands=120,
            latitude=-10.3,
            longitude=-49.4,
            commodity_values={},
            dominant_commodity_id=None,
        ),
        City(
            id="city_c",
            name="Cidade C",
            label="Cidade C, CC",
            state_code="CC",
            state_name="Estado C",
            source_region_name="Regiao C",
            population_thousands=140,
            latitude=-10.8,
            longitude=-48.8,
            commodity_values={},
            dominant_commodity_id=None,
        ),
    ]
    edges = [
        RouteEdgeRecord(
            id="edge_a_b",
            from_node_id="city_a",
            to_node_id="city_b",
            surface_type_id="route_surface_dirt_road",
            surface_code="dirt_road",
            distance_km=40,
        ),
        RouteEdgeRecord(
            id="edge_b_c",
            from_node_id="city_b",
            to_node_id="city_c",
            surface_type_id="route_surface_dirt_road",
            surface_code="dirt_road",
            distance_km=40,
        ),
        RouteEdgeRecord(
            id="edge_a_c",
            from_node_id="city_a",
            to_node_id="city_c",
            surface_type_id="route_surface_double_road",
            surface_code="double_road",
            distance_km=90,
        ),
    ]
    route_surface_types = [
        {"id": "route_surface_double_road", "label": "Rodovia dupla", "shortcut_key": "1", "average_speed_kmh": 100},
        {"id": "route_surface_dirt_road", "label": "Rodovia de terra", "shortcut_key": "3", "average_speed_kmh": 40},
    ]

    plan = build_route_plan(
        cities,
        [],
        edges,
        route_surface_types,
        route_mode="fastest",
        origin_node_id="city_a",
        destination_node_id="city_c",
    )

    assert plan.route_mode == "fastest"
    assert plan.edge_ids == ["edge_a_c"]
    assert plan.total_distance_km == 90
    assert plan.total_duration_hours == 0.9
