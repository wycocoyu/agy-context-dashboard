import { percent, rate, count, smallCount, elapsed, countdown, resetDate } from './format.mjs';
import { createI18n } from './i18n.js';
import { createTheme } from './theme.js';
function initPanel(){
if(!document.querySelector('.widget')||window.__agPulsePanelInstalled)return;
window.__agPulsePanelInstalled=true;
const theme=createTheme();
let themeController=theme.attach(document.documentElement);
window.addEventListener('pagehide',()=>themeController.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)themeController=theme.attach(document.documentElement);});
const localGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const localSet=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const language=createI18n(localGet('ag-pulse-language'));
const t=language.t;

const $ = id => document.getElementById(id);
const text=(id,value)=>{const element=$(id);if(element&&element.textContent!==String(value))element.textContent=String(value);};
const hidden=(id,value)=>{const element=$(id);if(element&&element.hidden!==value)element.hidden=value;};
const setAttr=(el,name,value)=>{if(!el)return;if(value===null){if(el.hasAttribute(name))el.removeAttribute(name);}else if(el.getAttribute(name)!==String(value))el.setAttribute(name,String(value));};
const setTip=(el,tip)=>setAttr(el,'title',tip);
const compact=n=>{if(typeof n!=='number'||!Number.isFinite(n))return '—';for(const [base,suffix,nextBase,nextSuffix]of [[1e12,'T',0,''],[1e9,'B',1e12,'T'],[1e6,'M',1e9,'B'],[1e3,'K',1e6,'M']])if(n>=base){const scaled=n/base,rounded=Number(scaled.toFixed(1));return nextBase&&rounded*base>=nextBase?`1${nextSuffix}`:`${rounded}${suffix}`;}return String(n);};
const tokUnit=n=>n===1?'tok':'toks';
const compactDetail=n=>{if(typeof n!=='number'||!Number.isFinite(n))return '—';for(const [base,suffix,nextBase,nextSuffix]of [[1e12,'T',0,''],[1e9,'B',1e12,'T'],[1e6,'M',1e9,'B'],[1e3,'K',1e6,'M']])if(n>=base){const scaled=n/base,rounded=Number(scaled.toFixed(scaled<10?2:1));return nextBase&&rounded*base>=nextBase?`1${nextSuffix}`:`${rounded}${suffix}`;}return String(n);};
const formatUsd=n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)return '—';if(n>0&&n<0.01)return '<$0.01';if(n>=100)return `$${n.toFixed(0)}`;return `$${n.toFixed(2)}`;};
const chips = [...document.querySelectorAll('[data-card]')];
const viewTabs = [...document.querySelectorAll('[data-panel-view]')];
let snapshot = null, selectedGroup = null, group = null, autoGroupId = null, lastModelSig = null;
let pending = false, timer = null, serverOffset = 0, lastExpiredRefresh = 0;
let panelView='session',selectedCard='speed',cardMotion=null;
let inspectedConversationId=null,lastContextDetailAt=0;
let refreshEpoch=0,inFlightRefreshEpoch=-1,inFlightNeedDetail=false,inFlightUsageSync=false,queuedRefresh=false,queuedRefreshForce=false,queuedRefreshUsageSync=false;
let insightsEpoch=0,queuedInsights=false,queuedInsightsForce=false;
let auditEpoch=0,scopeRequestEpoch=0,didInitialUsageSync=false,didSyncUsageScope=false,usageGuideDismissed=false;
let compositionView='bar',trendMode='total',tokenBaseExpanded=false,stepsDrawerOpen=false,swarmRosterFilter='active';
const expandedDrilldownGroups=new Set(['Rules']);
const expandedDrilldownMore=new Set();
const expandedMcpServers=new Set();
let auditOpen=false,auditTab='files',auditStepFilter='all',auditData=null,auditConvId=null,auditLoading=false,auditError=null,highlightedStepIndex=null;
let insightsData=null,insightsLoading=false,insightsError=null,heatmapMetric='sessions',selectedHeatmapDate=null,insightsLoadedDate=null,insightsSearchTimer=null;
let refreshRequest=null,manualRequest=null;
let relaunchBusy=false,relaunchStatusKey='',autoRelaunchState={busy:false,error:false,revision:-1,value:true};
const host = window.sidecar;
if (!host) document.body.classList.add('standalone');
const transportFetch=(url,init)=>(host?.fetch?host.fetch.bind(host):fetch)(url,init);
let usageDashboard=null;
const syncUsageGuide=value=>{
  if(value?.usageGuideDismissed===true){
    usageGuideDismissed=true;
    usageDashboard?.syncGuideDismissed();
  }
};
const preferenceRequest=async(input)=>{
  const response=await transportFetch('/api/preferences',input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{cache:'no-store'});
  if(!response.ok)throw new Error('Preferences unavailable');
  const saved=await response.json();
  syncUsageGuide(saved);
  return saved;
};
const connectPreferences=()=>language.connectPreferences({read:()=>preferenceRequest(),write:preferenceRequest,
  cache:value=>localSet('ag-pulse-language',value),changed:()=>{localize();render();renderInsightsView();renderAuditSection();updateCountdowns();usageDashboard?.renderIfVisible?.();}});
let languagePicker=null;
let preferences=connectPreferences();
const speedStyle=language.connectSpeedStyle({initial:localGet('ag-pulse-speed-style'),cache:value=>localSet('ag-pulse-speed-style',value),write:preferenceRequest,
  changed:()=>{applySpeedStyle();localize();render();}});
const hostUiLocalization=language.connectHostUiLocalization({initial:localGet('ag-pulse-host-ui-localization')==='true',cache:value=>localSet('ag-pulse-host-ui-localization',value?'true':'false'),write:preferenceRequest,
  changed:()=>{localize();}});
const readBarColorsCache=()=>{try{const raw=localGet('ag-pulse-bar-colors');return raw?JSON.parse(raw):null;}catch{return null;}};
const barColorsPref=language.connectBarColors({initial:readBarColorsCache(),cache:value=>localSet('ag-pulse-bar-colors',JSON.stringify(value)),write:preferenceRequest,
  changed:()=>{themeController?.setBarColors?.(barColorsPref.colors);}});
const themeModePref=language.connectThemeMode({initial:localGet('ag-pulse-theme-mode'),cache:value=>localSet('ag-pulse-theme-mode',value),write:preferenceRequest,
  changed:()=>{themeController?.setThemeMode?.(themeModePref.value);}});
themeController?.setThemeMode?.(themeModePref.value);
themeController?.setBarColors?.(barColorsPref.colors);
const usageScope=language.connectUsageScope({initial:localGet('ag-pulse-usage-scope'),cache:value=>localSet('ag-pulse-usage-scope',value),write:preferenceRequest,
  changed:()=>{usageDashboard?.renderIfVisible?.();}});
const usageFactory=typeof createUsageDashboard==='function'?createUsageDashboard:window.__agPulseUsageFactory;
const usagePanelRoot=$('usage-panel-view');
if(usageFactory&&usagePanelRoot){
  usageDashboard=usageFactory({
    root:usagePanelRoot,
    language,
    hostLabel:'Antigravity',
    embedded:true,
    showHeaderTabs:false,
    themeHost:document.documentElement,
    guideDismissed:usageGuideDismissed,
    onDismissGuide:async()=>{
      const saved=await preferenceRequest({usageGuideDismissed:true});
      if(saved?.usageGuideDismissed!==true)throw new Error('Usage guide could not be saved');
    },
    onLanguage:next=>preferences.choose(next),
    onRefresh:()=>refreshManually(true),
    onTabChange:next=>showPanelView(next==='details'?'models':'activity',{fromUsageUi:true}),
    onScope:async next=>{
      didSyncUsageScope=true;
      const ticket=++scopeRequestEpoch,save=usageScope.choose(next);
      try{
        const params=new URLSearchParams({usageOnly:'1',usageScope:next});
        const response=await transportFetch(`/api/metrics?${params}`,{cache:'no-store'});
        if(response.ok){
          const result=await response.json();
          if(ticket===scopeRequestEpoch&&result?.usage){
            if(snapshot)snapshot={...snapshot,usage:result.usage};
            renderUsageSummary(result.usage);
            usageDashboard?.update(result.usage);
          }
        }
      }finally{
        await save;
      }
    },
  });
}
function applySpeedStyle(){
  document.documentElement.dataset.speedStyle=speedStyle.style;
  $('speed-hero-icon')?.setAttribute('href',speedStyle.style==='cat'?'#gauge':'#pulse');
}
function activeConversationId(){
  return inspectedConversationId||host?.conversationId||null;
}
function setInspectedConversation(id){
  inspectedConversationId=id||null;
  swarmRosterFilter='active';
  expandedDrilldownMore.clear();
  auditOpen=false;auditData=null;auditConvId=null;auditError=null;highlightedStepIndex=null;
  renderAuditSection();
  lastContextDetailAt=0;
  refreshEpoch+=1;auditEpoch+=1;
}

function showPanelView(nextView,{fromUsageUi=false}={}){
  if(!['session','activity','models','insights'].includes(nextView))return;
  const prevView=panelView;
  panelView=nextView;
  for(const tab of viewTabs){
    const active=tab.dataset.panelView===nextView;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex=active?0:-1;
  }
  const isSession=nextView==='session';
  const isUsage=nextView==='activity'||nextView==='models';
  const isInsights=nextView==='insights';
  if(!isInsights)hideHeatmapTip();
  hidden('session-status-strip',!isSession);
  hidden('session-card-stage',!isSession);
  const wasUsage=prevView==='activity'||prevView==='models';
  const targetUsageTab=nextView==='models'?'details':'overview';
  if(isUsage&&!wasUsage&&!fromUsageUi)usageDashboard?.setTab(targetUsageTab);
  hidden('usage-panel-view',!isUsage);
  hidden('insights-view',!isInsights);
  if(isInsights){if(!insightsData&&!insightsLoading)void loadInsights(false);else renderInsightsView();return;}
  if(isUsage){
    $('usage-panel-view')?.setAttribute('aria-labelledby',nextView==='models'?'view-models-tab':'view-activity-tab');
    if(wasUsage){if(!fromUsageUi)usageDashboard?.setTab(targetUsageTab);}
    else usageDashboard?.open(snapshot?.usage||null);
    const needSync=!didInitialUsageSync||!snapshot?.usage;
    didInitialUsageSync=true;
    void refresh(false,needSync?{usageSync:true}:{});
    return;
  }
  void refresh(false);
}
for(const tab of viewTabs){
  tab.addEventListener('click',()=>showPanelView(tab.dataset.panelView));
  tab.addEventListener('keydown',event=>{
    const current=viewTabs.indexOf(tab);let next;
    if(event.key==='ArrowRight')next=(current+1)%viewTabs.length;else if(event.key==='ArrowLeft')next=(current+viewTabs.length-1)%viewTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=viewTabs.length-1;else return;
    event.preventDefault();showPanelView(viewTabs[next].dataset.panelView);viewTabs[next].focus();
  });
}

function showCard(name,animate=false) {
  const cards=['speed','cache','quota','context'];
  if(!cards.includes(name))return;
  const changed=selectedCard!==name;selectedCard=name;
  cardMotion?.cancel();cardMotion=null;
  for (const chip of chips){const selected=chip.dataset.card===name;chip.setAttribute('aria-selected',String(selected));chip.tabIndex=selected?0:-1;}
  for (const nameKey of cards) $(`${nameKey}-card`).hidden = name !== nameKey;
  if(changed&&animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)cardMotion=$(`${name}-card`).animate([{opacity:.6,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
  if(name==='context'&&changed){
    lastContextDetailAt=0;
    void refresh(false);
  }
}
for (const chip of chips) {
  chip.addEventListener('click', event => showCard(chip.dataset.card,event.detail>0));
  chip.addEventListener('keydown',event=>{
    const current=chips.indexOf(chip);let next;
    if(event.key==='ArrowRight')next=(current+1)%chips.length;else if(event.key==='ArrowLeft')next=(current+chips.length-1)%chips.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=chips.length-1;else return;
    event.preventDefault();showCard(chips[next].dataset.card);chips[next].focus();
  });
}
function localize(){
  document.documentElement.lang=language.language;
  for(const e of document.querySelectorAll('[data-i18n]')){const value=t(e.dataset.i18n);if(e.textContent!==value)e.textContent=value;}
  for(const e of document.querySelectorAll('[data-i18n-aria]')){const value=t(e.dataset.i18nAria);if(e.getAttribute('aria-label')!==value)e.setAttribute('aria-label',value);}
  for(const e of document.querySelectorAll('[data-i18n-aria][title]')){const value=t(e.dataset.i18nAria);if(e.title!==value)e.title=value;}
  for(const e of document.querySelectorAll('[data-i18n-placeholder]')){const value=t(e.dataset.i18nPlaceholder);if(e.getAttribute('placeholder')!==value)e.setAttribute('placeholder',value);}
  languagePicker?.update();$('language-toggle').dataset.saveFailed=String(preferences.error);if(preferences.error)$('language-toggle').title+=' · '+t('languageSaveFailed');
  for(const button of document.querySelectorAll('[data-speed-style-choice]')){
    const value=button.dataset.speedStyleChoice,name=t(value==='cat'?'styleCat':'styleMinimal'),failed=speedStyle.error&&speedStyle.style===value;
    button.setAttribute('aria-label',name);button.title=failed?`${name} · ${t('styleSaveFailed')}`:name;
    button.setAttribute('aria-pressed',String(speedStyle.style===value));button.dataset.saveFailed=String(failed);
  }
  const hostI18nHint=t('hostUiLocalizationHint');
  const hostI18nToggle=$('host-i18n-toggle');
  if(hostI18nToggle){
    const active=hostUiLocalization.enabled,actionLabel=t(active?'hostUiLocalizationDisableAction':'hostUiLocalizationEnableAction');
    hostI18nToggle.setAttribute('aria-pressed',String(active));
    hostI18nToggle.setAttribute('aria-label',actionLabel);
    hostI18nToggle.title=hostUiLocalization.error?`${actionLabel} · ${t('hostUiLocalizationSaveFailed')}`:`${actionLabel} · ${hostI18nHint}`;
    hostI18nToggle.dataset.saveFailed=String(hostUiLocalization.error);
  }
  usageDashboard?.renderIfVisible?.();
}

function chooseGroup(groups, speed, composerModel) {
  return language.chooseQuotaGroup(groups,[composerModel,speed?.model],selectedGroup);
}
function groupLabel(value) {
  return language.quotaGroupLabel(value);
}

function compactResetCountdown(resetAt, now) {
  if (!resetAt) return '';
  const raw = language.countdown(resetAt, now);
  if (!raw || raw === '—') return '';
  return /^\d/.test(raw) ? raw.replace(/\s+/g, '') : raw;
}

function renderQuotaStrip(now = Date.now() + serverOffset) {
  const tab = $('quota-tab');
  if (!tab) return;
  const visible = language.quotaWindows(group), isArgon = language.quotaGroupKind(group) === 'gemini-argon';
  const hasFive = visible.includes('5h'), hasWeek = visible.includes('weekly');
  const win5h = hasFive ? group?.windows?.['5h'] : null, winWk = hasWeek ? group?.windows?.['weekly'] : null;
  const rem5h = language.quotaRemaining(win5h), remWk = language.quotaRemaining(winWk);
  const cd5h = win5h && !win5h.disabled ? compactResetCountdown(win5h.resetAt, now) : '';
  const cdWk = winWk && !winWk.disabled ? compactResetCountdown(winWk.resetAt, now) : '';
  if (hasFive) {
    text('strip-quota-unit', '5h');
    hidden('strip-quota-unit', false);
    text('strip-quota', win5h?.disabled ? '—' : percent(rem5h));
    const wkPart = hasWeek && typeof remWk === 'number' && !winWk?.disabled ? `${t('weekShort')} ${Math.round(remWk * 100)}%` : '';
    text('strip-quota-sub', [wkPart, cd5h].filter(Boolean).join(' · ') || '—');
  } else if (hasWeek) {
    text('strip-quota-unit', t('weekShort'));
    hidden('strip-quota-unit', false);
    text('strip-quota', winWk?.disabled ? '—' : percent(remWk));
    text('strip-quota-sub', cdWk || (group ? groupLabel(group) : '—'));
  } else {
    hidden('strip-quota-unit', true);
    text('strip-quota', '—');
    text('strip-quota-sub', '—');
  }
  const tipParts = [group ? groupLabel(group) : t('unavailableQuota')];
  if (hasFive) tipParts.push(`5h ${win5h?.disabled ? t('unavailableQuota') : percent(rem5h)}${cd5h ? ` (${cd5h})` : ''}`);
  if (hasWeek) tipParts.push(`${t(isArgon ? 'argonWeek' : 'weekShort')} ${winWk?.disabled ? t('unavailableQuota') : percent(remWk)}${cdWk ? ` (${cdWk})` : ''}`);
  setTip(tab, tipParts.join(' · '));
}

function renderQuota(window, prefix, now = Date.now() + serverOffset) {
  const bucket = group?.windows?.[window];
  const remaining = language.quotaRemaining(bucket);
  $(`${prefix}-balance`).textContent = bucket?.disabled?t('unavailableQuota'):percent(remaining);
  const forecast = language.quotaForecast(bucket, window, now, { dailyWorkHours: snapshot?.usage?.dailyWorkHours });
  const barBg = remaining !== null && remaining < .05 ? 'var(--pulse-danger)' : '';
  const fill = $(`${prefix}-fill`), track = $(`${prefix}-track`);
  fill.style.width = typeof remaining === 'number' ? `${remaining * 100}%` : '0%';
  fill.style.background = barBg;
  const forecastRow = $(`${prefix}-forecast`), forecastMain = $(`${prefix}-forecast-text`), usageHint = $(`${prefix}-usage`);
  const showForecast = Boolean(forecast && typeof forecast.timeRemaining === 'number');
  const winUsage = group?.id && !bucket?.disabled && bucket?.available ? snapshot?.usage?.quotaWindows?.[`${group.id}:${window}`] : null;
  const showUsage = Boolean(winUsage && typeof winUsage.observedTokens === 'number' && winUsage.observedTokens > 0);
  if (forecastRow) {
    hidden(`${prefix}-forecast`, !showForecast && !showUsage);
    if (forecastMain) {
      forecastMain.hidden = !showForecast;
      if (showForecast) {
        if (forecast.willExhaust) {
          forecastMain.textContent = t('forecastDepletes', { eta: language.shortEta(forecast.exhaustInMs), early: language.shortEta(forecast.earlyByMs) });
          forecastMain.setAttribute('data-alert', 'true');
        } else {
          forecastMain.removeAttribute('data-alert');
          forecastMain.textContent = forecast.warmingUp ? t('forecastWarming', { pct: percent(forecast.used) }) : t('forecastLeft', { pct: percent(forecast.projectedRemaining) });
        }
      } else {
        forecastMain.removeAttribute('data-alert');
        forecastMain.textContent = '';
      }
    }
    if (showForecast) forecastRow.title = forecast.dailyWorkHours < 24 ? t('forecastBasisWork', { remaining: percent(forecast.remaining), time: percent(forecast.timeRemaining), hours: forecast.dailyWorkHours }) : t('forecastBasis', { remaining: percent(forecast.remaining), time: percent(forecast.timeRemaining) });
    else forecastRow.removeAttribute('title');
  }
  if (typeof remaining === 'number') { track.setAttribute('aria-valuenow', String(remaining * 100)); track.setAttribute('aria-valuemin','0'); track.setAttribute('aria-valuemax','100'); }
  else track.removeAttribute('aria-valuenow');
  const unavailableNote = !bucket?.available ? t('noQuota') : bucket.disabled ? t('disabledQuota') : remaining === null ? t('noFraction') : '';
  text(`${prefix}-note`, unavailableNote);
  hidden(`${prefix}-note`, !unavailableNote);
  if (usageHint) {
    hidden(`${prefix}-usage`, !showUsage);
    if (showUsage) {
      const refText = winUsage.estimatedFullTokens ? ` (${t('quotaWindowFullRef', { full: compact(winUsage.estimatedFullTokens) })})` : '';
      const detailText = `${compact(winUsage.observedTokens)} ${tokUnit(winUsage.observedTokens)}${refText}`;
      text(`${prefix}-usage`, compact(winUsage.observedTokens));
      const nextTip = `${t('quotaWindowUsage')}: ${detailText} · ${t('quotaWindowBasis')}`;
      if (usageHint.title !== nextTip) usageHint.title = nextTip;
    } else {
      text(`${prefix}-usage`, '');
      if (usageHint.hasAttribute('title')) usageHint.removeAttribute('title');
    }
  }
}

function renderPanelTrail(samples) {
  const svg = $('panel-speed-trail');
  if (!svg) return;
  const key = speedStyle.style + '|' + samples.join(',');
  if (svg.dataset.renderKey === key) return;
  svg.dataset.renderKey = key;
  const NS = 'http://www.w3.org/2000/svg', W = 120, H = 44, TOP = 14, snap = v => Math.round(v / 2) * 2;
  if (speedStyle.style !== 'cat') {
    const node = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
    const shape = language.minimalTrail(samples, { width: W, height: H, top: 5, bottom: 2, right: 4 });
    svg.replaceChildren(
      node('line', { class: 'panel-min-base', x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5 }),
      ...(shape ? [node('path', { class: 'panel-min-area', d: shape.area }), node('path', { class: 'panel-min-line', d: shape.line }), node('circle', { class: 'panel-min-dot', cx: shape.end[0], cy: shape.end[1], r: 2.4 })] : []),
    );
    return;
  }
  const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  let line = '', start = 0;
  if (samples.length) {
    const rawMax = Math.max(...samples), rawMin = Math.min(...samples), flat = rawMax === rawMin;
    const max = rawMax * 1.04, min = rawMin * 0.82, slots = Math.max(samples.length, 10), last = samples.length - 1;
    const x = idx => snap(W - ((last - idx) * (W - 4)) / (slots - 1)), y = val => flat ? snap(Math.round(H * 0.55)) : snap(TOP + (H - TOP - 4) * (1 - (val - min) / (max - min || 1)));
    start = Math.max(0, snap(x(0) - (W - 4) / (slots - 1)));
    line = `M${start} ${y(samples[0])}`;
    samples.forEach((v, idx) => { if (idx) line += `H${x(idx)}V${y(v)}`; });
    line += `H${W - 2}`;
  }
  svg.replaceChildren(
    el('line', { class: 'panel-speed-base', x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5 }),
    ...(line ? [el('path', { class: 'panel-speed-area', d: `${line}V${H}H${start}Z` }), el('path', { class: 'panel-speed-line', d: line })] : []),
  );
}

const COMP_LABELS = {
  customization:'compositionCustomization',user:'compositionUser',thinking:'compositionThinking',
  reply:'compositionReply',assistant:'compositionAssistant',tool:'compositionTool',
  system:'compositionSystem',other:'compositionOther',remaining:'compositionRemaining',
  systemPrompt:'compositionSystemPrompt',mcpTools:'compositionMcpTools',subagents:'compositionSubagents',
  skills:'compositionSkills',plugins:'compositionPlugins',rules:'compositionRules',
  tools:'compositionTools',chatMessages:'compositionChatMessages',
};
const COMP_SOURCES = {
  hybrid:'compositionSourceHybrid',transcript:'compositionSourceTranscript',
  steps:'compositionSourceSteps','host-token-groups':'compositionSourceHost',
};
const DRILLDOWN_GROUP_KEYS = {
  rules:'compositionGroupRules',skills:'compositionGroupSkills',
  subagents:'compositionGroupSubagents',mcpTools:'compositionGroupMcpTools',
};
const sanitizeDisplayPath = raw => String(raw || '').replace(/^\/(?:Users|home)\/[^/]+(?=\/)/, '~');

function renderAccountCredits(credits) {
  const badge = $('account-credits-badge');
  if (!badge) return;
  const show = Boolean(credits && (credits.availablePromptCredits !== null || credits.availableFlowCredits !== null || credits.planName));
  hidden('account-credits-badge', !show);
  if (!show) return;
  const label = credits.availablePromptCredits !== null || credits.availableFlowCredits !== null
    ? t('creditsBadge', { prompt: compact(credits.availablePromptCredits), flow: compact(credits.availableFlowCredits) })
    : credits.planName;
  if (badge.textContent !== label) badge.textContent = label;
  const parts = [];
  if (credits.planName || credits.tierName) parts.push([credits.planName, credits.tierName].filter(Boolean).join(' · '));
  if (credits.availablePromptCredits !== null) parts.push(`${t('creditsPrompt')}: ${count(credits.availablePromptCredits)}${credits.monthlyPromptCredits ? ` / ${count(credits.monthlyPromptCredits)}` : ''}`);
  if (credits.availableFlowCredits !== null) parts.push(`${t('creditsFlow')}: ${count(credits.availableFlowCredits)}${credits.monthlyFlowCredits ? ` / ${count(credits.monthlyFlowCredits)}` : ''}`);
  setAttr(badge, 'title', parts.join(' · ') || null);
}

const DRILLDOWN_CAP = 6;

function createDrilldownChevron() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'drilldown-chev');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M4.5 3 7.5 6l-3 3');
  svg.append(path);
  return svg;
}

function splitDrilldownPath(display) {
  const idx = Math.max(display.lastIndexOf('/'), display.lastIndexOf('\\'));
  if (idx < 0) return { base: display, dir: '' };
  return { base: display.slice(idx + 1) || display, dir: display.slice(0, idx) };
}

function renderDrilldownBudgetCard(label, used, max) {
  const ratio = max > 0 ? used / max : 0;
  const pct = Math.round(ratio * 100);
  const levelClass = ratio >= 0.9 ? 'is-danger' : '';
  const card = document.createElement('div');
  card.className = 'drilldown-budget-card';
  const top = document.createElement('div');
  top.className = 'drilldown-budget-top';
  const pctEl = Object.assign(document.createElement('span'), {
    className: levelClass ? `drilldown-budget-pct ${levelClass}` : 'drilldown-budget-pct',
    textContent: `${pct}%`,
  });
  top.append(Object.assign(document.createElement('span'), { className: 'drilldown-budget-lbl', textContent: label }), pctEl);
  const track = document.createElement('div');
  track.className = 'drilldown-budget-track';
  const fill = document.createElement('i');
  if (levelClass) fill.className = levelClass;
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  track.append(fill);
  const nums = Object.assign(document.createElement('div'), {
    className: 'drilldown-budget-nums',
    textContent: `${count(used)} / ${count(max)} ${tokUnit(max)}`,
  });
  card.append(top, track, nums);
  return card;
}

function createDrilldownItemRow(display, tokens, groupTokens, maxItemTokens, rawTitle, splitDir = false, isSub = false) {
  const share = groupTokens > 0 ? Math.round((tokens / groupTokens) * 100) : 0;
  const fillW = maxItemTokens > 0 && tokens > 0 ? Math.max(4, Math.round((tokens / maxItemTokens) * 100)) : 0;
  const row = document.createElement('div');
  row.className = isSub ? 'drilldown-item is-sub' : 'drilldown-item';
  setAttr(row, 'title', rawTitle);
  const fill = document.createElement('i');
  fill.className = 'drilldown-item-fill';
  fill.style.width = `${Math.min(100, fillW)}%`;
  const main = document.createElement('div');
  main.className = 'drilldown-item-main';
  const { base, dir } = splitDir ? splitDrilldownPath(display) : { base: display, dir: '' };
  main.append(Object.assign(document.createElement('span'), { className: 'drilldown-item-name', textContent: base }));
  if (dir) main.append(Object.assign(document.createElement('span'), { className: 'drilldown-item-sub', textContent: dir }));
  const val = document.createElement('span');
  val.className = 'drilldown-item-val';
  val.append(document.createTextNode(count(tokens)));
  if (groupTokens > 0) {
    val.append(document.createTextNode(' '), Object.assign(document.createElement('span'), {
      className: 'drilldown-item-pct',
      textContent: `${share === 0 && tokens > 0 ? '<1' : share}%`,
    }));
  }
  row.append(fill, main, val);
  return row;
}

function renderTokenBaseDrilldown(customization) {
  const wrap = $('panel-token-base-drilldown'), toggle = $('token-base-toggle'), tree = $('token-base-tree');
  if (!wrap || !toggle || !tree) return;
  const available = Boolean(customization?.available && Array.isArray(customization.drilldown) && customization.drilldown.length);
  hidden('panel-token-base-drilldown', !available);
  if (!available) return;

  text('token-base-toggle-label', t('tokenBaseDrilldown'));
  const budgetRatio = customization.budget ? customization.tokens / customization.budget : null;
  const budgetPct = budgetRatio !== null ? Math.round(budgetRatio * 100) : null;
  const summary = customization.budget
    ? `${compact(customization.tokens)} / ${compact(customization.budget)} · ${budgetPct}%`
    : `${compact(customization.tokens)} ${tokUnit(customization.tokens)}`;
  text('token-base-toggle-summary', summary);
  const summaryEl = $('token-base-toggle-summary');
  if (summaryEl) {
    const level = budgetRatio !== null && budgetRatio >= 0.9 ? 'danger' : null;
    setAttr(summaryEl, 'data-level', level);
  }
  setAttr(toggle, 'aria-expanded', String(tokenBaseExpanded));
  hidden('token-base-tree', !tokenBaseExpanded);
  if (!tokenBaseExpanded) return;

  const sig = JSON.stringify([customization.tokens, customization.budget, customization.rulesBudget, customization.drilldown, [...expandedDrilldownGroups], [...expandedDrilldownMore], [...expandedMcpServers], language.language]);
  if (tree.dataset.signature === sig) return;
  tree.dataset.signature = sig;

  const focusKey = document.activeElement?.closest?.('#token-base-tree')
    ? document.activeElement.dataset.focusKey || null
    : null;
  const nodes = [];
  if (customization.budget || customization.rulesBudget) {
    const budgets = document.createElement('div');
    budgets.className = 'drilldown-budgets';
    if (customization.budget) budgets.append(renderDrilldownBudgetCard(t('tokenBaseCustomBudget'), customization.tokens, customization.budget));
    if (customization.rulesBudget) {
      const rulesGrp = customization.drilldown.find(g => g.id === 'rules');
      budgets.append(renderDrilldownBudgetCard(t('tokenBaseRulesBudget'), rulesGrp?.tokens ?? 0, customization.rulesBudget));
    }
    nodes.push(budgets);
  }

  for (const grp of customization.drilldown) {
    const box = document.createElement('div');
    box.className = 'drilldown-group';
    const isOpen = expandedDrilldownGroups.has(grp.name);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drilldown-group-btn';
    btn.dataset.focusKey = `grp:${grp.name}`;
    btn.setAttribute('aria-expanded', String(isOpen));
    const grpTitle = t(DRILLDOWN_GROUP_KEYS[grp.id] || grp.name);
    const children = Array.isArray(grp.children) ? grp.children : [];
    const grpShare = customization.tokens > 0 ? Math.round((grp.tokens / customization.tokens) * 100) : 0;
    const left = document.createElement('span');
    left.className = 'drilldown-group-left';
    left.append(
      createDrilldownChevron(),
      Object.assign(document.createElement('span'), { className: 'drilldown-group-name', textContent: grpTitle }),
      Object.assign(document.createElement('span'), { className: 'drilldown-count', textContent: smallCount(children.length) }),
    );
    const right = document.createElement('span');
    right.className = 'drilldown-group-meta';
    right.append(
      Object.assign(document.createElement('span'), { className: 'drilldown-group-share', textContent: `${grpShare === 0 && grp.tokens > 0 ? '<1' : grpShare}%` }),
      Object.assign(document.createElement('span'), { textContent: `${count(grp.tokens)} ${tokUnit(grp.tokens)}` }),
    );
    btn.append(left, right);
    btn.addEventListener('click', () => {
      if (expandedDrilldownGroups.has(grp.name)) expandedDrilldownGroups.delete(grp.name);
      else expandedDrilldownGroups.add(grp.name);
      renderTokenBaseDrilldown(customization);
    });
    box.append(btn);

    if (isOpen && children.length) {
      const list = document.createElement('div');
      list.className = 'drilldown-items';
      const showAll = expandedDrilldownMore.has(grp.name);
      const visible = showAll || children.length <= DRILLDOWN_CAP ? children : children.slice(0, DRILLDOWN_CAP);
      const maxItemTok = Math.max(1, ...children.map(c => c.tokens || 0));
      const splitPaths = grp.id === 'rules';
      for (const child of visible) {
        const hasSub = Array.isArray(child.children) && child.children.length > 0;
        if (hasSub) {
          const srvOpen = expandedMcpServers.has(child.name);
          const srvBtn = document.createElement('button');
          srvBtn.type = 'button';
          srvBtn.className = 'drilldown-group-btn';
          srvBtn.dataset.focusKey = `mcp:${grp.name}:${child.name}`;
          srvBtn.setAttribute('aria-expanded', String(srvOpen));
          const sLeft = document.createElement('span');
          sLeft.className = 'drilldown-group-left';
          sLeft.append(
            createDrilldownChevron(),
            Object.assign(document.createElement('span'), { className: 'drilldown-group-name', textContent: child.name }),
            Object.assign(document.createElement('span'), { className: 'drilldown-count', textContent: smallCount(child.children.length) }),
          );
          srvBtn.append(sLeft, Object.assign(document.createElement('span'), { className: 'drilldown-group-meta', textContent: count(child.tokens) }));
          srvBtn.addEventListener('click', () => {
            if (expandedMcpServers.has(child.name)) expandedMcpServers.delete(child.name);
            else expandedMcpServers.add(child.name);
            renderTokenBaseDrilldown(customization);
          });
          list.append(srvBtn);
          if (srvOpen) {
            const subMax = Math.max(1, ...child.children.map(tItem => tItem.tokens || 0));
            for (const tool of child.children) {
              list.append(createDrilldownItemRow(tool.name, tool.tokens, child.tokens, subMax, tool.name, false, true));
            }
          }
        } else {
          list.append(createDrilldownItemRow(sanitizeDisplayPath(child.name), child.tokens, grp.tokens, maxItemTok, child.name, splitPaths, false));
        }
      }
      if (children.length > DRILLDOWN_CAP) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'drilldown-more-btn';
        moreBtn.dataset.focusKey = `more:${grp.name}`;
        moreBtn.textContent = showAll ? t('drilldownShowLess') : t('drilldownShowMore', { n: smallCount(children.length - DRILLDOWN_CAP) });
        moreBtn.addEventListener('click', () => {
          if (expandedDrilldownMore.has(grp.name)) expandedDrilldownMore.delete(grp.name);
          else expandedDrilldownMore.add(grp.name);
          renderTokenBaseDrilldown(customization);
        });
        list.append(moreBtn);
      }
      box.append(list);
    }
    nodes.push(box);
  }
  tree.replaceChildren(...nodes);
  if (focusKey) {
    for (const button of tree.querySelectorAll('button[data-focus-key]')) {
      if (button.dataset.focusKey === focusKey) {
        button.focus({ preventScroll: true });
        break;
      }
    }
  }
}

function renderContextComposition(composition) {
  const section = $('panel-context-composition'), trendSection = $('panel-context-trend');
  const usable = Boolean(composition && Number.isSafeInteger(composition.usedTokens) && Number.isSafeInteger(composition.maxTokens) && composition.maxTokens > 0 && Array.isArray(composition.segments) && composition.segments.some(s => s.id !== 'remaining'));
  hidden('panel-context-composition', !usable);
  if (usable && section) {
    const isHost = composition.source === 'host-token-groups';
    const injection = composition.customization?.available ? t('compositionCustomizationValue', { tokens: compact(composition.customization.tokens) }) : '';
    const sourceKey = COMP_SOURCES[composition.source];
    const sourceTag = sourceKey ? t(sourceKey) : '';
    text('panel-composition-source', isHost ? sourceTag : [injection || t('compositionCustomizationValue', { tokens: '—' }), sourceTag].filter(Boolean).join(' · '));
    setAttr(section, 'title', t('compositionBasis', { source: sourceTag || '—' }));

    setAttr($('comp-view-bar'), 'aria-pressed', String(compositionView === 'bar'));
    setAttr($('comp-view-list'), 'aria-pressed', String(compositionView === 'list'));

    const meter = $('panel-composition-meter'), legend = $('panel-composition-legend');
    const sig = JSON.stringify([composition.segments, composition.source, composition.chatBreakdown || null, composition.customization?.budget ?? null, compositionView, language.language]);
    if (meter && meter.dataset.signature !== sig) {
      meter.dataset.signature = sig;
      const visible = composition.segments.filter(s => s.fraction > 0 && s.tokens > 0);
      const exactSet = new Set(['customization', 'systemPrompt', 'mcpTools', 'subagents', 'skills', 'plugins', 'rules', 'tools', 'chatMessages']);
      const tipFor = seg => {
        const tag = exactSet.has(seg.id) ? t('compositionExactTag') : t('compositionEstimateTag');
        const pctVal = Math.round(seg.fraction * 100);
        return `${t(COMP_LABELS[seg.id] || 'compositionTitle')}: ${count(seg.tokens)} ${tokUnit(seg.tokens)} (${pctVal === 0 ? '<1' : pctVal}% · ${tag})`;
      };
      meter.replaceChildren(...visible.map(seg => {
        const bar = document.createElement('i');
        bar.className = `composition-seg-${seg.id}`;
        bar.style.width = `${Math.min(100, seg.fraction * 100)}%`;
        setAttr(bar, 'title', tipFor(seg));
        return bar;
      }));
      if (legend) {
        legend.classList.toggle('is-list', compositionView === 'list');
        legend.replaceChildren(...visible.filter(s => s.id !== 'remaining').map(seg => {
          const item = document.createElement('span');
          item.className = 'composition-legend-item';
          const left = document.createElement('span');
          left.className = 'composition-legend-left';
          const dot = document.createElement('i');
          dot.className = `composition-legend-dot composition-seg-${seg.id}`;
          dot.setAttribute('aria-hidden', 'true');
          const pctVal = Math.round(seg.fraction * 100), pctText = pctVal === 0 ? '<1%' : `${pctVal}%`;
          const nameSpan = document.createElement('span');
          if (compositionView === 'list') {
            nameSpan.textContent = t(COMP_LABELS[seg.id] || 'compositionTitle');
            left.append(dot, nameSpan);
            const right = document.createElement('span');
            const tag = exactSet.has(seg.id) ? t('compositionExactTag') : t('compositionEstimateTag');
            right.textContent = `${compact(seg.tokens)} (${pctText} · ${tag})`;
            item.append(left, right);
          } else {
            nameSpan.textContent = `${t(COMP_LABELS[seg.id] || 'compositionTitle')} ${pctText}`;
            left.append(dot, nameSpan);
            item.append(left);
          }
          setAttr(item, 'title', tipFor(seg));
          return item;
        }));
      }
    }
    renderTokenBaseDrilldown(composition.customization);
  } else {
    hidden('panel-token-base-drilldown', true);
  }

  const trend = composition?.trend;
  const trendOk = Boolean(trend && Array.isArray(trend.points) && trend.points.length >= 2);
  hidden('panel-context-trend', !trendOk);
  if (!trendSection || !trendOk) return;

  setAttr($('trend-mode-total'), 'aria-pressed', String(trendMode === 'total'));
  setAttr($('trend-mode-delta'), 'aria-pressed', String(trendMode === 'delta'));

  const points = trend.points;
  const svg = $('panel-trend-svg');
  const sig = JSON.stringify([points.map(p => p.inputTokens), trend.markers, trendMode, language.language]);
  if (svg && svg.dataset.signature !== sig) {
    svg.dataset.signature = sig;
    const NS = 'http://www.w3.org/2000/svg', W = 280, H = 42, P = 3;
    const svgEl = (tag, attrs, children = []) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      el.append(...children);
      return el;
    };
    const x = idx => P + (W - 2 * P) * (idx / (points.length - 1));
    const markerEls = (Array.isArray(trend.markers) ? trend.markers : []).map(m => {
      const at = x(Math.min(Math.max(m.pointIndex || 0, 0), points.length - 1));
      const label = m.kind === 'checkpoint' ? t('trendCheckpoint') : t('trendCompaction');
      const reclaimed = Number.isFinite(m.before) && Number.isFinite(m.after) && m.before > m.after ? ` (${t('trendReclaimed', { tokens: compact(m.before - m.after) })})` : '';
      const share = Number.isFinite(m.peakFraction) ? ` · ${t('trendPeakShare', { pct: Math.round(m.peakFraction * 100) })}` : '';
      const peak = m.peak ? ` · ${t('trendPeakTrigger')}` : '';
      const tip = `${label}: ${Number.isFinite(m.before) ? count(m.before) : '—'} → ${Number.isFinite(m.after) ? count(m.after) : '—'}${reclaimed}${share}${peak}`;
      return svgEl('g', { class: 'trend-marker-group' }, [
        svgEl('title', {}, [document.createTextNode(tip)]),
        svgEl('line', { class: m.peak ? 'trend-marker trend-marker-peak' : 'trend-marker', x1: at, x2: at, y1: P, y2: H - P }),
        svgEl('line', { class: 'trend-marker-hit', x1: at, x2: at, y1: P, y2: H - P }),
      ]);
    });

    if (trendMode === 'delta') {
      const deltas = points.map((p, i) => i === 0 ? p.inputTokens : p.inputTokens - points[i - 1].inputTokens);
      const absMax = Math.max(1, ...deltas.map(d => Math.abs(d)));
      const midY = H / 2;
      const barW = Math.max(1.5, ((W - 2 * P) / points.length) * 0.72);
      const bars = deltas.map((d, i) => {
        const cx = P + ((i + 0.5) / points.length) * (W - 2 * P) - barW / 2;
        const barH = Math.max(1, (Math.abs(d) / absMax) * (midY - P));
        const y = d >= 0 ? midY - barH : midY;
        return svgEl('rect', {
          class: d >= 0 ? 'trend-bar-pos' : 'trend-bar-neg',
          x: cx.toFixed(1), y: y.toFixed(1), width: barW.toFixed(1), height: barH.toFixed(1), rx: '0.8',
        }, [svgEl('title', {}, [document.createTextNode(`#${i + 1}: ${d >= 0 ? '+' : ''}${count(d)}`)])]);
      });
      const zeroLine = svgEl('line', { class: 'trend-zero', x1: P, x2: W - P, y1: midY, y2: midY });
      svg.replaceChildren(zeroLine, ...bars, ...markerEls);
    } else {
      const max = Math.max(1, ...points.map(p => p.inputTokens || 0));
      const y = val => H - P - (H - 2 * P) * ((val || 0) / max);
      const path = svgEl('path', {
        class: 'trend-line',
        d: `M${x(0)} ${y(points[0].inputTokens)}` + points.slice(1).map((p, i) => `L${x(i + 1)} ${y(p.inputTokens)}`).join(''),
      });
      svg.replaceChildren(...markerEls, path);
    }
  }

  text('panel-trend-sample', t('trendSample', { n: count(trend.totalRequests ?? points.length) }));
  setAttr(trendSection, 'title', t('trendBasis'));

  const markersList = $('panel-trend-markers');
  if (markersList) {
    const markers = Array.isArray(trend.markers) ? trend.markers.slice(-4) : [];
    hidden('panel-trend-markers', !markers.length);
    if (markers.length) {
      markersList.replaceChildren(...markers.map(m => {
        const label = m.kind === 'checkpoint' ? t('trendCheckpoint') : t('trendCompaction');
        const beforeShort = Number.isFinite(m.before) ? compact(m.before) : '—';
        const afterShort = Number.isFinite(m.after) ? compact(m.after) : '—';
        const beforeFull = Number.isFinite(m.before) ? count(m.before) : '—';
        const afterFull = Number.isFinite(m.after) ? count(m.after) : '—';
        const reclaimed = Number.isFinite(m.before) && Number.isFinite(m.after) && m.before > m.after ? ` (${t('trendReclaimed', { tokens: compact(m.before - m.after) })})` : '';
        const pct = Number.isFinite(m.peakFraction) ? Math.round(m.peakFraction * 100) : null;
        const badgeShare = pct !== null ? ` · ▲${pct}%` : '';
        const tipShare = pct !== null ? ` · ${t('trendPeakShare', { pct })}` : '';
        const peak = m.peak ? ` · ${t('trendPeakTrigger')}` : '';
        return Object.assign(document.createElement('span'), {
          className: m.peak ? 'trend-marker-badge trend-marker-badge-peak' : 'trend-marker-badge',
          textContent: `${label}: ${beforeShort} → ${afterShort}${badgeShare}`,
          title: `${label}: ${beforeFull} → ${afterFull}${reclaimed}${tipShare}${peak}`,
        });
      }));
    }
  }
}

async function loadAudit(force = false) {
  const cid = activeConversationId() || snapshot?.speed?.conversationId || null;
  if (!cid) { auditData = null; auditError = t('auditUnavailable'); renderAuditSection(); return; }
  if (!force && auditData && auditConvId === cid && !auditLoading) { renderAuditSection(); return; }
  const epoch = ++auditEpoch;
  auditLoading = true; auditError = null; renderAuditSection();
  try {
    const params = new URLSearchParams({ conversationId: cid });
    if (force) params.set('force', '1');
    const res = await transportFetch(`/api/session-audit?${params}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(t('auditUnavailable'));
    const data = await res.json();
    if (epoch !== auditEpoch) return;
    auditData = data;
    auditConvId = cid;
  } catch (err) {
    if (epoch !== auditEpoch) return;
    auditError = err?.message || t('auditUnavailable');
  } finally {
    if (epoch === auditEpoch) {
      auditLoading = false;
      renderAuditSection();
    }
  }
}

function jumpToAuditStep(stepIndex) {
  highlightedStepIndex = stepIndex;
  auditTab = 'steps';
  auditStepFilter = 'all';
  renderAuditSection();
  const target = document.querySelector(`#audit-steps-list [data-step-index="${stepIndex}"]`);
  target?.scrollIntoView({ block: 'nearest' });
}

function renderAuditSection() {
  const section = $('panel-audit-section'), toggleBtn = $('context-audit-toggle');
  if (toggleBtn) setAttr(toggleBtn, 'aria-expanded', String(auditOpen));
  if (!section) return;
  hidden('panel-audit-section', !auditOpen);
  if (!auditOpen) return;

  for (const btn of document.querySelectorAll('[data-audit-tab]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.auditTab === auditTab));
  }
  hidden('audit-pane-files', auditTab !== 'files');
  hidden('audit-pane-commands', auditTab !== 'commands');
  hidden('audit-pane-steps', auditTab !== 'steps');

  if (auditLoading) {
    text('audit-status', t('auditLoading'));
    hidden('audit-status', false);
    return;
  }
  if (auditError) {
    text('audit-status', auditError);
    hidden('audit-status', false);
    return;
  }
  hidden('audit-status', true);
  if (!auditData) return;

  if (auditTab === 'files') {
    const pane = $('audit-pane-files');
    const files = Array.isArray(auditData.files) ? auditData.files : [];
    if (!files.length) {
      pane.replaceChildren(Object.assign(document.createElement('div'), { className: 'audit-status', textContent: t('auditEmptyFiles') }));
    } else {
      pane.replaceChildren(...files.slice(0, 120).map(f => {
        const row = document.createElement('div'); row.className = 'audit-row';
        const top = document.createElement('div'); top.className = 'audit-row-top';
        const title = Object.assign(document.createElement('span'), { className: 'audit-row-title', textContent: f.name });
        setAttr(title, 'title', sanitizeDisplayPath(f.path));
        const opBadges = document.createElement('span'); opBadges.className = 'audit-row-meta';
        for (const op of f.ops || []) {
          const key = op === 'read' ? 'auditOpRead' : op === 'edit' ? 'auditOpEdit' : op === 'write' ? 'auditOpWrite' : 'auditOpSearch';
          opBadges.append(Object.assign(document.createElement('span'), { className: 'audit-badge', textContent: t(key) }));
        }
        top.append(title, opBadges);
        const meta = document.createElement('div'); meta.className = 'audit-row-meta';
        if (f.additions > 0) meta.append(Object.assign(document.createElement('span'), { className: 'audit-badge is-add', textContent: `+${count(f.additions)}` }));
        if (f.deletions > 0) meta.append(Object.assign(document.createElement('span'), { className: 'audit-badge is-del', textContent: `-${count(f.deletions)}` }));
        for (const idx of (f.stepIndices || []).slice(-4)) {
          const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'audit-step-link', textContent: `S${idx}` });
          setAttr(btn, 'title', t('auditStepRef', { n: idx }));
          btn.addEventListener('click', () => jumpToAuditStep(idx));
          meta.append(btn);
        }
        row.append(top, meta);
        return row;
      }));
    }
  } else if (auditTab === 'commands') {
    const pane = $('audit-pane-commands');
    const cmds = Array.isArray(auditData.commands) ? auditData.commands : [];
    if (!cmds.length) {
      pane.replaceChildren(Object.assign(document.createElement('div'), { className: 'audit-status', textContent: t('auditEmptyCommands') }));
    } else {
      pane.replaceChildren(...cmds.slice(0, 120).map(c => {
        const row = document.createElement('div'); row.className = 'audit-row';
        const top = document.createElement('div'); top.className = 'audit-row-top';
        const cmdEl = Object.assign(document.createElement('span'), { className: 'audit-row-title', textContent: c.command });
        setAttr(cmdEl, 'title', c.command + (c.cwd ? `\ncwd: ${sanitizeDisplayPath(c.cwd)}` : ''));
        const badge = document.createElement('span');
        badge.className = `audit-badge ${c.exitCode === 0 ? 'is-ok' : c.exitCode !== null ? 'is-err' : ''}`;
        badge.textContent = c.exitCode !== null ? t('auditExitCode', { code: c.exitCode }) : (c.status === 'RUNNING' ? t('auditRunning') : '—');
        top.append(cmdEl, badge);
        const meta = document.createElement('div'); meta.className = 'audit-row-meta';
        if (c.durationMs !== null) meta.append(Object.assign(document.createElement('span'), { textContent: language.elapsed(c.durationMs / 1000) }));
        if (c.cwd) meta.append(Object.assign(document.createElement('span'), { textContent: sanitizeDisplayPath(c.cwd).split('/').at(-1) || '' }));
        const link = Object.assign(document.createElement('button'), { type: 'button', className: 'audit-step-link', textContent: `S${c.stepIndex}` });
        link.addEventListener('click', () => jumpToAuditStep(c.stepIndex));
        meta.append(link);
        row.append(top, meta);
        return row;
      }));
    }
  } else if (auditTab === 'steps') {
    for (const btn of document.querySelectorAll('[data-step-filter]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.stepFilter === auditStepFilter));
    }
    const list = $('audit-steps-list');
    const allSteps = Array.isArray(auditData.steps) ? auditData.steps : [];
    const filtered = auditStepFilter === 'all' ? allSteps : allSteps.filter(s => Array.isArray(s.categories) && s.categories.includes(auditStepFilter));
    if (!filtered.length) {
      list.replaceChildren(Object.assign(document.createElement('div'), { className: 'audit-status', textContent: t('auditEmptySteps') }));
    } else {
      list.replaceChildren(...filtered.slice(-200).reverse().map(s => {
        const row = document.createElement('div');
        row.className = `audit-row${highlightedStepIndex === s.index ? ' is-highlighted' : ''}`;
        row.dataset.stepIndex = String(s.index);
        const top = document.createElement('div'); top.className = 'audit-row-top';
        const lbl = Object.assign(document.createElement('span'), { className: 'audit-row-title', textContent: `#${s.index} · ${s.label || s.type}` });
        const deltaText = s.contextDeltaTokens !== null
          ? `${s.deltaEstimated ? '~' : ''}${s.contextDeltaTokens >= 0 ? '+' : ''}${compact(s.contextDeltaTokens)}`
          : '—';
        const deltaEl = Object.assign(document.createElement('span'), { className: `audit-badge ${s.contextDeltaTokens < 0 ? 'is-add' : ''}`, textContent: deltaText });
        top.append(lbl, deltaEl);
        const meta = document.createElement('div'); meta.className = 'audit-row-meta';
        meta.append(Object.assign(document.createElement('span'), { textContent: s.type }));
        if (s.model) meta.append(Object.assign(document.createElement('span'), { textContent: s.model }));
        if (s.thinkingTokens > 0) meta.append(Object.assign(document.createElement('span'), { textContent: `T:${compact(s.thinkingTokens)}` }));
        if (s.responseTokens > 0) meta.append(Object.assign(document.createElement('span'), { textContent: `R:${compact(s.responseTokens)}` }));
        row.append(top, meta);
        return row;
      }));
    }
  }
}

async function loadInsights(force = false) {
  if (insightsLoading) {
    queuedInsights = true;
    queuedInsightsForce = queuedInsightsForce || force;
    return;
  }
  const epoch = ++insightsEpoch;
  insightsLoading = true; insightsError = null;
  renderInsightsView();
  try {
    const requestedDate = selectedHeatmapDate || '';
    const params = new URLSearchParams();
    if (force) params.set('force', '1');
    const statusEl = $('insights-status-filter'), sortEl = $('insights-sort'), searchEl = $('insights-search');
    if (statusEl?.value) params.set('status', statusEl.value);
    if (sortEl?.value) params.set('sort', sortEl.value);
    if (searchEl?.value?.trim()) params.set('query', searchEl.value.trim());
    if (requestedDate) params.set('date', requestedDate);
    const res = await transportFetch(`/api/insights?${params}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(t('panelUnavailable'));
    const value = await res.json();
    if (epoch === insightsEpoch) {
      insightsData = value;
      insightsLoadedDate = requestedDate || null;
    }
  } catch (err) {
    if (epoch === insightsEpoch) insightsError = err?.message || t('panelUnavailable');
  } finally {
    insightsLoading = false;
    renderInsightsView();
    if (queuedInsights) {
      const nextForce = queuedInsightsForce;
      queuedInsights = false; queuedInsightsForce = false;
      void loadInsights(nextForce);
    }
  }
}

function renderDistList(id, items, { tone, metric, formatVal }) {
  const el = $(id);
  if (!el) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    el.replaceChildren(Object.assign(document.createElement('div'), { className: 'dist-row', textContent: '—' }));
    return;
  }
  const top = list.slice(0, 6);
  const maxMetric = Math.max(1, ...top.map(item => Number(metric(item)) || 0));
  el.replaceChildren(...top.map(item => {
    const wrap = document.createElement('div'); wrap.className = 'dist-item';
    const row = document.createElement('div'); row.className = 'dist-row';
    const nameWrap = document.createElement('span'); nameWrap.className = 'dist-name-wrap';
    const dot = document.createElement('i'); dot.className = `dist-dot dist-tone-${tone}`; dot.setAttribute('aria-hidden', 'true');
    const name = Object.assign(document.createElement('span'), { className: 'dist-name', textContent: item.name });
    setAttr(name, 'title', item.name);
    nameWrap.append(dot, name);
    const valText = formatVal(item);
    const val = Object.assign(document.createElement('span'), { className: 'dist-val', textContent: valText });
    setAttr(val, 'title', valText);
    row.append(nameWrap, val);
    const bar = document.createElement('div'); bar.className = 'dist-bar'; bar.setAttribute('aria-hidden', 'true');
    const rawVal = Math.max(0, Number(metric(item)) || 0);
    const pct = rawVal > 0 ? Math.max(2, Math.min(100, (rawVal / maxMetric) * 100)) : 0;
    const fill = document.createElement('i'); fill.className = `dist-tone-${tone}`; fill.style.width = `${pct.toFixed(1)}%`;
    bar.append(fill);
    wrap.append(row, bar);
    return wrap;
  }));
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseIsoDay(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

let heatmapTipScrollTop = 0, activeHeatmapTipCell = null;

function hideHeatmapTip() {
  activeHeatmapTipCell = null;
  const tip = $('insights-heatmap-tip');
  if (tip) tip.hidden = true;
}

function positionHeatmapTip(cell) {
  const tip = $('insights-heatmap-tip');
  if (!tip || tip.hidden || !cell?.isConnected || panelView !== 'insights') {
    hideHeatmapTip();
    return;
  }
  const rect = cell.getBoundingClientRect();
  const rTip = tip.getBoundingClientRect();
  const frame = $('insights-heatmap-section')?.closest('.widget')?.getBoundingClientRect();
  const minLeft = Math.max(8, (frame ? frame.left : 0) + 8);
  const maxRight = Math.min(window.innerWidth - 8, (frame ? frame.right : window.innerWidth) - 8);
  const maxLeft = Math.max(minLeft, maxRight - rTip.width);
  const left = Math.max(minLeft, Math.min(maxLeft, rect.left + rect.width / 2 - rTip.width / 2));
  const above = rect.top - rTip.height - 6;
  const top = above >= 8 ? above : Math.min(window.innerHeight - rTip.height - 8, rect.bottom + 6);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showHeatmapTip(cell, item) {
  const tip = $('insights-heatmap-tip');
  if (!tip || !cell || !item) return;
  activeHeatmapTipCell = cell;
  heatmapTipScrollTop = $('insights-view')?.scrollTop ?? 0;
  tip.textContent = t('insightsHeatmapTip', {
    date: item.date,
    sessions: smallCount(item.sessions || 0),
    tokens: compact(item.tokens || 0),
  });
  tip.hidden = false;
  positionHeatmapTip(cell);
}

function toggleHeatmapDate(nextDate) {
  selectedHeatmapDate = selectedHeatmapDate === nextDate ? null : nextDate;
  const total = insightsData?.totalMatchingSessions ?? 0;
  const loaded = Array.isArray(insightsData?.sessions) ? insightsData.sessions.length : 0;
  if (insightsLoadedDate || total > loaded) {
    void loadInsights(false);
  } else {
    renderInsightsView();
  }
}

function isMonotonicHeatmap(heat) {
  if (!Array.isArray(heat) || heat.length < 2) return false;
  let prev = null;
  for (const item of heat) {
    const parsed = parseIsoDay(item?.date);
    if (!parsed) return false;
    if (prev !== null && parsed.getTime() <= prev) return false;
    prev = parsed.getTime();
  }
  return true;
}

function renderInsightsHeatmap(heat) {
  setAttr($('heatmap-metric-sessions'), 'aria-pressed', String(heatmapMetric === 'sessions'));
  setAttr($('heatmap-metric-tokens'), 'aria-pressed', String(heatmapMetric === 'tokens'));
  const heatGrid = $('insights-heatmap-grid'), monthsEl = $('insights-heatmap-months'), wdEl = $('insights-heatmap-weekdays');
  hideHeatmapTip();
  if (!heatGrid || !heat.length) return;

  const focusDate = document.activeElement?.closest?.('#insights-heatmap-grid')
    ? document.activeElement.dataset.date || null
    : null;
  const vals = heat.map(d => (heatmapMetric === 'tokens' ? d.tokens : d.sessions) || 0);
  const maxVal = Math.max(1, ...vals);

  let activeDays = 0, streak = 0, peakVal = -1;
  for (let i = 0; i < heat.length; i++) {
    if ((heat[i]?.sessions || 0) > 0) activeDays++;
    if (vals[i] > peakVal) peakVal = vals[i];
  }
  for (let i = heat.length - 1; i >= 0; i--) {
    if ((heat[i]?.sessions || 0) > 0) streak++;
    else if (i === heat.length - 1) continue;
    else break;
  }
  const peakText = peakVal > 0
    ? (heatmapMetric === 'tokens' ? `${compact(peakVal)} tok` : t('insightsHeatmapPeakSessions', { n: smallCount(peakVal) }))
    : '—';
  text('insights-heatmap-meta', t('insightsHeatmapSummary', {
    days: smallCount(activeDays),
    streak: smallCount(streak),
    peak: peakText,
  }));
  text('insights-heatmap-range', heat[0]?.date && heat.at(-1)?.date ? `${heat[0].date.slice(5)} – ${heat.at(-1).date.slice(5)}` : '');

  if (wdEl) {
    wdEl.replaceChildren(...t('insightsWeekdays').split(',').slice(0, 7).map(lbl => {
      const sp = document.createElement('span');
      sp.textContent = lbl;
      return sp;
    }));
  }

  const aligned = isMonotonicHeatmap(heat);
  const firstDow = aligned ? (parseIsoDay(heat[0].date).getUTCDay() + 6) % 7 : 0;
  const colsCount = Math.ceil((firstDow + heat.length) / 7);
  heatGrid.style.setProperty('--hm-cols', String(colsCount));

  if (monthsEl) {
    monthsEl.style.gridTemplateColumns = `repeat(${colsCount}, minmax(0, 1fr))`;
    const labels = [];
    if (aligned) {
      const zhLang = language.language === 'zh-CN' || language.language === 'zh-TW';
      let lastMonth = -1, lastCol = -3;
      for (let c = 0; c < colsCount; c++) {
        let colMonth = -1;
        for (let r = 0; r < 7; r++) {
          const item = heat[c * 7 + r - firstDow];
          const parsed = parseIsoDay(item?.date);
          if (!parsed) continue;
          const m = parsed.getUTCMonth() + 1;
          if (parsed.getUTCDate() === 1) { colMonth = m; break; }
          if (colMonth === -1) colMonth = m;
        }
        if (colMonth !== -1 && colMonth !== lastMonth) {
          lastMonth = colMonth;
          if (c - lastCol >= 2 && (colsCount < 4 || c <= colsCount - 2)) {
            const sp = document.createElement('span');
            sp.textContent = zhLang ? `${colMonth}月` : MONTHS_EN[colMonth - 1];
            sp.style.gridColumn = String(c + 1);
            sp.style.gridRow = '1';
            labels.push(sp);
            lastCol = c;
          }
        }
      }
    }
    monthsEl.replaceChildren(...labels);
  }

  const cols = [];
  for (let c = 0; c < colsCount; c++) {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    for (let r = 0; r < 7; r++) {
      const idx = c * 7 + r - firstDow;
      const d = idx >= 0 && idx < heat.length ? heat[idx] : null;
      if (!d) {
        const pad = document.createElement('span');
        pad.className = 'heatmap-cell is-pad';
        pad.setAttribute('aria-hidden', 'true');
        col.append(pad);
        continue;
      }
      const val = (heatmapMetric === 'tokens' ? d.tokens : d.sessions) || 0;
      const lvl = val <= 0 ? 0 : Math.min(4, Math.ceil((val / maxVal) * 4));
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'heatmap-cell';
      cell.dataset.date = d.date;
      cell.dataset.level = String(lvl);
      const label = t('insightsHeatmapTip', {
        date: d.date,
        sessions: smallCount(d.sessions || 0),
        tokens: compact(d.tokens || 0),
      });
      setAttr(cell, 'aria-label', label);
      setAttr(cell, 'aria-pressed', String(selectedHeatmapDate === d.date));
      cell.addEventListener('pointerenter', () => showHeatmapTip(cell, d));
      cell.addEventListener('pointerleave', hideHeatmapTip);
      cell.addEventListener('focus', () => showHeatmapTip(cell, d));
      cell.addEventListener('blur', hideHeatmapTip);
      cell.addEventListener('click', () => toggleHeatmapDate(d.date));
      col.append(cell);
    }
    cols.push(col);
  }
  heatGrid.replaceChildren(...cols);
  if (focusDate) {
    for (const btn of heatGrid.querySelectorAll('button[data-date]')) {
      if (btn.dataset.date === focusDate) {
        btn.focus({ preventScroll: true });
        break;
      }
    }
  }
}

function renderInsightsView() {
  if (panelView !== 'insights') return;
  const statusEl = $('insights-status');
  if (insightsLoading && !insightsData) {
    text('insights-status', t('insightsScanning'));
    hidden('insights-status', false);
    return;
  }
  if (insightsError) {
    text('insights-status', insightsError);
    hidden('insights-status', false);
  } else {
    hidden('insights-status', true);
  }
  if (!insightsData) return;

  const credits = insightsData.accountCredits || snapshot?.accountCredits || null;
  const creditsBar = $('insights-credits-bar');
  if (creditsBar) {
    const showCredits = Boolean(credits);
    hidden('insights-credits-bar', !showCredits);
    if (showCredits) {
      const left = [credits.planName, credits.tierName].filter(Boolean).join(' · ') || t('creditsLabel');
      const rightParts = [];
      if (credits.availablePromptCredits !== null) rightParts.push(`${t('creditsPrompt')}: ${count(credits.availablePromptCredits)}${credits.monthlyPromptCredits ? ` / ${count(credits.monthlyPromptCredits)}` : ''}`);
      if (credits.availableFlowCredits !== null) rightParts.push(`${t('creditsFlow')}: ${count(credits.availableFlowCredits)}${credits.monthlyFlowCredits ? ` / ${count(credits.monthlyFlowCredits)}` : ''}`);
      creditsBar.replaceChildren(
        Object.assign(document.createElement('span'), { textContent: left }),
        Object.assign(document.createElement('span'), { textContent: rightParts.join(' · ') || '—' }),
      );
    }
  }

  const k = insightsData.kpis || {};
  const kpiWrap = $('insights-kpis');
  if (kpiWrap) {
    const cards = [
      { label: t('insightsKpiSessions'), val: count(k.totalSessions ?? 0), sub: t('insightsKpiSessionsSub', { active: count(k.activeSessions ?? 0), archived: count(k.archivedSessions ?? 0) }) },
      { label: t('insightsKpiTokens'), val: compact(k.totalTokens ?? 0), sub: t('insightsKpiRoundsSub', { n: count(k.totalRounds ?? 0) }) },
      { label: t('insightsKpiCost'), val: k.estimatedCostUsd !== null ? `${formatUsd(k.estimatedCostUsd)}` : '—', sub: `${t('estimatedBadge')} · ${t('insightsKpiPricedSub', { priced: k.pricedSessions ?? 0, total: k.totalSessionsForPricing ?? 0 })}`, title: t('estimatedCostTitle') },
      { label: t('insightsKpiCache'), val: percent(k.avgCacheHitRate), sub: `${compact(k.cacheReadTokens ?? 0)} read` },
      { label: t('insightsKpiTools'), val: count(k.totalToolCalls ?? 0), sub: t('insightsKpiCallsSub', { n: count(k.totalModelCalls ?? 0) }) },
      { label: t('insightsKpiDuration'), val: language.elapsed((k.totalActiveMs ?? 0) / 1000), sub: insightsData.cacheInfo ? t('insightsCacheMeta', { total: insightsData.cacheInfo.totalScanned, ms: insightsData.cacheInfo.scanMs }) : '' },
    ];
    kpiWrap.replaceChildren(...cards.map(c => {
      const card = document.createElement('div'); card.className = 'kpi-card';
      if (c.title) setAttr(card, 'title', c.title);
      card.append(
        Object.assign(document.createElement('div'), { className: 'kpi-label', textContent: c.label }),
        Object.assign(document.createElement('div'), { className: 'kpi-val', textContent: c.val }),
        Object.assign(document.createElement('div'), { className: 'kpi-sub', textContent: c.sub }),
      );
      return card;
    }));
  }

  // 7-day bar chart
  const svg7d = $('insights-7d-svg');
  const days7 = Array.isArray(insightsData.last7Days) ? insightsData.last7Days : [];
  if (svg7d && days7.length) {
    const NS = 'http://www.w3.org/2000/svg', W = 280, H = 56, P = 4;
    const maxTok = Math.max(1, ...days7.map(d => d.totalTokens || 0));
    const maxCost = Math.max(0.01, ...days7.map(d => d.estimatedCostUsd || 0));
    const slotW = (W - 2 * P) / days7.length;
    const bars = [];
    for (let i = 0; i < days7.length; i++) {
      const d = days7[i], x0 = P + i * slotW + 2;
      const bw = Math.max(4, (slotW - 6) * 0.58);
      const cw = Math.max(3, (slotW - 6) * 0.34);
      const th = Math.max(1, ((d.totalTokens || 0) / maxTok) * (H - 16));
      const ch = d.estimatedCostUsd ? Math.max(1, (d.estimatedCostUsd / maxCost) * (H - 16)) : 0;
      const g = document.createElementNS(NS, 'g');
      const tip = document.createElementNS(NS, 'title');
      tip.textContent = `${d.date}: ${compact(d.totalTokens)} tok · ${d.sessions} sess · ${d.estimatedCostUsd !== null ? formatUsd(d.estimatedCostUsd) + ' (' + t('estimatedBadge') + ')' : '—'}`;
      g.append(tip);
      const r1 = document.createElementNS(NS, 'rect');
      r1.setAttribute('class', 'bar-tok'); r1.setAttribute('x', x0.toFixed(1)); r1.setAttribute('y', (H - 12 - th).toFixed(1));
      r1.setAttribute('width', bw.toFixed(1)); r1.setAttribute('height', th.toFixed(1)); r1.setAttribute('rx', '1.5');
      g.append(r1);
      if (ch > 0) {
        const r2 = document.createElementNS(NS, 'rect');
        r2.setAttribute('class', 'bar-cost'); r2.setAttribute('x', (x0 + bw + 2).toFixed(1)); r2.setAttribute('y', (H - 12 - ch).toFixed(1));
        r2.setAttribute('width', cw.toFixed(1)); r2.setAttribute('height', ch.toFixed(1)); r2.setAttribute('rx', '1.5');
        g.append(r2);
      }
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', (x0 + bw / 2).toFixed(1)); lbl.setAttribute('y', String(H - 1));
      lbl.setAttribute('font-size', '7'); lbl.setAttribute('fill', 'currentColor'); lbl.setAttribute('opacity', '0.65');
      lbl.textContent = d.date.slice(5);
      g.append(lbl);
      bars.push(g);
    }
    svg7d.replaceChildren(...bars);
    const total7 = days7.reduce((n, d) => n + (d.totalTokens || 0), 0);
    text('insights-7d-meta', `${compact(total7)} tok`);
  }

  // Activity heatmap
  const heat = Array.isArray(insightsData.heatmap) ? insightsData.heatmap : [];
  renderInsightsHeatmap(heat);

  // Token composition across sessions
  const ic = insightsData.composition || {};
  const compParts = [
    { id: 'user', label: t('cacheMiss'), val: ic.uncached || 0 },
    { id: 'reply', label: t('cacheRead'), val: ic.cacheRead || 0 },
    { id: 'thinking', label: t('cacheWrite'), val: ic.cacheWrite || 0 },
    { id: 'customization', label: t('cacheOutput'), val: ic.output || 0 },
  ].filter(p => p.val > 0);
  const compSum = compParts.reduce((n, p) => n + p.val, 0);
  const compMeter = $('insights-comp-meter'), compLegend = $('insights-comp-legend');
  if (compMeter && compLegend) {
    text('insights-comp-meta', compSum ? `${compact(compSum)} tok` : '—');
    compMeter.replaceChildren(...compParts.map(p => {
      const i = document.createElement('i');
      i.className = `composition-seg-${p.id}`;
      i.style.width = `${(p.val / (compSum || 1)) * 100}%`;
      setAttr(i, 'title', `${p.label}: ${count(p.val)}`);
      return i;
    }));
    compLegend.replaceChildren(...compParts.map(p => {
      const item = document.createElement('span'); item.className = 'composition-legend-item';
      const dot = document.createElement('i'); dot.className = `composition-legend-dot composition-seg-${p.id}`;
      const pct = Math.round((p.val / (compSum || 1)) * 100);
      item.append(dot, Object.assign(document.createElement('span'), { textContent: `${p.label} ${pct}%` }));
      setAttr(item, 'title', `${p.label}: ${count(p.val)}`);
      return item;
    }));
  }

  // 4 distribution cards
  const dist = insightsData.distributions || {};
  const projects = Array.isArray(dist.projects) ? dist.projects : [];
  const skills = Array.isArray(dist.skills) ? dist.skills : [];
  const tools = Array.isArray(dist.tools) ? dist.tools : [];
  const commands = Array.isArray(dist.commands) ? dist.commands : [];
  const projTokens = projects.reduce((n, p) => n + (p.tokens || 0), 0);
  const skillRuns = skills.reduce((n, s) => n + (s.count || 0), 0);
  const toolCallsSum = tools.reduce((n, item) => n + (item.count || 0), 0);
  const toolCalls = Number.isFinite(k.totalToolCalls) && k.totalToolCalls >= toolCallsSum ? k.totalToolCalls : toolCallsSum;
  const cmdRuns = commands.reduce((n, item) => n + (item.count || 0), 0);
  text('insights-dist-projects-sub', t('insightsProjectsSubtotal', { n: count(projects.length), tokens: compact(projTokens) }));
  text('insights-dist-skills-sub', t('insightsSkillsSubtotal', { n: count(skills.length), runs: count(skillRuns) }));
  text('insights-dist-tools-sub', t('insightsToolsSubtotal', { n: count(tools.length), calls: count(toolCalls) }));
  text('insights-dist-commands-sub', t('insightsCommandsSubtotal', { n: count(commands.length), runs: count(cmdRuns) }));
  renderDistList('insights-dist-projects', projects, {
    tone: 'projects',
    metric: p => p.tokens || p.sessions || 0,
    formatVal: p => `${t('insightsUnitSessions', { n: smallCount(p.sessions) })} · ${compact(p.tokens)} toks`,
  });
  renderDistList('insights-dist-skills', skills, {
    tone: 'skills',
    metric: s => s.count || 0,
    formatVal: s => `${t('insightsUnitRuns', { n: smallCount(s.count) })} · ${t('insightsUnitSessions', { n: smallCount(s.sessions) })}`,
  });
  renderDistList('insights-dist-tools', tools, {
    tone: 'tools',
    metric: item => item.count || 0,
    formatVal: item => t('insightsUnitCalls', { n: count(item.count) }),
  });
  renderDistList('insights-dist-commands', commands, {
    tone: 'commands',
    metric: item => item.count || 0,
    formatVal: item => t('insightsUnitRuns', { n: count(item.count) }),
  });

  // Sessions list
  const allSessions = Array.isArray(insightsData.sessions) ? insightsData.sessions : [];
  const sessions = selectedHeatmapDate
    ? allSessions.filter(s => Array.isArray(s.activeDates) && s.activeDates.includes(selectedHeatmapDate))
    : allSessions;
  const dateFilterBtn = $('insights-date-filter');
  if (dateFilterBtn) {
    dateFilterBtn.hidden = !selectedHeatmapDate;
    dateFilterBtn.textContent = selectedHeatmapDate ? t('insightsHeatmapClearDate', { date: selectedHeatmapDate }) : '';
  }
  text('insights-sessions-title', t('insightsSessionsTitle', { n: count(selectedHeatmapDate ? sessions.length : (insightsData.totalMatchingSessions ?? sessions.length)) }));
  if (insightsData.cacheInfo) {
    text('insights-cache-meta', t('insightsCacheMeta', { total: insightsData.cacheInfo.totalScanned, ms: insightsData.cacheInfo.scanMs }));
  }
  const sessList = $('insights-sessions-list');
  if (sessList) {
    if (!sessions.length) {
      sessList.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'insights-status',
        textContent: selectedHeatmapDate ? t('insightsEmptyDate', { date: selectedHeatmapDate }) : t('insightsEmpty'),
      }));
    } else {
      sessList.replaceChildren(...sessions.slice(0, 100).map(s => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'session-row';
        const top = document.createElement('div'); top.className = 'session-row-top';
        const title = Object.assign(document.createElement('span'), { className: 'session-row-title', textContent: s.title });
        const costTag = s.estimatedCostUsd !== null ? formatUsd(s.estimatedCostUsd) : '—';
        const badge = Object.assign(document.createElement('span'), { className: 'audit-badge', textContent: `${compact(s.totalTokens)} · ${costTag}` });
        top.append(title, badge);
        const meta = document.createElement('div'); meta.className = 'session-row-meta';
        meta.append(
          Object.assign(document.createElement('span'), { textContent: [s.project, s.model, s.archived ? t('insightsArchived') : s.status].filter(Boolean).join(' · ') }),
          Object.assign(document.createElement('span'), { textContent: `${s.rounds}T · ${percent(s.cacheHitRate)}` }),
        );
        btn.append(top, meta);
        btn.addEventListener('click', () => {
          setInspectedConversation(s.id);
          showCard('context');
          showPanelView('session');
        });
        return btn;
      }));
    }
  }
}

function renderUsageSummary(usage){
  const entry=$('panel-usage-entry');
  if(!entry)return;
  const hasUsage=Boolean(usage);
  hidden('panel-usage-entry',!hasUsage);
  if(!hasUsage)return;
  const todayTokens=usage.todayTokens,monthTokens=usage.monthTokens;
  const hasToday=Number.isSafeInteger(todayTokens)&&todayTokens>=0;
  const hasMonth=Number.isSafeInteger(monthTokens)&&monthTokens>=0;
  text('panel-usage-today',hasToday?compact(todayTokens):'—');
  text('panel-usage-today-unit',` ${tokUnit(hasToday?todayTokens:0)}`);
  hidden('panel-usage-today-unit',!hasToday);
  text('panel-usage-month',hasMonth?compact(monthTokens):'—');
  text('panel-usage-month-unit',` ${tokUnit(hasMonth?monthTokens:0)}`);
  hidden('panel-usage-month-unit',!hasMonth);
}

function render() {
  if (!snapshot) return;
  const groups = snapshot.groups || [], speed = snapshot.speed, composerModel = snapshot.composerModel || null;
  renderAccountCredits(snapshot.accountCredits || null);
  hidden('strip-session-reset', !inspectedConversationId);
  const modelSig = `${composerModel || ''}\n${speed?.model || ''}`;
  if (lastModelSig === null) lastModelSig = modelSig;
  else if (modelSig !== lastModelSig) { lastModelSig = modelSig; selectedGroup = null; }
  autoGroupId = language.chooseQuotaGroup(groups, [composerModel, speed?.model], null)?.id || null;
  group = chooseGroup(groups, speed, composerModel);
  const optionsKey = JSON.stringify([groups.map(g => [g.id,groupLabel(g)]),Boolean(group),language.language]);
  const select = $('quota-group');
  if (select.dataset.options !== optionsKey) {
    const options=groups.map(g=>new Option(groupLabel(g),g.id));
    if(!group){const empty=new Option(t('unavailableQuota'),'');empty.disabled=true;options.unshift(empty);}
    select.replaceChildren(...options);
    select.dataset.options = optionsKey;
  }
  select.value = group?.id||'';
  select.dataset.quotaFamily=language.quotaGroupKind(group)||'';
  select.title = group?groupLabel(group):t('unavailableQuota');
  for (const element of document.querySelectorAll('.group-name')) element.textContent = group ? groupLabel(group) : '—';
  const now = Date.now() + serverOffset;
  const panelSpot = $('panel-active-group');
  if (panelSpot) {
    text('panel-group-name', group ? groupLabel(group) : '—');
    hidden('panel-active-group', !group);
    const pace = group ? language.groupQuotaPace(group, now, { dailyWorkHours: snapshot?.usage?.dailyWorkHours }) : null;
    const badge = $('panel-quota-pace');
    if (badge) {
      hidden('panel-quota-pace', !pace);
      if (pace) {
        text('panel-quota-pace-text', pace.label);
        badge.dataset.pace = pace.pace;
        if (pace.critical) badge.dataset.critical = 'true'; else badge.removeAttribute('data-critical');
        badge.title = pace.title;
      }
    }
  }
  const visibleQuotaWindows=language.quotaWindows(group),isArgon=language.quotaGroupKind(group)==='gemini-argon';
  for(const [key,prefix]of[['5h','five'],['weekly','week']]){
    hidden(`${prefix}-details`,!visibleQuotaWindows.includes(key));
  }
  text('week-quota-title',t(isArgon?'argonWeek':'week'));
  $('week-details').setAttribute('aria-label',t(isArgon?'argonWeek':'week'));
  renderQuota('5h','five',now); renderQuota('weekly','week',now);
  renderQuotaStrip(now);
  const sibWrap = $('panel-quota-siblings');
  if (sibWrap) {
    const siblings = group ? groups.filter(g => g.id !== group.id) : groups;
    hidden('panel-quota-siblings', !siblings.length);
    const sibSig = JSON.stringify(siblings.map(g => [g.id, groupLabel(g), language.quotaWindows(g), language.quotaGroupKind(g) === 'gemini-argon', language.language]));
    if (sibWrap.dataset.signature !== sibSig) {
      sibWrap.replaceChildren(...siblings.map(g => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quota-sibling';
        btn.dataset.group = g.id;
        const wins = language.quotaWindows(g), sibArgon = language.quotaGroupKind(g) === 'gemini-argon';
        const lbl = document.createElement('span'); lbl.className = 'sibling-label';
        const dot = document.createElement('i'); dot.className = 'sibling-dot'; dot.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.className = 'sibling-name'; name.textContent = groupLabel(g);
        lbl.append(dot, name);
        const metrics = document.createElement('span'); metrics.className = 'sibling-metrics';
        for (const w of wins) {
          const winEl = document.createElement('span'); winEl.className = 'sibling-win'; winEl.dataset.window = w;
          const tagEl = document.createElement('span'); tagEl.className = 'sibling-tag'; tagEl.textContent = w === '5h' ? '5h' : t(sibArgon ? 'argonWeek' : 'weekShort');
          const valEl = document.createElement('span'); valEl.className = 'sibling-val'; valEl.textContent = '—';
          const bar = document.createElement('i'); bar.className = 'sibling-bar';
          const fill = document.createElement('i'); bar.append(fill);
          winEl.append(tagEl, valEl, bar);
          metrics.append(winEl);
        }
        btn.append(lbl, metrics);
        btn.addEventListener('click', () => {
          const kb = btn.matches(':focus-visible');
          selectedGroup = g.id === autoGroupId ? null : g.id;
          render();
          if (kb) sibWrap.querySelector('.quota-sibling')?.focus({ preventScroll: true });
        });
        return btn;
      }));
      sibWrap.dataset.signature = sibSig;
    }
    for (const btn of sibWrap.children) {
      const g = groups.find(item => item.id === btn.dataset.group);
      if (!g) continue;
      const wins = language.quotaWindows(g), sibArgon = language.quotaGroupKind(g) === 'gemini-argon';
      const tipParts = [groupLabel(g)];
      for (const w of wins) {
        const winEl = btn.querySelector(`.sibling-win[data-window="${w}"]`);
        if (!winEl) continue;
        const b = g?.windows?.[w], remaining = language.quotaRemaining(b), val = b?.disabled ? t('unavailableQuota') : percent(remaining);
        const valEl = winEl.querySelector('.sibling-val'), fillEl = winEl.querySelector('.sibling-bar i');
        if (valEl && valEl.textContent !== val) valEl.textContent = val;
        if (fillEl) {
          const nextWidth = typeof remaining === 'number' ? `${remaining * 100}%` : '0%';
          const nextBg = remaining !== null && remaining < .05 ? 'var(--pulse-danger)' : '';
          if (fillEl.style.width !== nextWidth) fillEl.style.width = nextWidth;
          if (fillEl.style.background !== nextBg) fillEl.style.background = nextBg;
        }
        const tag = w === '5h' ? '5h' : t(sibArgon ? 'argonWeek' : 'weekShort');
        tipParts.push(`${tag} ${val}`);
      }
      const tip = tipParts.join(' · ');
      if (btn.title !== tip) btn.title = tip;
    }
  }
  const isFiniteRate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const rateStatus=speed?.latestRateStatus;
  const legacyRate=rateStatus==='legacy',shortRate=rateStatus==='short',bufferedRate=rateStatus==='buffered',unreliableRate=rateStatus==='unreliable';
  const statusRate=legacyRate||shortRate||bufferedRate||unreliableRate;
  const latestVal=!speed||legacyRate?null:!statusRate&&isFiniteRate(speed.latestTps)?speed.latestTps:isFiniteRate(speed.tps)?speed.tps:null;
  const trailSamples=speed&&!legacyRate?(Array.isArray(speed.recentTps)&&speed.recentTps.length?speed.recentTps.filter(v=>isFiniteRate(v)&&v>0):latestVal>0?[Math.round(latestVal*10)/10]:[]):[];
  renderPanelTrail(trailSamples);
  $('strip-tps').textContent = rate(speed?.tps);
  $('speed-tab').title=speed?`${t('sessionAvg')}: ${rate(speed.tps)} tok/s · ${t('e2eShort')}: ${rate(speed.e2eTps)} tok/s`:'— tok/s';
  $('session-tps').textContent = legacyRate?t('ratePending'):rate(speed?.tps);
  hidden('panel-session-unit',Boolean(legacyRate));
  setTip($('session-speed-cell'), speed ? language.rateNote(speed) : null);
  text('e2e-tps', legacyRate?t('ratePending'):rate(speed?.e2eTps));
  hidden('panel-e2e-unit',Boolean(legacyRate));
  setTip($('e2e-speed-cell'), t('e2eBasis'));
  $('latest-tps').textContent = shortRate?t('timingShort'):bufferedRate?t('timingBuffered'):unreliableRate?t('timingUnreliable'):legacyRate?t('ratePending'):rate(latestVal);
  setAttr($('latest-tps'),'data-status',statusRate?'true':null);
  setAttr($('latest-tps'),'data-rate-state',statusRate?rateStatus:null);
  hidden('panel-latest-unit',Boolean(statusRate));
  const durVal=speed?.latestDurationSeconds;
  const durStr=isFiniteRate(durVal)?(durVal>=10?`${durVal.toFixed(1)}s`:`${durVal.toFixed(2)}s`):'';
  const tokStr=typeof speed?.latestOutputTokens==='number'&&Number.isSafeInteger(speed.latestOutputTokens)?count(speed.latestOutputTokens):'';
  const hasPrevRef=Boolean(speed?.prevQualifiedSameModel&&isFiniteRate(speed?.prevQualifiedTps));
  const subText=shortRate&&tokStr&&durStr?(hasPrevRef?t('shortSublineRef',{tokens:tokStr,dur:durStr,prev:rate(speed.prevQualifiedTps)}):t('shortSubline',{tokens:tokStr,dur:durStr})):bufferedRate&&tokStr&&durStr?(isFiniteRate(speed?.latestE2eTps)?t('bufferedSublineE2e',{tokens:tokStr,dur:durStr,e2e:rate(speed.latestE2eTps)}):t('shortSubline',{tokens:tokStr,dur:durStr})):'';
  text('latest-sub',subText);
  hidden('latest-sub',!subText);
  let heroTip=t('latestSpeedTip');
  if((shortRate||bufferedRate)&&tokStr&&durStr){
    heroTip=t(shortRate?'shortSpeedTip':'bufferedSpeedTip',{tokens:tokStr,dur:durStr});
    if(isFiniteRate(speed?.latestE2eTps))heroTip+=t('latestTipE2e',{e2e:rate(speed.latestE2eTps)});
    if(hasPrevRef)heroTip+=t('latestTipPrev',{prev:rate(speed.prevQualifiedTps)});
  }
  setTip($('speed-hero-row'), heroTip);
  const peakCandidate=legacyRate||!speed?-1:isFiniteRate(speed.peakTps)?speed.peakTps:Math.max(isFiniteRate(speed.tps)?speed.tps:-1,!statusRate&&isFiniteRate(speed.latestTps)?speed.latestTps:-1);
  text('peak-tps',peakCandidate>=0?rate(peakCandidate):'—');
  setTip($('peak-speed-cell'), t('peakBasis'));
  $('request-count').textContent = t('sampleCount',{n:speed?.measuredRequests??0});
  $('session-steps').textContent = speed ? t('rounds',{rounds:speed.rounds,steps:speed.steps}).replace(/\s*·\s*$/,'') : '';
  const collectionLimited=snapshot.collection?.state==='limited',collectionProcessing=snapshot.collection?.state==='processing'&&snapshot.collection.code==='background-collection';
  $('strip-model').textContent = collectionProcessing?t(speed?'collectionSaved':'collectionProcessing'):collectionLimited?t(speed?'collectionSaved':'collectionLimited'):speed?.model || t(snapshot.sessionError?'collectionUnavailable':'waitingRequest');
  $('strip-model').title=$('strip-model').textContent;
  $('model-time').textContent = language.elapsed(speed?.modelSeconds);
  $('tool-time').textContent = language.elapsed(speed?.toolSeconds);
  text('speed-times', speed ? `${language.elapsed(speed.modelSeconds)} / ${language.elapsed(speed.toolSeconds)}` : '—');
  if ($('speed-times')?.parentElement) $('speed-times').parentElement.title = speed ? `${t('modelTime')}: ${language.elapsed(speed.modelSeconds)} · ${t('toolTime')}: ${language.elapsed(speed.toolSeconds)}` : '';
  const ttftP50 = speed?.ttftMedianSeconds ?? speed?.ttftSeconds, ttftLast = speed?.latestTtftSeconds;
  const ttftUnit = language.language === 'en' ? 's' : ' 秒';
  const ttftLastText = isFiniteRate(ttftLast) ? (ttftLast < 60 ? `${ttftLast >= 10 ? ttftLast.toFixed(1) : ttftLast.toFixed(2)}${ttftUnit}` : language.elapsed(ttftLast)) : '';
  $('ttft').textContent = language.elapsed(ttftP50);
  text('ttft-latest', ttftLastText ? ` / ${ttftLastText}` : '');
  setTip($('ttft-cell'), t('ttftBasis', { p50: language.elapsed(ttftP50), latest: language.elapsed(ttftLast) }));
  const respOut = speed?.counts?.responseOutput, thinkOut = speed?.counts?.thinkingOutput;
  $('token-detail').textContent = speed ? `${count(respOut)} / ${count(thinkOut)} ${tokUnit((respOut || 0) + (thinkOut || 0))}` : '—';
  text('speed-basis-tag', speed ? t(speed.rateBasis === 'all-output' ? 'basisShortAll' : 'basisShortResponse') : '');
  setTip($('speed-basis-tag'), speed ? language.rateNote(speed) : null);
  const taskUsage=Number.isSafeInteger(speed?.taskUsage?.subagents)&&speed.taskUsage.subagents>0?speed.taskUsage:null;
  const usage=taskUsage||speed,cache=usage?.cache;
  const currentOnly=!collectionLimited&&!collectionProcessing&&taskUsage?.state==='partial'&&taskUsage.loadedSubagents===0;
  const cacheTab=$('cache-tab');
  const cacheAttr=(name,value)=>{if(value===null){if(cacheTab.hasAttribute(name))cacheTab.removeAttribute(name);}else if(cacheTab.getAttribute(name)!==value)cacheTab.setAttribute(name,value);};
  cacheAttr('data-task-current-only',currentOnly?'true':null);
  cacheAttr('aria-label',currentOnly?t('taskCurrentOnly'):null);
  cacheAttr('title',currentOnly?t('taskCurrentOnly'):null);
  const context=speed?.context,hasCapacity=typeof context?.usedFraction==='number';
  const rawContextPct=hasCapacity?Math.round(context.usedFraction*100):null;
  const contextPct=hasCapacity?Math.min(100,rawContextPct):null;
  const contextOverWindow=hasCapacity&&context.usedFraction>1;
  const overWindowRaw=contextOverWindow?(rawContextPct>100?String(rawContextPct):(context.usedFraction*100).toFixed(1)):'';
  const overWindowTip=contextOverWindow?t('contextOverWindow',{raw:overWindowRaw}):'';
  const transcript=speed?.transcriptStats;
  const roundCount=Number.isSafeInteger(speed?.rounds)&&speed.rounds>0?speed.rounds:null;
  const stepCount=Number.isSafeInteger(speed?.steps)&&speed.steps>=0?speed.steps:null;
  const roundSuffix=roundCount!==null?` · ${t('contextTurnsCount',{n:smallCount(roundCount)})}`:'';
  const compactions=transcript&&['ready','partial'].includes(transcript.status)&&typeof transcript.compactionMarkers==='number'?transcript.compactionMarkers:null;
  const compSuffix=compactions!==null&&compactions>0?` · ${t('contextCompactionSummary',{n:compactions})}`:'';
  $('strip-context').textContent=hasCapacity?`${contextPct}%`:'—';
  $('strip-context-size').textContent=context?`${compact(context.usedTokens)} / ${context.maxTokens===null?'—':compact(context.maxTokens)}`:'—';
  $('context-tab').title=(context?t('contextTokens',{used:count(context.usedTokens),max:context.maxTokens===null?'—':count(context.maxTokens)}):t('contextUnknown'))+(overWindowTip?` · ${overWindowTip}`:'')+roundSuffix+compSuffix;
  $('context-summary').textContent=hasCapacity?t('contextUsed',{used:contextPct,remaining:Math.round(context.remainingFraction*100)}):(speed?.archivedFallback&&Number.isSafeInteger(context?.usedTokens)?`${compact(context.usedTokens)} ${tokUnit(context.usedTokens)}`:t('contextUnknown'));
  setTip($('context-summary'),overWindowTip||null);
  $('context-tokens').textContent=context?t('contextTokens',{used:compact(context.usedTokens),max:context.maxTokens===null?'—':compact(context.maxTokens)}):'—';
  $('context-model').textContent=context?.model||speed?.model||'—';
  hidden('context-audit-toggle',!(activeConversationId()||speed?.conversationId));
  const roundsPill=$('context-rounds-pill'),stepsDrawer=$('context-steps-drawer');
  const sb=speed?.stepBreakdown;
  const stepBuckets=sb?[['tool','stepBucketTool'],['planner','stepBucketPlanner'],['user','stepBucketUser'],['compaction','stepBucketCompaction'],['other','stepBucketOther']].map(([key,lblKey])=>({key,label:t(lblKey),count:Number.isSafeInteger(sb[key])&&sb[key]>0?sb[key]:0})).filter(b=>b.count>0):[];
  const sbTotal=stepBuckets.reduce((sum,b)=>sum+b.count,0);
  const canExpandSteps=roundCount!==null&&sbTotal>0;
  if(!canExpandSteps)stepsDrawerOpen=false;
  if(roundsPill){
    hidden('context-rounds-pill',roundCount===null);
    if(roundCount!==null){
      const baseText=stepCount!==null?t('contextTurnsSteps',{rounds:smallCount(roundCount),steps:smallCount(stepCount)}):t('contextTurnsCount',{n:smallCount(roundCount)});
      text('context-rounds-pill-text',baseText);
      if(roundsPill.disabled!==!canExpandSteps)roundsPill.disabled=!canExpandSteps;
      setAttr(roundsPill,'aria-expanded',String(canExpandSteps&&stepsDrawerOpen));
      setTip(roundsPill,stepCount!==null?`${t('contextTurnsTitle',{rounds:smallCount(roundCount),steps:smallCount(stepCount)})}${canExpandSteps?` · ${t('stepBreakdownHint')}`:''}`:t('contextTurnsCount',{n:smallCount(roundCount)}));
    }else{
      if(!roundsPill.disabled)roundsPill.disabled=true;
      setAttr(roundsPill,'aria-expanded','false');
      setTip(roundsPill,null);
    }
  }
  const compactionPill=$('context-compaction-pill');
  if(compactionPill){
    hidden('context-compaction-pill',!(compactions!==null&&compactions>0));
    if(compactions!==null&&compactions>0){
      text('context-compaction-pill',t('contextCompactionCount',{n:compactions}));
      compactionPill.title=`${t('contextCompactionsTitle',{n:compactions})}\n${t('compactionMetricsBasis')}`;
    }
  }
  const mkEl=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
  const mkRow=(name,val,warn=false,critical=false)=>{
    const r=mkEl('div','breakdown-row');
    r.append(mkEl('span','breakdown-row-name',name),mkEl('span',warn?'breakdown-row-val breakdown-row-warn':'breakdown-row-val',val));
    if(critical)r.lastChild.dataset.critical='true';
    return r;
  };
  const bloatPill=$('context-bloat-pill');
  const bloatWarnings=Array.isArray(transcript?.bloatWarnings)?transcript.bloatWarnings:[];
  const hasBloat=bloatWarnings.length>0;
  if(bloatPill){
    hidden('context-bloat-pill',!hasBloat);
    if(hasBloat){
      text('context-bloat-pill',`⚠ ${t('bloatBadge',{n:bloatWarnings.length})}`);
      if(bloatWarnings.some(w=>w.severity==='critical'))bloatPill.dataset.critical='true';else bloatPill.removeAttribute('data-critical');
      bloatPill.title=bloatWarnings.map(w=>t('bloatWarningLine',{tool:w.tool,step:w.stepIndex,tokens:compact(w.tokens)})).join('\n');
    }else bloatPill.removeAttribute('data-critical');
  }
  hidden('context-submeta-row',roundCount===null&&!(compactions!==null&&compactions>0)&&!hasBloat);
  if(stepsDrawer){
    const showDrawer=canExpandSteps&&stepsDrawerOpen;
    hidden('context-steps-drawer',!showDrawer);
    if(showDrawer){
      const drawerSig=JSON.stringify([language.language,roundCount,sbTotal,stepBuckets]);
      if(stepsDrawer.dataset.signature!==drawerSig){
        stepsDrawer.dataset.signature=drawerSig;
        const head=mkEl('div','steps-drawer-head');
        head.append(mkEl('span','',t('stepBreakdownTitle',{n:smallCount(sbTotal)})),mkEl('span','steps-drawer-sub',t('contextTurnsCount',{n:smallCount(roundCount)})));
        const bar=mkEl('div','steps-bar');
        const chips=mkEl('div','steps-chips');
        for(const b of stepBuckets){
          const pct=((b.count/sbTotal)*100).toFixed(1);
          const seg=mkEl('i',`steps-seg-${b.key}`);
          seg.style.width=`${pct}%`;
          seg.title=`${b.label}: ${smallCount(b.count)} (${pct}%)`;
          bar.append(seg);
          const chip=mkEl('span','steps-chip');
          chip.title=seg.title;
          chip.append(mkEl('i',`steps-dot steps-seg-${b.key}`),mkEl('span','',b.label),mkEl('strong','',smallCount(b.count)));
          chips.append(chip);
        }
        stepsDrawer.replaceChildren(head,bar,chips);
      }
    }else if(stepsDrawer.dataset.signature){
      delete stepsDrawer.dataset.signature;stepsDrawer.replaceChildren();
    }
  }
  const ctxBreakdown=$('context-breakdown');
  if(ctxBreakdown){
    const hasSteps=Boolean(transcript&&['ready','partial'].includes(transcript.status)&&transcript.matchedSteps>0);
    const stepTools=Array.isArray(speed?.toolSummary?.tools)?speed.toolSummary.tools:[];
    const txTools=Array.isArray(transcript?.toolBreakdown)?transcript.toolBreakdown:[];
    const tools=txTools.length?txTools:stepTools;
    const showCtx=hasSteps||tools.length>0||hasBloat;
    hidden('context-breakdown',!showCtx);
    if(showCtx){
      const ctxSig=JSON.stringify([language.language,hasSteps,transcript?.userTokens,transcript?.assistantTokens,transcript?.responseTokens,transcript?.thinkingTokens,transcript?.toolTokens,transcript?.toolCallTokens,transcript?.systemTokens,transcript?.totalTokens,tools,bloatWarnings]);
      if(ctxBreakdown.dataset.signature!==ctxSig){
        ctxBreakdown.dataset.signature=ctxSig;
        text('ctx-breakdown-label',t('contextBreakdown'));
        text('ctx-breakdown-meta',hasBloat?t('bloatBadge',{n:bloatWarnings.length}):hasSteps?`${compact(transcript.totalTokens)} ${tokUnit(transcript.totalTokens)}`:`${tools.length}`);
        const nodes=[];
        if(hasSteps){
          const chips=mkEl('div','breakdown-chips');
          const think=transcript.thinkingTokens||0;
          const reply=transcript.responseTokens||Math.max(0,(transcript.assistantTokens||0)-think);
          const pairs=[['breakdownUser',transcript.userTokens||0],['breakdownReply',reply],['breakdownThinking',think],['breakdownToolCalls',transcript.toolCallTokens||0],['breakdownTools',transcript.toolTokens||0],['breakdownSystem',transcript.systemTokens||0]];
          for(const [k,v]of pairs)if(v>0){const c=mkEl('span','breakdown-chip');c.append(mkEl('span','',t(k)),mkEl('strong','',compact(v)));chips.append(c);}
          if(chips.childNodes.length)nodes.push(chips);
        }
        if(tools.length){
          const sec=mkEl('div','breakdown-section');
          sec.append(mkEl('div','breakdown-head',t('topTools')));
          for(const tl of tools.slice(0,5)){
            const res=tl.resultTokens||0,args=tl.argTokens||0,total=res+args;
            const detail=res>0?`${compact(total)} (${tl.calls}×)`:args>0?`${compact(args)} args · ${tl.calls}×`:`${tl.calls}×`;
            sec.append(mkRow(tl.name,detail,tl.maxResultTokens>=20000||args>=20000,tl.maxResultTokens>=50000||args>=50000));
          }
          nodes.push(sec);
        }
        if(hasBloat){
          const sec=mkEl('div','breakdown-section');
          sec.append(mkEl('div','breakdown-head',t('bloatHint')));
          for(const w of bloatWarnings.slice(0,4))sec.append(mkRow(`${w.tool} #${w.stepIndex}`,`${compact(w.tokens)} ${tokUnit(w.tokens)}`,true,w.severity==='critical'));
          nodes.push(sec);
        }
        $('ctx-breakdown-body').replaceChildren(...nodes);
      }
    }else if(ctxBreakdown.dataset.signature){
      delete ctxBreakdown.dataset.signature;$('ctx-breakdown-body').replaceChildren();
    }
  }
  $('context-fill').style.width=hasCapacity?`${Math.min(1,context.usedFraction)*100}%`:'0%';
  $('context-fill').style.background=hasCapacity&&context.usedFraction>=.9?'var(--pulse-danger)':hasCapacity&&context.usedFraction>=.75?'var(--pulse-warning)':'';
  if(hasCapacity){$('context-track').setAttribute('aria-valuenow',String(Math.min(100,context.usedFraction*100)));$('context-track').setAttribute('aria-valuemin','0');$('context-track').setAttribute('aria-valuemax','100');}else $('context-track').removeAttribute('aria-valuenow');
  renderContextComposition(speed?.contextComposition||null);
  text('strip-cache',percent(cache?.hitRate));text('cache-rate',percent(cache?.hitRate));
  const tokens=usage?.tokens || cache;
  const hasTotal=tokens?.measuredRequests&&Number.isSafeInteger(tokens.totalTokens)&&tokens.totalTokens>=0;
  text('strip-cache-total-num',hasTotal?compact(tokens.totalTokens):'—');
  text('cache-coverage',hasTotal?(tokens.totalTokens>=1e9?compactDetail(tokens.totalTokens):count(tokens.totalTokens)):'—');
  text('cache-coverage-unit',hasTotal?tokUnit(tokens.totalTokens):'toks');
  setTip($('cache-coverage')?.parentElement,hasTotal&&tokens.totalTokens>=1e9?`${count(tokens.totalTokens)} ${tokUnit(tokens.totalTokens)}`:null);
  const inputCoverage={uncachedTokens:'uncachedRequests',cachedTokens:'cachedRequests',cacheWriteTokens:'cacheWriteRequests'};
  for(const [field,id,labelKey]of[['cachedTokens','cache-read','cacheRead'],['uncachedTokens','cache-miss','cacheMiss'],['outputTokens','cache-output','cacheOutput']]) {
    const available=field==='outputTokens'?(tokens?.outputAvailable??(tokens?.outputRequests??tokens?.measuredRequests)):(tokens?.[inputCoverage[field]]??tokens?.inputRequests??tokens?.measuredRequests);
    const known=Number.isSafeInteger(tokens?.[field])&&tokens[field]>=0;
    const cell=$(`${id}-cell`);
    if(available&&known){
      const v=tokens[field];
      text(id,compactDetail(v));text(`${id}-unit`,` ${tokUnit(v)}`);hidden(`${id}-unit`,false);
      setTip(cell,`${t(labelKey)}: ${count(v)} ${tokUnit(v)}`);
    }else{
      text(id,'—');hidden(`${id}-unit`,true);
      setTip(cell,null);
    }
  }
  const cwAvail=tokens?.cacheWriteRequests??tokens?.inputRequests??tokens?.measuredRequests;
  const cwKnown=cwAvail&&Number.isSafeInteger(tokens?.cacheWriteTokens)&&tokens.cacheWriteTokens>=0;
  const cwVal=tokens?.cacheWriteTokens;
  text('cache-write',cwKnown?`${cwVal>=1e9?compactDetail(cwVal):count(cwVal)} ${tokUnit(cwVal)}`:'—');
  setTip($('cache-write-row'),cwKnown&&cwVal>=1e9?`${count(cwVal)} ${tokUnit(cwVal)}`:null);
  const readVal=Number.isSafeInteger(tokens?.cachedTokens)&&tokens.cachedTokens>0?tokens.cachedTokens:0;
  const missVal=Number.isSafeInteger(tokens?.uncachedTokens)&&tokens.uncachedTokens>0?tokens.uncachedTokens:0;
  const outVal=Number.isSafeInteger(tokens?.outputTokens)&&tokens.outputTokens>0?tokens.outputTokens:0;
  const meterSum=readVal+missVal+outVal;
  $('cache-seg-read').style.width=meterSum?`${(readVal/meterSum)*100}%`:'0%';
  $('cache-seg-miss').style.width=meterSum?`${(missVal/meterSum)*100}%`:'0%';
  $('cache-seg-out').style.width=meterSum?`${(outVal/meterSum)*100}%`:'0%';
  hidden('cache-write-row',!(tokens?.cacheWriteTokens>0));
  const estCost=speed?.estimatedCost;
  hidden('session-cost-row',!(estCost?.hasPriced&&estCost.totalUsd!==null));
  if(estCost?.hasPriced&&estCost.totalUsd!==null){
    text('session-cost-value',`${formatUsd(estCost.totalUsd)} (${t('estimatedBadge')})`);
    setTip($('session-cost-row'),t('estimatedCostTitle'));
  }
  hidden('task-own-row',!taskUsage);hidden('task-subagents-row',!taskUsage);
  text('task-subagents-label',taskUsage?(taskUsage.isSwarm?t('taskSwarm',{n:count(taskUsage.subagents)}):t('taskSubagents',{n:count(taskUsage.subagents)})):'');
  for(const [field,id,rowId]of[['ownTokens','task-own','task-own-row'],['subagentTokens','task-subagents','task-subagents-row']]){
    const value=taskUsage?.[field],known=field!=='subagentTokens'||taskUsage?.loadedSubagents>0;
    const ok=known&&Number.isSafeInteger(value)&&value>=0;
    text(id,ok?`${value>=1e9?compactDetail(value):count(value)} ${tokUnit(value)}`:'—');
    setTip($(rowId),ok&&value>=1e9?`${count(value)} ${tokUnit(value)}`:null);
  }
  const taskNote=taskUsage?.state==='loading'?t('taskLoading'):taskUsage?.state==='partial'?t(taskUsage.loadedSubagents===0?'taskCurrentOnly':'taskPartial'):'';
  text('cache-note',taskNote);hidden('cache-note',!taskNote);
  const orchPhaseEl=$('orchestrator-breakdown');
  const orch=speed?.orchestrator?.detected?speed.orchestrator:null;
  if(orchPhaseEl){
    hidden('orchestrator-breakdown',!orch);
    if(orch){
      const phaseSig=JSON.stringify([language.language,orch]);
      if(orchPhaseEl.dataset.signature!==phaseSig){
        orchPhaseEl.dataset.signature=phaseSig;
        text('orch-phase-label',t('orchCardTitle'));
        text('orch-phase-meta',orch.switched?t('orchSwitchCount',{n:count(orch.phaseSwitchCount||1)}):t('orchReadOnlyTag'));
        const phaseNodes=[];
        const sec=mkEl('div','breakdown-section');
        sec.append(mkEl('div','breakdown-head',t('orchScopeHint')));
        if(orch.planner){
          const p=orch.planner,pName=`${t('orchRolePlanner')} · ${p.model||orch.configuredPlanner||'—'}`;
          const pRow=mkRow(pName,`${compact(p.totalTokens)} · ${t('reqCountShort',{n:smallCount(p.requests)})} · ${percent(p.hitRate)}`);
          setTip(pRow,pName);sec.append(pRow);
        }
        if(orch.executor){
          const e=orch.executor,eName=`${t('orchRoleExecutor')} · ${e.model||orch.configuredExecutor||'—'}`;
          const eRow=mkRow(eName,`${compact(e.totalTokens)} · ${t('reqCountShort',{n:smallCount(e.requests)})} · ${percent(e.hitRate)}`);
          setTip(eRow,eName);sec.append(eRow);
        }
        if(!orch.switched){
          sec.append(mkRow(t('orchNoSwitchYet'),''));
          if(orch.configuredPlanner&&orch.configuredExecutor){
            const pairText=t('orchConfiguredPair',{planner:orch.configuredPlanner,executor:orch.configuredExecutor});
            const pairRow=mkRow(pairText,'');
            setTip(pairRow,pairText);sec.append(pairRow);
          }
        }
        if(orch.coldStartSwitches>0){
          const csRow=mkRow(t('orchColdStartLabel'),t('countTimes',{n:smallCount(orch.coldStartSwitches)}),false,false);
          setTip(csRow,t('orchColdStartTip'));
          sec.append(csRow);
        }
        phaseNodes.push(sec);
        $('orch-phase-body').replaceChildren(...phaseNodes);
      }
    }else if(orchPhaseEl.dataset.signature){
      delete orchPhaseEl.dataset.signature;$('orch-phase-body').replaceChildren();
    }
  }
  const routePill=$('strip-route-pill');
  if(routePill){
    const routeMeta=speed?.sessionMeta||null;
    let routeLabel='',routeTip='';
    if(orch){
      routeLabel=orch.switched?t('routeOrchSwitched',{n:smallCount(orch.phaseSwitchCount||1)}):t('routeOrchActive');
      routeTip=`${t('orchCardTitle')}${orch.switched?` · ${t('orchSwitchCount',{n:count(orch.phaseSwitchCount||1)})}`:` · ${t('orchReadOnlyTag')}`}`;
    }else if(taskUsage?.isSwarm){
      routeLabel=t('routeSwarm',{n:count(taskUsage.subagents)});
      routeTip=taskUsage.swarmTitle?`Swarm · ${taskUsage.swarmTitle}`:t('taskSwarm',{n:count(taskUsage.subagents)});
    }else if(routeMeta?.isSubagent||routeMeta?.isSidecar){
      const roleKey=routeMeta.isSidecar?'roleSidecar':routeMeta.agentRole==='monitor'?'roleMonitor':routeMeta.agentRole==='coordinator'?'roleCoordinator':'roleWorker';
      routeLabel=t(roleKey);
      routeTip=`${t('sessionRoleLabel')}: ${routeLabel}`;
    }
    hidden('strip-route-pill',!routeLabel);
    if(routeLabel){text('strip-route-pill',routeLabel);setTip(routePill,routeTip);}
    else setTip(routePill,null);
  }
  const orchEl=$('orchestration-breakdown');
  if(orchEl){
    const sessionModels=Array.isArray(speed?.modelBreakdown)?speed.modelBreakdown:[];
    const taskModels=Array.isArray(taskUsage?.modelBreakdown)?taskUsage.modelBreakdown:[];
    const models=taskUsage&&taskModels.length?taskModels:sessionModels;
    const surges=speed?.cacheMissSurges||0;
    const roleMeta=speed?.sessionMeta||null;
    const showOrch=Boolean(taskUsage||sessionModels.length>1||surges>0||roleMeta?.isSubagent||roleMeta?.isSidecar);
    hidden('orchestration-breakdown',!showOrch);
    if(showOrch){
      const orchSig=JSON.stringify([language.language,models,taskUsage?.poolBreakdown||null,taskUsage?.roleBreakdown||null,taskUsage?.agents||null,taskUsage?.isSwarm||false,taskUsage?.swarmTitle||null,surges,speed?.cacheMissSurgeTokens||0,roleMeta,swarmRosterFilter]);
      if(orchEl.dataset.signature!==orchSig){
        orchEl.dataset.signature=orchSig;
        const summaryLabel=taskUsage?.isSwarm?(taskUsage.swarmTitle?`Swarm · ${taskUsage.swarmTitle}`:t('swarmDetails')):t('multiAgentDetails');
        text('orch-summary-label',summaryLabel);
        const poolMap=taskUsage?.poolBreakdown||(()=>{
          const out={gemini:{totalTokens:0,requests:0},'3p':{totalTokens:0,requests:0},local:{totalTokens:0,requests:0},other:{totalTokens:0,requests:0}};
          for(const m of models){const b=out[m.pool]||out.other;b.totalTokens+=m.totalTokens||0;b.requests+=m.requests||0;}
          return out;
        })();
        const poolNames={gemini:t('poolGemini'),'3p':t('pool3p'),local:t('poolLocal'),other:t('poolOther')};
        const activePools=Object.entries(poolMap).filter(([,v])=>v&&(v.totalTokens>0||v.requests>0));
        const poolTotal=activePools.reduce((n,[,v])=>n+(v.totalTokens||0),0);
        text('orch-summary-meta',activePools.length?activePools.map(([p,v])=>`${poolNames[p]||p} ${compact(v.totalTokens)}`).slice(0,2).join(' · '):`${models.length}`);
        const nodes=[];
        if(taskUsage?.isSwarm){
          const scopeHead=mkEl('div','breakdown-head',t('swarmScopeHint'));
          nodes.push(scopeHead);
        }
        if(activePools.length){
          const sec=mkEl('div','breakdown-section');
          sec.append(mkEl('div','breakdown-head',t('poolRollup')));
          const chips=mkEl('div','breakdown-chips');
          for(const [pk,pv]of activePools){
            const c=mkEl('span','breakdown-chip'),pct=poolTotal?` (${Math.round((pv.totalTokens||0)/poolTotal*100)}%)`:'';
            c.append(mkEl('span','',poolNames[pk]||pk),mkEl('strong','',`${compact(pv.totalTokens)}${pct}`));
            chips.append(c);
          }
          sec.append(chips);nodes.push(sec);
        }
        const rb=taskUsage?.roleBreakdown;
        if(rb&&(rb.worker.agents>0||rb.monitor.agents>0||rb.sidecar.agents>0)){
          const sec=mkEl('div','breakdown-section');
          const roleLabels={coordinator:t('roleCoordinator'),worker:t('roleWorker'),monitor:t('roleMonitor'),sidecar:t('roleSidecar')};
          for(const rk of ['coordinator','worker','monitor','sidecar']){
            const rv=rb[rk];if(!rv||(!rv.agents&&!rv.requests))continue;
            sec.append(mkRow(`${roleLabels[rk]} (${rv.agents})`,`${compact(rv.totalTokens)} ${tokUnit(rv.totalTokens)}`));
          }
          nodes.push(sec);
        }else if(roleMeta?.isSubagent||roleMeta?.isSidecar){
          const roleKey=roleMeta.isSidecar?'roleSidecar':roleMeta.agentRole==='monitor'?'roleMonitor':roleMeta.agentRole==='coordinator'?'roleCoordinator':'roleWorker';
          nodes.push(mkRow(t('sessionRoleLabel'),t(roleKey)));
        }
        if(models.length){
          const sec=mkEl('div','breakdown-section');
          for(const m of models.slice(0,6)){
            const thinkPart=m.thinkingTokens>0?` · ${compact(m.thinkingTokens)}`:'';
            const val=`${compact(m.totalTokens)} · ${t('reqCountShort',{n:smallCount(m.requests)})}${thinkPart}`;
            const mRow=mkRow(m.model,val,false,false);
            setTip(mRow,`${m.model} · ${poolNames[m.pool]||m.pool}${m.thinkingTokens>0?` · ${t('breakdownThinking')} ${compact(m.thinkingTokens)}`:''}`);
            sec.append(mRow);
          }
          if(surges>0){
            const sRow=mkRow(t('cacheMissSurgeLabel'),`${t('reqCountShort',{n:smallCount(surges)})} · ${compact(speed?.cacheMissSurgeTokens||0)}`,false,false);
            setTip(sRow,t('cacheMissSurgeTip'));
            sec.append(sRow);
          }
          nodes.push(sec);
        }
        const agList=Array.isArray(taskUsage?.agents)?taskUsage.agents:[];
        if(agList.length>1||(taskUsage?.isSwarm&&agList.length>0)){
          const sec=mkEl('div','breakdown-section');
          const activeAgents=agList.filter(a=>!a.killed),endedAgents=agList.filter(a=>a.killed);
          const hasBoth=activeAgents.length>0&&endedAgents.length>0;
          const effFilter=hasBoth?swarmRosterFilter:(activeAgents.length>0?'active':'ended');
          const visibleAgents=effFilter==='active'?activeAgents:effFilter==='ended'?endedAgents:[...activeAgents,...endedAgents];
          if(taskUsage?.isSwarm||hasBoth){
            const head=mkEl('div','roster-head');
            head.append(taskUsage?.isSwarm?mkEl('div','breakdown-head',t('swarmRoster')):mkEl('span'));
            if(hasBoth){
              const bar=mkEl('div','segmented-options roster-filter');bar.id='orch-roster-filter';bar.setAttribute('role','group');
              for(const [k,labelKey,n] of [['active','swarmStatusActive',activeAgents.length],['ended','swarmStatusKilled',endedAgents.length],['all','swarmStatusAll',agList.length]]){
                const b=mkEl('button','segmented-button',`${t(labelKey)} ${smallCount(n)}`);
                b.type='button';b.dataset.rosterFilter=k;b.setAttribute('aria-pressed',String(effFilter===k));
                b.addEventListener('click',()=>{swarmRosterFilter=k;render();});
                bar.append(b);
              }
              head.append(bar);
            }
            sec.append(head);
          }
          const maxActive=Math.max(1,...activeAgents.map(a=>a.tokens||0));
          const list=mkEl('div','roster-list');
          const shortName=l=>String(l||'').replace(/^(?:Worker|Monitor|Sidecar)\s*\((.+)\)$/,'$1');
          for(const a of visibleAgents){
            const item=mkEl('div',a.killed?'roster-item is-ended':'roster-item');
            const wsTag=a.workspaceMode&&a.workspaceMode!=='inherit'?` [${a.workspaceMode}]`:'';
            const killedTag=a.killed?` · ${t('swarmStatusKilled')}`:'';
            const tokText=compact(a.tokens),reqText=t('reqCountShort',{n:smallCount(a.requests)});
            setTip(item,`${a.label}${wsTag}${killedTag} · ${a.model} — ${tokText} · ${reqText}`);
            const top=mkEl('div','roster-top'),left=mkEl('span','roster-left');
            left.append(mkEl('span','roster-dot'),mkEl('span','roster-name',shortName(a.label)));
            if(a.workspaceMode&&a.workspaceMode!=='inherit')left.append(mkEl('span','roster-ws',a.workspaceMode));
            top.append(left,mkEl('span','roster-tok',tokText));
            const sub=mkEl('div','roster-sub');
            sub.append(mkEl('span','roster-model',a.model),mkEl('span','roster-req',reqText));
            item.append(top,sub);
            if(!a.killed&&(a.tokens||0)>0){
              const bar=mkEl('div','roster-bar'),fill=mkEl('i');
              fill.style.width=`${Math.max(4,Math.round((a.tokens/maxActive)*100))}%`;
              bar.append(fill);item.append(bar);
            }
            list.append(item);
          }
          sec.append(list);
          nodes.push(sec);
        }
        $('orch-body').replaceChildren(...nodes);
      }
    }else if(orchEl.dataset.signature){
      delete orchEl.dataset.signature;$('orch-body').replaceChildren();
    }
  }
  $('connection-dot').className = `connection-dot ${snapshot.connection}`;
  renderUsageSummary(snapshot.usage||null);
  usageDashboard?.update(snapshot.usage||null);
  $('connection-dot').title = t(snapshot.connection === 'live'?'live':snapshot.connection === 'stale'?'stale':'offline');
  const timestamp = snapshot.quotaUpdatedAt ? new Date(snapshot.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}) : null;
  $('health-note').textContent = (collectionProcessing?t('collectionProcessingReason'):collectionLimited?t('collectionReason'):language.errorMessage(snapshot.error||snapshot.sessionError)) || (timestamp ? t('health',{time:timestamp}) : t('firstUpdate'));
  $('health-note').classList.toggle('warning', snapshot.connection !== 'live' || !!snapshot.sessionError || collectionLimited);
  renderIntegrationNote();
  updateCountdowns();
}

function renderIntegrationNote(){
  const note=$('integration-note');if(!note)return;
  const integration=snapshot?.integration;
  if(!integration||['mounted','disabled'].includes(integration.state)){
    note.classList.remove('has-action','warning');
    delete note.dataset.mode;
    relaunchStatusKey='';autoRelaunchState.error=false;
    if(note.childNodes.length)note.replaceChildren();
    return;
  }
  const isMissingPort=integration.reason==='missing-debug-port'||integration.reason==='debug-port-disabled';
  if(!isMissingPort){
    note.classList.remove('has-action','warning');
    delete note.dataset.mode;
    relaunchStatusKey='';autoRelaunchState.error=false;
    const msg=t('panelInlineReconnecting');
    if(note.textContent!==msg)note.textContent=msg;
    return;
  }
  note.classList.add('has-action','warning');
  if(note.dataset.mode!=='missing-debug-port'){
    note.dataset.mode='missing-debug-port';
    const message=document.createElement('span');message.className='integration-message';message.id='integration-message';
    const actions=document.createElement('div');actions.className='integration-actions';
    const button=document.createElement('button');button.type='button';button.className='integration-relaunch-btn';button.id='relaunch-debug-button';
    const status=document.createElement('span');status.className='integration-status';status.id='relaunch-debug-status';status.hidden=true;
    actions.append(button,status);
    const label=document.createElement('label');label.className='integration-auto-label';
    const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='auto-relaunch-toggle';
    const labelText=document.createElement('span');labelText.id='auto-relaunch-label';
    label.append(toggle,labelText);
    note.replaceChildren(message,actions,label);
    button.addEventListener('click',async()=>{
      if(relaunchBusy)return;
      relaunchBusy=true;relaunchStatusKey='relaunchingDebug';autoRelaunchState.error=false;
      renderIntegrationNote();
      try{
        const response=await transportFetch('/api/relaunch-debug',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(!response.ok){relaunchStatusKey='relaunchDebugFailed';}
        else{
          const result=await response.json();
          if(result?.scheduled)relaunchStatusKey='relaunchingDebug';
          else if(['cooldown','debounced','already-scheduled-for-pids'].includes(result?.reason))relaunchStatusKey='relaunchDebugCooldown';
          else if(result?.reason==='host-not-running')relaunchStatusKey='relaunchDebugNotRunning';
          else relaunchStatusKey='relaunchDebugFailed';
        }
      }catch{relaunchStatusKey='relaunchDebugFailed';}
      finally{relaunchBusy=false;renderIntegrationNote();}
    });
    toggle.addEventListener('change',async()=>{
      const next=toggle.checked;
      autoRelaunchState.busy=true;autoRelaunchState.error=false;autoRelaunchState.value=next;
      renderIntegrationNote();
      try{
        const saved=await preferenceRequest({autoRelaunchDebug:next});
        const rev=Number.isSafeInteger(saved?.revision)?saved.revision:0;
        autoRelaunchState.revision=Math.max(autoRelaunchState.revision,rev);
        autoRelaunchState.value=!saved?.error&&saved?.autoRelaunchDebug!==false;
        if(snapshot)snapshot.preferences=saved;
      }catch{
        autoRelaunchState.value=!next;
        toggle.checked=!next;
        autoRelaunchState.error=true;
      }finally{
        autoRelaunchState.busy=false;
        renderIntegrationNote();
      }
    });
  }
  const msgKey=integration.reason==='debug-port-disabled'
    ?(integration.launchConfigured?'panelDebugPortReady':'panelDebugPortManual')
    :'missingDebugPort';
  text('integration-message',t(msgKey));
  const button=$('relaunch-debug-button');
  if(button){button.disabled=relaunchBusy;button.textContent=t(relaunchBusy?'relaunchingDebug':'relaunchDebugButton');}
  text('auto-relaunch-label',t('autoRelaunchLabel'));
  const prefRev=Number.isSafeInteger(snapshot?.preferences?.revision)?snapshot.preferences.revision:0;
  if(!autoRelaunchState.busy&&!autoRelaunchState.error&&!snapshot?.preferences?.error&&prefRev>=autoRelaunchState.revision){
    autoRelaunchState.revision=prefRev;
    autoRelaunchState.value=snapshot?.preferences?.autoRelaunchDebug!==false;
  }
  const toggle=$('auto-relaunch-toggle');
  if(toggle)toggle.checked=autoRelaunchState.value;
  const statusKey=autoRelaunchState.error?'autoRelaunchSaveFailed':relaunchStatusKey;
  const statusEl=$('relaunch-debug-status');
  if(statusEl){
    statusEl.hidden=!statusKey;
    if(statusKey)statusEl.textContent=t(statusKey);else if(statusEl.textContent)statusEl.textContent='';
  }
}

function updateCountdowns() {
  const now = Date.now() + serverOffset;
  for (const [window,prefix] of [['5h','five'],['weekly','week']]) {
    const bucket = group?.windows?.[window];
    $(`${prefix}-countdown`).textContent = language.countdown(bucket?.resetAt,now);
    if (bucket?.resetAt && Date.parse(bucket.resetAt) <= now && snapshot?.connection === 'live' && now - lastExpiredRefresh > 30000) {
      lastExpiredRefresh = now; setTimeout(() => refresh(true),0);
    }
  }
  renderQuotaStrip(now);
}

function refreshBusy(busy){
  const button=$('refresh-button');button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-disabled',String(busy));
  button.dataset.i18nAria=busy?'refreshing':'refreshStats';button.title=t(button.dataset.i18nAria);button.setAttribute('aria-label',button.title);
}
function refreshManually(eventOrSync=false){
  if(panelView==='insights'){void loadInsights(true);return;}
  if(manualRequest)return;
  const syncUsage=eventOrSync===true||panelView==='activity'||panelView==='models';
  refreshBusy(true);const started=performance.now();
  manualRequest=(async()=>{
    try{
      if(pending)await refreshRequest;
      await refresh(true,{usageSync:syncUsage});
      if(auditOpen)await loadAudit(true);
    }finally{
      const remaining=250-(performance.now()-started);
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
      refreshBusy(false);manualRequest=null;
    }
  })();
}
function refresh(force = false, {usageSync=false}={}) {
  if (pending) {
    if (force || inFlightRefreshEpoch !== refreshEpoch || (selectedCard === 'context' && !inFlightNeedDetail) || (usageSync && !inFlightUsageSync)) {
      queuedRefresh = true;
      queuedRefreshForce = queuedRefreshForce || force;
      queuedRefreshUsageSync = queuedRefreshUsageSync || usageSync;
    }
    return refreshRequest;
  }
  pending = true;
  const epoch = refreshEpoch;
  const reqScopeEpoch = scopeRequestEpoch;
  inFlightRefreshEpoch = epoch;
  const needContextDetail = selectedCard==='context' && (force || Date.now()-lastContextDetailAt >= 12000 || (!snapshot?.speed?.archivedFallback && !snapshot?.speed?.contextComposition?.customization?.available));
  inFlightNeedDetail = needContextDetail;
  inFlightUsageSync = usageSync;
  refreshRequest=(async()=>{
  try {
    const params = new URLSearchParams();
    const cid = activeConversationId();
    if (cid) params.set('conversationId',cid);
    if (force) params.set('force','1');
    if (needContextDetail) { params.set('contextDetail','1'); lastContextDetailAt = Date.now(); }
    if (usageSync) params.set('usageSync','1');
    if (didSyncUsageScope || localGet('ag-pulse-usage-scope')) params.set('usageScope', usageScope.scope);
    const response = await transportFetch(`/api/metrics?${params}`,{cache:'no-store'});
    if (!response.ok) throw new Error(t('panelUnavailable'));
    const value = await response.json();
    if (!['live','stale','offline'].includes(value.connection)) throw new Error(t('invalidData'));
    if (epoch !== refreshEpoch) { queuedRefresh = true; return; }
    const preservedUsage = reqScopeEpoch !== scopeRequestEpoch && snapshot?.usage ? snapshot.usage : value.usage;
    snapshot = preservedUsage === value.usage ? value : {...value, usage: preservedUsage};
    if(Object.hasOwn(value,'theme'))themeController.setHostTheme(value.theme);
    if(value.preferences){didSyncUsageScope=true;syncUsageGuide(value.preferences);preferences.sync(value.preferences);speedStyle.sync(value.preferences);hostUiLocalization.sync(value.preferences);barColorsPref.sync(value.preferences);themeModePref.sync(value.preferences);usageScope.sync(value.preferences);}
    serverOffset = Date.parse(value.serverTime) - Date.now();
    if (!Number.isFinite(serverOffset)) serverOffset = 0;
    render();
  } catch (error) {
    if (epoch !== refreshEpoch) { queuedRefresh = true; return; }
    if (snapshot) { snapshot.connection = 'stale'; snapshot.error = error.message; render(); }
    else { $('health-note').textContent = language.errorMessage(error.message); $('health-note').classList.add('warning'); }
  } finally {
    pending = false; refreshRequest=null; inFlightUsageSync=false;
    clearTimeout(timer);
    if (queuedRefresh) {
      const nextForce = queuedRefreshForce, nextUsageSync = queuedRefreshUsageSync;
      queuedRefresh = false; queuedRefreshForce = false; queuedRefreshUsageSync = false;
      void refresh(nextForce, {usageSync: nextUsageSync});
    } else {
      timer = setTimeout(()=>void refresh(), document.hidden ? 10000 : 2200);
    }
  }
  })();
  return refreshRequest;
}

$('comp-view-bar')?.addEventListener('click',()=>{compositionView='bar';renderContextComposition(snapshot?.speed?.contextComposition||null);});
$('comp-view-list')?.addEventListener('click',()=>{compositionView='list';renderContextComposition(snapshot?.speed?.contextComposition||null);});
$('trend-mode-total')?.addEventListener('click',()=>{trendMode='total';renderContextComposition(snapshot?.speed?.contextComposition||null);});
$('trend-mode-delta')?.addEventListener('click',()=>{trendMode='delta';renderContextComposition(snapshot?.speed?.contextComposition||null);});
$('token-base-toggle')?.addEventListener('click',()=>{tokenBaseExpanded=!tokenBaseExpanded;renderTokenBaseDrilldown(snapshot?.speed?.contextComposition?.customization);});
$('context-rounds-pill')?.addEventListener('click',()=>{if(snapshot?.speed?.stepBreakdown){stepsDrawerOpen=!stepsDrawerOpen;render();}});
$('context-audit-toggle')?.addEventListener('click',()=>{auditOpen=!auditOpen;if(auditOpen)void loadAudit(false);else renderAuditSection();});
$('audit-refresh-btn')?.addEventListener('click',()=>{void loadAudit(true);});
for(const btn of document.querySelectorAll('[data-audit-tab]')){
  btn.addEventListener('click',()=>{auditTab=btn.dataset.auditTab;renderAuditSection();});
}
for(const btn of document.querySelectorAll('[data-step-filter]')){
  btn.addEventListener('click',()=>{auditStepFilter=btn.dataset.stepFilter;renderAuditSection();});
}
$('strip-route-pill')?.addEventListener('click',event=>{
  showPanelView('session');
  showCard('cache',event.detail>0);
  const orchPhase=$('orchestrator-breakdown'),orch=$('orchestration-breakdown');
  if(orchPhase&&!orchPhase.hidden)orchPhase.open=true;
  if(orch&&!orch.hidden)orch.open=true;
});
$('strip-session-reset')?.addEventListener('click',()=>{
  setInspectedConversation(null);
  void refresh(false);
  if(auditOpen)void loadAudit(false);
});
$('insights-refresh-btn')?.addEventListener('click',()=>{void loadInsights(true);});
$('insights-status-filter')?.addEventListener('change',()=>{void loadInsights(false);});
$('insights-sort')?.addEventListener('change',()=>{void loadInsights(false);});
$('insights-search')?.addEventListener('input',()=>{
  clearTimeout(insightsSearchTimer);
  insightsSearchTimer=setTimeout(()=>void loadInsights(false),200);
});
$('heatmap-metric-sessions')?.addEventListener('click',()=>{heatmapMetric='sessions';renderInsightsView();});
$('heatmap-metric-tokens')?.addEventListener('click',()=>{heatmapMetric='tokens';renderInsightsView();});
$('insights-date-filter')?.addEventListener('click',()=>{toggleHeatmapDate(null);});
$('insights-view')?.addEventListener('scroll',()=>{const cur=$('insights-view')?.scrollTop??0;if(Math.abs(cur-heatmapTipScrollTop)>=2)hideHeatmapTip();},{passive:true});
const syncHeatmapTipPosition=()=>{if(activeHeatmapTipCell)positionHeatmapTip(activeHeatmapTipCell);};
window.addEventListener('resize',syncHeatmapTipPosition);
if(typeof ResizeObserver==='function'&&$('insights-heatmap-grid'))new ResizeObserver(syncHeatmapTipPosition).observe($('insights-heatmap-grid'));

$('quota-group').addEventListener('change', event => { selectedGroup = event.target.value === autoGroupId ? null : event.target.value; render(); });
$('refresh-button').addEventListener('click', refreshManually);
$('open-panel-activity')?.addEventListener('click',()=>showPanelView('activity'));
$('open-panel-models')?.addEventListener('click',()=>showPanelView('models'));
languagePicker=language.mountLanguagePicker({button:$('language-toggle'),parent:document.body,choose:value=>preferences.choose(value)});
for(const button of document.querySelectorAll('[data-speed-style-choice]'))button.addEventListener('click',()=>void speedStyle.choose(button.dataset.speedStyleChoice));
$('host-i18n-toggle')?.addEventListener('click',()=>void hostUiLocalization.choose(!hostUiLocalization.enabled));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pagehide',()=>{preferences.dispose();speedStyle.dispose();hostUiLocalization.dispose();usageScope.dispose();usageDashboard?.dispose();languagePicker.close(false);});
window.addEventListener('pageshow',event=>{if(event.persisted)preferences=connectPreferences();});
setInterval(updateCountdowns,1000);
applySpeedStyle();
localize();
showCard('speed');
refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPanel,{once:true});
else initPanel();
