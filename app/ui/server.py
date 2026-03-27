from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import STATIC_DIR, TEMPLATE_DIR
from app.maptools import RouteGraph, RouteWorkspaceRepository
from app.services import load_reference_data


def _city_payload(city: Any, reference_data: Any) -> dict[str, Any]:
    top_items = sorted(city.commodity_values.items(), key=lambda item: item[1], reverse=True)
    top_commodities = [
        {
            "id": commodity_id,
            "name": reference_data.commodities[commodity_id].name,
            "icon": reference_data.commodities[commodity_id].icon,
            "unit": reference_data.commodities[commodity_id].unit,
            "color": reference_data.commodities[commodity_id].color,
            "value": value,
        }
        for commodity_id, value in top_items[:5]
        if commodity_id in reference_data.commodities and value > 0
    ]

    return {
        "id": city.id,
        "name": city.name,
        "label": city.label,
        "state_code": city.state_code,
        "state_name": city.state_name,
        "source_region_name": city.source_region_name,
        "population_thousands": city.population_thousands,
        "latitude": city.latitude,
        "longitude": city.longitude,
        "commodity_values": city.commodity_values,
        "commodity_count": len([value for value in city.commodity_values.values() if value > 0]),
        "dominant_commodity_id": city.dominant_commodity_id,
        "top_commodities": top_commodities,
    }


def _build_bootstrap_payload() -> dict[str, Any]:
    reference_data = load_reference_data()
    route_repository = RouteWorkspaceRepository()
    cities = [_city_payload(city, reference_data) for city in reference_data.cities.values()]
    cities.sort(key=lambda item: item["label"])

    commodities = [asdict(item) for item in reference_data.commodities.values()]
    commodities.sort(key=lambda item: (item["category"], item["name"]))

    routes = [edge.model_dump(mode="json") for edge in route_repository.load_edges()]
    states = sorted({city["state_code"] for city in cities})

    return {
        "commodities": commodities,
        "cities": cities,
        "routes": routes,
        "map_config": asdict(reference_data.map_config),
        "summary": {
            "city_count": len(cities),
            "commodity_count": len(commodities),
            "route_count": len(routes),
            "states": states,
        },
    }


def create_app() -> FastAPI:
    app = FastAPI(title="Brasix")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def index(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={"page_title": "Brasix | Cidades e Commodities"},
        )

    @app.get("/api/health")
    async def healthcheck() -> dict[str, Any]:
        payload = _build_bootstrap_payload()
        return {
            "status": "ok",
            "service": "brasix",
            "cities": payload["summary"]["city_count"],
            "commodities": payload["summary"]["commodity_count"],
            "routes": payload["summary"]["route_count"],
        }

    @app.get("/api/bootstrap")
    async def bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.get("/api/routes/path")
    async def route_path(
        start_city_id: str = Query(min_length=1),
        end_city_id: str = Query(min_length=1),
    ) -> dict[str, Any]:
        reference_data = load_reference_data()
        route_repository = RouteWorkspaceRepository()
        graph = RouteGraph(list(reference_data.cities.values()), route_repository.load_edges())

        try:
            path = graph.shortest_path(start_city_id=start_city_id, end_city_id=end_city_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "city_ids": path.city_ids,
            "edge_ids": path.edge_ids,
            "distance_km": path.distance_km,
            "steps": path.steps,
        }

    return app
