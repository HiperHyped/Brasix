let appState = {
  bootstrap: null,
  selectedCommodityId: "all",
  selectedStateCode: "all",
  selectedCityId: null,
  highlightedPath: null,
};

function numberFormatter(maximumFractionDigits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits });
}

function formatValue(value, unit) {
  const formatter = numberFormatter(value >= 100 ? 0 : 1);
  return `${formatter.format(value)} ${unit}`;
}

function commodityById() {
  return Object.fromEntries(appState.bootstrap.commodities.map((item) => [item.id, item]));
}

function cityById() {
  return Object.fromEntries(appState.bootstrap.cities.map((item) => [item.id, item]));
}

function visibleCities() {
  return appState.bootstrap.cities.filter((city) => {
    if (appState.selectedStateCode !== "all" && city.state_code !== appState.selectedStateCode) {
      return false;
    }
    if (appState.selectedCommodityId === "all") {
      return true;
    }
    return (city.commodity_values[appState.selectedCommodityId] || 0) > 0;
  });
}

function rankingCities() {
  const cities = visibleCities().slice();
  if (appState.selectedCommodityId === "all") {
    return cities.sort((left, right) => {
      const leftValue = left.top_commodities[0]?.value || 0;
      const rightValue = right.top_commodities[0]?.value || 0;
      return rightValue - leftValue;
    });
  }
  return cities.sort(
    (left, right) => (right.commodity_values[appState.selectedCommodityId] || 0) - (left.commodity_values[appState.selectedCommodityId] || 0),
  );
}

function currentCommodity() {
  if (appState.selectedCommodityId === "all") {
    return null;
  }
  return commodityById()[appState.selectedCommodityId] || null;
}

function buildSelectOptions() {
  const commoditySelect = document.getElementById("commodity-select");
  const stateSelect = document.getElementById("state-select");
  const routeOrigin = document.getElementById("route-origin");
  const routeDestination = document.getElementById("route-destination");

  commoditySelect.innerHTML = "";
  stateSelect.innerHTML = "";
  routeOrigin.innerHTML = "";
  routeDestination.innerHTML = "";

  const commodityOptions = [{ id: "all", name: "Visao geral", icon: "🧭" }, ...appState.bootstrap.commodities];
  commodityOptions.forEach((commodity) => {
    const option = document.createElement("option");
    option.value = commodity.id;
    option.textContent = commodity.id === "all" ? commodity.name : `${commodity.icon} ${commodity.name}`;
    commoditySelect.appendChild(option);
  });

  const allStatesOption = document.createElement("option");
  allStatesOption.value = "all";
  allStatesOption.textContent = "Todas as UFs";
  stateSelect.appendChild(allStatesOption);

  appState.bootstrap.summary.states.forEach((stateCode) => {
    const option = document.createElement("option");
    option.value = stateCode;
    option.textContent = stateCode;
    stateSelect.appendChild(option);
  });

  appState.bootstrap.cities.forEach((city) => {
    const originOption = document.createElement("option");
    originOption.value = city.id;
    originOption.textContent = city.label;
    routeOrigin.appendChild(originOption);

    const destinationOption = document.createElement("option");
    destinationOption.value = city.id;
    destinationOption.textContent = city.label;
    routeDestination.appendChild(destinationOption);
  });

  commoditySelect.value = appState.selectedCommodityId;
  stateSelect.value = appState.selectedStateCode;
}

function renderMetrics() {
  const metrics = document.getElementById("summary-metrics");
  const cities = visibleCities();
  const commodity = currentCommodity();
  const ranked = rankingCities();
  const topCity = ranked[0] || null;

  let totalValue = 0;
  if (commodity) {
    totalValue = cities.reduce((accumulator, city) => accumulator + (city.commodity_values[commodity.id] || 0), 0);
  }

  const cards = [
    {
      value: numberFormatter(0).format(cities.length),
      label: "cidades visiveis",
    },
    {
      value: numberFormatter(0).format(appState.bootstrap.summary.route_count),
      label: "rotas salvas",
    },
    {
      value: commodity ? formatValue(totalValue, commodity.unit) : numberFormatter(0).format(appState.bootstrap.summary.commodity_count),
      label: commodity ? `${commodity.name.toLowerCase()} no recorte` : "commodities mapeadas",
    },
    {
      value: topCity ? topCity.name : "-",
      label: commodity ? "lider atual" : "cidade em destaque",
    },
  ];

  metrics.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <strong>${card.value}</strong>
          <span>${card.label}</span>
        </article>
      `,
    )
    .join("");
}

function renderRanking() {
  const ranking = document.getElementById("ranking-list");
  const commodity = currentCommodity();
  const commodities = commodityById();

  ranking.innerHTML = rankingCities()
    .slice(0, 10)
    .map((city) => {
      if (commodity) {
        const value = city.commodity_values[commodity.id] || 0;
        return `<li><strong>${city.label}</strong><br />${commodity.icon} ${formatValue(value, commodity.unit)}</li>`;
      }

      const topCommodity = city.top_commodities[0];
      if (!topCommodity) {
        return `<li><strong>${city.label}</strong><br />Sem producao registrada</li>`;
      }
      const commodityMeta = commodities[topCommodity.id];
      return `<li><strong>${city.label}</strong><br />${commodityMeta.icon} ${commodityMeta.name}: ${formatValue(topCommodity.value, commodityMeta.unit)}</li>`;
    })
    .join("");
}

function buildRouteLineTraces(routeEdges, routeColor, width, dash) {
  const cities = cityById();
  return routeEdges.flatMap((edge) => {
    const fromCity = cities[edge.from_city_id];
    const toCity = cities[edge.to_city_id];
    if (!fromCity || !toCity) {
      return [];
    }
    return [
      {
        type: "scattergeo",
        mode: "lines",
        lat: [fromCity.latitude, toCity.latitude],
        lon: [fromCity.longitude, toCity.longitude],
        line: { color: routeColor, width, dash },
        hoverinfo: "skip",
        showlegend: false,
      },
    ];
  });
}

function mapTitleAndSubtitle() {
  const commodity = currentCommodity();
  if (!commodity) {
    return {
      title: "Cidades representativas",
      subtitle: "Visao geral por cidade, com destaque para a commodity dominante em cada ponto.",
    };
  }
  return {
    title: `${commodity.icon} ${commodity.name}`,
    subtitle: `Marcadores dimensionados pela producao de ${commodity.name.toLowerCase()} em cada cidade visivel.`,
  };
}

function renderMap() {
  const cities = visibleCities();
  const commodities = commodityById();
  const routeEdges = appState.bootstrap.routes || [];
  const selectedCommodity = currentCommodity();
  const titleCopy = mapTitleAndSubtitle();
  const selectedCity = appState.selectedCityId ? cityById()[appState.selectedCityId] : null;

  document.getElementById("map-title").textContent = titleCopy.title;
  document.getElementById("map-subtitle").textContent = titleCopy.subtitle;

  const markerValues = cities.map((city) => {
    if (selectedCommodity) {
      return city.commodity_values[selectedCommodity.id] || 0;
    }
    return city.top_commodities[0]?.value || 1;
  });

  const maxValue = Math.max(...markerValues, 1);
  const markerSizes = markerValues.map((value) => 10 + (value / maxValue) * 28);
  const markerColors = cities.map((city) => {
    if (selectedCommodity) {
      return selectedCommodity.color;
    }
    const dominant = city.dominant_commodity_id ? commodities[city.dominant_commodity_id] : null;
    return dominant?.color || "#8b5e34";
  });

  const hoverText = cities.map((city) => {
    if (selectedCommodity) {
      const value = city.commodity_values[selectedCommodity.id] || 0;
      return [
        `<b>${city.label}</b>`,
        city.source_region_name,
        `${selectedCommodity.icon} ${selectedCommodity.name}: ${formatValue(value, selectedCommodity.unit)}`,
        `Populacao da regiao-base: ${numberFormatter(0).format(city.population_thousands)} mil hab.`,
      ].join("<br />");
    }
    const top = city.top_commodities[0];
    if (!top) {
      return [`<b>${city.label}</b>`, city.source_region_name].join("<br />");
    }
    const commodity = commodities[top.id];
    return [
      `<b>${city.label}</b>`,
      city.source_region_name,
      `Destaque: ${commodity.icon} ${commodity.name} (${formatValue(top.value, commodity.unit)})`,
      `${city.commodity_count} commodities registradas`,
    ].join("<br />");
  });

  const traces = [
    ...buildRouteLineTraces(routeEdges, "rgba(122, 96, 57, 0.18)", 1.4, "dot"),
    {
      type: "scattergeo",
      mode: "markers",
      lat: cities.map((city) => city.latitude),
      lon: cities.map((city) => city.longitude),
      customdata: cities.map((city) => city.id),
      text: hoverText,
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size: markerSizes,
        color: markerColors,
        opacity: 0.9,
        line: {
          color: "rgba(47, 36, 22, 0.55)",
          width: 0.8,
        },
      },
      showlegend: false,
    },
  ];

  if (appState.highlightedPath && appState.highlightedPath.city_ids.length > 1) {
    const highlightedEdges = [];
    for (let index = 0; index < appState.highlightedPath.city_ids.length - 1; index += 1) {
      highlightedEdges.push({
        from_city_id: appState.highlightedPath.city_ids[index],
        to_city_id: appState.highlightedPath.city_ids[index + 1],
      });
    }
    traces.push(...buildRouteLineTraces(highlightedEdges, "#c55a11", 4, "solid"));
  }

  if (selectedCity) {
    traces.push({
      type: "scattergeo",
      mode: "markers",
      lat: [selectedCity.latitude],
      lon: [selectedCity.longitude],
      hoverinfo: "skip",
      marker: {
        size: 36,
        color: "rgba(255,255,255,0)",
        line: { color: "#2f2416", width: 2.4 },
      },
      showlegend: false,
    });
  }

  Plotly.newPlot(
    "map-stage",
    traces,
    {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      geo: {
        projection: { type: "mercator" },
        showland: true,
        landcolor: "#d7caa5",
        countrycolor: "rgba(86, 61, 33, 0.32)",
        coastlinecolor: "rgba(86, 61, 33, 0.24)",
        coastlinewidth: 0.5,
        showcountries: true,
        showocean: true,
        oceancolor: "#c8dfeb",
        lakecolor: "#c8dfeb",
        showlakes: true,
        lataxis: {
          range: [appState.bootstrap.map_config.lat_min, appState.bootstrap.map_config.lat_max],
        },
        lonaxis: {
          range: [appState.bootstrap.map_config.lon_min, appState.bootstrap.map_config.lon_max],
        },
        bgcolor: "rgba(0,0,0,0)",
      },
    },
    { displayModeBar: false, responsive: true },
  );

  const mapStage = document.getElementById("map-stage");
  mapStage.on("plotly_click", (event) => {
    const cityId = event.points?.[0]?.customdata;
    if (!cityId) {
      return;
    }
    appState.selectedCityId = cityId;
    renderDetail();
    renderMap();
  });
}

function renderDetail() {
  const container = document.getElementById("city-detail");
  const cities = cityById();
  const commodities = commodityById();
  let city = appState.selectedCityId ? cities[appState.selectedCityId] : null;

  if (!city) {
    city = rankingCities()[0] || appState.bootstrap.cities[0];
    appState.selectedCityId = city?.id || null;
  }

  if (!city) {
    container.innerHTML = `<p class="empty-state">Nenhuma cidade encontrada.</p>`;
    return;
  }

  const topRows = city.top_commodities.length
    ? city.top_commodities
        .map(
          (item) => `
            <div class="commodity-row">
              <span class="icon">${item.icon}</span>
              <span class="name">${item.name}</span>
              <span class="value">${formatValue(item.value, item.unit)}</span>
            </div>
          `,
        )
        .join("")
    : `<p class="empty-state">Sem commodities com valor positivo nesta cidade.</p>`;

  const dominant = city.dominant_commodity_id ? commodities[city.dominant_commodity_id] : null;
  container.innerHTML = `
    <div class="detail-title">
      <h3>${city.label}</h3>
      <p class="detail-kicker">${city.source_region_name}</p>
    </div>
    <div class="badge-row">
      <span class="mini-badge">UF ${city.state_code}</span>
      <span class="mini-badge">${numberFormatter(0).format(city.population_thousands)} mil hab.</span>
      <span class="mini-badge">${city.commodity_count} commodities</span>
    </div>
    <p class="body-copy compact">
      ${dominant ? `${dominant.icon} Destaque atual: <strong>${dominant.name}</strong>.` : "Sem destaque dominante no momento."}
      Este ponto ja esta pronto para ser usado como no de rota no jogo.
    </p>
    <div class="commodity-list">${topRows}</div>
  `;
}

function renderRouteStatus(message) {
  document.getElementById("route-status").innerHTML = message;
}

async function traceRoute() {
  const origin = document.getElementById("route-origin").value;
  const destination = document.getElementById("route-destination").value;
  if (!origin || !destination) {
    renderRouteStatus("Selecione uma cidade de origem e uma de destino.");
    return;
  }
  if (origin === destination) {
    renderRouteStatus("Origem e destino precisam ser diferentes.");
    return;
  }

  const response = await fetch(`/api/routes/path?start_city_id=${encodeURIComponent(origin)}&end_city_id=${encodeURIComponent(destination)}`);
  const payload = await response.json();
  if (!response.ok) {
    appState.highlightedPath = null;
    renderRouteStatus(payload.detail || "Nao foi possivel tracar a rota.");
    renderMap();
    return;
  }

  appState.highlightedPath = payload;
  const cities = cityById();
  const cityNames = payload.city_ids.map((cityId) => cities[cityId]?.label || cityId).join(" -> ");
  renderRouteStatus(
    `<strong>${numberFormatter(1).format(payload.distance_km)} km</strong><br />${payload.steps} trechos no caminho calculado.<br />${cityNames}`,
  );
  renderMap();
}

function bindControls() {
  document.getElementById("commodity-select").addEventListener("change", (event) => {
    appState.selectedCommodityId = event.target.value;
    appState.highlightedPath = null;
    renderMetrics();
    renderRanking();
    renderDetail();
    renderMap();
  });

  document.getElementById("state-select").addEventListener("change", (event) => {
    appState.selectedStateCode = event.target.value;
    appState.highlightedPath = null;
    renderMetrics();
    renderRanking();
    renderDetail();
    renderMap();
  });

  document.getElementById("route-button").addEventListener("click", async () => {
    await traceRoute();
  });
}

async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  return response.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  appState.bootstrap = await loadBootstrap();
  appState.selectedCommodityId = "soja";
  buildSelectOptions();
  bindControls();
  renderMetrics();
  renderRanking();
  renderDetail();
  renderMap();

  const routeButton = document.getElementById("route-button");
  if ((appState.bootstrap.routes || []).length === 0) {
    routeButton.disabled = true;
    renderRouteStatus(
      "Nenhuma rota foi desenhada ainda. A estrutura ja esta pronta em <strong>data/routes.json</strong> para a proxima fase do projeto.",
    );
  }
});
