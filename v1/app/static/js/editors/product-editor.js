import { createBrasixMap, fitBrasixBounds } from "../shared/leaflet-map.js?v=20260327-route-legend-1";
import { escapeHtml, numberFormatter } from "../shared/formatters.js";

const LAYOUT_KEY = "brasix:v1:product-editor-layout";
const THEME_KEY = "brasix:v1:product-editor-theme";

const state = {
  bootstrap: null,
  screen: null,
  themesDocument: null,
  themesById: {},
  activeThemeId: null,
  map: null,
  layerGroup: null,
  cities: [],
  citiesById: {},
  referenceCitiesById: {},
  products: [],
  productsById: {},
  supplyByProduct: {},
  demandByProduct: {},
  anchorsByProduct: {},
  demandAnchorsByProduct: {},
  productStatsById: {},
  familyCatalog: { families: [] },
  logisticsCatalog: { types: [] },
  populationMedian: 1,
  selectedMapId: "",
  selectedProductId: "",
  selectedCityId: "",
  selectedLayer: "supply",
  filters: {
    familyId: "",
    logisticsTypeId: "",
  },
  controlsBound: false,
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

function loadBootstrap() {
  return fetch("/api/editor/products/bootstrap").then(async (response) => {
    if (!response.ok) {
      throw new Error(`Falha ao carregar bootstrap do editor de produtos (${response.status}).`);
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
        reject(new Error("Leaflet nao carregou a tempo para o editor de produtos."));
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

function normalizeLayout() {
  const grid = document.getElementById("product-editor-grid");
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

function invalidateMap() {
  if (!state.map) {
    return;
  }
  window.requestAnimationFrame(() => state.map.invalidateSize());
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
  applyCssVariables(state.bootstrap?.product_editor?.layout_desktop?.css_variables || {});
  applyCssVariables(theme.css_variables || {});
  if (persist) {
    persistTheme();
  }
}

function toggleTheme() {
  const nextThemeId = currentTheme()?.next_theme_id;
  if (!nextThemeId) {
    return;
  }
  applyTheme(nextThemeId);
  restoreLayout();
  renderHeader();
}

function formatNumber(value, digits = 1) {
  return numberFormatter(digits).format(Number(value || 0));
}

function renderStatus(message, meta = []) {
  const target = document.getElementById("product-editor-status");
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

function logisticsBodyLabels(logisticsTypeId) {
  return (state.logisticsCatalog.types || []).find((item) => item.id === logisticsTypeId)?.body_labels || [];
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
    ["product-editor-map-select-label", labels().map_select_label],
    ["product-editor-family-filter-label", labels().family_filter_label],
    ["product-editor-logistics-filter-label", labels().logistics_filter_label],
    ["product-editor-product-list-label", labels().product_list_label],
    ["product-editor-create-label", labels().create_button_label],
    ["product-editor-duplicate-button", labels().duplicate_button_label],
    ["product-editor-layer-toggle-label", labels().layer_toggle_label],
    ["product-editor-layer-supply", labels().supply_layer_label],
    ["product-editor-layer-demand", labels().demand_layer_label],
    ["product-editor-product-name-label", labels().product_name_label],
    ["product-editor-product-short-name-label", labels().product_short_name_label],
    ["product-editor-product-emoji-label", labels().product_emoji_label],
    ["product-editor-product-family-label", labels().product_family_label],
    ["product-editor-product-logistics-label", labels().product_logistics_label],
    ["product-editor-product-unit-label", labels().product_unit_label],
    ["product-editor-product-color-label", labels().product_color_label],
    ["product-editor-product-density-label", labels().product_density_label],
    ["product-editor-product-value-label", labels().product_value_label],
    ["product-editor-product-status-label", labels().product_status_label],
    ["product-editor-save-label", labels().product_save_button_label],
    ["product-editor-city-panel-title", labels().city_panel_title],
  ];

  copyMap.forEach(([id, value]) => {
    const target = document.getElementById(id);
    if (target && value) {
      target.textContent = value;
    }
  });
}

function explicitEntry(matrixByProduct, productId, cityId) {
  return matrixByProduct?.[productId]?.[cityId] || null;
}

function computeSupply(productId, city) {
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

function computeDemand(productId, city) {
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
  state.screen = payload.product_editor?.screen || {};
  state.themesDocument = payload.product_editor?.themes || {};
  state.themesById = Object.fromEntries((state.themesDocument.themes || []).map((item) => [item.id, item]));

  state.cities = [...(payload.cities || [])].sort((left, right) => String(left.label || "").localeCompare(String(right.label || ""), "pt-BR"));
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.referenceCitiesById = Object.fromEntries((payload.reference_cities || []).map((city) => [city.id, city]));
  state.products = [...(payload.product_catalog?.products || [])].sort((left, right) => (Number(left.order || 0) - Number(right.order || 0)) || String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
  state.productsById = Object.fromEntries(state.products.map((product) => [product.id, product]));
  state.familyCatalog = payload.product_family_catalog || { families: [] };
  state.logisticsCatalog = payload.product_logistics_type_catalog || { types: [] };
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

  state.populationMedian = median(state.cities.map((city) => Number(city.population_thousands || 0)).filter((value) => value > 0));
  state.selectedMapId = payload.map_repository?.active_map_id || "";
  state.selectedProductId = payload.summary?.selected_product_id || state.products[0]?.id || "";
  state.selectedCityId = state.cities[0]?.id || "";
}

function renderHeader() {
  const badges = document.getElementById("product-editor-header-badges");
  const actions = document.getElementById("product-editor-header-actions");
  const product = currentProduct();
  const mapEntry = currentMapEntry();

  if (badges) {
    badges.innerHTML = `
      <span class="product-editor-header-pill">${escapeHtml(mapEntry?.name || "Mapa")}</span>
      <span class="product-editor-header-pill">${escapeHtml(`${state.products.length} produtos`)}</span>
      <span class="product-editor-header-pill">${escapeHtml(`${state.cities.length} cidades`)}</span>
      <span class="product-editor-header-pill">${escapeHtml(state.selectedLayer === "supply" ? "Oferta" : "Demanda")}</span>
      <span class="product-editor-header-pill">${escapeHtml(product?.name || "-")}</span>
    `;
  }

  if (actions) {
    const theme = currentTheme();
    actions.innerHTML = (state.screen?.header_actions || []).map((action) => {
      if (action.action === "toggle-theme") {
        return `
          <button class="editor-header-action" type="button" data-action="toggle-theme">
            <span class="material-symbols-outlined">${escapeHtml(theme?.toggle_action_icon || action.icon || "dark_mode")}</span>
            <span>${escapeHtml(theme?.toggle_action_label || action.label || "Tema")}</span>
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
    "product-editor-map-select",
    (state.bootstrap?.map_repository?.maps || []).map((item) => ({ id: item.id, label: item.name })),
    state.selectedMapId,
  );
  renderSelectOptions("product-editor-family-filter", state.familyCatalog.families || [], state.filters.familyId, labels().all_option_label || "Todos");
  renderSelectOptions("product-editor-logistics-filter", state.logisticsCatalog.types || [], state.filters.logisticsTypeId, labels().all_option_label || "Todos");
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
  const target = document.getElementById("product-editor-product-select");
  const summary = document.getElementById("product-editor-list-summary");
  if (!target) {
    return;
  }
  const visible = filteredProducts();
  if (visible.length && !visible.some((product) => product.id === state.selectedProductId)) {
    state.selectedProductId = visible[0].id;
  }
  const selectedStats = state.productStatsById[state.selectedProductId] || {};
  if (summary) {
    summary.textContent = `${visible.length} ${labels().list_count_label || "produtos visiveis"} • ${selectedStats.anchor_count || 0} ancoras do produto atual`;
  }
  if (!visible.length) {
    target.innerHTML = "";
    target.disabled = true;
    return;
  }
  target.disabled = false;
  target.innerHTML = visible.map((product) => (
    `<option value="${escapeHtml(product.id)}">${escapeHtml(`${product.emoji || "📦"} ${product.name}`.trim())}</option>`
  )).join("");
  target.value = state.selectedProductId;
}

function renderProductForm() {
  const product = currentProduct();
  if (!product) {
    return;
  }
  renderSelectOptions("product-editor-product-family-select", state.familyCatalog.families || [], product.family_id);
  renderSelectOptions("product-editor-product-logistics-select", state.logisticsCatalog.types || [], product.logistics_type_id);

  const values = {
    "product-editor-product-name-input": product.name || "",
    "product-editor-product-short-name-input": product.short_name || "",
    "product-editor-product-emoji-input": product.emoji || "",
    "product-editor-product-unit-input": product.unit || "",
    "product-editor-product-color-input": product.color || "#4f8593",
    "product-editor-product-density-select": product.density_class || "medium",
    "product-editor-product-value-select": product.value_class || "medium",
  };
  Object.entries(values).forEach(([id, value]) => {
    const target = document.getElementById(id);
    if (target) {
      target.value = value;
    }
  });

  const checks = {
    "product-editor-product-active-input": Boolean(product.is_active),
    "product-editor-product-perishable-input": Boolean(product.perishable),
    "product-editor-product-fragile-input": Boolean(product.fragile),
    "product-editor-product-hazardous-input": Boolean(product.hazardous),
    "product-editor-product-temperature-input": Boolean(product.temperature_control_required),
  };
  Object.entries(checks).forEach(([id, checked]) => {
    const target = document.getElementById(id);
    if (target) {
      target.checked = checked;
    }
  });
}

function renderCityDetail() {
  const target = document.getElementById("product-editor-city-detail");
  const city = currentCity();
  const product = currentProduct();
  if (!target || !city || !product) {
    return;
  }

  const supply = computeSupply(product.id, city);
  const demand = computeDemand(product.id, city);
  const supplyBasis = supply.source === "interpolated"
    ? `${supply.anchorCount || 0} ancoras • ${formatNumber(supply.nearestDistanceKm || 0, 0)} km`
    : (supply.source === "observed" ? "Matriz observada" : "Sem ancoras proximas");

  target.innerHTML = `
    <div class="product-editor-city-grid">
      <div class="product-editor-city-metric is-span-2">
        <span>${escapeHtml(city.label || city.name || "-")}</span>
        <strong>${escapeHtml(product.name || "-")}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>${escapeHtml(labels().city_state_label || "UF")}</span>
        <strong>${escapeHtml(city.state_code || "-")}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>${escapeHtml(labels().city_population_label || "Populacao")}</span>
        <strong>${escapeHtml(`${formatNumber(city.population_thousands || 0, 0)} mil`)}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>${escapeHtml(labels().city_supply_label || "Oferta exibida")}</span>
        <strong>${escapeHtml(`${formatNumber(supply.value, supply.value >= 100 ? 0 : 1)} ${product.unit}`)}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>${escapeHtml(labels().city_supply_source_label || "Origem da oferta")}</span>
        <strong>${escapeHtml(sourceLabel(supply.source))}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>Base da oferta</span>
        <strong>${escapeHtml(supplyBasis)}</strong>
      </div>
      <div class="product-editor-city-metric">
        <span>${escapeHtml(labels().city_demand_label || "Demanda exibida")}</span>
        <strong>${escapeHtml(`${formatNumber(demand.value, demand.value >= 100 ? 0 : 1)} ${product.unit}`)}</strong>
      </div>
      <div class="product-editor-city-metric is-span-2">
        <span>Implementos</span>
        <strong>${escapeHtml(logisticsBodyLabels(product.logistics_type_id).join(", ") || "-")}</strong>
      </div>
    </div>
    <div class="product-editor-city-note">${escapeHtml(labels().pending_city_edit_label || "")}</div>
  `;
}

function renderLegend(maxValue, product) {
  const target = document.getElementById("product-editor-map-legend");
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
          <strong>${escapeHtml(`${formatNumber(value, value >= 100 ? 0 : 1)} ${product.unit}`)}</strong>
        </div>
      `).join("")}
      <div class="product-editor-legend-note">
        <span>Contorno branco = ancora observada</span>
        <span>Contorno colorido = valor inferido</span>
      </div>
    </div>
  `;
}

function renderMap() {
  const product = currentProduct();
  if (!state.map || !product) {
    return;
  }

  const rows = state.cities.map((city) => {
    const info = state.selectedLayer === "supply" ? computeSupply(product.id, city) : computeDemand(product.id, city);
    return { city, ...info };
  });
  const maxValue = Math.max(...rows.map((row) => Number(row.value || 0)), 0);
  if (!state.layerGroup) {
    state.layerGroup = window.L.layerGroup().addTo(state.map);
  }
  state.layerGroup.clearLayers();

  rows.slice().sort((left, right) => left.value - right.value).forEach((row) => {
    const radius = maxValue > 0 ? 4 + ((Math.log1p(Math.max(row.value, 0)) / Math.log1p(maxValue || 1)) * 18) : 4;
    const selected = row.city.id === state.selectedCityId;
    const marker = window.L.circleMarker([row.city.latitude, row.city.longitude], {
      pane: "brasix-markers",
      radius: selected ? radius + 2 : radius,
      color: selected ? "#8c4f10" : (row.source === "observed" ? "#ffffff" : (product.color || "#4f8593")),
      weight: selected ? 2.2 : (row.source === "observed" ? 1.8 : 1.1),
      fillColor: product.color || "#4f8593",
      fillOpacity: row.source === "observed" ? 0.76 : 0.24,
    });
    marker.on("click", () => {
      state.selectedCityId = row.city.id;
      renderMap();
      renderCityDetail();
    });
    marker.bindTooltip(
      `${escapeHtml(row.city.label)}<br>${escapeHtml(product.name)}: ${escapeHtml(`${formatNumber(row.value, row.value >= 100 ? 0 : 1)} ${product.unit}`)}<br>${escapeHtml(sourceLabel(row.source))}`,
    );
    marker.addTo(state.layerGroup);
  });

  const selection = document.getElementById("product-editor-map-selection");
  if (selection) {
    const mapEntry = currentMapEntry();
    selection.innerHTML = `
      <span class="product-editor-header-pill">${escapeHtml(mapEntry?.name || "Mapa")}</span>
      <span class="product-editor-map-pill" style="--product-pill-color:${escapeHtml(product.color || "#4f8593")}">${escapeHtml(`${product.emoji || ""} ${product.name}`.trim())}</span>
    `;
  }

  renderLegend(maxValue, product);
  renderStatus(messages().idle || "Editor pronto.", [
    { label: "Camada", value: state.selectedLayer === "supply" ? "Oferta" : "Demanda" },
    { label: "Ancora", value: `${state.productStatsById[product.id]?.anchor_count || 0} cidades` },
    { label: "Observadas", value: `${rows.filter((row) => row.source === "observed").length}` },
    { label: "Inferidas", value: `${rows.filter((row) => row.source !== "observed" && row.value > 0).length}` },
  ]);
  invalidateMap();
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
  renderFilters();
  renderHeader();
  renderProductList();
  renderProductForm();
  renderCityDetail();
  renderMap();
  if (state.map && refitMap) {
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    return;
  }
  invalidateMap();
}

async function createProductFrom(sourceProductId = null) {
  const baseProduct = sourceProductId ? state.productsById[sourceProductId] : currentProduct();
  const productName = window.prompt("Nome do produto:");
  if (!productName) {
    return;
  }
  const response = await fetch("/api/editor/products/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: productName,
      emoji: baseProduct?.emoji || "\ud83d\udce6",
      family_id: baseProduct?.family_id || state.familyCatalog.families[0]?.id || "agro",
      logistics_type_id: baseProduct?.logistics_type_id || state.logisticsCatalog.types[0]?.id || "carga_geral_paletizada",
      unit: baseProduct?.unit || "un",
      source_product_id: sourceProductId,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || "Falha ao criar o produto.");
  }
  await reloadBootstrap({ selectedProductId: payload.product?.id || null, selectedCityId: state.selectedCityId, refitMap: false });
  renderStatus(sourceProductId ? messages().product_duplicated : messages().product_created);
}

async function saveCurrentProduct(event) {
  event.preventDefault();
  const product = currentProduct();
  if (!product) {
    return;
  }
  const response = await fetch(`/api/editor/products/products/${encodeURIComponent(product.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("product-editor-product-name-input")?.value || "",
      short_name: document.getElementById("product-editor-product-short-name-input")?.value || "",
      emoji: document.getElementById("product-editor-product-emoji-input")?.value || "",
      family_id: document.getElementById("product-editor-product-family-select")?.value || "",
      logistics_type_id: document.getElementById("product-editor-product-logistics-select")?.value || "",
      unit: document.getElementById("product-editor-product-unit-input")?.value || "",
      color: document.getElementById("product-editor-product-color-input")?.value || "",
      density_class: document.getElementById("product-editor-product-density-select")?.value || "",
      value_class: document.getElementById("product-editor-product-value-select")?.value || "",
      is_active: Boolean(document.getElementById("product-editor-product-active-input")?.checked),
      perishable: Boolean(document.getElementById("product-editor-product-perishable-input")?.checked),
      fragile: Boolean(document.getElementById("product-editor-product-fragile-input")?.checked),
      hazardous: Boolean(document.getElementById("product-editor-product-hazardous-input")?.checked),
      temperature_control_required: Boolean(document.getElementById("product-editor-product-temperature-input")?.checked),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || "Falha ao salvar o produto.");
  }
  await reloadBootstrap({ selectedProductId: payload.product?.id || product.id, selectedCityId: state.selectedCityId, refitMap: false });
  renderStatus(messages().product_updated || "Produto salvo.");
}

async function loadSelectedMap() {
  if (!state.selectedMapId) {
    return;
  }
  if (state.selectedMapId === state.bootstrap?.map_repository?.active_map_id) {
    renderStatus(messages().map_loaded || "Mapa de trabalho carregado no editor de produtos.");
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
  renderStatus(messages().map_loaded || "Mapa de trabalho carregado no editor de produtos.");
}

function bindColumnResizers() {
  const grid = document.getElementById("product-editor-grid");
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

function bindControls() {
  if (state.controlsBound) {
    return;
  }

  document.getElementById("product-editor-map-select")?.addEventListener("change", (event) => {
    state.selectedMapId = event.target.value || "";
    void loadSelectedMap();
  });
  document.getElementById("product-editor-family-filter")?.addEventListener("change", (event) => {
    state.filters.familyId = event.target.value || "";
    renderProductList();
    renderHeader();
    renderProductForm();
    renderCityDetail();
    renderMap();
  });
  document.getElementById("product-editor-logistics-filter")?.addEventListener("change", (event) => {
    state.filters.logisticsTypeId = event.target.value || "";
    renderProductList();
    renderHeader();
    renderProductForm();
    renderCityDetail();
    renderMap();
  });
  document.getElementById("product-editor-product-select")?.addEventListener("change", (event) => {
    const productId = event.target.value || "";
    if (!productId || !state.productsById[productId]) {
      return;
    }
    state.selectedProductId = productId;
    renderHeader();
    renderProductList();
    renderProductForm();
    renderCityDetail();
    renderMap();
  });
  document.getElementById("product-editor-create-button")?.addEventListener("click", async () => {
    try {
      await createProductFrom(null);
    } catch (error) {
      renderStatus(error?.message || "Falha ao criar o produto.");
    }
  });
  document.getElementById("product-editor-duplicate-button")?.addEventListener("click", async () => {
    if (!currentProduct()) {
      return;
    }
    try {
      await createProductFrom(currentProduct().id);
    } catch (error) {
      renderStatus(error?.message || "Falha ao duplicar o produto.");
    }
  });
  document.getElementById("product-editor-layer-supply")?.addEventListener("click", () => {
    state.selectedLayer = "supply";
    document.getElementById("product-editor-layer-supply")?.classList.add("is-active");
    document.getElementById("product-editor-layer-demand")?.classList.remove("is-active");
    renderHeader();
    renderMap();
  });
  document.getElementById("product-editor-layer-demand")?.addEventListener("click", () => {
    state.selectedLayer = "demand";
    document.getElementById("product-editor-layer-demand")?.classList.add("is-active");
    document.getElementById("product-editor-layer-supply")?.classList.remove("is-active");
    renderHeader();
    renderMap();
  });
  document.getElementById("product-editor-header-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='toggle-theme']");
    if (!button) {
      return;
    }
    event.preventDefault();
    toggleTheme();
  });
  document.getElementById("product-editor-product-form")?.addEventListener("submit", async (event) => {
    try {
      await saveCurrentProduct(event);
    } catch (error) {
      renderStatus(error?.message || "Falha ao salvar o produto.");
    }
  });

  window.addEventListener("resize", () => {
    normalizeLayout();
  });

  bindColumnResizers();
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
  renderFilters();
  renderHeader();
  state.map = createBrasixMap({
    elementId: "product-editor-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
  });
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  renderProductList();
  renderProductForm();
  renderCityDetail();
  renderMap();
}

initialize().catch((error) => {
  console.error("Brasix product editor failed to initialize:", error);
  renderStatus(error?.message || "Falha ao iniciar o editor de produtos.");
});
