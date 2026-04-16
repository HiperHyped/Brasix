const injectedConfig = window.__BRASIX_ROBOT_AI_V1_3_CONFIG__ || {};

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return overrides === undefined ? base : overrides;
  }
  const seed = base && typeof base === "object" && !Array.isArray(base)
    ? { ...base }
    : {};
  Object.entries(overrides).forEach(([key, value]) => {
    const current = seed[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      seed[key] = deepMerge(current, value);
      return;
    }
    seed[key] = value;
  });
  return seed;
}

function mapPresetGroup(group) {
  return (group?.presets || []).reduce((accumulator, preset) => {
    if (!preset?.id) {
      return accumulator;
    }
    accumulator[preset.id] = {
      id: preset.id,
      label: preset.label || preset.id,
      description: preset.description || "",
      values: deepClone(preset.values || {}),
    };
    return accumulator;
  }, {});
}

const parameterGroups = deepClone(injectedConfig.parameter_groups || {});
const parameterDefinitions = Object.values(parameterGroups).reduce((accumulator, group) => {
  (group?.parameters || []).forEach((parameter) => {
    if (parameter?.id) {
      accumulator[parameter.id] = deepClone(parameter);
    }
  });
  return accumulator;
}, {});

const economyPresets = mapPresetGroup(parameterGroups.economy);
const networkPresets = mapPresetGroup(parameterGroups.network);
const operationsPresets = mapPresetGroup(parameterGroups.operations);
const skillPresets = mapPresetGroup(parameterGroups.skill);
const basicModes = deepClone(injectedConfig.basic_modes || {});
const difficultySkillPresets = deepClone(injectedConfig.compatibility?.difficulty_skill_presets || {});

const archetypes = Object.entries(deepClone(injectedConfig.compatibility?.archetypes || {})).reduce((accumulator, [archetypeId, seed]) => {
  accumulator[archetypeId] = {
    id: archetypeId,
    label: seed?.label || archetypeId,
    description: seed?.description || "",
    economyPresetId: seed?.economy_preset_id || "equilibrado",
    networkPresetId: seed?.network_preset_id || "equilibrado",
    operationsPresetId: seed?.operations_preset_id || "equilibrado",
    skillPresetId: seed?.skill_preset_id || "solido",
    overrides: deepClone(seed?.overrides || {}),
  };
  return accumulator;
}, {});

const GROUP_PRESET_LOOKUPS = {
  economy: economyPresets,
  network: networkPresets,
  operations: operationsPresets,
  skill: skillPresets,
};

function firstDefinedId(lookup, fallbackId = "") {
  const firstId = Object.keys(lookup || {})[0] || fallbackId;
  return lookup?.[firstId] ? firstId : fallbackId;
}

function resolveGroupPresetId(groupKey, presetId, fallbackId = "") {
  const lookup = GROUP_PRESET_LOOKUPS[groupKey] || {};
  if (presetId && lookup[presetId]) {
    return presetId;
  }
  if (fallbackId && lookup[fallbackId]) {
    return fallbackId;
  }
  return firstDefinedId(lookup, "");
}

function difficultySkillPresetId(difficultyId = "standard") {
  const presetId = difficultySkillPresets[String(difficultyId || "standard").trim()] || "solido";
  return resolveGroupPresetId("skill", presetId, "solido");
}

function basicModeById(modeId = "balanced") {
  const normalizedModeId = String(modeId || "balanced").trim();
  return basicModes[normalizedModeId]
    || basicModes.balanced
    || Object.values(basicModes)[0]
    || {
      id: "balanced",
      label: "Balanceada",
      description: "Mesa equilibrada.",
      robot_archetype_order: Object.keys(archetypes),
    };
}

function buildProfile({ archetypeId = "balanced_operator", overrides = {}, forcedSkillPresetId = "" } = {}) {
  const resolvedArchetypeId = archetypes[archetypeId] ? archetypeId : (Object.keys(archetypes)[0] || "balanced_operator");
  const archetype = archetypes[resolvedArchetypeId] || {
    id: resolvedArchetypeId,
    label: resolvedArchetypeId,
    description: "",
  };
  const economyPresetId = resolveGroupPresetId("economy", archetype.economyPresetId, "equilibrado");
  const networkPresetId = resolveGroupPresetId("network", archetype.networkPresetId, "equilibrado");
  const operationsPresetId = resolveGroupPresetId("operations", archetype.operationsPresetId, "equilibrado");
  const skillPresetId = resolveGroupPresetId("skill", forcedSkillPresetId || archetype.skillPresetId, "solido");
  const profile = {
    id: resolvedArchetypeId,
    label: archetype.label || resolvedArchetypeId,
    description: archetype.description || "",
    economy: deepClone(economyPresets[economyPresetId]?.values || {}),
    network: deepClone(networkPresets[networkPresetId]?.values || {}),
    operations: deepClone(operationsPresets[operationsPresetId]?.values || {}),
    skill: deepClone(skillPresets[skillPresetId]?.values || {}),
    metadata: {
      archetype_id: resolvedArchetypeId,
      economy_preset_id: economyPresetId,
      network_preset_id: networkPresetId,
      operations_preset_id: operationsPresetId,
      skill_preset_id: skillPresetId,
    },
  };
  return deepMerge(deepMerge(profile, deepClone(archetype.overrides || {})), overrides || {});
}

function clampParameterValue(parameterId, value) {
  const definition = parameterDefinitions[parameterId] || null;
  const numericValue = Number(value);
  if (!definition || !Number.isFinite(numericValue)) {
    return Number.isFinite(numericValue) ? numericValue : 0;
  }
  const min = Number(definition.min ?? 0);
  const max = Number(definition.max ?? 1);
  const step = Number(definition.step ?? 0.01);
  const rounded = Math.round(numericValue / step) * step;
  const precision = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  return Math.min(max, Math.max(min, Number(rounded.toFixed(precision))));
}

function buildManualRobotConfig(archetypeId = "balanced_operator", { difficultyId = "standard" } = {}) {
  const resolvedArchetypeId = archetypes[archetypeId] ? archetypeId : (Object.keys(archetypes)[0] || "balanced_operator");
  const baseProfile = buildProfile({
    archetypeId: resolvedArchetypeId,
    forcedSkillPresetId: difficultySkillPresetId(difficultyId),
  });
  return {
    archetypeId: resolvedArchetypeId,
    overrides: {
      economy: deepClone(baseProfile.economy || {}),
      network: deepClone(baseProfile.network || {}),
      operations: deepClone(baseProfile.operations || {}),
      skill: deepClone(baseProfile.skill || {}),
      metadata: {
        ...(deepClone(baseProfile.metadata || {}) || {}),
        setup_customized: true,
        setup_archetype_id: resolvedArchetypeId,
      },
    },
  };
}

function normalizeManualRobotConfig(rawConfig = null, { fallbackArchetypeId = "balanced_operator", difficultyId = "standard" } = {}) {
  const fallbackId = archetypes[fallbackArchetypeId] ? fallbackArchetypeId : (Object.keys(archetypes)[0] || "balanced_operator");
  if (!rawConfig || typeof rawConfig !== "object") {
    return buildManualRobotConfig(fallbackId, { difficultyId });
  }
  const requestedArchetypeId = String(rawConfig.archetypeId || rawConfig.profileId || rawConfig.id || fallbackId).trim();
  const resolvedArchetypeId = archetypes[requestedArchetypeId] ? requestedArchetypeId : fallbackId;
  const seeded = buildManualRobotConfig(resolvedArchetypeId, { difficultyId });
  const source = rawConfig.overrides && typeof rawConfig.overrides === "object"
    ? rawConfig.overrides
    : rawConfig;
  ["economy", "network", "operations", "skill"].forEach((groupKey) => {
    const sourceGroup = source[groupKey] && typeof source[groupKey] === "object" ? source[groupKey] : {};
    Object.keys(seeded.overrides[groupKey] || {}).forEach((parameterId) => {
      if (sourceGroup[parameterId] === undefined) {
        return;
      }
      seeded.overrides[groupKey][parameterId] = clampParameterValue(parameterId, sourceGroup[parameterId]);
    });
  });
  seeded.overrides.metadata = {
    ...(seeded.overrides.metadata || {}),
    ...(source.metadata && typeof source.metadata === "object" ? deepClone(source.metadata) : {}),
    setup_customized: true,
    setup_archetype_id: resolvedArchetypeId,
  };
  return seeded;
}

function normalizeManualRobotConfigs(rawConfigs = null, slotCount = 0, { fallbackOrder = [], difficultyId = "standard" } = {}) {
  const normalized = {};
  const targetSlotCount = Math.max(0, Number(slotCount || 0));
  const applyEntry = (slotIndex, value) => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= targetSlotCount) {
      return;
    }
    const fallbackArchetypeId = fallbackOrder[slotIndex % Math.max(1, fallbackOrder.length)] || Object.keys(archetypes)[0] || "balanced_operator";
    normalized[slotIndex] = normalizeManualRobotConfig(value, {
      fallbackArchetypeId,
      difficultyId,
    });
  };
  if (Array.isArray(rawConfigs)) {
    rawConfigs.forEach((value, index) => applyEntry(index, value));
    return normalized;
  }
  if (rawConfigs && typeof rawConfigs === "object") {
    Object.entries(rawConfigs).forEach(([key, value]) => applyEntry(Number(key), value));
  }
  return normalized;
}

function buildTableConfig({ modeId = "balanced", difficultyId = "standard" } = {}) {
  const mode = basicModeById(modeId);
  const robotArchetypeOrder = Array.isArray(mode.robot_archetype_order) && mode.robot_archetype_order.length
    ? mode.robot_archetype_order.filter((entry) => archetypes[entry])
    : Object.keys(archetypes);
  return {
    id: `brasix-ai-v1-3-${mode.id || modeId}`,
    label: mode.label || "Balanceada",
    description: mode.description || "",
    basicModeId: mode.id || modeId,
    difficultyId,
    robotArchetypeOrder,
    forcedSkillPresetId: difficultySkillPresetId(difficultyId),
  };
}

function archetypeOptions() {
  return Object.values(archetypes).map((entry) => ({
    id: entry.id,
    label: entry.label || entry.id,
    description: entry.description || "",
  }));
}

const brasixRobotAiProfiles = {
  version: injectedConfig.version || "brasix-robot-ai-v1-3",
  description: injectedConfig.description || "",
  parameterGroups,
  parameterDefinitions,
  economyPresets,
  networkPresets,
  operationsPresets,
  skillPresets,
  basicModes,
  difficultySkillPresets,
  archetypes,
  buildProfile,
  buildManualRobotConfig,
  normalizeManualRobotConfig,
  normalizeManualRobotConfigs,
  buildTableConfig,
  archetypeOptions,
  basicModeById,
  difficultySkillPresetId,
};

export {
  brasixRobotAiProfiles,
  buildManualRobotConfig,
  buildProfile,
  buildTableConfig,
  normalizeManualRobotConfig,
  normalizeManualRobotConfigs,
};