import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  createGraphNodeMarker,
  createRouteLayer,
  findPopulationBand,
  renderPopulationLegend,
  sortPopulationBands,
} from "../shared/leaflet-map.js?v=20260327-v2-1";
import { escapeHtml, numberFormatter } from "../shared/formatters.js";

const state = {
  bootstrap: null,
  map: null,
  routeLayer: null,
  previewLayer: null,
  markerLayer: null,
  graphNodeLayer: null,
  citiesById: {},
  graphNodesById: {},
  nodesById: {},
  pinsById: {},
  populationBands: [],
  surfaceTypesById: {},
  graphNodeStylesById: {},
  preview: null,
  selectedSurfaceId: null,
  resolutionOptions: [],
  selectedResolutionIndex: 0,
  cityPickTarget: "origin",
};

function screen() {
  return state.bootstrap?.map_editor_v2?.screen || {};
}

function labels() {
  return screen().labels || {};
}

function messages() {
  return screen().status_messages || {};
}

function autoConfig() {
  return state.bootstrap?.map_editor_v2?.route_auto_engine || {};
}

function displayLeafletSettings() {
  return state.bootstrap?.map_editor?.leaflet_settings || {};
}

function displayVisibility() {
  return state.bootstrap?.map_editor?.display_settings?.visibility || {};
}

function applyCssVariables(source) {
  Object.entries(source || {}).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
}

function supportedSurfaceCodes() {
  return new Set(autoConfig().supported_surface_codes || []);
}

function manualSurfaceCodes() {
  return new Set(autoConfig().manual_only_surface_codes || []);
}

function autoSurfaceTypes() {
  const allowed = supportedSurfaceCodes();
  return Object.values(state.surfaceTypesById).filter((item) => allowed.has(item.code));
}

function manualSurfaceTypes() {
  const allowed = manualSurfaceCodes();
  return Object.values(state.surfaceTypesById).filter((item) => allowed.has(item.code));
}

function selectedSurfaceType() {
  return state.surfaceTypesById[state.selectedSurfaceId] || autoSurfaceTypes()[0] || null;
}

function selectedResolutionKm() {
  return Number(state.resolutionOptions[state.selectedResolutionIndex] || autoConfig().default_resolution_km || 20);
}

function cityList() {
  return [...(state.bootstrap?.cities || [])].sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

function activeMap() {
  return state.bootstrap?.map_repository?.active_map || {};
}

function activeMapId() {
  return state.bootstrap?.map_repository?.active_map_id || "map_brasix_default";
}

function citiesAreUnified() {
  return activeMapId() !== "map_brasix_default";
}

function customCityFillColor() {
  return "#4f8593";
}

function cityFillColor(city) {
  if (!citiesAreUnified() && city.is_user_created) {
    return customCityFillColor();
  }
  return state.bootstrap?.map_editor?.display_settings?.city_render?.uniform_fill_color || "#2d5a27";
}

function graphNodeStyle(node) {
  const base = state.graphNodeStylesById[node.style_id] || Object.values(state.graphNodeStylesById)[0] || {
    fill_color: "#8c4f10",
    stroke_color: "#fff9ea",
    stroke_width_px: 2,
    inner_scale: 0,
    shape: "solid_diamond",
  };
  return {
    ...base,
    size_px: Number(node.size_px || base.size_px || 16),
  };
}

function setStatus(message) {
  const target = document.getElementById("editor-v2-status");
  if (!target) {
    return;
  }
  target.innerHTML = `
    <div class="editor-status-copy">${escapeHtml(message)}</div>
  `;
}

function normalizeBootstrap() {
  state.citiesById = Object.fromEntries(cityList().map((city) => [city.id, city]));
  state.graphNodesById = Object.fromEntries(((state.bootstrap?.route_network?.nodes) || []).map((node) => [node.id, node]));
  state.nodesById = {
    ...state.citiesById,
    ...state.graphNodesById,
  };
  state.pinsById = Object.fromEntries(
    ((state.bootstrap?.map_editor?.pin_library?.pins) || []).map((pin) => [pin.id, pin]),
  );
  state.populationBands = sortPopulationBands(state.bootstrap?.map_editor?.population_bands?.bands || []);
  state.surfaceTypesById = Object.fromEntries(
    ((state.bootstrap?.map_editor_v2?.route_surface_types?.types) || []).map((item) => [item.id, item]),
  );
  state.graphNodeStylesById = Object.fromEntries(
    ((state.bootstrap?.map_editor?.graph_node_styles?.styles) || []).map((item) => [item.id, item]),
  );
  state.resolutionOptions = [...(autoConfig().simplification_options_km || [1, 2, 5, 10, 20, 30, 40, 50])];
  state.selectedResolutionIndex = Math.max(0, state.resolutionOptions.indexOf(autoConfig().default_resolution_km || 20));
  state.selectedSurfaceId = autoSurfaceTypes()[0]?.id || null;
}

function renderHeader() {
  document.getElementById("editor-v2-brand-title").textContent = screen().brand_title || "Brasix";
  document.getElementById("editor-v2-brand-subtitle").textContent = screen().brand_subtitle || "Editor de mapa v2";

  const badgeHost = document.getElementById("editor-v2-header-badges");
  badgeHost.innerHTML = (screen().header_badges || []).map((item) => `
    <span class="header-badge">${escapeHtml(item.label)}</span>
  `).join("");

  const actionHost = document.getElementById("editor-v2-header-actions");
  actionHost.innerHTML = (screen().header_actions || []).map((item) => `
    <a class="editor-header-action" href="${escapeHtml(item.href || "#")}">
      <span class="material-symbols-outlined">${escapeHtml(item.icon || "arrow_forward")}</span>
      ${escapeHtml(item.label)}
    </a>
  `).join("");
}

function renderActiveMapCard() {
  document.getElementById("editor-v2-active-map-eyebrow").textContent = labels().active_map || "Mapa ativo";
  document.getElementById("editor-v2-active-map-title").textContent = activeMap().name || "Mapa";
  document.getElementById("editor-v2-active-map-badge").textContent = activeMap().slug || "";
  document.getElementById("editor-v2-active-map-copy").textContent = labels().network_copy || "";
}

function renderSurfaceButtons() {
  document.getElementById("editor-v2-routing-title").textContent = labels().routing_title || "Roteamento automatico";
  document.getElementById("editor-v2-routing-copy").textContent = labels().routing_copy || "";
  document.getElementById("editor-v2-surface-label").textContent = labels().surface_label || "Tipo de rodovia";
  document.getElementById("editor-v2-surface-hint").textContent = labels().surface_hint || "";

  const host = document.getElementById("editor-v2-surface-buttons");
  host.innerHTML = autoSurfaceTypes().map((surfaceType) => `
    <button
      class="editor-v2-surface-button${surfaceType.id === state.selectedSurfaceId ? " is-active" : ""}"
      type="button"
      data-surface-id="${surfaceType.id}"
    >
      <span class="editor-v2-surface-shortcut">${escapeHtml(surfaceType.shortcut_key || "")}</span>
      <span>${escapeHtml(surfaceType.label)}</span>
    </button>
  `).join("");

  host.querySelectorAll("[data-surface-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSurfaceId = button.dataset.surfaceId;
      renderSurfaceButtons();
    });
  });

  document.getElementById("editor-v2-legend-title").textContent = labels().legend_title || "Superficies automaticas";
  document.getElementById("editor-v2-manual-title").textContent = labels().legend_manual_title || "Superficies manuais";
  document.getElementById("editor-v2-auto-surface-list").innerHTML = autoSurfaceTypes().map((surfaceType) => `
    <div class="editor-v2-surface-row">
      <strong>${escapeHtml(surfaceType.shortcut_key || "")}</strong>
      <span>${escapeHtml(surfaceType.label)}</span>
    </div>
  `).join("");
  document.getElementById("editor-v2-manual-surface-list").innerHTML = manualSurfaceTypes().map((surfaceType) => `
    <div class="editor-v2-surface-row">
      <strong>${escapeHtml(surfaceType.shortcut_key || "")}</strong>
      <span>${escapeHtml(surfaceType.label)}</span>
    </div>
  `).join("");
}

function renderCitySelects() {
  const originSelect = document.getElementById("editor-v2-origin-select");
  const destinationSelect = document.getElementById("editor-v2-destination-select");
  const originValue = originSelect.value;
  const destinationValue = destinationSelect.value;

  document.getElementById("editor-v2-origin-label").textContent = labels().origin_label || "Cidade de origem";
  document.getElementById("editor-v2-destination-label").textContent = labels().destination_label || "Cidade de destino";
  document.getElementById("editor-v2-pick-origin-button").textContent = labels().pick_origin_button || "Escolher origem no mapa";
  document.getElementById("editor-v2-pick-destination-button").textContent = labels().pick_destination_button || "Escolher destino no mapa";

  const options = ['<option value="">Selecione...</option>'].concat(
    cityList().map((city) => `<option value="${city.id}">${escapeHtml(city.label)}</option>`),
  ).join("");
  originSelect.innerHTML = options;
  destinationSelect.innerHTML = options;
  originSelect.value = state.citiesById[originValue] ? originValue : "";
  destinationSelect.value = state.citiesById[destinationValue] ? destinationValue : "";
}

function renderResolutionControls() {
  document.getElementById("editor-v2-resolution-label").textContent = labels().resolution_label || "Resolucao da geometria";
  document.getElementById("editor-v2-resolution-hint").textContent = labels().resolution_hint || "";
  document.getElementById("editor-v2-resolution-value").textContent = `${selectedResolutionKm()} km`;
  const slider = document.getElementById("editor-v2-resolution-slider");
  slider.max = String(Math.max(0, state.resolutionOptions.length - 1));
  slider.value = String(state.selectedResolutionIndex);
  document.getElementById("editor-v2-resolution-ticks").innerHTML = state.resolutionOptions.map((value, index) => `
    <span class="editor-v2-resolution-tick${index === state.selectedResolutionIndex ? " is-active" : ""}">${value}</span>
  `).join("");
}

function previewMetaMarkup() {
  if (!state.preview) {
    return `<p class="editor-v2-copy">${escapeHtml(labels().preview_empty || "Ainda nao ha preview.")}</p>`;
  }
  return `
    <div class="editor-v2-preview-grid">
      <div><span>${escapeHtml(labels().preview_engine || "Engine")}</span><strong>${escapeHtml(String(state.preview.engine || "OSRM").toUpperCase())}</strong></div>
      <div><span>${escapeHtml(labels().preview_distance || "Distancia")}</span><strong>${numberFormatter(1).format(state.preview.distance_km || 0)} km</strong></div>
      <div><span>${escapeHtml(labels().preview_points_raw || "Pontos brutos")}</span><strong>${numberFormatter(0).format(state.preview.raw_point_count || 0)}</strong></div>
      <div><span>${escapeHtml(labels().preview_points_saved || "Pontos salvos")}</span><strong>${numberFormatter(0).format((state.preview.edge?.waypoints?.length || 0) + 2)}</strong></div>
    </div>
  `;
}

function renderPreviewCard() {
  document.getElementById("editor-v2-preview-title").textContent = labels().preview_title || "Preview da rota";
  document.getElementById("editor-v2-preview-meta").innerHTML = previewMetaMarkup();
  document.getElementById("editor-v2-save-button").disabled = !state.preview;
}

function surfaceTypeForEdge(edge) {
  return state.surfaceTypesById[edge.surface_type_id] || null;
}

function cityTooltip(city) {
  return `
    <strong>${escapeHtml(city.label)}</strong><br>
    Populacao: ${numberFormatter(0).format(city.population_thousands)} mil
  `;
}

function initializeMap() {
  if (state.map) {
    return;
  }
  state.map = createBrasixMap({
    elementId: "editor-v2-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: displayLeafletSettings(),
  });
  state.routeLayer = window.L.layerGroup().addTo(state.map);
  state.previewLayer = window.L.layerGroup().addTo(state.map);
  state.graphNodeLayer = window.L.layerGroup().addTo(state.map);
  state.markerLayer = window.L.layerGroup().addTo(state.map);
}

function pickCityFromMap(cityId) {
  const originSelect = document.getElementById("editor-v2-origin-select");
  const destinationSelect = document.getElementById("editor-v2-destination-select");
  if (state.cityPickTarget === "origin") {
    originSelect.value = cityId;
    state.cityPickTarget = "destination";
    setStatus(messages().city_selected_origin || messages().pick_destination || messages().idle);
  } else {
    destinationSelect.value = cityId;
    state.cityPickTarget = "origin";
    setStatus(messages().city_selected_destination || messages().idle);
  }
}

function renderMap() {
  initializeMap();
  applyBrasixLeafletSettings(state.map, state.bootstrap.map_viewport, displayLeafletSettings());
  state.routeLayer.clearLayers();
  state.previewLayer.clearLayers();
  state.graphNodeLayer.clearLayers();
  state.markerLayer.clearLayers();

  if (displayVisibility().show_routes !== false) {
    (state.bootstrap.route_network?.edges || []).forEach((edge) => {
      const layer = createRouteLayer({
        edge,
        citiesById: state.nodesById,
        surfaceType: surfaceTypeForEdge(edge),
        role: "network",
        interactive: false,
      });
      if (layer) {
        layer.addTo(state.routeLayer);
      }
    });
  }

  if (state.preview?.edge) {
    const layer = createRouteLayer({
      edge: state.preview.edge,
      citiesById: state.nodesById,
      surfaceType: surfaceTypeForEdge(state.preview.edge),
      role: "selected",
      interactive: false,
    });
    if (layer) {
      layer.addTo(state.previewLayer);
    }
  }

  if (displayVisibility().show_graph_nodes !== false) {
    Object.values(state.graphNodesById).forEach((node) => {
      const marker = createGraphNodeMarker({
        node,
        style: graphNodeStyle(node),
        selected: false,
        opacity: 0.9,
      });
      marker.addTo(state.graphNodeLayer);
    });
  }

  if (displayVisibility().show_cities !== false) {
    Object.values(state.citiesById).forEach((city) => {
      const band = findPopulationBand(city, state.populationBands);
      const pin = state.pinsById[band?.pin_id] || state.pinsById[Object.keys(state.pinsById)[0]];
      const marker = createCityMarker({
        city,
        band,
        pin,
        fillColor: cityFillColor(city),
        selected: (
          city.id === document.getElementById("editor-v2-origin-select").value
          || city.id === document.getElementById("editor-v2-destination-select").value
        ),
        opacity: 0.96,
      });
      marker.bindTooltip(cityTooltip(city), {
        className: "brasix-map-tooltip",
        direction: "top",
        offset: [0, -8],
        sticky: true,
      });
      marker.on("click", () => {
        pickCityFromMap(city.id);
        renderMap();
      });
      marker.addTo(state.markerLayer);
    });
  }

  renderPopulationLegend(document.getElementById("editor-v2-legend"), {
    cities: Object.values(state.citiesById),
    bands: state.populationBands,
    pinsById: state.pinsById,
    fillColor: "#2d5a27",
    routeSurfaceTypes: Object.values(state.surfaceTypesById),
  });
}

async function generatePreview() {
  const fromCityId = document.getElementById("editor-v2-origin-select").value;
  const toCityId = document.getElementById("editor-v2-destination-select").value;
  const surfaceType = selectedSurfaceType();

  if (!fromCityId || !toCityId) {
    setStatus(messages().select_both_cities || messages().idle);
    return;
  }
  if (fromCityId === toCityId) {
    setStatus(messages().same_city || messages().idle);
    return;
  }
  if (!surfaceType || !supportedSurfaceCodes().has(surfaceType.code)) {
    setStatus(messages().manual_surface || messages().idle);
    return;
  }

  setStatus(messages().preview_loading || messages().idle);
  try {
    const response = await fetch("/api/editor/map-v2/route-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_city_id: fromCityId,
        to_city_id: toCityId,
        surface_type_id: surfaceType.id,
        resolution_km: selectedResolutionKm(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || messages().preview_error || "Nao foi possivel gerar o preview.");
    }
    state.preview = data;
    renderPreviewCard();
    renderMap();
    setStatus(
      String(data.engine || "").toLowerCase() === "osrm"
        ? (messages().preview_ready || messages().idle)
        : (messages().preview_ready_fallback || messages().preview_ready || messages().idle),
    );
  } catch (error) {
    state.preview = null;
    renderPreviewCard();
    renderMap();
    setStatus(error?.message || messages().preview_error || "Nao foi possivel gerar o preview.");
  }
}

async function savePreview() {
  if (!state.preview?.edge) {
    return;
  }
  try {
    const previewEngine = String(state.preview.engine || "").toLowerCase();
    const response = await fetch("/api/editor/map-v2/route-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edge: state.preview.edge,
        engine: state.preview.engine,
        resolution_km: state.preview.resolution_km,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || messages().save_error || "Nao foi possivel salvar a rota.");
    }
    state.bootstrap.route_network.edges.push(data.edge);
    state.preview = null;
    renderPreviewCard();
    renderMap();
    setStatus(
      previewEngine === "osrm"
        ? (messages().preview_saved || messages().idle)
        : (messages().preview_saved_fallback || messages().preview_saved || messages().idle),
    );
  } catch (error) {
    setStatus(error?.message || messages().save_error || "Nao foi possivel salvar a rota.");
  }
}

function clearPreview() {
  state.preview = null;
  renderPreviewCard();
  renderMap();
  setStatus(messages().preview_cleared || messages().idle);
}

function bindControls() {
  document.getElementById("editor-v2-origin-select").addEventListener("change", () => renderMap());
  document.getElementById("editor-v2-destination-select").addEventListener("change", () => renderMap());
  document.getElementById("editor-v2-pick-origin-button").addEventListener("click", () => {
    state.cityPickTarget = "origin";
    setStatus(messages().pick_origin || messages().idle);
  });
  document.getElementById("editor-v2-pick-destination-button").addEventListener("click", () => {
    state.cityPickTarget = "destination";
    setStatus(messages().pick_destination || messages().idle);
  });
  document.getElementById("editor-v2-resolution-slider").addEventListener("input", (event) => {
    state.selectedResolutionIndex = Number(event.currentTarget.value || 0);
    renderResolutionControls();
  });
  document.getElementById("editor-v2-preview-button").textContent = labels().preview_button || "Gerar preview automatico";
  document.getElementById("editor-v2-save-button").textContent = labels().save_button || "Salvar preview no mapa";
  document.getElementById("editor-v2-clear-button").textContent = labels().clear_button || "Limpar preview";
  document.getElementById("editor-v2-preview-button").addEventListener("click", () => void generatePreview());
  document.getElementById("editor-v2-save-button").addEventListener("click", () => void savePreview());
  document.getElementById("editor-v2-clear-button").addEventListener("click", clearPreview);
}

async function loadBootstrap() {
  const response = await fetch("/api/editor/map-v2/bootstrap");
  return response.json();
}

export async function initMapEditorV2() {
  state.bootstrap = await loadBootstrap();
  applyCssVariables(state.bootstrap?.ui?.design_tokens?.css_variables || {});
  applyCssVariables(state.bootstrap?.map_editor_v2?.layout_desktop?.css_variables || {});
  normalizeBootstrap();
  renderHeader();
  renderActiveMapCard();
  renderSurfaceButtons();
  renderCitySelects();
  renderResolutionControls();
  renderPreviewCard();
  bindControls();
  renderMap();
  setStatus(messages().idle || "Escolha o tipo de rodovia, a origem, o destino e a resolucao.");
}
