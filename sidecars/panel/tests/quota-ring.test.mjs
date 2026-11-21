import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PreferencesStore} from '../../../compat/preferences.mjs';
const create=createRequire(import.meta.url)('../../../compat/i18n.cjs');
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..','..','..');
// Window fixtures mirror quotaMetrics output: remaining is a 0-1 fraction, null
// means the account returned the window without a balance, undefined omits it.
const win=(five,week,extra={})=>({id:'gemini',name:'Gemini',windows:{
  '5h':five===undefined?{available:false,reason:'账户未返回此额度窗口'}:{available:true,remaining:five,resetAt:'2026-11-21T00:00:00.000Z',...(extra.five||{})},
  weekly:week===undefined?{available:false,reason:'账户未返回此额度窗口'}:{available:true,remaining:week,resetAt:'2026-11-27T00:00:00.000Z',...(extra.week||{})},
}});
const view=(five,week,mode,extra)=>create('en').quotaRingView(win(five,week,extra),mode);
const pick=v=>({show:v.show,arcValue:v.arcValue,level:v.level,dot:v.dot,min:v.min});

test('both mode paints the tighter known window, prefers 5h on ties and bolds it',()=>{
  assert.deepEqual(pick(view(0.60,0.72,'both')),{show:'5h',arcValue:0.6,level:'ok',dot:null,min:0.6});
  assert.deepEqual(pick(view(0.72,0.09,'both')),{show:'weekly',arcValue:0.09,level:'danger',dot:null,min:0.09});
  assert.equal(view(0.25,0.25,'both').show,'5h','A tie paints the shorter window');
  assert.equal(view(0.6,null,'both').show,'5h','An unknown weekly cannot outrank a known 5h');
  assert.equal(view(null,0.5,'both').show,'weekly');
  assert.deepEqual(view(0.6,0.72,'both').five,{present:true,remaining:0.6});
});

test('auto mode keeps 5h until a known window drops to 25% or less, then shows the tighter one',()=>{
  assert.equal(view(0.60,0.72,'auto').show,'5h');
  assert.equal(view(0.26,0.72,'auto').show,'5h','Just above the threshold nothing switches');
  assert.deepEqual(pick(view(0.60,0.20,'auto')),{show:'weekly',arcValue:0.2,level:'warn',dot:null,min:0.2});
  assert.equal(view(0.60,0.25,'auto').show,'weekly','The threshold itself switches');
  assert.equal(view(0.30,0.72,'auto').show,'5h','A tight 5h wins over a comfortable weekly');
  assert.deepEqual(pick(view(0.10,0.20,'auto')),{show:'5h',arcValue:0.1,level:'danger',dot:null,min:0.1});
  assert.equal(view(null,0.20,'auto').show,'weekly','An unknown 5h cannot block the switch');
  assert.equal(view(null,null,'auto').show,'5h','Without numbers the default window stays on the ring');
  assert.equal(view(undefined,0.85,'auto').show,'weekly');
});

test('unknown balances stay unknown, never 0%',()=>{
  const language=create('en'),noBalance=language.quotaRingView(win(null,null),'both');
  assert.equal(noBalance.min,null);
  assert.equal(noBalance.arcValue,null);
  assert.equal(noBalance.level,'unknown');
  assert.deepEqual(noBalance.five,{present:true,remaining:null});
  assert.notEqual(noBalance.arcValue,0);
  const language2=create('en'),disabled=language2.quotaRingView(win(undefined,0.5,{week:{disabled:true}}),'both');
  assert.deepEqual(disabled.week,{present:true,remaining:null},'A disabled window shows the unknown ring');
  assert.equal(disabled.level,'unknown');
  const bare=create('en').quotaRingView({id:'g',name:'G'},'both');
  assert.equal(bare.show,'5h');assert.equal(bare.level,'unknown');
});

test('weekly-only groups render the weekly window alone in every mode',()=>{
  for(const mode of ['both','auto','compact']){
    const v=view(undefined,0.85,mode);
    assert.equal(v.five,null);
    assert.deepEqual(pick(v),{show:'weekly',arcValue:0.85,level:'ok',dot:null,min:0.85});
  }
});

test('compact mode pins 5h and flags only the other window with a status dot',()=>{
  assert.deepEqual(pick(view(0.5,0.20,'compact')),{show:'5h',arcValue:0.5,level:'ok',dot:'warn',min:0.2});
  assert.equal(view(0.5,0.08,'compact').dot,'danger');
  assert.equal(view(0.5,0.30,'compact').dot,null);
  assert.equal(view(0.08,0.5,'compact').dot,null,'A tight painted window uses the ring color, not the dot');
  assert.equal(view(0.08,0.5,'compact').level,'danger');
  assert.equal(view(undefined,0.20,'compact').dot,null,'Nothing is flagged when the other window is absent');
  assert.deepEqual(pick(view(null,0.20,'compact')),{show:'5h',arcValue:null,level:'unknown',dot:'warn',min:0.2},'An unknown pinned 5h still flags the tight weekly');
  assert.equal(view(0.5,undefined,'compact').dot,null);
});

test('the same group renders differently per quotaDisplay mode',()=>{
  assert.equal(view(0.6,0.2,'both').show,'weekly');
  assert.equal(view(0.6,0.2,'auto').show,'weekly');
  assert.equal(view(0.6,0.2,'compact').show,'5h');
  const language=create('en');
  assert.equal(language.normalizeQuotaDisplay('both'),'both');assert.equal(language.normalizeQuotaDisplay('auto'),'auto');assert.equal(language.normalizeQuotaDisplay('compact'),'compact');
  for(const invalid of [null,undefined,'dot','','BOTH'])assert.equal(language.normalizeQuotaDisplay(invalid),'both');
});

test('quota ring copy exists in all three locales with remaining semantics',()=>{
  const expectations={'en':['Remaining quota','Balance unknown','Quota display','Two numbers','Auto','Dot'],'zh-CN':['剩余额度','余额未知','额度显示','双数字','自动','角标'],'zh-TW':['剩餘額度','餘額未知','額度顯示','雙數字','自動','角標']};
  for(const [locale,[title,unknown,display,both,auto,compact]]of Object.entries(expectations)){
    const language=create(locale),keys=['quotaRingTitle','quotaRingUnknown','quotaDisplay','quotaDisplayBoth','quotaDisplayAuto','quotaDisplayCompact'];
    assert.deepEqual(keys.map(key=>language.t(key)),[title,unknown,display,both,auto,compact]);
    assert.equal(language.t('quotaDisplaySaveFailed').length>0,true);
    assert.notEqual(language.t('remaining'),language.t('quotaRingTitle'),'The ring labels remaining, the opposite of the context ring');
  }
});

test('quota display preference persists, rejects unknown values and migrates legacy files',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pulse-quota-display-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'preferences.json'),store=new PreferencesStore({file});
  await writeFile(file,JSON.stringify({schema:1,language:'en',revision:1}));
  assert.equal((await store.get()).quotaDisplay,null,'Older files have no display mode; renderers treat that as both');
  await store.set({quotaDisplay:'compact'});await store.set({language:'zh-CN'});
  let saved=await new PreferencesStore({file}).get();assert.equal(saved.quotaDisplay,'compact');assert.equal(saved.language,'zh-CN');
  await store.set({quotaDisplay:'auto'});saved=await store.get();assert.equal(saved.quotaDisplay,'auto');assert.equal(saved.language,'zh-CN');
  for(const input of [{quotaDisplay:'dot'},{quotaDisplay:null},{quotaDisplay:''},{quotaDisplay:'both',extra:'x'}])await assert.rejects(store.set(input));
  await writeFile(file,JSON.stringify({schema:1,language:'en',quotaDisplay:'<script>',revision:3}));
  assert.equal((await store.get()).quotaDisplay,null,'Unknown stored display values are ignored, not trusted');
});

test('quota display controller saves choices, ignores stale polls and keeps a failed choice visible',async()=>{
  let fail=false,revision=1;const changes=[];const language=create(null);
  const controller=language.connectQuotaDisplay({initial:'compact',cache:()=>{},changed:value=>changes.push(value),write:async input=>{
    await new Promise(resolve=>setTimeout(resolve,2));if(fail)throw new Error('Disk unavailable');return {language:null,quotaDisplay:input.quotaDisplay,revision:++revision};
  }});
  assert.equal(controller.value,'compact','A cached choice paints before the first preference read');
  controller.sync({language:null,quotaDisplay:null,revision:1});assert.equal(controller.value,'both');
  await controller.choose('compact');assert.equal(controller.value,'compact');assert.equal(controller.error,false);
  controller.sync({language:null,quotaDisplay:'auto',revision:1});assert.equal(controller.value,'compact','A stale poll cannot undo a newer choice');
  fail=true;await controller.choose('auto');assert.equal(controller.value,'auto');assert.equal(controller.error,true);
  controller.sync({language:null,quotaDisplay:'compact',revision:99});assert.equal(controller.value,'auto','An unsaved choice stays visible with its warning');
  fail=false;await controller.choose('auto');assert.equal(controller.error,false);
  controller.sync({language:null,quotaDisplay:'compact',revision:99});assert.equal(controller.value,'compact');
  assert.ok(changes.length>0,'Every applied choice notifies the renderers');
  controller.dispose();
});

test('composer strip swaps the cache rate for the quota ring and keeps the detail rate',async()=>{
  const widget=await readFile(join(ROOT,'compat','inline-widget.cjs'),'utf8');
  const cacheAt=widget.indexOf('<button class="chip" data-card="cache"'),quotaAt=widget.indexOf('<button class="chip" data-card="quota"'),contextAt=widget.indexOf('<button class="chip" data-card="context"');
  assert.ok(cacheAt>=0&&cacheAt<quotaAt&&quotaAt<contextAt,'The quota ring sits between the token pill and the context chip');
  assert.ok(!widget.includes('id="cache-rate"'),'The inline strip no longer dedicates a slot to the cache hit rate');
  assert.ok(widget.includes('id="cache-detail-rate"'),'The cache card keeps the hit rate pill');
  assert.ok(widget.includes('ring-track')&&widget.includes('ring-arc')&&widget.includes('stroke-dasharray'),'The ring is a stroked SVG arc');
  assert.ok(widget.includes(':host(.narrow) [data-card=quota] .quota-text{display:none}')&&widget.includes(':host(.narrow) [data-card=quota] svg'),'Narrow windows collapse the ring to its icon');
  assert.ok(widget.includes('[data-quota-dot=warn]::after')&&widget.includes('[data-quota-dot=danger]::after'),'Compact mode flags the other window with a status dot');
  assert.ok(widget.includes("[data-quota-level=warn] .ring-arc{stroke:var(--pulse-warning)}")&&widget.includes("[data-quota-level=danger] .ring-arc{stroke:var(--pulse-danger)}"),'Alert thresholds share the plugin color variables');
  assert.ok(widget.includes('aria-controls="quota-card"')&&widget.includes('id="quota-card"'),'The quota chip opens its dedicated quota card');
  assert.ok(widget.includes("t('quotaRingTitle')")&&widget.includes("t('remaining')"),'Tooltip and aria label state the remaining semantics');
  assert.ok(widget.includes("['speed','cache','quota','context']"),'Density motion knows the new chip order');
});

test('host preference bridges forward the quota display key to the store',async()=>{
  for(const file of ['compat/ipc-host.cjs','compat/runtime-ui.mjs','compat/preferences.mjs']){
    const source=await readFile(join(ROOT,file),'utf8');
    assert.ok(source.includes("'quotaDisplay'"),file+' accepts quotaDisplay');
  }
});
