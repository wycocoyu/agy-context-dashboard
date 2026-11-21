// Pure context-composition transforms for the single-session context view
// (issue #34). No credentials, prompts, or message text enter the public
// result: per-step usage buckets and host token groups contribute sanitized numbers only.
import { tokenCount } from './metrics.mjs';

const cleanText = (value, max = 160) => typeof value === 'string'
  ? value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, max)
  : '';

const HOST_GROUP_IDS = new Map([
  ['TOKEN_TYPE_SYSTEM_PROMPT', 'systemPrompt'],
  ['system prompt', 'systemPrompt'],
  ['TOKEN_TYPE_MCP_TOOLS', 'mcpTools'],
  ['mcp tools', 'mcpTools'],
  ['TOKEN_TYPE_SUBAGENTS', 'subagents'],
  ['subagents', 'subagents'],
  ['TOKEN_TYPE_SKILLS', 'skills'],
  ['skills', 'skills'],
  ['TOKEN_TYPE_PLUGINS', 'plugins'],
  ['plugins', 'plugins'],
  ['TOKEN_TYPE_RULES', 'rules'],
  ['rules', 'rules'],
  ['TOKEN_TYPE_TOOLS', 'tools'],
  ['tools', 'tools'],
  ['TOKEN_TYPE_CHAT_MESSAGES', 'chatMessages'],
  ['chat messages', 'chatMessages'],
]);

const HOST_GROUP_ORDER = ['systemPrompt', 'mcpTools', 'subagents', 'skills', 'plugins', 'rules', 'tools', 'chatMessages'];

function sanitizeDrilldownChildren(items, depth = 0) {
  if (!Array.isArray(items) || depth > 2) return [];
  return items
    .map(item => {
      const name = cleanText(item?.name, 200);
      const tokens = tokenCount(item?.numTokens ?? item?.tokens);
      if (!name || tokens === null) return null;
      const children = depth < 1 ? sanitizeDrilldownChildren(item?.children, depth + 1) : [];
      return { name, tokens, ...(children.length ? { children } : {}) };
    })
    .filter(Boolean)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, depth === 0 ? 128 : 64);
}

// The customization layer (rules/skills/subagents/MCP tool definitions) is exact
// from GetTokenBase; dynamic conversation content is an estimate unless
// StreamAgentStateUpdates provides authoritative per-category host tokenGroups.
export function tokenBaseMetrics(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const base = response.customizationTokenBase;
  if (!base || typeof base !== 'object' || Array.isArray(base)) return null;
  const totalTokens = tokenCount(base.totalTokens);
  if (totalTokens === null) return null;
  const rawGroups = Array.isArray(base.groups) ? base.groups : [];
  const groups = rawGroups
    .map(group => ({ name: cleanText(group?.name, 64), tokens: tokenCount(group?.numTokens) }))
    .filter(group => group.name && group.tokens !== null).slice(0, 16);
  const drilldown = rawGroups
    .map(group => {
      const name = cleanText(group?.name, 64);
      const tokens = tokenCount(group?.numTokens);
      if (!name || tokens === null) return null;
      const type = cleanText(group?.type, 48) || null;
      const id = HOST_GROUP_IDS.get(type || '') || HOST_GROUP_IDS.get(name.toLowerCase()) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const children = sanitizeDrilldownChildren(group?.children, 0);
      return { id, name, type, tokens, children };
    })
    .filter(Boolean).slice(0, 16);
  return {
    totalTokens,
    budget: tokenCount(response.customizationBudget),
    remainingBudget: tokenCount(response.remainingBudget),
    rulesBudget: tokenCount(response.rulesBudget),
    remainingRulesBudget: tokenCount(response.remainingRulesBudget),
    groups,
    drilldown,
    source: 'GetTokenBase',
  };
}

/**
 * Normalize StreamAgentStateUpdates 1st-frame contextWindowUsage.tokenGroups[]
 * into the authoritative 8-category host breakdown.
 */
export function hostContextMetrics(input) {
  const root = input?.contextWindowUsage && typeof input.contextWindowUsage === 'object'
    ? input.contextWindowUsage
    : input?.update?.contextWindowUsage && typeof input.update.contextWindowUsage === 'object'
      ? input.update.contextWindowUsage
      : input;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const usedTokens = tokenCount(root.estimatedTokensUsed ?? root.usedTokens);
  const maxTokens = tokenCount(root.maxContextTokens ?? root.maxTokens);
  if (usedTokens === null || !maxTokens || !Array.isArray(root.tokenGroups)) return null;

  const byId = new Map();
  for (const raw of root.tokenGroups) {
    if (!raw || typeof raw !== 'object') continue;
    const type = cleanText(raw.type, 48);
    const name = cleanText(raw.name, 64);
    const id = HOST_GROUP_IDS.get(type) || HOST_GROUP_IDS.get(name.toLowerCase());
    const tokens = tokenCount(raw.numTokens ?? raw.tokens);
    if (!id || tokens === null) continue;
    const prev = byId.get(id);
    byId.set(id, {
      id,
      name: name || id,
      type: type || null,
      source: cleanText(raw.source, 48) || null,
      tokens: (prev?.tokens || 0) + tokens,
    });
  }
  if (!byId.size) return null;

  const groups = HOST_GROUP_ORDER.map(id => byId.get(id)).filter(Boolean);
  return {
    usedTokens,
    maxTokens,
    generatorMetadataIndex: tokenCount(root.generatorMetadataIndex),
    lastStepIndex: tokenCount(root.lastStepIndex),
    groups,
    source: 'StreamAgentStateUpdates',
  };
}

// Dynamic-layer buckets from per-step usage metadata, classified with the same
// step-type semantics as transcript.mjs. Scoped strictly to steps after the
// latest compaction/checkpoint so active window ratios are not skewed by
// pre-compaction turns. In Antigravity 2.34+, only PLANNER_RESPONSE carries
// modelUsage reliably (while CHECKPOINT/COMPACTION inputTokens reflect summary
// prompts), so only genuine USER_INPUT or tool steps set hasNonAssistant.
function stepBuckets(steps) {
  const out = { user: 0, thinking: 0, reply: 0, tool: 0, system: 0, hasNonAssistant: false, hasAssistant: false };
  if (!Array.isArray(steps)) return out;
  let start = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (/COMPACTION|CHECKPOINT/.test(String(steps[i]?.type || ''))) {
      start = i + 1;
      break;
    }
  }
  for (let i = start; i < steps.length; i++) {
    const step = steps[i];
    const usage = step?.metadata?.modelUsage;
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) continue;
    const type = String(step?.type || '');
    const input = tokenCount(usage.inputTokens) ?? 0, thinking = tokenCount(usage.thinkingOutputTokens) ?? 0;
    const reply = tokenCount(usage.responseOutputTokens) ?? Math.max(0, (tokenCount(usage.outputTokens) ?? 0) - thinking);
    if (!(input || thinking || reply)) continue;
    if (/USER_INPUT/.test(type)) { out.user += input; out.hasNonAssistant = out.hasNonAssistant || input > 0; }
    else if (/PLANNER_RESPONSE/.test(type)) { out.thinking += thinking; out.reply += reply; out.hasAssistant = out.hasAssistant || thinking > 0 || reply > 0; }
    else if (/COMPACTION|CHECKPOINT|SYSTEM_MESSAGE/.test(type)) { out.system += input; }
    else { out.tool += input; out.hasNonAssistant = out.hasNonAssistant || input > 0; }
  }
  return out;
}

function dynamicBuckets({ steps = [], transcript = null } = {}) {
  const buckets = stepBuckets(steps);
  if (buckets.hasNonAssistant) {
    return { source: 'steps', complete: true, parts: [['user', buckets.user], ['thinking', buckets.thinking], ['reply', buckets.reply], ['tool', buckets.tool], ['system', buckets.system]] };
  }
  const hasTranscript = Boolean(transcript && ['ready', 'partial'].includes(transcript.status) && transcript.matchedSteps > 0);
  if (hasTranscript) {
    // Combine exact planner thinking/reply buckets with logged-text user/tool/system
    // estimates when non-assistant steps lack per-step modelUsage.
    if (buckets.hasAssistant) {
      return { source: 'hybrid', complete: true, parts: [['user', transcript.userTokens], ['thinking', buckets.thinking], ['reply', buckets.reply], ['tool', transcript.toolTokens], ['system', transcript.systemTokens]] };
    }
    // Logged-text classification cannot split thinking from replies; the merged
    // assistant segment is labelled accordingly by the renderer.
    return { source: 'transcript', complete: true, parts: [['user', transcript.userTokens], ['assistant', transcript.assistantTokens], ['tool', transcript.toolTokens], ['system', transcript.systemTokens]] };
  }
  if (buckets.hasAssistant) {
    return { source: 'steps', complete: false, parts: [['thinking', buckets.thinking], ['reply', buckets.reply]] };
  }
  return { source: null, complete: false, parts: [] };
}

function compositionSegments(usedTokens, maxTokens, dynamic, tokenBase = null) {
  const segments = [];
  const custom = tokenBase ? tokenBase.totalTokens : null;
  const parts = Array.isArray(dynamic?.parts) ? dynamic.parts : [];
  const sum = parts.reduce((n, [, v]) => n + Math.max(0, v), 0);
  if (custom === null && sum === 0) {
    segments.push({ id: 'remaining', tokens: Math.max(0, maxTokens - usedTokens), fraction: Math.max(0, 1 - Math.min(1, usedTokens / maxTokens)) });
    return segments;
  }
  const totalScale = usedTokens > maxTokens ? maxTokens / usedTokens : 1;
  const customBudget = custom !== null ? Math.min(custom, usedTokens) : 0;
  if (custom !== null) segments.push({ id: 'customization', tokens: custom, fraction: (customBudget / maxTokens) * totalScale });
  const room = Math.max(0, usedTokens - customBudget);
  if (dynamic?.complete) {
    const scale = sum > 0 ? room / sum : 0;
    for (const [id, value] of parts) if (value > 0) segments.push({ id, tokens: value, fraction: ((value * scale) / maxTokens) * totalScale });
    if (sum === 0 && room > 0) segments.push({ id: 'other', tokens: room, fraction: (room / maxTokens) * totalScale });
  } else {
    const scale = sum > room && sum > 0 ? room / sum : 1;
    for (const [id, value] of parts) if (value > 0) segments.push({ id, tokens: value, fraction: ((value * scale) / maxTokens) * totalScale });
    const unattributed = Math.max(0, room - sum * scale);
    if (unattributed > 0) segments.push({ id: 'other', tokens: Math.round(unattributed), fraction: (unattributed / maxTokens) * totalScale });
  }
  const filled = segments.reduce((n, s) => n + s.fraction, 0);
  segments.push({ id: 'remaining', tokens: Math.max(0, maxTokens - usedTokens), fraction: Math.max(0, 1 - filled) });
  return segments;
}

// Per-request input-token trend (Total basis: uncached input + cache read +
// cache write), matching the requestCacheMetrics interface in metrics.mjs.
// Markers are COMPACTION/CONTEXT_COMPACTION/CHECKPOINT steps anchored to the
// first request whose earliest step index follows the marker.
function trendMetrics(steps = [], generators = [], maxPoints = 96) {
  const points = [], seen = new Set();
  if (Array.isArray(generators)) generators.forEach((generator, index) => {
    const usage = generator?.chatModel?.usage;
    if (!usage || typeof usage !== 'object') return;
    const input = tokenCount(usage.inputTokens);
    if (input === null) return;
    const read = usage.cacheReadTokens === undefined ? 0 : tokenCount(usage.cacheReadTokens);
    const write = usage.cacheWriteTokens === undefined ? 0 : tokenCount(usage.cacheWriteTokens);
    if (read === null || write === null) return;
    const total = tokenCount(input + read + write);
    if (total === null) return;
    // Mirror trajectoryMetrics de-duplication: one usage record per request.
    const id = usage.responseId ? `response:${usage.apiProvider || ''}:${usage.responseId}` : usage.messageId ? `message:${usage.messageId}` : `index:${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    const indices = Array.isArray(generator.stepIndices) ? generator.stepIndices.filter(n => Number.isInteger(n) && n >= 0) : [];
    points.push({ inputTokens: total, anchor: indices.length ? Math.min(...indices) : null });
  });
  const markers = [];
  if (Array.isArray(steps)) steps.forEach((step, index) => {
    const type = String(step?.type || '');
    const kind = /COMPACTION/.test(type) ? 'compaction' : /CHECKPOINT/.test(type) ? 'checkpoint' : null;
    if (!kind) return;
    let at = points.findIndex(point => point.anchor !== null && point.anchor > index);
    if (at === -1) at = points.length;
    markers.push({ pointIndex: at, kind, before: at > 0 ? points[at - 1].inputTokens : null, after: at < points.length ? points[at].inputTokens : null });
  });
  const offset = Math.max(0, points.length - maxPoints);
  return {
    points: points.slice(offset).map(point => ({ inputTokens: point.inputTokens })),
    markers: markers.filter(marker => marker.pointIndex >= offset).map(marker => ({ pointIndex: marker.pointIndex - offset, kind: marker.kind, before: marker.before, after: marker.after })),
    totalRequests: points.length, totalMarkers: markers.length,
  };
}

function hostSegments(usedTokens, maxTokens, hostUsage) {
  const segments = [];
  const totalScale = usedTokens > maxTokens ? maxTokens / usedTokens : 1;
  for (const group of hostUsage.groups) {
    if (group.tokens > 0) {
      segments.push({ id: group.id, tokens: group.tokens, fraction: (group.tokens / maxTokens) * totalScale });
    }
  }
  const accounted = hostUsage.groups.reduce((n, g) => n + g.tokens, 0);
  if (usedTokens > accounted) {
    const other = usedTokens - accounted;
    segments.push({ id: 'other', tokens: other, fraction: (other / maxTokens) * totalScale });
  }
  const filled = segments.reduce((n, s) => n + s.fraction, 0);
  segments.push({ id: 'remaining', tokens: Math.max(0, maxTokens - usedTokens), fraction: Math.max(0, 1 - filled) });
  return segments;
}

function buildCustomizationPayload(tokenBase) {
  if (!tokenBase) return { available: false, tokens: null, budget: null, remainingBudget: null, rulesBudget: null, remainingRulesBudget: null, groups: null, drilldown: null };
  return {
    available: true,
    tokens: tokenBase.totalTokens,
    budget: tokenBase.budget,
    remainingBudget: tokenBase.remainingBudget,
    rulesBudget: tokenBase.rulesBudget ?? null,
    remainingRulesBudget: tokenBase.remainingRulesBudget ?? null,
    groups: tokenBase.groups,
    drilldown: Array.isArray(tokenBase.drilldown) ? tokenBase.drilldown : null,
  };
}

function chatSubBreakdown(parts, chatTokens) {
  if (!Array.isArray(parts) || !chatTokens || chatTokens <= 0) return null;
  const chatParts = parts.filter(([id, val]) => ['user', 'thinking', 'reply', 'assistant', 'tool'].includes(id) && val > 0);
  const sum = chatParts.reduce((n, [, val]) => n + val, 0);
  if (!sum) return null;
  return chatParts.map(([id, val]) => ({ id, tokens: Math.round((val / sum) * chatTokens), share: val / sum }));
}

export function compositionMetrics({ context = null, steps = [], generators = [], transcript = null, tokenBase = null, hostUsage = null, maxTrendPoints = 96 } = {}) {
  if (!context || typeof context !== 'object') return null;
  const usedTokens = tokenCount(context.usedTokens), maxTokens = tokenCount(context.maxTokens);
  if (usedTokens === null || !maxTokens) return null;
  const dynamic = dynamicBuckets({ steps, transcript });
  const base = {
    version: 1, usedTokens, maxTokens, source: dynamic.source, dynamicSource: dynamic.source, complete: dynamic.complete, parts: dynamic.parts,
    customization: buildCustomizationPayload(tokenBase),
    segments: compositionSegments(usedTokens, maxTokens, dynamic, tokenBase),
    trend: trendMetrics(steps, generators, maxTrendPoints),
  };
  return hostUsage ? attachHostContextUsage(base, hostUsage) : base;
}

// Lazy enrichment: the composition is recomputed on every session refresh,
// while the token base arrives only when the context card requests it.
// Re-scale the dynamic layer so the exact injected figure never displaces the
// host-reported usage; `parts` is retained in the payload for exactly this.
export function attachTokenBase(composition, tokenBase) {
  if (!composition || !tokenBase || tokenCount(tokenBase.totalTokens) === null) return composition || null;
  const customization = buildCustomizationPayload(tokenBase);
  if (composition.source === 'host-token-groups') {
    return { ...composition, customization };
  }
  return {
    ...composition,
    customization,
    segments: compositionSegments(composition.usedTokens, composition.maxTokens, { source: composition.dynamicSource || composition.source, complete: Boolean(composition.complete), parts: composition.parts }, tokenBase),
  };
}

/**
 * Attach authoritative 8-category host tokenGroups from StreamAgentStateUpdates
 * while preserving GetTokenBase customization drilldown and per-request trend.
 */
export function attachHostContextUsage(composition, hostUsage, creditUsage = null) {
  if (!composition) return null;
  const normalized = hostUsage?.groups ? hostUsage : hostContextMetrics(hostUsage);
  if (!normalized || !normalized.groups?.length || !normalized.maxTokens) {
    return creditUsage ? { ...composition, creditUsage } : composition;
  }
  const chatGroup = normalized.groups.find(g => g.id === 'chatMessages');
  return {
    ...composition,
    usedTokens: normalized.usedTokens,
    maxTokens: normalized.maxTokens,
    source: 'host-token-groups',
    complete: true,
    hostGroups: normalized.groups,
    chatBreakdown: chatSubBreakdown(composition.parts, chatGroup?.tokens || 0),
    segments: hostSegments(normalized.usedTokens, normalized.maxTokens, normalized),
    ...(creditUsage ? { creditUsage } : {}),
  };
}
