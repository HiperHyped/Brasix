function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

const LOGISTICS_TYPE_BUCKETS = {
  granel_seco: "bulk",
  granel_mineral: "bulk",
  cana_in_natura: "bulk",
  granel_liquido: "tank",
  granel_gasoso_pressurizado: "tank",
  carga_geral_paletizada: "palletized",
  carga_geral_perecivel: "palletized",
  carga_valiosa: "palletized",
  transporte_veiculos: "palletized",
  frigorificado: "refrigerated",
  animais_vivos: "live",
  carga_aberta: "general",
};

export function freightSpecializationBucketForProduct(product = null) {
  const normalizedProduct = product || {};
  const logisticsTypeId = normalizeText(normalizedProduct.logistics_type_id);

  if (normalizedProduct.temperature_control_required || /frigor|refrig/.test(logisticsTypeId)) {
    return "refrigerated";
  }
  if (/animais_vivos|carga_viva|live|animal/.test(logisticsTypeId)) {
    return "live";
  }
  if (normalizedProduct.hazardous || /perigos|hazard|quim|gas_comprimido/.test(logisticsTypeId)) {
    return "hazardous";
  }

  if (LOGISTICS_TYPE_BUCKETS[logisticsTypeId]) {
    return LOGISTICS_TYPE_BUCKETS[logisticsTypeId];
  }
  if (/tanque|liquid|gas|granel_liquido/.test(logisticsTypeId)) {
    return "tank";
  }
  if (/granel/.test(logisticsTypeId)) {
    return "bulk";
  }
  if (/palet|carga_geral|container|bau|sider|cegonh|valiosa/.test(logisticsTypeId)) {
    return "palletized";
  }
  return "general";
}

export function freightValueClassBucket(valueClass) {
  const normalizedValueClass = normalizeText(valueClass);
  if (normalizedValueClass === "medium") {
    return "medium";
  }
  if (["high", "premium", "strategic"].includes(normalizedValueClass)) {
    return "high";
  }
  return null;
}