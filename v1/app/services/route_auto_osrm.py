from __future__ import annotations

import gzip
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import ROUTE_AUTO_ENGINE_CONFIG_PATH, runtime_env
from app.maptools.models import RouteEdgeRecord
from app.services.data_loader import load_json


class AutoRouteError(RuntimeError):
    pass


@dataclass(slots=True)
class AutoRoutePreviewResult:
    engine: str
    profile_id: str
    surface_type_id: str
    resolution_km: int
    raw_point_count: int
    simplified_point_count: int
    distance_km: float
    edge: RouteEdgeRecord


def load_route_auto_engine_config() -> dict[str, Any]:
    return dict(load_json(ROUTE_AUTO_ENGINE_CONFIG_PATH))


def _content_bytes(response: Any) -> bytes:
    raw = response.read()
    if response.headers.get("Content-Encoding", "").lower() == "gzip":
        return gzip.decompress(raw)
    return raw


def _http_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": "Brasix/1.0 (+route-auto-osrm)",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(_content_bytes(response).decode("utf-8"))


def _haversine_km(point_a: tuple[float, float], point_b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, point_a)
    lat2, lon2 = map(math.radians, point_b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize_coordinate(value: float) -> float:
    return float(f"{float(value):.5f}")


def _simplify_route_points(points: list[tuple[float, float]], resolution_km: int) -> list[tuple[float, float]]:
    if len(points) <= 2 or resolution_km <= 1:
        return points

    simplified = [points[0]]
    last_kept = points[0]
    for point in points[1:-1]:
        if _haversine_km(last_kept, point) >= resolution_km:
            simplified.append(point)
            last_kept = point

    if simplified[-1] != points[-1]:
        simplified.append(points[-1])
    return simplified


def _surface_type_by_id(route_surface_types: list[dict[str, Any]], surface_type_id: str) -> dict[str, Any]:
    for item in route_surface_types:
        if item.get("id") == surface_type_id:
            return item
    raise AutoRouteError(f"Tipo de rota nao encontrado: {surface_type_id}.")


def _waypoint_payload(
    simplified_points: list[tuple[float, float]],
    from_endpoint: dict[str, Any],
    to_endpoint: dict[str, Any],
    timestamp: int,
) -> list[dict[str, Any]]:
    points = list(simplified_points)
    from_point = (float(from_endpoint["latitude"]), float(from_endpoint["longitude"]))
    to_point = (float(to_endpoint["latitude"]), float(to_endpoint["longitude"]))

    if points and _haversine_km(points[0], from_point) <= 0.05:
        points = points[1:]
    if points and _haversine_km(points[-1], to_point) <= 0.05:
        points = points[:-1]

    return [
        {
            "id": f"route_point_auto_{timestamp}_{index + 1}",
            "latitude": _normalize_coordinate(point[0]),
            "longitude": _normalize_coordinate(point[1]),
        }
        for index, point in enumerate(points)
    ]


def generate_auto_route_preview(
    endpoints_by_id: dict[str, dict[str, Any]],
    route_surface_types: list[dict[str, Any]],
    *,
    from_node_id: str,
    to_node_id: str,
    surface_type_id: str,
    resolution_km: int,
    city_ids: set[str] | None = None,
) -> AutoRoutePreviewResult:
    config = load_route_auto_engine_config()
    base_url = runtime_env(config.get("base_url_env", "BRASIX_OSRM_BASE_URL"), config.get("default_base_url", ""))
    if not base_url:
        raise AutoRouteError("Configure BRASIX_OSRM_BASE_URL para habilitar o roteamento automatico do v2.")

    if from_node_id == to_node_id:
        raise AutoRouteError("A rota automatica precisa ligar dois pontos diferentes.")

    from_endpoint = endpoints_by_id.get(from_node_id)
    to_endpoint = endpoints_by_id.get(to_node_id)
    if not from_endpoint or not to_endpoint:
        raise AutoRouteError("Os dois extremos da rota automatica precisam existir no mapa ativo.")

    profile_id = config.get("default_profile_id", "driving")
    surface_type = _surface_type_by_id(route_surface_types, surface_type_id)
    supported_surface_codes = set(config.get("supported_surface_codes", ["double_road", "single_road", "dirt_road"]))
    if surface_type.get("code") not in supported_surface_codes:
        raise AutoRouteError("No v2, o roteamento automatico so esta habilitado para rodovias 1, 2 e 3.")

    route_options = {
        "overview": config.get("request_options", {}).get("overview", "full"),
        "geometries": config.get("request_options", {}).get("geometries", "geojson"),
        "steps": str(bool(config.get("request_options", {}).get("steps", False))).lower(),
        "annotations": str(bool(config.get("request_options", {}).get("annotations", False))).lower(),
    }
    coordinates = (
        f"{float(from_endpoint['longitude'])},{float(from_endpoint['latitude'])};"
        f"{float(to_endpoint['longitude'])},{float(to_endpoint['latitude'])}"
    )
    url = (
        f"{base_url.rstrip('/')}/route/v1/{profile_id}/{coordinates}"
        f"?{urllib.parse.urlencode(route_options)}"
    )

    try:
        payload = _http_json(url)
    except urllib.error.URLError as exc:
        raise AutoRouteError(
            "Nao foi possivel consultar o OSRM. Verifique BRASIX_OSRM_BASE_URL e se o servidor esta no ar."
        ) from exc
    except json.JSONDecodeError as exc:
        raise AutoRouteError("O OSRM respondeu em um formato invalido para o Brasix.") from exc

    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise AutoRouteError(payload.get("message") or "O OSRM nao conseguiu gerar uma rota para esse par de cidades.")

    route = payload["routes"][0]
    raw_coordinates = route.get("geometry", {}).get("coordinates", [])
    if len(raw_coordinates) < 2:
        raise AutoRouteError("O OSRM retornou uma geometria vazia para essa rota.")

    raw_points = [(float(lat), float(lon)) for lon, lat in raw_coordinates]
    simplified_points = _simplify_route_points(raw_points, resolution_km)
    timestamp = int(time.time() * 1000)
    city_id_set = set(city_ids or [])
    edge = RouteEdgeRecord.model_validate(
        {
            "id": f"edge-auto-{from_node_id}-{to_node_id}-{timestamp}",
            "from_node_id": from_node_id,
            "to_node_id": to_node_id,
            "from_city_id": from_node_id if from_node_id in city_id_set else None,
            "to_city_id": to_node_id if to_node_id in city_id_set else None,
            "mode": surface_type.get("mode", "road"),
            "surface_type_id": surface_type["id"],
            "surface_code": surface_type.get("code", "single_road"),
            "geometry_type_id": "route_geometry_polycurve",
            "geometry_code": "polycurve",
            "render_smoothing_enabled": False,
            "status": "active",
            "bidirectional": True,
            "distance_km": float(route.get("distance", 0)) / 1000,
            "notes": f"Gerada automaticamente por OSRM com resolucao de {resolution_km} km no editor de mapa.",
            "waypoints": _waypoint_payload(simplified_points, from_endpoint, to_endpoint, timestamp),
        }
    )

    return AutoRoutePreviewResult(
        engine=config.get("provider", "osrm"),
        profile_id=profile_id,
        surface_type_id=surface_type["id"],
        resolution_km=resolution_km,
        raw_point_count=len(raw_points),
        simplified_point_count=len(simplified_points),
        distance_km=float(edge.distance_km or 0),
        edge=edge,
    )
