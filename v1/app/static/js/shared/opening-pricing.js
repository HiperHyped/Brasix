import { findPopulationBand } from "./leaflet-map.js";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback || 0);
}

function maxValue(items, selector) {
  return Math.max(0, ...items.map(selector));
}

function normalizeRange(value, minValue, maxValueValue) {
  const denominator = Number(maxValueValue) - Number(minValue);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (Number(value) - Number(minValue)) / denominator));
}

function marketFlowScore(countValue, tonnageValue, maxCount, maxTonnage, getNumber) {
  const countWeight = toNumber(getNumber("opening.market_count_weight", 0), 0);
  const volumeWeight = toNumber(getNumber("opening.market_volume_weight", 0), 0);
  const totalWeight = Math.max(countWeight + volumeWeight, 0.0001);
  const countScore = maxCount > 0 ? Number(countValue || 0) / maxCount : 0;
  const volumeScore = maxTonnage > 0 ? Number(tonnageValue || 0) / maxTonnage : 0;
  return ((countScore * countWeight) + (volumeScore * volumeWeight)) / totalWeight;
}

export function openingBandPricePath(bandId) {
  return `opening.band_base_prices_brl.${bandId}`;
}

export function buildOpeningContextState({ cities = [], populationBands = [], cityMarketStatsById = {}, getNumber }) {
  const readNumber = typeof getNumber === "function" ? getNumber : (_path, fallback = 0) => fallback;
  const populationLogValues = cities.map((city) => Math.log1p(Number(city.population_thousands || 0)));
  const populationMin = populationLogValues.length ? Math.min(...populationLogValues) : 0;
  const populationMax = populationLogValues.length ? Math.max(...populationLogValues) : 1;
  const statsItems = Object.values(cityMarketStatsById || {});
  const maxOutboundCount = maxValue(statsItems, (item) => Number(item.outboundCount || 0));
  const maxInboundCount = maxValue(statsItems, (item) => Number(item.inboundCount || 0));
  const maxOutboundTonnes = maxValue(statsItems, (item) => Number(item.outboundTonnes || 0));
  const maxInboundTonnes = maxValue(statsItems, (item) => Number(item.inboundTonnes || 0));
  const populationWeight = toNumber(readNumber("opening.population_weight", 0), 0);
  const outboundWeight = toNumber(readNumber("opening.outbound_weight", 0), 0);
  const inboundWeight = toNumber(readNumber("opening.inbound_weight", 0), 0);
  const totalWeight = Math.max(populationWeight + outboundWeight + inboundWeight, 0.0001);
  const cityMultiplierMax = toNumber(readNumber("opening.city_multiplier_max", 0), 0);

  let minOpeningPrice = Number.POSITIVE_INFINITY;
  let maxOpeningPrice = Number.NEGATIVE_INFINITY;
  const contexts = {};

  cities.forEach((city) => {
    const band = findPopulationBand(city, populationBands);
    const stats = cityMarketStatsById[city.id] || { outboundCount: 0, outboundTonnes: 0, inboundCount: 0, inboundTonnes: 0 };
    const populationComponent = normalizeRange(Math.log1p(Number(city.population_thousands || 0)), populationMin, populationMax);
    const outboundComponent = marketFlowScore(stats.outboundCount, stats.outboundTonnes, maxOutboundCount, maxOutboundTonnes, readNumber);
    const inboundComponent = marketFlowScore(stats.inboundCount, stats.inboundTonnes, maxInboundCount, maxInboundTonnes, readNumber);
    const blendedScore = (
      (populationComponent * populationWeight)
      + (outboundComponent * outboundWeight)
      + (inboundComponent * inboundWeight)
    ) / totalWeight;
    const multiplier = 1 + (cityMultiplierMax * blendedScore);
    const bandBasePrice = band ? toNumber(readNumber(openingBandPricePath(band.id), 0), 0) : 0;
    const openingPrice = bandBasePrice * multiplier;

    contexts[city.id] = {
      band,
      bandBasePrice,
      openingPrice,
      populationComponent,
      outboundComponent,
      inboundComponent,
      blendedScore,
      multiplier,
      stats,
    };

    minOpeningPrice = Math.min(minOpeningPrice, openingPrice);
    maxOpeningPrice = Math.max(maxOpeningPrice, openingPrice);
  });

  return {
    contexts,
    populationScoreRange: {
      min: populationMin,
      max: populationMax,
    },
    openingPriceRange: {
      min: Number.isFinite(minOpeningPrice) ? minOpeningPrice : 0,
      max: Number.isFinite(maxOpeningPrice) ? maxOpeningPrice : 0,
    },
  };
}