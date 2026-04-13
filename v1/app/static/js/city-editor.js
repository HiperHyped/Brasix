import { BRASIX_SYNC_KEY, broadcastSync, readSyncToken } from "./shared/app-sync.js";
import {
  applyBrasixLeafletSettings,
  buildBezierLikeLatLngs,
  createBrasixMap,
  createCityMarker,
  findPopulationBand,
  fitBrasixBounds,
  sortPopulationBands,
} from "./shared/leaflet-map.js?v=20260409-city-editor-2";
import { escapeHtml, numberFormatter, roundNumber } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:city-editor-theme";
const FLOW_PATH_COLORS = {
  primary: "#6b7d2e",
  secondary: "#8c4f10",
  highlight: "#d4741f",
  outline: "rgba(255, 249, 234, 0.9)",
};
const CITY_EDITOR_ROUTE_PANE = "brasix-city-editor-routes";
const CITY_EDITOR_ACTIVE_PANE = "brasix-city-editor-active-routes";
const INITIAL_COLLAPSED = {
  supply: false,
  demand: false,
  outbound: false,
  inbound: false,
};

const state = {
  bootstrap: null,
  map: null,
  mapEventsBound: false,
  mapLayers: {
    routes: null,
    highlights: null,
  },
  markerLayer: null,
  markersByCityId: {},
  cities: [],
  citiesById: {},
  pinsById: {},
  products: [],
  productsById: {},
  freightFlows: [],
  freightFlowsById: {},
  productValuesByLayer: {
    supply: {},
    demand: {},
  },
  flowTotalsByDirection: {
    outbound: {},
    inbound: {},
  },
  populationBands: [],
  selectedCityId: "",
  activeCityId: "",
  collapsed: { ...INITIAL_COLLAPSED },
  draftsByCityId: {},
  activeDraftSection: "outbound",
  pickMode: null,
  sectionStatus: {
    products: { kind: "idle", message: "" },
    freights: { kind: "idle", message: "" },
  },
  syncToken: null,
  isRefreshing: false,
};

const refs = {
  headerBadges: document.getElementById("city-editor-header-badges"),
  mapStage: document.getElementById("city-editor-map-stage"),
  mapStatus: document.getElementById("city-editor-map-status"),
  mapReset: document.getElementById("city-editor-map-reset"),
  themeToggle: document.getElementById("city-editor-theme-toggle"),
  infoPanel: document.getElementById("city-editor-info-panel"),
  productsPanel: document.getElementById("city-editor-products-panel"),
  productsStatus: document.getElementById("city-editor-products-status"),
  freightsPanel: document.getElementById("city-editor-freights-panel"),
  freightsStatus: document.getElementById("city-editor-freights-status"),
};

function formatInteger(value) {
  return numberFormatter(0).format(Number(value || 0));
}

function formatDecimal(value, digits = 1) {
  return numberFormatter(digits).format(Number(value || 0));
}

function formatTonnes(value) {
  const numericValue = Number(value || 0);
  const digits = Math.abs(numericValue) >= 100 ? 0 : 1;
  return `${numberFormatter(digits).format(roundNumber(numericValue, 3))} t`;
}

function formatDistanceKm(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormatter(digits).format(roundNumber(numericValue, 1))} km`;
}

function formatPopulation(value) {
  return `${formatDecimal(value, value >= 100 ? 0 : 1)} mil hab`;
}

function normalizeTheme(theme) {
  return theme === "night" ? "night" : "day";
}

function getStoredTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_KEY));
  } catch (_error) {
    return "day";
  }
}

function setTheme(theme) {
  const normalized = normalizeTheme(theme);
  document.documentElement.classList.add("city-editor-page");
  document.documentElement.dataset.editorTheme = normalized;
  try {
    window.localStorage.setItem(THEME_KEY, normalized);
  } catch (_error) {
    // noop
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

function currentCity() {
  return state.citiesById[state.activeCityId] || state.citiesById[state.selectedCityId] || state.cities[0] || null;
}

function cityLabel(cityId) {
  return state.citiesById[cityId]?.label || "";
}

function productLabel(productId) {
  const product = state.productsById[productId];
  if (!product) {
    return "Produto";
  }
  return `${product.emoji} ${product.name}`.trim();
}

function productOptionsMarkup(selectedProductId) {
  return state.products
    .map((product) => {
      const selected = product.id === selectedProductId ? " selected" : "";
      return `<option value="${escapeHtml(product.id)}"${selected}>${escapeHtml(productLabel(product.id))}</option>`;
    })
    .join("");
}

function ensureCityDrafts(cityId) {
  const safeCityId = String(cityId || "").trim();
  if (!safeCityId) {
    return { outbound: null, inbound: null };
  }
  if (!state.draftsByCityId[safeCityId]) {
    state.draftsByCityId[safeCityId] = {
      outbound: null,
      inbound: null,
    };
  }
  return state.draftsByCityId[safeCityId];
}

function currentDraft(section, cityId = state.selectedCityId) {
  return ensureCityDrafts(cityId)[section] || null;
}

function updateDraft(section, cityId, nextDraft) {
  ensureCityDrafts(cityId)[section] = nextDraft;
}

function flowDirectionKey(section) {
  return section === "outbound" ? "origin_id" : "destination_id";
}

function flowsForCity(cityId, section) {
  const matchKey = flowDirectionKey(section);
  return state.freightFlows.filter((flow) => flow[matchKey] === cityId);
}

function cityProductKey(cityId, productId) {
  return `${String(cityId || "").trim()}::${String(productId || "").trim()}`;
}

function indexedValue(index, cityId, productId) {
  return Number(index[cityProductKey(cityId, productId)] || 0);
}

function incrementIndexedValue(index, cityId, productId, value) {
  const key = cityProductKey(cityId, productId);
  index[key] = roundNumber(Number(index[key] || 0) + Number(value || 0), 3);
}

function rebuildDerivedMetrics() {
  const supply = {};
  const demand = {};
  state.cities.forEach((city) => {
    (city.supply_items || []).forEach((item) => incrementIndexedValue(supply, city.id, item.product_id, item.value));
    (city.demand_items || []).forEach((item) => incrementIndexedValue(demand, city.id, item.product_id, item.value));
  });

  const outbound = {};
  const inbound = {};
  state.freightFlows.forEach((flow) => {
    incrementIndexedValue(outbound, flow.origin_id, flow.product_id, flow.quantity_t);
    incrementIndexedValue(inbound, flow.destination_id, flow.product_id, flow.quantity_t);
  });

  state.productValuesByLayer = { supply, demand };
  state.flowTotalsByDirection = { outbound, inbound };
}

function productValueForCity(cityId, productId, layer) {
  return indexedValue(state.productValuesByLayer[layer] || {}, cityId, productId);
}

function freightTotalForCityProduct(cityId, productId, direction) {
  return indexedValue(state.flowTotalsByDirection[direction] || {}, cityId, productId);
}

function productBalanceSnapshot(cityId, productId) {
  const supplyValue = productValueForCity(cityId, productId, "supply");
  const demandValue = productValueForCity(cityId, productId, "demand");
  const outboundTotal = freightTotalForCityProduct(cityId, productId, "outbound");
  const inboundTotal = freightTotalForCityProduct(cityId, productId, "inbound");
  return {
    supplyValue,
    demandValue,
    outboundTotal,
    inboundTotal,
    supplyBalance: roundNumber(supplyValue - outboundTotal, 3),
    demandBalance: roundNumber(demandValue - inboundTotal, 3),
  };
}

function sectionBalanceForProduct(cityId, productId, section) {
  const balances = productBalanceSnapshot(cityId, productId);
  return section === "outbound" || section === "supply"
    ? balances.supplyBalance
    : balances.demandBalance;
}

function availableSupplyForFlow(productId, originId, excludeFlowId = "") {
  const currentFlowQuantity = excludeFlowId ? Number(state.freightFlowsById[excludeFlowId]?.quantity_t || 0) : 0;
  const outboundAllocated = Math.max(0, freightTotalForCityProduct(originId, productId, "outbound") - currentFlowQuantity);
  return roundNumber(Math.max(0, productValueForCity(originId, productId, "supply") - outboundAllocated), 3);
}

function referenceQuantityForSection(cityId, section, draft = null) {
  const city = state.citiesById[cityId];
  const activeDraft = draft || currentDraft(section, cityId) || {
    productId: defaultDraftProductId(city),
    originId: section === "outbound" ? cityId : "",
    destinationId: section === "inbound" ? cityId : "",
  };
  if (!activeDraft?.productId || !activeDraft?.originId) {
    return 0;
  }
  return availableSupplyForFlow(activeDraft.productId, activeDraft.originId, customFlowId(activeDraft));
}

function freightLimitMessage(productId, originId, maxQuantity) {
  const productName = state.productsById[productId]?.name || "Produto";
  const originName = cityLabel(originId) || "origem";
  return `${productName}: saldo maximo em ${originName} é ${formatTonnes(maxQuantity)}`;
}

function defaultDraftProductId(city) {
  return city?.top_products?.[0]?.id || state.products[0]?.id || "";
}

function createDraft(section, city) {
  const cityId = city?.id || "";
  const draft = {
    productId: defaultDraftProductId(city),
    originId: section === "outbound" ? cityId : "",
    destinationId: section === "inbound" ? cityId : "",
    quantityT: 0,
  };
  draft.quantityT = referenceQuantityForSection(cityId, section, draft);
  return draft;
}

function customFlowId(draft) {
  return `custom::${draft.productId || "produto"}::${draft.originId || "origem"}::${draft.destinationId || "destino"}`;
}

function draftIsComplete(draft) {
  return Boolean(draft?.productId && draft?.originId && draft?.destinationId) && Number(draft?.quantityT || 0) > 0;
}

function findNearestCityByLatLng(latlng, thresholdPx = 14) {
  if (!state.map || !latlng) {
    return null;
  }
  const targetPoint = state.map.latLngToContainerPoint(latlng);
  let nearestCity = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.cities.forEach((city) => {
    const cityPoint = state.map.latLngToContainerPoint([Number(city.latitude || 0), Number(city.longitude || 0)]);
    const distance = Math.hypot(targetPoint.x - cityPoint.x, targetPoint.y - cityPoint.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
    }
  });
  return nearestDistance <= thresholdPx ? nearestCity : null;
}

function pathWeight(flow, maxQuantity) {
  const ratio = maxQuantity > 0 ? Number(flow.quantity_t || 0) / maxQuantity : 0;
  return 1.35 + (Math.pow(ratio, 0.72) * 6.4);
}

function stableHash(value) {
  return Array.from(String(value || "")).reduce((hash, char) => ((hash * 33) + char.charCodeAt(0)) >>> 0, 5381);
}

function interpolateLatLng(start, end, ratio) {
  return [
    start[0] + ((end[0] - start[0]) * ratio),
    start[1] + ((end[1] - start[1]) * ratio),
  ];
}

function parseHexColor(value) {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("#")) {
    return null;
  }
  const hex = normalized.slice(1);
  if (hex.length === 3) {
    return {
      r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
      g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function mixColors(left, right, ratio) {
  return {
    r: Math.round(left.r + ((right.r - left.r) * ratio)),
    g: Math.round(left.g + ((right.g - left.g) * ratio)),
    b: Math.round(left.b + ((right.b - left.b) * ratio)),
  };
}

function colorToCss(color, opacity = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
}

function gradientColorForIndex(baseColor, index, total, isActive) {
  const base = parseHexColor(baseColor) || parseHexColor(FLOW_PATH_COLORS.primary) || { r: 107, g: 125, b: 46 };
  const progress = total <= 1 ? 1 : index / (total - 1);
  const light = mixColors(base, { r: 255, g: 255, b: 255 }, isActive ? 0.42 : 0.58);
  const dark = mixColors(base, { r: 24, g: 18, b: 12 }, isActive ? 0.12 : 0.18);
  return colorToCss(mixColors(light, dark, progress), isActive ? 0.96 : (0.52 + (progress * 0.18)));
}

function buildGradientSlices(latlngs, sliceCount = 7) {
  if (!Array.isArray(latlngs) || latlngs.length < 2) {
    return [];
  }
  const segmentCount = Math.min(sliceCount, latlngs.length - 1);
  const slices = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const startIndex = Math.floor((index * (latlngs.length - 1)) / segmentCount);
    const endIndex = Math.min(
      latlngs.length - 1,
      Math.max(startIndex + 1, Math.ceil(((index + 1) * (latlngs.length - 1)) / segmentCount)),
    );
    const slice = latlngs.slice(startIndex, endIndex + 1);
    if (slice.length >= 2) {
      slices.push(slice);
    }
  }
  return slices;
}

function buildCurvedFlowLatLngs(flow) {
  const origin = state.citiesById[flow.origin_id];
  const destination = state.citiesById[flow.destination_id];
  if (!origin || !destination) {
    return [];
  }
  const start = [origin.latitude, origin.longitude];
  const end = [destination.latitude, destination.longitude];
  const deltaLat = end[0] - start[0];
  const deltaLng = end[1] - start[1];
  const distance = Math.hypot(deltaLat, deltaLng);
  if (distance < 0.01) {
    return [start, end];
  }
  const normalLat = -deltaLng / distance;
  const normalLng = deltaLat / distance;
  const bendSign = stableHash(flow.id) % 2 === 0 ? 1 : -1;
  const bendRatio = 0.06 + ((Math.min(Number(flow.distance_km || 0), 2600) / 2600) * 0.04);
  const bend = distance * bendRatio * bendSign;
  const midpoint = interpolateLatLng(start, end, 0.5);
  const control = [
    midpoint[0] + (normalLat * bend),
    midpoint[1] + (normalLng * bend),
  ];
  return buildBezierLikeLatLngs([start, control, end], 18);
}

function ensureRouteLayers() {
  if (!state.map) {
    return;
  }
  if (!state.map.getPane(CITY_EDITOR_ROUTE_PANE)) {
    state.map.createPane(CITY_EDITOR_ROUTE_PANE);
    state.map.getPane(CITY_EDITOR_ROUTE_PANE).style.zIndex = "480";
  }
  if (!state.map.getPane(CITY_EDITOR_ACTIVE_PANE)) {
    state.map.createPane(CITY_EDITOR_ACTIVE_PANE);
    state.map.getPane(CITY_EDITOR_ACTIVE_PANE).style.zIndex = "490";
  }
  if (!state.mapLayers.routes) {
    state.mapLayers.routes = window.L.layerGroup().addTo(state.map);
  }
  if (!state.mapLayers.highlights) {
    state.mapLayers.highlights = window.L.layerGroup().addTo(state.map);
  }
}

function renderFlowRoute(flow, maxQuantity, isActive = false) {
  const curveLatLngs = buildCurvedFlowLatLngs(flow);
  if (curveLatLngs.length < 2) {
    return;
  }
  const slices = buildGradientSlices(curveLatLngs, isActive ? 8 : 7);
  const layerGroup = isActive ? state.mapLayers.highlights : state.mapLayers.routes;
  const pane = isActive ? CITY_EDITOR_ACTIVE_PANE : CITY_EDITOR_ROUTE_PANE;
  const weight = pathWeight(flow, maxQuantity);
  const routeBaseColor = isActive ? FLOW_PATH_COLORS.highlight : (state.productsById[flow.product_id]?.color || FLOW_PATH_COLORS.primary);
  window.L.polyline(curveLatLngs, {
    pane,
    color: "#ffffff",
    weight: Math.max(weight + 10, 12),
    opacity: 0.001,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(layerGroup);
  if (isActive) {
    window.L.polyline(curveLatLngs, {
      pane,
      color: FLOW_PATH_COLORS.outline,
      weight: weight + 2.6,
      opacity: 0.94,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(layerGroup);
  }
  slices.forEach((slice, index) => {
    window.L.polyline(slice, {
      pane,
      color: gradientColorForIndex(routeBaseColor, index, slices.length, isActive),
      weight,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(layerGroup);
  });
}

function renderSelectedCityRoutes() {
  ensureRouteLayers();
  if (!state.mapLayers.routes || !state.mapLayers.highlights) {
    return;
  }
  state.mapLayers.routes.clearLayers();
  state.mapLayers.highlights.clearLayers();
  const cityId = state.selectedCityId || currentCity()?.id;
  if (!cityId) {
    return;
  }
  const flows = state.freightFlows.filter((flow) => (
    (flow.origin_id === cityId || flow.destination_id === cityId)
    && Number(flow.quantity_t || 0) > 0
  ));
  if (!flows.length) {
    return;
  }
  const maxQuantity = Math.max(...flows.map((flow) => Number(flow.quantity_t || 0)), 0);
  flows.forEach((flow) => renderFlowRoute(flow, maxQuantity, false));
}

function setSectionStatus(section, kind, message = "") {
  state.sectionStatus[section] = { kind, message };
  renderProductsStatus();
  renderFreightsStatus();
}

function idleStatusMarkup(section, fallback) {
  const status = state.sectionStatus[section];
  if (!status || status.kind === "idle") {
    return fallback;
  }
  if (status.kind === "saving") {
    return "Salvando...";
  }
  if (status.kind === "saved") {
    return status.message || "Atualizado";
  }
  if (status.kind === "error") {
    return status.message || "Falha";
  }
  return fallback;
}

function renderHeaderBadges() {
  if (!refs.headerBadges) {
    return;
  }
  const city = currentCity();
  const mapLabel = state.bootstrap?.active_map?.name || state.bootstrap?.active_map?.slug || "Mapa";
  const badges = [
    {
      label: "Mapa",
      value: mapLabel,
    },
  ];

  if (city) {
    badges.push(
      {
        label: "Cidade",
        value: city.label,
      },
      {
        label: "UF",
        value: city.state_code,
      },
      {
        label: "Populacao",
        value: formatPopulation(Number(city.population_thousands || 0)),
      },
    );
  }

  if (state.pickMode) {
    badges.push({
      label: "Mapa",
      value: state.pickMode.side === "origin" ? "Escolhendo origem (A)" : "Escolhendo destino (Z)",
    });
  }

  refs.headerBadges.innerHTML = badges
    .map(
      (badge) => `
        <article class="editor-header-badge">
          <span>${escapeHtml(badge.label)}</span>
          <strong>${escapeHtml(badge.value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderMapStatus() {
  if (!refs.mapStatus) {
    return;
  }
  const city = currentCity();
  if (state.pickMode) {
    refs.mapStatus.textContent = state.pickMode.side === "origin"
      ? "Clique em uma cidade para definir a origem"
      : "Clique em uma cidade para definir o destino";
    return;
  }
  refs.mapStatus.textContent = city ? city.label : "Passe o mouse sobre uma cidade";
}

function renderProductsStatus() {
  if (!refs.productsStatus) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.productsStatus.textContent = "Sem cidade";
    return;
  }
  const fallback = `${formatTonnes(city.supply_total_t)} / ${formatTonnes(city.demand_total_t)}`;
  refs.productsStatus.textContent = idleStatusMarkup("products", fallback);
}

function renderFreightsStatus() {
  if (!refs.freightsStatus) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.freightsStatus.textContent = "Sem cidade";
    return;
  }
  const outboundCount = flowsForCity(city.id, "outbound").length;
  const inboundCount = flowsForCity(city.id, "inbound").length;
  const fallback = `${formatInteger(outboundCount)} / ${formatInteger(inboundCount)}`;
  refs.freightsStatus.textContent = idleStatusMarkup("freights", fallback);
}

function normalizeInputValue(value) {
  return roundNumber(Number(value || 0), 3);
}

function inputChanged(input) {
  if (!input) {
    return false;
  }
  return normalizeInputValue(input.value) !== normalizeInputValue(input.dataset.initialValue || 0);
}

function topItemsMarkup(title, items) {
  const topItems = (items || [])
    .filter((item) => Number(item.value || 0) > 0)
    .slice(0, 5);
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
          : `<p class="city-editor-help-text">Sem itens com volume nesta lista.</p>`}
      </div>
    </article>
  `;
}

function metricMarkup(label, value) {
  return `
    <article class="city-editor-metric-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderInfoPanel() {
  if (!refs.infoPanel) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.infoPanel.innerHTML = `<div class="truck-gallery-empty">Passe o mouse sobre uma cidade do mapa.</div>`;
    return;
  }

  refs.infoPanel.innerHTML = `
    <section class="city-editor-info-stack">
      <article class="city-editor-city-summary">
        <span class="eyebrow">Cidade ativa</span>
        <h2>${escapeHtml(city.label)}</h2>
        <p>${escapeHtml(city.state_name)} · ${escapeHtml(city.source_region_name)}</p>
      </article>

      <div class="city-editor-metric-list">
        ${metricMarkup("UF", city.state_code)}
        ${metricMarkup("Populacao", formatPopulation(Number(city.population_thousands || 0)))}
        ${metricMarkup("Oferta total", formatTonnes(city.supply_total_t))}
        ${metricMarkup("Demanda total", formatTonnes(city.demand_total_t))}
      </div>
      ${topItemsMarkup("Top ofertas", city.supply_items || [])}
      ${topItemsMarkup("Top demandas", city.demand_items || [])}
    </section>
  `;
}

function productRows(city, layer) {
  const key = layer === "supply" ? "supply_items" : "demand_items";
  const itemsByProductId = new Map((city?.[key] || []).map((item) => [item.product_id, item]));
  return state.products.map((product) => {
    const item = itemsByProductId.get(product.id) || {};
    return {
      productId: product.id,
      productName: product.name,
      productEmoji: product.emoji,
      productColor: product.color,
      value: Number(item.value || 0),
      inputValue: roundNumber(Number(item.value || 0), 3),
      balance: sectionBalanceForProduct(city?.id, product.id, layer),
    };
  });
}

function productRowMarkup(city, layer, row) {
  return `
    <article class="city-editor-product-line">
      <div class="city-editor-product-label" style="--city-product-color:${escapeHtml(row.productColor || "#2d5a27")}">
        <span class="city-editor-product-emoji">${escapeHtml(row.productEmoji || "•")}</span>
        <strong>${escapeHtml(row.productName)}</strong>
      </div>
      <span class="city-editor-product-total">
        <small>${escapeHtml(`Saldo ${formatTonnes(row.balance)}`)}</small>
      </span>
      <input
        class="city-editor-inline-input"
        type="number"
        min="0"
        step="0.1"
        inputmode="decimal"
        value="${escapeHtml(String(row.inputValue))}"
        data-product-input="true"
        data-city-id="${escapeHtml(city.id)}"
        data-layer="${escapeHtml(layer)}"
        data-product-id="${escapeHtml(row.productId)}"
        data-initial-value="${escapeHtml(String(row.inputValue))}"
      />
    </article>
  `;
}

function productsSectionMarkup(city, section, title, total, layer) {
  const rows = productRows(city, layer);
  const collapsed = Boolean(state.collapsed[section]);
  const icon = collapsed ? "expand_more" : "expand_less";
  return `
    <section class="city-editor-section-card">
      <header class="city-editor-section-head">
        <div class="city-editor-section-copy">
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(formatTonnes(total))} totais</p>
        </div>
        <button class="city-editor-section-toggle" type="button" data-section-toggle="${escapeHtml(section)}">
          <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        </button>
      </header>

      <div class="city-editor-section-body${collapsed ? " is-collapsed" : ""}"${collapsed ? " hidden" : ""}>
        ${rows.map((row) => productRowMarkup(city, layer, row)).join("")}
      </div>
    </section>
  `;
}

function renderProductsPanel() {
  if (!refs.productsPanel) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.productsPanel.innerHTML = `<div class="truck-gallery-empty">Passe o mouse sobre uma cidade do mapa.</div>`;
    return;
  }

  refs.productsPanel.innerHTML = `
    <section class="city-editor-panel-stack">
      ${productsSectionMarkup(city, "supply", "Oferta", city.supply_total_t, "supply")}
      ${productsSectionMarkup(city, "demand", "Demanda", city.demand_total_t, "demand")}
    </section>
  `;
}

function flowBadge(flow) {
  return formatDistanceKm(flow.distance_km);
}

function flowMarkup(flow, section) {
  const displayBalance = section === "outbound"
    ? sectionBalanceForProduct(flow.origin_id, flow.product_id, "outbound")
    : sectionBalanceForProduct(flow.destination_id, flow.product_id, "inbound");
  const availableQuantity = availableSupplyForFlow(flow.product_id, flow.origin_id, flow.id);
  return `
    <article class="flow-editor-flow-item city-editor-flow-item${flow.custom ? " is-custom" : ""}">
      <div class="city-editor-flow-line city-editor-flow-line-top">
        <strong class="city-editor-flow-route">${escapeHtml(flow.origin_label)} <span aria-hidden="true">→</span> ${escapeHtml(flow.destination_label)}</strong>
        <span class="flow-editor-flow-rank">${escapeHtml(flowBadge(flow))}</span>
      </div>

      <div class="city-editor-flow-line city-editor-flow-line-bottom">
        <div class="city-editor-flow-product">
          <span class="city-editor-product-emoji">${escapeHtml(state.productsById[flow.product_id]?.emoji || "•")}</span>
          <strong>${escapeHtml(state.productsById[flow.product_id]?.name || "Produto")}</strong>
        </div>
        <span class="city-editor-flow-reference">${escapeHtml(`Saldo ${formatTonnes(displayBalance)}`)}</span>
        <input
          class="city-editor-inline-input"
          type="number"
          min="0"
          max="${escapeHtml(String(roundNumber(availableQuantity, 3)))}"
          step="0.1"
          inputmode="decimal"
          value="${escapeHtml(String(roundNumber(Number(flow.quantity_t || 0), 3)))}"
          data-flow-input="true"
          data-flow-id="${escapeHtml(flow.id)}"
          data-product-id="${escapeHtml(flow.product_id)}"
          data-origin-id="${escapeHtml(flow.origin_id)}"
          data-destination-id="${escapeHtml(flow.destination_id)}"
          data-initial-value="${escapeHtml(String(roundNumber(Number(flow.quantity_t || 0), 3)))}"
        />
        <button
          class="city-editor-flow-delete"
          type="button"
          aria-label="Excluir frete"
          title="Excluir frete"
          data-remove-flow="true"
          data-flow-id="${escapeHtml(flow.id)}"
          data-product-id="${escapeHtml(flow.product_id)}"
          data-origin-id="${escapeHtml(flow.origin_id)}"
          data-destination-id="${escapeHtml(flow.destination_id)}"
        >
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </div>
    </article>
  `;
}

function draftHelpMarkup(section, cityId) {
  const reference = referenceQuantityForSection(cityId, section);
  if (state.pickMode?.section === section) {
    return state.pickMode.side === "origin"
      ? "Modo mapa: clique em uma cidade para definir a origem. Esc cancela."
      : "Modo mapa: clique em uma cidade para definir o destino. Esc cancela.";
  }
  return `Use A para armar a origem e Z para armar o destino. Referencia atual: ${formatTonnes(reference)}.`;
}

function draftMarkup(city, section, draft) {
  const isOriginArmed = state.pickMode?.section === section && state.pickMode?.side === "origin";
  const isDestinationArmed = state.pickMode?.section === section && state.pickMode?.side === "destination";
  const routeStart = cityLabel(draft.originId) || "Origem";
  const routeEnd = cityLabel(draft.destinationId) || "Destino";
  const availableQuantity = referenceQuantityForSection(city.id, section, draft);
  return `
    <article class="flow-editor-flow-item city-editor-flow-item city-editor-flow-draft">
      <div class="city-editor-flow-line city-editor-flow-line-top">
        <div class="city-editor-flow-draft-route">
          <button
            class="city-editor-pick-button city-editor-flow-pick${isOriginArmed ? " is-armed" : ""}"
            type="button"
            data-arm-pick="origin"
            data-city-id="${escapeHtml(city.id)}"
            data-section="${escapeHtml(section)}"
          >${escapeHtml(routeStart)}</button>
          <strong class="city-editor-flow-arrow" aria-hidden="true">→</strong>
          <button
            class="city-editor-pick-button city-editor-flow-pick${isDestinationArmed ? " is-armed" : ""}"
            type="button"
            data-arm-pick="destination"
            data-city-id="${escapeHtml(city.id)}"
            data-section="${escapeHtml(section)}"
          >${escapeHtml(routeEnd)}</button>
        </div>
        <span class="flow-editor-flow-rank">Nova</span>
      </div>

      <div class="city-editor-draft-grid">
        <label class="city-editor-field city-editor-flow-product-field">
          <select data-draft-field="productId" data-city-id="${escapeHtml(city.id)}" data-section="${escapeHtml(section)}">
            ${productOptionsMarkup(draft.productId)}
          </select>
        </label>

        <label class="city-editor-field city-editor-flow-value-field">
          <input
            class="city-editor-inline-input"
            type="number"
            min="0"
            max="${escapeHtml(String(roundNumber(availableQuantity, 3)))}"
            step="0.1"
            inputmode="decimal"
            value="${escapeHtml(String(roundNumber(Number(draft.quantityT || 0), 3)))}"
            title="${escapeHtml(`Saldo disponivel: ${formatTonnes(availableQuantity)}`)}"
            data-draft-field="quantityT"
            data-city-id="${escapeHtml(city.id)}"
            data-section="${escapeHtml(section)}"
          />
        </label>
      </div>
    </article>
  `;
}

function freightsSectionMarkup(city, section, title) {
  const flows = flowsForCity(city.id, section);
  const collapsed = Boolean(state.collapsed[section]);
  const draft = currentDraft(section, city.id);
  const icon = collapsed ? "expand_more" : "expand_less";
  return `
    <section class="city-editor-section-card">
      <header class="city-editor-section-head">
        <div class="city-editor-section-copy">
          <strong>${escapeHtml(title)}</strong>
        </div>
        <button class="city-editor-section-toggle" type="button" data-section-toggle="${escapeHtml(section)}">
          <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        </button>
      </header>

      <div class="city-editor-section-body${collapsed ? " is-collapsed" : ""}"${collapsed ? " hidden" : ""}>
        ${draft ? "" : `<button class="city-editor-add-button city-editor-add-button-inline" type="button" data-add-route="${escapeHtml(section)}">Incluir frete</button>`}
        ${draft ? draftMarkup(city, section, draft) : ""}
        ${flows.length ? flows.map((flow) => flowMarkup(flow, section)).join("") : `<div class="truck-gallery-empty">Nenhum frete nesta secao.</div>`}
      </div>
    </section>
  `;
}

function renderFreightsPanel() {
  if (!refs.freightsPanel) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.freightsPanel.innerHTML = `<div class="truck-gallery-empty">Passe o mouse sobre uma cidade do mapa.</div>`;
    return;
  }

  refs.freightsPanel.innerHTML = `
    <section class="city-editor-panel-stack">
      ${freightsSectionMarkup(city, "outbound", "Origem")}
      ${freightsSectionMarkup(city, "inbound", "Destino")}
    </section>
  `;
}

function markerForCity(city, selected = false) {
  const band = findPopulationBand(city, state.populationBands);
  const dominantProduct = state.productsById[city.dominant_product_id] || null;
  const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
  return createCityMarker({
    city,
    band,
    pin,
    fillColor: dominantProduct?.color || band?.fill_color || "#2d5a27",
    strokeColor: "#fff9ea",
    contrastFillColor: "#fff9ea",
    selectedHaloFillColor: "#fff7e2",
    selectedHaloStrokeColor: dominantProduct?.color || "#255b4b",
    selected,
  });
}

function syncMarkerSelection() {
  Object.entries(state.markersByCityId).forEach(([cityId, marker]) => {
    const city = state.citiesById[cityId];
    if (!city || !marker) {
      return;
    }
    marker.setIcon(markerForCity(city, cityId === state.selectedCityId).options.icon);
  });
}

function selectCity(cityId, options = {}) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId || !state.citiesById[nextCityId]) {
    return;
  }
  state.activeCityId = nextCityId;
  if (options.persistSelection) {
    state.selectedCityId = nextCityId;
  }
  renderHeaderBadges();
  renderMapStatus();
  renderInfoPanel();
  renderProductsPanel();
  renderFreightsPanel();
  renderProductsStatus();
  renderFreightsStatus();
  renderMap();
  if (options.persistSelection && options.syncMarkers !== false) {
    syncMarkerSelection();
  }
}

function handleMarkerHover(cityId) {
  if (state.pickMode) {
    return;
  }
  selectCity(cityId);
}

function handleMarkerClick(cityId) {
  if (!state.pickMode) {
    selectCity(cityId, { persistSelection: true });
    return;
  }

  const { cityId: homeCityId, section, side } = state.pickMode;
  const draft = currentDraft(section, homeCityId);
  if (!draft) {
    state.pickMode = null;
    renderMapStatus();
    renderFreightsPanel();
    return;
  }

  if (side === "origin") {
    draft.originId = cityId;
  } else {
    draft.destinationId = cityId;
  }

  updateDraft(section, homeCityId, draft);
  state.pickMode = null;
  state.selectedCityId = homeCityId;
  state.activeCityId = homeCityId;
  renderHeaderBadges();
  renderMapStatus();
  renderFreightsPanel();
  renderFreightsStatus();
  syncMarkerSelection();
  maybeAutoSaveDraft(section, homeCityId);
}

function ensureMap() {
  if (state.map || !refs.mapStage || !state.bootstrap?.map_viewport) {
    return;
  }

  state.map = createBrasixMap({
    elementId: "city-editor-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
  });

  const L = window.L;
  state.markerLayer = L.layerGroup().addTo(state.map);
  if (!state.mapEventsBound) {
    state.map.on("click", (event) => {
      const nearestCity = findNearestCityByLatLng(event.latlng);
      if (nearestCity) {
        handleMarkerClick(nearestCity.id);
      }
    });
    state.mapEventsBound = true;
  }
}

function renderMap() {
  ensureMap();
  if (!state.map || !state.markerLayer) {
    return;
  }

  renderSelectedCityRoutes();
  state.markerLayer.clearLayers();
  state.markersByCityId = {};
  state.cities.forEach((city) => {
    const marker = markerForCity(city, city.id === state.selectedCityId);
    marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong>`, {
      sticky: true,
      direction: "top",
      className: "brasix-map-tooltip city-editor-map-tooltip",
      opacity: 1,
      offset: [0, -8],
    });
    marker.on("mouseover", () => handleMarkerHover(city.id));
    marker.on("click", () => handleMarkerClick(city.id));
    marker.addTo(state.markerLayer);
    state.markersByCityId[city.id] = marker;
  });
}

function recenterMap() {
  if (!state.map || !state.bootstrap?.map_viewport) {
    return;
  }
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  applyBrasixLeafletSettings(
    state.map,
    state.bootstrap.map_viewport,
    state.bootstrap.map_editor?.leaflet_settings || {},
  );
}

function renderAll() {
  renderHeaderBadges();
  renderMapStatus();
  renderInfoPanel();
  renderProductsPanel();
  renderFreightsPanel();
  renderProductsStatus();
  renderFreightsStatus();
  renderMap();
}

function normalizeBootstrap(payload) {
  const cities = Array.isArray(payload?.cities) ? payload.cities : [];
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const freightFlows = Array.isArray(payload?.freight_flows) ? payload.freight_flows : [];
  const rawPopulationBands = Array.isArray(payload?.map_editor?.population_bands)
    ? payload.map_editor.population_bands
    : payload?.map_editor?.population_bands?.bands || [];
  state.bootstrap = payload;
  state.cities = cities;
  state.citiesById = Object.fromEntries(cities.map((city) => [city.id, city]));
  state.pinsById = Object.fromEntries(((payload?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]));
  state.products = products;
  state.productsById = Object.fromEntries(products.map((product) => [product.id, product]));
  state.freightFlows = [...freightFlows].sort((left, right) => {
    const delta = Number(right.quantity_t || 0) - Number(left.quantity_t || 0);
    if (delta !== 0) {
      return delta;
    }
    return String(left.id || "").localeCompare(String(right.id || ""), "pt-BR");
  });
  state.freightFlowsById = Object.fromEntries(state.freightFlows.map((flow) => [flow.id, flow]));
  rebuildDerivedMetrics();
  state.populationBands = sortPopulationBands(rawPopulationBands);
}

async function fetchJson(url, options = {}) {
  async function readErrorMessage(response, fallback) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        const payload = await response.json();
        if (typeof payload?.detail === "string" && payload.detail.trim()) {
          return payload.detail.trim();
        }
        if (typeof payload?.message === "string" && payload.message.trim()) {
          return payload.message.trim();
        }
        return JSON.stringify(payload);
      } catch (_error) {
        // noop
      }
    }
    const text = await response.text();
    return String(text || fallback).trim() || fallback;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Falha em ${url}`));
  }

  return response.json();
}

async function loadBootstrap(options = {}) {
  if (state.isRefreshing) {
    return;
  }
  const preserveCityId = options.preserveCityId || state.selectedCityId;
  state.isRefreshing = true;
  try {
    const payload = await fetchJson("/api/editor/cidade/bootstrap");
    normalizeBootstrap(payload);
    if (preserveCityId && state.citiesById[preserveCityId]) {
      state.selectedCityId = preserveCityId;
    } else {
      state.selectedCityId = payload?.summary?.selected_city_id || payload?.map_viewport?.defaults?.selected_city_id || state.cities[0]?.id || "";
    }
    state.activeCityId = state.selectedCityId;
    renderAll();
  } finally {
    state.isRefreshing = false;
  }
}

function syncBroadcast(reason) {
  broadcastSync(reason);
  state.syncToken = readSyncToken();
}

async function saveProduct(cityId, layer, productId, rawValue) {
  const value = Number(rawValue || 0);
  setSectionStatus("products", "saving");
  try {
    if (value <= 0) {
      await fetchJson("/api/editor/cidade/products/remove", {
        method: "POST",
        body: JSON.stringify({
          map_id: state.bootstrap.active_map.id,
          city_id: cityId,
          product_id: productId,
          layer,
        }),
      });
    } else {
      await fetchJson("/api/editor/cidade/products/value", {
        method: "PUT",
        body: JSON.stringify({
          map_id: state.bootstrap.active_map.id,
          city_id: cityId,
          product_id: productId,
          layer,
          value,
        }),
      });
    }
    syncBroadcast("city-editor-products");
    await loadBootstrap({ preserveCityId: cityId });
    setSectionStatus("products", "saved", "Produtos atualizados");
  } catch (error) {
    console.error(error);
    setSectionStatus("products", "error", error instanceof Error ? error.message : "Falha ao salvar produtos");
  }
}

async function saveFreightRecord(params) {
  const quantityT = Number(params.quantityT || 0);
  setSectionStatus("freights", "saving");
  try {
    if (quantityT <= 0) {
      await fetchJson("/api/editor/cidade/fretes/remove", {
        method: "POST",
        body: JSON.stringify({
          map_id: state.bootstrap.active_map.id,
          flow_id: params.flowId,
          product_id: params.productId,
          origin_id: params.originId,
          destination_id: params.destinationId,
        }),
      });
    } else {
      await fetchJson("/api/editor/cidade/fretes/value", {
        method: "PUT",
        body: JSON.stringify({
          map_id: state.bootstrap.active_map.id,
          flow_id: params.flowId,
          product_id: params.productId,
          origin_id: params.originId,
          destination_id: params.destinationId,
          quantity_t: quantityT,
        }),
      });
    }

    if (params.clearDraft) {
      updateDraft(params.section, params.cityId, null);
      if (state.pickMode?.section === params.section && state.pickMode?.cityId === params.cityId) {
        state.pickMode = null;
      }
    }
    syncBroadcast("city-editor-freights");
    await loadBootstrap({ preserveCityId: params.cityId });
    setSectionStatus("freights", "saved", "Fretes atualizados");
  } catch (error) {
    console.error(error);
    setSectionStatus("freights", "error", error instanceof Error ? error.message : "Falha ao salvar fretes");
  }
}

function toggleSection(section) {
  state.collapsed[section] = !state.collapsed[section];
  if (section === "supply" || section === "demand") {
    renderProductsPanel();
    return;
  }
  renderFreightsPanel();
}

function openDraft(section, cityId) {
  const city = state.citiesById[cityId];
  if (!city) {
    return;
  }
  if (currentDraft(section, cityId)) {
    updateDraft(section, cityId, null);
    if (state.pickMode?.section === section && state.pickMode?.cityId === cityId) {
      state.pickMode = null;
    }
    renderHeaderBadges();
    renderMapStatus();
    renderFreightsPanel();
    return;
  }
  state.collapsed[section] = false;
  updateDraft(section, cityId, currentDraft(section, cityId) || createDraft(section, city));
  state.activeDraftSection = section;
  renderFreightsPanel();
}

function armPickMode(section, cityId, side) {
  if (!currentDraft(section, cityId)) {
    return;
  }
  state.selectedCityId = cityId;
  state.activeCityId = cityId;
  state.activeDraftSection = section;
  state.pickMode = { section, cityId, side };
  renderHeaderBadges();
  renderMapStatus();
  renderFreightsPanel();
  syncMarkerSelection();
}

function updateDraftField(cityId, section, field, rawValue) {
  const draft = currentDraft(section, cityId);
  if (!draft) {
    return;
  }
  if (field === "quantityT") {
    draft.quantityT = roundNumber(Number(rawValue || 0), 3);
  } else {
    draft[field] = String(rawValue || "").trim();
    const maxQuantity = referenceQuantityForSection(cityId, section, draft);
    const currentQuantity = Number(draft.quantityT || 0);
    if (currentQuantity <= 0 || currentQuantity > maxQuantity) {
      draft.quantityT = maxQuantity;
    }
  }
  updateDraft(section, cityId, draft);
  maybeAutoSaveDraft(section, cityId);
}

async function saveDraft(section, cityId) {
  const draft = currentDraft(section, cityId);
  if (!draft) {
    return;
  }
  if (!draft.productId || !draft.originId || !draft.destinationId) {
    setSectionStatus("freights", "error", "Defina produto, origem e destino");
    return;
  }
  if (draft.originId === draft.destinationId) {
    setSectionStatus("freights", "error", "Origem e destino nao podem ser iguais");
    return;
  }
  if (Number(draft.quantityT || 0) <= 0) {
    setSectionStatus("freights", "error", "Informe um valor maior que zero");
    return;
  }
  const maxQuantity = referenceQuantityForSection(cityId, section, draft);
  if (Number(draft.quantityT || 0) > maxQuantity) {
    setSectionStatus("freights", "error", freightLimitMessage(draft.productId, draft.originId, maxQuantity));
    return;
  }
  await saveFreightRecord({
    cityId,
    section,
    clearDraft: true,
    flowId: customFlowId(draft),
    productId: draft.productId,
    originId: draft.originId,
    destinationId: draft.destinationId,
    quantityT: draft.quantityT,
  });
}

async function saveProductInput(input) {
  if (!input || !inputChanged(input)) {
    return;
  }
  input.dataset.initialValue = String(normalizeInputValue(input.value));
  await saveProduct(input.dataset.cityId, input.dataset.layer, input.dataset.productId, input.value || 0);
}

async function saveFlowInput(input) {
  if (!input || !inputChanged(input)) {
    return;
  }
  const maxQuantity = availableSupplyForFlow(input.dataset.productId, input.dataset.originId, input.dataset.flowId);
  if (normalizeInputValue(input.value) > maxQuantity) {
    setSectionStatus("freights", "error", freightLimitMessage(input.dataset.productId, input.dataset.originId, maxQuantity));
    return;
  }
  input.dataset.initialValue = String(normalizeInputValue(input.value));
  await saveFreightRecord({
    cityId: currentCity()?.id || state.selectedCityId,
    flowId: input.dataset.flowId,
    productId: input.dataset.productId,
    originId: input.dataset.originId,
    destinationId: input.dataset.destinationId,
    quantityT: input.value || 0,
  });
}

function maybeAutoSaveDraft(section, cityId) {
  const draft = currentDraft(section, cityId);
  if (!draftIsComplete(draft) || draft.saving) {
    return;
  }
  draft.saving = true;
  updateDraft(section, cityId, draft);
  saveDraft(section, cityId);
}

function activeDraftSectionForCity(cityId) {
  if (currentDraft(state.activeDraftSection, cityId)) {
    return state.activeDraftSection;
  }
  if (currentDraft("outbound", cityId)) {
    return "outbound";
  }
  if (currentDraft("inbound", cityId)) {
    return "inbound";
  }
  return null;
}

function isTextInputTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.matches('input, textarea, select, [contenteditable="true"]');
}

function handleProductsClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const toggleButton = target.closest("[data-section-toggle]");
  if (toggleButton) {
    toggleSection(toggleButton.dataset.sectionToggle);
    return;
  }

}

function handleProductsKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  const target = event.target instanceof Element ? event.target : null;
  const input = target?.closest("[data-product-input]");
  if (!input) {
    return;
  }
  saveProductInput(input);
}

function handleProductsFocusOut(event) {
  const target = event.target instanceof Element ? event.target : null;
  const input = target?.closest("[data-product-input]");
  if (!input) {
    return;
  }
  saveProductInput(input);
}

function handleFreightsClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const toggleButton = target.closest("[data-section-toggle]");
  if (toggleButton) {
    toggleSection(toggleButton.dataset.sectionToggle);
    return;
  }

  const addRouteButton = target.closest("[data-add-route]");
  if (addRouteButton) {
    openDraft(addRouteButton.dataset.addRoute, currentCity()?.id || state.selectedCityId);
    return;
  }

  const armPickButton = target.closest("[data-arm-pick]");
  if (armPickButton) {
    armPickMode(armPickButton.dataset.section, armPickButton.dataset.cityId, armPickButton.dataset.armPick);
    return;
  }

  const removeFlowButton = target.closest("[data-remove-flow]");
  if (removeFlowButton) {
    saveFreightRecord({
      cityId: currentCity()?.id || state.selectedCityId,
      flowId: removeFlowButton.dataset.flowId,
      productId: removeFlowButton.dataset.productId,
      originId: removeFlowButton.dataset.originId,
      destinationId: removeFlowButton.dataset.destinationId,
      quantityT: 0,
    });
    return;
  }

}

function handleFreightsChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  const field = target?.closest("[data-draft-field]");
  if (!field) {
    return;
  }
  updateDraftField(field.dataset.cityId, field.dataset.section, field.dataset.draftField, field.value);
}

function handleFreightsKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();

  const target = event.target instanceof Element ? event.target : null;
  const draftField = target?.closest("[data-draft-field='quantityT']");
  if (draftField) {
    maybeAutoSaveDraft(draftField.dataset.section, draftField.dataset.cityId);
    return;
  }

  const flowInput = target?.closest("[data-flow-input]");
  if (flowInput) {
    saveFlowInput(flowInput);
  }
}

function handleFreightsFocusOut(event) {
  const target = event.target instanceof Element ? event.target : null;
  const draftField = target?.closest("[data-draft-field]");
  if (draftField) {
    maybeAutoSaveDraft(draftField.dataset.section, draftField.dataset.cityId);
    return;
  }
  const flowInput = target?.closest("[data-flow-input]");
  if (!flowInput) {
    return;
  }
  saveFlowInput(flowInput);
}

function handleWindowKeydown(event) {
  if (event.key === "Escape" && state.pickMode) {
    state.pickMode = null;
    renderHeaderBadges();
    renderMapStatus();
    renderFreightsPanel();
    return;
  }

  if (isTextInputTarget(event.target)) {
    return;
  }

  const draftSection = activeDraftSectionForCity(currentCity()?.id || state.selectedCityId);
  if (!draftSection) {
    return;
  }

  if (event.key === "a" || event.key === "A") {
    event.preventDefault();
    armPickMode(draftSection, currentCity()?.id || state.selectedCityId, "origin");
    return;
  }

  if (event.key === "z" || event.key === "Z") {
    event.preventDefault();
    armPickMode(draftSection, currentCity()?.id || state.selectedCityId, "destination");
  }
}

function handleStorageSync(event) {
  if (event.key !== BRASIX_SYNC_KEY || event.newValue === state.syncToken) {
    return;
  }
  state.syncToken = event.newValue;
  loadBootstrap({ preserveCityId: state.selectedCityId }).catch((error) => console.error(error));
}

function bindEvents() {
  refs.themeToggle?.addEventListener("click", () => {
    setTheme(getStoredTheme() === "night" ? "day" : "night");
  });
  refs.mapReset?.addEventListener("click", () => recenterMap());
  refs.productsPanel?.addEventListener("click", handleProductsClick);
  refs.productsPanel?.addEventListener("keydown", handleProductsKeydown);
  refs.productsPanel?.addEventListener("focusout", handleProductsFocusOut);
  refs.freightsPanel?.addEventListener("click", handleFreightsClick);
  refs.freightsPanel?.addEventListener("change", handleFreightsChange);
  refs.freightsPanel?.addEventListener("keydown", handleFreightsKeydown);
  refs.freightsPanel?.addEventListener("focusout", handleFreightsFocusOut);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("storage", handleStorageSync);
}

async function initialize() {
  state.syncToken = readSyncToken();
  setTheme(getStoredTheme());
  bindEvents();
  await loadBootstrap();
}

initialize().catch((error) => {
  console.error("Brasix city editor bootstrap failure:", error);
  throw error;
});
