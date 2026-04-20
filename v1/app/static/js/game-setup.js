import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  findPopulationBand,
  fitBrasixBounds,
  sortPopulationBands,
} from "./shared/leaflet-map.js";
import { escapeHtml, numberFormatter, roundNumber } from "./shared/formatters.js";
import { freightSpecializationBucketForProduct, freightValueClassBucket } from "./shared/freight-pricing-model.js?v=20260417-freight-model-1";
import { buildOpeningContextState } from "./shared/opening-pricing.js?v=20260413-opening-2";

const THEME_KEY = "brasix:v1:game-setup-theme";
const GAME_SESSION_SNAPSHOT_KEY = "brasix:v1:game-session-snapshot";
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

const DIFFICULTY_OPTIONS = {
  hard: "Dificil",
  standard: "Padrao",
  sandbox: "Sandbox",
};

const SIZE_TIER_ORDER = ["super_leve", "leve", "medio", "pesado", "super_pesado", "especial"];
const DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL = 1000000;
const RECOMMENDED_FREIGHT_LIMIT = 4;
const GAME_SETUP_TRUCK_ID_SEED = `${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

const state = {
  bootstrap: null,
  cities: [],
  citiesById: {},
  productsById: {},
  productOperationalById: {},
  trucks: [],
  trucksById: {},
  freightFlows: [],
  freightFlowsById: {},
  outboundFreightsByCityId: {},
  inboundFreightsByCityId: {},
  pricingDocument: {},
  defaultPricingDocument: {},
  dieselByCityId: {},
  averageDieselPrice: 0,
  selectedDifficulty: "standard",
  cityMarketStatsById: {},
  openingContextByCityId: {},
  openingPriceRange: { min: 0, max: 0 },
  productPriceReferenceMedian: 0,
  pricedFreightsCacheByCityId: {},
  populationBands: [],
  pinsById: {},
  company: {
    name: "Brasix",
    color: "#356d63",
    logoId: COMPANY_LOGO_OPTIONS[0].id,
    hqCityId: "",
    hqPurchased: false,
    fleetPurchased: false,
  },
  citySearch: "",
  selectedTruckInstances: [],
  selectedFreightAssignments: {},
  nextTruckDisplayNumber: 1,
  nextTruckGameSequence: 1,
  currentModal: "",
  map: null,
  markerLayer: null,
  markersByCityId: {},
  railsBound: false,
};

const refs = {
  headerBadges: document.getElementById("game-setup-header-badges"),
  themeToggle: document.getElementById("game-setup-theme-toggle"),
  difficultySelect: document.getElementById("game-setup-difficulty-select"),
  quickMetrics: document.getElementById("game-setup-quick-metrics"),
  companySummary: document.getElementById("game-setup-company-summary"),
  fleetSummary: document.getElementById("game-setup-fleet-summary"),
  freightSummary: document.getElementById("game-setup-freight-summary"),
  modalRoot: document.getElementById("game-setup-modal-root"),
  companyNameInput: document.getElementById("game-setup-company-name"),
  companyColorInput: document.getElementById("game-setup-company-color"),
  companyColorTextInput: document.getElementById("game-setup-company-color-text"),
  companyPreview: document.getElementById("game-setup-company-preview"),
  companyNextButton: document.getElementById("game-setup-company-next-button"),
  companyEconomy: document.getElementById("game-setup-company-economy"),
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

function formatCurrencyPerTon(value) {
  const numericValue = Number(value || 0);
  const digits = numericValue >= 10 ? 0 : 1;
  return `R$ ${numberFormat(digits).format(roundNumber(numericValue, 1))}/t`;
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDifficultyId(value) {
  return ["hard", "standard", "sandbox"].includes(String(value || "").trim())
    ? String(value || "").trim()
    : "standard";
}

function readGameSetupSnapshot() {
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

function buildGameSetupSnapshot() {
  const headquarters = currentHqCity();
  const capital = currentCapitalSnapshot();
  const selectedFreights = selectedFreightEntries().map((flow) => {
    const pricingEntry = pricedFreightEntryById(flow.id, state.company.hqCityId) || freightPricingForFlow(flow);
    const assignedTruckUnitId = selectedFreightAssignmentForFlow(flow.id);
    const assignedTruckUnit = selectedTruckUnitById(assignedTruckUnitId);
    return {
      flow_id: flow.id,
      truck_instance_id: assignedTruckUnitId,
      truck_id: String(assignedTruckUnit?.truck?.id || assignedTruckUnit?.truck_id || "").trim(),
      origin_id: String(flow.origin_id || "").trim(),
      destination_id: String(flow.destination_id || "").trim(),
      product_id: String(flow.product_id || "").trim(),
      product_name: String(flow.product_name || "").trim(),
      product_emoji: String(flow.product_emoji || "📦"),
      distance_km: Number(flow.distance_km || 0),
      quantity_t: Number(flow.quantity_t || 0),
      contract_payload_tons: Number(pricingEntry?.contractPayloadTons || 0),
      contract_revenue_brl: Number(pricingEntry?.contractRevenue || 0),
      unit_revenue_per_ton_brl: Number(pricingEntry?.unitRevenuePerTon || 0),
    };
  });

  return {
    version: 1,
    saved_at: new Date().toISOString(),
    difficulty: currentDifficultyId(),
    company: {
      name: String(state.company.name || "Brasix").trim() || "Brasix",
      color: String(state.company.color || "#356d63").trim() || "#356d63",
      logoId: String(state.company.logoId || COMPANY_LOGO_OPTIONS[0].id).trim() || COMPANY_LOGO_OPTIONS[0].id,
      hqCityId: String(state.company.hqCityId || "").trim(),
      hqPurchased: Boolean(state.company.hqPurchased),
      fleetPurchased: Boolean(state.company.fleetPurchased),
    },
    selectedTruckInstances: selectedTruckUnits().map((instance) => ({
      id: String(instance.id || "").trim(),
      display_number: Number(instance.display_number || 0),
      current_city_id: String(instance.current_city_id || state.company.hqCityId || "").trim(),
      truck_id: String(instance.truck?.id || instance.truck_id || "").trim(),
    })),
    selectedFreightAssignments: Object.fromEntries(
      Object.entries(state.selectedFreightAssignments || {})
        .map(([flowId, truckInstanceId]) => [String(flowId || "").trim(), String(truckInstanceId || "").trim()])
        .filter(([flowId, truckInstanceId]) => flowId && truckInstanceId),
    ),
    selectedFreights,
    economy: {
      initial_cash_brl: Number(capital.initialCash || 0),
      headquarters_cost_brl: Number(headquartersOpeningCost(headquarters) || 0),
      fleet_investment_brl: Number(selectedFleetInvestmentTotal() || 0),
      remaining_cash_brl: Number(remainingCapitalAfterSelections(headquarters) || 0),
      daily_fixed_cost_brl: selectedTruckEntries().reduce(
        (total, entry) => total + (Number(entry?.truck?.base_fixed_cost_brl_per_day || 0) * fleetEntryUnits(entry)),
        0,
      ),
    },
  };
}

function persistGameSetupSnapshot() {
  try {
    window.localStorage.setItem(GAME_SESSION_SNAPSHOT_KEY, JSON.stringify(buildGameSetupSnapshot()));
  } catch (_error) {
    // Persistencia opcional.
  }
}

function restoreGameSetupSnapshot() {
  const snapshot = readGameSetupSnapshot();
  if (!snapshot) {
    return;
  }

  const snapshotCompany = snapshot.company && typeof snapshot.company === "object" ? snapshot.company : {};
  const normalizedDifficulty = normalizeDifficultyId(snapshot.difficulty);
  const snapshotColor = /^#[0-9a-fA-F]{6}$/.test(String(snapshotCompany.color || "").trim())
    ? String(snapshotCompany.color || "").trim().toLowerCase()
    : state.company.color;
  const snapshotLogoId = COMPANY_LOGO_OPTIONS.some((option) => option.id === snapshotCompany.logoId)
    ? snapshotCompany.logoId
    : state.company.logoId;
  const snapshotHqCityId = state.citiesById[String(snapshotCompany.hqCityId || "").trim()]
    ? String(snapshotCompany.hqCityId || "").trim()
    : state.company.hqCityId;

  state.selectedDifficulty = normalizedDifficulty;
  state.company.name = String(snapshotCompany.name || state.company.name || "Brasix").trim() || "Brasix";
  state.company.color = snapshotColor;
  state.company.logoId = snapshotLogoId;
  state.company.hqCityId = snapshotHqCityId;
  state.company.hqPurchased = Boolean(snapshotCompany.hqPurchased && snapshotHqCityId);
  state.company.fleetPurchased = Boolean(snapshotCompany.fleetPurchased);

  const nextTruckInstances = (Array.isArray(snapshot.selectedTruckInstances) ? snapshot.selectedTruckInstances : [])
    .map((instance, index) => {
      const truckId = String(instance?.truck_id || "").trim();
      if (!truckId || !state.trucksById[truckId]) {
        return null;
      }
      const fallbackDisplayNumber = index + 1;
      const displayNumber = Number(instance?.display_number || 0) > 0
        ? Number(instance.display_number)
        : fallbackDisplayNumber;
      const truckInstanceId = String(instance?.id || "").trim() || buildTruckGameId();
      const currentCityId = state.citiesById[String(instance?.current_city_id || "").trim()]
        ? String(instance.current_city_id || "").trim()
        : snapshotHqCityId;
      return {
        id: truckInstanceId,
        display_number: displayNumber,
        current_city_id: String(currentCityId || snapshotHqCityId || "").trim(),
        truck_id: truckId,
      };
    })
    .filter(Boolean);

  state.selectedTruckInstances = nextTruckInstances;
  state.nextTruckDisplayNumber = nextTruckInstances.length
    ? Math.max(...nextTruckInstances.map((instance) => Number(instance.display_number || 0)), 0) + 1
    : 1;

  state.selectedFreightAssignments = Object.fromEntries(
    Object.entries(snapshot.selectedFreightAssignments || {})
      .map(([flowId, truckInstanceId]) => [String(flowId || "").trim(), String(truckInstanceId || "").trim()])
      .filter(([flowId, truckInstanceId]) => {
        if (!flowId || !truckInstanceId) {
          return false;
        }
        return Boolean(state.freightFlowsById[flowId] && nextTruckInstances.some((instance) => instance.id === truckInstanceId));
      }),
  );

  if (!state.selectedTruckInstances.length) {
    state.company.fleetPurchased = false;
  }
  pruneFreightSelection();
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

function headquartersIsPurchased() {
  return Boolean(state.company.hqPurchased && state.company.hqCityId);
}

function difficultyLabel(difficultyId = currentDifficultyId()) {
  return DIFFICULTY_OPTIONS[difficultyId] || DIFFICULTY_OPTIONS.standard;
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

function primaryImplementLabel(truck) {
  return (truck?.body_labels || []).find(Boolean) || truck?.axle_config || "Implemento base";
}

function outboundFreightsForCity(cityId) {
  const cached = state.outboundFreightsByCityId?.[cityId];
  if (Array.isArray(cached)) {
    return cached;
  }
  return state.freightFlows
    .filter((flow) => flow.origin_id === cityId && Number(flow.quantity_t || 0) > 0)
    .sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0));
}

function buildTruckGameId() {
  const nextSequence = Number(state.nextTruckGameSequence || 1);
  state.nextTruckGameSequence = nextSequence + 1;
  return `${GAME_SETUP_TRUCK_ID_SEED}${String(nextSequence).padStart(4, "0")}`;
}

function createSelectedTruckInstance(truckId) {
  const nextDisplayNumber = Number(state.nextTruckDisplayNumber || 1);
  state.nextTruckDisplayNumber = nextDisplayNumber + 1;
  return {
    id: buildTruckGameId(),
    display_number: nextDisplayNumber,
    current_city_id: String(state.company.hqCityId || "").trim(),
    truck_id: truckId,
  };
}

function selectedTruckUnits() {
  return (Array.isArray(state.selectedTruckInstances) ? state.selectedTruckInstances : [])
    .map((instance) => ({
      ...instance,
      truck: state.trucksById[String(instance?.truck_id || "")] || null,
    }))
    .filter((instance) => instance.truck)
    .sort((left, right) => Number(left.display_number || 0) - Number(right.display_number || 0));
}

function selectedTruckUnitById(instanceId) {
  const normalizedId = String(instanceId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return selectedTruckUnits().find((instance) => instance.id === normalizedId) || null;
}

function selectedTruckUnitsForType(truckId) {
  const normalizedTruckId = String(truckId || "").trim();
  if (!normalizedTruckId) {
    return [];
  }
  return selectedTruckUnits().filter((instance) => instance.truck.id === normalizedTruckId);
}

function selectedTruckQuantityByType(truckId) {
  return selectedTruckUnitsForType(truckId).length;
}

function truckUnitNumberLabel(instance) {
  return `#${formatInteger(instance?.display_number || 0)}`;
}

function truckUnitNumberList(instances) {
  return (Array.isArray(instances) ? instances : [])
    .map((instance) => truckUnitNumberLabel(instance))
    .join(" · ");
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

function selectedTruckEntries() {
  const entriesByTruckId = new Map();
  selectedTruckUnits().forEach((instance) => {
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

function selectedFreightAssignmentForFlow(flowId) {
  return String(state.selectedFreightAssignments?.[String(flowId || "").trim()] || "").trim();
}

function freightIsSelected(flowId) {
  return Boolean(selectedFreightAssignmentForFlow(flowId));
}

function selectedFreightEntries() {
  const supportedProductIds = selectedTruckSupportedProductIds();
  const allowed = new Set(
    outboundFreightsForCity(state.company.hqCityId)
      .filter((flow) => freightIsCompatible(flow, supportedProductIds))
      .map((flow) => flow.id),
  );
  return Object.keys(state.selectedFreightAssignments || {})
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
  const nextAssignments = {};
  Object.entries(state.selectedFreightAssignments || {}).forEach(([flowId, truckInstanceId]) => {
    if (!allowedIds.has(flowId)) {
      return;
    }
    const flow = state.freightFlowsById[flowId];
    if (!flow) {
      return;
    }
    const nextTruckInstance = preferredSelectedTruckUnitForFlow(flow, {
      preserveInstanceId: truckInstanceId,
      excludeFlowId: flowId,
    });
    if (nextTruckInstance) {
      nextAssignments[flowId] = nextTruckInstance.id;
    }
  });
  state.selectedFreightAssignments = nextAssignments;
  state.pricedFreightsCacheByCityId = {};
}

function normalizeColor(rawValue) {
  const source = String(rawValue || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(source)) {
    return source.toLowerCase();
  }
  return state.company.color;
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

function pricingNumber(path, fallback = 0) {
  const value = Number(
    getNestedValue(
      state.pricingDocument,
      path,
      getNestedValue(state.defaultPricingDocument, path, fallback),
    ),
  );
  return Number.isFinite(value) ? value : Number(fallback || 0);
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

function hasObjectContent(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function hasArrayContent(value) {
  return Array.isArray(value) && value.length > 0;
}

function setupBootstrapNeedsPricingFallback(payload) {
  return !hasObjectContent(payload?.pricing_document)
    || !hasObjectContent(payload?.default_pricing_document)
    || !hasArrayContent(payload?.diesel_document?.city_values)
    || !hasArrayContent(payload?.product_operational_catalog?.items);
}

function mergeSetupPayloadWithPricingFallback(setupPayload, pricingPayload) {
  if (!pricingPayload || typeof pricingPayload !== "object") {
    return setupPayload;
  }

  const nextPayload = {
    ...setupPayload,
    product_operational_catalog: hasObjectContent(setupPayload?.product_operational_catalog)
      ? setupPayload.product_operational_catalog
      : deepClone(pricingPayload?.product_operational_catalog || {}),
    diesel_document: hasObjectContent(setupPayload?.diesel_document)
      ? setupPayload.diesel_document
      : deepClone(pricingPayload?.diesel_document || {}),
    pricing_document: hasObjectContent(setupPayload?.pricing_document)
      ? setupPayload.pricing_document
      : deepClone(pricingPayload?.pricing_document || {}),
    default_pricing_document: hasObjectContent(setupPayload?.default_pricing_document)
      ? setupPayload.default_pricing_document
      : deepClone(pricingPayload?.default_pricing_document || {}),
  };

  if (!Array.isArray(nextPayload.products) || !nextPayload.products.length) {
    nextPayload.products = Array.isArray(pricingPayload?.products) ? deepClone(pricingPayload.products) : [];
  }

  return nextPayload;
}

function normalizeBootstrap(payload) {
  state.bootstrap = payload;
  state.defaultPricingDocument = ensurePricingCapitalDefaults(
    deepClone(payload?.default_pricing_document || payload?.pricing_document || {}),
  );
  state.pricingDocument = ensurePricingCapitalDefaults(
    deepClone(payload?.pricing_document || payload?.default_pricing_document || {}),
    state.defaultPricingDocument,
  );
  state.cities = Array.isArray(payload?.cities) ? payload.cities : [];
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  state.productsById = Object.fromEntries(((payload?.products) || []).map((product) => [product.id, product]));
  state.productOperationalById = buildOperationalIndex(payload?.product_operational_catalog?.items || []);
  state.trucks = (Array.isArray(payload?.trucks) ? payload.trucks : []).map((truck) => ({
    ...truck,
    supported_product_ids: supportedProductIdsForTruck(truck),
  }));
  state.trucksById = Object.fromEntries(state.trucks.map((truck) => [truck.id, truck]));
  state.freightFlows = Array.isArray(payload?.freight_flows) ? payload.freight_flows : [];
  state.freightFlowsById = Object.fromEntries(state.freightFlows.map((flow) => [flow.id, flow]));
  state.dieselByCityId = Object.fromEntries(
    ((payload?.diesel_document?.city_values) || []).map((row) => [row.city_id, Number(row.final_value || 0)]),
  );
  const dieselValues = Object.values(state.dieselByCityId).filter((value) => Number(value) > 0);
  state.averageDieselPrice = dieselValues.length
    ? dieselValues.reduce((total, value) => total + Number(value), 0) / dieselValues.length
    : 0;
  state.selectedDifficulty = "standard";
  const rawBands = Array.isArray(payload?.map_editor?.population_bands)
    ? payload.map_editor.population_bands
    : payload?.map_editor?.population_bands?.bands || [];
  state.populationBands = sortPopulationBands(rawBands);
  state.pinsById = Object.fromEntries(((payload?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]));
  state.company.hqCityId = preferredStartupCityId();
  state.company.hqPurchased = false;
  state.company.fleetPurchased = false;
  state.company.name = "Brasix";
  buildCityStats();
  buildProductPriceReferenceStats();
  rebuildOpeningContextCache();
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

function populationBandLabel(band) {
  return String(band?.label || "Faixa nao definida");
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

  Object.values(outboundByCityId).forEach((flows) => flows.sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0)));
  Object.values(inboundByCityId).forEach((flows) => flows.sort((left, right) => Number(right.quantity_t || 0) - Number(left.quantity_t || 0)));

  state.cityMarketStatsById = nextStats;
  state.outboundFreightsByCityId = outboundByCityId;
  state.inboundFreightsByCityId = inboundByCityId;
  state.pricedFreightsCacheByCityId = {};
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

function currentDifficultyId() {
  const difficultyId = String(state.selectedDifficulty || "standard").trim();
  return ["hard", "standard", "sandbox"].includes(difficultyId) ? difficultyId : "standard";
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

function logisticsSpecializationKey(flow) {
  const product = freightProductRecord(flow);
  return freightSpecializationBucketForProduct(product);
}

function specializationMultiplier(flow) {
  const key = logisticsSpecializationKey(flow);
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
  const product = freightProductRecord(flow);
  let multiplier = 1;
  const valueClassBucket = freightValueClassBucket(product?.value_class);
  if (valueClassBucket === "medium") {
    multiplier *= pricingNumber("freight.value_class_medium_multiplier", 1.05);
  }
  if (valueClassBucket === "high") {
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
  return 1 + (shortShare * pricingNumber("freight.short_haul_markup_max", 0.18)) - (longShare * pricingNumber("freight.long_haul_discount_max", 0.12));
}

function weightedDieselFactor(flow) {
  if (!state.averageDieselPrice) {
    return 1;
  }
  const originWeight = pricingNumber("freight.diesel_origin_weight", 0.7);
  const destinationWeight = pricingNumber("freight.diesel_destination_weight", 0.3);
  const totalWeight = Math.max(originWeight + destinationWeight, 0.0001);
  const originDiesel = Number(state.dieselByCityId[flow.origin_id] || state.averageDieselPrice);
  const destinationDiesel = Number(state.dieselByCityId[flow.destination_id] || state.averageDieselPrice);
  const weighted = ((originDiesel * originWeight) + (destinationDiesel * destinationWeight)) / totalWeight;
  return Math.max(0.75, Math.min(1.35, weighted / state.averageDieselPrice));
}

function compatibleTrucksForFlow(flow) {
  return state.trucks.filter((truck) => (truck.supported_product_ids || []).includes(flow.product_id));
}

function truckPayloadTons(truck) {
  return Math.max(0, Number(truck?.payload_weight_kg || 0) / 1000);
}

function assignedFreightCountByTruckUnitId(excludeFlowId = "") {
  const nextCounts = {};
  const validTruckUnitIds = new Set(selectedTruckUnits().map((instance) => instance.id));
  Object.entries(state.selectedFreightAssignments || {}).forEach(([flowId, truckInstanceId]) => {
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

function assignedTruckUnitIdSet(excludeFlowId = "") {
  return new Set(Object.keys(assignedFreightCountByTruckUnitId(excludeFlowId)));
}

function truckUnitIsAtFlowOrigin(instance, flow) {
  const truckCityId = String(instance?.current_city_id || state.company.hqCityId || "").trim();
  const originCityId = String(flow?.origin_id || "").trim();
  return Boolean(truckCityId && originCityId && truckCityId === originCityId);
}

function selectedCompatibleTruckUnitsForFlow(flow, options = {}) {
  const productId = String(flow?.product_id || "").trim();
  if (!productId) {
    return [];
  }
  const preserveInstanceId = String(options?.preserveInstanceId || "").trim();
  const excludeFlowId = String(options?.excludeFlowId || "").trim();
  const assignedTruckUnitIds = assignedTruckUnitIdSet(excludeFlowId);
  return selectedTruckUnits().filter((instance) => {
    if (!supportedProductIdsForTruck(instance.truck).includes(productId)) {
      return false;
    }
    if (!truckUnitIsAtFlowOrigin(instance, flow)) {
      return false;
    }
    if (instance.id === preserveInstanceId) {
      return true;
    }
    return !assignedTruckUnitIds.has(instance.id);
  });
}

function preferredSelectedTruckUnitForFlow(flow, options = {}) {
  const preserveInstanceId = String(options?.preserveInstanceId || "").trim();
  const excludeFlowId = String(options?.excludeFlowId || "").trim();
  const assignmentCounts = assignedFreightCountByTruckUnitId(excludeFlowId);
  const candidates = selectedCompatibleTruckUnitsForFlow(flow, { preserveInstanceId, excludeFlowId })
    .sort((left, right) => truckPayloadTons(right.truck) - truckPayloadTons(left.truck)
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

function operationCostForTruck(truck, flow) {
  const payloadT = truckPayloadTons(truck);
  if (!(payloadT > 0)) {
    return null;
  }
  const quantityT = Math.max(0.1, flowQuantityTons(flow));
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
  const originBonus = flow.origin_id === state.company.hqCityId ? pricingNumber("freight.hq_origin_bonus", 0.06) : 0;
  const destinationBonus = flow.destination_id === state.company.hqCityId ? pricingNumber("freight.hq_destination_bonus", 0.03) : 0;
  return Math.min(pricingNumber("freight.hq_bonus_cap", 0.08), originBonus + destinationBonus);
}

function freightPricingForFlow(flow) {
  const operation = bestOperationForFlow(flow);
  const distanceFactor = distanceMultiplier(flow);
  const specializationFactor = specializationMultiplier(flow);
  const productFactor = productSurchargeMultiplier(flow);
  const quantityT = flowQuantityTons(flow);
  const distanceKm = Number(flow.distance_km || 0);
  const marketPrice = quantityT * distanceKm * pricingNumber("freight.base_rate_brl_per_tkm", 0.34) * distanceFactor * specializationFactor * productFactor;
  const floorPrice = operation ? operation.totalCost * pricingNumber("freight.floor_margin_multiplier", 1.12) : 0;
  const contractPrice = Math.max(floorPrice, marketPrice);
  const hqBonus = hqBonusForFlow(flow);
  const playerRevenue = contractPrice * (1 + hqBonus);
  const unitRevenuePerTon = quantityT > 0 ? playerRevenue / quantityT : 0;
  const assignedTruckInstanceId = selectedFreightAssignmentForFlow(flow.id);
  const contractTruckUnit = preferredSelectedTruckUnitForFlow(flow, {
    preserveInstanceId: assignedTruckInstanceId,
    excludeFlowId: flow.id,
  });
  const contractTruck = contractTruckUnit?.truck || null;
  const contractPayloadTons = contractTruck ? Math.min(quantityT, truckPayloadTons(contractTruck)) : 0;
  const contractRevenue = unitRevenuePerTon * contractPayloadTons;
  return {
    flow,
    operation,
    marketPrice,
    floorPrice,
    contractPrice,
    hqBonus,
    playerRevenue,
    unitRevenuePerTon,
    contractTruckUnit,
    contractTruck,
    contractTruckNumber: Number(contractTruckUnit?.display_number || 0),
    contractPayloadTons,
    contractRevenue,
    referencePayloadTons: contractPayloadTons,
    referenceTripRevenue: contractRevenue,
  };
}

function pricedFreightsForCity(cityId) {
  const nextCityId = String(cityId || "").trim();
  if (!nextCityId) {
    return [];
  }
  if (!state.pricedFreightsCacheByCityId[nextCityId]) {
    const hasSelectedFleet = selectedTruckEntries().length > 0;
    state.pricedFreightsCacheByCityId[nextCityId] = outboundFreightsForCity(nextCityId)
      .map((flow) => freightPricingForFlow(flow))
      .sort((left, right) => {
        const leftPrimary = hasSelectedFleet ? Number(left.contractRevenue || 0) : Number(left.unitRevenuePerTon || 0);
        const rightPrimary = hasSelectedFleet ? Number(right.contractRevenue || 0) : Number(right.unitRevenuePerTon || 0);
        return rightPrimary - leftPrimary
          || Number(right.unitRevenuePerTon || 0) - Number(left.unitRevenuePerTon || 0)
          || flowQuantityTons(right.flow) - flowQuantityTons(left.flow);
      });
  }
  return state.pricedFreightsCacheByCityId[nextCityId];
}

function pricedFreightEntryById(flowId, cityId = state.company.hqCityId) {
  return pricedFreightsForCity(cityId).find((entry) => entry.flow.id === flowId) || null;
}

function cheapestTruckForTier(tier) {
  const tierIndex = SIZE_TIER_ORDER.indexOf(tier);
  const exact = state.trucks
    .filter((truck) => truck.size_tier === tier)
    .sort((left, right) => Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0));
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
    ["leve", "medio"]
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

function fleetPayloadForEntries(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((total, entry) => total + (Number(entry?.truck?.payload_weight_kg || 0) * fleetEntryUnits(entry)), 0);
}

function currentCapitalSnapshot(difficultyId = currentDifficultyId()) {
  const starterFleet = globalCapitalStarterFleetBlueprint();
  const fleetEntries = starterFleet.fleetEntries;
  const fleetInvestment = fleetInvestmentForEntries(fleetEntries);
  const dailyFixedCost = fleetEntries.reduce((total, entry) => total + (Number(entry.truck.base_fixed_cost_brl_per_day || 0) * fleetEntryUnits(entry)), 0);
  const baseInitialCash = pricingNumber("capital.base_initial_cash_brl", DEFAULT_CAPITAL_BASE_INITIAL_CASH_BRL);
  const reserveDays = pricingNumber("capital.reserve_days", 20);
  const reserveCost = reserveDays * dailyFixedCost;
  const bufferCost = pricingNumber("capital.buffer_percent", 0.08) * fleetInvestment;
  const workingCapitalBase = baseInitialCash + reserveCost + bufferCost;
  const liquidityFactor = {
    hard: pricingNumber("capital.hard_liquidity_factor", 0.65),
    standard: pricingNumber("capital.standard_liquidity_factor", 1),
    sandbox: pricingNumber("capital.sandbox_liquidity_factor", 1.6),
  }[difficultyId] || 0;
  return {
    difficultyId,
    fleetEntries,
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

function headquartersOpeningCost(city = currentHqCity()) {
  return Number(openingContextForCity(city)?.openingPrice || 0);
}

function balanceAfterHeadquarters(city = currentHqCity()) {
  return Number(currentCapitalSnapshot().initialCash || 0) - headquartersOpeningCost(city);
}

function availableFleetBudget(city = currentHqCity()) {
  return Math.max(0, balanceAfterHeadquarters(city));
}

function selectedFleetInvestmentTotal() {
  return fleetInvestmentForEntries(selectedTruckEntries());
}

function remainingCapitalAfterSelections(city = currentHqCity()) {
  return balanceAfterHeadquarters(city) - selectedFleetInvestmentTotal();
}

function purchaseHeadquarters() {
  const city = currentHqCity();
  if (!city || balanceAfterHeadquarters(city) < 0) {
    return;
  }
  state.company.hqPurchased = true;
  renderAll();
}

function purchaseSelectedTrucks() {
  if (!selectedTruckEntries().length) {
    return;
  }
  state.company.fleetPurchased = true;
  renderAll();
  closeModal();
}

function referenceSupportedProductIds() {
  const selected = selectedTruckSupportedProductIds();
  if (selected.size) {
    return selected;
  }
  const recommended = new Set();
  starterFleetBlueprintForCity(currentHqCity()).fleetEntries.forEach((entry) => {
    supportedProductIdsForTruck(entry.truck).forEach((productId) => recommended.add(productId));
  });
  return recommended;
}

function recommendedPricedFreights(limit = RECOMMENDED_FREIGHT_LIMIT) {
  const supportedProductIds = referenceSupportedProductIds();
  const hasSelectedFleet = selectedTruckEntries().length > 0;
  return pricedFreightsForCity(state.company.hqCityId)
    .filter((entry) => !supportedProductIds.size || supportedProductIds.has(entry.flow.product_id))
    .filter((entry) => !hasSelectedFleet || Boolean(entry.contractTruckUnit))
    .slice(0, limit);
}

function selectedPricedFreightEntries() {
  return selectedFreightEntries()
    .map((flow) => pricedFreightEntryById(flow.id, state.company.hqCityId) || freightPricingForFlow(flow))
    .filter(Boolean);
}

function recommendationReasonsText(entry) {
  if (!Array.isArray(entry?.reasons) || !entry.reasons.length) {
    return "Base sugerida";
  }
  return entry.reasons
    .map((reason) => `${reason.layerLabel}: ${reason.productName}`)
    .join(" · ");
}

function canAddTruckUnit(truckId) {
  const truck = state.trucksById[truckId];
  if (!truck) {
    return false;
  }
  return (selectedFleetInvestmentTotal() + Number(truck.purchase_price_brl || 0)) <= (availableFleetBudget() + 0.0001);
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
  const purchased = headquartersIsPurchased();
  refs.companyMapStatus.innerHTML = city
    ? `
      <span>${escapeHtml(purchased ? "Sede comprada" : "Sede selecionada")}</span>
      <strong>${escapeHtml(city.label)}</strong>
    `
    : `
      <span>Sede</span>
      <strong>Selecione no mapa</strong>
    `;
}

function markerForCity(city, selected = false) {
  const band = findPopulationBand(city, state.populationBands);
  const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]] || null;
  const baseMarkerSize = Math.max(8, Number(band?.marker_size_px || 16));
  const currentPrice = openingContextForCity(city)?.openingPrice || 0;
  const ratio = normalizeRange(currentPrice, state.openingPriceRange.min, state.openingPriceRange.max);
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
    selectedHaloStrokeColor: selected ? state.company.color : fillColor,
    selected,
    opacity: selected ? 1 : 0.78,
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
    const opening = openingContextForCity(city);
    marker.bindTooltip(`<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(populationBandLabel(opening?.band))} · ${escapeHtml(formatCurrency(opening?.openingPrice || 0))}`, {
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
  const previousCityId = state.company.hqCityId;
  state.company.hqCityId = nextCityId;
  if (nextCityId !== previousCityId) {
    state.company.hqPurchased = false;
    state.company.fleetPurchased = false;
    state.selectedTruckInstances = state.selectedTruckInstances.map((instance) => ({
      ...instance,
      current_city_id: nextCityId,
    }));
    pruneFreightSelection();
  }
  renderAll();
}

function companyBadgeMarkup() {
  const logo = currentLogoOption();
  const city = currentHqCity();
  const statusLabel = headquartersIsPurchased()
    ? "Sede comprada"
    : city
      ? "Compra pendente"
      : "Sede indefinida";
  return `
    <div class="game-setup-company-badge" style="--company-color:${escapeHtml(state.company.color)}">
      <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(logo.icon)}</span>
      <div>
        <strong>${escapeHtml(state.company.name || "Brasix")}</strong>
        <small>${escapeHtml(city ? `${city.label} · ${statusLabel}` : statusLabel)}</small>
      </div>
    </div>
  `;
}

function renderHeaderBadges() {
  if (!refs.headerBadges) {
    return;
  }
  const city = currentHqCity();
  const capital = currentCapitalSnapshot();
  const openingCost = headquartersOpeningCost(city);
  const balanceAfterHq = balanceAfterHeadquarters(city);
  const badges = [
    { label: "Dificuldade", value: difficultyLabel() },
    { label: "Sede", value: city?.label || "Sem sede" },
    { label: "Capital total", value: formatCurrency(capital.initialCash) },
    { label: "Custo sede", value: formatCurrency(openingCost) },
    { label: "Saldo apos sede", value: formatCurrency(balanceAfterHq) },
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
  if (refs.difficultySelect) {
    refs.difficultySelect.value = currentDifficultyId();
  }
  const capital = currentCapitalSnapshot();
  const city = currentHqCity();
  const openingCost = headquartersOpeningCost(city);
  const trucksInvestment = selectedFleetInvestmentTotal();
  const balanceAfterTrucks = remainingCapitalAfterSelections(city);
  const metrics = [
    { label: "Capital inicial", value: formatCurrency(capital.initialCash) },
    { label: "Sede", value: formatCurrency(openingCost) },
    { label: "Caminhoes", value: formatCurrency(trucksInvestment) },
    { label: "Saldo", value: formatCurrency(balanceAfterTrucks) },
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
  const capital = currentCapitalSnapshot();
  const openingCost = headquartersOpeningCost(city);
  const balanceAfterHq = balanceAfterHeadquarters(city);
  const recommendedFleet = starterFleetBlueprintForCity(city);
  const recommendedFreights = recommendedPricedFreights(3);
  const recommendedFleetInvestment = fleetInvestmentForEntries(recommendedFleet.fleetEntries);
  const recommendedFreightRate = Number(recommendedFreights[0]?.unitRevenuePerTon || 0);
  const headquartersStatus = headquartersIsPurchased() ? "Comprada" : "Pendente";
  refs.companySummary.innerHTML = `
    ${companyBadgeMarkup()}
    <div class="game-setup-summary-metrics">
      <article>
        <span>Capital total</span>
        <strong>${escapeHtml(formatCurrency(capital.initialCash))}</strong>
      </article>
      <article>
        <span>Custo sede</span>
        <strong>${escapeHtml(formatCurrency(openingCost))}</strong>
      </article>
      <article>
        <span>Saldo apos sede</span>
        <strong class="${balanceAfterHq >= 0 ? "game-setup-balance-positive" : "game-setup-balance-negative"}">${escapeHtml(formatCurrency(balanceAfterHq))}</strong>
      </article>
      <article>
        <span>Status sede</span>
        <strong>${escapeHtml(headquartersStatus)}</strong>
      </article>
    </div>
    <div class="game-setup-selection-list">
      <article class="game-setup-selection-line">
        <strong>Dificuldade</strong>
        <span>${escapeHtml(difficultyLabel())}</span>
      </article>
      <article class="game-setup-selection-line">
        <strong>Frota recomendada</strong>
        <span>${escapeHtml(`${formatInteger(recommendedFleet.fleetEntries.length)} modelos · ${formatCurrency(recommendedFleetInvestment)}`)}</span>
      </article>
      <article class="game-setup-selection-line">
        <strong>Fretes recomendados</strong>
        <span>${escapeHtml(`${formatInteger(recommendedFreights.length)} contratos · ${recommendedFreightRate > 0 ? formatCurrencyPerTon(recommendedFreightRate) : "-"}`)}</span>
      </article>
      <article class="game-setup-selection-line">
        <strong>Populacao</strong>
        <span>${escapeHtml(city ? formatPopulation(city.population_thousands) : "-")}</span>
      </article>
    </div>
  `;
}

function renderFleetSummary() {
  if (!refs.fleetSummary) {
    return;
  }
  const city = currentHqCity();
  const entries = selectedTruckEntries();
  const recommended = starterFleetBlueprintForCity(city);
  const totalUnits = entries.reduce((total, entry) => total + entry.quantity, 0);
  const totalInvestment = selectedFleetInvestmentTotal();
  const totalPayload = fleetPayloadForEntries(entries);
  const recommendedInvestment = fleetInvestmentForEntries(recommended.fleetEntries);
  const recommendedPayload = fleetPayloadForEntries(recommended.fleetEntries);
  const remainingCapital = remainingCapitalAfterSelections(city);
  refs.fleetSummary.innerHTML = `
    <div class="game-setup-summary-metrics">
      <article>
        <span>Orcamento frota</span>
        <strong>${escapeHtml(formatCurrency(availableFleetBudget(city)))}</strong>
      </article>
      <article>
        <span>${entries.length ? "Investimento atual" : "Investimento recomendado"}</span>
        <strong>${escapeHtml(formatCurrency(entries.length ? totalInvestment : recommendedInvestment))}</strong>
      </article>
      <article>
        <span>${entries.length ? "Capacidade atual" : "Capacidade sugerida"}</span>
        <strong>${escapeHtml(formatWeightKg(entries.length ? totalPayload : recommendedPayload))}</strong>
      </article>
      <article>
        <span>Saldo livre</span>
        <strong class="${remainingCapital >= 0 ? "game-setup-balance-positive" : "game-setup-balance-negative"}">${escapeHtml(formatCurrency(remainingCapital))}</strong>
      </article>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head">
        <span class="eyebrow">Recomendado</span>
        <strong>${escapeHtml(`${formatInteger(recommended.fleetEntries.length)} modelos`)}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${recommended.fleetEntries.length
          ? recommended.fleetEntries.slice(0, 3).map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.truck.short_label)}</strong>
              <span>${escapeHtml(`${formatInteger(fleetEntryUnits(entry))} un · ${formatCurrency(entry.truck.purchase_price_brl)}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nao foi possivel sugerir uma frota inicial para esta sede.</div>`}
      </div>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head game-setup-section-head-highlight">
        <span class="eyebrow">Selecionado</span>
        <strong>${escapeHtml(entries.length ? `${formatInteger(totalUnits)} un` : "Sem frota")}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${entries.length
          ? entries.slice(0, 4).map((entry) => `
            <article class="game-setup-selection-line game-setup-selection-line-highlight">
              <strong>${escapeHtml(entry.truck.short_label)}</strong>
              <span>${escapeHtml(`${truckUnitNumberList(entry.instances)} · ${formatInteger(entry.quantity)} un · ${formatCurrency(entry.truck.purchase_price_brl)}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum caminhao selecionado ainda.</div>`}
      </div>
    </div>
  `;
}

function renderFreightSummary() {
  if (!refs.freightSummary) {
    return;
  }
  const city = currentHqCity();
  const available = pricedFreightsForCity(state.company.hqCityId);
  const selected = selectedPricedFreightEntries();
  const recommended = recommendedPricedFreights(3);
  const hasSelectedFleet = selectedTruckEntries().length > 0;
  if (!available.length) {
    refs.freightSummary.innerHTML = `<div class="truck-gallery-empty">A cidade-sede atual nao possui fretes de saida com volume positivo.</div>`;
    return;
  }
  const totalTonnes = selected.reduce((total, entry) => total + Number(entry.contractPayloadTons || 0), 0);
  const totalRevenue = selected.reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
  const recommendedRevenue = recommended.reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
  const bestFreight = available[0] || null;
  refs.freightSummary.innerHTML = `
    <div class="game-setup-summary-metrics">
      <article>
        <span>Melhor taxa</span>
        <strong>${escapeHtml(bestFreight ? formatCurrencyPerTon(bestFreight.unitRevenuePerTon) : "-")}</strong>
      </article>
      <article>
        <span>${escapeHtml(hasSelectedFleet ? "Top 3 viagens" : "Top 3 rotas")}</span>
        <strong>${escapeHtml(hasSelectedFleet ? formatCurrency(recommendedRevenue) : (recommended[0] ? formatCurrencyPerTon(recommended[0].unitRevenuePerTon) : "-"))}</strong>
      </article>
      <article>
        <span>Selecionados</span>
        <strong>${escapeHtml(`${formatInteger(selected.length)} / ${formatTonnes(totalTonnes)}`)}</strong>
      </article>
      <article>
        <span>Receita carteira</span>
        <strong>${escapeHtml(formatCurrency(totalRevenue))}</strong>
      </article>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head">
        <span class="eyebrow">Recomendado</span>
        <strong>${escapeHtml(city?.label || "-")}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${recommended.length
          ? recommended.map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.flow.product_name)}</strong>
              <span>${escapeHtml(`${formatCurrencyPerTon(entry.unitRevenuePerTon)} · ${entry.flow.origin_label} -> ${entry.flow.destination_label}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum frete recomendado para a combinacao atual de sede e frota.</div>`}
      </div>
    </div>
    <div class="game-setup-section-block">
      <div class="game-setup-section-head game-setup-section-head-highlight">
        <span class="eyebrow">Selecionado</span>
        <strong>${escapeHtml(selected.length ? `${formatInteger(selected.length)} contratos` : "Sem contratos")}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${selected.length
          ? selected.slice(0, 4).map((entry) => `
            <article class="game-setup-selection-line game-setup-selection-line-highlight">
              <strong>${escapeHtml(entry.flow.product_name)}</strong>
              <span>${escapeHtml(`${formatCurrency(entry.contractRevenue)} · ${entry.contractTruckUnit ? `${truckUnitNumberLabel(entry.contractTruckUnit)} · ` : ""}${entry.contractTruck?.short_label || entry.contractTruck?.label || "-"} · ${formatTonnes(entry.contractPayloadTons)}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum frete marcado ainda.</div>`}
      </div>
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

function renderCompanyEconomyPanel() {
  if (!refs.companyEconomy) {
    return;
  }
  const city = currentHqCity();
  const capital = currentCapitalSnapshot();
  const openingCost = headquartersOpeningCost(city);
  const balanceAfterHq = balanceAfterHeadquarters(city);
  const canPurchase = Boolean(city) && balanceAfterHq >= 0;
  const purchased = headquartersIsPurchased();

  refs.companyEconomy.innerHTML = `
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
          <span>${escapeHtml(purchased ? "A sede desta abertura ja foi confirmada." : canPurchase ? `Depois da compra, sobram ${formatCurrency(balanceAfterHq)} para a operacao.` : "Escolha outra cidade ou aumente o capital inicial." )}</span>
        </div>
        <button class="editor-header-action game-setup-company-purchase-button${purchased ? " is-purchased" : ""}" type="button" data-purchase-hq="true"${canPurchase && !purchased ? "" : " disabled"}>
          <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(purchased ? "check_circle" : "apartment")}</span>
          <span>${escapeHtml(purchased ? "Sede comprada" : "Comprar sede")}</span>
        </button>
      </div>
    </section>
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
  const recommendedFleet = starterFleetBlueprintForCity(currentHqCity());
  const recommendedByTruckId = Object.fromEntries(recommendedFleet.fleetEntries.map((entry) => [entry.truck.id, entry]));
  const sortedTrucks = [...state.trucks].sort((left, right) => {
    const leftQuantity = selectedTruckQuantityByType(left.id);
    const rightQuantity = selectedTruckQuantityByType(right.id);
    const leftRecommended = recommendedByTruckId[left.id] ? 1 : 0;
    const rightRecommended = recommendedByTruckId[right.id] ? 1 : 0;
    const leftAffordable = canAddTruckUnit(left.id) ? 1 : 0;
    const rightAffordable = canAddTruckUnit(right.id) ? 1 : 0;
    return rightQuantity - leftQuantity
      || rightRecommended - leftRecommended
      || rightAffordable - leftAffordable
      || Number(left.purchase_price_brl || 0) - Number(right.purchase_price_brl || 0)
      || String(left.label || "").localeCompare(String(right.label || ""), "pt-BR");
  });

  refs.truckRail.innerHTML = sortedTrucks.length
    ? sortedTrucks.map((truck) => {
      const selectedInstances = selectedTruckUnitsForType(truck.id);
      const quantity = selectedInstances.length;
      const recommendedEntry = recommendedByTruckId[truck.id] || null;
      const canAdd = canAddTruckUnit(truck.id);
      const nextBalance = remainingCapitalAfterSelections() - Number(truck.purchase_price_brl || 0);
      const imageUrl = versionedAssetUrl(truck.preview_image_url_path, truck.preview_image_version);
      const implementLabel = primaryImplementLabel(truck);
      const implementPrice = Number(truck.implement_cost_brl || 0) > 0 ? formatCurrency(truck.implement_cost_brl) : "-";
      const productEmojiMarkup = truckProductEmojiMarkup(truck);
      const truckSubtitle = [
        slugLabel(truck.size_tier, SIZE_TIER_LABELS),
        String(truck.axle_config || "").trim(),
      ].filter(Boolean).join(" · ").toLocaleUpperCase("pt-BR");
      const recommendationBadge = recommendedEntry
        ? (recommendedEntry.reasons.length
          ? recommendedEntry.reasons.map((reason) => reason.layerLabel).join(" + ")
          : "Recomendado")
        : "";
      const truckBadges = [
        recommendationBadge ? `<span class="game-setup-pill is-recommended">${escapeHtml(recommendationBadge)}</span>` : "",
        !canAdd && quantity === 0 ? `<span class="game-setup-pill is-blocked">Sem Caixa</span>` : "",
      ].filter(Boolean).join("");
      const truckInstanceMarkup = quantity
        ? `<div class="game-setup-instance-strip">${truckUnitPillsMarkup(selectedInstances, 5)}</div>`
        : "";
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
              <span class="game-setup-box-kicker">${escapeHtml(implementLabel)}</span>
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
            <button class="game-setup-stepper-button game-setup-stepper-button-vivid" type="button" data-truck-change="-1" data-truck-id="${escapeHtml(truck.id)}">
              <span class="material-symbols-outlined" aria-hidden="true">remove</span>
            </button>
            <strong>${escapeHtml(formatInteger(quantity))}</strong>
            <button class="game-setup-stepper-button game-setup-stepper-button-vivid" type="button" data-truck-change="1" data-truck-id="${escapeHtml(truck.id)}"${canAdd ? "" : " disabled"}>
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nenhum caminhao disponivel no catalogo ativo.</div>`;

  if (refs.truckRailMeta) {
    refs.truckRailMeta.textContent = `${formatInteger(sortedTrucks.length)} modelos · orcamento ${formatCurrency(availableFleetBudget())}`;
  }
  bindWheelRail(refs.truckRail);
  updateRailPerspective(refs.truckRail);
}

function renderTruckSelectionSummary() {
  if (!refs.truckSelection) {
    return;
  }
  const city = currentHqCity();
  const entries = selectedTruckEntries();
  const recommended = starterFleetBlueprintForCity(city);
  const totalUnits = entries.reduce((total, entry) => total + entry.quantity, 0);
  const totalInvestment = selectedFleetInvestmentTotal();
  const totalVolume = entries.reduce((total, entry) => total + ((entry.truck.cargo_volume_m3 || 0) * entry.quantity), 0);
  const remainingCapital = remainingCapitalAfterSelections(city);
  const canPurchaseFleet = entries.length > 0;
  const fleetPurchased = Boolean(state.company.fleetPurchased && canPurchaseFleet);
  refs.truckSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">Frota inicial</span>
      <h3>${escapeHtml(entries.length ? `${formatInteger(totalUnits)} caminhoes selecionados` : "Monte a frota de partida")}</h3>
    </div>

    <div class="game-setup-summary-metrics game-setup-summary-metrics-compact">
      <article>
        <span>Capital</span>
        <strong>${escapeHtml(formatCurrency(currentCapitalSnapshot().initialCash))}</strong>
      </article>
      <article>
        <span>Sede</span>
        <strong>${escapeHtml(formatCurrency(headquartersOpeningCost(city)))}</strong>
      </article>
      <article>
        <span>Investimento</span>
        <strong>${escapeHtml(formatCurrency(totalInvestment))}</strong>
      </article>
      <article>
        <span>Saldo</span>
        <strong class="${remainingCapital >= 0 ? "game-setup-balance-positive" : "game-setup-balance-negative"}">${escapeHtml(formatCurrency(remainingCapital))}</strong>
      </article>
    </div>

    <div class="game-setup-section-block">
      <div class="game-setup-section-head">
        <span class="eyebrow">Recomendado</span>
        <strong>${escapeHtml(`${formatInteger(recommended.fleetEntries.length)} modelos · ${formatCurrency(fleetInvestmentForEntries(recommended.fleetEntries))}`)}</strong>
      </div>
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
      <div class="game-setup-section-head">
        <span class="eyebrow">Selecionado</span>
        <strong>${escapeHtml(entries.length ? `${formatVolumeM3(totalVolume)} totais` : "Sem frota")}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${entries.length
          ? entries.map((entry) => `
            <article class="game-setup-selection-line game-setup-selection-line-editable">
              <div class="game-setup-selection-line-stack">
                <strong>${escapeHtml(entry.truck.short_label)}</strong>
                <span>${escapeHtml(truckUnitNumberList(entry.instances))}</span>
              </div>
              <div class="game-setup-quantity-inline">
                <button class="game-setup-stepper-button game-setup-stepper-button-vivid game-setup-quantity-button" type="button" data-truck-change="-1" data-truck-id="${escapeHtml(entry.truck.id)}">
                  <span class="material-symbols-outlined" aria-hidden="true">remove</span>
                </button>
                <span>${escapeHtml(`${formatInteger(entry.quantity)} un`)}</span>
                <button class="game-setup-stepper-button game-setup-stepper-button-vivid game-setup-quantity-button" type="button" data-truck-change="1" data-truck-id="${escapeHtml(entry.truck.id)}"${canAddTruckUnit(entry.truck.id) ? "" : " disabled"}>
                  <span class="material-symbols-outlined" aria-hidden="true">add</span>
                </button>
              </div>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">A frota inicial ainda esta vazia. Use os botoes + nos cartoes para adicionar unidades.</div>`}
      </div>
    </div>

    <div class="game-setup-modal-actions game-setup-inline-actions">
      <button class="editor-header-action game-setup-company-purchase-button game-setup-truck-purchase-button${fleetPurchased ? " is-purchased" : ""}" type="button" data-purchase-trucks="true"${canPurchaseFleet && !fleetPurchased ? "" : " disabled"}>
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(fleetPurchased ? "check_circle" : "local_shipping")}</span>
        <span>${escapeHtml(fleetPurchased ? "Caminhoes comprados" : "Comprar caminhoes")}</span>
      </button>
    </div>
  `;
}

function renderFreightRail() {
  if (!refs.freightRail) {
    return;
  }
  const city = currentHqCity();
  const pricedEntries = pricedFreightsForCity(state.company.hqCityId);
  const supportedProductIds = selectedTruckSupportedProductIds();
  const referenceProductIds = referenceSupportedProductIds();
  const hasSelectedFleet = selectedTruckEntries().length > 0;
  const recommendedIds = new Set(recommendedPricedFreights(RECOMMENDED_FREIGHT_LIMIT).map((entry) => entry.flow.id));
  const compatibleCount = pricedEntries.filter((entry) => (hasSelectedFleet ? Boolean(entry.contractTruckUnit) : referenceProductIds.has(entry.flow.product_id))).length;
  refs.freightRail.innerHTML = pricedEntries.length
    ? pricedEntries.map((entry) => {
      const flow = entry.flow;
      const selected = freightIsSelected(flow.id);
      const hasProductCompatibleTruck = freightIsCompatible(flow, supportedProductIds);
      const hasAvailableTruckAtOrigin = Boolean(entry.contractTruckUnit);
      const compatible = hasSelectedFleet ? hasAvailableTruckAtOrigin : false;
      const suggestedForReferenceFleet = referenceProductIds.has(flow.product_id);
      const contractTruckLabel = entry.contractTruck?.short_label || entry.contractTruck?.label || "-";
      const contractTruckUnitLabel = entry.contractTruckUnit
        ? `${truckUnitNumberLabel(entry.contractTruckUnit)} · ${contractTruckLabel}`
        : contractTruckLabel;
      const contractSummary = entry.contractTruck
        ? `1 viagem: ${formatCurrency(entry.contractRevenue)} · ${contractTruckUnitLabel} · ${formatTonnes(entry.contractPayloadTons)}`
        : hasSelectedFleet
          ? "Sem caminhao livre na origem para calcular o contrato"
          : "Escolha um caminhao compativel para calcular o contrato";
      const compatibilityMessage = compatible
        ? "Caminhao livre na origem"
        : hasSelectedFleet
          ? hasProductCompatibleTruck
            ? "Sem caminhao livre na origem"
            : "Inativo para a frota atual"
          : suggestedForReferenceFleet
            ? "Compativel com a frota sugerida"
            : "Escolha uma frota compativel";
      const blockedReason = !hasSelectedFleet
        ? ""
        : hasProductCompatibleTruck
          ? "Sem caminhao livre"
          : "Sem compatibilidade";
      return `
        <article class="game-setup-rail-card game-setup-freight-card${selected ? " is-selected" : ""}${compatible || (!hasSelectedFleet && suggestedForReferenceFleet) ? "" : " is-disabled"}" data-rail-card="true" style="--freight-color:${escapeHtml(flow.product_color || state.company.color)}">
          <div class="game-setup-rail-badges">
            ${recommendedIds.has(flow.id) ? `<span class="game-setup-pill is-recommended">Top recomendado</span>` : ""}
            ${selected && entry.contractTruckUnit ? `<span class="game-setup-pill is-instance" title="${escapeHtml(`Caminhao ${truckUnitNumberLabel(entry.contractTruckUnit)} · ID ${entry.contractTruckUnit.id}`)}">${escapeHtml(truckUnitNumberLabel(entry.contractTruckUnit))}</span>` : ""}
            ${!compatible && hasSelectedFleet ? `<span class="game-setup-pill is-blocked">${escapeHtml(blockedReason)}</span>` : ""}
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
            <article>
              <span>Distancia</span>
              <strong>${escapeHtml(formatDistanceKm(flow.distance_km))}</strong>
            </article>
            <article>
              <span>Taxa</span>
              <strong>${escapeHtml(formatCurrencyPerTon(entry.unitRevenuePerTon))}</strong>
            </article>
          </div>

          <p class="game-setup-compatibility-note${compatible || (!hasSelectedFleet && suggestedForReferenceFleet) ? " is-active" : ""}">${escapeHtml(`${compatibilityMessage} · ${contractSummary}`)}</p>

          <button class="editor-header-action game-setup-freight-toggle" type="button" data-toggle-freight="${escapeHtml(flow.id)}"${compatible ? "" : " disabled"}>
            <span class="material-symbols-outlined" aria-hidden="true">${selected ? "check_circle" : compatible ? "add_circle" : "block"}</span>
            <span>${selected ? `Selecionado em ${entry.contractTruckUnit ? truckUnitNumberLabel(entry.contractTruckUnit) : "frota"}` : compatible ? "Contratar" : hasSelectedFleet ? "Sem frota compativel" : "Escolha a frota"}</span>
          </button>
        </article>
      `;
    }).join("")
    : `<div class="truck-gallery-empty">Nao ha fretes de saida ativos para ${escapeHtml(city?.label || "a cidade atual")}.</div>`;

  if (refs.freightRailMeta) {
    const potentialRevenue = recommendedPricedFreights(3).reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
    refs.freightRailMeta.textContent = hasSelectedFleet
      ? `${formatInteger(pricedEntries.length)} fretes · ${formatInteger(compatibleCount)} aderentes · ${formatCurrency(potentialRevenue)} top 3`
      : `${formatInteger(pricedEntries.length)} fretes · ${formatInteger(compatibleCount)} aderentes · ${pricedEntries[0] ? formatCurrencyPerTon(pricedEntries[0].unitRevenuePerTon) : "-"} melhor taxa`;
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
  const city = currentHqCity();
  const entries = selectedPricedFreightEntries();
  const recommended = recommendedPricedFreights(4);
  const totalTonnes = entries.reduce((total, entry) => total + Number(entry.contractPayloadTons || 0), 0);
  const averageDistance = entries.length
    ? entries.reduce((total, entry) => total + Number(entry.flow.distance_km || 0), 0) / entries.length
    : 0;
  const totalRevenue = entries.reduce((total, entry) => total + Number(entry.contractRevenue || 0), 0);
  refs.freightSelection.innerHTML = `
    <div class="game-setup-selector-head">
      <span class="eyebrow">Carteira</span>
      <h3>${escapeHtml(entries.length ? `${formatInteger(entries.length)} contratos selecionados` : `Fretes de ${city?.label || "sede indefinida"}`)}</h3>
    </div>

    <div class="game-setup-summary-metrics">
      <article>
        <span>Melhor taxa</span>
        <strong>${escapeHtml(recommended[0] ? formatCurrencyPerTon(recommended[0].unitRevenuePerTon) : "-")}</strong>
      </article>
      <article>
        <span>Receita carteira</span>
        <strong>${escapeHtml(formatCurrency(totalRevenue))}</strong>
      </article>
      <article>
        <span>Carga por viagens</span>
        <strong>${escapeHtml(formatTonnes(totalTonnes))}</strong>
      </article>
      <article>
        <span>Distancia media</span>
        <strong>${escapeHtml(entries.length ? formatDistanceKm(averageDistance) : "-")}</strong>
      </article>
    </div>

    <div class="game-setup-section-block">
      <div class="game-setup-section-head">
        <span class="eyebrow">Recomendado</span>
        <strong>${escapeHtml(`${formatInteger(recommended.length)} contratos`)}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${recommended.length
          ? recommended.map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.flow.product_name)}</strong>
              <span>${escapeHtml(`${formatCurrencyPerTon(entry.unitRevenuePerTon)} · ${entry.flow.origin_label} -> ${entry.flow.destination_label}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum frete recomendado para a sede atual.</div>`}
      </div>
    </div>

    <div class="game-setup-section-block">
      <div class="game-setup-section-head">
        <span class="eyebrow">Selecionado</span>
        <strong>${escapeHtml(entries.length ? `${formatInteger(entries.length)} contratos` : "Sem contratos")}</strong>
      </div>
      <div class="game-setup-selection-list">
        ${entries.length
          ? entries.map((entry) => `
            <article class="game-setup-selection-line">
              <strong>${escapeHtml(entry.flow.product_name)}</strong>
              <span>${escapeHtml(`${formatCurrency(entry.contractRevenue)} · ${entry.contractTruckUnit ? `${truckUnitNumberLabel(entry.contractTruckUnit)} · ` : ""}${entry.contractTruck?.short_label || entry.contractTruck?.label || "-"} · ${formatTonnes(entry.contractPayloadTons)}`)}</span>
            </article>
          `).join("")
          : `<div class="truck-gallery-empty">Nenhum contrato selecionado ainda para ${escapeHtml(city?.label || "a sede atual")}.</div>`}
      </div>
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
  renderCompanyEconomyPanel();
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
  state.pricedFreightsCacheByCityId = {};
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
  if (headquartersIsPurchased() && balanceAfterHeadquarters(currentHqCity()) < 0) {
    state.company.hqPurchased = false;
  }
  if (refs.difficultySelect) {
    refs.difficultySelect.value = currentDifficultyId();
  }
  renderHeaderBadges();
  renderQuickMetrics();
  renderCompanySummary();
  renderFleetSummary();
  renderFreightSummary();
  renderCompanyModal();
  renderFleetModal();
  renderFreightModal();
  persistGameSetupSnapshot();
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
  if (Number(delta || 0) > 0 && !canAddTruckUnit(truckId)) {
    return;
  }
  state.company.fleetPurchased = false;
  const normalizedTruckId = String(truckId || "").trim();
  const normalizedDelta = Number(delta || 0);
  if (!normalizedTruckId || !state.trucksById[normalizedTruckId] || !normalizedDelta) {
    return;
  }
  if (normalizedDelta > 0) {
    for (let index = 0; index < normalizedDelta; index += 1) {
      state.selectedTruckInstances.push(createSelectedTruckInstance(normalizedTruckId));
    }
  } else {
    const removableInstances = selectedTruckUnitsForType(normalizedTruckId)
      .sort((left, right) => Number(right.display_number || 0) - Number(left.display_number || 0));
    for (let index = 0; index < Math.abs(normalizedDelta); index += 1) {
      const removable = removableInstances[index];
      if (!removable) {
        break;
      }
      state.selectedTruckInstances = state.selectedTruckInstances.filter((instance) => instance.id !== removable.id);
    }
  }
  state.pricedFreightsCacheByCityId = {};
  pruneFreightSelection();
  renderAll();
}

function toggleFreightSelection(flowId) {
  const flow = state.freightFlowsById[flowId];
  if (!flow || !freightIsCompatible(flow)) {
    return;
  }
  if (freightIsSelected(flowId)) {
    delete state.selectedFreightAssignments[flowId];
  } else {
    const assignedTruckUnit = preferredSelectedTruckUnitForFlow(flow, { excludeFlowId: flowId });
    if (!assignedTruckUnit) {
      return;
    }
    state.selectedFreightAssignments[flowId] = assignedTruckUnit.id;
  }
  state.pricedFreightsCacheByCityId = {};
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

  const purchaseButton = target.closest("[data-purchase-hq]");
  if (purchaseButton) {
    purchaseHeadquarters();
    return;
  }

  const purchaseTrucksButton = target.closest("[data-purchase-trucks]");
  if (purchaseTrucksButton) {
    purchaseSelectedTrucks();
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

  if (target === refs.difficultySelect && target instanceof HTMLSelectElement) {
    state.selectedDifficulty = ["hard", "standard", "sandbox"].includes(target.value) ? target.value : "standard";
    state.company.hqPurchased = false;
    state.company.fleetPurchased = false;
    renderAll();
    return;
  }

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target === refs.companyNameInput) {
    state.company.name = target.value.trim() || "Brasix";
    renderHeaderBadges();
    renderCompanySummary();
    renderCompanyPreview();
    persistGameSetupSnapshot();
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
  let bootstrapPayload = payload;
  if (setupBootstrapNeedsPricingFallback(bootstrapPayload)) {
    console.warn("Brasix game setup bootstrap missing pricing data; loading fallback payload.");
    const pricingPayload = await fetchJson("/api/editor/precos/bootstrap").catch(() => null);
    bootstrapPayload = mergeSetupPayloadWithPricingFallback(bootstrapPayload, pricingPayload);
  }
  normalizeBootstrap(bootstrapPayload);
  if (setupBootstrapNeedsMarketFallback()) {
    mergeCityMarketData(cityPayload);
  }
  mergeTruckCompatibility(matrixPayload);
  restoreGameSetupSnapshot();
  bindEvents();
  renderAll();
}

initialize().catch((error) => {
  console.error("Brasix game setup initialization failed:", error);
  throw error;
});