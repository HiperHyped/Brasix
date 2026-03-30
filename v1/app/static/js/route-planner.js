import { BRASIX_SYNC_KEY, readSyncToken } from "./shared/app-sync.js";
import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  createGraphNodeMarker,
  createRouteLayer,
  findPopulationBand,
  fitBrasixBounds,
  renderPopulationLegend,
  sortPopulationBands,
} from "./shared/leaflet-map.js?v=20260327-route-legend-1";
import { escapeHtml, numberFormatter } from "./shared/formatters.js";

const LAYOUT_KEY = "brasix:v1:route-planner-layout";
const THEME_KEY = "brasix:v1:route-planner-theme";
const BAND_COLORS = ["#2d5a27", "#4d7c39", "#7b7b2d", "#8c4f10", "#a85d2a", "#2b6f8f"];

const state = {
  bootstrap: null,
  screen: null,
  shortcuts: null,
  themesDocument: null,
  themesById: {},
  activeThemeId: null,
  map: null,
  markerLayer: null,
  routeLayer: null,
  highlightLayer: null,
  citiesById: {},
  graphNodesById: {},
  nodesById: {},
  pinsById: {},
  surfaceTypesById: {},
  populationBands: [],
  selectedMapId: null,
  loadedMapId: null,
  routeMode: "shortest",
  originNodeId: "",
  destinationNodeId: "",
  stopRows: [],
  pickMode: null,
  plannedRoute: null,
  highlightedEdgeIds: new Set(),
  controlsBound: false,
  syncToken: null,
  planTimer: null,
  planRequestSeq: 0,
};

function reportPlannerError(error) {
  const message = error?.message || String(error);
  console.error("Brasix route planner failed to initialize:", error);
  const statusTarget = document.getElementById("planner-status");
  if (statusTarget) {
    statusTarget.innerHTML = `
      <div class="editor-status-copy">Falha ao carregar o planejador.</div>
      <div class="editor-status-meta">
        <div><span>Erro</span><strong>${escapeHtml(message)}</strong></div>
      </div>
    `;
  }
}

function labels() { return state.screen?.labels || {}; }
function errors() { return state.screen?.errors || {}; }
function messages() { return state.screen?.status_messages || {}; }
function activeMap() { return state.bootstrap?.map_repository?.active_map || null; }
function routeSurfaceType(id) { return state.surfaceTypesById[id] || null; }
function displaySettings() { return state.bootstrap?.map_editor?.display_settings || {}; }
function displayRouteRender() { return displaySettings().route_render || {}; }
function loadedMapId() { return state.loadedMapId || state.bootstrap?.map_repository?.active_map_id || null; }
function hasLoadedMap() { return Boolean(loadedMapId() && Object.keys(state.citiesById).length); }
function loadMapPrompt() { return "Carregue um mapa para listar as cidades do planejamento."; }

function formatDuration(hoursValue) {
  const totalMinutes = Math.max(0, Math.round(Number(hoursValue || 0) * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return minutes > 0
      ? `${days} d ${hours} h ${minutes} min`
      : `${days} d ${hours} h`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  return `${minutes} min`;
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
        reject(new Error("Leaflet não carregou a tempo para o planejador."));
      }
    }, 50);
  });
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currentTheme() {
  const defaultId = state.themesDocument?.default_theme_id;
  return state.themesById[state.activeThemeId] || state.themesById[defaultId] || Object.values(state.themesById)[0] || null;
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
  applyCssVariables(state.bootstrap?.ui?.design_tokens?.css_variables || {});
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
  renderRouteDetails();
  renderMap();
}

function normalizeLayout() {
  const grid = document.getElementById("planner-grid");
  if (!grid) {
    return;
  }
  const gridWidth = grid.getBoundingClientRect().width;
  const resizerWidth = parseCssPx("--planner-resizer-width", 10);
  const gap = parseCssPx("--planner-panel-gap", 12) * 4;
  const minSide = parseCssPx("--planner-side-min-col", 280);
  const minMap = parseCssPx("--planner-map-min-col", 640);
  let left = parseCssPx("--planner-left-col", 348);
  let right = parseCssPx("--planner-right-col", 372);
  const sideBudget = Math.max(minSide * 2, gridWidth - (resizerWidth * 2) - gap - minMap);
  left = clamp(left, minSide, Math.max(minSide, sideBudget - minSide));
  right = clamp(right, minSide, Math.max(minSide, sideBudget - left));
  left = clamp(left, minSide, Math.max(minSide, sideBudget - right));
  setCssPx("--planner-left-col", left);
  setCssPx("--planner-right-col", right);
}

function restoreLayout() {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Number.isFinite(stored.left_col_px)) {
        setCssPx("--planner-left-col", stored.left_col_px);
      }
      if (Number.isFinite(stored.right_col_px)) {
        setCssPx("--planner-right-col", stored.right_col_px);
      }
    }
  } catch (_error) {
    // Optional persistence.
  }
  normalizeLayout();
}

function persistLayout() {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      left_col_px: parseCssPx("--planner-left-col", 348),
      right_col_px: parseCssPx("--planner-right-col", 372),
    }));
  } catch (_error) {
    // Optional persistence.
  }
}

function invalidateMap() {
  if (!state.map) {
    return;
  }
  window.requestAnimationFrame(() => state.map.invalidateSize());
}

function loadBootstrap() {
  return fetch("/api/planner/route/bootstrap").then((response) => response.json());
}

function statusBox(message) {
  const target = document.getElementById("planner-status");
  if (!target) {
    return;
  }
  const active = activeMap();
  const pointCount = [state.originNodeId, ...state.stopRows.map((row) => row.node_id).filter(Boolean), state.destinationNodeId]
    .filter(Boolean)
    .length;
  const totalKm = state.plannedRoute?.total_distance_km || 0;
  const totalTime = state.plannedRoute?.total_duration_hours || 0;
  target.innerHTML = `
    <div class="editor-status-copy">${escapeHtml(message)}</div>
    <div class="editor-status-meta">
      <div><span>${escapeHtml(labels().active_map_label || "Mapa ativo")}</span><strong>${escapeHtml(active?.name || "-")}</strong></div>
      <div><span>Pontos</span><strong>${numberFormatter(0).format(pointCount)}</strong></div>
      <div><span>Total</span><strong>${numberFormatter(0).format(totalKm)} km · ${escapeHtml(formatDuration(totalTime))}</strong></div>
    </div>
  `;
}

function stopRow(nodeId = "") {
  return { id: `planner_stop_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`, node_id: nodeId };
}

function bandColor(band) {
  const index = Math.max(0, state.populationBands.findIndex((item) => item.id === band?.id));
  return BAND_COLORS[index % BAND_COLORS.length];
}

function cityRole(cityId) {
  if (cityId === state.originNodeId) return "origin";
  if (cityId === state.destinationNodeId) return "destination";
  if (state.stopRows.some((row) => row.node_id === cityId)) return "stop";
  return "neutral";
}

function cityColor(city) {
  const role = cityRole(city.id);
  if (role === "origin") return "#2d5a27";
  if (role === "destination") return "#4f8593";
  if (role === "stop") return "#8c4f10";
  return bandColor(findPopulationBand(city, state.populationBands));
}

function graphNodeStyle(node) {
  const styles = state.bootstrap.map_editor.graph_node_styles.styles || [];
  return styles.find((item) => item.id === node.style_id) || {
    fill_color: "#8c4f10",
    stroke_color: "#fff9ea",
    stroke_width_px: 2,
    shape: "solid_diamond",
    size_px: 16,
    inner_scale: 0,
  };
}

function routeSurfaceBadgeMarkup(surfaceType) {
  const style = surfaceType?.style || {};
  const selectedColor = displayRouteRender().selected_color || "#bc7329";
  const baseColor = style.base_color || "#4f6f45";
  const overlayColor = style.overlay_color;
  const dashArray = style.dash_array || "";
  const label = `${surfaceType?.label || "Rota"}${surfaceType?.shortcut_key ? ` (${surfaceType.shortcut_key})` : ""}`;
  const svg = `
    <svg width="34" height="12" viewBox="0 0 34 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="2" y1="6" x2="32" y2="6" stroke="${baseColor}" stroke-width="6" stroke-linecap="round" ${dashArray ? `stroke-dasharray="${dashArray}"` : ""} />
      ${overlayColor ? `<line x1="2" y1="6" x2="32" y2="6" stroke="${overlayColor}" stroke-width="2" stroke-linecap="round" ${dashArray ? `stroke-dasharray="${dashArray}"` : ""} />` : ""}
    </svg>
  `;
  return `
    <span class="planner-step-surface-pill" style="--planner-step-surface-accent:${selectedColor};">
      <span class="planner-step-surface-icon">${svg}</span>
      <span class="planner-step-surface-label">${escapeHtml(label)}</span>
    </span>
  `;
}

function buildDerivedData() {
  state.screen = state.bootstrap.route_planner.screen;
  state.shortcuts = state.bootstrap.route_planner.shortcuts;
  state.themesDocument = state.bootstrap.route_planner.themes;
  state.themesById = Object.fromEntries((state.themesDocument?.themes || []).map((theme) => [theme.id, theme]));
  state.populationBands = sortPopulationBands(state.bootstrap.map_editor.population_bands.bands || []);
  state.pinsById = Object.fromEntries((state.bootstrap.map_editor.pin_library.pins || []).map((pin) => [pin.id, pin]));
  state.surfaceTypesById = Object.fromEntries((state.bootstrap.map_editor.route_surface_types.types || []).map((item) => [item.id, item]));
  state.citiesById = Object.fromEntries((state.bootstrap.cities || []).map((city) => [city.id, city]));
  state.graphNodesById = Object.fromEntries((state.bootstrap.route_network.nodes || []).map((node) => [node.id, node]));
  state.nodesById = { ...state.citiesById, ...state.graphNodesById };
}

function applyScreenRegistry() {
  (state.screen?.components || []).forEach((component) => {
    const target = document.getElementById(component.dom_target_id);
    if (target) {
      target.textContent = component.text;
    }
  });
}

function optionMarkup(selectedValue, emptyLabel) {
  const cities = Object.values(state.citiesById).sort((left, right) => left.label.localeCompare(right.label));
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...cities.map((city) => `<option value="${city.id}" ${city.id === selectedValue ? "selected" : ""}>${escapeHtml(city.label)}</option>`),
  ].join("");
}

function routePointIds() {
  return [
    state.originNodeId,
    ...state.stopRows.map((row) => row.node_id).filter(Boolean),
    state.destinationNodeId,
  ].filter(Boolean);
}

function applyRoutePointIds(pointIds) {
  const normalized = (pointIds || []).filter(Boolean);
  state.originNodeId = normalized[0] || "";
  state.destinationNodeId = normalized.length > 1 ? normalized[normalized.length - 1] : "";
  const stopIds = normalized.length > 2 ? normalized.slice(1, -1) : [];
  state.stopRows = stopIds.map((nodeId) => stopRow(nodeId));
}

function renderHeader() {
  const theme = currentTheme();
  const actions = (state.screen.header_actions || []).map((action) => (
    action.action === "toggle-theme"
      ? { ...action, label: theme?.toggle_action_label || action.label, icon: theme?.toggle_action_icon || action.icon }
      : action
  ));
  document.getElementById("planner-header-actions").innerHTML = actions.map((action) => (
    action.href
      ? `<a class="editor-header-action" href="${action.href}"><span class="material-symbols-outlined">${action.icon}</span><span>${escapeHtml(action.label)}</span></a>`
      : `<button class="editor-header-action" type="button" data-action-id="${action.action}"><span class="material-symbols-outlined">${action.icon}</span><span>${escapeHtml(action.label)}</span></button>`
  )).join("");
  document.getElementById("planner-header-badges").innerHTML = activeMap() ? `<span class="editor-badge">${escapeHtml(activeMap().name)}</span>` : "";
}

function renderShortcutsDialog() {
  document.getElementById("planner-shortcuts-copy").textContent = state.screen.dialog?.shortcuts_copy || "";
  document.getElementById("planner-shortcuts-close-button").textContent = state.screen.dialog?.close_button_label || "Fechar";
  document.getElementById("planner-shortcuts-list").innerHTML = (state.shortcuts.items || []).map((item) => `
    <div class="shortcut-row"><kbd>${escapeHtml(item.key)}</kbd><span>${escapeHtml(item.description)}</span></div>
  `).join("");
}

function renderForm() {
  const routeReady = hasLoadedMap();
  const plannerMapSelect = document.getElementById("planner-map-select");
  const originSelect = document.getElementById("planner-origin-select");
  const destinationSelect = document.getElementById("planner-destination-select");
  const addStopButton = document.getElementById("planner-add-stop-button");

  document.getElementById("planner-map-select-label").textContent = labels().map_select_label || "Mapa";
  document.getElementById("planner-origin-label").textContent = labels().origin_label || "Origem";
  document.getElementById("planner-destination-label").textContent = labels().destination_label || "Destino";
  document.getElementById("planner-stops-label").textContent = labels().stops_label || "Paradas intermediarias";
  document.getElementById("planner-add-stop-button").textContent = labels().add_stop_label || "Adicionar parada";
  plannerMapSelect.innerHTML = (state.bootstrap.map_repository.maps || []).map((item) => (
    `<option value="${item.id}" ${item.id === state.selectedMapId ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  )).join("");
  document.getElementById("planner-route-mode-toggle").innerHTML = `
    <button class="segmented-button ${state.routeMode === "shortest" ? "is-active" : ""}" type="button" data-route-mode="shortest">
      <span>${escapeHtml(labels().route_mode_shortest_label || "Mais curta")}</span>
    </button>
    <button class="segmented-button ${state.routeMode === "fastest" ? "is-active" : ""}" type="button" data-route-mode="fastest">
      <span>${escapeHtml(labels().route_mode_fastest_label || "Mais rapida")}</span>
    </button>
  `;
  originSelect.disabled = !routeReady;
  destinationSelect.disabled = !routeReady;
  addStopButton.disabled = !routeReady;
  originSelect.innerHTML = routeReady
    ? optionMarkup(state.originNodeId, labels().empty_city_label || "Escolha uma cidade")
    : `<option value="">${escapeHtml(loadMapPrompt())}</option>`;
  destinationSelect.innerHTML = routeReady
    ? optionMarkup(state.destinationNodeId, labels().empty_city_label || "Escolha uma cidade")
    : `<option value="">${escapeHtml(loadMapPrompt())}</option>`;
  renderStopList();
}

function renderStopList() {
  const target = document.getElementById("planner-stop-list");
  if (!hasLoadedMap()) {
    target.innerHTML = `<p class="route-placeholder">${escapeHtml(loadMapPrompt())}</p>`;
    return;
  }
  if (!state.stopRows.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = state.stopRows.map((row, index) => `
    <div class="planner-stop-row" data-stop-row-id="${row.id}">
      <label class="field">
        <span>${escapeHtml(`${labels().stop_label || "Parada"} ${index + 1}`)}</span>
        <div class="select-shell">
          <select class="editor-input" data-stop-field="node_id">${optionMarkup(row.node_id, labels().empty_stop_label || "Escolha uma parada")}</select>
          <span class="material-symbols-outlined">expand_more</span>
        </div>
      </label>
      <div class="planner-stop-actions">
        <button class="ghost-button planner-stop-icon-button" type="button" data-stop-action="move-up" ${index === 0 ? "disabled" : ""} title="${escapeHtml(labels().move_point_up_label || "Subir")}">
          <span class="material-symbols-outlined">keyboard_arrow_up</span>
        </button>
        <button class="ghost-button planner-stop-icon-button" type="button" data-stop-action="move-down" ${index === state.stopRows.length - 1 ? "disabled" : ""} title="${escapeHtml(labels().move_point_down_label || "Descer")}">
          <span class="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
        <button class="ghost-button planner-stop-icon-button planner-stop-remove" type="button" data-stop-action="remove" title="${escapeHtml(labels().remove_stop_label || "Remover")}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `).join("");
}

function renderRouteDetails() {
  const summaryTarget = document.getElementById("planner-route-summary");
  const legsTarget = document.getElementById("planner-route-legs");
  const plan = state.plannedRoute;
  if (!plan) {
    summaryTarget.innerHTML = `
      <div class="planner-summary-card planner-summary-card-empty">
        <p class="route-placeholder">${escapeHtml(labels().route_empty_label || "Defina origem, destino e paradas para calcular a rota.")}</p>
      </div>
    `;
    legsTarget.innerHTML = "";
    return;
  }

  summaryTarget.innerHTML = `
    <div class="planner-summary-metrics">
      <article class="metric-card">
        <span>${escapeHtml(labels().route_total_distance_label || "Distancia total")}</span>
        <strong>${numberFormatter(0).format(plan.total_distance_km)} km</strong>
      </article>
      <article class="metric-card">
        <span>${escapeHtml(labels().route_total_time_label || "Tempo total")}</span>
        <strong>${escapeHtml(formatDuration(plan.total_duration_hours))}</strong>
      </article>
    </div>
  `;

  legsTarget.innerHTML = (plan.legs || []).map((leg) => `
    <section class="planner-leg-card">
      <div class="planner-leg-head">
        <div>
          <p class="eyebrow">Perna ${leg.index}</p>
          <h3>${escapeHtml(leg.start_label)} -> ${escapeHtml(leg.end_label)}</h3>
        </div>
        <div class="planner-leg-metrics">
          <span>${numberFormatter(1).format(leg.distance_km)} km</span>
          <small>${escapeHtml(labels().route_leg_duration_label || "Tempo")}: ${escapeHtml(formatDuration(leg.duration_hours))}</small>
        </div>
      </div>
      <div class="planner-leg-steps">
        ${(leg.steps || []).map((step) => {
          const surface = routeSurfaceType(step.surface_type_id);
          return `
            <div class="planner-step-row">
              <div class="planner-step-copy">
                <strong>${escapeHtml(step.from_label)} -> ${escapeHtml(step.to_label)}</strong>
                <div class="planner-step-meta">
                  ${routeSurfaceBadgeMarkup(surface || { label: step.surface_label, shortcut_key: step.surface_shortcut_key, style: {} })}
                  <span class="planner-step-distance">${numberFormatter(1).format(step.distance_km)} ${escapeHtml(labels().route_step_distance_label || "km")}</span>
                  <span class="planner-step-duration">${escapeHtml(formatDuration(step.duration_hours))}</span>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function initializeMap() {
  if (state.map) {
    invalidateMap();
    return;
  }
  state.map = createBrasixMap({
    elementId: "planner-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap.map_editor.leaflet_settings,
  });
  state.routeLayer = window.L.layerGroup().addTo(state.map);
  state.highlightLayer = window.L.layerGroup().addTo(state.map);
  state.markerLayer = window.L.layerGroup().addTo(state.map);
  state.map.on("click", () => {
    if (state.pickMode) {
      statusBox(messages().pick_invalid_target || "Os atalhos do planejador aceitam apenas cidades.");
    }
  });
  invalidateMap();
}

function renderMap() {
  initializeMap();
  applyBrasixLeafletSettings(state.map, state.bootstrap.map_viewport, state.bootstrap.map_editor.leaflet_settings);
  const routeRender = displayRouteRender();
  const routeStyleOverrides = {
    opacityScale: Number(routeRender.opacity_scale || 1),
    highlightColor: routeRender.highlight_color || "#41c63f",
    selectedColor: routeRender.selected_color || "#bc7329",
  };
  state.routeLayer.clearLayers();
  state.highlightLayer.clearLayers();
  state.markerLayer.clearLayers();

  (state.bootstrap.route_network.edges || []).forEach((edge) => {
    const layer = createRouteLayer({
      edge,
      citiesById: state.nodesById,
      surfaceType: routeSurfaceType(edge.surface_type_id),
      role: "network",
      styleOverrides: routeStyleOverrides,
    });
    if (layer) {
      layer.addTo(state.routeLayer);
    }
  });

  (state.bootstrap.route_network.edges || [])
    .filter((edge) => state.highlightedEdgeIds.has(edge.id))
    .forEach((edge) => {
      const layer = createRouteLayer({
        edge,
        citiesById: state.nodesById,
        surfaceType: routeSurfaceType(edge.surface_type_id),
        role: "highlight",
        styleOverrides: routeStyleOverrides,
      });
      if (layer) {
        layer.addTo(state.highlightLayer);
      }
    });

  Object.values(state.citiesById).forEach((city) => {
    const band = findPopulationBand(city, state.populationBands);
    const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]];
    const marker = createCityMarker({
      city,
      band,
      pin,
      fillColor: cityColor(city),
      selected: cityRole(city.id) !== "neutral",
      opacity: 0.96,
    });
    marker.bindTooltip(
      `<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(city.source_region_name)}<br>Populacao: ${numberFormatter(0).format(city.population_thousands)} mil`,
      { className: "brasix-map-tooltip", direction: "top", offset: [0, -8], sticky: true },
    );
    marker.on("click", () => handleCityMapSelection(city.id));
    marker.on("contextmenu", (event) => {
      event.originalEvent?.preventDefault?.();
      event.originalEvent?.stopPropagation?.();
      removeCityFromRoute(city.id);
    });
    marker.addTo(state.markerLayer);
  });

  Object.values(state.graphNodesById).forEach((node) => {
    const marker = createGraphNodeMarker({
      node,
      style: graphNodeStyle(node),
      selected: false,
      opacity: 0.76,
    });
    marker.bindTooltip(`<strong>${escapeHtml(node.label)}</strong><br>No de ligacao`, {
      className: "brasix-map-tooltip",
      direction: "top",
      offset: [0, -8],
      sticky: true,
    });
    marker.addTo(state.markerLayer);
  });

  renderPopulationLegend(document.getElementById("planner-route-legend"), {
    cities: Object.values(state.citiesById),
    bands: state.populationBands,
    pinsById: state.pinsById,
    fillColorResolver: bandColor,
    routeSurfaceTypes: Object.values(state.surfaceTypesById),
  });
  invalidateMap();
}

function plannerPayload() {
  return {
    route_mode: state.routeMode,
    origin_node_id: state.originNodeId,
    destination_node_id: state.destinationNodeId,
    stop_node_ids: state.stopRows.map((row) => row.node_id).filter(Boolean),
  };
}

function clearPlan(message) {
  state.plannedRoute = null;
  state.highlightedEdgeIds = new Set();
  renderRouteDetails();
  renderMap();
  statusBox(message);
}

async function planRouteNow() {
  if (!hasLoadedMap()) {
    clearPlan(loadMapPrompt());
    return;
  }
  if (!state.originNodeId || !state.destinationNodeId) {
    clearPlan(messages().route_cleared || messages().idle || "Defina origem e destino para montar a rota.");
    return;
  }
  if (state.originNodeId === state.destinationNodeId) {
    clearPlan(errors().origin_destination_same || "Origem e destino precisam ser diferentes.");
    return;
  }

  const requestId = ++state.planRequestSeq;
  statusBox(messages().planning || "Calculando o melhor caminho na malha atual...");
  const response = await fetch("/api/planner/route/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plannerPayload()),
  });
  const payload = await response.json().catch(() => ({}));
  if (requestId !== state.planRequestSeq) {
    return;
  }
  if (!response.ok) {
    clearPlan(payload.detail || errors().plan_failed || "Nao foi possivel calcular a rota nesse mapa.");
    return;
  }
  state.plannedRoute = payload;
  state.highlightedEdgeIds = new Set(payload.edge_ids || []);
  renderRouteDetails();
  renderMap();
  statusBox(messages().planned || "Rota atualizada com sucesso.");
}

function schedulePlan(delayMs = 100) {
  window.clearTimeout(state.planTimer);
  state.planTimer = window.setTimeout(() => { void planRouteNow(); }, delayMs);
}

function handleCityMapSelection(cityId) {
  if (!state.pickMode) {
    statusBox(messages().idle || "Escolha uma cidade de origem, uma cidade final e, se quiser, adicione paradas intermediarias.");
    return;
  }
  if (state.pickMode === "origin") {
    state.originNodeId = cityId;
    state.pickMode = null;
    renderForm();
    renderMap();
    schedulePlan(0);
    statusBox(messages().point_set_origin || "Origem atualizada no planejamento.");
    return;
  }
  if (state.pickMode === "destination") {
    state.destinationNodeId = cityId;
    state.pickMode = null;
    renderForm();
    renderMap();
    schedulePlan(0);
    statusBox(messages().point_set_destination || "Destino atualizado no planejamento.");
    return;
  }
  state.stopRows.push(stopRow(cityId));
  state.pickMode = null;
  renderForm();
  renderMap();
  schedulePlan(0);
  statusBox(messages().point_set_stop || "Parada intermediaria adicionada ao planejamento.");
}

function removeCityFromRoute(cityId) {
  const before = routePointIds();
  const after = before.filter((nodeId) => nodeId !== cityId);
  if (after.length === before.length) {
    statusBox(messages().idle || "Escolha uma cidade de origem, uma cidade final e, se quiser, adicione paradas intermediarias.");
    return;
  }
  applyRoutePointIds(after);
  state.pickMode = null;
  renderForm();
  renderMap();
  schedulePlan(0);
  statusBox(messages().point_removed || "Ponto removido da rota.");
}

function reorderStopRow(index, direction) {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= state.stopRows.length || nextIndex < 0 || nextIndex >= state.stopRows.length) {
    return;
  }
  [state.stopRows[index], state.stopRows[nextIndex]] = [state.stopRows[nextIndex], state.stopRows[index]];
  renderStopList();
  renderMap();
  schedulePlan(0);
  statusBox(messages().point_reordered || "Ordem da rota atualizada.");
}

async function loadSelectedMap() {
  if (!state.selectedMapId) {
    statusBox(errors().map_required || "Escolha um mapa do repositorio.");
    return;
  }
  if (state.selectedMapId === state.bootstrap.map_repository.active_map_id) {
    state.loadedMapId = state.selectedMapId;
    renderForm();
    renderMap();
    fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    statusBox(messages().map_loaded || "Mapa carregado no planejador.");
    return;
  }
  const response = await fetch("/api/editor/maps/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ map_id: state.selectedMapId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    statusBox(payload.detail || messages().map_load_failed || "Nao foi possivel carregar o mapa selecionado.");
    return;
  }
  await hydratePlanner({ preserve: true });
  state.loadedMapId = state.bootstrap.map_repository.active_map_id;
  statusBox(messages().map_loaded || "Mapa carregado no planejador.");
}

function openShortcutsDialog() {
  document.getElementById("planner-shortcuts-dialog").showModal();
}

function bindColumnResizers() {
  const grid = document.getElementById("planner-grid");
  Array.from(grid.querySelectorAll("[data-resizer]")).forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = event.clientX;
      const startLeft = parseCssPx("--planner-left-col", 348);
      const startRight = parseCssPx("--planner-right-col", 372);
      const resizerWidth = parseCssPx("--planner-resizer-width", 10);
      const gap = parseCssPx("--planner-panel-gap", 12) * 4;
      const minSide = parseCssPx("--planner-side-min-col", 280);
      const minMap = parseCssPx("--planner-map-min-col", 640);
      const gridWidth = grid.getBoundingClientRect().width;
      grid.classList.add("is-resizing");

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === "left") {
          const maxLeft = Math.max(minSide, gridWidth - startRight - (resizerWidth * 2) - gap - minMap);
          setCssPx("--planner-left-col", clamp(startLeft + delta, minSide, maxLeft));
        }
        if (side === "right") {
          const maxRight = Math.max(minSide, gridWidth - startLeft - (resizerWidth * 2) - gap - minMap);
          setCssPx("--planner-right-col", clamp(startRight - delta, minSide, maxRight));
        }
        invalidateMap();
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        grid.classList.remove("is-resizing");
        normalizeLayout();
        persistLayout();
        invalidateMap();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });

  window.addEventListener("resize", () => {
    normalizeLayout();
    invalidateMap();
  });
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  const tagName = String(target.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || Boolean(target.isContentEditable);
}

function bindControls() {
  if (state.controlsBound) {
    return;
  }

  document.getElementById("planner-header-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.actionId === "toggle-theme") {
      toggleTheme();
      return;
    }
    if (button.dataset.actionId === "open-shortcuts") {
      openShortcutsDialog();
      return;
    }
    if (button.dataset.actionId === "refit-map") {
      fitBrasixBounds(state.map, state.bootstrap.map_viewport);
    }
  });

  document.getElementById("planner-map-select").addEventListener("change", (event) => {
    state.selectedMapId = event.target.value;
    void loadSelectedMap();
  });

  document.getElementById("planner-route-mode-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("[data-route-mode]");
    if (!button) {
      return;
    }
    const nextMode = button.dataset.routeMode;
    if (!nextMode || nextMode === state.routeMode) {
      return;
    }
    state.routeMode = nextMode;
    renderForm();
    schedulePlan(0);
    const statusKey = nextMode === "fastest" ? "route_mode_fastest" : "route_mode_shortest";
    statusBox(messages()[statusKey] || messages().planned || "Rota atualizada com sucesso.");
  });

  document.getElementById("planner-origin-select").addEventListener("change", (event) => {
    state.originNodeId = event.target.value;
    renderMap();
    schedulePlan(0);
  });

  document.getElementById("planner-destination-select").addEventListener("change", (event) => {
    state.destinationNodeId = event.target.value;
    renderMap();
    schedulePlan(0);
  });

  document.getElementById("planner-add-stop-button").addEventListener("click", () => {
    state.stopRows.push(stopRow(""));
    renderStopList();
  });

  document.getElementById("planner-stop-list").addEventListener("change", (event) => {
    const rowElement = event.target.closest("[data-stop-row-id]");
    if (!rowElement) {
      return;
    }
    const row = state.stopRows.find((item) => item.id === rowElement.dataset.stopRowId);
    if (!row) {
      return;
    }
    if (event.target.dataset.stopField === "node_id") {
      row.node_id = event.target.value;
      renderMap();
      schedulePlan(0);
    }
  });

  document.getElementById("planner-stop-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-stop-action]");
    if (!button) {
      return;
    }
    const rowElement = button.closest("[data-stop-row-id]");
    if (!rowElement) {
      return;
    }
    const index = state.stopRows.findIndex((item) => item.id === rowElement.dataset.stopRowId);
    if (index < 0) {
      return;
    }
    const action = button.dataset.stopAction;
    if (action === "remove") {
      state.stopRows = state.stopRows.filter((item) => item.id !== rowElement.dataset.stopRowId);
      renderStopList();
      renderMap();
      schedulePlan(0);
      statusBox(messages().stop_removed || "Parada removida do planejamento.");
      return;
    }
    if (action === "move-up") {
      reorderStopRow(index, "up");
      return;
    }
    if (action === "move-down") {
      reorderStopRow(index, "down");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    if (event.key === "a" || event.key === "A") {
      state.pickMode = "origin";
      statusBox(messages().pick_origin || "Modo A: clique em uma cidade no mapa para definir a origem.");
      return;
    }
    if (event.key === "x" || event.key === "X") {
      state.pickMode = "stop";
      statusBox(messages().pick_stop || "Modo X: clique em uma cidade no mapa para adicionar uma parada.");
      return;
    }
    if (event.key === "z" || event.key === "Z") {
      state.pickMode = "destination";
      statusBox(messages().pick_destination || "Modo Z: clique em uma cidade no mapa para definir o destino.");
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === BRASIX_SYNC_KEY) {
      void refreshFromServer();
    }
  });

  window.addEventListener("focus", () => {
    const token = readSyncToken();
    if (token && token !== state.syncToken) {
      void refreshFromServer();
    }
  });

  bindColumnResizers();
  state.controlsBound = true;
}

async function hydratePlanner({ preserve = false } = {}) {
  const previous = preserve
    ? {
      routeMode: state.routeMode,
      originNodeId: state.originNodeId,
      destinationNodeId: state.destinationNodeId,
      stopRows: state.stopRows,
    }
    : { routeMode: "shortest", originNodeId: "", destinationNodeId: "", stopRows: [] };

  state.bootstrap = await loadBootstrap();
  state.syncToken = readSyncToken();
  applyCssVariables(state.bootstrap.ui.design_tokens.css_variables);
  applyCssVariables(state.bootstrap.route_planner.layout_desktop.css_variables);
  buildDerivedData();
  applyTheme(restoreTheme(), { persist: false });
  restoreLayout();
  applyScreenRegistry();

  const validCities = new Set(Object.keys(state.citiesById));
  state.selectedMapId = state.bootstrap.map_repository.active_map_id;
  state.loadedMapId = state.bootstrap.map_repository.active_map_id;
  state.routeMode = previous.routeMode || "shortest";
  state.originNodeId = validCities.has(previous.originNodeId) ? previous.originNodeId : "";
  state.destinationNodeId = validCities.has(previous.destinationNodeId) ? previous.destinationNodeId : "";
  state.stopRows = (previous.stopRows || [])
    .map((row) => ({ id: row.id || stopRow().id, node_id: validCities.has(row.node_id) ? row.node_id : "" }));
  state.plannedRoute = null;
  state.highlightedEdgeIds = new Set();
  state.pickMode = null;

  renderHeader();
  renderShortcutsDialog();
  renderForm();
  renderRouteDetails();
  renderMap();
  bindControls();
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  schedulePlan(0);
}

async function refreshFromServer() {
  const token = readSyncToken();
  if (token && token === state.syncToken) {
    return;
  }
  await hydratePlanner({ preserve: true });
}

async function initializePlanner() {
  await waitForLeaflet();
  await hydratePlanner({ preserve: false });
  statusBox(messages().idle || "Escolha uma cidade de origem, uma cidade final e, se quiser, adicione paradas intermediarias.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initializePlanner().catch(reportPlannerError);
  });
} else {
  initializePlanner().catch(reportPlannerError);
}
