import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  findPopulationBand,
  fitBrasixBounds,
  sortPopulationBands,
} from "./shared/leaflet-map.js";
import { escapeHtml, numberFormatter, roundNumber } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:game-setup-theme";
const COMPANY_LOGO_OPTIONS = [
  { id: "local_shipping", icon: "local_shipping", label: "Carga" },
  { id: "apartment", icon: "apartment", label: "Sede" },
  { id: "alt_route", icon: "alt_route", label: "Rotas" },
  { id: "precision_manufacturing", icon: "precision_manufacturing", label: "Industria" },
  { id: "agriculture", icon: "agriculture", label: "Agro" },
  { id: "forest", icon: "forest", label: "Florestal" },
  { id: "anchor", icon: "anchor", label: "Porto" },
  { id: "bolt", icon: "bolt", label: "Energia" },
  { id: "public", icon: "public", label: "Rede" },
  { id: "warehouse", icon: "warehouse", label: "Armazem" },
  { id: "inventory_2", icon: "inventory_2", label: "Estoque" },
  { id: "route", icon: "route", label: "Corredor" },
  { id: "flight", icon: "flight", label: "Aereo" },
  { id: "train", icon: "train", label: "Ferrovia" },
  { id: "directions_boat", icon: "directions_boat", label: "Nautico" },
  { id: "construction", icon: "construction", label: "Construcao" },
  { id: "engineering", icon: "engineering", label: "Engenharia" },
  { id: "business", icon: "business", label: "Negocio" },
  { id: "business_center", icon: "business_center", label: "Corporativo" },
  { id: "account_balance", icon: "account_balance", label: "Capital" },
  { id: "account_balance_wallet", icon: "account_balance_wallet", label: "Carteira" },
  { id: "paid", icon: "paid", label: "Receita" },
  { id: "store", icon: "store", label: "Loja" },
  { id: "storefront", icon: "storefront", label: "Varejo" },
  { id: "shopping_cart", icon: "shopping_cart", label: "Comercio" },
  { id: "shopping_bag", icon: "shopping_bag", label: "Carga leve" },
  { id: "local_gas_station", icon: "local_gas_station", label: "Combustivel" },
  { id: "oil_barrel", icon: "oil_barrel", label: "Oleo" },
  { id: "recycling", icon: "recycling", label: "Reciclagem" },
  { id: "water_drop", icon: "water_drop", label: "Agua" },
  { id: "eco", icon: "eco", label: "Bio" },
  { id: "park", icon: "park", label: "Natureza" },
  { id: "science", icon: "science", label: "Laboratorio" },
  { id: "hub", icon: "hub", label: "Hub" },
  { id: "language", icon: "language", label: "Global" },
  { id: "shield", icon: "shield", label: "Seguranca" },
  { id: "settings", icon: "settings", label: "Oficina" },
  { id: "build", icon: "build", label: "Ferramenta" },
  { id: "work", icon: "work", label: "Operacao" },
  { id: "attach_money", icon: "attach_money", label: "Financeiro" },
];

const SIZE_TIER_LABELS = {
  super_leve: "Super-leve",
  leve: "Leve",
  medio: "Medio",
  pesado: "Pesado",
  super_pesado: "Super-pesado",
};

const VEHICLE_KIND_LABELS = {
  rigido: "Rigido",
  cavalo: "Cavalo",
  combinacao: "Combinacao",
  especial: "Especial",
};

const state = {
  bootstrap: null,
  cities: [],
  citiesById: {},
  productsById: {},
  trucks: [],
  trucksById: {},
  freightFlows: [],
  freightFlowsById: {},
  populationBands: [],
  pinsById: {},
  company: {
    name: "Brasix",
    color: "#356d63",
    logoId: COMPANY_LOGO_OPTIONS[0].id,
    hqCityId: "",
  },
  citySearch: "",
  selectedTruckQuantities: {},
  selectedFreightIds: new Set(),
  currentModal: "",
  map: null,
  markerLayer: null,
  markersByCityId: {},
  railsBound: false,
};

const refs = {
  headerBadges: document.getElementById("game-setup-header-badges"),
  themeToggle: document.getElementById("game-setup-theme-toggle"),
  quickMetrics: document.getElementById("game-setup-quick-metrics"),
  companySummary: document.getElementById("game-setup-company-summary"),
  fleetSummary: document.getElementById("game-setup-fleet-summary"),
  freightSummary: document.getElementById("game-setup-freight-summary"),
  modalRoot: document.getElementById("game-setup-modal-root"),
  companyNameInput: document.getElementById("game-setup-company-name"),
  companyColorInput: document.getElementById("game-setup-company-color"),
  companyColorTextInput: document.getElementById("game-setup-company-color-text"),
  companyPreview: document.getElementById("game-setup-company-preview"),
  companyTopOffers: document.getElementById("game-setup-company-top-offers"),
  companyTopDemands: document.getElementById("game-setup-company-top-demands"),
  logoGrid: document.getElementById("game-setup-logo-grid"),
  citySearchInput: document.getElementById("game-setup-city-search"),
  cityList: document.getElementById("game-setup-company-city-list"),
  companyCityTitle: document.getElementById("game-setup-company-city-title"),
  companyMapStatus: document.getElementById("game-setup-company-map-status"),
  mapStage: document.getElementById("game-setup-company-map-stage"),
  truckRail: document.getElementById("game-setup-truck-rail"),
  truckRailMeta: document.getElementById("game-setup-truck-rail-meta"),
  truckSelection: document.getElementById("game-setup-truck-selection"),
  freightRail: document.getElementById("game-setup-freight-rail"),
  freightRailMeta: document.getElementById("game-setup-freight-rail-meta"),
  freightRailTitle: document.getElementById("game-setup-freight-rail-title"),
  freightSelection: document.getElementById("game-setup-freight-selection"),
};

function numberFormat(digits = 0) {
  return numberFormatter(digits);
}

function formatInteger(value) {
  return numberFormat(0).format(Number(value || 0));
}

function formatTonnes(value) {
  const numericValue = Number(value || 0);
  const digits = Math.abs(numericValue) >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 3))} t`;
}

function formatDistanceKm(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 1))} km`;
}

function formatPopulation(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 100 ? 0 : 1;
  return `${numberFormat(digits).format(roundNumber(numericValue, 1))} mil hab`;
}

function formatCurrency(value) {
  return `R$ ${numberFormat(0).format(roundNumber(Number(value || 0), 0))}`;
}

function formatPriceOrFallback(value) {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? formatCurrency(numericValue) : "Sob consulta";
}

function formatWeightKg(value) {
  const numericValue = Number(value || 0);
  if (numericValue >= 1000) {
    return `${numberFormat(1).format(roundNumber(numericValue / 1000, 1))} t util`;
  }
  return `${numberFormat(0).format(roundNumber(numericValue, 0))} kg`;
}

function formatVolumeM3(value) {
  return `${numberFormat(value >= 100 ? 0 : 1).format(roundNumber(Number(value || 0), 1))} m3`;
}

function formatConsumption(value) {
  const numericValue = Number(value || 0);
  if (!numericValue) {
    return "-";
  }
  return `${numberFormat(2).format(roundNumber(numericValue, 2))} / km`;
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
  document.documentElement.classList.add("game-setup-page");
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

function currentHqCity() {
  return state.citiesById[state.company.hqCityId] || state.cities[0] || null;
}

function currentLogoOption() {
  return COMPANY_LOGO_OPTIONS.find((option) => option.id === state.company.logoId) || COMPANY_LOGO_OPTIONS[0];
}

function normalizedLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function preferredStartupCityId() {
  const brasilia = state.cities.find((city) => {
    const label = normalizedLookupText(city.label);
    return label.includes("brasilia") && String(city.state_code || "").toUpperCase() === "DF";
  });
  return brasilia?.id || state.bootstrap?.summary?.selected_city_id || state.cities[0]?.id || "";
}

function primaryImplementLabel(truck) {
  return (truck?.body_labels || []).find(Boolean) || truck?.axle_config || "Implemento base";
}

function outboundFreightsForCity(cityId) {
  return state.freightFlows
    .filter((flow) => flow.origin_id === cityId && Number(flow.quantity_t || 0) > 0)
    .sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0));
}

function selectedTruckEntries() {
  return Object.entries(state.selectedTruckQuantities)
    .map(([truckId, quantity]) => ({
      truck: state.trucksById[truckId],
      quantity: Number(quantity || 0),
    }))
    .filter((entry) => entry.truck && entry.quantity > 0)
    .sort((left, right) => right.quantity - left.quantity || String(left.truck.label).localeCompare(String(right.truck.label), "pt-BR"));
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

function selectedTruckSupportedProductIds() {
  const productIds = new Set();
  selectedTruckEntries().forEach((entry) => {
    supportedProductIdsForTruck(entry.truck).forEach((productId) => {
      const normalizedProductId = String(productId || "").trim();
      if (normalizedProductId) {
        productIds.add(normalizedProductId);
      }
    });
  });
  return productIds;
}

function freightIsCompatible(flow, supportedProductIds = selectedTruckSupportedProductIds()) {
  const productId = String(flow?.product_id || "").trim();
  return Boolean(productId && supportedProductIds.size && supportedProductIds.has(productId));
}

function selectedFreightEntries() {
  const supportedProductIds = selectedTruckSupportedProductIds();
  const allowed = new Set(
    outboundFreightsForCity(state.company.hqCityId)
      .filter((flow) => freightIsCompatible(flow, supportedProductIds))
      .map((flow) => flow.id),
  );
  return Array.from(state.selectedFreightIds)
    .filter((flowId) => allowed.has(flowId))
    .map((flowId) => state.freightFlowsById[flowId])
    .filter(Boolean)
    .sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0));
}

function pruneFreightSelection() {
  const supportedProductIds = selectedTruckSupportedProductIds();
  const allowedIds = new Set(
    outboundFreightsForCity(state.company.hqCityId)
      .filter((flow) => freightIsCompatible(flow, supportedProductIds))
      .map((flow) => flow.id),
  );
  state.selectedFreightIds = new Set(Array.from(state.selectedFreightIds).filter((flowId) => allowedIds.has(flowId)));
}

function normalizeColor(rawValue) {
  const source = String(rawValue || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(source)) {
    return source.toLowerCase();
  }
  return state.company.color;
}

function fetchJson(url) {
  return fetch(url, {
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

function normalizeBootstrap(payload) {
  state.bootstrap = payload;
  state.cities = Array.isArray(payload?.cities) ? payload.cities : [];
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.productsById = Object.fromEntries(((payload?.products) || []).map((product) => [product.id, product]));
  state.trucks = (Array.isArray(payload?.trucks) ? payload.trucks : []).map((truck) => ({
    ...truck,
    supported_product_ids: supportedProductIdsForTruck(truck),
  }));
  state.trucksById = Object.fromEntries(state.trucks.map((truck) => [truck.id, truck]));
  state.freightFlows = Array.isArray(payload?.freight_flows) ? payload.freight_flows : [];
  state.freightFlowsById = Object.fromEntries(state.freightFlows.map((flow) => [flow.id, flow]));
  const rawBands = Array.isArray(payload?.map_editor?.population_bands)
    ? payload.map_editor.population_bands
    : payload?.map_editor?.population_bands?.bands || [];
  state.populationBands = sortPopulationBands(rawBands);
  state.pinsById = Object.fromEntries(((payload?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]));
  state.company.hqCityId = preferredStartupCityId();
  state.company.name = "Brasix";
  pruneFreightSelection();
}

function normalizeMarketItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item?.product_id || "").trim(),
      product_name: String(item?.product_name || item?.product_id || "Produto"),
      product_emoji: String(item?.product_emoji || "📦"),
      product_color: String(item?.product_color || "#2d5a27"),
      value: Number(item?.value || 0),
    }))
    .filter((item) => item.product_id)
    .sort((left, right) => Number(right.value || 0) - Number(left.value || 0) || String(left.product_name).localeCompare(String(right.product_name), "pt-BR"));
}

function mergeCityMarketData(cityPayload) {
  const incomingCities = Array.isArray(cityPayload?.cities) ? cityPayload.cities : [];
  if (!incomingCities.length || !state.cities.length) {
    return;
  }

  const incomingById = Object.fromEntries(
    incomingCities
      .map((city) => {
        const cityId = String(city?.id || "").trim();
        return cityId
          ? [cityId, {
            supply_items: normalizeMarketItems(city?.supply_items),
            demand_items: normalizeMarketItems(city?.demand_items),
          }]
          : null;
      })
      .filter(Boolean),
  );

  state.cities = state.cities.map((city) => {
    const market = incomingById[city.id];
    if (!market) {
      return city;
    }
    return {
      ...city,
      supply_items: market.supply_items,
      demand_items: market.demand_items,
    };
  });
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
}

function setupBootstrapNeedsMarketFallback() {
  return state.cities.some((city) => !Array.isArray(city?.supply_items) || !Array.isArray(city?.demand_items));
}

function renderCompanyMapStatus() {
  if (!refs.companyMapStatus) {
    return;
  }
  const city = currentHqCity();
  refs.companyMapStatus.innerHTML = city
    ? `
      <span>Sede ativa</span>
      <strong>${escapeHtml(city.label)}</strong>
    `
    : `
      <span>Sede ativa</span>
      <strong>Selecione no mapa</strong>
    `;
}

function markerForCity(city, selected = false) {
  const band = findPopulationBand(city, state.populationBands);
  const dominantProduct = state.productsById[city.dominant_product_id] || null;
  const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
  const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
  return createCityMarker({
    city,
    band: selected
      ? { ...(band || {}), marker_size_px: Math.round(baseMarkerSize * 1.72) }
      : band,
    pin,
    fillColor: selected ? state.company.color : (dominantProduct?.color || band?.fill_color || state.company.color),
    strokeColor: selected ? "#ffffff" : "#fff9ea",
    contrastFillColor: selected ? "#ffffff" : "#fff9ea",
    selectedHaloFillColor: "#ffffff",
    selectedHaloStrokeColor: state.company.color,
    selected,
    opacity: selected ? 1 : 0.42,
  });
}

function ensureMap() {
  if (state.map || !refs.mapStage || !state.bootstrap?.map_viewport) {
    return;
  }

  state.map = createBrasixMap({
    elementId: "game-setup-company-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor?.leaflet_settings || {},
  });
  state.markerLayer = window.L.layerGroup().addTo(state.map);
}

function renderMap() {
  ensureMap();
  if (!state.map || !state.markerLayer) {
    return;
  }
  state.markerLayer.clearLayers();
  state.markersByCityId = {};

  state.cities.forEach((city) => {
    const marker = markerForCity(city, city.id === state.company.hqCityId);
    marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong>`, {
      sticky: true,
      direction: "top",
      className: "brasix-map-tooltip city-editor-map-tooltip",
      opacity: 1,
      offset: [0, -8],
    });
    marker.on("click", () => selectHeadquarters(city.id));
    marker.addTo(state.markerLayer);
    state.markersByCityId[city.id] = marker;
  });

  renderCompanyMapStatus();
  window.setTimeout(() => {
    if (!state.map) {
      return;
    }
    state.map.invalidateSize();
    state.map.fitBounds(
      [
        [state.bootstrap.map_viewport.lat_min, state.bootstrap.map_viewport.lon_min],
        [state.bootstrap.map_viewport.lat_max, state.bootstrap.map_viewport.lon_max],
      ],
      {
        padding: [30, 30],
        animate: false,
      },
    );
    applyBrasixLeafletSettings(state.map, state.bootstrap.map_viewport, state.bootstrap.map_editor?.leaflet_settings || {});
  }, 40);
}

function selectHeadquarters(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId || !state.citiesById[nextCityId]) {
    return;
  }
  state.company.hqCityId = nextCityId;
  pruneFreightSelection();
  renderAll();
}

function companyBadgeMarkup() {
  const logo = currentLogoOption();
  const city = currentHqCity();
  return `
    <div class="game-setup-company-badge" style="--company-color:${escapeHtml(state.company.color)}">
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(logo.icon)}</span>
      <div>
        <strong>${escapeHtml(state.company.name || "Brasix")}</strong>
        <small>${escapeHtml(city?.label || "Sede indefinida")}</small>
      </div>
    </div>
  `;
}

function renderHeaderBadges() {
  if (!refs.headerBadges) {
    return;
  }
  const truckCount = selectedTruckEntries().reduce((total, entry) => total + entry.quantity, 0);
  const freightCount = selectedFreightEntries().length;
  const city = currentHqCity();
  const badges = [
    { label: "Mapa", value: state.bootstrap?.active_map?.name || "Mapa" },
    { label: "Sede", value: city?.label || "Sem sede" },
    { label: "Caminhoes", value: `${formatInteger(truckCount)} un` },
    { label: "Fretes", value: `${formatInteger(freightCount)} contratos` },
  ];

  refs.headerBadges.innerHTML = badges.map((badge) => `
    <article class="editor-header-badge">
      <span>${escapeHtml(badge.label)}</span>
      <strong>${escapeHtml(badge.value)}</strong>
    </article>
  `).join("");
}

function renderQuickMetrics() {
  if (!refs.quickMetrics) {
    return;
  }
  const currentFreights = outboundFreightsForCity(state.company.hqCityId);
  const totalSelectedFreightTonnes = selectedFreightEntries().reduce((total, flow) => total + Number(flow.quantity_t || 0), 0);
  const metrics = [
    { label: "Cidades no mapa", value: formatInteger(state.cities.length) },
    { label: "Caminhoes disponiveis", value: formatInteger(state.trucks.length) },
    { label: "Fretes da sede", value: formatInteger(currentFreights.length) },
    { label: "Volume contratado", value: formatTonnes(totalSelectedFreightTonnes) },
  ];

  refs.quickMetrics.innerHTML = metrics.map((item) => `
    <article class="game-setup-metric-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </article>
  `).join("");
}

function renderCompanySummary() {
  if (!refs.companySummary) {
    return;
  }
  const city = currentHqCity();
  refs.companySummary.innerHTML = `
    ${companyBadgeMarkup()}
    <div class="game-setup-summary-metrics">
      <article>
        <span>Populacao</span>
        <strong>${escapeHtml(city ? formatPopulation(city.population_thousands) : "-")}</strong>
      </article>
      <article>
        <span>Oferta local</span>
        <strong>${escapeHtml(city ? formatTonnes(city.supply_total_t) : "-")}</strong>
      </article>
      <article>
        <span>Demanda local</span>
        <strong>${escapeHtml(city ? formatTonnes(city.demand_total_t) : "-")}</strong>
      </article>
    </div>
  `;
}

function renderFleetSummary() {
  if (!refs.fleetSummary) {
    return;
  }
  const entries = selectedTruckEntries();
  if (!entries.length) {
    refs.fleetSummary.innerHTML = `<div class="truck-gallery-empty">Nenhum caminhao selecionado. Abra a janela de frota para montar a operacao inicial.</div>`;
    return;
  }
  const totalUnits = entries.reduce((total, entry) => total + entry.quantity, 0);
  const totalInvestment = entries.reduce((total, entry) => total + ((entry.truck.purchase_price_brl || 0) * entry.quantity), 0);
  const totalPayload = entries.reduce((total, entry) => total + ((entry.truck.payload_weight_kg || 0) * entry.quantity), 0);
  refs.fleetSummary.innerHTML = `
    <div class="game-setup-summary-metrics">
      <article>
        <span>Unidades</span>
        <strong>${escapeHtml(formatInteger(totalUnits))}</strong>
      </article>
      <article>
        <span>Investimento</span>
        <strong>${escapeHtml(formatCurrency(totalInvestment))}</strong>
      </article>
      <article>
        <span>Capacidade util</span>
        <strong>${escapeHtml(formatWeightKg(totalPayload))}</strong>
      </article>
    </div>
    <div class="game-setup-selection-list">
      ${entries.slice(0, 4).map((entry) => `
        <article class="game-setup-selection-line">
          <strong>${escapeHtml(entry.truck.short_label)}</strong>
          <span>${escapeHtml(`${formatInteger(entry.quantity)} un`)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFreightSummary() {
  if (!refs.freightSummary) {
    return;
  }
  const city = currentHqCity();
  const available = outboundFreightsForCity(state.company.hqCityId);
  const selected = selectedFreightEntries();
  if (!available.length) {
    refs.freightSummary.innerHTML = `<div class="truck-gallery-empty">A cidade-sede atual nao possui fretes de saida com volume positivo.</div>`;
    return;
  }
  const totalTonnes = selected.reduce((total, flow) => total + Number(flow.quantity_t || 0), 0);
  refs.freightSummary.innerHTML = `
    <div class="game-setup-summary-metrics">
      <article>
        <span>Sede ativa</span>
        <strong>${escapeHtml(city?.label || "-")}</strong>
      </article>
      <article>
        <span>Disponiveis</span>
        <strong>${escapeHtml(formatInteger(available.length))}</strong>
      </article>
      <article>
        <span>Selecionados</span>
        <strong>${escapeHtml(`${formatInteger(selected.length)} / ${formatTonnes(totalTonnes)}`)}</strong>
      </article>
    </div>
    <div class="game-setup-selection-list">
      ${selected.length
        ? selected.slice(0, 4).map((flow) => `
          <article class="game-setup-selection-line">
            <strong>${escapeHtml(flow.product_name)}</strong>
            <span>${escapeHtml(formatTonnes(flow.quantity_t))}</span>
          </article>
        `).join("")
        : `<div class="truck-gallery-empty">Nenhum frete marcado ainda.</div>`}
    </div>
  `;
}

function renderLogoGrid() {
  if (!refs.logoGrid) {
    return;
  }
  refs.logoGrid.innerHTML = COMPANY_LOGO_OPTIONS.map((option) => `
    <button
      class="game-setup-logo-chip${option.id === state.company.logoId ? " is-selected" : ""}"
      type="button"
      data-logo-id="${escapeHtml(option.id)}"
      aria-label="${escapeHtml(option.label)}"
      title="${escapeHtml(option.label)}"
      style="--company-color:${escapeHtml(state.company.color)}"
    >
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(option.icon)}</span>
    </button>
  `).join("");
}

function renderCompanyPreview() {
  if (!refs.companyPreview) {
    return;
  }
  const city = currentHqCity();
  const logo = currentLogoOption();
  refs.companyPreview.innerHTML = `
    <article class="game-setup-company-preview-card" style="--company-color:${escapeHtml(state.company.color)}">
      <div class="game-setup-company-preview-mark">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(logo.icon)}</span>
      </div>
      <div>
        <strong>${escapeHtml(state.company.name || "Brasix")}</strong>
        <p>${escapeHtml(city?.label || "Escolha a sede")}</p>
      </div>
    </article>
  `;
}

function companyMarketCardMarkup(title, items, emptyMessage = "Sem itens com volume nesta lista.") {
  const topItems = (items || [])
    .filter((item) => Number(item?.value || 0) > 0)
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
          : `<p class="city-editor-help-text">${escapeHtml(emptyMessage)}</p>`}
      </div>
    </article>
  `;
}

function renderCompanyMarketPanels() {
  const city = currentHqCity();
  const emptyMessage = city ? "Sem itens com volume nesta lista." : "Selecione uma cidade no mapa.";

  if (refs.companyTopOffers) {
    refs.companyTopOffers.innerHTML = companyMarketCardMarkup("Top ofertas", city?.supply_items || [], emptyMessage);
  }
  if (refs.companyTopDemands) {
    refs.companyTopDemands.innerHTML = companyMarketCardMarkup("Top demandas", city?.demand_items || [], emptyMessage);
  }
}

function filteredCities() {
  const query = state.citySearch.trim().toLowerCase();
  return state.cities.filter((city) => {
    if (!query) {
      return true;
    }
    return [city.label, city.state_code, city.state_name, city.source_region_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderCityList() {
  if (!refs.cityList) {
    return;
  }
  const items = filteredCities();
  refs.cityList.innerHTML = items.length
    ? items.map((city) => `
      <button class="game-setup-city-row${city.id === state.company.hqCityId ? " is-selected" : ""}" type="button" data-city-id="${escapeHtml(city.id)}">
        <div>
          <strong>${escapeHtml(city.label)}</strong>
          <small>${escapeHtml(`${city.state_name} · ${formatPopulation(city.population_thousands)}`)}</small>
        </div>
        <span>${escapeHtml(formatTonnes(city.supply_total_t))}</span>
      </button>
    `).join("")
    : `<div class="truck-gallery-empty">Nenhuma cidade encontrada.</div>`;

  if (refs.companyCityTitle) {
    refs.companyCityTitle.textContent = currentHqCity()?.label || "Selecione a sede no mapa";
  }
}

function renderTruckRail() {
  if (!refs.truckRail) {
    return;
  }
  refs.truckRail.innerHTML = state.trucks.length
    ? state.trucks.map((truck) => {
      const quantity = Number(state.selectedTruckQuantities[truck.id] || 0);
      const imageUrl = versionedAssetUrl(truck.preview_image_url_path, truck.preview_image_version);
      const implementLabel = primaryImplementLabel(truck);
      const implementPrice = Number(truck.implement_cost_brl || 0) > 0 ? formatCurrency(truck.implement_cost_brl) : "-";
      const productEmojiMarkup = truckProductEmojiMarkup(truck);
      return `
        <article class="game-setup-rail-card game-setup-truck-card${quantity > 0 ? " is-selected" : ""}" data-rail-card="true">
          <div class="game-setup-truck-visual${imageUrl ? "" : " is-empty"}">
            ${imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(truck.label)}" loading="lazy" />`
              : `<span class="material-symbols-outlined" aria-hidden="true">local_shipping</span>`}
          </div>

          <div class="game-setup-rail-copy">
            <span class="eyebrow">${escapeHtml(`${slugLabel(truck.size_tier, SIZE_TIER_LABELS)} · ${slugLabel(truck.base_vehicle_kind, VEHICLE_KIND_LABELS)}`)}</span>
            <h3>${escapeHtml(truck.label)}</h3>
            <p>${escapeHtml(truck.axle_config || `${implementLabel} · ${formatInteger(truck.supported_product_count)} produtos`)}</p>
          </div>

          <div class="game-setup-spec-grid game-setup-truck-spec-grid">
            <article>
              <span>Capacidade</span>
              <strong>${escapeHtml(formatWeightKg(truck.payload_weight_kg))}</strong>
            </article>
            <article>
              <span>Caminhao</span>
              <strong>${escapeHtml(formatPriceOrFallback(truck.truck_price_brl))}</strong>
            </article>
            <article>
              <span>Volume</span>
              <strong>${escapeHtml(formatVolumeM3(truck.cargo_volume_m3))}</strong>
            </article>
            <article class="game-setup-implement-box">
              <span class="game-setup-box-kicker">${escapeHtml(`+ ${implementLabel}`)}</span>
              <strong>${escapeHtml(implementPrice)}</strong>
            </article>
            <article>
              <span>Produtos</span>
              <div class="game-setup-product-emoji-strip">${productEmojiMarkup}</div>
            </article>
            <article class="game-setup-total-box">
              <span>Total</span>
              <strong>${escapeHtml(formatPriceOrFallback(truck.purchase_price_brl))}</strong>
            </article>
          </div>

          <div class="game-setup-stepper">
            <button class="ghost-button game-setup-stepper-button" type="button" data-truck-change="-1" data-truck-id="${escapeHtml(truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">remove</span>
            </button>
            <strong>${escapeHtml(formatInteger(quantity))}</strong>
            <button class="editor-header-action game-setup-stepper-button" type="button" data-truck-change="1" data-truck-id="${escapeHtml(truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nenhum caminhao disponivel no catalogo ativo.</div>`;

  if (refs.truckRailMeta) {
    refs.truckRailMeta.textContent = `${formatInteger(state.trucks.length)} modelos no rolo`;
  }
  bindWheelRail(refs.truckRail);
  updateRailPerspective(refs.truckRail);
}

function renderTruckSelectionSummary() {
  if (!refs.truckSelection) {
    return;
  }
  const entries = selectedTruckEntries();
  if (!entries.length) {
    refs.truckSelection.innerHTML = `<div class="truck-gallery-empty">A frota inicial ainda esta vazia. Use os botoes + nos cartoes para adicionar unidades.</div>`;
    return;
  }
  const totalUnits = entries.reduce((total, entry) => total + entry.quantity, 0);
  const totalInvestment = entries.reduce((total, entry) => total + ((entry.truck.purchase_price_brl || 0) * entry.quantity), 0);
  const totalVolume = entries.reduce((total, entry) => total + ((entry.truck.cargo_volume_m3 || 0) * entry.quantity), 0);
  refs.truckSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">Resumo</span>
      <h3>${escapeHtml(formatInteger(totalUnits))} caminhoes selecionados</h3>
    </div>

    <div class="game-setup-summary-metrics game-setup-summary-metrics-compact">
      <article>
        <span>Investimento</span>
        <strong>${escapeHtml(formatCurrency(totalInvestment))}</strong>
      </article>
      <article>
        <span>Volume total</span>
        <strong>${escapeHtml(formatVolumeM3(totalVolume))}</strong>
      </article>
    </div>

    <div class="game-setup-selection-list">
      ${entries.map((entry) => `
        <article class="game-setup-selection-line game-setup-selection-line-editable">
          <strong>${escapeHtml(entry.truck.short_label)}</strong>
          <div class="game-setup-quantity-inline">
            <button class="ghost-button game-setup-stepper-button game-setup-quantity-button" type="button" data-truck-change="-1" data-truck-id="${escapeHtml(entry.truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">remove</span>
            </button>
            <span>${escapeHtml(`${formatInteger(entry.quantity)} un`)}</span>
            <button class="editor-header-action game-setup-stepper-button game-setup-quantity-button" type="button" data-truck-change="1" data-truck-id="${escapeHtml(entry.truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
        </article>
      `).join("")}
    </div>

    <div class="game-setup-modal-actions game-setup-inline-actions">
      <button class="editor-header-action" type="button" data-open-modal="freights">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        <span>Ir para fretes</span>
      </button>
    </div>
  `;
}

function renderFreightRail() {
  if (!refs.freightRail) {
    return;
  }
  const city = currentHqCity();
  const flows = outboundFreightsForCity(state.company.hqCityId);
  const supportedProductIds = selectedTruckSupportedProductIds();
  const hasSelectedFleet = selectedTruckEntries().length > 0;
  const compatibleCount = flows.filter((flow) => freightIsCompatible(flow, supportedProductIds)).length;
  refs.freightRail.innerHTML = flows.length
    ? flows.map((flow) => {
      const selected = state.selectedFreightIds.has(flow.id);
      const compatible = freightIsCompatible(flow, supportedProductIds);
      const compatibilityMessage = compatible
        ? "Compativel com a frota atual"
        : hasSelectedFleet
          ? "Inativo para a frota atual"
          : "Inativo ate escolher um caminhao compativel";
      return `
        <article class="game-setup-rail-card game-setup-freight-card${selected ? " is-selected" : ""}${compatible ? "" : " is-disabled"}" data-rail-card="true" style="--freight-color:${escapeHtml(flow.product_color || state.company.color)}">
          <div class="game-setup-freight-product">
            <span class="game-setup-product-emoji">${escapeHtml(flow.product_emoji || "📦")}</span>
            <div>
              <strong>${escapeHtml(flow.product_name)}</strong>
              <small>${escapeHtml(formatTonnes(flow.quantity_t))}</small>
            </div>
          </div>

          <div class="game-setup-freight-route">
            <strong>${escapeHtml(flow.origin_label)}</strong>
            <span class="material-symbols-outlined" aria-hidden="true">east</span>
            <strong>${escapeHtml(flow.destination_label)}</strong>
          </div>

          <div class="game-setup-spec-grid game-setup-freight-spec-grid">
            <article>
              <span>Distancia</span>
              <strong>${escapeHtml(formatDistanceKm(flow.distance_km))}</strong>
            </article>
            <article>
              <span>Origem</span>
              <strong>${escapeHtml(city?.state_code || "-")}</strong>
            </article>
          </div>

          <p class="game-setup-compatibility-note${compatible ? " is-active" : ""}">${escapeHtml(compatibilityMessage)}</p>

          <button class="editor-header-action game-setup-freight-toggle" type="button" data-toggle-freight="${escapeHtml(flow.id)}"${compatible ? "" : " disabled"}>
            <span class="material-symbols-outlined" aria-hidden="true">${selected ? "check_circle" : compatible ? "add_circle" : "block"}</span>
            <span>${selected ? "Selecionado" : compatible ? "Atender" : "Sem frota compativel"}</span>
          </button>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nao ha fretes de saida ativos para ${escapeHtml(city?.label || "a cidade atual")}.</div>`;

  if (refs.freightRailMeta) {
    refs.freightRailMeta.textContent = `${formatInteger(flows.length)} fretes saindo da sede · ${formatInteger(compatibleCount)} ativos para a frota`;
  }
  if (refs.freightRailTitle) {
    refs.freightRailTitle.textContent = `Fretes de saida de ${city?.label || "sede indefinida"}`;
  }
  bindWheelRail(refs.freightRail);
  updateRailPerspective(refs.freightRail);
}

function renderFreightSelectionSummary() {
  if (!refs.freightSelection) {
    return;
  }
  const entries = selectedFreightEntries();
  const city = currentHqCity();
  if (!entries.length) {
    refs.freightSelection.innerHTML = `<div class="truck-gallery-empty">Nenhum contrato selecionado ainda para ${escapeHtml(city?.label || "a sede atual")}.</div>`;
    return;
  }
  const totalTonnes = entries.reduce((total, flow) => total + Number(flow.quantity_t || 0), 0);
  const averageDistance = entries.reduce((total, flow) => total + Number(flow.distance_km || 0), 0) / entries.length;
  refs.freightSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">Carteira</span>
      <h3>${escapeHtml(formatInteger(entries.length))} contratos selecionados</h3>
    </div>

    <div class="game-setup-summary-metrics">
      <article>
        <span>Volume total</span>
        <strong>${escapeHtml(formatTonnes(totalTonnes))}</strong>
      </article>
      <article>
        <span>Distancia media</span>
        <strong>${escapeHtml(formatDistanceKm(averageDistance))}</strong>
      </article>
    </div>

    <div class="game-setup-selection-list">
      ${entries.map((flow) => `
        <article class="game-setup-selection-line">
          <strong>${escapeHtml(flow.product_name)}</strong>
          <span>${escapeHtml(`${formatTonnes(flow.quantity_t)} · ${formatDistanceKm(flow.distance_km)}`)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderCompanyModal() {
  if (refs.companyNameInput) {
    refs.companyNameInput.value = state.company.name;
  }
  if (refs.companyColorInput) {
    refs.companyColorInput.value = state.company.color;
  }
  if (refs.companyColorTextInput) {
    refs.companyColorTextInput.value = state.company.color;
  }
  if (refs.companyCityTitle) {
    refs.companyCityTitle.textContent = currentHqCity()?.label || "Selecione a sede no mapa";
  }
  renderCompanyMapStatus();
  renderLogoGrid();
  renderCompanyPreview();
  renderCompanyMarketPanels();
  renderCityList();
  if (state.currentModal === "company") {
    renderMap();
  }
}

function mergeTruckCompatibility(matrixPayload) {
  const mergedProducts = {
    ...state.productsById,
    ...Object.fromEntries(
      (Array.isArray(matrixPayload?.products) ? matrixPayload.products : [])
        .map((product) => {
          const productId = String(product?.id || "").trim();
          return productId
            ? [productId, { ...(state.productsById[productId] || {}), ...product }]
            : null;
        })
        .filter(Boolean),
    ),
  };
  const compatibilityByTruckId = Object.fromEntries(
    (Array.isArray(matrixPayload?.trucks) ? matrixPayload.trucks : [])
      .map((truck) => {
        const truckId = String(truck?.id || "").trim();
        return truckId
          ? [truckId, supportedProductIdsForTruck(truck)]
          : null;
      })
      .filter(Boolean),
  );

  state.productsById = mergedProducts;
  state.trucks = state.trucks.map((truck) => ({
    ...truck,
    supported_product_ids: supportedProductIdsForTruck(truck).length
      ? supportedProductIdsForTruck(truck)
      : compatibilityByTruckId[truck.id] || [],
  }));
  state.trucksById = Object.fromEntries(state.trucks.map((truck) => [truck.id, truck]));
  pruneFreightSelection();
}

function renderFleetModal() {
  renderTruckRail();
  renderTruckSelectionSummary();
}

function renderFreightModal() {
  renderFreightRail();
  renderFreightSelectionSummary();
}

function renderAll() {
  renderHeaderBadges();
  renderQuickMetrics();
  renderCompanySummary();
  renderFleetSummary();
  renderFreightSummary();
  renderCompanyModal();
  renderFleetModal();
  renderFreightModal();
}

function updateModalVisibility() {
  const modalName = state.currentModal;
  if (!refs.modalRoot) {
    return;
  }
  const hasModal = Boolean(modalName);
  refs.modalRoot.hidden = !hasModal;
  document.body.classList.toggle("game-setup-modal-open", hasModal);
  refs.modalRoot.querySelectorAll("[data-modal]").forEach((modal) => {
    modal.hidden = modal.getAttribute("data-modal") !== modalName;
  });
  if (modalName === "company") {
    window.setTimeout(() => renderMap(), 40);
  }
}

function openModal(modalName) {
  state.currentModal = modalName;
  updateModalVisibility();
}

function closeModal() {
  state.currentModal = "";
  updateModalVisibility();
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
  if (event.defaultPrevented || event.ctrlKey || !state.currentModal) {
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

function adjustTruckQuantity(truckId, delta) {
  const currentValue = Number(state.selectedTruckQuantities[truckId] || 0);
  const nextValue = Math.max(0, currentValue + Number(delta || 0));
  if (nextValue <= 0) {
    delete state.selectedTruckQuantities[truckId];
  } else {
    state.selectedTruckQuantities[truckId] = nextValue;
  }
  pruneFreightSelection();
  renderAll();
}

function toggleFreightSelection(flowId) {
  const flow = state.freightFlowsById[flowId];
  if (!flow || !freightIsCompatible(flow)) {
    return;
  }
  if (state.selectedFreightIds.has(flowId)) {
    state.selectedFreightIds.delete(flowId);
  } else {
    state.selectedFreightIds.add(flowId);
  }
  renderAll();
}

function handleClicks(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const openButton = target.closest("[data-open-modal]");
  if (openButton) {
    openModal(openButton.getAttribute("data-open-modal") || "");
    return;
  }

  const closeButton = target.closest("[data-close-modal]");
  if (closeButton) {
    closeModal();
    return;
  }

  const logoButton = target.closest("[data-logo-id]");
  if (logoButton) {
    state.company.logoId = logoButton.getAttribute("data-logo-id") || COMPANY_LOGO_OPTIONS[0].id;
    renderAll();
    return;
  }

  const cityButton = target.closest("[data-city-id]");
  if (cityButton) {
    selectHeadquarters(cityButton.getAttribute("data-city-id") || "");
    return;
  }

  const truckButton = target.closest("[data-truck-change]");
  if (truckButton) {
    adjustTruckQuantity(
      truckButton.getAttribute("data-truck-id") || "",
      Number(truckButton.getAttribute("data-truck-change") || 0),
    );
    return;
  }

  const freightButton = target.closest("[data-toggle-freight]");
  if (freightButton) {
    toggleFreightSelection(freightButton.getAttribute("data-toggle-freight") || "");
  }
}

function handleInputs(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target === refs.companyNameInput) {
    state.company.name = target.value.trim() || "Brasix";
    renderHeaderBadges();
    renderCompanySummary();
    renderCompanyPreview();
    return;
  }

  if (target === refs.companyColorInput) {
    state.company.color = normalizeColor(target.value);
    renderAll();
    return;
  }

  if (target === refs.companyColorTextInput) {
    state.company.color = normalizeColor(target.value);
    renderAll();
    return;
  }

  if (target === refs.citySearchInput) {
    state.citySearch = target.value || "";
    renderCityList();
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && state.currentModal) {
    closeModal();
  }
}

function bindEvents() {
  refs.themeToggle?.addEventListener("click", () => {
    setTheme(getStoredTheme() === "night" ? "day" : "night");
  });
  document.addEventListener("click", handleClicks);
  document.addEventListener("input", handleInputs);
  document.addEventListener("keydown", handleKeydown);
  refs.modalRoot?.addEventListener("wheel", handleRailWheel, { passive: false, capture: true });
  window.addEventListener("resize", () => {
    updateRailPerspective(refs.truckRail);
    updateRailPerspective(refs.freightRail);
    if (state.map) {
      state.map.invalidateSize();
    }
  });
}

async function initialize() {
  setTheme(getStoredTheme());
  const [payload, matrixPayload, cityPayload] = await Promise.all([
    fetchJson("/api/jogo/preparacao/bootstrap"),
    fetchJson("/api/viewer/truck-product-matrix").catch(() => null),
    fetchJson("/api/editor/cidade/bootstrap").catch(() => null),
  ]);
  normalizeBootstrap(payload);
  if (setupBootstrapNeedsMarketFallback()) {
    mergeCityMarketData(cityPayload);
  }
  mergeTruckCompatibility(matrixPayload);
  bindEvents();
  renderAll();
}

initialize().catch((error) => {
  console.error("Brasix game setup initialization failed:", error);
  throw error;
});