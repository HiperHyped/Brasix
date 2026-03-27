import { BRASIX_SYNC_KEY, readSyncToken } from "./shared/app-sync.js";
import {
  applyBrasixLeafletSettings,
  createBrasixMap,
  createCityMarker,
  createGraphNodeMarker,
  createRouteLayer,
  findPopulationBand,
  fitBrasixBounds,
  sortPopulationBands,
  zoomMapByFactor,
} from "./shared/leaflet-map.js?v=20260327-route-legend-1";
import { escapeHtml, formatValue, numberFormatter } from "./shared/formatters.js";

const POPULATION_BAND_FILL_PALETTE = ["#2d5a27", "#4d7c39", "#7b7b2d", "#8c4f10", "#a85d2a", "#2b6f8f"];
const appState = {
  bootstrap: null,
  selectedProductId: "all",
  selectedStateCode: "all",
  selectedCityId: null,
  highlightedPath: null,
  productsById: {},
  enrichedCitiesById: {},
  graphNodesById: {},
  nodesById: {},
  populationBands: [],
  pinsById: {},
  surfaceTypesById: {},
  map: null,
  markerLayer: null,
  routeLayer: null,
  highlightLayer: null,
  controlsBound: false,
  syncToken: null,
};

function productById() {
  return appState.productsById;
}

function cityById() {
  return appState.enrichedCitiesById;
}

function nodeById() {
  return appState.nodesById;
}

function applyCssVariables(source) {
  Object.entries(source || {}).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
}

function displaySettings() {
  return appState.bootstrap?.map_editor?.display_settings || {};
}

function leafletSettings() {
  return appState.bootstrap?.map_editor?.leaflet_settings || {};
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

function activeMapId() {
  return appState.bootstrap?.map_repository?.active_map_id || "map_brasix_default";
}

function citiesAreUnifiedInActiveMap() {
  return activeMapId() !== "map_brasix_default";
}

function populationBandFillColor(band) {
  const ordered = sortPopulationBands(appState.populationBands);
  const bandIndex = Math.max(0, ordered.findIndex((item) => item.id === band?.id));
  return POPULATION_BAND_FILL_PALETTE[bandIndex % POPULATION_BAND_FILL_PALETTE.length];
}

function applyComponentRegistry() {
  const components = appState.bootstrap.ui.component_registry.components || [];
  components.forEach((component) => {
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

function renderNavigation() {
  const navigation = appState.bootstrap.ui.navigation_items;
  const topNav = document.getElementById("top-nav");
  const topActions = document.getElementById("top-actions");
  const railNav = document.getElementById("rail-nav");
  const railCtaContainer = document.getElementById("rail-cta-container");

  topNav.innerHTML = navigation.top_nav_items
    .map(
      (item) => `
        <a class="${item.active ? "is-active" : ""}" href="${item.href || "#"}" data-nav-id="${item.id}">
          ${item.label}
        </a>
      `,
    )
    .join("");

  topActions.innerHTML = navigation.top_action_items
    .map(
      (item) => `
        <button type="button" aria-label="${item.label}" data-action-id="${item.id}">
          <span class="material-symbols-outlined">${item.icon}</span>
        </button>
      `,
    )
    .join("");

  railNav.innerHTML = navigation.rail_nav_items
    .map(
      (item) => `
        <a class="rail-item ${item.active ? "is-active" : ""}" href="${item.href || "#"}" data-rail-id="${item.id}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `,
    )
    .join("");

  railCtaContainer.innerHTML = `
    <a class="rail-cta" href="${navigation.rail_cta.href || "#"}" data-rail-cta-id="${navigation.rail_cta.id}">
      <span class="material-symbols-outlined">${navigation.rail_cta.icon}</span>
      <span>${navigation.rail_cta.label}</span>
    </a>
  `;
}

function buildDerivedData() {
  appState.productsById = Object.fromEntries(appState.bootstrap.products.map((item) => [item.id, item]));
  appState.populationBands = sortPopulationBands(appState.bootstrap.map_editor.population_bands.bands || []);
  appState.pinsById = Object.fromEntries((appState.bootstrap.map_editor.pin_library.pins || []).map((item) => [item.id, item]));
  appState.surfaceTypesById = Object.fromEntries(
    (appState.bootstrap.map_editor.route_surface_types.types || []).map((item) => [item.id, item]),
  );

  const matrixByCity = {};
  appState.bootstrap.city_product_matrix.forEach((entry) => {
    if (!matrixByCity[entry.city_id]) {
      matrixByCity[entry.city_id] = {};
    }
    matrixByCity[entry.city_id][entry.product_id] = Number(entry.value);
  });

  appState.enrichedCitiesById = Object.fromEntries(
    appState.bootstrap.cities.map((city) => {
      const productValues = matrixByCity[city.id] || {};
      const topProducts = Object.entries(productValues)
        .sort((left, right) => right[1] - left[1])
        .filter((entry) => entry[1] > 0)
        .map(([productId, value]) => {
          const product = appState.productsById[productId];
          return {
            id: productId,
            name: product.name,
            icon: product.icon,
            unit: product.unit,
            color: product.color,
            value,
          };
        });

      const enriched = {
        ...city,
        product_values: productValues,
        product_count: topProducts.length,
        dominant_product_id: topProducts[0]?.id || null,
        top_products: topProducts,
      };
      return [city.id, enriched];
    }),
  );

  appState.graphNodesById = Object.fromEntries(
    ((appState.bootstrap.route_network.nodes || [])).map((node) => [node.id, node]),
  );
  appState.nodesById = {
    ...appState.enrichedCitiesById,
    ...appState.graphNodesById,
  };
}

function visibleCities() {
  return Object.values(appState.enrichedCitiesById).filter((city) => {
    if (appState.selectedStateCode !== "all" && city.state_code !== appState.selectedStateCode) {
      return false;
    }
    if (appState.selectedProductId === "all") {
      return true;
    }
    return (city.product_values[appState.selectedProductId] || 0) > 0;
  });
}

function rankingCities() {
  const cities = visibleCities().slice();
  if (appState.selectedProductId === "all") {
    return cities.sort((left, right) => (right.top_products[0]?.value || 0) - (left.top_products[0]?.value || 0));
  }
  return cities.sort(
    (left, right) => (right.product_values[appState.selectedProductId] || 0) - (left.product_values[appState.selectedProductId] || 0),
  );
}

function currentProduct() {
  if (appState.selectedProductId === "all") {
    return null;
  }
  return appState.productsById[appState.selectedProductId] || null;
}

function ensureSelectedCity() {
  const cities = visibleCities();
  const validCity = appState.selectedCityId ? appState.enrichedCitiesById[appState.selectedCityId] : null;
  if (validCity && cities.some((city) => city.id === validCity.id)) {
    return;
  }
  appState.selectedCityId = cities[0]?.id || Object.values(appState.enrichedCitiesById)[0]?.id || null;
}

function buildSelectOptions() {
  const productSelect = document.getElementById("commodity-select");
  const stateSelect = document.getElementById("state-select");
  const routeOrigin = document.getElementById("route-origin");
  const routeDestination = document.getElementById("route-destination");

  productSelect.innerHTML = "";
  stateSelect.innerHTML = "";
  routeOrigin.innerHTML = "";
  routeDestination.innerHTML = "";

  [{ id: "all", name: "Visao geral", icon: "" }, ...appState.bootstrap.products].forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = product.id === "all" ? product.name : `${product.icon} ${product.name}`;
    productSelect.appendChild(option);
  });

  const allStatesOption = document.createElement("option");
  allStatesOption.value = "all";
  allStatesOption.textContent = "Todos";
  stateSelect.appendChild(allStatesOption);

  appState.bootstrap.summary.states.forEach((stateCode) => {
    const option = document.createElement("option");
    option.value = stateCode;
    option.textContent = stateCode;
    stateSelect.appendChild(option);
  });

  Object.values(appState.enrichedCitiesById)
    .sort((left, right) => left.label.localeCompare(right.label))
    .forEach((city) => {
      const originOption = document.createElement("option");
      originOption.value = city.id;
      originOption.textContent = city.label;
      routeOrigin.appendChild(originOption);

      const destinationOption = document.createElement("option");
      destinationOption.value = city.id;
      destinationOption.textContent = city.label;
      routeDestination.appendChild(destinationOption);
    });

  productSelect.value = appState.selectedProductId;
  stateSelect.value = appState.selectedStateCode;
}

function renderMetrics() {
  const metrics = document.getElementById("summary-metrics");
  const cities = visibleCities();
  const product = currentProduct();
  const ranked = rankingCities();
  const topCity = ranked[0] || null;

  let totalValue = 0;
  if (product) {
    totalValue = cities.reduce((accumulator, city) => accumulator + (city.product_values[product.id] || 0), 0);
  }

  const cards = [
    {
      value: numberFormatter(0).format(cities.length),
      label: "Cidades",
      accent: false,
    },
    {
      value: numberFormatter(0).format(appState.bootstrap.summary.product_count),
      label: "Variedade",
      accent: false,
    },
    {
      value: product ? formatValue(totalValue, product.unit) : numberFormatter(0).format(appState.bootstrap.summary.route_count),
      label: product ? `${product.name} no recorte` : "Rotas ativas",
      accent: false,
    },
    {
      value: topCity ? topCity.label.replace(/, [A-Z]{2}$/, ", ...") : "-",
      label: "Lider regional",
      accent: true,
    },
  ];

  metrics.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card ${card.accent ? "is-accent" : ""}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join("");

  const rankingChip = document.getElementById("ranking-chip");
  rankingChip.textContent = product ? `${product.name} (${product.unit})` : "Visao geral";

  if (product) {
    document.getElementById("map-title").textContent = `${product.icon} ${product.name}`;
    document.getElementById("map-subtitle").textContent =
      `Nos por populacao e leitura de ${product.name.toLowerCase()} por cor. Clique e hover continuam ativos no mesmo mapa Leaflet do editor.`;
  } else {
    document.getElementById("map-title").textContent = "Cidades representativas";
    document.getElementById("map-subtitle").textContent =
      "Mapa-base unificado com o editor: cidades fixas por populacao, rotas persistidas em JSON e leitura editorial do tabuleiro.";
  }
}

function renderRanking() {
  const ranking = document.getElementById("ranking-list");
  const product = currentProduct();

  ranking.innerHTML = rankingCities()
    .slice(0, 5)
    .map((city, index) => {
      let valueText = "Sem destaque";
      if (product) {
        valueText = formatValue(city.product_values[product.id] || 0, product.unit);
      } else if (city.top_products[0]) {
        valueText = formatValue(city.top_products[0].value, city.top_products[0].unit);
      }

      return `
        <li class="ranking-item">
          <span class="position">${String(index + 1).padStart(2, "0")}.</span>
          <span class="label">${escapeHtml(city.label)}</span>
          <span class="value">${escapeHtml(valueText)}</span>
        </li>
      `;
    })
    .join("");
}

function cityFillColor(city) {
  if (city.id === appState.selectedCityId) {
    return displayCityRender().selected_fill_color || "#8c4f10";
  }
  if (!citiesAreUnifiedInActiveMap() && city.is_user_created) {
    return "#4f8593";
  }
  const mode = displayCityRender().color_mode || "commodity";
  if (mode === "uniform") {
    return displayCityRender().uniform_fill_color || "#2d5a27";
  }
  if (mode === "population_band") {
    return populationBandFillColor(findPopulationBand(city, appState.populationBands));
  }
  const product = currentProduct();
  if (product) {
    return product.color;
  }
  const dominant = city.dominant_product_id ? productById()[city.dominant_product_id] : null;
  return dominant?.color || "#8c4f10";
}

function graphNodeDisplayStyle(node) {
  const baseStyle = (appState.bootstrap.map_editor.graph_node_styles?.styles || []).find((item) => item.id === node.style_id) || {
    fill_color: "#8c4f10",
    stroke_color: "#fff9ea",
    stroke_width_px: 2,
    shape: "solid_diamond",
    size_px: 16,
    inner_scale: 0,
  };
  if (displayGraphNodeRender().use_style_colors !== false) {
    return baseStyle;
  }
  return {
    ...baseStyle,
    fill_color: displayGraphNodeRender().override_fill_color || baseStyle.fill_color,
    stroke_color: displayGraphNodeRender().override_stroke_color || baseStyle.stroke_color,
  };
}

function routeStyleOverrides() {
  return {
    opacityScale: Number(displayRouteRender().opacity_scale || 1),
    highlightColor: displayRouteRender().highlight_color || "#2d5a27",
    selectedColor: displayRouteRender().selected_color || "#8c4f10",
  };
}

function cityTooltipMarkup(city) {
  const product = currentProduct();
  const originLine = (!citiesAreUnifiedInActiveMap() && city.is_user_created) ? "Cidade criada no editor" : city.source_region_name;
  const header = `<strong>${escapeHtml(city.label)}</strong><br>${escapeHtml(originLine)}<br>Populacao: ${numberFormatter(0).format(city.population_thousands)} mil`;
  if (product) {
    const value = city.product_values[product.id] || 0;
    return `${header}<br>${escapeHtml(product.icon)} ${escapeHtml(product.name)}: ${escapeHtml(formatValue(value, product.unit))}`;
  }
  const top = city.top_products[0];
  if (!top) {
    return header;
  }
  return `${header}<br>${escapeHtml(top.icon)} ${escapeHtml(top.name)}: ${escapeHtml(formatValue(top.value, top.unit))}`;
}

function initializeMap() {
  if (appState.map) {
    return;
  }

  appState.map = createBrasixMap({
    elementId: "map-stage",
    viewport: appState.bootstrap.map_viewport,
    leafletSettings: leafletSettings(),
  });
  appState.routeLayer = window.L.layerGroup().addTo(appState.map);
  appState.highlightLayer = window.L.layerGroup().addTo(appState.map);
  appState.markerLayer = window.L.layerGroup().addTo(appState.map);
}

function renderMap() {
  initializeMap();
  ensureSelectedCity();

  const visible = visibleCities();
  const routeEdges = appState.bootstrap.route_network.edges || [];
  const highlightedEdgeIds = new Set(appState.highlightedPath?.edge_ids || []);
  const visibility = displayVisibility();
  const styleOverrides = routeStyleOverrides();

  applyBrasixLeafletSettings(appState.map, appState.bootstrap.map_viewport, leafletSettings());

  appState.routeLayer.clearLayers();
  appState.highlightLayer.clearLayers();
  appState.markerLayer.clearLayers();

  if (visibility.show_routes !== false) {
    routeEdges.forEach((edge) => {
      const layer = createRouteLayer({
        edge,
        citiesById: appState.nodesById,
        surfaceType: appState.surfaceTypesById[edge.surface_type_id],
        role: "network",
        styleOverrides,
      });
      if (layer) {
        layer.addTo(appState.routeLayer);
      }
    });
  }

  routeEdges
    .filter((edge) => visibility.show_routes !== false && highlightedEdgeIds.has(edge.id))
    .forEach((edge) => {
      const layer = createRouteLayer({
        edge,
        citiesById: appState.nodesById,
        surfaceType: appState.surfaceTypesById[edge.surface_type_id],
        role: "highlight",
        styleOverrides,
      });
      if (layer) {
        layer.addTo(appState.highlightLayer);
      }
    });

  if (visibility.show_cities !== false) {
    visible.forEach((city) => {
      const band = findPopulationBand(city, appState.populationBands);
      const pin = appState.pinsById[band?.pin_id] || appState.pinsById[Object.keys(appState.pinsById)[0]];
      const marker = createCityMarker({
        city,
        band,
        pin,
        fillColor: cityFillColor(city),
        selected: city.id === appState.selectedCityId,
        opacity: Number(displayCityRender().opacity || 0.96),
      });

      marker.bindTooltip(cityTooltipMarkup(city), {
        className: "brasix-map-tooltip",
        direction: "top",
        offset: [0, -8],
        sticky: true,
      });
      marker.on("click", () => {
        appState.selectedCityId = city.id;
        renderDetail();
        renderMap();
      });
      marker.addTo(appState.markerLayer);
    });
  }

  if (visibility.show_graph_nodes !== false) {
    Object.values(appState.graphNodesById).forEach((node) => {
      const marker = createGraphNodeMarker({
        node,
        style: graphNodeDisplayStyle(node),
        selected: false,
        opacity: Number(displayGraphNodeRender().opacity || 0.98),
      });
      marker.bindTooltip(
        `<strong>${escapeHtml(node.label)}</strong><br>No de ligacao<br>${numberFormatter(2).format(node.latitude)}, ${numberFormatter(2).format(node.longitude)}`,
        {
          className: "brasix-map-tooltip",
          direction: "top",
          offset: [0, -8],
          sticky: true,
        },
      );
      marker.addTo(appState.markerLayer);
    });
  }
}

function renderDetail() {
  const container = document.getElementById("city-detail");
  ensureSelectedCity();
  const city = appState.selectedCityId ? cityById()[appState.selectedCityId] : null;

  if (!city) {
    container.innerHTML = `<p class="route-placeholder">Nenhuma cidade encontrada.</p>`;
    return;
  }

  const dominant = city.dominant_product_id ? productById()[city.dominant_product_id] : null;
  const productRows = city.top_products
    .slice(0, 3)
    .map(
      (item) => `
        <div class="commodity-row">
          <span class="icon">${escapeHtml(item.icon)}</span>
          <span class="name">${escapeHtml(item.name)}</span>
          <span class="value">${escapeHtml(formatValue(item.value, item.unit))}</span>
        </div>
      `,
    )
    .join("");

  container.innerHTML = `
    <div class="detail-title">
      <h3>${escapeHtml(city.name)},<br />${escapeHtml(city.state_code)}</h3>
      <div class="detail-region">${escapeHtml(city.source_region_name)}</div>
    </div>
    <div class="detail-metrics">
      <div class="detail-metric">
        <span>Populacao</span>
        <strong>${numberFormatter(0).format(city.population_thousands)}k</strong>
      </div>
      <div class="detail-metric">
        <span>Produtos</span>
        <strong>${city.product_count}</strong>
      </div>
      <div class="detail-metric">
        <span>Destaque</span>
        <strong>${dominant ? escapeHtml(dominant.icon) : "*"}</strong>
      </div>
    </div>
    <div class="commodity-list">
      ${productRows || '<p class="route-placeholder">Sem valores positivos para exibir.</p>'}
    </div>
  `;
}

function renderRoutePlaceholder(message) {
  document.getElementById("route-status").innerHTML = `<p class="route-placeholder">${escapeHtml(message)}</p>`;
}

function renderRouteStatus(payload) {
  const nodes = nodeById();
  const pathNodeIds = payload.node_ids || payload.city_ids || [];
  const stepsMarkup = pathNodeIds
    .slice(0, -1)
    .map((nodeId, index) => {
      const nextNodeId = pathNodeIds[index + 1];
      const fromLabel = nodes[nodeId]?.label || nodeId;
      const toLabel = nodes[nextNodeId]?.label || nextNodeId;
      return `
        <div class="route-step ${index === 0 ? "is-active" : ""}">
          ${escapeHtml(fromLabel)} -> ${escapeHtml(toLabel)}
          <small>Trecho ${index + 1} de ${payload.steps}</small>
        </div>
      `;
    })
    .join("");

  document.getElementById("route-status").innerHTML = `
    <div class="route-summary">
      <div class="route-metric">
        <span>Distancia</span>
        <strong>${numberFormatter(0).format(payload.distance_km)} km</strong>
      </div>
      <div class="route-metric">
        <span>Logistica</span>
        <strong>${payload.steps > 2 ? "Rede" : "Direta"}</strong>
      </div>
    </div>
    <div class="route-track">
      ${stepsMarkup}
    </div>
  `;
}

async function traceRoute() {
  const origin = document.getElementById("route-origin").value;
  const destination = document.getElementById("route-destination").value;

  if (!origin || !destination) {
    renderRoutePlaceholder("Selecione uma cidade de origem e uma de destino.");
    return;
  }
  if (origin === destination) {
    renderRoutePlaceholder("Origem e destino precisam ser diferentes.");
    return;
  }

  const response = await fetch(`/api/routes/path?start_city_id=${encodeURIComponent(origin)}&end_city_id=${encodeURIComponent(destination)}`);
  const payload = await response.json();
  if (!response.ok) {
    appState.highlightedPath = null;
    renderRoutePlaceholder(payload.detail || "Nao foi possivel calcular a rota.");
    renderMap();
    return;
  }

  appState.highlightedPath = payload;
  appState.selectedCityId = origin;
  renderDetail();
  renderRouteStatus(payload);
  renderMap();
}

function bindControls() {
  if (appState.controlsBound) {
    return;
  }

  document.getElementById("commodity-select").addEventListener("change", (event) => {
    appState.selectedProductId = event.target.value;
    appState.highlightedPath = null;
    renderMetrics();
    renderRanking();
    renderDetail();
    renderRoutePlaceholder("Clique em Tracar rota para recalcular o caminho no recorte atual.");
    renderMap();
  });

  document.getElementById("state-select").addEventListener("change", (event) => {
    appState.selectedStateCode = event.target.value;
    appState.highlightedPath = null;
    renderMetrics();
    renderRanking();
    renderDetail();
    renderRoutePlaceholder("Ajuste de estado aplicado. Recalcule a rota se necessario.");
    renderMap();
  });

  document.getElementById("route-button").addEventListener("click", async () => {
    await traceRoute();
  });

  const mapControls = appState.bootstrap.map_viewport.controls || [];
  const zoomIn = mapControls.find((item) => item.id === "map_control_zoom_in");
  const zoomOut = mapControls.find((item) => item.id === "map_control_zoom_out");

  document.getElementById("map-zoom-in").addEventListener("click", () => {
    if (appState.map) {
      zoomMapByFactor(appState.map, zoomIn?.factor || 0.8);
    }
  });

  document.getElementById("map-zoom-out").addEventListener("click", () => {
    if (appState.map) {
      zoomMapByFactor(appState.map, zoomOut?.factor || 1.25);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === BRASIX_SYNC_KEY) {
      void refreshFromServer();
    }
  });

  window.addEventListener("focus", () => {
    const token = readSyncToken();
    if (token && token !== appState.syncToken) {
      void refreshFromServer();
    }
  });

  appState.controlsBound = true;
}

async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  return response.json();
}

function applySelectionDefaults(previousState) {
  const validProductIds = new Set(["all", ...appState.bootstrap.products.map((item) => item.id)]);
  const validStateCodes = new Set(["all", ...appState.bootstrap.summary.states]);
  const defaultCityId = appState.bootstrap.map_viewport.defaults.selected_city_id || Object.values(appState.enrichedCitiesById)[0]?.id || null;

  appState.selectedProductId = validProductIds.has(previousState.selectedProductId)
    ? previousState.selectedProductId
    : appState.bootstrap.map_viewport.defaults.selected_product_id || "all";

  appState.selectedStateCode = validStateCodes.has(previousState.selectedStateCode)
    ? previousState.selectedStateCode
    : appState.bootstrap.map_viewport.defaults.selected_state_code || "all";

  appState.selectedCityId = appState.enrichedCitiesById[previousState.selectedCityId] ? previousState.selectedCityId : defaultCityId;
  appState.highlightedPath = previousState.highlightedPath || null;
}

async function hydrateApp({ preserve = false } = {}) {
  const previousState = preserve
    ? {
        selectedProductId: appState.selectedProductId,
        selectedStateCode: appState.selectedStateCode,
        selectedCityId: appState.selectedCityId,
        highlightedPath: appState.highlightedPath,
        routeOrigin: document.getElementById("route-origin")?.value || "",
        routeDestination: document.getElementById("route-destination")?.value || "",
      }
    : {
        selectedProductId: null,
        selectedStateCode: null,
        selectedCityId: null,
        highlightedPath: null,
        routeOrigin: "",
        routeDestination: "",
      };

  appState.bootstrap = await loadBootstrap();
  appState.syncToken = readSyncToken();

  applyCssVariables(appState.bootstrap.ui.design_tokens.css_variables);
  applyCssVariables(appState.bootstrap.ui.layout_desktop_main.css_variables);
  applyComponentRegistry();
  renderNavigation();
  buildDerivedData();
  applySelectionDefaults(previousState);
  buildSelectOptions();
  bindControls();

  const routeOrigin = previousState.routeOrigin || appState.bootstrap.map_viewport.defaults.route_origin_id || "";
  const routeDestination = previousState.routeDestination || appState.bootstrap.map_viewport.defaults.route_destination_id || "";
  document.getElementById("route-origin").value = routeOrigin;
  document.getElementById("route-destination").value = routeDestination;

  renderMetrics();
  renderRanking();
  renderDetail();
  renderMap();

  if (appState.map && !preserve) {
    fitBrasixBounds(appState.map, appState.bootstrap.map_viewport);
  }

  if ((appState.bootstrap.route_network.edges || []).length === 0) {
    document.getElementById("route-button").disabled = true;
    appState.highlightedPath = null;
    renderRoutePlaceholder("Nenhuma rota definida. O editor de mapa ja grava direto em route_network.json.");
    renderMap();
    return;
  }

  document.getElementById("route-button").disabled = false;

  if (document.getElementById("route-origin").value && document.getElementById("route-destination").value) {
    await traceRoute();
    return;
  }

  renderRoutePlaceholder("Selecione origem e destino para destacar o caminho na malha atual.");
}

async function refreshFromServer() {
  const token = readSyncToken();
  if (token && token === appState.syncToken) {
    return;
  }
  await hydrateApp({ preserve: true });
}

document.addEventListener("DOMContentLoaded", async () => {
  await hydrateApp({ preserve: false });
});
