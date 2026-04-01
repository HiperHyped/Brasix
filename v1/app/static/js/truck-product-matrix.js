import { escapeHtml, numberFormatter } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:truck-product-matrix-theme";

const state = {
  theme: restoreTheme(),
  payload: null,
  loading: false,
  error: null,
  filters: {
    truckSearch: "",
    productSearch: "",
    familyId: "all",
    logisticsTypeId: "all",
    bodyTypeId: "all",
    hideEmptyAxes: true,
  },
  selection: { kind: "overview" },
};

function restoreTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY) === "night" ? "night" : "day";
  } catch (_error) {
    return "day";
  }
}

function persistTheme() {
  try {
    window.localStorage.setItem(THEME_KEY, state.theme);
  } catch (_error) {
    // Optional persistence.
  }
}

function applyTheme(theme) {
  state.theme = theme === "night" ? "night" : "day";
  document.documentElement.dataset.editorTheme = state.theme;
  persistTheme();
  renderHeader();
}

function toggleTheme() {
  applyTheme(state.theme === "night" ? "day" : "night");
}

function formatInt(value) {
  return numberFormatter(0).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1).replace(".", ",")}%`;
}

function formatTimestamp(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("pt-BR");
}

function versionedAssetUrl(rawUrl, versionToken) {
  const normalizedUrl = String(rawUrl || "").trim();
  if (!normalizedUrl) {
    return "";
  }
  const token = String(versionToken || "").trim();
  if (!token) {
    return normalizedUrl;
  }
  const joiner = normalizedUrl.includes("?") ? "&" : "?";
  return `${normalizedUrl}${joiner}v=${encodeURIComponent(token)}`;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function truckRowPreviewMarkup(truck) {
  const previewUrl = versionedAssetUrl(truck.preview_image_url_path, truck.preview_image_version);
  if (previewUrl) {
    return `
      <span class="truck-product-matrix-row-preview" aria-hidden="true">
        <img class="truck-product-matrix-row-preview-image" src="${escapeHtml(previewUrl)}" alt="" loading="lazy" decoding="async" draggable="false" />
      </span>
    `;
  }

  return `<span class="truck-product-matrix-row-preview-fallback" aria-hidden="true">🚚</span>`;
}

function hydratePayload(payload) {
  const hydrated = {
    ...payload,
    products: [...(payload.products || [])],
    trucks: (payload.trucks || []).map((truck) => ({
      ...truck,
      cellsByProductId: Object.fromEntries((truck.cells || []).map((cell) => [cell.product_id, cell])),
    })),
    bodies: [...(payload.bodies || [])],
    families: [...(payload.families || [])],
    logistics_types: [...(payload.logistics_types || [])],
  };

  hydrated.productsById = Object.fromEntries(hydrated.products.map((item) => [item.id, item]));
  hydrated.trucksById = Object.fromEntries(hydrated.trucks.map((item) => [item.id, item]));
  hydrated.bodiesById = Object.fromEntries(hydrated.bodies.map((item) => [item.id, item]));
  return hydrated;
}

async function loadPayload() {
  state.loading = true;
  state.error = null;
  renderAll();

  try {
    const response = await fetch("/api/viewer/truck-product-matrix");
    if (!response.ok) {
      throw new Error(`Falha ao carregar a matriz (${response.status})`);
    }
    state.payload = hydratePayload(await response.json());
  } catch (error) {
    state.error = String(error?.message || error || "Erro desconhecido");
    state.payload = null;
  } finally {
    state.loading = false;
    renderAll();
  }
}

function statusBadgeMarkup() {
  const validation = state.payload?.validation;
  if (!validation) {
    return "";
  }
  if (validation.error_count > 0) {
    return `<span class="truck-product-matrix-badge is-error">Runtime com erros</span>`;
  }
  if (validation.warning_count > 0) {
    return `<span class="truck-product-matrix-badge is-warning">Runtime com avisos</span>`;
  }
  return `<span class="truck-product-matrix-badge is-ok">Runtime valido</span>`;
}

function renderHeader() {
  const badgesTarget = document.getElementById("truck-product-matrix-header-badges");
  const actionsTarget = document.getElementById("truck-product-matrix-header-actions");
  if (!badgesTarget || !actionsTarget) {
    return;
  }

  const badges = [];
  if (state.payload?.map?.name) {
    badges.push(`<span class="editor-badge">${escapeHtml(state.payload.map.name)}</span>`);
  }
  if (state.payload?.summary) {
    badges.push(`<span class="editor-badge">${formatInt(state.payload.summary.truck_type_count)} caminhoes</span>`);
    badges.push(`<span class="editor-badge">${formatInt(state.payload.summary.product_count)} produtos</span>`);
  }
  if (state.payload?.validation) {
    badges.push(statusBadgeMarkup());
  }
  badgesTarget.innerHTML = badges.join("");

  const toggleLabel = state.theme === "night" ? "Modo diurno" : "Modo noturno";
  const toggleIcon = state.theme === "night" ? "light_mode" : "dark_mode";
  actionsTarget.innerHTML = `
    <a class="editor-header-action" href="/viewer/trucks"><span class="material-symbols-outlined">local_shipping</span><span>Caminhoes</span></a>
    <a class="editor-header-action" href="/editor/products_v2"><span class="material-symbols-outlined">inventory_2</span><span>Produtos</span></a>
    <button class="editor-header-action" type="button" data-action-id="reload"><span class="material-symbols-outlined">refresh</span><span>Atualizar</span></button>
    <button class="editor-header-action" type="button" data-action-id="toggle-theme"><span class="material-symbols-outlined">${toggleIcon}</span><span>${escapeHtml(toggleLabel)}</span></button>
  `;
}

function bodyChipsMarkup(labels) {
  if (!(labels || []).length) {
    return `<span class="editor-badge">Sem implemento</span>`;
  }
  return labels.map((label) => `<span class="editor-badge">${escapeHtml(label)}</span>`).join("");
}

function renderSummary() {
  const target = document.getElementById("truck-product-matrix-summary");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando a frota e os produtos ativos...</p>`;
    return;
  }

  if (state.error || !state.payload) {
    target.innerHTML = `<p class="route-placeholder">A matriz nao pode ser resumida agora.</p>`;
    return;
  }

  const summary = state.payload.summary;
  const topLogisticsTypes = [...state.payload.logistics_types]
    .sort((left, right) => right.product_count - left.product_count || right.truck_type_count - left.truck_type_count)
    .slice(0, 6);

  target.innerHTML = `
    <div class="truck-product-matrix-summary-metrics">
      <article class="metric-card"><span>Caminhoes uteis</span><strong>${formatInt(summary.usable_truck_type_count)}</strong></article>
      <article class="metric-card"><span>Produtos cobertos</span><strong>${formatInt(summary.covered_product_count)}</strong></article>
      <article class="metric-card"><span>Compatibilidade</span><strong>${escapeHtml(formatPercent(summary.compatibility_ratio_pct))}</strong></article>
      <article class="metric-card"><span>Lacunas</span><strong>${formatInt(summary.uncovered_product_count)}</strong></article>
    </div>

    <div class="editor-map-load-list truck-product-matrix-detail-scroll">
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>Combinações analisadas</strong>
          <div class="editor-map-load-meta"><span>${formatInt(summary.compatible_pair_count)} compativeis</span><span>${formatInt(summary.incompatible_pair_count)} sem encaixe</span></div>
        </div>
      </article>
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>Gerado em</strong>
          <div class="editor-map-load-meta"><span>${escapeHtml(formatTimestamp(state.payload.generated_at))}</span></div>
        </div>
      </article>
      ${topLogisticsTypes.map((item) => `
        <article class="editor-map-load-item">
          <div class="editor-map-load-copy">
            <strong>${escapeHtml(item.label)}</strong>
            <div class="editor-map-load-meta"><span>${formatInt(item.product_count)} produtos</span><span>${formatInt(item.truck_type_count)} caminhoes</span></div>
            <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(item.body_labels || [])}</div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFilters() {
  const familySelect = document.getElementById("truck-product-matrix-family-filter");
  const logisticsSelect = document.getElementById("truck-product-matrix-logistics-filter");
  const bodySelect = document.getElementById("truck-product-matrix-body-filter");
  const truckSearch = document.getElementById("truck-product-matrix-truck-search");
  const productSearch = document.getElementById("truck-product-matrix-product-search");
  const hideEmptyToggle = document.getElementById("truck-product-matrix-hide-empty-toggle");
  if (!familySelect || !logisticsSelect || !bodySelect || !truckSearch || !productSearch || !hideEmptyToggle) {
    return;
  }

  const familyOptions = [
    `<option value="all">Todas as familias</option>`,
    ...(state.payload?.families || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ];
  const logisticsOptions = [
    `<option value="all">Todos os tipos</option>`,
    ...(state.payload?.logistics_types || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ];
  const bodyOptions = [
    `<option value="all">Todos os implementos</option>`,
    ...(state.payload?.bodies || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ];

  familySelect.innerHTML = familyOptions.join("");
  logisticsSelect.innerHTML = logisticsOptions.join("");
  bodySelect.innerHTML = bodyOptions.join("");

  familySelect.value = state.filters.familyId;
  logisticsSelect.value = state.filters.logisticsTypeId;
  bodySelect.value = state.filters.bodyTypeId;
  truckSearch.value = state.filters.truckSearch;
  productSearch.value = state.filters.productSearch;
  hideEmptyToggle.checked = state.filters.hideEmptyAxes;
}

function truckMatchesFilters(truck) {
  const bodyTypeId = state.filters.bodyTypeId;
  if (bodyTypeId !== "all" && !(truck.body_type_ids || []).includes(bodyTypeId)) {
    return false;
  }

  const needle = normalizeText(state.filters.truckSearch);
  if (!needle) {
    return true;
  }

  const haystack = normalizeText(
    [truck.label, truck.short_label, truck.size_tier, truck.axle_config, ...(truck.body_labels || [])].join(" "),
  );
  return haystack.includes(needle);
}

function productMatchesFilters(product) {
  const bodyTypeId = state.filters.bodyTypeId;
  if (state.filters.familyId !== "all" && product.family_id !== state.filters.familyId) {
    return false;
  }
  if (state.filters.logisticsTypeId !== "all" && product.logistics_type_id !== state.filters.logisticsTypeId) {
    return false;
  }
  if (bodyTypeId !== "all" && !(product.logistics_body_type_ids || []).includes(bodyTypeId)) {
    return false;
  }

  const needle = normalizeText(state.filters.productSearch);
  if (!needle) {
    return true;
  }

  const haystack = normalizeText(
    [product.name, product.short_name, product.family_label, product.logistics_type_label, ...(product.logistics_body_labels || [])].join(" "),
  );
  return haystack.includes(needle);
}

function filteredAxes() {
  if (!state.payload) {
    return { products: [], trucks: [] };
  }

  let products = state.payload.products.filter(productMatchesFilters);
  let trucks = state.payload.trucks.filter(truckMatchesFilters);

  if (state.filters.hideEmptyAxes) {
    const visibleTruckIds = new Set();
    const visibleProductIds = new Set();

    for (const truck of trucks) {
      let truckHasCompatible = false;
      for (const product of products) {
        const compatible = Boolean(truck.cellsByProductId?.[product.id]?.compatible);
        if (compatible) {
          truckHasCompatible = true;
          visibleProductIds.add(product.id);
        }
      }
      if (truckHasCompatible) {
        visibleTruckIds.add(truck.id);
      }
    }

    trucks = trucks.filter((truck) => visibleTruckIds.has(truck.id));
    products = products.filter((product) => visibleProductIds.has(product.id));
  }

  return { products, trucks };
}

function filteredCompatibilityCount(trucks, products) {
  let count = 0;
  for (const truck of trucks) {
    for (const product of products) {
      if (truck.cellsByProductId?.[product.id]?.compatible) {
        count += 1;
      }
    }
  }
  return count;
}

function renderStatusAndSummary(products, trucks) {
  const statusTarget = document.getElementById("truck-product-matrix-status");
  const summaryTarget = document.getElementById("truck-product-matrix-table-summary");
  if (!statusTarget || !summaryTarget) {
    return;
  }

  if (state.loading) {
    statusTarget.innerHTML = `
      <div class="editor-status-copy">Montando a matriz de compatibilidade...</div>
      <div class="editor-status-meta"><div><span>Status</span><strong>Processando</strong></div></div>
    `;
    summaryTarget.innerHTML = "";
    return;
  }

  if (state.error || !state.payload) {
    statusTarget.innerHTML = `
      <div class="editor-status-copy">A matriz nao pode ser exibida.</div>
      <div class="editor-status-meta"><div><span>Erro</span><strong>${escapeHtml(state.error || "Erro desconhecido")}</strong></div></div>
    `;
    summaryTarget.innerHTML = "";
    return;
  }

  const compatibleCount = filteredCompatibilityCount(trucks, products);
  const totalPairs = products.length * trucks.length;
  const ratio = totalPairs ? (compatibleCount / totalPairs) * 100 : 0;
  const validation = state.payload.validation || { error_count: 0, warning_count: 0 };
  statusTarget.innerHTML = `
    <div class="editor-status-copy">Cruze cada produto pelo tipo logistico, pelos implementos aceitos e pelos caminhoes que oferecem esses implementos.</div>
    <div class="editor-status-meta">
      <div><span>Visiveis</span><strong>${formatInt(trucks.length)} x ${formatInt(products.length)}</strong></div>
      <div><span>Compativeis</span><strong>${formatInt(compatibleCount)}</strong></div>
      <div><span>Taxa</span><strong>${escapeHtml(formatPercent(ratio))}</strong></div>
      <div><span>Runtime</span><strong>${formatInt(validation.error_count)} erros / ${formatInt(validation.warning_count)} avisos</strong></div>
    </div>
  `;
  summaryTarget.innerHTML = `<span>${formatInt(trucks.length)} caminhoes</span><span>${formatInt(products.length)} produtos</span><span>${formatInt(compatibleCount)} encaixes</span>`;
}

function detailOverviewMarkup() {
  const trucks = state.payload?.trucks || [];
  const logisticsTypes = [...(state.payload?.logistics_types || [])]
    .sort((left, right) => right.product_count - left.product_count || right.truck_type_count - left.truck_type_count)
    .slice(0, 8);

  return `
    <p class="truck-product-matrix-help">Selecione um caminhao, um produto ou uma celula para ver a cadeia completa produto -> tipo logistico -> implemento -> caminhao.</p>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Caminhoes</p>
        <h2>Existentes hoje</h2>
      </div>
    </div>
    <div class="editor-map-load-list truck-product-matrix-detail-scroll">
      ${trucks.map((truck) => `
        <article class="editor-map-load-item">
          <div class="editor-map-load-copy">
            <strong>${escapeHtml(truck.label)}</strong>
            <div class="editor-map-load-meta"><span>${escapeHtml(truck.axle_config || "-")}</span><span>${formatInt(truck.supported_product_count)} produtos</span></div>
            <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(truck.body_labels || [])}</div>
          </div>
        </article>
      `).join("")}
    </div>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Tipos logisticos</p>
        <h2>Fonte da compatibilidade</h2>
      </div>
    </div>
    <div class="editor-map-load-list truck-product-matrix-detail-scroll is-short">
      ${logisticsTypes.map((item) => `
        <article class="editor-map-load-item">
          <div class="editor-map-load-copy">
            <strong>${escapeHtml(item.label)}</strong>
            <div class="editor-map-load-meta"><span>${formatInt(item.product_count)} produtos</span><span>${formatInt(item.truck_type_count)} caminhoes</span></div>
            <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(item.body_labels || [])}</div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function detailTruckMarkup(truck) {
  const products = (truck.supported_product_ids || [])
    .map((productId) => state.payload.productsById?.[productId])
    .filter(Boolean);

  return `
    <div class="truck-product-matrix-detail-hero">
      <strong>${escapeHtml(truck.label)}</strong>
      <div class="editor-map-load-meta"><span>${escapeHtml(truck.axle_config || "-")}</span><span>${escapeHtml(truck.base_vehicle_kind || "-")}</span><span>${escapeHtml(truck.size_tier || "-")}</span></div>
      <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(truck.body_labels || [])}</div>
    </div>

    <div class="truck-product-matrix-detail-stats">
      <article class="metric-card"><span>Produtos atendidos</span><strong>${formatInt(truck.supported_product_count)}</strong></article>
      <article class="metric-card"><span>Sem encaixe</span><strong>${formatInt(truck.unsupported_product_count)}</strong></article>
    </div>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Atende</p>
        <h2>Produtos servidos</h2>
      </div>
    </div>
    <div class="editor-map-load-list truck-product-matrix-detail-scroll">
      ${products.map((product) => `
        <article class="editor-map-load-item">
          <div class="editor-map-load-copy">
            <strong>${escapeHtml(`${product.emoji || "📦"} ${product.name}`)}</strong>
            <div class="editor-map-load-meta"><span>${escapeHtml(product.family_label || "-")}</span><span>${escapeHtml(product.logistics_type_label || "-")}</span></div>
            <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(product.logistics_body_labels || [])}</div>
          </div>
        </article>
      `).join("") || `<p class="route-placeholder">Nenhum produto compatível com os implementos atuais.</p>`}
    </div>
  `;
}

function detailProductMarkup(product) {
  const trucks = (product.compatible_truck_type_ids || [])
    .map((truckId) => state.payload.trucksById?.[truckId])
    .filter(Boolean);

  return `
    <div class="truck-product-matrix-detail-hero">
      <strong>${escapeHtml(`${product.emoji || "📦"} ${product.name}`)}</strong>
      <div class="editor-map-load-meta"><span>${escapeHtml(product.family_label || "-")}</span><span>${escapeHtml(product.logistics_type_label || "-")}</span></div>
      <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(product.logistics_body_labels || [])}</div>
    </div>

    <div class="truck-product-matrix-detail-stats">
      <article class="metric-card"><span>Caminhoes compativeis</span><strong>${formatInt(product.compatible_truck_count)}</strong></article>
      <article class="metric-card"><span>Implementos do tipo</span><strong>${formatInt((product.logistics_body_type_ids || []).length)}</strong></article>
    </div>

    <div class="editor-map-load-list truck-product-matrix-detail-scroll is-short">
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>${escapeHtml(product.logistics_type_label || "-")}</strong>
          <div class="editor-map-load-meta"><span>Fonte da regra</span><span>Tipo logistico</span></div>
          <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(product.logistics_body_labels || [])}</div>
        </div>
      </article>
    </div>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Aceito por</p>
        <h2>Caminhoes compatíveis</h2>
      </div>
    </div>
    <div class="editor-map-load-list truck-product-matrix-detail-scroll">
      ${trucks.map((truck) => `
        <article class="editor-map-load-item">
          <div class="editor-map-load-copy">
            <strong>${escapeHtml(truck.label)}</strong>
            <div class="editor-map-load-meta"><span>${escapeHtml(truck.axle_config || "-")}</span><span>${escapeHtml(truck.base_vehicle_kind || "-")}</span></div>
            <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(truck.body_labels || [])}</div>
          </div>
        </article>
      `).join("") || `<p class="route-placeholder">Nenhum caminhao consegue atender este produto hoje.</p>`}
    </div>
  `;
}

function detailCellMarkup(truck, product, cell) {
  const compatible = Boolean(cell?.compatible);
  const title = compatible ? "Compatibilidade confirmada" : "Sem compatibilidade";
  const explanation = compatible
    ? `O produto usa o tipo logistico ${product.logistics_type_label}, que aceita ${cell.matched_body_labels.join(", ")}. Este caminhao oferece esse implemento.`
    : `O produto usa o tipo logistico ${product.logistics_type_label}, que aceita ${(product.logistics_body_labels || []).join(", ") || "nenhum implemento"}. Este caminhao oferece ${(truck.body_labels || []).join(", ") || "nenhum implemento"}.`;

  return `
    <div class="truck-product-matrix-detail-hero">
      <strong>${escapeHtml(title)}</strong>
      <div class="editor-map-load-meta"><span>${escapeHtml(truck.label)}</span><span>${escapeHtml(product.name)}</span></div>
    </div>

    <div class="truck-product-matrix-cell-state ${compatible ? "is-compatible" : "is-incompatible"}">
      <strong>${escapeHtml(explanation)}</strong>
      <div class="truck-product-matrix-chip-list">
        ${compatible ? bodyChipsMarkup(cell.matched_body_labels || []) : `<span class="editor-badge">Sem implemento compativel</span>`}
      </div>
    </div>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Caminhao</p>
        <h2>${escapeHtml(truck.label)}</h2>
      </div>
    </div>
    <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(truck.body_labels || [])}</div>

    <div class="section-head truck-product-matrix-subhead">
      <div>
        <p class="eyebrow">Produto</p>
        <h2>${escapeHtml(product.name)}</h2>
      </div>
    </div>
    <div class="editor-map-load-meta"><span>${escapeHtml(product.logistics_type_label || "-")}</span><span>${escapeHtml(product.logistics_type_description || "-")}</span></div>
    <div class="truck-product-matrix-chip-list">${bodyChipsMarkup(product.logistics_body_labels || [])}</div>
  `;
}

function renderDetail() {
  const target = document.getElementById("truck-product-matrix-detail");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando detalhes da compatibilidade...</p>`;
    return;
  }

  if (state.error || !state.payload) {
    target.innerHTML = `<p class="route-placeholder">Os detalhes nao podem ser exibidos.</p>`;
    return;
  }

  if (state.selection.kind === "truck") {
    const truck = state.payload.trucksById?.[state.selection.truckId];
    target.innerHTML = truck ? detailTruckMarkup(truck) : detailOverviewMarkup();
    return;
  }

  if (state.selection.kind === "product") {
    const product = state.payload.productsById?.[state.selection.productId];
    target.innerHTML = product ? detailProductMarkup(product) : detailOverviewMarkup();
    return;
  }

  if (state.selection.kind === "cell") {
    const truck = state.payload.trucksById?.[state.selection.truckId];
    const product = state.payload.productsById?.[state.selection.productId];
    const cell = truck?.cellsByProductId?.[state.selection.productId];
    target.innerHTML = truck && product && cell ? detailCellMarkup(truck, product, cell) : detailOverviewMarkup();
    return;
  }

  target.innerHTML = detailOverviewMarkup();
}

function isSelectedCell(truckId, productId) {
  return state.selection.kind === "cell" && state.selection.truckId === truckId && state.selection.productId === productId;
}

function isSelectedTruck(truckId) {
  return state.selection.kind === "truck" && state.selection.truckId === truckId;
}

function isSelectedProduct(productId) {
  return state.selection.kind === "product" && state.selection.productId === productId;
}

function tableMarkup(products, trucks) {
  return `
    <table class="truck-product-matrix-table">
      <thead>
        <tr>
          <th class="truck-product-matrix-corner">Caminhoes atuais</th>
          ${products.map((product) => {
            const visibleCompatibleTruckCount = trucks.filter((truck) => truck.cellsByProductId?.[product.id]?.compatible).length;
            return `
              <th class="truck-product-matrix-col-head">
                <button class="truck-product-matrix-col-button ${isSelectedProduct(product.id) ? "is-selected" : ""}" type="button" data-product-id="${escapeHtml(product.id)}">
                  <span class="truck-product-matrix-col-emoji">${escapeHtml(product.emoji || "📦")}</span>
                  <span class="truck-product-matrix-col-label">${escapeHtml(product.short_name || product.name)}</span>
                  <span class="truck-product-matrix-col-meta">${formatInt(visibleCompatibleTruckCount)} compativeis</span>
                </button>
              </th>
            `;
          }).join("")}
        </tr>
      </thead>
      <tbody>
        ${trucks.map((truck) => {
          return `
            <tr>
              <th class="truck-product-matrix-row-head">
                <button class="truck-product-matrix-row-button ${isSelectedTruck(truck.id) ? "is-selected" : ""}" type="button" data-truck-id="${escapeHtml(truck.id)}">
                  <span class="truck-product-matrix-row-label">${escapeHtml(truck.label || truck.short_label || truck.id)}</span>
                  ${truckRowPreviewMarkup(truck)}
                </button>
              </th>
              ${products.map((product) => {
                const cell = truck.cellsByProductId?.[product.id] || { compatible: false, matched_body_type_ids: [], matched_body_labels: [] };
                const compatible = Boolean(cell.compatible);
                const buttonTitle = compatible
                  ? `${truck.label} atende ${product.name} via ${cell.matched_body_labels.join(", ")}`
                  : `${truck.label} nao atende ${product.name}`;
                const selected = isSelectedCell(truck.id, product.id);
                return `
                  <td>
                    <button
                      class="truck-product-matrix-table-cell ${compatible ? "is-compatible" : "is-incompatible"} ${selected ? "is-selected" : ""}"
                      type="button"
                      title="${escapeHtml(buttonTitle)}"
                      aria-label="${escapeHtml(buttonTitle)}"
                      data-truck-id="${escapeHtml(truck.id)}"
                      data-product-id="${escapeHtml(product.id)}"
                    >
                      <span class="truck-product-matrix-table-cell-count">${compatible ? escapeHtml(String((cell.matched_body_type_ids || []).length)) : ""}</span>
                    </button>
                  </td>
                `;
              }).join("")}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderTable() {
  const target = document.getElementById("truck-product-matrix-table-wrap");
  if (!target) {
    return;
  }

  if (state.loading) {
    renderStatusAndSummary([], []);
    target.innerHTML = `<p class="route-placeholder">Carregando a matriz de compatibilidade...</p>`;
    return;
  }

  if (state.error || !state.payload) {
    renderStatusAndSummary([], []);
    target.innerHTML = `<p class="route-placeholder">A tabela nao pode ser montada.</p>`;
    return;
  }

  const { products, trucks } = filteredAxes();
  renderStatusAndSummary(products, trucks);

  if (!products.length || !trucks.length) {
    target.innerHTML = `<p class="route-placeholder">Nenhum cruzamento disponivel com os filtros atuais.</p>`;
    return;
  }

  target.innerHTML = tableMarkup(products, trucks);
}

function renderAll() {
  renderHeader();
  renderSummary();
  renderFilters();
  renderDetail();
  renderTable();
}

function handleClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const actionButton = event.target.closest("[data-action-id]");
  if (actionButton) {
    const actionId = actionButton.getAttribute("data-action-id");
    if (actionId === "toggle-theme") {
      toggleTheme();
      return;
    }
    if (actionId === "reload") {
      loadPayload();
      return;
    }
  }

  const rowButton = event.target.closest("[data-truck-id]:not([data-product-id])");
  if (rowButton) {
    state.selection = { kind: "truck", truckId: rowButton.getAttribute("data-truck-id") || "" };
    renderAll();
    return;
  }

  const columnButton = event.target.closest("[data-product-id]:not([data-truck-id])");
  if (columnButton) {
    state.selection = { kind: "product", productId: columnButton.getAttribute("data-product-id") || "" };
    renderAll();
    return;
  }

  const cellButton = event.target.closest("[data-truck-id][data-product-id]");
  if (cellButton) {
    state.selection = {
      kind: "cell",
      truckId: cellButton.getAttribute("data-truck-id") || "",
      productId: cellButton.getAttribute("data-product-id") || "",
    };
    renderAll();
  }
}

function handleFilterInput() {
  const truckSearch = document.getElementById("truck-product-matrix-truck-search");
  const productSearch = document.getElementById("truck-product-matrix-product-search");
  const familySelect = document.getElementById("truck-product-matrix-family-filter");
  const logisticsSelect = document.getElementById("truck-product-matrix-logistics-filter");
  const bodySelect = document.getElementById("truck-product-matrix-body-filter");
  const hideEmptyToggle = document.getElementById("truck-product-matrix-hide-empty-toggle");
  if (!truckSearch || !productSearch || !familySelect || !logisticsSelect || !bodySelect || !hideEmptyToggle) {
    return;
  }

  state.filters.truckSearch = truckSearch.value || "";
  state.filters.productSearch = productSearch.value || "";
  state.filters.familyId = familySelect.value || "all";
  state.filters.logisticsTypeId = logisticsSelect.value || "all";
  state.filters.bodyTypeId = bodySelect.value || "all";
  state.filters.hideEmptyAxes = hideEmptyToggle.checked;
  renderAll();
}

function bindEvents() {
  document.addEventListener("click", handleClick);

  const filterIds = [
    "truck-product-matrix-truck-search",
    "truck-product-matrix-product-search",
    "truck-product-matrix-family-filter",
    "truck-product-matrix-logistics-filter",
    "truck-product-matrix-body-filter",
    "truck-product-matrix-hide-empty-toggle",
  ];

  for (const id of filterIds) {
    const element = document.getElementById(id);
    if (!element) {
      continue;
    }
    element.addEventListener("input", handleFilterInput);
    element.addEventListener("change", handleFilterInput);
  }
}

function init() {
  bindEvents();
  applyTheme(state.theme);
  loadPayload();
}

init();