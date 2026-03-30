from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.truck_image_generation import TruckImageGenerationError, generate_truck_image_asset
from app.ui.editor_models import TruckImageGenerateRequest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate one Brasix truck image asset at a time.")
    parser.add_argument("truck_type_id", help="Truck type id from truck_type_catalog.json")
    parser.add_argument("--dry-run", action="store_true", help="Only build prompt/manifest, without calling OpenAI.")
    parser.add_argument("--force-regenerate", action="store_true", help="Generate a new candidate even if one already exists.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    request = TruckImageGenerateRequest(
        truck_type_id=args.truck_type_id,
        dry_run=args.dry_run,
        force_regenerate=args.force_regenerate,
    )
    try:
        asset, review_queue = generate_truck_image_asset(request)
    except TruckImageGenerationError as exc:
        print(f"[Brasix/TruckImage][cli_error] {exc}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "asset": asset.model_dump(mode="json"),
                "review_queue": review_queue.model_dump(mode="json"),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
