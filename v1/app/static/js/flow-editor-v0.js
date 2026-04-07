const THEME_KEY = "brasix:v1:flow-editor-theme";
const STORAGE_KEY = "brasix:v1:flow-editor-v0-state";

const CITY_INDEX = {
  sorriso: { id: "sorriso", label: "Sorriso, MT", shortLabel: "Sorriso", x: 18, y: 22 },
  lucas: { id: "lucas", label: "Lucas do Rio Verde, MT", shortLabel: "Lucas do Rio Verde", x: 22, y: 20 },
  cuiaba: { id: "cuiaba", label: "Cuiaba, MT", shortLabel: "Cuiaba", x: 24, y: 42 },
  rondonopolis: { id: "rondonopolis", label: "Rondonopolis, MT", shortLabel: "Rondonopolis", x: 29, y: 39 },
  portoVelho: { id: "portoVelho", label: "Porto Velho, RO", shortLabel: "Porto Velho", x: 15, y: 25 },
  rioBranco: { id: "rioBranco", label: "Rio Branco, AC", shortLabel: "Rio Branco", x: 8, y: 24 },
  manaus: { id: "manaus", label: "Manaus, AM", shortLabel: "Manaus", x: 27, y: 12 },
  belem: { id: "belem", label: "Belem, PA", shortLabel: "Belem", x: 68, y: 17 },
  araguaina: { id: "araguaina", label: "Araguaina, TO", shortLabel: "Araguaina", x: 57, y: 22 },
  imperatriz: { id: "imperatriz", label: "Imperatriz, MA", shortLabel: "Imperatriz", x: 63, y: 25 },
  rioVerde: { id: "rioVerde", label: "Rio Verde, GO", shortLabel: "Rio Verde", x: 40, y: 48 },
  anapolis: { id: "anapolis", label: "Anapolis, GO", shortLabel: "Anapolis", x: 46, y: 45 },
  dourados: { id: "dourados", label: "Dourados, MS", shortLabel: "Dourados", x: 29, y: 60 },
  campoGrande: { id: "campoGrande", label: "Campo Grande, MS", shortLabel: "Campo Grande", x: 32, y: 56 },
  uberlandia: { id: "uberlandia", label: "Uberlandia, MG", shortLabel: "Uberlandia", x: 56, y: 54 },
  beloHorizonte: { id: "beloHorizonte", label: "Belo Horizonte, MG", shortLabel: "Belo Horizonte", x: 61, y: 58 },
  campinas: { id: "campinas", label: "Campinas, SP", shortLabel: "Campinas", x: 66, y: 62 },
  santos: { id: "santos", label: "Santos, SP", shortLabel: "Santos", x: 68, y: 70 },
  rioJaneiro: { id: "rioJaneiro", label: "Rio de Janeiro, RJ", shortLabel: "Rio de Janeiro", x: 71, y: 63 },
  salvador: { id: "salvador", label: "Salvador, BA", shortLabel: "Salvador", x: 79, y: 39 },
  recife: { id: "recife", label: "Recife, PE", shortLabel: "Recife", x: 88, y: 28 },
  fortaleza: { id: "fortaleza", label: "Fortaleza, CE", shortLabel: "Fortaleza", x: 90, y: 21 },
  curitiba: { id: "curitiba", label: "Curitiba, PR", shortLabel: "Curitiba", x: 59, y: 78 },
  chapeco: { id: "chapeco", label: "Chapeco, SC", shortLabel: "Chapeco", x: 54, y: 79 },
  portoAlegre: { id: "portoAlegre", label: "Porto Alegre, RS", shortLabel: "Porto Alegre", x: 49, y: 90 },
  uruguaiana: { id: "uruguaiana", label: "Uruguaiana, RS", shortLabel: "Uruguaiana", x: 39, y: 88 },
};

const PRODUCT_LIBRARY = [
  {
    id: "milho",
    label: "Milho",
    color: "#c79121",
    defaultFlowCount: 24,
    volumeReference: 980,
    summary: { supplyNonZero: 254, demandNonZero: 254 },
    coverage: {
      "90": { origins: 105, destinations: 123, pairs: 12915 },
      "95": { origins: 131, destinations: 156, pairs: 20436 },
    },
    origins: [
      { cityId: "sorriso", weight: 1.0 },
      { cityId: "lucas", weight: 0.94 },
      { cityId: "rondonopolis", weight: 0.86 },
      { cityId: "rioVerde", weight: 0.74 },
      { cityId: "anapolis", weight: 0.67 },
      { cityId: "cuiaba", weight: 0.62 },
      { cityId: "dourados", weight: 0.56 },
      { cityId: "araguaina", weight: 0.44 },
    ],
    destinations: [
      { cityId: "campinas", weight: 1.0 },
      { cityId: "santos", weight: 0.95 },
      { cityId: "beloHorizonte", weight: 0.82 },
      { cityId: "salvador", weight: 0.76 },
      { cityId: "recife", weight: 0.68 },
      { cityId: "fortaleza", weight: 0.62 },
      { cityId: "uberlandia", weight: 0.58 },
      { cityId: "rioJaneiro", weight: 0.54 },
    ],
  },
  {
    id: "mandioca",
    label: "Mandioca",
    color: "#8d6f3d",
    defaultFlowCount: 30,
    volumeReference: 760,
    summary: { supplyNonZero: 253, demandNonZero: 235 },
    coverage: {
      "90": { origins: 183, destinations: 165, pairs: 30195 },
      "95": { origins: 209, destinations: 192, pairs: 40128 },
    },
    origins: [
      { cityId: "manaus", weight: 1.0 },
      { cityId: "portoVelho", weight: 0.92 },
      { cityId: "rioBranco", weight: 0.86 },
      { cityId: "belem", weight: 0.81 },
      { cityId: "imperatriz", weight: 0.74 },
      { cityId: "araguaina", weight: 0.69 },
      { cityId: "salvador", weight: 0.58 },
      { cityId: "fortaleza", weight: 0.52 },
    ],
    destinations: [
      { cityId: "salvador", weight: 1.0 },
      { cityId: "recife", weight: 0.91 },
      { cityId: "fortaleza", weight: 0.87 },
      { cityId: "beloHorizonte", weight: 0.78 },
      { cityId: "campinas", weight: 0.74 },
      { cityId: "rioJaneiro", weight: 0.69 },
      { cityId: "curitiba", weight: 0.58 },
      { cityId: "belem", weight: 0.53 },
    ],
  },
  {
    id: "arroz",
    label: "Arroz",
    color: "#b5b1a1",
    defaultFlowCount: 14,
    volumeReference: 640,
    summary: { supplyNonZero: 253, demandNonZero: 249 },
    coverage: {
      "90": { origins: 61, destinations: 109, pairs: 6649 },
      "95": { origins: 100, destinations: 149, pairs: 14900 },
    },
    origins: [
      { cityId: "uruguaiana", weight: 1.0 },
      { cityId: "portoAlegre", weight: 0.92 },
      { cityId: "dourados", weight: 0.71 },
      { cityId: "campoGrande", weight: 0.64 },
      { cityId: "cuiaba", weight: 0.52 },
      { cityId: "uberlandia", weight: 0.41 },
      { cityId: "curitiba", weight: 0.39 },
      { cityId: "beloHorizonte", weight: 0.28 },
    ],
    destinations: [
      { cityId: "campinas", weight: 1.0 },
      { cityId: "beloHorizonte", weight: 0.84 },
      { cityId: "salvador", weight: 0.76 },
      { cityId: "recife", weight: 0.72 },
      { cityId: "rioJaneiro", weight: 0.64 },
      { cityId: "fortaleza", weight: 0.57 },
      { cityId: "belem", weight: 0.46 },
      { cityId: "santos", weight: 0.44 },
    ],
  },
  {
    id: "leite",
    label: "Leite",
    color: "#5c8aa0",
    defaultFlowCount: 22,
    volumeReference: 720,
    summary: { supplyNonZero: 253, demandNonZero: 238 },
    coverage: {
      "90": { origins: 139, destinations: 146, pairs: 20294 },
      "95": { origins: 177, destinations: 174, pairs: 30798 },
    },
    origins: [
      { cityId: "uberlandia", weight: 1.0 },
      { cityId: "beloHorizonte", weight: 0.94 },
      { cityId: "chapeco", weight: 0.91 },
      { cityId: "curitiba", weight: 0.83 },
      { cityId: "campinas", weight: 0.79 },
      { cityId: "anapolis", weight: 0.69 },
      { cityId: "portoAlegre", weight: 0.63 },
      { cityId: "campoGrande", weight: 0.51 },
    ],
    destinations: [
      { cityId: "campinas", weight: 1.0 },
      { cityId: "rioJaneiro", weight: 0.96 },
      { cityId: "santos", weight: 0.86 },
      { cityId: "salvador", weight: 0.74 },
      { cityId: "recife", weight: 0.68 },
      { cityId: "fortaleza", weight: 0.62 },
      { cityId: "beloHorizonte", weight: 0.58 },
      { cityId: "belem", weight: 0.44 },
    ],
  },
  {
    id: "aves",
    label: "Aves",
    color: "#b45d41",
    defaultFlowCount: 20,
    volumeReference: 910,
    summary: { supplyNonZero: 253, demandNonZero: 253 },
    coverage: {
      "90": { origins: 125, destinations: 136, pairs: 17000 },
      "95": { origins: 162, destinations: 170, pairs: 27540 },
    },
    origins: [
      { cityId: "rioVerde", weight: 1.0 },
      { cityId: "anapolis", weight: 0.94 },
      { cityId: "chapeco", weight: 0.9 },
      { cityId: "uberlandia", weight: 0.82 },
      { cityId: "dourados", weight: 0.76 },
      { cityId: "cuiaba", weight: 0.61 },
      { cityId: "curitiba", weight: 0.56 },
      { cityId: "imperatriz", weight: 0.47 },
    ],
    destinations: [
      { cityId: "campinas", weight: 1.0 },
      { cityId: "santos", weight: 0.96 },
      { cityId: "recife", weight: 0.81 },
      { cityId: "salvador", weight: 0.79 },
      { cityId: "fortaleza", weight: 0.72 },
      { cityId: "belem", weight: 0.61 },
      { cityId: "rioJaneiro", weight: 0.57 },
      { cityId: "beloHorizonte", weight: 0.52 },
    ],
  },
  {
    id: "bovinos",
    label: "Bovinos",
    color: "#7a5138",
    defaultFlowCount: 18,
    volumeReference: 860,
    summary: { supplyNonZero: 253, demandNonZero: 247 },
    coverage: {
      "90": { origins: 139, destinations: 159, pairs: 22101 },
      "95": { origins: 176, destinations: 188, pairs: 33088 },
    },
    origins: [
      { cityId: "cuiaba", weight: 1.0 },
      { cityId: "campoGrande", weight: 0.93 },
      { cityId: "araguaina", weight: 0.82 },
      { cityId: "belem", weight: 0.76 },
      { cityId: "uberlandia", weight: 0.69 },
      { cityId: "dourados", weight: 0.63 },
      { cityId: "portoVelho", weight: 0.57 },
      { cityId: "imperatriz", weight: 0.49 },
    ],
    destinations: [
      { cityId: "campinas", weight: 1.0 },
      { cityId: "santos", weight: 0.94 },
      { cityId: "salvador", weight: 0.82 },
      { cityId: "recife", weight: 0.77 },
      { cityId: "rioJaneiro", weight: 0.72 },
      { cityId: "fortaleza", weight: 0.66 },
      { cityId: "beloHorizonte", weight: 0.61 },
      { cityId: "curitiba", weight: 0.52 },
    ],
  },
];

const ALGORITHM_LABELS = {
  balanceado: "Balanceado",
  relevancia: "Maior relevancia",
  disperso: "Disperso",
};

const QUANTITY_MODE_LABELS = {
  proporcional: "Proporcional",
  equilibrada: "Equilibrada",
  concentrada: "Concentrada",
};

const BRAZIL_BASE_MARKUP = `
  <g class="flow-editor-map-base" aria-hidden="true">
    <path class="flow-editor-map-glow" d="M 92 132 C 118 88 180 66 246 74 C 322 36 420 32 506 58 C 590 38 680 60 754 98 C 836 110 900 154 930 222 C 922 258 928 292 956 334 C 950 388 922 434 878 470 C 848 534 780 570 716 580 C 674 556 622 562 578 590 C 536 590 494 562 462 528 C 410 544 356 574 300 558 C 256 530 212 522 186 480 C 146 454 128 416 116 372 C 90 330 92 286 106 246 C 76 208 74 168 92 132 Z" />
    <path class="flow-editor-map-land" d="M 92 132 C 118 88 180 66 246 74 C 322 36 420 32 506 58 C 590 38 680 60 754 98 C 836 110 900 154 930 222 C 922 258 928 292 956 334 C 950 388 922 434 878 470 C 848 534 780 570 716 580 C 674 556 622 562 578 590 C 536 590 494 562 462 528 C 410 544 356 574 300 558 C 256 530 212 522 186 480 C 146 454 128 416 116 372 C 90 330 92 286 106 246 C 76 208 74 168 92 132 Z" />
    <path class="flow-editor-map-coast" d="M 760 102 C 834 114 892 158 920 218 C 930 244 930 272 942 304 C 956 340 946 388 920 424 C 900 450 876 470 862 500" />
  </g>
`;

const state = {
  selectedProductId: PRODUCT_LIBRARY[0].id,
  mapMode: "selected",
  searchTerm: "",
  productStatesById: {},
};

const refs = {
  headerBadges: document.getElementById("flow-editor-header-badges"),
  productsSummary: document.getElementById("flow-editor-products-summary"),
  productSearch: document.getElementById("flow-editor-product-search"),
  productsList: document.getElementById("flow-editor-products-list"),
  mapSummary: document.getElementById("flow-editor-map-summary"),
  mapOverlayTitle: document.getElementById("flow-editor-map-overlay-title"),
  mapSvg: document.getElementById("flow-editor-map-svg"),
  mapNodes: document.getElementById("flow-editor-map-nodes"),
  funnelMetrics: document.getElementById("flow-editor-funnel-metrics"),
  algorithm: document.getElementById("flow-editor-algorithm"),
  coverage: document.getElementById("flow-editor-coverage"),
  flowCount: document.getElementById("flow-editor-flow-count"),
  quantityMode: document.getElementById("flow-editor-quantity-mode"),
  statusSummary: document.getElementById("flow-editor-status-summary"),
  baseSummary: document.getElementById("flow-editor-base-summary"),
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

function formatInt(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1).replace(".", ",")}%`;
}

function formatK(value) {
  const numeric = Number(value || 0);
  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return formatInt(numeric);
}

function currentProduct() {
  return PRODUCT_LIBRARY.find((product) => product.id === state.selectedProductId) || PRODUCT_LIBRARY[0];
}

function defaultProductState(product) {
  return {
    algorithm: "balanceado",
    coverage: "90",
    flowCount: product.defaultFlowCount,
    quantityMode: "proporcional",
    selectedFlowId: null,
    generated: null,
    generatedSignature: null,
  };
}

function signatureForProductState(productState) {
  return JSON.stringify({
    algorithm: productState.algorithm,
    coverage: productState.coverage,
    flowCount: productState.flowCount,
    quantityMode: productState.quantityMode,
  });
}

function getPreviewEndpointCount(totalPreviewEndpoints, numerator, denominator) {
  if (!denominator || denominator <= 0) {
    return Math.max(2, totalPreviewEndpoints - 2);
  }
  const ratio = Math.max(0.38, Math.min(1, numerator / denominator));
  return Math.max(3, Math.min(totalPreviewEndpoints, Math.round(totalPreviewEndpoints * ratio)));
}

function endpointWithCity(endpoint) {
  const city = CITY_INDEX[endpoint.cityId];
  return { ...endpoint, city };
}

function buildPreviewPool(product, coverage) {
  const coverageData = product.coverage[coverage];
  const baseline = product.coverage["95"] || coverageData;
  const origins = product.origins
    .map(endpointWithCity)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, getPreviewEndpointCount(product.origins.length, coverageData.origins, baseline.origins));
  const destinations = product.destinations
    .map(endpointWithCity)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, getPreviewEndpointCount(product.destinations.length, coverageData.destinations, baseline.destinations));
  return { origins, destinations, coverageData };
}

function euclideanDistance(origin, destination) {
  const dx = origin.city.x - destination.city.x;
  const dy = origin.city.y - destination.city.y;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function buildCandidates(product, productState) {
  const previewPool = buildPreviewPool(product, productState.coverage);
  const { origins, destinations, coverageData } = previewPool;
  const candidates = [];

  origins.forEach((origin) => {
    destinations.forEach((destination) => {
      if (origin.cityId === destination.cityId) {
        return;
      }

      const distance = euclideanDistance(origin, destination);
      const distanceFactor = 1 / (1 + (distance / 34));
      const baseScore = ((origin.weight * 0.58) + (destination.weight * 0.42)) * distanceFactor;

      candidates.push({
        id: `${product.id}:${origin.cityId}:${destination.cityId}`,
        origin,
        destination,
        distance,
        score: baseScore,
      });
    });
  });

  return {
    origins,
    destinations,
    coverageData,
    candidates,
  };
}

function normalizeWeights(values) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

function allocateRoundedValues(total, weights) {
  const rawValues = weights.map((weight) => weight * total);
  const rounded = rawValues.map((value) => Math.floor(value));
  let remainder = Math.max(0, Math.round(total - rounded.reduce((sum, value) => sum + value, 0)));

  rawValues
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

function quantityWeightsForMode(flows, quantityMode) {
  const base = flows.map((flow) => Math.max(flow.finalScore, 0.0001));

  if (quantityMode === "equilibrada") {
    return normalizeWeights(base.map((value) => Math.sqrt(value)));
  }

  if (quantityMode === "concentrada") {
    return normalizeWeights(base.map((value) => value ** 1.35));
  }

  return normalizeWeights(base);
}

function pickFlows(productState, candidateBundle) {
  const { candidates } = candidateBundle;
  const remaining = [...candidates].sort((left, right) => right.score - left.score);
  const selected = [];
  const originUsage = {};
  const destinationUsage = {};
  const desiredCount = Math.max(1, Math.min(Number(productState.flowCount || 1), remaining.length));

  while (selected.length < desiredCount && remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const originPenalty = originUsage[candidate.origin.cityId] || 0;
      const destinationPenalty = destinationUsage[candidate.destination.cityId] || 0;

      let multiplier = 1;
      if (productState.algorithm === "balanceado") {
        multiplier = 1 / (1 + (originPenalty * 0.52) + (destinationPenalty * 0.52));
      } else if (productState.algorithm === "disperso") {
        multiplier = (1 / (1 + (originPenalty * 0.92) + (destinationPenalty * 0.92))) * (1 + Math.min(candidate.distance / 200, 0.2));
      }

      const computedScore = candidate.score * multiplier;
      if (computedScore > bestScore) {
        bestScore = computedScore;
        bestIndex = index;
      }
    });

    const chosen = remaining.splice(bestIndex, 1)[0];
    selected.push({ ...chosen, finalScore: bestScore });
    originUsage[chosen.origin.cityId] = (originUsage[chosen.origin.cityId] || 0) + 1;
    destinationUsage[chosen.destination.cityId] = (destinationUsage[chosen.destination.cityId] || 0) + 1;
  }

  const totalFinalScore = selected.reduce((sum, flow) => sum + flow.finalScore, 0) || 1;
  return selected.map((flow, index) => ({
    ...flow,
    rank: index + 1,
    weight: flow.finalScore / totalFinalScore,
  }));
}

function applyRepresentativeVolumes(product, flows, quantityMode) {
  const weights = quantityWeightsForMode(flows, quantityMode);
  const volumes = allocateRoundedValues(product.volumeReference, weights);

  return flows.map((flow, index) => ({
    ...flow,
    quantityWeight: weights[index],
    representativeVolume: volumes[index],
  }));
}

function generateForProduct(productId) {
  const product = PRODUCT_LIBRARY.find((item) => item.id === productId);
  const productState = state.productStatesById[productId];
  const candidateBundle = buildCandidates(product, productState);
  const pickedFlows = pickFlows(productState, candidateBundle);
  const flows = applyRepresentativeVolumes(product, pickedFlows, productState.quantityMode);

  productState.generated = {
    ...candidateBundle,
    flows,
    previewCandidatePairs: candidateBundle.candidates.length,
  };
  productState.generatedSignature = signatureForProductState(productState);
  if (!productState.selectedFlowId || !flows.some((flow) => flow.id === productState.selectedFlowId)) {
    productState.selectedFlowId = flows[0]?.id || null;
  }
}

function persistState() {
  const serializable = {
    selectedProductId: state.selectedProductId,
    mapMode: state.mapMode,
    productStatesById: Object.fromEntries(
      Object.entries(state.productStatesById).map(([productId, productState]) => [productId, {
        algorithm: productState.algorithm,
        coverage: productState.coverage,
        flowCount: productState.flowCount,
        quantityMode: productState.quantityMode,
        selectedFlowId: productState.selectedFlowId,
      }]),
    ),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (_error) {
    // Persistencia opcional.
  }
}

function loadPersistedState() {
  PRODUCT_LIBRARY.forEach((product) => {
    state.productStatesById[product.id] = defaultProductState(product);
  });

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      PRODUCT_LIBRARY.forEach((product) => generateForProduct(product.id));
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.selectedProductId === "string") {
        state.selectedProductId = parsed.selectedProductId;
      }
      if (typeof parsed.mapMode === "string") {
        state.mapMode = parsed.mapMode;
      }
      Object.entries(parsed.productStatesById || {}).forEach(([productId, saved]) => {
        const current = state.productStatesById[productId];
        if (!current || !saved || typeof saved !== "object") {
          return;
        }
        current.algorithm = saved.algorithm || current.algorithm;
        current.coverage = saved.coverage || current.coverage;
        current.flowCount = Number(saved.flowCount || current.flowCount);
        current.quantityMode = saved.quantityMode || current.quantityMode;
        current.selectedFlowId = saved.selectedFlowId || null;
      });
    }
  } catch (_error) {
    // Fallback para o estado padrao.
  }

  PRODUCT_LIBRARY.forEach((product) => generateForProduct(product.id));
  if (!PRODUCT_LIBRARY.some((product) => product.id === state.selectedProductId)) {
    state.selectedProductId = PRODUCT_LIBRARY[0].id;
  }
}

function renderHeader() {
  const product = currentProduct();
  const productState = state.productStatesById[product.id];
  const pending = signatureForProductState(productState) !== productState.generatedSignature;

  refs.headerBadges.innerHTML = `
    <span class="editor-badge">mapa-6-3</span>
    <span class="editor-badge">${product.label}</span>
    <span class="editor-badge">${ALGORITHM_LABELS[productState.algorithm]}</span>
    <span class="editor-badge">${formatInt(productState.flowCount)} fluxos</span>
    <span class="editor-badge">${productState.coverage}% cobertura</span>
    <span class="editor-badge${pending ? " flow-editor-badge-warning" : ""}">${pending ? "Pendente" : "Atual"}</span>
  `;
}

function renderProductsSummary() {
  refs.productsSummary.innerHTML = `
    <span class="flow-editor-summary-pill">${PRODUCT_LIBRARY.length} produtos</span>
    <span class="flow-editor-summary-pill">mapa-6-3</span>
  `;
}

function renderProductList() {
  const query = state.searchTerm.trim().toLowerCase();
  const filtered = PRODUCT_LIBRARY.filter((product) => !query || product.label.toLowerCase().includes(query));

  if (!filtered.length) {
    refs.productsList.innerHTML = '<div class="truck-gallery-empty">Nenhum produto encontrado.</div>';
    return;
  }

  refs.productsList.innerHTML = filtered.map((product) => {
    const productState = state.productStatesById[product.id];
    const coverageData = product.coverage[productState.coverage];
    return `
      <button class="flow-editor-product-item${product.id === state.selectedProductId ? " is-active" : ""}" type="button" data-product-id="${product.id}">
        <div class="flow-editor-product-top">
          <strong>${product.label}</strong>
          <span class="flow-editor-product-count">${formatInt(productState.flowCount)}</span>
        </div>
        <div class="flow-editor-product-meta">
          <span class="flow-editor-mini-metric"><strong>Origens</strong><span>${formatInt(product.summary.supplyNonZero)}</span></span>
          <span class="flow-editor-mini-metric"><strong>Destinos</strong><span>${formatInt(product.summary.demandNonZero)}</span></span>
          <span class="flow-editor-mini-metric"><strong>Candidatos</strong><span>${formatK(coverageData.pairs)}</span></span>
          <span class="flow-editor-mini-metric"><strong>Leitura</strong><span>${productState.coverage}% ${ALGORITHM_LABELS[productState.algorithm]}</span></span>
        </div>
      </button>
    `;
  }).join("");

  refs.productsList.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProductId = button.dataset.productId || PRODUCT_LIBRARY[0].id;
      syncControls();
      render();
      persistState();
    });
  });
}

function syncControls() {
  const productState = state.productStatesById[state.selectedProductId];
  refs.algorithm.value = productState.algorithm;
  refs.coverage.value = productState.coverage;
  refs.flowCount.value = String(productState.flowCount);
  refs.quantityMode.value = productState.quantityMode;
}

function renderMapSummary() {
  const product = currentProduct();
  const productState = state.productStatesById[product.id];
  const generated = productState.generated;
  refs.mapSummary.innerHTML = `
    <span class="flow-editor-summary-pill">${generated.flows.length} fluxos</span>
    <span class="flow-editor-summary-pill">${formatK(generated.coverageData.pairs)} pares</span>
    <span class="flow-editor-summary-pill">${productState.coverage}%</span>
  `;
}

function renderMapOverlay() {
  const product = currentProduct();
  const productState = state.productStatesById[product.id];
  const generated = productState.generated;

  if (state.mapMode === "selected") {
    refs.mapOverlayTitle.textContent = `${generated.flows.length} fluxos`;
    return;
  }

  if (state.mapMode === "coverage") {
    refs.mapOverlayTitle.textContent = `${formatK(generated.coverageData.pairs)} pares`;
    return;
  }

  if (state.mapMode === "supply") {
    refs.mapOverlayTitle.textContent = `${generated.origins.length} origens`;
    return;
  }

  refs.mapOverlayTitle.textContent = `${generated.destinations.length} destinos`;
}

function buildCurvePath(flow, index) {
  const x1 = flow.origin.city.x * 10;
  const y1 = flow.origin.city.y * 6.2;
  const x2 = flow.destination.city.x * 10;
  const y2 = flow.destination.city.y * 6.2;
  const midX = (x1 + x2) / 2;
  const amplitude = 34 + ((index % 4) * 12);
  const direction = index % 2 === 0 ? -1 : 1;
  const midY = ((y1 + y2) / 2) + (direction * amplitude);
  return `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
}

function aggregateNodeRoles(flows) {
  const nodeMap = new Map();
  flows.forEach((flow) => {
    const currentOrigin = nodeMap.get(flow.origin.cityId) || { ...flow.origin.city, role: "origin", intensity: 0, links: 0 };
    currentOrigin.role = currentOrigin.role === "destination" ? "both" : currentOrigin.role;
    currentOrigin.intensity += flow.weight;
    currentOrigin.links += 1;
    nodeMap.set(flow.origin.cityId, currentOrigin);

    const currentDestination = nodeMap.get(flow.destination.cityId) || { ...flow.destination.city, role: "destination", intensity: 0, links: 0 };
    currentDestination.role = currentDestination.role === "origin" ? "both" : currentDestination.role;
    currentDestination.intensity += flow.weight;
    currentDestination.links += 1;
    nodeMap.set(flow.destination.cityId, currentDestination);
  });
  return [...nodeMap.values()];
}

function coveragePreviewFlows(generated) {
  const preview = [...generated.candidates].sort((left, right) => right.score - left.score).slice(0, 10);
  const totalScore = preview.reduce((sum, flow) => sum + flow.score, 0) || 1;
  return preview.map((flow) => ({ ...flow, weight: flow.score / totalScore }));
}

function renderMap() {
  const productState = state.productStatesById[state.selectedProductId];
  const generated = productState.generated;
  const selectedFlowId = productState.selectedFlowId;
  const flowPreview = state.mapMode === "coverage" ? coveragePreviewFlows(generated) : generated.flows;

  const lines = [];
  let nodes = [];

  if (state.mapMode === "selected" || state.mapMode === "coverage") {
    lines.push(...flowPreview.map((flow, index) => {
      const selectedClass = flow.id === selectedFlowId ? " is-active" : "";
      const lineKind = state.mapMode === "coverage" ? "candidate" : "selected";
      const weight = 1.8 + (flow.weight * 10);
      return `<path class="flow-editor-flow-path${selectedClass}" data-flow-id="${flow.id}" data-kind="${lineKind}" d="${buildCurvePath(flow, index)}" style="--flow-weight:${weight.toFixed(2)}"></path>`;
    }));
    nodes = aggregateNodeRoles(flowPreview);
  } else if (state.mapMode === "supply") {
    nodes = generated.origins.map((origin) => ({ ...origin.city, role: "origin", intensity: origin.weight, links: 1 }));
  } else {
    nodes = generated.destinations.map((destination) => ({ ...destination.city, role: "destination", intensity: destination.weight, links: 1 }));
  }

  refs.mapSvg.innerHTML = `${BRAZIL_BASE_MARKUP}${lines.join("")}`;
  refs.mapNodes.innerHTML = nodes.map((node) => {
    const isActive = flowPreview.some((flow) => flow.id === selectedFlowId && (flow.origin.cityId === node.id || flow.destination.cityId === node.id));
    const roleLabel = node.role === "origin" ? "O" : node.role === "destination" ? "D" : "O/D";
    const nodeSize = 18 + Math.min(22, node.intensity * 44) + Math.min(8, node.links * 1.6);
    return `
      <div class="flow-editor-node${isActive ? " is-active" : ""}" data-role="${node.role}" title="${node.label}" aria-label="${node.label}" style="left:${node.x}%; top:${node.y}%; --node-size:${nodeSize.toFixed(1)}px">
        <span>${roleLabel}</span>
      </div>
    `;
  }).join("");

  refs.mapSvg.querySelectorAll("[data-flow-id]").forEach((path) => {
    path.addEventListener("click", () => {
      productState.selectedFlowId = path.dataset.flowId;
      renderMap();
      renderFlowList();
      renderDetail();
      persistState();
    });
  });
}

function renderFunnel() {
  const product = currentProduct();
  const productState = state.productStatesById[product.id];
  const generated = productState.generated;
  const metrics = [
    { label: "Origens", value: formatInt(product.summary.supplyNonZero) },
    { label: "Destinos", value: formatInt(product.summary.demandNonZero) },
    { label: `Origens ${productState.coverage}%`, value: formatInt(generated.coverageData.origins) },
    { label: `Destinos ${productState.coverage}%`, value: formatInt(generated.coverageData.destinations) },
    { label: "Pares", value: formatK(generated.coverageData.pairs) },
    { label: "Fluxos", value: formatInt(generated.flows.length) },
  ];

  refs.funnelMetrics.innerHTML = metrics.map((metric) => `
    <div class="flow-editor-funnel-metric">
      <span>${metric.label}</span>
      <strong>${metric.value}</strong>
    </div>
  `).join("");
}

function renderGenerationNotes() {
  const product = currentProduct();
  const productState = state.productStatesById[product.id];
  const generated = productState.generated;
  const pending = signatureForProductState(productState) !== productState.generatedSignature;

  refs.statusSummary.innerHTML = `
    <strong>${pending ? "Pendente" : "Atual"}</strong>
    <span>${ALGORITHM_LABELS[productState.algorithm]} · ${QUANTITY_MODE_LABELS[productState.quantityMode]}</span>
  `;

  refs.baseSummary.innerHTML = `
    <strong>${formatInt(generated.coverageData.origins)} O · ${formatInt(generated.coverageData.destinations)} D</strong>
    <span>Base ${productState.coverage}% · ${generated.flows.length} fluxos</span>
  `;
}

function renderFlowsSummary() {
  const productState = state.productStatesById[state.selectedProductId];
  refs.flowsSummary.innerHTML = `
    <span class="flow-editor-summary-pill">${productState.generated.flows.length} itens</span>
    <span class="flow-editor-summary-pill">${state.mapMode === "selected" ? "mapa final" : "preview"}</span>
  `;
}

function renderFlowList() {
  const productState = state.productStatesById[state.selectedProductId];
  const flows = productState.generated.flows;
  if (!flows.length) {
    refs.flowsList.innerHTML = '<div class="truck-gallery-empty">Nenhum fluxo selecionado.</div>';
    return;
  }

  refs.flowsList.innerHTML = flows.map((flow) => `
    <button class="flow-editor-flow-item${flow.id === productState.selectedFlowId ? " is-active" : ""}" type="button" data-flow-id="${flow.id}">
      <div class="flow-editor-flow-top">
        <strong>${flow.origin.city.shortLabel} → ${flow.destination.city.shortLabel}</strong>
        <span class="flow-editor-flow-rank">#${flow.rank}</span>
      </div>
      <div class="flow-editor-flow-meta">
        <span>${formatPercent(flow.weight)}</span>
        <span>${formatInt(flow.representativeVolume)} t</span>
      </div>
    </button>
  `).join("");

  refs.flowsList.querySelectorAll("[data-flow-id]").forEach((button) => {
    button.addEventListener("click", () => {
      productState.selectedFlowId = button.dataset.flowId;
      renderMap();
      renderFlowList();
      renderDetail();
      persistState();
    });
  });
}

function renderDetail() {
  const productState = state.productStatesById[state.selectedProductId];
  const flow = productState.generated.flows.find((item) => item.id === productState.selectedFlowId) || productState.generated.flows[0];
  if (!flow) {
    refs.detail.innerHTML = '<div class="truck-gallery-empty">Selecione um fluxo.</div>';
    return;
  }

  refs.detail.innerHTML = `
    <div class="flow-editor-detail-grid">
      <div class="flow-editor-detail-metric">
        <span>Origem</span>
        <strong>${flow.origin.city.label}</strong>
      </div>
      <div class="flow-editor-detail-metric">
        <span>Destino</span>
        <strong>${flow.destination.city.label}</strong>
      </div>
      <div class="flow-editor-detail-metric">
        <span>Peso</span>
        <strong>${formatPercent(flow.weight)}</strong>
      </div>
      <div class="flow-editor-detail-metric">
        <span>Quantidade</span>
        <strong>${formatInt(flow.representativeVolume)} t</strong>
      </div>
      <div class="flow-editor-detail-metric">
        <span>Fluxo</span>
        <strong>#${flow.rank}</strong>
      </div>
    </div>
  `;
}

function renderModeButtons() {
  refs.modeToggle.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mapMode);
  });
}

function renderThemeToggle() {
  if (!refs.themeButton) {
    return;
  }
  const theme = document.documentElement.dataset.editorTheme === "night" ? "night" : "day";
  const nextThemeLabel = theme === "night" ? "Modo diurno" : "Modo noturno";
  const nextThemeIcon = theme === "night" ? "light_mode" : "dark_mode";
  refs.themeButton.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${nextThemeIcon}</span><span>${nextThemeLabel}</span>`;
}

function render() {
  renderHeader();
  renderProductsSummary();
  renderProductList();
  renderMapSummary();
  renderMapOverlay();
  renderMap();
  renderFunnel();
  renderGenerationNotes();
  renderFlowsSummary();
  renderFlowList();
  renderDetail();
  renderModeButtons();
  renderThemeToggle();
}

function updateCurrentProductDraft() {
  const productState = state.productStatesById[state.selectedProductId];
  productState.algorithm = refs.algorithm.value;
  productState.coverage = refs.coverage.value;
  productState.flowCount = Math.max(4, Math.min(48, Number(refs.flowCount.value || productState.flowCount || 4)));
  productState.quantityMode = refs.quantityMode.value;
}

function generateCurrentProduct() {
  updateCurrentProductDraft();
  generateForProduct(state.selectedProductId);
  render();
  persistState();
}

function generateAllProducts() {
  updateCurrentProductDraft();
  PRODUCT_LIBRARY.forEach((product) => generateForProduct(product.id));
  render();
  persistState();
}

function resetCurrentProduct() {
  const product = currentProduct();
  state.productStatesById[product.id] = defaultProductState(product);
  generateForProduct(product.id);
  syncControls();
  render();
  persistState();
}

function applyTheme(theme) {
  const nextTheme = theme === "night" ? "night" : "day";
  document.documentElement.dataset.editorTheme = nextTheme;
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch (_error) {
    // Persistencia opcional.
  }
  renderThemeToggle();
}

function bindEvents() {
  refs.productSearch.addEventListener("input", () => {
    state.searchTerm = refs.productSearch.value || "";
    renderProductList();
  });

  refs.algorithm.addEventListener("change", () => {
    updateCurrentProductDraft();
    render();
  });
  refs.coverage.addEventListener("change", () => {
    updateCurrentProductDraft();
    render();
  });
  refs.flowCount.addEventListener("input", () => {
    updateCurrentProductDraft();
    render();
  });
  refs.quantityMode.addEventListener("change", () => {
    updateCurrentProductDraft();
    render();
  });

  refs.generateTopButton.addEventListener("click", generateAllProducts);
  refs.generateSideButton.addEventListener("click", generateCurrentProduct);
  refs.resetButton.addEventListener("click", resetCurrentProduct);
  refs.saveButton.addEventListener("click", () => {
    updateCurrentProductDraft();
    persistState();
    render();
  });
  refs.themeButton.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.editorTheme === "night" ? "day" : "night");
  });

  refs.modeToggle.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mapMode = button.dataset.mode || "selected";
      render();
      persistState();
    });
  });
}

loadPersistedState();
syncControls();
bindEvents();
render();