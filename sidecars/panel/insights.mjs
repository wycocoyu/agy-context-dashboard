// Cross-session Insights scanner and 64-shard summary cache.
// Never buffers raw prompt/tool bodies in memory and never depends on
// GetUserAnalyticsSummary (which returns {} when disableTelemetry is true).
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { platformPaths } from '../../compat/platform.mjs';
import { formatModelName } from './context.mjs';
import { estimateModelsCost } from './pricing.mjs';
import { TrajectoryJson } from './trajectory-json.mjs';
import { transcriptBrainRoot } from './transcript.mjs';
import { dateKey } from './usage.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARD_COUNT = 64;
const STAT_CONCURRENCY = 16;
const PARSE_CONCURRENCY = 2;
const SHARD_CONCURRENCY = 4;
const FLUSH_MAX_RECORDS = 64;
const FLUSH_MAX_BYTES = 4 * 1024 * 1024;
const ACTIVE_GAP_CAP_MS = 15 * 60 * 1000;
const SCHEMA_VERSION = 1;
const VERSIONS = { timeline: 1, activity: 1, config: 1 };

const stripQuotes = value => {
  let text = typeof value === 'string' ? value.trim() : '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
};

const cleanText = (value, max = 128) => stripQuotes(value)
  .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const countOrZero = value => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }
  return 0;
};

const INSIGHTS_LINE_PROJECTION = {
  step_index: 'scalar',
  type: 'scalar',
  created_at: 'scalar',
  model: 'scalar',
  input_tokens: 'scalar',
  cache_read_tokens: 'scalar',
  cache_write_tokens: 'scalar',
  output_tokens: 'scalar',
  content: 'textEstimate',
  thinking: 'textEstimate',
  tool_calls: {
    '*': {
      name: 'scalar',
      args: {
        Path: 'scalar',
        AbsolutePath: 'scalar',
        TargetFile: 'scalar',
        DirectoryPath: 'scalar',
        SearchPath: 'scalar',
        CommandLine: 'scalar',
        cwd: 'scalar',
      },
    },
  },
};

export function shardIndexForSession(id) {
  const digest = createHash('sha256').update(String(id).toLowerCase()).digest();
  return digest.readUInt16BE(0) % SHARD_COUNT;
}

export function shardFilename(shardIdx) {
  return `shard-${shardIdx.toString(16).padStart(2, '0')}.json`;
}

function extractBaseCommand(commandLine) {
  const text = cleanText(commandLine, 512);
  if (!text) return null;
  const tokens = text.split(/\s+/);
  for (let token of tokens) {
    if (!token) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    if (/^(?:env|sudo|command|time|nohup)$/i.test(token)) continue;
    token = token.replace(/^["']|["']$/g, '');
    const base = basename(token).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32);
    if (base) return base;
  }
  return null;
}

function extractSkillName(filePath) {
  const clean = stripQuotes(filePath);
  if (!clean) return null;
  const match = clean.match(/(?:^|[\\/])skills[\\/](?:shared[\\/])?([^\\/]+)[\\/]SKILL\.md$/i);
  if (!match) return null;
  const name = cleanText(match[1], 64);
  return name || null;
}

function inferProjectName(pathValue, isCwd = false) {
  const raw = stripQuotes(pathValue);
  if (!raw) return null;
  const clean = raw.replace(/^file:\/\//, '').replace(/\\/g, '/');
  if (!clean || clean === '/' || clean.startsWith('/tmp/')) return null;
  if (/\/\.gemini\/(?:config|antigravity\/brain|antigravity\/daemon)\b/i.test(clean)) return null;

  const known = clean.match(/\/(?:Code|dev|projects|repos|workspace|worktrees\/[^/]+)\/([^/]+)/);
  if (known?.[1]) return cleanText(known[1], 64);

  if (isCwd) {
    const base = basename(clean);
    if (base && base !== 'mac' && base !== 'Users' && base !== 'home') return cleanText(base, 64);
  }
  return null;
}

function topRecordMap(map, limit = 32) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit),
  );
}

async function runPool(items, concurrency, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Stream a single transcript.jsonl / transcript_full.jsonl file in 64 KiB
 * chunks via TrajectoryJson and extract a compact numeric/structural summary.
 */
export async function parseTranscriptSummaryStream(filePath, sessionId, { timeZone = 'Asia/Shanghai', buffer = null, parser = null } = {}) {
  const handle = await open(filePath, 'r');
  let steps = 0, rounds = 0, modelCalls = 0, toolCalls = 0, compactions = 0;
  let firstAtMs = null, lastAtMs = null, prevAtMs = null, activeMs = 0, lastContextTokens = 0;
  let userTokens = 0, assistantTokens = 0, toolTokens = 0, systemTokens = 0;
  const tokens = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 };
  const models = new Map();
  const days = new Map();
  const tools = new Map();
  const commands = new Map();
  const skills = new Map();
  const projects = new Map();

  const addMap = (map, key, inc = 1) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + inc);
  };

  const processRecord = obj => {
    if (!obj || typeof obj !== 'object') return;
    steps++;
    const rawType = typeof obj.type === 'string' ? obj.type.replace(/^CORTEX_STEP_TYPE_/, '') : '';
    const ts = typeof obj.created_at === 'string' ? Date.parse(obj.created_at) : NaN;
    if (Number.isFinite(ts)) {
      if (firstAtMs === null || ts < firstAtMs) firstAtMs = ts;
      if (lastAtMs === null || ts > lastAtMs) lastAtMs = ts;
      if (prevAtMs !== null && ts > prevAtMs) {
        activeMs += Math.min(ACTIVE_GAP_CAP_MS, ts - prevAtMs);
      }
      prevAtMs = ts;
    }

    const contentTok = countOrZero(obj.content?.tokens);
    const thinkingTok = countOrZero(obj.thinking?.tokens);
    const prefix = typeof obj.content?.prefix === 'string' ? obj.content.prefix : '';
    const isCompaction = rawType === 'COMPACTION' || rawType === 'CONTEXT_COMPACTION' ||
      (rawType === 'CHECKPOINT' && /^\s*(?:\[?context (?:summary|compaction)\]?|conversation (?:summary|checkpoint)|checkpoint summary|# Resuming from a compaction|<CONTEXT_SUMMARY>)/i.test(prefix));
    if (isCompaction) compactions++;

    if (rawType === 'USER_INPUT') {
      rounds++;
      userTokens += contentTok;
    } else if (rawType === 'PLANNER_RESPONSE') {
      modelCalls++;
      assistantTokens += contentTok + thinkingTok;
    } else if (rawType === 'SYSTEM_MESSAGE' || rawType === 'CHECKPOINT' || isCompaction) {
      systemTokens += contentTok;
    } else {
      toolTokens += contentTok;
    }

    const inTok = countOrZero(obj.input_tokens);
    const readTok = countOrZero(obj.cache_read_tokens);
    const writeTok = countOrZero(obj.cache_write_tokens);
    const outTok = countOrZero(obj.output_tokens);
    if (inTok || readTok || writeTok || outTok) {
      tokens.uncached += inTok;
      tokens.cacheRead += readTok;
      tokens.cacheWrite += writeTok;
      tokens.output += outTok;
      tokens.total += inTok + readTok + writeTok + outTok;
      const ctx = inTok + readTok + writeTok;
      if (ctx > 0) lastContextTokens = ctx;

      const modelName = formatModelName(cleanText(obj.model || '', 120)) || 'Unknown';
      let mBucket = models.get(modelName);
      if (!mBucket) {
        mBucket = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 };
        models.set(modelName, mBucket);
      }
      mBucket.uncached += inTok;
      mBucket.cacheRead += readTok;
      mBucket.cacheWrite += writeTok;
      mBucket.output += outTok;
      mBucket.requests++;

      if (Number.isFinite(ts)) {
        const day = dateKey(ts, timeZone);
        let dBucket = days.get(day);
        if (!dBucket) {
          dBucket = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, models: {} };
          days.set(day, dBucket);
        }
        dBucket.uncached += inTok;
        dBucket.cacheRead += readTok;
        dBucket.cacheWrite += writeTok;
        dBucket.output += outTok;
        if (!Object.hasOwn(dBucket.models, modelName)) {
          dBucket.models[modelName] = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 };
        }
        const dm = dBucket.models[modelName];
        dm.uncached += inTok;
        dm.cacheRead += readTok;
        dm.cacheWrite += writeTok;
        dm.output += outTok;
        dm.requests++;
      }
    } else if (Number.isFinite(ts)) {
      const day = dateKey(ts, timeZone);
      if (!days.has(day)) {
        days.set(day, { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, models: {} });
      }
    }

    if (Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        if (!tc || typeof tc !== 'object') continue;
        const name = cleanText(tc.name, 64);
        if (name) {
          toolCalls++;
          addMap(tools, name, 1);
        }
        const args = tc.args;
        if (args && typeof args === 'object') {
          if (args.CommandLine) addMap(commands, extractBaseCommand(args.CommandLine), 1);
          const candidatePath = args.Path || args.AbsolutePath || args.TargetFile || args.DirectoryPath || args.SearchPath;
          const skill = extractSkillName(candidatePath);
          if (skill) addMap(skills, skill, 1);
          const proj = inferProjectName(args.cwd, true) || inferProjectName(candidatePath, false);
          if (proj) addMap(projects, proj, 1);
        }
      }
    }
  };

  try {
    const buf = buffer || Buffer.allocUnsafe(65536);
    const decoder = new StringDecoder('utf8');
    const lineParser = parser || new TrajectoryJson({ projection: INSIGHTS_LINE_PROJECTION, maxRetainedBytes: 65536 });
    lineParser.reset();
    let lineStarted = false;
    let badLine = false;

    const finishLine = () => {
      if (lineStarted && !badLine) {
        try { processRecord(lineParser.end()); } catch {}
      }
      lineParser.reset();
      lineStarted = false;
      badLine = false;
    };

    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, null);
      if (!bytesRead) break;
      const text = decoder.write(buf.subarray(0, bytesRead));
      let start = 0;
      for (let i = 0; i <= text.length; i++) {
        if (i !== text.length && text[i] !== '\n') continue;
        const part = text.slice(start, i);
        start = i + 1;
        if (part.trim().length || lineStarted) {
          lineStarted = true;
          if (!badLine) {
            try { lineParser.write(part); } catch { badLine = true; }
          }
        }
        if (i < text.length) finishLine();
      }
      await yieldLoop();
    }
    const tail = decoder.end();
    if (tail.trim().length) {
      lineStarted = true;
      if (!badLine) { try { lineParser.write(tail); } catch { badLine = true; } }
    }
    finishLine();
  } finally {
    await handle.close();
  }

  let primaryModel = null, maxReq = -1;
  for (const [name, bucket] of models) {
    if (bucket.requests > maxReq) { maxReq = bucket.requests; primaryModel = name; }
  }
  let project = null, maxProj = -1;
  for (const [name, hits] of projects) {
    if (hits > maxProj) { maxProj = hits; project = name; }
  }

  return {
    id: sessionId.toLowerCase(),
    firstAt: firstAtMs !== null ? new Date(firstAtMs).toISOString() : null,
    lastAt: lastAtMs !== null ? new Date(lastAtMs).toISOString() : null,
    activeMs,
    steps,
    rounds,
    modelCalls,
    toolCalls,
    compactions,
    lastContextTokens,
    primaryModel,
    project,
    tokens,
    composition: { userTokens, assistantTokens, toolTokens, systemTokens },
    models: Object.fromEntries(models),
    days: Object.fromEntries(days),
    tools: topRecordMap(tools, 32),
    commands: topRecordMap(commands, 32),
    skills: topRecordMap(skills, 32),
  };
}

function lastNDays(today, count) {
  const result = [];
  const end = new Date(today + 'T00:00:00Z');
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/**
 * Aggregate compact per-session summaries + live daemon summaries + pricing
 * into the Insights overview payload.
 */
export function buildInsightsOverview(summaries, {
  liveSummaries = null,
  accountCredits = null,
  status = 'all',
  sort = 'recent',
  query = '',
  now = Date.now(),
  timeZone = 'Asia/Shanghai',
  cacheInfo = null,
} = {}) {
  const today = dateKey(now, timeZone);
  const liveMap = liveSummaries && typeof liveSummaries === 'object' ? liveSummaries : {};
  const q = cleanText(query, 80).toLowerCase();

  let totalSessions = 0, activeSessions = 0, archivedSessions = 0;
  let totalTokens = 0, uncachedTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, outputTokens = 0;
  let totalRounds = 0, totalModelCalls = 0, totalToolCalls = 0, totalActiveMs = 0;
  let estimatedCostUsd = 0, pricedSessions = 0, unpricedSessions = 0;
  const textComp = { userText: 0, assistantText: 0, toolText: 0, systemText: 0 };
  const dailyMap = new Map();
  const projectMap = new Map();
  const skillMap = new Map();
  const toolMap = new Map();
  const commandMap = new Map();
  const modelMap = new Map();
  const sessionRows = [];

  for (const item of summaries) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').toLowerCase();
    const live = liveMap[id] || null;
    const isArchived = !live;
    totalSessions++;
    if (isArchived) archivedSessions++; else activeSessions++;

    const tok = item.tokens || {};
    const sessTotal = tok.total || 0;
    const sessUncached = tok.uncached || 0;
    const sessRead = tok.cacheRead || 0;
    const sessWrite = tok.cacheWrite || 0;
    const sessOut = tok.output || 0;
    const sessInput = sessUncached + sessRead + sessWrite;

    totalTokens += sessTotal;
    uncachedTokens += sessUncached;
    cacheReadTokens += sessRead;
    cacheWriteTokens += sessWrite;
    outputTokens += sessOut;
    totalRounds += item.rounds || 0;
    totalModelCalls += item.modelCalls || 0;
    totalToolCalls += item.toolCalls || 0;
    totalActiveMs += item.activeMs || 0;

    textComp.userText += item.composition?.userTokens || 0;
    textComp.assistantText += item.composition?.assistantTokens || 0;
    textComp.toolText += item.composition?.toolTokens || 0;
    textComp.systemText += item.composition?.systemTokens || 0;

    const sessionCost = estimateModelsCost(item.models);
    if (sessionCost.hasPriced && sessionCost.totalUsd !== null) {
      estimatedCostUsd += sessionCost.totalUsd;
      pricedSessions++;
    } else if (sessTotal > 0) {
      unpricedSessions++;
    }

    for (const [day, d] of Object.entries(item.days || {})) {
      let bucket = dailyMap.get(day);
      if (!bucket) {
        bucket = { date: day, sessions: 0, uncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, totalTokens: 0, models: {} };
        dailyMap.set(day, bucket);
      }
      bucket.sessions++;
      bucket.uncachedTokens += d.uncached || 0;
      bucket.cacheReadTokens += d.cacheRead || 0;
      bucket.cacheWriteTokens += d.cacheWrite || 0;
      bucket.outputTokens += d.output || 0;
      bucket.totalTokens += (d.uncached || 0) + (d.cacheRead || 0) + (d.cacheWrite || 0) + (d.output || 0);
      for (const [mName, mb] of Object.entries(d.models || {})) {
        if (!Object.hasOwn(bucket.models, mName)) bucket.models[mName] = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 };
        const target = bucket.models[mName];
        target.uncached += mb.uncached || 0;
        target.cacheRead += mb.cacheRead || 0;
        target.cacheWrite += mb.cacheWrite || 0;
        target.output += mb.output || 0;
        target.requests += mb.requests || 0;
      }
    }

    if (item.project) {
      const p = projectMap.get(item.project) || { name: item.project, sessions: 0, tokens: 0 };
      p.sessions++;
      p.tokens += sessTotal;
      projectMap.set(item.project, p);
    }
    for (const [name, count] of Object.entries(item.skills || {})) {
      const s = skillMap.get(name) || { name, count: 0, sessions: 0 };
      s.count += count;
      s.sessions++;
      skillMap.set(name, s);
    }
    for (const [name, count] of Object.entries(item.tools || {})) {
      toolMap.set(name, (toolMap.get(name) || 0) + count);
    }
    for (const [name, count] of Object.entries(item.commands || {})) {
      commandMap.set(name, (commandMap.get(name) || 0) + count);
    }
    for (const [name, mb] of Object.entries(item.models || {})) {
      const m = modelMap.get(name) || { name, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0, totalTokens: 0 };
      m.uncached += mb.uncached || 0;
      m.cacheRead += mb.cacheRead || 0;
      m.cacheWrite += mb.cacheWrite || 0;
      m.output += mb.output || 0;
      m.requests += mb.requests || 0;
      m.totalTokens += (mb.uncached || 0) + (mb.cacheRead || 0) + (mb.cacheWrite || 0) + (mb.output || 0);
      modelMap.set(name, m);
    }

    const title = cleanText(live?.summary || '', 120) || (item.project ? `${item.project} · ${id.slice(0, 8)}` : `Session ${id.slice(0, 8)}`);
    const modifiedAt = live?.lastModifiedTime || item.lastAt || item.firstAt || null;
    const rowStatus = isArchived ? 'ARCHIVED' : cleanText(String(live?.status || '').replace(/^CASCADE_RUN_STATUS_/, ''), 32) || 'IDLE';

    if (status === 'active' && isArchived) continue;
    if (status === 'archived' && !isArchived) continue;
    if (q && !title.toLowerCase().includes(q) && !(item.project || '').toLowerCase().includes(q) && !(item.primaryModel || '').toLowerCase().includes(q) && !id.includes(q)) continue;

    sessionRows.push({
      id,
      title,
      project: item.project || null,
      model: item.primaryModel || null,
      status: rowStatus,
      archived: isArchived,
      modifiedAt,
      modifiedMs: modifiedAt ? Date.parse(modifiedAt) || 0 : 0,
      rounds: item.rounds || 0,
      steps: Math.max(item.steps || 0, countOrZero(live?.stepCount)),
      totalTokens: sessTotal,
      currentContextTokens: item.lastContextTokens || 0,
      cacheHitRate: sessInput > 0 ? sessRead / sessInput : null,
      estimatedCostUsd: sessionCost.hasPriced ? sessionCost.totalUsd : null,
      toolCalls: item.toolCalls || 0,
      activeMs: item.activeMs || 0,
    });
  }

  sessionRows.sort((a, b) => {
    if (sort === 'tokens') return b.totalTokens - a.totalTokens || b.modifiedMs - a.modifiedMs;
    if (sort === 'context') return b.currentContextTokens - a.currentContextTokens || b.modifiedMs - a.modifiedMs;
    if (sort === 'cost') return (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.totalTokens - a.totalTokens;
    return b.modifiedMs - a.modifiedMs;
  });

  const totalInput = uncachedTokens + cacheReadTokens + cacheWriteTokens;
  const last7Dates = lastNDays(today, 7);
  const last7Days = last7Dates.map(date => {
    const d = dailyMap.get(date);
    if (!d) return { date, sessions: 0, uncachedTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null };
    const cost = estimateModelsCost(d.models);
    return {
      date,
      sessions: d.sessions,
      uncachedTokens: d.uncachedTokens,
      cacheReadTokens: d.cacheReadTokens,
      outputTokens: d.outputTokens,
      totalTokens: d.totalTokens,
      estimatedCostUsd: cost.hasPriced ? cost.totalUsd : null,
    };
  });

  const heatmapDates = lastNDays(today, 112);
  const heatmap = heatmapDates.map(date => {
    const d = dailyMap.get(date);
    return { date, sessions: d?.sessions || 0, tokens: d?.totalTokens || 0 };
  });

  const modelDist = [...modelMap.values()]
    .map(m => ({ ...m, estimatedCostUsd: estimateModelsCost({ [m.name]: m }).totalUsd }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);

  return {
    version: 1,
    today,
    timeZone,
    accountCredits: accountCredits || null,
    kpis: {
      totalSessions,
      activeSessions,
      archivedSessions,
      totalTokens,
      uncachedTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      totalRounds,
      totalModelCalls,
      totalToolCalls,
      totalActiveMs,
      avgCacheHitRate: totalInput > 0 ? cacheReadTokens / totalInput : null,
      estimatedCostUsd: pricedSessions > 0 ? estimatedCostUsd : null,
      pricedSessions,
      totalSessionsForPricing: pricedSessions + unpricedSessions,
    },
    last7Days,
    heatmap,
    composition: {
      uncached: uncachedTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
      output: outputTokens,
      ...textComp,
    },
    distributions: {
      projects: [...projectMap.values()].sort((a, b) => b.tokens - a.tokens || b.sessions - a.sessions).slice(0, 10),
      skills: [...skillMap.values()].sort((a, b) => b.count - a.count || b.sessions - a.sessions).slice(0, 10),
      tools: [...toolMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      commands: [...commandMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      models: modelDist,
    },
    totalMatchingSessions: sessionRows.length,
    sessions: sessionRows.slice(0, 200).map(({ modifiedMs: _ignore, ...row }) => row),
    cacheInfo: cacheInfo || null,
  };
}

export class InsightsScanner {
  constructor({
    brainRoot = transcriptBrainRoot('app'),
    cacheDir = join(platformPaths().data, 'insights-cache-v1'),
    timeZone = 'Asia/Shanghai',
    now = Date.now,
    cacheTtlMs = 30_000,
    useWorker = true,
  } = {}) {
    this.brainRoot = brainRoot;
    this.cacheDir = cacheDir;
    this.timeZone = timeZone;
    this.now = now;
    this.cacheTtlMs = cacheTtlMs;
    this.useWorker = useWorker;
    this.lastSummaries = null;
    this.lastScannedAt = 0;
    this.lastCacheInfo = null;
    this.scanning = null;
    this.disposed = false;
  }

  runScanWorker(force) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./insights-worker.mjs', import.meta.url), {
        execArgv: [],
        workerData: {
          brainRoot: this.brainRoot,
          cacheDir: this.cacheDir,
          timeZone: this.timeZone,
          force: force === true,
        },
        resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 },
      });
      let result = null;
      let workerError = null;
      let settled = false;
      const done = (err, val) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(val);
      };
      worker.on('message', msg => { result = msg; });
      worker.on('error', err => { workerError = err; });
      worker.on('exit', code => {
        if (code === 0 && result?.ok) done(null, result.result);
        else done(workerError || new Error(result?.error || 'Insights scan worker failed'));
      });
    });
  }

  async ensureSafeDir(dir) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const info = await lstat(dir);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe insights cache directory');
  }

  async loadShard(idx) {
    const file = join(this.cacheDir, shardFilename(idx));
    try {
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 16 * 1024 * 1024) return { schema: SCHEMA_VERSION, versions: VERSIONS, entries: {} };
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (parsed?.schema !== SCHEMA_VERSION ||
          parsed.versions?.timeline !== VERSIONS.timeline ||
          parsed.versions?.activity !== VERSIONS.activity ||
          parsed.versions?.config !== VERSIONS.config ||
          !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
        return { schema: SCHEMA_VERSION, versions: VERSIONS, entries: {} };
      }
      return parsed;
    } catch {
      return { schema: SCHEMA_VERSION, versions: VERSIONS, entries: {} };
    }
  }

  async writeShard(idx, shard) {
    await this.ensureSafeDir(this.cacheDir);
    const file = join(this.cacheDir, shardFilename(idx));
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const payload = JSON.stringify({ schema: SCHEMA_VERSION, versions: VERSIONS, entries: shard.entries });
    try {
      await writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
      await rename(tmp, file);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }

  async discoverSessionFiles() {
    let resolvedRoot;
    try { resolvedRoot = await realpath(this.brainRoot); } catch { return []; }
    let entries;
    try { entries = await readdir(resolvedRoot, { withFileTypes: true }); } catch { return []; }

    const ids = entries
      .filter(d => !d.isSymbolicLink() && d.isDirectory() && GUID.test(d.name))
      .map(d => d.name.toLowerCase());

    const located = await runPool(ids, STAT_CONCURRENCY, async id => {
      for (const name of ['transcript.jsonl', 'transcript_full.jsonl']) {
        const candidate = join(resolvedRoot, id, '.system_generated', 'logs', name);
        try {
          const real = await realpath(candidate);
          const rel = relative(resolvedRoot, real);
          if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
          const info = await stat(real);
          if (!info.isFile()) continue;
          return {
            id,
            shardIdx: shardIndexForSession(id),
            identity: { path: real, sizeBytes: info.size, mtimeMs: Math.round(info.mtimeMs) },
          };
        } catch {}
      }
      return null;
    });

    return located.filter(Boolean);
  }

  async scan({ force = false } = {}) {
    if (this.disposed) return { summaries: this.lastSummaries || [], cacheInfo: this.lastCacheInfo };
    if (!force && this.lastSummaries && this.now() - this.lastScannedAt < this.cacheTtlMs) {
      return { summaries: this.lastSummaries, cacheInfo: this.lastCacheInfo };
    }
    if (this.scanning) return this.scanning;

    this.scanning = (async () => {
      if (this.useWorker) {
        const res = await this.runScanWorker(force);
        if (!this.disposed) {
          this.lastSummaries = res.summaries;
          this.lastScannedAt = this.now();
          this.lastCacheInfo = res.cacheInfo;
        }
        return res;
      }
      const started = this.now();
      const targets = await this.discoverSessionFiles();
      const neededShards = [...new Set(targets.map(t => t.shardIdx))];
      const shardMap = new Map();

      await runPool(neededShards, SHARD_CONCURRENCY, async idx => {
        shardMap.set(idx, await this.loadShard(idx));
      });

      const summaries = [];
      const toParse = [];
      let cacheHits = 0;

      for (const target of targets) {
        const shard = shardMap.get(target.shardIdx);
        const existing = shard?.entries?.[target.id];
        const same = existing?.identity &&
          existing.identity.path === target.identity.path &&
          existing.identity.sizeBytes === target.identity.sizeBytes &&
          existing.identity.mtimeMs === target.identity.mtimeMs &&
          existing.summary;
        if (same) {
          cacheHits++;
          summaries.push(existing.summary);
        } else {
          toParse.push(target);
        }
      }

      const dirtyShards = new Set();
      let pendingRecords = 0;
      let pendingBytes = 0;

      const flushDirty = async () => {
        if (!dirtyShards.size) return;
        const indices = [...dirtyShards];
        dirtyShards.clear();
        pendingRecords = 0;
        pendingBytes = 0;
        await runPool(indices, SHARD_CONCURRENCY, async idx => {
          const shard = shardMap.get(idx);
          if (shard) await this.writeShard(idx, shard);
        });
      };

      const sharedBuffer = Buffer.allocUnsafe(65536);
      const sharedParser = new TrajectoryJson({ projection: INSIGHTS_LINE_PROJECTION, maxRetainedBytes: 65536 });
      let cursor = 0;
      const parseWorkers = Array.from({ length: Math.min(PARSE_CONCURRENCY, toParse.length) }, async (_item, workerIdx) => {
        const parser = workerIdx === 0 ? sharedParser : new TrajectoryJson({ projection: INSIGHTS_LINE_PROJECTION, maxRetainedBytes: 65536 });
        const buffer = workerIdx === 0 ? sharedBuffer : Buffer.allocUnsafe(65536);
        while (cursor < toParse.length) {
          const target = toParse[cursor++];
          try {
            const summary = await parseTranscriptSummaryStream(target.identity.path, target.id, { timeZone: this.timeZone, buffer, parser });
            summaries.push(summary);
            const shard = shardMap.get(target.shardIdx);
            if (shard) {
              const record = { identity: target.identity, summary };
              shard.entries[target.id] = record;
              dirtyShards.add(target.shardIdx);
              pendingRecords++;
              pendingBytes += Buffer.byteLength(JSON.stringify(record));
              if (pendingRecords >= FLUSH_MAX_RECORDS || pendingBytes >= FLUSH_MAX_BYTES) {
                await flushDirty();
              }
            }
          } catch {}
        }
      });
      await Promise.all(parseWorkers);

      await flushDirty();

      const cacheInfo = {
        totalScanned: targets.length,
        parsedNow: toParse.length,
        cacheHits,
        scanMs: Math.max(0, Math.round(this.now() - started)),
        shardCount: SHARD_COUNT,
      };
      this.lastSummaries = summaries;
      this.lastScannedAt = this.now();
      this.lastCacheInfo = cacheInfo;
      return { summaries, cacheInfo };
    })().finally(() => {
      this.scanning = null;
    });

    return this.scanning;
  }

  async overview({
    force = false,
    liveSummaries = null,
    accountCredits = null,
    status = 'all',
    sort = 'recent',
    query = '',
  } = {}) {
    const { summaries, cacheInfo } = await this.scan({ force });
    return buildInsightsOverview(summaries, {
      liveSummaries,
      accountCredits,
      status,
      sort,
      query,
      now: this.now(),
      timeZone: this.timeZone,
      cacheInfo,
    });
  }

  dispose() {
    this.disposed = true;
    this.lastSummaries = null;
    this.lastCacheInfo = null;
  }
}
