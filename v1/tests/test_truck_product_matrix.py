from __future__ import annotations

from app.game import build_truck_product_matrix_payload


def test_build_truck_product_matrix_payload_is_consistent() -> None:
    payload = build_truck_product_matrix_payload()

    products = list(payload["products"])
    trucks = list(payload["trucks"])
    products_by_id = {item["id"]: item for item in products}

    assert payload["summary"]["truck_type_count"] == len(trucks)
    assert payload["summary"]["product_count"] == len(products)
    assert len(trucks) > 0
    assert len(products) > 0

    compatible_pair_count = 0
    for truck in trucks:
        supported_product_count = 0
        truck_body_ids = set(truck["body_type_ids"])

        assert len(truck["cells"]) == len(products)

        for cell in truck["cells"]:
            product = products_by_id[cell["product_id"]]
            expected_overlap = truck_body_ids & set(product["logistics_body_type_ids"])

            assert cell["compatible"] is bool(expected_overlap)
            assert set(cell["matched_body_type_ids"]) == expected_overlap

            if cell["compatible"]:
                supported_product_count += 1
                compatible_pair_count += 1

        assert truck["supported_product_count"] == supported_product_count

    assert payload["summary"]["compatible_pair_count"] == compatible_pair_count
    assert payload["summary"]["covered_product_count"] == sum(
        1 for product in products if product["compatible_truck_count"] > 0
    )
    assert all(product["compatibility_source"] == "logistics_type" for product in products)
    assert all("preview_image_url_path" in truck for truck in trucks)

    carreta_ls = next((truck for truck in trucks if truck["id"] == "truck_type_carreta_ls"), None)
    assert carreta_ls is not None
    assert carreta_ls["preview_image_url_path"]