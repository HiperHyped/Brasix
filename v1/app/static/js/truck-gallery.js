import { escapeHtml } from "./shared/formatters.js";

const LAYOUT_KEY = "brasix:v1:truck-gallery-layout";
const THEME_KEY = "brasix:v1:truck-gallery-theme";
const LEGACY_GENERATED_PROMPT_PREFIXES = [
  "tipo:",
  "apelido curto:",
  "eixos:",
  "estrutura:",
  "combinacao:",
  "implemento:",
  "respeitar ",
  "usar a mesma cabine da imagem de referencia",
  "manter o mesmo estilo grafico da imagem de referencia",
];
const LEGACY_GENERATED_PROMPT_EXACT = new Set([
  "silhueta tecnica lateral de um caminhao brasileiro",
  "silhueta tecnica lateral de um caminhao",
  "fundo transparente",
  "veiculo isolado, sem cenario",
  "perfil lateral puro, sem perspectiva",
  "preto e branco, estilo prancha tecnica",
  "sem texto, logo, pessoas, estrada ou sombras",
  "respeitar proporcoes reais brasileiras",
  "desenho simples e limpo, com pouco detalhe",
  "desenho simples e limpo, com minimo de detalhe",
  "nao fazer estilo cartoon, brinquedo ou icone colorido",
]);

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
  axle_config: { catalogKey: "axle_configs", filterKey: "axleConfig", createLabel: "eixo" },
  canonical_body_type_id: { catalogKey: "types", filterKey: "bodyId", createLabel: "implemento visual" },
};

function createOptionValue(group) {
  return `__create__:${group}`;
}

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
  selectedTypeId: "",
  assetRegistry: null,
  assetRegistryByTypeId: {},
  catalogEdits: null,
  reviewQueue: null,
  generationConfig: null,
  categoryCatalog: null,
  promptDefaultsByTypeId: {},
  promptOverrides: null,
  promptOverridesByTypeId: {},
  promptDraftByTypeId: {},
  referenceDraftByTypeId: {},
  pendingGeneration: null,
  filters: {
    search: "",
    sizeTier: "",
    vehicleKind: "",
    axleConfig: "",
    bodyId: "",
    brandFamilyId: "",
  },
  controlsBound: false,
  pendingAction: null,
  pendingClassificationTypeId: null,
  classificationSaveTimers: {},
  transientStatus: null,
  previewBoundsByUrl: {},
};

function loadBootstrap() {
  return fetch("/api/viewer/trucks/bootstrap").then((response) => response.json());
}

function currentTheme() {
  const defaultId = state.themesDocument?.default_theme_id;
  return state.themesById[state.activeThemeId] || state.themesById[defaultId] || Object.values(state.themesById)[0] || null;
}

function labels() {
  return state.screen?.labels || {};
}

function screenStatusMessages() {
  return state.screen?.status_messages || {};
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
  const grid = document.getElementById("truck-gallery-grid");
  if (!grid) {
    return;
  }
  const gridWidth = grid.getBoundingClientRect().width;
  const resizerWidth = parseCssPx("--truck-resizer-width", 10);
  const gap = parseCssPx("--truck-panel-gap", 12) * 4;
  const minSide = parseCssPx("--truck-side-min-col", 280);
  const minCenter = parseCssPx("--truck-center-min-col", 640);
  let left = parseCssPx("--truck-left-col", 320);
  let right = parseCssPx("--truck-right-col", 380);
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
      right_col_px: parseCssPx("--truck-right-col", 380),
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
  state.catalogEdits = state.bootstrap.truck_catalog_edits || { items: [] };
  state.reviewQueue = state.bootstrap.truck_image_review_queue || { pending_type_ids: [] };
  state.generationConfig = state.bootstrap.truck_image_generation || {};
  state.categoryCatalog = state.bootstrap.truck_category_catalog || {};
  state.promptDefaultsByTypeId = { ...(state.bootstrap.truck_image_prompt_defaults || {}) };
  state.promptOverrides = state.bootstrap.truck_image_prompt_overrides || { overrides: [] };
  state.promptOverridesByTypeId = Object.fromEntries(
    (state.promptOverrides.overrides || []).map((item) => [item.truck_type_id, item]),
  );
  state.assetRegistryByTypeId = Object.fromEntries((state.assetRegistry.items || []).map((item) => [item.truck_type_id, item]));
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

function applyScreenRegistry() {
  (state.screen?.components || []).forEach((component) => {
    const target = document.getElementById(component.dom_target_id);
    if (target) {
      target.textContent = component.text;
    }
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

function canonicalBody(type) {
  return state.bodiesById[preferredBodyId(type)] || null;
}

function compatibleBodies(type) {
  return (type.canonical_body_type_ids || []).map((bodyId) => state.bodiesById[bodyId]).filter(Boolean);
}

function compatibleBodySummary(type) {
  const labels = compatibleBodies(type).map((body) => body.label).filter(Boolean);
  if (!labels.length) {
    return "-";
  }
  if (labels.length <= 2) {
    return labels.join(" / ");
  }
  return `${labels.slice(0, 2).join(" / ")} +${labels.length - 2}`;
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
    return [...Object.values(state.bodiesById)].sort((left, right) => left.order - right.order).map((item) => ({
      id: item.id,
      label: item.label,
    }));
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
    merged.push({
      id,
      label: String(item.label || enumLabel(group, id)).trim() || enumLabel(group, id),
    });
  });
  return merged;
}

function selectOptionsMarkup(values, selectedValue, labelGetter = slugLabel) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(labelGetter(value))}</option>`).join("");
}

function updateTypeRecord(typeRecord) {
  if (!typeRecord?.id) {
    return;
  }
  state.typesById[typeRecord.id] = { ...typeRecord };
  state.types = state.types.map((item) => (item.id === typeRecord.id ? { ...typeRecord } : item));
}

function normalizePromptItems(items) {
  return (items || [])
    .map((item) => String(item || "").trim())
    .map((item) => item.replace(/^[\-â€¢]\s*/, ""))
    .filter(Boolean);
}

function normalizeReferenceAspects(items) {
  const allowed = new Set(["cabine", "estilo"]);
  return (items || [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item, index, source) => allowed.has(item) && source.indexOf(item) === index);
}

function isLegacyGeneratedPromptItem(item) {
  const normalized = String(item || "").trim().toLowerCase();
  return LEGACY_GENERATED_PROMPT_EXACT.has(normalized)
    || LEGACY_GENERATED_PROMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function looksLikeLegacyGeneratedPrompt(items) {
  return normalizePromptItems(items).filter((item) => isLegacyGeneratedPromptItem(item)).length >= 3;
}

function effectivePromptRows(typeId, rawItems) {
  const normalized = normalizePromptItems(rawItems);
  const defaults = defaultPromptItemsForType(typeId);
  if (!normalized.length) {
    return defaults.length ? [...defaults] : [""];
  }
  if (!looksLikeLegacyGeneratedPrompt(normalized)) {
    return [...normalized];
  }
  const customItems = normalized.filter((item) => !isLegacyGeneratedPromptItem(item));
  return customItems.length ? [...defaults, ...customItems] : [...defaults];
}

function defaultPromptItemsForType(typeId) {
  return normalizePromptItems(state.promptDefaultsByTypeId[typeId] || []);
}

function promptRowsForType(typeId) {
  if (!state.promptDraftByTypeId[typeId]) {
    const overrideItems = state.promptOverridesByTypeId[typeId]?.prompt_items || [];
    const type = state.typesById[typeId];
    const initialRows = type?.is_custom && !overrideItems.length
      ? [""]
      : effectivePromptRows(typeId, overrideItems);
    state.promptDraftByTypeId[typeId] = initialRows.length ? [...initialRows] : [""];
  }
  return state.promptDraftByTypeId[typeId];
}

function promptItemsForType(typeId) {
  return normalizePromptItems(promptRowsForType(typeId));
}

function resetPromptRowsForType(typeId) {
  const defaults = defaultPromptItemsForType(typeId);
  state.promptDraftByTypeId[typeId] = defaults.length ? [...defaults] : [""];
}

function referencePreviewUrl(typeId) {
  const entry = assetEntry(typeId);
  return previewUrlForEntry(entry);
}

function referenceDraftForType(typeId) {
  if (!state.referenceDraftByTypeId[typeId]) {
    const override = state.promptOverridesByTypeId[typeId] || {};
    const entry = assetEntry(typeId) || {};
    const referenceTruckTypeId = String(override.reference_truck_type_id || entry.reference_truck_type_id || "");
    const legacyOverride = looksLikeLegacyGeneratedPrompt(override.prompt_items || []);
    let referenceAspects = normalizeReferenceAspects(
      legacyOverride ? [] : (override.reference_aspects || entry.reference_aspects || []),
    );
    const safeReferenceTruckTypeId = referenceTruckTypeId === typeId ? "" : referenceTruckTypeId;
    if (safeReferenceTruckTypeId && !referenceAspects.length) {
      referenceAspects = ["cabine"];
    }
    state.referenceDraftByTypeId[typeId] = {
      referenceTruckTypeId: safeReferenceTruckTypeId,
      referenceAspects,
    };
  }
  return state.referenceDraftByTypeId[typeId];
}

function referencePromptItemsForType(typeId) {
  const draft = referenceDraftForType(typeId);
  if (!draft.referenceTruckTypeId) {
    return [];
  }
  const referenceLabel = state.typesById[draft.referenceTruckTypeId]?.label || "imagem de referencia";
  const items = [`usar ${referenceLabel} apenas como referencia parcial`];
  if (draft.referenceAspects.includes("cabine")) {
    items.push("copiar apenas a cabine da referencia");
  }
  if (draft.referenceAspects.includes("estilo")) {
    items.push("copiar apenas o estilo do desenho da referencia");
  }
  items.push("nao copiar eixos, modulos, implementos ou comprimento da referencia");
  return items;
}

function referenceSelectorMarkup(typeId) {
  const draft = referenceDraftForType(typeId);
  const disabled = state.pendingAction === typeId ? "disabled" : "";
  const aspectDisabled = !draft.referenceTruckTypeId || state.pendingAction === typeId ? "disabled" : "";
  const options = [
    `<option value="">${escapeHtml(labels().reference_none_label || "Sem imagem de referencia")}</option>`,
    ...state.types
      .filter((type) => type.id !== typeId && Boolean(referencePreviewUrl(type.id)))
      .map((type) => `<option value="${escapeHtml(type.id)}" ${type.id === draft.referenceTruckTypeId ? "selected" : ""}>${escapeHtml(type.label)}</option>`),
  ].join("");
  const previewUrl = draft.referenceTruckTypeId ? referencePreviewUrl(draft.referenceTruckTypeId) : "";
  return `
    <div class="truck-gallery-prompt-help">${escapeHtml(labels().reference_help_label || "Use uma imagem existente para puxar a mesma cabine, o mesmo estilo, ou os dois.")}</div>
    <label class="field">
      <span>${escapeHtml(labels().reference_select_label || "Imagem base")}</span>
      <div class="select-shell">
        <select class="editor-input" data-reference-select ${disabled}>${options}</select>
        <span class="material-symbols-outlined">expand_more</span>
      </div>
    </label>
    <div class="truck-gallery-reference-aspects">
      <span>${escapeHtml(labels().reference_aspects_label || "Aspectos herdados")}</span>
      <label class="truck-gallery-reference-check">
        <input type="checkbox" data-reference-aspect="cabine" ${draft.referenceAspects.includes("cabine") ? "checked" : ""} ${aspectDisabled} />
        <span>${escapeHtml(labels().reference_cabin_label || "Cabine")}</span>
      </label>
      <label class="truck-gallery-reference-check">
        <input type="checkbox" data-reference-aspect="estilo" ${draft.referenceAspects.includes("estilo") ? "checked" : ""} ${aspectDisabled} />
        <span>${escapeHtml(labels().reference_style_label || "Estilo")}</span>
      </label>
    </div>
    ${previewUrl ? `<div class="truck-gallery-reference-preview"><img src="${previewUrl}" alt="${escapeHtml(state.typesById[draft.referenceTruckTypeId]?.label || "Referencia")}" /></div>` : ""}
  `;
}

function promptEditorMarkup(typeId) {
  const rows = promptRowsForType(typeId);
  const disabled = state.pendingAction === typeId ? "disabled" : "";
  const referenceItems = referencePromptItemsForType(typeId);
  return `
    <div class="truck-gallery-prompt-help">${escapeHtml(labels().prompt_help_label || "Edite os itens abaixo antes de gerar ou refazer.")}</div>
    <div class="truck-gallery-prompt-editor">
      ${rows.map((item, index) => `
        <div class="truck-gallery-prompt-row">
          <span class="truck-gallery-prompt-index">${index + 1}</span>
          <input
            class="editor-input truck-gallery-prompt-input"
            type="text"
            value="${escapeHtml(item)}"
            data-prompt-index="${index}"
            placeholder="${escapeHtml(labels().prompt_item_placeholder || "Ex.: silhueta lateral simples")}"
            ${disabled}
          />
          <button
            class="editor-header-action truck-gallery-detail-action is-inline"
            type="button"
            data-detail-action="remove-prompt-item"
            data-prompt-index="${index}"
            aria-label="Remover item ${index + 1}"
            title="Remover item ${index + 1}"
            ${disabled}
          >
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      `).join("")}
    </div>
    <div class="truck-gallery-action-row">
      <button class="editor-header-action truck-gallery-detail-action" type="button" data-detail-action="add-prompt-item" ${disabled}>
        <span class="material-symbols-outlined">add</span>
        <span>${escapeHtml(labels().prompt_add_item_label || "Adicionar item")}</span>
      </button>
      <button class="editor-header-action truck-gallery-detail-action" type="button" data-detail-action="reset-prompt" ${disabled}>
        <span class="material-symbols-outlined">restart_alt</span>
        <span>${escapeHtml(labels().prompt_reset_label || "Usar padrao")}</span>
      </button>
    </div>
    ${referenceItems.length ? `
      <div class="truck-gallery-reference-derived">
        <strong>${escapeHtml(labels().prompt_reference_items_label || "Itens adicionados automaticamente pela imagem de referencia")}</strong>
        <ul>
          ${referenceItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    ` : ""}
  `;
}

function classificationEditorMarkup(type) {
  const disabled = state.pendingAction === type.id || state.pendingClassificationTypeId === type.id ? "disabled" : "";
  const bodyId = canonicalBody(type)?.id || "";

  const selectField = (field, label, optionsMarkup, createGroup = "") => `
    <label class="truck-gallery-detail-metric is-editable">
      <span>${escapeHtml(label)}</span>
      <div class="select-shell">
        <select class="editor-input" data-classification-field="${field}" data-create-group="${createGroup}" ${disabled}>${optionsMarkup}</select>
        <span class="material-symbols-outlined">expand_more</span>
      </div>
    </label>
  `;

  return `
    <section class="truck-gallery-detail-section">
      <p class="eyebrow">${escapeHtml(labels().classification_section_label || "Classificacao do caminhao")}</p>
      <div class="truck-gallery-detail-grid truck-gallery-classification-grid">
        <label class="truck-gallery-detail-metric is-editable is-span-2">
          <span>${escapeHtml(labels().name_label || "Nome")}</span>
          <input
            class="editor-input truck-gallery-name-input"
            type="text"
            value="${escapeHtml(type.label || "")}"
            data-classification-field="label"
            ${disabled}
          />
        </label>
        ${selectField("size_tier", labels().size_tier_label || "Porte", selectOptionsMarkup(categoryOptions("size_tier").map((item) => item.id), type.size_tier, (value) => enumLabel("size_tier", value)), "")}
        ${selectField("base_vehicle_kind", labels().vehicle_kind_label || "Tipo", selectOptionsMarkup(categoryOptions("base_vehicle_kind").map((item) => item.id), type.base_vehicle_kind, (value) => enumLabel("base_vehicle_kind", value)), "")}
        ${selectField("axle_config", labels().axle_config_label || "Eixos", selectOptionsMarkup(categoryOptions("axle_config").map((item) => item.id), type.axle_config, (value) => enumLabel("axle_config", value)) + `<option value="${escapeHtml(createOptionValue("axle_config"))}">+ ${escapeHtml(labels().create_category_prefix_label || "Criar novo")} ${escapeHtml(CATEGORY_GROUP_CONFIG.axle_config.createLabel)}</option>`, "axle_config")}
        ${selectField("preferred_body_type_id", labels().body_selector_label || "Implemento visual", selectOptionsMarkup(categoryOptions("canonical_body_type_id").map((item) => item.id), bodyId, (value) => state.bodiesById[value]?.label || value) + `<option value="${escapeHtml(createOptionValue("canonical_body_type_id"))}">+ ${escapeHtml(labels().create_category_prefix_label || "Criar novo")} ${escapeHtml(CATEGORY_GROUP_CONFIG.canonical_body_type_id.createLabel)}</option>`, "canonical_body_type_id")}
        <label class="truck-gallery-detail-metric is-editable is-span-2">
          <span>${escapeHtml(labels().notes_label || "Observacoes")}</span>
          <textarea
            class="editor-input truck-gallery-notes-input"
            data-classification-field="notes"
            placeholder="${escapeHtml(labels().notes_placeholder || "")}"
            ${disabled}
          >${escapeHtml(type.notes || "")}</textarea>
        </label>
      </div>
      <div class="truck-gallery-action-row">
        <button class="editor-header-action truck-gallery-detail-action" type="button" data-detail-action="build-prompt" ${disabled}>
          <span class="material-symbols-outlined">auto_fix_high</span>
          <span>${escapeHtml(labels().create_prompt_button_label || "Criar prompt")}</span>
        </button>
      </div>
    </section>
  `;
}

function pendingReviewCount() {
  return (state.reviewQueue?.pending_type_ids || []).length;
}

function approvedCount() {
  return Object.values(state.assetRegistryByTypeId).filter((item) => item.status === "approved" && item.approved_image_url_path).length;
}

function headerBadgesMarkup() {
  return [
    `<span class="editor-badge">${escapeHtml(`${state.types.length} tipos`)}</span>`,
    `<span class="editor-badge">${escapeHtml(`${approvedCount()} ${labels().queue_approved_label || "aprovados"}`)}</span>`,
    `<span class="editor-badge">${escapeHtml(`${pendingReviewCount()} ${labels().queue_pending_label || "pendentes"}`)}</span>`,
  ].join("");
}

function renderHeader() {
  const theme = currentTheme();
  const actions = (state.screen.header_actions || []).map((action) => (
    action.action === "toggle-theme"
      ? { ...action, label: theme?.toggle_action_label || action.label, icon: theme?.toggle_action_icon || action.icon }
      : action
  ));
  document.getElementById("truck-gallery-header-badges").innerHTML = headerBadgesMarkup();
  document.getElementById("truck-gallery-header-actions").innerHTML = actions.map((action) => (
    action.href
      ? `<a class="editor-header-action" href="${action.href}"><span class="material-symbols-outlined">${action.icon}</span><span>${escapeHtml(action.label)}</span></a>`
      : `<button class="editor-header-action" type="button" data-action-id="${action.action}"><span class="material-symbols-outlined">${action.icon}</span><span>${escapeHtml(action.label)}</span></button>`
  )).join("");
}

function renderFilters() {
  document.getElementById("truck-gallery-search-label").textContent = labels().search_label || "Buscar modelo";
  document.getElementById("truck-gallery-size-filter-label").textContent = labels().size_filter_label || "Porte";
  document.getElementById("truck-gallery-vehicle-kind-filter-label").textContent = labels().vehicle_kind_filter_label || "Tipo";
  document.getElementById("truck-gallery-axle-filter-label").textContent = labels().axle_filter_label || "Eixos";
  document.getElementById("truck-gallery-body-filter-label").textContent = labels().body_filter_label || "Implemento";
  document.getElementById("truck-gallery-brand-filter-label").textContent = labels().brand_filter_label || "Familia de marca";

  const searchInput = document.getElementById("truck-gallery-search-input");
  searchInput.placeholder = labels().search_placeholder || "Buscar";
  searchInput.value = state.filters.search;

  const buildOptions = (items, selectedValue, labelGetter, { createGroup = "" } = {}) => [
    `<option value="">${escapeHtml(labels().all_option_label || "Todos")}</option>`,
    ...items.map((item) => {
      const value = typeof item === "string" ? item : item.id;
      const label = labelGetter(item);
      return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }),
    ...(createGroup ? [`<option value="${escapeHtml(createOptionValue(createGroup))}">${escapeHtml(`+ ${labels().create_category_prefix_label || "Criar novo"} ${CATEGORY_GROUP_CONFIG[createGroup]?.createLabel || "item"}`)}</option>`] : []),
  ].join("");

  document.getElementById("truck-gallery-size-filter").innerHTML = buildOptions(categoryOptions("size_tier"), state.filters.sizeTier, (item) => item.label);
  document.getElementById("truck-gallery-vehicle-kind-filter").innerHTML = buildOptions(categoryOptions("base_vehicle_kind"), state.filters.vehicleKind, (item) => item.label);
  document.getElementById("truck-gallery-axle-filter").innerHTML = buildOptions(categoryOptions("axle_config"), state.filters.axleConfig, (item) => item.label, { createGroup: "axle_config" });
  document.getElementById("truck-gallery-body-filter").innerHTML = buildOptions(
    categoryOptions("canonical_body_type_id"),
    state.filters.bodyId,
    (item) => item.label,
    { createGroup: "canonical_body_type_id" },
  );
  document.getElementById("truck-gallery-brand-filter").innerHTML = buildOptions(
    state.families,
    state.filters.brandFamilyId,
    (item) => item.label,
  );
}

function typeMatchesFilters(type) {
  const search = state.filters.search.trim().toLowerCase();
  const bodyLabels = (type.canonical_body_type_ids || []).map((bodyId) => state.bodiesById[bodyId]?.label || "").join(" ").toLowerCase();
  const familyLabels = familiesForType(type.id).map((family) => family.label).join(" ").toLowerCase();
  const haystack = [
    type.label,
    type.short_label,
    type.axle_config,
    type.base_vehicle_kind,
    bodyLabels,
    familyLabels,
  ].join(" ").toLowerCase();

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

function renderSummary(visibleTypes) {
  document.getElementById("truck-gallery-summary").innerHTML = `
    <span class="editor-badge">${escapeHtml(`${visibleTypes.length} ${labels().count_summary_label || "modelos visiveis"}`)}</span>
  `;
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

function previewUrlForList(entry) {
  return previewUrlForEntry(entry);
}

function previewUrlForDetail(entry) {
  return previewUrlForEntry(entry);
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
  const previewUrl = variant === "detail" ? previewUrlForDetail(entry) : previewUrlForList(entry);
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
  context.drawImage(
    image,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
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

function isGenerating(typeId) {
  return state.pendingGeneration?.typeId === typeId;
}

function previewLoadingMarkup(typeId, variant) {
  if (!isGenerating(typeId)) {
    return "";
  }
  const isDryRun = state.pendingGeneration?.mode === "dry-run";
  const title = isDryRun ? "Processando prompt" : "Gerando imagem";
  const copy = isDryRun
    ? "Montando o prompt atual..."
    : "Gerando imagem a partir do prompt atual...";
  return `
    <div class="truck-gallery-preview-loading ${variant === "detail" ? "is-detail" : "is-card"}">
      <span class="truck-gallery-spinner" aria-hidden="true"></span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(copy)}</span>
    </div>
  `;
}

function typeActionButtons(type, entry) {
  const busy = state.pendingAction === type.id;
  const button = (action, label, icon, tone = "") => `
    <button class="editor-header-action truck-gallery-detail-action ${tone}" type="button" data-detail-action="${action}" ${busy ? "disabled" : ""}>
      <span class="material-symbols-outlined">${icon}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;

  if (!entry || ["failed", "rejected", "skipped"].includes(entry.status)) {
    return [
      button("generate", labels().generate_button_label || "Gerar imagem", "auto_awesome"),
      button("dry-run", labels().dry_run_button_label || "Dry-run", "labs"),
    ].join("");
  }
  if (entry.status === "generated") {
    return [
      button("approve", labels().approve_button_label || "Aprovar", "task_alt", "is-success"),
      button("reject", labels().reject_button_label || "Rejeitar", "cancel", "is-danger"),
      button("regenerate", labels().regenerate_button_label || "Refazer", "refresh"),
    ].join("");
  }
  return [
    button("regenerate", labels().regenerate_button_label || "Refazer", "refresh"),
    button("dry-run", labels().dry_run_button_label || "Dry-run", "labs"),
  ].join("");
}

function currentClassificationPayload(typeId) {
  const type = state.typesById[typeId];
  if (!type) {
    return null;
  }
  return {
    truck_type_id: type.id,
    label: String(type.label || "").trim(),
    size_tier: String(type.size_tier || "").trim(),
    base_vehicle_kind: String(type.base_vehicle_kind || "").trim(),
    axle_config: String(type.axle_config || "").trim(),
    preferred_body_type_id: String(preferredBodyId(type) || "").trim(),
    notes: String(type.notes || "").trim(),
  };
}

async function createCustomTruck() {
  state.pendingAction = "create-custom";
  renderHeader();
  try {
    const payload = await callJson("/api/viewer/trucks/custom-types", {
      method: "POST",
      body: JSON.stringify({
        label: "Novo caminhao",
      }),
    });
    await refreshBootstrap();
    state.selectedTypeId = payload.type_record.id;
    state.promptDraftByTypeId[payload.type_record.id] = [""];
    state.referenceDraftByTypeId[payload.type_record.id] = {
      referenceTruckTypeId: "",
      referenceAspects: [],
    };
    state.transientStatus = {
      typeId: payload.type_record.id,
      message: screenStatusMessages().custom_created || "Novo caminhao criado na galeria.",
    };
  } catch (error) {
    state.transientStatus = {
      typeId: state.selectedTypeId,
      message: String(error?.message || error || "Falha ao criar o novo caminhao."),
    };
  } finally {
    state.pendingAction = null;
    renderAll();
  }
}

async function createCategoryOption(group) {
  const config = CATEGORY_GROUP_CONFIG[group];
  if (!config) {
    return "";
  }
  const rawLabel = window.prompt(
    `${labels().create_category_prompt_title || "Nome do novo item"}:`,
    "",
  );
  const label = String(rawLabel || "").trim();
  if (!label) {
    return "";
  }
  const selectedTypeId = state.selectedTypeId;
  state.pendingAction = `create-category:${group}`;
  renderHeader();
  renderDetail();
  try {
    const payload = await callJson("/api/viewer/trucks/category-options", {
      method: "POST",
      body: JSON.stringify({
        group,
        label,
      }),
    });
    await refreshBootstrap();
    state.selectedTypeId = selectedTypeId;
    state.transientStatus = {
      typeId: selectedTypeId,
      message: `${label} criado em ${config.createLabel}.`,
    };
    renderAll();
    return String(payload.option?.id || "");
  } catch (error) {
    state.pendingAction = null;
    state.transientStatus = {
      typeId: selectedTypeId,
      message: String(error?.message || error || "Falha ao criar a categoria."),
    };
    renderAll();
    return "";
  } finally {
    state.pendingAction = null;
  }
}

async function buildPromptFromClassification(typeId) {
  const payload = currentClassificationPayload(typeId);
  if (!payload || !payload.label || !payload.preferred_body_type_id) {
    return;
  }
  state.pendingAction = typeId;
  renderDetail();
  try {
    const response = await callJson("/api/viewer/trucks/build-prompt", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.promptDraftByTypeId[typeId] = response.prompt_items.length ? [...response.prompt_items] : [""];
    state.transientStatus = {
      typeId,
      message: screenStatusMessages().prompt_created || "Prompt criado a partir das categorias e observacoes.",
    };
  } catch (error) {
    state.transientStatus = {
      typeId,
      message: String(error?.message || error || "Falha ao criar o prompt do caminhao."),
    };
  } finally {
    state.pendingAction = null;
    renderDetail();
  }
}

async function saveClassification(typeId) {
  const payload = currentClassificationPayload(typeId);
  if (!payload || !payload.label || !payload.preferred_body_type_id) {
    return;
  }
  state.pendingClassificationTypeId = typeId;
  renderDetail();
  try {
    const response = await callJson("/api/viewer/trucks/classification", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    delete state.promptDraftByTypeId[typeId];
    await refreshBootstrap();
    state.selectedTypeId = typeId;
    updateTypeRecord(response.type_record);
    state.transientStatus = {
      typeId,
      message: screenStatusMessages().classification_saved || "Classificacao salva automaticamente.",
    };
  } catch (error) {
    await refreshBootstrap();
    state.selectedTypeId = typeId;
    state.transientStatus = {
      typeId,
      message: String(error?.message || error || "Falha ao salvar a classificacao do caminhao."),
    };
  } finally {
    state.pendingClassificationTypeId = null;
    renderAll();
  }
}

async function deleteTruckType(typeId) {
  const confirmed = window.confirm(screenStatusMessages().delete_confirm || "Tem certeza?");
  if (!confirmed) {
    return;
  }
  state.pendingAction = typeId;
  renderHeader();
  renderList();
  renderDetail();
  try {
    await callJson("/api/viewer/trucks/delete", {
      method: "PUT",
      body: JSON.stringify({ truck_type_id: typeId }),
    });
    await refreshBootstrap();
    delete state.promptDraftByTypeId[typeId];
    delete state.referenceDraftByTypeId[typeId];
    delete state.previewBoundsByUrl[typeId];
    if (state.selectedTypeId === typeId) {
      state.selectedTypeId = "";
    }
    ensureSelection();
    state.transientStatus = {
      typeId: state.selectedTypeId,
      message: screenStatusMessages().delete_success || "Item excluido da galeria.",
    };
  } catch (error) {
    state.transientStatus = {
      typeId,
      message: String(error?.message || error || "Falha ao excluir o item."),
    };
  } finally {
    state.pendingAction = null;
    renderAll();
  }
}

function scheduleClassificationSave(typeId, { immediate = false } = {}) {
  if (state.classificationSaveTimers[typeId]) {
    window.clearTimeout(state.classificationSaveTimers[typeId]);
  }
  state.classificationSaveTimers[typeId] = window.setTimeout(() => {
    delete state.classificationSaveTimers[typeId];
    void saveClassification(typeId);
  }, immediate ? 0 : 350);
}

function detailStatusMessage(entry) {
  if (isGenerating(state.selectedTypeId)) {
    return state.pendingGeneration?.mode === "dry-run"
      ? "Montando o prompt atual sem gerar imagem."
      : "Gerando imagem a partir do prompt escrito.";
  }
  if (state.transientStatus?.typeId === state.selectedTypeId) {
    return state.transientStatus.message;
  }
  if (entry?.error_message) {
    return entry.error_message;
  }
  if (entry?.prompt_summary) {
    return entry.prompt_summary;
  }
  return screenStatusMessages().idle || labels().status_idle_help || "Selecione um tipo para gerar a imagem canonica.";
}

function selectedType() {
  return state.typesById[state.selectedTypeId] || null;
}

function renderList() {
  const target = document.getElementById("truck-gallery-list");
  const visibleTypes = filteredTypes();
  ensureSelection();
  renderSummary(visibleTypes);

  if (!visibleTypes.length) {
    target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(labels().empty_results_label || "Nenhum caminhao encontrado com os filtros atuais.")}</div>`;
    renderDetail();
    return;
  }

  target.innerHTML = visibleTypes.map((type) => {
    const entry = assetEntry(type.id);
    const body = canonicalBody(type);
    return `
      <article class="truck-gallery-item ${type.id === state.selectedTypeId ? "is-active" : ""}" data-type-id="${type.id}">
        <button
          class="editor-header-action truck-gallery-item-delete"
          type="button"
          data-item-action="delete"
          data-type-id="${type.id}"
          aria-label="${escapeHtml(labels().delete_button_label || "Excluir")}"
          title="${escapeHtml(labels().delete_button_label || "Excluir")}"
        >
          <span class="material-symbols-outlined">delete</span>
        </button>
        <div class="truck-gallery-item-preview">
          ${previewMarkup(type, entry, "card")}
          ${previewLoadingMarkup(type.id, "card")}
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
          </div>
        </div>
      </article>
    `;
  }).join("");
  renderDetail();
  schedulePreviewHydration();
}

function renderDetail() {
  const target = document.getElementById("truck-gallery-detail");
  const type = selectedType();
  if (!type) {
    target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(screenStatusMessages().idle || "Selecione um tipo para gerar a imagem canonica.")}</div>`;
    return;
  }

  const body = canonicalBody(type);
  const families = familiesForType(type.id);
  const entry = assetEntry(type.id);
  const previewLabel = entry?.candidate_image_url_path && ["generated", "rejected", "failed"].includes(entry.status)
    ? (labels().candidate_asset_label || "Imagem candidata")
    : (labels().approved_asset_label || "Imagem aprovada");

  target.innerHTML = `
    <div class="truck-gallery-detail-preview">
      ${previewMarkup(type, entry, "detail")}
      ${previewLoadingMarkup(type.id, "detail")}
    </div>
    <div class="truck-gallery-detail-copy">
      <div class="truck-gallery-detail-head">
        <strong>${escapeHtml(type.label)}</strong>
        <span>${escapeHtml(statusLabel(entry))}</span>
      </div>

      ${classificationEditorMarkup(type)}

      <section class="truck-gallery-detail-section">
        <p class="eyebrow">${escapeHtml(labels().generation_section_label || "Geracao por IA")}</p>
        <div class="truck-gallery-action-row">
          ${typeActionButtons(type, entry)}
        </div>
        <div class="truck-gallery-generation-meta">
          <div class="truck-gallery-generation-meta-card">
            <span>${escapeHtml(labels().generation_status_label || "Status")}</span>
            <strong>${escapeHtml(statusLabel(entry))}</strong>
          </div>
          <div class="truck-gallery-generation-meta-card">
            <span>${escapeHtml(labels().generation_model_label || "Modelo")}</span>
            <strong>${escapeHtml(entry?.used_model || entry?.requested_model || state.generationConfig?.image_api?.primary_model || "-")}</strong>
          </div>
          <div class="truck-gallery-generation-meta-card">
            <span>${escapeHtml(labels().asset_label || "Asset atual")}</span>
            <strong>${escapeHtml(previewLabel)}</strong>
          </div>
        </div>
        <div class="truck-gallery-generation-status is-${statusTone(entry)}">
          ${escapeHtml(detailStatusMessage(entry))}
        </div>
      </section>

      <section class="truck-gallery-detail-section">
        <p class="eyebrow">${escapeHtml(labels().prompt_label || "Prompt em itens")}</p>
        ${promptEditorMarkup(type.id)}
      </section>

      <section class="truck-gallery-detail-section">
        <p class="eyebrow">${escapeHtml(labels().reference_section_label || "Imagem de referencia")}</p>
        ${referenceSelectorMarkup(type.id)}
      </section>

      <section class="truck-gallery-detail-section">
        <p class="eyebrow">${escapeHtml(labels().body_selector_label || "Implementos compativeis")}</p>
        <div class="truck-gallery-pill-list">
          ${compatibleBodies(type).length
            ? compatibleBodies(type).map((item) => `<span class="truck-gallery-pill ${item.id === preferredBodyId(type) ? "is-active" : ""}">${escapeHtml(item.label)}${item.id === preferredBodyId(type) ? " · visual" : ""}</span>`).join("")
            : `<span class="truck-gallery-pill is-muted">-</span>`}
        </div>
      </section>

      <section class="truck-gallery-detail-section">
        <p class="eyebrow">${escapeHtml(labels().brand_families_label || "Familias compativeis")}</p>
        <div class="truck-gallery-pill-list">
          ${families.length
            ? families.map((family) => `<span class="truck-gallery-pill">${escapeHtml(family.label)}</span>`).join("")
            : `<span class="truck-gallery-pill is-muted">-</span>`}
        </div>
      </section>
    </div>
  `;
  schedulePreviewHydration();
}

async function refreshBootstrap() {
  state.bootstrap = await loadBootstrap();
  buildDerivedData();
}

async function callJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || `Falha HTTP ${response.status}.`);
  }
  return payload;
}

function upsertAsset(asset) {
  state.assetRegistryByTypeId[asset.truck_type_id] = asset;
}

function setReviewQueue(queue) {
  state.reviewQueue = queue;
}

async function generateSelectedType({ dryRun = false, forceRegenerate = false } = {}) {
  const type = selectedType();
  if (!type) {
    return;
  }
  const promptItems = promptItemsForType(type.id);
  const referenceDraft = referenceDraftForType(type.id);
  state.pendingAction = type.id;
  state.pendingGeneration = { typeId: type.id, mode: dryRun ? "dry-run" : "generate" };
  state.transientStatus = {
    typeId: type.id,
    message: dryRun ? (screenStatusMessages().generate_dry_run || "Prompt gerado em dry-run.") : (screenStatusMessages().generate_started || "Gerando imagem..."),
  };
  renderDetail();
  try {
    const payload = await callJson("/api/viewer/trucks/generate", {
      method: "POST",
      body: JSON.stringify({
        truck_type_id: type.id,
        prompt_items: promptItems,
        reference_truck_type_id: referenceDraft.referenceTruckTypeId || null,
        reference_aspects: referenceDraft.referenceAspects || [],
        dry_run: dryRun,
        force_regenerate: forceRegenerate,
      }),
    });
    upsertAsset(payload.asset);
    setReviewQueue(payload.review_queue);
    state.promptOverridesByTypeId[type.id] = {
      truck_type_id: type.id,
      prompt_items: [...promptItems],
      reference_truck_type_id: referenceDraft.referenceTruckTypeId || null,
      reference_aspects: [...(referenceDraft.referenceAspects || [])],
      enabled: true,
    };
    state.promptDraftByTypeId[type.id] = [...promptRowsForType(type.id)];
    state.referenceDraftByTypeId[type.id] = {
      referenceTruckTypeId: referenceDraft.referenceTruckTypeId || "",
      referenceAspects: [...(referenceDraft.referenceAspects || [])],
    };
    state.transientStatus = {
      typeId: type.id,
      message: dryRun ? (screenStatusMessages().generate_dry_run || "Prompt gerado em dry-run.") : (screenStatusMessages().generate_success || "Imagem gerada com sucesso."),
    };
  } catch (error) {
    await refreshBootstrap();
    state.transientStatus = {
      typeId: type.id,
      message: String(error?.message || error || "Falha ao gerar a imagem."),
    };
  } finally {
    state.pendingAction = null;
    state.pendingGeneration = null;
    renderHeader();
    renderList();
  }
}

async function reviewSelectedType(decision) {
  const type = selectedType();
  if (!type) {
    return;
  }
  state.pendingAction = type.id;
  renderDetail();
  try {
    const payload = await callJson("/api/viewer/trucks/review", {
      method: "PUT",
      body: JSON.stringify({
        truck_type_id: type.id,
        decision,
      }),
    });
    upsertAsset(payload.asset);
    setReviewQueue(payload.review_queue);
    state.transientStatus = {
      typeId: type.id,
      message: decision === "approved"
        ? (screenStatusMessages().review_approved || "Imagem aprovada.")
        : (screenStatusMessages().review_rejected || "Imagem rejeitada."),
    };
  } catch (error) {
    await refreshBootstrap();
    state.transientStatus = {
      typeId: type.id,
      message: String(error?.message || error || "Falha ao revisar a imagem."),
    };
  } finally {
    state.pendingAction = null;
    renderHeader();
    renderList();
  }
}

function bindColumnResizers() {
  const grid = document.getElementById("truck-gallery-grid");
  Array.from(grid.querySelectorAll("[data-resizer]")).forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = event.clientX;
      const startLeft = parseCssPx("--truck-left-col", 320);
      const startRight = parseCssPx("--truck-right-col", 380);
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
  applyScreenRegistry();
  renderHeader();
  renderFilters();
  renderList();
}

function bindControls() {
  if (state.controlsBound) {
    return;
  }

  document.getElementById("truck-gallery-header-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.actionId === "toggle-theme") {
      toggleTheme();
    }
  });

  document.getElementById("truck-gallery-create-button").addEventListener("click", async () => {
    await createCustomTruck();
  });

  document.getElementById("truck-gallery-search-input").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-size-filter").addEventListener("change", (event) => {
    state.filters.sizeTier = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-vehicle-kind-filter").addEventListener("change", (event) => {
    state.filters.vehicleKind = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-axle-filter").addEventListener("change", (event) => {
    if (String(event.target.value || "") === createOptionValue("axle_config")) {
      event.target.value = state.filters.axleConfig;
      void createCategoryOption("axle_config");
      return;
    }
    state.filters.axleConfig = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-body-filter").addEventListener("change", (event) => {
    if (String(event.target.value || "") === createOptionValue("canonical_body_type_id")) {
      event.target.value = state.filters.bodyId;
      void createCategoryOption("canonical_body_type_id");
      return;
    }
    state.filters.bodyId = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-brand-filter").addEventListener("change", (event) => {
    state.filters.brandFamilyId = event.target.value;
    renderAll();
  });

  document.getElementById("truck-gallery-list").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-item-action='delete']");
    if (deleteButton && !deleteButton.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const typeId = String(deleteButton.dataset.typeId || "").trim();
      if (typeId) {
        void deleteTruckType(typeId);
      }
      return;
    }
    const card = event.target.closest("[data-type-id]");
    if (!card) {
      return;
    }
    state.selectedTypeId = card.dataset.typeId;
    state.transientStatus = null;
    renderList();
  });

  document.getElementById("truck-gallery-detail").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-detail-action]");
    if (!button || button.disabled) {
      return;
    }
    const action = button.dataset.detailAction;
    const type = selectedType();
    if (!type) {
      return;
    }
    if (action === "add-prompt-item") {
      promptRowsForType(type.id).push("");
      renderDetail();
      return;
    }
    if (action === "remove-prompt-item") {
      const index = Number.parseInt(button.dataset.promptIndex || "-1", 10);
      const rows = [...promptRowsForType(type.id)];
      if (Number.isInteger(index) && index >= 0 && index < rows.length) {
        rows.splice(index, 1);
        state.promptDraftByTypeId[type.id] = rows.length ? rows : [""];
        renderDetail();
      }
      return;
    }
    if (action === "reset-prompt") {
      resetPromptRowsForType(type.id);
      renderDetail();
      return;
    }
    if (action === "build-prompt") {
      await buildPromptFromClassification(type.id);
      return;
    }
    if (action === "generate") {
      await generateSelectedType({ dryRun: false, forceRegenerate: false });
      return;
    }
    if (action === "dry-run") {
      await generateSelectedType({ dryRun: true, forceRegenerate: false });
      return;
    }
    if (action === "regenerate") {
      await generateSelectedType({ dryRun: false, forceRegenerate: true });
      return;
    }
    if (action === "approve") {
      await reviewSelectedType("approved");
      return;
    }
    if (action === "reject") {
      await reviewSelectedType("rejected");
    }
  });

  document.getElementById("truck-gallery-detail").addEventListener("input", (event) => {
    const type = selectedType();
    if (!type) {
      return;
    }
    const classificationInput = event.target.closest("[data-classification-field='label']");
    if (classificationInput) {
      type.label = classificationInput.value;
      state.typesById[type.id] = { ...type };
      return;
    }
    const notesInput = event.target.closest("[data-classification-field='notes']");
    if (notesInput) {
      type.notes = notesInput.value;
      state.typesById[type.id] = { ...type };
      return;
    }

    const input = event.target.closest("[data-prompt-index]");
    if (!input) {
      return;
    }
    const index = Number.parseInt(input.dataset.promptIndex || "-1", 10);
    const rows = [...promptRowsForType(type.id)];
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      return;
    }
    rows[index] = input.value;
    state.promptDraftByTypeId[type.id] = rows;
  });

  document.getElementById("truck-gallery-detail").addEventListener("change", (event) => {
    const type = selectedType();
    if (!type) {
      return;
    }
    const classificationSelect = event.target.closest("[data-classification-field]");
    if (classificationSelect) {
      const field = String(classificationSelect.dataset.classificationField || "");
      const createGroup = String(classificationSelect.dataset.createGroup || "");
      const nextValue = String(classificationSelect.value || "").trim();
      if (createGroup && nextValue === createOptionValue(createGroup)) {
        const previousValue = field === "preferred_body_type_id"
          ? String(preferredBodyId(type) || "")
          : String(type[field] || "");
        classificationSelect.value = previousValue;
        void createCategoryOption(createGroup).then((createdId) => {
          if (!createdId) {
            return;
          }
          const freshType = state.typesById[type.id];
          if (!freshType) {
            return;
          }
          if (field === "preferred_body_type_id") {
            freshType.preferred_body_type_id = createdId;
          } else {
            freshType[field] = createdId;
          }
          state.typesById[type.id] = { ...freshType };
          renderList();
          scheduleClassificationSave(type.id, { immediate: true });
        });
        return;
      }
      if (field === "preferred_body_type_id") {
        type.preferred_body_type_id = nextValue;
      } else if (field === "label") {
        type.label = nextValue;
      } else if (field) {
        type[field] = nextValue;
      }
      state.typesById[type.id] = { ...type };
      renderList();
      scheduleClassificationSave(type.id, { immediate: true });
      return;
    }
    const select = event.target.closest("[data-reference-select]");
    if (select) {
      const nextReferenceTruckTypeId = String(select.value || "");
      const nextAspects = nextReferenceTruckTypeId ? ["cabine"] : [];
      state.referenceDraftByTypeId[type.id] = {
        referenceTruckTypeId: nextReferenceTruckTypeId,
        referenceAspects: nextAspects,
      };
      renderDetail();
      return;
    }
    const checkbox = event.target.closest("[data-reference-aspect]");
    if (!checkbox) {
      return;
    }
    const draft = referenceDraftForType(type.id);
    const aspect = String(checkbox.dataset.referenceAspect || "");
    const aspects = new Set(draft.referenceAspects || []);
    if (checkbox.checked) {
      aspects.add(aspect);
    } else {
      aspects.delete(aspect);
    }
    state.referenceDraftByTypeId[type.id] = {
      referenceTruckTypeId: draft.referenceTruckTypeId,
      referenceAspects: Array.from(aspects),
    };
    renderDetail();
  });

  document.getElementById("truck-gallery-detail").addEventListener("keydown", (event) => {
    const type = selectedType();
    const input = event.target.closest("[data-classification-field='label']");
    if (!type || !input || event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    type.label = String(input.value || "").trim() || type.label;
    state.typesById[type.id] = { ...type };
    scheduleClassificationSave(type.id, { immediate: true });
  });

  document.getElementById("truck-gallery-detail").addEventListener("blur", (event) => {
    const type = selectedType();
    const input = event.target.closest("[data-classification-field='label'], [data-classification-field='notes']");
    if (!type || !input) {
      return;
    }
    const field = String(input.dataset.classificationField || "");
    if (field === "label") {
      type.label = String(input.value || "").trim() || type.label;
    }
    if (field === "notes") {
      type.notes = String(input.value || "");
    }
    state.typesById[type.id] = { ...type };
    scheduleClassificationSave(type.id, { immediate: true });
  }, true);

  bindColumnResizers();
  state.controlsBound = true;
}

async function initializeGallery() {
  state.bootstrap = await loadBootstrap();
  buildDerivedData();
  applyTheme(restoreTheme(), { persist: false });
  restoreLayout();
  ensureSelection();
  renderAll();
  bindControls();
}

initializeGallery().catch((error) => {
  console.error("Brasix truck gallery failed to initialize:", error);
  const target = document.getElementById("truck-gallery-list");
  if (target) {
    target.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(String(error?.message || error || "Falha ao carregar a biblioteca."))}</div>`;
  }
});



