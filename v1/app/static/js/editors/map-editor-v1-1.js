import { broadcastSync } from "../shared/app-sync.js";
import {
  applyBrasixLeafletSettings,
  buildBezierLikeLatLngs,
  buildRenderedRouteLatLngs,
  createBrasixMap,
  createCityMarker,
  createGraphNodeMarker,
  buildRouteLatLngs,
  computeRouteDistanceKm,
  createRouteLayer,
  findPopulationBand,
  fitBrasixBounds,
  renderPopulationLegend,
  sortPopulationBands,
} from "../shared/leaflet-map.js?v=20260329-map-colors-1";
import { escapeHtml, numberFormatter } from "../shared/formatters.js";
import { addDraftWaypoint, buildEdgeFromDraft, createDraftState, removeDraftWaypoint, resetDraft } from "./map-editor-geometry.js";

const EDITOR_LAYOUT_STORAGE_KEY = "brasix:v1:map-editor-layout";
const EDITOR_THEME_STORAGE_KEY = "brasix:v1:map-editor-theme";
const FALLBACK_GRAPH_NODE_STYLES = {
  default_style_id: "graph_node_style_junction_diamond",
  styles: [
    {
      id: "graph_node_style_junction_circle",
      label: "Ponto/circulo tecnico",
      shape: "solid_circle",
      size_px: 14,
      fill_color: "#8c4f10",
      stroke_color: "#fff9ea",
      stroke_width_px: 2,
      inner_scale: 0,
    },
    {
      id: "graph_node_style_junction_diamond",
      label: "Losango de ligacao",
      shape: "solid_diamond",
      size_px: 16,
      fill_color: "#8c4f10",
      stroke_color: "#fff9ea",
      stroke_width_px: 2,
      inner_scale: 0,
    },
  ],
};
const POPULATION_BAND_FILL_PALETTE = ["#2d5a27", "#4d7c39", "#7b7b2d", "#8c4f10", "#a85d2a", "#2b6f8f"];

const editorState = {
  bootstrap: null,
  map: null,
  markerLayer: null,
  routeLayer: null,
  draftLayer: null,
  selectedLayer: null,
  citiesById: {},
  cityMatrixByCity: {},
  graphNodesById: {},
  nodesById: {},
  productsById: {},
  enrichedCitiesById: {},
  graphNodeStylesById: {},
  pinsById: {},
  surfaceTypesById: {},
  geometryTypesById: {},
  displaySettings: null,
  displayControlsById: {},
  leafletSettings: null,
  leafletControlsById: {},
  populationBands: [],
  routeNetwork: null,
  selectedCityId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  nodeToolStyleId: FALLBACK_GRAPH_NODE_STYLES.default_style_id,
  nodeToolSizePx: 16,
  nodeControlSaveTimer: null,
  customCitiesSaveTimer: null,
  cityAutofillRequestSeq: 0,
  cityAutofillStatesByCityId: {},
  populationBandsSaveTimer: null,
  displaySettingsSaveTimer: null,
  leafletSettingsSaveTimer: null,
  draft: null,
  screen: null,
  mapRepository: null,
  mapRepositoryControls: null,
  shortcutsPanel: null,
  themesDocument: null,
  themesById: {},
  activeThemeId: null,
  cityPopupAnchor: null,
  activeSidebarTabId: "map_editor_tab_legends",
  autoRouteResolutionOptionsKm: [],
  selectedAutoRouteResolutionIndex: 0,
};

function reportEditorError(error) {
  const message = error?.message || String(error);
  console.error("Brasix map editor failed to initialize:", error);
  const statusBox = document.getElementById("editor-draft-status");
  if (statusBox) {
    statusBox.innerHTML = `
      <div class="editor-status-copy">Falha ao carregar o editor de mapa.</div>
      <div class="editor-status-meta">
        <div>
          <span>Erro</span>
          <strong>${escapeHtml(message)}</strong>
        </div>
      </div>
    `;
  }
}

function loadBootstrap() {
  return fetch("/api/editor/map_v1_1/bootstrap").then((response) => response.json());
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
        reject(new Error("Leaflet nao carregou a tempo."));
      }
    }, 40);
  });
}

function screenLabels() {
  return editorState.screen.labels || {};
}

function screenErrors() {
  return editorState.screen.errors || {};
}

function cityAutofillConfig() {
  return editorState.bootstrap?.map_editor?.city_autofill || {};
}

function cityAutofillProviderLabel() {
  return cityAutofillConfig().provider_label || "Nominatim + IBGE";
}

function autoRouteConfig() {
  return editorState.bootstrap?.map_editor_v2?.route_auto_engine || {};
}

function autoRouteUi() {
  return autoRouteConfig().ui || {};
}

function autoRouteResolutionOptionsKm() {
  return editorState.autoRouteResolutionOptionsKm?.length
    ? editorState.autoRouteResolutionOptionsKm
    : [...(autoRouteConfig().simplification_options_km || [1, 2, 5, 10, 20, 30, 40, 50])];
}

function selectedAutoRouteResolutionKm() {
  return Number(
    autoRouteResolutionOptionsKm()[editorState.selectedAutoRouteResolutionIndex]
    || autoRouteConfig().default_resolution_km
    || 20,
  );
}

function autoRouteSupportedSurfaceCodes() {
  return new Set(autoRouteConfig().supported_surface_codes || ["double_road", "single_road", "dirt_road"]);
}

function mapRepositoryControls() {
  return editorState.mapRepositoryControls || { header_actions: [] };
}

function activeMapEntry() {
  return editorState.mapRepository?.active_map || null;
}

function nextMapDraftName() {
  const count = Number(editorState.mapRepository?.maps?.length || 0) + 1;
  return `Mapa ${count}`;
}

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function cityAutofillState(cityId) {
  return editorState.cityAutofillStatesByCityId[cityId] || {
    loading: false,
    error: "",
    requestId: 0,
  };
}

function setCityAutofillState(cityId, patch) {
  if (!cityId) {
    return;
  }
  editorState.cityAutofillStatesByCityId[cityId] = {
    ...cityAutofillState(cityId),
    ...patch,
  };
}

function serializeCustomCity(city) {
  return {
    id: city.id,
    name: city.name,
    label: city.label,
    state_code: city.state_code,
    state_name: city.state_name,
    source_region_name: city.source_region_name,
    population_thousands: Number(city.population_thousands || 0),
    latitude: Number(city.latitude),
    longitude: Number(city.longitude),
    is_user_created: true,
    autofill: city.autofill ? { ...city.autofill } : null,
  };
}

function replaceBootstrapCity(updatedCity) {
  editorState.bootstrap.cities = (editorState.bootstrap.cities || []).map((city) => (
    city.id === updatedCity.id ? updatedCity : city
  ));
  rebuildCityCatalogsFromBootstrap();
}

function applyCssVariables(source) {
  Object.entries(source || {}).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
}

function defaultEditorTheme() {
  const defaultThemeId = editorState.themesDocument?.default_theme_id;
  return (
    editorState.themesById[defaultThemeId]
    || Object.values(editorState.themesById)[0]
    || null
  );
}

function currentEditorTheme() {
  return editorState.themesById[editorState.activeThemeId] || defaultEditorTheme();
}

function restoreStoredEditorTheme() {
  try {
    const storedThemeId = window.localStorage.getItem(EDITOR_THEME_STORAGE_KEY);
    if (storedThemeId && editorState.themesById[storedThemeId]) {
      return storedThemeId;
    }
  } catch (_error) {
    // Theme persistence is optional.
  }
  return defaultEditorTheme()?.id || null;
}

function persistEditorTheme() {
  if (!editorState.activeThemeId) {
    return;
  }
  try {
    window.localStorage.setItem(EDITOR_THEME_STORAGE_KEY, editorState.activeThemeId);
  } catch (_error) {
    // Theme persistence is optional.
  }
}

function applyEditorTheme(themeId, { persist = true } = {}) {
  const theme = editorState.themesById[themeId] || defaultEditorTheme();
  if (!theme) {
    return;
  }

  editorState.activeThemeId = theme.id;
  document.documentElement.dataset.editorTheme = theme.root_data_theme || theme.id;
  applyCssVariables(editorState.bootstrap?.ui?.design_tokens?.css_variables || {});
  applyCssVariables(theme.css_variables || {});

  if (persist) {
    persistEditorTheme();
  }
}

function toggleEditorTheme() {
  const theme = currentEditorTheme();
  const nextThemeId = theme?.next_theme_id || defaultEditorTheme()?.id;
  if (!nextThemeId) {
    return;
  }
  applyEditorTheme(nextThemeId);
  renderHeader();
  renderMap();
}

function cloneJsonPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function parseCssPixelVariable(name, fallback = 0) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(String(value).trim().replace("px", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setPixelVariable(name, value) {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

function nodeLabel(nodeId, fallback = "Sem origem") {
  return editorState.nodesById[nodeId]?.label || nodeId || fallback;
}

function isCityNode(nodeId) {
  return Boolean(editorState.citiesById[nodeId]);
}

function isUserCreatedCity(cityOrId) {
  const city = typeof cityOrId === "string" ? editorState.citiesById[cityOrId] : cityOrId;
  return Boolean(city?.is_user_created);
}

function activeMapId() {
  return editorState.bootstrap?.map_repository?.active_map_id || "map_brasix_default";
}

function isBaseMapActive() {
  return activeMapId() === "map_brasix_default";
}

function citiesAreUnifiedInActiveMap() {
  return !isBaseMapActive();
}

function canDeleteCity(cityOrId) {
  return citiesAreUnifiedInActiveMap() || isUserCreatedCity(cityOrId);
}

function selectedNode() {
  return editorState.selectedNodeId ? editorState.nodesById[editorState.selectedNodeId] : null;
}

function invalidateMapSize() {
  window.requestAnimationFrame(() => {
    editorState.map?.invalidateSize();
  });
}

function normalizeEditorLayout() {
  const grid = document.getElementById("editor-grid");
  if (!grid) {
    return;
  }

  const resizerWidth = parseCssPixelVariable("--editor-resizer-width", 10);
  const panelGap = parseCssPixelVariable("--editor-panel-gap", 12);
  const minSide = parseCssPixelVariable("--editor-side-min-col", 220);
  const minMap = parseCssPixelVariable("--editor-map-min-col", 560);
  const gridWidth = grid.getBoundingClientRect().width;
  if (!gridWidth) {
    return;
  }

  let left = parseCssPixelVariable("--editor-left-col", 356);
  const maxLeft = Math.max(minSide, gridWidth - resizerWidth - (panelGap * 2) - minMap);
  left = clamp(left, minSide, maxLeft);
  setPixelVariable("--editor-left-col", left);
}

function restoreStoredEditorLayout() {
  try {
    const raw = window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    if (!raw) {
      normalizeEditorLayout();
      return;
    }
    const stored = JSON.parse(raw);
    if (Number.isFinite(stored.left_col_px)) {
      setPixelVariable("--editor-left-col", stored.left_col_px);
    } else if (Number.isFinite(stored.right_col_px)) {
      setPixelVariable("--editor-left-col", stored.right_col_px);
    }
  } catch (_error) {
    // Ignore invalid persisted layout and keep JSON defaults.
  }

  normalizeEditorLayout();
}

function persistEditorLayout() {
  try {
    window.localStorage.setItem(
      EDITOR_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        left_col_px: parseCssPixelVariable("--editor-left-col", 356),
      }),
    );
  } catch (_error) {
    // Persistence is optional; the editor still works without it.
  }
}

function applyScreenRegistry() {
  (editorState.screen.components || []).forEach((component) => {
    const target = document.getElementById(component.dom_target_id);
    if (!target) {
      return;
    }
    if (component.type === "html") {
      target.innerHTML = component.text;
      return;
    }
    target.textContent = component.text;
  });
}

function rebuildCityCatalogsFromBootstrap() {
  editorState.enrichedCitiesById = Object.fromEntries(
    (editorState.bootstrap.cities || []).map((city) => {
      const productValues = editorState.cityMatrixByCity[city.id] || {};
      const topProducts = Object.entries(productValues)
        .sort((left, right) => right[1] - left[1])
        .filter((entry) => entry[1] > 0)
        .map(([productId, value]) => {
          const product = editorState.productsById[productId];
          return {
            id: productId,
            name: product.name,
            icon: product.icon,
            unit: product.unit,
            color: product.color,
            value,
          };
        });

      return [
        city.id,
        {
          ...city,
          product_values: productValues,
          top_products: topProducts,
          dominant_product_id: topProducts[0]?.id || null,
          commodity_count: topProducts.length,
        },
      ];
    }),
  );

  editorState.citiesById = editorState.enrichedCitiesById;
  rebuildNodeCatalogs();
}

function renderHeader() {
  const brandSubtitleNode = document.getElementById("editor-brand-subtitle");
  if (brandSubtitleNode) {
    brandSubtitleNode.textContent = autoRouteUi().brand_subtitle || editorState.screen.brand_subtitle || "Editor de mapa v1.1";
  }

  const badgeContainer = document.getElementById("editor-header-badges");
  const activeMap = activeMapEntry();
  const badges = [
    ...(editorState.screen.header_badges || []),
    ...(activeMap ? [{
      id: `map_active_badge_${activeMap.id}`,
      label: activeMap.name,
    }] : []),
  ];
  badgeContainer.innerHTML = badges
    .map((badge) => `<span class="editor-badge" data-badge-id="${badge.id}">${escapeHtml(badge.label)}</span>`)
    .join("");
  badgeContainer.hidden = badges.length === 0;

  const theme = currentEditorTheme();
  const headerActions = (editorState.screen.header_actions || []).map((action) => {
    if (action.action !== "toggle-theme") {
      return action;
    }
    return {
      ...action,
      label: theme?.toggle_action_label || action.label,
      icon: theme?.toggle_action_icon || action.icon,
    };
  });

  document.getElementById("editor-header-actions").innerHTML = headerActions
    .map((action) => {
      if (action.href) {
        return `
          <a class="editor-header-action" href="${action.href}" data-action-id="${action.id}">
            <span class="material-symbols-outlined">${action.icon}</span>
            <span>${escapeHtml(action.label)}</span>
          </a>
        `;
      }
      return `
        <button class="editor-header-action" type="button" data-action-id="${action.action}">
          <span class="material-symbols-outlined">${action.icon}</span>
          <span>${escapeHtml(action.label)}</span>
        </button>
      `;
    })
    .join("");

  const mapActions = mapRepositoryControls().header_actions || [];
  document.getElementById("editor-map-actions").innerHTML = mapActions
    .map((action) => `
      <button class="editor-map-action" type="button" data-map-action-id="${action.action}">
        <span class="material-symbols-outlined">${action.icon}</span>
        <span>${escapeHtml(action.label)}</span>
      </button>
    `)
    .join("");
}

function buildDerivedData() {
  editorState.routeNetwork = editorState.bootstrap.route_network;
  editorState.screen = editorState.bootstrap.map_editor.screen;
  editorState.mapRepository = cloneJsonPayload(editorState.bootstrap.map_repository || {});
  editorState.mapRepositoryControls = cloneJsonPayload(editorState.bootstrap.map_editor.map_repository_controls || {});
  editorState.shortcutsPanel = editorState.bootstrap.map_editor.shortcuts_panel || {};
  editorState.themesDocument = editorState.bootstrap.map_editor.themes || { themes: [] };
  editorState.themesById = Object.fromEntries(
    (editorState.themesDocument.themes || []).map((theme) => [theme.id, theme]),
  );
  editorState.displaySettings = cloneJsonPayload(editorState.bootstrap.map_editor.display_settings || {});
  editorState.displayControlsById = Object.fromEntries(
    (editorState.bootstrap.map_editor.display_controls?.sections || [])
      .flatMap((section) => section.controls || [])
      .map((control) => [control.id, control]),
  );
  editorState.leafletSettings = cloneJsonPayload(editorState.bootstrap.map_editor.leaflet_settings || {});
  editorState.leafletControlsById = Object.fromEntries(
    (editorState.bootstrap.map_editor.leaflet_controls?.sections || [])
      .flatMap((section) => section.controls || [])
      .map((control) => [control.id, control]),
  );
  editorState.autoRouteResolutionOptionsKm = autoRouteResolutionOptionsKm();
  editorState.selectedAutoRouteResolutionIndex = Math.max(
    0,
    editorState.autoRouteResolutionOptionsKm.indexOf(Number(autoRouteConfig().default_resolution_km || 20)),
  );
  editorState.activeSidebarTabId = editorState.screen.sidebar_tabs?.[0]?.id || "map_editor_tab_legends";
  editorState.routeNetwork.nodes = editorState.routeNetwork.nodes || [];
  const graphNodeStylesPayload = editorState.bootstrap.map_editor.graph_node_styles || FALLBACK_GRAPH_NODE_STYLES;
  editorState.pinsById = Object.fromEntries(
    (editorState.bootstrap.map_editor.pin_library.pins || []).map((pin) => [pin.id, pin]),
  );
  editorState.graphNodeStylesById = Object.fromEntries(
    (graphNodeStylesPayload.styles || []).map((style) => [style.id, style]),
  );
  editorState.surfaceTypesById = Object.fromEntries(
    (editorState.bootstrap.map_editor.route_surface_types.types || []).map((item) => [item.id, item]),
  );
  editorState.geometryTypesById = Object.fromEntries(
    (editorState.bootstrap.map_editor.route_geometry_types.types || []).map((item) => [item.id, item]),
  );
  editorState.populationBands = sortPopulationBands(editorState.bootstrap.map_editor.population_bands.bands || []);
  editorState.productsById = Object.fromEntries(editorState.bootstrap.products.map((item) => [item.id, item]));

  const matrixByCity = {};
  editorState.bootstrap.city_product_matrix.forEach((entry) => {
    if (!matrixByCity[entry.city_id]) {
      matrixByCity[entry.city_id] = {};
    }
    matrixByCity[entry.city_id][entry.product_id] = Number(entry.value);
  });
  editorState.cityMatrixByCity = matrixByCity;
  rebuildCityCatalogsFromBootstrap();
  const defaultStyle = defaultGraphNodeStyle();
  const firstGraphNode = (editorState.routeNetwork?.nodes || [])[0] || null;
  editorState.nodeToolStyleId = firstGraphNode?.style_id || defaultStyle?.id || FALLBACK_GRAPH_NODE_STYLES.default_style_id;
  editorState.nodeToolSizePx = Number(firstGraphNode?.size_px || defaultStyle?.size_px || 16);
}

function rebuildNodeCatalogs() {
  editorState.graphNodesById = Object.fromEntries(
    (editorState.routeNetwork?.nodes || []).map((node) => [node.id, node]),
  );
  editorState.nodesById = {
    ...editorState.citiesById,
    ...editorState.graphNodesById,
  };
}

function updateGraphNodeRecord(nodeId, patch) {
  if (!nodeId || !Array.isArray(editorState.routeNetwork?.nodes)) {
    return null;
  }

  let updatedNode = null;
  editorState.routeNetwork.nodes = editorState.routeNetwork.nodes.map((node) => {
    if (!node || node.id !== nodeId) {
      return node;
    }
    updatedNode = {
      ...node,
      ...patch,
    };
    return updatedNode;
  });

  if (!updatedNode) {
    return null;
  }

  editorState.bootstrap.route_network = editorState.routeNetwork;
  rebuildNodeCatalogs();
  return editorState.graphNodesById[nodeId] || updatedNode;
}

function currentSurfaceType() {
  return editorState.surfaceTypesById[editorState.draft.surfaceTypeId];
}

function currentDisplaySurfaceType() {
  return surfaceTypeForDisplay(currentSurfaceType()) || currentSurfaceType();
}

function currentGeometryType() {
  return editorState.geometryTypesById[editorState.draft.geometryTypeId] || polycurveGeometryType();
}

function polycurveGeometryType() {
  return (
    editorState.geometryTypesById.route_geometry_polycurve ||
    Object.values(editorState.geometryTypesById)[0] || {
      id: "route_geometry_polycurve",
      code: "polycurve",
      label: "Polilinha",
      allow_waypoints: true,
    }
  );
}

function routeModeActive() {
  return editorState.draft.activeToolId === "tool_route_draw";
}

function nodeModeActive() {
  return editorState.draft.activeToolId === "tool_graph_node_draw";
}

function cityModeActive() {
  return editorState.draft.activeToolId === "tool_city_draw";
}

function nodeToCityModeActive() {
  return editorState.draft.activeToolId === "tool_graph_node_promote_city";
}

function defaultGraphNodeStyle() {
  const defaultStyleId = editorState.bootstrap.map_editor.graph_node_styles?.default_style_id || FALLBACK_GRAPH_NODE_STYLES.default_style_id;
  return (
    editorState.graphNodeStylesById[defaultStyleId]
    || Object.values(editorState.graphNodeStylesById)[0]
    || null
  );
}

function serverSupportsGraphNodes() {
  return Boolean(
    editorState.bootstrap?.map_editor?.graph_node_styles
    && editorState.bootstrap?.summary
    && Object.prototype.hasOwnProperty.call(editorState.bootstrap.summary, "graph_node_count"),
  );
}

function legacyRouteNetworkPayload() {
  return {
    id: editorState.routeNetwork.id,
    version: 2,
    edges: (editorState.routeNetwork.edges || [])
      .filter((edge) => isCityNode(edge.from_city_id || edge.from_node_id) && isCityNode(edge.to_city_id || edge.to_node_id))
      .map((edge) => ({
        ...edge,
        from_city_id: edge.from_city_id || edge.from_node_id,
        to_city_id: edge.to_city_id || edge.to_node_id,
      })),
  };
}

function routeModeMessage(surfaceId = editorState.draft.surfaceTypeId) {
  const surface = editorState.surfaceTypesById[surfaceId];
  if (!surface) {
    return editorState.screen.status_messages.idle;
  }
  const messageKey = `route_mode_${surface.code}`;
  return editorState.screen.status_messages[messageKey] || `Modo rota: ${surface.label}. Clique na cidade de origem.`;
}

function surfaceTypeByShortcut(shortcutKey) {
  return (editorState.bootstrap.map_editor.route_surface_types.types || []).find(
    (item) => String(item.shortcut_key).toLowerCase() === String(shortcutKey).toLowerCase(),
  );
}

function compactPopulationLabel(value) {
  const numericValue = Number(value || 0);
  if (numericValue >= 1000) {
    const millions = numericValue / 1000;
    const precision = Number.isInteger(millions) ? 0 : 1;
    return `${numberFormatter(precision).format(millions)} mi`;
  }
  return `${numberFormatter(0).format(numericValue)} mil`;
}

function customCityFillColor() {
  return displayCityRender().created_fill_color || "#4f8593";
}

function buildManualCityId() {
  return `custom-city-${Date.now()}`;
}

function nextManualCityName() {
  const count = (editorState.bootstrap.cities || []).filter((city) => city.is_user_created).length + 1;
  return `Nova cidade ${count}`;
}

function buildManualCityLabel(name, stateCode) {
  const trimmedName = String(name || "").trim() || "Nova cidade";
  const trimmedStateCode = String(stateCode || "").trim().toUpperCase() || "ZZ";
  return `${trimmedName}, ${trimmedStateCode}`;
}

function displayPopulationValue(city) {
  return Math.max(0, Math.round(Number(city.population_thousands || 0) * 1000));
}

function parsePopulationInputToThousands(value) {
  const absolutePopulation = Math.max(0, Number(value || 0));
  return absolutePopulation / 1000;
}

function autoPopulationBandLabel(minValue, maxValue) {
  const min = Number(minValue || 0);
  const hasMax = maxValue !== "" && maxValue != null;
  if (!hasMax) {
    return `Acima de ${compactPopulationLabel(min)}`;
  }
  const max = Number(maxValue || 0);
  if (min <= 0) {
    return `Ate ${compactPopulationLabel(max)}`;
  }
  return `${compactPopulationLabel(min)} a ${compactPopulationLabel(max)}`;
}

function buildStatusMeta() {
  const labels = screenLabels();
  const selectedEdge = editorState.selectedEdgeId
    ? (editorState.routeNetwork.edges || []).find((edge) => edge.id === editorState.selectedEdgeId)
    : null;
  if (selectedEdge) {
    return [
      {
        label: labels.surface_label || "Superficie",
        value: editorState.surfaceTypesById[selectedEdge.surface_type_id]?.label || selectedEdge.surface_code || "-",
      },
      {
        label: labels.distance_label || "Distancia",
        value: `${numberFormatter(0).format(selectedEdge.distance_km || 0)} km`,
      },
      {
        label: labels.vertices_label || "Vertices",
        value: String(selectedEdge.waypoints?.length || 0),
      },
    ];
  }

  if (!routeModeActive() && editorState.selectedCityId) {
    const city = editorState.citiesById[editorState.selectedCityId];
    const dominant = city?.dominant_product_id ? editorState.productsById[city.dominant_product_id] : null;
    return [
      {
        label: labels.population_label || "Populacao",
        value: city ? `${numberFormatter(0).format(city.population_thousands)} mil` : "-",
      },
      {
        label: labels.region_label || "Regiao",
        value: city?.source_region_name || "-",
      },
      {
        label: labels.highlight_label || "Destaque",
        value: dominant ? `${dominant.icon} ${dominant.name}` : labels.no_data_label || "Sem dado",
      },
    ];
  }

  if (!routeModeActive() && !nodeModeActive() && editorState.selectedNodeId) {
    const node = selectedNode();
    return [
      {
        label: labels.node_type_label || "Tipo",
        value: labels.junction_label || "No de ligacao",
      },
      {
        label: labels.coordinates_label || "Coordenadas",
        value: node ? `${numberFormatter(2).format(node.latitude)}, ${numberFormatter(2).format(node.longitude)}` : "-",
      },
      {
        label: labels.origin_label || "Origem",
        value: nodeLabel(node?.id, labels.no_data_label || "Sem dado"),
      },
    ];
  }

  return [
    {
      label: labels.surface_label || "Superficie",
      value: currentSurfaceType()?.label || "-",
    },
    {
      label: labels.geometry_label || "Geometria",
      value: polycurveGeometryType()?.label || "Polilinha",
    },
    {
      label: labels.origin_label || "Origem",
      value: nodeLabel(editorState.draft.fromCityId),
    },
  ];
}

function setDraftStatus(message) {
  const meta = buildStatusMeta();
  document.getElementById("editor-draft-status").innerHTML = `
    <div class="editor-status-copy">${escapeHtml(message)}</div>
    <div class="editor-status-meta">
      ${meta
        .map(
          (item) => `
            <div>
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderShortcuts() {
  const container = document.getElementById("editor-shortcuts-list");
  if (!container) {
    return;
  }
  container.innerHTML = (editorState.bootstrap.map_editor.shortcuts.shortcuts || [])
    .map(
      (shortcut) => `
        <div class="shortcut-row">
          <kbd>${escapeHtml(shortcut.key)}</kbd>
          <span>${escapeHtml(shortcut.label)}</span>
        </div>
      `,
    )
    .join("");
}

function renderShortcutsPanel() {
  const panel = editorState.shortcutsPanel || {};
  const eyebrow = document.getElementById("editor-shortcuts-eyebrow");
  const title = document.getElementById("editor-shortcuts-title");
  const copy = document.getElementById("editor-shortcuts-copy");
  const closeButton = document.getElementById("editor-shortcuts-close-button");

  if (eyebrow) {
    eyebrow.textContent = panel.eyebrow || "Atalhos";
  }
  if (title) {
    title.textContent = panel.title || "Comandos do editor";
  }
  if (copy) {
    copy.textContent = panel.copy || "";
  }
  if (closeButton) {
    closeButton.textContent = panel.close_label || "Fechar";
  }
}

function renderSidebarTabs() {
  const tabsById = Object.fromEntries((editorState.screen.sidebar_tabs || []).map((tab) => [tab.id, tab]));
  const buttonMap = {
    map_editor_tab_legends: document.getElementById("editor-tab-button-legends"),
    map_editor_tab_layers: document.getElementById("editor-tab-button-layers"),
    map_editor_tab_leaflet: document.getElementById("editor-tab-button-leaflet"),
  };

  Object.entries(buttonMap).forEach(([tabId, button]) => {
    if (!button) {
      return;
    }
    button.textContent = tabsById[tabId]?.label || button.textContent;
    const active = tabId === editorState.activeSidebarTabId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const active = panel.dataset.tabPanel === editorState.activeSidebarTabId;
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", active ? "false" : "true");
    panel.style.display = active ? "grid" : "none";
  });
}

function shortcutsDialog() {
  return document.getElementById("editor-shortcuts-dialog");
}

function openShortcutsDialog() {
  const dialog = shortcutsDialog();
  if (!dialog) {
    return;
  }
  if (!dialog.open && typeof dialog.showModal === "function") {
    dialog.showModal();
    document.getElementById("editor-shortcuts-close-button")?.focus();
    return;
  }
  dialog.setAttribute("open", "open");
  document.getElementById("editor-shortcuts-close-button")?.focus();
}

function closeShortcutsDialog() {
  const dialog = shortcutsDialog();
  if (!dialog) {
    return;
  }
  if (dialog.open && typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function dialogById(id) {
  return document.getElementById(id);
}

function openDialogElement(dialog, focusTargetId = "") {
  if (!dialog) {
    return;
  }
  if (!dialog.open && typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "open");
  }
  if (focusTargetId) {
    document.getElementById(focusTargetId)?.focus();
  }
}

function closeDialogElement(dialog) {
  if (!dialog) {
    return;
  }
  if (dialog.open && typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function mapRepositoryStatusMessages() {
  return mapRepositoryControls().status_messages || {};
}

function renderMapRepositoryDialogs() {
  const controls = mapRepositoryControls();
  const activeMap = activeMapEntry();
  const registry = editorState.mapRepository || { maps: [] };

  const newDialog = controls.new_map_dialog || {};
  const saveDialog = controls.save_map_dialog || {};
  const loadDialog = controls.load_map_dialog || {};

  document.getElementById("editor-map-new-eyebrow").textContent = newDialog.eyebrow || "Mapas";
  document.getElementById("editor-map-new-title").textContent = newDialog.title || "Novo mapa";
  document.getElementById("editor-map-new-copy").textContent = newDialog.copy || "";
  document.getElementById("editor-map-new-name-label").textContent = newDialog.name_label || "Nome do mapa";
  document.getElementById("editor-map-new-description-label").textContent = newDialog.description_label || "Descricao";
  document.getElementById("editor-map-new-submit-button").textContent = newDialog.primary_button_label || "Criar mapa";
  document.getElementById("editor-map-new-close-button").textContent = newDialog.secondary_button_label || "Cancelar";
  document.getElementById("editor-map-new-options").innerHTML = (newDialog.options || [])
    .map((option) => `
      <label class="editor-map-option">
        <input type="checkbox" data-map-option-field="${option.field}" checked />
        <div class="editor-map-option-copy">
          <strong>${escapeHtml(option.label)}</strong>
          <span>${escapeHtml(option.description || "")}</span>
        </div>
      </label>
    `)
    .join("");

  document.getElementById("editor-map-save-eyebrow").textContent = saveDialog.eyebrow || "Mapas";
  document.getElementById("editor-map-save-title").textContent = saveDialog.title || "Salvar mapa";
  document.getElementById("editor-map-save-copy").textContent = saveDialog.copy || "";
  document.getElementById("editor-map-save-name-label").textContent = saveDialog.name_label || "Nome do mapa";
  document.getElementById("editor-map-save-description-label").textContent = saveDialog.description_label || "Descricao";
  document.getElementById("editor-map-save-close-button").textContent = saveDialog.secondary_button_label || "Cancelar";
  document.getElementById("editor-map-save-current-button").textContent = saveDialog.save_button_label || "Salvar atual";
  document.getElementById("editor-map-save-as-button").textContent = saveDialog.save_as_button_label || "Salvar como novo";
  document.getElementById("editor-map-save-current").innerHTML = `
    <strong>${escapeHtml(saveDialog.current_map_label || "Mapa ativo")}</strong>
    <span>${escapeHtml(activeMap?.name || "Mapa atual")}</span>
  `;

  document.getElementById("editor-map-load-eyebrow").textContent = loadDialog.eyebrow || "Mapas";
  document.getElementById("editor-map-load-title").textContent = loadDialog.title || "Carregar mapa";
  document.getElementById("editor-map-load-copy").textContent = loadDialog.copy || "";
  document.getElementById("editor-map-load-close-button").textContent = loadDialog.close_button_label || "Fechar";

  const loadList = document.getElementById("editor-map-load-list");
  if (!registry.maps?.length) {
    loadList.innerHTML = `
      <div class="editor-map-load-item">
        <div class="editor-map-load-copy">
          <strong>${escapeHtml(loadDialog.empty_label || "Nenhum mapa salvo ainda.")}</strong>
        </div>
      </div>
    `;
    return;
  }

  loadList.innerHTML = registry.maps
    .map((item) => `
      <div class="editor-map-load-item" data-map-entry-id="${item.id}">
        <div class="editor-map-load-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <div class="editor-map-load-meta">
            <span>${Number(item.city_count || 0)} cidades</span>
            <span>${Number(item.route_count || 0)} rotas</span>
            <span>${Number(item.graph_node_count || 0)} nos</span>
            ${item.id === registry.active_map_id ? `<span class="editor-map-load-badge">${escapeHtml(loadDialog.active_badge_label || "Ativo")}</span>` : ""}
          </div>
        </div>
        <div class="editor-map-load-actions">
          <button class="editor-header-action" type="button" data-load-map-id="${item.id}">
            <span class="material-symbols-outlined">folder_open</span>
            <span>${escapeHtml(loadDialog.load_button_label || "Carregar")}</span>
          </button>
          ${item.id !== "map_brasix_default" ? `
            <button class="secondary-button" type="button" data-delete-map-id="${item.id}">
              ${escapeHtml(loadDialog.delete_button_label || "Excluir")}
            </button>
          ` : ""}
        </div>
      </div>
    `)
    .join("");
}

function openNewMapDialog() {
  renderMapRepositoryDialogs();
  document.getElementById("editor-map-new-name-input").value = nextMapDraftName();
  document.getElementById("editor-map-new-description-input").value = "";
  openDialogElement(dialogById("editor-map-new-dialog"), "editor-map-new-name-input");
}

function openSaveMapDialog() {
  renderMapRepositoryDialogs();
  const activeMap = activeMapEntry();
  document.getElementById("editor-map-save-name-input").value = activeMap?.name || "";
  document.getElementById("editor-map-save-description-input").value = activeMap?.description || "";
  openDialogElement(dialogById("editor-map-save-dialog"), "editor-map-save-name-input");
}

function openLoadMapDialog() {
  renderMapRepositoryDialogs();
  openDialogElement(dialogById("editor-map-load-dialog"));
}

async function submitMapAction(url, payload, successMessage) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setDraftStatus(data.detail || mapRepositoryStatusMessages().map_action_failed || "Nao foi possivel concluir a operacao do mapa.");
    return false;
  }
  broadcastSync("map-repository");
  setDraftStatus(successMessage || mapRepositoryStatusMessages().map_loaded || "Mapa carregado.");
  window.location.reload();
  return true;
}

async function createMapFromDialog() {
  const options = Object.fromEntries(
    Array.from(document.querySelectorAll("[data-map-option-field]"))
      .map((input) => [input.dataset.mapOptionField, Boolean(input.checked)]),
  );
  const payload = {
    name: document.getElementById("editor-map-new-name-input").value.trim() || nextMapDraftName(),
    description: document.getElementById("editor-map-new-description-input").value.trim(),
    options,
  };
  return submitMapAction(
    "/api/editor/maps/new",
    payload,
    mapRepositoryStatusMessages().map_created || "Novo mapa criado e carregado no editor.",
  );
}

async function saveMapFromDialog({ saveAsNew = false } = {}) {
  const payload = {
    name: document.getElementById("editor-map-save-name-input").value.trim() || activeMapEntry()?.name || "Mapa",
    description: document.getElementById("editor-map-save-description-input").value.trim(),
  };
  return submitMapAction(
    saveAsNew ? "/api/editor/maps/save-as" : "/api/editor/maps/save",
    payload,
    saveAsNew
      ? (mapRepositoryStatusMessages().map_saved_as || "Mapa salvo como nova versao.")
      : (mapRepositoryStatusMessages().map_saved || "Mapa ativo salvo."),
  );
}

async function loadMapById(mapId) {
  const response = await fetch("/api/editor/maps/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ map_id: mapId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setDraftStatus(data.detail || mapRepositoryStatusMessages().map_action_failed || "Nao foi possivel concluir a operacao do mapa.");
    return false;
  }
  broadcastSync("map-repository");
  setDraftStatus(mapRepositoryStatusMessages().map_loaded || "Mapa carregado no editor.");
  window.location.reload();
  return true;
}

async function deleteMapById(mapId) {
  const response = await fetch(`/api/editor/maps/${encodeURIComponent(mapId)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setDraftStatus(data.detail || mapRepositoryStatusMessages().map_action_failed || "Nao foi possivel concluir a operacao do mapa.");
    return false;
  }
  broadcastSync("map-repository");
  setDraftStatus(mapRepositoryStatusMessages().map_deleted || "Mapa excluido do repositorio.");
  window.location.reload();
  return true;
}

function renderNodeControls() {
  const styleSelect = document.getElementById("editor-node-style-select");
  const sizeInput = document.getElementById("editor-node-size-input");
  if (!styleSelect || !sizeInput) {
    return;
  }

  styleSelect.innerHTML = Object.values(editorState.graphNodeStylesById)
    .map((style) => `<option value="${style.id}">${escapeHtml(style.label)}</option>`)
    .join("");
  styleSelect.value = editorState.nodeToolStyleId || defaultGraphNodeStyle()?.id || FALLBACK_GRAPH_NODE_STYLES.default_style_id;
  sizeInput.value = String(Number(editorState.nodeToolSizePx || editorState.graphNodeStylesById[styleSelect.value]?.size_px || 16));
}

function mapFrameElement() {
  return document.querySelector(".editor-map-frame");
}

function normalizePopupAnchor(anchor) {
  const frame = mapFrameElement();
  if (!frame) {
    return { x: 18, y: 18 };
  }

  const frameRect = frame.getBoundingClientRect();
  const padding = 18;
  const popup = document.getElementById("editor-city-popup");
  const popupWidth = popup?.offsetWidth || 340;
  const popupHeight = popup?.offsetHeight || 280;
  const preferredX = frameRect.width - popupWidth - padding;
  const preferredY = padding;
  const maxX = Math.max(padding, frameRect.width - popupWidth - padding);
  const maxY = Math.max(padding, frameRect.height - popupHeight - padding);
  const x = clamp(preferredX, padding, maxX);
  const y = clamp(preferredY, padding, maxY);
  return { x, y };
}

function setCityPopupAnchor(anchor) {
  editorState.cityPopupAnchor = anchor ? { x: Number(anchor.x || 0), y: Number(anchor.y || 0) } : null;
}

function openCustomCityPopupAt(anchor) {
  setCityPopupAnchor(anchor);
  renderCustomCityControls();
}

function hideCustomCityPopup({ clearSelection = false } = {}) {
  const popup = document.getElementById("editor-city-popup");
  if (popup) {
    popup.hidden = true;
    popup.setAttribute("aria-hidden", "true");
    popup.style.left = "";
    popup.style.top = "";
  }
  setCityPopupAnchor(null);
  if (clearSelection) {
    editorState.selectedCityId = null;
    editorState.selectedNodeId = null;
  }
}

function renderCustomCityControls() {
  const popup = document.getElementById("editor-city-popup");
  const container = document.getElementById("editor-city-form");
  if (!popup || !container) {
    return;
  }

  const selectedCity = editorState.selectedCityId ? editorState.citiesById[editorState.selectedCityId] : null;
  if (!selectedCity || !isUserCreatedCity(selectedCity)) {
    container.innerHTML = "";
    hideCustomCityPopup();
    return;
  }

  const autofillState = cityAutofillState(selectedCity.id);
  const autofillMeta = selectedCity.autofill || {};
  const autofillInfoLine = autofillMeta.provider || cityAutofillProviderLabel();
  const inputsDisabled = autofillState.loading ? "disabled" : "";
  let autofillMarkup = "";
  if (autofillState.loading) {
    autofillMarkup = `
      <div class="editor-city-autofill-status" role="status" aria-live="polite">
        <span class="editor-progress-ring" aria-hidden="true"></span>
        <div class="editor-city-autofill-copy">
          <strong>${escapeHtml(screenLabels().city_autofill_loading_label || "Preenchendo automaticamente...")}</strong>
          <span>${escapeHtml(autofillInfoLine || cityAutofillProviderLabel())}</span>
        </div>
      </div>
    `;
  } else if (autofillState.error) {
    autofillMarkup = `
      <div class="editor-inline-feedback is-error" role="status" aria-live="polite">
        <strong>${escapeHtml(screenLabels().city_autofill_failed_label || "Autofill indisponivel")}</strong>
        <span>${escapeHtml(autofillState.error)}</span>
      </div>
    `;
  } else if (autofillMeta.status === "completed" && (autofillMeta.summary || autofillInfoLine)) {
    autofillMarkup = `
      <div class="editor-inline-feedback is-success">
        <strong>${escapeHtml(screenLabels().city_autofill_ready_label || "Autofill concluido")}</strong>
        <span>${escapeHtml(autofillMeta.summary || autofillInfoLine)}</span>
      </div>
    `;
  }

  popup.hidden = false;
  popup.setAttribute("aria-hidden", "false");
  popup.dataset.loading = autofillState.loading ? "true" : "false";
  container.innerHTML = `
    <div class="editor-city-chip-row">
      <span class="editor-city-chip">${escapeHtml(screenLabels().city_created_badge_label || "Criada no editor")}</span>
      <span class="editor-city-chip editor-city-chip-accent">${escapeHtml(screenLabels().city_autofill_badge_label || "Autofill")}</span>
    </div>
    ${autofillMarkup}
    <div class="editor-city-grid">
      <label class="field">
        <span>${escapeHtml(screenLabels().city_name_label || "Nome")}</span>
        <input class="editor-input" type="text" data-city-field="name" value="${escapeHtml(selectedCity.name)}" ${inputsDisabled} />
      </label>
      <label class="field">
        <span>${escapeHtml(screenLabels().city_state_code_label || "UF")}</span>
        <input class="editor-input" type="text" maxlength="3" data-city-field="state_code" value="${escapeHtml(selectedCity.state_code)}" ${inputsDisabled} />
      </label>
    </div>
    <label class="field">
      <span>${escapeHtml(screenLabels().population_label || "Populacao")}</span>
      <input class="editor-input" type="number" min="0" step="1" data-city-field="population" value="${escapeHtml(String(displayPopulationValue(selectedCity)))}" ${inputsDisabled} />
    </label>
  `;

  window.requestAnimationFrame(() => {
    const { x, y } = normalizePopupAnchor(editorState.cityPopupAnchor || { x: 18, y: 18 });
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
  });
}

function pinOptionsMarkup(selectedPinId) {
  return (editorState.bootstrap.map_editor.pin_library.pins || [])
    .map(
      (pin) => `<option value="${pin.id}" ${selectedPinId === pin.id ? "selected" : ""}>${escapeHtml(pin.label)}</option>`,
    )
    .join("");
}

function renderBandList() {
  document.getElementById("editor-band-list").innerHTML = editorState.populationBands
    .map(
      (band) => `
        <article class="editor-band-row" data-band-id="${band.id}">
          <div class="editor-band-topline">
            <label class="field">
              <span>${escapeHtml(screenLabels().band_label || "Faixa")}</span>
              <input class="editor-input" type="text" data-field="label" value="${escapeHtml(band.label)}" />
            </label>
            <button class="ghost-button editor-band-delete" type="button" data-action="delete-band">${escapeHtml(screenLabels().remove_label || "Remover")}</button>
          </div>
          <div class="editor-band-compact-grid">
            <label class="field">
              <span>${escapeHtml(screenLabels().band_min_label || "Min")}</span>
              <input class="editor-input" type="number" min="0" step="10" data-field="min_population_thousands" value="${band.min_population_thousands}" />
            </label>
            <label class="field">
              <span>${escapeHtml(screenLabels().band_max_label || "Max")}</span>
              <input class="editor-input" type="number" min="0" step="10" data-field="max_population_thousands" value="${band.max_population_thousands ?? ""}" />
            </label>
            <label class="field">
              <span>${escapeHtml(screenLabels().band_pin_label || "Pin")}</span>
              <select class="editor-input" data-field="pin_id">
                ${pinOptionsMarkup(band.pin_id)}
              </select>
            </label>
            <label class="field">
              <span>${escapeHtml(screenLabels().band_size_label || "Tamanho")}</span>
              <input class="editor-input" type="number" min="8" max="64" step="1" data-field="marker_size_px" value="${band.marker_size_px}" />
            </label>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderSelectionPanel() {}

function displaySettings() {
  return editorState.displaySettings || {};
}

function displayVisibility() {
  return displaySettings().visibility || {};
}

function displayCityRender() {
  return displaySettings().city_render || {};
}

function displayRouteRender() {
  return displaySettings().route_render || {};
}

function displayGraphNodeRender() {
  return displaySettings().graph_node_render || {};
}

function populationBandFillPalette() {
  return displayCityRender().population_band_fill_colors || {};
}

function populationBandConfiguredColor(band) {
  const configured = band?.id ? populationBandFillPalette()[band.id] : null;
  if (configured) {
    return configured;
  }
  const ordered = sortPopulationBands(editorState.populationBands);
  const bandIndex = Math.max(0, ordered.findIndex((item) => item.id === band?.id));
  return POPULATION_BAND_FILL_PALETTE[bandIndex % POPULATION_BAND_FILL_PALETTE.length];
}

function cityMarkerStrokeColor() {
  return displayCityRender().stroke_color || "#ffffff";
}

function cityMarkerContrastFillColor() {
  return displayCityRender().contrast_fill_color || "#ffffff";
}

function citySelectedHaloFillColor() {
  return displayCityRender().selected_halo_fill_color || "#fff8ec";
}

function citySelectedHaloStrokeColor() {
  return displayCityRender().selected_halo_stroke_color || "#2d5a27";
}

function graphNodeSelectedHaloFillColor() {
  return displayGraphNodeRender().selected_halo_fill_color || "#fff8ec";
}

function graphNodeSelectedHaloStrokeColor() {
  return displayGraphNodeRender().selected_halo_stroke_color || "#2d5a27";
}

function surfaceStyleOverrideForDisplay(surfaceTypeId) {
  return displayRouteRender().surface_style_overrides?.[surfaceTypeId] || {};
}

function surfaceTypeForDisplay(surfaceTypeOrId) {
  const surfaceType = typeof surfaceTypeOrId === "string"
    ? editorState.surfaceTypesById[surfaceTypeOrId]
    : surfaceTypeOrId;
  if (!surfaceType) {
    return null;
  }
  const styleOverride = surfaceStyleOverrideForDisplay(surfaceType.id);
  return {
    ...surfaceType,
    style: {
      ...(surfaceType.style || {}),
      ...(styleOverride.base_color ? { base_color: styleOverride.base_color } : {}),
      ...(styleOverride.overlay_color ? { overlay_color: styleOverride.overlay_color } : {}),
    },
  };
}

function routeSurfaceTypesForDisplay() {
  return Object.values(editorState.surfaceTypesById || {})
    .map((surfaceType) => surfaceTypeForDisplay(surfaceType))
    .filter(Boolean)
    .sort((left, right) => {
      const leftShortcut = Number(left.shortcut_key || 0);
      const rightShortcut = Number(right.shortcut_key || 0);
      if (Number.isFinite(leftShortcut) && Number.isFinite(rightShortcut) && leftShortcut !== rightShortcut) {
        return leftShortcut - rightShortcut;
      }
      return String(left.label || "").localeCompare(String(right.label || ""));
    });
}

function leafletSettings() {
  return editorState.leafletSettings || {};
}

function getValueAtPath(source, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], source);
}

function setValueAtPath(target, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  if (!keys.length) {
    return;
  }
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function controlIsEnabled(control, source) {
  const enabledWhen = control.enabled_when;
  if (!enabledWhen) {
    return true;
  }
  return getValueAtPath(source, enabledWhen.path) === enabledWhen.equals;
}

function rangeDisplayValue(control, value) {
  const numericValue = Number(value);
  if (control.path?.includes("opacity")) {
    return `${Math.round(numericValue * 100)}%`;
  }
  if (control.path?.includes("viscosity")) {
    return `${Math.round(numericValue * 100)}%`;
  }
  if (control.path?.includes("blur")) {
    return `${numberFormatter(1).format(numericValue)} px`;
  }
  if (control.path?.includes("keyboard_pan_delta") || control.path?.includes("wheel_px_per_zoom_level")) {
    return `${numberFormatter(0).format(numericValue)} px`;
  }
  if (control.path?.includes("update_interval") || control.path?.includes("debounce_time")) {
    return `${numberFormatter(0).format(numericValue)} ms`;
  }
  if (control.path?.includes("inertia_deceleration")) {
    return `${numberFormatter(0).format(numericValue)}`;
  }
  if (control.path?.includes("keep_buffer")) {
    return `${numberFormatter(0).format(numericValue)} tiles`;
  }
  if (control.path?.includes("zoom.min_zoom") || control.path?.includes("zoom.max_zoom")) {
    return numberFormatter(0).format(numericValue);
  }
  if (control.path?.includes("brightness") || control.path?.includes("contrast") || control.path?.includes("saturate")) {
    return `${numberFormatter(2).format(numericValue)}x`;
  }
  if (control.path?.includes("zoom_snap") || control.path?.includes("zoom_delta")) {
    return `${numberFormatter(1).format(numericValue)}x`;
  }
  return numberFormatter(2).format(numericValue);
}

function controlMarkup({ control, source, dataAttribute }) {
  const value = getValueAtPath(source, control.path);
  const enabled = controlIsEnabled(control, source);
  if (control.type === "population_band_palette") {
    return `
      <div class="display-field ${enabled ? "" : "is-disabled"}">
        <span>${escapeHtml(control.label)}</span>
        <div class="display-palette-group">
          ${sortPopulationBands(editorState.populationBands)
            .map((band, index) => `
              <div class="display-palette-row">
                <div class="display-palette-row-head">
                  <strong class="display-palette-label">${escapeHtml(band.label)}</strong>
                  <span class="display-palette-meta">${numberFormatter(0).format(index + 1)}</span>
                </div>
                <label class="field display-field">
                  <span>${escapeHtml(control.color_label || "Cor da faixa")}</span>
                  <input
                    class="editor-input editor-color-input"
                    type="color"
                    value="${escapeHtml(populationBandConfiguredColor(band))}"
                    data-${dataAttribute}-custom="${control.id}"
                    data-custom-kind="population_band_palette"
                    data-custom-key="${band.id}"
                    ${enabled ? "" : "disabled"}
                  />
                </label>
              </div>
            `)
            .join("")}
        </div>
      </div>
    `;
  }

  if (control.type === "route_surface_palette") {
    return `
      <div class="display-field ${enabled ? "" : "is-disabled"}">
        <span>${escapeHtml(control.label)}</span>
        <div class="display-palette-group">
          ${routeSurfaceTypesForDisplay()
            .map((surfaceType) => {
              const hasOverlay = Number(surfaceType.style?.overlay_weight || 0) > 0;
              const baseColor = surfaceType.style?.base_color || "#4f6f45";
              const overlayColor = surfaceType.style?.overlay_color || "#fff4dd";
              return `
                <div class="display-palette-row">
                  <div class="display-palette-row-head">
                    <strong class="display-palette-label">${escapeHtml(surfaceType.label || "Rota")}</strong>
                    <span class="display-palette-meta">${escapeHtml(surfaceType.shortcut_key || "")}</span>
                  </div>
                  <div class="display-palette-grid">
                    <label class="field display-field">
                      <span>${escapeHtml(control.base_color_label || "Traço base")}</span>
                      <input
                        class="editor-input editor-color-input"
                        type="color"
                        value="${escapeHtml(baseColor)}"
                        data-${dataAttribute}-custom="${control.id}"
                        data-custom-kind="route_surface_palette"
                        data-custom-key="${surfaceType.id}"
                        data-custom-part="base_color"
                        ${enabled ? "" : "disabled"}
                      />
                    </label>
                    ${hasOverlay ? `
                      <label class="field display-field">
                        <span>${escapeHtml(control.overlay_color_label || "Overlay")}</span>
                        <input
                          class="editor-input editor-color-input"
                          type="color"
                          value="${escapeHtml(overlayColor)}"
                          data-${dataAttribute}-custom="${control.id}"
                          data-custom-kind="route_surface_palette"
                          data-custom-key="${surfaceType.id}"
                          data-custom-part="overlay_color"
                          ${enabled ? "" : "disabled"}
                        />
                      </label>
                    ` : ""}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  if (control.type === "checkbox") {
    return `
      <label class="display-checkbox ${enabled ? "" : "is-disabled"}">
        <input type="checkbox" data-${dataAttribute}="${control.id}" ${value ? "checked" : ""} ${enabled ? "" : "disabled"} />
        <span>${escapeHtml(control.label)}</span>
      </label>
    `;
  }

  if (control.type === "select") {
    return `
      <label class="field display-field ${enabled ? "" : "is-disabled"}">
        <span>${escapeHtml(control.label)}</span>
        <select class="editor-input" data-${dataAttribute}="${control.id}" ${enabled ? "" : "disabled"}>
          ${(control.options || [])
            .map((option) => `<option value="${option.value}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
            .join("")}
        </select>
      </label>
    `;
  }

  if (control.type === "color") {
    return `
      <label class="field display-field ${enabled ? "" : "is-disabled"}">
        <span>${escapeHtml(control.label)}</span>
        <input class="editor-input editor-color-input" type="color" data-${dataAttribute}="${control.id}" value="${escapeHtml(value)}" ${enabled ? "" : "disabled"} />
      </label>
    `;
  }

  if (control.type === "range") {
    return `
      <label class="field display-field ${enabled ? "" : "is-disabled"}">
        <span>${escapeHtml(control.label)}</span>
        <div class="display-range-row">
          <input
            class="editor-input editor-range-input"
            type="range"
            min="${control.min}"
            max="${control.max}"
            step="${control.step}"
            value="${value}"
            data-${dataAttribute}="${control.id}"
            ${enabled ? "" : "disabled"}
          />
          <strong class="display-range-value">${escapeHtml(rangeDisplayValue(control, value))}</strong>
        </div>
      </label>
    `;
  }

  return "";
}

function renderControlSections({ containerId, sections, source, dataAttribute, visibilitySectionIds = [] }) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.innerHTML = sections
    .map((section) => {
      const visibilitySection = visibilitySectionIds.includes(section.id);
      return `
        <section class="display-section" data-display-section="${section.id}">
          <h4 class="display-section-title">${escapeHtml(section.title)}</h4>
          <div class="display-control-grid ${visibilitySection ? "is-visibility" : ""}">
            ${(section.controls || [])
              .map((control) => controlMarkup({ control, source, dataAttribute }))
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderDisplayControls() {
  renderControlSections({
    containerId: "editor-overlay-controls",
    sections: editorState.bootstrap.map_editor.display_controls?.sections || [],
    source: displaySettings(),
    dataAttribute: "overlay-control",
    visibilitySectionIds: ["map_display_section_visibility"],
  });
}

function renderLeafletControls() {
  renderControlSections({
    containerId: "editor-leaflet-controls",
    sections: editorState.bootstrap.map_editor.leaflet_controls?.sections || [],
    source: leafletSettings(),
    dataAttribute: "leaflet-control",
  });
}

function renderAutoRouteControls() {
  const container = document.getElementById("editor-v1-1-auto-route-controls");
  if (!container) {
    return;
  }

  const ui = autoRouteUi();
  const resolutionOptions = autoRouteResolutionOptionsKm();
  const selectedResolution = selectedAutoRouteResolutionKm();
  container.innerHTML = `
    <h4 class="display-section-title">${escapeHtml(ui.section_title || "Roteamento automatico")}</h4>
    <p class="editor-inline-copy">${escapeHtml(
      ui.section_copy
      || "Para rodovias 1, 2 e 3, o editor consulta o OSRM automaticamente quando voce liga duas cidades sem vertices manuais.",
    )}</p>
    <label class="field display-field">
      <span>${escapeHtml(ui.resolution_label || "Resolucao da rota")}</span>
      <div class="display-range-row">
        <input
          id="editor-v1-1-auto-route-resolution"
          class="editor-input editor-range-input"
          type="range"
          min="0"
          max="${Math.max(0, resolutionOptions.length - 1)}"
          step="1"
          value="${editorState.selectedAutoRouteResolutionIndex}"
        />
        <strong id="editor-v1-1-auto-route-resolution-value" class="display-range-value">${escapeHtml(`${selectedResolution} km`)}</strong>
      </div>
    </label>
    <div class="editor-v1-1-auto-route-ticks">
      ${resolutionOptions.map((value, index) => `
        <span class="editor-v1-1-auto-route-tick${index === editorState.selectedAutoRouteResolutionIndex ? " is-active" : ""}">${escapeHtml(String(value))}</span>
      `).join("")}
    </div>
    <p class="editor-inline-copy">${escapeHtml(
      ui.resolution_hint
      || "20 km e o padrao. Valores menores deixam a rota mais fiel; valores maiores deixam o JSON mais leve.",
    )}</p>
    <p class="editor-inline-copy is-muted">${escapeHtml(
      ui.manual_only_hint
      || "Hidrovia e ferrovia continuam manuais nesta versao.",
    )}</p>
  `;
}

function populationBandFillColor(band) {
  return populationBandConfiguredColor(band);
}

function editorCityFillColor(city, band) {
  if (city.id === editorState.selectedCityId) {
    return displayCityRender().selected_fill_color || "#8c4f10";
  }
  if (!citiesAreUnifiedInActiveMap() && isUserCreatedCity(city)) {
    return customCityFillColor();
  }
  const mode = displayCityRender().color_mode || "commodity";
  if (mode === "uniform") {
    return displayCityRender().uniform_fill_color || "#2d5a27";
  }
  if (mode === "population_band") {
    return populationBandFillColor(band);
  }
  const dominantProduct = city.dominant_product_id ? editorState.productsById[city.dominant_product_id] : null;
  return dominantProduct?.color || "#2d5a27";
}

function editorGraphNodeStyle(node) {
  const baseStyle = editorState.graphNodeStylesById[node.style_id] || defaultGraphNodeStyle();
  const settings = displayGraphNodeRender();
  if (settings.use_style_colors !== false) {
    return baseStyle;
  }
  return {
    ...baseStyle,
    fill_color: settings.override_fill_color || baseStyle.fill_color,
    stroke_color: settings.override_stroke_color || baseStyle.stroke_color,
  };
}

function editorRouteStyleOverrides() {
  return {
    opacityScale: Number(displayRouteRender().opacity_scale || 1),
    highlightColor: displayRouteRender().highlight_color || "#2d5a27",
    selectedColor: displayRouteRender().selected_color || "#8c4f10",
    draftColor: displayRouteRender().draft_color || "#2d5a27",
    highlightOverlayColor: displayRouteRender().highlight_overlay_color || "#fff9ea",
    selectedOverlayColor: displayRouteRender().selected_overlay_color || "#fff4dd",
  };
}

function renderLegend() {
  const legend = document.getElementById("editor-population-legend");
  if (displayVisibility().show_population_legend === false) {
    legend.innerHTML = "";
    legend.style.display = "none";
    return;
  }
  legend.style.display = "";
  renderPopulationLegend(legend, {
    cities: Object.values(editorState.citiesById),
    bands: editorState.populationBands,
    pinsById: editorState.pinsById,
    fillColor: displayCityRender().uniform_fill_color || "#2d5a27",
    strokeColor: cityMarkerStrokeColor(),
    contrastFillColor: cityMarkerContrastFillColor(),
    fillColorResolver: populationBandFillColor,
    routeSurfaceTypes: routeSurfaceTypesForDisplay(),
  });
}

function schedulePopulationBandsSave(delayMs = 320) {
  if (editorState.populationBandsSaveTimer) {
    window.clearTimeout(editorState.populationBandsSaveTimer);
  }
  editorState.populationBandsSaveTimer = window.setTimeout(() => {
    editorState.populationBandsSaveTimer = null;
    void savePopulationBands();
  }, delayMs);
}

function scheduleDisplaySettingsSave(delayMs = 180) {
  if (editorState.displaySettingsSaveTimer) {
    window.clearTimeout(editorState.displaySettingsSaveTimer);
  }
  editorState.displaySettingsSaveTimer = window.setTimeout(() => {
    editorState.displaySettingsSaveTimer = null;
    void saveDisplaySettings();
  }, delayMs);
}

function scheduleLeafletSettingsSave(delayMs = 180) {
  if (editorState.leafletSettingsSaveTimer) {
    window.clearTimeout(editorState.leafletSettingsSaveTimer);
  }
  editorState.leafletSettingsSaveTimer = window.setTimeout(() => {
    editorState.leafletSettingsSaveTimer = null;
    void saveLeafletSettings();
  }, delayMs);
}

function edgeEndpointId(edge, side) {
  return side === "from" ? (edge.from_node_id || edge.from_city_id) : (edge.to_node_id || edge.to_city_id);
}

function connectedEdgesForNode(nodeId) {
  return (editorState.routeNetwork.edges || []).filter(
    (edge) => edgeEndpointId(edge, "from") === nodeId || edgeEndpointId(edge, "to") === nodeId,
  );
}

function projectPointOntoSegment(point, segmentStart, segmentEnd) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  if (dx === 0 && dy === 0) {
    return { x: segmentStart.x, y: segmentStart.y, t: 0 };
  }

  const projection = ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / ((dx * dx) + (dy * dy));
  const t = Math.max(0, Math.min(1, projection));
  return {
    x: segmentStart.x + (dx * t),
    y: segmentStart.y + (dy * t),
    t,
  };
}

function distancePointToSegment(point, segmentStart, segmentEnd) {
  const projection = projectPointOntoSegment(point, segmentStart, segmentEnd);
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function nearestEdgeAtLatLng(latlng, tolerancePx = 12) {
  if (!editorState.map || !latlng) {
    return null;
  }

  const clickPoint = editorState.map.latLngToContainerPoint(latlng);
  let bestMatch = null;

  (editorState.routeNetwork.edges || []).forEach((edge) => {
    const latlngs = buildRenderedRouteLatLngs(edge, editorState.nodesById);
    if (latlngs.length < 2) {
      return;
    }

    for (let index = 0; index < latlngs.length - 1; index += 1) {
      const startPoint = editorState.map.latLngToContainerPoint(latlngs[index]);
      const endPoint = editorState.map.latLngToContainerPoint(latlngs[index + 1]);
      const distance = distancePointToSegment(clickPoint, startPoint, endPoint);
      if (distance > tolerancePx) {
        continue;
      }
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { edge, distance };
      }
    }
  });

  return bestMatch?.edge || null;
}

function nearestSplitPointOnEdge(edge, latlng) {
  if (!editorState.map || !edge || !latlng) {
    return null;
  }

  const pathLatLngs = buildRenderedRouteLatLngs(edge, editorState.nodesById);
  if (pathLatLngs.length < 2) {
    return null;
  }

  const clickPoint = editorState.map.latLngToContainerPoint(latlng);
  let bestMatch = null;

  for (let index = 0; index < pathLatLngs.length - 1; index += 1) {
    const startLatLng = window.L.latLng(pathLatLngs[index][0], pathLatLngs[index][1]);
    const endLatLng = window.L.latLng(pathLatLngs[index + 1][0], pathLatLngs[index + 1][1]);
    const startPoint = editorState.map.latLngToContainerPoint(startLatLng);
    const endPoint = editorState.map.latLngToContainerPoint(endLatLng);
    const projection = projectPointOntoSegment(clickPoint, startPoint, endPoint);
    const distance = Math.hypot(clickPoint.x - projection.x, clickPoint.y - projection.y);

    if (!bestMatch || distance < bestMatch.distance) {
      const projectedPoint = window.L.point(projection.x, projection.y);
      bestMatch = {
        edge,
        segmentIndex: index,
        projectedRatio: projection.t,
        projectedLatLng: editorState.map.containerPointToLatLng(projectedPoint),
        distance,
        pathLatLngs,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  const projectedPoint = editorState.map.latLngToContainerPoint(bestMatch.projectedLatLng);
  for (let index = 1; index < pathLatLngs.length - 1; index += 1) {
    const vertexPoint = editorState.map.latLngToContainerPoint(pathLatLngs[index]);
    if (Math.hypot(projectedPoint.x - vertexPoint.x, projectedPoint.y - vertexPoint.y) > 8) {
      continue;
    }
    bestMatch.vertexIndex = index;
    bestMatch.projectedLatLng = window.L.latLng(pathLatLngs[index][0], pathLatLngs[index][1]);
    break;
  }

  return bestMatch;
}

function normalizedRouteCoordinate(value) {
  return Number(Number(value).toFixed(5));
}

function buildWaypointRecordsFromLatLngs(latlngs, stamp) {
  return latlngs.map((point, index) => ({
    id: `route_point_${stamp}_${index + 1}`,
    latitude: normalizedRouteCoordinate(point[0]),
    longitude: normalizedRouteCoordinate(point[1]),
  }));
}

function splitTouchesRouteEndpoint(splitDetails, tolerancePx = 10) {
  if (!splitDetails || !editorState.map) {
    return true;
  }

  const projectedPoint = editorState.map.latLngToContainerPoint(splitDetails.projectedLatLng);
  const firstPoint = editorState.map.latLngToContainerPoint(splitDetails.pathLatLngs[0]);
  const lastPoint = editorState.map.latLngToContainerPoint(splitDetails.pathLatLngs[splitDetails.pathLatLngs.length - 1]);
  return (
    Math.hypot(projectedPoint.x - firstPoint.x, projectedPoint.y - firstPoint.y) <= tolerancePx
    || Math.hypot(projectedPoint.x - lastPoint.x, projectedPoint.y - lastPoint.y) <= tolerancePx
  );
}

function buildSplitEdgeFromOriginal({ originalEdge, fromNodeId, toNodeId, waypointLatLngs, suffix, timestamp }) {
  const edge = {
    id: `edge-${fromNodeId}-${toNodeId}-${timestamp}${suffix}`,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    from_city_id: isCityNode(fromNodeId) ? fromNodeId : null,
    to_city_id: isCityNode(toNodeId) ? toNodeId : null,
    mode: originalEdge.mode || "road",
    surface_type_id: originalEdge.surface_type_id || "route_surface_single_road",
    surface_code: originalEdge.surface_code || "single_road",
    geometry_type_id: originalEdge.geometry_type_id || polycurveGeometryType().id,
    geometry_code: originalEdge.geometry_code || polycurveGeometryType().code,
    render_smoothing_enabled: false,
    status: originalEdge.status || "active",
    bidirectional: originalEdge.bidirectional !== false,
    distance_km: null,
    notes: originalEdge.notes || "Criada no editor de mapa",
    waypoints: buildWaypointRecordsFromLatLngs(waypointLatLngs, `${timestamp}${suffix}`),
  };

  edge.distance_km = computeRouteDistanceKm(edge, editorState.nodesById);
  return edge;
}

function buildSplitEdgesForInsertedNode({ targetEdge, insertedNodeId, splitDetails, timestamp }) {
  const firstWaypointLatLngs = Number.isInteger(splitDetails.vertexIndex)
    ? splitDetails.pathLatLngs.slice(1, splitDetails.vertexIndex)
    : splitDetails.pathLatLngs.slice(1, splitDetails.segmentIndex + 1);
  const secondWaypointLatLngs = Number.isInteger(splitDetails.vertexIndex)
    ? splitDetails.pathLatLngs.slice(splitDetails.vertexIndex + 1, splitDetails.pathLatLngs.length - 1)
    : splitDetails.pathLatLngs.slice(splitDetails.segmentIndex + 1, splitDetails.pathLatLngs.length - 1);

  return [
    buildSplitEdgeFromOriginal({
      originalEdge: targetEdge,
      fromNodeId: edgeEndpointId(targetEdge, "from"),
      toNodeId: insertedNodeId,
      waypointLatLngs: firstWaypointLatLngs,
      suffix: "a",
      timestamp,
    }),
    buildSplitEdgeFromOriginal({
      originalEdge: targetEdge,
      fromNodeId: insertedNodeId,
      toNodeId: edgeEndpointId(targetEdge, "to"),
      waypointLatLngs: secondWaypointLatLngs,
      suffix: "b",
      timestamp,
    }),
  ];
}

function edgeOtherEndpointId(edge, nodeId) {
  const fromId = edgeEndpointId(edge, "from");
  const toId = edgeEndpointId(edge, "to");
  if (fromId === nodeId) {
    return toId;
  }
  if (toId === nodeId) {
    return fromId;
  }
  return null;
}

function edgePathEndingAtNode(edge, nodeId) {
  const rawLatLngs = buildRouteLatLngs(edge, editorState.nodesById);
  if (edgeEndpointId(edge, "to") === nodeId) {
    return rawLatLngs;
  }
  if (edgeEndpointId(edge, "from") === nodeId) {
    return [...rawLatLngs].reverse();
  }
  return [];
}

function edgePathStartingAtNode(edge, nodeId) {
  const rawLatLngs = buildRouteLatLngs(edge, editorState.nodesById);
  if (edgeEndpointId(edge, "from") === nodeId) {
    return rawLatLngs;
  }
  if (edgeEndpointId(edge, "to") === nodeId) {
    return [...rawLatLngs].reverse();
  }
  return [];
}

function canMergeNodeEdges(leftEdge, rightEdge) {
  if (!leftEdge || !rightEdge) {
    return false;
  }
  return (
    leftEdge.mode === rightEdge.mode
    && leftEdge.surface_type_id === rightEdge.surface_type_id
    && leftEdge.surface_code === rightEdge.surface_code
    && leftEdge.geometry_type_id === rightEdge.geometry_type_id
    && leftEdge.geometry_code === rightEdge.geometry_code
    && (leftEdge.render_smoothing_enabled !== false) === (rightEdge.render_smoothing_enabled !== false)
    && leftEdge.status === rightEdge.status
    && leftEdge.bidirectional === rightEdge.bidirectional
  );
}

function buildMergedEdgeFromNode({ nodeId, node, firstEdge, secondEdge }) {
  const firstOtherId = edgeOtherEndpointId(firstEdge, nodeId);
  const secondOtherId = edgeOtherEndpointId(secondEdge, nodeId);
  if (!firstOtherId || !secondOtherId || firstOtherId === secondOtherId) {
    return null;
  }
  if (!canMergeNodeEdges(firstEdge, secondEdge)) {
    return null;
  }

  const firstPath = edgePathEndingAtNode(firstEdge, nodeId);
  const secondPath = edgePathStartingAtNode(secondEdge, nodeId);
  if (firstPath.length < 2 || secondPath.length < 2) {
    return null;
  }

  const mergedLatLngs = [...firstPath.slice(0, -1), ...secondPath.slice(1)];
  const timestamp = Date.now();
  const notes = [firstEdge.notes, secondEdge.notes, `No ${node.label} removido no editor de mapa`]
    .filter(Boolean)
    .join(" | ");
  const edge = {
    id: `edge-${firstOtherId}-${secondOtherId}-${timestamp}`,
    from_node_id: firstOtherId,
    to_node_id: secondOtherId,
    from_city_id: isCityNode(firstOtherId) ? firstOtherId : null,
    to_city_id: isCityNode(secondOtherId) ? secondOtherId : null,
    mode: firstEdge.mode || "road",
    surface_type_id: firstEdge.surface_type_id || "route_surface_single_road",
    surface_code: firstEdge.surface_code || "single_road",
    geometry_type_id: firstEdge.geometry_type_id || polycurveGeometryType().id,
    geometry_code: firstEdge.geometry_code || polycurveGeometryType().code,
    render_smoothing_enabled: firstEdge.render_smoothing_enabled !== false && secondEdge.render_smoothing_enabled !== false,
    status: firstEdge.status || "active",
    bidirectional: firstEdge.bidirectional !== false,
    distance_km: null,
    notes,
    waypoints: buildWaypointRecordsFromLatLngs(mergedLatLngs.slice(1, -1), timestamp),
  };

  edge.distance_km = computeRouteDistanceKm(edge, editorState.nodesById);
  return edge;
}

function eraseDraftStep() {
  if (!routeModeActive()) {
    return false;
  }

  if (editorState.draft.waypoints.length > 0) {
    removeDraftWaypoint(editorState.draft);
    setDraftStatus(editorState.screen.status_messages.draft_point_removed || editorState.screen.status_messages.draft_start);
    renderMap();
    return true;
  }

  if (editorState.draft.fromCityId || editorState.draft.toCityId) {
    resetDraft(editorState.draft);
    editorState.selectedCityId = null;
    editorState.selectedNodeId = null;
    editorState.selectedEdgeId = null;
    setDraftStatus(editorState.screen.status_messages.draft_cleared || routeModeMessage());
    renderMap();
    return true;
  }

  editorState.draft.activeToolId = "tool_map_pan";
  setDraftStatus(editorState.screen.status_messages.route_mode_off || editorState.screen.status_messages.idle);
  renderMap();
  return true;
}

function buildGraphNodeId() {
  return `graph_node_${Date.now()}`;
}

function buildGraphNodeLabel() {
  const nextIndex = (editorState.routeNetwork.nodes || []).length + 1;
  return `${screenLabels().junction_short_label || "Ligacao"} ${String(nextIndex).padStart(2, "0")}`;
}

function nodeSnapTolerancePx() {
  return Number(editorState.bootstrap?.map_editor?.tool_modes?.node_snap_tolerance_px || 8);
}

function buildGraphNodeRecord({
  latitude,
  longitude,
  placementMode = "free",
  snappedFromEdgeId = null,
}) {
  const style = editorState.graphNodeStylesById[editorState.nodeToolStyleId] || defaultGraphNodeStyle();
  return {
    id: buildGraphNodeId(),
    label: buildGraphNodeLabel(),
    node_kind: "junction",
    placement_mode: placementMode,
    latitude: normalizedRouteCoordinate(latitude),
    longitude: normalizedRouteCoordinate(longitude),
    style_id: style?.id || "graph_node_style_junction_diamond",
    size_px: Number(editorState.nodeToolSizePx || style?.size_px || 16),
    snapped_from_edge_id: snappedFromEdgeId,
    notes: placementMode === "snapped_route" ? "Criado com snap em rota no editor de mapa" : "Criado livre no editor de mapa",
  };
}

function buildManualCityRecord(latlng, overrides = {}) {
  const name = overrides.name || nextManualCityName();
  const stateCode = (overrides.state_code || "ZZ").toUpperCase();
  return {
    id: overrides.id || buildManualCityId(),
    name,
    label: buildManualCityLabel(name, stateCode),
    state_code: stateCode,
    state_name: overrides.state_name || "Estado manual",
    source_region_name: overrides.source_region_name || "Cidade criada no editor",
    population_thousands: Number(overrides.population_thousands || 100),
    latitude: normalizedRouteCoordinate(latlng.lat),
    longitude: normalizedRouteCoordinate(latlng.lng),
    is_user_created: true,
    autofill: {
      provider: cityAutofillProviderLabel(),
      model: null,
      status: "pending",
      confidence: null,
      summary: null,
      last_error: null,
    },
  };
}

async function createFreeManualCityAt(latlng, popupAnchor = null) {
  const city = buildManualCityRecord(latlng);
  const previousCities = [...(editorState.bootstrap.cities || [])];
  editorState.bootstrap.cities = [...previousCities, city];
  rebuildCityCatalogsFromBootstrap();
  const saved = await saveMapCities(
    editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.city_selected
    || editorState.screen.status_messages.idle,
  );
  if (!saved) {
    editorState.bootstrap.cities = previousCities;
    rebuildCityCatalogsFromBootstrap();
    renderMap();
    return;
  }

  editorState.selectedCityId = city.id;
  editorState.selectedNodeId = city.id;
  editorState.selectedEdgeId = null;
  setCityPopupAnchor(popupAnchor);
  setCityAutofillState(city.id, {
    loading: false,
    error: "",
    requestId: 0,
  });
  renderCustomCityControls();
  renderMap();
  void requestCustomCityAutofill(city.id);
}

async function createSnappedManualCityAt(latlng, targetEdge, popupAnchor = null) {
  const splitDetails = nearestSplitPointOnEdge(targetEdge, latlng);
  if (!splitDetails || splitTouchesRouteEndpoint(splitDetails)) {
    await createFreeManualCityAt(latlng, popupAnchor);
    return;
  }

  const city = buildManualCityRecord(splitDetails.projectedLatLng);
  const timestamp = Date.now();
  const previousCities = [...(editorState.bootstrap.cities || [])];
  const previousEdges = [...(editorState.routeNetwork.edges || [])];

  editorState.bootstrap.cities = [...previousCities, city];
  rebuildCityCatalogsFromBootstrap();
  editorState.routeNetwork.edges = previousEdges
    .filter((edge) => edge.id !== targetEdge.id)
    .concat(buildSplitEdgesForInsertedNode({
      targetEdge,
      insertedNodeId: city.id,
      splitDetails,
      timestamp,
    }));
  rebuildNodeCatalogs();

  const savedCities = await saveMapCities(
    editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.city_selected
    || editorState.screen.status_messages.idle,
  );
  if (!savedCities) {
    editorState.bootstrap.cities = previousCities;
    editorState.routeNetwork.edges = previousEdges;
    rebuildCityCatalogsFromBootstrap();
    rebuildNodeCatalogs();
    renderMap();
    return;
  }

  const savedRoutes = await saveRouteNetwork(
    editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.city_selected
    || editorState.screen.status_messages.idle,
  );
  if (!savedRoutes) {
    editorState.bootstrap.cities = previousCities;
    editorState.routeNetwork.edges = previousEdges;
    rebuildCityCatalogsFromBootstrap();
    rebuildNodeCatalogs();
    await saveMapCities(editorState.screen.status_messages.idle);
    renderMap();
    return;
  }

  editorState.selectedCityId = city.id;
  editorState.selectedNodeId = city.id;
  editorState.selectedEdgeId = null;
  setCityPopupAnchor(popupAnchor);
  setCityAutofillState(city.id, {
    loading: false,
    error: "",
    requestId: 0,
  });
  renderCustomCityControls();
  renderMap();
  void requestCustomCityAutofill(city.id);
}

async function createManualCityAt(latlng, popupAnchor = null, options = {}) {
  if (!latlng) {
    return;
  }

  const { edgeOverride = null, forceFree = false } = options;
  if (forceFree) {
    await createFreeManualCityAt(latlng, popupAnchor);
    return;
  }

  const targetEdge = edgeOverride || nearestEdgeAtLatLng(latlng, nodeSnapTolerancePx());
  if (targetEdge) {
    await createSnappedManualCityAt(latlng, targetEdge, popupAnchor);
    return;
  }

  await createFreeManualCityAt(latlng, popupAnchor);
}

async function convertGraphNodeToManualCity(nodeId, popupAnchor = null) {
  const node = editorState.graphNodesById[nodeId];
  if (!node) {
    return;
  }
  if (!serverSupportsGraphNodes()) {
    setDraftStatus(editorState.screen.status_messages.node_server_restart || editorState.screen.status_messages.idle);
    return;
  }

  const previousCities = [...(editorState.bootstrap.cities || [])];
  const previousNodes = [...(editorState.routeNetwork.nodes || [])];
  const previousEdges = [...(editorState.routeNetwork.edges || [])];
  const city = buildManualCityRecord(
    { lat: node.latitude, lng: node.longitude },
    {
      source_region_name: node.notes || "Cidade criada a partir de no de ligacao",
    },
  );

  editorState.bootstrap.cities = [...previousCities, city];
  editorState.routeNetwork.nodes = previousNodes.filter((item) => item.id !== nodeId);
  editorState.routeNetwork.edges = previousEdges.map((edge) => {
    const nextEdge = { ...edge };
    if (nextEdge.from_node_id === nodeId) {
      nextEdge.from_node_id = city.id;
      nextEdge.from_city_id = city.id;
    }
    if (nextEdge.to_node_id === nodeId) {
      nextEdge.to_node_id = city.id;
      nextEdge.to_city_id = city.id;
    }
    nextEdge.distance_km = computeRouteDistanceKm(nextEdge, {
      ...editorState.nodesById,
      [city.id]: city,
    });
    return nextEdge;
  });
  rebuildCityCatalogsFromBootstrap();
  rebuildNodeCatalogs();

  const savedCities = await saveMapCities(
    editorState.screen.status_messages.node_to_city_converted
    || editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.idle,
  );
  if (!savedCities) {
    editorState.bootstrap.cities = previousCities;
    rebuildCityCatalogsFromBootstrap();
    renderMap();
    return;
  }

  const savedRoutes = await saveRouteNetwork(
    editorState.screen.status_messages.node_to_city_converted
    || editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.idle,
  );
  if (!savedRoutes) {
    editorState.bootstrap.cities = previousCities;
    editorState.routeNetwork.nodes = previousNodes;
    editorState.routeNetwork.edges = previousEdges;
    rebuildCityCatalogsFromBootstrap();
    rebuildNodeCatalogs();
    await saveMapCities(editorState.screen.status_messages.idle);
    renderMap();
    return;
  }

  editorState.selectedCityId = city.id;
  editorState.selectedNodeId = city.id;
  editorState.selectedEdgeId = null;
  setCityPopupAnchor(popupAnchor);
  setCityAutofillState(city.id, {
    loading: false,
    error: "",
    requestId: 0,
  });
  renderCustomCityControls();
  renderMap();
  void requestCustomCityAutofill(city.id);
}

async function deleteCityById(cityId) {
  const city = editorState.citiesById[cityId];
  if (!city || !canDeleteCity(city)) {
    return;
  }

  const deletedCityMessage = citiesAreUnifiedInActiveMap()
    ? (editorState.screen.status_messages.city_deleted || editorState.screen.status_messages.custom_city_deleted || editorState.screen.status_messages.idle)
    : (editorState.screen.status_messages.custom_city_deleted || editorState.screen.status_messages.idle);
  const deletedCityWithRoutesMessage = citiesAreUnifiedInActiveMap()
    ? (editorState.screen.status_messages.city_deleted_with_routes || editorState.screen.status_messages.custom_city_deleted_with_routes || deletedCityMessage)
    : (editorState.screen.status_messages.custom_city_deleted_with_routes || deletedCityMessage);

  const previousCities = [...(editorState.bootstrap.cities || [])];
  const previousEdges = [...(editorState.routeNetwork.edges || [])];
  const filteredEdges = previousEdges.filter((edge) => edge.from_node_id !== cityId && edge.to_node_id !== cityId);
  const removedRouteCount = previousEdges.length - filteredEdges.length;

  editorState.bootstrap.cities = previousCities.filter((item) => item.id !== cityId);
  editorState.routeNetwork.edges = filteredEdges;
  rebuildCityCatalogsFromBootstrap();

  const savedRoutes = removedRouteCount > 0
    ? await saveRouteNetwork(
        deletedCityWithRoutesMessage,
      )
    : true;
  if (!savedRoutes) {
    editorState.bootstrap.cities = previousCities;
    editorState.routeNetwork.edges = previousEdges;
    rebuildCityCatalogsFromBootstrap();
    renderMap();
    return;
  }

  const savedCities = await saveMapCities(
    removedRouteCount > 0
      ? deletedCityWithRoutesMessage
      : deletedCityMessage,
  );
  if (!savedCities) {
    editorState.bootstrap.cities = previousCities;
    editorState.routeNetwork.edges = previousEdges;
    rebuildCityCatalogsFromBootstrap();
    renderMap();
    return;
  }

  if (editorState.selectedCityId === cityId) {
    editorState.selectedCityId = null;
  }
  if (editorState.selectedNodeId === cityId) {
    editorState.selectedNodeId = null;
  }
  if (editorState.draft.fromCityId === cityId || editorState.draft.toCityId === cityId) {
    resetDraft(editorState.draft);
  }
  delete editorState.cityAutofillStatesByCityId[cityId];
  hideCustomCityPopup();
  renderCustomCityControls();
  renderMap();
}

async function createFreeGraphNodeAt(latlng) {
  const node = buildGraphNodeRecord({
    latitude: latlng.lat,
    longitude: latlng.lng,
    placementMode: "free",
  });
  const previousNodes = [...(editorState.routeNetwork.nodes || [])];
  editorState.routeNetwork.nodes = [...previousNodes, node];
  rebuildNodeCatalogs();
  const saved = await saveRouteNetwork(
    editorState.screen.status_messages.node_created_free
    || editorState.screen.status_messages.node_created
    || editorState.screen.status_messages.idle,
  );
  if (!saved) {
    editorState.routeNetwork.nodes = previousNodes;
    rebuildNodeCatalogs();
    renderMap();
    return;
  }

  editorState.selectedNodeId = node.id;
  editorState.selectedCityId = null;
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  renderMap();
}

async function createSnappedGraphNodeAt(latlng, targetEdge) {
  if (!serverSupportsGraphNodes()) {
    setDraftStatus(
      editorState.screen.status_messages.node_server_restart
      || "Reinicie o servidor do v1 para habilitar nos de ligacao e rotas com nos.",
    );
    return;
  }

  const splitDetails = nearestSplitPointOnEdge(targetEdge, latlng);
  if (!splitDetails || splitTouchesRouteEndpoint(splitDetails)) {
    return createFreeGraphNodeAt(latlng);
  }

  const timestamp = Date.now();
  const node = buildGraphNodeRecord({
    latitude: splitDetails.projectedLatLng.lat,
    longitude: splitDetails.projectedLatLng.lng,
    placementMode: "snapped_route",
    snappedFromEdgeId: targetEdge.id,
  });

  const previousNodes = [...(editorState.routeNetwork.nodes || [])];
  const previousEdges = [...(editorState.routeNetwork.edges || [])];
  const firstWaypointLatLngs = Number.isInteger(splitDetails.vertexIndex)
    ? splitDetails.pathLatLngs.slice(1, splitDetails.vertexIndex)
    : splitDetails.pathLatLngs.slice(1, splitDetails.segmentIndex + 1);
  const secondWaypointLatLngs = Number.isInteger(splitDetails.vertexIndex)
    ? splitDetails.pathLatLngs.slice(splitDetails.vertexIndex + 1, splitDetails.pathLatLngs.length - 1)
    : splitDetails.pathLatLngs.slice(splitDetails.segmentIndex + 1, splitDetails.pathLatLngs.length - 1);

  editorState.routeNetwork.nodes = [...previousNodes, node];
  rebuildNodeCatalogs();
  const replacementEdges = [
    buildSplitEdgeFromOriginal({
      originalEdge: targetEdge,
      fromNodeId: edgeEndpointId(targetEdge, "from"),
      toNodeId: node.id,
      waypointLatLngs: firstWaypointLatLngs,
      suffix: "a",
      timestamp,
    }),
    buildSplitEdgeFromOriginal({
      originalEdge: targetEdge,
      fromNodeId: node.id,
      toNodeId: edgeEndpointId(targetEdge, "to"),
      waypointLatLngs: secondWaypointLatLngs,
      suffix: "b",
      timestamp,
    }),
  ];
  editorState.routeNetwork.edges = previousEdges
    .filter((edge) => edge.id !== targetEdge.id)
    .concat(replacementEdges);

  const saved = await saveRouteNetwork(
    editorState.screen.status_messages.node_created_snapped
    || editorState.screen.status_messages.node_created
    || editorState.screen.status_messages.idle,
  );
  if (!saved) {
    editorState.routeNetwork.nodes = previousNodes;
    editorState.routeNetwork.edges = previousEdges;
    rebuildNodeCatalogs();
    renderMap();
    return;
  }

  editorState.selectedNodeId = node.id;
  editorState.selectedCityId = null;
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  renderMap();
}

async function createGraphNodeAt(latlng, options = {}) {
  if (!latlng) {
    return;
  }
  if (!serverSupportsGraphNodes()) {
    setDraftStatus(
      editorState.screen.status_messages.node_server_restart
      || "Reinicie o servidor do v1 para habilitar nos de ligacao e rotas com nos.",
    );
    return;
  }

  const { edgeOverride = null, forceFree = false } = options;
  if (forceFree) {
    await createFreeGraphNodeAt(latlng);
    return;
  }

  const targetEdge = edgeOverride || nearestEdgeAtLatLng(latlng, nodeSnapTolerancePx());
  if (targetEdge) {
    await createSnappedGraphNodeAt(latlng, targetEdge);
    return;
  }

  await createFreeGraphNodeAt(latlng);
}

async function deleteGraphNodeById(nodeId) {
  if (!nodeId || isCityNode(nodeId)) {
    return;
  }

  if (!serverSupportsGraphNodes()) {
    setDraftStatus(
      editorState.screen.status_messages.node_server_restart
      || "Reinicie o servidor do v1 para habilitar nos de ligacao e rotas com nos.",
    );
    return;
  }

  const linkedEdges = connectedEdgesForNode(nodeId);
  const previousNodes = [...(editorState.routeNetwork.nodes || [])];
  const previousEdges = [...(editorState.routeNetwork.edges || [])];
  const node = editorState.graphNodesById[nodeId];

  if (linkedEdges.length > 2) {
    setDraftStatus(
      editorState.screen.status_messages.node_delete_blocked
      || "Apague as rotas conectadas antes de remover este no.",
    );
    return;
  }

  editorState.routeNetwork.nodes = previousNodes.filter((item) => item.id !== nodeId);
  if (linkedEdges.length === 0) {
    editorState.routeNetwork.edges = previousEdges;
  } else if (linkedEdges.length === 1) {
    editorState.routeNetwork.edges = previousEdges.filter((edge) => edge.id !== linkedEdges[0].id);
  } else {
    const mergedEdge = buildMergedEdgeFromNode({
      nodeId,
      node,
      firstEdge: linkedEdges[0],
      secondEdge: linkedEdges[1],
    });
    if (!mergedEdge) {
      editorState.routeNetwork.nodes = previousNodes;
      editorState.routeNetwork.edges = previousEdges;
      setDraftStatus(
        editorState.screen.status_messages.node_delete_merge_blocked
        || "Este no conecta rotas incompativeis. Apague as rotas antes de remover o no.",
      );
      return;
    }

    editorState.routeNetwork.edges = previousEdges
      .filter((edge) => edge.id !== linkedEdges[0].id && edge.id !== linkedEdges[1].id)
      .concat(mergedEdge);
  }

  rebuildNodeCatalogs();
  const saved = await saveRouteNetwork(
    linkedEdges.length === 2
      ? (editorState.screen.status_messages.node_deleted_merged || editorState.screen.status_messages.node_deleted || editorState.screen.status_messages.idle)
      : (editorState.screen.status_messages.node_deleted || editorState.screen.status_messages.idle),
  );
  if (!saved) {
    editorState.routeNetwork.nodes = previousNodes;
    editorState.routeNetwork.edges = previousEdges;
    rebuildNodeCatalogs();
    renderMap();
    return;
  }

  if (editorState.selectedNodeId === nodeId) {
    editorState.selectedNodeId = null;
  }
  if (linkedEdges.some((edge) => edge.id === editorState.selectedEdgeId)) {
    editorState.selectedEdgeId = null;
  }
  renderMap();
}

function initializeMap() {
  if (editorState.map) {
    return;
  }

  editorState.map = createBrasixMap({
    elementId: "editor-map-stage",
    viewport: editorState.bootstrap.map_viewport,
    leafletSettings: leafletSettings(),
  });
  editorState.routeLayer = window.L.layerGroup().addTo(editorState.map);
  editorState.selectedLayer = window.L.layerGroup().addTo(editorState.map);
  editorState.draftLayer = window.L.layerGroup().addTo(editorState.map);
  editorState.markerLayer = window.L.layerGroup().addTo(editorState.map);

  editorState.map.getContainer().addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  editorState.map.on("click", (event) => {
    if (cityModeActive()) {
      void createManualCityAt(event.latlng, popupAnchorFromPointerEvent(event.originalEvent), {
        forceFree: Boolean(event.originalEvent?.altKey),
      });
      return;
    }
    if (nodeToCityModeActive()) {
      setDraftStatus(editorState.screen.status_messages.node_to_city_need_node || editorState.screen.status_messages.idle);
      return;
    }
    if (nodeModeActive()) {
      void createGraphNodeAt(event.latlng, {
        forceFree: Boolean(event.originalEvent?.altKey),
      });
      return;
    }
    if (!routeModeActive()) {
      return;
    }
    if (!editorState.draft.fromCityId || editorState.draft.toCityId) {
      setDraftStatus(editorState.screen.status_messages.draft_need_origin || routeModeMessage());
      return;
    }
    addDraftWaypoint(editorState.draft, event.latlng);
    setDraftStatus(editorState.screen.status_messages.draft_point_added || editorState.screen.status_messages.draft_start);
    renderSelectionPanel();
    renderMap();
  });

  editorState.map.on("contextmenu", (event) => {
    event.originalEvent?.preventDefault?.();
    const clickedEdge = nearestEdgeAtLatLng(event.latlng);
    if (clickedEdge) {
      void deleteRouteById(clickedEdge.id);
      return;
    }
    eraseDraftStep();
  });
}

function cityTooltip(city) {
  const dominant = city.dominant_product_id ? editorState.productsById[city.dominant_product_id] : null;
  const dominantLine = (!citiesAreUnifiedInActiveMap() && isUserCreatedCity(city))
    ? (screenLabels().city_created_badge_label || "Criada no editor")
    : (dominant ? `${dominant.icon} ${dominant.name}` : "Sem destaque");
  return `
    <strong>${escapeHtml(city.label)}</strong><br>
    Populacao: ${numberFormatter(0).format(city.population_thousands)} mil<br>
    ${escapeHtml(dominantLine)}
  `;
}

function graphNodeTooltip(node) {
  return `
    <strong>${escapeHtml(node.label)}</strong><br>
    ${escapeHtml(screenLabels().junction_label || "No de ligacao")}<br>
    ${numberFormatter(2).format(node.latitude)}, ${numberFormatter(2).format(node.longitude)}
  `;
}

function popupAnchorFromPointerEvent(pointerEvent) {
  const frame = mapFrameElement();
  if (!frame || !pointerEvent) {
    return null;
  }
  const rect = frame.getBoundingClientRect();
  return {
    x: pointerEvent.clientX - rect.left,
    y: pointerEvent.clientY - rect.top,
  };
}

function renderMap() {
  initializeMap();
  applyBrasixLeafletSettings(editorState.map, editorState.bootstrap.map_viewport, leafletSettings());
  editorState.routeLayer.clearLayers();
  editorState.selectedLayer.clearLayers();
  editorState.draftLayer.clearLayers();
  editorState.markerLayer.clearLayers();
  const visibility = displayVisibility();
  const routeStyleOverrides = editorRouteStyleOverrides();

  if (visibility.show_routes !== false) {
    (editorState.routeNetwork.edges || []).forEach((edge) => {
      const layer = createRouteLayer({
        edge,
        citiesById: editorState.nodesById,
        surfaceType: surfaceTypeForDisplay(edge.surface_type_id),
        role: "network",
        interactive: true,
        styleOverrides: routeStyleOverrides,
        onClick: (selectedEdge, event) => {
          if (cityModeActive()) {
            void createManualCityAt(
              event?.latlng || event?.latlngs?.[0] || null,
              popupAnchorFromPointerEvent(event?.originalEvent),
              {
                edgeOverride: selectedEdge,
                forceFree: Boolean(event?.originalEvent?.altKey),
              },
            );
            return;
          }
          if (nodeModeActive()) {
            void createGraphNodeAt(event?.latlng || event?.latlngs?.[0] || null, {
              edgeOverride: selectedEdge,
              forceFree: Boolean(event?.originalEvent?.altKey),
            });
            return;
          }
          editorState.selectedEdgeId = selectedEdge.id;
          editorState.selectedCityId = null;
          editorState.selectedNodeId = null;
          setDraftStatus(editorState.screen.status_messages.route_selected);
          renderMap();
        },
        onContextMenu: async (selectedEdge) => {
          await deleteRouteById(selectedEdge.id);
        },
      });
      if (layer) {
        layer.addTo(editorState.routeLayer);
      }
    });
  }

  if (visibility.show_routes !== false && editorState.selectedEdgeId) {
    const edge = (editorState.routeNetwork.edges || []).find((item) => item.id === editorState.selectedEdgeId);
    if (edge) {
      const selectedLayer = createRouteLayer({
        edge,
        citiesById: editorState.nodesById,
        surfaceType: surfaceTypeForDisplay(edge.surface_type_id),
        role: "selected",
        styleOverrides: routeStyleOverrides,
      });
      if (selectedLayer) {
        selectedLayer.addTo(editorState.selectedLayer);
      }
    }
  }

  if (editorState.draft.fromCityId) {
    const geometryType = polycurveGeometryType();
    const draftSurface = currentDisplaySurfaceType();
    const draftEdge = {
      id: "draft-edge",
      from_node_id: editorState.draft.fromCityId,
      to_node_id: editorState.draft.toCityId || editorState.draft.fromCityId,
      from_city_id: isCityNode(editorState.draft.fromCityId) ? editorState.draft.fromCityId : null,
      to_city_id: isCityNode(editorState.draft.toCityId || editorState.draft.fromCityId)
        ? (editorState.draft.toCityId || editorState.draft.fromCityId)
        : null,
      surface_type_id: editorState.draft.surfaceTypeId,
      surface_code: draftSurface?.code || "single_road",
      geometry_type_id: geometryType.id,
      geometry_code: geometryType?.code || "polycurve",
      waypoints: geometryType?.allow_waypoints
        ? editorState.draft.waypoints.map((waypoint, index) => ({
            id: `draft_waypoint_${index + 1}`,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
          }))
        : [],
    };

    if (!editorState.draft.toCityId) {
      const fromNode = editorState.nodesById[editorState.draft.fromCityId];
      const trailPoints = [
        { id: "draft_anchor", latitude: fromNode.latitude, longitude: fromNode.longitude },
        ...draftEdge.waypoints,
      ];
      if (trailPoints.length > 1) {
        const polyline = window.L.polyline(
          buildBezierLikeLatLngs(trailPoints.map((point) => [point.latitude, point.longitude])),
          {
            color: routeStyleOverrides.draftColor || "#2d5a27",
            weight: Math.max(4, Number(draftSurface?.style?.base_weight || 4)),
            opacity: 0.94,
            dashArray: draftSurface?.style?.dash_array || "10 8",
            pane: "brasix-draft",
            bubblingMouseEvents: false,
          },
        );
        polyline.addTo(editorState.draftLayer);
      }
    } else {
      const layer = createRouteLayer({
        edge: draftEdge,
        citiesById: editorState.nodesById,
        surfaceType: draftSurface,
        role: "draft",
      });
      if (layer) {
        layer.addTo(editorState.draftLayer);
      }
    }
  }

  if (visibility.show_cities !== false) {
    Object.values(editorState.citiesById).forEach((city) => {
      const band = findPopulationBand(city, editorState.populationBands);
      const pin = editorState.pinsById[band?.pin_id] || editorState.pinsById[Object.keys(editorState.pinsById)[0]];
      const marker = createCityMarker({
        city,
        band,
        pin,
        fillColor: editorCityFillColor(city, band),
        strokeColor: cityMarkerStrokeColor(),
        contrastFillColor: cityMarkerContrastFillColor(),
        selectedHaloFillColor: citySelectedHaloFillColor(),
        selectedHaloStrokeColor: citySelectedHaloStrokeColor(),
        selected: city.id === editorState.selectedCityId || city.id === editorState.draft.fromCityId || city.id === editorState.draft.toCityId,
        opacity: Number(displayCityRender().opacity || 0.96),
      });

      marker.bindTooltip(cityTooltip(city), {
        className: "brasix-map-tooltip",
        direction: "top",
        offset: [0, -8],
        sticky: true,
      });
      marker.on("click", async (event) => handleNodeClick(city.id, { popupAnchor: popupAnchorFromPointerEvent(event.originalEvent) }));
      marker.on("contextmenu", (event) => {
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        if (canDeleteCity(city)) {
          void deleteCityById(city.id);
          return;
        }
        eraseDraftStep();
      });
      marker.addTo(editorState.markerLayer);
    });
  }

  if (visibility.show_graph_nodes !== false) {
    Object.values(editorState.graphNodesById).forEach((node) => {
      const marker = createGraphNodeMarker({
        node,
        style: editorGraphNodeStyle(node),
        selectedHaloFillColor: graphNodeSelectedHaloFillColor(),
        selectedHaloStrokeColor: graphNodeSelectedHaloStrokeColor(),
        selected: node.id === editorState.selectedNodeId || node.id === editorState.draft.fromCityId || node.id === editorState.draft.toCityId,
        opacity: Number(displayGraphNodeRender().opacity || 0.98),
      });

      marker.bindTooltip(graphNodeTooltip(node), {
        className: "brasix-map-tooltip",
        direction: "top",
        offset: [0, -8],
        sticky: true,
      });
      marker.on("click", async (event) => handleNodeClick(node.id, { popupAnchor: popupAnchorFromPointerEvent(event.originalEvent) }));
      marker.on("contextmenu", (event) => {
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        void deleteGraphNodeById(node.id);
      });
      marker.addTo(editorState.markerLayer);
    });
  }

  renderNodeControls();
  renderLegend();
}

function routeReady() {
  return Boolean(editorState.draft.fromCityId && editorState.draft.toCityId && editorState.draft.fromCityId !== editorState.draft.toCityId);
}

async function handleNodeClick(nodeId, options = {}) {
  editorState.selectedNodeId = nodeId;
  editorState.selectedCityId = isCityNode(nodeId) ? nodeId : null;
  editorState.selectedEdgeId = null;

  if (nodeToCityModeActive()) {
    if (isCityNode(nodeId)) {
      setDraftStatus(editorState.screen.status_messages.node_to_city_invalid_target || editorState.screen.status_messages.idle);
      if (isUserCreatedCity(nodeId)) {
        setCityPopupAnchor(options.popupAnchor || editorState.cityPopupAnchor || { x: 18, y: 18 });
      } else {
        hideCustomCityPopup();
      }
      renderMap();
      renderCustomCityControls();
      return;
    }

    await convertGraphNodeToManualCity(nodeId, options.popupAnchor || editorState.cityPopupAnchor || { x: 18, y: 18 });
    return;
  }

  if (routeModeActive()) {
    if (!editorState.draft.fromCityId) {
      editorState.draft.fromCityId = nodeId;
      setDraftStatus(editorState.screen.status_messages.draft_start);
      renderMap();
      return;
    }

    if (nodeId === editorState.draft.fromCityId) {
      setDraftStatus(editorState.screen.status_messages.draft_same_city || editorState.screen.status_messages.draft_start);
      renderMap();
      return;
    }

    editorState.draft.toCityId = nodeId;
    setDraftStatus(editorState.screen.status_messages.draft_ready);
    renderMap();
    await confirmDraftRoute();
    return;
  }

  setDraftStatus(
    isCityNode(nodeId)
      ? (
        isUserCreatedCity(nodeId)
          ? (editorState.screen.status_messages.custom_city_selected || editorState.screen.status_messages.city_selected || editorState.screen.status_messages.idle)
          : (editorState.screen.status_messages.city_selected || editorState.screen.status_messages.idle)
      )
      : (editorState.screen.status_messages.node_selected || editorState.screen.status_messages.idle),
  );
  if (isUserCreatedCity(nodeId)) {
    setCityPopupAnchor(options.popupAnchor || editorState.cityPopupAnchor || { x: 18, y: 18 });
  } else {
    hideCustomCityPopup();
  }
  renderMap();
  renderCustomCityControls();
}

async function savePopulationBands() {
  if (!editorState.bootstrap?.map_editor?.population_bands) {
    return;
  }
  const payload = {
    id: editorState.bootstrap.map_editor.population_bands.id,
    unit: editorState.bootstrap.map_editor.population_bands.unit,
    bands: editorState.populationBands.map((band, index) => ({
      ...band,
      legend_order: index + 1,
      min_population_thousands: Number(band.min_population_thousands),
      max_population_thousands: band.max_population_thousands === "" || band.max_population_thousands == null
        ? null
        : Number(band.max_population_thousands),
      marker_size_px: Number(band.marker_size_px),
    })),
  };

  const response = await fetch("/api/editor/map/population-bands", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    setDraftStatus(data.detail || screenErrors().save_bands || "Nao foi possivel salvar as faixas.");
    return;
  }

  editorState.bootstrap.map_editor.population_bands = data;
  editorState.populationBands = sortPopulationBands(data.bands || []);
  renderBandList();
  renderMap();
  setDraftStatus(editorState.screen.status_messages.bands_saved);
  broadcastSync("population-bands");
}

function mapCitiesDocument() {
  return {
    id: "map_city_catalog_v1",
    cities: (editorState.bootstrap.cities || []).map((city) => ({
      id: city.id,
      name: city.name,
      label: city.label,
      state_code: city.state_code,
      state_name: city.state_name,
      source_region_name: city.source_region_name,
      population_thousands: Number(city.population_thousands || 0),
      latitude: Number(city.latitude),
      longitude: Number(city.longitude),
      is_user_created: Boolean(city.is_user_created),
      autofill: city.autofill ? { ...city.autofill } : null,
    })),
  };
}

async function requestCustomCityAutofill(cityId) {
  const selectedCity = (editorState.bootstrap.cities || []).find((city) => city.id === cityId);
  if (!selectedCity || !isUserCreatedCity(selectedCity)) {
    return;
  }

  const requestId = editorState.cityAutofillRequestSeq + 1;
  editorState.cityAutofillRequestSeq = requestId;
  setCityAutofillState(cityId, {
    loading: true,
    error: "",
    requestId,
  });
  if (selectedCity.autofill) {
    selectedCity.autofill.status = "loading";
    selectedCity.autofill.last_error = null;
  }
  renderCustomCityControls();
  setDraftStatus(
    editorState.screen.status_messages.custom_city_autofill_started
    || editorState.screen.status_messages.custom_city_created
    || editorState.screen.status_messages.idle,
  );

  try {
    await nextPaint();
    const response = await fetch("/api/editor/map/custom-cities/autofill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: serializeCustomCity(selectedCity),
      }),
    });
    const data = await response.json().catch(() => ({}));
    const latestState = cityAutofillState(cityId);
    if (latestState.requestId !== requestId) {
      return;
    }

    if (!response.ok) {
      const detail = data.detail || screenErrors().city_autofill_failed || "Nao foi possivel preencher a cidade com o autofill geografico.";
      const currentCity = (editorState.bootstrap.cities || []).find((city) => city.id === cityId);
      if (currentCity) {
        currentCity.autofill = {
          ...(currentCity.autofill || {}),
          provider: cityAutofillProviderLabel(),
          model: null,
          status: "failed",
          last_error: detail,
        };
        rebuildCityCatalogsFromBootstrap();
        scheduleCustomCitiesSave(
          editorState.screen.status_messages.custom_city_autofill_failed
          || editorState.screen.status_messages.custom_city_created
          || editorState.screen.status_messages.idle,
          0,
        );
      }
      setCityAutofillState(cityId, {
        loading: false,
        error: detail,
        requestId,
      });
      renderCustomCityControls();
      renderMap();
      setDraftStatus(
        editorState.screen.status_messages.custom_city_autofill_failed
        || editorState.screen.status_messages.custom_city_created
        || detail,
      );
      return;
    }

    const autofilledCity = data.city;
    if (!autofilledCity) {
      setCityAutofillState(cityId, {
        loading: false,
        error: screenErrors().city_autofill_failed || "Nao foi possivel preencher a cidade com o autofill geografico.",
        requestId,
      });
      renderCustomCityControls();
      return;
    }

    replaceBootstrapCity({
      ...autofilledCity,
      is_user_created: true,
    });
    setCityAutofillState(cityId, {
      loading: false,
      error: "",
      requestId,
    });
    renderMap();
    renderCustomCityControls();
    await saveMapCities(
      editorState.screen.status_messages.custom_city_autofill_completed
      || editorState.screen.status_messages.custom_city_updated
      || editorState.screen.status_messages.idle,
    );
  } catch (error) {
    const latestState = cityAutofillState(cityId);
    if (latestState.requestId !== requestId) {
      return;
    }
    const detail = error?.message || screenErrors().city_autofill_failed || "Nao foi possivel preencher a cidade com o autofill geografico.";
    setCityAutofillState(cityId, {
      loading: false,
      error: detail,
      requestId,
    });
    renderCustomCityControls();
    setDraftStatus(
      editorState.screen.status_messages.custom_city_autofill_failed
      || detail,
    );
  }
}

async function saveMapCities(message) {
  const response = await fetch("/api/editor/map/cities", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapCitiesDocument()),
  });
  const data = await response.json();
  if (!response.ok) {
    setDraftStatus(data.detail || screenErrors().save_custom_cities || "Nao foi possivel salvar as cidades criadas no editor.");
    return false;
  }

  editorState.bootstrap.cities = data.cities || [];
  editorState.bootstrap.map_editor.user_city_catalog = {
    id: "city_catalog_user_v1",
    cities: (editorState.bootstrap.cities || []).filter((city) => city.is_user_created).map((city) => serializeCustomCity(city)),
  };
  rebuildCityCatalogsFromBootstrap();
  setDraftStatus(message);
  broadcastSync("city-catalog");
  return true;
}

function scheduleCustomCitiesSave(message, delayMs = 180) {
  if (editorState.customCitiesSaveTimer) {
    window.clearTimeout(editorState.customCitiesSaveTimer);
  }
  editorState.customCitiesSaveTimer = window.setTimeout(() => {
    editorState.customCitiesSaveTimer = null;
    void saveMapCities(message);
  }, delayMs);
}

async function saveDisplaySettings() {
  const response = await fetch("/api/editor/map/display-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(displaySettings()),
  });
  const data = await response.json();
  if (!response.ok) {
    setDraftStatus(data.detail || screenErrors().save_display_settings || "Nao foi possivel salvar a visualizacao do mapa.");
    return;
  }

  editorState.displaySettings = data;
  editorState.bootstrap.map_editor.display_settings = data;
  broadcastSync("map-display-settings");
}

async function saveLeafletSettings() {
  const response = await fetch("/api/editor/map/leaflet-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(leafletSettings()),
  });
  const data = await response.json();
  if (!response.ok) {
    setDraftStatus(data.detail || screenErrors().save_leaflet_settings || "Nao foi possivel salvar os parametros do mapa Leaflet.");
    return;
  }

  editorState.leafletSettings = data;
  editorState.bootstrap.map_editor.leaflet_settings = data;
  applyBrasixLeafletSettings(editorState.map, editorState.bootstrap.map_viewport, editorState.leafletSettings);
  broadcastSync("map-leaflet-settings");
}

async function saveRouteNetwork(message) {
  const payload = serverSupportsGraphNodes() ? editorState.routeNetwork : legacyRouteNetworkPayload();
  const response = await fetch("/api/editor/map/route-network", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    setDraftStatus(data.detail || screenErrors().save_graph || "Nao foi possivel salvar o grafo.");
    return false;
  }

  editorState.routeNetwork = data;
  editorState.bootstrap.route_network = data;
  editorState.routeNetwork.nodes = editorState.routeNetwork.nodes || [];
  editorState.bootstrap.route_network.nodes = editorState.bootstrap.route_network.nodes || [];
  rebuildNodeCatalogs();
  setDraftStatus(message);
  broadcastSync("route-network");
  return true;
}

function draftUsesAutoRoute() {
  const surfaceType = currentSurfaceType();
  return (
    routeReady()
    && Boolean(surfaceType)
    && autoRouteSupportedSurfaceCodes().has(surfaceType.code)
    && (editorState.draft.waypoints?.length || 0) === 0
  );
}

async function requestAutoRoutePreviewForDraft() {
  const ui = autoRouteUi();
  const response = await fetch("/api/editor/map_v1_1/route-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from_node_id: editorState.draft.fromCityId,
      to_node_id: editorState.draft.toCityId,
      surface_type_id: editorState.draft.surfaceTypeId,
      resolution_km: selectedAutoRouteResolutionKm(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.detail
      || ui.route_error
      || "Nao foi possivel gerar a rota automatica pelo OSRM.",
    );
  }
  return data;
}

async function confirmDraftRoute() {
  if (!routeReady()) {
    setDraftStatus(screenErrors().route_incomplete || "Defina origem e destino antes de confirmar.");
    return;
  }

  const draftUsesGraphNode = !isCityNode(editorState.draft.fromCityId) || !isCityNode(editorState.draft.toCityId);
  if (draftUsesGraphNode && !serverSupportsGraphNodes()) {
    setDraftStatus(
      editorState.screen.status_messages.node_server_restart
      || "Reinicie o servidor do v1 para habilitar nos de ligacao e rotas com nos.",
    );
    return;
  }

  if (draftUsesAutoRoute()) {
    try {
      setDraftStatus(
        autoRouteUi().route_loading
        || "Consultando o OSRM para gerar a rota automatica...",
      );
      const preview = await requestAutoRoutePreviewForDraft();
      const edge = preview.edge;
      const routeSavedMessage = String(preview?.engine || "").toLowerCase() === "osrm"
        ? (
          autoRouteUi().route_saved
          || editorState.screen.status_messages.route_saved
        )
        : (
          autoRouteUi().route_saved_fallback
          || "OSRM indisponivel; a rota foi salva com um tracado auxiliar em linha reta para voce ajustar depois."
        );
      editorState.routeNetwork.edges.push(edge);
      const saved = await saveRouteNetwork(
        routeSavedMessage,
      );
      if (!saved) {
        editorState.routeNetwork.edges = editorState.routeNetwork.edges.filter((item) => item.id !== edge.id);
        return;
      }

      editorState.selectedEdgeId = edge.id;
      editorState.selectedCityId = null;
      editorState.selectedNodeId = null;
      resetDraft(editorState.draft);
      editorState.draft.activeToolId = "tool_route_draw";
      setDraftStatus(routeSavedMessage);
      renderSelectionPanel();
      renderMap();
      return;
    } catch (error) {
      editorState.draft.toCityId = null;
      setDraftStatus(
        error?.message
        || autoRouteUi().route_error
        || "Nao foi possivel gerar a rota automatica. Continue desenhando manualmente.",
      );
      renderMap();
      return;
    }
  }

  const surfaceType = currentSurfaceType();
  const geometryType = polycurveGeometryType();
  const edge = buildEdgeFromDraft({
    draft: editorState.draft,
    citiesById: editorState.nodesById,
    surfaceType,
    geometryType,
    cityIds: new Set(Object.keys(editorState.citiesById)),
  });

  editorState.routeNetwork.edges.push(edge);
  const saved = await saveRouteNetwork(editorState.screen.status_messages.route_saved);
  if (!saved) {
    editorState.routeNetwork.edges = editorState.routeNetwork.edges.filter((item) => item.id !== edge.id);
    return;
  }

  editorState.selectedEdgeId = edge.id;
  editorState.selectedCityId = null;
  editorState.selectedNodeId = null;
  resetDraft(editorState.draft);
  editorState.draft.activeToolId = "tool_route_draw";
  setDraftStatus(editorState.screen.status_messages.route_saved);
  renderSelectionPanel();
  renderMap();
}

async function deleteRouteById(edgeId) {
  if (!edgeId) {
    return;
  }

  const previousEdges = [...(editorState.routeNetwork.edges || [])];
  editorState.routeNetwork.edges = previousEdges.filter((edge) => edge.id !== edgeId);
  const saved = await saveRouteNetwork(editorState.screen.status_messages.route_deleted);
  if (!saved) {
    editorState.routeNetwork.edges = previousEdges;
    renderMap();
    return;
  }

  if (editorState.selectedEdgeId === edgeId) {
    editorState.selectedEdgeId = null;
  }
  renderMap();
}

function bindColumnResizers() {
  const grid = document.getElementById("editor-grid");
  const resizers = Array.from(grid.querySelectorAll("[data-resizer]"));

  resizers.forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = event.clientX;
      const startLeft = parseCssPixelVariable("--editor-left-col", 356);
      const resizerWidth = parseCssPixelVariable("--editor-resizer-width", 10);
      const panelGap = parseCssPixelVariable("--editor-panel-gap", 12);
      const minSide = parseCssPixelVariable("--editor-side-min-col", 220);
      const minMap = parseCssPixelVariable("--editor-map-min-col", 560);
      const gridWidth = grid.getBoundingClientRect().width;

      grid.classList.add("is-resizing");

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;

        if (side === "left") {
          const maxLeft = Math.max(minSide, gridWidth - resizerWidth - (panelGap * 2) - minMap);
          setPixelVariable("--editor-left-col", clamp(startLeft + delta, minSide, maxLeft));
        }

        invalidateMapSize();
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        grid.classList.remove("is-resizing");
        normalizeEditorLayout();
        persistEditorLayout();
        invalidateMapSize();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });

  window.addEventListener("resize", () => {
    normalizeEditorLayout();
    invalidateMapSize();
  });
}

function clearDraftAndRefresh(message = null) {
  resetDraft(editorState.draft);
  editorState.selectedEdgeId = null;
  editorState.selectedNodeId = null;
  if (message) {
    setDraftStatus(message);
  } else {
    setDraftStatus(editorState.screen.status_messages.idle);
  }
  renderSelectionPanel();
  renderMap();
  renderCustomCityControls();
}

function enterRouteMode(surfaceId) {
  editorState.draft.activeToolId = "tool_route_draw";
  editorState.draft.surfaceTypeId = surfaceId;
  editorState.draft.geometryTypeId = polycurveGeometryType().id;
  editorState.selectedCityId = null;
  editorState.selectedNodeId = null;
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  setDraftStatus(routeModeMessage(surfaceId));
  renderMap();
  renderCustomCityControls();
}

function enterNodeMode() {
  editorState.draft.activeToolId = "tool_graph_node_draw";
  editorState.selectedCityId = null;
  editorState.selectedNodeId = null;
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  setDraftStatus(editorState.screen.status_messages.node_mode || editorState.screen.status_messages.idle);
  renderMap();
  renderCustomCityControls();
}

function enterCityMode() {
  editorState.draft.activeToolId = "tool_city_draw";
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  setDraftStatus(editorState.screen.status_messages.city_mode || editorState.screen.status_messages.idle);
  renderMap();
  renderCustomCityControls();
}

function enterNodeToCityMode() {
  editorState.draft.activeToolId = "tool_graph_node_promote_city";
  editorState.selectedCityId = null;
  editorState.selectedNodeId = null;
  editorState.selectedEdgeId = null;
  resetDraft(editorState.draft);
  hideCustomCityPopup();
  setDraftStatus(editorState.screen.status_messages.node_to_city_mode || editorState.screen.status_messages.idle);
  renderMap();
  renderCustomCityControls();
}

function handleKeydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (shortcutsDialog()?.open) {
    return;
  }
  const target = event.target;
  const tagName = target?.tagName?.toLowerCase();
  if (tagName === "input" || tagName === "select" || tagName === "textarea" || target?.isContentEditable) {
    return;
  }

  if (String(event.key).toLowerCase() === "n") {
    event.preventDefault();
    enterNodeMode();
    return;
  }

  if (String(event.key).toLowerCase() === "c") {
    event.preventDefault();
    enterCityMode();
    return;
  }

  if (String(event.key).toLowerCase() === "x") {
    event.preventDefault();
    enterNodeToCityMode();
    return;
  }

  const surface = surfaceTypeByShortcut(event.key);
  if (!surface) {
    return;
  }

  event.preventDefault();
  enterRouteMode(surface.id);
}

function bindUi() {
  document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      editorState.activeSidebarTabId = button.dataset.sidebarTab;
      renderSidebarTabs();
    });
  });

  document.getElementById("editor-add-band-button").addEventListener("click", () => {
    const nextIndex = editorState.populationBands.length + 1;
    const minPopulation = nextIndex * 250;
    editorState.populationBands.push({
      id: `population_band_custom_${Date.now()}`,
      label: autoPopulationBandLabel(minPopulation, null),
      min_population_thousands: minPopulation,
      max_population_thousands: null,
      pin_id: editorState.bootstrap.map_editor.pin_library.pins[0]?.id || "pin_circle_solid",
      marker_size_px: 20,
      legend_order: nextIndex,
    });
    renderBandList();
    renderDisplayControls();
    renderMap();
    schedulePopulationBandsSave(0);
  });

  const syncBandDraft = (event) => {
    const row = event.target.closest(".editor-band-row");
    if (!row) {
      return;
    }
    const band = editorState.populationBands.find((item) => item.id === row.dataset.bandId);
    if (!band) {
      return;
    }
    const field = event.target.dataset.field;
    let value = event.target.value;
    if (["min_population_thousands", "max_population_thousands", "marker_size_px"].includes(field)) {
      value = value === "" ? "" : Number(value);
    }
    band[field] = value;
    if (field === "min_population_thousands" || field === "max_population_thousands") {
      band.label = autoPopulationBandLabel(band.min_population_thousands, band.max_population_thousands);
      const labelInput = row.querySelector('[data-field="label"]');
      if (labelInput) {
        labelInput.value = band.label;
      }
    }
    renderDisplayControls();
    renderMap();
    schedulePopulationBandsSave();
  };

  document.getElementById("editor-band-list").addEventListener("input", syncBandDraft);
  document.getElementById("editor-band-list").addEventListener("change", syncBandDraft);

  document.getElementById("editor-band-list").addEventListener("click", (event) => {
    const row = event.target.closest(".editor-band-row");
    if (!row || event.target.dataset.action !== "delete-band") {
      return;
    }
    if (editorState.populationBands.length === 1) {
      setDraftStatus(screenErrors().minimum_bands || "O editor precisa de pelo menos uma faixa populacional.");
      return;
    }
    editorState.populationBands = editorState.populationBands.filter((item) => item.id !== row.dataset.bandId);
    renderBandList();
    renderDisplayControls();
    renderMap();
    schedulePopulationBandsSave(0);
  });

  const syncCustomCityDraft = (event) => {
    const field = event.target.dataset.cityField;
    if (!field || !editorState.selectedCityId) {
      return;
    }
    const selectedCity = (editorState.bootstrap.cities || []).find((city) => city.id === editorState.selectedCityId);
    if (!selectedCity || !isUserCreatedCity(selectedCity)) {
      return;
    }

    let value = event.target.value;
    if (field === "population") {
      value = Math.max(0, Number(value || 0));
      selectedCity.population_thousands = parsePopulationInputToThousands(value);
      event.target.value = String(Math.round(value));
    } else if (field === "state_code") {
      value = String(value || "").toUpperCase().slice(0, 3);
      event.target.value = value;
    } else {
      value = String(value || "");
    }

    if (field !== "population") {
      selectedCity[field] = value;
    }
    selectedCity.label = buildManualCityLabel(selectedCity.name, selectedCity.state_code);
    rebuildCityCatalogsFromBootstrap();
    renderMap();
    scheduleCustomCitiesSave(
      editorState.screen.status_messages.custom_city_updated
      || editorState.screen.status_messages.custom_city_selected
      || editorState.screen.status_messages.idle,
      event.type === "change" ? 0 : 220,
    );
  };

  document.getElementById("editor-city-form").addEventListener("input", syncCustomCityDraft);
  document.getElementById("editor-city-form").addEventListener("change", syncCustomCityDraft);
  document.getElementById("editor-city-popup-close-button").addEventListener("click", () => {
    hideCustomCityPopup({ clearSelection: true });
    renderMap();
  });

  const syncDisplayControlDraft = (event) => {
    const customControlId = event.target.dataset.overlayControlCustom;
    if (customControlId) {
      const control = editorState.displayControlsById[customControlId];
      if (!control) {
        return;
      }
      const customKind = event.target.dataset.customKind;
      const customKey = event.target.dataset.customKey;
      const customPart = event.target.dataset.customPart;

      if (customKind === "population_band_palette" && customKey) {
        if (!displayCityRender().population_band_fill_colors || typeof displayCityRender().population_band_fill_colors !== "object") {
          displayCityRender().population_band_fill_colors = {};
        }
        displayCityRender().population_band_fill_colors[customKey] = event.target.value;
      }

      if (customKind === "route_surface_palette" && customKey && customPart) {
        if (!displayRouteRender().surface_style_overrides || typeof displayRouteRender().surface_style_overrides !== "object") {
          displayRouteRender().surface_style_overrides = {};
        }
        const currentOverride = displayRouteRender().surface_style_overrides[customKey] || {};
        displayRouteRender().surface_style_overrides[customKey] = {
          ...currentOverride,
          [customPart]: event.target.value,
        };
      }

      renderMap();
      scheduleDisplaySettingsSave(140);
      return;
    }

    const controlId = event.target.dataset.overlayControl;
    if (!controlId) {
      return;
    }
    const control = editorState.displayControlsById[controlId];
    if (!control) {
      return;
    }

    let value = event.target.value;
    if (control.type === "checkbox") {
      value = event.target.checked;
    } else if (control.type === "range") {
      value = Number(event.target.value);
    }

    setValueAtPath(editorState.displaySettings, control.path, value);
    if (control.type === "range") {
      const valueNode = event.target.closest(".display-range-row")?.querySelector(".display-range-value");
      if (valueNode) {
        valueNode.textContent = rangeDisplayValue(control, value);
      }
    } else if (control.type === "checkbox" || control.type === "select") {
      renderDisplayControls();
    }
    renderMap();
    scheduleDisplaySettingsSave(control.type === "checkbox" ? 0 : 140);
  };

  const syncLeafletControlDraft = (event) => {
    const controlId = event.target.dataset.leafletControl;
    if (!controlId) {
      return;
    }
    const control = editorState.leafletControlsById[controlId];
    if (!control) {
      return;
    }

    let value = event.target.value;
    if (control.type === "checkbox") {
      value = event.target.checked;
    } else if (control.type === "range") {
      value = Number(event.target.value);
    }

    setValueAtPath(editorState.leafletSettings, control.path, value);
    if (control.type === "range") {
      const valueNode = event.target.closest(".display-range-row")?.querySelector(".display-range-value");
      if (valueNode) {
        valueNode.textContent = rangeDisplayValue(control, value);
      }
    } else if (control.type === "checkbox" || control.type === "select") {
      renderLeafletControls();
    }
    applyBrasixLeafletSettings(editorState.map, editorState.bootstrap.map_viewport, leafletSettings());
    scheduleLeafletSettingsSave(control.type === "checkbox" ? 0 : 140);
  };

  const syncAutoRouteResolutionDraft = (event) => {
    if (event.target.id !== "editor-v1-1-auto-route-resolution") {
      return;
    }
    editorState.selectedAutoRouteResolutionIndex = Number(event.target.value || 0);
    renderAutoRouteControls();
  };

  document.getElementById("editor-overlay-controls").addEventListener("input", syncDisplayControlDraft);
  document.getElementById("editor-overlay-controls").addEventListener("change", syncDisplayControlDraft);
  document.getElementById("editor-leaflet-controls").addEventListener("input", syncLeafletControlDraft);
  document.getElementById("editor-leaflet-controls").addEventListener("change", syncLeafletControlDraft);
  document.getElementById("editor-v1-1-auto-route-controls")?.addEventListener("input", syncAutoRouteResolutionDraft);
  document.getElementById("editor-v1-1-auto-route-controls")?.addEventListener("change", syncAutoRouteResolutionDraft);

  document.getElementById("editor-header-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.actionId === "toggle-theme") {
      toggleEditorTheme();
      return;
    }
    if (button.dataset.actionId === "open-shortcuts") {
      openShortcutsDialog();
      return;
    }
    if (button.dataset.actionId === "refit-map") {
      fitBrasixBounds(editorState.map, editorState.bootstrap.map_viewport);
      return;
    }
    if (button.dataset.actionId === "clear-draft") {
      clearDraftAndRefresh(editorState.screen.status_messages.idle);
    }
  });

  document.getElementById("editor-map-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-action-id]");
    if (!button) {
      return;
    }
    if (button.dataset.mapActionId === "open-map-new") {
      openNewMapDialog();
      return;
    }
    if (button.dataset.mapActionId === "open-map-save") {
      openSaveMapDialog();
      return;
    }
    if (button.dataset.mapActionId === "open-map-load") {
      openLoadMapDialog();
    }
  });

  const nodeStyleSelect = document.getElementById("editor-node-style-select");
  const nodeSizeInput = document.getElementById("editor-node-size-input");
  const applyNodeControlDraft = () => {
    const styleId = nodeStyleSelect.value || defaultGraphNodeStyle()?.id || editorState.nodeToolStyleId;
    const sizePx = clamp(Number(nodeSizeInput.value || 16), 10, 48);

    nodeSizeInput.value = String(sizePx);
    editorState.nodeToolStyleId = styleId;
    editorState.nodeToolSizePx = sizePx;

    if (Array.isArray(editorState.routeNetwork?.nodes) && editorState.routeNetwork.nodes.length) {
      editorState.routeNetwork.nodes = editorState.routeNetwork.nodes.map((node) => ({
        ...node,
        style_id: styleId,
        size_px: sizePx,
      }));
      editorState.bootstrap.route_network = editorState.routeNetwork;
      rebuildNodeCatalogs();
    }
    renderNodeControls();
    renderMap();
    return true;
  };

  const persistNodeControlDraft = async () => {
    if (!Array.isArray(editorState.routeNetwork?.nodes) || !editorState.routeNetwork.nodes.length) {
      return;
    }

    const saved = await saveRouteNetwork(
      editorState.screen.status_messages.node_updated
      || "Formato do no de ligacao atualizado.",
    );
    if (!saved) {
      renderMap();
    }
  };

  const scheduleNodeControlSave = (delay = 120) => {
    window.clearTimeout(editorState.nodeControlSaveTimer);
    editorState.nodeControlSaveTimer = window.setTimeout(() => {
      editorState.nodeControlSaveTimer = null;
      void persistNodeControlDraft();
    }, delay);
  };

  nodeStyleSelect.addEventListener("change", () => {
    applyNodeControlDraft();
    if (editorState.nodeControlSaveTimer) {
      window.clearTimeout(editorState.nodeControlSaveTimer);
      editorState.nodeControlSaveTimer = null;
    }
    void persistNodeControlDraft();
  });
  nodeSizeInput.addEventListener("input", () => {
    applyNodeControlDraft();
    scheduleNodeControlSave(120);
  });
  nodeSizeInput.addEventListener("change", () => {
    applyNodeControlDraft();
    if (editorState.nodeControlSaveTimer) {
      window.clearTimeout(editorState.nodeControlSaveTimer);
      editorState.nodeControlSaveTimer = null;
    }
    void persistNodeControlDraft();
  });

  const shortcutsDialogElement = shortcutsDialog();
  shortcutsDialogElement?.addEventListener("click", (event) => {
    if (event.target !== shortcutsDialogElement) {
      return;
    }
    closeShortcutsDialog();
  });

  ["editor-map-new-dialog", "editor-map-save-dialog", "editor-map-load-dialog"].forEach((id) => {
    const dialog = dialogById(id);
    dialog?.addEventListener("click", (event) => {
      if (event.target !== dialog) {
        return;
      }
      closeDialogElement(dialog);
    });
  });

  document.getElementById("editor-map-new-submit-button")?.addEventListener("click", () => {
    void createMapFromDialog();
  });
  document.getElementById("editor-map-save-current-button")?.addEventListener("click", () => {
    void saveMapFromDialog({ saveAsNew: false });
  });
  document.getElementById("editor-map-save-as-button")?.addEventListener("click", () => {
    void saveMapFromDialog({ saveAsNew: true });
  });
  document.getElementById("editor-map-load-list")?.addEventListener("click", (event) => {
    const loadButton = event.target.closest("[data-load-map-id]");
    if (loadButton) {
      void loadMapById(loadButton.dataset.loadMapId);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-map-id]");
    if (deleteButton) {
      void deleteMapById(deleteButton.dataset.deleteMapId);
    }
  });

  document.addEventListener("keydown", handleKeydown);
  bindColumnResizers();
}

async function initializeEditor() {
  editorState.bootstrap = await loadBootstrap();

  applyCssVariables(editorState.bootstrap.ui.design_tokens.css_variables);
  applyCssVariables(editorState.bootstrap.map_editor.layout_desktop.css_variables);
  buildDerivedData();
  applyEditorTheme(restoreStoredEditorTheme(), { persist: false });
  restoreStoredEditorLayout();

  editorState.draft = createDraftState({
    activeToolId: editorState.bootstrap.map_editor.tool_modes.default_tool_id,
    surfaceTypeId: editorState.bootstrap.map_editor.tool_modes.default_surface_type_id,
    geometryTypeId: polycurveGeometryType().id,
  });
  editorState.screen = editorState.bootstrap.map_editor.screen;

  applyScreenRegistry();
  renderHeader();
  renderMapRepositoryDialogs();
  renderSidebarTabs();
  renderShortcutsPanel();
  renderShortcuts();
  renderBandList();
  renderNodeControls();
  renderCustomCityControls();
  renderDisplayControls();
  renderLeafletControls();
  renderAutoRouteControls();
  renderSelectionPanel();
  setDraftStatus(
    editorState.draft.activeToolId === "tool_route_draw"
      ? routeModeMessage(editorState.draft.surfaceTypeId)
      : editorState.screen.status_messages.idle,
  );
  bindUi();
  await waitForLeaflet();
  renderMap();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initializeEditor().catch(reportEditorError);
  }, { once: true });
} else {
  initializeEditor().catch(reportEditorError);
}
