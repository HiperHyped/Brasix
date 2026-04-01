import { createBrasixMap, fitBrasixBounds } from "../shared/leaflet-map.js?v=20260327-route-legend-1";
import { escapeHtml, numberFormatter } from "../shared/formatters.js";

const LAYOUT_KEY = "brasix:v1:product-editor-v2-layout";
const THEME_KEY = "brasix:v1:product-editor-v2-theme";
const BRUSH_RADII_KM = [30, 60, 120, 220, 400];
const BRUSH_INTENSITIES = [0.1, 0.24, 0.52, 0.95];
const PAINT_PULSE_INTERVAL_MS = [120, 85, 55, 30];
const PAINT_PULSE_REPEAT_COUNT = [1, 2, 3, 5];
const FIELD_HISTORY_LIMIT = 60;
const PRODUCT_EMOJI_GROUPS = [
  {
    label: "Agro e Natureza",
    emojis: ["🌱", "🌿", "🍃", "🌾", "🌽", "🎋", "🍊", "🍋", "🍎", "🍇", "🥥", "🌳", "🪵", "🪨", "🔥"],
  },
  {
    label: "Animais e Pecuária",
    emojis: ["🐄", "🐂", "🐖", "🐓", "🐔", "🐣", "🐟", "🦐", "🐑", "🦆", "🥛", "🥚"],
  },
  {
    label: "Alimentos e Bebidas",
    emojis: ["☕", "🍚", "🍞", "🧀", "🥩", "🥓", "🍖", "🥤", "🧃", "🍺", "🍷", "🍯", "🧂"],
  },
  {
    label: "Indústria e Objetos",
    emojis: ["📦", "🏗️", "🧱", "🧪", "🛢️", "⛓️", "🔩", "⚙️", "🪛", "🪚", "🪑", "🧵", "👕", "🧴", "📱", "💻", "🔋"],
  },
  {
    label: "Metais, Energia e Mineração",
    emojis: ["🪙", "⛏️", "🛢️", "⚡", "🔋", "🧲", "💎", "🧱", "🪨", "🔥"],
  },
  {
    label: "Transporte e Logística",
    emojis: ["🚚", "🚛", "🚐", "🚗", "🚜", "🏭", "🏬", "🏗️", "🛣️", "⛽", "🚢", "✈️"],
  },
  {
    label: "Tecnologia e Valor",
    emojis: ["📱", "💻", "🖥️", "📡", "🛰️", "🔌", "💿", "🎛️", "🔒", "💰", "💎"],
  },
  {
    label: "Símbolos e Diversos",
    emojis: ["⭐", "✨", "📌", "📍", "🆕", "🧭", "🏷️", "🔷", "🔶", "⬛", "⬜"],
  },
];
const PRODUCT_EMOJI_OPTIONS = PRODUCT_EMOJI_GROUPS.flatMap((group) => group.emojis);

const state = {
  bootstrap: null,
  screen: null,
  shortcuts: { items: [] },
  themesDocument: null,
  themesById: {},
  activeThemeId: null,
  map: null,
  heatLayerGroup: null,
  markerLayerGroup: null,
  previewCircle: null,
  cities: [],
  citiesById: {},
  referenceCities: [],
  referenceCitiesById: {},
  products: [],
  productsById: {},
  supplyByProduct: {},
  demandByProduct: {},
  anchorsByProduct: {},
  demandAnchorsByProduct: {},
  productStatsById: {},
  demandStatsById: {},
  familyCatalog: { families: [] },
  logisticsCatalog: { types: [] },
  populationMedian: 1,
  selectedMapId: "",
  selectedProductId: "",
  selectedCityId: "",
  selectedLayer: "supply",
  selectedTool: "select",
  brushRadiusIndex: 2,
  brushIntensityIndex: 1,
  filters: {
    familyId: "",
    logisticsTypeId: "",
  },
  fieldDocsByKey: {},
  fieldHistoryByKey: {},
  autosaveChain: Promise.resolve(),
  controlsBound: false,
  mapBound: false,
  paintSession: null,
  paintPulseTimer: null,
  mapPointerLatLng: null,
  rightPanelTab: "details",
  createDraft: null,
};

function labels() {
  return state.screen?.labels || {};
}

function messages() {
  return state.screen?.status_messages || {};
}

function currentTheme() {
  const defaultId = state.themesDocument?.default_theme_id;
  return state.themesById[state.activeThemeId] || state.themesById[defaultId] || Object.values(state.themesById)[0] || null;
}

function currentProduct() {
  return state.productsById[state.selectedProductId] || null;
}

function currentCity() {
  return state.citiesById[state.selectedCityId] || null;
}

function currentMapEntry() {
  return (state.bootstrap?.map_repository?.maps || []).find((item) => item.id === state.selectedMapId)
    || state.bootstrap?.map_repository?.active_map
    || null;
}

function defaultCreateDraft(baseProduct = null) {
  return {
    name: "",
    emoji: baseProduct?.emoji || PRODUCT_EMOJI_OPTIONS[0],
    family_id: baseProduct?.family_id || state.familyCatalog.families[0]?.id || "agro",
    logistics_type_id: baseProduct?.logistics_type_id || state.logisticsCatalog.types[0]?.id || "carga_geral_paletizada",
    status: baseProduct?.is_active === false ? "hidden" : "visible",
    inputs: Array.isArray(baseProduct?.inputs) ? [...baseProduct.inputs] : [],
    outputs: Array.isArray(baseProduct?.outputs) ? [...baseProduct.outputs] : [],
  };
}

function currentCreateDraft() {
  if (!state.createDraft) {
    state.createDraft = defaultCreateDraft(currentProduct());
  }
  return state.createDraft;
}

function selectedOptions(element) {
  return Array.from(element?.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function buildFieldKey(mapId = state.selectedMapId, productId = state.selectedProductId, layer = state.selectedLayer) {
  if (!mapId || !productId || !layer) {
    return "";
  }
  return `${mapId}::${productId}::${layer}`;
}

function currentFieldKey() {
  return buildFieldKey();
}

function currentFieldDoc() {
  return state.fieldDocsByKey[currentFieldKey()] || null;
}

function currentFieldHistory() {
  return state.fieldHistoryByKey[currentFieldKey()] || null;
}

function currentBrushRadiusKm() {
  return BRUSH_RADII_KM[state.brushRadiusIndex] || BRUSH_RADII_KM[2];
}

function currentBrushIntensity() {
  return BRUSH_INTENSITIES[state.brushIntensityIndex] || BRUSH_INTENSITIES[1];
}

function layerLabel(layer) {
  return layer === "demand" ? (labels().demand_layer_label || "Demanda") : (labels().supply_layer_label || "Oferta");
}

function toolLabel(tool) {
  if (tool === "modify") {
    return labels().tool_modify_label || "Modificar";
  }
  return labels().tool_select_label || "Selecionar";
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeStrokes(strokes) {
  return JSON.stringify(strokes || []);
}

function loadBootstrap() {
  return fetch("/api/editor/products_v2/bootstrap").then(async (response) => {
    if (!response.ok) {
      throw new Error(`Falha ao carregar bootstrap do editor de produtos v2 (${response.status}).`);
    }
    return response.json();
  });
}

function loadFieldDocument(mapId, productId, layer) {
  const query = new URLSearchParams({
    map_id: mapId,
    product_id: productId,
    layer,
  });
  return fetch(`/api/editor/products_v2/field?${query.toString()}`).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Falha ao carregar o campo editavel (${response.status}).`);
    }
    return response.json();
  });
}

function saveFieldDocument(payload) {
  return fetch("/api/editor/products_v2/field", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || "Falha ao salvar o campo editavel.");
    }
    return data;
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
        reject(new Error("Leaflet nao carregou a tempo para o editor de produtos v1."));
      }
    }, 50);
  });
}

function applyCssVariables(source) {
  Object.entries(source || {}).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
}

function parseCssPx(name, fallback) {
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setCssPx(name, value) {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function invalidateMap() {
  if (!state.map) {
    return;
  }
  window.requestAnimationFrame(() => state.map.invalidateSize());
}

function normalizeLayout() {
  const grid = document.getElementById("product-editor-v1-grid");
  if (!grid || window.matchMedia("(max-width: 1480px)").matches) {
    invalidateMap();
    return;
  }

  const gridWidth = grid.getBoundingClientRect().width;
  const minSide = parseCssPx("--product-side-min-col", 280);
  const minMap = parseCssPx("--product-map-min-col", 640);
  const resizerTotal = parseCssPx("--product-resizer-width", 10) * 2;
  const gapTotal = parseCssPx("--product-panel-gap", 12) * 4;
  const startLeft = parseCssPx("--product-left-col", 332);
  const maxLeft = Math.max(minSide, gridWidth - minSide - resizerTotal - gapTotal - minMap);
  const left = clamp(startLeft, minSide, maxLeft);
  const startRight = parseCssPx("--product-right-col", 372);
  const maxRight = Math.max(minSide, gridWidth - left - resizerTotal - gapTotal - minMap);
  const right = clamp(startRight, minSide, maxRight);

  setCssPx("--product-left-col", left);
  setCssPx("--product-right-col", right);
  invalidateMap();
}

function restoreLayout() {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Number.isFinite(stored.left_col_px)) {
        setCssPx("--product-left-col", stored.left_col_px);
      }
      if (Number.isFinite(stored.right_col_px)) {
        setCssPx("--product-right-col", stored.right_col_px);
      }
    }
  } catch (_error) {
    // Optional persistence.
  }
  normalizeLayout();
}

function persistLayout() {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      left_col_px: parseCssPx("--product-left-col", 332),
      right_col_px: parseCssPx("--product-right-col", 372),
    }));
  } catch (_error) {
    // Optional persistence.
  }
}

function restoreTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored && state.themesById[stored]) {
      return stored;
    }
  } catch (_error) {
    // Optional persistence.
  }
  return state.themesDocument?.default_theme_id || Object.keys(state.themesById)[0] || null;
}

function persistTheme() {
  try {
    if (state.activeThemeId) {
      window.localStorage.setItem(THEME_KEY, state.activeThemeId);
    }
  } catch (_error) {
    // Optional persistence.
  }
}

function applyTheme(themeId, { persist = true } = {}) {
  const theme = state.themesById[themeId] || currentTheme();
  if (!theme) {
    return;
  }
  state.activeThemeId = theme.id;
  document.documentElement.dataset.editorTheme = theme.root_data_theme || theme.id;
  applyCssVariables(state.bootstrap?.ui?.design_tokens?.css_variables || {});
  applyCssVariables(state.bootstrap?.product_editor_v2?.layout_desktop?.css_variables || {});
  applyCssVariables(theme.css_variables || {});
  if (persist) {
    persistTheme();
  }
}

function toggleTheme() {
  const theme = currentTheme();
  if (!theme?.next_theme_id) {
    return;
  }
  applyTheme(theme.next_theme_id);
  restoreLayout();
  renderHeader();
  renderShortcutsDialog();
  renderStatus(theme.id === "map_editor_theme_day" ? (messages().theme_night || "Modo noturno ativado.") : (messages().theme_day || "Modo diurno ativado."));
}

function formatNumber(value, digits = 1) {
  return numberFormatter(digits).format(Number(value || 0));
}

function formatUnitValue(value, unit) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${formatNumber(numericValue, digits)} ${unit || ""}`.trim();
}

function formatTimestamp(value) {
  if (!value) {
    return "Nao salvo";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString("pt-BR");
}

function renderStatus(message, meta = []) {
  const target = document.getElementById("product-editor-v1-status");
  if (!target) {
    return;
  }
  target.innerHTML = `
    <div class="editor-status-copy">${escapeHtml(message || messages().idle || "Editor pronto.")}</div>
    <div class="editor-status-meta">
      ${meta.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
    </div>
  `;
}

function familyLabel(familyId) {
  return (state.familyCatalog.families || []).find((item) => item.id === familyId)?.label || familyId || "-";
}

function logisticsLabel(logisticsTypeId) {
  return (state.logisticsCatalog.types || []).find((item) => item.id === logisticsTypeId)?.label || logisticsTypeId || "-";
}

function logisticsRecord(logisticsTypeId) {
  return (state.logisticsCatalog.types || []).find((item) => item.id === logisticsTypeId) || null;
}

function logisticsBodyLabels(logisticsTypeId) {
  return logisticsRecord(logisticsTypeId)?.body_labels || [];
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) {
    return 1;
  }
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function buildMatrixIndex(items) {
  const byProduct = {};
  (items || []).forEach((item) => {
    const productId = String(item.product_id || "").trim();
    const cityId = String(item.city_id || "").trim();
    if (!productId || !cityId) {
      return;
    }
    byProduct[productId] = byProduct[productId] || {};
    byProduct[productId][cityId] = { ...item, value: Number(item.value || 0) };
  });
  return byProduct;
}

function haversineKm(latLeft, lonLeft, latRight, lonRight) {
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(latRight) - Number(latLeft));
  const dLon = toRadians(Number(lonRight) - Number(lonLeft));
  const leftLat = toRadians(latLeft);
  const rightLat = toRadians(latRight);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sourceLabel(source) {
  if (source === "observed") {
    return "Observada";
  }
  if (source === "interpolated") {
    return "Interpolada";
  }
  if (source === "estimated") {
    return "Estimada";
  }
  return "Sem dado";
}

function applyScreenCopy() {
  (state.screen?.components || []).forEach((item) => {
    const target = document.getElementById(item.dom_target_id);
    if (target && item.text != null) {
      target.textContent = item.text;
    }
  });

  const copyMap = [
    ["product-editor-v1-map-select-label", labels().map_select_label],
    ["product-editor-v1-family-filter-label", labels().family_filter_label],
    ["product-editor-v1-logistics-filter-label", labels().logistics_filter_label],
    ["product-editor-v1-product-list-label", labels().product_list_label],
    ["product-editor-v1-create-label", labels().create_button_label],
    ["product-editor-v1-duplicate-button", labels().duplicate_button_label],
    ["product-editor-v1-layer-toggle-label", labels().layer_toggle_label],
    ["product-editor-v1-layer-supply", labels().supply_layer_label],
    ["product-editor-v1-layer-demand", labels().demand_layer_label],
    ["product-editor-v1-tool-toggle-label", labels().tool_toggle_label],
    ["product-editor-v1-brush-radius-label", labels().brush_radius_label],
    ["product-editor-v1-brush-intensity-label", labels().brush_intensity_label],
    ["product-editor-v1-undo-button", labels().undo_label],
    ["product-editor-v1-redo-button", labels().redo_label],
    ["product-editor-v1-city-panel-title", labels().city_panel_title],
  ];

  copyMap.forEach(([id, value]) => {
    const target = document.getElementById(id);
    if (target && value) {
      target.textContent = value;
    }
  });

  const toolButtons = {
    select: labels().tool_select_label || "Selecionar",
    modify: labels().tool_modify_label || "Modificar",
  };
  document.querySelectorAll("#product-editor-v1-tool-toggle [data-tool]").forEach((button) => {
    const label = toolButtons[button.dataset.tool];
    if (label) {
      button.setAttribute("title", label);
      button.setAttribute("aria-label", label);
    }
  });

  const dialogCopy = document.getElementById("product-editor-v1-shortcuts-copy");
  if (dialogCopy) {
    dialogCopy.textContent = state.screen?.dialog?.shortcuts_copy || "";
  }
  const dialogClose = document.getElementById("product-editor-v1-shortcuts-close-button");
  if (dialogClose && state.screen?.dialog?.close_button_label) {
    dialogClose.textContent = state.screen.dialog.close_button_label;
  }
}

function explicitEntry(matrixByProduct, productId, cityId) {
  return matrixByProduct?.[productId]?.[cityId] || null;
}

function computeSupplyBase(productId, city) {
  const observed = explicitEntry(state.supplyByProduct, productId, city.id);
  if (observed) {
    return {
      value: Number(observed.value || 0),
      source: "observed",
      anchorCount: 1,
      nearestDistanceKm: 0,
      attenuationFactor: 1,
    };
  }

  const anchors = state.anchorsByProduct[productId] || [];
  const rules = state.bootstrap?.product_inference_rules?.supply_interpolation || {};
  const maxDistanceKm = Number(rules.max_distance_km || 650);
  const minimumDistanceKm = Number(rules.minimum_distance_km || 45);
  const nearestAnchorCount = Number(rules.nearest_anchor_count || 3);
  const power = Number(rules.power || 2.8);
  const sameStateBonus = Number(rules.same_state_bonus || 1.15);
  const outOfStatePenalty = Number(rules.out_of_state_penalty || 0.82);
  const distanceDecayRadiusKm = Number(rules.distance_decay_radius_km || 220);
  const distanceDecayPower = Number(rules.distance_decay_power || 1.45);

  const nearest = anchors
    .map((anchor) => ({
      ...anchor,
      distanceKm: haversineKm(city.latitude, city.longitude, anchor.city.latitude, anchor.city.longitude),
    }))
    .filter((anchor) => anchor.distanceKm <= maxDistanceKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, nearestAnchorCount);

  if (!nearest.length) {
    return { value: 0, source: "none", anchorCount: 0, nearestDistanceKm: null, attenuationFactor: 0 };
  }

  let weightedTotal = 0;
  let weightSum = 0;
  nearest.forEach((anchor) => {
    const distanceKm = Math.max(anchor.distanceKm, minimumDistanceKm);
    const baseWeight = 1 / (distanceKm ** power);
    const stateWeight = anchor.city.state_code === city.state_code ? sameStateBonus : outOfStatePenalty;
    const weight = baseWeight * stateWeight;
    weightedTotal += anchor.value * weight;
    weightSum += weight;
  });

  const weightedAverage = weightSum > 0 ? weightedTotal / weightSum : 0;
  const nearestDistanceKm = Math.max(nearest[0]?.distanceKm || 0, minimumDistanceKm);
  const attenuationFactor = Math.exp(-Math.pow(nearestDistanceKm / Math.max(distanceDecayRadiusKm, 1), distanceDecayPower));
  const value = weightedAverage * attenuationFactor;

  return {
    value,
    source: "interpolated",
    anchorCount: nearest.length,
    nearestDistanceKm,
    attenuationFactor,
  };
}

function computeDemandBase(productId, city) {
  const observed = explicitEntry(state.demandByProduct, productId, city.id);
  if (observed) {
    return {
      value: Number(observed.value || 0),
      source: "observed",
      anchorCount: 1,
      nearestDistanceKm: 0,
      attenuationFactor: 1,
    };
  }

  const anchors = state.demandAnchorsByProduct[productId] || [];
  const rules = state.bootstrap?.product_inference_rules?.demand_interpolation
    || state.bootstrap?.product_inference_rules?.supply_interpolation
    || {};
  const maxDistanceKm = Number(rules.max_distance_km || 700);
  const minimumDistanceKm = Number(rules.minimum_distance_km || 45);
  const nearestAnchorCount = Number(rules.nearest_anchor_count || 4);
  const power = Number(rules.power || 2.35);
  const sameStateBonus = Number(rules.same_state_bonus || 1.12);
  const outOfStatePenalty = Number(rules.out_of_state_penalty || 0.88);
  const distanceDecayRadiusKm = Number(rules.distance_decay_radius_km || 280);
  const distanceDecayPower = Number(rules.distance_decay_power || 1.25);

  const nearest = anchors
    .map((anchor) => ({
      ...anchor,
      distanceKm: haversineKm(city.latitude, city.longitude, anchor.city.latitude, anchor.city.longitude),
    }))
    .filter((anchor) => anchor.distanceKm <= maxDistanceKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, nearestAnchorCount);

  if (!nearest.length) {
    return { value: 0, source: "none", anchorCount: 0, nearestDistanceKm: null, attenuationFactor: 0 };
  }

  let weightedTotal = 0;
  let weightSum = 0;
  nearest.forEach((anchor) => {
    const distanceKm = Math.max(anchor.distanceKm, minimumDistanceKm);
    const baseWeight = 1 / (distanceKm ** power);
    const stateWeight = anchor.city.state_code === city.state_code ? sameStateBonus : outOfStatePenalty;
    const weight = baseWeight * stateWeight;
    weightedTotal += anchor.value * weight;
    weightSum += weight;
  });

  const weightedAverage = weightSum > 0 ? weightedTotal / weightSum : 0;
  const nearestDistanceKm = Math.max(nearest[0]?.distanceKm || 0, minimumDistanceKm);
  const attenuationFactor = Math.exp(-Math.pow(nearestDistanceKm / Math.max(distanceDecayRadiusKm, 1), distanceDecayPower));
  return {
    value: weightedAverage * attenuationFactor,
    source: "interpolated",
    anchorCount: nearest.length,
    nearestDistanceKm,
    attenuationFactor,
  };
}

function initializeState(payload) {
  state.bootstrap = payload;
  state.screen = payload.product_editor_v2?.screen || {};
  state.shortcuts = payload.product_editor_v2?.shortcuts || { items: [] };
  state.themesDocument = payload.product_editor_v2?.themes || {};
  state.themesById = Object.fromEntries((state.themesDocument.themes || []).map((item) => [item.id, item]));

  state.cities = [...(payload.cities || [])].sort((left, right) => String(left.label || "").localeCompare(String(right.label || ""), "pt-BR"));
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.referenceCities = [...(payload.reference_cities || [])].sort((left, right) => String(left.label || "").localeCompare(String(right.label || ""), "pt-BR"));
  state.referenceCitiesById = Object.fromEntries(state.referenceCities.map((city) => [city.id, city]));
  state.products = [...(payload.product_catalog?.products || [])].sort(
    (left, right) => (Number(left.order || 0) - Number(right.order || 0)) || String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"),
  );
  state.productsById = Object.fromEntries(state.products.map((product) => [product.id, product]));
  state.familyCatalog = payload.product_family_catalog || { families: [] };
  state.logisticsCatalog = payload.product_logistics_type_catalog || { types: [] };
  if (!state.createDraft || !state.familyCatalog.families.some((item) => item.id === state.createDraft.family_id)) {
    state.createDraft = defaultCreateDraft(state.products[0] || null);
  }
  state.supplyByProduct = buildMatrixIndex(payload.product_supply_matrix?.items || []);
  state.demandByProduct = buildMatrixIndex(payload.product_demand_matrix?.items || []);

  state.anchorsByProduct = {};
  Object.entries(state.supplyByProduct).forEach(([productId, cityMap]) => {
    state.anchorsByProduct[productId] = Object.values(cityMap)
      .map((item) => ({ ...item, city: state.referenceCitiesById[item.city_id] || state.citiesById[item.city_id] }))
      .filter((item) => item.city);
  });

  state.demandAnchorsByProduct = {};
  Object.entries(state.demandByProduct).forEach(([productId, cityMap]) => {
    state.demandAnchorsByProduct[productId] = Object.values(cityMap)
      .map((item) => ({ ...item, city: state.referenceCitiesById[item.city_id] || state.citiesById[item.city_id] }))
      .filter((item) => item.city);
  });

  state.productStatsById = {};
  state.products.forEach((product) => {
    const values = (state.anchorsByProduct[product.id] || []).map((item) => Number(item.value || 0)).filter((value) => value > 0);
    const sum = values.reduce((accumulator, value) => accumulator + value, 0);
    state.productStatsById[product.id] = {
      anchor_count: values.length,
      average_supply: values.length ? sum / values.length : 0,
      median_supply: values.length ? median(values) : 0,
      max_supply: values.length ? Math.max(...values) : 0,
    };
  });

  const referencePopulation = state.referenceCities.map((city) => Number(city.population_thousands || 0)).filter((value) => value > 0);
  const activePopulation = state.cities.map((city) => Number(city.population_thousands || 0)).filter((value) => value > 0);
  state.populationMedian = median(referencePopulation.length ? referencePopulation : activePopulation);

  state.demandStatsById = {};
  state.products.forEach((product) => {
    const values = (state.demandAnchorsByProduct[product.id] || []).map((item) => Number(item.value || 0)).filter((value) => value > 0);
    const sum = values.reduce((accumulator, value) => accumulator + value, 0);
    state.demandStatsById[product.id] = {
      average_value: values.length ? sum / values.length : 0,
      median_value: values.length ? median(values) : 0,
      max_value: values.length ? Math.max(...values) : 0,
    };
  });

  state.selectedMapId = payload.map_repository?.active_map_id || state.selectedMapId || "";
  state.selectedProductId = payload.summary?.selected_product_id || state.selectedProductId || state.products[0]?.id || "";
  if (!state.productsById[state.selectedProductId]) {
    state.selectedProductId = state.products[0]?.id || "";
  }
  if (!state.citiesById[state.selectedCityId]) {
    state.selectedCityId = state.cities[0]?.id || "";
  }
}

function normalizePoint(point) {
  return {
    lat: Number(point?.lat ?? point?.latitude ?? 0),
    lon: Number(point?.lon ?? point?.longitude ?? point?.lng ?? 0),
  };
}

function normalizeStroke(stroke, productId, layer, index = 0) {
  const points = Array.isArray(stroke?.points)
    ? stroke.points.map((point) => normalizePoint(point)).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    : [];
  return {
    id: String(stroke?.id || `stroke_${Date.now()}_${index}`),
    product_id: String(stroke?.product_id || productId),
    layer: String(stroke?.layer || layer),
    tool: "paint",
    mode: stroke?.mode === "subtract" ? "subtract" : "add",
    radius_km: Math.max(Number(stroke?.radius_km || currentBrushRadiusKm()), 1),
    intensity: Number(stroke?.intensity || currentBrushIntensity()),
    falloff: String(stroke?.falloff || "gaussian"),
    created_at: String(stroke?.created_at || new Date().toISOString()),
    points,
  };
}

function normalizeFieldDoc(payload, mapId, productId, layer) {
  const bakedCityValues = Array.isArray(payload?.baked_city_values) ? payload.baked_city_values : [];
  return {
    id: String(payload?.id || `product_field_edit::${mapId || "default"}::${productId}::${layer}`),
    map_id: String(payload?.map_id || mapId || ""),
    product_id: productId,
    layer,
    version: Number(payload?.version || 1),
    updated_at: payload?.updated_at || null,
    strokes: Array.isArray(payload?.strokes) ? payload.strokes.map((stroke, index) => normalizeStroke(stroke, productId, layer, index)) : [],
    baked_city_values: bakedCityValues,
  };
}

function ensureHistoryEntry(key, strokes) {
  if (!state.fieldHistoryByKey[key]) {
    const snapshot = deepClone(strokes || []);
    state.fieldHistoryByKey[key] = {
      past: [snapshot],
      future: [],
      savedSnapshot: serializeStrokes(snapshot),
    };
  }
  return state.fieldHistoryByKey[key];
}

function isFieldDirty(key) {
  const doc = state.fieldDocsByKey[key];
  const history = state.fieldHistoryByKey[key];
  if (!doc || !history) {
    return false;
  }
  return serializeStrokes(doc.strokes) !== history.savedSnapshot;
}

async function ensureFieldDocument(productId = state.selectedProductId, layer = state.selectedLayer, mapId = state.selectedMapId) {
  if (!mapId || !productId || !layer) {
    return null;
  }
  const key = buildFieldKey(mapId, productId, layer);
  if (state.fieldDocsByKey[key]) {
    ensureHistoryEntry(key, state.fieldDocsByKey[key].strokes);
    return state.fieldDocsByKey[key];
  }
  const payload = await loadFieldDocument(mapId, productId, layer);
  const fieldDoc = normalizeFieldDoc(payload?.field, mapId, productId, layer);
  const baked = payload?.baked?.city_values;
  if (Array.isArray(baked) && !fieldDoc.baked_city_values.length) {
    fieldDoc.baked_city_values = baked;
  }
  state.fieldDocsByKey[key] = fieldDoc;
  ensureHistoryEntry(key, fieldDoc.strokes);
  return fieldDoc;
}

function replaceCurrentFieldStrokes(nextStrokes) {
  const key = currentFieldKey();
  const doc = currentFieldDoc();
  if (!key || !doc) {
    return;
  }
  const history = ensureHistoryEntry(key, doc.strokes);
  const snapshot = deepClone(nextStrokes || []);
  history.past.push(snapshot);
  if (history.past.length > FIELD_HISTORY_LIMIT) {
    history.past.shift();
  }
  history.future = [];
  doc.strokes = snapshot;
}

function undoCurrentField() {
  finalizePaintSession({ commit: true });
  const doc = currentFieldDoc();
  const history = currentFieldHistory();
  if (!doc || !history || history.past.length <= 1) {
    return;
  }
  history.future.unshift(deepClone(history.past.pop()));
  doc.strokes = deepClone(history.past[history.past.length - 1]);
  renderAll();
  void queueAutosaveCurrentField(messages().undo_applied || "Ultima operacao desfeita.");
}

function redoCurrentField() {
  finalizePaintSession({ commit: true });
  const doc = currentFieldDoc();
  const history = currentFieldHistory();
  if (!doc || !history || !history.future.length) {
    return;
  }
  const nextSnapshot = deepClone(history.future.shift());
  history.past.push(nextSnapshot);
  doc.strokes = deepClone(nextSnapshot);
  renderAll();
  void queueAutosaveCurrentField(messages().redo_applied || "Operacao refeita.");
}

function resetCurrentField() {
  finalizePaintSession({ commit: false });
  const doc = currentFieldDoc();
  if (!doc) {
    return;
  }
  replaceCurrentFieldStrokes([]);
  renderAll();
  void queueAutosaveCurrentField(messages().field_reset || "Camada manual limpa para o produto atual.");
}

function resolveLayerScale(productId, layer) {
  if (layer === "demand") {
    const stats = state.demandStatsById[productId] || {};
    const reference = Math.max(
      Number(stats.median_value || 0),
      Number(stats.average_value || 0),
      Number(stats.max_value || 0) * 0.16,
      1,
    );
    return Math.max(1, reference * 0.18);
  }
  const stats = state.productStatsById[productId] || {};
  const reference = Math.max(
    Number(stats.median_supply || 0),
    Number(stats.average_supply || 0),
    Number(stats.max_supply || 0) * 0.18,
    1,
  );
  return Math.max(1, reference * 0.16);
}

function computeStrokeDeltaForCity(stroke, city, layerScale) {
  const sign = stroke.mode === "subtract" ? -1 : 1;
  const radiusKm = Math.max(Number(stroke.radius_km || 1), 1);
  const strength = Number(stroke.intensity || 0) * layerScale;
  let total = 0;
  (stroke.points || []).forEach((point) => {
    const distanceKm = haversineKm(city.latitude, city.longitude, point.lat, point.lon);
    if (distanceKm > radiusKm) {
      return;
    }
    const normalized = distanceKm / radiusKm;
    const kernel = Math.exp(-0.5 * ((normalized * 3) ** 2));
    total += sign * strength * kernel;
  });
  return total;
}

function activeStrokesFor(productId, layer) {
  const key = buildFieldKey(state.selectedMapId, productId, layer);
  const stored = state.fieldDocsByKey[key]?.strokes || [];
  const previewStroke = state.paintSession?.fieldKey === key ? state.paintSession.stroke : null;
  return previewStroke ? [...stored, previewStroke] : stored;
}

function computeManualDelta(productId, city, layer) {
  const layerScale = resolveLayerScale(productId, layer);
  return activeStrokesFor(productId, layer).reduce(
    (total, stroke) => total + computeStrokeDeltaForCity(stroke, city, layerScale),
    0,
  );
}

function computeLayerBase(productId, city, layer) {
  return layer === "demand" ? computeDemandBase(productId, city) : computeSupplyBase(productId, city);
}

function computeLayerInfo(productId, city, layer) {
  const base = computeLayerBase(productId, city, layer);
  const manualDelta = computeManualDelta(productId, city, layer);
  return {
    ...base,
    manualDelta,
    finalValue: Math.max(0, Number(base.value || 0) + manualDelta),
    isEdited: Math.abs(manualDelta) > 0.01,
  };
}

function buildRowsForCurrentLayer() {
  const product = currentProduct();
  if (!product) {
    return [];
  }
  return state.cities.map((city) => {
    const info = computeLayerInfo(product.id, city, state.selectedLayer);
    return { city, ...info };
  });
}

function closestCityForLatLng(latlng, maxPixelDistance = 42) {
  if (!state.map || !latlng || !state.cities.length) {
    return null;
  }
  const targetPoint = state.map.latLngToContainerPoint(latlng);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  state.cities.forEach((city) => {
    const point = state.map.latLngToContainerPoint([city.latitude, city.longitude]);
    const dx = point.x - targetPoint.x;
    const dy = point.y - targetPoint.y;
    const distance = Math.sqrt((dx ** 2) + (dy ** 2));
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  });
  if (bestDistance > maxPixelDistance) {
    return null;
  }
  return best;
}

function cityMetric(label, value, { span2 = false } = {}) {
  return `
    <div class="product-editor-city-metric${span2 ? " is-span-2" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderHeader() {
  const badges = document.getElementById("product-editor-v1-header-badges");
  const actions = document.getElementById("product-editor-v1-header-actions");
  const product = currentProduct();
  const mapEntry = currentMapEntry();
  const dirty = isFieldDirty(currentFieldKey());

  if (badges) {
    badges.innerHTML = `
      <span class="product-editor-header-pill">${escapeHtml(mapEntry?.name || "Mapa")}</span>
      <span class="product-editor-header-pill">${escapeHtml(`${state.products.length} produtos`)}</span>
      <span class="product-editor-header-pill">${escapeHtml(`${state.cities.length} cidades`)}</span>
      <span class="product-editor-header-pill">${escapeHtml(layerLabel(state.selectedLayer))}</span>
      <span class="product-editor-header-pill">${escapeHtml(toolLabel(state.selectedTool))}</span>
      <span class="product-editor-header-pill">${escapeHtml(`${currentBrushRadiusKm()} km`)}</span>
      <span class="product-editor-header-pill">${escapeHtml(product?.name || "-")}</span>
      ${dirty ? `<span class="product-editor-header-pill">${escapeHtml("Autosave pendente")}</span>` : `<span class="product-editor-header-pill">${escapeHtml("Auto salvo")}</span>`}
    `;
  }

  if (actions) {
    const theme = currentTheme();
    actions.innerHTML = (state.screen?.header_actions || []).map((action) => {
      if (action.action === "toggle-theme") {
        return `
          <button class="editor-header-action" type="button" data-action-id="toggle-theme">
            <span class="material-symbols-outlined">${escapeHtml(theme?.toggle_action_icon || action.icon || "dark_mode")}</span>
            <span>${escapeHtml(theme?.toggle_action_label || action.label || "Tema")}</span>
          </button>
        `;
      }
      if (action.action === "open-shortcuts") {
        return `
          <button class="editor-header-action" type="button" data-action-id="open-shortcuts" aria-haspopup="dialog">
            <span class="material-symbols-outlined">${escapeHtml(action.icon || "keyboard_command_key")}</span>
            <span>${escapeHtml(action.label || "Atalhos")}</span>
          </button>
        `;
      }
      return `
        <a class="editor-header-action" href="${escapeHtml(action.href || "#")}">
          <span class="material-symbols-outlined">${escapeHtml(action.icon || "open_in_new")}</span>
          <span>${escapeHtml(action.label || "")}</span>
        </a>
      `;
    }).join("");
  }
}

function renderShortcutsDialog() {
  const target = document.getElementById("product-editor-v1-shortcuts-list");
  if (!target) {
    return;
  }
  target.classList.add("editor-shortcuts-list");
  target.innerHTML = (state.shortcuts?.items || []).map((item) => `
    <div class="shortcut-row">
      <kbd>${escapeHtml(item.key || "")}</kbd>
      <span>${escapeHtml(item.description || "")}</span>
    </div>
  `).join("");
}

function renderSelectOptions(targetId, items, selectedValue, allLabel = null) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }
  const options = [];
  if (allLabel != null) {
    options.push(`<option value="">${escapeHtml(allLabel)}</option>`);
  }
  options.push(...items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`));
  target.innerHTML = options.join("");
  target.value = selectedValue || "";
}

function renderFilters() {
  renderSelectOptions(
    "product-editor-v1-map-select",
    (state.bootstrap?.map_repository?.maps || []).map((item) => ({ id: item.id, label: item.name })),
    state.selectedMapId,
  );
  renderSelectOptions("product-editor-v1-family-filter", state.familyCatalog.families || [], state.filters.familyId, labels().all_option_label || "Todos");
  renderSelectOptions("product-editor-v1-logistics-filter", state.logisticsCatalog.types || [], state.filters.logisticsTypeId, labels().all_option_label || "Todos");
}

function filteredProducts() {
  return state.products.filter((product) => {
    if (state.filters.familyId && product.family_id !== state.filters.familyId) {
      return false;
    }
    if (state.filters.logisticsTypeId && product.logistics_type_id !== state.filters.logisticsTypeId) {
      return false;
    }
    return true;
  });
}

function renderProductList() {
  const target = document.getElementById("product-editor-v1-product-select");
  if (!target) {
    return;
  }
  const visible = filteredProducts();
  if (visible.length && !visible.some((product) => product.id === state.selectedProductId)) {
    state.selectedProductId = visible[0].id;
    const key = buildFieldKey(state.selectedMapId, state.selectedProductId, state.selectedLayer);
    if (!state.fieldDocsByKey[key]) {
      void ensureFieldDocument(state.selectedProductId, state.selectedLayer)
        .then(() => renderAll())
        .catch(() => {
          // Non-blocking lazy load.
        });
    }
  }
  if (!visible.length) {
    target.innerHTML = "";
    target.disabled = true;
    return;
  }
  target.disabled = false;
  target.innerHTML = visible.map((product) => (
    `<option value="${escapeHtml(product.id)}">${escapeHtml(`${product.emoji || "\u{1F4E6}"} ${product.name}`.trim())}</option>`
  )).join("");
  target.value = state.selectedProductId;
}

function renderMapSelection() {
  const target = document.getElementById("product-editor-v1-map-selection");
  const product = currentProduct();
  const mapEntry = currentMapEntry();
  if (!target) {
    return;
  }
  target.innerHTML = `
    <span class="product-editor-header-pill">${escapeHtml(mapEntry?.name || "Mapa")}</span>
    <span class="product-editor-map-pill" style="--product-pill-color:${escapeHtml(product?.color || "#4f8593")}">${escapeHtml(`${product?.emoji || ""} ${product?.name || "-"}`.trim())}</span>
    <span class="product-editor-header-pill">${escapeHtml(layerLabel(state.selectedLayer))}</span>
  `;
}

function renderProductDetail(rows = null) {
  const target = document.getElementById("product-editor-v1-product-detail");
  const product = currentProduct();
  if (!target || !product) {
    return;
  }
  const currentDoc = currentFieldDoc();
  const stats = state.productStatsById[product.id] || {};
  const inputNames = (product.inputs || []).map((productId) => state.productsById[productId]?.name || productId);
  const outputNames = (product.outputs || []).map((productId) => state.productsById[productId]?.name || productId);
  const allowedBodies = logisticsBodyLabels(product.logistics_type_id);

  target.innerHTML = `
    <div class="product-editor-city-grid">
      ${cityMetric("Produto", `${product.emoji || "\u{1F4E6}"} ${product.name}`.trim(), { span2: true })}
      ${cityMetric("Familia", familyLabel(product.family_id))}
      ${cityMetric("Tipo logistico", logisticsLabel(product.logistics_type_id))}
      ${cityMetric("Implementos", allowedBodies.length ? allowedBodies.join(", ") : "-", { span2: true })}
      ${cityMetric("Unidade", product.unit || "-")}
      ${cityMetric("Fonte", product.source_kind || "-")}
      ${cityMetric("Ancoras observadas", `${stats.anchor_count || 0}`)}
      ${cityMetric("Sessoes manuais", `${(currentDoc?.strokes || []).length}`)}
      ${cityMetric("Insumos", inputNames.length ? inputNames.join(", ") : "-", { span2: true })}
      ${cityMetric("Derivacoes", outputNames.length ? outputNames.join(", ") : "-", { span2: true })}
    </div>
  `;
}

function renderCityDetail() {
  const target = document.getElementById("product-editor-v1-city-detail");
  const city = currentCity();
  const product = currentProduct();
  if (!target || !city || !product) {
    return;
  }

  const currentLayerInfo = computeLayerInfo(product.id, city, state.selectedLayer);
  const supplyInfo = computeLayerInfo(product.id, city, "supply");
  const demandInfo = computeLayerInfo(product.id, city, "demand");
  target.innerHTML = `
    <div class="product-editor-city-grid">
      ${cityMetric(city.label || city.name || "-", product.name || "-", { span2: true })}
      ${cityMetric(labels().city_state_label || "UF", city.state_code || "-")}
      ${cityMetric(labels().city_population_label || "Populacao", `${formatNumber(city.population_thousands || 0, 0)} mil`)}
      ${cityMetric("Camada atual", layerLabel(state.selectedLayer))}
      ${cityMetric(labels().city_base_value_label || "Valor base", formatUnitValue(currentLayerInfo.value, product.unit))}
      ${cityMetric(labels().city_manual_delta_label || "Delta manual", formatUnitValue(currentLayerInfo.manualDelta, product.unit))}
      ${cityMetric(labels().city_final_value_label || "Valor final", formatUnitValue(currentLayerInfo.finalValue, product.unit))}
      ${cityMetric("Oferta final", formatUnitValue(supplyInfo.finalValue, product.unit))}
      ${cityMetric("Demanda final", formatUnitValue(demandInfo.finalValue, product.unit))}
    </div>
    <div class="product-editor-city-note">${escapeHtml(labels().pending_city_edit_label || "")}</div>
  `;
}

function renderRightPanelTabs() {
  const detailsTab = document.getElementById("product-editor-v1-tab-details");
  const createTab = document.getElementById("product-editor-v1-tab-create");
  const detailsPanel = document.getElementById("product-editor-v1-panel-details");
  const createPanel = document.getElementById("product-editor-v1-panel-create");
  const detailsActive = state.rightPanelTab !== "create";
  if (detailsTab) {
    detailsTab.classList.toggle("is-active", detailsActive);
    detailsTab.setAttribute("aria-selected", detailsActive ? "true" : "false");
  }
  if (createTab) {
    createTab.classList.toggle("is-active", !detailsActive);
    createTab.setAttribute("aria-selected", detailsActive ? "false" : "true");
  }
  if (detailsPanel) {
    detailsPanel.hidden = !detailsActive;
  }
  if (createPanel) {
    createPanel.hidden = detailsActive;
  }
}

function renderCreateProductPanel() {
  const draft = currentCreateDraft();
  const nameInput = document.getElementById("product-editor-v1-create-name");
  const emojiSelect = document.getElementById("product-editor-v1-create-emoji");
  const familySelect = document.getElementById("product-editor-v1-create-family");
  const logisticsSelect = document.getElementById("product-editor-v1-create-logistics");
  const statusSelect = document.getElementById("product-editor-v1-create-status");
  const inputsSelect = document.getElementById("product-editor-v1-create-inputs");
  const outputsSelect = document.getElementById("product-editor-v1-create-outputs");

  if (nameInput && nameInput.value !== draft.name) {
    nameInput.value = draft.name;
  }
  if (emojiSelect) {
    const emojiOptions = Array.from(new Set([
      ...PRODUCT_EMOJI_OPTIONS,
      ...state.products.map((product) => product.emoji).filter(Boolean),
      draft.emoji,
    ]));
    const emojiSet = new Set(emojiOptions);
    const groupMarkup = PRODUCT_EMOJI_GROUPS.map((group) => {
      const groupOptions = group.emojis
        .filter((emoji) => emojiSet.has(emoji))
        .map((emoji) => `<option value="${escapeHtml(emoji)}">${escapeHtml(emoji)}</option>`)
        .join("");
      if (!groupOptions) {
        return "";
      }
      return `<optgroup label="${escapeHtml(group.label)}">${groupOptions}</optgroup>`;
    }).join("");
    const extraEmojis = emojiOptions.filter((emoji) => !PRODUCT_EMOJI_OPTIONS.includes(emoji));
    const extraMarkup = extraEmojis.length
      ? `<optgroup label="Em uso no catálogo">${extraEmojis.map((emoji) => `<option value="${escapeHtml(emoji)}">${escapeHtml(emoji)}</option>`).join("")}</optgroup>`
      : "";
    emojiSelect.innerHTML = `${groupMarkup}${extraMarkup}`;
    emojiSelect.value = draft.emoji;
  }
  if (familySelect) {
    familySelect.innerHTML = (state.familyCatalog.families || [])
      .map((family) => `<option value="${escapeHtml(family.id)}">${escapeHtml(family.label)}</option>`)
      .join("");
    familySelect.value = draft.family_id;
  }
  if (logisticsSelect) {
    logisticsSelect.innerHTML = (state.logisticsCatalog.types || [])
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
    logisticsSelect.value = draft.logistics_type_id;
  }
  if (statusSelect) {
    statusSelect.value = draft.status;
  }

  const relationOptions = state.products.map((product) => ({
    value: product.id,
    label: `${product.emoji || "\u{1F4E6}"} ${product.name}`,
  }));
  if (inputsSelect) {
    inputsSelect.innerHTML = relationOptions
      .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
      .join("");
    draft.inputs.forEach((productId) => {
      const option = inputsSelect.querySelector(`option[value="${CSS.escape(productId)}"]`);
      if (option) {
        option.selected = true;
      }
    });
  }
  if (outputsSelect) {
    outputsSelect.innerHTML = relationOptions
      .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
      .join("");
    draft.outputs.forEach((productId) => {
      const option = outputsSelect.querySelector(`option[value="${CSS.escape(productId)}"]`);
      if (option) {
        option.selected = true;
      }
    });
  }
}

function renderLegend(maxValue, product) {
  const target = document.getElementById("product-editor-v1-map-legend");
  if (!target) {
    return;
  }
  const steps = [0.2, 0.45, 0.7, 1].map((ratio) => maxValue * ratio);
  target.innerHTML = `
    <div class="product-editor-legend-card">
      <p class="eyebrow">${escapeHtml(labels().map_legend_title || "Escala")}</p>
      ${steps.map((value) => `
        <div class="product-editor-legend-row">
          <span class="product-editor-legend-dot" style="background:${escapeHtml(product.color || "#4f8593")}"></span>
          <strong>${escapeHtml(formatUnitValue(value, product.unit))}</strong>
        </div>
      `).join("")}
      <div class="product-editor-legend-note">
        <span>Halo = valor final do campo</span>
        <span>Contorno branco = ancora observada</span>
        <span>Contorno cobre = cidade com delta manual</span>
      </div>
    </div>
  `;
}

function syncControlState() {
  document.getElementById("product-editor-v1-layer-supply")?.classList.toggle("is-active", state.selectedLayer === "supply");
  document.getElementById("product-editor-v1-layer-demand")?.classList.toggle("is-active", state.selectedLayer === "demand");

  document.querySelectorAll("#product-editor-v1-tool-toggle [data-tool]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === state.selectedTool);
  });
  document.querySelectorAll("#product-editor-v1-radius-presets [data-radius-index]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.radiusIndex) === state.brushRadiusIndex);
  });
  document.querySelectorAll("#product-editor-v1-intensity-presets [data-intensity-index]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.intensityIndex) === state.brushIntensityIndex);
  });

  const undoButton = document.getElementById("product-editor-v1-undo-button");
  const redoButton = document.getElementById("product-editor-v1-redo-button");
  const history = currentFieldHistory();
  if (undoButton) {
    undoButton.disabled = !history || history.past.length <= 1;
  }
  if (redoButton) {
    redoButton.disabled = !history || !history.future.length;
  }
}

function renderMap() {
  const product = currentProduct();
  if (!state.map || !product) {
    return;
  }

  const rows = buildRowsForCurrentLayer();
  const maxValue = Math.max(...rows.map((row) => Number(row.finalValue || 0)), 0);
  const visualReferenceMax = Math.max(maxValue, resolveLayerScale(product.id, state.selectedLayer) * 24, 1);
  if (!state.heatLayerGroup) {
    state.heatLayerGroup = window.L.layerGroup().addTo(state.map);
  }
  if (!state.markerLayerGroup) {
    state.markerLayerGroup = window.L.layerGroup().addTo(state.map);
  }
  state.heatLayerGroup.clearLayers();
  state.markerLayerGroup.clearLayers();

  rows.slice().sort((left, right) => left.finalValue - right.finalValue).forEach((row) => {
    const ratio = Math.min(Math.max(Number(row.finalValue || 0), 0) / visualReferenceMax, 1);
    const heatRatio = Math.sqrt(ratio);
    const glowRadiusMeters = 12000 + (heatRatio * 105000);
    if (row.finalValue > 0.01) {
      window.L.circle([row.city.latitude, row.city.longitude], {
        pane: "brasix-highlight",
        radius: glowRadiusMeters,
        stroke: false,
        fillColor: product.color || "#4f8593",
        fillOpacity: 0.04 + (heatRatio * 0.2),
        interactive: false,
      }).addTo(state.heatLayerGroup);
    }

    const markerRadius = row.finalValue <= 0.01 ? 0 : 2 + (heatRatio * 11);
    const isSelected = row.city.id === state.selectedCityId;
    if (!isSelected && row.finalValue <= 0.01) {
      return;
    }
    const marker = window.L.circleMarker([row.city.latitude, row.city.longitude], {
      pane: "brasix-markers",
      interactive: false,
      radius: isSelected ? markerRadius + 2.2 : markerRadius,
      color: isSelected ? "#8c4f10" : (row.isEdited ? "#8c4f10" : (row.source === "observed" ? "#ffffff" : (product.color || "#4f8593"))),
      weight: isSelected ? 2.3 : (row.isEdited ? 1.8 : (row.source === "observed" ? 1.7 : 1.05)),
      fillColor: product.color || "#4f8593",
      fillOpacity: row.source === "observed" ? 0.78 : (row.isEdited ? 0.54 : 0.24),
    });
    marker.bindTooltip(
      `${escapeHtml(row.city.label)}<br>${escapeHtml(product.name)}: ${escapeHtml(formatUnitValue(row.finalValue, product.unit))}<br>${escapeHtml(sourceLabel(row.source))}${row.isEdited ? "<br>Com delta manual" : ""}`,
    );
    marker.addTo(state.markerLayerGroup);
  });

  renderMapSelection();
  renderLegend(maxValue, product);
  syncBrushPreview();
  renderProductDetail(rows);
  renderStatus(messages().idle || "Editor pronto.", [
    { label: "Camada", value: layerLabel(state.selectedLayer) },
    { label: "Ferramenta", value: toolLabel(state.selectedTool) },
    { label: "Raio", value: `${currentBrushRadiusKm()} km` },
    { label: "Manual", value: `${rows.filter((row) => row.isEdited).length} cidades` },
  ]);
  invalidateMap();
}

function syncBrushPreview() {
  if (!state.map) {
    return;
  }
  if (state.selectedTool === "select" || !state.mapPointerLatLng) {
    if (state.previewCircle) {
      state.previewCircle.remove();
      state.previewCircle = null;
    }
    return;
  }
  if (!state.previewCircle) {
    state.previewCircle = window.L.circle(state.mapPointerLatLng, {
      pane: "brasix-draft",
      radius: currentBrushRadiusKm() * 1000,
      color: "#8c4f10",
      weight: 1.4,
      dashArray: "10 8",
      fillColor: currentProduct()?.color || "#4f8593",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(state.map);
    return;
  }
  state.previewCircle.setLatLng(state.mapPointerLatLng);
  state.previewCircle.setRadius(currentBrushRadiusKm() * 1000);
  state.previewCircle.setStyle({
    fillColor: currentProduct()?.color || "#4f8593",
    fillOpacity: 0.08,
  });
}

function renderAll() {
  renderHeader();
  renderFilters();
  renderProductList();
  syncControlState();
  renderShortcutsDialog();
  renderRightPanelTabs();
  renderProductDetail();
  renderCityDetail();
  renderCreateProductPanel();
  renderMap();
}

async function reloadBootstrap({ selectedProductId = null, selectedCityId = null, refitMap = true } = {}) {
  const payload = await loadBootstrap();
  initializeState(payload);
  if (selectedProductId && state.productsById[selectedProductId]) {
    state.selectedProductId = selectedProductId;
  }
  if (selectedCityId && state.citiesById[selectedCityId]) {
    state.selectedCityId = selectedCityId;
  }
  applyScreenCopy();
  applyTheme(state.activeThemeId || restoreTheme(), { persist: false });
  await ensureFieldDocument(state.selectedProductId, state.selectedLayer);
  renderAll();
  if (state.map && refitMap) {
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    return;
  }
  invalidateMap();
}

function openCreateProductTab(baseProduct = null) {
  state.rightPanelTab = "create";
  state.createDraft = defaultCreateDraft(baseProduct);
  renderRightPanelTabs();
  renderCreateProductPanel();
}

async function submitCreateProduct() {
  const draft = currentCreateDraft();
  const response = await fetch("/api/editor/products_v2/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      map_id: state.selectedMapId,
      name: draft.name,
      emoji: draft.emoji || "\u{1F4E6}",
      family_id: draft.family_id,
      logistics_type_id: draft.logistics_type_id,
      status: draft.status || "visible",
      inputs: draft.inputs || [],
      outputs: draft.outputs || [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || "Falha ao incluir o produto.");
  }
  state.rightPanelTab = "details";
  state.createDraft = defaultCreateDraft(payload.product || null);
  await reloadBootstrap({ selectedProductId: payload.product?.id || null, selectedCityId: state.selectedCityId, refitMap: false });
}

async function loadSelectedMap() {
  if (!state.selectedMapId) {
    return;
  }
  if (state.selectedMapId === state.bootstrap?.map_repository?.active_map_id) {
    renderStatus(messages().map_loaded || "Mapa de trabalho carregado no editor v1.");
    return;
  }

  const response = await fetch("/api/editor/maps/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ map_id: state.selectedMapId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    renderStatus(payload.detail || messages().map_load_failed || "Nao foi possivel carregar o mapa selecionado.");
    return;
  }

  await reloadBootstrap({ selectedProductId: state.selectedProductId, selectedCityId: state.selectedCityId, refitMap: true });
  renderStatus(messages().map_loaded || "Mapa de trabalho carregado no editor v1.");
}

function openShortcutsDialog() {
  const dialog = document.getElementById("product-editor-v1-shortcuts-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "open");
}

function closeShortcutsDialog() {
  const dialog = document.getElementById("product-editor-v1-shortcuts-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function isTextInput(target) {
  if (!target) {
    return false;
  }
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function setSelectedTool(tool) {
  state.selectedTool = tool === "select" ? "select" : "modify";
  syncControlState();
  renderHeader();
  syncBrushPreview();
  renderStatus(
    tool === "select"
      ? "Selecao de cidade ativa."
      : (messages().brush_ready || "Pincel pronto para editar o campo do produto."),
    [
    { label: "Ferramenta", value: toolLabel(state.selectedTool) },
    { label: "Raio", value: `${currentBrushRadiusKm()} km` },
    { label: "Intensidade", value: formatNumber(currentBrushIntensity(), 2) },
    ],
  );
}

function setBrushRadiusIndex(index) {
  state.brushRadiusIndex = clamp(Number(index), 0, BRUSH_RADII_KM.length - 1);
  syncControlState();
  renderHeader();
  syncBrushPreview();
}

function setBrushIntensityIndex(index) {
  state.brushIntensityIndex = clamp(Number(index), 0, BRUSH_INTENSITIES.length - 1);
  syncControlState();
  renderHeader();
  if (state.paintSession) {
    startPaintPulse();
  }
}

function currentPaintPulseIntervalMs() {
  return PAINT_PULSE_INTERVAL_MS[state.brushIntensityIndex] || PAINT_PULSE_INTERVAL_MS[1];
}

function currentPaintPulseRepeatCount() {
  return PAINT_PULSE_REPEAT_COUNT[state.brushIntensityIndex] || PAINT_PULSE_REPEAT_COUNT[1];
}

async function setSelectedLayer(layer) {
  if (layer !== "supply" && layer !== "demand") {
    return;
  }
  finalizePaintSession({ commit: true });
  state.selectedLayer = layer;
  await ensureFieldDocument(state.selectedProductId, layer);
  renderAll();
}

async function setSelectedProduct(productId) {
  if (!productId || !state.productsById[productId]) {
    return;
  }
  finalizePaintSession({ commit: true });
  state.selectedProductId = productId;
  await ensureFieldDocument(productId, state.selectedLayer);
  renderAll();
}

function strokeSpacingKm(radiusKm) {
  return Math.max(3, radiusKm * 0.08);
}

function buildStrokeForPoint(latlng, mode, originalEvent) {
  const strengthModifier = originalEvent?.shiftKey ? 1.75 : (originalEvent?.altKey ? 0.45 : 1);
  return normalizeStroke({
    id: `stroke_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    product_id: state.selectedProductId,
    layer: state.selectedLayer,
    tool: "paint",
    mode,
    radius_km: currentBrushRadiusKm(),
    intensity: currentBrushIntensity() * strengthModifier,
    falloff: "gaussian",
    created_at: new Date().toISOString(),
    points: [{ lat: latlng.lat, lon: latlng.lng }],
  }, state.selectedProductId, state.selectedLayer);
}

function beginPaintSession(latlng, mode, originalEvent) {
  const key = currentFieldKey();
  if (!key || !currentFieldDoc()) {
    return;
  }
  stopPaintPulse();
  state.mapPointerLatLng = latlng;
  state.paintSession = {
    fieldKey: key,
    stroke: buildStrokeForPoint(latlng, mode, originalEvent),
    lastLatLng: latlng,
    draggingWasEnabled: state.map?.dragging?.enabled?.() === true,
  };
  if (state.paintSession.draggingWasEnabled) {
    state.map.dragging.disable();
  }
  const nearestCity = closestCityForLatLng(latlng, 64);
  if (nearestCity) {
    state.selectedCityId = nearestCity.id;
  }
  startPaintPulse();
  renderMap();
  renderCityDetail();
}

function appendPointToPaintSession(latlng, { force = false } = {}) {
  if (!state.paintSession) {
    return false;
  }
  const lastLatLng = state.paintSession.lastLatLng;
  const minSpacingKm = strokeSpacingKm(Number(state.paintSession.stroke.radius_km || currentBrushRadiusKm()));
  if (!force && lastLatLng && haversineKm(lastLatLng.lat, lastLatLng.lng, latlng.lat, latlng.lng) < minSpacingKm) {
    return false;
  }
  state.paintSession.stroke.points.push({ lat: latlng.lat, lon: latlng.lng });
  state.paintSession.lastLatLng = latlng;
  return true;
}

function startPaintPulse() {
  stopPaintPulse();
  state.paintPulseTimer = window.setInterval(() => {
    if (!state.paintSession) {
      stopPaintPulse();
      return;
    }
    const pulseLatLng = state.mapPointerLatLng || state.paintSession.lastLatLng;
    if (!pulseLatLng) {
      return;
    }
    let didChange = false;
    for (let index = 0; index < currentPaintPulseRepeatCount(); index += 1) {
      didChange = appendPointToPaintSession(pulseLatLng, { force: true }) || didChange;
    }
    if (didChange) {
      renderMap();
      renderCityDetail();
    }
  }, currentPaintPulseIntervalMs());
}

function stopPaintPulse() {
  if (!state.paintPulseTimer) {
    return;
  }
  window.clearInterval(state.paintPulseTimer);
  state.paintPulseTimer = null;
}

function finalizePaintSession({ commit = true } = {}) {
  if (!state.paintSession) {
    stopPaintPulse();
    return;
  }
  stopPaintPulse();
  const session = state.paintSession;
  state.paintSession = null;
  if (session.draggingWasEnabled) {
    state.map?.dragging?.enable?.();
  }
  if (commit && session.stroke.points.length) {
    const doc = state.fieldDocsByKey[session.fieldKey];
    if (doc) {
      replaceCurrentFieldStrokes([...doc.strokes, session.stroke]);
    }
  }
  renderAll();
  if (commit && session.stroke.points.length) {
    void queueAutosaveCurrentField(messages().field_saved || "Alteracoes salvas automaticamente.");
  }
}

function buildCurrentFieldSavePayload() {
  const product = currentProduct();
  const doc = currentFieldDoc();
  const key = currentFieldKey();
  const mapEntry = currentMapEntry();
  if (!product || !doc || !key || !state.selectedMapId || !mapEntry) {
    return null;
  }

  const strokesSnapshot = deepClone(doc.strokes || []);
  const bakedCityValues = state.cities.map((city) => {
    const info = computeLayerInfo(product.id, city, state.selectedLayer);
    return {
      city_id: city.id,
      city_label: city.label || city.name || city.id,
      state_code: city.state_code || "",
      base_value: Number(info.value || 0),
      manual_delta: Number(info.manualDelta || 0),
      final_value: Number(info.finalValue || 0),
      source: info.source || "none",
      anchor_count: Number(info.anchorCount || 0),
      nearest_distance_km: info.nearestDistanceKm == null ? null : Number(info.nearestDistanceKm),
    };
  });

  return {
    map_id: state.selectedMapId,
    map_name: mapEntry.name || state.selectedMapId,
    product_id: product.id,
    layer: state.selectedLayer,
    strokes: strokesSnapshot,
    baked_city_values: bakedCityValues,
    updated_at: new Date().toISOString(),
    field_key: key,
    snapshot_serialized: serializeStrokes(strokesSnapshot),
  };
}

function queueAutosaveCurrentField(statusMessage = null) {
  finalizePaintSession({ commit: true });
  const payload = buildCurrentFieldSavePayload();
  if (!payload) {
    return Promise.resolve();
  }

  state.autosaveChain = state.autosaveChain
    .catch(() => null)
    .then(async () => {
      const response = await saveFieldDocument({
        map_id: payload.map_id,
        product_id: payload.product_id,
        layer: payload.layer,
        strokes: payload.strokes,
        baked_city_values: payload.baked_city_values,
        updated_at: payload.updated_at,
      });

      const currentSnapshot = serializeStrokes(state.fieldDocsByKey[payload.field_key]?.strokes || []);
      if (currentSnapshot === payload.snapshot_serialized) {
        state.fieldDocsByKey[payload.field_key] = normalizeFieldDoc(response?.field, payload.map_id, payload.product_id, payload.layer);
        state.fieldDocsByKey[payload.field_key].baked_city_values = response?.baked?.city_values || payload.baked_city_values;
        ensureHistoryEntry(payload.field_key, state.fieldDocsByKey[payload.field_key].strokes).savedSnapshot = payload.snapshot_serialized;
      }

      renderAll();
      renderStatus(statusMessage || messages().field_saved || "Alteracoes salvas automaticamente.", [
        { label: "Mapa", value: payload.map_name },
        { label: "Camada", value: layerLabel(payload.layer) },
        { label: "Cidades do mapa", value: `${payload.baked_city_values.length}` },
      ]);
    })
    .catch((error) => {
      renderStatus(error?.message || "Falha ao salvar automaticamente o campo editavel.");
    });

  return state.autosaveChain;
}

function bindColumnResizers() {
  const grid = document.getElementById("product-editor-v1-grid");
  if (!grid) {
    return;
  }

  Array.from(grid.querySelectorAll("[data-resizer]")).forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 1480px)").matches) {
        return;
      }

      event.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = event.clientX;
      const startLeft = parseCssPx("--product-left-col", 332);
      const startRight = parseCssPx("--product-right-col", 372);
      const resizerWidth = parseCssPx("--product-resizer-width", 10);
      const gap = parseCssPx("--product-panel-gap", 12) * 4;
      const minSide = parseCssPx("--product-side-min-col", 280);
      const minMap = parseCssPx("--product-map-min-col", 640);
      const gridWidth = grid.getBoundingClientRect().width;

      grid.classList.add("is-resizing");

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === "left") {
          const maxLeft = Math.max(minSide, gridWidth - startRight - (resizerWidth * 2) - gap - minMap);
          setCssPx("--product-left-col", clamp(startLeft + delta, minSide, maxLeft));
        }
        if (side === "right") {
          const maxRight = Math.max(minSide, gridWidth - startLeft - (resizerWidth * 2) - gap - minMap);
          setCssPx("--product-right-col", clamp(startRight - delta, minSide, maxRight));
        }
        invalidateMap();
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        grid.classList.remove("is-resizing");
        normalizeLayout();
        persistLayout();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  });
}

function bindMapInteractions() {
  if (!state.map || state.mapBound) {
    return;
  }

  state.map.getContainer().addEventListener("contextmenu", (event) => {
    if (state.selectedTool !== "select") {
      event.preventDefault();
    }
  });

  state.map.getContainer().addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, true);

  state.map.doubleClickZoom?.disable?.();

  state.map.on("mousemove", (event) => {
    state.mapPointerLatLng = event.latlng;
    syncBrushPreview();
    if (state.paintSession && appendPointToPaintSession(event.latlng)) {
      renderMap();
      renderCityDetail();
    }
  });

  state.map.on("mouseout", () => {
    state.mapPointerLatLng = null;
    syncBrushPreview();
  });

  state.map.on("mousedown", (event) => {
    if (state.selectedTool === "select") {
      return;
    }
    const button = Number(event.originalEvent?.button ?? 0);
    if (button !== 0 && button !== 2) {
      return;
    }
    event.originalEvent?.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    state.mapPointerLatLng = event.latlng;
    const mode = button === 2 ? "subtract" : "add";
    beginPaintSession(event.latlng, mode, event.originalEvent);
  });

  state.map.on("mouseup", () => {
    finalizePaintSession({ commit: true });
  });

  state.map.on("click", (event) => {
    if (state.selectedTool !== "select") {
      return;
    }
    const nearest = closestCityForLatLng(event.latlng, 48);
    if (!nearest) {
      return;
    }
    state.selectedCityId = nearest.id;
    renderAll();
  });

  window.addEventListener("mouseup", () => {
    finalizePaintSession({ commit: true });
  });

  state.mapBound = true;
}

function bindKeyboardShortcuts() {
  window.addEventListener("keydown", async (event) => {
    if (isTextInput(event.target)) {
      return;
    }
    const dialog = document.getElementById("product-editor-v1-shortcuts-dialog");
    if (dialog?.open && event.key !== "Escape") {
      return;
    }

    const lowerKey = String(event.key || "").toLowerCase();
    if (lowerKey === "c") {
      event.preventDefault();
      setSelectedTool("select");
      return;
    }
    if (lowerKey === "m") {
      event.preventDefault();
      setSelectedTool("modify");
      return;
    }
    if (["1", "2", "3", "4", "5"].includes(event.key)) {
      event.preventDefault();
      setBrushRadiusIndex(Number(event.key) - 1);
      return;
    }
    if (event.key === "[") {
      event.preventDefault();
      setBrushIntensityIndex(Math.max(0, state.brushIntensityIndex - 1));
      return;
    }
    if (event.key === "]") {
      event.preventDefault();
      setBrushIntensityIndex(Math.min(BRUSH_INTENSITIES.length - 1, state.brushIntensityIndex + 1));
      return;
    }
    if (lowerKey === "z") {
      event.preventDefault();
      undoCurrentField();
      return;
    }
    if (lowerKey === "y") {
      event.preventDefault();
      redoCurrentField();
      return;
    }
    if (event.key === "Escape" && dialog?.open) {
      event.preventDefault();
      closeShortcutsDialog();
    }
  });
}

function bindControls() {
  if (state.controlsBound) {
    return;
  }

  document.getElementById("product-editor-v1-map-select")?.addEventListener("change", (event) => {
    state.selectedMapId = event.target.value || "";
    void loadSelectedMap();
  });
  document.getElementById("product-editor-v1-family-filter")?.addEventListener("change", (event) => {
    state.filters.familyId = event.target.value || "";
    renderAll();
  });
  document.getElementById("product-editor-v1-logistics-filter")?.addEventListener("change", (event) => {
    state.filters.logisticsTypeId = event.target.value || "";
    renderAll();
  });
  document.getElementById("product-editor-v1-product-select")?.addEventListener("change", async (event) => {
    await setSelectedProduct(event.target.value || "");
  });
  document.getElementById("product-editor-v1-create-button")?.addEventListener("click", () => {
    openCreateProductTab(null);
  });
  document.getElementById("product-editor-v1-duplicate-button")?.addEventListener("click", () => {
    openCreateProductTab(currentProduct());
  });
  document.getElementById("product-editor-v1-tab-details")?.addEventListener("click", () => {
    state.rightPanelTab = "details";
    renderRightPanelTabs();
  });
  document.getElementById("product-editor-v1-tab-create")?.addEventListener("click", () => {
    state.rightPanelTab = "create";
    if (!state.createDraft) {
      state.createDraft = defaultCreateDraft(currentProduct());
    }
    renderRightPanelTabs();
    renderCreateProductPanel();
  });
  document.getElementById("product-editor-v1-create-name")?.addEventListener("input", (event) => {
    currentCreateDraft().name = event.target.value || "";
  });
  document.getElementById("product-editor-v1-create-emoji")?.addEventListener("change", (event) => {
    currentCreateDraft().emoji = event.target.value || PRODUCT_EMOJI_OPTIONS[0];
  });
  document.getElementById("product-editor-v1-create-family")?.addEventListener("change", (event) => {
    currentCreateDraft().family_id = event.target.value || state.familyCatalog.families[0]?.id || "agro";
  });
  document.getElementById("product-editor-v1-create-logistics")?.addEventListener("change", (event) => {
    currentCreateDraft().logistics_type_id = event.target.value || state.logisticsCatalog.types[0]?.id || "carga_geral_paletizada";
  });
  document.getElementById("product-editor-v1-create-status")?.addEventListener("change", (event) => {
    currentCreateDraft().status = event.target.value || "visible";
  });
  document.getElementById("product-editor-v1-create-inputs")?.addEventListener("change", (event) => {
    currentCreateDraft().inputs = selectedOptions(event.target);
  });
  document.getElementById("product-editor-v1-create-outputs")?.addEventListener("change", (event) => {
    currentCreateDraft().outputs = selectedOptions(event.target);
  });
  document.getElementById("product-editor-v1-create-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitCreateProduct();
      renderStatus("Produto incluido no catalogo do editor v2.");
    } catch (error) {
      renderStatus(error?.message || "Falha ao incluir o produto.");
    }
  });
  document.getElementById("product-editor-v1-layer-supply")?.addEventListener("click", async () => {
    await setSelectedLayer("supply");
  });
  document.getElementById("product-editor-v1-layer-demand")?.addEventListener("click", async () => {
    await setSelectedLayer("demand");
  });
  document.querySelectorAll("#product-editor-v1-tool-toggle [data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedTool(button.dataset.tool || "select");
    });
  });
  document.querySelectorAll("#product-editor-v1-radius-presets [data-radius-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setBrushRadiusIndex(Number(button.dataset.radiusIndex || 0));
    });
  });
  document.querySelectorAll("#product-editor-v1-intensity-presets [data-intensity-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setBrushIntensityIndex(Number(button.dataset.intensityIndex || 0));
    });
  });
  document.getElementById("product-editor-v1-undo-button")?.addEventListener("click", () => {
    undoCurrentField();
  });
  document.getElementById("product-editor-v1-redo-button")?.addEventListener("click", () => {
    redoCurrentField();
  });
  document.getElementById("product-editor-v1-header-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.actionId === "toggle-theme") {
      event.preventDefault();
      toggleTheme();
      return;
    }
    if (button.dataset.actionId === "open-shortcuts") {
      event.preventDefault();
      openShortcutsDialog();
    }
  });
  document.getElementById("product-editor-v1-shortcuts-dialog")?.addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog) {
      closeShortcutsDialog();
    }
  });

  window.addEventListener("resize", () => {
    normalizeLayout();
    syncBrushPreview();
  });

  bindColumnResizers();
  bindKeyboardShortcuts();
  state.controlsBound = true;
}

async function initialize() {
  await waitForLeaflet();
  const payload = await loadBootstrap();
  initializeState(payload);
  applyScreenCopy();
  bindControls();
  applyTheme(restoreTheme(), { persist: false });
  restoreLayout();
  const leafletSettings = {
    ...(state.bootstrap.map_editor?.leaflet_settings || {}),
    interaction: {
      ...((state.bootstrap.map_editor?.leaflet_settings || {}).interaction || {}),
      double_click_zoom_enabled: false,
    },
  };
  state.map = createBrasixMap({
    elementId: "product-editor-v1-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings,
  });
  state.map.doubleClickZoom?.disable?.();
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  bindMapInteractions();
  await ensureFieldDocument(state.selectedProductId, state.selectedLayer);
  renderAll();
}

initialize().catch((error) => {
  console.error("Brasix product editor v1 failed to initialize:", error);
  renderStatus(error?.message || "Falha ao iniciar o editor de produtos v1.");
});
