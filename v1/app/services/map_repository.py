from __future__ import annotations

import json
import re
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path

from app.config import CITY_CATALOG_PATH, CITY_USER_CATALOG_PATH, MAPS_DIR, MAPS_REGISTRY_PATH, ROUTE_NETWORK_PATH
from app.maptools.models import RouteGraphNodeRecord, RouteWorkspaceSnapshot
from app.ui.editor_models import (
    MapActivateRequest,
    MapBundleDocument,
    MapCityRecord,
    MapCreateRequest,
    MapRegistryDocument,
    MapRegistryEntryRecord,
    MapSaveRequest,
    MapSourceOptionsRecord,
)


DEFAULT_MAP_ID = "map_brasix_default"
DEFAULT_MAP_NAME = "Brasix Base"
DEFAULT_MAP_SLUG = "brasix-base"


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only.lower()).strip("-")
    return cleaned or "mapa"


def _bundle_path_for_map_id(map_id: str) -> Path:
    return MAPS_DIR / map_id / "map_bundle.json"


def _entry_for_bundle(bundle: MapBundleDocument) -> MapRegistryEntryRecord:
    return MapRegistryEntryRecord(
        id=bundle.id,
        name=bundle.name,
        slug=bundle.slug,
        description=bundle.description,
        created_at=bundle.created_at,
        updated_at=bundle.updated_at,
        path=str(_bundle_path_for_map_id(bundle.id).relative_to(MAPS_DIR.parent)).replace("\\", "/"),
        city_count=len(bundle.cities),
        route_count=len(bundle.route_network.edges),
        graph_node_count=len(bundle.route_network.nodes),
    )


def _base_cities_payload() -> list[dict]:
    return list(_load_json(CITY_CATALOG_PATH))


def _created_cities_payload() -> list[dict]:
    if not CITY_USER_CATALOG_PATH.exists():
        return []
    payload = _load_json(CITY_USER_CATALOG_PATH)
    if isinstance(payload, dict):
        return list(payload.get("cities", []))
    return list(payload)


def _route_snapshot_payload() -> RouteWorkspaceSnapshot:
    if not ROUTE_NETWORK_PATH.exists():
        return RouteWorkspaceSnapshot()
    return RouteWorkspaceSnapshot.model_validate(_load_json(ROUTE_NETWORK_PATH))


def _build_default_bundle() -> MapBundleDocument:
    cities = [
        MapCityRecord.model_validate({**city, "is_user_created": bool(city.get("is_user_created", False))})
        for city in (_base_cities_payload() + _created_cities_payload())
    ]
    cities.sort(key=lambda item: item.label)
    snapshot = _route_snapshot_payload()
    now = _timestamp()
    return MapBundleDocument(
        id=DEFAULT_MAP_ID,
        name=DEFAULT_MAP_NAME,
        slug=DEFAULT_MAP_SLUG,
        description="Mapa inicial migrado do v1 atual.",
        created_at=now,
        updated_at=now,
        source_options=MapSourceOptionsRecord(
            include_base_cities=True,
            include_created_cities=True,
            include_routes=True,
            include_graph_nodes=True,
        ),
        cities=cities,
        route_network=snapshot,
    )


def ensure_map_repository() -> MapRegistryDocument:
    MAPS_DIR.mkdir(parents=True, exist_ok=True)
    if MAPS_REGISTRY_PATH.exists():
        registry = MapRegistryDocument.model_validate(_load_json(MAPS_REGISTRY_PATH))
        for entry in registry.maps:
            bundle_path = MAPS_DIR.parent / Path(entry.path)
            if not bundle_path.exists():
                raise FileNotFoundError(f"Bundle do mapa nao encontrado: {bundle_path}")
        return registry

    bundle = _build_default_bundle()
    bundle_path = _bundle_path_for_map_id(bundle.id)
    _save_json(bundle_path, bundle.model_dump(mode="json"))
    registry = MapRegistryDocument(
        active_map_id=bundle.id,
        maps=[_entry_for_bundle(bundle)],
    )
    save_maps_registry(registry)
    return registry


def load_maps_registry() -> MapRegistryDocument:
    return ensure_map_repository()


def save_maps_registry(registry: MapRegistryDocument) -> MapRegistryDocument:
    _save_json(MAPS_REGISTRY_PATH, registry.model_dump(mode="json"))
    return registry


def load_map_bundle(map_id: str) -> MapBundleDocument:
    registry = load_maps_registry()
    entry = next((item for item in registry.maps if item.id == map_id), None)
    if entry is None:
        raise KeyError(f"Mapa nao encontrado: {map_id}")
    bundle_path = MAPS_DIR.parent / Path(entry.path)
    return MapBundleDocument.model_validate(_load_json(bundle_path))


def load_active_map_bundle() -> MapBundleDocument:
    registry = load_maps_registry()
    return load_map_bundle(registry.active_map_id)


def _update_registry_entry_for_bundle(bundle: MapBundleDocument) -> MapRegistryDocument:
    registry = load_maps_registry()
    updated_maps: list[MapRegistryEntryRecord] = []
    replaced = False
    for entry in registry.maps:
        if entry.id == bundle.id:
            updated_maps.append(_entry_for_bundle(bundle))
            replaced = True
        else:
            updated_maps.append(entry)
    if not replaced:
        updated_maps.append(_entry_for_bundle(bundle))
    registry.maps = updated_maps
    save_maps_registry(registry)
    return registry


def save_map_bundle(bundle: MapBundleDocument) -> MapBundleDocument:
    bundle.updated_at = _timestamp()
    bundle_path = _bundle_path_for_map_id(bundle.id)
    _save_json(bundle_path, bundle.model_dump(mode="json"))
    _update_registry_entry_for_bundle(bundle)
    return bundle


def set_active_map(map_request: MapActivateRequest) -> tuple[MapRegistryDocument, MapBundleDocument]:
    registry = load_maps_registry()
    entry = next((item for item in registry.maps if item.id == map_request.map_id), None)
    if entry is None:
        raise KeyError(f"Mapa nao encontrado: {map_request.map_id}")
    registry.active_map_id = entry.id
    save_maps_registry(registry)
    return registry, load_map_bundle(entry.id)


def _unique_map_identity(name: str, existing_ids: set[str], existing_slugs: set[str]) -> tuple[str, str]:
    base_slug = _slugify(name)
    slug = base_slug
    map_id = f"map_{slug}"
    suffix = 2
    while map_id in existing_ids or slug in existing_slugs:
        slug = f"{base_slug}-{suffix}"
        map_id = f"map_{slug}"
        suffix += 1
    return map_id, slug


def _filter_graph_nodes_for_new_map(
    snapshot: RouteWorkspaceSnapshot,
    include_routes: bool,
    include_graph_nodes: bool,
    city_ids: set[str],
) -> list[RouteGraphNodeRecord]:
    if not snapshot.nodes:
        return []

    referenced_node_ids = {
        endpoint_id
        for edge in snapshot.edges
        for endpoint_id in (edge.from_node_id, edge.to_node_id)
        if endpoint_id and endpoint_id not in city_ids
    }

    if include_routes:
        nodes: list[RouteGraphNodeRecord] = [node for node in snapshot.nodes if node.id in referenced_node_ids]
        if include_graph_nodes:
            extra_nodes = [
                node
                for node in snapshot.nodes
                if node.id not in referenced_node_ids and node.placement_mode == "free"
            ]
            nodes.extend(extra_nodes)
        return nodes

    if not include_graph_nodes:
        return []

    return [node for node in snapshot.nodes if node.placement_mode == "free"]


def create_map_bundle(request: MapCreateRequest) -> tuple[MapRegistryDocument, MapBundleDocument]:
    registry = load_maps_registry()
    active_bundle = load_active_map_bundle()
    existing_ids = {item.id for item in registry.maps}
    existing_slugs = {item.slug for item in registry.maps}
    map_id, slug = _unique_map_identity(request.name, existing_ids, existing_slugs)

    cities: list[MapCityRecord] = []
    if request.options.include_base_cities:
        cities.extend(
            MapCityRecord.model_validate({**city, "is_user_created": False})
            for city in _base_cities_payload()
        )
    if request.options.include_created_cities:
        cities.extend(
            MapCityRecord.model_validate(city.model_dump(mode="json"))
            for city in active_bundle.cities
            if city.is_user_created
        )

    unique_cities: dict[str, MapCityRecord] = {city.id: city for city in cities}
    sorted_cities = sorted(unique_cities.values(), key=lambda item: item.label)
    city_ids = {city.id for city in sorted_cities}

    source_snapshot = active_bundle.route_network
    edges = list(source_snapshot.edges) if request.options.include_routes else []
    nodes = _filter_graph_nodes_for_new_map(
        source_snapshot,
        include_routes=request.options.include_routes,
        include_graph_nodes=request.options.include_graph_nodes,
        city_ids=city_ids,
    )

    if request.options.include_routes:
        valid_node_ids = city_ids | {node.id for node in nodes}
        edges = [
            edge
            for edge in edges
            if edge.from_node_id in valid_node_ids and edge.to_node_id in valid_node_ids
        ]

    now = _timestamp()
    bundle = MapBundleDocument(
        id=map_id,
        name=request.name.strip(),
        slug=slug,
        description=request.description.strip(),
        created_at=now,
        updated_at=now,
        source_options=request.options,
        cities=sorted_cities,
        route_network=RouteWorkspaceSnapshot(
            id=f"route_network_{map_id}",
            version=source_snapshot.version,
            nodes=nodes,
            edges=edges,
        ),
    )

    save_map_bundle(bundle)
    registry = load_maps_registry()
    registry.active_map_id = bundle.id
    save_maps_registry(registry)
    return registry, bundle


def save_active_map(request: MapSaveRequest) -> tuple[MapRegistryDocument, MapBundleDocument]:
    bundle = load_active_map_bundle()
    if request.name:
        bundle.name = request.name.strip()
    if request.description is not None:
        bundle.description = request.description.strip()
    save_map_bundle(bundle)
    return load_maps_registry(), bundle


def save_active_map_as(request: MapSaveRequest) -> tuple[MapRegistryDocument, MapBundleDocument]:
    source_bundle = load_active_map_bundle()
    registry = load_maps_registry()
    existing_ids = {item.id for item in registry.maps}
    existing_slugs = {item.slug for item in registry.maps}
    target_name = (request.name or f"{source_bundle.name} copia").strip()
    map_id, slug = _unique_map_identity(target_name, existing_ids, existing_slugs)
    now = _timestamp()
    bundle = MapBundleDocument(
        id=map_id,
        name=target_name,
        slug=slug,
        description=request.description.strip() if request.description is not None else source_bundle.description,
        created_at=now,
        updated_at=now,
        source_options=source_bundle.source_options,
        cities=[MapCityRecord.model_validate(city.model_dump(mode="json")) for city in source_bundle.cities],
        route_network=RouteWorkspaceSnapshot.model_validate(source_bundle.route_network.model_dump(mode="json")),
    )
    save_map_bundle(bundle)
    registry = load_maps_registry()
    registry.active_map_id = bundle.id
    save_maps_registry(registry)
    return registry, bundle


def delete_map_bundle(map_id: str) -> MapRegistryDocument:
    registry = load_maps_registry()
    if map_id == DEFAULT_MAP_ID:
        raise ValueError("O mapa base nao pode ser excluido.")

    entry = next((item for item in registry.maps if item.id == map_id), None)
    if entry is None:
        raise KeyError(f"Mapa nao encontrado: {map_id}")

    bundle_dir = _bundle_path_for_map_id(map_id).parent
    if bundle_dir.exists():
        shutil.rmtree(bundle_dir)

    remaining_maps = [item for item in registry.maps if item.id != map_id]
    if not remaining_maps:
        raise ValueError("O repositorio precisa manter pelo menos um mapa.")

    registry.maps = remaining_maps
    if registry.active_map_id == map_id:
        fallback_entry = next((item for item in remaining_maps if item.id == DEFAULT_MAP_ID), remaining_maps[0])
        registry.active_map_id = fallback_entry.id
    save_maps_registry(registry)
    return registry


def map_repository_payload() -> dict:
    registry = load_maps_registry()
    active_entry = next(item for item in registry.maps if item.id == registry.active_map_id)
    return {
        "id": registry.id,
        "active_map_id": registry.active_map_id,
        "active_map": active_entry.model_dump(mode="json"),
        "maps": [item.model_dump(mode="json") for item in registry.maps],
    }
