// End-to-end browser verification for #16 multi-agent orchestration, pool rollup,
// two-phase breakdown, context/tool breakdown, bloat warnings, and zero idle DOM churn.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { panelAppSource, panelPageSource } from '../sidecars/panel/panel-source.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { aggregateTaskUsage, taskRecords } from '../sidecars/panel/task-usage.mjs';

const require = createRequire(import.meta.url);
const createTheme = require('../compat/theme.cjs');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const sources = await Promise.all(['compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'compat/usage-ui.cjs'].map(p => readFile(join(repo, p), 'utf8')));

const coord = '11111111-1111-1111-1111-111111111111';
const worker = '22222222-2222-2222-2222-222222222222';
const mon = '33333333-3333-3333-3333-333333333333';

const coordRaw = {
  trajectory: {
    cascadeId: coord,
    steps: [
      { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
      { type: 'CORTEX_STEP_TYPE_GENERIC', metadata: { toolCall: { name: 'grep_search', argumentsJson: '{"Query":"abc"}' }, toolSource: 'CORTEX_COMPONENT_SOURCE_BUILTIN' } },
    ],
    generatorMetadata: [
      { chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '2s', timeToFirstToken: '1s', usage: { responseId: 'p1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 120000, cacheReadTokens: 0, outputTokens: 4000, responseOutputTokens: 1000, thinkingOutputTokens: 3000 }, chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 124000, maxContextTokens: 512000 } } } },
      { chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '1s', timeToFirstToken: '0.5s', usage: { responseId: 'e1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10000, cacheReadTokens: 80000, outputTokens: 2000, responseOutputTokens: 1500, thinkingOutputTokens: 500 }, chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 92000, maxContextTokens: 512000 } } } },
    ],
  },
};

const baseMetrics = trajectoryMetrics(coordRaw);
const taskUsage = aggregateTaskUsage(
  taskRecords(coordRaw, coord),
  [
    { rows: taskRecords({ trajectory: { steps: [], generatorMetadata: [{ chatModel: { model: 'MODEL_PLACEHOLDER_M405', usage: { responseId: 'w1', apiProvider: 'API_PROVIDER_ANTHROPIC_VERTEX', inputTokens: 50000, cacheReadTokens: 10000, outputTokens: 5000, thinkingOutputTokens: 1200 } } }] } }, worker), role: 'worker', label: 'Worker (feat)' },
    { rows: taskRecords({ trajectory: { steps: [], generatorMetadata: [{ chatModel: { model: 'MODEL_GOOGLE_GEMINI_INTERNAL_BYOM', usage: { responseId: 'm1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 1000, outputTokens: 200 } } }] } }, mon), role: 'monitor', label: 'Monitor' },
  ],
  { subagents: 2, loadedSubagents: 2, state: 'ready', rootRole: 'coordinator', rootLabel: 'Coordinator' },
);
const transcriptStats = {
  version: 1, status: 'ready', complete: true,
  userTokens: 1500, assistantTokens: 5500, responseTokens: 2000, thinkingTokens: 3500,
  toolTokens: 64000, toolCallTokens: 800, systemTokens: 2000, totalTokens: 73000,
  matchedSteps: 12, compactionMarkers: 1, imageSteps: 0, heavyToolCalls: 2,
  toolBreakdown: [
    { name: 'view_file', calls: 3, argTokens: 120, resultTokens: 58000, maxResultTokens: 55000, source: 'builtin' },
    { name: 'grep_search', calls: 4, argTokens: 680, resultTokens: 6000, maxResultTokens: 4000, source: 'builtin' },
  ],
  bloatWarnings: [
    { kind: 'tool-result', tool: 'view_file', stepIndex: 4, tokens: 55000, severity: 'critical' },
  ],
};
const usageFixture = {
  accountKey: 'fixture', today: '2026-11-21', timeZone: 'Asia/Shanghai',
  models: ['Orchestrator (Neon)', 'Claude Sonnet 5.5 (High)', 'Gemini (Internal BYOM)'],
  days: [{
    date: '2026-11-21',
    models: {
      'Orchestrator (Neon)': { uncached: 120000, cacheRead: 0, cacheWrite: 0, output: 4000, total: 124000, requests: 1 },
      'Claude Sonnet 5.5 (High)': { uncached: 50000, cacheRead: 10000, cacheWrite: 0, output: 5000, total: 65000, requests: 1 },
      'Gemini (Internal BYOM)': { uncached: 1000, cacheRead: 0, cacheWrite: 0, output: 200, total: 1200, requests: 1 },
    },
  }],
  todayTokens: 190200, weekTokens: 190200, monthTokens: 190200, totalTokens: 190200, requests: 3,
  firstDate: '2026-11-21', syncing: false, unknownRequests: 0, partialRequests: 0, unreadableFiles: 0,
};

let prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
const snapshot = () => ({
  connection: 'live', serverTime: new Date().toISOString(), quotaUpdatedAt: new Date().toISOString(), preferences: prefs,
  groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.7 }, weekly: { available: true, remaining: 0.8 } } }],
  speed: { ...baseMetrics, taskUsage, transcriptStats },
  usage: usageFixture,
});

const panelHtml = panelPageSource(), panelCode = panelAppSource();
const inlineHtml = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#17181a;color:#ddd;font:13px sans-serif;padding:50px}.rounded-composer{max-width:900px;margin:260px auto 0;background:#27282a;padding:12px;border-radius:18px}.editor{height:45px}.actions{display:flex;align-items:center;gap:5px}.left{display:flex;flex:1;min-width:0;gap:6px}.right{display:flex;gap:5px}button{background:transparent;border:0;color:inherit;height:28px}</style></head><body><div class="rounded-composer"><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Orchestrator (Neon)</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div><script>
history.replaceState({}, '', '/c/${coord}');
window.agPulseHost = { getMetrics: async () => (window.__snap()), getPreferences: async () => (window.__prefs()), setPreferences: async x => Object.assign(window.__prefs(), x) };
window.__agPulseI18nFactory = (${extract(sources[0])});
window.__agPulseThemeFactory = (${extract(sources[1])});
window.__agPulseUsageFactory = (${extract(sources[3])});
(${extract(sources[2])})();
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/metrics') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(snapshot())); return; }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') { let b = ''; for await (const c of req) b += c; prefs = { ...prefs, ...JSON.parse(b), revision: prefs.revision + 1 }; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(prefs)); return;
  }
  if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(panelCode); return; }
  if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(join(repo, 'sidecars/panel/styles.css'))); return; }
  if (url.pathname === '/theme.css') { res.setHeader('Content-Type', 'text/css'); res.end(createTheme().css(':root')); return; }
  if (url.pathname === '/preload.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(''); return; }
  if (url.pathname === '/inline') {
    prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(inlineHtml.replace('window.__snap()', JSON.stringify(snapshot())).replaceAll('window.__prefs()', JSON.stringify(prefs)));
    return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end(panelHtml);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true });
const errors = [];

try {
  // 1. Panel checks
  const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.locator('#cache-tab').click();
  await page.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await page.locator('#orchestration-breakdown summary').click();
  const orchText = await page.locator('#orch-body').textContent();
  assert.ok(orchText.includes('Gemini') && orchText.includes('Claude / 3p') && orchText.includes('Local / BYOM'), orchText);
  assert.ok(orchText.includes('Coordinator') && orchText.includes('Worker') && orchText.includes('Monitor'), orchText);
  assert.ok(orchText.includes('Orchestrator (Neon)') && orchText.includes('Claude Sonnet 5.5 (High)'), orchText);
  assert.ok(orchText.includes('cache-miss surge'), orchText);

  await page.locator('#context-tab').click();
  await page.locator('#context-bloat-pill').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#context-bloat-pill').getAttribute('data-critical'), 'true');
  assert.equal(await page.locator('#context-card').evaluate(e => e.scrollHeight <= e.clientHeight + 1), true, 'Collapsed context-breakdown fits inside 580px frame');
  await page.locator('#context-breakdown summary').click();
  const ctxText = await page.locator('#ctx-breakdown-body').textContent();
  assert.ok(ctxText.includes('Thinking') && ctxText.includes('Tool args') && ctxText.includes('view_file') && ctxText.includes('55K'), ctxText);

  // Language switch updates new sections cleanly
  await page.locator('#language-toggle').click();
  await page.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await page.locator('#context-breakdown summary').filter({ hasText: '上下文与工具构成' }).waitFor();
  assert.ok((await page.locator('#ctx-breakdown-body').textContent()).includes('工具入参'));

  // Idle polling causes 0 DOM mutations on new sections
  const idleChanges = await page.evaluate(async () => {
    const changes = [];
    const obs = new MutationObserver(rs => changes.push(...rs.map(r => r.target.id || r.type)));
    obs.observe(document.getElementById('orchestration-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
    obs.observe(document.getElementById('context-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
    await new Promise(r => setTimeout(r, 2600));
    obs.disconnect();
    return changes;
  });
  assert.deepEqual(idleChanges, []);

  // 2. Inline widget + usage modal pool strip checks
  const inline = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  inline.on('pageerror', e => { errors.push(e.message); console.error('INLINE PAGEERROR:', e.message); });
  await inline.goto(base + '/inline');
  const strip = inline.locator('#ag-pulse-status-bar');
  await strip.waitFor();
  await strip.locator('[data-card=cache]').click();
  await strip.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await strip.locator('#orchestration-breakdown summary').click();
  assert.ok((await strip.locator('#orch-body').textContent()).includes('Coordinator'));
  await strip.locator('#open-usage').click();
  await strip.locator('#usage-dashboard #details-tab').click();
  await strip.locator('#usage-dashboard #pool-strip .pool-pill').first().waitFor({ state: 'visible' });
  const poolText = await strip.locator('#usage-dashboard #pool-strip').textContent();
  assert.ok(poolText.includes('Gemini') && poolText.includes('Claude / 3p') && poolText.includes('Local / BYOM'), poolText);

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ multiAgentUi: true, panel: true, inline: true, usagePoolStrip: true, pageErrors: [] }));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
