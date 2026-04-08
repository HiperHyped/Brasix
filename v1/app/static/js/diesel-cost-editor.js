import { createBrasixMap, fitBrasixBounds } from "./shared/leaflet-map.js?v=20260407-diesel-map-1";
import { escapeHtml, numberFormatter } from "./shared/formatters.js";

const THEME_KEY = "brasix:v1:diesel-editor-theme";
const MODE_LABELS = {
  observed: "Observado",
  estimated: "Estimado",
  final: "Final",
};
const DEFAULT_RULES = {
  nearest_anchor_count: 4,
  minimum_distance_km: 35,
  power: 2.1,
  same_state_bonus: 1.28,
  out_of_state_penalty: 0.84,
  preferred_state_radius_km: 480,
  max_distance_km: 920,
  fallback_blend_radius_km: 260,
  fallback_blend_power: 1.35,
};
const state = {
  bootstrap: null,
  map: null,
  glowLayer: null,
  markerLayer: null,
  cities: [],
  citiesById: {},
  cityValues: [],
  cityValuesById: {},
  observationsByCityId: {},
  overridesByCityId: {},
  selectedCityId: "",
  viewMode: "final",
  filters: {
    search: "",
    stateCode: "all",
  },
  batch: {
    stateCode: "",
    mode: "delta",
    value: "0.100",
  },
  saveStatus: "idle",
  lastError: "",
  savePromise: Promise.resolve(),
};

const refs = {
  headerBadges: document.getElementById("diesel-editor-header-badges"),
  themeButton: document.getElementById("diesel-editor-theme-toggle"),
  citiesSummary: document.getElementById("diesel-editor-cities-summary"),
  search: document.getElementById("diesel-editor-search"),
  stateFilter: document.getElementById("diesel-editor-state-filter"),
  citiesList: document.getElementById("diesel-editor-cities-list"),
  mapStage: document.getElementById("diesel-editor-map-stage"),
  mapOverlayTitle: document.getElementById("diesel-editor-map-overlay-title"),
  metrics: document.getElementById("diesel-editor-metrics"),
  modeToggle: document.getElementById("diesel-editor-mode-toggle"),
  citySummary: document.getElementById("diesel-editor-city-summary"),
  observedInput: document.getElementById("diesel-editor-observed-input"),
  applyObservedButton: document.getElementById("diesel-editor-apply-observed"),
  clearObservedButton: document.getElementById("diesel-editor-clear-observed"),
  overrideInput: document.getElementById("diesel-editor-override-input"),
  applyOverrideButton: document.getElementById("diesel-editor-apply-override"),
  clearOverrideButton: document.getElementById("diesel-editor-clear-override"),
  batchState: document.getElementById("diesel-editor-batch-state"),
  batchMode: document.getElementById("diesel-editor-batch-mode"),
  batchValue: document.getElementById("diesel-editor-batch-value"),
  stateSummary: document.getElementById("diesel-editor-state-summary"),
  applyStateButton: document.getElementById("diesel-editor-apply-state"),
  clearStateButton: document.getElementById("diesel-editor-clear-state"),
};

function normalizeSearchToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function number0(value) {
  return numberFormatter(0).format(Number(value || 0));
}

function number2(value) {
  return numberFormatter(2).format(Number(value || 0));
}

function number3(value) {
  return numberFormatter(3).format(Number(value || 0));
}

function toOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function formatPrice(value) {
  const numeric = toOptionalNumber(value);
  if (numeric == null) {
    return "-";
  }
  return `R$ ${number3(numeric)}/L`;
}

function formatDistance(value) {
  const numeric = toOptionalNumber(value);
  if (numeric == null) {
    return "-";
  }
  if (numeric >= 100) {
    return `${number0(numeric)} km`;
  }
  return `${number2(numeric)} km`;
}

function modeLabel(mode = state.viewMode) {
  return MODE_LABELS[mode] || MODE_LABELS.final;
}

function sourceLabel(source) {
  if (source === "override") {
    return "Override";
  }
  if (source === "observed") {
    return "Observado";
  }
  if (source === "estimated") {
    return "Estimado";
  }
  return "Sem base";
}

function saveStatusLabel() {
  if (state.saveStatus === "saving") {
    return "Salvando";
  }
  if (state.saveStatus === "error") {
    return "Falha ao salvar";
  }
  return "Salvo";
}

function currentCity() {
  return state.citiesById[state.selectedCityId] || null;
}

function currentCityValue() {
  return state.cityValuesById[state.selectedCityId] || null;
}

function normalizeObservation(raw) {
  const cityId = String(raw?.city_id || "").trim();
  const city = state.citiesById[cityId];
  const price = toOptionalNumber(raw?.price_brl_per_liter);
  if (!city || price == null || price < 0) {
    return null;
  }
  const sourceKind = String(raw?.source_kind || "manual").trim().toLowerCase() === "seed" ? "seed" : "manual";
  return {
    city_id: cityId,
    city_label: city.label || city.name || cityId,
    state_code: city.state_code || "",
    price_brl_per_liter: round4(price),
    source_kind: sourceKind,
    source_label: String(raw?.source_label || (sourceKind === "seed" ? "Seed Diesel v1" : "Manual")).trim() || "Manual",
  };
}

function normalizeOverride(raw) {
  const cityId = String(raw?.city_id || "").trim();
  const city = state.citiesById[cityId];
  const price = toOptionalNumber(raw?.final_price_brl_per_liter);
  if (!city || price == null || price < 0) {
    return null;
  }
  return {
    city_id: cityId,
    city_label: city.label || city.name || cityId,
    state_code: city.state_code || "",
    final_price_brl_per_liter: round4(price),
  };
}

function applyDocument(document) {
  const normalizedObservations = {};
  (document?.observations || []).forEach((raw) => {
    const entry = normalizeObservation(raw);
    if (entry) {
      normalizedObservations[entry.city_id] = entry;
    }
  });
  const normalizedOverrides = {};
  (document?.overrides || []).forEach((raw) => {
    const entry = normalizeOverride(raw);
    if (entry) {
      normalizedOverrides[entry.city_id] = entry;
    }
  });

  state.observationsByCityId = normalizedObservations;
  state.overridesByCityId = normalizedOverrides;
  state.documentId = String(document?.id || `diesel_cost_editor::${state.bootstrap?.active_map?.id || "map"}`);
  state.rules = { ...DEFAULT_RULES, ...(document?.interpolation_rules || {}) };
  recomputeCityValues();
}

function initializeState(payload) {
  state.bootstrap = payload;
  state.cities = [...(payload.cities || [])].sort((left, right) => String(left.label || left.name || "").localeCompare(String(right.label || right.name || ""), "pt-BR"));
  state.citiesById = Object.fromEntries(state.cities.map((city) => [city.id, city]));
  applyDocument(payload.diesel_document || {});

  const firstObserved = Object.values(state.observationsByCityId)[0]?.city_id || "";
  state.selectedCityId = state.citiesById[firstObserved] ? firstObserved : (state.cities[0]?.id || "");
  state.batch.stateCode = currentCity()?.state_code || state.cities[0]?.state_code || "";
}

function currentDisplayValue(row) {
  if (state.viewMode === "observed") {
    return toOptionalNumber(row.observed_value);
  }
  if (state.viewMode === "estimated") {
    return toOptionalNumber(row.estimated_value);
  }
  return toOptionalNumber(row.final_value);
}

function stateCodes() {
  return Array.from(new Set(state.cities.map((city) => city.state_code).filter(Boolean))).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = (Math.sin(deltaPhi / 2) ** 2) + (Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2) ** 2));
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function estimateCityValue(city, anchors, observationByCityId, stateMeanByCode, globalMean) {
  const observed = observationByCityId[city.id];
  if (observed) {
    const observedValue = Number(observed.price_brl_per_liter || 0);
    return {
      observed_value: observedValue,
      estimated_value: observedValue,
      anchor_count: 1,
      nearest_distance_km: 0,
      source: "observed",
    };
  }

  if (!anchors.length) {
    return {
      observed_value: null,
      estimated_value: 0,
      anchor_count: 0,
      nearest_distance_km: null,
      source: "none",
    };
  }

  const nearestAnchorCount = Math.max(1, Number(state.rules.nearest_anchor_count || DEFAULT_RULES.nearest_anchor_count));
  const minimumDistanceKm = Math.max(1, Number(state.rules.minimum_distance_km || DEFAULT_RULES.minimum_distance_km));
  const power = Math.max(0.2, Number(state.rules.power || DEFAULT_RULES.power));
  const sameStateBonus = Math.max(0.01, Number(state.rules.same_state_bonus || DEFAULT_RULES.same_state_bonus));
  const outOfStatePenalty = Math.max(0.01, Number(state.rules.out_of_state_penalty || DEFAULT_RULES.out_of_state_penalty));
  const preferredStateRadiusKm = Math.max(minimumDistanceKm, Number(state.rules.preferred_state_radius_km || DEFAULT_RULES.preferred_state_radius_km));
  const maxDistanceKm = Math.max(preferredStateRadiusKm, Number(state.rules.max_distance_km || DEFAULT_RULES.max_distance_km));
  const blendRadiusKm = Math.max(minimumDistanceKm, Number(state.rules.fallback_blend_radius_km || DEFAULT_RULES.fallback_blend_radius_km));
  const blendPower = Math.max(0.1, Number(state.rules.fallback_blend_power || DEFAULT_RULES.fallback_blend_power));

  const distanceRows = anchors
    .map((anchor) => ({
      ...anchor,
      distance_km: haversineKm(city.latitude, city.longitude, anchor.city.latitude, anchor.city.longitude),
    }))
    .sort((left, right) => left.distance_km - right.distance_km);

  let sameStateRows = distanceRows.filter((row) => row.city.state_code === city.state_code && row.distance_km <= preferredStateRadiusKm);
  if (!sameStateRows.length) {
    sameStateRows = distanceRows.filter((row) => row.city.state_code === city.state_code);
  }

  const selected = [];
  const seen = new Set();
  sameStateRows.forEach((row) => {
    if (selected.length >= nearestAnchorCount) {
      return;
    }
    selected.push(row);
    seen.add(row.city.id);
  });
  distanceRows.forEach((row) => {
    if (selected.length >= nearestAnchorCount || seen.has(row.city.id)) {
      return;
    }
    if (row.distance_km <= maxDistanceKm || !selected.length) {
      selected.push(row);
      seen.add(row.city.id);
    }
  });
  if (!selected.length) {
    selected.push(...distanceRows.slice(0, nearestAnchorCount));
  }

  let weightedTotal = 0;
  let weightSum = 0;
  selected.forEach((row) => {
    const distanceKm = Math.max(Number(row.distance_km || 0), minimumDistanceKm);
    const baseWeight = 1 / (distanceKm ** power);
    const stateWeight = row.city.state_code === city.state_code ? sameStateBonus : outOfStatePenalty;
    const weight = baseWeight * stateWeight;
    weightedTotal += Number(row.value || 0) * weight;
    weightSum += weight;
  });

  const weightedAverage = weightSum > 0 ? (weightedTotal / weightSum) : 0;
  const nearestDistanceKm = Number(selected[0]?.distance_km ?? 0);
  const fallbackMean = Number(stateMeanByCode[city.state_code] ?? globalMean ?? 0);
  const blendFactor = Math.exp(-((Math.max(nearestDistanceKm, minimumDistanceKm) / blendRadiusKm) ** blendPower));
  const estimatedValue = (weightedAverage * blendFactor) + (fallbackMean * (1 - blendFactor));
  return {
    observed_value: null,
    estimated_value: round4(estimatedValue),
    anchor_count: selected.length,
    nearest_distance_km: round4(nearestDistanceKm),
    source: "estimated",
  };
}

function recomputeCityValues() {
  const observations = Object.values(state.observationsByCityId);
  const overridesByCityId = state.overridesByCityId;
  const observationByCityId = state.observationsByCityId;
  const anchors = observations
    .map((observation) => {
      const city = state.citiesById[observation.city_id];
      if (!city) {
        return null;
      }
      return {
        city,
        value: Number(observation.price_brl_per_liter || 0),
        source_kind: observation.source_kind || "manual",
      };
    })
    .filter(Boolean);
  const globalMean = anchors.length ? (anchors.reduce((total, anchor) => total + Number(anchor.value || 0), 0) / anchors.length) : 0;
  const stateBuckets = {};
  anchors.forEach((anchor) => {
    if (!stateBuckets[anchor.city.state_code]) {
      stateBuckets[anchor.city.state_code] = [];
    }
    stateBuckets[anchor.city.state_code].push(Number(anchor.value || 0));
  });
  const stateMeanByCode = Object.fromEntries(
    Object.entries(stateBuckets).map(([stateCode, values]) => [stateCode, values.reduce((total, value) => total + value, 0) / values.length]),
  );

  state.cityValues = state.cities.map((city) => {
    const estimate = estimateCityValue(city, anchors, observationByCityId, stateMeanByCode, globalMean);
    const override = overridesByCityId[city.id];
    const finalValue = override ? Number(override.final_price_brl_per_liter || 0) : Number(estimate.estimated_value || 0);
    return {
      city_id: city.id,
      city_label: city.label || city.name || city.id,
      state_code: city.state_code || "",
      observed_value: estimate.observed_value,
      estimated_value: round4(estimate.estimated_value),
      final_value: round4(finalValue),
      source: override ? "override" : estimate.source,
      anchor_count: Number(estimate.anchor_count || 0),
      nearest_distance_km: estimate.nearest_distance_km == null ? null : round4(estimate.nearest_distance_km),
    };
  });
  state.cityValuesById = Object.fromEntries(state.cityValues.map((row) => [row.city_id, row]));
  const finalValues = state.cityValues.map((row) => Number(row.final_value || 0));
  state.summary = {
    city_count: state.cityValues.length,
    observed_count: Object.keys(state.observationsByCityId).length,
    override_count: Object.keys(state.overridesByCityId).length,
    average_final_price_brl_per_liter: finalValues.length ? round4(finalValues.reduce((total, value) => total + value, 0) / finalValues.length) : null,
    min_final_price_brl_per_liter: finalValues.length ? round4(Math.min(...finalValues)) : null,
    max_final_price_brl_per_liter: finalValues.length ? round4(Math.max(...finalValues)) : null,
  };
}

function serializeDocumentPayload() {
  const observations = Object.values(state.observationsByCityId)
    .sort((left, right) => String(left.city_label || "").localeCompare(String(right.city_label || ""), "pt-BR"));
  const overrides = Object.values(state.overridesByCityId)
    .sort((left, right) => String(left.city_label || "").localeCompare(String(right.city_label || ""), "pt-BR"));
  return {
    map_id: state.bootstrap?.active_map?.id || "",
    observations,
    overrides,
    updated_at: new Date().toISOString(),
  };
}

function closestCityForLatLng(latlng, maxPixelDistance = 42) {
  if (!state.map || !latlng || !state.cities.length) {
    return null;
  }
  const target = state.map.latLngToContainerPoint(latlng);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  state.cities.forEach((city) => {
    const point = state.map.latLngToContainerPoint([city.latitude, city.longitude]);
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    const distance = Math.sqrt((dx ** 2) + (dy ** 2));
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  });
  return bestDistance <= maxPixelDistance ? best : null;
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) {
    return { r: 140, g: 79, b: 16 };
  }
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function colorForRatio(ratio) {
  const start = hexToRgb("#f3dba0");
  const end = hexToRgb("#8c4f10");
  const clamped = Math.max(0, Math.min(1, Number(ratio || 0)));
  const r = Math.round(start.r + ((end.r - start.r) * clamped));
  const g = Math.round(start.g + ((end.g - start.g) * clamped));
  const b = Math.round(start.b + ((end.b - start.b) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

function filteredRows() {
  const search = normalizeSearchToken(state.filters.search);
  return state.cityValues.filter((row) => {
    const city = state.citiesById[row.city_id];
    if (!city) {
      return false;
    }
    if (state.filters.stateCode !== "all" && city.state_code !== state.filters.stateCode) {
      return false;
    }
    if (!search) {
      return true;
    }
    return normalizeSearchToken(`${city.label} ${city.state_code} ${city.name}`).includes(search);
  });
}

function stateRows(stateCode = state.batch.stateCode) {
  return state.cityValues.filter((row) => row.state_code === stateCode);
}

function metricMarkup(label, value, span2 = false) {
  return `
    <div class="product-editor-city-metric${span2 ? " is-span-2" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function badgeMarkup(label, tone) {
  return `<span class="editor-badge diesel-editor-badge diesel-editor-badge-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function applyThemeButtonLabel() {
  const isNight = document.documentElement.dataset.editorTheme === "night";
  refs.themeButton?.querySelector("span:last-child")?.replaceChildren(document.createTextNode(isNight ? "Modo claro" : "Modo noturno"));
}

function toggleTheme() {
  const root = document.documentElement;
  root.dataset.editorTheme = root.dataset.editorTheme === "night" ? "day" : "night";
  window.localStorage.setItem(THEME_KEY, root.dataset.editorTheme);
  applyThemeButtonLabel();
}

function buildHeaderBadges() {
  if (!refs.headerBadges) {
    return;
  }
  refs.headerBadges.innerHTML = `
    <span class="flow-editor-summary-pill">${escapeHtml(state.bootstrap?.active_map?.slug || "mapa")}</span>
    <span class="flow-editor-summary-pill">${number0(state.summary?.city_count || 0)} cidades</span>
    <span class="flow-editor-summary-pill">${number0(state.summary?.observed_count || 0)} observadas</span>
    <span class="flow-editor-summary-pill">${number0(state.summary?.override_count || 0)} overrides</span>
    <span class="flow-editor-summary-pill">${escapeHtml(modeLabel())}</span>
    <span class="flow-editor-summary-pill">${escapeHtml(saveStatusLabel())}</span>
  `;
}

function renderFilters() {
  const options = [`<option value="all">Todas</option>`]
    .concat(stateCodes().map((stateCode) => `<option value="${escapeHtml(stateCode)}">${escapeHtml(stateCode)}</option>`));
  refs.stateFilter.innerHTML = options.join("");
  refs.stateFilter.value = state.filters.stateCode;

  refs.batchState.innerHTML = stateCodes().map((stateCode) => `<option value="${escapeHtml(stateCode)}">${escapeHtml(stateCode)}</option>`).join("");
  if (!state.batch.stateCode || !stateCodes().includes(state.batch.stateCode)) {
    state.batch.stateCode = currentCity()?.state_code || stateCodes()[0] || "";
  }
  refs.batchState.value = state.batch.stateCode;
  refs.batchMode.value = state.batch.mode;
  refs.batchValue.value = state.batch.value;
}

function renderCityList() {
  const rows = filteredRows();
  refs.citiesSummary.textContent = `${rows.length} de ${state.cityValues.length}`;
  if (!rows.length) {
    refs.citiesList.innerHTML = '<div class="truck-gallery-empty">Nenhuma cidade encontrada.</div>';
    return;
  }
  refs.citiesList.innerHTML = rows.map((row) => {
    const city = state.citiesById[row.city_id];
    const isActive = row.city_id === state.selectedCityId;
    const badges = [
      row.observed_value != null ? badgeMarkup("Obs", "observed") : "",
      row.source === "override" ? badgeMarkup("Override", "override") : "",
    ].filter(Boolean).join("");
    return `
      <button class="flow-editor-product-item diesel-editor-city-item${isActive ? " is-active" : ""}" type="button" data-city-id="${escapeHtml(row.city_id)}">
        <div class="flow-editor-product-top diesel-editor-city-top">
          <strong>${escapeHtml(city?.label || row.city_label)}</strong>
          <span class="flow-editor-product-count">${escapeHtml(formatPrice(row.final_value))}</span>
        </div>
        <div class="flow-editor-product-meta diesel-editor-city-meta">
          <div class="flow-editor-mini-metric"><strong>UF</strong><span>${escapeHtml(row.state_code || "-")}</span></div>
          <div class="flow-editor-mini-metric"><strong>Base</strong><span>${escapeHtml(formatPrice(row.estimated_value))}</span></div>
          <div class="diesel-editor-city-badges">${badges || '<span class="diesel-editor-city-source">Estimado</span>'}</div>
        </div>
      </button>
    `;
  }).join("");
}

function renderMapSummary() {
  const city = currentCity();
  const row = currentCityValue();
  const status = state.saveStatus === "error" ? ` · ${state.lastError || saveStatusLabel()}` : "";
  refs.mapOverlayTitle.textContent = modeLabel();
}

function renderMetrics() {
  const rows = state.viewMode === "observed"
    ? state.cityValues.filter((row) => row.observed_value != null)
    : state.cityValues;
  const values = rows.map((row) => currentDisplayValue(row)).filter((value) => value != null);
  const average = values.length ? (values.reduce((total, value) => total + value, 0) / values.length) : null;
  const range = values.length ? `${formatPrice(Math.min(...values))} - ${formatPrice(Math.max(...values))}` : "-";
  refs.metrics.innerHTML = `
    <div class="flow-editor-funnel-metric"><strong>${number0(state.summary?.observed_count || 0)}</strong><span>Observadas</span></div>
    <div class="flow-editor-funnel-metric"><strong>${number0(state.summary?.override_count || 0)}</strong><span>Overrides</span></div>
    <div class="flow-editor-funnel-metric"><strong>${escapeHtml(average == null ? "-" : formatPrice(average))}</strong><span>Media ${escapeHtml(modeLabel().toLowerCase())}</span></div>
    <div class="flow-editor-funnel-metric"><strong>${escapeHtml(range)}</strong><span>Faixa</span></div>
  `;
}

function renderCityPanel() {
  const city = currentCity();
  const row = currentCityValue();
  if (!city || !row) {
    refs.citySummary.innerHTML = '<div class="truck-gallery-empty">Selecione uma cidade.</div>';
    refs.stateSummary.innerHTML = "";
    refs.observedInput.value = "";
    refs.overrideInput.value = "";
    return;
  }

  refs.citySummary.innerHTML = `
    <div class="product-editor-city-grid diesel-editor-city-grid">
      ${metricMarkup("Cidade", city.label || city.name || city.id, true)}
      ${metricMarkup("UF", city.state_code || "-")}
      ${metricMarkup("Origem", sourceLabel(row.source))}
      ${metricMarkup("Observado", formatPrice(row.observed_value))}
      ${metricMarkup("Estimado", formatPrice(row.estimated_value))}
      ${metricMarkup("Final", formatPrice(row.final_value))}
      ${metricMarkup("Ancoras", `${number0(row.anchor_count || 0)}`)}
      ${metricMarkup("Vizinho", formatDistance(row.nearest_distance_km))}
    </div>
  `;

  refs.observedInput.value = row.observed_value == null ? "" : Number(row.observed_value).toFixed(3);
  const currentOverride = state.overridesByCityId[city.id];
  refs.overrideInput.value = currentOverride ? Number(currentOverride.final_price_brl_per_liter || 0).toFixed(3) : "";

  const rows = stateRows();
  const observedCount = rows.filter((item) => item.observed_value != null).length;
  const overrideCount = rows.filter((item) => item.source === "override").length;
  const averageFinal = rows.length ? (rows.reduce((total, item) => total + Number(item.final_value || 0), 0) / rows.length) : null;
  refs.stateSummary.innerHTML = `
    <div class="product-editor-city-grid diesel-editor-state-grid">
      ${metricMarkup("Cidades", `${number0(rows.length)}`)}
      ${metricMarkup("Observadas", `${number0(observedCount)}`)}
      ${metricMarkup("Overrides", `${number0(overrideCount)}`)}
      ${metricMarkup("Media final", averageFinal == null ? "-" : formatPrice(averageFinal))}
    </div>
  `;
}

function renderMap() {
  if (!state.map) {
    return;
  }
  if (!state.glowLayer) {
    state.glowLayer = window.L.layerGroup().addTo(state.map);
  }
  if (!state.markerLayer) {
    state.markerLayer = window.L.layerGroup().addTo(state.map);
  }
  state.glowLayer.clearLayers();
  state.markerLayer.clearLayers();

  const visibleRows = state.viewMode === "observed"
    ? state.cityValues.filter((row) => row.observed_value != null)
    : state.cityValues;
  const visibleValues = visibleRows
    .map((row) => currentDisplayValue(row))
    .filter((value) => value != null);
  const minValue = visibleValues.length ? Math.min(...visibleValues) : 0;
  const maxValue = visibleValues.length ? Math.max(...visibleValues) : 0;
  const spread = Math.max(maxValue - minValue, 0.001);

  visibleRows
    .slice()
    .sort((left, right) => Number(currentDisplayValue(left) || 0) - Number(currentDisplayValue(right) || 0))
    .forEach((row) => {
      const city = state.citiesById[row.city_id];
      const value = currentDisplayValue(row);
      if (!city || value == null) {
        return;
      }
      const ratio = Math.max(0, Math.min(1, (Number(value) - minValue) / spread));
      const color = colorForRatio(ratio);
      const selected = row.city_id === state.selectedCityId;
      const hasOverride = row.source === "override";
      const hasObserved = row.observed_value != null;

      if (state.viewMode !== "observed" && Number(value) > 0) {
        window.L.circle([city.latitude, city.longitude], {
          pane: "brasix-highlight",
          radius: 10000 + (ratio * 62000),
          stroke: false,
          fillColor: color,
          fillOpacity: 0.03 + (ratio * 0.15),
          interactive: false,
        }).addTo(state.glowLayer);
      }

      const marker = window.L.circleMarker([city.latitude, city.longitude], {
        pane: "brasix-markers",
        radius: (state.viewMode === "observed" ? 5 : 3.5) + (ratio * 6) + (selected ? 1.8 : 0),
        color: selected ? "#8c4f10" : (hasOverride ? "#2d5a27" : (hasObserved ? "#fff9ea" : "rgba(53, 61, 44, 0.52)")),
        weight: selected ? 2.4 : (hasObserved ? 1.9 : 1.2),
        fillColor: color,
        fillOpacity: state.viewMode === "observed" ? 0.92 : (hasOverride ? 0.88 : 0.75),
      });
      marker.on("click", () => {
        selectCity(row.city_id);
      });
      marker.bindTooltip(
        `${escapeHtml(city.label)}<br>${escapeHtml(formatPrice(row.observed_value))} obs<br>${escapeHtml(formatPrice(row.estimated_value))} est<br>${escapeHtml(formatPrice(row.final_value))} final`,
      );
      marker.addTo(state.markerLayer);
    });
}

function selectCity(cityId) {
  if (!state.citiesById[cityId]) {
    return;
  }
  state.selectedCityId = cityId;
  state.batch.stateCode = currentCity()?.state_code || state.batch.stateCode;
  renderAll();
}

function setViewMode(mode) {
  state.viewMode = mode === "observed" || mode === "estimated" ? mode : "final";
  renderAll();
}

function syncModeButtons() {
  refs.modeToggle.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.viewMode);
  });
}

async function persistDocument() {
  const payload = serializeDocumentPayload();
  state.saveStatus = "saving";
  state.lastError = "";
  buildHeaderBadges();
  renderMapSummary();
  state.savePromise = state.savePromise
    .catch(() => null)
    .then(async () => {
      const response = await fetch("/api/editor/custos/document", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Falha ao salvar o Diesel.");
      }
      applyDocument(data.document || {});
      state.saveStatus = "saved";
      state.lastError = "";
      renderAll();
    })
    .catch((error) => {
      state.saveStatus = "error";
      state.lastError = String(error?.message || error || "Falha ao salvar o Diesel.");
      buildHeaderBadges();
      renderMapSummary();
    });
  return state.savePromise;
}

function upsertObservedForCurrentCity(price) {
  const city = currentCity();
  if (!city) {
    return;
  }
  state.observationsByCityId[city.id] = {
    city_id: city.id,
    city_label: city.label || city.name || city.id,
    state_code: city.state_code || "",
    price_brl_per_liter: round4(price),
    source_kind: "manual",
    source_label: "Manual",
  };
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function clearObservedForCurrentCity() {
  const city = currentCity();
  if (!city) {
    return;
  }
  delete state.observationsByCityId[city.id];
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function upsertOverrideForCurrentCity(price) {
  const city = currentCity();
  if (!city) {
    return;
  }
  const base = state.cityValuesById[city.id]?.estimated_value;
  if (base != null && Math.abs(Number(price) - Number(base)) < 0.0005) {
    delete state.overridesByCityId[city.id];
  } else {
    state.overridesByCityId[city.id] = {
      city_id: city.id,
      city_label: city.label || city.name || city.id,
      state_code: city.state_code || "",
      final_price_brl_per_liter: round4(price),
    };
  }
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function clearOverrideForCurrentCity() {
  const city = currentCity();
  if (!city) {
    return;
  }
  delete state.overridesByCityId[city.id];
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function applyStateAdjustment() {
  const targetState = refs.batchState.value || "";
  const mode = refs.batchMode.value === "factor" ? "factor" : "delta";
  const value = toOptionalNumber(refs.batchValue.value);
  if (!targetState || value == null) {
    return;
  }
  state.batch.stateCode = targetState;
  state.batch.mode = mode;
  state.batch.value = refs.batchValue.value;

  stateRows(targetState).forEach((row) => {
    const city = state.citiesById[row.city_id];
    if (!city) {
      return;
    }
    const nextFinal = mode === "factor"
      ? Math.max(0, Number(row.final_value || 0) * value)
      : Math.max(0, Number(row.final_value || 0) + value);
    const estimated = Number(row.estimated_value || 0);
    if (Math.abs(nextFinal - estimated) < 0.0005) {
      delete state.overridesByCityId[city.id];
      return;
    }
    state.overridesByCityId[city.id] = {
      city_id: city.id,
      city_label: city.label || city.name || city.id,
      state_code: city.state_code || "",
      final_price_brl_per_liter: round4(nextFinal),
    };
  });
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function clearStateOverrides() {
  const targetState = refs.batchState.value || "";
  if (!targetState) {
    return;
  }
  Object.keys(state.overridesByCityId).forEach((cityId) => {
    if (state.overridesByCityId[cityId]?.state_code === targetState) {
      delete state.overridesByCityId[cityId];
    }
  });
  recomputeCityValues();
  renderAll();
  void persistDocument();
}

function renderAll() {
  syncModeButtons();
  buildHeaderBadges();
  renderFilters();
  renderCityList();
  renderMapSummary();
  renderMetrics();
  renderCityPanel();
  renderMap();
  applyThemeButtonLabel();
}

function bindEvents() {
  refs.themeButton?.addEventListener("click", toggleTheme);
  refs.search?.addEventListener("input", (event) => {
    state.filters.search = event.target.value || "";
    renderCityList();
  });
  refs.stateFilter?.addEventListener("change", (event) => {
    state.filters.stateCode = event.target.value || "all";
    renderCityList();
  });
  refs.modeToggle?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) {
      return;
    }
    setViewMode(button.dataset.mode || "final");
  });
  refs.citiesList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-city-id]");
    if (!button) {
      return;
    }
    selectCity(button.dataset.cityId || "");
  });
  refs.applyObservedButton?.addEventListener("click", () => {
    const price = toOptionalNumber(refs.observedInput.value);
    if (price == null) {
      return;
    }
    upsertObservedForCurrentCity(price);
  });
  refs.clearObservedButton?.addEventListener("click", clearObservedForCurrentCity);
  refs.applyOverrideButton?.addEventListener("click", () => {
    const price = toOptionalNumber(refs.overrideInput.value);
    if (price == null) {
      return;
    }
    upsertOverrideForCurrentCity(price);
  });
  refs.clearOverrideButton?.addEventListener("click", clearOverrideForCurrentCity);
  refs.batchState?.addEventListener("change", (event) => {
    state.batch.stateCode = event.target.value || "";
    renderCityPanel();
  });
  refs.batchMode?.addEventListener("change", (event) => {
    state.batch.mode = event.target.value === "factor" ? "factor" : "delta";
  });
  refs.batchValue?.addEventListener("input", (event) => {
    state.batch.value = event.target.value || "";
  });
  refs.applyStateButton?.addEventListener("click", applyStateAdjustment);
  refs.clearStateButton?.addEventListener("click", clearStateOverrides);
}

function bindMap() {
  if (state.map) {
    return;
  }
  state.map = createBrasixMap({
    elementId: "diesel-editor-map-stage",
    viewport: state.bootstrap.map_viewport,
    leafletSettings: state.bootstrap?.map_editor?.leaflet_settings || {},
  });
  fitBrasixBounds(state.map, state.bootstrap.map_viewport);
  state.map.on("click", (event) => {
    const nearest = closestCityForLatLng(event.latlng, 52);
    if (nearest) {
      selectCity(nearest.id);
    }
  });
}

async function loadBootstrap() {
  const response = await fetch("/api/editor/custos/bootstrap");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || "Falha ao carregar o Diesel.");
  }
  return data;
}

function showFatalError(message) {
  const text = String(message || "Falha ao carregar o editor de Diesel.");
  if (refs.citiesList) {
    refs.citiesList.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(text)}</div>`;
  }
  if (refs.citySummary) {
    refs.citySummary.innerHTML = `<div class="truck-gallery-empty">${escapeHtml(text)}</div>`;
  }
}

async function initialize() {
  try {
    const payload = await loadBootstrap();
    initializeState(payload);
    bindEvents();
    bindMap();
    renderAll();
  } catch (error) {
    showFatalError(error?.message || error || "Falha ao carregar o editor de Diesel.");
    console.error("Brasix Diesel editor bootstrap failure:", error);
  }
}

void initialize();