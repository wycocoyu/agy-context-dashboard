// Pure context-composition transforms for the single-session context view
// (issue #34). No credentials, prompts, or message text enter the public
// result: per-step usage buckets contribute sanitized numbers only.
import { tokenCount } from './metrics.mjs';

// The customization layer (rules/skills/subagents/MCP tool definitions) is the
// only exact figure; dynamic conversation content is an estimate and is scaled
// onto the host-reported used tokens so the stacked bar always matches the
// host usage percent. Raw estimates stay visible in segment titles.
export function tokenBaseMetrics(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const base = response.customizationTokenBase;
  if (!base || typeof base !== 'object' || Array.isArray(base)) return null;
  const totalTokens = tokenCount(base.totalTokens);
  if (totalTokens === null) return null;
  const groups = Array.isArray(base.groups) ? base.groups
    .map(group => ({ name: typeof group?.name === 'string' ? group.name.slice(0, 64) : '', tokens: tokenCount(group?.numTokens) }))
    .filter(group => group.name && group.tokens !== null).slice(0, 16) : [];
  return { totalTokens, budget: tokenCount(response.customizationBudget), remainingBudget: tokenCount(response.remainingBudget), groups, source: 'GetTokenBase' };
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

export function compositionMetrics({ context = null, steps = [], generators = [], transcript = null, tokenBase = null, maxTrendPoints = 96 } = {}) {
  if (!context || typeof context !== 'object') return null;
  const usedTokens = tokenCount(context.usedTokens), maxTokens = tokenCount(context.maxTokens);
  if (usedTokens === null || !maxTokens) return null;
  const dynamic = dynamicBuckets({ steps, transcript });
  return {
    version: 1, usedTokens, maxTokens, source: dynamic.source, complete: dynamic.complete, parts: dynamic.parts,
    customization: tokenBase
      ? { available: true, tokens: tokenBase.totalTokens, budget: tokenBase.budget, remainingBudget: tokenBase.remainingBudget, groups: tokenBase.groups }
      : { available: false, tokens: null, budget: null, remainingBudget: null, groups: null },
    segments: compositionSegments(usedTokens, maxTokens, dynamic, tokenBase),
    trend: trendMetrics(steps, generators, maxTrendPoints),
  };
}

// Lazy enrichment: the composition is recomputed on every session refresh,
// while the token base arrives only when the context card requests it.
// Re-scale the dynamic layer so the exact injected figure never displaces the
// host-reported usage; `parts` is retained in the payload for exactly this.
export function attachTokenBase(composition, tokenBase) {
  if (!composition || !tokenBase || tokenCount(tokenBase.totalTokens) === null) return composition || null;
  return { ...composition, customization: { available: true, tokens: tokenBase.totalTokens, budget: tokenBase.budget, remainingBudget: tokenBase.remainingBudget, groups: tokenBase.groups },
    segments: compositionSegments(composition.usedTokens, composition.maxTokens, { source: composition.source, complete: Boolean(composition.complete), parts: composition.parts }, tokenBase) };
}
