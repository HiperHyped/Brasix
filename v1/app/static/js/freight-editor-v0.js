import {
  buildBezierLikeLatLngs,
  createBrasixMap,
  createCityMarker,
  findPopulationBand,
  fitBrasixBounds,
} from "./shared/leaflet-map.js?v=20260407-fretes-map-1";
import { escapeHtml, numberFormatter } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:freight-editor-theme";
const STORAGE_KEY = "brasix:v1:freight-editor-state";
const FLOW_PATH_COLORS = {
  primary: "#6b7d2e",
  secondary: "#8c4f10",
  muted: "#4f8593",
  highlight: "#d4741f",
  outline: "rgba(255, 249, 234, 0.9)",
};
const FLOW_COUNT_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200];
const FREIGHT_ROUTE_PANE = "brasix-freight-routes";
const FREIGHT_ACTIVE_PANE = "brasix-freight-active";

const state = {
  bootstrap: null,
  map: null,
  mapLayers: {
    routes: null,
    routeHighlights: null,
    cities: null,
    supply: null,
    demand: null,
  },
  products: [],
  productsById: {},
  cities: [],
  citiesById: {},
  pinsById: {},
  populationBands: [],
  selectedProductId: "",
  selectedFlowId: "",
  mapMode: "contracts",
  productStatesById: {},
  searchTerm: "",
};

let floatingHelpTooltip = null;
let activeHelpTarget = null;

const refs = {
  headerBadges: document.getElementById("flow-editor-header-badges"),
  productsSummary: document.getElementById("flow-editor-products-summary"),
  productSearch: document.getElementById("flow-editor-product-search"),
  productsList: document.getElementById("flow-editor-products-list"),
  mapSummary: document.getElementById("flow-editor-map-summary"),
  mapStage: document.getElementById("flow-editor-map-stage"),
  mapOverlayTitle: document.getElementById("flow-editor-map-overlay-title"),
  funnelMetrics: document.getElementById("flow-editor-funnel-metrics"),
  parameterGroups: document.getElementById("flow-editor-parameter-groups"),
  flowsSummary: document.getElementById("flow-editor-flows-summary"),
  flowsList: document.getElementById("flow-editor-flows-list"),
  detail: document.getElementById("flow-editor-detail"),
  modeToggle: document.getElementById("flow-editor-mode-toggle"),
  saveButton: document.getElementById("flow-editor-save-button"),
  generateTopButton: document.getElementById("flow-editor-generate-top"),
  generateSideButton: document.getElementById("flow-editor-generate-side"),
  resetButton: document.getElementById("flow-editor-reset-product"),
  themeButton: document.getElementById("flow-editor-theme-toggle"),
};

function number0(value) {
  return numberFormatter(0).format(Number(value || 0));
}

function number1(value) {
  return numberFormatter(1).format(Number(value || 0));
}

function number2(value) {
  return numberFormatter(2).format(Number(value || 0));
}

function formatK(value) {
  const numeric = Number(value || 0);
  if (numeric >= 1000) {
    return `${numberFormatter(1).format(numeric / 1000)}k`;
  }
  return number0(numeric);
}

function formatShare(value) {
  return `${numberFormatter(1).format(Number(value || 0) * 100)}%`;
}

function normalizeFlowCount(value) {
  const numeric = Number(value || FLOW_COUNT_STEPS[0]);
  return FLOW_COUNT_STEPS.reduce((closest, step) => {
    if (Math.abs(step - numeric) < Math.abs(closest - numeric)) {
      return step;
    }
    return closest;
  }, FLOW_COUNT_STEPS[0]);
}

function flowCountIndex(value) {
  return Math.max(0, FLOW_COUNT_STEPS.indexOf(normalizeFlowCount(value)));
}

function flowCountForIndex(index) {
  return FLOW_COUNT_STEPS[Math.max(0, Math.min(FLOW_COUNT_STEPS.length - 1, Number(index || 0)))] || FLOW_COUNT_STEPS[0];
}

const COVERAGE_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const SCORE_WEIGHT_STEPS = [10, 20, 30, 38, 50, 62, 75, 90, 100];
const DISTANCE_BONUS_STEPS = [0, 10, 20, 22, 30, 40, 50, 60, 70, 80, 90, 100];
const REUSE_PENALTY_STEPS = [0.2, 0.36, 0.6, 0.86, 1.0, 1.32, 1.6];
const LIMIT_SHARE_STEPS = [5, 10, 15, 20, 25, 33, 40, 50, 60, 75, 90, 100];
const TARGET_SHARE_STEPS = [20, 35, 50, 70, 85];
const BONUS_STEPS = [50, 75, 90, 100, 108, 118, 135, 150, 175, 200, 250];
const QUANTITY_EXPONENT_STEPS = [0.1, 0.25, 0.5, 0.7, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 4.0];
const PARAMETER_KEYS = [
  "coverage",
  "flowCount",
  "scoreOriginWeight",
  "scoreDestinationWeight",
  "scoreTransferWeight",
  "distanceBonus",
  "reusePenalty",
  "originLimitShare",
  "destinationLimitShare",
  "targetOriginsShare",
  "targetDestinationsShare",
  "newOriginBonus",
  "newDestinationBonus",
  "quantityExponent",
];

function normalizeDiscreteStep(steps, value) {
  const numeric = Number(value ?? steps[0]);
  return steps.reduce((closest, step) => {
    if (Math.abs(step - numeric) < Math.abs(closest - numeric)) {
      return step;
    }
    return closest;
  }, steps[0]);
}

function discreteStepIndex(steps, value) {
  return Math.max(0, steps.indexOf(normalizeDiscreteStep(steps, value)));
}

function discreteStepValue(steps, index) {
  return steps[Math.max(0, Math.min(steps.length - 1, Number(index || 0)))] || steps[0];
}

function selectionPresetValues(algorithm) {
  if (algorithm === "relevancia") {
    return {
      reusePenalty: 0.36,
      originLimitShare: 50,
      destinationLimitShare: 50,
      targetOriginsShare: 35,
      targetDestinationsShare: 35,
      newOriginBonus: 100,
      newDestinationBonus: 100,
    };
  }
  if (algorithm === "disperso") {
    return {
      reusePenalty: 1.32,
      originLimitShare: 25,
      destinationLimitShare: 25,
      targetOriginsShare: 70,
      targetDestinationsShare: 70,
      newOriginBonus: 118,
      newDestinationBonus: 118,
    };
  }
  return {
    reusePenalty: 0.86,
    originLimitShare: 33,
    destinationLimitShare: 33,
    targetOriginsShare: 50,
    targetDestinationsShare: 50,
    newOriginBonus: 108,
    newDestinationBonus: 108,
  };
}

function quantityExponentForMode(mode) {
  if (mode === "equilibrada") {
    return 0.5;
  }
  if (mode === "concentrada") {
    return 1.6;
  }
  return 1.0;
}

function inferQuantityMode(exponent) {
  const normalized = normalizeDiscreteStep(QUANTITY_EXPONENT_STEPS, exponent);
  if (normalized <= 0.7) {
    return "equilibrada";
  }
  if (normalized >= 1.6) {
    return "concentrada";
  }
  return "proporcional";
}

function buildParameterState(product, source = {}) {
  const preset = selectionPresetValues(source.algorithm || product.defaults.algorithm || "balanceado");
  const legacyOriginShare = source.originLimitDivisor ? Math.round(100 / Number(source.originLimitDivisor || 3)) : null;
  const legacyDestinationShare = source.destinationLimitDivisor ? Math.round(100 / Number(source.destinationLimitDivisor || 3)) : null;
  return {
    algorithm: String(source.algorithm || product.defaults.algorithm || "balanceado"),
    coverage: normalizeDiscreteStep(COVERAGE_STEPS, source.coverage ?? product.defaults.coverage ?? 90),
    flowCount: normalizeFlowCount(source.flowCount ?? product.defaults.flow_count ?? FLOW_COUNT_STEPS[0]),
    scoreOriginWeight: normalizeDiscreteStep(SCORE_WEIGHT_STEPS, source.scoreOriginWeight ?? 38),
    scoreDestinationWeight: normalizeDiscreteStep(SCORE_WEIGHT_STEPS, source.scoreDestinationWeight ?? 38),
    scoreTransferWeight: normalizeDiscreteStep(SCORE_WEIGHT_STEPS, source.scoreTransferWeight ?? 24),
    distanceBonus: normalizeDiscreteStep(DISTANCE_BONUS_STEPS, source.distanceBonus ?? 22),
    reusePenalty: normalizeDiscreteStep(REUSE_PENALTY_STEPS, source.reusePenalty ?? preset.reusePenalty),
    originLimitShare: normalizeDiscreteStep(LIMIT_SHARE_STEPS, source.originLimitShare ?? legacyOriginShare ?? preset.originLimitShare),
    destinationLimitShare: normalizeDiscreteStep(LIMIT_SHARE_STEPS, source.destinationLimitShare ?? legacyDestinationShare ?? preset.destinationLimitShare),
    targetOriginsShare: normalizeDiscreteStep(TARGET_SHARE_STEPS, source.targetOriginsShare ?? preset.targetOriginsShare),
    targetDestinationsShare: normalizeDiscreteStep(TARGET_SHARE_STEPS, source.targetDestinationsShare ?? preset.targetDestinationsShare),
    newOriginBonus: normalizeDiscreteStep(BONUS_STEPS, source.newOriginBonus ?? preset.newOriginBonus),
    newDestinationBonus: normalizeDiscreteStep(BONUS_STEPS, source.newDestinationBonus ?? preset.newDestinationBonus),
    quantityExponent: normalizeDiscreteStep(
      QUANTITY_EXPONENT_STEPS,
      source.quantityExponent ?? quantityExponentForMode(source.quantityMode || product.defaults.quantity_mode),
    ),
  };
}

const PARAMETER_DEFINITIONS = {
  coverage: {
    label: "Cobertura",
    steps: COVERAGE_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Percentual acumulado da oferta e da demanda que entra no funil antes da combinacao O/D.",
  },
  flowCount: {
    label: "Número de fretes",
    steps: FLOW_COUNT_STEPS,
    format: (value) => number0(value),
    help: "Quantidade final F(p) de fretes que o algoritmo precisa entregar para o produto.",
  },
  scoreOriginWeight: {
    label: "Peso oferta",
    steps: SCORE_WEIGHT_STEPS,
    format: (value) => number0(value),
    help: "Peso de O no score. O = oferta da origem normalizada pelo maior valor de oferta.",
  },
  scoreDestinationWeight: {
    label: "Peso demanda",
    steps: SCORE_WEIGHT_STEPS,
    format: (value) => number0(value),
    help: "Peso de D no score. D = demanda do destino normalizada pelo maior valor de demanda.",
  },
  scoreTransferWeight: {
    label: "Peso transferência",
    steps: SCORE_WEIGHT_STEPS,
    format: (value) => number0(value),
    help: "Peso de T no score. T = min(oferta, demanda), ou seja, o potencial transferivel da rota.",
  },
  distanceBonus: {
    label: "Influência distância",
    steps: DISTANCE_BONUS_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Quanto a distancia entra em Fdist. Quanto maior, mais o score premia rotas longas dentro do limite adotado.",
  },
  reusePenalty: {
    label: "Penalidade repetição",
    steps: REUSE_PENALTY_STEPS,
    format: (value) => number2(value),
    help: "Reduz o score ajustado quando a mesma origem ou o mesmo destino ja apareceu em outros fretes.",
  },
  originLimitShare: {
    label: "Limite origem",
    steps: LIMIT_SHARE_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Percentual maximo aproximado de F permitido para uma mesma origem. Ex.: 33% gera teto de ceil(F x 0,33).",
  },
  destinationLimitShare: {
    label: "Limite destino",
    steps: LIMIT_SHARE_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Percentual maximo aproximado de F permitido para um mesmo destino. Ex.: 33% gera teto de ceil(F x 0,33).",
  },
  targetOriginsShare: {
    label: "Meta origens",
    steps: TARGET_SHARE_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Meta inicial de diversidade de origens antes de o algoritmo relaxar a busca e completar o total de fretes.",
  },
  targetDestinationsShare: {
    label: "Meta destinos",
    steps: TARGET_SHARE_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Meta inicial de diversidade de destinos antes de o algoritmo relaxar a busca e completar o total de fretes.",
  },
  newOriginBonus: {
    label: "Bônus origem nova",
    steps: BONUS_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Multiplicador aplicado quando uma rota introduz uma origem ainda nao usada no conjunto selecionado.",
  },
  newDestinationBonus: {
    label: "Bônus destino novo",
    steps: BONUS_STEPS,
    format: (value) => `${number0(value)}%`,
    help: "Multiplicador aplicado quando uma rota introduz um destino ainda nao usado no conjunto selecionado.",
  },
  quantityExponent: {
    label: "Expoente da quantidade",
    steps: QUANTITY_EXPONENT_STEPS,
    format: (value) => number2(value),
    help: "Distribuicao final: peso_i = score_i^e. e menor equilibra; e maior concentra nas rotas mais fortes.",
  },
};

const PARAMETER_GROUPS = [
  {
    title: "Funil",
    help: "Corte do universo de cidades. O sistema acumula os maiores pontos ate cobrir o percentual escolhido. Depois cruza O e D filtrados.",
    formula: "cobertura -> selecionar maiores O e D ate volume coberto >= p%",
    keys: ["coverage", "flowCount"],
  },
  {
    title: "Score",
    help: "Score bruto de cada rota candidata. O = oferta normalizada, D = demanda normalizada, T = transferencia potencial, Fdist = fator de distancia.",
    formula: "score = (po*O + pd*D + pt*T) x Fdist",
    keys: ["scoreOriginWeight", "scoreDestinationWeight", "scoreTransferWeight", "distanceBonus"],
  },
  {
    title: "Selecao",
    help: "Escolha dos fretes finais. Parte do score bruto, aplica penalidade por repeticao e bonus por novidade para espalhar ou concentrar a malha.",
    formula: "score_aj = score / (1 + rep*pen) x bonus_novidade",
    keys: [
      "reusePenalty",
      "originLimitShare",
      "destinationLimitShare",
      "targetOriginsShare",
      "targetDestinationsShare",
      "newOriginBonus",
      "newDestinationBonus",
    ],
  },
  {
    title: "Quantidade",
    help: "Distribuicao do volume total entre os fretes ja escolhidos.",
    formula: "qtd_i = (score_i^e / soma(score^e)) x volume_total",
    keys: ["quantityExponent"],
  },
];

function parameterValueLabel(key, value) {
  return PARAMETER_DEFINITIONS[key]?.format(value) || String(value ?? "");
}

function parameterDefaultValue(product, key) {
  const defaults = buildParameterState(product);
  return defaults[key];
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
  refs.parameterGroups?.querySelectorAll(".flow-editor-help").forEach((badge) => {
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

function currentProduct() {
  return state.productsById[state.selectedProductId] || null;
}

function currentProductState() {
  const product = currentProduct();
  if (!product) {
    return null;
  }
  return state.productStatesById[product.id] || null;
}

function currentGenerated() {
  return currentProductState()?.generated || null;
}

function currentFlow() {
  const generated = currentGenerated();
  if (!generated?.flows?.length) {
    return null;
  }
  return generated.flows.find((flow) => flow.id === state.selectedFlowId) || generated.flows[0] || null;
}

function scrollSelectedFlowIntoView() {
  const selected = Array.from(refs.flowsList?.querySelectorAll("[data-flow-id]") || []).find(
    (node) => node.dataset.flowId === state.selectedFlowId,
  );
  selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function selectFlow(flowId, { scroll = false } = {}) {
  if (!flowId || state.selectedFlowId === flowId) {
    if (scroll) {
      window.requestAnimationFrame(scrollSelectedFlowIntoView);
    }
    return;
  }
  state.selectedFlowId = flowId;
  renderAll();
  if (scroll) {
    window.requestAnimationFrame(scrollSelectedFlowIntoView);
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBootstrap() {
  return fetch("/api/editor/fretes/bootstrap").then(async (response) => {
    if (!response.ok) {
      throw new Error(`Falha ao carregar bootstrap do editor de fretes (${response.status}).`);
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
        reject(new Error("Leaflet nao carregou a tempo para o editor de fretes."));
      }
    }, 50);
  });
}

function productDefaultState(product) {
  return {
    ...buildParameterState(product),
    quantityMode: inferQuantityMode(quantityExponentForMode(product.defaults.quantity_mode)),
    generated: deepClone(product.generated),
  };
}

function normalizeBootstrap(payload) {
  state.bootstrap = payload;
  state.products = Array.isArray(payload?.products) ? payload.products : [];
  state.productsById = Object.fromEntries(state.products.map((product) => [product.id, product]));
  state.cities = Array.isArray(payload?.cities) ? payload.cities : [];
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.populationBands = Array.isArray(payload?.map_editor?.population_bands?.bands)
    ? payload.map_editor.population_bands.bands
    : [];
  state.pinsById = Object.fromEntries(
    (payload?.map_editor?.pin_library?.pins || []).map((pin) => [pin.id, pin]),
  );
  state.selectedProductId = payload?.summary?.selected_product_id || state.products[0]?.id || "";
  state.productStatesById = Object.fromEntries(
    state.products.map((product) => [product.id, productDefaultState(product)]),
  );
  if (!state.productStatesById[state.selectedProductId] && state.products[0]) {
    state.selectedProductId = state.products[0].id;
  }
  state.selectedFlowId = currentGenerated()?.flows?.[0]?.id || "";
}

function restoreSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const saved = JSON.parse(raw);
    state.searchTerm = String(saved?.searchTerm || "");
    const savedMapMode = String(saved?.mapMode || "contracts");
    state.mapMode = savedMapMode === "selected" ? "contracts" : savedMapMode;
    if (state.productsById[saved?.selectedProductId]) {
      state.selectedProductId = saved.selectedProductId;
    }
    for (const product of state.products) {
      const savedState = saved?.productStatesById?.[product.id];
      if (!savedState) {
        continue;
      }
      state.productStatesById[product.id] = {
        ...state.productStatesById[product.id],
        ...buildParameterState(product, savedState),
        quantityMode: inferQuantityMode(savedState.quantityExponent ?? state.productStatesById[product.id].quantityExponent),
      };
    }
  } catch (_error) {
    // Ignore broken local state.
  }
}

function saveSession() {
  const payload = {
    selectedProductId: state.selectedProductId,
    mapMode: state.mapMode,
    searchTerm: state.searchTerm,
    productStatesById: Object.fromEntries(
      Object.entries(state.productStatesById).map(([productId, productState]) => [
        productId,
        Object.fromEntries(PARAMETER_KEYS.map((key) => [key, productState[key]])),
      ]),
    ),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function applyThemeButtonLabel() {
  const isNight = document.documentElement.dataset.editorTheme === "night";
  refs.themeButton?.querySelector("span:last-child")?.replaceChildren(document.createTextNode(isNight ? "Modo claro" : "Modo noturno"));
}

function toggleTheme() {
  const root = document.documentElement;
  root.dataset.editorTheme = root.dataset.editorTheme === "night" ? "day" : "night";
  window.localStorage.setItem(THEME_KEY, root.dataset.editorTheme);
  applyThemeButtonLabel();
}

function buildHeaderBadges() {
  const product = currentProduct();
  const generated = currentGenerated();
  if (!product || !generated) {
    refs.headerBadges.innerHTML = "";
    return;
  }
  refs.headerBadges.innerHTML = `
    <span class="flow-editor-summary-pill">${escapeHtml(state.bootstrap?.active_map?.slug || "mapa")}</span>
    <span class="flow-editor-summary-pill">${escapeHtml(product.emoji)} ${escapeHtml(product.name)}</span>
    <span class="flow-editor-summary-pill">${number0(generated.flows.length)} fretes</span>
    <span class="flow-editor-summary-pill">${number0(generated.coverage_percent)}% cobertura</span>
  `;
}

function filteredProducts() {
  const search = state.searchTerm.trim().toLowerCase();
  if (!search) {
    return state.products;
  }
  return state.products.filter((product) => `${product.emoji} ${product.name}`.toLowerCase().includes(search));
}

function renderProducts() {
  const visible = filteredProducts();
  refs.productsSummary.textContent = `${visible.length} produtos`;
  refs.productsList.innerHTML = visible.map((product) => {
    const generated = state.productStatesById[product.id]?.generated || product.generated;
    const isActive = product.id === state.selectedProductId;
    return `
      <button class="flow-editor-product-item${isActive ? " is-active" : ""}" type="button" data-product-id="${escapeHtml(product.id)}">
        <div class="flow-editor-product-top">
          <strong>${escapeHtml(product.emoji)} ${escapeHtml(product.name)}</strong>
          <span class="flow-editor-product-count">${number0(generated.flows.length)}</span>
        </div>
        <div class="flow-editor-product-meta">
          <div class="flow-editor-mini-metric"><strong>Origens</strong><span>${number0(product.summary.covered_origins)}</span></div>
          <div class="flow-editor-mini-metric"><strong>Destinos</strong><span>${number0(product.summary.covered_destinations)}</span></div>
          <div class="flow-editor-mini-metric"><strong>Candidatos</strong><span>${formatK(product.summary.candidate_pairs)}</span></div>
          <div class="flow-editor-mini-metric"><strong>Leitura</strong><span>${number0(generated.coverage_percent)}% calibrada</span></div>
        </div>
      </button>
    `;
  }).join("");
}

function labelForAlgorithm(value) {
  if (value === "relevancia") {
    return "Relevância";
  }
  if (value === "disperso") {
    return "Disperso";
  }
  return "Balanceado";
}

function labelForQuantityMode(value) {
  if (value === "equilibrada") {
    return "Equilibrada";
  }
  if (value === "concentrada") {
    return "Concentrada";
  }
  return "Proporcional";
}

function renderParameterGroups() {
  const productState = currentProductState();
  const product = currentProduct();
  if (!refs.parameterGroups || !productState || !product) {
    return;
  }
  refs.parameterGroups.innerHTML = PARAMETER_GROUPS.map((group) => `
    <section class="flow-editor-parameter-group">
      <p class="flow-editor-parameter-group-title">
        <span>${escapeHtml(group.title)}</span>
        ${renderHelpBadge(`${group.help}${group.formula ? ` Formula: ${group.formula}.` : ""}`)}
      </p>
      <div class="flow-editor-parameter-group-grid">
        ${group.keys.map((key) => {
          const definition = PARAMETER_DEFINITIONS[key];
          const value = key === "flowCount"
            ? normalizeFlowCount(productState[key])
            : normalizeDiscreteStep(definition.steps, productState[key]);
          const defaultValue = key === "flowCount"
            ? normalizeFlowCount(parameterDefaultValue(product, key))
            : normalizeDiscreteStep(definition.steps, parameterDefaultValue(product, key));
          const defaultRatio = definition.steps.length > 1
            ? (discreteStepIndex(definition.steps, defaultValue) / (definition.steps.length - 1))
            : 0;
          return `
            <label class="field flow-editor-parameter-field">
              <span class="flow-editor-parameter-label">
                <span>${escapeHtml(definition.label)}</span>
                ${renderHelpBadge(definition.help)}
              </span>
              <div class="flow-editor-range-shell">
                <div class="flow-editor-range-top">
                  <div class="flow-editor-range-track-shell" style="--default-ratio:${defaultRatio};">
                    <span class="flow-editor-range-default-marker" aria-hidden="true"></span>
                    <input
                      class="flow-editor-range"
                      type="range"
                      min="0"
                      max="${definition.steps.length - 1}"
                      step="1"
                      value="${discreteStepIndex(definition.steps, value)}"
                      data-parameter-key="${escapeHtml(key)}"
                    />
                  </div>
                  <span class="flow-editor-range-value">${escapeHtml(parameterValueLabel(key, value))}</span>
                </div>
              </div>
            </label>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
  bindHelpBadges();
}

function syncControls() {
  const productState = currentProductState();
  if (!productState) {
    return;
  }
  refs.productSearch.value = state.searchTerm;
  renderParameterGroups();
  refs.modeToggle.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mapMode);
  });
}

function renderMapSummary() {
  const generated = currentGenerated();
  if (!generated) {
    refs.mapSummary.textContent = "";
    return;
  }
  refs.mapSummary.innerHTML = `
    <span>${number0(generated.flows.length)} fretes</span>
    <span>${formatK(generated.coverage_data.pairs)} pares</span>
    <span>${number0(generated.coverage_percent)}%</span>
  `;
}

function renderOverlayTitle() {
  const generated = currentGenerated();
  if (!generated) {
    refs.mapOverlayTitle.textContent = "Fretes";
    return;
  }
  if (state.mapMode === "supply") {
    refs.mapOverlayTitle.textContent = `${number0(generated.origins.length)} origens`;
    return;
  }
  if (state.mapMode === "demand") {
    refs.mapOverlayTitle.textContent = `${number0(generated.destinations.length)} destinos`;
    return;
  }
  if (state.mapMode === "cities") {
    refs.mapOverlayTitle.textContent = `${number0(state.cities.length)} cidades`;
    return;
  }
  refs.mapOverlayTitle.textContent = `${number0(generated.flows.length)} fretes`;
}

function renderFunnel() {
  const product = currentProduct();
  const generated = currentGenerated();
  if (!product || !generated) {
    refs.funnelMetrics.innerHTML = "";
    return;
  }
  refs.funnelMetrics.innerHTML = `
    <div class="flow-editor-funnel-metric"><span>Oferta</span><strong>${number0(product.summary.supply_nonzero)}</strong></div>
    <div class="flow-editor-funnel-metric"><span>Demanda</span><strong>${number0(product.summary.demand_nonzero)}</strong></div>
    <div class="flow-editor-funnel-metric"><span>Origens ${number0(generated.coverage_percent)}%</span><strong>${number0(generated.coverage_data.origins_count)}</strong></div>
    <div class="flow-editor-funnel-metric"><span>Destinos ${number0(generated.coverage_percent)}%</span><strong>${number0(generated.coverage_data.destinations_count)}</strong></div>
    <div class="flow-editor-funnel-metric"><span>Pares</span><strong>${formatK(generated.coverage_data.pairs)}</strong></div>
    <div class="flow-editor-funnel-metric"><span>Fretes</span><strong>${number0(generated.flows.length)}</strong></div>
  `;
}

function renderStatus() {
  if (!refs.statusSummary || !refs.baseSummary) {
    return;
  }
  const product = currentProduct();
  const productState = currentProductState();
  const generated = currentGenerated();
  if (!product || !productState || !generated) {
    refs.statusSummary.innerHTML = "";
    refs.baseSummary.innerHTML = "";
    return;
  }
  refs.statusSummary.innerHTML = `
    <strong>Atual</strong>
    <span>${escapeHtml(labelForAlgorithm(productState.algorithm))} · ${escapeHtml(labelForQuantityMode(productState.quantityMode))}</span>
  `;
  refs.baseSummary.innerHTML = `
    <strong>${number0(generated.coverage_data.origins_count)} O · ${number0(generated.coverage_data.destinations_count)} D</strong>
    <span>Base ${number0(generated.coverage_percent)}% · ${number0(generated.flows.length)} fretes</span>
  `;
}

function renderFlows() {
  const generated = currentGenerated();
  if (!generated) {
    refs.flowsSummary.textContent = "";
    refs.flowsList.innerHTML = "";
    return;
  }
  refs.flowsSummary.textContent = `${generated.flows.length} itens`;
  refs.flowsList.innerHTML = generated.flows.map((flow) => {
    const isActive = flow.id === state.selectedFlowId;
    return `
      <button class="flow-editor-flow-item${isActive ? " is-active" : ""}" type="button" data-flow-id="${escapeHtml(flow.id)}">
        <div class="flow-editor-flow-top">
          <strong>${escapeHtml(flow.origin_label)} → ${escapeHtml(flow.destination_label)}</strong>
          <span class="flow-editor-flow-rank">#${number0(flow.rank)}</span>
        </div>
        <div class="flow-editor-flow-meta">
          <span>${escapeHtml(formatShare(flow.share))}</span>
          <span>${number0(flow.quantity_t)} t</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderDetail() {
  const flow = currentFlow();
  if (!flow) {
    refs.detail.innerHTML = "<div class=\"truck-gallery-empty\">Nenhum frete selecionado.</div>";
    return;
  }
  refs.detail.innerHTML = `
    <div class="flow-editor-detail-grid">
      <div class="flow-editor-detail-metric"><span>Origem</span><strong>${escapeHtml(flow.origin_label)}</strong></div>
      <div class="flow-editor-detail-metric"><span>Destino</span><strong>${escapeHtml(flow.destination_label)}</strong></div>
      <div class="flow-editor-detail-metric"><span>Peso</span><strong>${escapeHtml(formatShare(flow.share))}</strong></div>
      <div class="flow-editor-detail-metric"><span>Quantidade</span><strong>${number0(flow.quantity_t)} t</strong></div>
      <div class="flow-editor-detail-metric"><span>Distância</span><strong>${number1(flow.distance_km)} km</strong></div>
      <div class="flow-editor-detail-metric"><span>Frete</span><strong>#${number0(flow.rank)}</strong></div>
    </div>
  `;
}

function cityMarkerColor(city) {
  const flow = currentFlow();
  if (!flow) {
    return FLOW_PATH_COLORS.muted;
  }
  if (city.id === flow.origin_id) {
    return FLOW_PATH_COLORS.primary;
  }
  if (city.id === flow.destination_id) {
    return FLOW_PATH_COLORS.secondary;
  }
  return FLOW_PATH_COLORS.muted;
}

function cityMarkerOpacity(city) {
  if (state.mapMode === "cities") {
    return 0.92;
  }
  const generated = currentGenerated();
  if (!generated) {
    return 0.28;
  }
  if (state.mapMode === "supply") {
    return generated.origins.some((row) => row.city_id === city.id) ? 0.92 : 0.18;
  }
  if (state.mapMode === "demand") {
    return generated.destinations.some((row) => row.city_id === city.id) ? 0.92 : 0.18;
  }
  const activeIds = new Set();
  generated.flows.forEach((flow) => {
    activeIds.add(flow.origin_id);
    activeIds.add(flow.destination_id);
  });
  return activeIds.has(city.id) ? 0.92 : 0.14;
}

function bindCityTooltip(marker, city) {
  const flow = currentFlow();
  const generated = currentGenerated();
  const role = flow
    ? (city.id === flow.origin_id ? "Origem do frete selecionado" : (city.id === flow.destination_id ? "Destino do frete selecionado" : "Cidade do mapa"))
    : "Cidade do mapa";
  const supply = generated?.origins?.find((row) => row.city_id === city.id)?.value || 0;
  const demand = generated?.destinations?.find((row) => row.city_id === city.id)?.value || 0;
  marker.bindTooltip(
    `${escapeHtml(city.label)}<br>${escapeHtml(role)}<br>Oferta: ${number0(supply)} t<br>Demanda: ${number0(demand)} t`,
    { sticky: true, direction: "top" },
  );
}

function ensureLayerGroups() {
  if (!state.mapLayers.routes) {
    state.mapLayers.routes = window.L.layerGroup().addTo(state.map);
  }
  if (!state.mapLayers.routeHighlights) {
    state.mapLayers.routeHighlights = window.L.layerGroup().addTo(state.map);
  }
  if (!state.mapLayers.cities) {
    state.mapLayers.cities = window.L.layerGroup().addTo(state.map);
  }
  if (!state.mapLayers.supply) {
    state.mapLayers.supply = window.L.layerGroup().addTo(state.map);
  }
  if (!state.mapLayers.demand) {
    state.mapLayers.demand = window.L.layerGroup().addTo(state.map);
  }
}

function renderCities() {
  ensureLayerGroups();
  state.mapLayers.cities.clearLayers();
  const flow = currentFlow();
  for (const city of state.cities) {
    const band = findPopulationBand(city, state.populationBands);
    const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
    const marker = createCityMarker({
      city,
      band,
      pin,
      fillColor: cityMarkerColor(city),
      strokeColor: "#ffffff",
      contrastFillColor: "#ffffff",
      selectedHaloFillColor: "#fff8ec",
      selectedHaloStrokeColor: "#2d5a27",
      selected: flow ? (city.id === flow.origin_id || city.id === flow.destination_id) : false,
      opacity: cityMarkerOpacity(city),
    });
    marker.options.interactive = false;
    marker.options.keyboard = false;
    marker.addTo(state.mapLayers.cities);
  }
}

function radiusForPoint(value, maxValue) {
  const ratio = maxValue > 0 ? Number(value || 0) / maxValue : 0;
  return 15000 + (ratio * 95000);
}

function renderPointCloud(layerGroup, points, color) {
  layerGroup.clearLayers();
  const maxValue = Math.max(...points.map((point) => Number(point.value || 0)), 0);
  for (const point of points) {
    const city = state.citiesById[point.city_id];
    if (!city) {
      continue;
    }
    const circle = window.L.circle([city.latitude, city.longitude], {
      pane: "brasix-highlight",
      radius: radiusForPoint(point.value, maxValue),
      stroke: false,
      fillColor: color,
      fillOpacity: 0.08,
      interactive: false,
    });
    circle.addTo(layerGroup);
  }
}

function pathWeight(flow, maxQuantity) {
  const ratio = maxQuantity > 0 ? Number(flow.quantity_t || 0) / maxQuantity : 0;
  return 1.35 + (Math.pow(ratio, 0.72) * 6.4);
}

function bindFlowTooltip(layer, flow) {
  layer.bindTooltip(
    `${escapeHtml(flow.origin_label)} → ${escapeHtml(flow.destination_label)}<br>${number0(flow.quantity_t)} t`,
    { sticky: true, direction: "top" },
  );
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
  const start = [flow.origin_latitude, flow.origin_longitude];
  const end = [flow.destination_latitude, flow.destination_longitude];
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

function bindRouteInteraction(layer, flow) {
  bindFlowTooltip(layer, flow);
  layer.on("click", () => {
    selectFlow(flow.id, { scroll: true });
  });
}

function renderFlowRoute(flow, productColor, maxQuantity, isActive) {
  const curveLatLngs = buildCurvedFlowLatLngs(flow);
  const slices = buildGradientSlices(curveLatLngs, isActive ? 8 : 7);
  const layerGroup = isActive ? state.mapLayers.routeHighlights : state.mapLayers.routes;
  const pane = isActive ? FREIGHT_ACTIVE_PANE : FREIGHT_ROUTE_PANE;
  const weight = pathWeight(flow, maxQuantity);
  const routeBaseColor = isActive ? FLOW_PATH_COLORS.highlight : productColor;
  const hitStroke = window.L.polyline(curveLatLngs, {
    pane,
    color: "#ffffff",
    weight: Math.max(weight + 10, 12),
    opacity: 0.001,
    lineCap: "round",
    lineJoin: "round",
    interactive: true,
  });
  bindRouteInteraction(hitStroke, flow);
  hitStroke.addTo(layerGroup);
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
    const segment = window.L.polyline(slice, {
      pane,
      color: gradientColorForIndex(routeBaseColor, index, slices.length, isActive),
      weight,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
    segment.addTo(layerGroup);
  });
}

function renderRoutes() {
  ensureLayerGroups();
  state.mapLayers.routes.clearLayers();
  state.mapLayers.routeHighlights.clearLayers();
  state.mapLayers.supply.clearLayers();
  state.mapLayers.demand.clearLayers();
  const generated = currentGenerated();
  const product = currentProduct();
  if (!generated) {
    return;
  }
  if (state.mapMode === "supply") {
    renderPointCloud(state.mapLayers.supply, generated.origins, product?.color || FLOW_PATH_COLORS.primary);
    return;
  }
  if (state.mapMode === "demand") {
    renderPointCloud(state.mapLayers.demand, generated.destinations, FLOW_PATH_COLORS.secondary);
    return;
  }
  if (state.mapMode === "cities") {
    return;
  }
  const maxQuantity = Math.max(...generated.flows.map((flow) => Number(flow.quantity_t || 0)), 0);
  const productColor = product?.color || FLOW_PATH_COLORS.primary;
  for (const flow of generated.flows) {
    renderFlowRoute(flow, productColor, maxQuantity, flow.id === state.selectedFlowId);
  }
}

function renderMap() {
  renderOverlayTitle();
  renderMapSummary();
  renderCities();
  renderRoutes();
}

function renderAll() {
  syncControls();
  buildHeaderBadges();
  renderProducts();
  renderMap();
  renderFunnel();
  renderStatus();
  renderFlows();
  renderDetail();
}

function signatureForState(productState) {
  return JSON.stringify({
    coverage: productState.coverage,
    flowCount: productState.flowCount,
    scoreOriginWeight: productState.scoreOriginWeight,
    scoreDestinationWeight: productState.scoreDestinationWeight,
    scoreTransferWeight: productState.scoreTransferWeight,
    distanceBonus: productState.distanceBonus,
    reusePenalty: productState.reusePenalty,
    originLimitShare: productState.originLimitShare,
    destinationLimitShare: productState.destinationLimitShare,
    targetOriginsShare: productState.targetOriginsShare,
    targetDestinationsShare: productState.targetDestinationsShare,
    newOriginBonus: productState.newOriginBonus,
    newDestinationBonus: productState.newDestinationBonus,
    quantityExponent: productState.quantityExponent,
  });
}

function buildCandidateBase(product) {
  const productState = currentProductState();
  const coveragePercent = Number(productState.coverage || product.defaults.coverage || 90);
  const sortDesc = (left, right) => Number(right.value || 0) - Number(left.value || 0);
  const supplyTotal = product.supply_points.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const demandTotal = product.demand_points.reduce((sum, item) => sum + Number(item.value || 0), 0);

  function selectCoverage(points, total) {
    const ordered = [...points].sort(sortDesc);
    const target = total * (coveragePercent / 100);
    const selected = [];
    let covered = 0;
    for (const point of ordered) {
      selected.push(point);
      covered += Number(point.value || 0);
      if (covered >= target) {
        break;
      }
    }
    return selected;
  }

  return {
    coveragePercent,
    origins: selectCoverage(product.supply_points, supplyTotal),
    destinations: selectCoverage(product.demand_points, demandTotal),
  };
}

function buildCandidatesForProduct(product) {
  const productState = currentProductState();
  const base = buildCandidateBase(product);
  const pairs = [];
  const origins = base.origins.map((item) => ({ ...item, city: state.citiesById[item.city_id] })).filter((item) => item.city);
  const destinations = base.destinations.map((item) => ({ ...item, city: state.citiesById[item.city_id] })).filter((item) => item.city);
  const originWeight = Number(productState.scoreOriginWeight || 38);
  const destinationWeight = Number(productState.scoreDestinationWeight || 38);
  const transferWeight = Number(productState.scoreTransferWeight || 24);
  const totalWeight = originWeight + destinationWeight + transferWeight || 1;
  const distanceBonus = Number(productState.distanceBonus || 22);
  let maxTransfer = 0;
  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin.city_id === destination.city_id) {
        continue;
      }
      maxTransfer = Math.max(maxTransfer, Math.min(Number(origin.value || 0), Number(destination.value || 0)));
    }
  }
  const maxOrigin = Math.max(...origins.map((item) => Number(item.value || 0)), 0);
  const maxDestination = Math.max(...destinations.map((item) => Number(item.value || 0)), 0);

  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin.city_id === destination.city_id) {
        continue;
      }
      const distanceKm = window.L.latLng(origin.city.latitude, origin.city.longitude).distanceTo(
        window.L.latLng(destination.city.latitude, destination.city.longitude),
      ) / 1000;
      const distanceFactor = (
        (100 - distanceBonus)
        + ((Math.min(distanceKm, 2200) / 2200) * distanceBonus)
      ) / 100;
      const transfer = Math.min(Number(origin.value || 0), Number(destination.value || 0));
      const score = (
        ((Number(origin.value || 0) / (maxOrigin || 1)) * (originWeight / totalWeight))
        + ((Number(destination.value || 0) / (maxDestination || 1)) * (destinationWeight / totalWeight))
        + ((transfer / (maxTransfer || 1)) * (transferWeight / totalWeight))
      ) * distanceFactor;
      pairs.push({
        id: `${origin.city_id}::${destination.city_id}`,
        origin,
        destination,
        distance_km: distanceKm,
        score,
      });
    }
  }
  pairs.sort((left, right) => right.score - left.score);
  return { ...base, candidates: pairs };
}

function buildSelectionConfig(productState, flowCount, candidates) {
  const uniqueOrigins = new Set(candidates.map((candidate) => candidate.origin.city_id)).size;
  const uniqueDestinations = new Set(candidates.map((candidate) => candidate.destination.city_id)).size;
  return {
    reusePenalty: Number(productState.reusePenalty || 0.86),
    originLimit: Math.max(1, Math.ceil(flowCount * (Number(productState.originLimitShare || 33) / 100))),
    destinationLimit: Math.max(1, Math.ceil(flowCount * (Number(productState.destinationLimitShare || 33) / 100))),
    targetOrigins: Math.min(uniqueOrigins, Math.max(1, Math.round(flowCount * (Number(productState.targetOriginsShare || 50) / 100)))),
    targetDestinations: Math.min(uniqueDestinations, Math.max(1, Math.round(flowCount * (Number(productState.targetDestinationsShare || 50) / 100)))),
    newOriginBonus: Number(productState.newOriginBonus || 100) / 100,
    newDestinationBonus: Number(productState.newDestinationBonus || 100) / 100,
  };
}

function selectFlows(candidates, flowCount, productState) {
  if (!candidates.length || flowCount <= 0) {
    return [];
  }
  const config = buildSelectionConfig(productState, flowCount, candidates);
  const selected = [];
  const selectedIds = new Set();
  const originCounts = new Map();
  const destinationCounts = new Map();

  function canUse(candidate, originLimit, destinationLimit) {
    return (
      (originCounts.get(candidate.origin.city_id) || 0) < originLimit
      && (destinationCounts.get(candidate.destination.city_id) || 0) < destinationLimit
    );
  }

  function remember(candidate) {
    selected.push(candidate);
    selectedIds.add(candidate.id);
    originCounts.set(candidate.origin.city_id, (originCounts.get(candidate.origin.city_id) || 0) + 1);
    destinationCounts.set(candidate.destination.city_id, (destinationCounts.get(candidate.destination.city_id) || 0) + 1);
  }

  for (const candidate of candidates) {
    if (selected.length >= flowCount) {
      break;
    }
    if (!canUse(candidate, config.originLimit, config.destinationLimit)) {
      continue;
    }
    const addsOrigin = !originCounts.has(candidate.origin.city_id);
    const addsDestination = !destinationCounts.has(candidate.destination.city_id);
    if (addsOrigin || addsDestination) {
      remember(candidate);
    }
    if (originCounts.size >= config.targetOrigins && destinationCounts.size >= config.targetDestinations) {
      break;
    }
  }

  let relaxedOriginLimit = config.originLimit;
  let relaxedDestinationLimit = config.destinationLimit;

  while (selected.length < flowCount) {
    let best = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) {
        continue;
      }
      const originCount = originCounts.get(candidate.origin.city_id) || 0;
      const destinationCount = destinationCounts.get(candidate.destination.city_id) || 0;
      if (!canUse(candidate, relaxedOriginLimit, relaxedDestinationLimit)) {
        continue;
      }
      let score = candidate.score / (1 + originCount * config.reusePenalty + destinationCount * config.reusePenalty);
      if (!originCounts.has(candidate.origin.city_id)) {
        score *= config.newOriginBonus;
      }
      if (!destinationCounts.has(candidate.destination.city_id)) {
        score *= config.newDestinationBonus;
      }
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) {
      relaxedOriginLimit += 1;
      relaxedDestinationLimit += 1;
      if (relaxedOriginLimit > flowCount && relaxedDestinationLimit > flowCount) {
        break;
      }
      continue;
    }
    remember(best);
  }
  return selected;
}

function allocateQuantities(flows, quantityExponent, totalVolume) {
  const exponent = Number(quantityExponent || 1);
  const base = flows.map((flow) => Math.max(flow.score, 0.0001) ** exponent);
  const sum = base.reduce((acc, value) => acc + value, 0) || 1;
  const normalized = base.map((value) => value / sum);
  const raw = normalized.map((weight) => weight * totalVolume);
  const rounded = raw.map((value) => Math.floor(value));
  let remainder = Math.max(0, Math.round(totalVolume - rounded.reduce((acc, value) => acc + value, 0)));
  raw
    .map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((item) => {
      if (remainder <= 0) {
        return;
      }
      rounded[item.index] += 1;
      remainder -= 1;
    });
  return rounded;
}

function regenerateProduct(productId) {
  const product = state.productsById[productId];
  const productState = state.productStatesById[productId];
  if (!product || !productState) {
    return;
  }
  const base = buildCandidatesForProduct(product);
  const flowCount = Math.min(
    normalizeFlowCount(productState.flowCount || product.defaults.flow_count || FLOW_COUNT_STEPS[0]),
    Math.max(1, base.candidates.length),
  );
  productState.flowCount = flowCount;
  productState.algorithm = "ajustado";
  productState.quantityMode = inferQuantityMode(productState.quantityExponent);
  const selected = selectFlows(base.candidates, flowCount, productState);
  const transferableVolume = Math.round(
    Math.min(
      base.origins.reduce((sum, item) => sum + Number(item.value || 0), 0),
      base.destinations.reduce((sum, item) => sum + Number(item.value || 0), 0),
    ),
  );
  const quantities = allocateQuantities(selected, productState.quantityExponent, transferableVolume);
  const totalQuantity = quantities.reduce((sum, value) => sum + value, 0) || 1;
  productState.generated = {
    algorithm: productState.algorithm,
    coverage_percent: Number(productState.coverage),
    quantity_mode: productState.quantityMode,
    flow_count: flowCount,
    origins: base.origins,
    destinations: base.destinations,
    coverage_data: {
      origins_count: base.origins.length,
      destinations_count: base.destinations.length,
      pairs: base.candidates.length,
    },
    flows: selected.map((flow, index) => ({
      id: `${product.id}::${flow.id}`,
      rank: index + 1,
      origin_id: flow.origin.city_id,
      origin_label: flow.origin.city.label,
      origin_state_code: flow.origin.city.state_code,
      origin_value_t: Math.round(Number(flow.origin.value || 0)),
      origin_latitude: flow.origin.city.latitude,
      origin_longitude: flow.origin.city.longitude,
      destination_id: flow.destination.city_id,
      destination_label: flow.destination.city.label,
      destination_state_code: flow.destination.city.state_code,
      destination_value_t: Math.round(Number(flow.destination.value || 0)),
      destination_latitude: flow.destination.city.latitude,
      destination_longitude: flow.destination.city.longitude,
      distance_km: flow.distance_km,
      score: flow.score,
      quantity_t: quantities[index],
      share: quantities[index] / totalQuantity,
    })).sort((left, right) => right.quantity_t - left.quantity_t),
  };
  productState.generated.flows.forEach((flow, index) => {
    flow.rank = index + 1;
  });
  product.summary.candidate_pairs = productState.generated.coverage_data.pairs;
  product.summary.covered_origins = productState.generated.coverage_data.origins_count;
  product.summary.covered_destinations = productState.generated.coverage_data.destinations_count;
}

function regenerateCurrentProduct() {
  regenerateProduct(state.selectedProductId);
  state.selectedFlowId = currentGenerated()?.flows?.[0]?.id || "";
  saveSession();
  renderAll();
}

function regenerateAllProducts() {
  for (const product of state.products) {
    regenerateProduct(product.id);
  }
  state.selectedFlowId = currentGenerated()?.flows?.[0]?.id || "";
  saveSession();
  renderAll();
}

function resetCurrentProduct() {
  const product = currentProduct();
  if (!product) {
    return;
  }
  state.productStatesById[product.id] = productDefaultState(product);
  state.selectedFlowId = state.productStatesById[product.id].generated?.flows?.[0]?.id || "";
  saveSession();
  renderAll();
}

function bindEvents() {
  refs.productSearch?.addEventListener("input", (event) => {
    state.searchTerm = String(event.target.value || "");
    saveSession();
    renderProducts();
  });

  refs.productsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product-id]");
    if (!button) {
      return;
    }
    state.selectedProductId = button.dataset.productId;
    state.selectedFlowId = currentGenerated()?.flows?.[0]?.id || "";
    saveSession();
    renderAll();
  });

  refs.flowsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-flow-id]");
    if (!button) {
      return;
    }
    selectFlow(button.dataset.flowId, { scroll: true });
  });

  refs.modeToggle?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) {
      return;
    }
    state.mapMode = button.dataset.mode;
    saveSession();
    renderMap();
    syncControls();
  });

  refs.parameterGroups?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-parameter-key]");
    if (!input) {
      return;
    }
    const parameterKey = String(input.dataset.parameterKey || "");
    const definition = PARAMETER_DEFINITIONS[parameterKey];
    if (!definition) {
      return;
    }
    const nextValue = discreteStepValue(definition.steps, input.value);
    currentProductState()[parameterKey] = nextValue;
    currentProductState().quantityMode = inferQuantityMode(currentProductState().quantityExponent);
    saveSession();
    const valueTag = input.closest(".flow-editor-range-top")?.querySelector(".flow-editor-range-value");
    if (valueTag) {
      valueTag.textContent = parameterValueLabel(parameterKey, nextValue);
    }
  });

  refs.generateSideButton?.addEventListener("click", regenerateCurrentProduct);
  refs.generateTopButton?.addEventListener("click", regenerateAllProducts);
  refs.resetButton?.addEventListener("click", resetCurrentProduct);
  refs.saveButton?.addEventListener("click", saveSession);
  refs.themeButton?.addEventListener("click", toggleTheme);

  window.addEventListener("resize", () => {
    if (activeHelpTarget) {
      positionFloatingHelpTooltip(activeHelpTarget);
    }
  });

  refs.parameterGroups?.closest(".truck-operations-side-panel")?.addEventListener("scroll", () => {
    if (activeHelpTarget) {
      positionFloatingHelpTooltip(activeHelpTarget);
    }
  });
}

async function initMap() {
  await waitForLeaflet();
  state.map = createBrasixMap({
    elementId: "flow-editor-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor.leaflet_settings,
  });
  if (!state.map.getPane(FREIGHT_ROUTE_PANE)) {
    state.map.createPane(FREIGHT_ROUTE_PANE);
  }
  if (!state.map.getPane(FREIGHT_ACTIVE_PANE)) {
    state.map.createPane(FREIGHT_ACTIVE_PANE);
  }
  state.map.getPane(FREIGHT_ROUTE_PANE).style.zIndex = "480";
  state.map.getPane(FREIGHT_ACTIVE_PANE).style.zIndex = "490";
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  window.requestAnimationFrame(() => {
    state.map.invalidateSize(false);
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  });
  if (window.ResizeObserver && refs.mapStage) {
    const resizeObserver = new window.ResizeObserver(() => {
      if (!state.map) {
        return;
      }
      state.map.invalidateSize(false);
    });
    resizeObserver.observe(refs.mapStage);
  }
}

async function init() {
  const payload = await loadBootstrap();
  normalizeBootstrap(payload);
  restoreSession();
  await initMap();
  applyThemeButtonLabel();
  bindEvents();
  regenerateAllProducts();
  syncControls();
  renderAll();
}

init().catch((error) => {
  console.error("Brasix freight editor init failure:", error);
  throw error;
});
