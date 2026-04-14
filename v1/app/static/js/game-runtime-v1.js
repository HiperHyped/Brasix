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
import { buildOpeningContextState } from "./shared/opening-pricing.js?v=20260413-opening-2";

const RUNTIME_CONFIG = {
  version: "1.0",
  openingWizard: false,
  fuelSystem: false,
  advancedDispatch: false,
  exclusiveFreights: false,
  runtimeTruckMarket: false,
  ...(window.__BRASIX_GAME_RUNTIME_CONFIG__ && typeof window.__BRASIX_GAME_RUNTIME_CONFIG__ === "object"
    ? window.__BRASIX_GAME_RUNTIME_CONFIG__
    : {}),
};

const THEME_KEY = "brasix:v1:game-runtime-theme";
const GAME_SESSION_SNAPSHOT_KEY = "brasix:v1:game-session-snapshot";
const FALLBACK_THEME_KEYS = ["brasix:v1:game-setup-theme", "brasix:v1:editors-hub-theme"];
const COMPANY_LOGO_OPTIONS = [
  { id: "local_shipping", icon: "local_shipping", label: "Carga" },
  { id: "apartment", icon: "apartment", label: "Sede" },
  { id: "alt_route", icon: "alt_route", label: "Rotas" },
  { id: "precision_manufacturing", icon: "precision_manufacturing", label: "Industria" },
  { id: "agriculture", icon: "agriculture", label: "Agro" },
  { id: "forest", icon: "forest", label: "Florestal" },
  { id: "anchor", icon: "anchor", label: "Porto" },
  { id: "bolt", icon: "bolt", label: "Energia" },
  { id: "warehouse", icon: "warehouse", label: "Armazem" },
  { id: "route", icon: "route", label: "Corredor" },
  { id: "flight", icon: "flight", label: "Aereo" },
  { id: "train", icon: "train", label: "Ferrovia" },
];
const SIZE_TIER_LABELS = {
  super_leve: "Super-leve",
  leve: "Leve",
  medio: "Medio",
  pesado: "Pesado",
  super_pesado: "Super-pesado",
};
const DIFFICULTY_OPTIONS = {
  hard: "Dificil",
  standard: "Padrao",
  sandbox: "Sandbox",
};
const SIZE_TIER_ORDER = ["super_leve", "leve", "medio", "pesado", "super_pesado", "especial"];
const DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL = 1000000;
const RECOMMENDED_FREIGHT_LIMIT = 4;
const MIN_ROBOT_COUNT = 2;
const MAX_ROBOT_COUNT = 20;
const GAME_SETUP_TRUCK_ID_SEED = `${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
const SPEED_OPTIONS = [
  { id: "pause", label: "Pausa", hours_per_second: 0 },
  { id: "x1", label: "1x", hours_per_second: 0.35 },
  { id: "x4", label: "4x", hours_per_second: 1.4 },
  { id: "x12", label: "12x", hours_per_second: 4.2 },
];
const ROBOT_NAMES = [
  "Norte Cargo",
  "Centro Sul",
  "Atlas Leste",
  "Vetor Oeste",
  "Linha Solar",
  "Faixa Azul",
  "Rota Violeta",
  "Mercurio Log",
  "Pico Ambar",
  "Cais Rubi",
  "Nexo Norte",
  "Costa Dourada",
  "Triada Log",
  "Arco Verde",
  "Sertao Cargo",
  "Vale Expresso",
  "Horizonte Sul",
  "Ponte Alta",
  "Nova Faixa",
  "Carga Prisma",
];
const ROBOT_COLORS = [
  "#d83a4b",
  "#2f66ff",
  "#14a44d",
  "#f0c808",
  "#ff7f11",
  "#12b5cb",
  "#8f4fff",
  "#ff4f8b",
  "#00a87e",
  "#c55a11",
  "#7453ff",
  "#0d8ecf",
  "#7a9e1b",
  "#ff6f3c",
  "#9d4edd",
  "#118ab2",
  "#ef476f",
  "#2a9d8f",
  "#bc6c25",
  "#577590",
];
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
  completedFreightAssignmentsById: {},
  outboundFreightsByCityId: {},
  inboundFreightsByCityId: {},
  cityMarketStatsById: {},
  openingContextByCityId: {},
  openingPriceRange: { min: 0, max: 0 },
  productPriceReferenceMedian: 0,
  trackCache: {},
  players: [],
  playersById: {},
  activeDrawerPlayerId: "",
  focusedPlayerId: "human",
  humanPrepared: false,
  logs: [],
  contractSequence: 1,
  setup: {
    openingWizard: Boolean(RUNTIME_CONFIG.openingWizard),
    activeModal: "",
    selectedDifficulty: "standard",
    robotCount: 3,
    company: {
      name: "Brasix",
      color: "#356d63",
      logoId: COMPANY_LOGO_OPTIONS[0].id,
      hqCityId: "",
      hqPurchased: false,
      fleetPurchased: false,
    },
    selectedTruckInstances: [],
    selectedFreightAssignments: {},
    nextTruckDisplayNumber: 1,
    nextTruckGameSequence: 1,
    openingMap: null,
    openingMarkerLayer: null,
    openingMarkersByCityId: {},
    pendingHumanAssignments: [],
    activeHumanAssignment: null,
    activePurchase: null,
    dispatchSelectedCityId: "",
    mainMapDispatchSelection: false,
    dispatchMap: null,
    dispatchMarkerLayer: null,
    dispatchMarkersByCityId: {},
  },
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
  modalRoot: document.getElementById("game-runtime-modal-root"),
  openingDifficultySelect: document.getElementById("game-runtime-opening-difficulty-select"),
  openingRobotCountInput: document.getElementById("game-runtime-opening-robot-count"),
  openingRobotCountValue: document.getElementById("game-runtime-opening-robot-count-value"),
  openingCompanyNameInput: document.getElementById("game-runtime-opening-company-name"),
  openingCompanyColorInput: document.getElementById("game-runtime-opening-company-color"),
  openingCompanyColorTextInput: document.getElementById("game-runtime-opening-company-color-text"),
  openingLogoGrid: document.getElementById("game-runtime-opening-logo-grid"),
  openingCompanyPreview: document.getElementById("game-runtime-opening-company-preview"),
  openingPalette: document.getElementById("game-runtime-opening-palette"),
  openingEconomy: document.getElementById("game-runtime-opening-economy"),
  openingTopOffers: document.getElementById("game-runtime-opening-top-offers"),
  openingTopDemands: document.getElementById("game-runtime-opening-top-demands"),
  openingMapStage: document.getElementById("game-runtime-opening-map-stage"),
  fleetRail: document.getElementById("game-runtime-fleet-rail"),
  fleetRailMeta: document.getElementById("game-runtime-fleet-rail-meta"),
  fleetSelection: document.getElementById("game-runtime-fleet-selection"),
  freightRail: document.getElementById("game-runtime-freight-rail"),
  freightRailMeta: document.getElementById("game-runtime-freight-rail-meta"),
  freightRailTitle: document.getElementById("game-runtime-freight-rail-title"),
  freightSelection: document.getElementById("game-runtime-freight-selection"),
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

function formatCurrencyPerTon(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 10 ? 0 : 1;
  return `R$ ${numberFormat(digits).format(roundNumber(numericValue, 1))}/t`;
}

function formatLiters(value) {
  const numericValue = Math.max(0, Number(value || 0));
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 1))} L`;
}

function formatWeightKg(value) {
  const numericValue = Number(value || 0);
  if (numericValue >= 1000) {
    return `${numberFormat(1).format(roundNumber(numericValue / 1000, 1))} t util`;
  }
  return `${numberFormat(0).format(roundNumber(numericValue, 0))} kg`;
}

function formatVolumeM3(value) {
  return `${numberFormat(Number(value || 0) >= 100 ? 0 : 1).format(roundNumber(Number(value || 0), 1))} m3`;
}

function formatPopulation(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 1))} mil hab`;
}

function slugLabel(rawValue, labels = {}) {
  const source = String(rawValue || "").trim();
  if (!source) {
    return "-";
  }
  return labels[source] || source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function versionedAssetUrl(rawUrl, versionToken) {
  const source = String(rawUrl || "").trim();
  if (!source) {
    return "";
  }
  try {
    const nextUrl = new URL(source, window.location.href);
    if (versionToken) {
      nextUrl.searchParams.set("v", versionToken);
    }
    return nextUrl.href;
  } catch (_error) {
    return source;
  }
}

function normalizeDifficultyId(value) {
  return ["hard", "standard", "sandbox"].includes(String(value || "").trim())
    ? String(value || "").trim()
    : "standard";
}

function difficultyLabel(difficultyId) {
  return DIFFICULTY_OPTIONS[normalizeDifficultyId(difficultyId)] || DIFFICULTY_OPTIONS.standard;
}

function openingWizardEnabled() {
  return Boolean(state.setup.openingWizard);
}

function fuelSystemEnabled() {
  return Boolean(RUNTIME_CONFIG.fuelSystem);
}

function advancedDispatchEnabled() {
  return Boolean(RUNTIME_CONFIG.advancedDispatch);
}

function exclusiveFreightsEnabled() {
  return Boolean(RUNTIME_CONFIG.exclusiveFreights);
}

function runtimeTruckMarketEnabled() {
  return Boolean(RUNTIME_CONFIG.runtimeTruckMarket);
}

function setupCompany() {
  return state.setup.company;
}

function purchaseFlowActive() {
  return Boolean(state.setup.activePurchase);
}

function activePurchasePlayer() {
  return purchaseFlowActive() ? state.playersById[state.setup.activePurchase?.playerId || ""] || null : null;
}

function currentSelectionHqCityId() {
  return purchaseFlowActive()
    ? String(activePurchasePlayer()?.hqCityId || setupCompany().hqCityId || "").trim()
    : String(setupCompany().hqCityId || "").trim();
}

function currentSelectionCity() {
  return state.citiesById[currentSelectionHqCityId()] || null;
}

function setupCurrentHqCity() {
  return state.citiesById[setupCompany().hqCityId] || null;
}

function setupHeadquartersPurchased() {
  return Boolean(setupCompany().hqPurchased && setupCompany().hqCityId);
}

function setupCurrentDifficultyId() {
  return normalizeDifficultyId(state.setup.selectedDifficulty);
}

function currentSetupLogoOption() {
  return COMPANY_LOGO_OPTIONS.find((option) => option.id === setupCompany().logoId) || COMPANY_LOGO_OPTIONS[0];
}

function nextContractSequence() {
  const nextValue = Number(state.contractSequence || 1);
  state.contractSequence = nextValue + 1;
  return nextValue;
}

function priceColor(ratio) {
  const start = { r: 53, g: 109, b: 99 };
  const end = { r: 180, g: 106, b: 43 };
  const mix = Math.max(0, Math.min(1, Number(ratio || 0)));
  const next = {
    r: Math.round(start.r + ((end.r - start.r) * mix)),
    g: Math.round(start.g + ((end.g - start.g) * mix)),
    b: Math.round(start.b + ((end.b - start.b) * mix)),
  };
  return `rgb(${next.r}, ${next.g}, ${next.b})`;
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

function supportedProductIdsForTruck(truck) {
  const directIds = Array.isArray(truck?.supported_product_ids)
    ? truck.supported_product_ids
    : Array.isArray(truck?.supportedProductIds)
      ? truck.supportedProductIds
      : [];
  const normalizedDirectIds = directIds
    .map((productId) => String(productId || "").trim())
    .filter(Boolean);
  if (normalizedDirectIds.length) {
    return normalizedDirectIds;
  }
  return Array.isArray(truck?.cells)
    ? truck.cells
      .filter((cell) => cell?.compatible)
      .map((cell) => String(cell?.product_id || "").trim())
      .filter(Boolean)
    : [];
}

function normalizedLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeColor(rawValue, fallback = setupCompany().color) {
  const source = String(rawValue || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(source)) {
    return source.toLowerCase();
  }
  return fallback;
}

function preferredStartupCityId() {
  const selectedCityId = String(state.bootstrap?.summary?.selected_city_id || "").trim();
  if (selectedCityId && state.citiesById[selectedCityId]) {
    return selectedCityId;
  }
  const brasilia = state.cities.find((city) => {
    const label = normalizedLookupText(city.label);
    return label.includes("brasilia") && String(city.state_code || "").toUpperCase() === "DF";
  });
  return brasilia?.id || state.cities[0]?.id || "";
}

function buildCityStats() {
  const nextStats = Object.fromEntries(state.cities.map((city) => [city.id, {
    outboundCount: 0,
    outboundTonnes: 0,
    inboundCount: 0,
    inboundTonnes: 0,
  }]));
  const outboundByCityId = Object.fromEntries(state.cities.map((city) => [city.id, []]));
  const inboundByCityId = Object.fromEntries(state.cities.map((city) => [city.id, []]));

  state.freightFlows.forEach((flow) => {
    const quantityTons = flowQuantityBaseTons(flow);
    if (nextStats[flow.origin_id]) {
      nextStats[flow.origin_id].outboundCount += 1;
      nextStats[flow.origin_id].outboundTonnes += quantityTons;
      outboundByCityId[flow.origin_id].push(flow);
    }
    if (nextStats[flow.destination_id]) {
      nextStats[flow.destination_id].inboundCount += 1;
      nextStats[flow.destination_id].inboundTonnes += quantityTons;
      inboundByCityId[flow.destination_id].push(flow);
    }
  });

  Object.values(outboundByCityId).forEach((flows) => flows.sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0)));
  Object.values(inboundByCityId).forEach((flows) => flows.sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0)));

  state.cityMarketStatsById = nextStats;
  state.outboundFreightsByCityId = outboundByCityId;
  state.inboundFreightsByCityId = inboundByCityId;
}

function buildProductPriceReferenceStats() {
  const values = Object.values(state.productOperationalById)
    .map((item) => Number(item?.price_reference_brl_per_unit || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (!values.length) {
    state.productPriceReferenceMedian = 0;
    return;
  }
  const middle = Math.floor(values.length / 2);
  state.productPriceReferenceMedian = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function openingNumber(path, fallback = 0) {
  const value = Number(
    getNestedValue(
      state.bootstrap?.pricing_document,
      path,
      getNestedValue(state.bootstrap?.default_pricing_document, path, fallback),
    ),
  );
  return Number.isFinite(value) ? value : Number(fallback || 0);
}

function rebuildOpeningContextCache() {
  const openingState = buildOpeningContextState({
    cities: state.cities,
    populationBands: state.populationBands,
    cityMarketStatsById: state.cityMarketStatsById,
    getNumber: openingNumber,
  });
  state.openingContextByCityId = openingState.contexts;
  state.openingPriceRange = openingState.openingPriceRange;
}

function openingContextForCity(city) {
  if (!city) {
    return null;
  }
  return state.openingContextByCityId[city.id] || {
    band: findPopulationBand(city, state.populationBands),
    bandBasePrice: 0,
    openingPrice: 0,
    blendedScore: 0,
    multiplier: 1,
    stats: state.cityMarketStatsById[city.id] || { outboundCount: 0, outboundTonnes: 0, inboundCount: 0, inboundTonnes: 0 },
  };
}

function setupBuildTruckGameId() {
  const nextSequence = Number(state.setup.nextTruckGameSequence || 1);
  state.setup.nextTruckGameSequence = nextSequence + 1;
  return `${GAME_SETUP_TRUCK_ID_SEED}${String(nextSequence).padStart(4, "0")}`;
}

function createSetupSelectedTruckInstance(truckId) {
  const nextDisplayNumber = Number(state.setup.nextTruckDisplayNumber || 1);
  state.setup.nextTruckDisplayNumber = nextDisplayNumber + 1;
  return {
    id: setupBuildTruckGameId(),
    display_number: nextDisplayNumber,
    current_city_id: currentSelectionHqCityId(),
    truck_id: truckId,
  };
}

function setupSelectedTruckUnits() {
  return (Array.isArray(state.setup.selectedTruckInstances) ? state.setup.selectedTruckInstances : [])
    .map((instance) => ({
      ...instance,
      truck: state.trucksById[String(instance?.truck_id || "")] || null,
    }))
    .filter((instance) => instance.truck)
    .sort((left, right) => Number(left.display_number || 0) - Number(right.display_number || 0));
}

function setupSelectedTruckUnitsForType(truckId) {
  const normalizedTruckId = String(truckId || "").trim();
  if (!normalizedTruckId) {
    return [];
  }
  return setupSelectedTruckUnits().filter((instance) => instance.truck.id === normalizedTruckId);
}

function setupSelectedTruckQuantityByType(truckId) {
  return setupSelectedTruckUnitsForType(truckId).length;
}

function truckUnitNumberLabel(instance) {
  return `#${formatInteger(instance?.display_number || 0)}`;
}

function truckUnitNumberList(instances) {
  return (Array.isArray(instances) ? instances : []).map((instance) => truckUnitNumberLabel(instance)).join(" · ");
}

function truckUnitPillsMarkup(instances, limit = 6) {
  const entries = Array.isArray(instances) ? instances : [];
  if (!entries.length) {
    return "";
  }
  const visibleEntries = entries.slice(0, limit);
  const overflow = entries.length - visibleEntries.length;
  const visibleMarkup = visibleEntries.map((instance) => `
    <span class="game-setup-pill is-instance" title="${escapeHtml(`Caminhao ${truckUnitNumberLabel(instance)} · ID ${instance.id}`)}">${escapeHtml(truckUnitNumberLabel(instance))}</span>
  `).join("");
  const overflowMarkup = overflow > 0
    ? `<span class="game-setup-pill is-instance is-overflow">+${escapeHtml(formatInteger(overflow))}</span>`
    : "";
  return `${visibleMarkup}${overflowMarkup}`;
}

function setupSelectedTruckEntries() {
  const entriesByTruckId = new Map();
  setupSelectedTruckUnits().forEach((instance) => {
    const truckId = String(instance.truck?.id || "").trim();
    if (!truckId) {
      return;
    }
    const currentEntry = entriesByTruckId.get(truckId) || {
      truck: instance.truck,
      quantity: 0,
      instances: [],
    };
    currentEntry.quantity += 1;
    currentEntry.instances.push(instance);
    entriesByTruckId.set(truckId, currentEntry);
  });
  return Array.from(entriesByTruckId.values())
    .sort((left, right) => right.quantity - left.quantity || String(left.truck.label).localeCompare(String(right.truck.label), "pt-BR"));
}

function productEntriesForTruck(truck) {
  return Array.from(new Set(supportedProductIdsForTruck(truck)))
    .map((productId) => {
      const product = state.productsById[productId] || {};
      return {
        id: productId,
        emoji: String(product.emoji || "📦"),
        name: String(product.name || product.short_name || productId),
      };
    });
}

function truckProductEmojiMarkup(truck) {
  const entries = productEntriesForTruck(truck);
  if (!entries.length) {
    return `<span class="game-setup-product-emoji-chip is-empty">-</span>`;
  }
  return entries.map((product) => `
    <span class="game-setup-product-emoji-chip" title="${escapeHtml(product.name)}" aria-label="${escapeHtml(product.name)}">${escapeHtml(product.emoji)}</span>
  `).join("");
}

function setupSelectedTruckSupportedProductIds() {
  const productIds = new Set();
  setupSelectedTruckEntries().forEach((entry) => {
    supportedProductIdsForTruck(entry.truck).forEach((productId) => {
      const normalizedProductId = String(productId || "").trim();
      if (normalizedProductId) {
        productIds.add(normalizedProductId);
      }
    });
  });
  return productIds;
}

function setupSelectedFreightAssignmentForFlow(flowId) {
  return String(state.setup.selectedFreightAssignments?.[String(flowId || "").trim()] || "").trim();
}

function setupFreightIsSelected(flowId) {
  return Boolean(setupSelectedFreightAssignmentForFlow(flowId));
}

function setupAssignedFreightCountByTruckUnitId(excludeFlowId = "") {
  const nextCounts = {};
  const validTruckUnitIds = new Set(setupSelectedTruckUnits().map((instance) => instance.id));
  Object.entries(state.setup.selectedFreightAssignments || {}).forEach(([flowId, truckInstanceId]) => {
    if (flowId === excludeFlowId) {
      return;
    }
    const normalizedTruckInstanceId = String(truckInstanceId || "").trim();
    if (!normalizedTruckInstanceId || !validTruckUnitIds.has(normalizedTruckInstanceId)) {
      return;
    }
    nextCounts[normalizedTruckInstanceId] = Number(nextCounts[normalizedTruckInstanceId] || 0) + 1;
  });
  return nextCounts;
}

function setupAssignedTruckUnitIdSet(excludeFlowId = "") {
  return new Set(Object.keys(setupAssignedFreightCountByTruckUnitId(excludeFlowId)));
}

function setupTruckUnitIsAtFlowOrigin(instance, flow) {
  const truckCityId = String(instance?.current_city_id || currentSelectionHqCityId() || "").trim();
  const originCityId = String(flow?.origin_id || "").trim();
  return Boolean(truckCityId && originCityId && truckCityId === originCityId);
}

function setupSelectedCompatibleTruckUnitsForFlow(flow, options = {}) {
  const productId = String(flow?.product_id || "").trim();
  if (!productId) {
    return [];
  }
  const preserveInstanceId = String(options?.preserveInstanceId || "").trim();
  const excludeFlowId = String(options?.excludeFlowId || "").trim();
  const assignedTruckUnitIds = setupAssignedTruckUnitIdSet(excludeFlowId);
  return setupSelectedTruckUnits().filter((instance) => {
    if (!supportedProductIdsForTruck(instance.truck).includes(productId)) {
      return false;
    }
    if (!setupTruckUnitIsAtFlowOrigin(instance, flow)) {
      return false;
    }
    if (instance.id === preserveInstanceId) {
      return true;
    }
    return !assignedTruckUnitIds.has(instance.id);
  });
}

function preferredSetupTruckUnitForFlow(flow, options = {}) {
  const preserveInstanceId = String(options?.preserveInstanceId || "").trim();
  const excludeFlowId = String(options?.excludeFlowId || "").trim();
  const assignmentCounts = setupAssignedFreightCountByTruckUnitId(excludeFlowId);
  const candidates = setupSelectedCompatibleTruckUnitsForFlow(flow, { preserveInstanceId, excludeFlowId })
    .sort((left, right) => payloadTonsForTruck(right.truck) - payloadTonsForTruck(left.truck)
      || Number(right?.truck?.cargo_volume_m3 || 0) - Number(left?.truck?.cargo_volume_m3 || 0)
      || Number(assignmentCounts[left.id] || 0) - Number(assignmentCounts[right.id] || 0)
      || Number(left.display_number || 0) - Number(right.display_number || 0)
      || String(left?.truck?.short_label || left?.truck?.label || "").localeCompare(String(right?.truck?.short_label || right?.truck?.label || ""), "pt-BR"));
  if (preserveInstanceId) {
    const preserved = candidates.find((instance) => instance.id === preserveInstanceId);
    if (preserved) {
      return preserved;
    }
  }
  return candidates[0] || null;
}

function setupSelectedFreightEntries() {
  const supportedProductIds = setupSelectedTruckSupportedProductIds();
  const allowed = new Set(
    (state.outboundFreightsByCityId[currentSelectionHqCityId()] || [])
      .filter((flow) => {
        const productId = String(flow?.product_id || "").trim();
        return Boolean(productId && supportedProductIds.size && supportedProductIds.has(productId));
      })
      .map((flow) => flow.id),
  );
  return Object.keys(state.setup.selectedFreightAssignments || {})
    .filter((flowId) => allowed.has(flowId))
    .map((flowId) => state.freightFlowsById[flowId])
    .filter(Boolean)
    .sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0));
}

function setupPruneFreightSelection() {
  const supportedProductIds = setupSelectedTruckSupportedProductIds();
  const allowedIds = new Set(
    (state.outboundFreightsByCityId[currentSelectionHqCityId()] || [])
      .filter((flow) => {
        const productId = String(flow?.product_id || "").trim();
        return Boolean(productId && supportedProductIds.size && supportedProductIds.has(productId));
      })
      .map((flow) => flow.id),
  );
  const nextAssignments = {};
  Object.entries(state.setup.selectedFreightAssignments || {}).forEach(([flowId, truckInstanceId]) => {
    if (!allowedIds.has(flowId)) {
      return;
    }
    const flow = state.freightFlowsById[flowId];
    if (!flow) {
      return;
    }
    const nextTruckInstance = preferredSetupTruckUnitForFlow(flow, {
      preserveInstanceId: truckInstanceId,
      excludeFlowId: flowId,
    });
    if (nextTruckInstance) {
      nextAssignments[flowId] = nextTruckInstance.id;
    }
  });
  state.setup.selectedFreightAssignments = nextAssignments;
}

function cheapestTruckForTier(tier) {
  const tierIndex = SIZE_TIER_ORDER.indexOf(tier);
  const exact = Object.values(state.trucksById)
    .filter((truck) => truck.size_tier === tier)
    .sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0));
  if (exact.length) {
    return exact[0];
  }
  if (tierIndex === -1) {
    return Object.values(state.trucksById)[0] || null;
  }
  const fallback = Object.values(state.trucksById)
    .filter((truck) => SIZE_TIER_ORDER.indexOf(truck.size_tier) >= tierIndex)
    .sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0));
  return fallback[0] || Object.values(state.trucksById)[0] || null;
}

function truckTierRank(sizeTier) {
  const rank = SIZE_TIER_ORDER.indexOf(String(sizeTier || "").trim().toLowerCase());
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function starterTargetPayloadT(volumeT) {
  const numericVolume = Number(volumeT || 0);
  if (numericVolume >= 12000) {
    return 26;
  }
  if (numericVolume >= 5000) {
    return 16;
  }
  if (numericVolume >= 1800) {
    return 10;
  }
  if (numericVolume >= 500) {
    return 6;
  }
  return 3;
}

function starterTargetSizeTier(targetPayloadT) {
  if (targetPayloadT >= 26) {
    return "super_pesado";
  }
  if (targetPayloadT >= 16) {
    return "pesado";
  }
  if (targetPayloadT >= 10) {
    return "medio";
  }
  if (targetPayloadT >= 5) {
    return "leve";
  }
  return "super_leve";
}

function compatibleTrucksForProduct(productId) {
  return Object.values(state.trucksById).filter((truck) => supportedProductIdsForTruck(truck).includes(productId));
}

function recommendStarterTruckForProduct(productId, marketTonnage) {
  const trucks = compatibleTrucksForProduct(productId)
    .filter((truck) => Number(truck?.purchase_price_brl || 0) > 0 || Number(truck?.payload_weight_kg || 0) > 0);
  if (!trucks.length) {
    return null;
  }
  const targetPayloadT = starterTargetPayloadT(marketTonnage);
  const targetSizeTier = starterTargetSizeTier(targetPayloadT);
  return trucks
    .map((truck) => {
      const payloadT = Number(truck?.payload_weight_kg || 0) / 1000;
      const payloadGap = Math.abs(payloadT - targetPayloadT);
      const underCapacityPenalty = payloadT < targetPayloadT ? (targetPayloadT - payloadT) * 1.6 : 0;
      const tierGap = Math.abs(truckTierRank(truck.size_tier) - truckTierRank(targetSizeTier));
      const investmentPenalty = Number(truck?.purchase_price_brl || 0) / 180000;
      return {
        truck,
        targetPayloadT,
        targetSizeTier,
        score: (tierGap * 5) + payloadGap + underCapacityPenalty + investmentPenalty,
      };
    })
    .sort((left, right) => left.score - right.score || Number(left.truck.purchase_price_brl || 0) - Number(right.truck.purchase_price_brl || 0))[0] || null;
}

function normalizedMarketLayerItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item?.product_id || "").trim(),
      productName: String(item?.product_name || item?.name || item?.product_id || "Produto"),
      value: Number(item?.value || 0),
    }))
    .filter((item) => item.productId && item.value > 0)
    .sort((left, right) => right.value - left.value || String(left.productName).localeCompare(String(right.productName), "pt-BR"));
}

function starterCandidateForLayer(city, layerKey, layerLabel) {
  const items = normalizedMarketLayerItems(city?.[layerKey]);
  for (const item of items) {
    const recommendation = recommendStarterTruckForProduct(item.productId, item.value);
    if (recommendation?.truck) {
      return {
        ...item,
        layerKey,
        layerLabel,
        truck: recommendation.truck,
        targetPayloadT: recommendation.targetPayloadT,
        targetSizeTier: recommendation.targetSizeTier,
      };
    }
  }
  return null;
}

function fallbackStarterFleet(city) {
  const preferredTiers = city && Number(city.population_thousands || 0) >= 2500
    ? ["medio", "pesado"]
    : ["leve", "medio"];
  return preferredTiers
    .map((tier) => cheapestTruckForTier(tier))
    .filter(Boolean)
    .map((truck) => ({
      truck,
      units: 1,
      reasons: [],
    }));
}

function starterFleetBlueprintForCity(city) {
  if (!city) {
    return {
      fleetEntries: [],
      recommendations: [],
      fallback: false,
    };
  }
  const recommendations = [
    starterCandidateForLayer(city, "supply_items", "Top oferta"),
    starterCandidateForLayer(city, "demand_items", "Top demanda"),
  ].filter(Boolean);
  if (!recommendations.length) {
    return {
      fleetEntries: fallbackStarterFleet(city),
      recommendations: [],
      fallback: true,
    };
  }
  const entriesByTruckId = new Map();
  recommendations.forEach((recommendation) => {
    const truckKey = String(recommendation.truck?.id || recommendation.truck?.slug || recommendation.truck?.label || recommendation.productId);
    if (!entriesByTruckId.has(truckKey)) {
      entriesByTruckId.set(truckKey, {
        truck: recommendation.truck,
        units: 0,
        reasons: [],
      });
    }
    const entry = entriesByTruckId.get(truckKey);
    entry.units += 1;
    entry.reasons.push(recommendation);
  });
  return {
    fleetEntries: Array.from(entriesByTruckId.values())
      .sort((left, right) => right.units - left.units || Number(left.truck.purchase_price_brl || 0) - Number(right.truck.purchase_price_brl || 0)),
    recommendations,
    fallback: false,
  };
}

function fleetEntryUnits(entry) {
  return Number(entry?.quantity ?? entry?.units ?? 0) || 0;
}

function fleetInvestmentForEntries(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((total, entry) => total + (Number(entry?.truck?.purchase_price_brl || 0) * fleetEntryUnits(entry)), 0);
}

function setupSelectedFleetInvestmentTotal() {
  return fleetInvestmentForEntries(setupSelectedTruckEntries());
}

function setupCurrentCapitalSnapshot(difficultyId = setupCurrentDifficultyId()) {
  const starterFleet = ["leve", "medio"]
    .map((tier) => cheapestTruckForTier(tier))
    .filter(Boolean)
    .map((truck) => ({ truck, units: 1 }));
  const fleetInvestment = fleetInvestmentForEntries(starterFleet);
  const dailyFixedCost = starterFleet.reduce((total, entry) => total + (Number(entry.truck.base_fixed_cost_brl_per_day || 0) * fleetEntryUnits(entry)), 0);
  const baseInitialCash = pricingNumber("capital.base_initial_cash_brl", DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL);
  const reserveDays = pricingNumber("capital.reserve_days", 20);
  const reserveCost = reserveDays * dailyFixedCost;
  const bufferCost = pricingNumber("capital.buffer_percent", 0.08) * fleetInvestment;
  const workingCapitalBase = baseInitialCash + reserveCost + bufferCost;
  const liquidityFactor = {
    hard: pricingNumber("capital.hard_liquidity_factor", 0.65),
    standard: pricingNumber("capital.standard_liquidity_factor", 1),
    sandbox: pricingNumber("capital.sandbox_liquidity_factor", 1.6),
  }[normalizeDifficultyId(difficultyId)] || 1;
  return {
    difficultyId: normalizeDifficultyId(difficultyId),
    initialCash: fleetInvestment + (workingCapitalBase * liquidityFactor),
  };
}

function setupHeadquartersOpeningCost(city = setupCurrentHqCity()) {
  if (purchaseFlowActive()) {
    return 0;
  }
  return Number(openingContextForCity(city)?.openingPrice || 0);
}

function setupBalanceAfterHeadquarters(city = setupCurrentHqCity()) {
  if (purchaseFlowActive()) {
    return Number(activePurchasePlayer()?.cashBrl || 0);
  }
  return Number(setupCurrentCapitalSnapshot().initialCash || 0) - setupHeadquartersOpeningCost(city);
}

function setupAvailableFleetBudget(city = setupCurrentHqCity()) {
  return Math.max(0, setupBalanceAfterHeadquarters(city));
}

function setupRemainingCapitalAfterSelections(city = setupCurrentHqCity()) {
  return setupBalanceAfterHeadquarters(city) - setupSelectedFleetInvestmentTotal();
}

function setupCanAddTruckUnit(truckId) {
  const truck = state.trucksById[truckId];
  if (!truck) {
    return false;
  }
  return (setupSelectedFleetInvestmentTotal() + Number(truck.purchase_price_brl || 0)) <= (setupAvailableFleetBudget() + 0.0001);
}

function setupReferenceSupportedProductIds() {
  const selected = setupSelectedTruckSupportedProductIds();
  if (selected.size) {
    return selected;
  }
  const recommended = new Set();
  starterFleetBlueprintForCity(setupCurrentHqCity()).fleetEntries.forEach((entry) => {
    supportedProductIdsForTruck(entry.truck).forEach((productId) => recommended.add(productId));
  });
  return recommended;
}

function operationCostForTruck(truck, flow) {
  const payloadT = payloadTonsForTruck(truck);
  if (!(payloadT > 0)) {
    return null;
  }
  const quantityT = Math.max(0.1, flowQuantityBaseTons(flow));
  const trips = Math.max(1, Math.ceil(quantityT / payloadT));
  const cycleDistance = Number(flow.distance_km || 0) * pricingNumber("freight.cycle_distance_multiplier", 1.65);
  const dieselFactor = weightedDieselFactor(flow);
  const variableCostPerKm = Number(truck.base_variable_cost_brl_per_km || 0) * ((0.45 * dieselFactor) + 0.55);
  const variableCost = trips * cycleDistance * variableCostPerKm;
  const routeDays = Math.max(1, Math.ceil((cycleDistance * trips) / Math.max(1, pricingNumber("freight.driver_daily_km", 650))));
  const fixedCost = routeDays * Number(truck.base_fixed_cost_brl_per_day || 0);
  const handlingCost = pricingNumber("freight.handling_base_brl", 120) + (quantityT * pricingNumber("freight.handling_per_t_brl", 4));
  return {
    truck,
    trips,
    totalCost: variableCost + fixedCost + handlingCost,
  };
}

function bestOperationForFlow(flow) {
  return Object.values(state.trucksById)
    .filter((truck) => supportedProductIdsForTruck(truck).includes(flow.product_id))
    .map((truck) => operationCostForTruck(truck, flow))
    .filter(Boolean)
    .sort((left, right) => left.totalCost - right.totalCost)[0] || null;
}

function setupHqBonusForFlow(flow) {
  const hqCityId = currentSelectionHqCityId();
  const originBonus = flow.origin_id === hqCityId ? pricingNumber("freight.hq_origin_bonus", 0.06) : 0;
  const destinationBonus = flow.destination_id === hqCityId ? pricingNumber("freight.hq_destination_bonus", 0.03) : 0;
  return Math.min(pricingNumber("freight.hq_bonus_cap", 0.08), originBonus + destinationBonus);
}

function setupFreightPricingForFlow(flow) {
  const operation = bestOperationForFlow(flow);
  const distanceFactor = distanceMultiplier(flow);
  const specializationFactor = logisticsMultiplier(flow);
  const productFactor = productSurchargeMultiplier(flow);
  const quantityT = flowQuantityBaseTons(flow);
  const distanceKm = Number(flow.distance_km || 0);
  const marketPrice = quantityT * distanceKm * pricingNumber("freight.base_rate_brl_per_tkm", 0.34) * distanceFactor * specializationFactor * productFactor;
  const floorPrice = operation ? operation.totalCost * pricingNumber("freight.floor_margin_multiplier", 1.12) : 0;
  const contractPrice = Math.max(floorPrice, marketPrice);
  const hqBonus = setupHqBonusForFlow(flow);
  const playerRevenue = contractPrice * (1 + hqBonus);
  const unitRevenuePerTon = quantityT > 0 ? playerRevenue / quantityT : 0;
  const assignedTruckInstanceId = setupSelectedFreightAssignmentForFlow(flow.id);
  const contractTruckUnit = preferredSetupTruckUnitForFlow(flow, {
    preserveInstanceId: assignedTruckInstanceId,
    excludeFlowId: flow.id,
  });
  const contractTruck = contractTruckUnit?.truck || null;
  const availability = freightFlowAvailability(flow.id);
  const executionPlan = contractTruckUnit
    ? buildTruckFlowExecutionPlan(contractTruckUnit, flow, {
      currentCityId: contractTruckUnit.current_city_id || contractTruckUnit.currentCityId || currentSelectionHqCityId(),
      startingFuelLiters: contractTruckUnit.fuelLevelLiters,
    })
    : null;
  const contractPayloadTons = contractTruck ? Math.min(quantityT, payloadTonsForTruck(contractTruck)) : 0;
  const contractRevenue = unitRevenuePerTon * contractPayloadTons;
  return {
    flow,
    unitRevenuePerTon,
    contractTruckUnit,
    contractTruck,
    contractPayloadTons,
    contractRevenue,
    availability,
    fuelFeasible: executionPlan ? executionPlan.feasible : true,
    executionPlan,
  };
}

function setupPricedFreightsForCity(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId) {
    return [];
  }
  const hasSelectedFleet = setupSelectedTruckEntries().length > 0;
  return (state.outboundFreightsByCityId[nextCityId] || [])
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).state !== "completed")
    .map((flow) => setupFreightPricingForFlow(flow))
    .sort((left, right) => {
      const leftPrimary = hasSelectedFleet ? Number(left.contractRevenue || 0) : Number(left.unitRevenuePerTon || 0);
      const rightPrimary = hasSelectedFleet ? Number(right.contractRevenue || 0) : Number(right.unitRevenuePerTon || 0);
      return rightPrimary - leftPrimary
        || Number(right.unitRevenuePerTon || 0) - Number(left.unitRevenuePerTon || 0)
        || flowQuantityBaseTons(right.flow) - flowQuantityBaseTons(left.flow);
    });
}

function setupPricedFreightEntryById(flowId, cityId = currentSelectionHqCityId()) {
  return setupPricedFreightsForCity(cityId).find((entry) => entry.flow.id === flowId) || null;
}

function setupRecommendedPricedFreights(limit = RECOMMENDED_FREIGHT_LIMIT) {
  const supportedProductIds = setupReferenceSupportedProductIds();
  const hasSelectedFleet = setupSelectedTruckEntries().length > 0;
  return setupPricedFreightsForCity(currentSelectionHqCityId())
    .filter((entry) => !supportedProductIds.size || supportedProductIds.has(entry.flow.product_id))
    .filter((entry) => !hasSelectedFleet || Boolean(entry.contractTruckUnit))
    .slice(0, limit);
}

function setupSelectedPricedFreightEntries() {
  return setupSelectedFreightEntries()
    .map((flow) => setupPricedFreightEntryById(flow.id, currentSelectionHqCityId()) || setupFreightPricingForFlow(flow))
    .filter(Boolean);
}

function primaryImplementLabel(truck) {
  return (truck?.body_labels || []).find(Boolean) || truck?.axle_config || "Implemento base";
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
  const supportedProductIds = supportedProductIdsForTruck(truck);
  return supportedProductIds.includes(String(flow?.product_id || "").trim());
}

function normalizeBootstrap(bootstrapPayload, runtimePayload) {
  state.bootstrap = bootstrapPayload;
  state.runtime = runtimePayload;
  state.snapshot = readGameSessionSnapshot();
  state.completedFreightAssignmentsById = {};

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
  const runtimeTrucks = Array.isArray(bootstrapPayload?.trucks) ? bootstrapPayload.trucks : [];
  state.trucksById = Object.fromEntries(
    runtimeTrucks.map((truck) => [truck.id, {
      ...truck,
      supported_product_ids: supportedProductIdsForTruck(truck),
    }]),
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

  buildCityStats();
  buildProductPriceReferenceStats();
  rebuildOpeningContextCache();
  state.setup.company.hqCityId = preferredStartupCityId();
  state.setup.company.hqPurchased = false;
  state.setup.company.fleetPurchased = false;
  state.setup.selectedDifficulty = "standard";
  state.setup.selectedTruckInstances = [];
  state.setup.selectedFreightAssignments = {};
  state.setup.nextTruckDisplayNumber = 1;
  state.setup.nextTruckGameSequence = 1;
  state.setup.pendingHumanAssignments = [];
  state.setup.activeHumanAssignment = null;
  state.setup.activePurchase = null;
  state.setup.dispatchSelectedCityId = "";
  state.setup.mainMapDispatchSelection = false;
  state.setup.dispatchMarkersByCityId = {};
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

function averageDieselPrice() {
  const dieselValues = Object.values(state.dieselByCityId).filter((value) => Number(value) > 0);
  return dieselValues.length
    ? dieselValues.reduce((total, value) => total + Number(value), 0) / dieselValues.length
    : 0;
}

function dieselPriceForCity(cityId) {
  const averagePrice = averageDieselPrice();
  return Number(state.dieselByCityId[String(cityId || "").trim()] || averagePrice || 0);
}

function truckUsesDiesel(truck) {
  if (!fuelSystemEnabled()) {
    return false;
  }
  const energySource = String(truck?.energy_source || "diesel").trim().toLowerCase();
  const consumptionUnit = String(truck?.consumption_unit || "l_per_km").trim().toLowerCase();
  return energySource === "diesel"
    && consumptionUnit === "l_per_km"
    && Number(truck?.fuel_tank_l || 0) > 0;
}

function truckFuelTankLiters(truck) {
  return Math.max(0, Number(truck?.fuel_tank_l || 0));
}

function truckConsumptionLitersPerKm(truck, { loaded = false } = {}) {
  const loadedValue = Math.max(0, Number(truck?.loaded_consumption_per_km || 0));
  const emptyValue = Math.max(0, Number(truck?.empty_consumption_per_km || 0));
  if (loaded) {
    return loadedValue || emptyValue;
  }
  return emptyValue || loadedValue;
}

function nonFuelVariableCostPerKm(truck, { loaded = false, dieselPrice = averageDieselPrice() } = {}) {
  const baseVariableCost = Math.max(0, Number(truck?.base_variable_cost_brl_per_km || 0));
  if (!truckUsesDiesel(truck) || !(dieselPrice > 0)) {
    return baseVariableCost;
  }
  return Math.max(0, baseVariableCost - (truckConsumptionLitersPerKm(truck, { loaded }) * dieselPrice));
}

function buildTrackCityStops(track) {
  const nodeIds = Array.isArray(track?.nodeIds) ? track.nodeIds : [];
  if (!nodeIds.length) {
    return [];
  }
  const nodeKilometers = [0];
  if (Array.isArray(track?.edgeIds) && track.edgeIds.length) {
    let cumulativeKm = 0;
    track.edgeIds.forEach((edgeId, index) => {
      cumulativeKm += edgeDistanceKm(state.edgesById[edgeId]);
      nodeKilometers[index + 1] = cumulativeKm;
    });
    const scaleFactor = cumulativeKm > 0 && Number(track.distanceKm || 0) > 0 ? Number(track.distanceKm || 0) / cumulativeKm : 1;
    for (let index = 0; index < nodeKilometers.length; index += 1) {
      nodeKilometers[index] *= scaleFactor;
    }
  } else if (nodeIds.length > 1 && Number(track?.distanceKm || 0) > 0) {
    const stepDistanceKm = Number(track.distanceKm || 0) / Math.max(1, nodeIds.length - 1);
    for (let index = 1; index < nodeIds.length; index += 1) {
      nodeKilometers[index] = stepDistanceKm * index;
    }
  }

  const stops = [];
  nodeIds.forEach((nodeId, index) => {
    const city = state.citiesById[nodeId] || null;
    const isBoundary = index === 0 || index === nodeIds.length - 1;
    if (!city && !isBoundary) {
      return;
    }
    const previousStop = stops[stops.length - 1] || null;
    const nextStop = {
      nodeId,
      cityId: city?.id || String(nodeId || "").trim(),
      cityLabel: city?.label || nodeId,
      kmFromStart: Number(nodeKilometers[index] || 0),
    };
    if (previousStop?.cityId === nextStop.cityId) {
      previousStop.kmFromStart = nextStop.kmFromStart;
      return;
    }
    stops.push(nextStop);
  });

  if (stops.length > 1) {
    stops[stops.length - 1].kmFromStart = Number(track?.distanceKm || stops[stops.length - 1].kmFromStart || 0);
  }
  return stops;
}

function buildTravelFuelPlan({ track, truck, loaded = false, startingFuelLiters } = {}) {
  const tankLiters = truckFuelTankLiters(truck);
  const initialFuelLiters = clamp(Number(startingFuelLiters ?? tankLiters), 0, Math.max(tankLiters, 0));
  const distanceKm = Math.max(0, Number(track?.distanceKm || 0));
  if (!distanceKm || !truckUsesDiesel(truck)) {
    return {
      feasible: true,
      distanceKm,
      tankLiters,
      loaded,
      segments: [],
      totalFuelLiters: 0,
      totalFuelCostBrl: 0,
      endFuelLiters: initialFuelLiters,
    };
  }

  const consumptionPerKm = truckConsumptionLitersPerKm(truck, { loaded });
  if (!(consumptionPerKm > 0)) {
    return {
      feasible: true,
      distanceKm,
      tankLiters,
      loaded,
      segments: [],
      totalFuelLiters: 0,
      totalFuelCostBrl: 0,
      endFuelLiters: initialFuelLiters,
    };
  }

  const stops = buildTrackCityStops(track);
  if (stops.length < 2) {
    const fuelNeededLiters = distanceKm * consumptionPerKm;
    return {
      feasible: fuelNeededLiters <= tankLiters + 0.0001,
      distanceKm,
      tankLiters,
      loaded,
      segments: [],
      totalFuelLiters: 0,
      totalFuelCostBrl: 0,
      endFuelLiters: Math.max(0, initialFuelLiters - fuelNeededLiters),
      blockedStartCityId: track?.fromNodeId || null,
      blockedEndCityId: track?.toNodeId || null,
      blockedDistanceKm: distanceKm,
    };
  }

  let fuelLevelLiters = initialFuelLiters;
  let totalFuelLiters = 0;
  let totalFuelCostBrl = 0;
  const segments = [];
  const durationScale = distanceKm > 0 ? Number(track?.durationHours || 0) / distanceKm : 0;

  for (let index = 0; index < stops.length - 1; index += 1) {
    const startStop = stops[index];
    const endStop = stops[index + 1];
    const segmentDistanceKm = Math.max(0, Number(endStop.kmFromStart || 0) - Number(startStop.kmFromStart || 0));
    if (!segmentDistanceKm) {
      continue;
    }
    const fuelNeededLiters = segmentDistanceKm * consumptionPerKm;
    if (fuelNeededLiters > tankLiters + 0.0001) {
      return {
        feasible: false,
        distanceKm,
        tankLiters,
        loaded,
        segments,
        totalFuelLiters,
        totalFuelCostBrl,
        endFuelLiters: fuelLevelLiters,
        blockedStartCityId: startStop.cityId,
        blockedEndCityId: endStop.cityId,
        blockedDistanceKm: segmentDistanceKm,
      };
    }
    const refuelLiters = fuelLevelLiters + 0.0001 >= fuelNeededLiters
      ? 0
      : Math.min(tankLiters - fuelLevelLiters, fuelNeededLiters - fuelLevelLiters);
    if (fuelLevelLiters + refuelLiters + 0.0001 < fuelNeededLiters) {
      return {
        feasible: false,
        distanceKm,
        tankLiters,
        loaded,
        segments,
        totalFuelLiters,
        totalFuelCostBrl,
        endFuelLiters: fuelLevelLiters,
        blockedStartCityId: startStop.cityId,
        blockedEndCityId: endStop.cityId,
        blockedDistanceKm: segmentDistanceKm,
      };
    }
    const dieselPrice = dieselPriceForCity(startStop.cityId);
    const fuelAfterRefuelLiters = fuelLevelLiters + refuelLiters;
    const fuelAfterSegmentLiters = Math.max(0, fuelAfterRefuelLiters - fuelNeededLiters);
    const segment = {
      index,
      startCityId: startStop.cityId,
      startCityLabel: startStop.cityLabel,
      endCityId: endStop.cityId,
      endCityLabel: endStop.cityLabel,
      startKm: Number(startStop.kmFromStart || 0),
      endKm: Number(endStop.kmFromStart || 0),
      distanceKm: segmentDistanceKm,
      fuelNeededLiters,
      refuelLiters,
      dieselPrice,
      refuelCostBrl: refuelLiters * dieselPrice,
      fuelBeforeRefuelLiters: fuelLevelLiters,
      fuelAfterRefuelLiters,
      fuelAfterSegmentLiters,
      startHours: Number(startStop.kmFromStart || 0) * durationScale,
      endHours: Number(endStop.kmFromStart || 0) * durationScale,
    };
    segments.push(segment);
    totalFuelLiters += refuelLiters;
    totalFuelCostBrl += segment.refuelCostBrl;
    fuelLevelLiters = fuelAfterSegmentLiters;
  }

  return {
    feasible: true,
    distanceKm,
    tankLiters,
    loaded,
    consumptionPerKm,
    segments,
    totalFuelLiters: roundNumber(totalFuelLiters, 2),
    totalFuelCostBrl: roundNumber(totalFuelCostBrl, 2),
    endFuelLiters: roundNumber(fuelLevelLiters, 2),
  };
}

function fuelBlockedMessage(travelPlan) {
  if (!travelPlan || travelPlan.feasible) {
    return "Autonomia disponivel";
  }
  if (travelPlan.blockedStartCityId && travelPlan.blockedEndCityId) {
    return `Autonomia insuficiente entre ${cityLabel(travelPlan.blockedStartCityId)} e ${cityLabel(travelPlan.blockedEndCityId)} (${formatDistanceKm(travelPlan.blockedDistanceKm || 0)} sem cidade para abastecer)`;
  }
  return "Autonomia insuficiente para a rota selecionada";
}

function estimatedFuelCostForTrack(track, truck, { loaded = false } = {}) {
  const plan = buildTravelFuelPlan({
    track,
    truck,
    loaded,
    startingFuelLiters: truckFuelTankLiters(truck),
  });
  return plan.feasible ? Number(plan.totalFuelCostBrl || 0) : Number.POSITIVE_INFINITY;
}

function weightedDieselFactor(flow) {
  const averageCityDieselPrice = averageDieselPrice();
  if (!averageCityDieselPrice) {
    return 1;
  }
  const originWeight = pricingNumber("freight.diesel_origin_weight", 0.7);
  const destinationWeight = pricingNumber("freight.diesel_destination_weight", 0.3);
  const totalWeight = Math.max(originWeight + destinationWeight, 0.0001);
  const originDiesel = Number(state.dieselByCityId[flow.origin_id] || averageCityDieselPrice);
  const destinationDiesel = Number(state.dieselByCityId[flow.destination_id] || averageCityDieselPrice);
  const weighted = ((originDiesel * originWeight) + (destinationDiesel * destinationWeight)) / totalWeight;
  return Math.max(0.75, Math.min(1.35, weighted / averageCityDieselPrice));
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

function estimateDispatchCycleCost(track, truck) {
  const distanceKm = Math.max(1, Number(track?.distanceKm || 0));
  const variableCost = distanceKm * nonFuelVariableCostPerKm(truck, { loaded: false, dieselPrice: averageDieselPrice() });
  const routeDays = Math.max(1, Math.ceil(distanceKm / Math.max(1, pricingNumber("freight.driver_daily_km", 650))));
  const fixedCost = routeDays * Number(truck?.base_fixed_cost_brl_per_day || 0);
  const estimatedFuelCostBrl = estimatedFuelCostForTrack(track, truck, { loaded: false });
  return roundNumber(variableCost + fixedCost + (Number.isFinite(estimatedFuelCostBrl) ? estimatedFuelCostBrl : 0), 2);
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

function hydrateTruckUnitState(truckUnit) {
  const tankLiters = truckFuelTankLiters(truckUnit?.truck);
  const defaultFuelLiters = truckUsesDiesel(truckUnit?.truck) ? tankLiters : 0;
  return {
    ...truckUnit,
    odometerKm: Math.max(0, Number(truckUnit?.odometerKm || 0)),
    fuelTankLiters: tankLiters,
    fuelLevelLiters: clamp(
      Number.isFinite(Number(truckUnit?.fuelLevelLiters)) ? Number(truckUnit.fuelLevelLiters) : defaultFuelLiters,
      0,
      Math.max(tankLiters, 0),
    ),
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

function activeContractEntryByFlowId(flowId) {
  const normalizedFlowId = String(flowId || "").trim();
  if (!normalizedFlowId) {
    return null;
  }
  for (const player of state.players) {
    const contract = (player.contracts || []).find((item) => !item.isCompleted && item.flowId === normalizedFlowId);
    if (contract) {
      return { player, contract };
    }
  }
  return null;
}

function completedFreightAssignment(flowId) {
  return state.completedFreightAssignmentsById[String(flowId || "").trim()] || null;
}

function freightOwnerLabel(player, contract) {
  if (!player || !contract) {
    return "outra operacao";
  }
  const truckLabel = contract.truckUnit
    ? `${truckUnitNumberLabel(contract.truckUnit)} · ${contract.truckUnit.truck?.short_label || contract.truckUnit.truck?.label || "caminhao"}`
    : "caminhao";
  return `${player.label} · ${truckLabel}`;
}

function freightFlowAvailability(flowId) {
  const normalizedFlowId = String(flowId || "").trim();
  const activeEntry = activeContractEntryByFlowId(normalizedFlowId);
  if (activeEntry) {
    return {
      state: "active",
      available: false,
      player: activeEntry.player,
      contract: activeEntry.contract,
      message: `Em execucao por ${freightOwnerLabel(activeEntry.player, activeEntry.contract)}`,
    };
  }
  const completedEntry = completedFreightAssignment(normalizedFlowId);
  if (completedEntry) {
    return {
      state: "completed",
      available: false,
      message: `Contrato ja encerrado por ${completedEntry.playerLabel || "outra operacao"}`,
    };
  }
  return {
    state: "available",
    available: true,
    message: "Contrato disponivel",
  };
}

function markFreightFlowCompleted(player, contract) {
  const flowId = String(contract?.flowId || "").trim();
  if (!flowId) {
    return;
  }
  state.completedFreightAssignmentsById[flowId] = {
    flowId,
    playerId: player?.id || null,
    playerLabel: player?.label || "Operacao",
    truckUnitId: contract?.truckUnitId || null,
    completedAt: state.simulation.currentTime.toISOString(),
  };
}

function buildTruckFlowExecutionPlan(truckUnit, flow, options = {}) {
  const truck = truckUnit?.truck || null;
  if (!truck || !flow) {
    return { feasible: false, repositionPlan: null, outboundPlan: null };
  }
  const currentCityId = String(options?.currentCityId || truckUnit?.currentCityId || flow.origin_id || "").trim();
  const startingFuelLiters = Number.isFinite(Number(options?.startingFuelLiters))
    ? Number(options.startingFuelLiters)
    : truckFuelTankLiters(truck);
  if (!fuelSystemEnabled() || !truckUsesDiesel(truck)) {
    return {
      feasible: true,
      repositionPlan: null,
      outboundPlan: null,
      endingFuelLiters: startingFuelLiters,
    };
  }
  let fuelAfterReposition = startingFuelLiters;
  const repositionTrack = currentCityId && currentCityId !== flow.origin_id
    ? getTrack(currentCityId, flow.origin_id, "fastest")
    : null;
  const repositionPlan = repositionTrack
    ? buildTravelFuelPlan({
      track: repositionTrack,
      truck,
      loaded: false,
      startingFuelLiters,
    })
    : null;
  if (repositionPlan && !repositionPlan.feasible) {
    return {
      feasible: false,
      repositionPlan,
      outboundPlan: null,
      endingFuelLiters: startingFuelLiters,
    };
  }
  if (repositionPlan) {
    fuelAfterReposition = Number(repositionPlan.endFuelLiters || 0);
  }
  const outboundTrack = getTrack(flow.origin_id, flow.destination_id, "fastest");
  const outboundPlan = buildTravelFuelPlan({
    track: outboundTrack,
    truck,
    loaded: options.loadedOutbound !== false,
    startingFuelLiters: fuelAfterReposition,
  });
  if (!outboundPlan.feasible) {
    return {
      feasible: false,
      repositionPlan,
      outboundPlan,
      endingFuelLiters: fuelAfterReposition,
    };
  }
  return {
    feasible: true,
    repositionPlan,
    outboundPlan,
    endingFuelLiters: Number(outboundPlan.endFuelLiters || fuelAfterReposition || 0),
  };
}

function truckCanExecuteFlow(truckUnit, flow, options = {}) {
  return buildTruckFlowExecutionPlan(truckUnit, flow, options).feasible;
}

function autoAssignContractsForTruckUnits(playerId, hqCityId, truckUnits, limit = truckUnits.length, blockedFlowIds = new Set()) {
  const availableFlows = [...(state.outboundFreightsByCityId[hqCityId] || [])]
    .filter((flow) => !blockedFlowIds.has(flow.id))
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
    .filter((flow) => getTrack(flow.origin_id, flow.destination_id)?.points?.length)
    .sort((left, right) => flowScore(right) - flowScore(left));
  const usedFlowIds = new Set();
  const specs = [];

  truckUnits.forEach((truckUnit) => {
    if (specs.length >= limit) {
      return;
    }
    const nextFlow = availableFlows.find((flow) => !usedFlowIds.has(flow.id)
      && truckSupportsFlow(truckUnit.truck, flow)
      && truckCanExecuteFlow(truckUnit, flow));
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
    if (!truckCanExecuteFlow(truckUnit, flow)) {
      return;
    }
    truckUnits.push(truckUnit);
    usedFlowIds.add(flow.id);
    specs.push({ flow, truckUnit, preparedEntry: null });
  });

  return {
    truckUnits,
    contractSpecs: specs,
  };
}

function buildContractSpecsFromSetup(truckUnits, hqCityId) {
  const truckUnitsById = Object.fromEntries(truckUnits.map((truckUnit) => [truckUnit.id, truckUnit]));
  return Object.entries(state.setup.selectedFreightAssignments || {})
    .map(([flowId, truckInstanceId]) => {
      const flow = state.freightFlowsById[String(flowId || "").trim()];
      const truckUnit = truckUnitsById[String(truckInstanceId || "").trim()];
      if (!flow || !truckUnit || flow.origin_id !== hqCityId || !truckSupportsFlow(truckUnit.truck, flow)) {
        return null;
      }
      if (exclusiveFreightsEnabled() && !freightFlowAvailability(flow.id).available) {
        return null;
      }
      if (!truckCanExecuteFlow(truckUnit, flow)) {
        return null;
      }
      return {
        flow,
        truckUnit,
        preparedEntry: {
          contract_payload_tons: Math.min(flowQuantityBaseTons(flow), payloadTonsForTruck(truckUnit.truck)),
          contract_revenue_brl: Number(setupPricedFreightEntryById(flow.id, hqCityId)?.contractRevenue || 0),
        },
      };
    })
    .filter(Boolean);
}

function buildHumanPlayerConfigFromSetup() {
  const hqCityId = String(setupCompany().hqCityId || preferredStartupCityId()).trim();
  const truckUnits = setupSelectedTruckUnits().map((instance) => ({
    id: String(instance.id || "").trim(),
    displayNumber: Number(instance.display_number || 0),
    currentCityId: String(instance.current_city_id || hqCityId).trim(),
    truckId: String(instance.truck_id || instance.truck?.id || "").trim(),
    truck: state.trucksById[String(instance.truck_id || instance.truck?.id || "").trim()] || instance.truck,
  }));
  const contractSpecs = buildContractSpecsFromSetup(truckUnits, hqCityId);
  const currentCash = roundNumber(setupRemainingCapitalAfterSelections(state.citiesById[hqCityId] || null), 2);
  return {
    id: "human",
    label: String(setupCompany().name || "Brasix").trim() || "Brasix",
    color: String(setupCompany().color || "#356d63").trim() || "#356d63",
    isHuman: true,
    hqCityId,
    truckUnits,
    contractSpecs,
    cashBrl: currentCash,
    startingCashBrl: currentCash,
    prepared: true,
    note: `${difficultyLabel(state.setup.selectedDifficulty)} · ${formatInteger(state.setup.robotCount)} adversarios`,
  };
}

function buildHumanPlayerConfig() {
  if (openingWizardEnabled()) {
    return buildHumanPlayerConfigFromSetup();
  }
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

function buildRobotPlayerConfigs(humanHqCityId, blockedFlowIds = new Set()) {
  const robotCount = openingWizardEnabled()
    ? clamp(state.setup.robotCount, MIN_ROBOT_COUNT, MAX_ROBOT_COUNT)
    : 3;
  const baseDifficulty = openingWizardEnabled() ? state.setup.selectedDifficulty : "standard";
  const robotBaseCash = openingCashForDifficulty(baseDifficulty);
  const candidateCities = [...state.cities]
    .filter((city) => city.id !== humanHqCityId)
    .sort((left, right) => cityOpportunityScore(right) - cityOpportunityScore(left));

  return Array.from({ length: robotCount }, (_unused, index) => {
    const name = ROBOT_NAMES[index] || `Adversario ${index + 1}`;
    const city = candidateCities[index] || candidateCities[0] || state.cities[0] || null;
    const hqCityId = city?.id || humanHqCityId;
    const assignmentPlan = autoAssignContractsForTruckUnits(`robot-${index + 1}`, hqCityId, [], 2, blockedFlowIds);
    const headquartersCost = Number(openingContextForCity(city)?.openingPrice || 0);
    const fleetInvestment = assignmentPlan.truckUnits.reduce((total, truckUnit) => total + Number(truckUnit.truck?.purchase_price_brl || 0), 0);
    const currentCash = roundNumber((robotBaseCash * (0.92 + (index * 0.025))) - headquartersCost - fleetInvestment, 0);
    return {
      id: `robot-${index + 1}`,
      label: name,
      color: ROBOT_COLORS[index] || ROBOT_COLORS[ROBOT_COLORS.length - 1],
      isHuman: false,
      hqCityId,
      truckUnits: assignmentPlan.truckUnits,
      contractSpecs: assignmentPlan.contractSpecs,
      cashBrl: currentCash,
      startingCashBrl: currentCash,
      prepared: true,
      note: "Operacao automatica",
    };
  }).filter((config) => config.hqCityId && config.truckUnits.length && config.contractSpecs.length);
}

function isTravelStage(stageName) {
  return ["repositioning", "outbound", "returning"].includes(String(stageName || "").trim());
}

function contractStatusLabel(contract) {
  if (contract?.dispatchOnly) {
    return contract.dispatchMode === "return_hq"
      ? "Voltando a sede"
      : "Reposicionando";
  }
  return {
    repositioning: "Reposicionando",
    loading: "Carregando",
    outbound: "Em rota",
    unloading: "Descargando",
    returning: "Retornando",
  }[contract.stage] || "Em operacao";
}

function currentTrackForContract(contract, stageName = contract?.stage) {
  return {
    repositioning: contract?.repositionTrack,
    loading: contract?.deliveryTrack,
    outbound: contract?.deliveryTrack,
    unloading: contract?.deliveryTrack,
    returning: contract?.returnTrack,
  }[stageName] || contract?.deliveryTrack;
}

function applyFuelPurchase(player, truckUnit, cityId, liters, reason) {
  const fuelLiters = Math.max(0, Number(liters || 0));
  if (!(fuelLiters > 0) || !truckUsesDiesel(truckUnit?.truck)) {
    return 0;
  }
  const dieselPrice = dieselPriceForCity(cityId);
  const tankLiters = Math.max(0, Number(truckUnit?.fuelTankLiters || truckFuelTankLiters(truckUnit?.truck)));
  truckUnit.fuelLevelLiters = clamp(Number(truckUnit?.fuelLevelLiters || 0) + fuelLiters, 0, Math.max(tankLiters, fuelLiters));
  const fuelCostBrl = roundNumber(fuelLiters * dieselPrice, 2);
  if (player) {
    player.cashBrl = roundNumber(player.cashBrl - fuelCostBrl, 2);
    appendLog(player.id, "neutral", `${player.label} abasteceu ${formatLiters(fuelLiters)} em ${cityLabel(cityId)} (${formatCurrency(fuelCostBrl)}${reason ? ` · ${reason}` : ""}).`);
  }
  return fuelCostBrl;
}

function prepareContractTravelStage(player, contract) {
  const stageName = String(contract?.stage || "").trim();
  const track = currentTrackForContract(contract, stageName);
  if (!isTravelStage(stageName) || !track) {
    contract.travelStage = null;
    return;
  }
  const travelPlan = buildTravelFuelPlan({
    track,
    truck: contract.truckUnit?.truck,
    loaded: stageName === "outbound" && !contract.dispatchOnly,
    startingFuelLiters: Number(contract.truckUnit?.fuelLevelLiters ?? truckFuelTankLiters(contract.truckUnit?.truck)),
  });
  contract.travelStage = {
    plan: travelPlan,
    processedSegmentCount: 0,
    stageStartOdometerKm: Number(contract.truckUnit?.odometerKm || 0),
  };
  if (!travelPlan.feasible) {
    appendLog(player.id, "negative", `${player.label} nao tem autonomia para sair de ${cityLabel(travelPlan.blockedStartCityId || contract.truckUnit?.currentCityId)} rumo a ${cityLabel(travelPlan.blockedEndCityId || contract.flow?.destination_id)}.`);
    return;
  }
  const firstSegment = travelPlan.segments[0] || null;
  if (firstSegment?.refuelLiters > 0) {
    contract.realizedFuelCostBrl = roundNumber(
      Number(contract.realizedFuelCostBrl || 0) + applyFuelPurchase(player, contract.truckUnit, firstSegment.startCityId, firstSegment.refuelLiters, "saida"),
      2,
    );
  }
}

function processTravelStageProgress(player, contract, previousElapsedHours, nextElapsedHours) {
  const travelStage = contract.travelStage;
  const travelPlan = travelStage?.plan || null;
  if (!travelPlan?.segments?.length) {
    return;
  }
  while (travelStage.processedSegmentCount < travelPlan.segments.length) {
    const segment = travelPlan.segments[travelStage.processedSegmentCount];
    if (nextElapsedHours + 0.0001 < Number(segment.endHours || 0)) {
      break;
    }
    contract.truckUnit.odometerKm = roundNumber(Number(travelStage.stageStartOdometerKm || 0) + Number(segment.endKm || 0), 1);
    contract.truckUnit.fuelLevelLiters = roundNumber(Number(segment.fuelAfterSegmentLiters || 0), 2);
    travelStage.processedSegmentCount += 1;

    const nextSegment = travelPlan.segments[travelStage.processedSegmentCount] || null;
    if (nextSegment?.refuelLiters > 0) {
      contract.realizedFuelCostBrl = roundNumber(
        Number(contract.realizedFuelCostBrl || 0) + applyFuelPurchase(player, contract.truckUnit, nextSegment.startCityId, nextSegment.refuelLiters, "trajeto"),
        2,
      );
    }
  }
}

function projectedTravelSnapshot(contract) {
  const travelStage = contract?.travelStage;
  const travelPlan = travelStage?.plan || null;
  if (!travelPlan?.segments?.length || !isTravelStage(contract?.stage)) {
    return null;
  }
  const stageBudget = Math.max(Number(contract?.stageDurationHours || 0), 0.0001);
  const progressRatio = clamp(Number(contract?.stageElapsedHours || 0) / stageBudget, 0, 1);
  const distanceKm = Number(travelPlan.distanceKm || 0) * progressRatio;
  const segment = travelPlan.segments.find((item) => distanceKm <= Number(item.endKm || 0) + 0.0001) || travelPlan.segments[travelPlan.segments.length - 1];
  if (!segment) {
    return null;
  }
  const segmentDistanceKm = Math.max(Number(segment.distanceKm || 0), 0.0001);
  const segmentProgressRatio = clamp((distanceKm - Number(segment.startKm || 0)) / segmentDistanceKm, 0, 1);
  const fuelLevelLiters = Number(segment.fuelAfterRefuelLiters || 0) - (Number(segment.fuelNeededLiters || 0) * segmentProgressRatio);
  return {
    distanceKm,
    odometerKm: roundNumber(Number(travelStage.stageStartOdometerKm || 0) + distanceKm, 1),
    fuelLevelLiters: roundNumber(Math.max(0, fuelLevelLiters), 2),
    tankLiters: Number(travelPlan.tankLiters || 0),
  };
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

function buildDynamicContractSpec(player, truckUnit, flow) {
  return {
    flow,
    truckUnit,
    preparedEntry: {
      contract_payload_tons: Math.min(flowQuantityBaseTons(flow), payloadTonsForTruck(truckUnit.truck)),
      contract_revenue_brl: estimateDeliveryRevenue(flow, truckUnit.truck, player, null, getTrack(flow.origin_id, flow.destination_id, "fastest").distanceKm),
    },
  };
}

function buildDispatchContractSpec(player, truckUnit, destinationCityId, dispatchMode = "reposition") {
  const originCityId = String(truckUnit?.currentCityId || player?.hqCityId || "").trim();
  const nextDestinationCityId = String(destinationCityId || "").trim();
  const track = getTrack(originCityId, nextDestinationCityId, "fastest");
  const destinationCity = state.citiesById[nextDestinationCityId] || null;
  return {
    dispatchOnly: true,
    dispatchMode,
    flow: {
      id: `dispatch-${truckUnit?.id || "truck"}-${nextDestinationCityId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product_id: "dispatch",
      product_name: dispatchMode === "return_hq" ? "Retorno a sede" : "Reposicionamento vazio",
      product_emoji: "•",
      product_color: player?.color || "#356d63",
      origin_id: originCityId,
      origin_label: cityLabel(originCityId),
      destination_id: nextDestinationCityId,
      destination_label: destinationCity?.label || cityLabel(nextDestinationCityId),
      distance_km: Number(track?.distanceKm || 0),
      quantity_t: 0,
      custom: true,
    },
    truckUnit,
    preparedEntry: null,
  };
}

function assignFlowToTruck(player, truckUnit, flow) {
  if (!player || !truckUnit || !flow) {
    return null;
  }
  if (exclusiveFreightsEnabled() && !freightFlowAvailability(flow.id).available) {
    return null;
  }
  if (!truckCanExecuteFlow(truckUnit, flow, {
    currentCityId: truckUnit.currentCityId,
    startingFuelLiters: truckUnit.fuelLevelLiters,
  })) {
    return null;
  }
  const contract = createContractState(player, buildDynamicContractSpec(player, truckUnit, flow));
  player.contracts.push(contract);
  appendLog(player.id, "neutral", `${player.label} assumiu ${flow.product_name || "carga"} em ${cityLabel(flow.origin_id)} rumo a ${cityLabel(flow.destination_id)}.`);
  return contract;
}

function assignDispatchToTruck(player, truckUnit, destinationCityId, dispatchMode = "reposition") {
  if (!player || !truckUnit || !destinationCityId) {
    return null;
  }
  const spec = buildDispatchContractSpec(player, truckUnit, destinationCityId, dispatchMode);
  if (!truckCanExecuteFlow(truckUnit, spec.flow, {
    currentCityId: truckUnit.currentCityId,
    startingFuelLiters: truckUnit.fuelLevelLiters,
    loadedOutbound: false,
  })) {
    return null;
  }
  const contract = createContractState(player, spec);
  player.contracts.push(contract);
  appendLog(player.id, "neutral", `${player.label} despachou ${truckUnit.truck?.short_label || truckUnit.truck?.label || "caminhao"} para ${cityLabel(destinationCityId)}.`);
  return contract;
}

function bestNextFlowForTruck(player, truckUnit, originCityId) {
  return (state.outboundFreightsByCityId[originCityId] || [])
    .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
    .filter((flow) => truckCanExecuteFlow(truckUnit, flow, {
      currentCityId: originCityId,
      startingFuelLiters: truckUnit.fuelLevelLiters,
    }))
    .sort((left, right) => {
      const leftTrack = getTrack(left.origin_id, left.destination_id, "fastest");
      const rightTrack = getTrack(right.origin_id, right.destination_id, "fastest");
      const leftRevenue = estimateDeliveryRevenue(left, truckUnit.truck, player, null, leftTrack.distanceKm);
      const rightRevenue = estimateDeliveryRevenue(right, truckUnit.truck, player, null, rightTrack.distanceKm);
      return rightRevenue - leftRevenue || Number(right.distance_km || 0) - Number(left.distance_km || 0);
    })[0] || null;
}

function bestRobotRecoveryDispatch(player, truckUnit, originCityId) {
  const currentCityId = String(originCityId || truckUnit?.currentCityId || player?.hqCityId || "").trim();
  if (!player || !truckUnit || !currentCityId) {
    return null;
  }

  const feasibleFlowCandidates = state.freightFlows
    .filter((flow) => String(flow?.origin_id || "").trim() && String(flow.origin_id).trim() !== currentCityId)
    .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
    .map((flow) => {
      const executionPlan = buildTruckFlowExecutionPlan(truckUnit, flow, {
        currentCityId,
        startingFuelLiters: truckUnit.fuelLevelLiters,
      });
      if (!executionPlan.feasible) {
        return null;
      }
      const repositionDistanceKm = Math.max(0, Number(executionPlan.repositionPlan?.distanceKm || 0));
      const deliveryTrack = getTrack(flow.origin_id, flow.destination_id, "fastest");
      const revenueBrl = estimateDeliveryRevenue(flow, truckUnit.truck, player, null, deliveryTrack.distanceKm);
      return {
        flow,
        executionPlan,
        repositionDistanceKm,
        revenueBrl,
        cityScore: cityOpportunityScore(state.citiesById[flow.origin_id] || { id: flow.origin_id, population_thousands: 0 }),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.repositionDistanceKm - right.repositionDistanceKm
      || right.revenueBrl - left.revenueBrl
      || right.cityScore - left.cityScore);

  if (feasibleFlowCandidates.length) {
    const target = feasibleFlowCandidates[0];
    return {
      destinationCityId: target.flow.origin_id,
      dispatchMode: "reposition",
      targetFlow: target.flow,
      repositionDistanceKm: target.repositionDistanceKm,
    };
  }

  const hqCityId = String(player.hqCityId || "").trim();
  if (hqCityId && hqCityId !== currentCityId) {
    const returnPlan = buildTravelFuelPlan({
      track: getTrack(currentCityId, hqCityId, "fastest"),
      truck: truckUnit.truck,
      loaded: false,
      startingFuelLiters: truckUnit.fuelLevelLiters,
    });
    if (returnPlan.feasible) {
      return {
        destinationCityId: hqCityId,
        dispatchMode: "return_hq",
        targetFlow: null,
        repositionDistanceKm: Number(returnPlan.distanceKm || 0),
      };
    }
  }

  return null;
}

function processPendingHumanAssignmentQueue() {
  if (!openingWizardEnabled() || state.setup.activeModal || !state.setup.pendingHumanAssignments.length) {
    return;
  }
  while (state.setup.pendingHumanAssignments.length) {
    const nextAssignment = state.setup.pendingHumanAssignments.shift();
    const player = state.playersById[nextAssignment?.playerId || ""] || null;
    const truckUnit = player?.truckUnits?.find((unit) => unit.id === nextAssignment?.truckUnitId) || null;
    if (!player || !truckUnit) {
      continue;
    }
    const availableEntries = (state.outboundFreightsByCityId[nextAssignment.originCityId] || [])
      .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
      .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
      .filter((flow) => truckCanExecuteFlow(truckUnit, flow, {
        currentCityId: nextAssignment.originCityId,
        startingFuelLiters: truckUnit.fuelLevelLiters,
      }));
    if (!availableEntries.length && !advancedDispatchEnabled()) {
      appendLog(player.id, "neutral", `${player.label} ficou sem fretes em ${cityLabel(nextAssignment.originCityId)} e aguardara nova ordem.`);
      continue;
    }
    state.setup.activeHumanAssignment = nextAssignment;
    state.setup.dispatchSelectedCityId = "";
    openSetupModal("freights");
    return;
  }
}

function resetHumanAssignmentState() {
  state.setup.activeHumanAssignment = null;
  state.setup.dispatchSelectedCityId = "";
  state.setup.mainMapDispatchSelection = false;
}

function startHumanTruckDispatchSelection(truckUnitId, { optional = true } = {}) {
  if (!openingWizardEnabled()) {
    return false;
  }
  const player = state.playersById.human || null;
  const normalizedTruckUnitId = String(truckUnitId || "").trim();
  if (!player || !normalizedTruckUnitId) {
    return false;
  }
  if (state.setup.activeHumanAssignment && !state.setup.activeHumanAssignment.optional) {
    return false;
  }
  const truckUnit = (player.truckUnits || []).find((unit) => unit.id === normalizedTruckUnitId) || null;
  const contract = (player.contracts || []).find((item) => item.truckUnitId === normalizedTruckUnitId) || null;
  const originCityId = String(truckUnit?.currentCityId || player.hqCityId || "").trim();
  if (!truckUnit || contract || !originCityId || !state.citiesById[originCityId]) {
    return false;
  }
  state.setup.activeHumanAssignment = {
    playerId: player.id,
    truckUnitId: truckUnit.id,
    originCityId,
    optional,
  };
  state.setup.dispatchSelectedCityId = "";
  state.setup.mainMapDispatchSelection = false;
  openSetupModal("freights");
  focusPlayerOnMap(player);
  return true;
}

function completeContractCycle(player, contract) {
  contract.isCompleted = true;
  contract.truckUnit.currentCityId = contract.flow.destination_id;
  contract.truckUnit.odometerKm = roundNumber(projectedTravelSnapshot(contract)?.odometerKm || contract.truckUnit.odometerKm || 0, 1);
  contract.truckUnit.fuelLevelLiters = roundNumber(projectedTravelSnapshot(contract)?.fuelLevelLiters || contract.truckUnit.fuelLevelLiters || 0, 2);
  if (exclusiveFreightsEnabled() && !contract.dispatchOnly) {
    markFreightFlowCompleted(player, contract);
  }
  if (!openingWizardEnabled()) {
    return;
  }
  const nextCityId = contract.flow.destination_id;
  if (player.isHuman) {
    state.setup.pendingHumanAssignments.push({
      playerId: player.id,
      truckUnitId: contract.truckUnitId,
      originCityId: nextCityId,
    });
    processPendingHumanAssignmentQueue();
    return;
  }
  const nextFlow = bestNextFlowForTruck(player, contract.truckUnit, nextCityId);
  if (!nextFlow) {
    const recoveryDispatch = bestRobotRecoveryDispatch(player, contract.truckUnit, nextCityId);
    if (!recoveryDispatch) {
      appendLog(player.id, "neutral", `${player.label} encerrou a rota em ${cityLabel(nextCityId)} e ficou sem carga compativel.`);
      return;
    }
    const dispatchContract = assignDispatchToTruck(player, contract.truckUnit, recoveryDispatch.destinationCityId, recoveryDispatch.dispatchMode);
    if (!dispatchContract) {
      appendLog(player.id, "neutral", `${player.label} encerrou a rota em ${cityLabel(nextCityId)} e ficou sem carga compativel.`);
      return;
    }
    if (recoveryDispatch.dispatchMode === "return_hq") {
      appendLog(player.id, "neutral", `${player.label} ficou sem carga em ${cityLabel(nextCityId)} e voltou para a sede em ${cityLabel(recoveryDispatch.destinationCityId)}.`);
    } else {
      appendLog(player.id, "neutral", `${player.label} ficou sem carga em ${cityLabel(nextCityId)} e vai para ${cityLabel(recoveryDispatch.destinationCityId)} buscar novo carregamento.`);
    }
    return;
  }
  assignFlowToTruck(player, contract.truckUnit, nextFlow);
}

function transitionContractStage(player, contract) {
  if (contract.stage === "repositioning") {
    contract.truckUnit.currentCityId = contract.flow.origin_id;
    enterContractStage(player, contract, contract.dispatchOnly ? "outbound" : "loading");
    return;
  }

  if (contract.stage === "loading") {
    enterContractStage(player, contract, "outbound");
    return;
  }

  if (contract.stage === "outbound") {
    contract.truckUnit.currentCityId = contract.flow.destination_id;
    if (contract.dispatchOnly) {
      player.cashBrl = roundNumber(player.cashBrl - Number(contract.nonFuelCycleCostBrl || 0), 2);
      appendLog(player.id, "neutral", `${player.label} reposicionou ${contract.truck.short_label || contract.truck.label || "caminhao"} para ${cityLabel(contract.flow.destination_id)}.`);
      completeContractCycle(player, contract);
      return;
    }
    contract.deliveriesCompleted += 1;
    player.deliveries += 1;
    player.tonnesMoved += contract.payloadTons;
    player.cashBrl = roundNumber(player.cashBrl + contract.revenuePerDeliveryBrl - Number(contract.nonFuelCycleCostBrl || 0), 2);
    appendLog(
      player.id,
      contract.profitPerDeliveryBrl >= 0 ? "positive" : "negative",
      `${player.label} entregou ${contract.flow.product_name || "carga"} em ${cityLabel(contract.flow.destination_id)} (${formatCurrency(contract.profitPerDeliveryBrl)}).`,
    );
    enterContractStage(player, contract, "unloading");
    return;
  }

  if (contract.stage === "unloading") {
    if (openingWizardEnabled()) {
      completeContractCycle(player, contract);
      return;
    }
    enterContractStage(player, contract, "returning");
    return;
  }

  contract.truckUnit.currentCityId = contract.flow.origin_id;
  enterContractStage(player, contract, contract.dispatchOnly ? "outbound" : "loading");
}

function advanceContract(player, contract, deltaHours) {
  let remainingHours = Math.max(0, Number(deltaHours || 0));
  while (remainingHours > 0) {
    const stageBudget = Math.max(contract.stageDurationHours, 0.0001);
    const remainingStageHours = Math.max(0, stageBudget - contract.stageElapsedHours);
    const consumedHours = Math.min(remainingHours, remainingStageHours || stageBudget);
    const previousElapsedHours = contract.stageElapsedHours;
    contract.stageElapsedHours += consumedHours;
    remainingHours -= consumedHours;
    processTravelStageProgress(player, contract, previousElapsedHours, contract.stageElapsedHours);
    updateContractPosition(contract);

    if (contract.stageElapsedHours + 0.0001 >= stageBudget) {
      transitionContractStage(player, contract);
      if (contract.isCompleted) {
        break;
      }
    }
  }
}

function createContractState(player, spec, sequenceId = nextContractSequence()) {
  const flow = spec.flow;
  const truckUnit = spec.truckUnit;
  const truck = truckUnit.truck || state.trucksById[truckUnit.truckId] || null;
  const dispatchOnly = Boolean(spec.dispatchOnly);
  const deliveryTrack = getTrack(flow.origin_id, flow.destination_id, "fastest");
  const returnTrack = dispatchOnly ? null : getTrack(flow.destination_id, flow.origin_id, "fastest");
  const repositionTrack = truckUnit.currentCityId && truckUnit.currentCityId !== flow.origin_id
    ? getTrack(truckUnit.currentCityId, flow.origin_id, "fastest")
    : null;
  const payloadTons = dispatchOnly ? 0 : flowPayloadTons(flow, truck, spec.preparedEntry);
  const revenuePerDeliveryBrl = dispatchOnly ? 0 : estimateDeliveryRevenue(flow, truck, player, spec.preparedEntry, deliveryTrack.distanceKm);
  const cycleCostBrl = dispatchOnly ? estimateDispatchCycleCost(deliveryTrack, truck) : estimateCycleCost(flow, truck, payloadTons, deliveryTrack.distanceKm);
  const estimatedFuelCostBrl = dispatchOnly
    ? estimatedFuelCostForTrack(deliveryTrack, truck, { loaded: false })
    : [
      repositionTrack ? estimatedFuelCostForTrack(repositionTrack, truck, { loaded: false }) : 0,
      estimatedFuelCostForTrack(deliveryTrack, truck, { loaded: true }),
      returnTrack ? estimatedFuelCostForTrack(returnTrack, truck, { loaded: false }) : 0,
    ].filter((value) => Number.isFinite(value)).reduce((total, value) => total + Number(value || 0), 0);
  const nonFuelCycleCostBrl = roundNumber(Math.max(0, cycleCostBrl - Number(estimatedFuelCostBrl || 0)), 2);
  const startingStage = repositionTrack && repositionTrack.distanceKm > 0.2
    ? "repositioning"
    : dispatchOnly
      ? "outbound"
      : "loading";
  const loadHours = dispatchOnly ? 0.1 : loadHoursForTruck(truck);
  const unloadHours = dispatchOnly ? 0.1 : unloadHoursForTruck(truck);

  const contract = {
    id: `${player.id}-contract-${sequenceId}`,
    flowId: flow.id,
    flow,
    truck,
    truckUnit,
    truckUnitId: truckUnit.id,
    payloadTons,
    revenuePerDeliveryBrl,
    cycleCostBrl,
    profitPerDeliveryBrl: roundNumber(revenuePerDeliveryBrl - cycleCostBrl, 2),
    nonFuelCycleCostBrl,
    estimatedFuelCostBrl,
    realizedFuelCostBrl: 0,
    deliveryTrack,
    returnTrack,
    repositionTrack,
    loadHours,
    unloadHours,
    stage: startingStage,
    dispatchOnly,
    dispatchMode: spec.dispatchMode || "",
    travelStage: null,
    stageDurationHours: startingStage === "repositioning"
      ? Math.max(repositionTrack?.durationHours || 0, 0.2)
      : startingStage === "outbound"
        ? Math.max(deliveryTrack?.durationHours || 0, 0.2)
        : loadHours,
    stageElapsedHours: 0,
    deliveriesCompleted: 0,
    position: null,
  };
  prepareContractTravelStage(player, contract);
  updateContractPosition(contract);
  return contract;
}

function enterContractStage(player, contract, nextStage) {
  contract.stage = nextStage;
  contract.stageElapsedHours = 0;
  contract.stageDurationHours = nextStage === "repositioning"
    ? Math.max(contract.repositionTrack?.durationHours || 0, 0.2)
    : nextStage === "outbound"
      ? Math.max(contract.deliveryTrack?.durationHours || 0, 0.2)
      : nextStage === "returning"
        ? Math.max(contract.returnTrack?.durationHours || 0, 0.2)
        : nextStage === "loading"
          ? contract.loadHours
          : contract.unloadHours;
  if (isTravelStage(nextStage)) {
    prepareContractTravelStage(player, contract);
  } else {
    contract.travelStage = null;
  }
  updateContractPosition(contract);
}
function createPlayer(config) {
  const truckUnits = config.truckUnits.map((truckUnit) => hydrateTruckUnitState({ ...truckUnit }));
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
  player.contracts = config.contractSpecs.map((spec) => createContractState(player, {
    ...spec,
    truckUnit: truckUnitsById[spec.truckUnit.id] || spec.truckUnit,
  }));
  return player;
}

function buildPlayers() {
  const humanConfig = buildHumanPlayerConfig();
  const reservedFlowIds = new Set((humanConfig.contractSpecs || []).map((spec) => spec.flow.id));
  const robotConfigs = buildRobotPlayerConfigs(humanConfig.hqCityId, reservedFlowIds);
  const players = [humanConfig, ...robotConfigs].map(createPlayer);
  state.players = players;
  state.playersById = Object.fromEntries(players.map((player) => [player.id, player]));
  state.humanPrepared = Boolean(players[0]?.prepared);
  state.activeDrawerPlayerId = "";
  state.focusedPlayerId = players[0]?.id || "";

  appendLog("system", "neutral", `${state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa"} carregado.`);
  appendLog(players[0]?.id || "human", state.humanPrepared ? "positive" : "neutral", openingWizardEnabled()
    ? `Abertura ${RUNTIME_CONFIG.version || "1.1"} confirmada com ${formatInteger(robotConfigs.length)} adversarios.`
    : (state.humanPrepared
      ? "Preparacao carregada na partida."
      : "Preparacao nao foi encontrada; a operacao abriu com selecao automatica."));
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

function recommendationReasonsText(entry) {
  if (!Array.isArray(entry?.reasons) || !entry.reasons.length) {
    return "Base sugerida";
  }
  return entry.reasons.map((reason) => `${reason.layerLabel}: ${reason.productName}`).join(" · ");
}

function openingMarkerForCity(city, selected = false) {
  const band = findPopulationBand(city, state.populationBands);
  const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
  const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
  const currentPrice = openingContextForCity(city)?.openingPrice || 0;
  const ratio = clamp(
    (currentPrice - Number(state.openingPriceRange.min || 0))
      / Math.max(1, Number(state.openingPriceRange.max || 0) - Number(state.openingPriceRange.min || 0)),
    0,
    1,
  );
  const fillColor = priceColor(ratio);
  return createCityMarker({
    city,
    band: selected
      ? { ...(band || {}), marker_size_px: Math.round(baseMarkerSize * 1.72) }
      : band,
    pin,
    fillColor,
    strokeColor: selected ? "#ffffff" : "#fff9ea",
    contrastFillColor: selected ? "#ffffff" : "#fff9ea",
    selectedHaloFillColor: "#ffffff",
    selectedHaloStrokeColor: selected ? setupCompany().color : fillColor,
    selected,
    opacity: selected ? 1 : 0.78,
  });
}

function ensureOpeningMap() {
  if (state.setup.openingMap || !refs.openingMapStage || !state.bootstrap?.map_viewport) {
    return;
  }
  state.setup.openingMap = createBrasixMap({
    elementId: "game-runtime-opening-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
  });
  state.setup.openingMarkerLayer = window.L.layerGroup().addTo(state.setup.openingMap);
}

function renderOpeningMap() {
  ensureOpeningMap();
  if (!state.setup.openingMap || !state.setup.openingMarkerLayer) {
    return;
  }
  state.setup.openingMarkerLayer.clearLayers();
  state.setup.openingMarkersByCityId = {};
  state.cities.forEach((city) => {
    const marker = openingMarkerForCity(city, city.id === setupCompany().hqCityId);
    const opening = openingContextForCity(city);
    marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(String(opening?.band?.label || "Faixa"))} · ${escapeHtml(formatCurrency(opening?.openingPrice || 0))}`, {
      sticky: true,
      direction: "top",
      className: "brasix-map-tooltip city-editor-map-tooltip",
      opacity: 1,
      offset: [0, -8],
    });
    marker.on("click", () => selectSetupHeadquarters(city.id));
    marker.addTo(state.setup.openingMarkerLayer);
    state.setup.openingMarkersByCityId[city.id] = marker;
  });
  window.setTimeout(() => {
    if (!state.setup.openingMap) {
      return;
    }
    state.setup.openingMap.invalidateSize();
    state.setup.openingMap.fitBounds(
      [
        [state.bootstrap.map_viewport.lat_min, state.bootstrap.map_viewport.lon_min],
        [state.bootstrap.map_viewport.lat_max, state.bootstrap.map_viewport.lon_max],
      ],
      { padding: [30, 30], animate: false },
    );
    applyBrasixLeafletSettings(state.setup.openingMap, state.bootstrap.map_viewport, state.bootstrap.map_editor?.leaflet_settings || {});
  }, 40);
}

function selectSetupHeadquarters(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId || !state.citiesById[nextCityId]) {
    return;
  }
  const previousCityId = setupCompany().hqCityId;
  state.setup.company.hqCityId = nextCityId;
  if (nextCityId !== previousCityId) {
    state.setup.company.hqPurchased = false;
    state.setup.company.fleetPurchased = false;
    state.setup.selectedTruckInstances = state.setup.selectedTruckInstances.map((instance) => ({
      ...instance,
      current_city_id: nextCityId,
    }));
    setupPruneFreightSelection();
  }
  renderSetupModal();
}

function purchaseSetupHeadquarters() {
  const city = setupCurrentHqCity();
  if (!city || setupBalanceAfterHeadquarters(city) < 0) {
    return;
  }
  state.setup.company.hqPurchased = true;
  state.setup.company.fleetPurchased = false;
  openSetupModal("fleet");
}

function adjustSetupTruckQuantity(truckId, delta) {
  if (Number(delta || 0) > 0 && !setupCanAddTruckUnit(truckId)) {
    return;
  }
  state.setup.company.fleetPurchased = false;
  const normalizedTruckId = String(truckId || "").trim();
  const normalizedDelta = Number(delta || 0);
  if (!normalizedTruckId || !state.trucksById[normalizedTruckId] || !normalizedDelta) {
    return;
  }
  if (normalizedDelta > 0) {
    for (let index = 0; index < normalizedDelta; index += 1) {
      state.setup.selectedTruckInstances.push(createSetupSelectedTruckInstance(normalizedTruckId));
    }
  } else {
    const removableInstances = setupSelectedTruckUnitsForType(normalizedTruckId)
      .sort((left, right) => Number(right.display_number || 0) - Number(left.display_number || 0));
    for (let index = 0; index < Math.abs(normalizedDelta); index += 1) {
      const removable = removableInstances[index];
      if (!removable) {
        break;
      }
      state.setup.selectedTruckInstances = state.setup.selectedTruckInstances.filter((instance) => instance.id !== removable.id);
    }
  }
  setupPruneFreightSelection();
  renderSetupModal();
}

function purchaseSetupSelectedTrucks() {
  if (!setupSelectedTruckEntries().length) {
    return;
  }
  state.setup.company.fleetPurchased = true;
  openSetupModal("freights");
}

function toggleSetupFreightSelection(flowId) {
  const flow = state.freightFlowsById[flowId];
  if (!flow) {
    return;
  }
  const supportedProductIds = setupSelectedTruckSupportedProductIds();
  const productId = String(flow?.product_id || "").trim();
  if (!productId || !supportedProductIds.has(productId)) {
    return;
  }
  const pricedEntry = setupPricedFreightEntryById(flow.id, currentSelectionHqCityId()) || null;
  if (pricedEntry && (!pricedEntry.availability?.available || pricedEntry.fuelFeasible === false || !pricedEntry.contractTruckUnit)) {
    return;
  }
  if (setupFreightIsSelected(flowId)) {
    delete state.setup.selectedFreightAssignments[flowId];
  } else {
    const assignedTruckUnit = preferredSetupTruckUnitForFlow(flow, { excludeFlowId: flowId });
    if (!assignedTruckUnit) {
      return;
    }
    state.setup.selectedFreightAssignments[flowId] = assignedTruckUnit.id;
  }
  renderSetupModal();
}

function clearPurchaseDraftState() {
  state.setup.activePurchase = null;
  state.setup.company.fleetPurchased = false;
  state.setup.selectedTruckInstances = [];
  state.setup.selectedFreightAssignments = {};
  state.setup.dispatchSelectedCityId = "";
}

function startRuntimeTruckPurchaseFlow(playerId = "human") {
  const player = state.playersById[playerId] || null;
  if (!player || !player.isHuman) {
    return;
  }
  state.setup.activePurchase = { playerId: player.id };
  state.setup.company.hqCityId = player.hqCityId;
  state.setup.company.fleetPurchased = false;
  state.setup.selectedTruckInstances = [];
  state.setup.selectedFreightAssignments = {};
  state.setup.dispatchSelectedCityId = "";
  state.setup.nextTruckDisplayNumber = Math.max(
    Number(state.setup.nextTruckDisplayNumber || 1),
    ...player.truckUnits.map((truckUnit) => Number(truckUnit.displayNumber || 0) + 1),
  );
  openSetupModal("fleet");
}

function finishRuntimeTruckPurchaseFlow() {
  const player = activePurchasePlayer();
  if (!player) {
    return;
  }
  const hqCityId = currentSelectionHqCityId();
  const purchasedTruckUnits = setupSelectedTruckUnits().map((instance) => hydrateTruckUnitState({
    id: String(instance.id || "").trim(),
    displayNumber: Number(instance.display_number || instance.displayNumber || 0),
    currentCityId: String(instance.current_city_id || hqCityId).trim(),
    truckId: String(instance.truck_id || instance.truck?.id || "").trim(),
    truck: state.trucksById[String(instance.truck_id || instance.truck?.id || "").trim()] || instance.truck,
  }));
  const investmentBrl = setupSelectedFleetInvestmentTotal();
  player.cashBrl = roundNumber(player.cashBrl - investmentBrl, 2);
  player.truckUnits.push(...purchasedTruckUnits);
  buildContractSpecsFromSetup(purchasedTruckUnits, hqCityId).forEach((spec) => {
    const contract = createContractState(player, spec);
    player.contracts.push(contract);
  });
  appendLog(player.id, "positive", `${player.label} comprou ${formatInteger(purchasedTruckUnits.length)} caminhoes na sede (${formatCurrency(investmentBrl)}).`);
  clearPurchaseDraftState();
  state.setup.activeModal = "";
  updateSetupModalVisibility();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  focusPlayerOnMap(player);
}

function renderOpeningPalette() {
  if (!refs.openingPalette) {
    return;
  }
  const robotCount = clamp(Number(state.setup.robotCount || 0), MIN_ROBOT_COUNT, MAX_ROBOT_COUNT);
  if (refs.openingRobotCountValue) {
    refs.openingRobotCountValue.textContent = `${formatInteger(robotCount)} robo${robotCount > 1 ? "s" : ""}`;
  }
  refs.openingPalette.innerHTML = ROBOT_COLORS.slice(0, robotCount).map((color, index) => `
    <span class="game-runtime-color-chip" style="--player-color:${escapeHtml(color)}" title="${escapeHtml(`${ROBOT_NAMES[index] || `Adversario ${index + 1}`}`)}"></span>
  `).join("");
}

function renderOpeningLogoGrid() {
  if (!refs.openingLogoGrid) {
    return;
  }
  refs.openingLogoGrid.innerHTML = COMPANY_LOGO_OPTIONS.map((option) => `
    <button
      class="game-setup-logo-chip${option.id === setupCompany().logoId ? " is-selected" : ""}"
      type="button"
      data-runtime-logo-id="${escapeHtml(option.id)}"
      aria-label="${escapeHtml(option.label)}"
      title="${escapeHtml(option.label)}"
      style="--company-color:${escapeHtml(setupCompany().color)}"
    >
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(option.icon)}</span>
    </button>
  `).join("");
}

function renderOpeningCompanyPreview() {
  if (!refs.openingCompanyPreview) {
    return;
  }
  const city = setupCurrentHqCity();
  const logo = currentSetupLogoOption();
  refs.openingCompanyPreview.innerHTML = `
    <article class="game-setup-company-preview-card" style="--company-color:${escapeHtml(setupCompany().color)}">
      <div class="game-setup-company-preview-mark">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(logo.icon)}</span>
      </div>
      <div>
        <strong>${escapeHtml(String(setupCompany().name || "").trim() || "Brasix")}</strong>
        <p>${escapeHtml(city?.label || "Escolha a sede")}</p>
      </div>
    </article>
  `;
}

function renderOpeningEconomyPanel() {
  if (!refs.openingEconomy) {
    return;
  }
  const city = setupCurrentHqCity();
  const capital = setupCurrentCapitalSnapshot();
  const openingCost = setupHeadquartersOpeningCost(city);
  const balanceAfterHq = setupBalanceAfterHeadquarters(city);
  const canPurchase = Boolean(city) && balanceAfterHq >= 0;
  const purchased = setupHeadquartersPurchased();
  refs.openingEconomy.innerHTML = `
    <section class="game-setup-company-economy-card">
      <div class="game-setup-company-economy-head">
        <div>
          <span class="eyebrow">Compra da sede</span>
          <h3>${escapeHtml(city?.label || "Selecione a cidade no mapa")}</h3>
        </div>
        <span class="game-setup-pill${purchased ? " is-recommended" : ""}">${escapeHtml(purchased ? "Comprada" : "Pendente")}</span>
      </div>

      <div class="game-setup-summary-metrics game-setup-summary-metrics-compact game-setup-company-economy-metrics">
        <article>
          <span>Capital inicial</span>
          <strong>${escapeHtml(formatCurrency(capital.initialCash))}</strong>
        </article>
        <article>
          <span>Sede</span>
          <strong>${escapeHtml(formatCurrency(openingCost))}</strong>
        </article>
        <article>
          <span>Saldo</span>
          <strong class="${balanceAfterHq >= 0 ? "game-setup-balance-positive" : "game-setup-balance-negative"}">${escapeHtml(formatCurrency(balanceAfterHq))}</strong>
        </article>
      </div>

      <div class="game-setup-company-economy-actions">
        <div class="game-setup-company-economy-note">
          <strong>${escapeHtml(purchased ? "Sede confirmada" : canPurchase ? "Pronta para compra" : "Capital insuficiente")}</strong>
          <span>${escapeHtml(purchased ? `Dificuldade ${difficultyLabel(state.setup.selectedDifficulty)} · ${formatInteger(state.setup.robotCount)} adversarios.` : canPurchase ? `Depois da compra, sobram ${formatCurrency(balanceAfterHq)} para a operacao.` : "Escolha outra cidade ou reduza o nivel de exigencia.")}</span>
        </div>
        <button class="editor-header-action game-setup-company-purchase-button${purchased ? " is-purchased" : ""}" type="button" data-runtime-purchase-hq="true"${canPurchase && !purchased ? "" : " disabled"}>
          <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(purchased ? "check_circle" : "apartment")}</span>
          <span>${escapeHtml(purchased ? "Sede comprada" : "Comprar sede")}</span>
        </button>
      </div>
    </section>
  `;
}

function companyMarketCardMarkup(title, items, emptyMessage = "Sem itens com volume nesta lista.") {
  const topItems = (items || []).filter((item) => Number(item?.value || 0) > 0).slice(0, 5);
  return `
    <article class="city-editor-highlights-card">
      <header class="city-editor-section-copy">
        <strong>${escapeHtml(title)}</strong>
      </header>
      <div class="city-editor-top-list">
        ${topItems.length
          ? topItems.map((item) => `
            <div class="city-editor-top-line">
              <span class="city-editor-top-emoji">${escapeHtml(item.product_emoji || "•")}</span>
              <strong>${escapeHtml(item.product_name || item.product_id || "Produto")}</strong>
              <small>${escapeHtml(formatTonnes(item.value))}</small>
            </div>
          `).join("")
          : `<p class="city-editor-help-text">${escapeHtml(emptyMessage)}</p>`}
      </div>
    </article>
  `;
}

function renderOpeningMarketPanels() {
  const city = setupCurrentHqCity();
  const emptyMessage = city ? "Sem itens com volume nesta lista." : "Selecione uma cidade no mapa.";
  if (refs.openingTopOffers) {
    refs.openingTopOffers.innerHTML = companyMarketCardMarkup("Top ofertas", city?.supply_items || [], emptyMessage);
  }
  if (refs.openingTopDemands) {
    refs.openingTopDemands.innerHTML = companyMarketCardMarkup("Top demandas", city?.demand_items || [], emptyMessage);
  }
}

function renderSetupFleetRail() {
  if (!refs.fleetRail) {
    return;
  }
  const recommendedFleet = starterFleetBlueprintForCity(currentSelectionCity());
  const recommendedByTruckId = Object.fromEntries(recommendedFleet.fleetEntries.map((entry) => [entry.truck.id, entry]));
  const sortedTrucks = Object.values(state.trucksById).sort((left, right) => {
    const leftQuantity = setupSelectedTruckQuantityByType(left.id);
    const rightQuantity = setupSelectedTruckQuantityByType(right.id);
    const leftRecommended = recommendedByTruckId[left.id] ? 1 : 0;
    const rightRecommended = recommendedByTruckId[right.id] ? 1 : 0;
    const leftAffordable = setupCanAddTruckUnit(left.id) ? 1 : 0;
    const rightAffordable = setupCanAddTruckUnit(right.id) ? 1 : 0;
    return rightQuantity - leftQuantity
      || rightRecommended - leftRecommended
      || rightAffordable - leftAffordable
      || Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0)
      || String(left.label || "").localeCompare(String(right.label || ""), "pt-BR");
  });
  refs.fleetRail.innerHTML = sortedTrucks.length
    ? sortedTrucks.map((truck) => {
      const selectedInstances = setupSelectedTruckUnitsForType(truck.id);
      const quantity = selectedInstances.length;
      const recommendedEntry = recommendedByTruckId[truck.id] || null;
      const canAdd = setupCanAddTruckUnit(truck.id);
      const imageUrl = versionedAssetUrl(truck.preview_image_url_path, truck.preview_image_version);
      const implementLabel = primaryImplementLabel(truck);
      const implementPrice = Number(truck.implement_cost_brl || 0) > 0 ? formatCurrency(truck.implement_cost_brl) : "-";
      const productEmojiMarkup = truckProductEmojiMarkup(truck);
      const truckSubtitle = [slugLabel(truck.size_tier, SIZE_TIER_LABELS), String(truck.axle_config || "").trim()].filter(Boolean).join(" · ").toLocaleUpperCase("pt-BR");
      const recommendationBadge = recommendedEntry
        ? (recommendedEntry.reasons.length ? recommendedEntry.reasons.map((reason) => reason.layerLabel).join(" + ") : "Recomendado")
        : "";
      const truckBadges = [
        recommendationBadge ? `<span class="game-setup-pill is-recommended">${escapeHtml(recommendationBadge)}</span>` : "",
        !canAdd && quantity === 0 ? `<span class="game-setup-pill is-blocked">Fora do caixa</span>` : "",
      ].filter(Boolean).join("");
      const truckInstanceMarkup = quantity ? `<div class="game-setup-instance-strip">${truckUnitPillsMarkup(selectedInstances, 5)}</div>` : "";
      return `
        <article class="game-setup-rail-card game-setup-truck-card${quantity > 0 ? " is-selected" : ""}${!canAdd && quantity === 0 ? " is-disabled" : ""}" data-rail-card="true">
          <div class="game-setup-truck-visual${imageUrl ? "" : " is-empty"}">
            ${imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(truck.label)}" loading="lazy" />`
              : `<span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>`}
          </div>
          ${truckBadges ? `<div class="game-setup-rail-badges">${truckBadges}</div>` : ""}
          <div class="game-setup-rail-copy">
            <h3>${escapeHtml(truck.label)}</h3>
            <p class="game-setup-truck-subtitle">${escapeHtml(truckSubtitle || slugLabel(truck.size_tier, SIZE_TIER_LABELS).toLocaleUpperCase("pt-BR"))}</p>
          </div>
          ${truckInstanceMarkup}
          <div class="game-setup-spec-grid game-setup-truck-spec-grid">
            <article><span>Capacidade</span><strong>${escapeHtml(formatWeightKg(truck.payload_weight_kg))}</strong></article>
            <article><span>Caminhao</span><strong>${escapeHtml(Number(truck.truck_price_brl || 0) > 0 ? formatCurrency(truck.truck_price_brl) : "Sob consulta")}</strong></article>
            <article><span>Volume</span><strong>${escapeHtml(formatVolumeM3(truck.cargo_volume_m3))}</strong></article>
            <article class="game-setup-implement-box"><span class="game-setup-box-kicker">${escapeHtml(implementLabel)}</span><strong>${escapeHtml(implementPrice)}</strong></article>
            <article><span>Produtos</span><div class="game-setup-product-emoji-strip">${productEmojiMarkup}</div></article>
            <article class="game-setup-total-box"><span>Total</span><strong>${escapeHtml(formatCurrency(truck.purchase_price_brl))}</strong></article>
          </div>
          <div class="game-setup-stepper">
            <button class="game-setup-stepper-button game-setup-stepper-button-vivid" type="button" data-runtime-truck-change="-1" data-runtime-truck-id="${escapeHtml(truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">remove</span>
            </button>
            <strong>${escapeHtml(formatInteger(quantity))}</strong>
            <button class="game-setup-stepper-button game-setup-stepper-button-vivid" type="button" data-runtime-truck-change="1" data-runtime-truck-id="${escapeHtml(truck.id)}"${canAdd ? "" : " disabled"}>
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nenhum caminhao disponivel no catalogo ativo.</div>`;
  if (refs.fleetRailMeta) {
    refs.fleetRailMeta.textContent = `${formatInteger(sortedTrucks.length)} modelos · ${purchaseFlowActive() ? "caixa" : "orcamento"} ${formatCurrency(setupAvailableFleetBudget())}`;
  }
  bindWheelRail(refs.fleetRail);
  updateRailPerspective(refs.fleetRail);
}

function renderSetupFleetSelection() {
  if (!refs.fleetSelection) {
    return;
  }
  const city = currentSelectionCity();
  const purchaseMode = purchaseFlowActive();
  const entries = setupSelectedTruckEntries();
  const recommended = starterFleetBlueprintForCity(city);
  const totalUnits = entries.reduce((total, entry) => total + entry.quantity, 0);
  const totalInvestment = setupSelectedFleetInvestmentTotal();
  const totalVolume = entries.reduce((total, entry) => total + ((entry.truck.cargo_volume_m3 || 0) * entry.quantity), 0);
  const remainingCapital = setupRemainingCapitalAfterSelections(city);
  const canPurchaseFleet = entries.length > 0;
  const fleetPurchased = Boolean(state.setup.company.fleetPurchased && canPurchaseFleet);
  refs.fleetSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">${escapeHtml(purchaseMode ? "Compra na sede" : "Frota inicial")}</span>
      <h3>${escapeHtml(entries.length ? `${formatInteger(totalUnits)} caminhoes selecionados` : (purchaseMode ? "Monte a ampliacao da frota" : "Monte a frota de partida"))}</h3>
    </div>
    <div class="game-setup-summary-metrics game-setup-summary-metrics-compact">
      <article><span>${escapeHtml(purchaseMode ? "Caixa" : "Capital")}</span><strong>${escapeHtml(formatCurrency(purchaseMode ? (activePurchasePlayer()?.cashBrl || 0) : setupCurrentCapitalSnapshot().initialCash))}</strong></article>
      <article><span>${escapeHtml(purchaseMode ? "Sede" : "Sede")}</span><strong>${escapeHtml(purchaseMode ? cityLabel(city?.id) : formatCurrency(setupHeadquartersOpeningCost(city)))}</strong></article>
      <article><span>Investimento</span><strong>${escapeHtml(formatCurrency(totalInvestment))}</strong></article>
      <article><span>Saldo</span><strong class="${remainingCapital >= 0 ? "game-setup-balance-positive" : "game-setup-balance-negative"}">${escapeHtml(formatCurrency(remainingCapital))}</strong></article>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head"><span class="eyebrow">Recomendado</span><strong>${escapeHtml(`${formatInteger(recommended.fleetEntries.length)} modelos · ${formatCurrency(fleetInvestmentForEntries(recommended.fleetEntries))}`)}</strong></div>
      <div class="game-setup-selection-list">
        ${recommended.fleetEntries.length
          ? recommended.fleetEntries.map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.truck.short_label)}</strong>
              <span>${escapeHtml(`${formatInteger(fleetEntryUnits(entry))} un · ${recommendationReasonsText(entry)}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Sem recomendacao automatica para a sede atual.</div>`}
      </div>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head"><span class="eyebrow">Selecionado</span><strong>${escapeHtml(entries.length ? `${formatVolumeM3(totalVolume)} totais` : "Sem frota")}</strong></div>
      <div class="game-setup-selection-list">
        ${entries.length
          ? entries.map((entry) => `
            <article class="game-setup-selection-line game-setup-selection-line-editable">
              <div class="game-setup-selection-line-stack">
                <strong>${escapeHtml(entry.truck.short_label)}</strong>
                <span>${escapeHtml(truckUnitNumberList(entry.instances))}</span>
              </div>
              <div class="game-setup-quantity-inline">
                <button class="game-setup-stepper-button game-setup-stepper-button-vivid game-setup-quantity-button" type="button" data-runtime-truck-change="-1" data-runtime-truck-id="${escapeHtml(entry.truck.id)}">
                  <span class="material-symbols-outlined" aria-hidden="true">remove</span>
                </button>
                <span>${escapeHtml(`${formatInteger(entry.quantity)} un`)}</span>
                <button class="game-setup-stepper-button game-setup-stepper-button-vivid game-setup-quantity-button" type="button" data-runtime-truck-change="1" data-runtime-truck-id="${escapeHtml(entry.truck.id)}"${setupCanAddTruckUnit(entry.truck.id) ? "" : " disabled"}>
                  <span class="material-symbols-outlined" aria-hidden="true">add</span>
                </button>
              </div>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">${escapeHtml(purchaseMode ? "A ampliacao da frota ainda esta vazia. Use os botoes + nos cartoes para adicionar unidades." : "A frota inicial ainda esta vazia. Use os botoes + nos cartoes para adicionar unidades.")}</div>`}
      </div>
    </div>
    <div class="game-setup-modal-actions game-setup-inline-actions">
      <button class="editor-header-action game-setup-company-purchase-button game-setup-truck-purchase-button${fleetPurchased ? " is-purchased" : ""}" type="button" data-runtime-purchase-trucks="true"${canPurchaseFleet && !fleetPurchased ? "" : " disabled"}>
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(fleetPurchased ? "check_circle" : "local_shipping")}</span>
        <span>${escapeHtml(fleetPurchased ? "Caminhoes comprados" : purchaseMode ? "Separar compra" : "Comprar caminhoes")}</span>
      </button>
    </div>
  `;
}

function buildHumanAssignmentPricedEntries() {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  const truckUnit = assignment ? (player?.truckUnits || []).find((item) => item.id === assignment.truckUnitId) || null : null;
  if (!assignment || !player || !truckUnit) {
    return [];
  }
  return (state.outboundFreightsByCityId[assignment.originCityId] || [])
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).state !== "completed")
    .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
    .map((flow) => {
      const track = getTrack(flow.origin_id, flow.destination_id, "fastest");
      const payloadTons = flowPayloadTons(flow, truckUnit.truck, null);
      const revenuePerDeliveryBrl = estimateDeliveryRevenue(flow, truckUnit.truck, player, null, track.distanceKm);
      const availability = freightFlowAvailability(flow.id);
      const executionPlan = buildTruckFlowExecutionPlan(truckUnit, flow, {
        currentCityId: assignment.originCityId,
        startingFuelLiters: truckUnit.fuelLevelLiters,
      });
      return {
        flow,
        unitRevenuePerTon: payloadTons > 0 ? revenuePerDeliveryBrl / payloadTons : 0,
        contractTruckUnit: truckUnit,
        contractTruck: truckUnit.truck,
        contractPayloadTons: payloadTons,
        contractRevenue: revenuePerDeliveryBrl,
        availability,
        fuelFeasible: executionPlan.feasible,
        executionPlan,
      };
    })
    .sort((left, right) => Number(right.contractRevenue || 0) - Number(left.contractRevenue || 0));
}

function assignmentTruckUnit() {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  return assignment ? (player?.truckUnits || []).find((item) => item.id === assignment.truckUnitId) || null : null;
}

function mainMapDispatchSelectionActive() {
  return advancedDispatchEnabled() && Boolean(state.setup.mainMapDispatchSelection && state.setup.activeHumanAssignment);
}

function syncMainMapDispatchSelectionUi() {
  if (refs.mapStage) {
    refs.mapStage.classList.toggle("is-dispatch-picking", mainMapDispatchSelectionActive());
  }
}

function startMainMapDispatchSelection() {
  if (!state.setup.activeHumanAssignment) {
    return;
  }
  state.setup.mainMapDispatchSelection = true;
  state.setup.dispatchSelectedCityId = "";
  state.setup.activeModal = "";
  updateSetupModalVisibility();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  focusPlayerOnMap(state.playersById.human || state.players[0] || null);
}

function cancelMainMapDispatchSelection({ reopenModal = true } = {}) {
  if (!mainMapDispatchSelectionActive()) {
    return;
  }
  state.setup.mainMapDispatchSelection = false;
  state.setup.dispatchSelectedCityId = "";
  if (reopenModal) {
    openSetupModal("freights");
    return;
  }
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
}

function handleMainMapDispatchCitySelection(cityId) {
  if (!mainMapDispatchSelectionActive()) {
    return;
  }
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  const truckUnit = assignmentTruckUnit();
  const destinationCityId = String(cityId || "").trim();
  if (!assignment || !player || !truckUnit || !destinationCityId || !state.citiesById[destinationCityId]) {
    return;
  }
  if (destinationCityId === assignment.originCityId) {
    return;
  }
  const dispatchPlan = buildTravelFuelPlan({
    track: getTrack(assignment.originCityId, destinationCityId, "fastest"),
    truck: truckUnit.truck,
    loaded: false,
    startingFuelLiters: Number(truckUnit.fuelLevelLiters || 0),
  });
  if (dispatchPlan && dispatchPlan.feasible === false) {
    appendLog(player.id, "negative", fuelBlockedMessage(dispatchPlan));
    renderStaticUi();
    renderMapUi({ refreshIcons: true });
    return;
  }
  state.setup.dispatchSelectedCityId = destinationCityId;
  finishHumanDispatchSelection("reposition");
}

function truckFuelSnapshot(truckUnit, contract = null) {
  const projected = contract ? projectedTravelSnapshot(contract) : null;
  return {
    fuelLevelLiters: Math.max(0, Number(projected?.fuelLevelLiters ?? truckUnit?.fuelLevelLiters ?? 0)),
    tankLiters: Math.max(0, Number(projected?.tankLiters ?? truckUnit?.fuelTankLiters ?? truckFuelTankLiters(truckUnit?.truck) ?? 0)),
    odometerKm: Math.max(0, Number(projected?.odometerKm ?? truckUnit?.odometerKm ?? 0)),
  };
}

function truckLoadedRangeKm(truckUnit, fuelLevelLiters = Number(truckUnit?.fuelLevelLiters || 0)) {
  const consumptionPerKm = truckConsumptionLitersPerKm(truckUnit?.truck, { loaded: true });
  if (!(consumptionPerKm > 0)) {
    return 0;
  }
  return Math.max(0, Number(fuelLevelLiters || 0) / consumptionPerKm);
}

function ensureDispatchMap() {
  const stageElement = document.getElementById("game-runtime-dispatch-map-stage");
  if (!stageElement || !state.bootstrap?.map_viewport) {
    return null;
  }
  if (state.setup.dispatchMap && state.setup.dispatchMap.getContainer?.() !== stageElement) {
    state.setup.dispatchMap.remove();
    state.setup.dispatchMap = null;
    state.setup.dispatchMarkerLayer = null;
  }
  if (!state.setup.dispatchMap) {
    state.setup.dispatchMap = createBrasixMap({
      elementId: "game-runtime-dispatch-map-stage",
      viewport: state.bootstrap.map_viewport,
      leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
    });
    state.setup.dispatchMarkerLayer = window.L.layerGroup().addTo(state.setup.dispatchMap);
  }
  return state.setup.dispatchMap;
}

function selectDispatchDestination(cityId) {
  const normalizedCityId = String(cityId || "").trim();
  if (!normalizedCityId || !state.citiesById[normalizedCityId]) {
    return;
  }
  state.setup.dispatchSelectedCityId = normalizedCityId;
  renderSetupFreightSelection();
  window.setTimeout(() => renderDispatchDestinationMap(), 30);
}

function renderDispatchDestinationMap() {
  if (!advancedDispatchEnabled() || !state.setup.activeHumanAssignment) {
    return;
  }
  const map = ensureDispatchMap();
  if (!map || !state.setup.dispatchMarkerLayer) {
    return;
  }
  const assignment = state.setup.activeHumanAssignment;
  state.setup.dispatchMarkerLayer.clearLayers();
  state.setup.dispatchMarkersByCityId = {};
  state.cities.forEach((city) => {
    const isCurrentCity = city.id === assignment.originCityId;
    const marker = openingMarkerForCity(city, city.id === state.setup.dispatchSelectedCityId);
    marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(formatCurrency(dieselPriceForCity(city.id)))} diesel`, {
      sticky: true,
      direction: "top",
      className: "brasix-map-tooltip city-editor-map-tooltip",
      opacity: 1,
      offset: [0, -8],
    });
    if (!isCurrentCity) {
      marker.on("click", () => selectDispatchDestination(city.id));
    }
    marker.setOpacity(isCurrentCity ? 0.45 : 0.88);
    marker.addTo(state.setup.dispatchMarkerLayer);
    state.setup.dispatchMarkersByCityId[city.id] = marker;
  });
  window.setTimeout(() => {
    if (!state.setup.dispatchMap) {
      return;
    }
    state.setup.dispatchMap.invalidateSize();
    state.setup.dispatchMap.fitBounds(
      [
        [state.bootstrap.map_viewport.lat_min, state.bootstrap.map_viewport.lon_min],
        [state.bootstrap.map_viewport.lat_max, state.bootstrap.map_viewport.lon_max],
      ],
      { padding: [24, 24], animate: false },
    );
    applyBrasixLeafletSettings(state.setup.dispatchMap, state.bootstrap.map_viewport, state.bootstrap.map_editor?.leaflet_settings || {});
  }, 30);
}

function renderSetupFreightRail() {
  if (!refs.freightRail) {
    return;
  }
  const assignmentMode = Boolean(state.setup.activeHumanAssignment);
  const cityId = assignmentMode ? state.setup.activeHumanAssignment.originCityId : currentSelectionHqCityId();
  const pricedEntries = assignmentMode ? buildHumanAssignmentPricedEntries() : setupPricedFreightsForCity(cityId);
  const selectedEntries = assignmentMode ? [] : setupSelectedPricedFreightEntries();
  const recommendedIds = new Set((assignmentMode
    ? pricedEntries.filter((entry) => entry.availability?.available && entry.fuelFeasible !== false)
    : setupRecommendedPricedFreights(RECOMMENDED_FREIGHT_LIMIT)).map((entry) => entry.flow.id));
  const supportedProductIds = setupSelectedTruckSupportedProductIds();
  const referenceProductIds = setupReferenceSupportedProductIds();
  const hasSelectedFleet = assignmentMode ? true : setupSelectedTruckEntries().length > 0;

  refs.freightRail.innerHTML = pricedEntries.length
    ? pricedEntries.map((entry) => {
      const flow = entry.flow;
      const selected = assignmentMode ? false : setupFreightIsSelected(flow.id);
      const availabilityState = entry.availability?.state || "available";
      const available = availabilityState === "available";
      const fuelFeasible = entry.fuelFeasible !== false;
      const hasProductCompatibleTruck = assignmentMode ? true : Boolean(supportedProductIds.has(flow.product_id));
      const compatible = assignmentMode
        ? (available && fuelFeasible)
        : Boolean(entry.contractTruckUnit) && available && fuelFeasible;
      const suggestedForReferenceFleet = referenceProductIds.has(flow.product_id);
      const contractTruckLabel = entry.contractTruck?.short_label || entry.contractTruck?.label || "-";
      const contractTruckUnitLabel = entry.contractTruckUnit ? `${truckUnitNumberLabel(entry.contractTruckUnit)} · ${contractTruckLabel}` : contractTruckLabel;
      const contractSummary = entry.contractTruck
        ? `1 viagem: ${formatCurrency(entry.contractRevenue)} · ${contractTruckUnitLabel} · ${formatTonnes(entry.contractPayloadTons)}`
        : hasSelectedFleet
          ? "Sem caminhao livre na origem para calcular o contrato"
          : "Escolha um caminhao compativel para calcular o contrato";
      const fuelMessage = fuelBlockedMessage(entry.executionPlan?.outboundPlan || entry.executionPlan?.repositionPlan || entry.executionPlan);
      const compatibilityMessage = !available
        ? entry.availability.message
        : !fuelFeasible
          ? fuelMessage
          : assignmentMode
            ? `Novo frete para ${truckUnitNumberLabel(entry.contractTruckUnit)}`
            : compatible
              ? "Caminhao livre na origem"
              : hasSelectedFleet
                ? hasProductCompatibleTruck
                  ? "Sem caminhao livre na origem"
                  : "Inativo para a frota atual"
                : suggestedForReferenceFleet
                  ? "Compativel com a frota sugerida"
                  : "Escolha uma frota compativel";
      const cardEnabled = compatible || (!assignmentMode && !hasSelectedFleet && suggestedForReferenceFleet && available);
      const actionLabel = assignmentMode
        ? compatible
          ? "Assumir frete"
          : !available
            ? "Indisponivel"
            : !fuelFeasible
              ? "Sem autonomia"
              : "Indisponivel"
        : selected
          ? `Selecionado em ${entry.contractTruckUnit ? truckUnitNumberLabel(entry.contractTruckUnit) : "frota"}`
          : compatible
            ? "Contratar"
            : !available
              ? "Em execucao"
              : !fuelFeasible
                ? "Sem autonomia"
                : hasSelectedFleet
                  ? "Sem frota compativel"
                  : "Escolha a frota";
      return `
        <article class="game-setup-rail-card game-setup-freight-card${selected ? " is-selected" : ""}${cardEnabled ? "" : " is-disabled"}" data-rail-card="true" style="--freight-color:${escapeHtml(flow.product_color || setupCompany().color)}">
          <div class="game-setup-rail-badges">
            ${recommendedIds.has(flow.id) ? `<span class="game-setup-pill is-recommended">Top recomendado</span>` : ""}
            ${!assignmentMode && selected && entry.contractTruckUnit ? `<span class="game-setup-pill is-instance">${escapeHtml(truckUnitNumberLabel(entry.contractTruckUnit))}</span>` : ""}
            ${availabilityState === "active" ? `<span class="game-setup-pill is-blocked">Em execucao</span>` : ""}
            ${!fuelFeasible ? `<span class="game-setup-pill is-blocked">Sem autonomia</span>` : ""}
          </div>
          <div class="game-setup-freight-product">
            <span class="game-setup-product-emoji">${escapeHtml(flow.product_emoji || "📦")}</span>
            <div>
              <strong>${escapeHtml(flow.product_name)}</strong>
              <small>${escapeHtml(entry.contractTruck ? `${contractTruckUnitLabel} · ${formatTonnes(entry.contractPayloadTons)} por viagem` : "Preco por tonelada da rota")}</small>
            </div>
          </div>
          <div class="game-setup-freight-route">
            <strong>${escapeHtml(flow.origin_label)}</strong>
            <span class="material-symbols-outlined" aria-hidden="true">east</span>
            <strong>${escapeHtml(flow.destination_label)}</strong>
          </div>
          <div class="game-setup-spec-grid game-setup-freight-spec-grid">
            <article><span>Distancia</span><strong>${escapeHtml(formatDistanceKm(flow.distance_km))}</strong></article>
            <article><span>Taxa</span><strong>${escapeHtml(formatCurrencyPerTon(entry.unitRevenuePerTon))}</strong></article>
          </div>
          <p class="game-setup-compatibility-note${available && fuelFeasible && (compatible || (!hasSelectedFleet && suggestedForReferenceFleet)) ? " is-active" : ""}">${escapeHtml(`${compatibilityMessage} · ${contractSummary}`)}</p>
          <button class="editor-header-action game-setup-freight-toggle" type="button" data-runtime-toggle-freight="${escapeHtml(flow.id)}"${compatible ? "" : " disabled"}>
            <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(assignmentMode ? (compatible ? "play_arrow" : "block") : selected ? "check_circle" : compatible ? "add_circle" : "block")}</span>
            <span>${escapeHtml(actionLabel)}</span>
          </button>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">${escapeHtml(assignmentMode && advancedDispatchEnabled() ? `Nao ha contratos livres em ${cityLabel(cityId)}. Use o mapa principal para reposicionar ou voltar para a sede.` : `Nao ha fretes de saida ativos para ${cityLabel(cityId) || "a cidade atual"}.`)}</div>`;

  if (refs.freightRailMeta) {
    refs.freightRailMeta.textContent = assignmentMode
      ? `${formatInteger(pricedEntries.filter((entry) => entry.availability?.available).length)} contratos livres · ${cityLabel(cityId)}`
      : `${formatInteger(pricedEntries.length)} fretes · ${formatInteger(selectedEntries.length)} selecionados`;
  }
  if (refs.freightRailTitle) {
    refs.freightRailTitle.textContent = assignmentMode
      ? `Contratos de ${cityLabel(cityId)}`
      : `Fretes de saida de ${cityLabel(cityId)}`;
  }
  bindWheelRail(refs.freightRail);
  updateRailPerspective(refs.freightRail);
}

function renderSetupFreightSelection() {
  if (!refs.freightSelection) {
    return;
  }
  const assignmentMode = Boolean(state.setup.activeHumanAssignment);
  const cityId = assignmentMode ? state.setup.activeHumanAssignment.originCityId : currentSelectionHqCityId();
  const allAssignmentEntries = assignmentMode ? buildHumanAssignmentPricedEntries() : [];
  const entries = assignmentMode ? allAssignmentEntries.filter((entry) => entry.availability?.available && entry.fuelFeasible !== false).slice(0, 4) : setupSelectedPricedFreightEntries();
  const recommended = assignmentMode ? entries : setupRecommendedPricedFreights(4);
  const totalTonnes = entries.reduce((total, entry) => total + Number(entry.contractPayloadTons || 0), 0);
  const averageDistance = entries.length ? entries.reduce((total, entry) => total + Number(entry.flow.distance_km || 0), 0) / entries.length : 0;
  const totalRevenue = entries.reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
  const truckUnit = assignmentMode ? assignmentTruckUnit() : null;
  const fuelSnapshot = truckUnit ? truckFuelSnapshot(truckUnit) : null;
  refs.freightSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">${escapeHtml(assignmentMode ? "Destino" : "Carteira")}</span>
      <h3>${escapeHtml(assignmentMode ? `Despacho em ${cityLabel(cityId)}` : (entries.length ? `${formatInteger(entries.length)} contratos selecionados` : `Fretes de ${cityLabel(cityId)}`))}</h3>
    </div>
    <div class="game-setup-summary-metrics">
      <article><span>${escapeHtml(assignmentMode ? "Tanque" : "Melhor taxa")}</span><strong>${escapeHtml(assignmentMode ? `${formatLiters(fuelSnapshot?.fuelLevelLiters || 0)} / ${formatLiters(fuelSnapshot?.tankLiters || 0)}` : (recommended[0] ? formatCurrencyPerTon(recommended[0].unitRevenuePerTon) : "-"))}</strong></article>
      <article><span>${escapeHtml(assignmentMode ? "Autonomia" : "Receita carteira")}</span><strong>${escapeHtml(assignmentMode ? formatDistanceKm(truckLoadedRangeKm(truckUnit, fuelSnapshot?.fuelLevelLiters || 0)) : formatCurrency(totalRevenue))}</strong></article>
      <article><span>${escapeHtml(assignmentMode ? "Odometro" : "Carga por viagens")}</span><strong>${escapeHtml(assignmentMode ? formatDistanceKm(fuelSnapshot?.odometerKm || 0) : formatTonnes(totalTonnes))}</strong></article>
      <article><span>${escapeHtml(assignmentMode ? "Contratos livres" : "Distancia media")}</span><strong>${escapeHtml(assignmentMode ? formatInteger(entries.length) : (entries.length ? formatDistanceKm(averageDistance) : "-"))}</strong></article>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head"><span class="eyebrow">Recomendado</span><strong>${escapeHtml(`${formatInteger(recommended.length)} contratos`)}</strong></div>
      <div class="game-setup-selection-list">
        ${recommended.length
          ? recommended.map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.flow.product_name)}</strong>
              <span>${escapeHtml(`${formatCurrencyPerTon(entry.unitRevenuePerTon)} · ${entry.flow.origin_label} -> ${entry.flow.destination_label}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum frete recomendado para a cidade atual.</div>`}
      </div>
    </div>
    ${assignmentMode && advancedDispatchEnabled() ? `
      <div class="game-setup-section-block">
        <div class="game-setup-section-head"><span class="eyebrow">Despacho alternativo</span><strong>Mapa principal</strong></div>
        <div class="game-runtime-dispatch-options">
          <button class="editor-header-action game-runtime-mini-action" type="button" data-runtime-dispatch-action="return-hq"${cityId === (state.playersById.human?.hqCityId || "") ? " disabled" : ""}>
            <span class="material-symbols-outlined" aria-hidden="true">home_work</span>
            <span>Voltar para a sede</span>
          </button>
          <button class="editor-header-action game-runtime-mini-action" type="button" data-runtime-dispatch-action="pick-map">
            <span class="material-symbols-outlined" aria-hidden="true">explore</span>
            <span>Escolher destino no mapa</span>
          </button>
        </div>
        <p class="game-setup-compatibility-note is-active">Ao clicar, o seletor fecha e o mapa principal entra no modo de escolha da cidade.</p>
      </div>
    ` : assignmentMode ? "" : `
      <div class="game-setup-section-block">
        <div class="game-setup-section-head"><span class="eyebrow">Selecionado</span><strong>${escapeHtml(entries.length ? `${formatInteger(entries.length)} contratos` : "Sem contratos")}</strong></div>
        <div class="game-setup-selection-list">
          ${entries.length
            ? entries.map((entry) => `
              <article class="game-setup-selection-line">
                <strong>${escapeHtml(entry.flow.product_name)}</strong>
                <span>${escapeHtml(`${formatCurrency(entry.contractRevenue)} · ${entry.contractTruckUnit ? `${truckUnitNumberLabel(entry.contractTruckUnit)} · ` : ""}${entry.contractTruck?.short_label || entry.contractTruck?.label || "-"} · ${formatTonnes(entry.contractPayloadTons)}`)}</span>
              </article>
            `).join("")
            : `<div class="truck-gallery-empty">Nenhum contrato selecionado ainda para ${escapeHtml(cityLabel(cityId))}.</div>`}
        </div>
      </div>
    `}
  `;
}

function renderSetupModal() {
  if (!openingWizardEnabled() || !refs.modalRoot) {
    return;
  }
  if (refs.openingDifficultySelect) {
    refs.openingDifficultySelect.value = setupCurrentDifficultyId();
  }
  if (refs.openingRobotCountInput) {
    refs.openingRobotCountInput.value = String(clamp(state.setup.robotCount, MIN_ROBOT_COUNT, MAX_ROBOT_COUNT));
  }
  if (refs.openingCompanyNameInput) {
    refs.openingCompanyNameInput.value = String(setupCompany().name || "");
  }
  if (refs.openingCompanyColorInput) {
    refs.openingCompanyColorInput.value = normalizeColor(setupCompany().color, "#356d63");
  }
  if (refs.openingCompanyColorTextInput) {
    refs.openingCompanyColorTextInput.value = normalizeColor(setupCompany().color, "#356d63");
  }
  renderStatus();
  renderOpeningPalette();
  renderOpeningLogoGrid();
  renderOpeningCompanyPreview();
  renderOpeningEconomyPanel();
  renderOpeningMarketPanels();
  renderSetupFleetRail();
  renderSetupFleetSelection();
  renderSetupFreightRail();
  renderSetupFreightSelection();
  updateSetupModalVisibility();
}

function setupModalCanClose() {
  if (state.setup.activeHumanAssignment) {
    return Boolean(state.setup.activeHumanAssignment.optional);
  }
  if (state.setup.activeModal === "opening") {
    return setupHeadquartersPurchased();
  }
  if (state.setup.activeModal === "fleet") {
    if (purchaseFlowActive() || (openingWizardEnabled() && !state.players.length)) {
      return true;
    }
    return Boolean(state.setup.company.fleetPurchased && setupSelectedTruckEntries().length);
  }
  if (state.setup.activeModal === "freights") {
    if (purchaseFlowActive()) {
      return true;
    }
    const entries = setupPricedFreightsForCity(currentSelectionHqCityId())
      .filter((entry) => Boolean(entry.contractTruckUnit))
      .filter((entry) => entry.availability?.available && entry.fuelFeasible !== false);
    return setupSelectedPricedFreightEntries().length > 0 || !entries.length;
  }
  return true;
}

function updateSetupModalVisibility() {
  if (!refs.modalRoot) {
    return;
  }
  const modalName = state.setup.activeModal;
  refs.modalRoot.hidden = !modalName;
  refs.modalRoot.querySelectorAll("[data-runtime-modal]").forEach((modal) => {
    modal.hidden = modal.getAttribute("data-runtime-modal") !== modalName;
  });
  const closers = refs.modalRoot.querySelectorAll("[data-runtime-close-modal]");
  closers.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.disabled = !setupModalCanClose();
  });
  if (modalName === "opening") {
    window.setTimeout(() => renderOpeningMap(), 40);
  }
}

function openSetupModal(modalName) {
  state.setup.activeModal = modalName;
  renderSetupModal();
}

function closeSetupModal() {
  if (!setupModalCanClose()) {
    return;
  }
  if (state.setup.activeHumanAssignment) {
    if (!state.setup.activeHumanAssignment.optional) {
      return;
    }
    resetHumanAssignmentState();
    state.setup.activeModal = "";
    updateSetupModalVisibility();
    renderStaticUi();
    renderMapUi({ refreshIcons: true });
    processPendingHumanAssignmentQueue();
    return;
  }
  if (openingWizardEnabled() && !state.players.length && !purchaseFlowActive() && state.setup.activeModal === "fleet") {
    openSetupModal("opening");
    return;
  }
  if (purchaseFlowActive() && state.setup.activeModal === "freights") {
    finishRuntimeTruckPurchaseFlow();
    return;
  }
  if (purchaseFlowActive()) {
    clearPurchaseDraftState();
  }
  if (state.setup.activeModal === "freights" && openingWizardEnabled() && !state.players.length) {
    state.setup.activeModal = "";
    updateSetupModalVisibility();
    buildPlayers();
    renderStaticUi();
    renderMapUi({ refreshIcons: true });
    focusPlayerOnMap(state.playersById.human || state.players[0] || null);
    startSimulation();
    return;
  }
  state.setup.activeModal = "";
  updateSetupModalVisibility();
}

function handleRuntimeKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }
  if (mainMapDispatchSelectionActive()) {
    event.preventDefault();
    cancelMainMapDispatchSelection({ reopenModal: true });
    return;
  }
  if (state.setup.activeModal) {
    if (setupModalCanClose()) {
      event.preventDefault();
      closeSetupModal();
    }
    return;
  }
  if (state.activeDrawerPlayerId) {
    event.preventDefault();
    state.activeDrawerPlayerId = "";
    renderPlayerBar();
    renderDrawer();
  }
}

function finishHumanAssignmentSelection(flowId) {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  const truckUnit = assignment ? player?.truckUnits?.find((unit) => unit.id === assignment.truckUnitId) || null : null;
  const flow = state.freightFlowsById[String(flowId || "").trim()] || null;
  if (!assignment || !player || !truckUnit || !flow) {
    return;
  }
  const contract = assignFlowToTruck(player, truckUnit, flow);
  if (!contract) {
    return;
  }
  resetHumanAssignmentState();
  state.setup.activeModal = "";
  updateSetupModalVisibility();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  processPendingHumanAssignmentQueue();
}

function finishHumanDispatchSelection(dispatchMode) {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  const truckUnit = assignment ? player?.truckUnits?.find((unit) => unit.id === assignment.truckUnitId) || null : null;
  if (!assignment || !player || !truckUnit) {
    return;
  }
  const destinationCityId = dispatchMode === "return-hq"
    ? player.hqCityId
    : String(state.setup.dispatchSelectedCityId || "").trim();
  if (!destinationCityId || destinationCityId === assignment.originCityId) {
    return;
  }
  const contract = assignDispatchToTruck(player, truckUnit, destinationCityId, dispatchMode === "return-hq" ? "return_hq" : "reposition");
  if (!contract) {
    return;
  }
  resetHumanAssignmentState();
  state.setup.activeModal = "";
  updateSetupModalVisibility();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  processPendingHumanAssignmentQueue();
}

function initializeOpeningWizard() {
  if (!openingWizardEnabled()) {
    return;
  }
  state.setup.selectedDifficulty = "standard";
  state.setup.robotCount = 3;
  state.setup.company = {
    name: "Brasix",
    color: "#356d63",
    logoId: COMPANY_LOGO_OPTIONS[0].id,
    hqCityId: preferredStartupCityId(),
    hqPurchased: false,
    fleetPurchased: false,
  };
  state.setup.selectedTruckInstances = [];
  state.setup.selectedFreightAssignments = {};
  state.setup.nextTruckDisplayNumber = 1;
  state.setup.nextTruckGameSequence = 1;
  state.setup.pendingHumanAssignments = [];
  state.setup.activeHumanAssignment = null;
  state.setup.activePurchase = null;
  state.setup.dispatchSelectedCityId = "";
  state.setup.mainMapDispatchSelection = false;
  openSetupModal("opening");
}

function findWheelRailTarget(eventTarget) {
  return eventTarget instanceof Element ? eventTarget.closest("[data-wheel-rail]") : null;
}

function applyWheelScrollToRail(element, delta) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.scrollLeft += delta * 1.18;
  updateRailPerspective(element);
}

function bindWheelRail(element) {
  if (!element || element.dataset.wheelBound === "true") {
    return;
  }
  element.dataset.wheelBound = "true";
  element.addEventListener("scroll", () => updateRailPerspective(element));
}

function handleRailWheel(event) {
  if (event.defaultPrevented || event.ctrlKey || !state.setup.activeModal) {
    return;
  }
  const rail = findWheelRailTarget(event.target);
  if (!(rail instanceof HTMLElement) || rail.scrollWidth <= rail.clientWidth + 4) {
    return;
  }
  const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (!dominantDelta) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  applyWheelScrollToRail(rail, dominantDelta);
}

function updateRailPerspective(element) {
  if (!element) {
    return;
  }
  const cards = Array.from(element.querySelectorAll("[data-rail-card]"));
  if (!cards.length) {
    return;
  }
  const centerX = element.scrollLeft + (element.clientWidth / 2);
  cards.forEach((card) => {
    const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
    const ratio = Math.max(-1.5, Math.min(1.5, (cardCenter - centerX) / Math.max(element.clientWidth * 0.42, 1)));
    const distance = Math.min(Math.abs(ratio), 1.5);
    card.style.setProperty("--rail-tilt", String(ratio * -7));
    card.style.setProperty("--rail-lift", String(distance * 18));
    card.style.setProperty("--rail-scale", String(1 - (distance * 0.09)));
    card.style.setProperty("--rail-opacity", String(1 - (distance * 0.24)));
    card.classList.toggle("is-focus", distance < 0.22);
  });
}

function handleRuntimeInputs(event) {
  const target = event.target;
  if (target === refs.openingDifficultySelect && target instanceof HTMLSelectElement) {
    state.setup.selectedDifficulty = normalizeDifficultyId(target.value);
    state.setup.company.hqPurchased = false;
    state.setup.company.fleetPurchased = false;
    renderStatus();
    renderOpeningEconomyPanel();
    return;
  }
  if (target === refs.openingRobotCountInput && (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    state.setup.robotCount = clamp(Number(target.value || 3), MIN_ROBOT_COUNT, MAX_ROBOT_COUNT);
    renderStatus();
    renderOpeningPalette();
    return;
  }
  if (target === refs.openingCompanyNameInput && target instanceof HTMLInputElement) {
    state.setup.company.name = String(target.value || "").slice(0, 48);
    renderOpeningCompanyPreview();
    return;
  }
  if (target === refs.openingCompanyColorInput && target instanceof HTMLInputElement) {
    state.setup.company.color = normalizeColor(target.value, "#356d63");
    renderSetupModal();
    return;
  }
  if (target === refs.openingCompanyColorTextInput && target instanceof HTMLInputElement) {
    const normalizedColor = normalizeColor(target.value, "");
    if (normalizedColor) {
      state.setup.company.color = normalizedColor;
      renderSetupModal();
    }
  }
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
  const dispatchPicking = mainMapDispatchSelectionActive();
  const dispatchAssignment = dispatchPicking ? state.setup.activeHumanAssignment : null;

  state.cities.forEach((city) => {
    const ownerPlayer = state.players.find((player) => player.hqCityId === city.id) || null;
    const band = findPopulationBand(city, state.populationBands);
    const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
    const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
    const dispatchSelectable = Boolean(dispatchPicking && dispatchAssignment && city.id !== dispatchAssignment.originCityId);
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
      opacity: dispatchPicking ? (dispatchSelectable ? 0.94 : 0.24) : (selected ? 0.96 : 0.56),
    });
    if (dispatchSelectable) {
      marker.on("click", () => handleMainMapDispatchCitySelection(city.id));
      marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong><br>Clique para enviar o caminhao para ca`, {
        sticky: true,
        direction: "top",
        className: "brasix-map-tooltip city-editor-map-tooltip",
        opacity: 1,
        offset: [0, -8],
      });
    }
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

function vehicleIconStateKey(player, truckUnit, contract = null) {
  return `${player.color}:${contract?.stage || "idle"}:${truckUnit.displayNumber}`;
}

function buildVehicleIcon(player, truckUnit, contract = null) {
  return window.L.divIcon({
    className: "game-runtime-vehicle-icon-shell",
    html: `
      <div class="game-runtime-vehicle-icon is-${escapeHtml(contract?.stage || "idle")}" style="--player-color:${escapeHtml(player.color)}">
        <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
        <small>#${escapeHtml(formatInteger(truckUnit.displayNumber))}</small>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function truckUnitMapPosition(player, truckUnit, contract = null) {
  if (contract?.position) {
    return contract.position;
  }
  const city = state.citiesById[truckUnit?.currentCityId || player?.hqCityId] || null;
  if (!city) {
    return null;
  }
  return {
    lat: Number(city.latitude),
    lng: Number(city.longitude),
  };
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
    const contractsByTruckId = Object.fromEntries((player.contracts || []).map((contract) => [contract.truckUnitId, contract]));
    (player.truckUnits || []).forEach((truckUnit) => {
      const contract = contractsByTruckId[truckUnit.id] || null;
      activeTruckIds.add(truckUnit.id);
      const position = truckUnitMapPosition(player, truckUnit, contract);
      if (!position) {
        return;
      }
      const title = player.isHuman && !contract
        ? `${player.label} ${cityLabel(truckUnit.currentCityId || player.hqCityId)} · clique para despachar`
        : `${player.label} ${contract?.flow?.product_name || cityLabel(truckUnit.currentCityId)}`;
      const nextStateKey = vehicleIconStateKey(player, truckUnit, contract);
      let marker = state.vehicleMarkersByTruckId[truckUnit.id] || null;
      if (!marker) {
        marker = window.L.marker([position.lat, position.lng], {
          icon: buildVehicleIcon(player, truckUnit, contract),
          title,
          keyboard: false,
          zIndexOffset: 1400,
        });
        marker.__stateKey = nextStateKey;
        state.layers.vehicles.addLayer(marker);
        state.vehicleMarkersByTruckId[truckUnit.id] = marker;
      }
      if (refreshIcons || marker.__stateKey !== nextStateKey) {
        marker.setIcon(buildVehicleIcon(player, truckUnit, contract));
        marker.__stateKey = nextStateKey;
      }
      marker.setLatLng([position.lat, position.lng]);
      marker.off("click");
      if (openingWizardEnabled() && player.isHuman && !contract) {
        marker.on("click", () => startHumanTruckDispatchSelection(truckUnit.id));
      }
      if (marker.getElement()) {
        marker.getElement().title = title;
      }
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

function playerIdleTruckUnits(player) {
  const busyIds = new Set((player?.contracts || []).map((contract) => contract.truckUnitId));
  return (player?.truckUnits || []).filter((truckUnit) => !busyIds.has(truckUnit.id));
}

function playerIdleTruckCount(player) {
  return playerIdleTruckUnits(player).length;
}

function renderStatus() {
  if (!refs.status) {
    return;
  }
  if (openingWizardEnabled() && !state.players.length) {
    refs.status.innerHTML = `
      <span class="game-runtime-status-pill">${escapeHtml(state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa ativo")}</span>
      <span class="game-runtime-status-pill">${escapeHtml(difficultyLabel(state.setup.selectedDifficulty))}</span>
      <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.setup.robotCount)} adversarios`)}</span>
      <span class="game-runtime-status-pill is-draft">${escapeHtml(`Abertura v${RUNTIME_CONFIG.version || "1.1"}`)}</span>
    `;
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

function routeCardStatusLabel(contract) {
  if (!contract) {
    return "Parado";
  }
  if (contract.stage === "loading") {
    return "Carregando";
  }
  if (contract.stage === "unloading") {
    return "Descarregando";
  }
  return "Em rota";
}

function routeCardStatusTone(contract) {
  if (!contract) {
    return "is-idle";
  }
  if (contract.stage === "loading" || contract.stage === "unloading") {
    return "is-handling";
  }
  return "is-moving";
}

function playerRouteCardMarkup(player, truckUnit, contract, { interactiveIdle = false } = {}) {
  const currentCityId = String(truckUnit?.currentCityId || player?.hqCityId || "").trim();
  const routeText = contract
    ? `${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`
    : cityLabel(currentCityId);
  const valueText = contract ? formatCurrency(contract.profitPerDeliveryBrl) : "-";
  const weightText = contract && !contract.dispatchOnly ? formatTonnes(contract.payloadTons) : "0 t";
  const etaText = contract ? `ETA ${formatHours(Math.max(0, contract.stageDurationHours - contract.stageElapsedHours))}` : "ETA -";
  const emoji = contract
    ? (contract.dispatchOnly ? "🚚" : (contract.flow.product_emoji || "📦"))
    : "🚚";
  const tagName = interactiveIdle && !contract ? "button" : "article";
  const openDispatchAttr = interactiveIdle && !contract
    ? ` type="button" data-runtime-open-idle-dispatch="${escapeHtml(truckUnit.id)}"`
    : "";
  return `
    <${tagName}
      class="game-runtime-contract-chip game-runtime-route-card${interactiveIdle && !contract ? " game-runtime-truck-row-action" : ""}${!contract ? " is-idle" : ""}"
      style="--player-color:${escapeHtml(player.color)}"
      ${openDispatchAttr}
    >
      <div class="game-runtime-route-card-top">
        <span class="game-runtime-route-card-id">${escapeHtml(`#${formatInteger(truckUnit.displayNumber)}`)}</span>
        <span class="game-runtime-route-card-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>
        <strong class="game-runtime-route-card-path">${escapeHtml(routeText || "Sem rota")}</strong>
        <span class="game-runtime-route-card-value">${escapeHtml(valueText)}</span>
      </div>
      <div class="game-runtime-route-card-meta">
        <span class="game-runtime-route-status-tag ${escapeHtml(routeCardStatusTone(contract))}">${escapeHtml(routeCardStatusLabel(contract))}</span>
        <span>${escapeHtml(weightText)}</span>
        <span>${escapeHtml(etaText)}</span>
      </div>
    </${tagName}>
  `;
}

function playerRouteCardsMarkup(player, { interactiveIdle = false } = {}) {
  const contractsByTruckId = Object.fromEntries((player?.contracts || []).map((contract) => [contract.truckUnitId, contract]));
  const truckUnits = (player?.truckUnits || []).slice().sort((left, right) => Number(left.displayNumber || 0) - Number(right.displayNumber || 0));
  if (!truckUnits.length) {
    return `<div class="truck-gallery-empty">Sem frota ativa.</div>`;
  }
  return truckUnits.map((truckUnit) => playerRouteCardMarkup(player, truckUnit, contractsByTruckId[truckUnit.id] || null, { interactiveIdle })).join("");
}

function humanHighlightsMarkup(player) {
  return playerRouteCardsMarkup(player, { interactiveIdle: true });
}

function renderHumanHud() {
  if (!refs.humanHud) {
    return;
  }
  const player = state.playersById.human || state.players[0] || null;
  if (!player) {
    refs.humanHud.innerHTML = openingWizardEnabled()
      ? `<div class="truck-gallery-empty">Abertura em andamento. Defina sede, frota e fretes para iniciar a operacao.</div>`
      : `<div class="truck-gallery-empty">Empresa principal indisponivel.</div>`;
    return;
  }
  const dispatchPicking = mainMapDispatchSelectionActive();
  const dispatchAssignment = dispatchPicking ? state.setup.activeHumanAssignment : null;
  const dispatchTruckUnit = dispatchPicking ? assignmentTruckUnit() : null;

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

    ${dispatchPicking ? `
      <div class="game-runtime-inline-alert is-dispatch-picking">
        <span class="material-symbols-outlined" aria-hidden="true">explore</span>
        <div>
          <strong>Escolhendo destino no mapa</strong>
          <span>${escapeHtml(`Clique em uma cidade no mapa principal para despachar ${truckUnitNumberLabel(dispatchTruckUnit)} saindo de ${cityLabel(dispatchAssignment?.originCityId)}.`)}</span>
        </div>
      </div>
    ` : ""}

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
      ${dispatchPicking ? `
        <button class="ghost-button game-runtime-mini-link" type="button" data-runtime-cancel-dispatch-pick="true">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          <span>Cancelar escolha</span>
        </button>
      ` : ""}
      ${runtimeTruckMarketEnabled() ? `
        <button class="ghost-button game-runtime-mini-link" type="button" data-runtime-open-market="${escapeHtml(player.id)}">
          <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
          <span>Novo caminhao</span>
        </button>
      ` : ""}
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
  refs.playerBar.innerHTML = state.players.filter((player) => !player.isHuman).map(playerCardMarkup).join("");
}

function contractProgressRatio(contract) {
  return clamp(contract.stageElapsedHours / Math.max(contract.stageDurationHours, 0.0001), 0, 1);
}

function truckRowMarkup(player, truckUnit) {
  const contract = player.contracts.find((item) => item.truckUnitId === truckUnit.id) || null;
  const fuel = truckFuelSnapshot(truckUnit, contract);
  const rangeKm = truckLoadedRangeKm(truckUnit, fuel.fuelLevelLiters);
  if (!contract) {
    return `
      <article class="game-runtime-truck-row is-idle">
        <div>
          <strong>${escapeHtml(`${truckUnit.truck.short_label || truckUnit.truck.label || truckUnit.truckId} #${formatInteger(truckUnit.displayNumber)}`)}</strong>
          <span>${escapeHtml(`Parado em ${cityLabel(truckUnit.currentCityId || player.hqCityId)} · diesel ${formatLiters(fuel.fuelLevelLiters)} / ${formatLiters(fuel.tankLiters)} · autonomia ${formatDistanceKm(rangeKm)}`)}</span>
        </div>
        <small>${escapeHtml(`Odo ${formatDistanceKm(fuel.odometerKm)}`)}</small>
      </article>
    `;
  }
  return `
    <article class="game-runtime-truck-row" style="--player-color:${escapeHtml(player.color)}">
      <div>
        <strong>${escapeHtml(`${truckUnit.truck.short_label || truckUnit.truck.label || truckUnit.truckId} #${formatInteger(truckUnit.displayNumber)}`)}</strong>
        <span>${escapeHtml(`${contractStatusLabel(contract)} · ${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)} · diesel ${formatLiters(fuel.fuelLevelLiters)} / ${formatLiters(fuel.tankLiters)}`)}</span>
      </div>
      <small>${escapeHtml(`${contract.dispatchOnly ? "Vazio" : formatTonnes(contract.payloadTons)} · Odo ${formatDistanceKm(fuel.odometerKm)}`)}</small>
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
        <span>${escapeHtml(`${contract.dispatchOnly ? "Custo" : "Lucro"} ${formatCurrency(contract.profitPerDeliveryBrl)}`)}</span>
      </div>
      <div class="game-runtime-progress">
        <span style="width:${escapeHtml(String(Math.round(contractProgressRatio(contract) * 100)))}%"></span>
      </div>
    </article>
  `;
}

function syncRobotDrawerLayout() {
  const rightColumn = refs.playerBar?.parentElement || null;
  if (!rightColumn) {
    return;
  }
  rightColumn.classList.toggle("is-drawer-open", Boolean(state.activeDrawerPlayerId));
}

function renderDrawer() {
  if (!refs.drawer) {
    return;
  }
  const player = state.playersById[state.activeDrawerPlayerId] || null;
  if (!player || player.isHuman) {
    refs.drawer.hidden = true;
    refs.drawer.innerHTML = "";
    syncRobotDrawerLayout();
    return;
  }

  refs.drawer.hidden = false;
  refs.drawer.innerHTML = `
    <div class="game-runtime-panel-head game-runtime-drawer-head">
      <div class="game-runtime-panel-title">
        <strong>${escapeHtml(player.label)}</strong>
        <span>${escapeHtml(`${cityLabel(player.hqCityId)} · ${player.isHuman ? "Operacao humana" : "Operacao robotica"}`)}</span>
      </div>
      <div class="game-runtime-drawer-actions">
        ${player.isHuman && runtimeTruckMarketEnabled() ? `
          <button class="ghost-button game-runtime-mini-action" type="button" data-runtime-open-market="${escapeHtml(player.id)}">
            <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
            <span>Novo caminhao</span>
          </button>
        ` : ""}
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

    <div class="game-runtime-metric-grid game-runtime-drawer-metric-grid">
      <article class="game-runtime-metric-card">
        <span>Caixa</span>
        <strong>${escapeHtml(formatCurrency(player.cashBrl))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Saldo</span>
        <strong class="${playerCashDelta(player) >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatCurrency(playerCashDelta(player)))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Entregas</span>
        <strong>${escapeHtml(formatInteger(player.deliveries))}</strong>
      </article>
      <article class="game-runtime-metric-card">
        <span>Toneladas</span>
        <strong>${escapeHtml(formatTonnes(player.tonnesMoved))}</strong>
      </article>
    </div>

    <div class="game-runtime-inline-stack">
      <div class="game-runtime-panel-title">
        <strong>Rotas</strong>
        <span>${escapeHtml(`${formatInteger(playerActiveContractCount(player))} ativos · ${formatInteger(playerIdleTruckCount(player))} parados`)}</span>
      </div>
      ${playerRouteCardsMarkup(player)}
    </div>
  `;
  syncRobotDrawerLayout();
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
  syncMainMapDispatchSelectionUi();
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
  state.activeDrawerPlayerId = closeDrawer || player.isHuman ? "" : player.id;
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

  const runtimeCloseButton = target.closest("[data-runtime-close-modal]");
  if (runtimeCloseButton) {
    closeSetupModal();
    return;
  }

  const runtimeCityButton = target.closest("[data-runtime-city-id]");
  if (runtimeCityButton) {
    selectSetupHeadquarters(runtimeCityButton.getAttribute("data-runtime-city-id") || "");
    return;
  }

  const runtimePurchaseHqButton = target.closest("[data-runtime-purchase-hq]");
  if (runtimePurchaseHqButton) {
    purchaseSetupHeadquarters();
    return;
  }

  const runtimePurchaseTrucksButton = target.closest("[data-runtime-purchase-trucks]");
  if (runtimePurchaseTrucksButton) {
    purchaseSetupSelectedTrucks();
    return;
  }

  const runtimeLogoButton = target.closest("[data-runtime-logo-id]");
  if (runtimeLogoButton) {
    state.setup.company.logoId = runtimeLogoButton.getAttribute("data-runtime-logo-id") || COMPANY_LOGO_OPTIONS[0].id;
    renderOpeningLogoGrid();
    renderOpeningCompanyPreview();
    return;
  }

  const runtimeTruckButton = target.closest("[data-runtime-truck-change]");
  if (runtimeTruckButton) {
    adjustSetupTruckQuantity(
      runtimeTruckButton.getAttribute("data-runtime-truck-id") || "",
      Number(runtimeTruckButton.getAttribute("data-runtime-truck-change") || 0),
    );
    return;
  }

  const runtimeFreightButton = target.closest("[data-runtime-toggle-freight]");
  if (runtimeFreightButton) {
    const flowId = runtimeFreightButton.getAttribute("data-runtime-toggle-freight") || "";
    if (state.setup.activeHumanAssignment) {
      finishHumanAssignmentSelection(flowId);
    } else {
      toggleSetupFreightSelection(flowId);
    }
    return;
  }

  const runtimeDispatchButton = target.closest("[data-runtime-dispatch-action]");
  if (runtimeDispatchButton) {
    const action = runtimeDispatchButton.getAttribute("data-runtime-dispatch-action") || "";
    if (action === "pick-map") {
      startMainMapDispatchSelection();
    } else {
      finishHumanDispatchSelection(action);
    }
    return;
  }

  const runtimeCancelDispatchPickButton = target.closest("[data-runtime-cancel-dispatch-pick]");
  if (runtimeCancelDispatchPickButton) {
    cancelMainMapDispatchSelection({ reopenModal: true });
    return;
  }

  const runtimeOpenIdleDispatchButton = target.closest("[data-runtime-open-idle-dispatch]");
  if (runtimeOpenIdleDispatchButton) {
    startHumanTruckDispatchSelection(runtimeOpenIdleDispatchButton.getAttribute("data-runtime-open-idle-dispatch") || "");
    return;
  }

  const runtimeOpenMarketButton = target.closest("[data-runtime-open-market]");
  if (runtimeOpenMarketButton) {
    startRuntimeTruckPurchaseFlow(runtimeOpenMarketButton.getAttribute("data-runtime-open-market") || "human");
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
  document.addEventListener("input", handleRuntimeInputs);
  document.addEventListener("change", handleRuntimeInputs);
  document.addEventListener("keydown", handleRuntimeKeydown);
  document.addEventListener("wheel", handleRailWheel, { passive: false });
  window.addEventListener("resize", () => {
    if (state.map) {
      state.map.invalidateSize();
    }
    if (state.setup.openingMap) {
      state.setup.openingMap.invalidateSize();
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
  if (openingWizardEnabled() && (state.setup.activeModal || mainMapDispatchSelectionActive())) {
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
      player.contracts.slice().forEach((contract) => advanceContract(player, contract, deltaHours));
      player.contracts = player.contracts.filter((contract) => !contract.isCompleted);
    });
  }

  renderDynamicUi();
  syncVehicleMarkers({ refreshIcons: true });
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
    fetchJson("/api/game/runtime/bootstrap"),
    waitForLeaflet(),
  ]);

  normalizeBootstrap(bootstrapPayload, runtimePayload);
  bindEvents();
  if (openingWizardEnabled()) {
    initializeOpeningWizard();
    renderStaticUi();
    renderMapUi({ refreshIcons: true });
    return;
  }
  buildPlayers();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  focusPlayerOnMap(state.playersById[state.focusedPlayerId] || state.players[0] || null);
  startSimulation();
}

initialize().catch((error) => {
  console.error("Brasix game runtime initialization failed:", error);
  throw error;
});