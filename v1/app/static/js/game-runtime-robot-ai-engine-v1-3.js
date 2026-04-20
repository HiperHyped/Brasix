import { brasixRobotAiProfiles } from "./game-runtime-robot-ai-profiles-v1-3.js?v=20260417-game-runtime-15";

const rulesLibrary = window.__BRASIX_ROBOT_AI_V1_3_RULES__ || {};
const profileSignalPaths = rulesLibrary.profile_signal_paths || {};

function numeric(value, fallback = 0) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function clamp(value, minValue = 0, maxValue = 1) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getDecisionDefinition(familyId, decisionId) {
  return rulesLibrary?.decision_families?.[familyId]?.decisions?.[decisionId] || null;
}

function getProfileSignalValue(profile, signalId) {
  const path = profileSignalPaths[signalId];
  if (!Array.isArray(path) || !path.length) {
    return undefined;
  }
  return path.reduce((current, key) => current?.[key], profile);
}

function resolveSignalValue(signalId, env) {
  if (!signalId) {
    return 0;
  }
  const profileValue = getProfileSignalValue(env.profile || null, signalId);
  if (profileValue !== undefined) {
    return numeric(profileValue, 0);
  }
  if (env.runtimeSignals && Object.prototype.hasOwnProperty.call(env.runtimeSignals, signalId)) {
    return numeric(env.runtimeSignals[signalId], 0);
  }
  return 0;
}

function evaluateNoise(definition, env) {
  if (!definition || typeof definition !== "object") {
    return 0;
  }
  const amplitude = Math.max(0, numeric(definition.amplitude, 0));
  if (!(amplitude > 0)) {
    return 0;
  }
  const noiseLevel = clamp(resolveSignalValue(definition.profile_signal || definition.signal || "evaluation_noise", env), 0, 1);
  if (!(noiseLevel > 0)) {
    return 0;
  }
  return ((Math.random() * 2) - 1) * noiseLevel * amplitude;
}

function evaluateWeightedTerm(term, env) {
  if (!term || typeof term !== "object") {
    return 0;
  }
  let value = numeric(term.constant, 0);
  if (term.profile_signal && term.runtime_signal) {
    value = resolveSignalValue(term.profile_signal, env) * resolveSignalValue(term.runtime_signal, env);
  } else if (term.profile_signal) {
    value = resolveSignalValue(term.profile_signal, env);
  } else if (term.runtime_signal) {
    value = resolveSignalValue(term.runtime_signal, env);
  }
  return value * numeric(term.weight, 1);
}

function evaluateFormula(formula, env) {
  if (!formula || typeof formula !== "object") {
    return 0;
  }
  if (formula.type !== "profile_weighted_score") {
    return 0;
  }
  let total = numeric(formula.base, 0);
  total += (formula.terms || []).reduce((sum, term) => sum + evaluateWeightedTerm(term, env), 0);
  total += evaluateNoise(formula.noise, env);
  const clampDefinition = formula.clamp || {};
  return clamp(
    total,
    clampDefinition.min === undefined ? 0 : numeric(clampDefinition.min, 0),
    clampDefinition.max === undefined ? 1 : numeric(clampDefinition.max, 1),
  );
}

function ensureProfile(player, tableConfig = null) {
  if (!player || player.isHuman) {
    return null;
  }
  const order = Array.isArray(tableConfig?.robotArchetypeOrder) ? tableConfig.robotArchetypeOrder.filter(Boolean) : [];
  const slotIndex = Number.isInteger(player.ai_slot_index) ? player.ai_slot_index : 0;
  const resolvedArchetypeId = player.ai_archetype_id
    || order[slotIndex % Math.max(1, order.length)]
    || Object.keys(brasixRobotAiProfiles.archetypes)[0]
    || "balanced_operator";
  const profile = brasixRobotAiProfiles.buildProfile({
    archetypeId: resolvedArchetypeId,
    overrides: deepClone(player.ai_profile_overrides || {}),
    forcedSkillPresetId: tableConfig?.forcedSkillPresetId || "",
  });
  player.ai_archetype_id = resolvedArchetypeId;
  player.ai_profile = profile;
  player.ai_profile_id = profile.id;
  player.ai_profile_label = profile.label || resolvedArchetypeId;
  player.ai_skill_preset_id = profile?.metadata?.skill_preset_id || tableConfig?.forcedSkillPresetId || "";
  return profile;
}

function applyTableConfigToPlayers(players = [], tableConfig = null) {
  let robotIndex = 0;
  (Array.isArray(players) ? players : []).forEach((player) => {
    if (!player) {
      return;
    }
    if (player.isHuman) {
      return;
    }
    player.ai_slot_index = robotIndex;
    if (!player.ai_manual_profile) {
      const order = Array.isArray(tableConfig?.robotArchetypeOrder) ? tableConfig.robotArchetypeOrder.filter(Boolean) : [];
      player.ai_archetype_id = order[robotIndex % Math.max(1, order.length)]
        || player.ai_archetype_id
        || Object.keys(brasixRobotAiProfiles.archetypes)[0]
        || "balanced_operator";
      player.ai_profile_overrides = null;
    }
    ensureProfile(player, tableConfig);
    robotIndex += 1;
  });
}

function rankCandidates(decisionFamilyId, decisionId, { player, tableConfig = null, candidates = [] } = {}) {
  const profile = ensureProfile(player, tableConfig);
  const definition = getDecisionDefinition(decisionFamilyId, decisionId);
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      ...candidate,
      aiScore: evaluateFormula(definition?.ranking_formula, {
        profile,
        runtimeSignals: candidate.runtimeSignals || {},
      }),
    }))
    .sort((left, right) => Number(right.aiScore || 0) - Number(left.aiScore || 0));
}

function chooseCandidate(decisionFamilyId, decisionId, payload = {}) {
  return rankCandidates(decisionFamilyId, decisionId, payload)[0] || null;
}

const brasixRobotAiEngine = {
  rules: rulesLibrary,
  profiles: brasixRobotAiProfiles,
  ensureProfile,
  applyTableConfigToPlayers,
  rankCandidates,
  chooseCandidate,
};

export {
  brasixRobotAiEngine,
  applyTableConfigToPlayers,
  chooseCandidate,
  ensureProfile,
  rankCandidates,
};