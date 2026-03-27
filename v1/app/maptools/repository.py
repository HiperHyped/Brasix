from __future__ import annotations

import json
from pathlib import Path

from app.config import JSON_DIR, ROUTE_NETWORK_PATH
from app.maptools.models import RouteWorkspaceSnapshot


class RouteWorkspaceRepository:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or JSON_DIR
        self.routes_path = ROUTE_NETWORK_PATH if data_dir is None else Path(data_dir) / "route_network.json"

    def load_snapshot(self) -> RouteWorkspaceSnapshot:
        if not self.routes_path.exists():
            return RouteWorkspaceSnapshot()
        payload = json.loads(self.routes_path.read_text(encoding="utf-8-sig"))
        return RouteWorkspaceSnapshot.model_validate(payload)

    def load_edges(self):
        return self.load_snapshot().edges

    def save_snapshot(self, snapshot: RouteWorkspaceSnapshot) -> RouteWorkspaceSnapshot:
        self.routes_path.write_text(
            json.dumps(snapshot.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return snapshot
