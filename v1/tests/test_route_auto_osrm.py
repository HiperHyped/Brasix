from __future__ import annotations

from app.services import route_auto_osrm


def test_generate_auto_route_preview_builds_edge(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "http://127.0.0.1:5000")
    monkeypatch.setattr(
        route_auto_osrm,
        "_http_json",
        lambda _url: {
            "code": "Ok",
            "routes": [
                {
                    "distance": 123400,
                    "geometry": {
                        "coordinates": [
                            [-49.10, -16.70],
                            [-49.00, -16.60],
                            [-48.80, -16.20],
                            [-48.70, -15.90],
                        ]
                    },
                }
            ],
        },
    )

    result = route_auto_osrm.generate_auto_route_preview(
        {
            "city_a": {"id": "city_a", "latitude": -16.70, "longitude": -49.10},
            "city_b": {"id": "city_b", "latitude": -15.90, "longitude": -48.70},
        },
        [
            {
                "id": "route_surface_single_road",
                "code": "single_road",
                "mode": "road",
            }
        ],
        from_node_id="city_a",
        to_node_id="city_b",
        surface_type_id="route_surface_single_road",
        resolution_km=20,
        city_ids={"city_a", "city_b"},
    )

    assert result.engine == "osrm"
    assert result.edge.from_node_id == "city_a"
    assert result.edge.to_node_id == "city_b"
    assert result.edge.surface_code == "single_road"
    assert result.edge.geometry_code == "polycurve"
    assert result.raw_point_count == 4
    assert result.simplified_point_count >= 2
    assert result.distance_km == 123.4


def test_generate_auto_route_preview_rejects_manual_only_surfaces(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "http://127.0.0.1:5000")
    try:
        route_auto_osrm.generate_auto_route_preview(
            {
                "city_a": {"id": "city_a", "latitude": -16.70, "longitude": -49.10},
                "city_b": {"id": "city_b", "latitude": -15.90, "longitude": -48.70},
            },
            [
                {
                    "id": "route_surface_railway",
                    "code": "railway",
                    "mode": "rail",
                }
            ],
            from_node_id="city_a",
            to_node_id="city_b",
            surface_type_id="route_surface_railway",
            resolution_km=20,
            city_ids={"city_a", "city_b"},
        )
    except route_auto_osrm.AutoRouteError as exc:
        assert "1, 2 e 3" in str(exc)
    else:
        raise AssertionError("Expected AutoRouteError for manual-only surface")


def test_generate_auto_route_preview_accepts_city_to_graph_node(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "http://127.0.0.1:5000")
    monkeypatch.setattr(
        route_auto_osrm,
        "_http_json",
        lambda _url: {
            "code": "Ok",
            "routes": [
                {
                    "distance": 42100,
                    "geometry": {
                        "coordinates": [
                            [-49.10, -16.70],
                            [-49.03, -16.61],
                            [-48.98, -16.54],
                        ]
                    },
                }
            ],
        },
    )

    result = route_auto_osrm.generate_auto_route_preview(
        {
            "city_a": {"id": "city_a", "latitude": -16.70, "longitude": -49.10},
            "graph_node_1": {"id": "graph_node_1", "latitude": -16.54, "longitude": -48.98},
        },
        [
            {
                "id": "route_surface_double_road",
                "code": "double_road",
                "mode": "road",
            }
        ],
        from_node_id="city_a",
        to_node_id="graph_node_1",
        surface_type_id="route_surface_double_road",
        resolution_km=20,
        city_ids={"city_a"},
    )

    assert result.edge.from_node_id == "city_a"
    assert result.edge.to_node_id == "graph_node_1"
    assert result.edge.from_city_id == "city_a"
    assert result.edge.to_city_id is None
    assert result.edge.surface_code == "double_road"
