import { escapeHtml, numberFormatter, roundNumber } from "./formatters.js";

function leaflet() {
  return window.L;
}

function defaultTileLayer() {
  return {
    id: "tile_layer_carto_positron_fallback",
    label: "Carto Positron",
    url_template: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    min_zoom: 3,
    max_zoom: 18,
  };
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numericValue));
}

function resolveDefaultTileLayer(viewport) {
  const layers = viewport.tile_layers || [];
  return layers.find((item) => item.id === viewport.default_tile_layer_id) || layers[0] || defaultTileLayer();
}

function resolveTileLayerById(viewport, layerId, layerKind = null) {
  const layers = viewport.tile_layers || [];
  const byId = layers.find((item) => item.id === layerId);
  if (byId) {
    return byId;
  }
  if (layerKind) {
    return layers.find((item) => item.layer_kind === layerKind) || null;
  }
  return resolveDefaultTileLayer(viewport);
}

function createPane(map, name, zIndex) {
  if (!map.getPane(name)) {
    map.createPane(name);
  }
  map.getPane(name).style.zIndex = String(zIndex);
}

function ensureBasemapPaneStyles(map, paneName) {
  const pane = map.getPane(paneName);
  if (!pane) {
    return;
  }
  pane.style.pointerEvents = "none";
  pane.style.mixBlendMode = "normal";
}

function brasixLeafletState(map) {
  if (!map.__brasixLeafletState) {
    map.__brasixLeafletState = {
      basePaneName: "brasix-basemap-base",
      labelPaneName: "brasix-basemap-labels",
      baseLayerId: null,
      baseLayer: null,
      baseLayerSignature: null,
      labelLayerId: null,
      labelLayer: null,
      labelLayerSignature: null,
    };
  }
  return map.__brasixLeafletState;
}

function buildTileLayer(layerConfig, paneName, settings) {
  const L = leaflet();
  return L.tileLayer(layerConfig.url_template, {
    attribution: layerConfig.attribution,
    subdomains: layerConfig.subdomains || undefined,
    minZoom: layerConfig.min_zoom ?? 3,
    maxZoom: layerConfig.max_zoom ?? 18,
    noWrap: true,
    pane: paneName,
    updateWhenIdle: settings.tile_render.update_when_idle,
    updateWhenZooming: settings.tile_render.update_when_idle === false,
    updateInterval: settings.tile_render.update_interval_ms,
    keepBuffer: settings.tile_render.keep_buffer,
    detectRetina: settings.tile_render.detect_retina,
    minNativeZoom: settings.tile_render.min_native_zoom ?? undefined,
    maxNativeZoom: settings.tile_render.max_native_zoom ?? undefined,
  });
}

function tileLayerSignature(layerConfig, settings) {
  return JSON.stringify({
    id: layerConfig.id,
    update_when_idle: settings.tile_render.update_when_idle,
    update_interval_ms: settings.tile_render.update_interval_ms,
    keep_buffer: settings.tile_render.keep_buffer,
    detect_retina: settings.tile_render.detect_retina,
    min_native_zoom: settings.tile_render.min_native_zoom,
    max_native_zoom: settings.tile_render.max_native_zoom,
  });
}

function syncLeafletTileLayer(map, viewport, settingsState, kind, desiredId, settings) {
  const paneName = kind === "base" ? settingsState.basePaneName : settingsState.labelPaneName;
  const currentLayerKey = kind === "base" ? "baseLayer" : "labelLayer";
  const currentIdKey = kind === "base" ? "baseLayerId" : "labelLayerId";
  const currentSignatureKey = kind === "base" ? "baseLayerSignature" : "labelLayerSignature";
  const currentLayer = settingsState[currentLayerKey];
  const currentId = settingsState[currentIdKey];
  const currentSignature = settingsState[currentSignatureKey];

  if (!desiredId) {
    if (currentLayer) {
      map.removeLayer(currentLayer);
    }
    settingsState[currentLayerKey] = null;
    settingsState[currentIdKey] = null;
    settingsState[currentSignatureKey] = null;
    return;
  }

  const layerConfig = resolveTileLayerById(viewport, desiredId, kind);
  if (!layerConfig) {
    return;
  }
  const nextSignature = tileLayerSignature(layerConfig, settings);

  if (currentLayer && currentId === layerConfig.id && currentSignature === nextSignature) {
    return;
  }

  if (currentLayer) {
    map.removeLayer(currentLayer);
  }

  const nextLayer = buildTileLayer(layerConfig, paneName, settings);
  nextLayer.addTo(map);
  settingsState[currentLayerKey] = nextLayer;
  settingsState[currentIdKey] = layerConfig.id;
  settingsState[currentSignatureKey] = nextSignature;
}

function composePaneFilter({ brightness = 1, contrast = 1, saturate = 1, blurPx = 0 }) {
  return [
    `brightness(${Number(brightness)})`,
    `contrast(${Number(contrast)})`,
    `saturate(${Number(saturate)})`,
    `blur(${Number(blurPx)}px)`,
  ].join(" ");
}

function normalizeLeafletSettings(viewport, settings = {}) {
  const baseLayer = resolveTileLayerById(viewport, settings.base_tile_layer_id, "base") || resolveDefaultTileLayer(viewport);
  const labelLayer = resolveTileLayerById(viewport, settings.label_tile_layer_id, "labels") || null;
  const normalized = {
    id: settings.id || "map_leaflet_settings_runtime",
    base_tile_layer_id: baseLayer?.id || resolveDefaultTileLayer(viewport).id,
    label_tile_layer_id: labelLayer?.id || null,
    visual: {
      base_opacity: clampOpacity(settings.visual?.base_opacity ?? 1),
      labels_enabled: settings.visual?.labels_enabled !== false,
      label_opacity: clampOpacity(settings.visual?.label_opacity ?? 0.9),
      brightness: clampNumber(settings.visual?.brightness ?? 1, 0.4, 1.6, 1),
      contrast: clampNumber(settings.visual?.contrast ?? 1, 0.4, 1.6, 1),
      saturate: clampNumber(settings.visual?.saturate ?? 1, 0, 1.8, 1),
      blur_px: clampNumber(settings.visual?.blur_px ?? 0, 0, 3, 0),
    },
    zoom: {
      min_zoom: clampNumber(settings.zoom?.min_zoom ?? 3, 0, 18, 3),
      max_zoom: clampNumber(settings.zoom?.max_zoom ?? 18, 1, 18, 18),
      zoom_snap: clampNumber(settings.zoom?.zoom_snap ?? 1, 0, 2, 1),
      zoom_delta: clampNumber(settings.zoom?.zoom_delta ?? 1, 0.1, 2, 1),
    },
    interaction: {
      dragging_enabled: settings.interaction?.dragging_enabled !== false,
      scroll_wheel_zoom_enabled: settings.interaction?.scroll_wheel_zoom_enabled !== false,
      double_click_zoom_enabled: settings.interaction?.double_click_zoom_enabled !== false,
      keyboard_enabled: settings.interaction?.keyboard_enabled !== false,
      keyboard_pan_delta_px: clampNumber(settings.interaction?.keyboard_pan_delta_px ?? 80, 20, 240, 80),
      wheel_px_per_zoom_level: clampNumber(settings.interaction?.wheel_px_per_zoom_level ?? 60, 20, 240, 60),
      wheel_debounce_time_ms: clampNumber(settings.interaction?.wheel_debounce_time_ms ?? 40, 0, 200, 40),
    },
    motion: {
      inertia_enabled: settings.motion?.inertia_enabled !== false,
      inertia_deceleration: clampNumber(settings.motion?.inertia_deceleration ?? 3000, 500, 8000, 3000),
      max_bounds_viscosity: clampNumber(settings.motion?.max_bounds_viscosity ?? 0, 0, 1, 0),
      zoom_animation_enabled: settings.motion?.zoom_animation_enabled !== false,
      fade_animation_enabled: settings.motion?.fade_animation_enabled !== false,
      marker_zoom_animation_enabled: settings.motion?.marker_zoom_animation_enabled !== false,
    },
    tile_render: {
      update_when_idle: settings.tile_render?.update_when_idle !== false,
      update_interval_ms: clampNumber(settings.tile_render?.update_interval_ms ?? 200, 50, 1000, 200),
      keep_buffer: clampNumber(settings.tile_render?.keep_buffer ?? 4, 0, 12, 4),
      detect_retina: settings.tile_render?.detect_retina === true,
      min_native_zoom: settings.tile_render?.min_native_zoom == null
        ? null
        : clampNumber(settings.tile_render?.min_native_zoom, 0, 18, 0),
      max_native_zoom: settings.tile_render?.max_native_zoom == null
        ? null
        : clampNumber(settings.tile_render?.max_native_zoom, 0, 18, 18),
    },
  };

  if (normalized.zoom.max_zoom < normalized.zoom.min_zoom) {
    normalized.zoom.max_zoom = normalized.zoom.min_zoom;
  }

  if (
    normalized.tile_render.min_native_zoom != null
    && normalized.tile_render.max_native_zoom != null
    && normalized.tile_render.max_native_zoom < normalized.tile_render.min_native_zoom
  ) {
    normalized.tile_render.max_native_zoom = normalized.tile_render.min_native_zoom;
  }

  return normalized;
}

function syncLeafletInteraction(map, settings) {
  map.options.zoomSnap = settings.zoom.zoom_snap;
  map.options.zoomDelta = settings.zoom.zoom_delta;
  map.options.keyboardPanDelta = settings.interaction.keyboard_pan_delta_px;
  map.options.wheelPxPerZoomLevel = settings.interaction.wheel_px_per_zoom_level;
  map.options.wheelDebounceTime = settings.interaction.wheel_debounce_time_ms;
  map.options.inertia = settings.motion.inertia_enabled;
  map.options.inertiaDeceleration = settings.motion.inertia_deceleration;
  map.options.maxBoundsViscosity = settings.motion.max_bounds_viscosity;
  map.options.zoomAnimation = settings.motion.zoom_animation_enabled;
  map.options.fadeAnimation = settings.motion.fade_animation_enabled;
  map.options.markerZoomAnimation = settings.motion.marker_zoom_animation_enabled;

  if (settings.interaction.dragging_enabled) {
    map.dragging.enable();
  } else {
    map.dragging.disable();
  }

  if (settings.interaction.scroll_wheel_zoom_enabled) {
    map.scrollWheelZoom.enable();
  } else {
    map.scrollWheelZoom.disable();
  }

  if (settings.interaction.double_click_zoom_enabled) {
    map.doubleClickZoom.enable();
  } else {
    map.doubleClickZoom.disable();
  }

  if (settings.interaction.keyboard_enabled) {
    map.keyboard.enable();
  } else {
    map.keyboard.disable();
  }

  map.setMinZoom(settings.zoom.min_zoom);
  map.setMaxZoom(settings.zoom.max_zoom);
}

export function applyBrasixLeafletSettings(map, viewport, settings = {}) {
  if (!map || !viewport) {
    return;
  }

  const state = brasixLeafletState(map);
  const normalized = normalizeLeafletSettings(viewport, settings);
  syncLeafletTileLayer(map, viewport, state, "base", normalized.base_tile_layer_id, normalized);
  syncLeafletTileLayer(
    map,
    viewport,
    state,
    "labels",
    normalized.visual.labels_enabled ? normalized.label_tile_layer_id : null,
    normalized,
  );

  state.baseLayer?.setOpacity(normalized.visual.base_opacity);
  state.labelLayer?.setOpacity(normalized.visual.label_opacity);

  const basePane = map.getPane(state.basePaneName);
  if (basePane) {
    basePane.style.filter = composePaneFilter({
      brightness: normalized.visual.brightness,
      contrast: normalized.visual.contrast,
      saturate: normalized.visual.saturate,
      blurPx: normalized.visual.blur_px,
    });
  }

  const labelPane = map.getPane(state.labelPaneName);
  if (labelPane) {
    labelPane.style.opacity = "1";
    labelPane.style.display = normalized.visual.labels_enabled ? "" : "none";
    labelPane.style.filter = composePaneFilter({
      brightness: normalized.visual.brightness,
      contrast: normalized.visual.contrast,
      saturate: 1,
      blurPx: 0,
    });
  }

  syncLeafletInteraction(map, normalized);
}

export function createBrasixMap({ elementId, viewport, leafletSettings = {} }) {
  const L = leaflet();
  const normalizedSettings = normalizeLeafletSettings(viewport, leafletSettings);
  const map = L.map(elementId, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    worldCopyJump: false,
    minZoom: normalizedSettings.zoom.min_zoom,
    maxZoom: normalizedSettings.zoom.max_zoom,
    zoomSnap: normalizedSettings.zoom.zoom_snap,
    zoomDelta: normalizedSettings.zoom.zoom_delta,
    dragging: normalizedSettings.interaction.dragging_enabled,
    scrollWheelZoom: normalizedSettings.interaction.scroll_wheel_zoom_enabled,
    doubleClickZoom: normalizedSettings.interaction.double_click_zoom_enabled,
    keyboard: normalizedSettings.interaction.keyboard_enabled,
    keyboardPanDelta: normalizedSettings.interaction.keyboard_pan_delta_px,
    wheelPxPerZoomLevel: normalizedSettings.interaction.wheel_px_per_zoom_level,
    wheelDebounceTime: normalizedSettings.interaction.wheel_debounce_time_ms,
    inertia: normalizedSettings.motion.inertia_enabled,
    inertiaDeceleration: normalizedSettings.motion.inertia_deceleration,
    maxBoundsViscosity: normalizedSettings.motion.max_bounds_viscosity,
    zoomAnimation: normalizedSettings.motion.zoom_animation_enabled,
    fadeAnimation: normalizedSettings.motion.fade_animation_enabled,
    markerZoomAnimation: normalizedSettings.motion.marker_zoom_animation_enabled,
  });

  createPane(map, "brasix-basemap-base", 200);
  createPane(map, "brasix-basemap-labels", 230);
  ensureBasemapPaneStyles(map, "brasix-basemap-base");
  ensureBasemapPaneStyles(map, "brasix-basemap-labels");

  createPane(map, "brasix-routes", 420);
  createPane(map, "brasix-route-overlay", 430);
  createPane(map, "brasix-highlight", 440);
  createPane(map, "brasix-draft", 450);
  createPane(map, "brasix-markers", 470);

  fitBrasixBounds(map, viewport);
  map.setMaxBounds([
    [viewport.lat_min - 4, viewport.lon_min - 8],
    [viewport.lat_max + 4, viewport.lon_max + 8],
  ]);

  applyBrasixLeafletSettings(map, viewport, normalizedSettings);

  return map;
}

export function fitBrasixBounds(map, viewport) {
  map.fitBounds(
    [
      [viewport.lat_min, viewport.lon_min],
      [viewport.lat_max, viewport.lon_max],
    ],
    {
      padding: [12, 12],
      animate: false,
    },
  );
}

export function zoomMapByFactor(map, factor) {
  const bounds = map.getBounds();
  const center = bounds.getCenter();
  const latSpan = (bounds.getNorth() - bounds.getSouth()) * factor;
  const lonSpan = (bounds.getEast() - bounds.getWest()) * factor;

  map.fitBounds(
    [
      [center.lat - latSpan / 2, center.lng - lonSpan / 2],
      [center.lat + latSpan / 2, center.lng + lonSpan / 2],
    ],
    { padding: [12, 12], animate: true },
  );
}

export function sortPopulationBands(bands) {
  return [...(bands || [])].sort((left, right) => {
    if (left.legend_order !== right.legend_order) {
      return left.legend_order - right.legend_order;
    }
    return left.min_population_thousands - right.min_population_thousands;
  });
}

export function findPopulationBand(city, bands) {
  const ordered = sortPopulationBands(bands);
  return (
    ordered.find((band) => {
      const lower = Number(band.min_population_thousands || 0);
      const upper = band.max_population_thousands == null ? Number.POSITIVE_INFINITY : Number(band.max_population_thousands);
      return city.population_thousands >= lower && city.population_thousands < upper;
    }) || ordered[ordered.length - 1] || null
  );
}

export function countCitiesByPopulationBands(cities, bands) {
  return sortPopulationBands(bands).map((band) => {
    const upper = band.max_population_thousands == null ? Number.POSITIVE_INFINITY : Number(band.max_population_thousands);
    const count = cities.filter(
      (city) => city.population_thousands >= Number(band.min_population_thousands || 0) && city.population_thousands < upper,
    ).length;
    return {
      ...band,
      count,
    };
  });
}

function polygonPoints(shape, center, radius) {
  if (shape === "solid_triangle") {
    return [
      [center, center - radius],
      [center + radius * 0.92, center + radius * 0.82],
      [center - radius * 0.92, center + radius * 0.82],
    ];
  }
  if (shape === "solid_diamond") {
    return [
      [center, center - radius],
      [center + radius, center],
      [center, center + radius],
      [center - radius, center],
    ];
  }
  return [
    [center - radius, center - radius],
    [center + radius, center - radius],
    [center + radius, center + radius],
    [center - radius, center + radius],
  ];
}

function polygonMarkup(points, fill, stroke, strokeWidth) {
  const pointsMarkup = points.map((point) => point.join(",")).join(" ");
  return `<polygon points="${pointsMarkup}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
}

function svgMarkerMarkup({
  pin,
  size,
  fillColor,
  strokeColor,
  contrastFillColor = "#ffffff",
  selectedHaloFillColor = "#fff8ec",
  selectedHaloStrokeColor = "#2d5a27",
  selected,
  opacity,
}) {
  const strokeWidth = Number(pin.stroke_width_px || 2);
  const radius = size / 2;
  const center = radius + 6;
  const canvas = size + 12;
  const haloRadius = radius + 3.5;
  const innerRadius = Math.max(radius * Number(pin.inner_scale || 0), 2);

  let body = "";
  if (pin.shape === "ring_circle") {
    body = `<circle cx="${center}" cy="${center}" r="${radius - strokeWidth / 2}" fill="${contrastFillColor}" stroke="${fillColor}" stroke-width="${strokeWidth + 1}" />`;
  } else if (pin.shape === "bullseye_circle") {
    body = `
      <circle cx="${center}" cy="${center}" r="${radius - strokeWidth / 2}" fill="${contrastFillColor}" stroke="${fillColor}" stroke-width="${strokeWidth}" />
      <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="${fillColor}" />
    `;
  } else if (pin.shape === "orbit_circle") {
    body = `
      <circle cx="${center}" cy="${center}" r="${radius - strokeWidth / 2}" fill="${contrastFillColor}" fill-opacity="0.84" stroke="${fillColor}" stroke-width="${strokeWidth}" stroke-dasharray="4 3" />
      <circle cx="${center}" cy="${center}" r="${Math.max(innerRadius, radius * 0.44)}" fill="${fillColor}" />
    `;
  } else if (pin.shape === "solid_square") {
    body = `<rect x="${center - radius}" y="${center - radius}" width="${radius * 2}" height="${radius * 2}" rx="${Math.max(radius * 0.16, 2)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
  } else if (pin.shape === "ring_square") {
    body = `<rect x="${center - radius}" y="${center - radius}" width="${radius * 2}" height="${radius * 2}" rx="${Math.max(radius * 0.16, 2)}" fill="${contrastFillColor}" stroke="${fillColor}" stroke-width="${strokeWidth + 1}" />`;
  } else if (pin.shape === "solid_triangle" || pin.shape === "solid_diamond") {
    body = polygonMarkup(polygonPoints(pin.shape, center, radius), fillColor, strokeColor, strokeWidth);
  } else {
    body = `<circle cx="${center}" cy="${center}" r="${radius - strokeWidth / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
  }

  const halo = selected
    ? `<circle cx="${center}" cy="${center}" r="${haloRadius}" fill="${selectedHaloFillColor}" fill-opacity="0.92" stroke="${selectedHaloStrokeColor}" stroke-opacity="0.2" stroke-width="1.4" />`
    : "";

  return `
    <svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="opacity:${opacity};">
      ${halo}
      ${body}
    </svg>
  `;
}

function createMarker({
  latitude,
  longitude,
  label,
  size,
  pin,
  fillColor = "#2d5a27",
  strokeColor = "#ffffff",
  contrastFillColor = "#ffffff",
  selectedHaloFillColor = "#fff8ec",
  selectedHaloStrokeColor = "#2d5a27",
  selected = false,
  opacity = 1,
  className = "brasix-city-icon",
}) {
  const L = leaflet();
  const canvas = size + 12;

  return L.marker([latitude, longitude], {
    icon: L.divIcon({
      className,
      html: svgMarkerMarkup({
        pin: pin || { shape: "solid_circle", stroke_width_px: 2 },
        size,
        fillColor,
        strokeColor,
        contrastFillColor,
        selectedHaloFillColor,
        selectedHaloStrokeColor,
        selected,
        opacity,
      }),
      iconSize: [canvas, canvas],
      iconAnchor: [canvas / 2, canvas / 2],
    }),
    keyboard: true,
    bubblingMouseEvents: false,
    title: label,
    pane: "brasix-markers",
    zIndexOffset: selected ? 1200 : Math.round(size * 10),
  });
}

export function createCityMarker({
  city,
  band,
  pin,
  fillColor = "#2d5a27",
  strokeColor = "#ffffff",
  contrastFillColor = "#ffffff",
  selectedHaloFillColor = "#fff8ec",
  selectedHaloStrokeColor = "#2d5a27",
  selected = false,
  opacity = 1,
}) {
  const size = Math.max(8, Number(band?.marker_size_px || 16));
  return createMarker({
    latitude: city.latitude,
    longitude: city.longitude,
    label: city.label,
    size,
    pin,
    fillColor,
    strokeColor,
    contrastFillColor,
    selectedHaloFillColor,
    selectedHaloStrokeColor,
    selected,
    opacity,
    className: "brasix-city-icon",
  });
}

export function createGraphNodeMarker({
  node,
  style,
  contrastFillColor = "#ffffff",
  selectedHaloFillColor = "#fff8ec",
  selectedHaloStrokeColor = "#2d5a27",
  selected = false,
  opacity = 1,
}) {
  const pin = {
    shape: style?.shape || "solid_diamond",
    stroke_width_px: style?.stroke_width_px || 2,
    inner_scale: style?.inner_scale || 0,
  };
  return createMarker({
    latitude: node.latitude,
    longitude: node.longitude,
    label: node.label,
    size: Math.max(10, Number(node.size_px || style?.size_px || 16)),
    pin,
    fillColor: style?.fill_color || "#8c4f10",
    strokeColor: style?.stroke_color || "#fff9ea",
    contrastFillColor,
    selectedHaloFillColor,
    selectedHaloStrokeColor,
    selected,
    opacity,
    className: "brasix-city-icon brasix-graph-node-icon",
  });
}

function resolveEdgeEndpoint(edge, key) {
  if (key === "from") {
    return edge.from_node_id || edge.from_city_id;
  }
  return edge.to_node_id || edge.to_city_id;
}

export function buildRouteLatLngs(edge, nodesById) {
  const fromNode = nodesById[resolveEdgeEndpoint(edge, "from")];
  const toNode = nodesById[resolveEdgeEndpoint(edge, "to")];
  if (!fromNode || !toNode) {
    return [];
  }

  const waypoints = (edge.waypoints || []).map((waypoint) => [Number(waypoint.latitude), Number(waypoint.longitude)]);
  return [
    [Number(fromNode.latitude), Number(fromNode.longitude)],
    ...waypoints,
    [Number(toNode.latitude), Number(toNode.longitude)],
  ];
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function buildBezierLikeLatLngs(latlngs, samplesPerSegment = 14) {
  if (!Array.isArray(latlngs) || latlngs.length < 3) {
    return latlngs;
  }

  const points = latlngs.map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
  const smoothed = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const sampleLimit = index === points.length - 2 ? samplesPerSegment : samplesPerSegment - 1;

    for (let step = 0; step < sampleLimit; step += 1) {
      const t = step / (samplesPerSegment - 1);
      smoothed.push([
        catmullRomPoint(p0.lat, p1.lat, p2.lat, p3.lat, t),
        catmullRomPoint(p0.lng, p1.lng, p2.lng, p3.lng, t),
      ]);
    }
  }

  smoothed.push([points[points.length - 1].lat, points[points.length - 1].lng]);
  return smoothed;
}

export function routeUsesSmoothRendering(edge) {
  return edge.geometry_code === "polycurve" && edge.render_smoothing_enabled !== false;
}

export function buildRenderedRouteLatLngs(edge, nodesById) {
  const rawLatLngs = buildRouteLatLngs(edge, nodesById);
  if (!routeUsesSmoothRendering(edge)) {
    return rawLatLngs;
  }
  return buildBezierLikeLatLngs(rawLatLngs);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

export function computeRouteDistanceKm(edge, nodesById) {
  const latlngs = buildRouteLatLngs(edge, nodesById);
  if (latlngs.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < latlngs.length - 1; index += 1) {
    total += haversineKm(latlngs[index][0], latlngs[index][1], latlngs[index + 1][0], latlngs[index + 1][1]);
  }
  return roundNumber(total, 1);
}

function clampOpacity(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function resolveRouteRoleStyle(surfaceType, role, styleOverrides = {}) {
  const style = surfaceType?.style || {};
  const opacityScale = Number(styleOverrides.opacityScale ?? 1);
  const base = {
    baseColor: style.base_color || "#4f6f45",
    baseWeight: Number(style.base_weight || 4),
    baseOpacity: clampOpacity(Number(style.base_opacity ?? 0.78) * opacityScale),
    overlayColor: style.overlay_color || null,
    overlayWeight: Number(style.overlay_weight || 0),
    overlayOpacity: clampOpacity(Number(style.overlay_opacity ?? 0.9) * opacityScale),
    dashArray: style.dash_array || null,
  };

  if (role === "highlight") {
    return {
      ...base,
      baseColor: styleOverrides.highlightColor || "#2d5a27",
      baseWeight: base.baseWeight + 2,
      baseOpacity: 1,
      overlayColor: base.overlayColor ? (styleOverrides.highlightOverlayColor || "#fff9ea") : null,
      overlayWeight: base.overlayColor ? Math.max(base.overlayWeight + 0.8, 2.2) : 0,
      overlayOpacity: 1,
      basePane: "brasix-highlight",
      overlayPane: "brasix-highlight",
    };
  }

  if (role === "selected") {
    return {
      ...base,
      baseColor: styleOverrides.selectedColor || "#8c4f10",
      baseWeight: base.baseWeight + 2,
      baseOpacity: 1,
      overlayColor: base.overlayColor ? (styleOverrides.selectedOverlayColor || "#fff4dd") : null,
      overlayWeight: base.overlayColor ? Math.max(base.overlayWeight + 0.8, 2.2) : 0,
      overlayOpacity: 1,
      basePane: "brasix-highlight",
      overlayPane: "brasix-highlight",
    };
  }

  if (role === "draft") {
    return {
      ...base,
      baseColor: styleOverrides.draftColor || "#2d5a27",
      baseWeight: Math.max(base.baseWeight, 4),
      baseOpacity: 0.94,
      overlayColor: null,
      overlayWeight: 0,
      overlayOpacity: 0,
      dashArray: "10 8",
      basePane: "brasix-draft",
      overlayPane: "brasix-draft",
    };
  }

  return {
    ...base,
    baseOpacity: Math.min(base.baseOpacity, 0.55),
    overlayOpacity: Math.min(base.overlayOpacity, 0.68),
    basePane: "brasix-routes",
    overlayPane: "brasix-route-overlay",
  };
}

export function createRouteLayer({
  edge,
  citiesById,
  surfaceType,
  role = "network",
  interactive = false,
  onClick = null,
  onContextMenu = null,
  styleOverrides = null,
}) {
  const L = leaflet();
  const latlngs = buildRouteLatLngs(edge, citiesById);
  if (latlngs.length < 2) {
    return null;
  }
  const routeLatLngs = buildRenderedRouteLatLngs(edge, citiesById);
  const smoothRendering = routeUsesSmoothRendering(edge);

  const roleStyle = resolveRouteRoleStyle(surfaceType, role, styleOverrides || {});
  const group = L.layerGroup();
  const layers = [];
  const hitWeight = Math.max(Number(roleStyle.baseWeight || 4), Number(roleStyle.overlayWeight || 0)) + 10;

  const baseLayer = L.polyline(routeLatLngs, {
    color: roleStyle.baseColor,
    weight: roleStyle.baseWeight,
    opacity: roleStyle.baseOpacity,
    dashArray: roleStyle.dashArray,
    smoothFactor: smoothRendering ? 1.35 : 1,
    interactive: false,
    bubblingMouseEvents: false,
    pane: roleStyle.basePane,
    className: `route-layer route-layer-${edge.surface_code || "single_road"} route-layer-${role}`,
  });
  layers.push(baseLayer);

  if (roleStyle.overlayColor && roleStyle.overlayWeight > 0) {
    layers.push(
      L.polyline(routeLatLngs, {
        color: roleStyle.overlayColor,
        weight: roleStyle.overlayWeight,
        opacity: roleStyle.overlayOpacity,
        interactive: false,
        bubblingMouseEvents: false,
        pane: roleStyle.overlayPane,
      }),
    );
  }

  if (interactive) {
    layers.push(
      L.polyline(routeLatLngs, {
        color: "#000000",
        weight: hitWeight,
        opacity: 0.01,
        smoothFactor: smoothRendering ? 1.35 : 1,
        interactive: true,
        bubblingMouseEvents: false,
        pane: roleStyle.overlayPane,
        className: `route-hit-area route-hit-area-${edge.surface_code || "single_road"}`,
      }),
    );
  }

  layers.forEach((layer) => {
    layer.edge = edge;
    layer.edgeId = edge.id;
    const isHitArea = interactive && layer.options.className?.includes("route-hit-area");
    if (isHitArea && onClick) {
      layer.on("click", (event) => onClick(edge, event));
    }
    if (isHitArea && onContextMenu) {
      let contextDeleteLock = false;
      const stopEvent = (event) => {
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        if (event.originalEvent) {
          L.DomEvent.stop(event.originalEvent);
        }
      };
      const triggerContextDelete = (event) => {
        stopEvent(event);
        if (contextDeleteLock) {
          return;
        }
        contextDeleteLock = true;
        window.setTimeout(() => {
          contextDeleteLock = false;
        }, 80);
        onContextMenu(edge, event);
      };

      layer.on("contextmenu", (event) => {
        triggerContextDelete(event);
      });
      layer.on("mousedown", (event) => {
        if (event.originalEvent?.button !== 2) {
          return;
        }
        triggerContextDelete(event);
      });
    }
    group.addLayer(layer);
  });

  group.edge = edge;
  group.edgeId = edge.id;
  return group;
}

export function renderPopulationLegend(
  target,
  {
    cities,
    bands,
    pinsById,
    fillColor = "#2d5a27",
    strokeColor = "#ffffff",
    contrastFillColor = "#ffffff",
    fillColorResolver = null,
    routeSurfaceTypes = [],
  },
) {
  const items = countCitiesByPopulationBands(cities, bands)
    .map((band) => {
      const pin = pinsById[band.pin_id] || pinsById[Object.keys(pinsById)[0]] || { shape: "solid_circle", stroke_width_px: 2 };
      const size = Math.max(12, Number(band.marker_size_px || 16));
      const bandFillColor = fillColorResolver ? fillColorResolver(band) : fillColor;
      const icon = svgMarkerMarkup({
        pin,
        size,
        fillColor: bandFillColor,
        strokeColor,
        contrastFillColor,
        selected: false,
        opacity: 1,
      });
      return `
        <div class="legend-row" data-band-id="${band.id}">
          <span class="legend-icon">${icon}</span>
          <span class="legend-label">${escapeHtml(band.label)}</span>
          <strong class="legend-count">${numberFormatter(0).format(band.count)}</strong>
        </div>
      `;
    })
    .join("");

  const routeItems = routeSurfaceTypes
    .map((surfaceType) => {
      const style = surfaceType?.style || {};
      const baseColor = style.base_color || "#4f6f45";
      const overlayColor = style.overlay_color;
      const dashArray = style.dash_array || "";
      const svg = `
        <svg width="34" height="12" viewBox="0 0 34 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <line x1="2" y1="6" x2="32" y2="6" stroke="${baseColor}" stroke-width="6" stroke-linecap="round" ${dashArray ? `stroke-dasharray="${dashArray}"` : ""} />
          ${overlayColor ? `<line x1="2" y1="6" x2="32" y2="6" stroke="${overlayColor}" stroke-width="2" stroke-linecap="round" ${dashArray ? `stroke-dasharray="${dashArray}"` : ""} />` : ""}
        </svg>
      `;
      return `
        <div class="legend-row legend-route-row" data-surface-id="${surfaceType.id}">
          <span class="legend-icon legend-route-swatch">${svg}</span>
          <span class="legend-label">${escapeHtml(surfaceType.label || "Rota")}</span>
          <strong class="legend-count">${escapeHtml(surfaceType.shortcut_key || "")}</strong>
        </div>
      `;
    })
    .join("");

  target.innerHTML = `
    <div class="legend-section">
      <div class="legend-head">
        <span>Faixas populacionais</span>
        <strong>${numberFormatter(0).format(cities.length)} cidades</strong>
      </div>
      <div class="legend-body">
        ${items}
      </div>
    </div>
    ${routeItems ? `
      <div class="legend-section">
        <div class="legend-head">
          <span>Tipos de rota</span>
          <strong>Atalhos</strong>
        </div>
        <div class="legend-body">
          ${routeItems}
        </div>
      </div>
    ` : ""}
  `;
}
