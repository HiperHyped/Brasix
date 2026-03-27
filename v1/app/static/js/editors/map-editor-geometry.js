import { computeRouteDistanceKm } from "../shared/leaflet-map.js";
import { roundNumber } from "../shared/formatters.js";

function normalizedCoordinate(value) {
  return roundNumber(value, 5);
}

export function createDraftState({ activeToolId, surfaceTypeId, geometryTypeId }) {
  return {
    activeToolId,
    surfaceTypeId,
    geometryTypeId,
    fromCityId: null,
    toCityId: null,
    waypoints: [],
  };
}

export function resetDraft(state) {
  state.fromCityId = null;
  state.toCityId = null;
  state.waypoints = [];
}

export function addDraftWaypoint(state, latlng) {
  state.waypoints.push({
    latitude: normalizedCoordinate(latlng.lat),
    longitude: normalizedCoordinate(latlng.lng),
  });
}

export function removeDraftWaypoint(state) {
  state.waypoints.pop();
}

function edgeId(fromCityId, toCityId) {
  return `edge-${fromCityId}-${toCityId}-${Date.now()}`;
}

export function buildEdgeFromDraft({ draft, citiesById, surfaceType, geometryType, cityIds = new Set() }) {
  const fromNodeId = draft.fromCityId;
  const toNodeId = draft.toCityId;
  const edge = {
    id: edgeId(fromNodeId, toNodeId),
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    from_city_id: cityIds.has(fromNodeId) ? fromNodeId : null,
    to_city_id: cityIds.has(toNodeId) ? toNodeId : null,
    mode: "road",
    surface_type_id: surfaceType.id,
    surface_code: surfaceType.code,
    geometry_type_id: geometryType.id,
    geometry_code: geometryType.code,
    render_smoothing_enabled: true,
    status: "active",
    bidirectional: true,
    distance_km: null,
    notes: "Criada no editor de mapa",
    waypoints: (geometryType.allow_waypoints ? draft.waypoints : []).map((waypoint, index) => ({
      id: `route_point_${Date.now()}_${index + 1}`,
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })),
  };

  edge.distance_km = computeRouteDistanceKm(edge, citiesById);
  return edge;
}
