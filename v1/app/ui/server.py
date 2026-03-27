from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import MAP_DISPLAY_SETTINGS_PATH, MAP_EDITOR_POPULATION_BANDS_PATH, MAP_LEAFLET_SETTINGS_PATH, STATIC_DIR, TEMPLATE_DIR
from app.maptools import RouteGraph, RouteWorkspaceSnapshot
from app.services import (
    build_reference_data_from_city_catalog_payload,
    build_user_city_catalog_payload,
    create_map_bundle,
    delete_map_bundle,
    load_city_catalog_payload,
    load_city_product_matrix_payload,
    load_active_map_bundle,
    load_map_editor_payload,
    load_map_viewport_payload,
    load_maps_registry,
    load_product_catalog_payload,
    load_reference_data,
    load_ui_payload,
    map_repository_payload,
    save_active_map,
    save_active_map_as,
    save_map_bundle,
    save_json,
    set_active_map,
)
from app.services.openai_city_autofill import CityAutofillError, autofill_custom_city
from app.ui.editor_models import (
    CityAutofillRequest,
    CityAutofillResponse,
    CustomCityCatalogDocument,
    MapCityCatalogDocument,
    MapActivateRequest,
    MapCreateRequest,
    MapDisplaySettingsDocument,
    MapLeafletSettingsDocument,
    MapSaveRequest,
    PopulationBandDocument,
)


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
    active_map = load_active_map_bundle()
    city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
    city_catalog.sort(key=lambda item: item["label"])
    reference_data = build_reference_data_from_city_catalog_payload(city_catalog)
    route_snapshot = active_map.route_network
    products = load_product_catalog_payload()
    products.sort(key=lambda item: (item["category"], item["name"]))
    city_product_matrix = load_city_product_matrix_payload()
    routes = [edge.model_dump(mode="json") for edge in route_snapshot.edges]
    states = sorted({city["state_code"] for city in city_catalog})
    city_payload = [_city_payload(city, reference_data) for city in reference_data.cities.values()]
    city_payload.sort(key=lambda item: item["label"])

    return {
        "ui": load_ui_payload(),
        "map_editor": load_map_editor_payload(
            user_city_catalog=build_user_city_catalog_payload(city_catalog),
        ),
        "map_repository": map_repository_payload(),
        "cities": city_catalog,
        "products": products,
        "city_product_matrix": city_product_matrix,
        "routes": routes,
        "route_network": route_snapshot.model_dump(mode="json"),
        "map_viewport": load_map_viewport_payload(),
        "summary": {
            "city_count": len(city_catalog),
            "product_count": len(products),
            "route_count": len(routes),
            "graph_node_count": len(route_snapshot.nodes),
            "states": states,
        },
        "derived": {
            "cities": city_payload,
            "products": [asdict(item) for item in reference_data.commodities.values()],
            "map_config": asdict(reference_data.map_config),
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

    @app.get("/editor/map", response_class=HTMLResponse, include_in_schema=False)
    async def map_editor(request: Request) -> HTMLResponse:
        active_map = load_active_map_bundle()
        editor_ui = load_map_editor_payload(
            user_city_catalog=build_user_city_catalog_payload(
                [city.model_dump(mode="json") for city in active_map.cities],
            ),
        )
        return templates.TemplateResponse(
            request=request,
            name="map_editor.html",
            context={"page_title": editor_ui["screen"].get("page_title", "Brasix | Editor de mapa")},
        )

    @app.get("/api/health")
    async def healthcheck() -> dict[str, Any]:
        payload = _build_bootstrap_payload()
        return {
            "status": "ok",
            "service": "brasix",
            "cities": payload["summary"]["city_count"],
            "products": payload["summary"]["product_count"],
            "routes": payload["summary"]["route_count"],
        }

    @app.get("/api/bootstrap")
    async def bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.get("/api/editor/map/bootstrap")
    async def map_editor_bootstrap() -> dict[str, Any]:
        return _build_bootstrap_payload()

    @app.put("/api/editor/map/population-bands")
    async def save_population_bands(document: PopulationBandDocument) -> dict[str, Any]:
        editor_payload = load_map_editor_payload()
        pin_ids = {pin["id"] for pin in editor_payload["pin_library"].get("pins", [])}
        invalid_pin_ids = sorted({band.pin_id for band in document.bands if band.pin_id not in pin_ids})
        if invalid_pin_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Pins nao encontrados na biblioteca: {', '.join(invalid_pin_ids)}.",
            )

        payload = document.model_dump(mode="json")
        payload["bands"] = sorted(
            payload["bands"],
            key=lambda band: (band["legend_order"], band["min_population_thousands"]),
        )
        return save_json(MAP_EDITOR_POPULATION_BANDS_PATH, payload)

    @app.put("/api/editor/map/display-settings")
    async def save_display_settings(document: MapDisplaySettingsDocument) -> dict[str, Any]:
        return save_json(MAP_DISPLAY_SETTINGS_PATH, document.model_dump(mode="json"))

    @app.put("/api/editor/map/custom-cities")
    async def save_custom_cities(document: CustomCityCatalogDocument) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        graph_node_ids = {node.id for node in active_map.route_network.nodes}
        duplicate_city_ids = sorted({city.id for city in document.cities if city.id in graph_node_ids})
        if duplicate_city_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de cidades nao podem repetir ids de nos de ligacao: {', '.join(duplicate_city_ids)}.",
            )

        base_cities = [city for city in active_map.cities if not city.is_user_created]
        active_map.cities = sorted(
            [*base_cities, *document.cities],
            key=lambda city: city.label,
        )
        save_map_bundle(active_map)
        payload = document.model_dump(mode="json")
        payload["cities"] = sorted(payload["cities"], key=lambda city: city["label"])
        return payload

    @app.put("/api/editor/map/cities")
    async def save_map_cities(document: MapCityCatalogDocument) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        graph_node_ids = {node.id for node in active_map.route_network.nodes}
        duplicate_city_ids = sorted({city.id for city in document.cities if city.id in graph_node_ids})
        if duplicate_city_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de cidades nao podem repetir ids de nos de ligacao: {', '.join(duplicate_city_ids)}.",
            )

        if active_map.id == "map_brasix_default":
            protected_base_cities = [city for city in active_map.cities if not city.is_user_created]
            editable_cities = [city for city in document.cities if city.is_user_created]
            active_map.cities = sorted([*protected_base_cities, *editable_cities], key=lambda city: city.label)
        else:
            active_map.cities = sorted(document.cities, key=lambda city: city.label)

        save_map_bundle(active_map)
        return {
            "id": document.id,
            "cities": [city.model_dump(mode="json") for city in active_map.cities],
        }

    @app.post("/api/editor/map/custom-cities/autofill", response_model=CityAutofillResponse)
    async def autofill_custom_city_payload(document: CityAutofillRequest) -> CityAutofillResponse:
        if not document.city.is_user_created:
            raise HTTPException(status_code=400, detail="O autofill so pode ser usado em cidades criadas no editor.")

        try:
            autofilled_city = autofill_custom_city(document.city)
        except CityAutofillError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return CityAutofillResponse(city=autofilled_city)

    @app.put("/api/editor/map/leaflet-settings")
    async def save_leaflet_settings(document: MapLeafletSettingsDocument) -> dict[str, Any]:
        viewport_payload = load_map_viewport_payload()
        tile_layer_ids = {item["id"] for item in viewport_payload.get("tile_layers", [])}
        if document.base_tile_layer_id not in tile_layer_ids:
            raise HTTPException(status_code=400, detail="Camada base do Leaflet nao encontrada.")
        if document.label_tile_layer_id and document.label_tile_layer_id not in tile_layer_ids:
            raise HTTPException(status_code=400, detail="Camada de labels do Leaflet nao encontrada.")
        return save_json(MAP_LEAFLET_SETTINGS_PATH, document.model_dump(mode="json"))

    @app.put("/api/editor/map/route-network")
    async def save_route_network(snapshot: RouteWorkspaceSnapshot) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        city_ids = {city.id for city in active_map.cities}
        graph_node_ids = {node.id for node in snapshot.nodes}
        duplicate_node_ids = sorted(city_ids & graph_node_ids)
        if duplicate_node_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Os ids de nos do grafo nao podem repetir ids de cidades: {', '.join(duplicate_node_ids)}.",
            )

        editor_payload = load_map_editor_payload()
        valid_style_ids = {item["id"] for item in editor_payload["graph_node_styles"].get("styles", [])}
        invalid_style_ids = sorted({node.style_id for node in snapshot.nodes if node.style_id not in valid_style_ids})
        if invalid_style_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Estilos de no nao encontrados na biblioteca: {', '.join(invalid_style_ids)}.",
            )

        allowed_node_ids = city_ids | graph_node_ids
        invalid_edges = sorted(
            edge.id
            for edge in snapshot.edges
            if edge.from_node_id not in allowed_node_ids or edge.to_node_id not in allowed_node_ids
        )
        if invalid_edges:
            raise HTTPException(
                status_code=400,
                detail=f"As rotas precisam ligar apenas cidades ou nos do grafo conhecidos: {', '.join(invalid_edges)}.",
            )

        active_map.route_network = snapshot
        save_map_bundle(active_map)
        return snapshot.model_dump(mode="json")

    @app.get("/api/editor/maps")
    async def editor_maps() -> dict[str, Any]:
        return map_repository_payload()

    @app.post("/api/editor/maps/new")
    async def create_editor_map(request: MapCreateRequest) -> dict[str, Any]:
        registry, bundle = create_map_bundle(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.post("/api/editor/maps/save")
    async def save_editor_map(request: MapSaveRequest) -> dict[str, Any]:
        registry, bundle = save_active_map(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.post("/api/editor/maps/save-as")
    async def save_editor_map_as(request: MapSaveRequest) -> dict[str, Any]:
        registry, bundle = save_active_map_as(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.put("/api/editor/maps/active")
    async def activate_editor_map(request: MapActivateRequest) -> dict[str, Any]:
        registry, bundle = set_active_map(request)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": next(item.model_dump(mode="json") for item in registry.maps if item.id == registry.active_map_id),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
            "active_map": {
                "id": bundle.id,
                "name": bundle.name,
                "slug": bundle.slug,
            },
        }

    @app.delete("/api/editor/maps/{map_id}")
    async def delete_editor_map(map_id: str) -> dict[str, Any]:
        try:
            registry = delete_map_bundle(map_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        active_entry = next(item for item in registry.maps if item.id == registry.active_map_id)
        return {
            "map_repository": {
                "id": registry.id,
                "active_map_id": registry.active_map_id,
                "active_map": active_entry.model_dump(mode="json"),
                "maps": [item.model_dump(mode="json") for item in registry.maps],
            },
        }

    @app.get("/api/routes/path")
    async def route_path(
        start_city_id: str = Query(min_length=1),
        end_city_id: str = Query(min_length=1),
    ) -> dict[str, Any]:
        active_map = load_active_map_bundle()
        city_catalog = [city.model_dump(mode="json") for city in active_map.cities]
        reference_data = build_reference_data_from_city_catalog_payload(city_catalog)
        graph = RouteGraph(list(reference_data.cities.values()), active_map.route_network.edges, active_map.route_network.nodes)

        try:
            path = graph.shortest_path(start_city_id=start_city_id, end_city_id=end_city_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "node_ids": path.node_ids,
            "city_ids": path.city_ids,
            "edge_ids": path.edge_ids,
            "distance_km": path.distance_km,
            "steps": path.steps,
        }

    return app
