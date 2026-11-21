// The CLI contract is independent of desktop ModelUsageStats semantics.
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const tokens = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const states = ['idle', 'thinking', 'working', 'tool_use', 'initializing'];
const knownQuotaIds = new Set(['gemini-5h', 'gemini-weekly', '3p-5h', '3p-weekly', 'gemini-argon-wtu-weekly']);

const CLI_15X_VERSION = /^1\.5\.\d+(?:\.\d+)*$/;

const MODEL_ALIASES = new Map([
  ['model_placeholder_m318', 'Gemini 3.8 Flash (High)'],
  ['model_placeholder_m319', 'Gemini 3.8 Flash (Medium)'],
  ['model_placeholder_m320', 'Gemini 3.8 Flash (Low)'],
  ['model_placeholder_m532', 'Gemini 4 Neon (High)'],
  ['model_placeholder_m533', 'Gemini 4 Neon (Medium)'],
  ['model_placeholder_m534', 'Gemini 4 Neon (Low)'],
  ['model_placeholder_m535', 'Gemini 4 Neon (XHigh)'],
  ['model_placeholder_m427', 'Gemini 4 Carbon (High)'],
  ['model_placeholder_m437', 'Gemini 4 Carbon (Medium)'],
  ['model_placeholder_m438', 'Gemini 4 Carbon (Low)'],
  ['model_placeholder_m417', 'Gemini 4 Argon (High)'],
  ['model_placeholder_m418', 'Gemini 4 Argon (Medium)'],
  ['model_placeholder_m419', 'Gemini 4 Argon (Low)'],
  ['model_placeholder_m525', 'Gemini 4 Hydrogen (High)'],
  ['model_placeholder_m526', 'Gemini 4 Hydrogen (Medium)'],
  ['model_placeholder_m527', 'Gemini 4 Hydrogen (Low)'],
  ['model_placeholder_m528', 'Gemini 4 Hydrogen (XHigh)'],
  ['model_placeholder_m537', 'Orchestrator (Neon)'],
  ['gemini-pro-orchestrator-neon', 'Orchestrator (Neon)'],
  ['model_placeholder_m667', 'Orchestrator (Carbon)'],
  ['gemini-pro-orchestrator', 'Orchestrator (Carbon)'],
  ['model_placeholder_m681', 'Orchestrator (Argon)'],
  ['gemini-pro-orchestrator-argon', 'Orchestrator (Argon)'],
  ['model_placeholder_m669', 'Gemini 4 Hydrogen (Orchestrator)'],
  ['gemini-flash-worker-agy', 'Gemini 4 Hydrogen (Orchestrator)'],
  ['model_placeholder_m18', 'Gemini 2.5 Pro'],
  ['model_placeholder_m148', 'Gemini 2.5 Pro'],
  ['model_placeholder_m50', 'Gemini 2.5 Flash'],
  ['model_placeholder_m198', 'Gemini 2.5 Flash'],
  ['model_placeholder_m35', 'Claude Sonnet 4.6 (Thinking)'],
  ['model_placeholder_m26', 'Claude Opus 4.6 (Thinking)'],
  ['model_placeholder_m405', 'Claude Sonnet 5.5 (High)'],
  ['model_openai_gpt_oss_120b_medium', 'GPT-OSS 120B (Medium)'],
  ['gemini-pro-orchestrator-g1-pro', 'Orchestrator (Argon)'],
]);

const EFFORT_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  'extra-high': 'XHigh',
  extrahigh: 'XHigh',
  extra: 'XHigh',
  max: 'Max',
  thinking: 'Thinking',
  tiered: 'Tiered',
  orchestrator: 'Orchestrator',
  trial: 'Trial',
};

const titleCase = value => value.split(/[-_\s]+/).filter(Boolean)
  .map(part => /^[a-z]/i.test(part) ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join(' ');

function formatEffort(parsedEffort, explicitEffort) {
  const token = (parsedEffort && parsedEffort !== 'n' ? parsedEffort : explicitEffort || '').toLowerCase();
  if (!token || token === 'n' || token === 'none' || token === 'default') return '';
  return EFFORT_LABELS[token] ? ` (${EFFORT_LABELS[token]})` : '';
}

/**
 * Normalize CLI and host model strings into canonical display names, quota groups,
 * and empirically verified cache-rate allowlist flags.
 */
export function identifyModel(rawModel, explicitEffort = null) {
  const raw = cleanText(rawModel, 256);
  if (!raw) return null;
  const effort = cleanText(explicitEffort, 32);
  const wordPrefixed = /^word\//i.test(raw);
  let candidate = wordPrefixed ? raw.slice(5).trim() : raw;
  if (!candidate) return null;
  candidate = MODEL_ALIASES.get(candidate.toLowerCase()) || candidate;

  const perplexity = candidate.match(/^perplexity\/(.+)$/i);
  if (perplexity) {
    const slug = perplexity[1].replace(/@(?:default|\d{8})(?=$|[-_\s()])/gi, '').trim();
    if (slug) {
      const norm = slug.toLowerCase().replace(/(\d)[._-](\d)/g, '$1.$2').replace(/[\s()_]+/g, '-').replace(/-+$/, '');
      const effMatch = norm.match(/^(.+?)-(n|extra-?high|extrahigh|xhigh|extra|high|medium|low|max|thinking)$/);
      const base = effMatch ? effMatch[1] : norm;
      const effLabel = formatEffort(effMatch?.[2], effort);
      const words = base.split('-').filter(Boolean).map(part => /^\d+(?:\.\d+)?$/.test(part) ? part : titleCase(part));
      if (words.length) {
        return {
          key: null, quotaGroup: '3p', display: `Perplexity ${words.join(' ')}${effLabel}`,
          verified132: false, verified133: false, verified15x: false,
        };
      }
    }
  }

  const claudeEnum = candidate.match(/^model_claude_(\d+(?:_\d+)?)_(opus|sonnet|haiku)(?:_\d{8})?(?:_(thinking|high|medium|low|xhigh|max))?(?:_(byok|open_router_byok|databricks))?$/i);
  if (claudeEnum) {
    const version = claudeEnum[1].replace('_', '.');
    const family = titleCase(claudeEnum[2]);
    const suffix = formatEffort(claudeEnum[3], effort);
    const external = Boolean(claudeEnum[4]);
    return {
      key: `claude-${claudeEnum[2].toLowerCase()}-${version}`,
      quotaGroup: '3p',
      display: `Claude ${family} ${version}${suffix}${external ? ` (${claudeEnum[4].toUpperCase().replace(/_/g, ' ')})` : ''}`,
      verified132: false, verified133: false, verified15x: !external && !wordPrefixed,
    };
  }

  const normalized = candidate.replace(/@(?:default|\d{8})$/i, '')
    .toLowerCase().replace(/(\d)[._-](\d)/g, '$1.$2').replace(/[\s()_]+/g, '-').replace(/-+$/, '');

  let match = normalized.match(/^gemini-3\.8-flash(?:-(n|high|medium|low|tiered))?$/);
  if (match) {
    const label = formatEffort(match[1], match[1] === 'tiered' ? '' : effort);
    const eff = (match[1] || effort || '').toLowerCase();
    return {
      key: 'gemini-3.8-flash', quotaGroup: 'gemini', display: `Gemini 3.8 Flash${label}`,
      verified132: false, verified133: !wordPrefixed && eff === 'high', verified15x: !wordPrefixed,
    };
  }

  match = normalized.match(/^gemini-2\.5-(pro|flash)(?:-(n|high|medium|low))?$/);
  if (match) {
    return {
      key: `gemini-2.5-${match[1]}`, quotaGroup: 'gemini',
      display: `Gemini 2.5 ${titleCase(match[1])}${formatEffort(match[2], effort)}`,
      verified132: false, verified133: false, verified15x: !wordPrefixed,
    };
  }

  match = normalized.match(/^gemini-4-(hydrogen|argon|carbon|neon)(?:-(trial))?(?:-(n|extra-?high|xhigh|extra|high|medium|low|max|orchestrator))?(?:-(trial))?$/);
  if (match) {
    const tier = match[1];
    const trial = match[2] || match[4] ? ' (Trial)' : '';
    return {
      key: `gemini-4-${tier}`, quotaGroup: tier === 'argon' ? 'gemini-argon' : 'gemini',
      display: `Gemini 4 ${titleCase(tier)}${formatEffort(match[3], effort)}${trial}`,
      verified132: false, verified133: false, verified15x: !wordPrefixed,
    };
  }

  if (/^orchestrator(?:-argon)?$/.test(normalized)) {
    return {
      key: 'orchestrator-argon', quotaGroup: 'gemini-argon', display: 'Orchestrator (Argon)',
      verified132: false, verified133: false, verified15x: !wordPrefixed,
    };
  }
  match = normalized.match(/^orchestrator-(carbon|neon)$/);
  if (match) {
    return {
      key: `orchestrator-${match[1]}`, quotaGroup: 'gemini', display: `Orchestrator (${titleCase(match[1])})`,
      verified132: false, verified133: false, verified15x: !wordPrefixed,
    };
  }

  match = normalized.match(/^claude-(opus|sonnet|haiku)-(4(?:\.[5678])?|5\.5)(?:-(thinking|extra-?high|xhigh|extra|high|medium|low|max))?(?:-\d{8})?$/);
  if (match) {
    const family = match[1], ver = match[2], parsedEffort = match[3];
    const is132Sonnet = !wordPrefixed && family === 'sonnet' && ver === '4.6' && (!parsedEffort || parsedEffort === 'thinking');
    return {
      key: `claude-${family}-${ver}`, quotaGroup: '3p',
      display: `Claude ${titleCase(family)} ${ver}${formatEffort(parsedEffort, effort)}`,
      verified132: is132Sonnet, verified133: is132Sonnet, verified15x: !wordPrefixed,
    };
  }

  match = normalized.match(/^gpt-oss-120b(?:-(n|high|medium|low))?$/);
  if (match) {
    const is132Gpt = !wordPrefixed && (!match[1] || match[1] === 'medium');
    return {
      key: 'gpt-oss-120b', quotaGroup: '3p',
      display: `GPT-OSS 120B${formatEffort(match[1], effort)}`,
      verified132: is132Gpt, verified133: is132Gpt, verified15x: !wordPrefixed,
    };
  }

  if (normalized === 'gemini-flash') {
    return { key: null, quotaGroup: 'gemini', display: 'Gemini Flash', verified132: false, verified133: false, verified15x: false };
  }
  match = normalized.match(/^gpt-(6\.1-sol|6-astra)(?:-(n|extra-?high|xhigh|extra|high|medium|low|max))?$/);
  if (match) {
    const label = match[1] === '6.1-sol' ? 'GPT-6.1 Sol' : 'GPT-6 Astra';
    return { key: null, quotaGroup: '3p', display: `${label}${formatEffort(match[2], effort)}`, verified132: false, verified133: false, verified15x: false };
  }

  const quotaGroup = /\bargon\b/i.test(candidate) ? 'gemini-argon'
    : /^(?:gemini\b|model_google_gemini_)/i.test(candidate) || /\b(?:hydrogen|carbon|neon|orchestrator)\b/i.test(candidate) ? 'gemini'
    : /^(?:claude\b|gpt\b|o[134](?:-|$)|perplexity\b)/i.test(candidate) ? '3p'
    : null;
  return { key: null, quotaGroup, display: candidate, verified132: false, verified133: false, verified15x: false };
}

export function quotaGroupForModel(model) {
  return identifyModel(model)?.quotaGroup ?? null;
}

// Empirical statusLine policy:
// - 1.3.2: Sonnet 4.6 / GPT-OSS 120B (Medium), cache writes zero.
// - 1.3.3: adds Gemini 3.8 Flash (High), cache writes zero.
// - 1.5.x: binary/PTY verified separate ModelUsageStats counters with cache writes zero
//   for Gemini 3.8/4, Orchestrator (Argon), Claude, and GPT-OSS 120B.
function cacheRate(model, version, input, read, write, state) {
  const unavailable = reason => ({ percentage: null, basis: null, reason });
  if ([input, read, write].includes(null)) return unavailable('missing-or-invalid-counts');
  // During generation/tool execution a zero read may be a transient reset,
  // not a completed model request. The contract exposes no request-ready flag.
  if (read === 0 && ['thinking', 'working', 'tool_use', 'initializing'].includes(state)) return unavailable('awaiting-stable-usage');
  const total = input + read + write;
  if (!Number.isSafeInteger(total)) return unavailable('unsafe-total');
  if (total === 0) return unavailable('empty-input');
  if (read === 0) return { percentage: 0, basis: 'zero-read', reason: null };
  if (write !== 0) return unavailable('unverified-cache-write');
  const is132 = version === '1.3.2', is133 = version === '1.3.3';
  const is15x = typeof version === 'string' && CLI_15X_VERSION.test(version);
  if (!is132 && !is133 && !is15x) return unavailable('unverified-cli-version');
  // A supplied ID is authoritative. A conflicting display name cannot opt in.
  const identity = typeof model.id === 'string' && model.id.trim() ? model.id.trim() : model.display_name;
  const identified = identifyModel(identity, model.effort);
  const supported = identified && (is15x ? identified.verified15x : is133 ? identified.verified133 : identified.verified132);
  if (!supported) return unavailable('unverified-model');
  return { percentage: read / total * 100, basis: `separate-input-cli-${version}`, reason: null };
}

export function cleanText(value, limit = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid status payload');
  const context = object(payload.context_window), usage = object(context.current_usage);
  const model = object(payload.model);
  const modelLabel = cleanText(model.display_name || model.id, 256);
  const identifiedModel = identifyModel(modelLabel, model.effort);
  const input = tokens(usage.input_tokens), read = tokens(usage.cache_read_input_tokens);
  const write = tokens(usage.cache_creation_input_tokens);
  const used = number(context.used_percentage), remaining = number(context.remaining_percentage);
  const quotaEntries = Object.entries(object(payload.quota));
  const selectedQuotas = [...quotaEntries.filter(([key]) => knownQuotaIds.has(key)), ...quotaEntries.filter(([key]) => !knownQuotaIds.has(key))].slice(0, 16);
  const quotas = selectedQuotas.map(([key, raw]) => {
    const value = object(raw), fraction = number(value.remaining_fraction);
    const reset = typeof value.reset_time === 'string' ? Date.parse(value.reset_time) : NaN;
    return {
      id: cleanText(key, 64), bucketId: knownQuotaIds.has(key) ? key : null, disabled: value.disabled === true,
      remaining: value.disabled !== true && fraction !== null && fraction <= 1 ? fraction * 100 : null,
      resetInSeconds: number(value.reset_in_seconds), resetTime: Number.isFinite(reset) ? reset : null,
    };
  }).filter(value => value.id);
  const subagents = (Array.isArray(payload.subagents) ? payload.subagents : []).slice(0, 16).map(raw => {
    const item = object(raw);
    const name = cleanText(item.name, 64) || null;
    const role = cleanText(item.role, 64) || null;
    const subModel = cleanText(identifyModel(item.model)?.display || item.model, 120) || null;
    const status = cleanText(item.status, 32).toLowerCase() || null;
    return name || role || subModel || status ? { name, role, model: subModel, status } : null;
  }).filter(Boolean);
  return {
    model: cleanText(identifiedModel?.display || modelLabel, 120) || null,
    modelId: cleanText(model.id, 120) || null,
    state: states.includes(payload.agent_state) ? payload.agent_state : null,
    width: Number.isInteger(payload.terminal_width) && payload.terminal_width > 0 ? Math.min(500, payload.terminal_width) : 80,
    context: { usedPercentage: used ?? (remaining !== null && remaining <= 100 ? 100 - remaining : null),
      capacity: tokens(context.context_window_size) || null },
    cacheReadTokens: read, cacheCreationTokens: write,
    cacheRate: cacheRate(model, payload.version, input, read, write, payload.agent_state),
    inputTokens: input, outputTokens: tokens(usage.output_tokens),
    quotas,
    subagents,
  };
}

export function compact(value) {
  if (value === null) return '--';
  for (const [base, suffix, nextBase, nextSuffix] of [[1e12, 'T', 0, ''], [1e9, 'B', 1e12, 'T'], [1e6, 'M', 1e9, 'B'], [1e3, 'K', 1e6, 'M']]) {
    if (value >= base) {
      const rounded = Number((value / base).toFixed(1));
      return nextBase && rounded * base >= nextBase ? `1${nextSuffix}` : `${rounded}${suffix}`;
    }
  }
  return String(Math.round(value));
}

export function percentage(value) {
  return value === null ? '--' : `${Number(value.toFixed(1))}%`;
}

export function countdown(quota, now = Date.now()) {
  // Absolute time prevents a replayed reset_in_seconds from looking fresh.
  const seconds = quota.resetTime !== null ? Math.max(0, (quota.resetTime - now) / 1000) : quota.resetInSeconds;
  if (seconds === null) return null;
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d${Math.floor(seconds % 86400 / 3600)}h`;
}
