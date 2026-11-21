// Issue #34: single-session context composition, trend and compaction markers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tokenBaseMetrics, compositionMetrics, attachTokenBase, hostContextMetrics, attachHostContextUsage } from '../composition.mjs';
import { MetricsStore } from '../store.mjs';
import { SessionHistory, reconcileMetrics, safeMetrics } from '../history.mjs';
import { TrajectoryJson } from '../trajectory-json.mjs';
import { validatedInput } from '../../../compat/runtime-ui.mjs';

const GUID='01234567-89ab-cdef-0123-456789abcdef';
const context={usedTokens:100000,maxTokens:1000000};
const stepUsage=(type,input,extra={})=>({type:`CORTEX_STEP_TYPE_${type}`,metadata:{modelUsage:{inputTokens:String(input),...extra}}});
const tokenBaseResponse={customizationTokenBase:{totalTokens:16489,groups:[{name:'Rules',numTokens:6642,children:[{name:'file',numTokens:1}]},{name:'Skills',numTokens:'9347'},{name:'broken'},{name:'Negative',numTokens:-5}]},remainingBudget:10153,customizationBudget:20000,rulesBudget:20000};

test('token base keeps exact totals, budgets and sanitized groups only',()=>{
  const base=tokenBaseMetrics(tokenBaseResponse);
  assert.equal(base.totalTokens,16489);assert.equal(base.budget,20000);assert.equal(base.remainingBudget,10153);
  assert.deepEqual(base.groups,[{name:'Rules',tokens:6642},{name:'Skills',tokens:9347}]);
  assert.equal(base.source,'GetTokenBase');
  assert.equal(tokenBaseMetrics(null),null);assert.equal(tokenBaseMetrics({}),null);
  assert.equal(tokenBaseMetrics({customizationTokenBase:{totalTokens:'x'}}),null);
  assert.equal(tokenBaseMetrics({customizationTokenBase:{totalTokens:-1}}),null);
  assert.equal(tokenBaseMetrics({customizationTokenBase:[]}),null);
});

test('composition buckets classify per-step usage and scale onto host usage',()=>{
  const steps=[stepUsage('USER_INPUT',3000),
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'90000',outputTokens:'12000',thinkingOutputTokens:'8000',responseOutputTokens:'4000'}}},
    stepUsage('TOOL_RESULT',2500),stepUsage('SYSTEM_MESSAGE',700),
    {type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{modelUsage:{inputTokens:'0'}}}];
  const comp=compositionMetrics({context,steps,generators:[]});
  assert.equal(comp.source,'steps');
  assert.deepEqual(comp.parts,[['user',3000],['thinking',8000],['reply',4000],['tool',2500],['system',700]]);
  assert.equal(comp.customization.available,false);
  const dynamic=comp.segments.filter(segment=>segment.id!=='remaining');
  assert.deepEqual(dynamic.map(segment=>segment.id),['user','thinking','reply','tool','system']);
  // Raw estimates (18,200) are scaled so the dynamic layer fills the host-used
  // 10% exactly; titles keep the unscaled numbers.
  assert.ok(Math.abs(dynamic.reduce((n,segment)=>n+segment.fraction,0)-0.1)<1e-9);
  const remaining=comp.segments.at(-1);
  assert.equal(remaining.id,'remaining');assert.equal(remaining.tokens,900000);
  assert.ok(Math.abs(remaining.fraction-0.9)<1e-9);
});

test('logged-text classification is the fallback and merges assistant output',()=>{
  const transcript={status:'ready',matchedSteps:5,userTokens:2000,assistantTokens:6000,toolTokens:1000,systemTokens:100,totalTokens:9100};
  const comp=compositionMetrics({context,steps:[{type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{}}],generators:[],transcript});
  assert.equal(comp.source,'transcript');
  assert.deepEqual(comp.parts.map(([id])=>id),['user','assistant','tool','system']);
  const fallbackDynamic=comp.segments.filter(segment=>segment.id!=='remaining');
  assert.ok(Math.abs(fallbackDynamic.reduce((n,segment)=>n+segment.fraction,0)-0.1)<1e-9);
  const none=compositionMetrics({context,steps:[],generators:[]});
  assert.equal(none.source,null);assert.equal(none.segments.length,1);assert.equal(none.segments[0].id,'remaining');
  const partial=compositionMetrics({context,steps:[],generators:[],transcript:{...transcript,status:'unavailable'}});
  assert.equal(partial.source,null);
});

test('composition requires host used and max tokens',()=>{
  assert.equal(compositionMetrics({context:null,steps:[],generators:[]}),null);
  assert.equal(compositionMetrics({context:{usedTokens:100,maxTokens:null},steps:[],generators:[]}),null);
  assert.equal(compositionMetrics({context:{usedTokens:100,maxTokens:0},steps:[],generators:[]}),null);
  assert.equal(compositionMetrics({context:{usedTokens:'x',maxTokens:10},steps:[],generators:[]}),null);
});

test('token base attach rescales the dynamic layer without displacing host usage',()=>{
  const steps=[stepUsage('USER_INPUT',3000),{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'90000',thinkingOutputTokens:'8000',responseOutputTokens:'4000'}}}];
  const base=tokenBaseMetrics(tokenBaseResponse);
  const comp=attachTokenBase(compositionMetrics({context,steps,generators:[]}),base);
  assert.equal(comp.customization.available,true);assert.equal(comp.customization.tokens,16489);assert.equal(comp.customization.budget,20000);
  assert.deepEqual(comp.customization.groups.map(group=>group.name),['Rules','Skills']);
  const byId=Object.fromEntries(comp.segments.map(segment=>[segment.id,segment]));
  assert.ok(Math.abs(byId.customization.fraction-16489/1000000)<1e-9);
  const dynamic=comp.segments.filter(segment=>!['customization','remaining'].includes(segment.id));
  assert.ok(Math.abs(dynamic.reduce((n,segment)=>n+segment.fraction,0)-(100000-16489)/1000000)<1e-9);
  assert.ok(Math.abs(comp.segments.reduce((n,segment)=>n+segment.fraction,0)-1)<1e-9);
  assert.equal(attachTokenBase(null,base),null);
  assert.equal(attachTokenBase(compositionMetrics({context,steps,generators:[]}),null).customization.available,false);
});

test('trend uses total input per request, dedupes records and anchors markers',()=>{
  const chat=(messageId,input,read,indices)=>({stepIndices:indices,chatModel:{usage:{messageId,inputTokens:String(input),...(read===undefined?{}:{cacheReadTokens:String(read)}),apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}}});
  const generators=[chat('a',1000,3000,[0,1]),chat('a',1000,3000,[0,1]),chat('b',500,0,[4]),chat('c',200,undefined,[6])];
  const steps=['USER_INPUT','PLANNER_RESPONSE','TOOL_RESULT','COMPACTION','PLANNER_RESPONSE','CHECKPOINT','PLANNER_RESPONSE'].map(type=>({type:`CORTEX_STEP_TYPE_${type}`}));
  const comp=compositionMetrics({context,steps,generators});
  // Total basis: uncached + cache read (+ write). Duplicate record counts once.
  assert.deepEqual(comp.trend.points.map(point=>point.inputTokens),[4000,500,200]);
  assert.deepEqual(comp.trend.markers,[
    {pointIndex:1,kind:'compaction',before:4000,after:500},
    {pointIndex:2,kind:'checkpoint',before:500,after:200},
  ]);
  assert.equal(comp.trend.totalRequests,3);assert.equal(comp.trend.totalMarkers,2);
});

test('trend caps the window to recent requests and keeps only visible markers',()=>{
  const generators=Array.from({length:10},(_,i)=>({stepIndices:[i],chatModel:{usage:{messageId:`m${i}`,inputTokens:String(100*(i+1))}}}));
  const steps=generators.map((_,i)=>({type:i===2?'CORTEX_STEP_TYPE_COMPACTION':'CORTEX_STEP_TYPE_PLANNER_RESPONSE'}));
  const comp=compositionMetrics({context,steps,generators,maxTrendPoints:6});
  assert.equal(comp.trend.points.length,6);assert.equal(comp.trend.points[0].inputTokens,500);
  assert.equal(comp.trend.totalRequests,10);assert.equal(comp.trend.totalMarkers,1);
  assert.deepEqual(comp.trend.markers,[]); // the early compaction fell out of the window
  const late=compositionMetrics({context,steps:[...steps,{type:'CORTEX_STEP_TYPE_COMPACTION'}],generators,maxTrendPoints:6});
  assert.deepEqual(late.trend.markers.map(marker=>marker.pointIndex),[6]); // past the last point; renderer clamps to the edge
  assert.equal(late.trend.markers[0].before,1000);assert.equal(late.trend.markers[0].after,null);
});

test('trajectory projection retains per-step usage buckets only',()=>{
  const parser=new TrajectoryJson();
  parser.write(JSON.stringify({trajectory:{steps:[{id:'s1',type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{createdAt:'2026-11-21T08:00:00Z',modelUsage:{inputTokens:'120',cacheReadTokens:'30',outputTokens:'0',responseOutputTokens:'0',thinkingOutputTokens:'0',extra:'drop'},generatorModel:'gemini'},content:'secret prompt'}]}}));
  const value=parser.end();
  const metadata=value.trajectory.steps[0].metadata;
  assert.deepEqual(metadata.modelUsage,{inputTokens:'120',outputTokens:'0',responseOutputTokens:'0',thinkingOutputTokens:'0',cacheReadTokens:'30'});
  assert.equal(metadata.generatorModel,undefined);
  assert.equal(value.trajectory.steps[0].content,undefined);
});

test('context detail lazily fetches the token base, caches it, and degrades silently',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ag-composition-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const calls=[];let tokenBaseBroken=false;
  const raw={trajectory:{cascadeId:GUID,steps:[{type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{createdAt:'2026-11-21T08:00:00Z',modelUsage:{inputTokens:'3000'}}}],generatorMetadata:[{stepIndices:[0],chatModel:{usage:{messageId:'m1',inputTokens:'1000'},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:100000,maxContextTokens:1000000}}}}]},numTotalSteps:1};
  const client={call:async method=>{calls.push(method);
    if(method==='GetUserStatus')return{userStatus:{email:'a@example.test'}};
    if(method==='RetrieveUserQuotaSummary')return{response:{groups:[]}};
    if(method==='GetTokenBase'){if(tokenBaseBroken)throw new Error('offline');return tokenBaseResponse;}
    throw new Error('unexpected '+method);},
    discover:async()=>({pid:1}),trajectory:async()=>raw,resetTrajectories(){}};
  const store=new MetricsStore(client,{history:new SessionHistory(directory),transcripts:null});
  const plain=await store.snapshot({conversationId:GUID});
  assert.equal(calls.includes('GetTokenBase'),false); // lazy: plain polls never fetch it
  assert.equal(plain.speed.contextComposition.customization.available,false);
  const detailed=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(calls.filter(name=>name==='GetTokenBase').length,1);
  assert.equal(detailed.speed.contextComposition.customization.tokens,16489);
  assert.ok(detailed.speed.contextComposition.segments.some(segment=>segment.id==='customization'));
  const cached=await store.snapshot({conversationId:GUID}); // later polls reuse the cache
  assert.equal(calls.filter(name=>name==='GetTokenBase').length,1);
  assert.equal(cached.speed.contextComposition.customization.tokens,16489);
  tokenBaseBroken=true;store.tokenBase=null;store.tokenBaseAt=0;store.tokenBaseFailedAt=0;
  const degraded=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(calls.filter(name=>name==='GetTokenBase').length,2);
  assert.equal(degraded.speed.contextComposition.customization.available,false);
  assert.ok(degraded.speed.contextComposition.segments.every(segment=>segment.id!=='customization'));
  assert.ok(degraded.speed.contextComposition.segments.some(segment=>segment.id!=='remaining'));
  const afterCooldown=await store.snapshot({conversationId:GUID,contextDetail:true}); // failure backoff: no extra RPC
  assert.equal(calls.filter(name=>name==='GetTokenBase').length,2);
  assert.equal(afterCooldown.speed.contextComposition.customization.available,false);
  store.dispose();
});

test('metrics request validation passes contextDetail through explicitly',()=>{
  assert.equal(validatedInput({conversationId:null,contextDetail:true}).contextDetail,true);
  assert.equal(validatedInput({conversationId:null}).contextDetail,undefined);
  assert.equal(validatedInput({conversationId:null,contextDetail:'yes'}).contextDetail,undefined);
  assert.equal(validatedInput({conversationId:null,force:true}).contextDetail,undefined);
});

test('real Antigravity planner-only buckets combine with transcript in hybrid mode',()=>{
  const steps=[
    {type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{}},
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'29171',outputTokens:'870',thinkingOutputTokens:'788',responseOutputTokens:'82'}}},
    {type:'CORTEX_STEP_TYPE_RUN_COMMAND',metadata:{}},
    {type:'CORTEX_STEP_TYPE_VIEW_FILE',metadata:{}},
  ];
  const transcript={status:'partial',matchedSteps:4,userTokens:500,assistantTokens:900,toolTokens:8000,systemTokens:200,totalTokens:9600};
  const base=tokenBaseMetrics(tokenBaseResponse);
  const comp=attachTokenBase(compositionMetrics({context,steps,generators:[],transcript}),base);
  assert.equal(comp.source,'hybrid');
  assert.equal(comp.complete,true);
  assert.deepEqual(comp.parts,[['user',500],['thinking',788],['reply',82],['tool',8000],['system',200]]);
  const byId=Object.fromEntries(comp.segments.map(s=>[s.id,s]));
  assert.ok(byId.user&&byId.thinking&&byId.reply&&byId.tool&&byId.system&&byId.customization);
  assert.ok(Math.abs(comp.segments.reduce((n,s)=>n+s.fraction,0)-1)<1e-9);
});

test('planner-only steps without transcript leave unattributed space as other without inflating output',()=>{
  const steps=[{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'29171',outputTokens:'870',thinkingOutputTokens:'788',responseOutputTokens:'82'}}}];
  const comp=compositionMetrics({context,steps,generators:[],transcript:null});
  assert.equal(comp.source,'steps');
  assert.equal(comp.complete,false);
  const byId=Object.fromEntries(comp.segments.map(s=>[s.id,s]));
  assert.ok(Math.abs(byId.thinking.fraction-788/1000000)<1e-9);
  assert.ok(Math.abs(byId.reply.fraction-82/1000000)<1e-9);
  assert.ok(Math.abs(byId.other.fraction-(100000-870)/1000000)<1e-9);
  assert.equal(byId.other.tokens,100000-870);
  const withBase=attachTokenBase(comp,tokenBaseMetrics(tokenBaseResponse));
  const byIdBase=Object.fromEntries(withBase.segments.map(s=>[s.id,s]));
  assert.equal(byIdBase.other.tokens,100000-16489-870);
  assert.ok(Math.abs(withBase.segments.reduce((n,s)=>n+s.fraction,0)-1)<1e-9);
});

test('composition keeps non-negative fractions when custom exceeds used or used exceeds max',()=>{
  const hugeCustom=tokenBaseMetrics({customizationTokenBase:{totalTokens:150000,groups:[{name:'Rules',numTokens:150000}]}});
  const overUsed=attachTokenBase(compositionMetrics({context:{usedTokens:100000,maxTokens:1000000},steps:[stepUsage('USER_INPUT',5000)],generators:[]}),hugeCustom);
  assert.ok(overUsed.segments.every(s=>s.fraction>=0));
  assert.ok(Math.abs(overUsed.segments.reduce((n,s)=>n+s.fraction,0)-1)<1e-9);
  const overflow=compositionMetrics({context:{usedTokens:1200000,maxTokens:1000000},steps:[stepUsage('USER_INPUT',5000)],generators:[],tokenBase:hugeCustom});
  assert.ok(overflow.segments.every(s=>s.fraction>=0));
  assert.ok(Math.abs(overflow.segments.reduce((n,s)=>n+s.fraction,0)-1)<1e-9);
});

test('reconcileMetrics keeps live contextComposition while safeMetrics keeps disk whitelist clean',()=>{
  const comp=compositionMetrics({context,steps:[stepUsage('USER_INPUT',3000)],generators:[]});
  const saved={conversationId:GUID,requests:10,counts:{output:5000},tps:50,measuredRequests:5,tokens:{measuredRequests:5,totalTokens:1000},cache:{measuredRequests:5,hitRate:0.5}};
  const fresh={conversationId:GUID,requests:2,counts:{output:100},tps:40,measuredRequests:1,complete:false,context,contextComposition:comp};
  const reconciled=reconcileMetrics(saved,fresh,'2026-11-21T08:00:00Z');
  assert.equal(reconciled.contextComposition,comp);
  const persisted=safeMetrics(reconciled,GUID);
  assert.equal(persisted.contextComposition,undefined);
});

test('account switch and server pid change invalidate cached tokenBase',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ag-comp-inval-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let email='a@example.test',pid=1,tokenBaseCalls=0;
  const raw={trajectory:{cascadeId:GUID,steps:[{type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{createdAt:'2026-11-21T08:00:00Z',modelUsage:{inputTokens:'3000'}}}],generatorMetadata:[{stepIndices:[0],chatModel:{usage:{messageId:'m1',inputTokens:'1000'},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:100000,maxContextTokens:1000000}}}}]},numTotalSteps:1};
  const client={call:async method=>{
    if(method==='GetUserStatus')return{userStatus:{email}};
    if(method==='RetrieveUserQuotaSummary')return{response:{groups:[]}};
    if(method==='GetTokenBase'){tokenBaseCalls++;return tokenBaseResponse;}
    throw new Error('unexpected '+method);
  },discover:async()=>({pid}),trajectory:async()=>raw,resetTrajectories(){}};
  const store=new MetricsStore(client,{history:new SessionHistory(directory),transcripts:null});
  const s1=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(tokenBaseCalls,1);assert.equal(s1.speed.contextComposition.customization.available,true);
  email='b@example.test';
  const s2=await store.snapshot({conversationId:GUID,force:true,contextDetail:false});
  assert.equal(s2.speed.contextComposition.customization.available,false);
  const s3=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(tokenBaseCalls,2);assert.equal(s3.speed.contextComposition.customization.available,true);
  pid=2;
  const s4=await store.snapshot({conversationId:GUID,contextDetail:false});
  assert.equal(s4.speed.contextComposition.customization.available,false);
  const s5=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(tokenBaseCalls,3);assert.equal(s5.speed.contextComposition.customization.available,true);
  store.dispose();
});

test('CHECKPOINT, COMPACTION and SYSTEM_MESSAGE usage never disables hybrid transcript fallback',()=>{
  const steps=[
    {type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{}},
    stepUsage('SYSTEM_MESSAGE',85000),
    stepUsage('CHECKPOINT',120000),
    {type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{}},
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'32000',outputTokens:'1500',thinkingOutputTokens:'1100',responseOutputTokens:'400'}}},
    {type:'CORTEX_STEP_TYPE_RUN_COMMAND',metadata:{}},
    stepUsage('SYSTEM_MESSAGE',50000),
  ];
  const transcript={status:'partial',matchedSteps:7,userTokens:2400,assistantTokens:1500,toolTokens:18000,systemTokens:300,totalTokens:22200};
  const comp=compositionMetrics({context,steps,generators:[],transcript});
  assert.equal(comp.source,'hybrid');
  assert.deepEqual(comp.parts,[['user',2400],['thinking',1100],['reply',400],['tool',18000],['system',300]]);

  // Without assistant steps after checkpoint, still falls back to transcript rather than steps with 0 user/tool.
  const preAssistant=compositionMetrics({
    context,
    steps:[stepUsage('COMPACTION',90000),stepUsage('SYSTEM_MESSAGE',40000)],
    generators:[],
    transcript,
  });
  assert.equal(preAssistant.source,'transcript');
});

test('stepBuckets scopes to steps after the latest compaction or checkpoint',()=>{
  const steps=[
    stepUsage('USER_INPUT',10000),
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'100000',outputTokens:'90000',thinkingOutputTokens:'60000',responseOutputTokens:'30000'}}},
    stepUsage('TOOL_RESULT',25000),
    stepUsage('COMPACTION',150000),
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'45000',outputTokens:'50000',thinkingOutputTokens:'35000',responseOutputTokens:'15000'}}},
    stepUsage('CHECKPOINT',200000),
    {type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{}},
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'22000',outputTokens:'1800',thinkingOutputTokens:'1300',responseOutputTokens:'500'}}},
    {type:'CORTEX_STEP_TYPE_VIEW_FILE',metadata:{}},
  ];
  const transcript={status:'ready',matchedSteps:9,userTokens:900,assistantTokens:1800,toolTokens:6000,systemTokens:400,totalTokens:9100};
  const hybrid=compositionMetrics({context,steps,generators:[],transcript});
  assert.equal(hybrid.source,'hybrid');
  assert.deepEqual(hybrid.parts,[['user',900],['thinking',1300],['reply',500],['tool',6000],['system',400]]);

  // Also verify full per-step mode excludes pre-checkpoint user/assistant/tool/system buckets.
  const fullSteps=[
    ...steps,
    stepUsage('USER_INPUT',1200),
    stepUsage('TOOL_RESULT',3400),
    stepUsage('SYSTEM_MESSAGE',250),
  ];
  const stepped=compositionMetrics({context,steps:fullSteps,generators:[]});
  assert.equal(stepped.source,'steps');
  assert.deepEqual(stepped.parts,[['user',1200],['thinking',1300],['reply',500],['tool',3400],['system',250]]);
});

test('trend dedup skips duplicate request ids even when usage signature differs',()=>{
  const req=(id,input,output,model,indices)=>({
    stepIndices:indices,
    chatModel:{usage:{...(id.startsWith('r:')?{responseId:id.slice(2),apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}:{messageId:id}),inputTokens:String(input),outputTokens:String(output),model}},
  });
  const generators=[
    req('r:resp-1',1000,200,'gemini-4-neon',[0]),
    req('r:resp-1',1500,350,'gemini-4-neon',[0]),
    req('msg-2',2000,400,'claude-sonnet-4-6',[2]),
    req('msg-2',2200,500,'claude-sonnet-4-6',[2]),
    req('msg-3',3000,100,'gemini-4-neon',[4]),
  ];
  const steps=['USER_INPUT','PLANNER_RESPONSE','PLANNER_RESPONSE','COMPACTION','PLANNER_RESPONSE'].map(t=>({type:`CORTEX_STEP_TYPE_${t}`}));
  const comp=compositionMetrics({context,steps,generators});
  assert.deepEqual(comp.trend.points.map(p=>p.inputTokens),[1000,2000,3000]);
  assert.equal(comp.trend.totalRequests,3);
  assert.equal(comp.trend.totalMarkers,1);
  assert.deepEqual(comp.trend.markers,[{pointIndex:2,kind:'compaction',before:2000,after:3000}]);
});

test('tokenBaseMetrics preserves groups contract and exposes nested drilldown + rules budget',()=>{
  const rich={
    customizationTokenBase:{
      totalTokens:16489,
      groups:[
        {name:'Rules',type:'TOKEN_TYPE_RULES',numTokens:6642,children:[
          {name:'/Users/mac/.gemini/AGENTS.md',numTokens:2767},
          {name:'/Users/mac/.gemini/config/rules/team-resident.md',numTokens:3395},
        ]},
        {name:'Mcp Tools',type:'TOKEN_TYPE_MCP_TOOLS',numTokens:160,children:[
          {name:'openviking',numTokens:102,children:[{name:'find',numTokens:2},{name:'remember',numTokens:4}]},
        ]},
      ],
    },
    customizationBudget:20000,remainingBudget:10153,rulesBudget:20000,remainingRulesBudget:13358,
  };
  const base=tokenBaseMetrics(rich);
  assert.deepEqual(base.groups,[{name:'Rules',tokens:6642},{name:'Mcp Tools',tokens:160}]);
  assert.equal(base.rulesBudget,20000);
  assert.equal(base.remainingRulesBudget,13358);
  assert.equal(base.drilldown[0].children[0].name,'/Users/mac/.gemini/config/rules/team-resident.md');
  assert.equal(base.drilldown[1].children[0].children[0].name,'remember');
});

test('hostContextMetrics and attachHostContextUsage provide authoritative 8-category host breakdown',()=>{
  const hostUpdate={
    update:{
      contextWindowUsage:{
        generatorMetadataIndex:12,lastStepIndex:55,estimatedTokensUsed:100000,maxContextTokens:512000,
        tokenGroups:[
          {name:'System Prompt',type:'TOKEN_TYPE_SYSTEM_PROMPT',numTokens:5000},
          {name:'Mcp Tools',type:'TOKEN_TYPE_MCP_TOOLS',numTokens:300},
          {name:'Subagents',type:'TOKEN_TYPE_SUBAGENTS',numTokens:400},
          {name:'Skills',type:'TOKEN_TYPE_SKILLS',numTokens:9300},
          {name:'Plugins',type:'TOKEN_TYPE_PLUGINS',numTokens:1500},
          {name:'Rules',type:'TOKEN_TYPE_RULES',numTokens:6500},
          {name:'Tools',type:'TOKEN_TYPE_TOOLS',numTokens:7000},
          {name:'Chat Messages',type:'TOKEN_TYPE_CHAT_MESSAGES',numTokens:70000},
        ],
      },
    },
  };
  const hostUsage=hostContextMetrics(hostUpdate);
  assert.equal(hostUsage.groups.length,8);
  assert.equal(hostUsage.usedTokens,100000);
  const comp=compositionMetrics({
    context:{usedTokens:95000,maxTokens:512000},
    steps:[stepUsage('USER_INPUT',2000),{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{modelUsage:{inputTokens:'90000',thinkingOutputTokens:'6000',responseOutputTokens:'2000'}}}],
    generators:[],
  });
  const merged=attachHostContextUsage(attachTokenBase(comp,tokenBaseMetrics(tokenBaseResponse)),hostUsage);
  assert.equal(merged.source,'host-token-groups');
  assert.equal(merged.usedTokens,100000);
  assert.equal(merged.customization.available,true);
  assert.equal(merged.segments.filter(s=>s.id!=='remaining').length,8);
  assert.ok(Math.abs(merged.segments.reduce((n,s)=>n+s.fraction,0)-1)<1e-9);
  assert.ok(Array.isArray(merged.chatBreakdown)&&merged.chatBreakdown.length>=2);
});

test('MetricsStore lazily calls streamContextWindowUsage on contextDetail and captures GetUserStatus accountCredits',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ag-host-ctx-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let streamCalls=0;
  const raw={trajectory:{cascadeId:GUID,steps:[{type:'CORTEX_STEP_TYPE_USER_INPUT',metadata:{createdAt:'2026-11-21T08:00:00Z',modelUsage:{inputTokens:'3000'}}}],generatorMetadata:[{stepIndices:[0],chatModel:{modelDisplayName:'Gemini 4 Neon (High)',usage:{messageId:'m1',inputTokens:'1000',cacheReadTokens:'3000',outputTokens:'500',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:100000,maxContextTokens:512000}}}}]},numTotalSteps:1};
  const client={
    call:async method=>{
      if(method==='GetUserStatus')return{userStatus:{email:'a@example.test',planStatus:{availablePromptCredits:500,availableFlowCredits:100,planInfo:{planName:'Pro',monthlyPromptCredits:50000,monthlyFlowCredits:150000}}}};
      if(method==='RetrieveUserQuotaSummary')return{response:{groups:[]}};
      if(method==='GetTokenBase')return tokenBaseResponse;
      throw new Error('unexpected '+method);
    },
    streamContextWindowUsage:async()=>{
      streamCalls++;
      return{
        contextWindowUsage:{
          estimatedTokensUsed:100000,maxContextTokens:512000,
          tokenGroups:[
            {name:'System Prompt',type:'TOKEN_TYPE_SYSTEM_PROMPT',numTokens:5000},
            {name:'Chat Messages',type:'TOKEN_TYPE_CHAT_MESSAGES',numTokens:95000},
          ],
        },
      };
    },
    discover:async()=>({pid:1}),trajectory:async()=>raw,resetTrajectories(){},
  };
  const store=new MetricsStore(client,{history:new SessionHistory(directory),transcripts:null});
  t.after(()=>store.dispose());
  const plain=await store.snapshot({conversationId:GUID});
  assert.equal(streamCalls,0);
  assert.equal(plain.accountCredits.availablePromptCredits,500);
  assert.equal(plain.accountCredits.availableFlowCredits,100);
  const detailed=await store.snapshot({conversationId:GUID,contextDetail:true});
  assert.equal(streamCalls,1);
  assert.equal(detailed.speed.contextComposition.source,'host-token-groups');
  assert.equal(detailed.speed.contextComposition.customization.available,true);
  assert.ok(detailed.speed.estimatedCost.hasPriced);
});
