import { escapeHtml } from "./shared/formatters.js";

const LAYOUT_KEY = "brasix:v1:truck-operations-layout";
const THEME_KEY = "brasix:v1:truck-operations-theme";

const ENUM_LABELS = {
  size_tier: {
    super_leve: "Super-leve",
    leve: "Leve",
    medio: "Medio",
    pesado: "Pesado",
    super_pesado: "Super-pesado",
  },
  base_vehicle_kind: {
    rigido: "Rigido",
    cavalo: "Cavalo",
    combinacao: "Combinacao",
    especial: "Especial",
  },
};

const TRUCK_SIZE_TIER_SORT_ORDER = Object.freeze({
  super_leve: 0,
  leve: 1,
  medio: 2,
  pesado: 3,
  super_pesado: 4,
});

const CATEGORY_GROUP_CONFIG = {
  size_tier: { catalogKey: "size_tiers", filterKey: "sizeTier" },
  base_vehicle_kind: { catalogKey: "base_vehicle_kinds", filterKey: "vehicleKind" },
  axle_config: { catalogKey: "axle_configs", filterKey: "axleConfig" },
  canonical_body_type_id: { catalogKey: "types", filterKey: "bodyId" },
};

const ENERGY_OPTIONS = [
  { id: "", label: "-" },
  { id: "diesel", label: "Diesel" },
  { id: "electric", label: "Elétrico" },
  { id: "gas", label: "Gás" },
  { id: "hybrid", label: "Híbrido" },
  { id: "other", label: "Outro" },
];

const CONSUMPTION_UNIT_OPTIONS = [
  { id: "", label: "-" },
  { id: "l_per_km", label: "L/km" },
  { id: "kwh_per_km", label: "kWh/km" },
  { id: "m3_per_km", label: "m3/km" },
  { id: "kg_per_km", label: "kg/km" },
];

const URBAN_ACCESS_LABELS = {
  urban_free: "Livre no urbano",
  urban_preferred: "Preferido no urbano",
  urban_limited: "Limitado no urbano",
  urban_restricted: "Restrito no urbano",
  urban_prohibited: "Proibido no urbano",
};

const ROAD_ACCESS_LABELS = {
  standard_network: "Rede padrão",
  heavy_network: "Rede pesada",
  articulated_network: "Rede articulada",
  offroad_network: "Rede fora de estrada",
};

const CONFIDENCE_OPTIONS = [
  { id: "", label: "-" },
  { id: "low", label: "Baixa" },
  { id: "medium", label: "Média" },
  { id: "high", label: "Alta" },
];

const COMPLETENESS_FIELDS = [
  "payload_weight_kg",
  "cargo_volume_m3",
  "overall_length_m",
  "overall_width_m",
  "overall_height_m",
  "energy_source",
  "consumption_unit",
  "empty_consumption_per_km",
  "loaded_consumption_per_km",
  "base_fixed_cost_brl_per_day",
  "base_variable_cost_brl_per_km",
  "urban_access_level",
  "road_access_level",
  "supported_surface_codes",
  "load_time_minutes",
  "unload_time_minutes",
];

const state = {
  bootstrap: null,
  screen: null,
  themesDocument: null,
  themesById: {},
  activeThemeId: null,
  types: [],
  typesById: {},
  bodiesById: {},
  families: [],
  familiesById: {},
  familyIdsByTypeId: {},
  assetRegistry: null,
  assetRegistryByTypeId: {},
  operationalCatalog: null,
  operationalByTypeId: {},
  mpcProducts: [],
  relatedProductsByTypeId: {},
  mpcSummaryByTypeId: {},
  routeSurfaceTypes: [],
  routeSurfaceByCode: {},
  categoryCatalog: null,
  selectedTypeId: "",
  activeTab: "technical",
  draftByTypeId: {},
  filters: {
    search: "",
    sizeTier: "",
    vehicleKind: "",
    axleConfig: "",
    bodyId: "",
    brandFamilyId: "",
  },
  controlsBound: false,
  pendingSaveTypeId: null,
  pendingProductTypeId: null,
  pendingAutofillTypeId: null,
  autofillPollTimerId: null,
  autofillPollTypeId: "",
  productPickerOpenTypeId: "",
  transientStatus: null,
  previewBoundsByUrl: {},
};

function loadBootstrap() {
  return fetch("/api/viewer/truck-operations/bootstrap").then((response) => response.json());
}

function callJson(url, options) {
  return fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || payload.message || `Falha HTTP ${response.status}.`);
    }
    return payload;
  });
}

function currentTheme() {
  const defaultId = state.themesDocument?.default_theme_id;
  return state.themesById[state.activeThemeId] || state.themesById[defaultId] || Object.values(state.themesById)[0] || null;
}

function labels() {
  return state.screen?.labels || {};
}

function slugLabel(rawValue) {
  const source = String(rawValue || "").trim();
  if (!source) {
    return "-";
  }
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enumLabel(group, rawValue) {
  const source = String(rawValue || "").trim();
  if (!source) {
    return "-";
  }
  const groupConfig = CATEGORY_GROUP_CONFIG[group];
  if (groupConfig && state.categoryCatalog) {
    const item = (state.categoryCatalog[groupConfig.catalogKey] || []).find((entry) => String(entry.id || "").trim() === source);
    if (item?.label) {
      return item.label;
    }
  }
  return ENUM_LABELS[group]?.[source] || slugLabel(source);
}

function truckTierRank(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  return TRUCK_SIZE_TIER_SORT_ORDER[normalized] ?? Object.keys(TRUCK_SIZE_TIER_SORT_ORDER).length;
}

function truckSortLabel(type) {
  return String(type?.label || type?.short_label || type?.id || "").trim().toLowerCase();
}

function compareTruckTypesCanonical(left, right) {
  const leftTierRank = truckTierRank(left?.size_tier);
  const rightTierRank = truckTierRank(right?.size_tier);
  if (leftTierRank !== rightTierRank) {
    return leftTierRank - rightTierRank;
  }
  const leftLabel = truckSortLabel(left);
  const rightLabel = truckSortLabel(right);
  if (leftLabel !== rightLabel) {
    return leftLabel.localeCompare(rightLabel, "pt-BR");
  }
  return String(left?.id || "").localeCompare(String(right?.id || ""), "pt-BR");
}

function applyCssVariables(source) {
  Object.entries(source || {}).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
}

function parseCssPx(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(String(raw).trim().replace("px", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setCssPx(name, value) {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
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
  if (!state.activeThemeId) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_KEY, state.activeThemeId);
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
  applyCssVariables(state.bootstrap.ui.design_tokens.css_variables || {});
  applyCssVariables(state.bootstrap.truck_gallery.layout_desktop.css_variables || {});
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
  renderHeader();
  renderList();
}

function restoreLayout() {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Number.isFinite(stored.left_col_px)) {
        setCssPx("--truck-left-col", stored.left_col_px);
      }
      if (Number.isFinite(stored.right_col_px)) {
        setCssPx("--truck-right-col", stored.right_col_px);
      }
    }
  } catch (_error) {
    // Optional persistence.
  }
  normalizeLayout();
}

function normalizeLayout() {
  const grid = document.getElementById("truck-operations-grid");
  if (!grid) {
    return;
  }
  const gridWidth = grid.getBoundingClientRect().width;
  const resizerWidth = parseCssPx("--truck-resizer-width", 10);
  const gap = parseCssPx("--truck-panel-gap", 12) * 4;
  const minSide = parseCssPx("--truck-side-min-col", 280);
  const minCenter = parseCssPx("--truck-center-min-col", 640);
  let left = parseCssPx("--truck-left-col", 320);
  let right = parseCssPx("--truck-right-col", 420);
  const sideBudget = Math.max(minSide * 2, gridWidth - (resizerWidth * 2) - gap - minCenter);
  left = Math.min(Math.max(left, minSide), Math.max(minSide, sideBudget - minSide));
  right = Math.min(Math.max(right, minSide), Math.max(minSide, sideBudget - left));
  left = Math.min(Math.max(left, minSide), Math.max(minSide, sideBudget - right));
  setCssPx("--truck-left-col", left);
  setCssPx("--truck-right-col", right);
}

function persistLayout() {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      left_col_px: parseCssPx("--truck-left-col", 320),
      right_col_px: parseCssPx("--truck-right-col", 420),
    }));
  } catch (_error) {
    // Optional persistence.
  }
}

function buildDerivedData() {
  state.screen = state.bootstrap.truck_gallery.screen;
  state.themesDocument = state.bootstrap.truck_gallery.themes;
  state.themesById = Object.fromEntries((state.themesDocument?.themes || []).map((theme) => [theme.id, theme]));
  state.types = [...(state.bootstrap.truck_type_catalog.types || [])];
  state.typesById = Object.fromEntries(state.types.map((item) => [item.id, item]));
  state.bodiesById = Object.fromEntries((state.bootstrap.truck_body_catalog.types || []).map((item) => [item.id, item]));
  state.families = [...(state.bootstrap.truck_brand_family_catalog.families || [])];
  state.familiesById = Object.fromEntries(state.families.map((item) => [item.id, item]));
  state.assetRegistry = state.bootstrap.truck_image_asset_registry || { items: [] };
  state.assetRegistryByTypeId = Object.fromEntries((state.assetRegistry.items || []).map((item) => [item.truck_type_id, item]));
  state.categoryCatalog = state.bootstrap.truck_category_catalog || {};
  state.operationalCatalog = state.bootstrap.truck_operational_catalog || { items: [] };
  state.operationalByTypeId = Object.fromEntries((state.operationalCatalog.items || []).map((item) => [item.truck_type_id, item]));
  state.mpcProducts = [...(state.bootstrap.mpc_products || [])];
  state.relatedProductsByTypeId = { ...(state.bootstrap.mpc_related_products_by_truck_type_id || {}) };
  state.mpcSummaryByTypeId = { ...(state.bootstrap.mpc_summary_by_truck_type_id || {}) };
  state.routeSurfaceTypes = [...(state.bootstrap.route_surface_types?.types || [])];
  state.routeSurfaceByCode = Object.fromEntries(state.routeSurfaceTypes.map((item) => [item.code, item]));
  state.familyIdsByTypeId = {};
  state.families.forEach((family) => {
    (family.canonical_type_ids || []).forEach((typeId) => {
      if (!state.familyIdsByTypeId[typeId]) {
        state.familyIdsByTypeId[typeId] = [];
      }
      state.familyIdsByTypeId[typeId].push(family.id);
    });
  });
}

function familiesForType(typeId) {
  return (state.familyIdsByTypeId[typeId] || []).map((familyId) => state.familiesById[familyId]).filter(Boolean);
}

function assetEntry(typeId) {
  return state.assetRegistryByTypeId[typeId] || null;
}

function typeHasApprovedImage(typeId) {
  const entry = assetEntry(typeId);
  return Boolean(entry?.status === "approved" && entry?.approved_image_url_path);
}

function latestPendingCustomTypeId() {
  const pendingCustomTypes = state.types
    .filter((type) => Boolean(type?.is_custom) && !typeHasApprovedImage(type.id))
    .sort((left, right) => Number(right?.order || 0) - Number(left?.order || 0) || compareTruckTypesCanonical(left, right));
  return pendingCustomTypes[0]?.id || "";
}

function sortTruckTypesForViewer(types) {
  const pinnedTypeId = latestPendingCustomTypeId();
  return [...types].sort((left, right) => {
    const leftPinned = left?.id === pinnedTypeId;
    const rightPinned = right?.id === pinnedTypeId;
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }
    return compareTruckTypesCanonical(left, right);
  });
}

function preferredBodyId(type) {
  return String(type.preferred_body_type_id || type.canonical_body_type_ids?.[0] || "").trim();
}

function compatibleBodies(type) {
  return (type.canonical_body_type_ids || []).map((bodyId) => state.bodiesById[bodyId]).filter(Boolean);
}

function compatibleBodySummary(type) {
  const bodyLabels = compatibleBodies(type).map((body) => body.label).filter(Boolean);
  if (!bodyLabels.length) {
    return "-";
  }
  if (bodyLabels.length <= 2) {
    return bodyLabels.join(" / ");
  }
  return `${bodyLabels.slice(0, 2).join(" / ")} +${bodyLabels.length - 2}`;
}

function orderedUniqueValues(values) {
  const seen = new Set();
  const items = [];
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    items.push(normalized);
  });
  return items;
}

function categoryOptions(group) {
  if (group === "canonical_body_type_id") {
    return [...Object.values(state.bodiesById)]
      .sort((left, right) => left.order - right.order)
      .map((item) => ({ id: item.id, label: item.label }));
  }
  const config = CATEGORY_GROUP_CONFIG[group];
  const valuesFromTypes = orderedUniqueValues(state.types.map((item) => item[group]));
  const catalogItems = (state.categoryCatalog?.[config?.catalogKey] || []).map((item) => ({
    id: String(item.id || "").trim(),
    label: String(item.label || "").trim(),
  }));
  const merged = [];
  const seen = new Set();
  [...valuesFromTypes.map((value) => ({ id: value, label: enumLabel(group, value) })), ...catalogItems].forEach((item) => {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    merged.push({ id, label: String(item.label || enumLabel(group, id)).trim() || enumLabel(group, id) });
  });
  return merged;
}

function typeMatchesFilters(type) {
  const search = state.filters.search.trim().toLowerCase();
  const bodyLabels = (type.canonical_body_type_ids || []).map((bodyId) => state.bodiesById[bodyId]?.label || "").join(" ").toLowerCase();
  const familyLabels = familiesForType(type.id).map((family) => family.label).join(" ").toLowerCase();
  const haystack = [type.label, type.short_label, type.axle_config, type.base_vehicle_kind, bodyLabels, familyLabels].join(" ").toLowerCase();

  if (search && !haystack.includes(search)) {
    return false;
  }
  if (state.filters.sizeTier && type.size_tier !== state.filters.sizeTier) {
    return false;
  }
  if (state.filters.vehicleKind && type.base_vehicle_kind !== state.filters.vehicleKind) {
    return false;
  }
  if (state.filters.axleConfig && type.axle_config !== state.filters.axleConfig) {
    return false;
  }
  if (state.filters.bodyId && !(type.canonical_body_type_ids || []).includes(state.filters.bodyId)) {
    return false;
  }
  if (state.filters.brandFamilyId && !familiesForType(type.id).some((family) => family.id === state.filters.brandFamilyId)) {
    return false;
  }
  return true;
}

function filteredTypes() {
  return sortTruckTypesForViewer(state.types.filter(typeMatchesFilters));
}

function ensureSelection() {
  const visible = filteredTypes();
  if (!visible.length) {
    state.selectedTypeId = "";
    return;
  }
  if (!visible.some((type) => type.id === state.selectedTypeId)) {
    state.selectedTypeId = visible[0].id;
  }
}

function versionedAssetUrl(url, versionToken) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    return "";
  }
  const token = String(versionToken || "").trim();
  if (!token) {
    return rawUrl;
  }
  const joiner = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${joiner}v=${encodeURIComponent(token)}`;
}

function previewUrlForEntry(entry) {
  if (!entry) {
    return "";
  }
  if (entry.candidate_image_url_path && ["generated", "rejected", "failed"].includes(entry.status)) {
    return versionedAssetUrl(entry.candidate_image_url_path, entry.generated_at || entry.updated_at || "");
  }
  return versionedAssetUrl(
    entry.approved_image_url_path || entry.candidate_image_url_path || "",
    entry.approved_at || entry.generated_at || entry.updated_at || "",
  );
}

function statusLabel(entry) {
  if (!entry) {
    return labels().missing_asset_label || "Sem imagem aprovada ainda.";
  }
  const map = {
    approved: labels().approved_status_label || "Aprovado",
    generated: labels().generated_status_label || "Aguardando revisao",
    rejected: labels().rejected_status_label || "Rejeitado",
    failed: labels().failed_status_label || "Falhou",
    skipped: labels().skipped_status_label || "Dry-run",
  };
  return map[entry.status] || entry.status;
}

function statusTone(entry) {
  if (!entry) {
    return "neutral";
  }
  return entry.status;
}

function previewPlaceholderMarkup(type, entry, variant) {
  const sizeClass = variant === "detail" ? "is-detail" : "is-card";
  return `
    <div class="truck-gallery-image-placeholder ${sizeClass}">
      <div class="truck-gallery-image-placeholder-mark">
        <span class="material-symbols-outlined">image</span>
      </div>
      <strong>${escapeHtml(type.label)}</strong>
      <span>${escapeHtml(statusLabel(entry))}</span>
    </div>
  `;
}

function previewMarkup(type, entry, variant) {
  const previewUrl = previewUrlForEntry(entry);
  if (!previewUrl) {
    return previewPlaceholderMarkup(type, entry, variant);
  }
  return `<canvas class="truck-gallery-generated-canvas ${variant === "detail" ? "is-detail" : "is-card"}" data-preview-url="${escapeHtml(previewUrl)}" aria-label="${escapeHtml(type.label)}"></canvas>`;
}

function schedulePreviewHydration() {
  window.requestAnimationFrame(() => {
    hydratePreviewCanvases();
  });
}

function alphaBoundsForImage(url, image) {
  if (state.previewBoundsByUrl[url]) {
    return state.previewBoundsByUrl[url];
  }
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[((y * width) + x) * 4 + 3];
      if (alpha <= 4) {
        continue;
      }
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) {
    return null;
  }
  const bounds = {
    left,
    top,
    width: (right - left) + 1,
    height: (bottom - top) + 1,
  };
  state.previewBoundsByUrl[url] = bounds;
  return bounds;
}

function drawPreviewCanvas(canvas, image, bounds) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  const padX = Math.round(canvas.width * 0.02);
  const padY = Math.round(canvas.height * 0.05);
  const scale = Math.min(
    (canvas.width - (padX * 2)) / Math.max(bounds.width, 1),
    (canvas.height - (padY * 2)) / Math.max(bounds.height, 1),
  );
  const drawWidth = Math.max(1, Math.round(bounds.width * scale));
  const drawHeight = Math.max(1, Math.round(bounds.height * scale));
  const drawX = Math.round((canvas.width - drawWidth) / 2);
  const drawY = Math.round((canvas.height - drawHeight) / 2);
  context.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);
}

function hydratePreviewCanvases() {
  Array.from(document.querySelectorAll(".truck-gallery-generated-canvas[data-preview-url]")).forEach((canvas) => {
    const url = String(canvas.dataset.previewUrl || "");
    if (!url) {
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const bounds = alphaBoundsForImage(url, image) || {
        left: 0,
        top: 0,
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      };
      drawPreviewCanvas(canvas, image, bounds);
    };
    image.src = url;
  });
}

window.addEventListener("resize", () => {
  window.requestAnimationFrame(() => {
    hydratePreviewCanvases();
  });
});

function selectedType() {
  return state.typesById[state.selectedTypeId] || null;
}

function buildOperationalDraft(type, operationalRecord) {
  const record = operationalRecord || {};
  return {
    truck_type_id: type.id,
    payload_weight_kg: record.payload_weight_kg ?? "",
    cargo_volume_m3: record.cargo_volume_m3 ?? "",
    overall_length_m: record.overall_length_m ?? "",
    overall_width_m: record.overall_width_m ?? "",
    overall_height_m: record.overall_height_m ?? "",
    energy_source: String(record.energy_source || ""),
    consumption_unit: String(record.consumption_unit || ""),
    empty_consumption_per_km: record.empty_consumption_per_km ?? "",
    loaded_consumption_per_km: record.loaded_consumption_per_km ?? "",
    truck_price_brl: record.truck_price_brl ?? "",
    base_fixed_cost_brl_per_day: record.base_fixed_cost_brl_per_day ?? "",
    base_variable_cost_brl_per_km: record.base_variable_cost_brl_per_km ?? "",
    implement_cost_brl: record.implement_cost_brl ?? "",
    urban_access_level: String(record.urban_access_level || ""),
    road_access_level: String(record.road_access_level || ""),
    supported_surface_codes: [...(record.supported_surface_codes || [])],
    load_time_minutes: record.load_time_minutes ?? "",
    unload_time_minutes: record.unload_time_minutes ?? "",
    confidence: String(record.confidence || ""),
    research_basis: String(record.research_basis || ""),
    source_urls_text: (record.source_urls || []).join("\n"),
    notes: String(record.notes || ""),
  };
}

function operationalDraft(typeId) {
  if (!state.draftByTypeId[typeId]) {
    const type = state.typesById[typeId];
    if (!type) {
      return null;
    }
    state.draftByTypeId[typeId] = buildOperationalDraft(type, state.operationalByTypeId[typeId]);
  }
  return state.draftByTypeId[typeId];
}

function resetOperationalDraft(typeId) {
  delete state.draftByTypeId[typeId];
}

function hasOperationalRecord(typeId) {
  return Boolean(state.operationalByTypeId[typeId]);
}

function completionCount(draft) {
  return COMPLETENESS_FIELDS.reduce((count, field) => {
    const value = draft?.[field];
    if (Array.isArray(value)) {
      return count + (value.length ? 1 : 0);
    }
    return count + (String(value ?? "").trim() ? 1 : 0);
  }, 0);
}

function completionPct(draft) {
  return Math.round((completionCount(draft) / COMPLETENESS_FIELDS.length) * 100);
}

function formatInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("pt-BR").format(number) : "0";
}

function formatDecimal(value, fractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(number);
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(number);
}

function toOptionalNumber(rawValue) {
  const source = String(rawValue ?? "").trim().replace(",", ".");
  if (!source) {
    return null;
  }
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitTextareaValues(rawValue) {
  return String(rawValue || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function operationalStatusLabel(typeId, draft) {
  if (!hasOperationalRecord(typeId)) {
    return "Sem ficha";
  }
  const pct = completionPct(draft);
  if (pct >= 100) {
    return "Completo";
  }
  if (pct >= 60) {
    return "Parcial";
  }
  return "Inicial";
}

function relatedProducts(typeId) {
  return [...(state.relatedProductsByTypeId[typeId] || [])];
}

function availableProductsToAdd(typeId) {
  const relatedIds = new Set(relatedProducts(typeId).map((product) => String(product.id || "").trim()).filter(Boolean));
  return [...state.mpcProducts]
    .filter((product) => {
      const productId = String(product.id || "").trim();
      return productId && !relatedIds.has(productId);
    })
    .sort((left, right) => {
      const leftLabel = String(left.short_name || left.name || left.id || "").trim();
      const rightLabel = String(right.short_name || right.name || right.id || "").trim();
      return leftLabel.localeCompare(rightLabel, "pt-BR");
    });
}

function headerStatusMessage() {
  if (!state.selectedTypeId) {
    return "";
  }
  if (state.pendingSaveTypeId === state.selectedTypeId) {
    return "Salvando ficha operacional...";
  }
  if (state.pendingAutofillTypeId === state.selectedTypeId) {
    return "Pesquisando dados via IA...";
  }
  if (state.pendingProductTypeId === state.selectedTypeId) {
    return "Atualizando produtos da MPC...";
  }
  if (state.transientStatus?.typeId === state.selectedTypeId) {
    return state.transientStatus.message;
  }
  return "";
}

function renderHeader() {
  const badgesTarget = document.getElementById("truck-operations-header-badges");
  const actionsTarget = document.getElementById("truck-operations-header-actions");
  if (!badgesTarget || !actionsTarget) {
    return;
  }
  const type = selectedType();
  const filledCount = state.types.filter((type) => hasOperationalRecord(type.id)).length;
  const statusMessage = headerStatusMessage();
  badgesTarget.innerHTML = [
    `<span class="editor-badge">${escapeHtml(`${state.types.length} caminhões`)}</span>`,
    `<span class="editor-badge">${escapeHtml(`${filledCount} fichas`)}</span>`,
    `<span class="editor-badge">${escapeHtml(`${state.types.length - filledCount} pendentes`)}</span>`,
    statusMessage ? `<span class="editor-badge truck-operations-header-status">${escapeHtml(statusMessage)}</span>` : "",
  ].join("");

  const toggleLabel = state.activeThemeId === "night" ? "Modo diurno" : "Modo noturno";
  const toggleIcon = state.activeThemeId === "night" ? "light_mode" : "dark_mode";
  const saveDisabled = !type || state.pendingSaveTypeId === type.id || state.pendingProductTypeId === type.id || state.pendingAutofillTypeId === type.id;
  const saveLabel = state.pendingSaveTypeId === type?.id ? "Salvando..." : "Salvar ficha";
  actionsTarget.innerHTML = `
    <a class="editor-header-action" href="/viewer/trucks"><span class="material-symbols-outlined">local_shipping</span><span>Caminhões</span></a>
    <a class="editor-header-action" href="/viewer/truck-product-matrix"><span class="material-symbols-outlined">table_chart</span><span>Matriz MPC</span></a>
    <button class="editor-header-action" type="button" data-action-id="save-operational" ${saveDisabled ? "disabled" : ""}><span class="material-symbols-outlined">save</span><span>${escapeHtml(saveLabel)}</span></button>
    <button class="editor-header-action" type="button" data-action-id="reload"><span class="material-symbols-outlined">refresh</span><span>Atualizar</span></button>
    <button class="editor-header-action" type="button" data-action-id="toggle-theme"><span class="material-symbols-outlined">${toggleIcon}</span><span>${escapeHtml(toggleLabel)}</span></button>
  `;
}

function renderFilters() {
  document.getElementById("truck-operations-search-label").textContent = labels().search_label || "Buscar modelo";
  document.getElementById("truck-operations-size-filter-label").textContent = labels().size_filter_label || "Porte";
  document.getElementById("truck-operations-vehicle-kind-filter-label").textContent = labels().vehicle_kind_filter_label || "Estrutura";
  document.getElementById("truck-operations-axle-filter-label").textContent = labels().axle_filter_label || "Eixos";
  document.getElementById("truck-operations-body-filter-label").textContent = labels().body_filter_label || "Implemento";
  document.getElementById("truck-operations-brand-filter-label").textContent = labels().brand_filter_label || "Família de marca";

  const searchInput = document.getElementById("truck-operations-search-input");
  searchInput.placeholder = labels().search_placeholder || "Ex.: bitrem, cavalo, basculante";
  searchInput.value = state.filters.search;

  const buildOptions = (items, selectedValue, labelGetter) => [
    `<option value="">${escapeHtml(labels().all_option_label || "Todos")}</option>`,
    ...items.map((item) => {
      const value = typeof item === "string" ? item : item.id;
      const label = labelGetter(item);
      return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }),
  ].join("");

  document.getElementById("truck-operations-size-filter").innerHTML = buildOptions(categoryOptions("size_tier"), state.filters.sizeTier, (item) => item.label);
  document.getElementById("truck-operations-vehicle-kind-filter").innerHTML = buildOptions(categoryOptions("base_vehicle_kind"), state.filters.vehicleKind, (item) => item.label);
  document.getElementById("truck-operations-axle-filter").innerHTML = buildOptions(categoryOptions("axle_config"), state.filters.axleConfig, (item) => item.label);
  document.getElementById("truck-operations-body-filter").innerHTML = buildOptions(categoryOptions("canonical_body_type_id"), state.filters.bodyId, (item) => item.label);
  document.getElementById("truck-operations-brand-filter").innerHTML = buildOptions(state.families, state.filters.brandFamilyId, (item) => item.label);
}

function renderSummary(visibleTypes) {
  document.getElementById("truck-operations-summary").innerHTML = `
    <span class="editor-badge">${escapeHtml(`${visibleTypes.length} ${labels().count_summary_label || "modelos visiveis"}`)}</span>
  `;
}

function renderList() {
  const target = document.getElementById("truck-operations-list");
  const visibleTypes = filteredTypes();
  ensureSelection();
  renderSummary(visibleTypes);
  if (!visibleTypes.length) {
    target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(labels().empty_results_label || "Nenhum caminhao encontrado com os filtros atuais.")}</div>`;
    renderPanels();
    return;
  }

  target.innerHTML = visibleTypes.map((type) => {
    const entry = assetEntry(type.id);
    const draft = operationalDraft(type.id);
    const operationStatus = operationalStatusLabel(type.id, draft);
    return `
      <article class="truck-gallery-item ${type.id === state.selectedTypeId ? "is-active" : ""}" data-type-id="${type.id}">
        <div class="truck-gallery-item-preview">
          ${previewMarkup(type, entry, "card")}
        </div>
        <div class="truck-gallery-item-copy">
          <div class="truck-gallery-item-head">
            <span class="truck-gallery-order">${escapeHtml(`${labels().order_label || "Ordem"} ${type.order}`)}</span>
            <strong>${escapeHtml(type.label)}</strong>
          </div>
          <div class="truck-gallery-item-meta">
            <span>${escapeHtml(enumLabel("size_tier", type.size_tier))}</span>
            <span>${escapeHtml(enumLabel("axle_config", type.axle_config))}</span>
            <span>${escapeHtml(enumLabel("base_vehicle_kind", type.base_vehicle_kind))}</span>
            <span>${escapeHtml(compatibleBodySummary(type))}</span>
            <span class="truck-gallery-status-pill is-${statusTone(entry)}">${escapeHtml(statusLabel(entry))}</span>
            <span class="truck-gallery-pill ${hasOperationalRecord(type.id) ? "is-active" : "is-muted"}">${escapeHtml(operationStatus)}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
  renderPanels();
  schedulePreviewHydration();
}

function optionMarkup(options, selectedValue) {
  return options.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function uniqueOptionValues(field, labelsByValue) {
  const values = orderedUniqueValues((state.operationalCatalog.items || []).map((item) => item[field]));
  return ["", ...values].map((value) => ({
    id: value,
    label: value ? (labelsByValue?.[value] || slugLabel(value)) : "-",
  }));
}

function formatChoiceValue(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  const source = String(value).trim();
  return source || "-";
}

function staticChoiceMarkup(label, value) {
  return `
    <article class="truck-operations-choice">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatChoiceValue(value))}</strong>
    </article>
  `;
}

function inputChoiceMarkup(field, label, value, { type = "text", step = "any", placeholder = "" } = {}) {
  return `
    <label class="truck-operations-choice is-editable">
      <span>${escapeHtml(label)}</span>
      <input
        class="editor-input"
        type="${escapeHtml(type)}"
        ${type === "number" ? `step="${escapeHtml(step)}"` : ""}
        value="${escapeHtml(String(value ?? ""))}"
        placeholder="${escapeHtml(placeholder)}"
        data-operational-field="${escapeHtml(field)}"
      />
    </label>
  `;
}

function summaryPanelMarkup(type, draft, entry) {
  const familyLabels = familiesForType(type.id).map((family) => family.label).filter(Boolean).join(", ") || "-";
  const preferredBodyLabel = state.bodiesById[type.preferred_body_type_id]?.label || compatibleBodySummary(type);
  return `
    <div class="truck-operations-preview-frame">
      <div class="truck-gallery-detail-preview truck-operations-preview-canvas">
        ${previewMarkup(type, entry, "detail")}
      </div>
    </div>
    <div class="truck-operations-choice-stack">
      <p class="truck-operations-stack-label">Viewer</p>
      ${staticChoiceMarkup("Nome", type.label)}
      ${staticChoiceMarkup("Ordem", type.order)}
      ${staticChoiceMarkup("Porte", enumLabel("size_tier", type.size_tier))}
      ${staticChoiceMarkup("Estrutura", enumLabel("base_vehicle_kind", type.base_vehicle_kind))}
      ${staticChoiceMarkup("Eixos", enumLabel("axle_config", type.axle_config))}
      ${staticChoiceMarkup("Implemento", preferredBodyLabel)}
      ${staticChoiceMarkup("Família", familyLabels)}
      ${staticChoiceMarkup("Ficha", operationalStatusLabel(type.id, draft))}
    </div>
  `;
}

function sectionBoxMarkup(title, innerMarkup) {
  return `
    <section class="truck-operations-section-box">
      <p class="truck-operations-stack-label">${escapeHtml(title)}</p>
      <div class="truck-operations-choice-stack">
        ${innerMarkup}
      </div>
    </section>
  `;
}

function informationPanelMarkup(typeId, draft) {
  const autofillPending = state.pendingAutofillTypeId === typeId;
  return `
    <button class="editor-header-action truck-operations-ai-button" type="button" data-detail-action="generate-ai" ${autofillPending ? "disabled" : ""}>
      <span class="material-symbols-outlined">auto_awesome</span>
      <span>${escapeHtml(autofillPending ? "Buscando..." : "Gerar Dados (IA)")}</span>
    </button>
    ${sectionBoxMarkup(
      "Dimensões",
      [
        inputChoiceMarkup("payload_weight_kg", "Carga útil (kg)", draft.payload_weight_kg, { type: "number", step: "1" }),
        inputChoiceMarkup("cargo_volume_m3", "Volume (m3)", draft.cargo_volume_m3, { type: "number", step: "0.1" }),
        inputChoiceMarkup("overall_length_m", "Comprimento (m)", draft.overall_length_m, { type: "number", step: "0.01" }),
        inputChoiceMarkup("overall_width_m", "Largura (m)", draft.overall_width_m, { type: "number", step: "0.01" }),
        inputChoiceMarkup("overall_height_m", "Altura (m)", draft.overall_height_m, { type: "number", step: "0.01" }),
      ].join(""),
    )}
    ${sectionBoxMarkup(
      "Custos",
      [
        inputChoiceMarkup("truck_price_brl", "Preço do caminhão (BRL)", draft.truck_price_brl, { type: "number", step: "0.01" }),
        inputChoiceMarkup("implement_cost_brl", "Preço do implemento (BRL)", draft.implement_cost_brl, { type: "number", step: "0.01" }),
        inputChoiceMarkup("base_fixed_cost_brl_per_day", "Custo fixo / dia (BRL)", draft.base_fixed_cost_brl_per_day, { type: "number", step: "0.01" }),
        inputChoiceMarkup("base_variable_cost_brl_per_km", "Custo variável / km (BRL)", draft.base_variable_cost_brl_per_km, { type: "number", step: "0.01" }),
      ].join(""),
    )}
  `;
}

function productsPanelMarkup(typeId) {
  const products = relatedProducts(typeId);
  const availableProducts = availableProductsToAdd(typeId);
  const pickerOpen = state.productPickerOpenTypeId === typeId;
  const productBusy = state.pendingProductTypeId === typeId;
  return `
    <div class="truck-operations-products-list">
      ${products.map((product) => `
        <article class="truck-operations-product-item">
          <strong>${escapeHtml(`${product.emoji || "📦"} ${product.name}`)}</strong>
          <button class="ghost-button truck-operations-product-remove" type="button" data-detail-action="remove-product" data-product-id="${escapeHtml(product.id)}" ${productBusy ? "disabled" : ""}>
            <span class="material-symbols-outlined">delete</span>
          </button>
        </article>
      `).join("") || `<p class="truck-operations-empty">Nenhum produto relacionado pela MPC.</p>`}
    </div>
    <details class="truck-operations-product-picker" ${pickerOpen ? "open" : ""}>
      <summary class="truck-operations-product-picker-summary ${availableProducts.length ? "" : "is-disabled"}" data-product-picker-summary>
        <span>+ Adicionar Produto</span>
        <span class="material-symbols-outlined">expand_more</span>
      </summary>
      <div class="truck-operations-product-picker-menu">
        ${availableProducts.length ? availableProducts.map((product) => `
          <label class="truck-operations-product-option">
            <input type="checkbox" data-product-picker-checkbox data-product-id="${escapeHtml(product.id)}" ${productBusy ? "disabled" : ""} />
            <strong>${escapeHtml(`${product.emoji || "📦"} ${product.name}`)}</strong>
          </label>
        `).join("") : `<p class="truck-operations-empty">Nenhum produto disponível para adicionar.</p>`}
      </div>
    </details>
  `;
}

function renderPanels() {
  const summaryTarget = document.getElementById("truck-operations-summary-panel");
  const costsTarget = document.getElementById("truck-operations-costs-panel");
  const productsTarget = document.getElementById("truck-operations-products-panel");
  const type = selectedType();
  if (!summaryTarget || !costsTarget || !productsTarget) {
    return;
  }
  if (!type) {
    const emptyMarkup = `<div class="truck-gallery-empty">Selecione um caminhão para editar a ficha operacional.</div>`;
    summaryTarget.innerHTML = emptyMarkup;
    costsTarget.innerHTML = emptyMarkup;
    productsTarget.innerHTML = emptyMarkup;
    return;
  }
  const draft = operationalDraft(type.id);
  const entry = assetEntry(type.id);
  summaryTarget.innerHTML = summaryPanelMarkup(type, draft, entry);
  costsTarget.innerHTML = informationPanelMarkup(type.id, draft);
  productsTarget.innerHTML = productsPanelMarkup(type.id);
  schedulePreviewHydration();
}

function applyAutofillPayloadToDraft(typeId, payload) {
  const draft = operationalDraft(typeId);
  const updatableFields = [
    "payload_weight_kg",
    "cargo_volume_m3",
    "overall_length_m",
    "overall_width_m",
    "overall_height_m",
    "truck_price_brl",
    "implement_cost_brl",
    "base_fixed_cost_brl_per_day",
    "base_variable_cost_brl_per_km",
    "confidence",
    "research_basis",
  ];
  updatableFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload || {}, field)) {
      return;
    }
    draft[field] = payload[field] ?? "";
  });
  if (Object.prototype.hasOwnProperty.call(payload || {}, "source_urls")) {
    draft.source_urls_text = Array.isArray(payload.source_urls) ? payload.source_urls.join("\n") : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "notes")) {
    draft.notes = String(payload.notes || "");
  }
}

async function refreshBootstrap({ preserveDrafts = true } = {}) {
  const previousSelectedTypeId = state.selectedTypeId;
  const previousDrafts = preserveDrafts ? { ...state.draftByTypeId } : {};
  state.bootstrap = await loadBootstrap();
  buildDerivedData();
  state.selectedTypeId = previousSelectedTypeId;
  state.draftByTypeId = {};
  Object.entries(previousDrafts).forEach(([typeId, draft]) => {
    if (state.typesById[typeId]) {
      state.draftByTypeId[typeId] = draft;
    }
  });
  ensureSelection();
}

function serializeOperationalDraft(typeId) {
  const draft = operationalDraft(typeId);
  return {
    truck_type_id: typeId,
    payload_weight_kg: toOptionalNumber(draft.payload_weight_kg),
    cargo_volume_m3: toOptionalNumber(draft.cargo_volume_m3),
    overall_length_m: toOptionalNumber(draft.overall_length_m),
    overall_width_m: toOptionalNumber(draft.overall_width_m),
    overall_height_m: toOptionalNumber(draft.overall_height_m),
    energy_source: String(draft.energy_source || "").trim() || null,
    consumption_unit: String(draft.consumption_unit || "").trim() || null,
    empty_consumption_per_km: toOptionalNumber(draft.empty_consumption_per_km),
    loaded_consumption_per_km: toOptionalNumber(draft.loaded_consumption_per_km),
    truck_price_brl: toOptionalNumber(draft.truck_price_brl),
    base_fixed_cost_brl_per_day: toOptionalNumber(draft.base_fixed_cost_brl_per_day),
    base_variable_cost_brl_per_km: toOptionalNumber(draft.base_variable_cost_brl_per_km),
    implement_cost_brl: toOptionalNumber(draft.implement_cost_brl),
    urban_access_level: String(draft.urban_access_level || "").trim() || null,
    road_access_level: String(draft.road_access_level || "").trim() || null,
    supported_surface_codes: [...(draft.supported_surface_codes || [])],
    load_time_minutes: toOptionalNumber(draft.load_time_minutes),
    unload_time_minutes: toOptionalNumber(draft.unload_time_minutes),
    confidence: String(draft.confidence || "").trim() || null,
    research_basis: String(draft.research_basis || "").trim() || null,
    source_urls: splitTextareaValues(draft.source_urls_text),
    notes: String(draft.notes || ""),
  };
}

async function saveOperationalRecord() {
  const type = selectedType();
  if (!type) {
    return;
  }
  state.pendingSaveTypeId = type.id;
  renderAll();
  try {
    const response = await callJson("/api/viewer/truck-operations", {
      method: "PUT",
      body: JSON.stringify(serializeOperationalDraft(type.id)),
    });
    await refreshBootstrap({ preserveDrafts: false });
    state.selectedTypeId = type.id;
    state.draftByTypeId[type.id] = buildOperationalDraft(state.typesById[type.id] || type, response.operational_record || {});
    state.transientStatus = {
      typeId: type.id,
      message: "Ficha operacional salva em merged_truck_data.json.",
    };
  } catch (error) {
    state.transientStatus = {
      typeId: type.id,
      message: String(error?.message || error || "Falha ao salvar a ficha operacional."),
    };
  } finally {
    state.pendingSaveTypeId = null;
    renderAll();
  }
}

async function toggleProductCompatibility(productId, { keepPickerOpen = false, successMessage = "Produto atualizado na matriz MPC." } = {}) {
  const type = selectedType();
  if (!type || !productId) {
    return;
  }
  state.productPickerOpenTypeId = keepPickerOpen ? type.id : "";
  state.pendingProductTypeId = type.id;
  renderAll();
  try {
    await callJson("/api/viewer/truck-product-matrix/toggle", {
      method: "POST",
      body: JSON.stringify({
        truck_type_id: type.id,
        product_id: productId,
      }),
    });
    await refreshBootstrap({ preserveDrafts: true });
    state.selectedTypeId = type.id;
    state.productPickerOpenTypeId = keepPickerOpen ? type.id : "";
    state.transientStatus = {
      typeId: type.id,
      message: successMessage,
    };
  } catch (error) {
    state.transientStatus = {
      typeId: type.id,
      message: String(error?.message || error || "Falha ao atualizar o produto na matriz MPC."),
    };
  } finally {
    state.pendingProductTypeId = null;
    renderAll();
  }
}

async function requestOperationalAutofill() {
  const type = selectedType();
  if (!type) {
    return;
  }
  stopOperationalAutofillPolling();
  state.pendingAutofillTypeId = type.id;
  renderAll();
  try {
    const response = await callJson("/api/viewer/truck-operations/autofill/background", {
      method: "POST",
      body: JSON.stringify({ truck_type_id: type.id }),
    });
    state.transientStatus = {
      typeId: type.id,
      message: String(response.message || "Autofill operacional iniciado em background."),
    };
    startOperationalAutofillPolling(type.id);
  } catch (error) {
    state.transientStatus = {
      typeId: type.id,
      message: String(error?.message || error || "Falha ao gerar os dados operacionais por IA."),
    };
  } finally {
    state.pendingAutofillTypeId = null;
    renderAll();
  }
}

function stopOperationalAutofillPolling() {
  if (state.autofillPollTimerId) {
    window.clearTimeout(state.autofillPollTimerId);
  }
  state.autofillPollTimerId = null;
  state.autofillPollTypeId = "";
}

async function pollOperationalAutofillStatus(typeId) {
  try {
    const status = await callJson(`/api/viewer/truck-operations/autofill/status?truck_type_id=${encodeURIComponent(typeId)}`, {
      method: "GET",
    });
    const jobStatus = String(status.status || "");
    if (jobStatus === "completed") {
      stopOperationalAutofillPolling();
      state.pendingAutofillTypeId = null;
      await refreshBootstrap({ preserveDrafts: false });
      state.selectedTypeId = typeId;
      state.transientStatus = {
        typeId,
        message: String(status.message || status.summary || "Dados operacionais gravados automaticamente."),
      };
      renderAll();
      return;
    }
    if (jobStatus === "failed") {
      stopOperationalAutofillPolling();
      state.pendingAutofillTypeId = null;
      state.transientStatus = {
        typeId,
        message: String(status.error || status.message || "Falha no autofill operacional em background."),
      };
      renderAll();
      return;
    }
    if (jobStatus === "queued" || jobStatus === "running") {
      state.pendingAutofillTypeId = typeId;
      renderHeader();
      state.autofillPollTimerId = window.setTimeout(() => {
        pollOperationalAutofillStatus(typeId);
      }, 2500);
      return;
    }
    stopOperationalAutofillPolling();
    state.pendingAutofillTypeId = null;
    renderHeader();
  } catch (error) {
    stopOperationalAutofillPolling();
    state.pendingAutofillTypeId = null;
    state.transientStatus = {
      typeId,
      message: String(error?.message || error || "Falha ao consultar o status do autofill operacional."),
    };
    renderAll();
  }
}

function startOperationalAutofillPolling(typeId) {
  stopOperationalAutofillPolling();
  state.autofillPollTypeId = typeId;
  state.pendingAutofillTypeId = typeId;
  void pollOperationalAutofillStatus(typeId);
}

function bindColumnResizers() {
  const grid = document.getElementById("truck-operations-grid");
  Array.from(grid.querySelectorAll("[data-resizer]")).forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = event.clientX;
      const startLeft = parseCssPx("--truck-left-col", 320);
      const startRight = parseCssPx("--truck-right-col", 420);
      const resizerWidth = parseCssPx("--truck-resizer-width", 10);
      const gap = parseCssPx("--truck-panel-gap", 12) * 4;
      const minSide = parseCssPx("--truck-side-min-col", 280);
      const minCenter = parseCssPx("--truck-center-min-col", 640);
      const gridWidth = grid.getBoundingClientRect().width;
      grid.classList.add("is-resizing");

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === "left") {
          const maxLeft = Math.max(minSide, gridWidth - startRight - (resizerWidth * 2) - gap - minCenter);
          setCssPx("--truck-left-col", Math.min(Math.max(startLeft + delta, minSide), maxLeft));
        }
        if (side === "right") {
          const maxRight = Math.max(minSide, gridWidth - startLeft - (resizerWidth * 2) - gap - minCenter);
          setCssPx("--truck-right-col", Math.min(Math.max(startRight - delta, minSide), maxRight));
        }
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        grid.classList.remove("is-resizing");
        normalizeLayout();
        persistLayout();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });

  window.addEventListener("resize", normalizeLayout);
}

function renderAll() {
  renderHeader();
  renderFilters();
  renderList();
}

function bindControls() {
  if (state.controlsBound) {
    return;
  }

  document.getElementById("truck-operations-header-actions").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.actionId === "toggle-theme") {
      toggleTheme();
      return;
    }
    if (button.dataset.actionId === "reload") {
      await refreshBootstrap({ preserveDrafts: true });
      state.transientStatus = {
        typeId: state.selectedTypeId,
        message: "Lista sincronizada novamente com o viewer.",
      };
      renderAll();
      return;
    }
    if (button.dataset.actionId === "save-operational") {
      await saveOperationalRecord();
    }
  });

  document.getElementById("truck-operations-search-input").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderAll();
  });
  document.getElementById("truck-operations-size-filter").addEventListener("change", (event) => {
    state.filters.sizeTier = event.target.value;
    renderAll();
  });
  document.getElementById("truck-operations-vehicle-kind-filter").addEventListener("change", (event) => {
    state.filters.vehicleKind = event.target.value;
    renderAll();
  });
  document.getElementById("truck-operations-axle-filter").addEventListener("change", (event) => {
    state.filters.axleConfig = event.target.value;
    renderAll();
  });
  document.getElementById("truck-operations-body-filter").addEventListener("change", (event) => {
    state.filters.bodyId = event.target.value;
    renderAll();
  });
  document.getElementById("truck-operations-brand-filter").addEventListener("change", (event) => {
    state.filters.brandFamilyId = event.target.value;
    renderAll();
  });

  document.getElementById("truck-operations-list").addEventListener("click", (event) => {
    const card = event.target.closest("[data-type-id]");
    if (!card) {
      return;
    }
    state.selectedTypeId = card.dataset.typeId;
    state.productPickerOpenTypeId = "";
    state.transientStatus = null;
    renderList();
  });

  document.getElementById("truck-operations-grid").addEventListener("click", async (event) => {
    const pickerSummary = event.target.closest("[data-product-picker-summary]");
    if (pickerSummary) {
      const details = pickerSummary.closest("details");
      state.productPickerOpenTypeId = details?.open ? "" : (selectedType()?.id || "");
      return;
    }
    const button = event.target.closest("[data-detail-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.detailAction;
    if (action === "generate-ai") {
      await requestOperationalAutofill();
      return;
    }
    if (action === "remove-product") {
      const productId = String(button.dataset.productId || "").trim();
      if (!productId) {
        return;
      }
      await toggleProductCompatibility(productId, {
        keepPickerOpen: false,
        successMessage: "Produto removido da matriz MPC.",
      });
    }
  });

  document.getElementById("truck-operations-grid").addEventListener("input", (event) => {
    const type = selectedType();
    if (!type) {
      return;
    }
    const field = event.target.closest("[data-operational-field]");
    if (!field) {
      return;
    }
    const draft = operationalDraft(type.id);
    draft[field.dataset.operationalField] = field.value;
  });

  document.getElementById("truck-operations-grid").addEventListener("change", (event) => {
    const type = selectedType();
    if (!type) {
      return;
    }
    const productCheckbox = event.target.closest("[data-product-picker-checkbox]");
    if (productCheckbox) {
      if (productCheckbox.checked) {
        toggleProductCompatibility(String(productCheckbox.dataset.productId || "").trim(), {
          keepPickerOpen: true,
          successMessage: "Produto adicionado à matriz MPC.",
        });
      }
      return;
    }
    const field = event.target.closest("[data-operational-field]");
    if (!field) {
      return;
    }
    const draft = operationalDraft(type.id);
    draft[field.dataset.operationalField] = field.value;
  });

  state.controlsBound = true;
}

async function initializeOperationalEditor() {
  state.bootstrap = await loadBootstrap();
  buildDerivedData();
  applyTheme(restoreTheme(), { persist: false });
  ensureSelection();
  renderAll();
  bindControls();
}

initializeOperationalEditor().catch((error) => {
  console.error("Brasix truck operational editor failed to initialize:", error);
  const target = document.getElementById("truck-operations-list");
  if (target) {
    target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(String(error?.message || error || "Falha ao carregar o editor operacional."))}</div>`;
  }
});