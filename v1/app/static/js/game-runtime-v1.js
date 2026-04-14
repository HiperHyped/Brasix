import {
  applyBrasixLeafletSettings,
  buildRenderedRouteLatLngs,
  computeRouteDistanceKm,
  createBrasixMap,
  createCityMarker,
  createRouteLayer,
  fitBrasixBounds,
  findPopulationBand,
  sortPopulationBands,
} from "./shared/leaflet-map.js?v=20260414-game-runtime-1";
import { escapeHtml, numberFormatter, roundNumber } from "./shared/formatters.js?v=20260414-game-runtime-1";

const THEME_KEY = "brasix:v1:game-runtime-theme";
const GAME_SESSION_SNAPSHOT_KEY = "brasix:v1:game-session-snapshot";
const FALLBACK_THEME_KEYS = ["brasix:v1:game-setup-theme", "brasix:v1:editors-hub-theme"];
const SPEED_OPTIONS = [
  { id: "pause", label: "Pausa", hours_per_second: 0 },
  { id: "x1", label: "1x", hours_per_second: 0.35 },
  { id: "x4", label: "4x", hours_per_second: 1.4 },
  { id: "x12", label: "12x", hours_per_second: 4.2 },
];
const ROBOT_NAMES = ["Norte Cargo", "Centro Sul", "Atlas Leste"];
const ROBOT_COLORS = ["#8c4f10", "#4f8593", "#6b7d2e"];
const NETWORK_OPACITY_SCALE = 0.92;
const SIMULATION_TICK_MS = 250;
const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

const state = {
  bootstrap: null,
  runtime: null,
  snapshot: null,
  map: null,
  layers: {
    network: null,
    highlights: null,
    cities: null,
    vehicles: null,
  },
  vehicleMarkersByTruckId: {},
  cities: [],
  citiesById: {},
  graphNodesById: {},
  nodesById: {},
  edges: [],
  edgesById: {},
  graphAdjacency: {},
  surfaceTypesById: {},
  productsById: {},
  productOperationalById: {},
  trucksById: {},
  dieselByCityId: {},
  populationBands: [],
  pinsById: {},
  freightFlows: [],
  freightFlowsById: {},
  outboundFreightsByCityId: {},
  trackCache: {},
  players: [],
  playersById: {},
  activeDrawerPlayerId: "human",
  focusedPlayerId: "human",
  humanPrepared: false,
  logs: [],
  simulation: {
    currentTime: initialSimulationDate(),
    speedId: "x4",
    timerId: null,
    lastRealTimestamp: 0,
  },
};

const refs = {
  status: document.getElementById("game-runtime-status"),
  themeToggle: document.getElementById("game-runtime-theme-toggle"),
  speedControls: document.getElementById("game-runtime-speed-controls"),
  clock: document.getElementById("game-runtime-clock"),
  mapStage: document.getElementById("game-runtime-map-stage"),
  humanHud: document.getElementById("game-runtime-human-hud"),
  logPanel: document.getElementById("game-runtime-log-panel"),
  drawer: document.getElementById("game-runtime-drawer"),
  playerBar: document.getElementById("game-runtime-player-bar"),
};

function initialSimulationDate() {
  const now = new Date();
  now.setHours(6, 0, 0, 0);
  return now;
}

function numberFormat(digits = 0) {
  return numberFormatter(digits);
}

function formatInteger(value) {
  return numberFormat(0).format(Number(value || 0));
}

function formatCurrency(value) {
  return `R$ ${numberFormat(0).format(roundNumber(Number(value || 0), 0))}`;
}

function formatTonnes(value) {
  const numericValue = Number(value || 0);
  const digits = Math.abs(numericValue) >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 2))} t`;
}

function formatDistanceKm(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 1))} km`;
}

function formatHours(value) {
  const hours = Math.max(0, Number(value || 0));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days} d ${remainingHours} h` : `${days} d`;
  }
  if (hours >= 1) {
    return `${numberFormat(hours >= 10 ? 0 : 1).format(roundNumber(hours, 1))} h`;
  }
  return `${formatInteger(Math.max(1, Math.round(hours * 60)))} min`;
}

function formatClock(date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const weekday = WEEKDAY_LABELS[safeDate.getDay()] || WEEKDAY_LABELS[0];
  const day = String(safeDate.getDate()).padStart(2, "0");
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const hours = String(safeDate.getHours()).padStart(2, "0");
  const minutes = String(safeDate.getMinutes()).padStart(2, "0");
  return `${weekday} ${day}/${month} ${hours}:${minutes}`;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(Number(value || 0), minValue), maxValue);
}

function getNestedValue(target, path, fallback = 0) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current && current[key] != null ? current[key] : undefined), target) ?? fallback;
}

function pricingNumber(path, fallback = 0) {
  const value = Number(
    getNestedValue(
      state.bootstrap?.pricing_document,
      path,
      getNestedValue(state.bootstrap?.default_pricing_document, path, fallback),
    ),
  );
  return Number.isFinite(value) ? value : Number(fallback || 0);
}

function fetchJson(url) {
  return fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Falha em ${url}`);
    }
    return response.json();
  });
}

function waitForLeaflet(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.L) {
        window.clearInterval(timer);
        resolve(window.L);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("Leaflet nao carregou a tempo para o jogo."));
      }
    }, 50);
  });
}

function normalizeTheme(theme) {
  return theme === "night" ? "night" : "day";
}

function getStoredTheme() {
  try {
    const explicitTheme = window.localStorage.getItem(THEME_KEY);
    if (explicitTheme) {
      return normalizeTheme(explicitTheme);
    }
    for (const fallbackKey of FALLBACK_THEME_KEYS) {
      const fallbackTheme = window.localStorage.getItem(fallbackKey);
      if (fallbackTheme) {
        return normalizeTheme(fallbackTheme);
      }
    }
  } catch (_error) {
    return "day";
  }
  return "day";
}

function setTheme(theme, { persist = true } = {}) {
  const normalized = normalizeTheme(theme);
  document.documentElement.classList.add("game-runtime-page");
  document.documentElement.dataset.editorTheme = normalized;
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, normalized);
    } catch (_error) {
      // Persistencia opcional.
    }
  }

  const icon = refs.themeToggle?.querySelector(".material-symbols-outlined");
  const label = refs.themeToggle?.querySelector("span:last-child");
  if (icon) {
    icon.textContent = normalized === "night" ? "light_mode" : "dark_mode";
  }
  if (label) {
    label.textContent = normalized === "night" ? "Modo claro" : "Modo noturno";
  }
}

function speedOptionById(speedId) {
  return SPEED_OPTIONS.find((option) => option.id === speedId) || SPEED_OPTIONS[0];
}

function setSpeed(speedId) {
  state.simulation.speedId = speedOptionById(speedId).id;
  renderSpeedControls();
}

function renderSpeedControls() {
  if (!refs.speedControls) {
    return;
  }
  refs.speedControls.querySelectorAll("[data-speed-id]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-speed-id") === state.simulation.speedId);
  });
}

function readGameSessionSnapshot() {
  try {
    const rawSnapshot = window.localStorage.getItem(GAME_SESSION_SNAPSHOT_KEY);
    if (!rawSnapshot) {
      return null;
    }
    const parsed = JSON.parse(rawSnapshot);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function cityLabel(cityId) {
  return String(state.citiesById[cityId]?.label || cityId || "Cidade");
}

function productRecord(productId) {
  return {
    ...(state.productsById[String(productId || "").trim()] || {}),
    ...(state.productOperationalById[String(productId || "").trim()] || {}),
  };
}

function payloadTonsForTruck(truck) {
  return Math.max(0, Number(truck?.payload_weight_kg || 0) / 1000);
}

function truckSupportsFlow(truck, flow) {
  const supportedProductIds = Array.isArray(truck?.supported_product_ids) ? truck.supported_product_ids : [];
  return supportedProductIds.includes(String(flow?.product_id || "").trim());
}

function normalizeBootstrap(bootstrapPayload, runtimePayload) {
  state.bootstrap = bootstrapPayload;
  state.runtime = runtimePayload;
  state.snapshot = readGameSessionSnapshot();

  state.cities = Array.isArray(bootstrapPayload?.cities)
    ? bootstrapPayload.cities
    : Array.isArray(runtimePayload?.map?.cities)
      ? runtimePayload.map.cities
      : [];
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));

  const routeNodes = Array.isArray(runtimePayload?.map?.route_network?.nodes)
    ? runtimePayload.map.route_network.nodes
    : [];
  state.graphNodesById = Object.fromEntries(routeNodes.map((node) => [node.id, node]));
  state.nodesById = {
    ...state.citiesById,
    ...state.graphNodesById,
  };

  state.edges = Array.isArray(runtimePayload?.map?.route_network?.edges) ? runtimePayload.map.route_network.edges : [];
  state.edgesById = Object.fromEntries(state.edges.map((edge) => [edge.id, edge]));

  const runtimeProducts = runtimePayload?.catalogs?.product_by_id || {};
  const bootstrapProducts = Object.fromEntries(
    (Array.isArray(bootstrapPayload?.products) ? bootstrapPayload.products : [])
      .map((product) => [product.id, product]),
  );
  state.productsById = {
    ...runtimeProducts,
    ...bootstrapProducts,
  };
  state.productOperationalById = Object.fromEntries(
    ((bootstrapPayload?.product_operational_catalog?.items) || [])
      .map((item) => {
        const productId = String(item?.product_id || "").trim();
        return productId ? [productId, item] : null;
      })
      .filter(Boolean),
  );
  state.trucksById = Object.fromEntries(
    ((bootstrapPayload?.trucks) || []).map((truck) => [truck.id, truck]),
  );
  state.dieselByCityId = Object.fromEntries(
    ((bootstrapPayload?.diesel_document?.city_values) || []).map((row) => [row.city_id, Number(row.final_value || 0)]),
  );

  const rawBands = Array.isArray(bootstrapPayload?.map_editor?.population_bands)
    ? bootstrapPayload.map_editor.population_bands
    : bootstrapPayload?.map_editor?.population_bands?.bands || [];
  state.populationBands = sortPopulationBands(rawBands);
  state.pinsById = Object.fromEntries(((bootstrapPayload?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]));
  state.surfaceTypesById = Object.fromEntries(
    ((bootstrapPayload?.map_editor?.route_surface_types?.types) || []).map((surfaceType) => [surfaceType.id, surfaceType]),
  );

  state.freightFlows = Array.isArray(bootstrapPayload?.freight_flows) ? bootstrapPayload.freight_flows : [];
  state.freightFlowsById = Object.fromEntries(state.freightFlows.map((flow) => [flow.id, flow]));

  const outboundByCityId = Object.fromEntries(state.cities.map((city) => [city.id, []]));
  state.freightFlows.forEach((flow) => {
    if (!outboundByCityId[flow.origin_id]) {
      outboundByCityId[flow.origin_id] = [];
    }
    outboundByCityId[flow.origin_id].push(flow);
  });
  Object.values(outboundByCityId).forEach((flows) => {
    flows.sort((left, right) => flowScore(right) - flowScore(left));
  });
  state.outboundFreightsByCityId = outboundByCityId;
  state.trackCache = {};
  buildGraphAdjacency();
}

function edgeEndpoint(edge, side) {
  return side === "from"
    ? String(edge?.from_node_id || edge?.from_city_id || "").trim()
    : String(edge?.to_node_id || edge?.to_city_id || "").trim();
}

function edgeDistanceKm(edge) {
  const explicitDistance = Number(edge?.distance_km || 0);
  if (explicitDistance > 0) {
    return explicitDistance;
  }
  return computeRouteDistanceKm(edge, state.nodesById);
}

function edgeDurationHours(edge, distanceKm = edgeDistanceKm(edge)) {
  const speedKmh = Number(state.surfaceTypesById[edge?.surface_type_id]?.average_speed_kmh || 0) || 50;
  return distanceKm / Math.max(10, speedKmh);
}

function buildGraphAdjacency() {
  const adjacency = Object.fromEntries(Object.keys(state.nodesById).map((nodeId) => [nodeId, []]));
  state.edges.forEach((edge) => {
    const fromNodeId = edgeEndpoint(edge, "from");
    const toNodeId = edgeEndpoint(edge, "to");
    if (!fromNodeId || !toNodeId || !state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) {
      return;
    }
    const distanceKm = edgeDistanceKm(edge);
    const durationHours = edgeDurationHours(edge, distanceKm);
    adjacency[fromNodeId].push({
      nextNodeId: toNodeId,
      edgeId: edge.id,
      distanceKm,
      durationHours,
    });
    if (edge.bidirectional) {
      adjacency[toNodeId].push({
        nextNodeId: fromNodeId,
        edgeId: edge.id,
        distanceKm,
        durationHours,
      });
    }
  });
  state.graphAdjacency = adjacency;
}

function shortestPath(startNodeId, endNodeId, mode = "fastest") {
  if (!state.nodesById[startNodeId] || !state.nodesById[endNodeId]) {
    throw new Error("No de rota nao encontrado.");
  }
  if (startNodeId === endNodeId) {
    return {
      nodeIds: [startNodeId],
      edgeIds: [],
      distanceKm: 0,
      durationHours: 0,
    };
  }

  const distances = { [startNodeId]: 0 };
  const durations = { [startNodeId]: 0 };
  const previousNodeIdByNodeId = { [startNodeId]: null };
  const previousEdgeIdByNodeId = { [startNodeId]: null };
  const queue = [{ nodeId: startNodeId, score: 0 }];

  while (queue.length) {
    queue.sort((left, right) => left.score - right.score);
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (current.nodeId === endNodeId) {
      break;
    }
    const currentBest = mode === "fastest" ? durations[current.nodeId] : distances[current.nodeId];
    if (current.score > currentBest + 0.0001) {
      continue;
    }

    (state.graphAdjacency[current.nodeId] || []).forEach((step) => {
      const nextDistance = Number(distances[current.nodeId] || 0) + step.distanceKm;
      const nextDuration = Number(durations[current.nodeId] || 0) + step.durationHours;
      const candidateScore = mode === "fastest" ? nextDuration : nextDistance;
      const currentScore = mode === "fastest"
        ? Number(durations[step.nextNodeId] ?? Number.POSITIVE_INFINITY)
        : Number(distances[step.nextNodeId] ?? Number.POSITIVE_INFINITY);
      if (candidateScore >= currentScore) {
        return;
      }
      distances[step.nextNodeId] = nextDistance;
      durations[step.nextNodeId] = nextDuration;
      previousNodeIdByNodeId[step.nextNodeId] = current.nodeId;
      previousEdgeIdByNodeId[step.nextNodeId] = step.edgeId;
      queue.push({ nodeId: step.nextNodeId, score: candidateScore });
    });
  }

  if (distances[endNodeId] == null) {
    throw new Error("Nao existe caminho entre origem e destino.");
  }

  const nodeIds = [];
  const edgeIds = [];
  let cursor = endNodeId;
  while (cursor) {
    nodeIds.push(cursor);
    const edgeId = previousEdgeIdByNodeId[cursor];
    if (edgeId) {
      edgeIds.push(edgeId);
    }
    cursor = previousNodeIdByNodeId[cursor];
  }
  nodeIds.reverse();
  edgeIds.reverse();

  return {
    nodeIds,
    edgeIds,
    distanceKm: roundNumber(Number(distances[endNodeId] || 0), 1),
    durationHours: roundNumber(Number(durations[endNodeId] || 0), 2),
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const phi1 = (Number(lat1) * Math.PI) / 180;
  const phi2 = (Number(lat2) * Math.PI) / 180;
  const deltaPhi = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const deltaLambda = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function buildTrackFromPath(path) {
  const points = [];
  const latlngs = [];
  let totalDistanceKm = 0;

  path.edgeIds.forEach((edgeId, index) => {
    const edge = state.edgesById[edgeId];
    if (!edge) {
      return;
    }
    let edgeLatLngs = buildRenderedRouteLatLngs(edge, state.nodesById);
    const fromNodeId = path.nodeIds[index];
    if (edgeEndpoint(edge, "from") !== fromNodeId) {
      edgeLatLngs = [...edgeLatLngs].reverse();
    }

    edgeLatLngs.forEach((latlng, pointIndex) => {
      const lat = Number(latlng[0]);
      const lng = Number(latlng[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      if (points.length && pointIndex === 0) {
        return;
      }
      const previousPoint = points[points.length - 1];
      if (previousPoint) {
        totalDistanceKm += haversineKm(previousPoint.lat, previousPoint.lng, lat, lng);
      }
      const nextPoint = {
        lat,
        lng,
        kmFromStart: totalDistanceKm,
      };
      points.push(nextPoint);
      latlngs.push([lat, lng]);
    });
  });

  return {
    source: "graph",
    fromNodeId: path.nodeIds[0] || null,
    toNodeId: path.nodeIds[path.nodeIds.length - 1] || null,
    nodeIds: path.nodeIds,
    edgeIds: path.edgeIds,
    points,
    latlngs,
    distanceKm: roundNumber(totalDistanceKm || path.distanceKm || 0, 1),
    durationHours: roundNumber(Number(path.durationHours || 0), 2),
  };
}

function buildDirectTrack(fromNodeId, toNodeId) {
  const fromNode = state.nodesById[fromNodeId];
  const toNode = state.nodesById[toNodeId];
  if (!fromNode || !toNode) {
    return {
      source: "direct",
      fromNodeId,
      toNodeId,
      nodeIds: [fromNodeId, toNodeId].filter(Boolean),
      edgeIds: [],
      points: [],
      latlngs: [],
      distanceKm: 0,
      durationHours: 0,
    };
  }
  const distanceKm = haversineKm(fromNode.latitude, fromNode.longitude, toNode.latitude, toNode.longitude);
  const points = [
    { lat: Number(fromNode.latitude), lng: Number(fromNode.longitude), kmFromStart: 0 },
    { lat: Number(toNode.latitude), lng: Number(toNode.longitude), kmFromStart: distanceKm },
  ];
  return {
    source: "direct",
    fromNodeId,
    toNodeId,
    nodeIds: [fromNodeId, toNodeId],
    edgeIds: [],
    points,
    latlngs: points.map((point) => [point.lat, point.lng]),
    distanceKm: roundNumber(distanceKm, 1),
    durationHours: roundNumber(distanceKm / 60, 2),
  };
}

function trackCacheKey(fromNodeId, toNodeId, mode = "fastest") {
  return `${mode}:${String(fromNodeId || "")}::${String(toNodeId || "")}`;
}

function getTrack(fromNodeId, toNodeId, mode = "fastest") {
  const key = trackCacheKey(fromNodeId, toNodeId, mode);
  if (state.trackCache[key]) {
    return state.trackCache[key];
  }

  let track = null;
  try {
    track = buildTrackFromPath(shortestPath(fromNodeId, toNodeId, mode));
  } catch (_error) {
    track = buildDirectTrack(fromNodeId, toNodeId);
  }

  if (!track.points.length) {
    track = buildDirectTrack(fromNodeId, toNodeId);
  }
  state.trackCache[key] = track;
  return track;
}

function trackPoint(track, progressRatio) {
  if (!track?.points?.length) {
    return null;
  }
  if (track.points.length === 1 || track.distanceKm <= 0) {
    return track.points[track.points.length - 1];
  }
  const clampedRatio = clamp(progressRatio, 0, 1);
  const targetKm = track.distanceKm * clampedRatio;

  for (let index = 1; index < track.points.length; index += 1) {
    const previousPoint = track.points[index - 1];
    const nextPoint = track.points[index];
    if (targetKm > nextPoint.kmFromStart) {
      continue;
    }
    const segmentDistance = Math.max(0.0001, nextPoint.kmFromStart - previousPoint.kmFromStart);
    const segmentRatio = clamp((targetKm - previousPoint.kmFromStart) / segmentDistance, 0, 1);
    return {
      lat: previousPoint.lat + ((nextPoint.lat - previousPoint.lat) * segmentRatio),
      lng: previousPoint.lng + ((nextPoint.lng - previousPoint.lng) * segmentRatio),
      kmFromStart: targetKm,
    };
  }

  return track.points[track.points.length - 1];
}

function trackStartPoint(track) {
  return track?.points?.[0] || null;
}

function trackEndPoint(track) {
  return track?.points?.[track.points.length - 1] || null;
}

function flowScore(flow) {
  const quantity = flowQuantityBaseTons(flow);
  const distance = Number(flow?.distance_km || 0);
  return (quantity * 42) + (distance * 1.3);
}

function cityOpportunityScore(city) {
  const outgoingFlows = state.outboundFreightsByCityId[city.id] || [];
  const outgoingScore = outgoingFlows.reduce((total, flow) => total + flowScore(flow), 0);
  return outgoingScore + (Number(city.population_thousands || 0) * 8);
}

function preferredHumanHqCityId() {
  const snapshotHqCityId = String(state.snapshot?.company?.hqCityId || "").trim();
  if (snapshotHqCityId && state.citiesById[snapshotHqCityId]) {
    return snapshotHqCityId;
  }
  const bootstrapCityId = String(state.bootstrap?.summary?.selected_city_id || "").trim();
  if (bootstrapCityId && state.citiesById[bootstrapCityId]) {
    return bootstrapCityId;
  }
  return [...state.cities]
    .sort((left, right) => cityOpportunityScore(right) - cityOpportunityScore(left))
    .map((city) => city.id)[0] || state.cities[0]?.id || "";
}

function logisticsKeyForFlow(flow) {
  const product = productRecord(flow?.product_id);
  const logisticsTypeId = String(product?.logistics_type_id || "").toLowerCase();
  if (product.temperature_control_required || /frigor|refrig/.test(logisticsTypeId)) {
    return "refrigerated";
  }
  if (/animais_vivos|carga_viva|live|animal/.test(logisticsTypeId)) {
    return "live";
  }
  if (product.hazardous || /perigos|hazard|quim|gas_comprimido/.test(logisticsTypeId)) {
    return "hazardous";
  }
  if (/tanque|liquid|gas|granel_liquido/.test(logisticsTypeId)) {
    return "tank";
  }
  if (/granel/.test(logisticsTypeId)) {
    return "bulk";
  }
  if (/palet|carga_geral|container|bau|sider/.test(logisticsTypeId)) {
    return "palletized";
  }
  return "general";
}

function logisticsMultiplier(flow) {
  const key = logisticsKeyForFlow(flow);
  return {
    bulk: pricingNumber("freight.specialization_bulk_multiplier", 0.98),
    general: pricingNumber("freight.specialization_general_multiplier", 1),
    palletized: pricingNumber("freight.specialization_palletized_multiplier", 1.08),
    refrigerated: pricingNumber("freight.specialization_refrigerated_multiplier", 1.28),
    tank: pricingNumber("freight.specialization_tank_multiplier", 1.26),
    live: pricingNumber("freight.specialization_live_multiplier", 1.35),
    hazardous: pricingNumber("freight.specialization_hazardous_multiplier", 1.32),
  }[key] || 1;
}

function productSurchargeMultiplier(flow) {
  const product = productRecord(flow?.product_id);
  let multiplier = 1;
  const valueClass = String(product?.value_class || "").toLowerCase();
  if (valueClass === "medium") {
    multiplier *= pricingNumber("freight.value_class_medium_multiplier", 1.05);
  }
  if (valueClass === "high") {
    multiplier *= pricingNumber("freight.value_class_high_multiplier", 1.12);
  }
  if (product?.perishable) {
    multiplier *= pricingNumber("freight.perishable_multiplier", 1.08);
  }
  if (product?.fragile) {
    multiplier *= pricingNumber("freight.fragile_multiplier", 1.06);
  }
  if (product?.temperature_control_required) {
    multiplier *= pricingNumber("freight.temperature_control_multiplier", 1.1);
  }
  if (product?.hazardous) {
    multiplier *= pricingNumber("freight.hazardous_multiplier", 1.12);
  }
  return multiplier;
}

function distanceMultiplier(flow) {
  const distance = Number(flow?.distance_km || 0);
  const shortReference = Math.max(1, pricingNumber("freight.short_haul_reference_km", 180));
  const longReference = Math.max(shortReference + 1, pricingNumber("freight.long_haul_reference_km", 1400));
  const shortShare = Math.max(0, 1 - (Math.min(distance, shortReference) / shortReference));
  const longShare = distance <= shortReference
    ? 0
    : Math.min(1, (Math.min(distance, longReference) - shortReference) / (longReference - shortReference));
  return 1
    + (shortShare * pricingNumber("freight.short_haul_markup_max", 0.18))
    - (longShare * pricingNumber("freight.long_haul_discount_max", 0.12));
}

function weightedDieselFactor(flow) {
  const dieselValues = Object.values(state.dieselByCityId).filter((value) => Number(value) > 0);
  const averageDieselPrice = dieselValues.length
    ? dieselValues.reduce((total, value) => total + Number(value), 0) / dieselValues.length
    : 0;
  if (!averageDieselPrice) {
    return 1;
  }
  const originWeight = pricingNumber("freight.diesel_origin_weight", 0.7);
  const destinationWeight = pricingNumber("freight.diesel_destination_weight", 0.3);
  const totalWeight = Math.max(originWeight + destinationWeight, 0.0001);
  const originDiesel = Number(state.dieselByCityId[flow.origin_id] || averageDieselPrice);
  const destinationDiesel = Number(state.dieselByCityId[flow.destination_id] || averageDieselPrice);
  const weighted = ((originDiesel * originWeight) + (destinationDiesel * destinationWeight)) / totalWeight;
  return Math.max(0.75, Math.min(1.35, weighted / averageDieselPrice));
}

function flowQuantityBaseTons(flow) {
  const product = productRecord(flow?.product_id);
  const rawQuantity = Number(flow?.quantity_t || 0);
  const weightPerUnitKg = Number(product?.weight_per_unit_kg || 0);
  if (weightPerUnitKg > 0) {
    return Math.max(0, rawQuantity * (weightPerUnitKg / 1000));
  }
  return Math.max(0, rawQuantity);
}

function flowPayloadTons(flow, truck, preparedEntry = null) {
  const preparedTons = Number(preparedEntry?.contract_payload_tons || 0);
  if (preparedTons > 0) {
    return preparedTons;
  }
  const truckPayloadTons = payloadTonsForTruck(truck);
  const flowQuantityTons = flowQuantityBaseTons(flow);
  if (truckPayloadTons > 0 && flowQuantityTons > 0) {
    return Math.max(0.5, Math.min(truckPayloadTons, flowQuantityTons));
  }
  return Math.max(0.5, truckPayloadTons || flowQuantityTons || 1);
}

function estimateCycleCost(flow, truck, payloadTons, trackDistanceKm) {
  const cycleDistanceKm = Math.max(1, Number(trackDistanceKm || flow?.distance_km || 0))
    * pricingNumber("freight.cycle_distance_multiplier", 1.65);
  const dieselFactor = weightedDieselFactor(flow);
  const variableCostPerKm = Number(truck?.base_variable_cost_brl_per_km || 0) * ((0.45 * dieselFactor) + 0.55);
  const variableCost = cycleDistanceKm * variableCostPerKm;
  const routeDays = Math.max(1, Math.ceil(cycleDistanceKm / Math.max(1, pricingNumber("freight.driver_daily_km", 650))));
  const fixedCost = routeDays * Number(truck?.base_fixed_cost_brl_per_day || 0);
  const handlingCost = pricingNumber("freight.handling_base_brl", 120)
    + (payloadTons * pricingNumber("freight.handling_per_t_brl", 4));
  return roundNumber(variableCost + fixedCost + handlingCost, 2);
}

function estimateDeliveryRevenue(flow, truck, player, preparedEntry, trackDistanceKm) {
  const preparedRevenue = Number(preparedEntry?.contract_revenue_brl || 0);
  if (preparedRevenue > 0) {
    return roundNumber(preparedRevenue, 2);
  }
  const payloadTons = flowPayloadTons(flow, truck, preparedEntry);
  const distanceKm = Math.max(1, Number(trackDistanceKm || flow?.distance_km || 0));
  const marketPrice = payloadTons
    * distanceKm
    * pricingNumber("freight.base_rate_brl_per_tkm", 0.34)
    * distanceMultiplier(flow)
    * logisticsMultiplier(flow)
    * productSurchargeMultiplier(flow);
  const floorCost = estimateCycleCost(flow, truck, payloadTons, trackDistanceKm)
    * pricingNumber("freight.floor_margin_multiplier", 1.12);
  const hqOriginBonus = flow.origin_id === player?.hqCityId ? pricingNumber("freight.hq_origin_bonus", 0.06) : 0;
  const hqDestinationBonus = flow.destination_id === player?.hqCityId ? pricingNumber("freight.hq_destination_bonus", 0.03) : 0;
  const hqBonus = Math.min(pricingNumber("freight.hq_bonus_cap", 0.08), hqOriginBonus + hqDestinationBonus);
  return roundNumber(Math.max(floorCost, marketPrice) * (1 + hqBonus), 2);
}

function loadHoursForTruck(truck) {
  return Math.max(0.2, Number(truck?.load_time_minutes || 45) / 60);
}

function unloadHoursForTruck(truck) {
  return Math.max(0.2, Number(truck?.unload_time_minutes || 45) / 60);
}

function openingCashForDifficulty(difficultyId = "standard") {
  const normalizedDifficulty = ["hard", "standard", "sandbox"].includes(String(difficultyId || "").trim())
    ? String(difficultyId || "").trim()
    : "standard";
  const liquidityFactor = {
    hard: pricingNumber("capital.hard_liquidity_factor", 0.65),
    standard: pricingNumber("capital.standard_liquidity_factor", 1),
    sandbox: pricingNumber("capital.sandbox_liquidity_factor", 1.6),
  }[normalizedDifficulty] || 1;
  return roundNumber(pricingNumber("capital.base_initial_cash_brl", 1000000) * liquidityFactor, 0);
}

function bestTruckForFlow(flow) {
  return Object.values(state.trucksById)
    .filter((truck) => truckSupportsFlow(truck, flow))
    .sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0)
      || payloadTonsForTruck(right) - payloadTonsForTruck(left)
      || String(left.short_label || left.label || "").localeCompare(String(right.short_label || right.label || ""), "pt-BR"))[0] || null;
}

function buildTruckUnit(playerId, truck, displayNumber, currentCityId) {
  return {
    id: `${playerId}-truck-${String(displayNumber).padStart(2, "0")}-${String(truck.id || "truck").slice(-12)}`,
    displayNumber,
    currentCityId,
    truckId: truck.id,
    truck,
  };
}

function normalizeSnapshotTruckUnits(snapshot, fallbackCityId) {
  return (Array.isArray(snapshot?.selectedTruckInstances) ? snapshot.selectedTruckInstances : [])
    .map((instance, index) => {
      const truckId = String(instance?.truck_id || "").trim();
      const truck = state.trucksById[truckId];
      if (!truck) {
        return null;
      }
      const currentCityId = state.citiesById[String(instance?.current_city_id || "").trim()]
        ? String(instance.current_city_id || "").trim()
        : fallbackCityId;
      return {
        id: String(instance?.id || "").trim() || `${truckId}-${index + 1}`,
        displayNumber: Number(instance?.display_number || 0) > 0 ? Number(instance.display_number) : index + 1,
        currentCityId,
        truckId,
        truck,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.displayNumber - right.displayNumber);
}

function buildContractSpecsFromSnapshot(snapshot, truckUnits, hqCityId) {
  const truckUnitsById = Object.fromEntries(truckUnits.map((truckUnit) => [truckUnit.id, truckUnit]));
  const snapshotFreights = Array.isArray(snapshot?.selectedFreights) ? snapshot.selectedFreights : [];
  const explicitSpecs = snapshotFreights
    .map((entry) => {
      const flow = state.freightFlowsById[String(entry?.flow_id || "").trim()];
      const truckUnit = truckUnitsById[String(entry?.truck_instance_id || "").trim()];
      if (!flow || !truckUnit || flow.origin_id !== hqCityId || !truckSupportsFlow(truckUnit.truck, flow)) {
        return null;
      }
      return {
        flow,
        truckUnit,
        preparedEntry: entry,
      };
    })
    .filter(Boolean);
  if (explicitSpecs.length) {
    return explicitSpecs;
  }

  const selectedAssignments = snapshot?.selectedFreightAssignments && typeof snapshot.selectedFreightAssignments === "object"
    ? snapshot.selectedFreightAssignments
    : {};
  return Object.entries(selectedAssignments)
    .map(([flowId, truckInstanceId]) => {
      const flow = state.freightFlowsById[String(flowId || "").trim()];
      const truckUnit = truckUnitsById[String(truckInstanceId || "").trim()];
      if (!flow || !truckUnit || flow.origin_id !== hqCityId || !truckSupportsFlow(truckUnit.truck, flow)) {
        return null;
      }
      return {
        flow,
        truckUnit,
        preparedEntry: null,
      };
    })
    .filter(Boolean);
}

function autoAssignContractsForTruckUnits(playerId, hqCityId, truckUnits, limit = truckUnits.length) {
  const availableFlows = [...(state.outboundFreightsByCityId[hqCityId] || [])]
    .filter((flow) => getTrack(flow.origin_id, flow.destination_id)?.points?.length)
    .sort((left, right) => flowScore(right) - flowScore(left));
  const usedFlowIds = new Set();
  const specs = [];

  truckUnits.forEach((truckUnit) => {
    if (specs.length >= limit) {
      return;
    }
    const nextFlow = availableFlows.find((flow) => !usedFlowIds.has(flow.id) && truckSupportsFlow(truckUnit.truck, flow));
    if (!nextFlow) {
      return;
    }
    usedFlowIds.add(nextFlow.id);
    specs.push({ flow: nextFlow, truckUnit, preparedEntry: null });
  });

  if (specs.length >= limit) {
    return {
      truckUnits,
      contractSpecs: specs,
    };
  }

  availableFlows.forEach((flow) => {
    if (specs.length >= limit || usedFlowIds.has(flow.id)) {
      return;
    }
    const truck = bestTruckForFlow(flow);
    if (!truck) {
      return;
    }
    const displayNumber = truckUnits.length + 1;
    const truckUnit = buildTruckUnit(playerId, truck, displayNumber, hqCityId);
    truckUnits.push(truckUnit);
    usedFlowIds.add(flow.id);
    specs.push({ flow, truckUnit, preparedEntry: null });
  });

  return {
    truckUnits,
    contractSpecs: specs,
  };
}

function buildHumanPlayerConfig() {
  const snapshot = state.snapshot || {};
  const company = snapshot.company && typeof snapshot.company === "object" ? snapshot.company : {};
  const hqCityId = state.citiesById[String(company.hqCityId || "").trim()]
    ? String(company.hqCityId || "").trim()
    : preferredHumanHqCityId();
  const baseTruckUnits = normalizeSnapshotTruckUnits(snapshot, hqCityId);
  const baseSpecs = buildContractSpecsFromSnapshot(snapshot, baseTruckUnits, hqCityId);
  const assignmentPlan = baseSpecs.length
    ? { truckUnits: baseTruckUnits, contractSpecs: baseSpecs }
    : autoAssignContractsForTruckUnits("human", hqCityId, baseTruckUnits, Math.max(2, baseTruckUnits.length || 2));

  const prepared = Boolean(
    company.hqPurchased
    && company.fleetPurchased
    && Array.isArray(snapshot.selectedTruckInstances)
    && snapshot.selectedTruckInstances.length
    && assignmentPlan.contractSpecs.length,
  );

  return {
    id: "human",
    label: String(company.name || "Brasix").trim() || "Brasix",
    color: /^#[0-9a-fA-F]{6}$/.test(String(company.color || "").trim())
      ? String(company.color || "").trim().toLowerCase()
      : "#356d63",
    isHuman: true,
    hqCityId,
    truckUnits: assignmentPlan.truckUnits,
    contractSpecs: assignmentPlan.contractSpecs,
    cashBrl: Number.isFinite(Number(snapshot?.economy?.remaining_cash_brl))
      ? Number(snapshot.economy.remaining_cash_brl)
      : Number.isFinite(Number(snapshot?.economy?.initial_cash_brl))
        ? Number(snapshot.economy.initial_cash_brl)
        : openingCashForDifficulty(snapshot?.difficulty),
    startingCashBrl: Number.isFinite(Number(snapshot?.economy?.initial_cash_brl))
      ? Number(snapshot.economy.initial_cash_brl)
      : openingCashForDifficulty(snapshot?.difficulty),
    prepared,
    note: prepared ? "Preparacao salva" : "Abertura automatica",
  };
}

function buildRobotPlayerConfigs(humanHqCityId) {
  const candidateCities = [...state.cities]
    .filter((city) => city.id !== humanHqCityId)
    .sort((left, right) => cityOpportunityScore(right) - cityOpportunityScore(left));

  return ROBOT_NAMES.map((name, index) => {
    const city = candidateCities[index] || candidateCities[0] || state.cities[0] || null;
    const hqCityId = city?.id || humanHqCityId;
    const assignmentPlan = autoAssignContractsForTruckUnits(`robot-${index + 1}`, hqCityId, [], 2);
    return {
      id: `robot-${index + 1}`,
      label: name,
      color: ROBOT_COLORS[index] || ROBOT_COLORS[ROBOT_COLORS.length - 1],
      isHuman: false,
      hqCityId,
      truckUnits: assignmentPlan.truckUnits,
      contractSpecs: assignmentPlan.contractSpecs,
      cashBrl: roundNumber(openingCashForDifficulty("standard") * (0.88 + (index * 0.08)), 0),
      startingCashBrl: roundNumber(openingCashForDifficulty("standard") * (0.88 + (index * 0.08)), 0),
      prepared: true,
      note: "Operacao automatica",
    };
  }).filter((config) => config.hqCityId && config.truckUnits.length && config.contractSpecs.length);
}

function contractStatusLabel(contract) {
  return {
    repositioning: "Reposicionando",
    loading: "Carregando",
    outbound: "Em rota",
    unloading: "Descargando",
    returning: "Retornando",
  }[contract.stage] || "Em operacao";
}

function currentTrackForContract(contract) {
  return {
    repositioning: contract.repositionTrack,
    loading: contract.deliveryTrack,
    outbound: contract.deliveryTrack,
    unloading: contract.deliveryTrack,
    returning: contract.returnTrack,
  }[contract.stage] || contract.deliveryTrack;
}

function updateContractPosition(contract) {
  const track = currentTrackForContract(contract);
  if (!track) {
    contract.position = null;
    return;
  }
  if (["loading", "unloading"].includes(contract.stage)) {
    contract.position = contract.stage === "loading" ? trackStartPoint(contract.deliveryTrack) : trackEndPoint(contract.deliveryTrack);
    return;
  }
  const durationHours = Math.max(contract.stageDurationHours, 0.0001);
  const ratio = clamp(contract.stageElapsedHours / durationHours, 0, 1);
  contract.position = trackPoint(track, ratio);
}

function appendLog(playerId, tone, message) {
  state.logs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    playerId,
    tone,
    message,
    timeLabel: formatClock(state.simulation.currentTime),
    timestamp: state.simulation.currentTime.getTime(),
  });
  state.logs = state.logs.slice(0, 14);
}

function transitionContractStage(player, contract) {
  if (contract.stage === "repositioning") {
    contract.truckUnit.currentCityId = contract.flow.origin_id;
    contract.stage = "loading";
    contract.stageDurationHours = contract.loadHours;
    contract.stageElapsedHours = 0;
    contract.position = trackStartPoint(contract.deliveryTrack);
    return;
  }

  if (contract.stage === "loading") {
    contract.stage = "outbound";
    contract.stageDurationHours = Math.max(contract.deliveryTrack?.durationHours || 0, 0.2);
    contract.stageElapsedHours = 0;
    contract.position = trackStartPoint(contract.deliveryTrack);
    return;
  }

  if (contract.stage === "outbound") {
    contract.truckUnit.currentCityId = contract.flow.destination_id;
    contract.deliveriesCompleted += 1;
    player.deliveries += 1;
    player.tonnesMoved += contract.payloadTons;
    player.cashBrl = roundNumber(player.cashBrl + contract.profitPerDeliveryBrl, 2);
    appendLog(
      player.id,
      contract.profitPerDeliveryBrl >= 0 ? "positive" : "negative",
      `${player.label} entregou ${contract.flow.product_name || "carga"} em ${cityLabel(contract.flow.destination_id)} (${formatCurrency(contract.profitPerDeliveryBrl)}).`,
    );
    contract.stage = "unloading";
    contract.stageDurationHours = contract.unloadHours;
    contract.stageElapsedHours = 0;
    contract.position = trackEndPoint(contract.deliveryTrack);
    return;
  }

  if (contract.stage === "unloading") {
    contract.stage = "returning";
    contract.stageDurationHours = Math.max(contract.returnTrack?.durationHours || 0, 0.2);
    contract.stageElapsedHours = 0;
    contract.position = trackStartPoint(contract.returnTrack);
    return;
  }

  contract.truckUnit.currentCityId = contract.flow.origin_id;
  contract.stage = "loading";
  contract.stageDurationHours = contract.loadHours;
  contract.stageElapsedHours = 0;
  contract.position = trackStartPoint(contract.deliveryTrack);
}

function advanceContract(player, contract, deltaHours) {
  let remainingHours = Math.max(0, Number(deltaHours || 0));
  while (remainingHours > 0) {
    const stageBudget = Math.max(contract.stageDurationHours, 0.0001);
    const remainingStageHours = Math.max(0, stageBudget - contract.stageElapsedHours);
    const consumedHours = Math.min(remainingHours, remainingStageHours || stageBudget);
    contract.stageElapsedHours += consumedHours;
    remainingHours -= consumedHours;
    updateContractPosition(contract);

    if (contract.stageElapsedHours + 0.0001 >= stageBudget) {
      transitionContractStage(player, contract);
    }
  }
}

function createContractState(player, spec, index) {
  const flow = spec.flow;
  const truckUnit = spec.truckUnit;
  const truck = truckUnit.truck || state.trucksById[truckUnit.truckId] || null;
  const deliveryTrack = getTrack(flow.origin_id, flow.destination_id, "fastest");
  const returnTrack = getTrack(flow.destination_id, flow.origin_id, "fastest");
  const repositionTrack = truckUnit.currentCityId && truckUnit.currentCityId !== flow.origin_id
    ? getTrack(truckUnit.currentCityId, flow.origin_id, "fastest")
    : null;
  const payloadTons = flowPayloadTons(flow, truck, spec.preparedEntry);
  const revenuePerDeliveryBrl = estimateDeliveryRevenue(flow, truck, player, spec.preparedEntry, deliveryTrack.distanceKm);
  const cycleCostBrl = estimateCycleCost(flow, truck, payloadTons, deliveryTrack.distanceKm);
  const startingStage = repositionTrack && repositionTrack.distanceKm > 0.2 ? "repositioning" : "loading";
  const loadHours = loadHoursForTruck(truck);
  const unloadHours = unloadHoursForTruck(truck);

  const contract = {
    id: `${player.id}-contract-${index + 1}`,
    flowId: flow.id,
    flow,
    truck,
    truckUnit,
    truckUnitId: truckUnit.id,
    payloadTons,
    revenuePerDeliveryBrl,
    cycleCostBrl,
    profitPerDeliveryBrl: roundNumber(revenuePerDeliveryBrl - cycleCostBrl, 2),
    deliveryTrack,
    returnTrack,
    repositionTrack,
    loadHours,
    unloadHours,
    stage: startingStage,
    stageDurationHours: startingStage === "repositioning"
      ? Math.max(repositionTrack?.durationHours || 0, 0.2)
      : loadHours,
    stageElapsedHours: 0,
    deliveriesCompleted: 0,
    position: null,
  };
  updateContractPosition(contract);
  return contract;
}

function createPlayer(config) {
  const truckUnits = config.truckUnits.map((truckUnit) => ({ ...truckUnit }));
  const truckUnitsById = Object.fromEntries(truckUnits.map((truckUnit) => [truckUnit.id, truckUnit]));
  const player = {
    id: config.id,
    label: config.label,
    color: config.color,
    isHuman: Boolean(config.isHuman),
    hqCityId: config.hqCityId,
    cashBrl: Number(config.cashBrl || 0),
    startingCashBrl: Number(config.startingCashBrl || config.cashBrl || 0),
    prepared: Boolean(config.prepared),
    note: config.note || "",
    truckUnits,
    contracts: [],
    deliveries: 0,
    tonnesMoved: 0,
  };
  player.contracts = config.contractSpecs.map((spec, index) => createContractState(player, {
    ...spec,
    truckUnit: truckUnitsById[spec.truckUnit.id] || spec.truckUnit,
  }, index));
  return player;
}

function buildPlayers() {
  const humanConfig = buildHumanPlayerConfig();
  const robotConfigs = buildRobotPlayerConfigs(humanConfig.hqCityId);
  const players = [humanConfig, ...robotConfigs].map(createPlayer);
  state.players = players;
  state.playersById = Object.fromEntries(players.map((player) => [player.id, player]));
  state.humanPrepared = Boolean(players[0]?.prepared);
  state.activeDrawerPlayerId = players[0]?.id || "";
  state.focusedPlayerId = players[0]?.id || "";

  appendLog("system", "neutral", `${state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa"} carregado.`);
  appendLog(players[0]?.id || "human", state.humanPrepared ? "positive" : "neutral", state.humanPrepared
    ? "Preparacao carregada na partida."
    : "Preparacao nao foi encontrada; a operacao abriu com selecao automatica.");
}

function ensureMap() {
  if (state.map || !refs.mapStage || !state.bootstrap?.map_viewport) {
    return;
  }
  state.map = createBrasixMap({
    elementId: "game-runtime-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
  });
  applyBrasixLeafletSettings(state.map, state.bootstrap.map_viewport, state.bootstrap.map_editor?.leaflet_settings || {});
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
}

function renderNetworkLayer() {
  ensureMap();
  if (!state.map) {
    return;
  }
  if (state.layers.network) {
    return;
  }

  const layerGroup = window.L.layerGroup();
  state.edges.forEach((edge) => {
    const routeLayer = createRouteLayer({
      edge,
      citiesById: state.nodesById,
      surfaceType: state.surfaceTypesById[edge.surface_type_id] || null,
      role: "network",
      styleOverrides: { opacityScale: NETWORK_OPACITY_SCALE },
    });
    if (routeLayer) {
      layerGroup.addLayer(routeLayer);
    }
  });
  layerGroup.addTo(state.map);
  state.layers.network = layerGroup;
}

function focusPlayerCityIds(player) {
  const ids = new Set([player?.hqCityId].filter(Boolean));
  (player?.contracts || []).forEach((contract) => {
    ids.add(contract.flow.origin_id);
    ids.add(contract.flow.destination_id);
  });
  return ids;
}

function renderCityMarkers() {
  ensureMap();
  if (!state.map) {
    return;
  }
  if (state.layers.cities) {
    state.map.removeLayer(state.layers.cities);
  }
  const layerGroup = window.L.layerGroup();
  const focusedPlayer = state.playersById[state.focusedPlayerId] || state.players[0] || null;
  const focusedCityIds = focusPlayerCityIds(focusedPlayer);

  state.cities.forEach((city) => {
    const ownerPlayer = state.players.find((player) => player.hqCityId === city.id) || null;
    const band = findPopulationBand(city, state.populationBands);
    const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
    const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
    const selected = Boolean(ownerPlayer || focusedCityIds.has(city.id));
    const marker = createCityMarker({
      city,
      band: selected
        ? { ...(band || {}), marker_size_px: Math.round(baseMarkerSize * 1.28) }
        : { ...(band || {}), marker_size_px: Math.max(8, Math.round(baseMarkerSize * 0.8)) },
      pin,
      fillColor: ownerPlayer?.color || "#5d726c",
      strokeColor: selected ? "#ffffff" : "#f7f1df",
      contrastFillColor: "#fff9ea",
      selectedHaloFillColor: "#ffffff",
      selectedHaloStrokeColor: ownerPlayer?.color || "#356d63",
      selected,
      opacity: selected ? 0.96 : 0.56,
    });
    layerGroup.addLayer(marker);
  });

  layerGroup.addTo(state.map);
  state.layers.cities = layerGroup;
}

function renderHighlightedRoutes() {
  ensureMap();
  if (!state.map) {
    return;
  }
  if (state.layers.highlights) {
    state.map.removeLayer(state.layers.highlights);
  }
  const player = state.playersById[state.focusedPlayerId] || state.players[0] || null;
  if (!player) {
    state.layers.highlights = null;
    return;
  }

  const uniqueEdgeIds = new Set();
  const layerGroup = window.L.layerGroup();
  player.contracts.forEach((contract) => {
    (contract.deliveryTrack?.edgeIds || []).forEach((edgeId) => {
      if (uniqueEdgeIds.has(edgeId)) {
        return;
      }
      uniqueEdgeIds.add(edgeId);
      const edge = state.edgesById[edgeId];
      const routeLayer = edge ? createRouteLayer({
        edge,
        citiesById: state.nodesById,
        surfaceType: state.surfaceTypesById[edge.surface_type_id] || null,
        role: "highlight",
        styleOverrides: {
          highlightColor: player.color,
          highlightOverlayColor: "#fff9ea",
        },
      }) : null;
      if (routeLayer) {
        layerGroup.addLayer(routeLayer);
      }
    });
  });
  layerGroup.addTo(state.map);
  state.layers.highlights = layerGroup;
}

function vehicleIconStateKey(player, contract) {
  return `${player.color}:${contract.stage}:${contract.truckUnit.displayNumber}`;
}

function buildVehicleIcon(player, contract) {
  return window.L.divIcon({
    className: "game-runtime-vehicle-icon-shell",
    html: `
      <div class="game-runtime-vehicle-icon is-${escapeHtml(contract.stage)}" style="--player-color:${escapeHtml(player.color)}">
        <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
        <small>#${escapeHtml(formatInteger(contract.truckUnit.displayNumber))}</small>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function syncVehicleMarkers({ refreshIcons = false } = {}) {
  ensureMap();
  if (!state.map) {
    return;
  }
  if (!state.layers.vehicles) {
    state.layers.vehicles = window.L.layerGroup().addTo(state.map);
  }

  const activeTruckIds = new Set();
  state.players.forEach((player) => {
    player.contracts.forEach((contract) => {
      activeTruckIds.add(contract.truckUnitId);
      const position = contract.position || trackStartPoint(contract.deliveryTrack) || null;
      if (!position) {
        return;
      }
      const nextStateKey = vehicleIconStateKey(player, contract);
      let marker = state.vehicleMarkersByTruckId[contract.truckUnitId] || null;
      if (!marker) {
        marker = window.L.marker([position.lat, position.lng], {
          icon: buildVehicleIcon(player, contract),
          title: `${player.label} ${contract.flow.product_name || "Carga"}`,
          keyboard: false,
          zIndexOffset: 1400,
        });
        marker.__stateKey = nextStateKey;
        state.layers.vehicles.addLayer(marker);
        state.vehicleMarkersByTruckId[contract.truckUnitId] = marker;
      }
      if (refreshIcons || marker.__stateKey !== nextStateKey) {
        marker.setIcon(buildVehicleIcon(player, contract));
        marker.__stateKey = nextStateKey;
      }
      marker.setLatLng([position.lat, position.lng]);
    });
  });

  Object.entries(state.vehicleMarkersByTruckId).forEach(([truckUnitId, marker]) => {
    if (activeTruckIds.has(truckUnitId)) {
      return;
    }
    state.layers.vehicles.removeLayer(marker);
    delete state.vehicleMarkersByTruckId[truckUnitId];
  });
}

function playerCashDelta(player) {
  return roundNumber(Number(player.cashBrl || 0) - Number(player.startingCashBrl || 0), 0);
}

function playerActiveContractCount(player) {
  return Array.isArray(player?.contracts) ? player.contracts.length : 0;
}

function playerIdleTruckCount(player) {
  const busyIds = new Set((player?.contracts || []).map((contract) => contract.truckUnitId));
  return (player?.truckUnits || []).filter((truckUnit) => !busyIds.has(truckUnit.id)).length;
}

function renderStatus() {
  if (!refs.status) {
    return;
  }
  refs.status.innerHTML = `
    <span class="game-runtime-status-pill">${escapeHtml(state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa ativo")}</span>
    <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.players.length)} jogadores`)}</span>
    <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.runtime?.metadata?.route_edge_count || state.edges.length)} rotas`)}</span>
    <span class="game-runtime-status-pill ${state.humanPrepared ? "is-ready" : "is-draft"}">${escapeHtml(state.humanPrepared ? "Preparacao salva" : "Abertura automatica")}</span>
  `;
}

function renderClock() {
  if (refs.clock) {
    refs.clock.textContent = formatClock(state.simulation.currentTime);
  }
}

function humanHighlightsMarkup(player) {
  const activeContracts = player.contracts.slice(0, 3);
  if (!activeContracts.length) {
    return `<div class="truck-gallery-empty">Sem contratos ativos para a empresa principal.</div>`;
  }
  return activeContracts.map((contract) => `
    <article class="game-runtime-contract-chip" style="--player-color:${escapeHtml(player.color)}">
      <div>
        <strong>${escapeHtml(`${contract.flow.product_name || "Carga"} · ${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`)}</strong>
        <small>${escapeHtml(`${contractStatusLabel(contract)} · entrega ${formatCurrency(contract.profitPerDeliveryBrl)} · ETA ${formatHours(Math.max(0, contract.stageDurationHours - contract.stageElapsedHours))}`)}</small>
      </div>
      <span>${escapeHtml(formatTonnes(contract.payloadTons))}</span>
    </article>
  `).join("");
}

function renderHumanHud() {
  if (!refs.humanHud) {
    return;
  }
  const player = state.playersById.human || state.players[0] || null;
  if (!player) {
    refs.humanHud.innerHTML = `<div class="truck-gallery-empty">Empresa principal indisponivel.</div>`;
    return;
  }

  refs.humanHud.innerHTML = `
    <div class="game-runtime-panel-head">
      <div class="game-runtime-panel-title">
        <strong>${escapeHtml(player.label)}</strong>
        <span>${escapeHtml(`${cityLabel(player.hqCityId)} · ${player.note || "Operacao ativa"}`)}</span>
      </div>
      <button class="ghost-button game-runtime-mini-action" type="button" data-focus-player-id="${escapeHtml(player.id)}">
        <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
        <span>Focar</span>
      </button>
    </div>

    ${state.humanPrepared ? "" : `
      <div class="game-runtime-inline-alert is-warning">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        <div>
          <strong>Preparacao nao fechada</strong>
          <span>O jogo abriu com a melhor composicao disponivel.</span>
        </div>
      </div>
    `}

    <div class="game-runtime-metric-grid">
      <article class="game-runtime-metric-card">
        <span>Caixa</span>
        <strong>${escapeHtml(formatCurrency(player.cashBrl))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Frota</span>
        <strong>${escapeHtml(formatInteger(player.truckUnits.length))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Fretes</span>
        <strong>${escapeHtml(formatInteger(playerActiveContractCount(player)))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Entregas</span>
        <strong>${escapeHtml(formatInteger(player.deliveries))}</strong>
      </article>
    </div>

    <div class="game-runtime-inline-stack">
      ${humanHighlightsMarkup(player)}
    </div>

    <div class="game-runtime-panel-footer">
      <a class="ghost-button game-runtime-mini-link" href="/jogo/preparacao" target="_blank" rel="noopener noreferrer">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        <span>Preparacao</span>
      </a>
    </div>
  `;
}

function renderLogPanel() {
  if (!refs.logPanel) {
    return;
  }
  const logMarkup = state.logs.length
    ? state.logs.slice(0, 8).map((entry) => `
      <article class="game-runtime-log-line is-${escapeHtml(entry.tone || "neutral")}">
        <div>
          <strong>${escapeHtml(entry.timeLabel)}</strong>
          <span>${escapeHtml(entry.message)}</span>
        </div>
      </article>
    `).join("")
    : `<div class="truck-gallery-empty">Sem eventos recentes.</div>`;

  refs.logPanel.innerHTML = `
    <div class="game-runtime-panel-head">
      <div class="game-runtime-panel-title">
        <strong>Log</strong>
        <span>${escapeHtml(`${state.runtime?.metadata?.city_count || state.cities.length} cidades · ${state.runtime?.metadata?.route_edge_count || state.edges.length} rotas`)}</span>
      </div>
    </div>
    <div class="game-runtime-log-list">
      ${logMarkup}
    </div>
  `;
}

function playerCardMarkup(player) {
  return `
    <button class="game-runtime-player-card${player.id === state.activeDrawerPlayerId ? " is-active" : ""}${player.id === state.focusedPlayerId ? " is-focused" : ""}" type="button" data-player-id="${escapeHtml(player.id)}" style="--player-color:${escapeHtml(player.color)}">
      <div class="game-runtime-player-card-top">
        <div>
          <strong>${escapeHtml(player.label)}</strong>
          <span>${escapeHtml(cityLabel(player.hqCityId))}</span>
        </div>
        <small>${escapeHtml(player.isHuman ? "Jogador" : "Robot")}</small>
      </div>
      <div class="game-runtime-player-card-metrics">
        <span>${escapeHtml(formatCurrency(player.cashBrl))}</span>
        <span>${escapeHtml(`${formatInteger(player.truckUnits.length)} cam`)}</span>
        <span>${escapeHtml(`${formatInteger(player.deliveries)} ent`)}</span>
      </div>
    </button>
  `;
}

function renderPlayerBar() {
  if (!refs.playerBar) {
    return;
  }
  refs.playerBar.innerHTML = state.players.map(playerCardMarkup).join("");
}

function contractProgressRatio(contract) {
  return clamp(contract.stageElapsedHours / Math.max(contract.stageDurationHours, 0.0001), 0, 1);
}

function truckRowMarkup(player, truckUnit) {
  const contract = player.contracts.find((item) => item.truckUnitId === truckUnit.id) || null;
  if (!contract) {
    return `
      <article class="game-runtime-truck-row is-idle">
        <div>
          <strong>${escapeHtml(`${truckUnit.truck.short_label || truckUnit.truck.label || truckUnit.truckId} #${formatInteger(truckUnit.displayNumber)}`)}</strong>
          <span>${escapeHtml(`Parado em ${cityLabel(truckUnit.currentCityId || player.hqCityId)}`)}</span>
        </div>
        <small>${escapeHtml(formatTonnes(payloadTonsForTruck(truckUnit.truck)))}</small>
      </article>
    `;
  }
  return `
    <article class="game-runtime-truck-row" style="--player-color:${escapeHtml(player.color)}">
      <div>
        <strong>${escapeHtml(`${truckUnit.truck.short_label || truckUnit.truck.label || truckUnit.truckId} #${formatInteger(truckUnit.displayNumber)}`)}</strong>
        <span>${escapeHtml(`${contractStatusLabel(contract)} · ${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`)}</span>
      </div>
      <small>${escapeHtml(formatTonnes(contract.payloadTons))}</small>
    </article>
  `;
}

function contractRowMarkup(player, contract) {
  const etaHours = Math.max(0, contract.stageDurationHours - contract.stageElapsedHours);
  return `
    <article class="game-runtime-contract-row" style="--player-color:${escapeHtml(player.color)}">
      <div class="game-runtime-contract-row-top">
        <strong>${escapeHtml(`${contract.flow.product_name || "Carga"} · ${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`)}</strong>
        <small>${escapeHtml(contractStatusLabel(contract))}</small>
      </div>
      <div class="game-runtime-contract-row-meta">
        <span>${escapeHtml(`${formatTonnes(contract.payloadTons)} · ${formatDistanceKm(contract.deliveryTrack.distanceKm)}`)}</span>
        <span>${escapeHtml(`ETA ${formatHours(etaHours)}`)}</span>
        <span>${escapeHtml(`Lucro ${formatCurrency(contract.profitPerDeliveryBrl)}`)}</span>
      </div>
      <div class="game-runtime-progress">
        <span style="width:${escapeHtml(String(Math.round(contractProgressRatio(contract) * 100)))}%"></span>
      </div>
    </article>
  `;
}

function renderDrawer() {
  if (!refs.drawer) {
    return;
  }
  const player = state.playersById[state.activeDrawerPlayerId] || null;
  if (!player) {
    refs.drawer.hidden = true;
    refs.drawer.innerHTML = "";
    return;
  }

  refs.drawer.hidden = false;
  refs.drawer.innerHTML = `
    <div class="game-runtime-drawer-head">
      <div class="game-runtime-panel-title">
        <strong>${escapeHtml(player.label)}</strong>
        <span>${escapeHtml(`${cityLabel(player.hqCityId)} · ${player.isHuman ? "Operacao humana" : "Operacao robotica"}`)}</span>
      </div>
      <div class="game-runtime-drawer-actions">
        <button class="ghost-button game-runtime-mini-action" type="button" data-focus-player-id="${escapeHtml(player.id)}">
          <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
          <span>Focar</span>
        </button>
        <button class="editor-header-action game-runtime-mini-action" type="button" data-close-drawer="true">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          <span>Fechar</span>
        </button>
      </div>
    </div>

    <div class="game-runtime-drawer-grid">
      <section class="game-runtime-drawer-section">
        <div class="game-runtime-drawer-summary-grid">
          <article class="game-runtime-summary-box">
            <span>Caixa</span>
            <strong>${escapeHtml(formatCurrency(player.cashBrl))}</strong>
          </article>
          <article class="game-runtime-summary-box">
            <span>Saldo</span>
            <strong class="${playerCashDelta(player) >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatCurrency(playerCashDelta(player)))}</strong>
          </article>
          <article class="game-runtime-summary-box">
            <span>Entregas</span>
            <strong>${escapeHtml(formatInteger(player.deliveries))}</strong>
          </article>
          <article class="game-runtime-summary-box">
            <span>Toneladas</span>
            <strong>${escapeHtml(formatTonnes(player.tonnesMoved))}</strong>
          </article>
        </div>
      </section>

      <section class="game-runtime-drawer-section">
        <div class="game-runtime-drawer-section-head">
          <strong>Caminhoes</strong>
          <span>${escapeHtml(`${formatInteger(playerIdleTruckCount(player))} parados`)}</span>
        </div>
        <div class="game-runtime-drawer-stack">
          ${(player.truckUnits || []).map((truckUnit) => truckRowMarkup(player, truckUnit)).join("") || `<div class="truck-gallery-empty">Sem frota ativa.</div>`}
        </div>
      </section>

      <section class="game-runtime-drawer-section">
        <div class="game-runtime-drawer-section-head">
          <strong>Contratos</strong>
          <span>${escapeHtml(`${formatInteger(playerActiveContractCount(player))} ativos`)}</span>
        </div>
        <div class="game-runtime-drawer-stack">
          ${(player.contracts || []).map((contract) => contractRowMarkup(player, contract)).join("") || `<div class="truck-gallery-empty">Sem contratos ativos.</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderStaticUi() {
  renderStatus();
  renderSpeedControls();
  renderClock();
  renderHumanHud();
  renderLogPanel();
  renderPlayerBar();
  renderDrawer();
}

function renderDynamicUi() {
  renderClock();
  renderHumanHud();
  renderLogPanel();
  renderPlayerBar();
  renderDrawer();
}

function renderMapUi({ refreshIcons = false } = {}) {
  renderNetworkLayer();
  renderCityMarkers();
  renderHighlightedRoutes();
  syncVehicleMarkers({ refreshIcons });
}

function focusPlayerOnMap(player) {
  ensureMap();
  if (!state.map || !player) {
    return;
  }
  const positions = [];
  const hqCity = state.citiesById[player.hqCityId] || null;
  if (hqCity) {
    positions.push([hqCity.latitude, hqCity.longitude]);
  }
  player.contracts.forEach((contract) => {
    if (contract.position) {
      positions.push([contract.position.lat, contract.position.lng]);
    }
  });
  if (!positions.length) {
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    return;
  }
  state.map.fitBounds(positions, {
    padding: [48, 48],
    maxZoom: 7,
    animate: true,
  });
}

function setFocusedPlayer(playerId, { closeDrawer = false } = {}) {
  const player = state.playersById[playerId] || null;
  if (!player) {
    return;
  }
  state.focusedPlayerId = player.id;
  state.activeDrawerPlayerId = closeDrawer ? "" : player.id;
  renderPlayerBar();
  renderDrawer();
  renderCityMarkers();
  renderHighlightedRoutes();
  focusPlayerOnMap(player);
}

function handleClicks(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const speedButton = target.closest("[data-speed-id]");
  if (speedButton) {
    setSpeed(speedButton.getAttribute("data-speed-id") || "pause");
    return;
  }

  if (target === refs.themeToggle || target.closest("#game-runtime-theme-toggle")) {
    setTheme(document.documentElement.dataset.editorTheme === "night" ? "day" : "night");
    return;
  }

  const playerButton = target.closest("[data-player-id]");
  if (playerButton) {
    const playerId = playerButton.getAttribute("data-player-id") || "";
    if (playerId === state.activeDrawerPlayerId) {
      state.activeDrawerPlayerId = "";
      renderPlayerBar();
      renderDrawer();
    } else {
      setFocusedPlayer(playerId);
    }
    return;
  }

  const focusButton = target.closest("[data-focus-player-id]");
  if (focusButton) {
    setFocusedPlayer(focusButton.getAttribute("data-focus-player-id") || "");
    return;
  }

  const closeDrawerButton = target.closest("[data-close-drawer]");
  if (closeDrawerButton) {
    state.activeDrawerPlayerId = "";
    renderPlayerBar();
    renderDrawer();
  }
}

function bindEvents() {
  document.addEventListener("click", handleClicks);
  window.addEventListener("resize", () => {
    if (state.map) {
      state.map.invalidateSize();
    }
  });
  window.addEventListener("beforeunload", () => {
    if (state.simulation.timerId) {
      window.clearInterval(state.simulation.timerId);
      state.simulation.timerId = null;
    }
  });
}

function tickSimulation() {
  const now = performance.now();
  if (!state.simulation.lastRealTimestamp) {
    state.simulation.lastRealTimestamp = now;
    return;
  }
  const deltaSeconds = Math.max(0, (now - state.simulation.lastRealTimestamp) / 1000);
  state.simulation.lastRealTimestamp = now;

  const speed = speedOptionById(state.simulation.speedId);
  const deltaHours = deltaSeconds * speed.hours_per_second;
  if (deltaHours > 0) {
    state.simulation.currentTime = new Date(state.simulation.currentTime.getTime() + (deltaHours * 60 * 60 * 1000));
    state.players.forEach((player) => {
      player.contracts.forEach((contract) => advanceContract(player, contract, deltaHours));
    });
  }

  renderDynamicUi();
  syncVehicleMarkers();
}

function startSimulation() {
  if (state.simulation.timerId) {
    window.clearInterval(state.simulation.timerId);
  }
  state.simulation.lastRealTimestamp = performance.now();
  state.simulation.timerId = window.setInterval(tickSimulation, SIMULATION_TICK_MS);
}

async function initialize() {
  setTheme(getStoredTheme(), { persist: false });
  const [bootstrapPayload, runtimePayload] = await Promise.all([
    fetchJson("/api/jogo/preparacao/bootstrap"),
    fetchJson("/api/game/runtime"),
    waitForLeaflet(),
  ]);

  normalizeBootstrap(bootstrapPayload, runtimePayload);
  buildPlayers();
  bindEvents();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  focusPlayerOnMap(state.playersById[state.focusedPlayerId] || state.players[0] || null);
  startSimulation();
}

initialize().catch((error) => {
  console.error("Brasix game runtime initialization failed:", error);
  throw error;
});