import { escapeHtml, numberFormatter } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:runtime-inspector-theme";

const state = {
  theme: restoreTheme(),
  runtime: null,
  loading: false,
  error: null,
  view: "issues",
  jsonSection: "metadata",
};

const JSON_SECTION_OPTIONS = [
  { id: "metadata", label: "Metadata" },
  { id: "validation", label: "Validation" },
  { id: "sources", label: "Sources" },
  { id: "map", label: "Map" },
  { id: "products", label: "Products" },
  { id: "supply", label: "Supply matrix" },
  { id: "demand", label: "Demand matrix" },
  { id: "trucks", label: "Trucks" },
];

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

function formatTimestamp(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("pt-BR");
}

function validationBadgeMarkup() {
  if (!state.runtime?.validation) {
    return "";
  }
  const validation = state.runtime.validation;
  const label = validation.valid ? "Runtime valido" : "Runtime com erros";
  const className = validation.valid ? "runtime-severity-badge is-ok" : "runtime-severity-badge is-error";
  return `<span class="${className}">${escapeHtml(label)}</span>`;
}

function renderHeader() {
  const badgesTarget = document.getElementById("runtime-header-badges");
  const actionsTarget = document.getElementById("runtime-header-actions");
  if (!badgesTarget || !actionsTarget) {
    return;
  }

  const runtime = state.runtime;
  const badges = [];
  if (runtime?.metadata?.map_name) {
    badges.push(`<span class="editor-badge">${escapeHtml(runtime.metadata.map_name)}</span>`);
  }
  if (runtime?.metadata?.generated_at) {
    badges.push(`<span class="editor-badge">${escapeHtml(formatTimestamp(runtime.metadata.generated_at))}</span>`);
  }
  if (runtime?.validation) {
    badges.push(validationBadgeMarkup());
  }
  badgesTarget.innerHTML = badges.join("");

  const toggleLabel = state.theme === "night" ? "Modo diurno" : "Modo noturno";
  const toggleIcon = state.theme === "night" ? "light_mode" : "dark_mode";
  actionsTarget.innerHTML = `
    <a class="editor-header-action" href="/editor/products_v2"><span class="material-symbols-outlined">inventory_2</span><span>Produtos</span></a>
    <a class="editor-header-action" href="/planner/route"><span class="material-symbols-outlined">route</span><span>Rotas</span></a>
    <button class="editor-header-action" type="button" data-action-id="reload"><span class="material-symbols-outlined">refresh</span><span>Atualizar</span></button>
    <button class="editor-header-action" type="button" data-action-id="toggle-theme"><span class="material-symbols-outlined">${toggleIcon}</span><span>${escapeHtml(toggleLabel)}</span></button>
  `;
}

function renderSummary() {
  const target = document.getElementById("runtime-summary");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando runtime consolidado...</p>`;
    return;
  }

  if (state.error || !state.runtime) {
    target.innerHTML = `<p class="route-placeholder">Nao foi possivel montar o panorama do runtime.</p>`;
    return;
  }

  const metadata = state.runtime.metadata;
  target.innerHTML = `
    <div class="runtime-summary-metrics">
      <article class="metric-card"><span>Cidades</span><strong>${formatInt(metadata.city_count)}</strong></article>
      <article class="metric-card"><span>Rotas</span><strong>${formatInt(metadata.route_edge_count)}</strong></article>
      <article class="metric-card"><span>Nos</span><strong>${formatInt(metadata.route_graph_node_count)}</strong></article>
      <article class="metric-card"><span>Produtos</span><strong>${formatInt(metadata.active_product_count)}</strong></article>
      <article class="metric-card"><span>Caminhoes</span><strong>${formatInt(metadata.active_truck_type_count)}</strong></article>
      <article class="metric-card"><span>Versao</span><strong>${escapeHtml(metadata.package_version || "v1")}</strong></article>
    </div>
    <div class="editor-map-load-list runtime-scroll">
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>Mapa ativo</strong>
          <div class="editor-map-load-meta"><span>${escapeHtml(metadata.map_name || "-")}</span><span>${escapeHtml(metadata.map_id || "-")}</span></div>
        </div>
      </article>
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>Uso</strong>
          <div class="editor-map-load-meta"><span>Validar a base do jogo antes de contratos, frete e simulacao.</span></div>
        </div>
      </article>
      <article class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>Gerado em</strong>
          <div class="editor-map-load-meta"><span>${escapeHtml(formatTimestamp(metadata.generated_at))}</span><span>${escapeHtml(metadata.build_source || "-")}</span></div>
        </div>
      </article>
    </div>
  `;
}

function renderValidation() {
  const statusTarget = document.getElementById("runtime-validation-status");
  if (!statusTarget) {
    return;
  }

  if (state.loading) {
    statusTarget.innerHTML = `
      <div class="editor-status-copy">Carregando validacao do runtime...</div>
      <div class="editor-status-meta"><div><span>Status</span><strong>Processando</strong></div></div>
    `;
    return;
  }

  if (state.error || !state.runtime) {
    statusTarget.innerHTML = `
      <div class="editor-status-copy">Falha ao carregar o runtime consolidado.</div>
      <div class="editor-status-meta"><div><span>Erro</span><strong>${escapeHtml(state.error || "Erro desconhecido")}</strong></div></div>
    `;
    return;
  }

  const validation = state.runtime.validation;
  const summaryLabel = validation.valid ? "Runtime consolidado sem erros estruturais." : "Runtime consolidado com problemas estruturais.";
  statusTarget.innerHTML = `
    <div class="editor-status-copy">${escapeHtml(summaryLabel)}</div>
    <div class="editor-status-meta">
      <div><span>Erros</span><strong>${formatInt(validation.error_count)}</strong></div>
      <div><span>Avisos</span><strong>${formatInt(validation.warning_count)}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(validation.valid ? "Valido" : "Invalido")}</strong></div>
    </div>
  `;

}

function renderViewControls() {
  const toggleTarget = document.getElementById("runtime-view-toggle");
  const jsonField = document.getElementById("runtime-json-select-field");
  const jsonSelect = document.getElementById("runtime-json-section-select");
  if (!toggleTarget || !jsonField || !jsonSelect) {
    return;
  }

  toggleTarget.innerHTML = `
    <button class="segmented-button ${state.view === "issues" ? "is-active" : ""}" type="button" data-action-id="show-issues">Erros e avisos</button>
    <button class="segmented-button ${state.view === "json" ? "is-active" : ""}" type="button" data-action-id="show-json">JSON</button>
  `;

  jsonField.hidden = state.view !== "json";
  jsonSelect.innerHTML = JSON_SECTION_OPTIONS.map((option) => (
    `<option value="${option.id}" ${option.id === state.jsonSection ? "selected" : ""}>${escapeHtml(option.label)}</option>`
  )).join("");
}

function issueListMarkup() {
  const validation = state.runtime?.validation;
  if (!validation) {
    return `<p class="route-placeholder">A validacao do runtime nao esta disponivel.</p>`;
  }
  if (!(validation.issues || []).length) {
    return `<p class="route-placeholder">Nenhum erro estrutural detectado no pacote consolidado.</p>`;
  }
  return `<div class="runtime-list runtime-scroll">${(validation.issues || []).map((issue) => `
    <article class="editor-map-load-item runtime-issue-row">
      <div class="editor-map-load-copy">
        <strong>${escapeHtml(issue.message || issue.code || "Issue")}</strong>
        <div class="editor-map-load-meta">
          <span class="runtime-severity-badge ${issue.severity === "error" ? "is-error" : "is-warning"}">${escapeHtml(issue.severity || "warning")}</span>
          <span>${escapeHtml(issue.code || "-")}</span>
          ${issue.path ? `<span>${escapeHtml(issue.path)}</span>` : ""}
        </div>
      </div>
    </article>
  `).join("")}</div>`;
}

function renderSources() {
  const target = document.getElementById("runtime-sources");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando fontes do runtime...</p>`;
    return;
  }

  if (state.error || !state.runtime) {
    target.innerHTML = `<p class="route-placeholder">As fontes do runtime nao puderam ser exibidas.</p>`;
    return;
  }

  const sourceSummary = state.runtime.source_summary || {};
  const items = [
    ["Mapa ativo", `${sourceSummary.active_map_name || "-"} · ${sourceSummary.active_map_id || "-"}`],
    ["Rede", sourceSummary.route_network_id || "-"],
    ["Catalogo de produtos", sourceSummary.product_catalog_id || "-"],
    ["Familias", sourceSummary.product_family_catalog_id || "-"],
    ["Tipos logisticos", sourceSummary.product_logistics_type_catalog_id || "-"],
    ["Oferta", sourceSummary.supply_matrix_id || "-"],
    ["Demanda", sourceSummary.demand_matrix_id || "-"],
    ["Oferta regional", sourceSummary.region_supply_matrix_id || "-"],
    ["Caminhoes", sourceSummary.truck_type_catalog_id || "-"],
    ["Implementos", sourceSummary.truck_body_catalog_id || "-"],
    ["Categorias", sourceSummary.truck_category_catalog_id || "-"],
    ["Operacional", sourceSummary.truck_operational_catalog_id || "-"],
  ];

  target.innerHTML = items.map(([label, value]) => `
    <article class="editor-map-load-item">
      <div class="editor-map-load-copy">
        <strong>${escapeHtml(label)}</strong>
        <div class="editor-map-load-meta"><span>${escapeHtml(value)}</span></div>
      </div>
    </article>
  `).join("");
}

function renderDomains() {
  const target = document.getElementById("runtime-domains");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando dominios do runtime...</p>`;
    return;
  }

  if (state.error || !state.runtime) {
    target.innerHTML = `<p class="route-placeholder">Os dominios nao puderam ser exibidos.</p>`;
    return;
  }

  const { map, products, trucks } = state.runtime;
  const items = [
    ["Mapa", `${formatInt(map.city_count)} cidades · ${formatInt(map.edge_count)} rotas · ${formatInt(map.graph_node_count)} nos`],
    ["Produtos", `${formatInt(products.product_count)} no catalogo · ${formatInt(products.active_product_ids.length)} ativos`],
    ["Matriz de oferta", `${formatInt((products.supply_matrix?.items || []).length)} registros`],
    ["Matriz de demanda", `${formatInt((products.demand_matrix?.items || []).length)} registros`],
    ["Caminhoes", `${formatInt(trucks.truck_type_count)} tipos ativos`],
    ["Implementos", `${formatInt(trucks.body_type_ids.length)} implementos`],
  ];

  target.innerHTML = items.map(([label, value]) => `
    <article class="editor-map-load-item">
      <div class="editor-map-load-copy">
        <strong>${escapeHtml(label)}</strong>
        <div class="editor-map-load-meta"><span>${escapeHtml(value)}</span></div>
      </div>
    </article>
  `).join("");
}

function jsonSectionPayload() {
  const runtime = state.runtime;
  if (!runtime) {
    return null;
  }

  if (state.jsonSection === "metadata") {
    return runtime.metadata;
  }
  if (state.jsonSection === "validation") {
    return runtime.validation;
  }
  if (state.jsonSection === "sources") {
    return runtime.source_summary;
  }
  if (state.jsonSection === "map") {
    return {
      active_map_id: runtime.map.active_map_id,
      active_map_name: runtime.map.active_map_name,
      city_count: runtime.map.city_count,
      graph_node_count: runtime.map.graph_node_count,
      edge_count: runtime.map.edge_count,
      cities_sample: (runtime.map.cities || []).slice(0, 25),
      route_nodes_sample: (runtime.map.route_network?.nodes || []).slice(0, 20),
      route_edges_sample: (runtime.map.route_network?.edges || []).slice(0, 20),
    };
  }
  if (state.jsonSection === "products") {
    return {
      catalog_id: runtime.products.catalog?.id,
      product_count: runtime.products.product_count,
      active_product_ids: (runtime.products.active_product_ids || []).slice(0, 60),
      products_sample: (runtime.products.catalog?.products || []).slice(0, 25),
      family_catalog: runtime.products.family_catalog,
      logistics_type_catalog: runtime.products.logistics_type_catalog,
    };
  }
  if (state.jsonSection === "supply") {
    return {
      id: runtime.products.supply_matrix?.id,
      item_count: (runtime.products.supply_matrix?.items || []).length,
      items_sample: (runtime.products.supply_matrix?.items || []).slice(0, 80),
    };
  }
  if (state.jsonSection === "demand") {
    return {
      id: runtime.products.demand_matrix?.id,
      item_count: (runtime.products.demand_matrix?.items || []).length,
      items_sample: (runtime.products.demand_matrix?.items || []).slice(0, 80),
    };
  }
  if (state.jsonSection === "trucks") {
    return {
      catalog_id: runtime.trucks.type_catalog?.id,
      truck_type_count: runtime.trucks.truck_type_count,
      body_type_ids: runtime.trucks.body_type_ids,
      truck_types_sample: (runtime.trucks.type_catalog?.types || []).slice(0, 30),
      operational_catalog: runtime.trucks.operational_catalog,
      body_catalog: runtime.trucks.body_catalog,
    };
  }

  return runtime;
}

function jsonViewMarkup() {
  const payload = jsonSectionPayload();
  if (!payload) {
    return `<p class="route-placeholder">O payload JSON nao esta disponivel.</p>`;
  }
  return `
    <div class="runtime-json-wrap">
      <pre class="runtime-json-view">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </div>
  `;
}

function renderPanel() {
  const target = document.getElementById("runtime-panel");
  if (!target) {
    return;
  }

  if (state.loading) {
    target.innerHTML = `<p class="route-placeholder">Carregando dados do runtime...</p>`;
    return;
  }

  if (state.error || !state.runtime) {
    target.innerHTML = `<p class="route-placeholder">Nao foi possivel exibir os dados do runtime.</p>`;
    return;
  }

  target.innerHTML = state.view === "json" ? jsonViewMarkup() : issueListMarkup();
}

function renderAll() {
  renderHeader();
  renderSummary();
  renderValidation();
  renderViewControls();
  renderPanel();
  renderSources();
  renderDomains();
}

async function loadRuntime() {
  state.loading = true;
  state.error = null;
  renderAll();

  try {
    const response = await fetch("/api/game/runtime", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state.runtime = await response.json();
  } catch (error) {
    state.runtime = null;
    state.error = error?.message || String(error);
  } finally {
    state.loading = false;
    renderAll();
  }
}

function bindControls() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action-id]") : null;
    if (!target) {
      return;
    }
    const actionId = target.getAttribute("data-action-id");
    if (actionId === "toggle-theme") {
      toggleTheme();
      return;
    }
    if (actionId === "show-issues") {
      state.view = "issues";
      renderAll();
      return;
    }
    if (actionId === "show-json") {
      state.view = "json";
      renderAll();
      return;
    }
    if (actionId === "reload") {
      loadRuntime();
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    if (target.id === "runtime-json-section-select") {
      state.jsonSection = target.value;
      renderPanel();
    }
  });
}

function init() {
  applyTheme(state.theme);
  bindControls();
  renderAll();
  loadRuntime();
}

init();