from __future__ import annotations

from typing import Any

from app.game.models import GameWorldRuntimeDocument, GameWorldValidationIssue, GameWorldValidationReport
from app.maptools import RouteGraph, RouteWorkspaceSnapshot
from app.services import build_reference_data_from_city_catalog_payload


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalized_text(value: Any) -> str:
    return _text(value).casefold()


def _issue(
    issues: list[GameWorldValidationIssue],
    severity: str,
    code: str,
    message: str,
    *,
    path: str | None = None,
) -> None:
    issues.append(
        GameWorldValidationIssue(
            severity=severity,
            code=code,
            message=message,
            path=path,
        )
    )


def _duplicate_ids(items: list[dict[str, Any]], key: str = "id") -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in items:
        value = _text(item.get(key))
        if not value:
            continue
        if value in seen:
            duplicates.add(value)
            continue
        seen.add(value)
    return duplicates


def _validate_positive_value(
    issues: list[GameWorldValidationIssue],
    *,
    matrix_name: str,
    item_ref: str,
    value: Any,
    path: str,
) -> None:
    if value is None or _text(value) == "":
        _issue(
            issues,
            "error",
            f"{matrix_name}_missing_value",
            f"A matriz {matrix_name} possui item sem valor numerico.",
            path=path,
        )
        return

    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        _issue(
            issues,
            "error",
            f"{matrix_name}_invalid_value",
            f"A matriz {matrix_name} possui valor invalido no item {item_ref}: {value}.",
            path=path,
        )
        return

    if numeric_value <= 0:
        _issue(
            issues,
            "error",
            f"{matrix_name}_non_positive_value",
            f"A matriz {matrix_name} possui valor nao positivo no item {item_ref}: {numeric_value}.",
            path=path,
        )


def _validate_matrix_items(
    issues: list[GameWorldValidationIssue],
    *,
    matrix_name: str,
    matrix_payload: dict[str, Any],
    valid_city_ids: set[str],
    valid_product_ids: set[str],
) -> None:
    items = list(matrix_payload.get("items", []))
    seen_pairs: set[tuple[str, str]] = set()

    for duplicate_id in sorted(_duplicate_ids(items)):
        _issue(
            issues,
            "error",
            f"{matrix_name}_duplicate_item_id",
            f"A matriz {matrix_name} possui item duplicado: {duplicate_id}.",
            path=f"products.{matrix_name}.items",
        )

    for item in items:
        item_id = _text(item.get("id"))
        city_id = _text(item.get("city_id"))
        product_id = _text(item.get("product_id"))
        item_ref = item_id or (f"{city_id}:{product_id}" if city_id or product_id else "(sem id)")
        item_path = f"products.{matrix_name}.items[{item_ref}]"

        if not city_id:
            _issue(
                issues,
                "error",
                f"{matrix_name}_missing_city",
                f"A matriz {matrix_name} possui item sem city_id.",
                path=item_path,
            )
        elif city_id not in valid_city_ids:
            _issue(
                issues,
                "error",
                f"{matrix_name}_unknown_city",
                f"A matriz {matrix_name} referencia cidade inexistente no mapa ativo: {city_id}.",
                path=item_path,
            )

        if not product_id:
            _issue(
                issues,
                "error",
                f"{matrix_name}_missing_product",
                f"A matriz {matrix_name} possui item sem product_id.",
                path=item_path,
            )
        elif product_id not in valid_product_ids:
            _issue(
                issues,
                "error",
                f"{matrix_name}_unknown_product",
                f"A matriz {matrix_name} referencia produto inexistente: {product_id}.",
                path=item_path,
            )

        _validate_positive_value(
            issues,
            matrix_name=matrix_name,
            item_ref=item_ref,
            value=item.get("value"),
            path=item_path,
        )

        if city_id and product_id:
            pair = (city_id, product_id)
            if pair in seen_pairs:
                _issue(
                    issues,
                    "error",
                    f"{matrix_name}_duplicate_city_product",
                    f"A matriz {matrix_name} possui mais de um item para a combinacao {city_id} x {product_id}.",
                    path=item_path,
                )
            else:
                seen_pairs.add(pair)


def _validate_region_supply_matrix_items(
    issues: list[GameWorldValidationIssue],
    *,
    matrix_payload: dict[str, Any],
    valid_product_ids: set[str],
    valid_region_names: set[str],
    valid_region_keys_by_state: set[tuple[str, str]],
) -> None:
    matrix_name = "region_supply_matrix"
    items = list(matrix_payload.get("items", []))
    seen_pairs: set[tuple[str, str, str]] = set()

    for duplicate_id in sorted(_duplicate_ids(items)):
        _issue(
            issues,
            "error",
            f"{matrix_name}_duplicate_item_id",
            f"A matriz {matrix_name} possui item duplicado: {duplicate_id}.",
            path=f"products.{matrix_name}.items",
        )

    for item in items:
        item_id = _text(item.get("id"))
        state_code = _text(item.get("state_code"))
        region_name = _text(item.get("source_region_name") or item.get("region_name"))
        product_id = _text(item.get("product_id"))
        item_ref = item_id or (
            f"{state_code}:{region_name}:{product_id}" if state_code or region_name or product_id else "(sem id)"
        )
        item_path = f"products.{matrix_name}.items[{item_ref}]"

        if not region_name:
            _issue(
                issues,
                "error",
                f"{matrix_name}_missing_region",
                f"A matriz {matrix_name} possui item sem source_region_name.",
                path=item_path,
            )
        else:
            normalized_region_name = _normalized_text(region_name)
            normalized_state_code = _normalized_text(state_code)
            region_exists = (
                (normalized_state_code, normalized_region_name) in valid_region_keys_by_state
                if normalized_state_code
                else normalized_region_name in valid_region_names
            )
            if not region_exists:
                qualified_region = f"{state_code}/{region_name}" if state_code else region_name
                _issue(
                    issues,
                    "error",
                    f"{matrix_name}_unknown_region",
                    f"A matriz {matrix_name} referencia regiao inexistente no mapa ativo: {qualified_region}.",
                    path=item_path,
                )

        if not product_id:
            _issue(
                issues,
                "error",
                f"{matrix_name}_missing_product",
                f"A matriz {matrix_name} possui item sem product_id.",
                path=item_path,
            )
        elif product_id not in valid_product_ids:
            _issue(
                issues,
                "error",
                f"{matrix_name}_unknown_product",
                f"A matriz {matrix_name} referencia produto inexistente: {product_id}.",
                path=item_path,
            )

        _validate_positive_value(
            issues,
            matrix_name=matrix_name,
            item_ref=item_ref,
            value=item.get("value"),
            path=item_path,
        )

        if region_name and product_id:
            pair = (_normalized_text(state_code), _normalized_text(region_name), product_id)
            if pair in seen_pairs:
                region_label = f"{state_code}/{region_name}" if state_code else region_name
                _issue(
                    issues,
                    "error",
                    f"{matrix_name}_duplicate_region_product",
                    f"A matriz {matrix_name} possui mais de um item para a combinacao {region_label} x {product_id}.",
                    path=item_path,
                )
            else:
                seen_pairs.add(pair)


def _validate_product_relation_ids(
    issues: list[GameWorldValidationIssue],
    *,
    product_id: str,
    relation_name: str,
    raw_values: list[Any],
    valid_product_ids: set[str],
) -> None:
    seen_values: set[str] = set()
    duplicate_values: set[str] = set()

    for raw_value in raw_values:
        related_product_id = _text(raw_value)
        if not related_product_id:
            continue
        if related_product_id in seen_values:
            duplicate_values.add(related_product_id)
        else:
            seen_values.add(related_product_id)

        if related_product_id not in valid_product_ids:
            _issue(
                issues,
                "error",
                f"product_unknown_{relation_name}",
                f"O produto {product_id} referencia um {relation_name[:-1]} inexistente: {related_product_id}.",
                path=f"products.catalog.products[{product_id}]",
            )
        elif related_product_id == product_id:
            _issue(
                issues,
                "warning",
                f"product_self_{relation_name[:-1]}",
                f"O produto {product_id} referencia a si proprio em {relation_name}.",
                path=f"products.catalog.products[{product_id}]",
            )

    for duplicate_value in sorted(duplicate_values):
        _issue(
            issues,
            "warning",
            f"product_duplicate_{relation_name[:-1]}",
            f"O produto {product_id} repete a referencia {duplicate_value} em {relation_name}.",
            path=f"products.catalog.products[{product_id}]",
        )


def validate_game_world_runtime(runtime: GameWorldRuntimeDocument) -> GameWorldValidationReport:
    issues: list[GameWorldValidationIssue] = []

    city_items = list(runtime.map.cities)
    route_network = dict(runtime.map.route_network)
    product_items = list(runtime.products.catalog.get("products", []))
    family_items = list(runtime.products.family_catalog.get("families", []))
    logistics_type_items = list(runtime.products.logistics_type_catalog.get("types", []))
    truck_type_items = list(runtime.trucks.type_catalog.get("types", []))
    truck_body_items = list(runtime.trucks.body_catalog.get("types", []))

    valid_city_ids = set(runtime.catalogs.city_by_id)
    valid_product_ids = set(runtime.catalogs.product_by_id)
    valid_family_ids = set(runtime.catalogs.product_family_by_id)
    valid_logistics_type_ids = set(runtime.catalogs.product_logistics_type_by_id)
    valid_truck_body_ids = set(runtime.catalogs.truck_body_by_id)
    valid_truck_type_ids = set(runtime.catalogs.truck_type_by_id)
    valid_region_names = {
        _normalized_text(city.get("source_region_name"))
        for city in city_items
        if _text(city.get("source_region_name"))
    }
    valid_region_keys_by_state = {
        (_normalized_text(city.get("state_code")), _normalized_text(city.get("source_region_name")))
        for city in city_items
        if _text(city.get("state_code")) and _text(city.get("source_region_name"))
    }

    if not valid_city_ids:
        _issue(issues, "error", "missing_cities", "O runtime nao possui cidades carregadas.", path="map.cities")
    if not valid_product_ids:
        _issue(issues, "error", "missing_products", "O runtime nao possui produtos carregados.", path="products.catalog")
    if not valid_truck_type_ids:
        _issue(issues, "error", "missing_trucks", "O runtime nao possui caminhoes carregados.", path="trucks.type_catalog")

    for duplicate_id in sorted(_duplicate_ids(city_items)):
        _issue(issues, "error", "duplicate_city_id", f"Cidade duplicada no mapa ativo: {duplicate_id}.", path="map.cities")
    for duplicate_id in sorted(_duplicate_ids(product_items)):
        _issue(issues, "error", "duplicate_product_id", f"Produto duplicado no catalogo: {duplicate_id}.", path="products.catalog.products")
    for duplicate_id in sorted(_duplicate_ids(family_items)):
        _issue(issues, "error", "duplicate_product_family_id", f"Familia duplicada: {duplicate_id}.", path="products.family_catalog.families")
    for duplicate_id in sorted(_duplicate_ids(logistics_type_items)):
        _issue(issues, "error", "duplicate_logistics_type_id", f"Tipo logistico duplicado: {duplicate_id}.", path="products.logistics_type_catalog.types")
    for duplicate_id in sorted(_duplicate_ids(truck_type_items)):
        _issue(issues, "error", "duplicate_truck_type_id", f"Tipo de caminhao duplicado: {duplicate_id}.", path="trucks.type_catalog.types")
    for duplicate_id in sorted(_duplicate_ids(truck_body_items)):
        _issue(issues, "error", "duplicate_truck_body_id", f"Implemento duplicado: {duplicate_id}.", path="trucks.body_catalog.types")

    for logistics_type in logistics_type_items:
        logistics_type_id = _text(logistics_type.get("id"))
        body_type_ids = [_text(item) for item in logistics_type.get("body_type_ids", []) if _text(item)]
        if not body_type_ids:
            _issue(
                issues,
                "warning",
                "logistics_type_without_bodies",
                f"O tipo logistico {logistics_type_id} nao possui implementos definidos.",
                path=f"products.logistics_type_catalog.types[{logistics_type_id}]",
            )
            continue

        invalid_body_type_ids = [body_id for body_id in body_type_ids if body_id not in valid_truck_body_ids]
        for body_id in invalid_body_type_ids:
            _issue(
                issues,
                "error",
                "logistics_type_unknown_body_type",
                f"O tipo logistico {logistics_type_id} referencia implemento inexistente: {body_id}.",
                path=f"products.logistics_type_catalog.types[{logistics_type_id}]",
            )

        supported_by_any_truck = any(
            set(body_type_ids) & {_text(body_id) for body_id in truck.get("canonical_body_type_ids", []) if _text(body_id)}
            for truck in truck_type_items
        )
        if not supported_by_any_truck:
            _issue(
                issues,
                "error",
                "logistics_type_without_supported_truck",
                f"O tipo logistico {logistics_type_id} nao possui nenhum caminhao ativo que cubra seus implementos.",
                path=f"products.logistics_type_catalog.types[{logistics_type_id}]",
            )

    route_nodes = list(route_network.get("nodes", []))
    route_edges = list(route_network.get("edges", []))
    valid_node_ids = valid_city_ids | {_text(node.get("id")) for node in route_nodes if _text(node.get("id"))}

    for duplicate_id in sorted(_duplicate_ids(route_nodes)):
        _issue(issues, "error", "duplicate_route_node_id", f"No de rota duplicado: {duplicate_id}.", path="map.route_network.nodes")
    for duplicate_id in sorted(_duplicate_ids(route_edges)):
        _issue(issues, "error", "duplicate_route_edge_id", f"Aresta de rota duplicada: {duplicate_id}.", path="map.route_network.edges")

    for edge in route_edges:
        edge_id = _text(edge.get("id"))
        from_node_id = _text(edge.get("from_node_id") or edge.get("from_city_id"))
        to_node_id = _text(edge.get("to_node_id") or edge.get("to_city_id"))
        if not from_node_id:
            _issue(
                issues,
                "error",
                "route_edge_missing_from_node",
                f"A rota {edge_id or '(sem id)'} nao define no de origem.",
                path="map.route_network.edges",
            )
        elif from_node_id not in valid_node_ids:
            _issue(
                issues,
                "error",
                "route_edge_unknown_from_node",
                f"A rota {edge_id or '(sem id)'} referencia origem inexistente: {from_node_id}.",
                path="map.route_network.edges",
            )

        if not to_node_id:
            _issue(
                issues,
                "error",
                "route_edge_missing_to_node",
                f"A rota {edge_id or '(sem id)'} nao define no de destino.",
                path="map.route_network.edges",
            )
        elif to_node_id not in valid_node_ids:
            _issue(
                issues,
                "error",
                "route_edge_unknown_to_node",
                f"A rota {edge_id or '(sem id)'} referencia destino inexistente: {to_node_id}.",
                path="map.route_network.edges",
            )

    for product in product_items:
        product_id = _text(product.get("id"))
        family_id = _text(product.get("family_id"))
        logistics_type_id = _text(product.get("logistics_type_id"))
        logistics_type_record = runtime.catalogs.product_logistics_type_by_id.get(logistics_type_id) or {}
        logistics_body_type_ids = [_text(item) for item in logistics_type_record.get("body_type_ids", []) if _text(item)]

        if family_id and family_id not in valid_family_ids:
            _issue(
                issues,
                "error",
                "product_unknown_family",
                f"O produto {product_id} referencia familia inexistente: {family_id}.",
                path=f"products.catalog.products[{product_id}]",
            )
        if logistics_type_id and logistics_type_id not in valid_logistics_type_ids:
            _issue(
                issues,
                "error",
                "product_unknown_logistics_type",
                f"O produto {product_id} referencia tipo logistico inexistente: {logistics_type_id}.",
                path=f"products.catalog.products[{product_id}]",
            )
        if not logistics_body_type_ids:
            _issue(
                issues,
                "warning",
                "product_without_compatible_bodies",
                f"O produto {product_id} usa o tipo logistico {logistics_type_id or '(sem tipo)'}, mas esse tipo nao define implementos compativeis.",
                path=f"products.catalog.products[{product_id}]",
            )
        else:
            supported_by_any_truck = any(
                set(logistics_body_type_ids) & {_text(body_id) for body_id in truck.get("canonical_body_type_ids", []) if _text(body_id)}
                for truck in truck_type_items
            )
            if not supported_by_any_truck:
                _issue(
                    issues,
                    "error",
                    "product_without_supported_truck",
                    f"O produto {product_id} usa o tipo logistico {logistics_type_id or '(sem tipo)'}, mas nenhum caminhao ativo cobre seus implementos.",
                    path=f"products.catalog.products[{product_id}]",
                )

        _validate_product_relation_ids(
            issues,
            product_id=product_id,
            relation_name="inputs",
            raw_values=list(product.get("inputs") or []),
            valid_product_ids=valid_product_ids,
        )
        _validate_product_relation_ids(
            issues,
            product_id=product_id,
            relation_name="outputs",
            raw_values=list(product.get("outputs") or []),
            valid_product_ids=valid_product_ids,
        )

    family_weights = dict(runtime.products.inference_rules.get("demand_estimation", {}).get("family_weights", {}))
    for family_id in sorted(family_weights):
        normalized_family_id = _text(family_id)
        if normalized_family_id and normalized_family_id not in valid_family_ids:
            _issue(
                issues,
                "error",
                "inference_unknown_family_weight",
                f"As regras de inferencia de demanda referenciam familia inexistente: {normalized_family_id}.",
                path="products.inference_rules.demand_estimation.family_weights",
            )

    for truck in truck_type_items:
        truck_id = _text(truck.get("id"))
        body_ids = [_text(item) for item in truck.get("canonical_body_type_ids", []) if _text(item)]
        if not body_ids:
            _issue(
                issues,
                "warning",
                "truck_without_body_type",
                f"O tipo de caminhao {truck_id} nao possui implemento canonico definido.",
                path=f"trucks.type_catalog.types[{truck_id}]",
            )
        for body_id in body_ids:
            if body_id not in valid_truck_body_ids:
                _issue(
                    issues,
                    "error",
                    "truck_unknown_body_type",
                    f"O tipo de caminhao {truck_id} referencia implemento inexistente: {body_id}.",
                    path=f"trucks.type_catalog.types[{truck_id}]",
                )

    _validate_matrix_items(
        issues,
        matrix_name="supply_matrix",
        matrix_payload=runtime.products.supply_matrix,
        valid_city_ids=valid_city_ids,
        valid_product_ids=valid_product_ids,
    )
    _validate_matrix_items(
        issues,
        matrix_name="demand_matrix",
        matrix_payload=runtime.products.demand_matrix,
        valid_city_ids=valid_city_ids,
        valid_product_ids=valid_product_ids,
    )
    _validate_region_supply_matrix_items(
        issues,
        matrix_payload=runtime.products.region_supply_matrix,
        valid_product_ids=valid_product_ids,
        valid_region_names=valid_region_names,
        valid_region_keys_by_state=valid_region_keys_by_state,
    )

    try:
        reference_data = build_reference_data_from_city_catalog_payload(city_items)
        snapshot = RouteWorkspaceSnapshot.model_validate(route_network)
        RouteGraph(
            list(reference_data.cities.values()),
            snapshot.edges,
            snapshot.nodes,
        )
    except Exception as exc:
        _issue(
            issues,
            "error",
            "route_graph_build_failed",
            f"Falha ao montar o grafo consolidado do runtime: {exc}",
            path="map.route_network",
        )

    error_count = sum(1 for issue in issues if issue.severity == "error")
    warning_count = sum(1 for issue in issues if issue.severity == "warning")
    return GameWorldValidationReport(
        valid=error_count == 0,
        error_count=error_count,
        warning_count=warning_count,
        issues=issues,
    )
