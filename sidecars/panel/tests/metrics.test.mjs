import test from 'node:test';
import assert from 'node:assert/strict';
import { trajectoryMetrics, quotaMetrics, seconds } from '../metrics.mjs';
import { countdown } from '../format.mjs';
import { MetricsStore } from '../store.mjs';

const chat = (id, tokens, duration, thinking = '100') => ({ chatModel: { usage: { messageId: id, inputTokens:'1000', outputTokens:String(Number(tokens)+Number(thinking)), responseOutputTokens:String(tokens), thinkingOutputTokens:thinking }, streamingDuration:duration, timeToFirstToken:'2s' } });

test('TPS uses visible response tokens and weights by stream time, excluding TTFT and thinking', () => {
  const data = trajectoryMetrics({ trajectory:{ generatorMetadata:[chat('a',100,'1s'),chat('b',200,'4s')],steps:[] } });
  assert.equal(data.tps,60); assert.equal(data.latestTps,50); assert.equal(data.peakTps,100);
  assert.deepEqual(data.recentTps,[100,50]);
  assert.equal(data.modelSeconds,9); assert.equal(data.ttftSeconds,2);
  assert.equal(data.counts.output,500); assert.equal(data.counts.responseOutput,300);
});
test('recentTps caps at last 16 accepted samples and lastActiveAt tracks latest timestamp', () => {
  const generators = Array.from({length:20},(_,i)=>chat(`m${i}`,100 + i * 10,'2s'));
  generators[19].chatModel.chatStartMetadata = {createdAt:'2026-10-06T08:10:00Z'};
  const steps = [{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{startedAt:'2026-10-06T08:10:02Z',completedAt:'2026-10-06T08:10:05Z'}}];
  const data = trajectoryMetrics({trajectory:{generatorMetadata:generators,steps}});
  assert.equal(data.recentTps.length,16);
  assert.equal(data.recentTps[0],70);
  assert.equal(data.recentTps[15],145);
  assert.equal(data.peakTps,145);
  assert.equal(data.lastActiveAt,'2026-10-06T08:10:05.000Z');
});
test('duplicate request metadata and missing/zero duration never inflate speed', () => {
  const a = chat('a',100,'2s');
  const data = trajectoryMetrics({ trajectory:{generatorMetadata:[a,a,chat('b',500,'0s'),chat('c',500,undefined)]} });
  assert.equal(data.requests,3); assert.equal(data.measuredRequests,1); assert.equal(data.tps,50); assert.equal(data.missingTiming,2);
  assert.equal(trajectoryMetrics({trajectory:{}}).tps,null);
});
test('overlapping tool execution is counted once, including tools without toolCall metadata', () => {
  const data = trajectoryMetrics({trajectory:{steps:[
    {type:'CORTEX_STEP_TYPE_SEARCH_WEB',metadata:{startedAt:'2026-10-06T08:00:00Z',completedAt:'2026-10-06T08:00:04Z'}},
    {type:'CORTEX_STEP_TYPE_RUN_COMMAND',metadata:{startedAt:'2026-10-06T08:00:02Z',completedAt:'2026-10-06T08:00:06Z'}},
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{startedAt:'2026-10-06T08:00:00Z',completedAt:'2026-10-06T08:00:20Z'}},
  ]}});
  assert.equal(data.toolSeconds,6);
});
test('quota zero is real, omitted/invalid balances stay unknown, model groups stay distinct', () => {
  const data = quotaMetrics({response:{groups:[
    {displayName:'Gemini',buckets:[{bucketId:'gemini-5h',window:'5h',remainingFraction:0,resetTime:'2026-10-06T12:00:00Z'}]},
    {displayName:'Claude',buckets:[{bucketId:'3p-weekly',window:'weekly',remainingFraction:1.5}]},
  ]}},Date.parse('2026-10-06T08:00:00Z'));
  assert.equal(data[0].id,'gemini'); assert.equal(data[0].windows['5h'].remaining,0);
  assert.equal(data[0].windows.weekly.available,false); assert.equal(data[1].windows.weekly.remaining,null);
});
test('countdown reaches waiting state, never asserts that an expired balance has refilled', () => {
  const now = Date.parse('2026-10-06T08:00:00Z');
  assert.equal(countdown('2026-10-06T08:00:01Z',now),'00:00:01');
  assert.equal(countdown('2026-10-06T08:00:00Z',now),'等待刷新');
  assert.equal(countdown('2026-10-13T09:02:03Z',now),'7天 01:02:03');
  assert.equal(countdown(null,now),'—');
  assert.equal(seconds({seconds:'2',nanos:500000000}),2.5);
});
test('account switch clears old quota before a new account fails to load', async () => {
  let email = 'a@example.test', broken = false;
  const client = { call:async name => {
    if(name === 'GetUserStatus') return {userStatus:{email}};
    if(broken) throw new Error('quota unavailable');
    return {response:{groups:[{displayName:'A',buckets:[]}]}};
  }};
  const store = new MetricsStore(client); await store.refreshQuota(true);
  assert.equal(store.quota[0].name,'A'); email = 'b@example.test'; broken = true;
  await assert.rejects(store.refreshQuota(true)); assert.equal(store.quota,null); assert.equal(store.quotaAt,0);
});
test('RPC errors do not replace a cached quota with made-up percentages', async () => {
  const client = {discover:async()=>{throw new Error('offline');}};
  const store = new MetricsStore(client);store.quota=[{id:'saved'}];store.quotaAt=1000;
  const snapshot = await store.snapshot();assert.equal(snapshot.connection,'stale');assert.equal(snapshot.groups[0].id,'saved');assert.equal(snapshot.speed,null);
});
test('two-phase orchestrator breakdown separates planning and executor burn and tracks cache-miss surges & toolSummary', () => {
  const data = trajectoryMetrics({trajectory:{cascadeId:'11111111-1111-1111-1111-111111111111',
    steps:[
      {type:'CORTEX_STEP_TYPE_USER_INPUT'},
      {type:'CORTEX_STEP_TYPE_GENERIC',metadata:{toolCall:{name:'grep_search',argumentsJson:'{"Query":"foo"}'},toolSource:'CORTEX_COMPONENT_SOURCE_BUILTIN'}},
      {type:'CORTEX_STEP_TYPE_MCP_TOOL',metadata:{toolCall:{name:'mcp_read',argumentsJson:'x'.repeat(400)},toolSource:'CORTEX_COMPONENT_SOURCE_CUSTOMIZATION'}},
    ],
    generatorMetadata:[
      {chatModel:{model:'MODEL_PLACEHOLDER_M537',responseModel:'gemini-pro-orchestrator-neon',streamingDuration:'3s',usage:{responseId:'p1',inputTokens:'120000',cacheReadTokens:'0',outputTokens:'4000',responseOutputTokens:'1000',thinkingOutputTokens:'3000',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}}},
      {chatModel:{model:'MODEL_PLACEHOLDER_M669',responseModel:'gemini-flash-worker-agy',modelDisplayName:'Gemini 4 Hydrogen (Orchestrator)',streamingDuration:'2s',usage:{responseId:'e1',inputTokens:'15000',cacheReadTokens:'80000',outputTokens:'2500',responseOutputTokens:'2000',thinkingOutputTokens:'500',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}}},
    ]}});
  assert.equal(data.model,'Gemini 4 Hydrogen (Orchestrator)');
  assert.equal(data.modelBreakdown.length,2);
  const orch=data.modelBreakdown.find(m=>m.model==='Orchestrator (Neon)');
  const exec=data.modelBreakdown.find(m=>m.model==='Gemini 4 Hydrogen (Orchestrator)');
  assert.ok(orch && exec);
  assert.equal(orch.thinkingTokens,3000);assert.equal(orch.cacheMissSurges,1);assert.equal(orch.cacheMissSurgeTokens,120000);
  assert.equal(exec.cachedTokens,80000);assert.equal(exec.cacheMissSurges,0);
  assert.equal(data.cacheMissSurges,1);assert.equal(data.cacheMissSurgeTokens,120000);
  assert.equal(data.toolSummary.totalCalls,2);
  assert.equal(data.toolSummary.tools[0].name,'mcp_read');assert.equal(data.toolSummary.tools[0].argTokens,100);assert.equal(data.toolSummary.tools[0].source,'mcp');
});
