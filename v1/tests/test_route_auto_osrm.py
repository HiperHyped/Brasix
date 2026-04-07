from __future__ import annotations

import urllib.error

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


def test_generate_auto_route_preview_falls_back_when_osrm_times_out(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.example")

    attempts = {"count": 0}

    def failing_request(_url):
        attempts["count"] += 1
        raise urllib.error.HTTPError(_url, 504, "Gateway Timeout", hdrs=None, fp=None)

    monkeypatch.setattr(route_auto_osrm, "_http_json", failing_request)
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

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

    assert attempts["count"] == 2
    assert result.engine == "osrm fallback"
    assert result.edge.from_node_id == "city_a"
    assert result.edge.to_node_id == "city_b"
    assert result.edge.waypoints == []
    assert result.distance_km > 0
    assert "linha reta" in str(result.edge.notes)


def test_generate_auto_route_preview_retries_before_success(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.example")

    attempts = {"count": 0}

    def flaky_request(_url):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise urllib.error.HTTPError(_url, 504, "Gateway Timeout", hdrs=None, fp=None)
        return {
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
        }

    monkeypatch.setattr(route_auto_osrm, "_http_json", flaky_request)
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

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

    assert attempts["count"] == 2
    assert result.engine == "osrm"


def test_generate_auto_route_preview_falls_back_when_socket_read_times_out(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.example")

    attempts = {"count": 0}

    def failing_request(_url):
        attempts["count"] += 1
        raise TimeoutError("The read operation timed out")

    monkeypatch.setattr(route_auto_osrm, "_http_json", failing_request)
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

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

    assert attempts["count"] == 2
    assert result.engine == "osrm fallback"
    assert result.edge.from_node_id == "city_a"
    assert result.edge.to_node_id == "city_b"


def test_generate_auto_route_preview_tries_local_when_public_timeout_occurs(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.project-osrm.org")
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

    requested_urls: list[str] = []

    def request_by_url(url):
        requested_urls.append(url)
        if url.startswith("https://router.project-osrm.org/"):
            raise TimeoutError("The read operation timed out")
        if url.startswith("http://127.0.0.1:5000/"):
            return {
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
            }
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(route_auto_osrm, "_http_json", request_by_url)

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

    assert requested_urls[0].startswith("https://router.project-osrm.org/")
    assert requested_urls[-1].startswith("http://127.0.0.1:5000/")
    assert result.engine == "osrm"


def test_generate_auto_route_preview_tries_local_when_public_demo_fails(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.project-osrm.org")
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

    requested_urls: list[str] = []

    def request_by_url(url):
        requested_urls.append(url)
        if url.startswith("https://router.project-osrm.org/"):
            raise urllib.error.HTTPError(url, 504, "Gateway Timeout", hdrs=None, fp=None)
        if url.startswith("http://127.0.0.1:5000/"):
            return {
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
            }
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(route_auto_osrm, "_http_json", request_by_url)

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

    assert requested_urls[0].startswith("https://router.project-osrm.org/")
    assert requested_urls[-1].startswith("http://127.0.0.1:5000/")
    assert result.engine == "osrm"


def test_generate_auto_route_preview_public_demo_error_is_explicit(monkeypatch):
    monkeypatch.setattr(route_auto_osrm, "runtime_env", lambda *_args, **_kwargs: "https://router.project-osrm.org")
    monkeypatch.setattr(route_auto_osrm.time, "sleep", lambda *_args, **_kwargs: None)

    config = route_auto_osrm.load_route_auto_engine_config()
    config["linear_fallback_enabled"] = False
    monkeypatch.setattr(route_auto_osrm, "load_route_auto_engine_config", lambda: config)

    def failing_request(url):
        raise urllib.error.HTTPError(url, 504, "Gateway Timeout", hdrs=None, fp=None)

    monkeypatch.setattr(route_auto_osrm, "_http_json", failing_request)

    try:
        route_auto_osrm.generate_auto_route_preview(
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
    except route_auto_osrm.AutoRouteError as exc:
        assert "demo publico" in str(exc)
        assert "127.0.0.1:5000" in str(exc)
    else:
        raise AssertionError("Expected AutoRouteError when the public demo fails and fallback is disabled")
