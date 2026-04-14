import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  findPopulationBand,
  fitBrasixBounds,
  sortPopulationBands,
} from "./shared/leaflet-map.js";
import { escapeHtml, numberFormatter, roundNumber } from "./shared/formatters.js";
import { buildOpeningContextState, openingBandPricePath } from "./shared/opening-pricing.js?v=20260413-opening-2";

const THEME_KEY = "brasix:v1:pricing-editor-theme";
const DIFFICULTIES = [
  { id: "hard", label: "Dificil" },
  { id: "standard", label: "Padrao" },
  { id: "sandbox", label: "Sandbox" },
];
const SORT_OPTIONS = [
  { id: "opening_desc", label: "Maior abertura" },
  { id: "opening_asc", label: "Menor abertura" },
  { id: "alphabetical", label: "Alfabetica" },
];
const SIZE_TIER_ORDER = ["super_leve", "leve", "medio", "pesado", "super_pesado"];
const GLOBAL_CAPITAL_STARTER_TIERS = ["leve", "medio"];
const DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL = 1000000;
const SIZE_TIER_LABELS = {
  super_leve: "Super-leve",
  leve: "Leve",
  medio: "Medio",
  pesado: "Pesado",
  super_pesado: "Super-pesado",
};
const PARAMETER_TABS = [
  { id: "opening", label: "Sede" },
  { id: "freight", label: "Frete" },
  { id: "capital", label: "Capital" },
];
const PREVIEW_TABS = [
  { id: "city", label: "Sede" },
  { id: "freight", label: "Fretes" },
  { id: "capital", label: "Capital" },
];
const FIELD_GROUPS = [
  {
    id: "opening_base",
    tab: "opening",
    label: "Bases por faixa",
    help: "Cada cidade usa um unico preco-base: o da faixa populacional definida no editor de mapa. Nao existe mais tripleto pequena, media e grande.",
    formula: "preco_abertura = preco_base_faixa x (1 + teto_cidade x score_cidade)",
    fields: [],
  },
  {
    id: "opening_drivers",
    tab: "opening",
    label: "Drivers da sede",
    help: "O score da cidade mistura populacao, relevancia de fretes de origem e relevancia de fretes de destino. Dentro dos fretes, quantidade e volume entram juntos.",
    formula: "score_cidade = (wp x pop + wo x score_origem + wd x score_destino) / (wp + wo + wd)",
    fields: [
      { path: "opening.city_multiplier_max", label: "Teto da cidade", min: 0, max: 1, step: 0.01, format: "percent", help: "Multiplicador maximo aplicado sobre o preco-base da faixa quando a cidade tem score logistico alto." },
      { path: "opening.population_weight", label: "Peso populacao", min: 0, max: 1, step: 0.01, format: "percent", help: "Peso do tamanho populacional da cidade no score de abertura." },
      { path: "opening.outbound_weight", label: "Peso origem", min: 0, max: 1, step: 0.01, format: "percent", help: "Peso da forca da cidade como origem de fretes." },
      { path: "opening.inbound_weight", label: "Peso destino", min: 0, max: 1, step: 0.01, format: "percent", help: "Peso da forca da cidade como destino de fretes." },
      { path: "opening.market_count_weight", label: "Peso qtd fretes", min: 0, max: 1, step: 0.01, format: "percent", help: "Peso da quantidade de fretes ao medir a atividade logistica da cidade." },
      { path: "opening.market_volume_weight", label: "Peso volume", min: 0, max: 1, step: 0.01, format: "percent", help: "Peso do volume total transportado ao medir a atividade logistica da cidade." },
    ],
  },
  {
    id: "freight_core",
    tab: "freight",
    label: "Tarifa e distancia",
    help: "Nucleo do preco de frete: taxa por tonelada-quilometro, piso operacional e ajustes para curta e longa distancia.",
    formula: "preco_mercado = qtd_t x km x tarifa_base x fator_distancia x fator_carga x fator_produto",
    fields: [
      { path: "freight.base_rate_brl_per_tkm", label: "Tarifa base", min: 0.05, max: 1.2, step: 0.01, format: "rate_per_tkm", help: "Preco-base cobrado por tonelada-quilometro antes dos demais multiplicadores." },
      { path: "freight.floor_margin_multiplier", label: "Margem minima", min: 1, max: 2, step: 0.01, format: "factor", help: "Multiplicador minimo sobre o custo operacional para formar o piso do contrato." },
      { path: "freight.short_haul_markup_max", label: "Markup curto", min: 0, max: 0.5, step: 0.01, format: "percent", help: "Premio maximo para rotas curtas, que costumam ter mais friccao operacional por km." },
      { path: "freight.long_haul_discount_max", label: "Desconto longo", min: 0, max: 0.5, step: 0.01, format: "percent", help: "Desconto maximo para rotas longas, que diluem custo fixo por km." },
      { path: "freight.short_haul_reference_km", label: "Curta referencia", min: 50, max: 500, step: 10, format: "km", help: "Ate esta distancia o markup curto atua com mais forca." },
      { path: "freight.long_haul_reference_km", label: "Longa referencia", min: 400, max: 2500, step: 50, format: "km", help: "Depois desta distancia o desconto de longa distancia ja esta praticamente completo." },
    ],
  },
  {
    id: "freight_ops",
    tab: "freight",
    label: "Operacao e sede",
    help: "Custos operacionais do frete e bonus ligados a operar a partir da cidade onde a empresa abriu sede.",
    formula: "preco_jogador = max(preco_mercado, piso_operacional) x (1 + bonus_sede)",
    fields: [
      { path: "freight.handling_base_brl", label: "Manuseio base", min: 0, max: 1000, step: 10, format: "compact_currency", help: "Parcela fixa de carregamento, descarga e burocracia do contrato." },
      { path: "freight.handling_per_t_brl", label: "Manuseio por t", min: 0, max: 30, step: 0.5, format: "rate_per_t", help: "Parcela variavel de manuseio cobrada por tonelada transportada." },
      { path: "freight.cycle_distance_multiplier", label: "Multiplicador ciclo", min: 1, max: 3, step: 0.05, format: "factor", help: "Converte a distancia simples em distancia operacional do ciclo completo do veiculo." },
      { path: "freight.driver_daily_km", label: "Rodagem diaria", min: 150, max: 1200, step: 10, format: "km", help: "Quanto um motorista consegue rodar por dia no modelo de custo do frete." },
      { path: "freight.hq_origin_bonus", label: "Bonus sede origem", min: 0, max: 0.25, step: 0.01, format: "percent", help: "Bonus comercial quando a sede da empresa esta na cidade de origem do frete." },
      { path: "freight.hq_destination_bonus", label: "Bonus sede destino", min: 0, max: 0.25, step: 0.01, format: "percent", help: "Bonus comercial quando a sede da empresa esta na cidade de destino do frete." },
      { path: "freight.hq_bonus_cap", label: "Teto bonus sede", min: 0, max: 0.3, step: 0.01, format: "percent", help: "Limite maximo para a soma dos bonus de sede na origem e no destino." },
      { path: "freight.diesel_origin_weight", label: "Peso diesel origem", min: 0, max: 1, step: 0.05, format: "percent", help: "Peso do preco de diesel da origem no ajuste regional do custo variavel." },
      { path: "freight.diesel_destination_weight", label: "Peso diesel destino", min: 0, max: 1, step: 0.05, format: "percent", help: "Peso do preco de diesel do destino no ajuste regional do custo variavel." },
    ],
  },
  {
    id: "freight_specialization",
    tab: "freight",
    label: "Carga e risco",
    help: "Multiplicadores ligados ao tipo logistico da carga, valor agregado e requisitos especiais do produto.",
    formula: "fator_carga = especializacao x valor x perecivel x fragil x temperatura x risco",
    fields: [
      { path: "freight.specialization_bulk_multiplier", label: "Granel", min: 0.5, max: 2.2, step: 0.01, format: "factor", help: "Multiplicador para produtos a granel solido." },
      { path: "freight.specialization_general_multiplier", label: "Carga geral", min: 0.5, max: 2.2, step: 0.01, format: "factor", help: "Multiplicador para carga geral sem requisito logistico especial." },
      { path: "freight.specialization_palletized_multiplier", label: "Paletizada", min: 0.5, max: 2.2, step: 0.01, format: "factor", help: "Multiplicador para carga paletizada e embarques padronizados." },
      { path: "freight.specialization_refrigerated_multiplier", label: "Frigorificada", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador para rotas que exigem frio ou cadeia refrigerada." },
      { path: "freight.specialization_tank_multiplier", label: "Tanque", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador para liquidos, gases ou cargas operadas em tanque." },
      { path: "freight.specialization_live_multiplier", label: "Carga viva", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador para transporte de animais vivos." },
      { path: "freight.specialization_hazardous_multiplier", label: "Perigosa", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador base para categorias logisticas perigosas." },
      { path: "freight.value_class_medium_multiplier", label: "Valor medio", min: 0.5, max: 2.2, step: 0.01, format: "factor", help: "Ajuste para produtos de valor agregado medio." },
      { path: "freight.value_class_high_multiplier", label: "Valor alto", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Ajuste para produtos de valor agregado alto." },
      { path: "freight.perishable_multiplier", label: "Perecivel", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador adicional para perecibilidade." },
      { path: "freight.fragile_multiplier", label: "Fragil", min: 0.5, max: 2.2, step: 0.01, format: "factor", help: "Multiplicador adicional para risco de quebra ou avaria." },
      { path: "freight.temperature_control_multiplier", label: "Temperatura", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador adicional para controle de temperatura." },
      { path: "freight.hazardous_multiplier", label: "Risco quimico", min: 0.5, max: 2.5, step: 0.01, format: "factor", help: "Multiplicador adicional para risco quimico e seguranca." },
    ],
  },
  {
    id: "capital",
    tab: "capital",
    label: "Capital inicial",
    help: "Capital minimo global para iniciar a operacao, considerando uma frota-base fixa, base de caixa, colchao de reserva e fator de liquidez por dificuldade. O custo da sede nao entra nesta conta e a cidade ativa nao altera esta formula.",
    formula: "capital = frota + (base_caixa + reserva + buffer) x fator_liquidez",
    fields: [
      { path: "capital.base_initial_cash_brl", label: "Base de caixa", min: 0, max: 2000000, step: 10000, format: "compact_currency", defaultValue: DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL, help: "Valor base de caixa incluido no capital inicial antes da aplicacao do fator de liquidez por dificuldade." },
      { path: "capital.reserve_days", label: "Dias de reserva", min: 0, max: 60, step: 1, format: "days", help: "Quantidade de dias de custo fixo da frota guardada como reserva de caixa." },
      { path: "capital.buffer_percent", label: "Buffer financeiro", min: 0, max: 0.5, step: 0.01, format: "percent", help: "Margem de seguranca aplicada sobre abertura e investimento inicial em frota." },
      { path: "capital.hard_liquidity_factor", label: "Liquidez dificil", min: 0.2, max: 1.2, step: 0.05, format: "factor", help: "Fator de folga de caixa usado na dificuldade dificil." },
      { path: "capital.standard_liquidity_factor", label: "Liquidez padrao", min: 0.5, max: 1.8, step: 0.05, format: "factor", help: "Fator de folga de caixa usado na dificuldade padrao." },
      { path: "capital.sandbox_liquidity_factor", label: "Liquidez sandbox", min: 1, max: 3, step: 0.05, format: "factor", help: "Fator de folga de caixa usado no modo sandbox." },
    ],
  },
];

let floatingHelpTooltip = null;
let activeHelpTarget = null;

const refs = {
  headerBadges: document.getElementById("pricing-editor-header-badges"),
  saveButton: document.getElementById("pricing-editor-save-button"),
  resetButton: document.getElementById("pricing-editor-reset-button"),
  themeButton: document.getElementById("pricing-editor-theme-toggle"),
  citiesSummary: document.getElementById("pricing-editor-cities-summary"),
  stateSelect: document.getElementById("pricing-editor-state"),
  bandSelect: document.getElementById("pricing-editor-band"),
  searchInput: document.getElementById("pricing-editor-search"),
  sortSelect: document.getElementById("pricing-editor-sort"),
  citiesList: document.getElementById("pricing-editor-cities-list"),
  mapStage: document.getElementById("pricing-editor-map-stage"),
  mapSummary: document.getElementById("pricing-editor-map-summary"),
  mapOverlayTitle: document.getElementById("pricing-editor-map-overlay-title"),
  metrics: document.getElementById("pricing-editor-metrics"),
  parametersSummary: document.getElementById("pricing-editor-parameters-summary"),
  parametersPanel: document.getElementById("pricing-editor-parameters-panel"),
  previewSummary: document.getElementById("pricing-editor-preview-summary"),
  previewTabs: document.getElementById("pricing-editor-preview-tabs"),
  previewCityPanel: document.getElementById("pricing-editor-preview-city-panel"),
  previewFreightPanel: document.getElementById("pricing-editor-preview-freight-panel"),
  previewCapitalPanel: document.getElementById("pricing-editor-preview-capital-panel"),
  cityPreview: document.getElementById("pricing-editor-city-preview"),
  freightsSummary: document.getElementById("pricing-editor-freights-summary"),
  freightsList: document.getElementById("pricing-editor-freights-list"),
  freightDetail: document.getElementById("pricing-editor-freight-detail"),
  capitalPanel: document.getElementById("pricing-editor-capital-panel"),
  starterPanel: document.getElementById("pricing-editor-starter-panel"),
};

const state = {
  bootstrap: null,
  defaultPricingDocument: null,
  pricingDocument: null,
  cities: [],
  citiesById: {},
  freightFlows: [],
  freightFlowsById: {},
  productsById: {},
  productOperationalById: {},
  trucks: [],
  dieselByCityId: {},
  averageDieselPrice: 0,
  selectedCityId: "",
  selectedFreightId: "",
  selectedDifficulty: "standard",
  sortMode: "opening_desc",
  search: "",
  selectedStateCode: "",
  selectedPopulationBandId: "",
  populationBands: [],
  pinsById: {},
  cityMarketStatsById: {},
  productSupplyMaxById: {},
  productDemandMaxById: {},
  productPriceReferenceMedian: 0,
  map: null,
  markerLayer: null,
  activeParameterTab: "opening",
  activePreviewTab: "city",
  dirty: false,
  saving: false,
  openingContextByCityId: {},
  openingPriceRange: { min: 0, max: 0 },
  populationScoreRange: { min: 0, max: 1 },
  outboundFreightsByCityId: {},
  inboundFreightsByCityId: {},
  pricedFreightsCacheByCityId: {},
  filteredCitiesCacheKey: "",
  filteredCitiesCache: [],
  mapMarkersByCityId: {},
  mapNeedsFullRefresh: true,
  lastRenderedSelectedCityId: "",
  needsPricingRebuild: false,
  pendingRenderFrame: 0,
  documentRevision: 0,
  persistedRevision: 0,
  autoSaveTimer: 0,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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

function clearAutoSaveTimer() {
  if (!state.autoSaveTimer) {
    return;
  }
  window.clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = 0;
}

function schedulePersistDocument(delayMs = 900) {
  if (!state.bootstrap?.active_map?.id || !state.pricingDocument) {
    return;
  }
  clearAutoSaveTimer();
  state.autoSaveTimer = window.setTimeout(() => {
    state.autoSaveTimer = 0;
    void persistDocument().catch((error) => {
      console.error("Brasix pricing editor auto-save failed:", error);
    });
  }, delayMs);
}

function markDocumentDirty({ needsPricingRebuild = false } = {}) {
  state.documentRevision += 1;
  state.dirty = true;
  if (needsPricingRebuild) {
    state.needsPricingRebuild = true;
  }
  renderSaveButton();
  schedulePersistDocument();
}

function formatTonnes(value) {
  return `${numberFormat(Math.abs(Number(value || 0)) >= 100 ? 0 : 1).format(roundNumber(Number(value || 0), 2))} t`;
}

function formatDistanceKm(value) {
  return `${numberFormat(Number(value || 0) >= 100 ? 0 : 1).format(roundNumber(Number(value || 0), 1))} km`;
}

function formatPercent(value) {
  return `${numberFormat(1).format(roundNumber(Number(value || 0) * 100, 1))}%`;
}

function formatPopulation(value) {
  return `${numberFormat(Number(value || 0) >= 100 ? 0 : 1).format(roundNumber(Number(value || 0), 1))} mil hab`;
}

function formatCompactCurrency(value) {
  const numericValue = Number(value || 0);
  if (Math.abs(numericValue) >= 1000) {
    const scaledValue = numericValue / 1000;
    const digits = Math.abs(scaledValue) >= 100 ? 0 : 1;
    return `R$ ${numberFormat(digits).format(roundNumber(scaledValue, digits))} mil`;
  }
  return `R$ ${numberFormat(0).format(roundNumber(numericValue, 0))}`;
}

function formatCurrencyPerTon(value) {
  const numericValue = Number(value || 0);
  const digits = Math.abs(numericValue) >= 100 ? 0 : 1;
  return `R$ ${numberFormat(digits).format(roundNumber(numericValue, 2))}/t util`;
}

function formatParameterValue(field, value) {
  const numericValue = Number(value || 0);
  switch (field?.format) {
    case "compact_currency":
    case "currency_compact":
      return formatCompactCurrency(numericValue);
    case "percent":
      return formatPercent(numericValue);
    case "factor":
      return `${numberFormat(2).format(roundNumber(numericValue, 2))}x`;
    case "km":
      return `${numberFormat(0).format(roundNumber(numericValue, 0))} km`;
    case "rate":
      return `R$ ${numberFormat(2).format(roundNumber(numericValue, 2))}`;
    case "rate_per_tkm":
      return `R$ ${numberFormat(2).format(roundNumber(numericValue, 2))}/t.km`;
    case "rate_per_t":
      return `R$ ${numberFormat(numericValue >= 10 ? 0 : 1).format(roundNumber(numericValue, 1))}/t`;
    case "days":
      return `${numberFormat(0).format(roundNumber(numericValue, 0))} d`;
    default:
      return numberFormat(2).format(roundNumber(numericValue, 2));
  }
}

function parameterFieldRatio(field, value) {
  return normalizeRange(Number(value || 0), Number(field?.min || 0), Number(field?.max || 1));
}

function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY) === "night" ? "night" : "day";
  } catch (_error) {
    return "day";
  }
}

function applyTheme(theme) {
  const nextTheme = theme === "night" ? "night" : "day";
  document.documentElement.classList.add("pricing-editor-page");
  document.documentElement.dataset.editorTheme = nextTheme;
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch (_error) {
    // noop
  }
  const icon = refs.themeButton?.querySelector(".material-symbols-outlined");
  const label = refs.themeButton?.querySelector("span:last-child");
  if (icon) {
    icon.textContent = nextTheme === "night" ? "light_mode" : "dark_mode";
  }
  if (label) {
    label.textContent = nextTheme === "night" ? "Modo claro" : "Modo noturno";
  }
}

function toggleTheme() {
  applyTheme(getStoredTheme() === "night" ? "day" : "night");
}

function fetchJson(url, options = {}) {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || `Falha em ${url}`);
    }
    return data;
  });
}

function buildOperationalIndex(items) {
  return Object.fromEntries(
    (Array.isArray(items) ? items : [])
      .map((item) => {
        const productId = String(item?.product_id || "").trim();
        return productId ? [productId, item] : null;
      })
      .filter(Boolean),
  );
}

function setNestedValue(target, path, value) {
  const keys = String(path || "").split(".");
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function getNestedValue(target, path, fallback = "") {
  return String(path || "")
    .split(".")
    .reduce((accumulator, key) => (accumulator && accumulator[key] != null ? accumulator[key] : undefined), target) ?? fallback;
}

function ensurePricingCapitalDefaults(document, fallbackDocument = null) {
  const nextDocument = deepClone(document || {});
  if (!nextDocument.capital || typeof nextDocument.capital !== "object") {
    nextDocument.capital = {};
  }

  const fallbackBaseInitialCash = Number(
    getNestedValue(
      fallbackDocument || {},
      "capital.base_initial_cash_brl",
      DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL,
    ),
  );
  const currentBaseInitialCash = Number(nextDocument.capital.base_initial_cash_brl);

  nextDocument.capital.base_initial_cash_brl = Number.isFinite(currentBaseInitialCash)
    ? currentBaseInitialCash
    : fallbackBaseInitialCash;

  return nextDocument;
}

function resetFilteredCitiesCache() {
  state.filteredCitiesCacheKey = "";
  state.filteredCitiesCache = [];
}

function scheduleComputedRender() {
  if (state.pendingRenderFrame) {
    return;
  }
  state.pendingRenderFrame = window.requestAnimationFrame(() => {
    state.pendingRenderFrame = 0;
    renderAllComputed();
  });
}

function currentCity() {
  return state.citiesById[state.selectedCityId] || state.cities[0] || null;
}

function currentPopulationBand(city = currentCity()) {
  return city ? findPopulationBand(city, state.populationBands) : null;
}

function populationBandLabel(band) {
  return String(band?.label || "Faixa nao definida");
}

function populationBandRangeLabel(band) {
  if (!band) {
    return "Sem faixa populacional";
  }
  const minLabel = formatPopulation(Number(band.min_population_thousands || 0));
  if (band.max_population_thousands == null) {
    return `Acima de ${minLabel}`;
  }
  return `${minLabel} a ${formatPopulation(Number(band.max_population_thousands || 0))}`;
}

function supportedProductIdsForTruck(truck) {
  const directIds = Array.isArray(truck?.supported_product_ids)
    ? truck.supported_product_ids
    : Array.isArray(truck?.supportedProductIds)
      ? truck.supportedProductIds
      : [];
  return directIds
    .map((productId) => String(productId || "").trim())
    .filter(Boolean);
}

function renderHelpBadge(text) {
  const safeText = escapeHtml(String(text || ""));
  return `<span class="flow-editor-help" tabindex="0" data-tooltip="${safeText}" aria-label="${safeText}">?</span>`;
}

function ensureFloatingHelpTooltip() {
  if (floatingHelpTooltip) {
    return floatingHelpTooltip;
  }
  floatingHelpTooltip = document.createElement("div");
  floatingHelpTooltip.className = "flow-editor-floating-tooltip";
  floatingHelpTooltip.hidden = true;
  document.body.appendChild(floatingHelpTooltip);
  return floatingHelpTooltip;
}

function hideFloatingHelpTooltip() {
  activeHelpTarget = null;
  if (!floatingHelpTooltip) {
    return;
  }
  floatingHelpTooltip.hidden = true;
  floatingHelpTooltip.classList.remove("is-visible");
}

function positionFloatingHelpTooltip(target) {
  if (!target) {
    return;
  }
  const tooltip = ensureFloatingHelpTooltip();
  const text = String(target.dataset.tooltip || "").trim();
  if (!text) {
    hideFloatingHelpTooltip();
    return;
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  tooltip.classList.add("is-visible");
  tooltip.style.left = "12px";
  tooltip.style.top = "12px";

  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportPadding = 12;
  let left = rect.right + 10;
  let top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);

  if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
    left = rect.left - tooltipRect.width - 10;
  }
  if (left < viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
  }
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showFloatingHelpTooltip(target) {
  activeHelpTarget = target;
  positionFloatingHelpTooltip(target);
}

function bindHelpBadges() {
  refs.parametersPanel?.querySelectorAll(".flow-editor-help").forEach((badge) => {
    badge.addEventListener("mouseenter", () => {
      showFloatingHelpTooltip(badge);
    });
    badge.addEventListener("mouseleave", () => {
      hideFloatingHelpTooltip();
    });
    badge.addEventListener("focus", () => {
      showFloatingHelpTooltip(badge);
    });
    badge.addEventListener("blur", () => {
      hideFloatingHelpTooltip();
    });
  });
}

function buildOpeningBandField(band) {
  const bandId = String(band?.id || "").trim();
  const defaultValue = Number(getNestedValue(state.defaultPricingDocument, openingBandPricePath(bandId), 0));
  const step = defaultValue >= 300000 ? 10000 : 5000;
  const min = Math.max(step, Math.floor((Math.max(defaultValue, step) * 0.45) / step) * step);
  const max = Math.max(min + step, Math.ceil((Math.max(defaultValue, step) * 2.2) / step) * step);
  return {
    path: openingBandPricePath(bandId),
    label: populationBandLabel(band),
    min,
    max,
    step,
    format: "compact_currency",
    help: `Preco-base da sede para cidades na faixa ${populationBandLabel(band)}. O preco final ainda recebe o multiplicador logistico da cidade.`,
  };
}

function buildFieldGroups() {
  return FIELD_GROUPS.map((group) => ({
    ...group,
    fields: group.id === "opening_base"
      ? state.populationBands.map((band) => buildOpeningBandField(band))
      : group.fields,
  }));
}

function findFieldDefinition(path) {
  return buildFieldGroups()
    .flatMap((group) => group.fields)
    .find((field) => field.path === path) || null;
}

function selectedDifficultyLabel() {
  return DIFFICULTIES.find((item) => item.id === state.selectedDifficulty)?.label || "Padrao";
}

function formatTruckSizeTier(sizeTier) {
  const normalized = String(sizeTier || "").trim().toLowerCase();
  return SIZE_TIER_LABELS[normalized] || normalized.replace(/_/g, " ") || "Porte indefinido";
}

function stateFilterOptions() {
  return Array.from(new Map(
    state.cities
      .map((city) => {
        const code = String(city?.state_code || "").trim();
        if (!code) {
          return null;
        }
        return [code, {
          id: code,
          label: city?.state_name ? `${city.state_name} (${code})` : code,
        }];
      })
      .filter(Boolean),
  ).values()).sort((left, right) => String(left.label).localeCompare(String(right.label), "pt-BR"));
}

function bandFilterOptions() {
  return state.populationBands
    .map((band) => ({
      id: String(band?.id || "").trim(),
      label: populationBandLabel(band),
    }))
    .filter((item) => item.id);
}

function normalizeBootstrap(payload) {
  state.bootstrap = payload;
  state.defaultPricingDocument = ensurePricingCapitalDefaults(deepClone(payload?.default_pricing_document || {}));
  state.pricingDocument = ensurePricingCapitalDefaults(
    deepClone(payload?.pricing_document || {}),
    state.defaultPricingDocument,
  );
  state.cities = Array.isArray(payload?.cities) ? payload.cities : [];
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.freightFlows = (Array.isArray(payload?.freight_flows) ? payload.freight_flows : []).filter((flow) => Number(flow.quantity_t || 0) > 0);
  state.freightFlowsById = Object.fromEntries(state.freightFlows.map((flow) => [flow.id, flow]));
  state.productsById = Object.fromEntries(((payload?.products) || []).map((product) => [product.id, product]));
  state.productOperationalById = buildOperationalIndex(payload?.product_operational_catalog?.items || []);
  state.trucks = Array.isArray(payload?.trucks) ? payload.trucks : [];
  state.populationBands = sortPopulationBands(payload?.map_editor?.population_bands?.bands || payload?.map_editor?.population_bands || []);
  state.pinsById = Object.fromEntries(((payload?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]));
  state.dieselByCityId = Object.fromEntries(
    ((payload?.diesel_document?.city_values) || []).map((row) => [row.city_id, Number(row.final_value || 0)]),
  );
  const dieselValues = Object.values(state.dieselByCityId).filter((value) => Number(value) > 0);
  state.averageDieselPrice = dieselValues.length ? dieselValues.reduce((total, value) => total + Number(value), 0) / dieselValues.length : 0;
  state.selectedDifficulty = payload?.pricing_document?.scenario?.selected_difficulty || payload?.default_pricing_document?.scenario?.selected_difficulty || "standard";
  state.sortMode = payload?.pricing_document?.scenario?.sort_mode || payload?.default_pricing_document?.scenario?.sort_mode || "opening_desc";
  state.selectedCityId = payload?.summary?.selected_city_id || state.cities[0]?.id || "";
  state.search = "";
  state.selectedStateCode = "";
  state.selectedPopulationBandId = "";
  state.dirty = false;
  state.saving = false;
  state.documentRevision = 0;
  state.persistedRevision = 0;
  clearAutoSaveTimer();
  state.mapMarkersByCityId = {};
  state.mapNeedsFullRefresh = true;
  state.lastRenderedSelectedCityId = "";

  buildCityStats();
  buildProductMarketExtremes();
  buildProductPriceReferenceStats();
  state.needsPricingRebuild = true;
  syncSelectedFreight();
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
    const quantityTons = flowQuantityTons(flow);
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
  state.cityMarketStatsById = nextStats;
  state.outboundFreightsByCityId = outboundByCityId;
  state.inboundFreightsByCityId = inboundByCityId;
  state.pricedFreightsCacheByCityId = {};
}

function buildProductMarketExtremes() {
  const supplyMax = {};
  const demandMax = {};
  state.cities.forEach((city) => {
    (city.supply_items || []).forEach((item) => {
      const productId = String(item?.product_id || "").trim();
      if (!productId) {
        return;
      }
      supplyMax[productId] = Math.max(Number(supplyMax[productId] || 0), Number(item.value || 0));
    });
    (city.demand_items || []).forEach((item) => {
      const productId = String(item?.product_id || "").trim();
      if (!productId) {
        return;
      }
      demandMax[productId] = Math.max(Number(demandMax[productId] || 0), Number(item.value || 0));
    });
  });
  state.productSupplyMaxById = supplyMax;
  state.productDemandMaxById = demandMax;
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

function maxValue(items, selector) {
  return Math.max(0, ...items.map(selector));
}

function normalizeRange(value, minValue, maxValue) {
  const denominator = Number(maxValue) - Number(minValue);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (Number(value) - Number(minValue)) / denominator));
}

function openingNumber(path, fallback = 0) {
  const value = Number(
    getNestedValue(
      state.pricingDocument,
      path,
      getNestedValue(state.defaultPricingDocument, path, fallback),
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
  state.populationScoreRange = openingState.populationScoreRange;
  state.openingPriceRange = openingState.openingPriceRange;
  state.pricedFreightsCacheByCityId = {};
  state.mapNeedsFullRefresh = true;
  resetFilteredCitiesCache();
}

function populationScore(city) {
  const currentValue = Math.log1p(Number(city?.population_thousands || 0));
  return normalizeRange(currentValue, state.populationScoreRange.min, state.populationScoreRange.max);
}

function openingContextForCity(city) {
  if (!city) {
    return null;
  }
  return state.openingContextByCityId[city.id] || {
    band: currentPopulationBand(city),
    bandBasePrice: 0,
    openingPrice: 0,
    populationComponent: populationScore(city),
    outboundComponent: 0,
    inboundComponent: 0,
    blendedScore: 0,
    multiplier: 1,
    stats: state.cityMarketStatsById[city.id] || { outboundCount: 0, outboundTonnes: 0, inboundCount: 0, inboundTonnes: 0 },
  };
}

function cityMatchesFilters(city, query) {
  if (!city) {
    return false;
  }
  if (query) {
    const matchesQuery = [city.label, city.state_code, city.state_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    if (!matchesQuery) {
      return false;
    }
  }
  if (state.selectedStateCode && String(city.state_code || "").trim() !== state.selectedStateCode) {
    return false;
  }
  if (state.selectedPopulationBandId) {
    const bandId = String(openingContextForCity(city)?.band?.id || "").trim();
    if (bandId !== state.selectedPopulationBandId) {
      return false;
    }
  }
  return true;
}

function filteredCities() {
  const query = String(state.search || "").trim().toLowerCase();
  const cacheKey = `${query}::${state.sortMode}::${state.selectedStateCode}::${state.selectedPopulationBandId}::${state.selectedCityId}`;
  if (state.filteredCitiesCacheKey === cacheKey) {
    return state.filteredCitiesCache;
  }
  const items = state.cities.filter((city) => cityMatchesFilters(city, query));
  const sortedItems = state.sortMode === "alphabetical"
    ? items.sort((left, right) => String(left.label || "").localeCompare(String(right.label || ""), "pt-BR"))
    : items.sort((left, right) => {
    const leftPrice = openingContextForCity(left).openingPrice || 0;
    const rightPrice = openingContextForCity(right).openingPrice || 0;
    return state.sortMode === "opening_asc"
      ? leftPrice - rightPrice
      : rightPrice - leftPrice;
    });
  const hasActiveFilter = Boolean(query || state.selectedStateCode || state.selectedPopulationBandId);
  const selectedCity = state.citiesById[state.selectedCityId] || null;
  if (hasActiveFilter || !selectedCity || sortedItems.some((city) => city.id === selectedCity.id)) {
      state.filteredCitiesCacheKey = cacheKey;
      state.filteredCitiesCache = sortedItems;
      return sortedItems;
  }
    state.filteredCitiesCacheKey = cacheKey;
    state.filteredCitiesCache = [selectedCity, ...sortedItems];
    return state.filteredCitiesCache;
}

function scrollSelectedCityIntoView(behavior = "smooth") {
  window.requestAnimationFrame(() => {
    refs.citiesList?.querySelector(".pricing-editor-city-row.is-selected")?.scrollIntoView({
      block: "nearest",
      behavior,
    });
  });
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

function markerForCity(city, selected = false) {
  const context = openingContextForCity(city);
  const band = context?.band || findPopulationBand(city, state.populationBands);
  const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
  const currentPrice = context?.openingPrice || 0;
  const ratio = normalizeRange(currentPrice, state.openingPriceRange.min, state.openingPriceRange.max);
  const fillColor = priceColor(ratio);
  const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
  return createCityMarker({
    city,
    band: selected ? { ...(band || {}), marker_size_px: Math.round(baseMarkerSize * 1.42) } : band,
    pin,
    fillColor,
    strokeColor: selected ? "#ffffff" : "#fff9ea",
    contrastFillColor: "#ffffff",
    selectedHaloFillColor: "#ffffff",
    selectedHaloStrokeColor: fillColor,
    selected,
    opacity: selected ? 1 : 0.78,
  });
}

function ensureMap() {
  if (state.map || !refs.mapStage || !state.bootstrap?.map_viewport) {
    return;
  }
  state.map = createBrasixMap({
    elementId: "pricing-editor-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap?.map_editor?.leaflet_settings || {},
  });
  state.markerLayer = window.L.layerGroup().addTo(state.map);
  state.mapMarkersByCityId = {};
  state.mapNeedsFullRefresh = true;
  state.lastRenderedSelectedCityId = "";
  window.requestAnimationFrame(() => {
    if (!state.map) {
      return;
    }
    state.map.invalidateSize();
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    applyBrasixLeafletSettings(state.map, state.bootstrap.map_viewport, state.bootstrap?.map_editor?.leaflet_settings || {});
  });
}

function replaceMarkerForCity(cityId) {
  const city = state.citiesById[cityId];
  if (!city || !state.markerLayer) {
    return;
  }
  const existingMarker = state.mapMarkersByCityId[cityId];
  if (existingMarker) {
    state.markerLayer.removeLayer(existingMarker);
  }
  const context = openingContextForCity(city);
  const marker = markerForCity(city, city.id === state.selectedCityId);
  marker.bindTooltip(
    `<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(populationBandLabel(context?.band))} · ${escapeHtml(formatCurrency(context?.openingPrice || 0))}`,
    {
      sticky: true,
      direction: "top",
      className: "brasix-map-tooltip city-editor-map-tooltip",
      opacity: 1,
      offset: [0, -8],
    },
  );
  marker.on("click", () => selectCity(city.id));
  marker.addTo(state.markerLayer);
  state.mapMarkersByCityId[cityId] = marker;
}

function renderMap() {
  ensureMap();
  if (!state.map || !state.markerLayer) {
    return;
  }
  if (state.mapNeedsFullRefresh || !Object.keys(state.mapMarkersByCityId).length) {
    state.markerLayer.clearLayers();
    state.mapMarkersByCityId = {};
    state.cities.forEach((city) => replaceMarkerForCity(city.id));
    state.mapNeedsFullRefresh = false;
    state.lastRenderedSelectedCityId = state.selectedCityId;
    return;
  }
  if (state.lastRenderedSelectedCityId !== state.selectedCityId) {
    const previousCityId = state.lastRenderedSelectedCityId;
    state.lastRenderedSelectedCityId = state.selectedCityId;
    if (previousCityId && previousCityId !== state.selectedCityId) {
      replaceMarkerForCity(previousCityId);
    }
    if (state.selectedCityId) {
      replaceMarkerForCity(state.selectedCityId);
    }
  }
}

function freightProductRecord(flow) {
  return {
    ...(state.productsById[flow?.product_id] || {}),
    ...(state.productOperationalById[flow?.product_id] || {}),
  };
}

function flowQuantityTons(flow) {
  const rawQuantity = Number(flow?.quantity_t || 0);
  if (!(rawQuantity > 0)) {
    return 0;
  }
  const product = freightProductRecord(flow);
  const weightPerUnitKg = Number(product?.weight_per_unit_kg || 0);
  if (weightPerUnitKg > 0) {
    return rawQuantity * (weightPerUnitKg / 1000);
  }
  return rawQuantity;
}

function logisticsSpecializationKey(flow) {
  const product = freightProductRecord(flow);
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

function specializationMultiplier(flow) {
  const key = logisticsSpecializationKey(flow);
  const config = state.pricingDocument?.freight || {};
  return {
    bulk: Number(config.specialization_bulk_multiplier || 1),
    general: Number(config.specialization_general_multiplier || 1),
    palletized: Number(config.specialization_palletized_multiplier || 1),
    refrigerated: Number(config.specialization_refrigerated_multiplier || 1),
    tank: Number(config.specialization_tank_multiplier || 1),
    live: Number(config.specialization_live_multiplier || 1),
    hazardous: Number(config.specialization_hazardous_multiplier || 1),
  }[key] || 1;
}

function productSurchargeMultiplier(flow) {
  const product = freightProductRecord(flow);
  const config = state.pricingDocument?.freight || {};
  let multiplier = 1;
  const valueClass = String(product?.value_class || "").toLowerCase();
  if (valueClass === "medium") {
    multiplier *= Number(config.value_class_medium_multiplier || 1);
  }
  if (valueClass === "high") {
    multiplier *= Number(config.value_class_high_multiplier || 1);
  }
  if (product?.perishable) {
    multiplier *= Number(config.perishable_multiplier || 1);
  }
  if (product?.fragile) {
    multiplier *= Number(config.fragile_multiplier || 1);
  }
  if (product?.temperature_control_required) {
    multiplier *= Number(config.temperature_control_multiplier || 1);
  }
  if (product?.hazardous) {
    multiplier *= Number(config.hazardous_multiplier || 1);
  }
  const priceReference = Number(product?.price_reference_brl_per_unit || 0);
  if (priceReference > 0 && state.productPriceReferenceMedian > 0) {
    multiplier *= Math.max(0.92, Math.min(1.18, Math.pow(priceReference / state.productPriceReferenceMedian, 0.08)));
  }
  return multiplier;
}

function distanceMultiplier(flow) {
  const config = state.pricingDocument?.freight || {};
  const distance = Number(flow?.distance_km || 0);
  const shortReference = Math.max(1, Number(config.short_haul_reference_km || 180));
  const longReference = Math.max(shortReference + 1, Number(config.long_haul_reference_km || 1400));
  const shortShare = Math.max(0, 1 - (Math.min(distance, shortReference) / shortReference));
  const longShare = distance <= shortReference
    ? 0
    : Math.min(1, (Math.min(distance, longReference) - shortReference) / (longReference - shortReference));
  return 1 + (shortShare * Number(config.short_haul_markup_max || 0)) - (longShare * Number(config.long_haul_discount_max || 0));
}

function weightedDieselFactor(flow) {
  if (!state.averageDieselPrice) {
    return 1;
  }
  const config = state.pricingDocument?.freight || {};
  const originWeight = Number(config.diesel_origin_weight || 0.7);
  const destinationWeight = Number(config.diesel_destination_weight || 0.3);
  const totalWeight = Math.max(originWeight + destinationWeight, 0.0001);
  const originDiesel = Number(state.dieselByCityId[flow.origin_id] || state.averageDieselPrice);
  const destinationDiesel = Number(state.dieselByCityId[flow.destination_id] || state.averageDieselPrice);
  const weighted = ((originDiesel * originWeight) + (destinationDiesel * destinationWeight)) / totalWeight;
  return Math.max(0.75, Math.min(1.35, weighted / state.averageDieselPrice));
}

function compatibleTrucksForFlow(flow) {
  return state.trucks.filter((truck) => (truck.supported_product_ids || []).includes(flow.product_id));
}

function operationCostForTruck(truck, flow) {
  const payloadT = Number(truck?.payload_weight_kg || 0) / 1000;
  if (!(payloadT > 0)) {
    return null;
  }
  const quantityT = Math.max(0.1, flowQuantityTons(flow));
  const trips = Math.max(1, Math.ceil(quantityT / payloadT));
  const config = state.pricingDocument?.freight || {};
  const cycleDistance = Number(flow.distance_km || 0) * Number(config.cycle_distance_multiplier || 1.65);
  const dieselFactor = weightedDieselFactor(flow);
  const variableCostPerKm = Number(truck.base_variable_cost_brl_per_km || 0) * ((0.45 * dieselFactor) + 0.55);
  const variableCost = trips * cycleDistance * variableCostPerKm;
  const routeDays = Math.max(1, Math.ceil((cycleDistance * trips) / Math.max(1, Number(config.driver_daily_km || 650))));
  const fixedCost = routeDays * Number(truck.base_fixed_cost_brl_per_day || 0);
  const handlingCost = Number(config.handling_base_brl || 0) + (quantityT * Number(config.handling_per_t_brl || 0));
  return {
    truck,
    trips,
    routeDays,
    cycleDistance,
    dieselFactor,
    variableCost,
    fixedCost,
    handlingCost,
    totalCost: variableCost + fixedCost + handlingCost,
  };
}

function bestOperationForFlow(flow) {
  const candidates = compatibleTrucksForFlow(flow)
    .map((truck) => operationCostForTruck(truck, flow))
    .filter(Boolean)
    .sort((left, right) => left.totalCost - right.totalCost);
  return candidates[0] || null;
}

function hqBonusForFlow(flow) {
  const config = state.pricingDocument?.freight || {};
  const originBonus = flow.origin_id === state.selectedCityId ? Number(config.hq_origin_bonus || 0) : 0;
  const destinationBonus = flow.destination_id === state.selectedCityId ? Number(config.hq_destination_bonus || 0) : 0;
  return Math.min(Number(config.hq_bonus_cap || 0), originBonus + destinationBonus);
}

function freightPricingForFlow(flow) {
  const operation = bestOperationForFlow(flow);
  const distanceFactor = distanceMultiplier(flow);
  const specializationFactor = specializationMultiplier(flow);
  const productFactor = productSurchargeMultiplier(flow);
  const quantityT = flowQuantityTons(flow);
  const distanceKm = Number(flow.distance_km || 0);
  const config = state.pricingDocument?.freight || {};
  const marketPrice = quantityT
    * distanceKm
    * Number(config.base_rate_brl_per_tkm || 0)
    * distanceFactor
    * specializationFactor
    * productFactor;
  const floorPrice = operation ? operation.totalCost * Number(config.floor_margin_multiplier || 1.12) : 0;
  const contractPrice = Math.max(floorPrice, marketPrice);
  const hqBonus = hqBonusForFlow(flow);
  const playerRevenue = contractPrice * (1 + hqBonus);
  const unitRevenuePerTon = quantityT > 0 ? playerRevenue / quantityT : 0;
  const referencePayloadTons = operation
    ? Math.min(quantityT, Math.max(0, Number(operation.truck?.payload_weight_kg || 0) / 1000))
    : 0;
  return {
    flow,
    operation,
    distanceFactor,
    specializationFactor,
    productFactor,
    marketPrice,
    floorPrice,
    contractPrice,
    hqBonus,
    playerRevenue,
    unitRevenuePerTon,
    referencePayloadTons,
    referenceTripRevenue: unitRevenuePerTon * referencePayloadTons,
  };
}

function outboundFreightsForCity(cityId) {
  return state.outboundFreightsByCityId[cityId] || [];
}

function inboundFreightsForCity(cityId) {
  return state.inboundFreightsByCityId[cityId] || [];
}

function pricedFreightsForCity(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId) {
    return [];
  }
  if (!state.pricedFreightsCacheByCityId[nextCityId]) {
    state.pricedFreightsCacheByCityId[nextCityId] = outboundFreightsForCity(nextCityId)
      .map((flow) => freightPricingForFlow(flow))
      .sort((left, right) => right.playerRevenue - left.playerRevenue || flowQuantityTons(right.flow) - flowQuantityTons(left.flow));
  }
  return state.pricedFreightsCacheByCityId[nextCityId];
}

function pricedFreightsForSelectedCity() {
  return pricedFreightsForCity(state.selectedCityId);
}

function syncSelectedFreight() {
  const flows = outboundFreightsForCity(state.selectedCityId);
  if (!flows.length) {
    state.selectedFreightId = "";
    return;
  }
  if (!state.selectedFreightId || !flows.some((flow) => flow.id === state.selectedFreightId)) {
    state.selectedFreightId = flows[0].id;
  }
}

function selectedPricedFreight() {
  return pricedFreightsForSelectedCity().find((entry) => entry.flow.id === state.selectedFreightId) || null;
}

function cheapestTruckForTier(tier) {
  const tierIndex = SIZE_TIER_ORDER.indexOf(tier);
  const exact = state.trucks.filter((truck) => truck.size_tier === tier).sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0));
  if (exact.length) {
    return exact[0];
  }
  if (tierIndex === -1) {
    return state.trucks[0] || null;
  }
  const fallback = state.trucks
    .filter((truck) => SIZE_TIER_ORDER.indexOf(truck.size_tier) >= tierIndex)
    .sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0));
  return fallback[0] || state.trucks[0] || null;
}

function mergeStarterFleetEntries(entries) {
  const entriesByTruckId = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const truck = entry?.truck || null;
    const truckKey = String(truck?.id || truck?.slug || truck?.label || "").trim();
    if (!truck || !truckKey) {
      return;
    }
    if (!entriesByTruckId.has(truckKey)) {
      entriesByTruckId.set(truckKey, {
        truck,
        units: 0,
        reasons: [],
      });
    }
    const nextEntry = entriesByTruckId.get(truckKey);
    nextEntry.units += Number(entry?.units || 0) || 1;
    nextEntry.reasons.push(...(Array.isArray(entry?.reasons) ? entry.reasons : []));
  });
  return Array.from(entriesByTruckId.values())
    .sort((left, right) => right.units - left.units || Number(left.truck.purchase_price_brl || 0) - Number(right.truck.purchase_price_brl || 0));
}

function globalCapitalStarterFleetBlueprint() {
  const fleetEntries = mergeStarterFleetEntries(
    GLOBAL_CAPITAL_STARTER_TIERS
      .map((tier) => cheapestTruckForTier(tier))
      .filter(Boolean)
      .map((truck) => ({
        truck,
        units: 1,
        reasons: [],
      })),
  );
  return {
    fleetEntries,
    recommendations: [],
    fallback: false,
  };
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
  return state.trucks.filter((truck) => supportedProductIdsForTruck(truck).includes(productId));
}

function recommendStarterTruckForProduct(productId, marketTonnage) {
  const trucks = compatibleTrucksForProduct(productId)
    .filter((truck) => Number(truck?.purchase_price_brl || 0) > 0 || Number(truck?.payload_weight_kg || 0) > 0);
  if (!trucks.length) {
    return null;
  }
  const targetPayloadT = starterTargetPayloadT(marketTonnage);
  const targetSizeTier = starterTargetSizeTier(targetPayloadT);
  const selected = trucks
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
    .sort((left, right) => left.score - right.score || Number(left.truck.purchase_price_brl || 0) - Number(right.truck.purchase_price_brl || 0));
  return selected[0] || null;
}

function normalizedMarketItems(items) {
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
  const items = normalizedMarketItems(city?.[layerKey]);
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

function capitalPreviewForDifficulty(_starterProfileId, difficultyId) {
  const starterFleet = globalCapitalStarterFleetBlueprint();
  const fleetEntries = starterFleet.fleetEntries;
  const fleetInvestment = fleetEntries.reduce((total, entry) => total + (Number(entry.truck.purchase_price_brl || 0) * Number(entry.units || 0)), 0);
  const dailyFixedCost = fleetEntries.reduce((total, entry) => total + (Number(entry.truck.base_fixed_cost_brl_per_day || 0) * Number(entry.units || 0)), 0);
  const baseInitialCash = Number(
    getNestedValue(
      state.pricingDocument,
      "capital.base_initial_cash_brl",
      getNestedValue(state.defaultPricingDocument, "capital.base_initial_cash_brl", 1000000),
    ),
  );
  const reserveDays = Number(state.pricingDocument?.capital?.reserve_days || 0);
  const reserveCost = reserveDays * dailyFixedCost;
  const bufferCost = Number(state.pricingDocument?.capital?.buffer_percent || 0) * fleetInvestment;
  const workingCapitalBase = baseInitialCash + reserveCost + bufferCost;
  const liquidityFactor = {
    hard: Number(state.pricingDocument?.capital?.hard_liquidity_factor || 0),
    standard: Number(state.pricingDocument?.capital?.standard_liquidity_factor || 0),
    sandbox: Number(state.pricingDocument?.capital?.sandbox_liquidity_factor || 0),
  }[difficultyId] || 0;
  return {
    fleetEntries,
    starterFleet,
    fleetInvestment,
    dailyFixedCost,
    baseInitialCash,
    reserveCost,
    bufferCost,
    workingCapitalBase,
    liquidityFactor,
    initialCash: fleetInvestment + (workingCapitalBase * liquidityFactor),
  };
}

function renderTopSelectOptions() {
  if (refs.stateSelect) {
    refs.stateSelect.innerHTML = [`<option value="">Todos</option>`, ...stateFilterOptions().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)].join("");
    refs.stateSelect.value = state.selectedStateCode;
  }
  if (refs.bandSelect) {
    refs.bandSelect.innerHTML = [`<option value="">Todas</option>`, ...bandFilterOptions().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)].join("");
    refs.bandSelect.value = state.selectedPopulationBandId;
  }
  if (refs.sortSelect) {
    refs.sortSelect.innerHTML = SORT_OPTIONS.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
    refs.sortSelect.value = state.sortMode;
  }
}

function renderParametersPanel() {
  if (!refs.parametersPanel) {
    return;
  }
  const activeTab = PARAMETER_TABS.some((item) => item.id === state.activeParameterTab) ? state.activeParameterTab : "opening";
  const visibleGroups = buildFieldGroups().filter((group) => group.tab === activeTab);
  refs.parametersPanel.innerHTML = `
    <div class="pricing-editor-parameter-tabs" role="tablist" aria-label="Grupos de parametros">
      ${PARAMETER_TABS.map((tab) => `
        <button
          class="pricing-editor-parameter-tab${tab.id === activeTab ? " is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${tab.id === activeTab ? "true" : "false"}"
          data-parameter-tab="${escapeHtml(tab.id)}"
        >${escapeHtml(tab.label)}</button>
      `).join("")}
    </div>

    ${visibleGroups.map((group) => `
      <section class="flow-editor-parameter-group pricing-editor-parameter-box">
        <p class="flow-editor-parameter-group-title pricing-editor-parameter-group-title">
          <span>${escapeHtml(group.label)}</span>
          ${group.help || group.formula ? renderHelpBadge(`${group.help || ""}${group.formula ? ` Formula: ${group.formula}.` : ""}`) : ""}
        </p>
        <div class="pricing-editor-parameter-list">
          ${group.fields.map((field) => {
            const fallbackValue = field.defaultValue ?? field.min ?? 0;
            const defaultValue = Number(getNestedValue(state.defaultPricingDocument, field.path, fallbackValue));
            const currentValue = Number(getNestedValue(state.pricingDocument, field.path, defaultValue));
            return `
              <label class="field flow-editor-parameter-field pricing-editor-parameter-field">
                <span class="flow-editor-parameter-label pricing-editor-parameter-label">
                  <span>${escapeHtml(field.label)}</span>
                  ${field.help ? renderHelpBadge(field.help) : ""}
                </span>
                <div class="flow-editor-range-shell pricing-editor-range-shell">
                  <div class="flow-editor-range-top pricing-editor-range-top">
                    <div class="flow-editor-range-track-shell" style="--default-ratio:${parameterFieldRatio(field, defaultValue)};">
                      <span class="flow-editor-range-default-marker" aria-hidden="true"></span>
                      <input
                        class="flow-editor-range pricing-editor-range"
                        type="range"
                        min="${escapeHtml(String(field.min))}"
                        max="${escapeHtml(String(field.max))}"
                        step="${escapeHtml(String(field.step))}"
                        value="${escapeHtml(String(currentValue))}"
                        data-field-path="${escapeHtml(field.path)}"
                      />
                    </div>
                    <span class="flow-editor-range-value pricing-editor-range-value" data-field-value="true">${escapeHtml(formatParameterValue(field, currentValue))}</span>
                  </div>
                </div>
              </label>
            `;
          }).join("")}
        </div>
      </section>
    `).join("")}
  `;
  bindHelpBadges();
}

function renderHeaderBadges() {
  if (!refs.headerBadges) {
    return;
  }
  const city = currentCity();
  const context = city ? openingContextForCity(city) : null;
  const badges = [
    { label: "Mapa", value: state.bootstrap?.active_map?.name || "Mapa" },
    { label: "Faixa", value: populationBandLabel(context?.band) },
    { label: "Dificuldade", value: selectedDifficultyLabel() },
    { label: "Cidade ativa", value: city?.label || "Sem cidade" },
  ];
  refs.headerBadges.innerHTML = badges.map((badge) => `
    <article class="editor-header-badge">
      <span>${escapeHtml(badge.label)}</span>
      <strong>${escapeHtml(badge.value)}</strong>
    </article>
  `).join("");
}

function renderCitiesSummary() {
  if (refs.citiesSummary) {
    refs.citiesSummary.textContent = `${formatInteger(filteredCities().length)} / ${formatInteger(state.cities.length)}`;
  }
}

function renderCityList() {
  if (!refs.citiesList) {
    return;
  }
  const items = filteredCities();
  refs.citiesList.innerHTML = items.length
    ? items.map((city) => {
      const context = openingContextForCity(city);
      const price = context.openingPrice || 0;
      const stats = context.stats;
      return `
        <button class="pricing-editor-city-row${city.id === state.selectedCityId ? " is-selected" : ""}" type="button" data-city-id="${escapeHtml(city.id)}">
          <div>
            <strong>${escapeHtml(city.label)}</strong>
            <small>${escapeHtml(`${populationBandLabel(context.band)} · ${formatInteger(stats.outboundCount)} orig · ${formatInteger(stats.inboundCount)} dest`)}</small>
          </div>
          <span>${escapeHtml(formatCurrency(price))}</span>
        </button>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nenhuma cidade encontrada.</div>`;
}

function renderMapSummary() {
  if (!refs.mapSummary) {
    return;
  }
  const city = currentCity();
  const context = city ? openingContextForCity(city) : null;
  const opening = context?.openingPrice || 0;
  refs.mapSummary.innerHTML = city ? `${escapeHtml(formatCurrency(opening))} · ${escapeHtml(city.label)}` : "Sem cidade";
  if (refs.mapOverlayTitle) {
    refs.mapOverlayTitle.textContent = `Custo de abertura · ${populationBandLabel(context?.band)}`;
  }
}

function renderMetrics() {
  if (!refs.metrics) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.metrics.innerHTML = `<div class="truck-gallery-empty">Selecione uma cidade para simular a abertura.</div>`;
    return;
  }
  const context = openingContextForCity(city);
  const standardCapital = capitalPreviewForDifficulty("starter", "standard");
  refs.metrics.innerHTML = `
    <div class="flow-editor-funnel-metric">
      <strong>${escapeHtml(formatCurrency(context.openingPrice || 0))}</strong>
      <span>${escapeHtml(`Abertura · ${populationBandLabel(context.band)}`)}</span>
    </div>
    <div class="flow-editor-funnel-metric">
      <strong>${escapeHtml(formatInteger(context.stats.outboundCount))}</strong>
      <span>Fretes de origem</span>
    </div>
    <div class="flow-editor-funnel-metric">
      <strong>${escapeHtml(formatInteger(context.stats.inboundCount))}</strong>
      <span>Fretes de destino</span>
    </div>
    <div class="flow-editor-funnel-metric">
      <strong>${escapeHtml(formatCurrency(standardCapital.initialCash))}</strong>
      <span>Capital padrao</span>
    </div>
  `;
}

function renderParametersSummary() {
  if (!refs.parametersSummary) {
    return;
  }
  const activeTabLabel = PARAMETER_TABS.find((item) => item.id === state.activeParameterTab)?.label || "Sede";
  refs.parametersSummary.textContent = `${activeTabLabel} · ${state.dirty ? "Alterado" : "Salvo"}`;
}

function renderPreviewLayout() {
  const activeTab = PREVIEW_TABS.some((item) => item.id === state.activePreviewTab) ? state.activePreviewTab : "city";
  refs.previewTabs?.querySelectorAll("[data-preview-tab]").forEach((button) => {
    const isActive = button.getAttribute("data-preview-tab") === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (refs.previewCityPanel) {
    refs.previewCityPanel.hidden = activeTab !== "city";
  }
  if (refs.previewFreightPanel) {
    refs.previewFreightPanel.hidden = activeTab !== "freight";
  }
  if (refs.previewCapitalPanel) {
    refs.previewCapitalPanel.hidden = activeTab !== "capital";
  }
  if (!refs.previewSummary) {
    return;
  }
  const activeTabLabel = PREVIEW_TABS.find((item) => item.id === activeTab)?.label || "Sede";
  const detail = {
    city: currentCity()?.label || "Sem cidade",
    freight: `${formatInteger(outboundFreightsForCity(state.selectedCityId).length)} ativos`,
    capital: "Padrao em destaque",
  }[activeTab] || "";
  refs.previewSummary.textContent = `${activeTabLabel} · ${detail}`;
}

function renderActivePreviewContent() {
  const activeTab = PREVIEW_TABS.some((item) => item.id === state.activePreviewTab) ? state.activePreviewTab : "city";
  if (activeTab === "city") {
    renderCityPreview();
    return;
  }
  if (activeTab === "freight") {
    renderFreightsSummary();
    renderFreightsList();
    renderFreightDetail();
    return;
  }
  renderCapitalPanel();
}

function renderCityPreview() {
  if (!refs.cityPreview) {
    return;
  }
  const city = currentCity();
  if (!city) {
    refs.cityPreview.innerHTML = `<div class="truck-gallery-empty">Sem cidade selecionada.</div>`;
    return;
  }
  const context = openingContextForCity(city);
  refs.cityPreview.innerHTML = `
    <section class="city-editor-info-stack pricing-editor-summary-stack">
      <article class="city-editor-city-summary">
        <span class="eyebrow">Cidade ativa</span>
        <h2>${escapeHtml(city.label)}</h2>
        <p>${escapeHtml(`${city.state_name || city.state_code || ""} · ${populationBandLabel(context.band)}`)}</p>
      </article>

      <div class="pricing-editor-price-strip">
        <article class="pricing-editor-price-card is-band">
          <span>Faixa do mapa</span>
          <strong>${escapeHtml(populationBandLabel(context.band))}</strong>
        </article>
        <article class="pricing-editor-price-card">
          <span>Base da faixa</span>
          <strong>${escapeHtml(formatCurrency(context.bandBasePrice || 0))}</strong>
        </article>
        <article class="pricing-editor-price-card">
          <span>Abertura final</span>
          <strong>${escapeHtml(formatCurrency(context.openingPrice || 0))}</strong>
        </article>
      </div>

      <div class="city-editor-metric-list">
        <article class="city-editor-metric-row">
          <span>Intervalo da faixa</span>
          <strong>${escapeHtml(populationBandRangeLabel(context.band))}</strong>
        </article>
        <article class="city-editor-metric-row">
          <span>Populacao</span>
          <strong>${escapeHtml(formatPopulation(city.population_thousands || 0))}</strong>
        </article>
        <article class="city-editor-metric-row">
          <span>Oferta local</span>
          <strong>${escapeHtml(formatTonnes(city.supply_total_t || 0))}</strong>
        </article>
        <article class="city-editor-metric-row">
          <span>Demanda local</span>
          <strong>${escapeHtml(formatTonnes(city.demand_total_t || 0))}</strong>
        </article>
        <article class="city-editor-metric-row">
          <span>Score de abertura</span>
          <strong>${escapeHtml(formatPercent(context.blendedScore))}</strong>
        </article>
        <article class="city-editor-metric-row">
          <span>Multiplicador da cidade</span>
          <strong>${escapeHtml(`${roundNumber(context.multiplier, 2)}x`)}</strong>
        </article>
      </div>

      <div class="pricing-editor-score-grid">
        <article>
          <span>Populacao</span>
          <strong>${escapeHtml(formatPercent(context.populationComponent))}</strong>
        </article>
        <article>
          <span>Origem</span>
          <strong>${escapeHtml(formatPercent(context.outboundComponent))}</strong>
        </article>
        <article>
          <span>Destino</span>
          <strong>${escapeHtml(formatPercent(context.inboundComponent))}</strong>
        </article>
      </div>
    </section>
  `;
}

function renderFreightsSummary() {
  if (!refs.freightsSummary) {
    return;
  }
  const entries = pricedFreightsForSelectedCity();
  const totalFlowRevenue = entries.reduce((total, entry) => total + Number(entry.playerRevenue || 0), 0);
  refs.freightsSummary.textContent = `${formatInteger(entries.length)} ativos · ${formatCompactCurrency(totalFlowRevenue)} total`;
}

function renderFreightsList() {
  if (!refs.freightsList) {
    return;
  }
  const entries = pricedFreightsForSelectedCity();
  refs.freightsList.innerHTML = entries.length
    ? entries.map((entry) => `
      <button class="pricing-editor-freight-row${entry.flow.id === state.selectedFreightId ? " is-selected" : ""}" type="button" data-freight-id="${escapeHtml(entry.flow.id)}">
        <div>
          <strong>${escapeHtml(entry.flow.product_name)}</strong>
          <small>${escapeHtml(`${entry.flow.destination_label} · ${formatDistanceKm(entry.flow.distance_km)}`)}</small>
        </div>
        <div class="pricing-editor-freight-values">
          <strong class="pricing-editor-freight-total">${escapeHtml(formatCurrency(entry.playerRevenue))}</strong>
          <small class="pricing-editor-freight-caption">Total do fluxo</small>
          <small class="pricing-editor-freight-unit">${escapeHtml(formatCurrencyPerTon(entry.unitRevenuePerTon))}</small>
        </div>
      </button>
    `).join("")
    : `<div class="truck-gallery-empty">A cidade atual nao possui fretes de origem com volume positivo.</div>`;
}

function renderFreightDetail() {
  if (!refs.freightDetail) {
    return;
  }
  const entry = selectedPricedFreight();
  if (!entry) {
    refs.freightDetail.innerHTML = `<div class="truck-gallery-empty">Selecione um frete da origem para ver o breakdown.</div>`;
    return;
  }
  const operation = entry.operation;
  refs.freightDetail.innerHTML = `
    <section class="pricing-editor-detail-stack">
      <article class="city-editor-city-summary pricing-editor-freight-hero">
        <span class="eyebrow">${escapeHtml(entry.flow.product_name)}</span>
        <h2>${escapeHtml(`${entry.flow.origin_label} → ${entry.flow.destination_label}`)}</h2>
        <p>${escapeHtml(`${formatTonnes(flowQuantityTons(entry.flow))} · ${formatDistanceKm(entry.flow.distance_km)} · ${formatCurrency(entry.playerRevenue)} total · ${formatCurrencyPerTon(entry.unitRevenuePerTon)}`)}</p>
      </article>

      <div class="pricing-editor-breakdown-grid">
        <article class="city-editor-metric-row"><span>Total do fluxo</span><strong>${escapeHtml(formatCurrency(entry.playerRevenue))}</strong></article>
        <article class="city-editor-metric-row"><span>Taxa por tonelada</span><strong>${escapeHtml(formatCurrencyPerTon(entry.unitRevenuePerTon))}</strong></article>
        <article class="city-editor-metric-row"><span>Preco de mercado</span><strong>${escapeHtml(formatCurrency(entry.marketPrice))}</strong></article>
        <article class="city-editor-metric-row"><span>Piso operacional</span><strong>${escapeHtml(formatCurrency(entry.floorPrice))}</strong></article>
        <article class="city-editor-metric-row"><span>Contrato base</span><strong>${escapeHtml(formatCurrency(entry.contractPrice))}</strong></article>
        <article class="city-editor-metric-row"><span>Receita do jogador</span><strong>${escapeHtml(formatCurrency(entry.playerRevenue))}</strong></article>
        <article class="city-editor-metric-row"><span>Bonus da sede</span><strong>${escapeHtml(formatPercent(entry.hqBonus))}</strong></article>
        <article class="city-editor-metric-row"><span>Distancia</span><strong>${escapeHtml(formatPercent(entry.distanceFactor - 1))}</strong></article>
        <article class="city-editor-metric-row"><span>Especializacao</span><strong>${escapeHtml(`${roundNumber(entry.specializationFactor, 2)}x`)}</strong></article>
        <article class="city-editor-metric-row"><span>Produto</span><strong>${escapeHtml(`${roundNumber(entry.productFactor, 2)}x`)}</strong></article>
      </div>

      ${operation ? `
        <div class="pricing-editor-assumptions-card">
          <strong>Operacao de referencia</strong>
          <p>${escapeHtml(`${operation.truck.short_label || operation.truck.label} · ${formatInteger(operation.trips)} viagens · ${formatInteger(operation.routeDays)} dias`)}</p>
          <div class="pricing-editor-assumptions-grid">
            <article><span>Capacidade util</span><strong>${escapeHtml(formatTonnes(entry.referencePayloadTons))}</strong></article>
            <article><span>Frete no cam. ref.</span><strong>${escapeHtml(formatCurrency(entry.referenceTripRevenue))}</strong></article>
            <article><span>Variavel</span><strong>${escapeHtml(formatCurrency(operation.variableCost))}</strong></article>
            <article><span>Fixo</span><strong>${escapeHtml(formatCurrency(operation.fixedCost))}</strong></article>
            <article><span>Manuseio</span><strong>${escapeHtml(formatCurrency(operation.handlingCost))}</strong></article>
            <article><span>Diesel local</span><strong>${escapeHtml(`${roundNumber(operation.dieselFactor, 2)}x`)}</strong></article>
          </div>
        </div>
      ` : `<div class="truck-gallery-empty">Nenhum caminhao compativel encontrado para este produto.</div>`}
    </section>
  `;
}

function renderCapitalPanel() {
  if (!refs.capitalPanel && !refs.starterPanel) {
    return;
  }
  const previews = DIFFICULTIES.map((difficulty) => ({
    difficulty,
    preview: capitalPreviewForDifficulty("starter", difficulty.id),
  }));
  const standardPreview = previews.find(({ difficulty }) => difficulty.id === "standard")?.preview || previews[0]?.preview;
  const starterFleet = starterFleetBlueprintForCity(currentCity());
  if (refs.capitalPanel) {
    refs.capitalPanel.innerHTML = `
      <div class="pricing-editor-capital-grid">
        ${previews.map(({ difficulty, preview }) => `
          <article class="pricing-editor-capital-card${difficulty.id === "standard" ? " is-standard" : ""}">
            <span>${escapeHtml(difficulty.label)}</span>
            <strong>${escapeHtml(formatCurrency(preview.initialCash))}</strong>
            <small>${escapeHtml(`${formatCurrency(preview.fleetInvestment)} frota-base · ${formatCurrency(preview.workingCapitalBase)} bloco de caixa`)}</small>
          </article>
        `).join("")}
      </div>

      ${standardPreview ? `
        <div class="pricing-editor-section-divider" aria-hidden="true"></div>
        <div class="pricing-editor-assumptions-card pricing-editor-capital-breakdown-card">
          <strong>Breakdown padrao</strong>
          <p class="pricing-editor-capital-breakdown-formula">capital = frota + (base de caixa + reserva + buffer) x liquidez</p>
          <div class="pricing-editor-assumptions-grid pricing-editor-capital-breakdown-grid">
            <article class="pricing-editor-capital-breakdown-item"><span>Frota-base</span><strong>${escapeHtml(formatCurrency(standardPreview.fleetInvestment))}</strong></article>
            <article class="pricing-editor-capital-breakdown-item"><span>Base de caixa</span><strong>${escapeHtml(formatCurrency(standardPreview.baseInitialCash))}</strong></article>
            <article class="pricing-editor-capital-breakdown-item"><span>Reserva</span><strong>${escapeHtml(formatCurrency(standardPreview.reserveCost))}</strong></article>
            <article class="pricing-editor-capital-breakdown-item"><span>Buffer</span><strong>${escapeHtml(formatCurrency(standardPreview.bufferCost))}</strong></article>
            <article class="pricing-editor-capital-breakdown-item"><span>Liquidez</span><strong>${escapeHtml(`${roundNumber(standardPreview.liquidityFactor, 2)}x`)}</strong></article>
            <article class="pricing-editor-capital-breakdown-item"><span>Capital final</span><strong>${escapeHtml(formatCurrency(standardPreview.initialCash))}</strong></article>
          </div>
        </div>
      ` : ""}
    `;
  }
  if (refs.starterPanel) {
    refs.starterPanel.innerHTML = `
      <div class="pricing-editor-assumptions-card">
        <strong>Frota starter recomendada</strong>
        <p>Baseada nas Top ofertas e Top demandas da cidade ativa, respeitando compatibilidade do produto e o porte estimado da carga.</p>
        <div class="pricing-editor-starter-layout">
          <div class="pricing-editor-starter-column">
            <span class="pricing-editor-starter-column-label">Frota sugerida</span>
            <div class="pricing-editor-starter-list">
              ${starterFleet?.fleetEntries?.length ? starterFleet.fleetEntries.map((entry) => `
                <article class="pricing-editor-starter-line">
                  <div>
                    <strong>${escapeHtml(`${formatInteger(entry.units)}x ${entry.truck.short_label || entry.truck.label}`)}</strong>
                    <small>${escapeHtml(`${formatTruckSizeTier(entry.truck.size_tier)} · ${entry.reasons.map((reason) => `${reason.layerLabel.toLowerCase()} ${reason.productName}`).join(" + ") || "fallback economico"}`)}</small>
                  </div>
                  <span>${escapeHtml(formatCurrency((entry.truck.purchase_price_brl || 0) * entry.units))}</span>
                </article>
              `).join("") : `<div class="truck-gallery-empty">Sem combinacao inicial disponivel para a cidade atual.</div>`}
            </div>
            <div class="pricing-editor-starter-divider" aria-hidden="true"></div>
            <span class="pricing-editor-starter-column-label">Base da recomendacao</span>
            <div class="pricing-editor-starter-rationale-list">
              ${starterFleet.recommendations.length ? starterFleet.recommendations.map((recommendation) => `
                <article class="pricing-editor-starter-rationale">
                  <strong>${escapeHtml(`${recommendation.layerLabel} · ${recommendation.productName}`)}</strong>
                  <small>${escapeHtml(`${formatTonnes(recommendation.value)} locais · alvo ${formatTruckSizeTier(recommendation.targetSizeTier)} · ${recommendation.truck.short_label || recommendation.truck.label}`)}</small>
                </article>
              `).join("") : ""}
              ${starterFleet.fallback ? `<div class="pricing-editor-starter-note">Nao encontrei compatibilidade suficiente nos top itens da cidade. Como contingencia, o preview usa a combinacao mais economica por porte para a cidade ativa.</div>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function renderSaveButton() {
  if (!refs.saveButton) {
    return;
  }
  refs.saveButton.disabled = state.saving;
  const label = refs.saveButton.querySelector("span:last-child");
  if (label) {
    label.textContent = state.saving ? "Salvando..." : state.dirty ? "Salvar alteracoes" : "Salvo";
  }
}

function renderAllComputed() {
  if (state.pendingRenderFrame) {
    window.cancelAnimationFrame(state.pendingRenderFrame);
    state.pendingRenderFrame = 0;
  }
  if (state.needsPricingRebuild) {
    rebuildOpeningContextCache();
    state.needsPricingRebuild = false;
  }
  syncSelectedFreight();
  renderHeaderBadges();
  renderCitiesSummary();
  renderCityList();
  renderMapSummary();
  renderMetrics();
  renderParametersSummary();
  renderPreviewLayout();
  renderActivePreviewContent();
  renderSaveButton();
  renderMap();
}

function selectCity(cityId, options = {}) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId || !state.citiesById[nextCityId]) {
    return;
  }
  state.selectedCityId = nextCityId;
  syncSelectedFreight();
  renderAllComputed();
  if (options.revealInList !== false) {
    scrollSelectedCityIntoView(options.behavior || "smooth");
  }
}

function updateParameter(path, rawValue) {
  const numericValue = Number(rawValue || 0);
  setNestedValue(state.pricingDocument, path, Number.isFinite(numericValue) ? numericValue : 0);
  markDocumentDirty({ needsPricingRebuild: true });
  renderParametersSummary();
  scheduleComputedRender();
}

async function persistDocument() {
  if (!state.bootstrap?.active_map?.id || !state.pricingDocument || state.saving || !state.dirty) {
    return;
  }
  clearAutoSaveTimer();
  const requestRevision = state.documentRevision;
  const payloadDocument = deepClone(state.pricingDocument);
  state.saving = true;
  renderSaveButton();
  try {
    const response = await fetchJson("/api/editor/precos/document", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        map_id: state.bootstrap.active_map.id,
        document: payloadDocument,
      }),
    });
    state.persistedRevision = Math.max(state.persistedRevision, requestRevision);
    if (state.documentRevision === requestRevision) {
      const responseDocument = deepClone(response.document || {});
      if (getNestedValue(responseDocument, "capital.base_initial_cash_brl", null) == null) {
        setNestedValue(
          responseDocument,
          "capital.base_initial_cash_brl",
          getNestedValue(payloadDocument, "capital.base_initial_cash_brl", DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL),
        );
      }
      state.pricingDocument = ensurePricingCapitalDefaults(responseDocument, state.defaultPricingDocument);
      state.dirty = false;
      state.needsPricingRebuild = true;
      renderParametersPanel();
    }
    renderAllComputed();
  } catch (error) {
    if (refs.parametersSummary) {
      refs.parametersSummary.textContent = String(error?.message || error || "Falha ao salvar");
    }
    throw error;
  } finally {
    state.saving = false;
    renderSaveButton();
    if (state.dirty && state.documentRevision > state.persistedRevision) {
      schedulePersistDocument();
    }
  }
}

function resetToDefaults() {
  state.pricingDocument = ensurePricingCapitalDefaults(deepClone(state.defaultPricingDocument || {}), state.defaultPricingDocument);
  state.selectedDifficulty = state.pricingDocument?.scenario?.selected_difficulty || "standard";
  state.sortMode = state.pricingDocument?.scenario?.sort_mode || "opening_desc";
  markDocumentDirty({ needsPricingRebuild: true });
  renderTopSelectOptions();
  renderParametersPanel();
  renderAllComputed();
}

function bindEvents() {
  refs.themeButton?.addEventListener("click", toggleTheme);
  refs.saveButton?.addEventListener("click", () => {
    void persistDocument().catch((error) => {
      console.error("Brasix pricing editor save failed:", error);
    });
  });
  refs.resetButton?.addEventListener("click", resetToDefaults);
  refs.searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    renderCitiesSummary();
    renderCityList();
  });
  refs.stateSelect?.addEventListener("change", (event) => {
    state.selectedStateCode = event.target.value || "";
    renderCitiesSummary();
    renderCityList();
  });
  refs.bandSelect?.addEventListener("change", (event) => {
    state.selectedPopulationBandId = event.target.value || "";
    renderCitiesSummary();
    renderCityList();
  });
  refs.sortSelect?.addEventListener("change", (event) => {
    state.sortMode = event.target.value || "opening_desc";
    setNestedValue(state.pricingDocument, "scenario.sort_mode", state.sortMode);
    markDocumentDirty();
    renderCitiesSummary();
    renderCityList();
  });
  refs.citiesList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-city-id]");
    if (!button) {
      return;
    }
    selectCity(button.getAttribute("data-city-id") || "");
  });
  refs.freightsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-freight-id]");
    if (!button) {
      return;
    }
    state.selectedFreightId = button.getAttribute("data-freight-id") || "";
    renderFreightDetail();
    renderFreightsList();
  });
  refs.previewTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-tab]");
    if (!button) {
      return;
    }
    state.activePreviewTab = button.getAttribute("data-preview-tab") || "city";
    renderPreviewLayout();
    renderActivePreviewContent();
  });
  refs.parametersPanel?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-parameter-tab]");
    if (!button) {
      return;
    }
    state.activeParameterTab = button.getAttribute("data-parameter-tab") || "opening";
    renderParametersPanel();
    renderParametersSummary();
  });
  refs.parametersPanel?.addEventListener("input", (event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (!target) {
      return;
    }
    const path = target.getAttribute("data-field-path") || "";
    if (!path) {
      return;
    }
    const field = findFieldDefinition(path);
    const valueBadge = target.closest(".pricing-editor-parameter-field")?.querySelector("[data-field-value]");
    if (field && valueBadge) {
      valueBadge.textContent = formatParameterValue(field, Number(target.value || 0));
    }
    updateParameter(path, target.value);
  });
  window.addEventListener("resize", () => {
    if (state.map) {
      state.map.invalidateSize();
    }
    if (activeHelpTarget) {
      positionFloatingHelpTooltip(activeHelpTarget);
    }
  });
  window.addEventListener("scroll", () => {
    if (activeHelpTarget) {
      positionFloatingHelpTooltip(activeHelpTarget);
    }
  }, true);
}

function showFatalError(message) {
  const text = String(message || "Falha ao carregar o editor de precos.");
  [refs.citiesList, refs.cityPreview, refs.freightDetail, refs.capitalPanel, refs.starterPanel]
    .filter(Boolean)
    .forEach((target) => {
      target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(text)}</div>`;
    });
}

async function initialize() {
  applyTheme(getStoredTheme());
  const payload = await fetchJson("/api/editor/precos/bootstrap");
  normalizeBootstrap(payload);
  renderTopSelectOptions();
  renderParametersPanel();
  bindEvents();
  renderAllComputed();
}

initialize().catch((error) => {
  console.error("Brasix pricing editor initialization failed:", error);
  showFatalError(error?.message || error);
  throw error;
});