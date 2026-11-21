// Real browser regression for Side Panel Issue #34 P1-Panel/P2/P3 and Issue #29 Phase 2:
// - 8-category host composition bar & list view toggle
// - Interactive GetTokenBase drilldown (Rules / Skills / nested MCP tools)
// - Trend Total vs Delta toggle + compaction reclaimed markers
// - Lazy On-Demand Session Audit (Files, Commands, Steps + filters + jump-to-step)
// - Lazy Cross-Session Insights tab (KPIs, 7d bars, heatmap toggle, distributions, session jump)
// - Trilingual switching (en / zh-CN / zh-TW) & zero Trusted Types CSP errors
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { panelAppSource, panelPageSource } from '../sidecars/panel/panel-source.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { compositionMetrics, tokenBaseMetrics, hostContextMetrics, attachTokenBase, attachHostContextUsage } from '../sidecars/panel/composition.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const createTheme = createRequire(import.meta.url)('../compat/theme.cjs');
const cidA = '11111111-1111-1111-1111-111111111111';
const cidB = '22222222-2222-2222-2222-222222222222';

const tokenBase = tokenBaseMetrics({
  customizationTokenBase: {
    totalTokens: 16489,
    groups: [
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 6642, children: [{ name: '/Users/mac/.gemini/AGENTS.md', numTokens: 2767 }, { name: '/Users/mac/.gemini/config/rules/team-resident.md', numTokens: 3875 }] },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 9347, children: [{ name: 'tabbit', numTokens: 210 }, { name: 'team-github-bilingual', numTokens: 185 }] },
      { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 340, children: [{ name: 'research', numTokens: 120 }] },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 160, children: [{ name: 'openviking', numTokens: 102, children: [{ name: 'find', numTokens: 2 }, { name: 'remember', numTokens: 4 }] }] },
    ],
  },
  customizationBudget: 20000,
  remainingBudget: 3511,
  rulesBudget: 20000,
  remainingRulesBudget: 13358,
});

const hostUsage = hostContextMetrics({
  contextWindowUsage: {
    estimatedTokensUsed: 120000,
    maxContextTokens: 512000,
    tokenGroups: [
      { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 5200 },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 160 },
      { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 340 },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 9347 },
      { name: 'Plugins', type: 'TOKEN_TYPE_PLUGINS', numTokens: 1400 },
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 6642 },
      { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 7400 },
      { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 89511 },
    ],
  },
});

const makeSession = (id, modelName, vals) => {
  const steps = [{ type: 'CORTEX_STEP_TYPE_USER_INPUT', metadata: {} }];
  const generators = [];
  vals.forEach((v, idx) => {
    const idxStep = steps.length;
    steps.push({ type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', metadata: { modelUsage: { inputTokens: String(v), thinkingOutputTokens: '900', responseOutputTokens: '300', outputTokens: '1200' } } });
    generators.push({
      stepIndices: [idxStep],
      chatModel: {
        modelDisplayName: modelName,
        streamingDuration: '2s',
        timeToFirstToken: '0.5s',
        usage: { messageId: `${id}-${idx}`, inputTokens: String(Math.round(v * 0.2)), cacheReadTokens: String(Math.round(v * 0.8)), outputTokens: '1200', responseOutputTokens: '300', thinkingOutputTokens: '900', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 120000, maxContextTokens: 512000 } },
      },
    });
    if (idx === 1) steps.push({ type: 'CORTEX_STEP_TYPE_COMPACTION', metadata: {} });
  });
  const base = trajectoryMetrics({ trajectory: { cascadeId: id, steps, generatorMetadata: generators } });
  const comp = compositionMetrics({
    context: base.context,
    steps,
    generators,
    transcript: { status: 'ready', matchedSteps: steps.length, userTokens: 2500, assistantTokens: 4800, toolTokens: 35000, systemTokens: 1200, totalTokens: 43500, compactionMarkers: 1 },
  });
  return {
    ...base,
    estimatedCost: { totalUsd: 0.42, hasPriced: true, complete: true, estimated: true },
    contextComposition: comp,
  };
};

const sessions = {
  [cidA]: makeSession(cidA, 'Gemini 4 Neon (High)', [40000, 120000, 35000, 75000]),
  [cidB]: makeSession(cidB, 'Claude Sonnet 4.6 (Thinking)', [25000, 65000, 90000]),
};

const auditById = {
  [cidA]: {
    version: 1,
    conversationId: cidA,
    totalSteps: 4,
    totalFiles: 1,
    totalCommands: 1,
    counts: { user: 1, thinking: 1, tools: 2, answer: 1, compactions: 1 },
    truncated: false,
    files: [{ path: '/repo/sidecars/panel/app.js', name: 'app.js', ops: ['read', 'edit'], reads: 1, edits: 1, writes: 0, searches: 0, additions: 14, deletions: 3, stepIndices: [1, 2], lastStepIndex: 2 }],
    commands: [{ stepIndex: 3, command: 'npm test', cwd: '/repo', exitCode: 0, shell: 'zsh', durationMs: 1250, status: 'DONE' }],
    steps: [
      { index: 0, type: 'USER_INPUT', categories: ['user'], model: null, contextDeltaTokens: 400, deltaEstimated: true, label: 'User message' },
      { index: 1, type: 'PLANNER_RESPONSE', categories: ['thinking', 'tools', 'answer'], model: 'Gemini 4 Neon (High)', thinkingTokens: 900, responseTokens: 300, contextDeltaTokens: 40000, deltaEstimated: false, label: 'Tools: read_file' },
      { index: 2, type: 'CODE_ACTION', categories: ['tools'], model: 'Gemini 4 Neon (High)', contextDeltaTokens: 800, deltaEstimated: true, label: 'edit: app.js' },
      { index: 3, type: 'RUN_COMMAND', categories: ['tools'], model: 'Gemini 4 Neon (High)', contextDeltaTokens: 250, deltaEstimated: true, label: '$ npm test' },
    ],
  },
};

const insightsPayload = {
  version: 1,
  today: '2026-11-21',
  timeZone: 'Asia/Shanghai',
  accountCredits: { planName: 'Pro', tierName: 'Google AI Ultra', availablePromptCredits: 500, monthlyPromptCredits: 50000, availableFlowCredits: 100, monthlyFlowCredits: 150000 },
  kpis: {
    totalSessions: 2, activeSessions: 1, archivedSessions: 1,
    totalTokens: 540000, uncachedTokens: 108000, cacheReadTokens: 432000, cacheWriteTokens: 0, outputTokens: 8400,
    totalRounds: 9, totalModelCalls: 7, totalToolCalls: 14, totalActiveMs: 92000,
    avgCacheHitRate: 0.8, estimatedCostUsd: 1.28, pricedSessions: 2, totalSessionsForPricing: 2,
  },
  last7Days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(15 + i).padStart(2, '0')}`,
    sessions: i === 6 ? 2 : 1,
    totalTokens: (i + 1) * 50000,
    estimatedCostUsd: (i + 1) * 0.15,
  })),
  heatmap: Array.from({ length: 112 }, (_, i) => ({
    date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    sessions: i % 5 === 0 ? 3 : 1,
    tokens: (i % 7) * 40000,
  })),
  composition: { uncached: 108000, cacheRead: 432000, cacheWrite: 0, output: 8400 },
  distributions: {
    projects: [{ name: 'agy-context-dashboard', sessions: 2, tokens: 540000 }],
    skills: [{ name: 'tabbit', count: 4, sessions: 2 }],
    tools: [{ name: 'read_file', count: 8 }, { name: 'run_command', count: 6 }],
    commands: [{ name: 'npm', count: 4 }, { name: 'git', count: 2 }],
    models: [],
  },
  totalMatchingSessions: 2,
  sessions: [
    { id: cidA, title: 'Session Alpha', project: 'agy-context-dashboard', model: 'Gemini 4 Neon (High)', status: 'IDLE', archived: false, rounds: 5, steps: 20, totalTokens: 320000, currentContextTokens: 120000, cacheHitRate: 0.8, estimatedCostUsd: 0.42 },
    { id: cidB, title: 'Session Beta', project: 'agy-context-dashboard', model: 'Claude Sonnet 4.6', status: 'ARCHIVED', archived: true, rounds: 4, steps: 15, totalTokens: 220000, currentContextTokens: 90000, cacheHitRate: 0.8, estimatedCostUsd: 0.86 },
  ],
  cacheInfo: { totalScanned: 2, parsedNow: 0, cacheHits: 2, scanMs: 12, shardCount: 64 },
};

let prefs = { language: 'en', revision: 1 };
const calls = { metrics: [], audit: [], insights: [] };
const windows = {
  '5h': { available: true, remaining: 0.85, resetAt: new Date(Date.now() + 3600000).toISOString() },
  weekly: { available: true, remaining: 0.72, resetAt: new Date(Date.now() + 86400000).toISOString() },
};

const html = panelPageSource().replace(
  '<head>',
  `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; style-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'">`,
);
const appJs = panelAppSource();
const stylesCss = await readFile(join(repo, 'sidecars/panel/styles.css'), 'utf8');
const themeCss = createTheme().css(':root');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(stylesCss); return; }
  if (url.pathname === '/theme.css') { res.setHeader('Content-Type', 'text/css'); res.end(themeCss); return; }
  if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(appJs); return; }
  if (url.pathname === '/preload.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(''); return; }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      prefs = { ...prefs, ...JSON.parse(body), revision: prefs.revision + 1 };
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(prefs)); return;
  }
  if (url.pathname === '/api/metrics') {
    const cid = url.searchParams.get('conversationId') || cidA;
    const contextDetail = url.searchParams.get('contextDetail') === '1';
    calls.metrics.push({ cid, contextDetail });
    let speed = sessions[cid] || sessions[cidA];
    if (contextDetail) {
      speed = { ...speed, contextComposition: attachHostContextUsage(attachTokenBase(speed.contextComposition, tokenBase), hostUsage) };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      connection: 'live',
      serverTime: new Date().toISOString(),
      quotaUpdatedAt: new Date().toISOString(),
      groups: [{ id: 'gemini', name: 'Gemini', windows }],
      accountCredits: insightsPayload.accountCredits,
      preferences: prefs,
      speed,
    }));
    return;
  }
  if (url.pathname === '/api/session-audit') {
    const cid = url.searchParams.get('conversationId') || cidA;
    calls.audit.push({ cid });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(auditById[cid] || auditById[cidA]));
    return;
  }
  if (url.pathname === '/api/insights') {
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') || 'recent';
    calls.insights.push({ status, sort });
    const filtered = status === 'archived' ? insightsPayload.sessions.filter(s => s.archived) : insightsPayload.sessions;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...insightsPayload, sessions: filtered, totalMatchingSessions: filtered.length }));
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const launchOpts = process.env.PLAYWRIGHT_CHANNEL
  ? { channel: process.env.PLAYWRIGHT_CHANNEL, headless: true }
  : process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true };
const browser = await chromium.launch(launchOpts);
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 460, height: 700 } });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(base + '/');
  await page.locator('#strip-tps').waitFor();

  // 1. Plain poll on Speed tab never triggers contextDetail, audit, or insights
  assert.equal(calls.metrics.some(c => c.contextDetail), false);
  assert.equal(calls.audit.length, 0);
  assert.equal(calls.insights.length, 0);
  assert.equal(await page.locator('#account-credits-badge').textContent(), '500P · 100F');

  // 2. Open Context tab -> 8-category breakdown + Bar/List toggle + GetTokenBase drilldown + Trend Total/Delta
  await page.locator('#context-tab').click();
  await page.locator('#panel-context-composition').waitFor({ state: 'visible' });
  await page.locator('#panel-composition-source').filter({ hasText: 'host 8-category' }).waitFor();
  assert.equal(await page.locator('#panel-composition-meter i').count(), 9); // 8 categories + remaining

  await page.locator('#comp-view-list').click();
  assert.equal(await page.locator('#panel-composition-legend').evaluate(el => el.classList.contains('is-list')), true);
  assert.match(await page.locator('#panel-composition-legend').textContent(), /System prompt.*exact/);

  await page.locator('#token-base-toggle').click();
  await page.locator('#token-base-tree').waitFor({ state: 'visible' });
  assert.match(await page.locator('#token-base-tree').textContent(), /~\/\.gemini\/config\/rules\/team-resident\.md/);
  await page.locator('.drilldown-group-btn', { hasText: 'MCP tools' }).click();
  await page.locator('.drilldown-group-btn', { hasText: 'openviking' }).click();
  assert.match(await page.locator('#token-base-tree').textContent(), /remember/);

  await page.locator('#trend-mode-delta').click();
  assert.ok(await page.locator('#panel-trend-svg .trend-bar-neg').count() >= 1);
  assert.match(await page.locator('#panel-trend-markers').textContent(), /Compaction: 120K → 35K \(-85K reclaimed\)/);

  // 3. On-Demand Session Audit (Files -> step jump, Commands, Steps + filters)
  assert.equal(calls.audit.length, 0);
  await page.locator('#context-audit-toggle').click();
  await page.locator('#panel-audit-section').waitFor({ state: 'visible' });
  await page.locator('#audit-pane-files .audit-row').first().waitFor();
  assert.equal(calls.audit.length, 1);
  assert.match(await page.locator('#audit-pane-files').textContent(), /app\.js.*\+14.*-3/);

  await page.locator('#audit-tab-commands').click();
  await page.locator('#audit-pane-commands .audit-row').first().waitFor();
  assert.match(await page.locator('#audit-pane-commands').textContent(), /npm test.*exit 0/);

  await page.locator('#audit-tab-files').click();
  await page.locator('.audit-step-link', { hasText: 'S2' }).click();
  await page.locator('#audit-pane-steps').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#audit-steps-list [data-step-index="2"]').evaluate(el => el.classList.contains('is-highlighted')), true);
  await page.locator('[data-step-filter="thinking"]').click();
  assert.equal(await page.locator('#audit-steps-list .audit-row').count(), 1);

  // 4. Cross-Session Insights tab
  assert.equal(calls.insights.length, 0);
  await page.locator('#view-insights-tab').click();
  await page.locator('#insights-view').waitFor({ state: 'visible' });
  await page.locator('#insights-kpis .kpi-card').first().waitFor();
  assert.equal(calls.insights.length, 1);
  assert.match(await page.locator('#insights-kpis').textContent(), /540K/);
  assert.match(await page.locator('#insights-kpis').textContent(), /\$1\.28/);
  assert.match(await page.locator('#insights-dist-skills').textContent(), /tabbit/);

  await page.locator('#heatmap-metric-tokens').click();
  assert.equal(await page.locator('#heatmap-metric-tokens').getAttribute('aria-pressed'), 'true');

  await page.locator('#insights-status-filter').selectOption('archived');
  await page.locator('#insights-sessions-list .session-row').filter({ hasText: 'Session Beta' }).waitFor();
  await page.locator('#insights-sessions-list .session-row').first().click();
  await page.locator('#context-card').waitFor({ state: 'visible' });
  await page.locator('#context-model').filter({ hasText: 'Claude Sonnet 4.6 (Thinking)' }).waitFor();
  assert.equal(await page.locator('#context-model').textContent(), 'Claude Sonnet 4.6 (Thinking)');
  await page.locator('#strip-session-reset').click();
  await page.locator('#context-model').filter({ hasText: 'Gemini 4 Neon (High)' }).waitFor();

  // 5. Language switching + narrow viewport overflow check
  await page.locator('#language-toggle').click();
  await page.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await page.locator('#view-insights-tab').filter({ hasText: '全局洞察' }).waitFor();
  await page.locator('#view-insights-tab').click();
  assert.match(await page.locator('#insights-kpis').textContent(), /预估费用/);

  await page.setViewportSize({ width: 280, height: 700 });
  const overflow = await page.locator('.widget').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false);

  assert.deepEqual(errors, [], 'Trusted Types CSP must produce zero page errors');
  console.log(JSON.stringify({ ok: true, auditCalls: calls.audit.length, insightsCalls: calls.insights.length, pageErrors: errors }));
} finally {
  await browser.close();
  server.close();
}
