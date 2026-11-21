// Real browser regression for issue #34 single-session context composition,
// quota/context card split, dual-mode (list/bar) toggle, lazy GetTokenBase loading,
// avg cache hit rate row, SVG trend updates, and idle DOM stability.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { compositionMetrics, tokenBaseMetrics } from '../sidecars/panel/composition.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const [i18nSrc, themeSrc, widgetSrc, surfaceSrc] = await Promise.all([
  'compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'ide/surface.cjs',
].map(file => readFile(join(repo, file), 'utf8')));
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const install = `window.__agPulseSurface=(${extract(surfaceSrc)})();window.__agPulseI18nFactory=(${extract(i18nSrc)});window.__agPulseThemeFactory=(${extract(themeSrc)});(${extract(widgetSrc)})();`;

const cidA = '11111111-1111-1111-1111-111111111111';
const cidB = '22222222-2222-2222-2222-222222222222';
const tokenBase = tokenBaseMetrics({
  customizationTokenBase: {
    totalTokens: 16500,
    groups: [{ name: 'Rules', numTokens: 6600 }, { name: 'Skills', numTokens: 9300 }, { name: 'Mcp Tools', numTokens: 600 }],
  },
  customizationBudget: 20000,
  remainingBudget: 3500,
});
const makeSample = (id, values, markerKind = 'compaction') => {
  const steps = [{ type: 'CORTEX_STEP_TYPE_USER_INPUT', metadata: {} }];
  const generators = [];
  values.forEach((v, idx) => {
    const stepIdx = steps.length;
    steps.push({ type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', metadata: { modelUsage: { inputTokens: String(v), thinkingOutputTokens: '1200', responseOutputTokens: '800', outputTokens: '2000' } } });
    generators.push({
      stepIndices: [stepIdx],
      chatModel: {
        modelDisplayName: 'Gemini 4 Neon (High)',
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 120000, maxContextTokens: 512000 } },
        usage: { messageId: `${id}-m${idx}`, inputTokens: String(Math.round(v * 0.2)), cacheReadTokens: String(Math.round(v * 0.8)), outputTokens: '2000', responseOutputTokens: '800', thinkingOutputTokens: '1200', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        streamingDuration: '2s',
      },
    });
    if (idx === 1) steps.push({ type: markerKind === 'checkpoint' ? 'CORTEX_STEP_TYPE_CHECKPOINT' : 'CORTEX_STEP_TYPE_COMPACTION', metadata: {} });
  });
  const base = trajectoryMetrics({ trajectory: { cascadeId: id, steps, generatorMetadata: generators } });
  base.transcriptStats = {
    status: 'partial', matchedSteps: steps.length, userTokens: 3000, assistantTokens: 4000,
    toolTokens: 42000, systemTokens: 1500, compactionMarkers: markerKind === 'compaction' ? 1 : 0, totalTokens: 50500,
  };
  const comp = compositionMetrics({
    context: base.context,
    steps,
    generators,
    transcript: base.transcriptStats,
  });
  return { base, comp };
};

const sampleA = makeSample(cidA, [30000, 75000, 42000, 88000], 'compaction');
const sampleB = makeSample(cidB, [95000, 80000, 60000, 35000], 'checkpoint');

const css = `body{margin:0;background:#202124;color:#eee;font:12px Arial}.panel{width:100%;box-sizing:border-box;padding:16px}.box{border-radius:16px;background:#292a2d;padding:4px}.editor{height:40px;padding:8px}.row{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px}.native{display:flex;flex:1;min-width:0;align-items:center;gap:1px}.model-wrap{display:flex;min-width:0;gap:4px}.model{display:flex;min-width:0;align-items:center;padding:0 8px;gap:4px;height:28px}.protected{flex:none;width:28px;height:28px;border:0;color:inherit;background:transparent}.controls{display:flex;flex:none;gap:4px}.top{height:240px}`;
const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'; style-src 'unsafe-inline'; require-trusted-types-for 'script'; trusted-types 'none'"><style>${css}</style></head><body><div class="antigravity-agent-side-panel panel"><div class="top"></div><div id="conversation" role="region"><div id="antigravity.agentSidePanelInputBox" class="box"><div class="editor" contenteditable="true" role="combobox"></div><div class="row"><div class="native"><button class="protected">＋</button><div class="model-wrap"><button class="model" data-testid="model-selector-trigger">Gemini 4 Neon (High)</button></div></div><div class="controls"><button class="protected">➤</button></div></div></div></div></div><script>
const box=document.getElementById('antigravity.agentSidePanelInputBox'),panel=document.querySelector('.panel');
const owner={props:{cascadeId:${JSON.stringify(cidA)}},__k:[]},vnode={type:'div',__e:box,props:{id:box.id},__:owner,__k:[]};owner.__k=[vnode];panel.__k=owner;
window.testOwner=owner;
window.testPrefs={language:'en',languageGuideDismissed:true,quotaDisplay:'both',revision:1};
window.testTokenBaseBroken=false;
window.testTokenBaseFetched=false;
window.testRequests=[];
const samples=${JSON.stringify({ [cidA]: sampleA, [cidB]: sampleB })};
const tokenBase=${JSON.stringify(tokenBase)};
const attach=(comp)=>{
  if(!window.testTokenBaseFetched)return comp;
  const custom=tokenBase.totalTokens,max=comp.maxTokens,used=comp.usedTokens;
  const room=Math.max(0,used-custom);
  const sum=comp.parts.reduce((n,[,v])=>n+v,0);
  const scale=sum>0?room/sum:0;
  const segs=[{id:'customization',tokens:custom,fraction:custom/max}];
  for(const [id,val] of comp.parts)if(val>0)segs.push({id,tokens:val,fraction:(val*scale)/max});
  const filled=segs.reduce((n,s)=>n+s.fraction,0);
  segs.push({id:'remaining',tokens:Math.max(0,max-used),fraction:Math.max(0,1-filled)});
  return {...comp,customization:{available:true,tokens:custom,budget:tokenBase.budget,remainingBudget:tokenBase.remainingBudget,groups:tokenBase.groups},segments:segs};
};
const windows={'5h':{remaining:0.874,available:true,resetAt:new Date(Date.now()+3600000).toISOString()},weekly:{remaining:0.399,available:true,resetAt:new Date(Date.now()+86400000).toISOString()}};
window.agPulseHost={
  getPreferences:async()=>window.testPrefs,
  setPreferences:async input=>(window.testPrefs={...window.testPrefs,...input,revision:window.testPrefs.revision+1}),
  getMetrics:async(input={})=>{
    window.testRequests.push({conversationId:input.conversationId||null,contextDetail:input.contextDetail===true});
    if(input.contextDetail===true&&!window.testTokenBaseBroken)window.testTokenBaseFetched=true;
    const s=samples[input.conversationId];
    return {
      connection:'live',
      preferences:window.testPrefs,
      groups:[{id:'gemini',name:'Gemini',windows}],
      quotaUpdatedAt:'2026-11-21T08:00:00Z',
      speed:s?{...s.base,contextComposition:attach(s.comp)}:null,
    };
  },
};
${install}
</script></body></html>`;

const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.getElementById('context-percent')?.textContent === '23%');

  // 1. Plain polls never request contextDetail; quota chip opens #quota-card without contextDetail
  await page.locator('#ag-pulse-status-bar').locator('[data-card="quota"]').click();
  await page.locator('#ag-pulse-status-bar').locator('#quota-card').waitFor({ state: 'visible' });
  const quotaOnlyCheck = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    return {
      detailCalls: window.testRequests.filter(r => r.contextDetail).length,
      quotaOpen: !sr.getElementById('quota-card').hidden,
      contextHidden: sr.getElementById('context-card').hidden,
      contextHasQuota: Boolean(sr.getElementById('context-card').querySelector('.quota-details')),
    };
  });
  assert.equal(quotaOnlyCheck.detailCalls, 0, 'Opening quota card must not trigger contextDetail:true');
  assert.equal(quotaOnlyCheck.quotaOpen, true);
  assert.equal(quotaOnlyCheck.contextHidden, true);
  assert.equal(quotaOnlyCheck.contextHasQuota, false, 'Context card must not render quota details');
  await page.keyboard.press('Escape');

  // 2. Opening context chip with broken GetTokenBase triggers contextDetail and degrades silently
  await page.evaluate(() => { window.testTokenBaseBroken = true; });
  await page.locator('#ag-pulse-status-bar').locator('[data-card="context"]').click();
  await page.locator('#ag-pulse-status-bar').locator('#context-card').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.testRequests.some(r => r.contextDetail));
  const degraded = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const rows = [...sr.querySelectorAll('#composition-list .composition-row')];
    const pcts = rows.map(r => parseFloat(r.querySelector('.composition-row-pct').textContent));
    return {
      source: sr.getElementById('composition-source').textContent,
      trackHidden: sr.getElementById('context-track').hidden,
      listHidden: sr.getElementById('composition-list').hidden,
      legendHidden: sr.getElementById('composition-legend').hidden,
      rowLabels: rows.map(r => r.querySelector('.composition-row-label').textContent),
      descending: pcts.every((v, i) => i === 0 || pcts[i - 1] >= v),
      compactionPillText: sr.getElementById('context-compaction-pill').textContent,
      compactionPillSvg: sr.getElementById('context-compaction-pill').querySelector('svg'),
      cacheRowHidden: sr.getElementById('context-cache-row').hidden,
      cacheRate: sr.getElementById('context-cache-rate').textContent,
      markerTitle: sr.querySelector('#context-trend-svg .trend-marker-group title')?.textContent,
      pathD: sr.querySelector('#context-trend-svg .trend-line')?.getAttribute('d'),
      sample: sr.getElementById('trend-sample').textContent,
    };
  });
  assert.equal(degraded.source, 'Injection — · steps + logged text');
  assert.equal(degraded.trackHidden, true, 'Plain track is hidden when composition meter is active');
  assert.equal(degraded.listHidden, false, 'List mode is active by default');
  assert.equal(degraded.legendHidden, true);
  assert.equal(degraded.descending, true, 'List rows must be sorted descending by share');
  assert.equal(degraded.compactionPillText, '1× compacted');
  assert.equal(degraded.compactionPillSvg, null, 'Compaction pill must be plain text with no SVG icon');
  assert.equal(degraded.cacheRowHidden, false);
  assert.equal(degraded.cacheRate, '80.0%');
  assert.equal(degraded.markerTitle, 'Compaction: 75,000 → 42,000');
  assert.equal(degraded.sample, '4 requests');
  assert.ok(degraded.pathD && degraded.pathD.startsWith('M'));

  // 3. Recover GetTokenBase -> unfolds Rules, Skills, MCP tools in list mode
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.testTokenBaseBroken = false; window.testTokenBaseFetched = true; });
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('composition-source').textContent.includes('16.5K'));
  await page.locator('#ag-pulse-status-bar').locator('[data-card="context"]').click();
  await page.locator('#ag-pulse-status-bar').locator('#context-card').waitFor({ state: 'visible' });
  const enrichedList = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const rows = [...sr.querySelectorAll('#composition-list .composition-row')];
    return {
      labels: rows.map(r => r.querySelector('.composition-row-label').textContent),
      skillsTitle: rows.find(r => r.querySelector('.composition-row-label').textContent === 'Skills')?.getAttribute('title'),
      meterClasses: [...sr.getElementById('composition-meter').children].map(el => el.className),
    };
  });
  assert.ok(enrichedList.labels.includes('Rules') && enrichedList.labels.includes('Skills') && enrichedList.labels.includes('MCP tools'));
  assert.match(enrichedList.skillsTitle, /^Skills: 9,300 toks .* · exact$/);
  assert.ok(enrichedList.meterClasses.includes('composition-seg-group-skills'));

  // 4. Toggle List -> Bar -> List and verify persistence in localStorage
  await page.locator('#ag-pulse-status-bar').locator('[data-composition-view="bar"]').click();
  await page.waitForTimeout(250);
  const barState = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const card = sr.getElementById('context-card');
    return {
      cardVisible: Boolean(card && !card.hidden && card.offsetHeight > 0),
      listHidden: sr.getElementById('composition-list').hidden,
      legendHidden: sr.getElementById('composition-legend').hidden,
      legendCount: sr.getElementById('composition-legend').children.length,
      stored: localStorage.getItem('ag-pulse-composition-view'),
    };
  });
  assert.equal(barState.cardVisible, true);
  assert.equal(barState.listHidden, true);
  assert.equal(barState.legendHidden, false);
  assert.ok(barState.legendCount >= 6);
  assert.equal(barState.stored, 'bar');
  await page.locator('#ag-pulse-status-bar').locator('[data-composition-view="list"]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('ag-pulse-composition-view')), 'list');

  // 5. Steady-state idle DOM stability across a full 2.6s poll window (must be 0 mutations)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__compIdleMutations = 0;
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    window.__compObs = new MutationObserver(list => { window.__compIdleMutations += list.length; });
    window.__compObs.observe(sr, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  await page.waitForTimeout(2600);
  const idleMutations = await page.evaluate(() => { window.__compObs.disconnect(); return window.__compIdleMutations; });
  assert.equal(idleMutations, 0, 'steady-state polling must emit zero idle DOM mutations');

  // 6. Switching conversations with identical point count updates SVG trend path & marker kind
  await page.evaluate(nextId => { window.testOwner.props.cascadeId = nextId; }, cidB);
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('#context-trend-svg .trend-marker-group title')?.textContent.includes('Checkpoint'));
  const switched = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    return {
      pathD: sr.querySelector('#context-trend-svg .trend-line')?.getAttribute('d'),
      markerTitle: sr.querySelector('#context-trend-svg .trend-marker-group title')?.textContent,
    };
  });
  assert.notEqual(switched.pathD, degraded.pathD, 'trend SVG path must re-render when point values change with same length');
  assert.equal(switched.markerTitle, 'Checkpoint: 80,000 → 60,000');

  // 7. Language switching translates group labels, toggle pills, cache row, and marker title
  await page.locator('#ag-pulse-status-bar').locator('[data-card="context"]').click();
  await page.locator('#ag-pulse-status-bar').locator('#card-language-zh').click();
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('composition-source').textContent.includes('步级桶 + 日志估算'));
  const zhCheck = await page.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const labels = [...sr.querySelectorAll('#composition-list .composition-row-label')].map(n => n.textContent);
    return {
      source: sr.getElementById('composition-source').textContent,
      labels,
      viewBtnList: sr.querySelector('[data-composition-view="list"]').textContent,
      viewBtnBar: sr.querySelector('[data-composition-view="bar"]').textContent,
      cacheLabel: sr.querySelector('#context-cache-row span').textContent,
      markerTitle: sr.querySelector('#context-trend-svg .trend-marker-group title')?.textContent,
    };
  });
  assert.equal(zhCheck.source, '定制注入 16.5K · 步级桶 + 日志估算');
  assert.ok(zhCheck.labels.includes('规则') && zhCheck.labels.includes('技能') && zhCheck.labels.includes('MCP 工具'));
  assert.equal(zhCheck.viewBtnList, '清单');
  assert.equal(zhCheck.viewBtnBar, '条形');
  assert.equal(zhCheck.cacheLabel, '平均缓存命中率');
  assert.equal(zhCheck.markerTitle, '检查点: 80,000 → 60,000');

  // Verify zh-CN plain-text compaction badge without SVG icon on cidA
  await page.evaluate(nextId => { window.testOwner.props.cascadeId = nextId; }, cidA);
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('context-compaction-pill').textContent === '压缩 1 次');
  const zhCompaction = await page.evaluate(() => {
    const pill = document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('context-compaction-pill');
    return { text: pill.textContent, hasSvg: Boolean(pill.querySelector('svg')) };
  });
  assert.equal(zhCompaction.text, '压缩 1 次');
  assert.equal(zhCompaction.hasSvg, false);

  assert.deepEqual(errors, [], 'Trusted Types CSP must produce zero page errors');
  console.log(JSON.stringify({ ok: true, idleMutations, zhLabels: zhCheck.labels, markerTitle: zhCheck.markerTitle, pageErrors: errors }));
} finally {
  await browser.close();
  server.close();
}
