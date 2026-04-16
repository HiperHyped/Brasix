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
import { brasixRobotAiEngine } from "./game-runtime-robot-ai-engine-v1-3.js?v=20260416-game-runtime-13";
import { brasixRobotAiProfiles } from "./game-runtime-robot-ai-profiles-v1-3.js?v=20260416-game-runtime-13";

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
  { id: "inventory_2", icon: "inventory_2", label: "Pacotes" },
  { id: "factory", icon: "factory", label: "Fabrica" },
  { id: "directions_boat", icon: "directions_boat", label: "Navio" },
  { id: "hub", icon: "hub", label: "Hub" },
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
const LOG_HISTORY_LIMIT = 100;
const CONFIGURED_MIN_ROBOT_COUNT = Number(RUNTIME_CONFIG.minRobotCount);
const CONFIGURED_MAX_ROBOT_COUNT = Number(RUNTIME_CONFIG.maxRobotCount);
const MIN_ROBOT_COUNT = Number.isFinite(CONFIGURED_MIN_ROBOT_COUNT) ? Math.max(2, Math.round(CONFIGURED_MIN_ROBOT_COUNT)) : 2;
const MAX_ROBOT_COUNT = Number.isFinite(CONFIGURED_MAX_ROBOT_COUNT)
  ? Math.max(MIN_ROBOT_COUNT, Math.round(CONFIGURED_MAX_ROBOT_COUNT))
  : 20;
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
  "Delta Pampa",
  "Linha Aurora",
  "Orla Forte",
  "Rastro Central",
  "Carga Boreal",
  "Polo Norte Sul",
  "Malha Titan",
  "Rota Coral",
  "Eixo Real",
  "Trama Federal",
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
  "#e76f51",
  "#3a86ff",
  "#43aa8b",
  "#f4a261",
  "#5e60ce",
  "#219ebc",
  "#c1121f",
  "#588157",
  "#ff9f1c",
  "#6c757d",
];
const NETWORK_OPACITY_SCALE = 0.92;
const SIMULATION_TICK_MS = 250;
const ANALYTICS_HISTORY_MAX_POINTS = 0;
const ANALYTICS_SNAPSHOT_INTERVAL_HOURS = 6;
const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const ANALYTICS_TABS = [
  { id: "overview", label: "Geral" },
  { id: "player", label: "Jogador" },
  { id: "competition", label: "Empresas" },
  { id: "freights", label: "Fretes" },
  { id: "trucks", label: "Caminhoes" },
  { id: "products", label: "Produtos" },
  { id: "cities", label: "Cidades" },
];

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
  focusedPlayerId: RUNTIME_CONFIG.robotsOnly ? "" : "human",
  humanPrepared: false,
  logs: [],
  contractSequence: 1,
  setup: {
    openingWizard: Boolean(RUNTIME_CONFIG.openingWizard),
    activeModal: "",
    selectedDifficulty: "standard",
    robotCount: 10,
    robotAi: {
      enabled: Boolean(RUNTIME_CONFIG.robotAiSetup),
      editorMode: "basic",
      basicModeId: "balanced",
      selectedRobotSlot: -1,
      tableConfig: null,
      manualConfigs: {},
    },
    company: {
      name: "Brasix",
      color: "#000000",
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
    cityFreightBrowseCityId: "",
    dispatchSelectedCityId: "",
    mainMapDispatchSelection: false,
    dispatchMap: null,
    dispatchMarkerLayer: null,
    dispatchMarkersByCityId: {},
  },
  simulation: {
    currentTime: initialSimulationDate(),
    speedId: "x4",
    lastRunningSpeedId: "x4",
    timerId: null,
    lastRealTimestamp: 0,
  },
  analytics: {
    activeTabId: ANALYTICS_TABS[0].id,
    selectedPlayerId: "",
    history: [],
    lastSnapshotBucket: "",
    flowStatsById: {},
    truckStatsById: {},
  },
  truckPopup: {
    playerId: "",
    truckUnitId: "",
    screenX: 0,
    screenY: 0,
  },
};

const refs = {
  status: document.getElementById("game-runtime-status"),
  themeToggle: document.getElementById("game-runtime-theme-toggle"),
  robotAiButton: document.getElementById("game-runtime-robot-ai-button"),
  analyticsButton: document.getElementById("game-runtime-analytics-button"),
  speedControls: document.getElementById("game-runtime-speed-controls"),
  clock: document.getElementById("game-runtime-clock"),
  mapStage: document.getElementById("game-runtime-map-stage"),
  humanHud: document.getElementById("game-runtime-human-hud"),
  logPanel: document.getElementById("game-runtime-log-panel"),
  drawer: document.getElementById("game-runtime-drawer"),
  playerBar: document.getElementById("game-runtime-player-bar"),
  modalRoot: document.getElementById("game-runtime-modal-root"),
  truckPopup: document.getElementById("game-runtime-truck-popup"),
  openingDifficultySelect: document.getElementById("game-runtime-opening-difficulty-select"),
  openingRobotCountInput: document.getElementById("game-runtime-opening-robot-count"),
  openingRobotCountValue: document.getElementById("game-runtime-opening-robot-count-value"),
  openingRobotAiSummary: document.getElementById("game-runtime-opening-robot-ai-summary"),
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
  robotAiModeToggle: document.getElementById("game-runtime-robot-ai-mode-toggle"),
  robotAiBasicModes: document.getElementById("game-runtime-robot-ai-basic-modes"),
  robotAiSummary: document.getElementById("game-runtime-robot-ai-summary"),
  robotAiPresetButtons: document.getElementById("game-runtime-robot-ai-preset-buttons"),
  robotAiRobotTabs: document.getElementById("game-runtime-robot-ai-robot-tabs"),
  robotAiParameterGrid: document.getElementById("game-runtime-robot-ai-parameter-grid"),
  analyticsTabs: document.getElementById("game-runtime-analytics-tabs"),
  analyticsContent: document.getElementById("game-runtime-analytics-content"),
};

function initialSimulationDate() {
  const now = new Date();
  now.setHours(6, 0, 0, 0);
  return now;
}

function numberFormat(digits = 0) {
  return numberFormatter(digits);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function formatPercent(value, digits = 0) {
  return `${numberFormat(digits).format(roundNumber(Number(value || 0), digits))}%`;
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

function robotsOnlyEnabled() {
  return Boolean(RUNTIME_CONFIG.robotsOnly);
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

function robotAiSetupEnabled() {
  return Boolean(RUNTIME_CONFIG.robotAiSetup && state.setup?.robotAi?.enabled);
}

function clampIndex(value, length) {
  const maxIndex = Math.max(0, Number(length || 0) - 1);
  const numericValue = Number(value || 0);
  if (!(numericValue >= 0)) {
    return 0;
  }
  return Math.min(maxIndex, Math.floor(numericValue));
}

function normalizeRobotAiSelectedSlot(value, slotCount) {
  return Number(value) === -1 ? -1 : clampIndex(value, slotCount);
}

function normalizeByMax(value, maxValue) {
  const numericValue = Math.max(0, Number(value || 0));
  const numericMax = Math.max(0, Number(maxValue || 0));
  if (!(numericMax > 0)) {
    return 0;
  }
  return clamp(numericValue / numericMax, 0, 1);
}

function normalizeInverseByMax(value, maxValue) {
  const numericValue = Math.max(0, Number(value || 0));
  const numericMax = Math.max(0, Number(maxValue || 0));
  if (!(numericMax > 0)) {
    return 1;
  }
  return clamp(1 - (numericValue / numericMax), 0, 1);
}

function valuesMax(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))
    .reduce((maxValue, value) => Math.max(maxValue, value), 0);
}

function averageValue(values = []) {
  const filtered = (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value));
  return filtered.length
    ? filtered.reduce((total, value) => total + value, 0) / filtered.length
    : 0;
}

function robotAiSlotCount() {
  const liveRobots = state.players.filter((player) => !player.isHuman).length;
  if (liveRobots) {
    return liveRobots;
  }
  if (openingWizardEnabled()) {
    return clamp(Number(state.setup.robotCount || MIN_ROBOT_COUNT), MIN_ROBOT_COUNT, MAX_ROBOT_COUNT);
  }
  return 3;
}

function robotAiSlotName(slotIndex) {
  return ROBOT_NAMES[slotIndex] || `Adversario ${slotIndex + 1}`;
}

function robotAiSlotColor(slotIndex) {
  return ROBOT_COLORS[slotIndex] || ROBOT_COLORS[ROBOT_COLORS.length - 1] || "#356d63";
}

function buildRobotAiTableConfig(modeId = "balanced", difficultyId = setupCurrentDifficultyId()) {
  return brasixRobotAiProfiles.buildTableConfig({
    modeId,
    difficultyId,
  });
}

function syncRobotAiSetupState({ preserveManual = true } = {}) {
  if (!robotAiSetupEnabled()) {
    return null;
  }
  const previous = state.setup.robotAi || {};
  const tableConfig = buildRobotAiTableConfig(previous.basicModeId || "balanced", setupCurrentDifficultyId());
  const slotCount = robotAiSlotCount();
  state.setup.robotAi = {
    enabled: true,
    editorMode: previous.editorMode === "detailed" ? "detailed" : "basic",
    basicModeId: tableConfig.basicModeId,
    selectedRobotSlot: normalizeRobotAiSelectedSlot(previous.selectedRobotSlot, slotCount),
    tableConfig,
    manualConfigs: brasixRobotAiProfiles.normalizeManualRobotConfigs(
      preserveManual ? previous.manualConfigs : null,
      slotCount,
      {
        fallbackOrder: tableConfig.robotArchetypeOrder,
        difficultyId: setupCurrentDifficultyId(),
      },
    ),
  };
  return state.setup.robotAi;
}

function ensureRobotAiSetupState() {
  if (!robotAiSetupEnabled()) {
    return null;
  }
  if (!state.setup.robotAi?.tableConfig) {
    return syncRobotAiSetupState({ preserveManual: true });
  }
  return state.setup.robotAi;
}

function robotAiTableConfig() {
  return ensureRobotAiSetupState()?.tableConfig || null;
}

function robotAiSelectedScope() {
  return Number(state.setup.robotAi?.selectedRobotSlot) === -1 ? "all" : "slot";
}

function robotAiEffectiveSlotConfig(slotIndex) {
  const setupState = ensureRobotAiSetupState();
  const tableConfig = setupState?.tableConfig || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  const fallbackOrder = Array.isArray(tableConfig.robotArchetypeOrder) && tableConfig.robotArchetypeOrder.length
    ? tableConfig.robotArchetypeOrder
    : Object.keys(brasixRobotAiProfiles.archetypes || {});
  const fallbackArchetypeId = fallbackOrder[slotIndex % Math.max(1, fallbackOrder.length)]
    || Object.keys(brasixRobotAiProfiles.archetypes || {})[0]
    || "balanced_operator";
  if (setupState?.editorMode === "detailed") {
    const manualConfig = brasixRobotAiProfiles.normalizeManualRobotConfig(setupState.manualConfigs?.[slotIndex], {
      fallbackArchetypeId,
      difficultyId: setupCurrentDifficultyId(),
    });
    return {
      slotIndex,
      manual: true,
      archetypeId: manualConfig.archetypeId,
      overrides: cloneJson(manualConfig.overrides || {}),
      tableConfig,
      profile: brasixRobotAiProfiles.buildProfile({
        archetypeId: manualConfig.archetypeId,
        overrides: cloneJson(manualConfig.overrides || {}),
        forcedSkillPresetId: tableConfig.forcedSkillPresetId,
      }),
    };
  }
  return {
    slotIndex,
    manual: false,
    archetypeId: fallbackArchetypeId,
    overrides: null,
    tableConfig,
    profile: brasixRobotAiProfiles.buildProfile({
      archetypeId: fallbackArchetypeId,
      forcedSkillPresetId: tableConfig.forcedSkillPresetId,
    }),
  };
}

function robotAiSelectedSlotIndex() {
  return clampIndex(state.setup.robotAi?.selectedRobotSlot || 0, robotAiSlotCount());
}

function robotAiSelectedSlotIndexes() {
  if (robotAiSelectedScope() === "all") {
    return Array.from({ length: robotAiSlotCount() }, (_unused, slotIndex) => slotIndex);
  }
  return [robotAiSelectedSlotIndex()];
}

function robotAiSetSelectedSlot(slotIndex) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  state.setup.robotAi.selectedRobotSlot = Number(slotIndex) === -1 ? -1 : clampIndex(slotIndex, robotAiSlotCount());
}

function robotAiModeLabel() {
  return state.setup.robotAi?.editorMode === "detailed" ? "Detalhado" : "Basico";
}

function robotAiSkillPresetLabel(tableConfig = robotAiTableConfig()) {
  const skillPreset = brasixRobotAiProfiles.skillPresets?.[tableConfig?.forcedSkillPresetId || ""] || null;
  return skillPreset?.label || difficultyLabel(setupCurrentDifficultyId());
}

function robotAiSelectedTargetLabel() {
  if (robotAiSelectedScope() === "all") {
    return `Todos · ${formatInteger(robotAiSlotCount())} robos`;
  }
  const slotIndex = robotAiSelectedSlotIndex();
  const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
  return `${robotAiSlotName(slotIndex)} · ${slotConfig.profile?.label || slotConfig.archetypeId}`;
}

function robotAiGroupPresetLookup(groupId) {
  return {
    economy: brasixRobotAiProfiles.economyPresets,
    network: brasixRobotAiProfiles.networkPresets,
    operations: brasixRobotAiProfiles.operationsPresets,
    skill: brasixRobotAiProfiles.skillPresets,
  }[groupId] || {};
}

function robotAiGroupPresetEntries(groupId) {
  return Object.values(robotAiGroupPresetLookup(groupId) || {});
}

function robotAiGroupPresetMatchesProfile(groupId, presetId, profile) {
  const preset = robotAiGroupPresetLookup(groupId)?.[presetId] || null;
  if (!preset || !profile?.[groupId]) {
    return false;
  }
  return Object.entries(preset.values || {}).every(([parameterId, expectedValue]) => {
    return Math.abs(Number(profile[groupId]?.[parameterId] || 0) - Number(expectedValue || 0)) < 0.0001;
  });
}

function robotAiRepresentativeSlotIndex() {
  return robotAiSelectedScope() === "all" ? 0 : robotAiSelectedSlotIndex();
}

function robotAiRepresentativeProfile() {
  return robotAiEffectiveSlotConfig(robotAiRepresentativeSlotIndex()).profile || {};
}

function robotAiModeButtonsMarkup({ compact = false } = {}) {
  if (compact) {
    return [
      { id: "basic", label: "Basico", description: "Mesa pronta", action: 'data-runtime-robot-ai-editor-mode="basic"' },
      { id: "detailed", label: "Detalhado", description: "Abrir editor", action: 'data-runtime-robot-ai-open-detailed="true"' },
    ].map((mode) => `
      <button class="game-runtime-robot-ai-toggle-button${state.setup.robotAi?.editorMode === mode.id ? " is-active" : ""} is-compact" type="button" ${mode.action}>
        <strong>${escapeHtml(mode.label)}</strong>
        <span>${escapeHtml(mode.description)}</span>
      </button>
    `).join("");
  }
  return [
    { id: "basic", label: compact ? "Basico" : "Modo basico", description: compact ? "Mesa pronta" : "Mesa pronta" },
    { id: "detailed", label: compact ? "Detalhado" : "Modo detalhado", description: compact ? "Robo a robo" : "Robo a robo" },
  ].map((mode) => `
    <button class="game-runtime-robot-ai-toggle-button${state.setup.robotAi?.editorMode === mode.id ? " is-active" : ""}${compact ? " is-compact" : ""}" type="button" data-runtime-robot-ai-editor-mode="${escapeHtml(mode.id)}">
      <strong>${escapeHtml(mode.label)}</strong>
      <span>${escapeHtml(mode.description)}</span>
    </button>
  `).join("");
}

function robotAiBasicModeButtonsMarkup({ compact = false } = {}) {
  const tableConfig = robotAiTableConfig() || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  return Object.values(brasixRobotAiProfiles.basicModes || {}).map((mode) => `
    <button class="game-runtime-robot-ai-basic-mode-button${tableConfig.basicModeId === mode.id ? " is-active" : ""}${compact ? " is-compact" : ""}" type="button" data-runtime-robot-ai-basic-mode="${escapeHtml(mode.id)}" title="${escapeHtml(mode.description || mode.label || mode.id)}">
      <strong>${escapeHtml(mode.label || mode.id)}</strong>
      <span>${escapeHtml(mode.description || "")}</span>
    </button>
  `).join("");
}

function cityOutgoingFlows(cityId) {
  return state.outboundFreightsByCityId[String(cityId || "").trim()] || [];
}

function cityNetworkCoverageValue(cityId) {
  return cityOutgoingFlows(cityId).length;
}

function cityLongChainPotentialValue(cityId) {
  return cityOutgoingFlows(cityId)
    .map((flow) => flowScore(flow))
    .sort((left, right) => right - left)
    .slice(0, 3)
    .reduce((total, value) => total + value, 0);
}

function cityStableSupplyValue(cityId) {
  const flows = cityOutgoingFlows(cityId);
  const totalTonnes = flows.reduce((total, flow) => total + flowQuantityBaseTons(flow), 0);
  const productCount = new Set(flows.map((flow) => String(flow?.product_id || "").trim()).filter(Boolean)).size;
  return totalTonnes + (productCount * 180);
}

function cityScaleValue(cityId) {
  return Number(state.citiesById[String(cityId || "").trim()]?.population_thousands || 0);
}

function cityOpportunityValue(cityId) {
  const city = state.citiesById[String(cityId || "").trim()] || null;
  return city ? cityOpportunityScore(city) : 0;
}

function cityDistanceValue(originCityId, destinationCityId) {
  if (!originCityId || !destinationCityId || originCityId === destinationCityId) {
    return 0;
  }
  return Number(getTrack(originCityId, destinationCityId, "fastest")?.distanceKm || getTrack(destinationCityId, originCityId, "fastest")?.distanceKm || 0);
}

function flowSpecializationValue(flow) {
  return clamp((logisticsMultiplier(flow) - 0.95) / 0.45, 0, 1);
}

function flowMarginValue(flow, truck, player, preparedEntry = null, trackDistanceKm = Number(flow?.distance_km || 0)) {
  const payloadTons = flowPayloadTons(flow, truck, preparedEntry);
  const revenue = estimateDeliveryRevenue(flow, truck, player, preparedEntry, trackDistanceKm);
  const cycleCost = estimateCycleCost(flow, truck, payloadTons, trackDistanceKm);
  return roundNumber(revenue - cycleCost, 2);
}

function buildRobotAiSeedPlayer(slotIndex, playerId) {
  const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
  const playerSeed = {
    id: playerId,
    label: robotAiSlotName(slotIndex),
    color: robotAiSlotColor(slotIndex),
    isHuman: false,
    hqCityId: "",
    ai_slot_index: slotIndex,
    ai_manual_profile: slotConfig.manual,
    ai_archetype_id: slotConfig.archetypeId,
    ai_profile_overrides: cloneJson(slotConfig.overrides || null),
  };
  brasixRobotAiEngine.ensureProfile(playerSeed, slotConfig.tableConfig);
  return {
    slotConfig,
    playerSeed,
  };
}

function robotAiApplyToPlayer(player, slotIndex) {
  if (!robotAiSetupEnabled() || !player || player.isHuman) {
    return;
  }
  const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
  player.ai_slot_index = slotIndex;
  player.ai_manual_profile = slotConfig.manual;
  player.ai_archetype_id = slotConfig.archetypeId;
  player.ai_profile_overrides = cloneJson(slotConfig.overrides || null);
  brasixRobotAiEngine.ensureProfile(player, slotConfig.tableConfig);
}

function applyRobotAiStateToLivePlayers() {
  if (!robotAiSetupEnabled() || !state.players.length) {
    return;
  }
  syncRobotAiSetupState({ preserveManual: true });
  let robotIndex = 0;
  state.players.forEach((player) => {
    if (player.isHuman) {
      return;
    }
    robotAiApplyToPlayer(player, robotIndex);
    robotIndex += 1;
  });
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

function currentFreightBrowseCityId() {
  return String(state.setup.cityFreightBrowseCityId || "").trim();
}

function cityFreightBrowseMode() {
  return Boolean(currentFreightBrowseCityId() && state.players.length && !state.setup.activeHumanAssignment && !purchaseFlowActive());
}

function clearCityFreightBrowseState() {
  state.setup.cityFreightBrowseCityId = "";
}

function openCityFreightBrowser(cityId) {
  if (!refs.modalRoot || !state.players.length || purchaseFlowActive() || mainMapDispatchSelectionActive()) {
    return;
  }
  const normalizedCityId = String(cityId || "").trim();
  if (!normalizedCityId || !state.citiesById[normalizedCityId]) {
    return;
  }
  state.setup.cityFreightBrowseCityId = normalizedCityId;
  openSetupModal("freights");
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
  const nextSpeedId = speedOptionById(speedId).id;
  state.simulation.speedId = nextSpeedId;
  if (nextSpeedId !== "pause") {
    state.simulation.lastRunningSpeedId = nextSpeedId;
  }
  renderSpeedControls();
}

function togglePauseSpeed() {
  if (state.simulation.speedId === "pause") {
    setSpeed(state.simulation.lastRunningSpeedId || "x4");
    return;
  }
  setSpeed("pause");
}

function keyboardTargetAcceptsTyping(eventTarget) {
  if (!(eventTarget instanceof HTMLElement)) {
    return false;
  }
  if (eventTarget.isContentEditable) {
    return true;
  }
  const field = eventTarget.closest("input, textarea, select, [contenteditable='true']");
  if (!(field instanceof HTMLElement)) {
    return false;
  }
  if (field instanceof HTMLInputElement) {
    const type = String(field.type || "text").toLowerCase();
    return !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(type);
  }
  return true;
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

function buildCityFreightBrowseEntries(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId) {
    return [];
  }
  return setupPricedFreightsForCity(nextCityId)
    .filter((entry) => ["available", "active"].includes(entry.availability?.state || "available"))
    .sort((left, right) => {
      const leftRank = left.availability?.state === "available" ? 0 : 1;
      const rightRank = right.availability?.state === "available" ? 0 : 1;
      return leftRank - rightRank
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
  state.setup.cityFreightBrowseCityId = "";
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

function buildRobotOpeningHqCandidates(playerSeed, humanHqCityId, candidateCities) {
  const coverageValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityNetworkCoverageValue(city.id)]));
  const flowPotentialValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityOpportunityValue(city.id)]));
  const cityScaleValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityScaleValue(city.id)]));
  const longChainValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityLongChainPotentialValue(city.id)]));
  const stableSupplyValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityStableSupplyValue(city.id)]));
  const separationValues = Object.fromEntries(candidateCities.map((city) => [city.id, cityDistanceValue(city.id, humanHqCityId)]));
  const maxCoverage = valuesMax(Object.values(coverageValues));
  const maxFlowPotential = valuesMax(Object.values(flowPotentialValues));
  const maxCityScale = valuesMax(Object.values(cityScaleValues));
  const maxLongChain = valuesMax(Object.values(longChainValues));
  const maxStableSupply = valuesMax(Object.values(stableSupplyValues));
  const maxSeparation = valuesMax(Object.values(separationValues));
  return candidateCities.map((city) => ({
    city,
    runtimeSignals: {
      city_flow_potential_norm: normalizeByMax(flowPotentialValues[city.id], maxFlowPotential),
      city_scale_norm: normalizeByMax(cityScaleValues[city.id], maxCityScale),
      network_coverage_norm: normalizeByMax(coverageValues[city.id], maxCoverage),
      long_chain_potential_norm: normalizeByMax(longChainValues[city.id], maxLongChain),
      separation_from_human_norm: normalizeByMax(separationValues[city.id], maxSeparation),
      early_expansion_room_norm: normalizeByMax(stableSupplyValues[city.id], maxStableSupply),
      stable_supply_norm: normalizeByMax(stableSupplyValues[city.id], maxStableSupply),
    },
    player: playerSeed,
  }));
}

function buildRobotOpeningAssignmentPlan(playerSeed, hqCityId, blockedFlowIds = new Set(), availableCashBrl = openingCashForDifficulty(setupCurrentDifficultyId())) {
  const profile = playerSeed.ai_profile || brasixRobotAiEngine.ensureProfile(playerSeed, robotAiTableConfig());
  const candidateFlows = [...cityOutgoingFlows(hqCityId)]
    .filter((flow) => !blockedFlowIds.has(flow.id))
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
    .filter((flow) => getTrack(flow.origin_id, flow.destination_id, "fastest")?.points?.length)
    .map((flow) => {
      const truck = bestTruckForFlow(flow);
      if (!truck) {
        return null;
      }
      const trackDistanceKm = Number(getTrack(flow.origin_id, flow.destination_id, "fastest")?.distanceKm || flow.distance_km || 0);
      const payloadTons = flowPayloadTons(flow, truck, null);
      const revenueBrl = estimateDeliveryRevenue(flow, truck, playerSeed, null, trackDistanceKm);
      const marginBrl = flowMarginValue(flow, truck, playerSeed, null, trackDistanceKm);
      const payloadCapacityTons = Math.max(0.5, payloadTonsForTruck(truck));
      const destinationFollowupValue = cityLongChainPotentialValue(flow.destination_id);
      const routeStabilityValue = cityStableSupplyValue(flow.destination_id) + (destinationFollowupValue * 0.6);
      return {
        flow,
        truck,
        trackDistanceKm,
        payloadTons,
        revenueBrl,
        marginBrl,
        payloadFitValue: clamp(payloadTons / payloadCapacityTons, 0, 1),
        specializationValue: flowSpecializationValue(flow),
        destinationFollowupValue,
        routeStabilityValue,
      };
    })
    .filter(Boolean);

  if (!candidateFlows.length) {
    const fallbackPlan = autoAssignContractsForTruckUnits(playerSeed.id, hqCityId, [], 2, blockedFlowIds);
    return {
      truckUnits: fallbackPlan.truckUnits,
      contractSpecs: fallbackPlan.contractSpecs,
      selectedFlowIds: new Set(fallbackPlan.contractSpecs.map((spec) => spec.flow.id)),
    };
  }

  const maxRevenue = valuesMax(candidateFlows.map((entry) => entry.revenueBrl));
  const maxMargin = valuesMax(candidateFlows.map((entry) => Math.max(0, entry.marginBrl)));
  const maxDistance = valuesMax(candidateFlows.map((entry) => entry.trackDistanceKm));
  const maxFollowup = valuesMax(candidateFlows.map((entry) => entry.destinationFollowupValue));
  const maxRouteStability = valuesMax(candidateFlows.map((entry) => entry.routeStabilityValue));
  const rankedCandidates = brasixRobotAiEngine.rankCandidates("opening", "flow_selection", {
    player: playerSeed,
    tableConfig: robotAiTableConfig(),
    candidates: candidateFlows.map((entry) => ({
      ...entry,
      runtimeSignals: {
        revenue_norm: normalizeByMax(entry.revenueBrl, maxRevenue),
        margin_norm: normalizeByMax(Math.max(0, entry.marginBrl), maxMargin),
        distance_efficiency_norm: normalizeInverseByMax(entry.trackDistanceKm, maxDistance),
        payload_fit_norm: entry.payloadFitValue,
        specialization_fit_norm: entry.specializationValue,
        hq_origin_bonus_norm: entry.flow.origin_id === hqCityId ? 1 : 0,
        destination_followup_norm: normalizeByMax(entry.destinationFollowupValue, maxFollowup),
        route_stability_norm: normalizeByMax(entry.routeStabilityValue, maxRouteStability),
      },
    })),
  });

  const targetTruckCount = Math.max(1, Math.min(3, 1 + Math.round(Number(profile?.economy?.fleet_growth_bias || 0) * 2)));
  const reserveShare = clamp(Number(profile?.economy?.cash_reserve_ratio || 0.3) * 0.55, 0.08, 0.7);
  const riskTolerance = clamp(Number(profile?.economy?.risk_tolerance || 0.5), 0, 1);
  let remainingCash = Number(availableCashBrl || 0) - Number(openingContextForCity(state.citiesById[hqCityId])?.openingPrice || 0);
  const minimumCashAfterPurchase = Math.max(0, Number(availableCashBrl || 0) * reserveShare * (1 - (riskTolerance * 0.35)));
  const truckUnits = [];
  const contractSpecs = [];
  const usedFlowIds = new Set();

  rankedCandidates.forEach((entry) => {
    if (contractSpecs.length >= targetTruckCount || usedFlowIds.has(entry.flow.id)) {
      return;
    }
    const truckPrice = Number(entry.truck.purchase_price_brl || 0);
    if (remainingCash - truckPrice < minimumCashAfterPurchase && contractSpecs.length) {
      return;
    }
    const truckUnit = buildTruckUnit(playerSeed.id, entry.truck, truckUnits.length + 1, hqCityId);
    if (!truckCanExecuteFlow(truckUnit, entry.flow)) {
      return;
    }
    truckUnits.push(truckUnit);
    contractSpecs.push({ flow: entry.flow, truckUnit, preparedEntry: null });
    usedFlowIds.add(entry.flow.id);
    remainingCash -= truckPrice;
  });

  if (!contractSpecs.length) {
    const fallbackPlan = autoAssignContractsForTruckUnits(playerSeed.id, hqCityId, [], 2, blockedFlowIds);
    return {
      truckUnits: fallbackPlan.truckUnits,
      contractSpecs: fallbackPlan.contractSpecs,
      selectedFlowIds: new Set(fallbackPlan.contractSpecs.map((spec) => spec.flow.id)),
    };
  }

  return {
    truckUnits,
    contractSpecs,
    selectedFlowIds: usedFlowIds,
  };
}

function buildRobotPlayerConfigs(humanHqCityId, blockedFlowIds = new Set()) {
  if (!robotAiSetupEnabled()) {
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

  syncRobotAiSetupState({ preserveManual: true });
  const robotCount = openingWizardEnabled()
    ? clamp(state.setup.robotCount, MIN_ROBOT_COUNT, MAX_ROBOT_COUNT)
    : 3;
  const baseDifficulty = openingWizardEnabled() ? state.setup.selectedDifficulty : "standard";
  const robotBaseCash = openingCashForDifficulty(baseDifficulty);
  const candidateCities = [...state.cities]
    .filter((city) => city.id !== humanHqCityId)
    .sort((left, right) => cityOpportunityScore(right) - cityOpportunityScore(left));
  const usedFlowIds = new Set(blockedFlowIds);
  const usedHqCityIds = new Set([humanHqCityId].filter(Boolean));

  return Array.from({ length: robotCount }, (_unused, index) => {
    const playerId = `robot-${index + 1}`;
    const { slotConfig, playerSeed } = buildRobotAiSeedPlayer(index, playerId);
    const hqPool = candidateCities.filter((city) => !usedHqCityIds.has(city.id));
    const rankedHqCandidates = brasixRobotAiEngine.rankCandidates("opening", "hq_selection", {
      player: playerSeed,
      tableConfig: slotConfig.tableConfig,
      candidates: buildRobotOpeningHqCandidates(playerSeed, humanHqCityId, hqPool.length ? hqPool : candidateCities),
    });
    const city = rankedHqCandidates[0]?.city || hqPool[0] || candidateCities[0] || state.cities[0] || null;
    const hqCityId = city?.id || humanHqCityId;
    playerSeed.hqCityId = hqCityId;
    const robotOpeningBudgetBrl = robotBaseCash * (0.92 + (index * 0.025));
    const assignmentPlan = buildRobotOpeningAssignmentPlan(playerSeed, hqCityId, usedFlowIds, robotOpeningBudgetBrl);
    assignmentPlan.selectedFlowIds.forEach((flowId) => usedFlowIds.add(flowId));
    if (hqCityId) {
      usedHqCityIds.add(hqCityId);
    }
    const headquartersCost = Number(openingContextForCity(city)?.openingPrice || 0);
    const fleetInvestment = assignmentPlan.truckUnits.reduce((total, truckUnit) => total + Number(truckUnit.truck?.purchase_price_brl || 0), 0);
    const currentCash = roundNumber(robotOpeningBudgetBrl - headquartersCost - fleetInvestment, 0);
    return {
      id: playerId,
      label: playerSeed.label,
      color: playerSeed.color,
      isHuman: false,
      hqCityId,
      truckUnits: assignmentPlan.truckUnits,
      contractSpecs: assignmentPlan.contractSpecs,
      cashBrl: currentCash,
      startingCashBrl: currentCash,
      prepared: true,
      note: playerSeed.ai_profile?.label || "Operacao automatica",
      ai_slot_index: index,
      ai_manual_profile: slotConfig.manual,
      ai_archetype_id: slotConfig.archetypeId,
      ai_profile_overrides: cloneJson(slotConfig.overrides || null),
      ai_profile_label: playerSeed.ai_profile?.label || slotConfig.archetypeId,
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
  state.logs = state.logs.slice(0, LOG_HISTORY_LIMIT);
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
  const flowStat = analyticsEnsureFlowStat(flow);
  if (flowStat) {
    flowStat.activeCount += 1;
    flowStat.lastPlayerId = player.id;
  }
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

function buildRobotNextFlowCandidates(player, truckUnit, originCityId) {
  const flows = (state.outboundFreightsByCityId[originCityId] || [])
    .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
    .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
    .filter((flow) => truckCanExecuteFlow(truckUnit, flow, {
      currentCityId: originCityId,
      startingFuelLiters: truckUnit.fuelLevelLiters,
    }));
  if (!flows.length) {
    return [];
  }
  const candidates = flows.map((flow) => {
    const trackDistanceKm = Number(getTrack(flow.origin_id, flow.destination_id, "fastest")?.distanceKm || flow.distance_km || 0);
    const payloadTons = flowPayloadTons(flow, truckUnit.truck, null);
    const revenueBrl = estimateDeliveryRevenue(flow, truckUnit.truck, player, null, trackDistanceKm);
    const marginBrl = flowMarginValue(flow, truckUnit.truck, player, null, trackDistanceKm);
    const followupValue = cityLongChainPotentialValue(flow.destination_id);
    const routeStabilityValue = cityStableSupplyValue(flow.destination_id) + (followupValue * 0.6);
    return {
      flow,
      trackDistanceKm,
      payloadFitValue: clamp(payloadTons / Math.max(0.5, payloadTonsForTruck(truckUnit.truck)), 0, 1),
      revenueBrl,
      marginBrl,
      specializationValue: flowSpecializationValue(flow),
      followupValue,
      routeStabilityValue,
    };
  });
  const maxRevenue = valuesMax(candidates.map((entry) => entry.revenueBrl));
  const maxMargin = valuesMax(candidates.map((entry) => Math.max(0, entry.marginBrl)));
  const maxDistance = valuesMax(candidates.map((entry) => entry.trackDistanceKm));
  const maxFollowup = valuesMax(candidates.map((entry) => entry.followupValue));
  const maxRouteStability = valuesMax(candidates.map((entry) => entry.routeStabilityValue));
  return brasixRobotAiEngine.rankCandidates("operations", "next_flow_selection", {
    player,
    tableConfig: robotAiTableConfig(),
    candidates: candidates.map((entry) => ({
      ...entry,
      runtimeSignals: {
        revenue_norm: normalizeByMax(entry.revenueBrl, maxRevenue),
        margin_norm: normalizeByMax(Math.max(0, entry.marginBrl), maxMargin),
        distance_efficiency_norm: normalizeInverseByMax(entry.trackDistanceKm, maxDistance),
        payload_fit_norm: entry.payloadFitValue,
        specialization_fit_norm: entry.specializationValue,
        hq_origin_bonus_norm: entry.flow.origin_id === player.hqCityId ? 1 : 0,
        destination_followup_norm: normalizeByMax(entry.followupValue, maxFollowup),
        route_stability_norm: normalizeByMax(entry.routeStabilityValue, maxRouteStability),
      },
    })),
  });
}

function bestNextFlowForTruck(player, truckUnit, originCityId) {
  if (robotAiSetupEnabled() && player && !player.isHuman) {
    const rankedCandidates = buildRobotNextFlowCandidates(player, truckUnit, originCityId);
    return rankedCandidates[0]?.flow || null;
  }
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

function buildRobotRecoveryCandidates(player, truckUnit, originCityId) {
  const currentCityId = String(originCityId || truckUnit?.currentCityId || player?.hqCityId || "").trim();
  const candidates = state.freightFlows
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
      const destinationCityId = flow.origin_id;
      return {
        destinationCityId,
        dispatchMode: "reposition",
        targetFlow: flow,
        repositionDistanceKm,
        destinationOpportunityValue: cityOpportunityValue(destinationCityId),
        targetFlowValue: revenueBrl,
        destinationFollowupValue: cityLongChainPotentialValue(destinationCityId),
        routeStabilityValue: cityStableSupplyValue(destinationCityId),
        destinationHqValue: destinationCityId === player.hqCityId ? 1 : 0,
        frontierBonusValue: destinationCityId !== player.hqCityId && destinationCityId !== currentCityId ? 1 : 0,
        returnHomeValue: 0,
      };
    })
    .filter(Boolean);

  const hqCityId = String(player?.hqCityId || "").trim();
  if (hqCityId && hqCityId !== currentCityId) {
    const returnPlan = buildTravelFuelPlan({
      track: getTrack(currentCityId, hqCityId, "fastest"),
      truck: truckUnit.truck,
      loaded: false,
      startingFuelLiters: truckUnit.fuelLevelLiters,
    });
    if (returnPlan.feasible) {
      candidates.push({
        destinationCityId: hqCityId,
        dispatchMode: "return_hq",
        targetFlow: null,
        repositionDistanceKm: Number(returnPlan.distanceKm || 0),
        destinationOpportunityValue: cityOpportunityValue(hqCityId),
        targetFlowValue: 0,
        destinationFollowupValue: cityLongChainPotentialValue(hqCityId),
        routeStabilityValue: cityStableSupplyValue(hqCityId),
        destinationHqValue: 1,
        frontierBonusValue: 0,
        returnHomeValue: 1,
      });
    }
  }

  if (!candidates.length) {
    return [];
  }
  const maxDistance = valuesMax(candidates.map((entry) => entry.repositionDistanceKm));
  const maxDestinationOpportunity = valuesMax(candidates.map((entry) => entry.destinationOpportunityValue));
  const maxTargetFlowValue = valuesMax(candidates.map((entry) => entry.targetFlowValue));
  const maxFollowup = valuesMax(candidates.map((entry) => entry.destinationFollowupValue));
  const maxRouteStability = valuesMax(candidates.map((entry) => entry.routeStabilityValue));
  return brasixRobotAiEngine.rankCandidates("operations", "recovery_dispatch", {
    player,
    tableConfig: robotAiTableConfig(),
    candidates: candidates.map((entry) => ({
      ...entry,
      runtimeSignals: {
        destination_opportunity_norm: normalizeByMax(entry.destinationOpportunityValue, maxDestinationOpportunity),
        distance_efficiency_norm: normalizeInverseByMax(entry.repositionDistanceKm, maxDistance),
        return_home_norm: entry.returnHomeValue,
        target_flow_value_norm: normalizeByMax(entry.targetFlowValue, maxTargetFlowValue),
        destination_followup_norm: normalizeByMax(entry.destinationFollowupValue, maxFollowup),
        route_stability_norm: normalizeByMax(entry.routeStabilityValue, maxRouteStability),
        frontier_bonus_norm: entry.frontierBonusValue,
        destination_hq_norm: entry.destinationHqValue,
      },
    })),
  });
}

function bestRobotRecoveryDispatch(player, truckUnit, originCityId) {
  if (robotAiSetupEnabled() && player && !player.isHuman) {
    const rankedCandidates = buildRobotRecoveryCandidates(player, truckUnit, originCityId);
    return rankedCandidates[0]
      ? {
        destinationCityId: rankedCandidates[0].destinationCityId,
        dispatchMode: rankedCandidates[0].dispatchMode,
        targetFlow: rankedCandidates[0].targetFlow,
        repositionDistanceKm: rankedCandidates[0].repositionDistanceKm,
      }
      : null;
  }
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

function bestHumanNearestContractDispatch() {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  const truckUnit = assignmentTruckUnit();
  if (!assignment || !player || !truckUnit) {
    return null;
  }
  const target = bestRobotRecoveryDispatch(player, truckUnit, assignment.originCityId);
  if (!target || target.dispatchMode !== "reposition" || !target.targetFlow) {
    return null;
  }
  return target;
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
    clearCityFreightBrowseState();
    const cityFlows = state.outboundFreightsByCityId[nextAssignment.originCityId] || [];
    const availableEntries = cityFlows
      .filter((flow) => truckSupportsFlow(truckUnit.truck, flow))
      .filter((flow) => !exclusiveFreightsEnabled() || freightFlowAvailability(flow.id).available)
      .filter((flow) => truckCanExecuteFlow(truckUnit, flow, {
        currentCityId: nextAssignment.originCityId,
        startingFuelLiters: truckUnit.fuelLevelLiters,
      }));
    if (!cityFlows.length && !advancedDispatchEnabled()) {
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
  clearCityFreightBrowseState();
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
  const truckStat = analyticsEnsureTruckStat(player, contract.truckUnit);
  if (truckStat) {
    truckStat.fuelCostBrl = roundNumber(Number(truckStat.fuelCostBrl || 0) + Number(contract.realizedFuelCostBrl || 0), 2);
    truckStat.estimatedDistanceKm = roundNumber(Number(truckStat.estimatedDistanceKm || 0)
      + Number(contract.repositionTrack?.distanceKm || 0)
      + Number(contract.deliveryTrack?.distanceKm || 0)
      + Number(contract.returnTrack?.distanceKm || 0), 2);
  }
  if (!contract.dispatchOnly) {
    const flowStat = analyticsEnsureFlowStat(contract.flow);
    if (flowStat) {
      flowStat.totalDeliveries += 1;
      flowStat.totalTonnes = roundNumber(Number(flowStat.totalTonnes || 0) + Number(contract.payloadTons || 0), 2);
      flowStat.totalRevenueBrl = roundNumber(Number(flowStat.totalRevenueBrl || 0) + Number(contract.revenuePerDeliveryBrl || 0), 2);
      flowStat.totalProfitBrl = roundNumber(Number(flowStat.totalProfitBrl || 0) + Number(contract.profitPerDeliveryBrl || 0), 2);
      flowStat.activeCount = Math.max(0, Number(flowStat.activeCount || 0) - 1);
      flowStat.lastPlayerId = player?.id || "";
    }
    if (truckStat) {
      truckStat.deliveries += 1;
      truckStat.tonnes = roundNumber(Number(truckStat.tonnes || 0) + Number(contract.payloadTons || 0), 2);
      truckStat.revenueBrl = roundNumber(Number(truckStat.revenueBrl || 0) + Number(contract.revenuePerDeliveryBrl || 0), 2);
      truckStat.profitBrl = roundNumber(Number(truckStat.profitBrl || 0) + Number(contract.profitPerDeliveryBrl || 0), 2);
    }
  }
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
    ai_slot_index: Number.isInteger(config.ai_slot_index) ? config.ai_slot_index : null,
    ai_manual_profile: Boolean(config.ai_manual_profile),
    ai_archetype_id: config.ai_archetype_id || "",
    ai_profile_overrides: cloneJson(config.ai_profile_overrides || null),
    ai_profile_label: config.ai_profile_label || "",
  };
  player.contracts = config.contractSpecs.map((spec) => createContractState(player, {
    ...spec,
    truckUnit: truckUnitsById[spec.truckUnit.id] || spec.truckUnit,
  }));
  if (!player.isHuman && robotAiSetupEnabled()) {
    robotAiApplyToPlayer(player, Number.isInteger(player.ai_slot_index) ? player.ai_slot_index : 0);
  }
  return player;
}

function buildPlayers() {
  if (robotAiSetupEnabled()) {
    syncRobotAiSetupState({ preserveManual: true });
  }
  const humanConfig = robotsOnlyEnabled() ? null : buildHumanPlayerConfig();
  const reservedFlowIds = new Set((humanConfig?.contractSpecs || []).map((spec) => spec.flow.id));
  const robotConfigs = buildRobotPlayerConfigs(humanConfig?.hqCityId || "", reservedFlowIds);
  const players = (robotsOnlyEnabled() ? robotConfigs : [humanConfig, ...robotConfigs]).map(createPlayer);
  const primaryPlayer = (!robotsOnlyEnabled() && players.length ? players[0] : null) || players[0] || null;
  state.players = players;
  state.playersById = Object.fromEntries(players.map((player) => [player.id, player]));
  state.humanPrepared = robotsOnlyEnabled() ? true : Boolean(players[0]?.prepared);
  state.activeDrawerPlayerId = "";
  state.focusedPlayerId = primaryPlayer?.id || "";
  state.analytics.selectedPlayerId = primaryPlayer?.id || "";
  state.analytics.flowStatsById = {};
  state.analytics.truckStatsById = {};
  state.analytics.history = [];
  state.analytics.lastSnapshotBucket = "";
  applyRobotAiStateToLivePlayers();
  analyticsHydrateCurrentState();

  appendLog("system", "neutral", `${state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa"} carregado.`);
  appendLog(primaryPlayer?.id || "system", state.humanPrepared ? "positive" : "neutral", openingWizardEnabled()
    ? (robotsOnlyEnabled()
      ? `Abertura ${RUNTIME_CONFIG.version || "1.1"} confirmada com ${formatInteger(robotConfigs.length)} robos automatizados.`
      : `Abertura ${RUNTIME_CONFIG.version || "1.1"} confirmada com ${formatInteger(robotConfigs.length)} adversarios.`)
    : (robotsOnlyEnabled()
      ? "Operacao automatica iniciada."
      : (state.humanPrepared
        ? "Preparacao carregada na partida."
        : "Preparacao nao foi encontrada; a operacao abriu com selecao automatica.")));
  analyticsRecordSnapshot(true);
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
  clearCityFreightBrowseState();
  state.setup.dispatchSelectedCityId = "";
}

function startRuntimeTruckPurchaseFlow(playerId = "human") {
  const player = state.playersById[playerId] || null;
  if (!player || !player.isHuman) {
    return;
  }
  clearCityFreightBrowseState();
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

function robotAiArchetypeDistribution() {
  const distribution = {};
  for (let slotIndex = 0; slotIndex < robotAiSlotCount(); slotIndex += 1) {
    const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
    const label = slotConfig.profile?.label || slotConfig.archetypeId || `Robo ${slotIndex + 1}`;
    if (!distribution[label]) {
      distribution[label] = {
        id: slotConfig.archetypeId,
        label,
        count: 0,
      };
    }
    distribution[label].count += 1;
  }
  return Object.values(distribution)
    .sort((left, right) => right.count - left.count || String(left.label).localeCompare(String(right.label), "pt-BR"));
}

function robotAiParameterValueLabel(parameterId, value) {
  if (parameterId === "planning_horizon_turns") {
    return `${formatHours(Math.max(1, Math.round(Number(value || 0) * 24)))}`;
  }
  return formatPercent(Number(value || 0) * 100, 0);
}

const ROBOT_AI_EDITOR_GROUP_ORDER = ["operations", "network", "economy", "skill"];

const ROBOT_AI_EDITOR_GROUP_META = {
  operations: {
    label: "Negociacao",
    description: "Controla o apetite do robo para iniciar, aceitar prioridade e travar negociacoes por ativos importantes.",
  },
  network: {
    label: "Visao",
    description: "Define para onde a IA direciona capital e atencao estrategica entre portos, permissoes, pedagios, monopolios, origem e horizonte.",
  },
  economy: {
    label: "Personalidade",
    description: "Controla como a IA lida com caixa, risco, impulso, paciencia tatica e apego ao proprio patrimonio.",
  },
  skill: {
    label: "Habilidades",
    description: "Controla a quantidade de leituras, a disciplina de execucao, a visao combinatoria, o tempo de acao e o ruido comportamental da IA.",
  },
};

function sliderNumericLabel(value, step) {
  const precision = String(step ?? "").includes(".") ? String(step).split(".")[1].length : 1;
  return Number(value || 0).toFixed(Math.min(2, Math.max(1, precision)));
}

function robotAiHelpBadgeMarkup(description) {
  if (!description) {
    return "";
  }
  return `<span class="game-runtime-robot-ai-help-badge" title="${escapeHtml(description)}">?</span>`;
}

function robotAiSummaryMarkup({ compact = false } = {}) {
  if (!robotAiSetupEnabled()) {
    return `<div class="truck-gallery-empty">Configurador de robos indisponivel.</div>`;
  }
  const setupState = ensureRobotAiSetupState();
  const tableConfig = setupState?.tableConfig || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  const distribution = robotAiArchetypeDistribution();
  const visibleDistribution = compact ? distribution.slice(0, 3) : distribution;
  if (compact) {
    return `
      <section class="game-runtime-robot-ai-summary-card is-compact is-opening">
        <div class="game-runtime-robot-ai-summary-head">
          <div>
            <strong>${escapeHtml("Configure a mesa de robos")}</strong>
            <span>${escapeHtml(`${robotAiSkillPresetLabel(tableConfig)} · ${formatInteger(robotAiSlotCount())} robos`)}</span>
          </div>
        </div>

        <div class="game-runtime-robot-ai-opening-block">
          <span class="game-runtime-robot-ai-section-label">Modo de configuracao</span>
          <div class="game-runtime-robot-ai-mode-toggle is-opening">${robotAiModeButtonsMarkup({ compact: true })}</div>
        </div>

        <div class="game-runtime-robot-ai-opening-block">
          <span class="game-runtime-robot-ai-section-label">Perfis da mesa</span>
          <div class="game-runtime-robot-ai-basic-modes is-opening">${robotAiBasicModeButtonsMarkup({ compact: true })}</div>
        </div>

        <div class="game-runtime-robot-ai-metric-row is-compact">
          <article><span>Mesa</span><strong>${escapeHtml(tableConfig.label || "Balanceada")}</strong></article>
          <article><span>Dificuldade AI</span><strong>${escapeHtml(robotAiSkillPresetLabel(tableConfig))}</strong></article>
          <article><span>Alvo atual</span><strong>${escapeHtml(robotAiSelectedTargetLabel())}</strong></article>
        </div>

        <div class="game-runtime-robot-ai-chip-row">
          ${visibleDistribution.map((entry) => `
            <span class="game-runtime-robot-ai-chip">
              <strong>${escapeHtml(`${entry.count}x`)}</strong>
              <span>${escapeHtml(entry.label)}</span>
            </span>
          `).join("")}
        </div>
      </section>
    `;
  }
  return `
    <section class="game-runtime-robot-ai-summary-card">
      <div class="game-runtime-robot-ai-summary-head">
        <div>
          <strong>${escapeHtml("Leitura atual")}</strong>
          <span>${escapeHtml(tableConfig.description || "Perfil base da mesa")}</span>
        </div>
        <span class="game-setup-pill ${escapeHtml(state.setup.robotAi?.editorMode === "detailed" ? "is-recommended" : "is-available")}">${escapeHtml(robotAiModeLabel())}</span>
      </div>

      <div class="game-runtime-robot-ai-metric-row">
        <article><span>Mesa</span><strong>${escapeHtml(tableConfig.label || "Balanceada")}</strong></article>
        <article><span>Dificuldade AI</span><strong>${escapeHtml(robotAiSkillPresetLabel(tableConfig))}</strong></article>
        <article><span>Alvo atual</span><strong>${escapeHtml(robotAiSelectedTargetLabel())}</strong></article>
        <article><span>Robos</span><strong>${escapeHtml(formatInteger(robotAiSlotCount()))}</strong></article>
      </div>

      <div class="game-runtime-robot-ai-chip-row">
        ${visibleDistribution.map((entry) => `
          <span class="game-runtime-robot-ai-chip">
            <strong>${escapeHtml(`${entry.count}x`)}</strong>
            <span>${escapeHtml(entry.label)}</span>
          </span>
        `).join("") || `<span class="game-runtime-robot-ai-chip"><span>Sem robos configurados</span></span>`}
      </div>
    </section>
  `;
}

function renderOpeningRobotAiSummary() {
  if (!refs.openingRobotAiSummary) {
    return;
  }
  refs.openingRobotAiSummary.innerHTML = robotAiSetupEnabled()
    ? robotAiSummaryMarkup({ compact: true })
    : `<div class="truck-gallery-empty">Sem configurador nesta versao.</div>`;
}

function renderRobotAiModeToggle() {
  if (!refs.robotAiModeToggle) {
    return;
  }
  const currentMode = state.setup.robotAi?.editorMode === "detailed" ? "detailed" : "basic";
  const nextMode = currentMode === "detailed" ? "basic" : "detailed";
  refs.robotAiModeToggle.innerHTML = `
    <button class="game-runtime-robot-ai-top-button" type="button" data-runtime-robot-ai-editor-mode="${escapeHtml(nextMode)}" title="${escapeHtml(nextMode === "basic" ? "Trocar para modo basico" : "Trocar para modo detalhado")}">
      ${escapeHtml(currentMode === "basic" ? "Modo basico" : "Modo detalhado")}
    </button>
  `;
}

function renderRobotAiBasicModes() {
  if (!refs.robotAiBasicModes) {
    return;
  }
  const tableConfig = robotAiTableConfig() || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  refs.robotAiBasicModes.innerHTML = Object.values(brasixRobotAiProfiles.basicModes || {}).map((mode) => `
    <button class="game-runtime-robot-ai-basic-mode-chip${tableConfig.basicModeId === mode.id ? " is-active" : ""}" type="button" data-runtime-robot-ai-basic-mode="${escapeHtml(mode.id)}" title="${escapeHtml(mode.description || mode.label || mode.id)}">
      ${escapeHtml(mode.label || mode.id)}
    </button>
  `).join("");
}

function renderRobotAiSummaryPanel() {
  if (!refs.robotAiSummary) {
    return;
  }
  refs.robotAiSummary.innerHTML = robotAiSummaryMarkup({ compact: false });
}

function renderRobotAiPresetButtons() {
  if (!refs.robotAiPresetButtons) {
    return;
  }
  const selectedSlot = robotAiRepresentativeSlotIndex();
  const selectedConfig = robotAiEffectiveSlotConfig(selectedSlot);
  const tableConfig = robotAiTableConfig() || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  const fallbackArchetypeId = tableConfig.robotArchetypeOrder?.[selectedSlot % Math.max(1, tableConfig.robotArchetypeOrder?.length || 1)] || selectedConfig.archetypeId;
  const tableResetDescription = robotAiSelectedScope() === "all"
    ? "Volta todos os robos para os perfis definidos pela mesa."
    : "Volta este robo para o perfil base definido pela mesa.";
  const options = [
    {
      id: "__table__",
      label: "Da mesa",
      description: tableResetDescription,
    },
    ...brasixRobotAiProfiles.archetypeOptions(),
  ];
  refs.robotAiPresetButtons.innerHTML = options.map((option) => {
    const isTableOption = option.id === "__table__";
    const isActive = isTableOption
      ? robotAiSelectedScope() === "all" || state.setup.robotAi?.editorMode === "basic"
      : selectedConfig.archetypeId === option.id;
    return `
      <button class="game-runtime-robot-ai-preset-button${isActive ? " is-active" : ""}" type="button" data-runtime-robot-ai-archetype="${escapeHtml(option.id)}" title="${escapeHtml(option.description || option.label)}">
        <strong>${escapeHtml(option.label)}</strong>
        <span>${escapeHtml(option.description || "")}</span>
      </button>
    `;
  }).join("");
}

function renderRobotAiTabs() {
  if (!refs.robotAiRobotTabs) {
    return;
  }
  refs.robotAiRobotTabs.innerHTML = [
    `
      <button class="game-runtime-robot-ai-tab is-table${robotAiSelectedScope() === "all" ? " is-active" : ""}" type="button" data-runtime-robot-ai-slot="-1">
        <strong>Todos</strong>
      </button>
    `,
    ...Array.from({ length: robotAiSlotCount() }, (_unused, slotIndex) => {
    const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
    return `
      <button class="game-runtime-robot-ai-tab${robotAiSelectedScope() === "slot" && robotAiSelectedSlotIndex() === slotIndex ? " is-active" : ""}" type="button" data-runtime-robot-ai-slot="${escapeHtml(String(slotIndex))}" style="--player-color:${escapeHtml(robotAiSlotColor(slotIndex))}" title="${escapeHtml(`${robotAiSlotName(slotIndex)} · ${slotConfig.profile?.label || slotConfig.archetypeId || "Perfil"}`)}">
        <span class="game-runtime-robot-ai-tab-dot" aria-hidden="true"></span>
        <strong>${escapeHtml(String(slotIndex + 1))}</strong>
      </button>
    `;
  }),
  ].join("");
  bindWheelRail(refs.robotAiRobotTabs);
}

function robotAiGroupPresetButtonsMarkup(groupId, profile) {
  return robotAiGroupPresetEntries(groupId).map((preset) => `
    <button class="game-runtime-robot-ai-group-preset-button${robotAiGroupPresetMatchesProfile(groupId, preset.id, profile) ? " is-active" : ""}" type="button" data-runtime-robot-ai-group="${escapeHtml(groupId)}" data-runtime-robot-ai-group-preset="${escapeHtml(preset.id)}">
      <span>${escapeHtml(preset.label || preset.id)}</span>
      ${robotAiHelpBadgeMarkup(preset.description || "")}
    </button>
  `).join("");
}

function renderRobotAiParameterGrid() {
  if (!refs.robotAiParameterGrid) {
    return;
  }
  const profile = robotAiRepresentativeProfile();
  const applyingToAll = robotAiSelectedScope() === "all";
  const groupIds = ROBOT_AI_EDITOR_GROUP_ORDER.filter((groupId) => brasixRobotAiProfiles.parameterGroups?.[groupId]);
  refs.robotAiParameterGrid.innerHTML = `
    ${groupIds.map((groupId) => {
      const group = brasixRobotAiProfiles.parameterGroups?.[groupId] || null;
      if (!group) {
        return "";
      }
      const meta = ROBOT_AI_EDITOR_GROUP_META[groupId] || {};
      return `
      <section class="game-runtime-robot-ai-group">
        <div class="game-runtime-robot-ai-group-shell">
          <div class="game-runtime-robot-ai-group-presets">
            ${robotAiGroupPresetButtonsMarkup(groupId, profile)}
          </div>
          <div class="game-runtime-robot-ai-group-panel">
            <div class="game-runtime-robot-ai-group-card-head">
              <div>
                <strong>${escapeHtml(meta.label || group.label || group.id)}</strong>
                <p>${escapeHtml(meta.description || group.description || "")}</p>
              </div>
              ${applyingToAll ? `<span class="game-runtime-robot-ai-target-chip">Todos</span>` : ""}
            </div>
            <div class="game-runtime-robot-ai-parameter-list">
            ${(group.parameters || []).map((parameter) => {
              const value = Number(profile?.[groupId]?.[parameter.id] || 0);
              const step = Number(parameter.step ?? 0.1);
              return `
                <label class="game-runtime-robot-ai-slider-row">
                  <div class="game-runtime-robot-ai-slider-meta">
                    <span class="game-runtime-robot-ai-slider-label">${escapeHtml(parameter.label || parameter.id)} ${robotAiHelpBadgeMarkup(parameter.description || "")}</span>
                    <strong class="game-runtime-robot-ai-slider-value">${escapeHtml(sliderNumericLabel(value, step))}</strong>
                  </div>
                  <input
                    class="game-runtime-robot-ai-slider"
                    type="range"
                    min="${escapeHtml(String(parameter.min ?? 0))}"
                    max="${escapeHtml(String(parameter.max ?? 1))}"
                    step="${escapeHtml(String(step))}"
                    value="${escapeHtml(String(value))}"
                    data-runtime-robot-ai-group="${escapeHtml(groupId)}"
                    data-runtime-robot-ai-parameter="${escapeHtml(parameter.id)}"
                  />
                </label>
              `;
            }).join("")}
            </div>
          </div>
        </div>
      </section>
    `;
    }).join("")}
  `;
}

function renderRobotAiModal() {
  if (!robotAiSetupEnabled()) {
    return;
  }
  syncRobotAiSetupState({ preserveManual: true });
  renderRobotAiModeToggle();
  renderRobotAiBasicModes();
  renderRobotAiSummaryPanel();
  renderRobotAiPresetButtons();
  renderRobotAiTabs();
  renderRobotAiParameterGrid();
  if (refs.robotAiButton) {
    refs.robotAiButton.classList.toggle("is-active", state.setup.activeModal === "robot-ai");
  }
}

function buildRobotAiManualConfigFromEffective(slotIndex) {
  const slotConfig = robotAiEffectiveSlotConfig(slotIndex);
  return {
    archetypeId: slotConfig.archetypeId,
    overrides: {
      economy: cloneJson(slotConfig.profile?.economy || {}),
      network: cloneJson(slotConfig.profile?.network || {}),
      operations: cloneJson(slotConfig.profile?.operations || {}),
      skill: cloneJson(slotConfig.profile?.skill || {}),
      metadata: {
        ...(cloneJson(slotConfig.profile?.metadata || {}) || {}),
        setup_customized: true,
        setup_archetype_id: slotConfig.archetypeId,
      },
    },
  };
}

function commitRobotAiChanges({ applyLive = true } = {}) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  syncRobotAiSetupState({ preserveManual: true });
  if (applyLive && state.players.length) {
    applyRobotAiStateToLivePlayers();
  }
  renderStaticUi();
  if (state.setup.activeModal) {
    renderSetupModal();
  }
}

function applyRobotAiArchetypeToSlots(slotIndexes, archetypeId) {
  const tableConfig = robotAiTableConfig() || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  (slotIndexes || []).forEach((slotIndex) => {
    state.setup.robotAi.manualConfigs[slotIndex] = brasixRobotAiProfiles.buildManualRobotConfig(archetypeId, {
      difficultyId: setupCurrentDifficultyId(),
    });
    state.setup.robotAi.manualConfigs[slotIndex].overrides.metadata = {
      ...(state.setup.robotAi.manualConfigs[slotIndex].overrides.metadata || {}),
      skill_preset_id: tableConfig.forcedSkillPresetId,
    };
  });
}

function setRobotAiEditorMode(modeId) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  state.setup.robotAi.editorMode = modeId === "detailed" ? "detailed" : "basic";
  commitRobotAiChanges({ applyLive: true });
}

function setRobotAiBasicMode(modeId) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  state.setup.robotAi.basicModeId = brasixRobotAiProfiles.basicModes?.[modeId] ? modeId : "balanced";
  state.setup.robotAi.editorMode = "basic";
  syncRobotAiSetupState({ preserveManual: true });
  commitRobotAiChanges({ applyLive: true });
}

function applyRobotAiArchetypeToSelectedSlot(archetypeId) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  if (archetypeId === "__table__" && robotAiSelectedScope() === "all") {
    state.setup.robotAi.editorMode = "basic";
    commitRobotAiChanges({ applyLive: true });
    return;
  }
  const slotIndexes = robotAiSelectedSlotIndexes();
  const tableConfig = robotAiTableConfig() || buildRobotAiTableConfig("balanced", setupCurrentDifficultyId());
  const fallbackArchetypeId = tableConfig.robotArchetypeOrder?.[robotAiRepresentativeSlotIndex() % Math.max(1, tableConfig.robotArchetypeOrder?.length || 1)]
    || Object.keys(brasixRobotAiProfiles.archetypes || {})[0]
    || "balanced_operator";
  const resolvedArchetypeId = archetypeId === "__table__"
    ? fallbackArchetypeId
    : archetypeId;
  state.setup.robotAi.editorMode = "detailed";
  applyRobotAiArchetypeToSlots(slotIndexes, resolvedArchetypeId);
  commitRobotAiChanges({ applyLive: true });
}

function applyRobotAiGroupPreset(groupId, presetId) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  const preset = robotAiGroupPresetLookup(groupId)?.[presetId] || null;
  if (!preset) {
    return;
  }
  state.setup.robotAi.editorMode = "detailed";
  robotAiSelectedSlotIndexes().forEach((slotIndex) => {
    const manualConfig = buildRobotAiManualConfigFromEffective(slotIndex);
    manualConfig.overrides[groupId] = cloneJson(preset.values || {});
    state.setup.robotAi.manualConfigs[slotIndex] = brasixRobotAiProfiles.normalizeManualRobotConfig(manualConfig, {
      fallbackArchetypeId: manualConfig.archetypeId,
      difficultyId: setupCurrentDifficultyId(),
    });
  });
  commitRobotAiChanges({ applyLive: true });
}

function updateRobotAiParameter(groupId, parameterId, rawValue) {
  if (!robotAiSetupEnabled()) {
    return;
  }
  ensureRobotAiSetupState();
  state.setup.robotAi.editorMode = "detailed";
  robotAiSelectedSlotIndexes().forEach((slotIndex) => {
    const manualConfig = buildRobotAiManualConfigFromEffective(slotIndex);
    if (!manualConfig.overrides?.[groupId] || !Object.prototype.hasOwnProperty.call(manualConfig.overrides[groupId], parameterId)) {
      return;
    }
    manualConfig.overrides[groupId][parameterId] = Number(rawValue || 0);
    state.setup.robotAi.manualConfigs[slotIndex] = brasixRobotAiProfiles.normalizeManualRobotConfig(manualConfig, {
      fallbackArchetypeId: manualConfig.archetypeId,
      difficultyId: setupCurrentDifficultyId(),
    });
  });
  commitRobotAiChanges({ applyLive: true });
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
    .map((flow) => {
      const availability = freightFlowAvailability(flow.id);
      const truckCompatible = truckSupportsFlow(truckUnit.truck, flow);
      const track = getTrack(flow.origin_id, flow.destination_id, "fastest") || { distanceKm: Number(flow.distance_km || 0) };
      const payloadTons = truckCompatible ? flowPayloadTons(flow, truckUnit.truck, null) : 0;
      const revenuePerDeliveryBrl = truckCompatible
        ? estimateDeliveryRevenue(flow, truckUnit.truck, player, null, track.distanceKm)
        : 0;
      const executionPlan = truckCompatible
        ? buildTruckFlowExecutionPlan(truckUnit, flow, {
          currentCityId: assignment.originCityId,
          startingFuelLiters: truckUnit.fuelLevelLiters,
        })
        : null;
      return {
        flow,
        truckCompatible,
        unitRevenuePerTon: payloadTons > 0 ? revenuePerDeliveryBrl / payloadTons : 0,
        contractTruckUnit: truckUnit,
        contractTruck: truckUnit.truck,
        contractPayloadTons: payloadTons,
        contractRevenue: revenuePerDeliveryBrl,
        availability,
        fuelFeasible: truckCompatible ? executionPlan?.feasible !== false : false,
        executionPlan,
      };
    })
    .sort((left, right) => {
      const leftRank = left.truckCompatible && left.availability?.available && left.fuelFeasible !== false
        ? 0
        : left.availability?.state === "active"
          ? 1
          : !left.truckCompatible
            ? 2
            : 3;
      const rightRank = right.truckCompatible && right.availability?.available && right.fuelFeasible !== false
        ? 0
        : right.availability?.state === "active"
          ? 1
          : !right.truckCompatible
            ? 2
            : 3;
      return leftRank - rightRank || Number(right.contractRevenue || 0) - Number(left.contractRevenue || 0);
    });
}

function assignmentTruckUnit() {
  const assignment = state.setup.activeHumanAssignment;
  const player = state.playersById.human || null;
  return assignment ? (player?.truckUnits || []).find((item) => item.id === assignment.truckUnitId) || null : null;
}

function humanAssignmentEntrySelectable(entry) {
  return Boolean(entry?.truckCompatible && entry?.availability?.available && entry?.fuelFeasible !== false);
}

function assignmentTruckSummaryMarkup(truckUnit) {
  if (!truckUnit?.truck) {
    return "";
  }
  const truck = truckUnit.truck;
  const imageUrl = versionedAssetUrl(truck.preview_image_url_path, truck.preview_image_version);
  const truckTypeLabel = truck.short_label || truck.label || "Caminhao";
  const truckSubtitle = [
    slugLabel(truck.size_tier, SIZE_TIER_LABELS),
    String(truck.axle_config || "").trim(),
    primaryImplementLabel(truck),
  ].filter(Boolean).join(" · ");
  return `
    <div class="game-setup-assignment-truck-card">
      <div class="game-setup-assignment-truck-visual${imageUrl ? "" : " is-empty"}">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(truck.label || truckTypeLabel)}" loading="lazy" />`
          : `<span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>`}
      </div>
      <div class="game-setup-assignment-truck-copy">
        <span class="eyebrow">Caminhao em busca</span>
        <strong>${escapeHtml(`${truckUnitNumberLabel(truckUnit)} · ${truckTypeLabel}`)}</strong>
        <span>${escapeHtml(truckSubtitle || truck.label || truckTypeLabel)}</span>
      </div>
    </div>
  `;
}

function setFreightModalContextLabels({ assignmentMode = false, cityBrowse = false } = {}) {
  if (!refs.modalRoot) {
    return;
  }
  const modalTitle = refs.modalRoot.querySelector('[data-runtime-modal="freights"] .game-setup-modal-head h2');
  if (modalTitle instanceof HTMLElement) {
    modalTitle.textContent = cityBrowse ? "Fretes da cidade" : "Seletor de fretes";
  }
  const railEyebrow = refs.modalRoot.querySelector('[data-runtime-modal="freights"] .game-setup-rail-head .eyebrow');
  if (railEyebrow instanceof HTMLElement) {
    railEyebrow.textContent = cityBrowse ? "Cidade selecionada" : assignmentMode ? "Destino" : "Carteira inicial";
  }
  if (refs.freightRail) {
    refs.freightRail.setAttribute("aria-label", cityBrowse ? "Fretes da cidade selecionada" : "Selecao inicial de fretes");
  }
  if (refs.freightSelection) {
    refs.freightSelection.setAttribute("aria-label", cityBrowse ? "Resumo dos fretes da cidade" : "Resumo da carteira inicial");
  }
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
  hideTruckPopup();
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

function freightCardValueBrl(entry) {
  const directRevenue = Number(entry?.contractRevenue || 0);
  if (directRevenue > 0) {
    return directRevenue;
  }
  const payloadTons = Math.max(0, Number(entry?.contractPayloadTons || flowQuantityBaseTons(entry?.flow) || 0));
  const unitRevenuePerTon = Number(entry?.unitRevenuePerTon || 0);
  return payloadTons > 0 && unitRevenuePerTon > 0 ? payloadTons * unitRevenuePerTon : 0;
}

function freightCardWeightTons(entry) {
  return Math.max(0, Number(entry?.contractPayloadTons || flowQuantityBaseTons(entry?.flow) || 0));
}

function setupFreightCardStatus({
  selected = false,
  availabilityState = "available",
  assignmentMode = false,
  truckCompatible = true,
  fuelFeasible = true,
  hasSelectedFleet = true,
  hasProductCompatibleTruck = true,
  compatible = false,
} = {}) {
  if (selected) {
    return { label: "Selecionado", tone: "is-instance" };
  }
  if (availabilityState === "active") {
    return { label: "Em execucao", tone: "is-blocked" };
  }
  if (assignmentMode && !truckCompatible) {
    return { label: "Incompativel", tone: "is-muted" };
  }
  if (truckCompatible && !fuelFeasible) {
    return { label: "Sem autonomia", tone: "is-blocked" };
  }
  if (hasSelectedFleet && !hasProductCompatibleTruck) {
    return { label: "Sem frota", tone: "is-muted" };
  }
  if (hasSelectedFleet && !compatible) {
    return { label: "Sem caminhao", tone: "is-muted" };
  }
  return { label: "Disponivel", tone: "is-available" };
}

function setupFreightCardMarkup(entry, {
  selected = false,
  cardEnabled = true,
  statusLabel = "Disponivel",
  statusTone = "is-available",
  showAction = false,
  actionLabel = "",
  actionIcon = "play_arrow",
  actionDisabled = false,
} = {}) {
  const flow = entry.flow;
  const weightTons = freightCardWeightTons(entry);
  const valueBrl = freightCardValueBrl(entry);
  return `
    <article class="game-setup-rail-card game-setup-freight-card${selected ? " is-selected" : ""}${cardEnabled ? "" : " is-disabled"}" data-rail-card="true" style="--freight-color:${escapeHtml(flow.product_color || setupCompany().color)}">
      <div class="game-setup-rail-badges">
        <span class="game-setup-pill ${escapeHtml(statusTone)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="game-setup-freight-product">
        <span class="game-setup-product-emoji">${escapeHtml(flow.product_emoji || "📦")}</span>
        <span class="game-setup-freight-product-separator" aria-hidden="true">-</span>
        <strong class="game-setup-freight-product-name">${escapeHtml(flow.product_name)}</strong>
      </div>
      <div class="game-setup-freight-route">
        <div class="game-setup-freight-route-line is-origin">
          <strong>${escapeHtml(flow.origin_label)}</strong>
          <span class="material-symbols-outlined" aria-hidden="true">east</span>
        </div>
        <div class="game-setup-freight-route-line is-destination">
          <strong>${escapeHtml(flow.destination_label)}</strong>
        </div>
      </div>
      <div class="game-setup-spec-grid game-setup-freight-spec-grid">
        <article><span>Distancia</span><strong>${escapeHtml(formatDistanceKm(flow.distance_km))}</strong></article>
        <article><span>Peso</span><strong>${escapeHtml(weightTons > 0 ? formatTonnes(weightTons) : "-")}</strong></article>
        <article><span>Taxa</span><strong>${escapeHtml(Number(entry.unitRevenuePerTon || 0) > 0 ? formatCurrencyPerTon(entry.unitRevenuePerTon) : "-")}</strong></article>
        <article><span>Valor</span><strong>${escapeHtml(valueBrl > 0 ? formatCurrency(valueBrl) : "-")}</strong></article>
      </div>
      ${showAction ? `
        <button class="editor-header-action game-setup-freight-toggle" type="button" data-runtime-toggle-freight="${escapeHtml(flow.id)}"${actionDisabled ? " disabled" : ""}>
          <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(actionIcon)}</span>
          <span>${escapeHtml(actionLabel)}</span>
        </button>
      ` : ""}
    </article>
  `;
}

function renderSetupFreightRail() {
  if (!refs.freightRail) {
    return;
  }
  const assignmentMode = Boolean(state.setup.activeHumanAssignment);
  const cityBrowse = cityFreightBrowseMode();
  const assignmentTruck = assignmentMode ? assignmentTruckUnit() : null;
  const cityId = assignmentMode
    ? state.setup.activeHumanAssignment.originCityId
    : cityBrowse
      ? currentFreightBrowseCityId()
      : currentSelectionHqCityId();
  setFreightModalContextLabels({ assignmentMode, cityBrowse });
  if (cityBrowse) {
    const browseEntries = buildCityFreightBrowseEntries(cityId);
    const openEntries = browseEntries.filter((entry) => entry.availability?.state !== "active");
    const activeEntries = browseEntries.filter((entry) => entry.availability?.state === "active");
    refs.freightRail.innerHTML = browseEntries.length
      ? browseEntries.map((entry) => {
        const availabilityState = entry.availability?.state || "available";
        const isOpen = availabilityState !== "active";
        const status = setupFreightCardStatus({ availabilityState, compatible: isOpen, hasSelectedFleet: false });
        return setupFreightCardMarkup(entry, {
          statusLabel: status.label,
          statusTone: status.tone,
        });
      }).join("")
      : `<div class="truck-gallery-empty">${escapeHtml(`Nao ha fretes cadastrados saindo de ${cityLabel(cityId) || "a cidade selecionada"}.`)}</div>`;

    if (refs.freightRailMeta) {
      refs.freightRailMeta.textContent = `${formatInteger(openEntries.length)} em aberto · ${formatInteger(activeEntries.length)} em execucao · ${cityLabel(cityId)}`;
    }
    if (refs.freightRailTitle) {
      refs.freightRailTitle.textContent = `Fretes de saida de ${cityLabel(cityId)}`;
    }
    bindWheelRail(refs.freightRail);
    updateRailPerspective(refs.freightRail);
    return;
  }
  const pricedEntries = assignmentMode ? buildHumanAssignmentPricedEntries() : setupPricedFreightsForCity(cityId);
  const selectedEntries = assignmentMode ? [] : setupSelectedPricedFreightEntries();
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
      const truckCompatible = assignmentMode ? Boolean(entry.truckCompatible) : Boolean(supportedProductIds.has(flow.product_id));
      const hasProductCompatibleTruck = assignmentMode ? truckCompatible : Boolean(supportedProductIds.has(flow.product_id));
      const compatible = assignmentMode
        ? (truckCompatible && available && fuelFeasible)
        : Boolean(entry.contractTruckUnit) && available && fuelFeasible;
      const suggestedForReferenceFleet = referenceProductIds.has(flow.product_id);
      const cardEnabled = compatible || (!assignmentMode && !hasSelectedFleet && suggestedForReferenceFleet && available);
      const actionLabel = assignmentMode
        ? compatible
          ? "Assumir Frete"
          : !available
            ? "Indisponivel"
            : !truckCompatible
              ? "Incompativel"
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
        const status = setupFreightCardStatus({
          selected,
          availabilityState,
          assignmentMode,
          truckCompatible,
          fuelFeasible,
          hasSelectedFleet,
          hasProductCompatibleTruck,
          compatible,
        });
        return setupFreightCardMarkup(entry, {
          selected,
          cardEnabled,
          statusLabel: status.label,
          statusTone: status.tone,
          showAction: true,
          actionLabel,
          actionIcon: assignmentMode ? (compatible ? "play_arrow" : "block") : selected ? "check_circle" : compatible ? "add_circle" : "block",
          actionDisabled: !compatible,
        });
    }).join("")
    : `<div class="truck-gallery-empty">${escapeHtml(assignmentMode && advancedDispatchEnabled() ? `Nao ha contratos livres em ${cityLabel(cityId)}. Use o mapa principal para reposicionar ou voltar para a sede.` : `Nao ha fretes de saida ativos para ${cityLabel(cityId) || "a cidade atual"}.`)}</div>`;

  if (refs.freightRailMeta) {
    const selectableCount = assignmentMode ? pricedEntries.filter((entry) => humanAssignmentEntrySelectable(entry)).length : 0;
    refs.freightRailMeta.textContent = assignmentMode
      ? `${formatInteger(selectableCount)} livres · ${formatInteger(Math.max(0, pricedEntries.length - selectableCount))} bloqueados · ${cityLabel(cityId)}`
      : `${formatInteger(pricedEntries.length)} fretes · ${formatInteger(selectedEntries.length)} selecionados`;
  }
  if (refs.freightRailTitle) {
    refs.freightRailTitle.textContent = assignmentMode
      ? `Contratos de ${cityLabel(cityId)}${assignmentTruck ? ` · ${truckUnitNumberLabel(assignmentTruck)}` : ""}`
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
  const cityBrowse = cityFreightBrowseMode();
  const cityId = assignmentMode
    ? state.setup.activeHumanAssignment.originCityId
    : cityBrowse
      ? currentFreightBrowseCityId()
      : currentSelectionHqCityId();
  if (cityBrowse) {
    const browseEntries = buildCityFreightBrowseEntries(cityId);
    const openEntries = browseEntries.filter((entry) => entry.availability?.state !== "active");
    const activeEntries = browseEntries.filter((entry) => entry.availability?.state === "active");
    const totalOpenTonnes = openEntries.reduce((total, entry) => total + flowQuantityBaseTons(entry.flow), 0);
    const bestOpenEntry = openEntries[0] || null;
    refs.freightSelection.innerHTML = `
      <div class="game-setup-selector-head">
        <span class="eyebrow">Cidade</span>
        <h3>${escapeHtml(`Fretes em ${cityLabel(cityId)}`)}</h3>
      </div>
      <div class="game-setup-summary-metrics">
        <article><span>Em aberto</span><strong>${escapeHtml(formatInteger(openEntries.length))}</strong></article>
        <article><span>Em execucao</span><strong>${escapeHtml(formatInteger(activeEntries.length))}</strong></article>
        <article><span>Melhor taxa</span><strong>${escapeHtml(bestOpenEntry ? formatCurrencyPerTon(bestOpenEntry.unitRevenuePerTon) : "-")}</strong></article>
        <article><span>Carga base</span><strong>${escapeHtml(openEntries.length ? formatTonnes(totalOpenTonnes) : "-")}</strong></article>
      </div>
      <div class="game-setup-section-block">
        <div class="game-setup-section-head"><span class="eyebrow">Em aberto</span><strong>${escapeHtml(`${formatInteger(openEntries.length)} contratos`)}</strong></div>
        <div class="game-setup-selection-list">
          ${openEntries.length
            ? openEntries.slice(0, 4).map((entry) => `
              <article class="game-setup-selection-line">
                <strong>${escapeHtml(entry.flow.product_name)}</strong>
                <span>${escapeHtml(`${formatCurrencyPerTon(entry.unitRevenuePerTon)} · ${entry.flow.origin_label} -> ${entry.flow.destination_label}`)}</span>
              </article>
            `).join("")
            : `<div class="truck-gallery-empty">Nenhum frete em aberto nesta cidade.</div>`}
        </div>
      </div>
      <div class="game-setup-section-block">
        <div class="game-setup-section-head"><span class="eyebrow">Em execucao</span><strong>${escapeHtml(`${formatInteger(activeEntries.length)} contratos`)}</strong></div>
        <div class="game-setup-selection-list">
          ${activeEntries.length
            ? activeEntries.slice(0, 4).map((entry) => `
              <article class="game-setup-selection-line">
                <strong>${escapeHtml(entry.flow.product_name)}</strong>
                <span>${escapeHtml(`${entry.availability?.message || "Contrato em execucao"} · ${entry.flow.origin_label} -> ${entry.flow.destination_label}`)}</span>
              </article>
            `).join("")
            : `<div class="truck-gallery-empty">Nenhum frete em execucao saindo desta cidade.</div>`}
        </div>
      </div>
    `;
    return;
  }
  const allAssignmentEntries = assignmentMode ? buildHumanAssignmentPricedEntries() : [];
  const selectableEntries = assignmentMode ? allAssignmentEntries.filter((entry) => humanAssignmentEntrySelectable(entry)) : [];
  const entries = assignmentMode ? selectableEntries.slice(0, 4) : setupSelectedPricedFreightEntries();
  const recommended = assignmentMode ? entries : setupRecommendedPricedFreights(4);
  const totalTonnes = entries.reduce((total, entry) => total + Number(entry.contractPayloadTons || 0), 0);
  const averageDistance = entries.length ? entries.reduce((total, entry) => total + Number(entry.flow.distance_km || 0), 0) / entries.length : 0;
  const totalRevenue = entries.reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
  const truckUnit = assignmentMode ? assignmentTruckUnit() : null;
  const fuelSnapshot = truckUnit ? truckFuelSnapshot(truckUnit) : null;
  const nearestDispatch = assignmentMode ? bestHumanNearestContractDispatch() : null;
  refs.freightSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">${escapeHtml(assignmentMode ? "Destino" : "Carteira")}</span>
      <h3>${escapeHtml(assignmentMode ? `Despacho em ${cityLabel(cityId)}` : (entries.length ? `${formatInteger(entries.length)} contratos selecionados` : `Fretes de ${cityLabel(cityId)}`))}</h3>
    </div>
    ${assignmentMode ? assignmentTruckSummaryMarkup(truckUnit) : ""}
    ${assignmentMode ? `
      <div class="game-setup-summary-metrics game-setup-summary-metrics-compact">
        <article><span>Odometro</span><strong>${escapeHtml(formatDistanceKm(fuelSnapshot?.odometerKm || 0))}</strong></article>
      </div>
    ` : `
      <div class="game-setup-summary-metrics">
        <article><span>Melhor taxa</span><strong>${escapeHtml(recommended[0] ? formatCurrencyPerTon(recommended[0].unitRevenuePerTon) : "-")}</strong></article>
        <article><span>Receita carteira</span><strong>${escapeHtml(formatCurrency(totalRevenue))}</strong></article>
        <article><span>Carga por viagens</span><strong>${escapeHtml(formatTonnes(totalTonnes))}</strong></article>
        <article><span>Distancia media</span><strong>${escapeHtml(entries.length ? formatDistanceKm(averageDistance) : "-")}</strong></article>
      </div>
    `}
    ${assignmentMode && advancedDispatchEnabled() ? `
      <div class="game-setup-section-block">
        <div class="game-setup-section-head"><span class="eyebrow">Opcoes</span></div>
        <div class="game-runtime-dispatch-options">
          <button class="editor-header-action game-runtime-mini-action" type="button" data-runtime-dispatch-action="nearest-contract"${nearestDispatch ? "" : " disabled"}>
            <span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
            <span>Ir ate o contrato mais proximo</span>
          </button>
          <button class="editor-header-action game-runtime-mini-action" type="button" data-runtime-dispatch-action="return-hq"${cityId === (state.playersById.human?.hqCityId || "") ? " disabled" : ""}>
            <span class="material-symbols-outlined" aria-hidden="true">home_work</span>
            <span>Voltar para a sede</span>
          </button>
          <button class="editor-header-action game-runtime-mini-action" type="button" data-runtime-dispatch-action="pick-map">
            <span class="material-symbols-outlined" aria-hidden="true">explore</span>
            <span>Escolher destino no mapa</span>
          </button>
        </div>
        <p class="game-setup-compatibility-note${nearestDispatch ? " is-active" : ""}">${escapeHtml(nearestDispatch
          ? `Vai para ${cityLabel(nearestDispatch.destinationCityId)} buscar ${nearestDispatch.targetFlow?.product_name || "carga"} rumo a ${cityLabel(nearestDispatch.targetFlow?.destination_id)} · ${formatDistanceKm(nearestDispatch.repositionDistanceKm)} de reposicionamento.`
          : "Nenhum contrato compativel e viavel foi encontrado fora da cidade atual.")}</p>
        <p class="game-setup-compatibility-note is-active">A opcao Escolher destino no mapa fecha o seletor e ativa a escolha da cidade no mapa principal.</p>
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
  if (!refs.modalRoot || (!openingWizardEnabled() && !cityFreightBrowseMode() && !state.setup.activeHumanAssignment && !purchaseFlowActive())) {
    return;
  }
  if (state.setup.activeModal === "analytics") {
    renderAnalyticsModal();
    updateSetupModalVisibility();
    return;
  }
  if (refs.openingDifficultySelect) {
    refs.openingDifficultySelect.value = setupCurrentDifficultyId();
  }
  if (refs.openingRobotCountInput) {
    refs.openingRobotCountInput.min = String(MIN_ROBOT_COUNT);
    refs.openingRobotCountInput.max = String(MAX_ROBOT_COUNT);
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
  renderOpeningRobotAiSummary();
  renderOpeningLogoGrid();
  renderOpeningCompanyPreview();
  renderOpeningEconomyPanel();
  renderOpeningMarketPanels();
  renderSetupFleetRail();
  renderSetupFleetSelection();
  renderSetupFreightRail();
  renderSetupFreightSelection();
  renderRobotAiModal();
  updateSetupModalVisibility();
}

function setupModalCanClose() {
  if (state.setup.activeHumanAssignment) {
    return true;
  }
  if (state.setup.activeModal === "opening-setup") {
    return false;
  }
  if (state.setup.activeModal === "opening") {
    return robotsOnlyEnabled() || setupHeadquartersPurchased();
  }
  if (state.setup.activeModal === "fleet") {
    if (purchaseFlowActive() || (openingWizardEnabled() && !state.players.length)) {
      return true;
    }
    return Boolean(state.setup.company.fleetPurchased && setupSelectedTruckEntries().length);
  }
  if (state.setup.activeModal === "freights") {
    if (cityFreightBrowseMode()) {
      return true;
    }
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
  if (modalName === "robot-ai" && !robotAiSetupEnabled()) {
    return;
  }
  hideTruckPopup();
  if (modalName !== "freights") {
    clearCityFreightBrowseState();
  }
  state.setup.activeModal = modalName;
  renderSetupModal();
}

function finalizeRobotsOnlyOpening() {
  state.setup.activeModal = "";
  updateSetupModalVisibility();
  buildPlayers();
  renderStaticUi();
  renderMapUi({ refreshIcons: true });
  focusPlayerOnMap(state.playersById[state.focusedPlayerId] || state.players[0] || null);
  startSimulation();
}

function proceedOpeningSetupModal() {
  if (!openingWizardEnabled() || state.players.length || purchaseFlowActive()) {
    return;
  }
  clearCityFreightBrowseState();
  if (robotsOnlyEnabled()) {
    finalizeRobotsOnlyOpening();
    return;
  }
  openSetupModal("opening");
}

function closeSetupModal() {
  if (!setupModalCanClose()) {
    return;
  }
  if (state.setup.activeHumanAssignment) {
    resetHumanAssignmentState();
    state.setup.activeModal = "";
    updateSetupModalVisibility();
    renderStaticUi();
    renderMapUi({ refreshIcons: true });
    return;
  }
  if (state.setup.activeModal === "robot-ai" && openingWizardEnabled() && !state.players.length && !purchaseFlowActive()) {
    openSetupModal("opening-setup");
    return;
  }
  clearCityFreightBrowseState();
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
  if ((event.code === "Space" || event.key === " ") && !event.repeat && !keyboardTargetAcceptsTyping(event.target)) {
    event.preventDefault();
    togglePauseSpeed();
    return;
  }
  if (event.key !== "Escape") {
    return;
  }
  if (truckPopupVisible()) {
    event.preventDefault();
    hideTruckPopup();
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
  const nearestDispatch = dispatchMode === "nearest-contract" ? bestHumanNearestContractDispatch() : null;
  const destinationCityId = dispatchMode === "return-hq"
    ? player.hqCityId
    : dispatchMode === "nearest-contract"
      ? String(nearestDispatch?.destinationCityId || "").trim()
      : String(state.setup.dispatchSelectedCityId || "").trim();
  if (!destinationCityId || destinationCityId === assignment.originCityId) {
    if (dispatchMode === "nearest-contract" && !nearestDispatch) {
      appendLog(player.id, "neutral", `${player.label} nao encontrou contrato compativel e viavel fora de ${cityLabel(assignment.originCityId)}.`);
      renderStaticUi();
      renderMapUi({ refreshIcons: true });
    }
    return;
  }
  const contract = assignDispatchToTruck(player, truckUnit, destinationCityId, dispatchMode === "return-hq" ? "return_hq" : "reposition");
  if (!contract) {
    return;
  }
  if (nearestDispatch?.targetFlow) {
    appendLog(
      player.id,
      "neutral",
      `${player.label} vai para ${cityLabel(nearestDispatch.destinationCityId)} buscar ${nearestDispatch.targetFlow.product_name || "carga"} rumo a ${cityLabel(nearestDispatch.targetFlow.destination_id)}.`,
    );
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
  state.setup.robotCount = 10;
  state.setup.company = {
    name: "Brasix",
    color: "#000000",
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
  state.setup.cityFreightBrowseCityId = "";
  state.setup.dispatchSelectedCityId = "";
  state.setup.mainMapDispatchSelection = false;
  if (robotAiSetupEnabled()) {
    syncRobotAiSetupState({ preserveManual: false });
  }
  openSetupModal("opening-setup");
}

function findWheelRailTarget(eventTarget) {
  return eventTarget instanceof Element ? eventTarget.closest("[data-wheel-rail]") : null;
}

function findWheelStackTarget(eventTarget) {
  return eventTarget instanceof Element ? eventTarget.closest(".game-runtime-player-bar") : null;
}

function applyWheelScrollToRail(element, delta) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.scrollLeft += delta * 1.18;
  updateRailPerspective(element);
}

function applyWheelScrollToStack(element, delta) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.scrollTop += delta * 1.08;
}

function bindWheelRail(element) {
  if (!element || element.dataset.wheelBound === "true") {
    return;
  }
  element.dataset.wheelBound = "true";
  element.addEventListener("scroll", () => updateRailPerspective(element));
}

function handleRailWheel(event) {
  if (event.defaultPrevented || event.ctrlKey) {
    return;
  }
  const stack = findWheelStackTarget(event.target);
  if (stack instanceof HTMLElement && stack.scrollHeight > stack.clientHeight + 4) {
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!dominantDelta) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyWheelScrollToStack(stack, dominantDelta);
    return;
  }
  if (!state.setup.activeModal) {
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
    if (robotAiSetupEnabled()) {
      syncRobotAiSetupState({ preserveManual: true });
      renderOpeningRobotAiSummary();
      renderRobotAiModal();
    }
    renderStatus();
    renderOpeningEconomyPanel();
    return;
  }
  if (target === refs.openingRobotCountInput && (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    state.setup.robotCount = clamp(Number(target.value || 10), MIN_ROBOT_COUNT, MAX_ROBOT_COUNT);
    if (robotAiSetupEnabled()) {
      syncRobotAiSetupState({ preserveManual: true });
      renderOpeningRobotAiSummary();
      renderRobotAiModal();
    }
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
    return;
  }

  if (target instanceof HTMLInputElement && target.hasAttribute("data-runtime-robot-ai-parameter")) {
    updateRobotAiParameter(
      target.getAttribute("data-runtime-robot-ai-group") || "",
      target.getAttribute("data-runtime-robot-ai-parameter") || "",
      target.value,
    );
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
    } else if (state.players.length) {
      marker.on("click", () => openCityFreightBrowser(city.id));
      marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong><br>Clique para ver os fretes da cidade`, {
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
      marker.on("click", (event) => handleTruckMarkerClick(player, truckUnit, contract, event));
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

function truckPopupVisible() {
  return Boolean(state.truckPopup.playerId && state.truckPopup.truckUnitId);
}

function activeTruckPopupContext() {
  if (!truckPopupVisible()) {
    return null;
  }
  const player = state.playersById[state.truckPopup.playerId] || null;
  if (!player) {
    return null;
  }
  const truckUnit = (player.truckUnits || []).find((unit) => unit.id === state.truckPopup.truckUnitId) || null;
  if (!truckUnit) {
    return null;
  }
  const contract = (player.contracts || []).find((item) => item.truckUnitId === truckUnit.id) || null;
  return { player, truckUnit, contract };
}

function hideTruckPopup() {
  state.truckPopup = {
    playerId: "",
    truckUnitId: "",
    screenX: 0,
    screenY: 0,
  };
  if (refs.truckPopup) {
    refs.truckPopup.hidden = true;
    refs.truckPopup.innerHTML = "";
  }
}

function truckPopupScreenPosition(mapEvent, player, truckUnit, contract) {
  const nativeEvent = mapEvent?.originalEvent || null;
  if (Number.isFinite(nativeEvent?.clientX) && Number.isFinite(nativeEvent?.clientY)) {
    return {
      screenX: Number(nativeEvent.clientX),
      screenY: Number(nativeEvent.clientY),
    };
  }
  const position = truckUnitMapPosition(player, truckUnit, contract);
  const rect = refs.mapStage?.getBoundingClientRect?.();
  if (state.map && rect && position) {
    const point = state.map.latLngToContainerPoint([position.lat, position.lng]);
    return {
      screenX: Number(rect.left || 0) + Number(point.x || 0),
      screenY: Number(rect.top || 0) + Number(point.y || 0),
    };
  }
  return {
    screenX: Math.round(window.innerWidth / 2),
    screenY: Math.round(window.innerHeight / 2),
  };
}

function truckPopupMarkup(player, truckUnit, contract) {
  return playerRouteCardMarkup(player, truckUnit, contract, { interactiveIdle: false });
}

function positionTruckPopup() {
  if (!refs.truckPopup || refs.truckPopup.hidden) {
    return;
  }
  const popupRect = refs.truckPopup.getBoundingClientRect();
  const margin = 16;
  const offsetX = 18;
  const offsetY = 12;
  const anchorX = Number(state.truckPopup.screenX || 0);
  const anchorY = Number(state.truckPopup.screenY || 0);
  let left = anchorX + offsetX;
  let top = anchorY + offsetY;

  if (left + popupRect.width > window.innerWidth - margin) {
    left = anchorX - popupRect.width - offsetX;
  }
  if (top + popupRect.height > window.innerHeight - margin) {
    top = window.innerHeight - popupRect.height - margin;
  }

  left = Math.max(margin, left);
  top = Math.max(margin, top);

  refs.truckPopup.style.left = `${Math.round(left)}px`;
  refs.truckPopup.style.top = `${Math.round(top)}px`;
}

function renderTruckPopup() {
  if (!refs.truckPopup) {
    return;
  }
  if (state.setup.activeModal || mainMapDispatchSelectionActive()) {
    refs.truckPopup.hidden = true;
    refs.truckPopup.innerHTML = "";
    return;
  }
  const context = activeTruckPopupContext();
  if (!context) {
    refs.truckPopup.hidden = true;
    refs.truckPopup.innerHTML = "";
    return;
  }
  refs.truckPopup.innerHTML = truckPopupMarkup(context.player, context.truckUnit, context.contract);
  refs.truckPopup.hidden = false;
  positionTruckPopup();
}

function showTruckPopup(player, truckUnit, contract, mapEvent) {
  if (!player || !truckUnit) {
    hideTruckPopup();
    return;
  }
  const position = truckPopupScreenPosition(mapEvent, player, truckUnit, contract);
  state.truckPopup = {
    playerId: player.id,
    truckUnitId: truckUnit.id,
    screenX: position.screenX,
    screenY: position.screenY,
  };
  renderTruckPopup();
}

function handleTruckMarkerClick(player, truckUnit, contract, mapEvent) {
  mapEvent?.originalEvent?.preventDefault?.();
  mapEvent?.originalEvent?.stopPropagation?.();
  const sameTruck = state.truckPopup.playerId === player?.id && state.truckPopup.truckUnitId === truckUnit?.id;
  if (sameTruck && openingWizardEnabled() && player?.isHuman && !contract) {
    hideTruckPopup();
    startHumanTruckDispatchSelection(truckUnit.id);
    return;
  }
  showTruckPopup(player, truckUnit, contract, mapEvent);
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

function analyticsSnapshotBucket(date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const bucketHour = Math.floor(safeDate.getHours() / ANALYTICS_SNAPSHOT_INTERVAL_HOURS) * ANALYTICS_SNAPSHOT_INTERVAL_HOURS;
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}-${String(safeDate.getDate()).padStart(2, "0")}T${String(bucketHour).padStart(2, "0")}`;
}

function analyticsStageLabel(contract) {
  if (!contract) {
    return "idle";
  }
  if (contract.stage === "loading") {
    return "loading";
  }
  if (contract.stage === "unloading") {
    return "unloading";
  }
  return "moving";
}

function analyticsProductLabel(productId) {
  const runtimeProduct = state.productsById[String(productId || "").trim()] || null;
  return runtimeProduct?.name || String(productId || "Carga").trim() || "Carga";
}

function analyticsProductEmoji(productId, fallbackEmoji = "📦") {
  const runtimeProduct = state.productsById[String(productId || "").trim()] || null;
  const emoji = String(runtimeProduct?.emoji || fallbackEmoji || "📦").trim();
  return emoji || "📦";
}

function analyticsProductTitle(productId, productName, fallbackEmoji = "📦") {
  const label = String(productName || analyticsProductLabel(productId) || "Carga").trim() || "Carga";
  return `${analyticsProductEmoji(productId, fallbackEmoji)} ${label}`;
}

function analyticsPlayerRoleLabel(player) {
  return player?.isHuman ? "Jogador" : "Robo";
}

function analyticsDefaultPlayerId() {
  return state.playersById.human?.id || state.players[0]?.id || "";
}

function analyticsSelectedPlayer() {
  const selectedPlayerId = String(state.analytics.selectedPlayerId || "").trim();
  return state.playersById[selectedPlayerId]
    || state.playersById[analyticsDefaultPlayerId()]
    || state.players[0]
    || null;
}

function analyticsPlayerSelectorMarkup(selectedPlayerId) {
  const players = state.players.slice();
  if (players.length <= 1) {
    return "";
  }
  return `
    <div class="game-runtime-analytics-player-selector" data-wheel-rail="analytics-player-selector" role="tablist" aria-label="Selecao de empresa nos graficos">
      ${players.map((player) => `
        <button class="segmented-button game-runtime-analytics-player-button${player.id === selectedPlayerId ? " is-active" : ""}" type="button" role="tab" aria-selected="${player.id === selectedPlayerId ? "true" : "false"}" data-runtime-analytics-player="${escapeHtml(player.id)}" style="--analytics-player-color:${escapeHtml(player.color || "#356d63")}">
          <i aria-hidden="true"></i>
          <span>${escapeHtml(player.label)}</span>
          <small>${escapeHtml(`${analyticsPlayerRoleLabel(player)} · ${cityLabel(player.hqCityId)}`)}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function analyticsTopEntries(entries, limit = 8, comparator = null) {
  const nextEntries = Array.isArray(entries) ? entries.slice() : [];
  if (typeof comparator === "function") {
    nextEntries.sort(comparator);
  }
  return nextEntries.slice(0, Math.max(0, Number(limit || 0)));
}

function analyticsEnsureFlowStat(flow) {
  const flowId = String(flow?.id || "").trim();
  if (!flowId) {
    return null;
  }
  if (!state.analytics.flowStatsById[flowId]) {
    state.analytics.flowStatsById[flowId] = {
      flowId,
      productId: String(flow?.product_id || "").trim(),
      productName: flow?.product_name || analyticsProductLabel(flow?.product_id),
      productEmoji: flow?.product_emoji || analyticsProductEmoji(flow?.product_id),
      originId: String(flow?.origin_id || "").trim(),
      destinationId: String(flow?.destination_id || "").trim(),
      routeLabel: `${cityLabel(flow?.origin_id)} -> ${cityLabel(flow?.destination_id)}`,
      totalDeliveries: 0,
      totalTonnes: 0,
      totalRevenueBrl: 0,
      totalProfitBrl: 0,
      totalDistanceKm: Number(flow?.distance_km || 0),
      activeCount: 0,
      lastPlayerId: "",
    };
  }
  return state.analytics.flowStatsById[flowId];
}

function analyticsEnsureTruckStat(player, truckUnit) {
  const truckId = String(truckUnit?.id || "").trim();
  if (!truckId) {
    return null;
  }
  if (!state.analytics.truckStatsById[truckId]) {
    state.analytics.truckStatsById[truckId] = {
      truckUnitId: truckId,
      playerId: String(player?.id || "").trim(),
      playerLabel: player?.label || "Operacao",
      truckLabel: `${truckUnit?.truck?.short_label || truckUnit?.truck?.label || truckUnit?.truckId || "Caminhao"} #${formatInteger(truckUnit?.displayNumber || 0)}`,
      modelLabel: truckUnit?.truck?.short_label || truckUnit?.truck?.label || truckUnit?.truckId || "Caminhao",
      deliveries: 0,
      tonnes: 0,
      profitBrl: 0,
      revenueBrl: 0,
      fuelCostBrl: 0,
      estimatedDistanceKm: 0,
      statusHours: {
        moving: 0,
        loading: 0,
        unloading: 0,
        idle: 0,
      },
    };
  }
  return state.analytics.truckStatsById[truckId];
}

function analyticsRecordTruckActivity(deltaHours) {
  state.players.forEach((player) => {
    const contractsByTruckId = Object.fromEntries((player.contracts || []).map((contract) => [contract.truckUnitId, contract]));
    (player.truckUnits || []).forEach((truckUnit) => {
      const truckStat = analyticsEnsureTruckStat(player, truckUnit);
      if (!truckStat) {
        return;
      }
      const contract = contractsByTruckId[truckUnit.id] || null;
      const stageLabel = analyticsStageLabel(contract);
      truckStat.statusHours[stageLabel] = roundNumber(Number(truckStat.statusHours[stageLabel] || 0) + deltaHours, 3);
      if (contract) {
        truckStat.estimatedDistanceKm = roundNumber(Number(truckStat.estimatedDistanceKm || 0) + (Number(contract.deliveryTrack?.distanceKm || 0) * (deltaHours / Math.max(Number(contract.stageDurationHours || 0.0001), 0.0001))), 2);
      }
    });
  });
}

function analyticsRecordSnapshot(force = false) {
  if (!state.players.length) {
    return;
  }
  const bucket = analyticsSnapshotBucket(state.simulation.currentTime);
  if (!force && bucket === state.analytics.lastSnapshotBucket) {
    return;
  }
  const playerEntries = state.players.map((player) => ({
    playerId: player.id,
    label: player.label,
    isHuman: Boolean(player.isHuman),
    cashBrl: roundNumber(Number(player.cashBrl || 0), 2),
    deltaBrl: roundNumber(playerCashDelta(player), 2),
    deliveries: Number(player.deliveries || 0),
    tonnesMoved: roundNumber(Number(player.tonnesMoved || 0), 2),
    activeContracts: playerActiveContractCount(player),
    idleTrucks: playerIdleTruckCount(player),
    truckCount: Number(player.truckUnits?.length || 0),
  }));
  state.analytics.history.push({
    bucket,
    timestamp: state.simulation.currentTime.getTime(),
    label: formatClock(state.simulation.currentTime),
    players: playerEntries,
  });
  if (ANALYTICS_HISTORY_MAX_POINTS > 0 && state.analytics.history.length > ANALYTICS_HISTORY_MAX_POINTS) {
    state.analytics.history = state.analytics.history.slice(-ANALYTICS_HISTORY_MAX_POINTS);
  }
  state.analytics.lastSnapshotBucket = bucket;
}

function analyticsPlayerHistory(playerId) {
  const normalizedPlayerId = String(playerId || "").trim();
  return state.analytics.history.map((entry) => ({
    label: entry.label,
    timestamp: entry.timestamp,
    point: entry.players.find((player) => player.playerId === normalizedPlayerId) || null,
  })).filter((entry) => entry.point);
}

function analyticsCompanyRanking() {
  return state.players.slice().sort((left, right) => Number(right.cashBrl || 0) - Number(left.cashBrl || 0)
    || Number(right.deliveries || 0) - Number(left.deliveries || 0)
    || Number(right.tonnesMoved || 0) - Number(left.tonnesMoved || 0));
}

function analyticsFlowStatsList() {
  return Object.values(state.analytics.flowStatsById);
}

function analyticsTruckStatsList() {
  return Object.values(state.analytics.truckStatsById);
}

function analyticsTopCityList(metricKey, limit = 8) {
  return analyticsTopEntries(state.cities.map((city) => {
    const stats = state.cityMarketStatsById[city.id] || { outboundCount: 0, outboundTonnes: 0, inboundCount: 0, inboundTonnes: 0 };
    const player = state.players.find((entry) => entry.hqCityId === city.id) || null;
    return {
      cityId: city.id,
      label: city.label,
      value: Number(stats[metricKey] || 0),
      ownerLabel: player?.label || "Mercado",
    };
  }), limit, (left, right) => Number(right.value || 0) - Number(left.value || 0));
}

function analyticsPlayerContracts(player) {
  return Array.isArray(player?.contracts) ? player.contracts.filter((contract) => !contract.dispatchOnly) : [];
}

function analyticsPlayerFreightRows(player) {
  return analyticsPlayerContracts(player).map((contract) => ({
    flowId: contract.flowId,
    productId: String(contract.flow.product_id || "").trim(),
    productEmoji: contract.flow.product_emoji || analyticsProductEmoji(contract.flow.product_id),
    routeLabel: `${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`,
    productName: contract.flow.product_name || analyticsProductLabel(contract.flow.product_id),
    distanceKm: Number(contract.flow.distance_km || contract.deliveryTrack?.distanceKm || 0),
    profitBrl: Number(contract.profitPerDeliveryBrl || 0),
    payloadTons: Number(contract.payloadTons || 0),
    statusLabel: routeCardStatusLabel(contract),
  }));
}

function analyticsPlayerProductRows(player) {
  const map = {};
  analyticsPlayerContracts(player).forEach((contract) => {
    const key = String(contract.flow.product_id || "outros").trim() || "outros";
    if (!map[key]) {
      map[key] = {
        productId: key,
        label: contract.flow.product_name || analyticsProductLabel(key),
        contracts: 0,
        tonnes: 0,
        profitBrl: 0,
      };
    }
    map[key].contracts += 1;
    map[key].tonnes = roundNumber(Number(map[key].tonnes || 0) + Number(contract.payloadTons || 0), 2);
    map[key].profitBrl = roundNumber(Number(map[key].profitBrl || 0) + Number(contract.profitPerDeliveryBrl || 0), 2);
  });
  return Object.values(map).sort((left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
}

function analyticsHydrateCurrentState() {
  state.players.forEach((player) => {
    (player.truckUnits || []).forEach((truckUnit) => {
      analyticsEnsureTruckStat(player, truckUnit);
    });
    (player.contracts || []).forEach((contract) => {
      if (contract.dispatchOnly) {
        return;
      }
      const flowStat = analyticsEnsureFlowStat(contract.flow);
      if (flowStat) {
        flowStat.activeCount += 1;
        flowStat.lastPlayerId = player.id;
      }
    });
  });
}

function analyticsCurrentPlayer() {
  return state.playersById.human || state.players[0] || null;
}

function analyticsSum(entries, resolver) {
  const list = Array.isArray(entries) ? entries : [];
  return list.reduce((total, entry) => total + Number(typeof resolver === "function" ? resolver(entry) : entry?.[resolver] || 0), 0);
}

function analyticsAverage(entries, resolver) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    return 0;
  }
  return analyticsSum(list, resolver) / list.length;
}

function analyticsTruckUtilizationPercent(truckStat) {
  const totalHours = analyticsSum(Object.entries(truckStat?.statusHours || {}), ([, value]) => value);
  if (!totalHours) {
    return 0;
  }
  const activeHours = Number(truckStat?.statusHours?.moving || 0) + Number(truckStat?.statusHours?.loading || 0) + Number(truckStat?.statusHours?.unloading || 0);
  return (activeHours / totalHours) * 100;
}

function analyticsCompanyRows() {
  return state.players.map((player) => {
    const truckRows = analyticsTruckStatsList().filter((row) => row.playerId === player.id);
    return {
      playerId: player.id,
      label: player.label,
      color: player.color,
      isHuman: Boolean(player.isHuman),
      cashBrl: Number(player.cashBrl || 0),
      deltaBrl: Number(playerCashDelta(player) || 0),
      deliveries: Number(player.deliveries || 0),
      tonnesMoved: Number(player.tonnesMoved || 0),
      truckCount: Number(player.truckUnits?.length || 0),
      activeContracts: (player.contracts || []).filter((contract) => !contract.dispatchOnly).length,
      idleTrucks: playerIdleTruckCount(player),
      realizedRevenueBrl: analyticsSum(truckRows, (row) => row.revenueBrl),
      realizedProfitBrl: analyticsSum(truckRows, (row) => row.profitBrl),
      realizedFuelCostBrl: analyticsSum(truckRows, (row) => row.fuelCostBrl),
      utilizationPercent: analyticsAverage(truckRows, (row) => analyticsTruckUtilizationPercent(row)),
    };
  });
}

function analyticsPlayerTruckRows(player) {
  return analyticsTruckStatsList()
    .filter((row) => row.playerId === player?.id)
    .map((row) => ({
      ...row,
      utilizationPercent: analyticsTruckUtilizationPercent(row),
    }))
    .sort((left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
}

function analyticsTruckModelRows() {
  const rows = {};
  analyticsTruckStatsList().forEach((truckStat) => {
    const key = truckStat.modelLabel || "Caminhao";
    if (!rows[key]) {
      rows[key] = {
        label: key,
        truckCount: 0,
        deliveries: 0,
        tonnes: 0,
        profitBrl: 0,
        fuelCostBrl: 0,
      };
    }
    rows[key].truckCount += 1;
    rows[key].deliveries += Number(truckStat.deliveries || 0);
    rows[key].tonnes = roundNumber(Number(rows[key].tonnes || 0) + Number(truckStat.tonnes || 0), 2);
    rows[key].profitBrl = roundNumber(Number(rows[key].profitBrl || 0) + Number(truckStat.profitBrl || 0), 2);
    rows[key].fuelCostBrl = roundNumber(Number(rows[key].fuelCostBrl || 0) + Number(truckStat.fuelCostBrl || 0), 2);
  });
  return Object.values(rows).sort((left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
}

function analyticsGlobalProductRows() {
  const rows = {};
  analyticsFlowStatsList().forEach((flowStat) => {
    const key = String(flowStat.productId || "outros").trim() || "outros";
    if (!rows[key]) {
      rows[key] = {
        productId: key,
        label: flowStat.productName || analyticsProductLabel(key),
        deliveries: 0,
        tonnes: 0,
        profitBrl: 0,
        activeFreights: 0,
      };
    }
    rows[key].deliveries += Number(flowStat.totalDeliveries || 0);
    rows[key].tonnes = roundNumber(Number(rows[key].tonnes || 0) + Number(flowStat.totalTonnes || 0), 2);
    rows[key].profitBrl = roundNumber(Number(rows[key].profitBrl || 0) + Number(flowStat.totalProfitBrl || 0), 2);
    rows[key].activeFreights += Number(flowStat.activeCount || 0);
  });
  return Object.values(rows).sort((left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
}

function analyticsGameplayCityRows() {
  const rows = {};
  const ensureRow = (cityId) => {
    const normalizedCityId = String(cityId || "").trim();
    if (!normalizedCityId || !state.citiesById[normalizedCityId]) {
      return null;
    }
    if (!rows[normalizedCityId]) {
      rows[normalizedCityId] = {
        cityId: normalizedCityId,
        label: cityLabel(normalizedCityId),
        outboundDeliveries: 0,
        inboundDeliveries: 0,
        outboundTonnes: 0,
        inboundTonnes: 0,
        activeOutbound: 0,
        activeInbound: 0,
        activeOutboundTonnes: 0,
        activeInboundTonnes: 0,
        hqLabels: [],
      };
    }
    return rows[normalizedCityId];
  };

  state.players.forEach((player) => {
    const row = ensureRow(player?.hqCityId);
    if (row && !row.hqLabels.includes(player.label)) {
      row.hqLabels.push(player.label);
    }
  });

  analyticsFlowStatsList().forEach((flowStat) => {
    const originRow = ensureRow(flowStat.originId);
    const destinationRow = ensureRow(flowStat.destinationId);
    if (originRow) {
      originRow.outboundDeliveries += Number(flowStat.totalDeliveries || 0);
      originRow.outboundTonnes = roundNumber(Number(originRow.outboundTonnes || 0) + Number(flowStat.totalTonnes || 0), 2);
    }
    if (destinationRow) {
      destinationRow.inboundDeliveries += Number(flowStat.totalDeliveries || 0);
      destinationRow.inboundTonnes = roundNumber(Number(destinationRow.inboundTonnes || 0) + Number(flowStat.totalTonnes || 0), 2);
    }
  });

  state.players.forEach((player) => {
    analyticsPlayerContracts(player).forEach((contract) => {
      const payloadTons = Number(contract.payloadTons || 0);
      const originRow = ensureRow(contract.flow.origin_id);
      const destinationRow = ensureRow(contract.flow.destination_id);
      if (originRow) {
        originRow.activeOutbound += 1;
        originRow.activeOutboundTonnes = roundNumber(Number(originRow.activeOutboundTonnes || 0) + payloadTons, 2);
      }
      if (destinationRow) {
        destinationRow.activeInbound += 1;
        destinationRow.activeInboundTonnes = roundNumber(Number(destinationRow.activeInboundTonnes || 0) + payloadTons, 2);
      }
    });
  });

  return Object.values(rows)
    .filter((row) => row.outboundDeliveries || row.inboundDeliveries || row.activeOutbound || row.activeInbound || row.hqLabels.length)
    .map((row) => ({
      ...row,
      outboundGameTonnes: roundNumber(Number(row.outboundTonnes || 0) + Number(row.activeOutboundTonnes || 0), 2),
      inboundGameTonnes: roundNumber(Number(row.inboundTonnes || 0) + Number(row.activeInboundTonnes || 0), 2),
    }));
}

function analyticsPlayerCityRows(player) {
  const rows = {};
  const ensureRow = (cityId) => {
    const normalizedCityId = String(cityId || "").trim();
    if (!normalizedCityId || !state.citiesById[normalizedCityId]) {
      return null;
    }
    if (!rows[normalizedCityId]) {
      rows[normalizedCityId] = {
        cityId: normalizedCityId,
        label: cityLabel(normalizedCityId),
        currentContracts: 0,
        outboundContracts: 0,
        inboundContracts: 0,
        activeTonnes: 0,
        isHq: normalizedCityId === player?.hqCityId,
      };
    }
    return rows[normalizedCityId];
  };

  ensureRow(player?.hqCityId);
  analyticsPlayerContracts(player).forEach((contract) => {
    const payloadTons = Number(contract.payloadTons || 0);
    const originRow = ensureRow(contract.flow.origin_id);
    const destinationRow = ensureRow(contract.flow.destination_id);
    if (originRow) {
      originRow.currentContracts += 1;
      originRow.outboundContracts += 1;
      originRow.activeTonnes = roundNumber(Number(originRow.activeTonnes || 0) + payloadTons, 2);
    }
    if (destinationRow) {
      destinationRow.currentContracts += 1;
      destinationRow.inboundContracts += 1;
      destinationRow.activeTonnes = roundNumber(Number(destinationRow.activeTonnes || 0) + payloadTons, 2);
    }
  });

  return Object.values(rows).sort((left, right) => Number(right.currentContracts || 0) - Number(left.currentContracts || 0)
    || Number(right.activeTonnes || 0) - Number(left.activeTonnes || 0)
    || String(left.label).localeCompare(String(right.label), "pt-BR"));
}

function analyticsActiveFreightRows() {
  return state.players.flatMap((player) => (player.contracts || [])
    .filter((contract) => !contract.dispatchOnly)
    .map((contract) => ({
      productId: String(contract.flow.product_id || "").trim(),
      productName: contract.flow.product_name || analyticsProductLabel(contract.flow.product_id),
      productEmoji: contract.flow.product_emoji || analyticsProductEmoji(contract.flow.product_id),
      routeLabel: `${cityLabel(contract.flow.origin_id)} -> ${cityLabel(contract.flow.destination_id)}`,
      playerLabel: player.label,
      color: player.color,
      value: Number(contract.profitPerDeliveryBrl || 0),
      tonnes: Number(contract.payloadTons || 0),
      distanceKm: Number(contract.deliveryTrack?.distanceKm || contract.flow.distance_km || 0),
      statusLabel: routeCardStatusLabel(contract),
    })));
}

function analyticsMetricCardMarkup({ label, value, meta = "", tone = "" }) {
  return `
    <article class="game-runtime-analytics-metric${tone ? ` is-${escapeHtml(tone)}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    </article>
  `;
}

function analyticsEmptyMarkup(message) {
  return `<div class="truck-gallery-empty game-runtime-analytics-empty">${escapeHtml(message)}</div>`;
}

function analyticsSectionMarkup(title, subtitle, content) {
  return `
    <section class="game-runtime-analytics-section">
      <div class="game-runtime-analytics-section-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
        </div>
      </div>
      ${content}
    </section>
  `;
}

function analyticsBarLabel(item) {
  if (!item || typeof item !== "object") {
    return "Item";
  }
  if (item.routeLabel && (item.productName || item.productId)) {
    return `${analyticsProductTitle(item.productId, item.productName, item.productEmoji)} · ${item.routeLabel}`;
  }
  if (item.label && item.productId) {
    return analyticsProductTitle(item.productId, item.label, item.productEmoji);
  }
  if (item.label) {
    return String(item.label);
  }
  if (item.truckLabel) {
    return String(item.truckLabel);
  }
  if (item.modelLabel) {
    return String(item.modelLabel);
  }
  if (item.routeLabel) {
    return String(item.routeLabel);
  }
  if (item.productName || item.productId) {
    return analyticsProductTitle(item.productId, item.productName, item.productEmoji);
  }
  return "Item";
}

function analyticsBarChartMarkup(items, {
  valueFormatter = formatInteger,
  colorResolver = (item) => item.color || "#356d63",
  metaResolver = null,
  emptyMessage = "Sem dados suficientes.",
  labelResolver = (item) => analyticsBarLabel(item),
  valueResolver = (item) => item.value,
  compact = false,
} = {}) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) {
    return analyticsEmptyMarkup(emptyMessage);
  }
  const maxValue = Math.max(...rows.map((item) => Math.abs(Number(valueResolver(item) || 0))), 0.0001);
  return `
    <div class="game-runtime-analytics-bar-list">
      ${rows.map((item) => {
        const value = Number(valueResolver(item) || 0);
        const ratio = Math.max(0.06, Math.abs(value) / maxValue);
        const meta = typeof metaResolver === "function" ? metaResolver(item) : "";
        const label = String(labelResolver(item) || analyticsBarLabel(item));
        return `
          <article class="game-runtime-analytics-bar-row">
            <div class="game-runtime-analytics-bar-head${compact ? " is-compact" : ""}">
              <div class="game-runtime-analytics-bar-label">
                <strong>${escapeHtml(label)}</strong>
                ${compact && meta ? `<span class="game-runtime-analytics-inline-meta">${escapeHtml(meta)}</span>` : ""}
              </div>
              <span>${escapeHtml(valueFormatter(value))}</span>
            </div>
            ${!compact && meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            <div class="game-runtime-analytics-bar-track">
              <span style="width:${escapeHtml(String(Math.round(ratio * 100)))}%;--analytics-bar-color:${escapeHtml(colorResolver(item))}"></span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function analyticsStatusBarMarkup(statusHours) {
  const segments = [
    { key: "moving", label: "Em rota", color: "#356d63" },
    { key: "loading", label: "Carga", color: "#b36a2b" },
    { key: "unloading", label: "Descarga", color: "#cc8f43" },
    { key: "idle", label: "Parado", color: "#72796e" },
  ];
  const total = analyticsSum(segments, (segment) => Number(statusHours?.[segment.key] || 0));
  if (!total) {
    return analyticsEmptyMarkup("Sem horas acumuladas ainda.");
  }
  return `
    <div class="game-runtime-analytics-status-wrap">
      <div class="game-runtime-analytics-status-bar">
        ${segments.map((segment) => {
          const value = Number(statusHours?.[segment.key] || 0);
          const width = (value / total) * 100;
          if (width <= 0) {
            return "";
          }
          return `<span style="width:${escapeHtml(String(width))}%;background:${escapeHtml(segment.color)}" title="${escapeHtml(`${segment.label}: ${formatHours(value)}`)}"></span>`;
        }).join("")}
      </div>
      <div class="game-runtime-analytics-status-legend">
        ${segments.map((segment) => `<span><i style="background:${escapeHtml(segment.color)}"></i>${escapeHtml(`${segment.label} ${formatHours(Number(statusHours?.[segment.key] || 0))}`)}</span>`).join("")}
      </div>
    </div>
  `;
}

function analyticsLineChartMarkup(series, { valueFormatter = formatCurrency, emptyMessage = "Historico ainda insuficiente." } = {}) {
  const preparedSeries = (Array.isArray(series) ? series : []).map((entry) => ({
    ...entry,
    values: Array.isArray(entry?.values) ? entry.values.map((value) => Number(value || 0)) : [],
    labels: Array.isArray(entry?.labels) ? entry.labels : [],
  })).filter((entry) => entry.values.length);
  const pointCount = Math.max(0, ...preparedSeries.map((entry) => entry.values.length));
  if (pointCount < 2) {
    return analyticsEmptyMarkup(emptyMessage);
  }
  const allValues = preparedSeries.flatMap((entry) => entry.values);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues, 1);
  const range = Math.max(maxValue - minValue, 1);
  const width = 720;
  const height = 220;
  const padding = { top: 18, right: 16, bottom: 30, left: 20 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xStep = pointCount > 1 ? innerWidth / (pointCount - 1) : innerWidth;
  const yPosition = (value) => padding.top + ((maxValue - Number(value || 0)) / range) * innerHeight;
  const xPosition = (index) => padding.left + (xStep * index);
  const labels = preparedSeries.find((entry) => entry.labels.length)?.labels || [];
  const footerLabels = [labels[0], labels[Math.floor(labels.length / 2)], labels[labels.length - 1]].filter(Boolean);

  return `
    <div class="game-runtime-analytics-chart-shell">
      <svg class="game-runtime-analytics-line-chart" viewBox="0 0 ${escapeHtml(String(width))} ${escapeHtml(String(height))}" role="img" aria-label="Grafico de linha do runtime">
        ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + (innerHeight * ratio);
          return `<line x1="${escapeHtml(String(padding.left))}" y1="${escapeHtml(String(y))}" x2="${escapeHtml(String(width - padding.right))}" y2="${escapeHtml(String(y))}"></line>`;
        }).join("")}
        ${minValue < 0 && maxValue > 0 ? `<line class="is-zero" x1="${escapeHtml(String(padding.left))}" y1="${escapeHtml(String(yPosition(0)))}" x2="${escapeHtml(String(width - padding.right))}" y2="${escapeHtml(String(yPosition(0)))}"></line>` : ""}
        ${preparedSeries.map((entry) => {
          const points = entry.values.map((value, index) => `${xPosition(index)},${yPosition(value)}`).join(" ");
          const latestValue = entry.values[entry.values.length - 1];
          return `
            <polyline style="--analytics-series-color:${escapeHtml(entry.color || "#356d63")}" points="${escapeHtml(points)}"></polyline>
            <circle cx="${escapeHtml(String(xPosition(entry.values.length - 1)))}" cy="${escapeHtml(String(yPosition(latestValue)))}" r="4" style="--analytics-series-color:${escapeHtml(entry.color || "#356d63")}"></circle>
          `;
        }).join("")}
      </svg>
      <div class="game-runtime-analytics-chart-legend">
        ${preparedSeries.map((entry) => `<span><i style="background:${escapeHtml(entry.color || "#356d63")}"></i>${escapeHtml(`${entry.label} · ${valueFormatter(entry.values[entry.values.length - 1])}`)}</span>`).join("")}
      </div>
      ${footerLabels.length ? `<div class="game-runtime-analytics-chart-footer">${footerLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

function analyticsOverviewContentMarkup() {
  const companyRows = analyticsCompanyRows().sort((left, right) => Number(right.cashBrl || 0) - Number(left.cashBrl || 0));
  const flowRows = analyticsFlowStatsList().filter((row) => Number(row.totalDeliveries || 0) > 0 || Number(row.activeCount || 0) > 0);
  const cashSeries = companyRows.map((row) => {
    const history = analyticsPlayerHistory(row.playerId);
    return {
      label: row.label,
      color: row.color,
      values: history.map((entry) => Number(entry.point?.cashBrl || 0)),
      labels: history.map((entry) => entry.label),
    };
  });
  const metricsMarkup = [
    analyticsMetricCardMarkup({ label: "Empresas", value: formatInteger(companyRows.length), meta: `${formatInteger(state.players.filter((player) => !player.isHuman).length)} robos + 1 jogador` }),
    analyticsMetricCardMarkup({ label: "Fretes ativos", value: formatInteger(analyticsActiveFreightRows().length), meta: `${formatInteger(analyticsSum(flowRows, (row) => row.totalDeliveries))} concluidos` }),
    analyticsMetricCardMarkup({ label: "Frota total", value: formatInteger(analyticsSum(companyRows, (row) => row.truckCount)), meta: `${formatInteger(analyticsSum(companyRows, (row) => row.idleTrucks))} parada` }),
    analyticsMetricCardMarkup({ label: "Toneladas", value: formatTonnes(analyticsSum(companyRows, (row) => row.tonnesMoved)), meta: "Volume acumulado" }),
  ].join("");
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">${metricsMarkup}</div>
      ${analyticsSectionMarkup("Caixa das empresas", "Evolucao do caixa desde o inicio da partida", analyticsLineChartMarkup(cashSeries, { valueFormatter: formatCurrency }))}
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Ranking por caixa", "Quem esta mais forte agora", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatCurrency,
          colorResolver: (row) => row.color,
          valueResolver: (row) => row.cashBrl,
          metaResolver: (row) => `${formatInteger(row.deliveries)} entregas · ${formatTonnes(row.tonnesMoved)}`,
        }))}
        ${analyticsSectionMarkup("Ranking por entregas", "Execucao operacional", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatInteger,
          colorResolver: (row) => row.color,
          valueResolver: (row) => row.deliveries,
          metaResolver: (row) => `${formatCurrency(row.deltaBrl)} de saldo`,
        }))}
      </div>
    </div>
  `;
}

function analyticsPlayerContentMarkup() {
  const player = analyticsSelectedPlayer();
  if (!player) {
    return analyticsEmptyMarkup("Ainda nao ha empresa carregada.");
  }
  state.analytics.selectedPlayerId = player.id;
  const playerRow = analyticsCompanyRows().find((row) => row.playerId === player.id) || null;
  const playerHistory = analyticsPlayerHistory(player.id);
  const freightRows = analyticsTopEntries(analyticsPlayerFreightRows(player), 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const truckRows = analyticsTopEntries(analyticsPlayerTruckRows(player), 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const productRows = analyticsTopEntries(analyticsPlayerProductRows(player), 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const cityRows = analyticsTopEntries(analyticsPlayerCityRows(player), 8, (left, right) => Number(right.currentContracts || 0) - Number(left.currentContracts || 0) || Number(right.activeTonnes || 0) - Number(left.activeTonnes || 0));
  const series = [{
    label: player.label,
    color: player.color,
    values: playerHistory.map((entry) => Number(entry.point?.cashBrl || 0)),
    labels: playerHistory.map((entry) => entry.label),
  }];

  return `
    <div class="game-runtime-analytics-stack">
      ${analyticsPlayerSelectorMarkup(player.id)}
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Caixa", value: formatCurrency(player.cashBrl), meta: cityLabel(player.hqCityId) })}
        ${analyticsMetricCardMarkup({ label: "Saldo", value: formatCurrency(playerCashDelta(player)), meta: "Contra o capital inicial", tone: playerCashDelta(player) >= 0 ? "positive" : "negative" })}
        ${analyticsMetricCardMarkup({ label: "Fretes ativos", value: formatInteger(playerRow?.activeContracts || 0), meta: `${formatInteger(playerIdleTruckCount(player))} caminhao(es) parado(s)` })}
        ${analyticsMetricCardMarkup({ label: "Toneladas", value: formatTonnes(player.tonnesMoved), meta: `${formatInteger(player.deliveries)} entregas` })}
      </div>
      ${analyticsSectionMarkup("Financeiro da empresa", `${player.label} ao longo da partida`, analyticsLineChartMarkup(series, { valueFormatter: formatCurrency }))}
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Fretes da empresa", `${player.label} · contratos atuais`, analyticsBarChartMarkup(freightRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${row.statusLabel} · ${formatTonnes(row.payloadTons)} · ${formatDistanceKm(row.distanceKm)}`,
        }))}
        ${analyticsSectionMarkup("Caminhoes da empresa", `${player.label} · resultado por unidade`, truckRows.length
          ? `<div class="game-runtime-analytics-bar-list">${truckRows.map((row) => `
              <article class="game-runtime-analytics-bar-row">
                <div class="game-runtime-analytics-bar-head">
                  <strong>${escapeHtml(row.truckLabel)}</strong>
                  <span>${escapeHtml(formatCurrency(row.profitBrl))}</span>
                </div>
                <small>${escapeHtml(`${formatInteger(row.deliveries)} entregas · ${formatPercent(row.utilizationPercent)} de uso · diesel ${formatCurrency(row.fuelCostBrl)}`)}</small>
                ${analyticsStatusBarMarkup(row.statusHours)}
              </article>
            `).join("")}</div>`
          : analyticsEmptyMarkup("Nenhum caminhao com historico ainda."))}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Produtos da empresa", `${player.label} · carteira operacional atual`, analyticsBarChartMarkup(productRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${formatInteger(row.contracts)} contrato(s) · ${formatTonnes(row.tonnes)}`,
        }))}
        ${analyticsSectionMarkup("Cidades da empresa", `${player.label} · presenca operacional atual`, analyticsBarChartMarkup(cityRows, {
          valueFormatter: formatInteger,
          valueResolver: (row) => row.currentContracts,
          metaResolver: (row) => `${row.isHq ? "Sede" : "Operacao"} · ${formatTonnes(row.activeTonnes)} · ${formatInteger(row.outboundContracts)} origem / ${formatInteger(row.inboundContracts)} destino`,
        }))}
      </div>
    </div>
  `;
}

function analyticsCompetitionContentMarkup() {
  const companyRows = analyticsCompanyRows().sort((left, right) => Number(right.cashBrl || 0) - Number(left.cashBrl || 0));
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Caixa medio", value: formatCurrency(analyticsAverage(companyRows, (row) => row.cashBrl)), meta: "Media entre empresas" })}
        ${analyticsMetricCardMarkup({ label: "Saldo medio", value: formatCurrency(analyticsAverage(companyRows, (row) => row.deltaBrl)), meta: "Variacao media" })}
        ${analyticsMetricCardMarkup({ label: "Entregas medias", value: formatInteger(analyticsAverage(companyRows, (row) => row.deliveries)), meta: "Por empresa" })}
        ${analyticsMetricCardMarkup({ label: "Uso medio da frota", value: formatPercent(analyticsAverage(companyRows, (row) => row.utilizationPercent)), meta: "Caminhoes em atividade" })}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Empresas por caixa", "Comparacao direta", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.cashBrl,
          colorResolver: (row) => row.color,
          metaResolver: (row) => `${formatCurrency(row.deltaBrl)} de saldo`,
        }))}
        ${analyticsSectionMarkup("Empresas por toneladas", "Volume movimentado", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatTonnes,
          valueResolver: (row) => row.tonnesMoved,
          colorResolver: (row) => row.color,
          metaResolver: (row) => `${formatInteger(row.deliveries)} entregas`,
        }))}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Empresas por frota", "Tamanho e ociosidade", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatInteger,
          valueResolver: (row) => row.truckCount,
          colorResolver: (row) => row.color,
          metaResolver: (row) => `${formatInteger(row.idleTrucks)} parado(s) · ${formatPercent(row.utilizationPercent)} de uso`,
        }))}
        ${analyticsSectionMarkup("Empresas por lucro realizado", "Resultado acumulado nas entregas concluidas", analyticsBarChartMarkup(companyRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.realizedProfitBrl,
          colorResolver: (row) => row.color,
          metaResolver: (row) => `diesel ${formatCurrency(row.realizedFuelCostBrl)}`,
        }))}
      </div>
    </div>
  `;
}

function analyticsFreightsContentMarkup() {
  const flowRows = analyticsFlowStatsList().filter((row) => Number(row.totalDeliveries || 0) > 0 || Number(row.activeCount || 0) > 0);
  const profitRows = analyticsTopEntries(flowRows, 8, (left, right) => Number(right.totalProfitBrl || 0) - Number(left.totalProfitBrl || 0));
  const volumeRows = analyticsTopEntries(flowRows, 8, (left, right) => Number(right.totalTonnes || 0) - Number(left.totalTonnes || 0));
  const activeRows = analyticsTopEntries(analyticsActiveFreightRows(), 8, (left, right) => Number(right.value || 0) - Number(left.value || 0));
  const productRows = analyticsTopEntries(analyticsGlobalProductRows(), 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const totalDeliveries = analyticsSum(flowRows, (row) => row.totalDeliveries);
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Fretes rastreados", value: formatInteger(flowRows.length), meta: `${formatInteger(analyticsActiveFreightRows().length)} ativos agora` })}
        ${analyticsMetricCardMarkup({ label: "Entregas de frete", value: formatInteger(totalDeliveries), meta: "Concluidas" })}
        ${analyticsMetricCardMarkup({ label: "Lucro medio", value: formatCurrency(totalDeliveries ? analyticsSum(flowRows, (row) => row.totalProfitBrl) / totalDeliveries : 0), meta: "Por entrega concluida" })}
        ${analyticsMetricCardMarkup({ label: "Tonelagem", value: formatTonnes(analyticsSum(flowRows, (row) => row.totalTonnes)), meta: "Movida pelos fretes" })}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Fretes mais lucrativos", "Resultado acumulado por rota", analyticsBarChartMarkup(profitRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.totalProfitBrl,
          metaResolver: (row) => `${formatInteger(row.totalDeliveries)} entrega(s) · ${formatTonnes(row.totalTonnes)}`,
          compact: true,
        }))}
        ${analyticsSectionMarkup("Fretes por volume", "Rotas com maior carga acumulada", analyticsBarChartMarkup(volumeRows, {
          valueFormatter: formatTonnes,
          valueResolver: (row) => row.totalTonnes,
          metaResolver: (row) => `${formatCurrency(row.totalProfitBrl)}`,
          compact: true,
        }))}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Fretes ativos agora", "Carteira em execucao", analyticsBarChartMarkup(activeRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.value,
          colorResolver: (row) => row.color,
          metaResolver: (row) => `${row.playerLabel} · ${row.statusLabel} · ${formatTonnes(row.tonnes)}`,
          compact: true,
        }))}
        ${analyticsSectionMarkup("Produtos na carteira", "Leitura da carteira por produto", analyticsBarChartMarkup(productRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${formatInteger(row.deliveries)} entrega(s) · ${formatTonnes(row.tonnes)} · ${formatInteger(row.activeFreights)} ativo(s)`,
          compact: true,
        }))}
      </div>
    </div>
  `;
}

function analyticsTrucksContentMarkup() {
  const truckRows = analyticsTruckStatsList().map((row) => ({ ...row, utilizationPercent: analyticsTruckUtilizationPercent(row) }));
  const profitRows = analyticsTopEntries(truckRows, 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const deliveryRows = analyticsTopEntries(truckRows, 8, (left, right) => Number(right.deliveries || 0) - Number(left.deliveries || 0));
  const modelRows = analyticsTopEntries(analyticsTruckModelRows(), 8, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  const totalTruckCount = truckRows.length;
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Caminhoes rastreados", value: formatInteger(totalTruckCount), meta: `${formatInteger(state.players.reduce((total, player) => total + playerIdleTruckCount(player), 0))} parados agora` })}
        ${analyticsMetricCardMarkup({ label: "Lucro medio", value: formatCurrency(totalTruckCount ? analyticsAverage(truckRows, (row) => row.profitBrl) : 0), meta: "Por unidade" })}
        ${analyticsMetricCardMarkup({ label: "Diesel acumulado", value: formatCurrency(analyticsSum(truckRows, (row) => row.fuelCostBrl)), meta: "Compra registrada" })}
        ${analyticsMetricCardMarkup({ label: "Uso medio", value: formatPercent(analyticsAverage(truckRows, (row) => row.utilizationPercent)), meta: "Tempo operacional" })}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Caminhoes por lucro", "Quem esta rendendo mais", analyticsBarChartMarkup(profitRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${row.playerLabel} · ${formatInteger(row.deliveries)} entrega(s) · ${formatPercent(row.utilizationPercent)} de uso`,
          compact: true,
        }))}
        ${analyticsSectionMarkup("Caminhoes por entregas", "Produtividade da frota", analyticsBarChartMarkup(deliveryRows, {
          valueFormatter: formatInteger,
          valueResolver: (row) => row.deliveries,
          metaResolver: (row) => `${row.playerLabel} · ${formatTonnes(row.tonnes)} · ${formatCurrency(row.profitBrl)}`,
          compact: true,
        }))}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Modelos de caminhao", "Qual modelo esta pagando melhor", analyticsBarChartMarkup(modelRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${formatInteger(row.truckCount)} unid. · ${formatInteger(row.deliveries)} entrega(s) · diesel ${formatCurrency(row.fuelCostBrl)}`,
          compact: true,
        }))}
        ${analyticsSectionMarkup("Uso da frota", "Tempo em rota, carga, descarga e parado", truckRows.length
          ? `<div class="game-runtime-analytics-bar-list">${analyticsTopEntries(truckRows, 6, (left, right) => Number(right.utilizationPercent || 0) - Number(left.utilizationPercent || 0)).map((row) => `
              <article class="game-runtime-analytics-bar-row">
                <div class="game-runtime-analytics-bar-head is-compact">
                  <div class="game-runtime-analytics-bar-label">
                    <strong>${escapeHtml(row.truckLabel)}</strong>
                    <span class="game-runtime-analytics-inline-meta">${escapeHtml(`${row.playerLabel} · ${formatDistanceKm(row.estimatedDistanceKm)} · diesel ${formatCurrency(row.fuelCostBrl)}`)}</span>
                  </div>
                  <span>${escapeHtml(formatPercent(row.utilizationPercent))}</span>
                </div>
                ${analyticsStatusBarMarkup(row.statusHours)}
              </article>
            `).join("")}</div>`
          : analyticsEmptyMarkup("A frota ainda nao acumulou tempo suficiente."))}
      </div>
    </div>
  `;
}

function analyticsProductsContentMarkup() {
  const productRows = analyticsTopEntries(analyticsGlobalProductRows(), 10, (left, right) => Number(right.profitBrl || 0) - Number(left.profitBrl || 0));
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Produtos ativos", value: formatInteger(productRows.filter((row) => row.activeFreights > 0).length), meta: `${formatInteger(productRows.length)} monitorados` })}
        ${analyticsMetricCardMarkup({ label: "Lucro total", value: formatCurrency(analyticsSum(productRows, (row) => row.profitBrl)), meta: "Entregas concluidas" })}
        ${analyticsMetricCardMarkup({ label: "Volume total", value: formatTonnes(analyticsSum(productRows, (row) => row.tonnes)), meta: "Carga movimentada" })}
        ${analyticsMetricCardMarkup({ label: "Fretes ativos", value: formatInteger(analyticsSum(productRows, (row) => row.activeFreights)), meta: "Distribuidos por produto" })}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Produtos por lucro", "Melhor retorno acumulado", analyticsBarChartMarkup(productRows, {
          valueFormatter: formatCurrency,
          valueResolver: (row) => row.profitBrl,
          metaResolver: (row) => `${formatInteger(row.deliveries)} entrega(s) · ${formatTonnes(row.tonnes)}`,
          compact: true,
        }))}
        ${analyticsSectionMarkup("Produtos por volume", "Tonelagem movimentada", analyticsBarChartMarkup(productRows.slice().sort((left, right) => Number(right.tonnes || 0) - Number(left.tonnes || 0)), {
          valueFormatter: formatTonnes,
          valueResolver: (row) => row.tonnes,
          metaResolver: (row) => `${formatCurrency(row.profitBrl)} · ${formatInteger(row.activeFreights)} ativo(s)`,
          compact: true,
        }))}
      </div>
    </div>
  `;
}

function analyticsCitiesContentMarkup() {
  const player = analyticsCurrentPlayer();
  const gameplayCityRows = analyticsGameplayCityRows();
  const playerCityRows = player ? analyticsTopEntries(analyticsPlayerCityRows(player), 8, (left, right) => Number(right.currentContracts || 0) - Number(left.currentContracts || 0) || Number(right.activeTonnes || 0) - Number(left.activeTonnes || 0)) : [];
  const outboundRows = analyticsTopEntries(gameplayCityRows, 8, (left, right) => Number(right.outboundGameTonnes || 0) - Number(left.outboundGameTonnes || 0) || Number(right.outboundDeliveries || 0) - Number(left.outboundDeliveries || 0));
  const inboundRows = analyticsTopEntries(gameplayCityRows, 8, (left, right) => Number(right.inboundGameTonnes || 0) - Number(left.inboundGameTonnes || 0) || Number(right.inboundDeliveries || 0) - Number(left.inboundDeliveries || 0));
  return `
    <div class="game-runtime-analytics-stack">
      <div class="game-runtime-analytics-metric-grid">
        ${analyticsMetricCardMarkup({ label: "Cidades ativas", value: formatInteger(gameplayCityRows.length), meta: "Operacao registrada na partida" })}
        ${analyticsMetricCardMarkup({ label: "Saidas", value: formatInteger(analyticsSum(gameplayCityRows, (row) => row.outboundDeliveries + row.activeOutbound)), meta: "Entregas + fretes ativos" })}
        ${analyticsMetricCardMarkup({ label: "Entradas", value: formatInteger(analyticsSum(gameplayCityRows, (row) => row.inboundDeliveries + row.activeInbound)), meta: "Entregas + fretes ativos" })}
        ${analyticsMetricCardMarkup({ label: "Sede do jogador", value: player ? cityLabel(player.hqCityId) : "-", meta: "Base principal" })}
      </div>
      <div class="game-runtime-analytics-two-column">
        ${analyticsSectionMarkup("Cidades por saida", "Origens mais usadas na partida", analyticsBarChartMarkup(outboundRows, {
          valueFormatter: formatTonnes,
          valueResolver: (row) => row.outboundGameTonnes,
          metaResolver: (row) => `${formatInteger(row.outboundDeliveries)} entrega(s) · ${formatInteger(row.activeOutbound)} ativa(s)`,
        }))}
        ${analyticsSectionMarkup("Cidades por chegada", "Destinos mais usados na partida", analyticsBarChartMarkup(inboundRows, {
          valueFormatter: formatTonnes,
          valueResolver: (row) => row.inboundGameTonnes,
          metaResolver: (row) => `${formatInteger(row.inboundDeliveries)} entrega(s) · ${formatInteger(row.activeInbound)} ativa(s)`,
        }))}
      </div>
      ${analyticsSectionMarkup("Cidades do jogador", "Presenca operacional da empresa principal", analyticsBarChartMarkup(playerCityRows, {
        valueFormatter: formatInteger,
        valueResolver: (row) => row.currentContracts,
        metaResolver: (row) => `${row.isHq ? "Sede" : "Operacao"} · ${formatTonnes(row.activeTonnes)} · ${formatInteger(row.outboundContracts)} origem / ${formatInteger(row.inboundContracts)} destino`,
      }))}
    </div>
  `;
}

function analyticsTabContentMarkup(tabId) {
  if (tabId === "player") {
    return analyticsPlayerContentMarkup();
  }
  if (tabId === "competition") {
    return analyticsCompetitionContentMarkup();
  }
  if (tabId === "freights") {
    return analyticsFreightsContentMarkup();
  }
  if (tabId === "trucks") {
    return analyticsTrucksContentMarkup();
  }
  if (tabId === "products") {
    return analyticsProductsContentMarkup();
  }
  if (tabId === "cities") {
    return analyticsCitiesContentMarkup();
  }
  return analyticsOverviewContentMarkup();
}

function renderAnalyticsModal() {
  if (!refs.analyticsTabs || !refs.analyticsContent) {
    return;
  }
  const activeTabId = ANALYTICS_TABS.some((tab) => tab.id === state.analytics.activeTabId)
    ? state.analytics.activeTabId
    : ANALYTICS_TABS[0].id;
  state.analytics.activeTabId = activeTabId;
  if (refs.analyticsButton) {
    refs.analyticsButton.classList.toggle("is-active", state.setup.activeModal === "analytics");
  }
  refs.analyticsTabs.innerHTML = ANALYTICS_TABS.map((tab) => `
    <button class="segmented-button${tab.id === activeTabId ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab.id === activeTabId ? "true" : "false"}" data-runtime-analytics-tab="${escapeHtml(tab.id)}">
      <span>${escapeHtml(tab.label)}</span>
    </button>
  `).join("");
  if (state.setup.activeModal !== "analytics") {
    return;
  }
  refs.analyticsContent.innerHTML = analyticsTabContentMarkup(activeTabId);
  refs.analyticsContent.querySelectorAll("[data-wheel-rail]").forEach((element) => bindWheelRail(element));
}

function hexColorRgb(rawColor) {
  const source = String(rawColor || "").trim();
  if (!source) {
    return null;
  }
  const normalized = source.startsWith("#") ? source.slice(1) : source;
  if (![3, 6].includes(normalized.length) || /[^0-9a-f]/i.test(normalized)) {
    return null;
  }
  const expanded = normalized.length === 3
    ? normalized.split("").map((fragment) => `${fragment}${fragment}`).join("")
    : normalized;
  return {
    red: parseInt(expanded.slice(0, 2), 16),
    green: parseInt(expanded.slice(2, 4), 16),
    blue: parseInt(expanded.slice(4, 6), 16),
  };
}

function contrastTextColor(rawColor) {
  const rgb = hexColorRgb(rawColor);
  if (!rgb) {
    return "#fffdf7";
  }
  const luminance = ((0.2126 * rgb.red) + (0.7152 * rgb.green) + (0.0722 * rgb.blue)) / 255;
  return luminance >= 0.64 ? "#1c241f" : "#fffdf7";
}

function trimLogSourcePrefix(message, sourceLabel) {
  const text = String(message || "").trim();
  const prefix = `${String(sourceLabel || "").trim()} `;
  if (!prefix.trim()) {
    return text;
  }
  return text.startsWith(prefix) ? text.slice(prefix.length).trimStart() : text;
}

function logEntryPresentation(entry) {
  const player = state.playersById[entry?.playerId || ""] || null;
  const sourceLabel = player?.label || (entry?.playerId === "system" ? "Sistema" : "Operacao");
  const sourceColor = player?.color || "#72796e";
  return {
    sourceLabel,
    sourceColor,
    sourceInkColor: contrastTextColor(sourceColor),
    message: trimLogSourcePrefix(entry?.message || "", player?.label || ""),
  };
}

function renderStatus() {
  if (!refs.status) {
    return;
  }
  if (openingWizardEnabled() && !state.players.length) {
    refs.status.innerHTML = `
      <span class="game-runtime-status-pill">${escapeHtml(state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa ativo")}</span>
      <span class="game-runtime-status-pill">${escapeHtml(difficultyLabel(state.setup.selectedDifficulty))}</span>
      <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.setup.robotCount)} ${robotsOnlyEnabled() ? "robos" : "adversarios"}`)}</span>
      ${robotAiSetupEnabled() ? `<span class="game-runtime-status-pill">${escapeHtml(`${robotAiModeLabel()} · ${robotAiTableConfig()?.label || "Mesa"}`)}</span>` : ""}
      <span class="game-runtime-status-pill ${robotsOnlyEnabled() ? "is-ready" : "is-draft"}">${escapeHtml(robotsOnlyEnabled() ? "Modo robo" : `Abertura v${RUNTIME_CONFIG.version || "1.1"}`)}</span>
    `;
    return;
  }
  refs.status.innerHTML = `
    <span class="game-runtime-status-pill">${escapeHtml(state.bootstrap?.active_map?.name || state.runtime?.metadata?.map_name || "Mapa ativo")}</span>
    <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.players.length)} ${robotsOnlyEnabled() ? "robos" : "jogadores"}`)}</span>
    <span class="game-runtime-status-pill">${escapeHtml(`${formatInteger(state.runtime?.metadata?.route_edge_count || state.edges.length)} rotas`)}</span>
    ${robotAiSetupEnabled() ? `<span class="game-runtime-status-pill">${escapeHtml(`${robotAiModeLabel()} · ${robotAiTableConfig()?.label || "Mesa"}`)}</span>` : ""}
    <span class="game-runtime-status-pill ${state.humanPrepared ? "is-ready" : "is-draft"}">${escapeHtml(robotsOnlyEnabled() ? "Operacao automatica" : (state.humanPrepared ? "Preparacao salva" : "Abertura automatica"))}</span>
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
  const distanceText = contract ? formatDistanceKm(contract.flow.distance_km) : "- km";
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
      </div>
      <div class="game-runtime-route-card-meta">
        <div class="game-runtime-route-card-meta-main">
          <span class="game-runtime-route-status-tag ${escapeHtml(routeCardStatusTone(contract))}">${escapeHtml(routeCardStatusLabel(contract))}</span>
          <span>${escapeHtml(weightText)}</span>
          <span>${escapeHtml(etaText)}</span>
          <span>${escapeHtml(distanceText)}</span>
        </div>
        <strong class="game-runtime-route-card-value">${escapeHtml(valueText)}</strong>
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

function playerOperationSubtitle(player) {
  if (!player) {
    return "";
  }
  return `${player.isHuman ? "🧑" : "🤖"} ${cityLabel(player.hqCityId)}`;
}

function playerDrawerMetricsMarkup(player) {
  return `
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
  `;
}

function playerDrawerRoutesMarkup(player, { interactiveIdle = false } = {}) {
  return `
    <div class="game-runtime-inline-stack">
      <div class="game-runtime-panel-title">
        <strong>Rotas</strong>
        <span>${escapeHtml(`${formatInteger(playerActiveContractCount(player))} ativos · ${formatInteger(playerIdleTruckCount(player))} parados`)}</span>
      </div>
      ${playerRouteCardsMarkup(player, { interactiveIdle })}
    </div>
  `;
}

function renderHumanHud() {
  if (!refs.humanHud) {
    return;
  }
  if (robotsOnlyEnabled()) {
    refs.humanHud.hidden = true;
    refs.humanHud.innerHTML = "";
    return;
  }
  refs.humanHud.hidden = false;
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
  const drawerOpen = player.id === state.activeDrawerPlayerId;
  const playerFocused = player.id === state.focusedPlayerId;

  refs.humanHud.innerHTML = `
    <div class="game-runtime-panel-head">
      <button class="game-runtime-human-toggle${drawerOpen ? " is-active" : ""}${playerFocused ? " is-focused" : ""}" type="button" data-player-id="${escapeHtml(player.id)}" style="--player-color:${escapeHtml(player.color)}" aria-controls="game-runtime-drawer" aria-expanded="${drawerOpen ? "true" : "false"}">
        <div class="game-runtime-panel-title">
          <strong>${escapeHtml(player.label)}</strong>
          <span>${escapeHtml(playerOperationSubtitle(player))}</span>
        </div>
        <span class="material-symbols-outlined" aria-hidden="true">${drawerOpen ? "chevron_left" : "chevron_right"}</span>
      </button>
      <div class="game-runtime-drawer-actions">
        ${runtimeTruckMarketEnabled() ? `
          <button class="ghost-button game-runtime-mini-action" type="button" data-runtime-open-market="${escapeHtml(player.id)}">
            <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
            <span>Novo</span>
          </button>
        ` : ""}
        <button class="ghost-button game-runtime-mini-action" type="button" data-focus-player-id="${escapeHtml(player.id)}" aria-label="Focar sede" title="Focar sede">
          <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
        </button>
      </div>
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

    ${playerDrawerMetricsMarkup(player)}

    ${playerDrawerRoutesMarkup(player, { interactiveIdle: true })}

    <div class="game-runtime-panel-footer">
      ${dispatchPicking ? `
        <button class="ghost-button game-runtime-mini-link" type="button" data-runtime-cancel-dispatch-pick="true">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          <span>Cancelar escolha</span>
        </button>
      ` : ""}
    </div>
  `;
}

function renderLogPanel() {
  if (!refs.logPanel) {
    return;
  }
  const logMarkup = state.logs.length
    ? state.logs.slice(0, LOG_HISTORY_LIMIT).map((entry) => {
      const presentation = logEntryPresentation(entry);
      return `
        <article class="game-runtime-log-line is-${escapeHtml(entry.tone || "neutral")}">
          <div class="game-runtime-log-line-head">
            <strong>${escapeHtml(entry.timeLabel)}</strong>
            <span class="game-runtime-log-source-tag" style="--log-player-color:${escapeHtml(presentation.sourceColor)};--log-player-ink:${escapeHtml(presentation.sourceInkColor)}">${escapeHtml(presentation.sourceLabel)}</span>
          </div>
          <div class="game-runtime-log-message">${escapeHtml(presentation.message)}</div>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Sem eventos recentes.</div>`;

  refs.logPanel.innerHTML = `
    <div class="game-runtime-panel-head">
      <div class="game-runtime-panel-title">
        <strong>Log</strong>
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
  if (!player) {
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
        <span>${escapeHtml(playerOperationSubtitle(player))}</span>
      </div>
      <div class="game-runtime-drawer-actions">
        ${player.isHuman && runtimeTruckMarketEnabled() ? `
          <button class="ghost-button game-runtime-mini-action" type="button" data-runtime-open-market="${escapeHtml(player.id)}">
            <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>
            <span>Novo</span>
          </button>
        ` : ""}
        <button class="ghost-button game-runtime-mini-action" type="button" data-focus-player-id="${escapeHtml(player.id)}" aria-label="Focar sede" title="Focar sede">
          <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
        </button>
        <button class="editor-header-action game-runtime-mini-action" type="button" data-close-drawer="true">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          <span>Fechar</span>
        </button>
      </div>
    </div>

    ${playerDrawerMetricsMarkup(player)}

    ${playerDrawerRoutesMarkup(player)}
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
  renderAnalyticsModal();
  renderTruckPopup();
}

function renderDynamicUi() {
  renderClock();
  renderHumanHud();
  renderLogPanel();
  renderPlayerBar();
  renderDrawer();
  renderAnalyticsModal();
  renderTruckPopup();
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

function focusPlayerHeadquartersOnMap(player) {
  ensureMap();
  if (!state.map || !player) {
    return;
  }
  const hqCity = state.citiesById[player.hqCityId] || null;
  if (!hqCity) {
    focusPlayerOnMap(player);
    return;
  }
  state.map.setView([hqCity.latitude, hqCity.longitude], Math.max(state.map.getZoom(), 6), {
    animate: true,
  });
}

function setFocusedPlayer(playerId, { closeDrawer = false, openDrawer = true, mapTarget = "activity" } = {}) {
  const player = state.playersById[playerId] || null;
  if (!player) {
    return;
  }
  state.focusedPlayerId = player.id;
  if (closeDrawer) {
    state.activeDrawerPlayerId = "";
  } else if (openDrawer) {
    state.activeDrawerPlayerId = player.id;
  }
  renderPlayerBar();
  renderDrawer();
  renderCityMarkers();
  renderHighlightedRoutes();
  if (mapTarget === "hq") {
    focusPlayerHeadquartersOnMap(player);
    return;
  }
  focusPlayerOnMap(player);
}

function handleClicks(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  if (truckPopupVisible() && !target.closest(".game-runtime-vehicle-icon")) {
    hideTruckPopup();
  }

  const proceedOpeningSetupButton = target.closest("[data-runtime-proceed-opening-setup]");
  if (proceedOpeningSetupButton) {
    proceedOpeningSetupModal();
    return;
  }

  const robotAiOpenDetailedButton = target.closest("[data-runtime-robot-ai-open-detailed]");
  if (robotAiOpenDetailedButton) {
    ensureRobotAiSetupState();
    if (state.setup.robotAi) {
      state.setup.robotAi.editorMode = "detailed";
    }
    openSetupModal("robot-ai");
    return;
  }

  const runtimeOpenModalButton = target.closest("[data-runtime-open-modal]");
  if (runtimeOpenModalButton) {
    openSetupModal(runtimeOpenModalButton.getAttribute("data-runtime-open-modal") || "");
    return;
  }

  const runtimeCloseButton = target.closest("[data-runtime-close-modal]");
  if (runtimeCloseButton) {
    closeSetupModal();
    return;
  }

  const analyticsPlayerButton = target.closest("[data-runtime-analytics-player]");
  if (analyticsPlayerButton) {
    state.analytics.selectedPlayerId = analyticsPlayerButton.getAttribute("data-runtime-analytics-player") || analyticsDefaultPlayerId();
    renderAnalyticsModal();
    return;
  }

  const analyticsTabButton = target.closest("[data-runtime-analytics-tab]");
  if (analyticsTabButton) {
    state.analytics.activeTabId = analyticsTabButton.getAttribute("data-runtime-analytics-tab") || ANALYTICS_TABS[0].id;
    renderAnalyticsModal();
    return;
  }

  const robotAiModeButton = target.closest("[data-runtime-robot-ai-editor-mode]");
  if (robotAiModeButton) {
    setRobotAiEditorMode(robotAiModeButton.getAttribute("data-runtime-robot-ai-editor-mode") || "basic");
    return;
  }

  const robotAiBasicModeButton = target.closest("[data-runtime-robot-ai-basic-mode]");
  if (robotAiBasicModeButton) {
    setRobotAiBasicMode(robotAiBasicModeButton.getAttribute("data-runtime-robot-ai-basic-mode") || "balanced");
    return;
  }

  const robotAiTabButton = target.closest("[data-runtime-robot-ai-slot]");
  if (robotAiTabButton) {
    robotAiSetSelectedSlot(Number(robotAiTabButton.getAttribute("data-runtime-robot-ai-slot") || 0));
    renderRobotAiModal();
    return;
  }

  const robotAiPresetButton = target.closest("[data-runtime-robot-ai-archetype]");
  if (robotAiPresetButton) {
    applyRobotAiArchetypeToSelectedSlot(robotAiPresetButton.getAttribute("data-runtime-robot-ai-archetype") || "balanced_operator");
    return;
  }

  const robotAiGroupPresetButton = target.closest("[data-runtime-robot-ai-group-preset]");
  if (robotAiGroupPresetButton) {
    applyRobotAiGroupPreset(
      robotAiGroupPresetButton.getAttribute("data-runtime-robot-ai-group") || "",
      robotAiGroupPresetButton.getAttribute("data-runtime-robot-ai-group-preset") || "",
    );
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
    setFocusedPlayer(focusButton.getAttribute("data-focus-player-id") || "", { openDrawer: false, mapTarget: "hq" });
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
    renderTruckPopup();
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
    analyticsRecordTruckActivity(deltaHours);
    state.players.forEach((player) => {
      player.contracts.slice().forEach((contract) => advanceContract(player, contract, deltaHours));
      player.contracts = player.contracts.filter((contract) => !contract.isCompleted);
    });
    analyticsRecordSnapshot();
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