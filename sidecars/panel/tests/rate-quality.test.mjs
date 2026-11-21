import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { trajectoryMetrics, seconds } from '../metrics.mjs';

const make = (id,tokens,duration,options={}) => ({stepIndices:options.tool?[0]:[],chatModel:{modelDisplayName:options.model||'Model A',
  usage:{messageId:id,responseOutputTokens:tokens,outputTokens:tokens,inputTokens:1000,cacheReadTokens:500,apiProvider:'API_PROVIDER_GOOGLE_GEMINI',...options.usage},
  streamingDuration:duration,timeToFirstToken:options.ttft??2,...options.chat}});
const result = generators => trajectoryMetrics({trajectory:{generatorMetadata:generators,steps:[{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',plannerResponse:{toolCalls:[{}]}}]}});

test('real buffered-tool reproduction is quarantined; usage, cache and TTFT survive',()=>{
  const normal=make('normal',909,9.6352291),bad=make('buffered',17776,.349271,{tool:true,ttft:106.005289});
  const data=result([normal,bad]);
  assert.ok(Math.abs(data.tps-94.34129594282298)<1e-8);
  assert.ok(Math.abs(data.e2eTps-909/(2+9.6352291))<1e-8);
  assert.equal(data.latestTps,null);assert.equal(data.latestRateStatus,'unreliable');
  assert.equal(data.measuredRequests,1);assert.equal(data.excludedTiming,1);
  assert.equal(data.timingReasons['short-tool-window'],1);
  assert.equal(data.timingReasons['short-window'],1);
  assert.equal(data.counts.responseOutput,18685);assert.equal(data.cache.outputTokens,18685);
  assert.equal(data.cache.measuredRequests,2);
  assert.equal(data.ttftSeconds,54.0026445);
  assert.equal(data.ttftMedianSeconds,54.0026445);
  assert.equal(data.latestTtftSeconds,106.005289);
});
test('short-window (< 1s or < 30 output tokens) is quarantined without hardcoded speed caps',()=>{
  for(const sample of [
    make('burst',215,.31,{ttft:4.0}),
    make('text',27,.0797699,{ttft:4.0878562}),
    make('tool',68,.06,{tool:true,ttft:.1}),
    make('low-output',29,2.5,{ttft:1}),
    make('sub-1s',500,.999,{ttft:1}),
  ]){
    const data=result([sample]);
    assert.equal(data.measuredRequests,0);assert.equal(data.excludedTiming,1);
    assert.equal(data.timingReasons['short-window'],1);
    assert.equal(data.tps,null);assert.equal(data.peakTps,null);assert.equal(data.e2eTps,null);
    assert.equal(data.latestTps,null);assert.equal(data.latestRateStatus,'unreliable');
    assert.ok(data.ttftMedianSeconds!==null && data.latestTtftSeconds!==null,'TTFT survives quarantine');
  }
  // Boundary >= 1.0s and >= 30 output tokens qualifies; fast models (> 250 / > 600 tok/s) are never capped
  for(const [id,tokens,duration,ttft] of [['boundary',30,1.0,2],['hydrogen',520,2.0,25],['fast',30000,2.0,2]]){
    const data=result([make(id,tokens,duration,{ttft})]);
    assert.equal(data.measuredRequests,1);assert.equal(data.excludedTiming,0);
    assert.equal(data.tps,tokens/duration);assert.equal(data.peakTps,tokens/duration);
    assert.ok(Math.abs(data.e2eTps-tokens/(ttft+duration))<1e-10);
  }
});
test('five same-model normal samples identify a short outlier; short new-model spikes are also blocked while sustained fast rates stay measurable',()=>{
  const baseline=Array.from({length:5},(_,i)=>make('normal'+i,200,2));
  const data=result([...baseline,make('spike',1000,.01)]);
  assert.equal(data.tps,100);assert.equal(data.peakTps,100);assert.equal(data.latestTps,null);
  assert.equal(data.timingReasons['short-outlier'],1);assert.equal(data.timingReasons['short-window'],1);
  const other=result([...baseline,make('new-model',1000,.01,{model:'Model B'})]);
  assert.equal(other.excludedTiming,1);assert.equal(other.timingReasons['short-window'],1);assert.equal(other.tps,100);
  const sustained=result([...baseline,make('fast',10000,2)]);
  assert.equal(sustained.excludedTiming,0);assert.equal(sustained.rateWarnings,1);assert.ok(sustained.latestTps>1000);
});
test('one attempt record is valid; differing multiple-attempt usage is not paired to a single duration',()=>{
  const single=make('single',100,2,{chat:{retryInfos:[{usage:{outputTokens:100,responseOutputTokens:100}}]}});
  assert.equal(result([single]).tps,50);
  const multi=make('retry',100,2,{chat:{retryInfos:[{usage:{outputTokens:80,responseOutputTokens:80}},{usage:{outputTokens:100,responseOutputTokens:100}}]}});
  const data=result([multi]);assert.equal(data.tps,null);assert.equal(data.counts.output,100);assert.equal(data.timingReasons['retry-scope'],1);
});
test('conflicting duplicate timing and inconsistent token scopes cannot poison TPS',()=>{
  const a=make('same',100,2),b=make('same',100,.001);
  const duplicate=result([a,b]);assert.equal(duplicate.requests,1);assert.equal(duplicate.tps,null);assert.equal(duplicate.counts.output,100);
  assert.equal(duplicate.timingReasons['duplicate-scope'],1);
  for(const usage of [{thinkingOutputTokens:200},{responseOutputTokens:'bad'},{responseOutputTokens:80,thinkingOutputTokens:40}]){
    const data=result([make('bad',100,2,{usage})]);assert.equal(data.tps,null);assert.equal(data.excludedTiming,1);
    assert.equal(data.timingReasons['token-scope'],1);
  }
});
test('latest missing timing never borrows the previous rate; malformed durations stay unknown',()=>{
  const data=result([make('normal',100,2),make('missing',100,undefined)]);
  assert.equal(data.latestTps,null);assert.equal(data.latestRateStatus,'missing');assert.equal(data.tps,50);
  for(const duration of [{},{seconds:2,nanos:-1},{seconds:2,nanos:1e9},'9'.repeat(400)+'s'])assert.equal(seconds(duration),null);
});
test('all rejected samples have no fabricated TPS; the UI keeps only the calculation basis',()=>{
  const data=result([make('tool',17776,.349271,{tool:true,ttft:106})]);assert.equal(data.tps,null);assert.equal(data.latestTps,null);assert.equal(data.e2eTps,null);
  assert.equal(data.rateBasis,'all-output');
  const i18n=createRequire(import.meta.url)('../../../compat/i18n.cjs');
  for(const locale of ['en','zh-CN','zh-TW']) assert.equal(i18n(locale).rateNote(data),i18n(locale).t('allBasis'));
  const respOnly=trajectoryMetrics({trajectory:{generatorMetadata:[{chatModel:{usage:{messageId:'r',responseOutputTokens:100},streamingDuration:2,timeToFirstToken:1}}],steps:[]}});
  assert.equal(respOnly.rateBasis,'response');
  for(const locale of ['en','zh-CN','zh-TW']) assert.equal(i18n(locale).rateNote(respOnly),i18n(locale).t('responseBasis'));
  assert.equal(i18n('zh-CN').rateNote({...data,latestRateStatus:'legacy'}),'等待重算');
});
