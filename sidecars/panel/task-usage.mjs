// Task-scoped usage only. Request identities are hashed in memory and are never
// included in persisted task summaries; speed and context stay conversation-local.
import {createHash} from 'node:crypto';
import {tokenCount,trajectoryMetrics} from './metrics.mjs';
import {formatModelName,quotaPoolForModel} from './context.mjs';
import {cleanAgentLabel} from './swarm.mjs';

const HASH=/^[a-f0-9]{64}$/;
const fields=['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'];
const tokenValues=['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','totalTokens'];
const tokenCounts=['measuredRequests','inputRequests','outputRequests','missingInputRequests','missingOutputRequests','uncachedRequests','cachedRequests','cacheWriteRequests'];
const cacheValues=['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','totalTokens'];
const POOLS=['gemini','3p','local','other'];
const ROLES=['coordinator','worker','monitor','sidecar'];
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const nullableCount=value=>value===null||count(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const stamp=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const hash=value=>createHash('sha256').update(value).digest('hex');
const provider=value=>typeof value==='string'&&/^(?:API_PROVIDER_)?(?:GOOGLE_GEMINI|OPENAI|ANTHROPIC(?:_VERTEX)?)$/.test(value)?value:'';
const cleanModel=value=>typeof value==='string'?(formatModelName(value)||'').slice(0,120):'';
const add=values=>values.every(count)&&count(values.reduce((n,value)=>n+value,0))?values.reduce((n,value)=>n+value,0):null;
const addNullable=(a,b)=>a===null||b===null?null:count(a+b)?a+b:null;
const coverage=row=>fields.reduce((n,key)=>n+(row[key]!==null),0);
const rowTotal=row=>fields.reduce((n,key)=>n+BigInt(row[key]??0),0n);
const sameRecord=(a,b)=>a.apiProvider===b.apiProvider&&a.model===b.model&&a.thinkingTokens===b.thinkingTokens&&fields.every(key=>a[key]===b[key]);

function normalizedRecord(value){
  if(!object(value)||typeof value.id!=='string'||!HASH.test(value.id))return null;
  return {id:value.id,apiProvider:provider(value.apiProvider),model:cleanModel(value.model),
    ...Object.fromEntries(fields.map(key=>[key,count(value[key])?value[key]:null])),
    thinkingTokens:count(value.thinkingTokens)?value.thinkingTokens:null};
}

// Prefer a more complete observation of one request, never add observations of
// the same request. A whole-row choice avoids combining conflicting counters.
function richer(previous,next){
  const a=coverage(previous),b=coverage(next);
  if(a!==b)return b>a?next:previous;
  const ta=rowTotal(previous),tb=rowTotal(next);
  if(ta!==tb)return tb>ta?next:previous;
  if((previous.thinkingTokens===null)!==(next.thinkingTokens===null))return next.thinkingTokens!==null?next:previous;
  if(!previous.model&&next.model)return next;
  return previous;
}

export function mergeTaskRecords(previousRows,nextRows){
  const unique=values=>{
    const result=new Map();
    for(const value of Array.isArray(values)?values:[]){
      const row=normalizedRecord(value);if(!row)continue;
      const old=result.get(row.id);result.set(row.id,old?richer(old,row):row);
    }
    return result;
  };
  const previous=unique(previousRows),next=unique(nextRows),merged=new Map(previous);let restored=false;
  for(const [id,old]of previous)if(!next.has(id))restored=true;
  for(const [id,row]of next){
    const old=previous.get(id);
    // A temporary metadata omission cannot erase recorded consumption or a
    // known component. Retain one coherent old row, not a synthetic field sum.
    const keep=old&&(coverage(old)>coverage(row)||rowTotal(old)>rowTotal(row));
    if(keep){if(!sameRecord(old,row))restored=true;}
    else merged.set(id,row);
  }
  return {rows:[...merged.values()],restored};
}

function contributionTotal(rows){
  // Contribution totals need no timing/cache transform. Nonnegative request
  // components make one checked sum equivalent to summarize(rows).totalTokens.
  let total=0;
  for(const row of rows)for(const key of fields){total+=row[key]??0;if(!count(total))return null;}
  return total;
}

export function taskRecords(raw,conversationId){
  const trajectory=raw?.trajectory||{},steps=Array.isArray(trajectory.steps)?trajectory.steps:[],rows=new Map();
  const generators=Array.isArray(trajectory.generatorMetadata)?trajectory.generatorMetadata:[];
  for(const [index,g]of generators.entries()){
    // Match trajectoryMetrics request presence. A malformed but present usage
    // container is an unknown request, not evidence that no request occurred.
    const chat=g?.chatModel,u=chat?.usage;if(!u)continue;
    const input=tokenCount(u.inputTokens);
    const planners=(Array.isArray(g.stepIndices)?g.stepIndices:[]).map(i=>Number.isInteger(i)&&i>=0?steps[i]:null).filter(s=>/PLANNER_RESPONSE/.test(String(s?.type||'')));
    const times=planners.map(s=>stamp(s.metadata?.createdAt)).filter(t=>t!==null);
    const at=stamp(chat.chatStartMetadata?.createdAt)??(times.length?Math.min(...times):null);
    // Keep this identity contract aligned with usageRecords in usage.mjs. The
    // fallback includes its real conversation, step association and timestamp.
    const identity=u.responseId?`response:${u.apiProvider||''}:${u.responseId}`:u.messageId?`message:${u.apiProvider||''}:${u.messageId}`:
      `fallback:${conversationId}:${JSON.stringify(g.stepIndices||[index])}:${at??'undated'}`;
    const row={id:hash(identity),apiProvider:provider(u.apiProvider),
      model:cleanModel(chat.modelDisplayName||chat.responseModel||String(chat.model||u.model||'')),
      inputTokens:input,
      cacheReadTokens:u.cacheReadTokens===undefined&&input!==null?0:tokenCount(u.cacheReadTokens),
      cacheWriteTokens:u.cacheWriteTokens===undefined&&input!==null?0:tokenCount(u.cacheWriteTokens),
      outputTokens:tokenCount(u.outputTokens),
      thinkingTokens:tokenCount(u.thinkingOutputTokens)};
    const previous=rows.get(row.id);rows.set(row.id,previous?richer(previous,row):row);
  }
  return [...rows.values()];
}

function summarize(rows){
  const raw={trajectory:{generatorMetadata:rows.map(row=>({chatModel:{usage:{...Object.fromEntries(fields.map(key=>[key,row[key]])),messageId:row.id,apiProvider:row.apiProvider}}}))}};
  const metrics=trajectoryMetrics(raw),tokens={...metrics.tokens},cache={...metrics.cache};
  // trajectoryMetrics retains known lower-bound components. At task scope an
  // arithmetic overflow must remain unavailable, not become a smaller total.
  tokens.inputTokens=add([tokens.uncachedTokens,tokens.cachedTokens,tokens.cacheWriteTokens]);
  tokens.totalTokens=add([tokens.inputTokens,tokens.outputTokens]);
  tokens.outputAvailable=count(tokens.outputTokens)&&tokens.outputRequests>0;
  tokens.complete=metrics.tokens.complete&&tokenValues.every(key=>count(tokens[key]));
  for(const key of cacheValues)if(!count(cache[key]))cache[key]=null;
  cache.inputTokens=add([cache.uncachedTokens,cache.cachedTokens,cache.cacheWriteTokens]);
  cache.totalTokens=add([cache.inputTokens,cache.outputTokens]);
  cache.hitRate=cache.inputTokens>0&&count(cache.cachedTokens)?cache.cachedTokens/cache.inputTokens:null;
  cache.complete=metrics.cache.complete&&cacheValues.every(key=>count(cache[key]));
  return {tokens,cache};
}

function emptyPoolBucket(){
  return {totalTokens:0,inputTokens:0,outputTokens:0,thinkingTokens:0,requests:0,coordinatorTokens:0,subagentTokens:0};
}
function emptyRoleBucket(){
  return {totalTokens:0,requests:0,agents:0,thinkingTokens:0};
}
function defaultPoolModelLabel(pool){
  return pool==='gemini'?'Gemini':pool==='3p'?'Claude / 3p':pool==='local'?'Local / BYOM':'Unknown';
}

export function aggregateTaskUsage(rootRecords,childRecordSets=[],options={}){
  const rows=new Map();
  const rootRole=ROLES.includes(options.rootRole)?options.rootRole:'coordinator';
  const rootLabel=cleanAgentLabel(options.rootLabel||'',40)||'Coordinator';
  const rootModelHint=cleanModel(options.rootModelHint||'');
  const poolBreakdown=Object.fromEntries(POOLS.map(p=>[p,emptyPoolBucket()]));
  const roleBreakdown=Object.fromEntries(ROLES.map(r=>[r,emptyRoleBucket()]));
  const children=Array.isArray(childRecordSets)?childRecordSets:[];
  const agentDescriptors=new Map();
  agentDescriptors.set('root',{key:'root',label:rootLabel,role:rootRole,modelHint:rootModelHint,tokens:0,thinkingTokens:0,requests:0,pools:new Map()});
  roleBreakdown[rootRole].agents++;
  const collect=(values,meta)=>{
    for(const value of Array.isArray(values)?values:[]){
      const row=normalizedRecord(value);if(!row)continue;
      const old=rows.get(row.id);
      const merged=old?richer(old.row,row):row;
      if(!old)rows.set(row.id,{row:merged,own:meta.own,meta});
      else rows.set(row.id,{row:merged,own:old.own||meta.own,meta:old.own?old.meta:meta});
    }
  };
  collect(rootRecords,{own:true,agentKey:'root',role:rootRole,label:rootLabel,modelHint:rootModelHint});
  children.forEach((child,idx)=>{
    const list=Array.isArray(child)?child:Array.isArray(child?.rows)?child.rows:[];
    const role=ROLES.includes(child?.role)?child.role:'worker';
    const label=cleanAgentLabel(child?.label||'',40)||`Worker #${idx+1}`;
    const modelHint=cleanModel(child?.modelHint||'');
    const agentKey=`child:${idx}`;
    agentDescriptors.set(agentKey,{key:agentKey,label,role,modelHint,tokens:0,thinkingTokens:0,requests:0,pools:new Map()});
    roleBreakdown[role].agents++;
    collect(list,{own:false,agentKey,role,label,modelHint});
  });
  const all=[...rows.values()],summary=summarize(all.map(value=>value.row));
  const modelMap=new Map();
  let thinkingTokens=0;
  for(const item of all){
    const r=item.row,m=item.meta;
    const uncached=r.inputTokens??0,cached=r.cacheReadTokens??0,write=r.cacheWriteTokens??0,output=r.outputTokens??0,thinking=r.thinkingTokens??0;
    const inputSum=addSafe3(uncached,cached,write),rowSum=addNullable(inputSum,output);
    const effModel=r.model||m.modelHint||'';
    const pool=quotaPoolForModel(effModel,r.apiProvider);
    const modelLabel=effModel||defaultPoolModelLabel(pool);
    thinkingTokens=addNullable(thinkingTokens,thinking);
    const pb=poolBreakdown[pool];
    pb.requests++;
    pb.inputTokens=addNullable(pb.inputTokens,inputSum);
    pb.outputTokens=addNullable(pb.outputTokens,output);
    pb.thinkingTokens=addNullable(pb.thinkingTokens,thinking);
    pb.totalTokens=addNullable(pb.totalTokens,rowSum);
    if(item.own)pb.coordinatorTokens=addNullable(pb.coordinatorTokens,rowSum);
    else pb.subagentTokens=addNullable(pb.subagentTokens,rowSum);
    const rb=roleBreakdown[m.role];
    rb.requests++;
    rb.thinkingTokens=addNullable(rb.thinkingTokens,thinking);
    rb.totalTokens=addNullable(rb.totalTokens,rowSum);
    const ag=agentDescriptors.get(m.agentKey);
    if(ag){
      ag.requests++;
      ag.tokens=addNullable(ag.tokens,rowSum);
      ag.thinkingTokens=addNullable(ag.thinkingTokens,thinking);
      ag.pools.set(pool,(ag.pools.get(pool)||0)+(rowSum??0));
      if(!ag.model&&modelLabel)ag.model=modelLabel;
      else if(ag.model&&modelLabel&&ag.model!==modelLabel&&!ag.model.includes(modelLabel))ag.multiModel=true;
    }
    const mk=`${pool}\0${modelLabel}`;
    let mb=modelMap.get(mk);
    if(!mb){mb={model:modelLabel,pool,requests:0,inputTokens:0,uncachedTokens:0,cachedTokens:0,cacheWriteTokens:0,outputTokens:0,thinkingTokens:0,totalTokens:0};modelMap.set(mk,mb);}
    mb.requests++;
    mb.uncachedTokens=addNullable(mb.uncachedTokens,uncached);
    mb.cachedTokens=addNullable(mb.cachedTokens,cached);
    mb.cacheWriteTokens=addNullable(mb.cacheWriteTokens,write);
    mb.inputTokens=addNullable(mb.inputTokens,inputSum);
    mb.outputTokens=addNullable(mb.outputTokens,output);
    mb.thinkingTokens=addNullable(mb.thinkingTokens,thinking);
    mb.totalTokens=addNullable(mb.totalTokens,rowSum);
  }
  const modelBreakdown=[...modelMap.values()]
    .sort((a,b)=>(b.totalTokens??-1)-(a.totalTokens??-1)||b.requests-a.requests||a.model.localeCompare(b.model))
    .slice(0,16);
  const agents=[...agentDescriptors.values()]
    .filter(a=>a.requests>0||a.key==='root'||a.role!=='worker')
    .sort((a,b)=>(a.key==='root'?-1:b.key==='root'?1:(b.tokens??-1)-(a.tokens??-1)))
    .slice(0,16)
    .map(a=>{
      let topPool='other',best=-1;
      for(const [p,v]of a.pools)if(v>best){best=v;topPool=p;}
      if(best<0&&a.modelHint)topPool=quotaPoolForModel(a.modelHint,'');
      return {label:a.label,role:a.role,pool:topPool,model:a.model||a.modelHint||defaultPoolModelLabel(topPool),tokens:a.tokens,thinkingTokens:a.thinkingTokens,requests:a.requests};
    });
  const subagents=count(options.subagents)?options.subagents:children.length;
  const loadedSubagents=count(options.loadedSubagents)?Math.min(options.loadedSubagents,subagents):Math.min(children.length,subagents);
  let state=['ready','partial','loading'].includes(options.state)?options.state:options.state===undefined?'ready':'partial';
  if(state==='ready'&&(loadedSubagents!==subagents||!summary.tokens.complete))state='partial';
  const complete=state==='ready'&&loadedSubagents===subagents&&summary.tokens.complete;
  summary.tokens.complete=complete;
  summary.cache.complete=summary.cache.complete&&state==='ready'&&loadedSubagents===subagents;
  return {...summary,ownTokens:contributionTotal(all.filter(value=>value.own).map(value=>value.row)),
    subagentTokens:contributionTotal(all.filter(value=>!value.own).map(value=>value.row)),
    thinkingTokens,poolBreakdown,roleBreakdown,modelBreakdown,agents,
    subagents,loadedSubagents,state,complete};
}

function addSafe3(a,b,c){
  const ab=addNullable(a,b);
  return addNullable(ab,c);
}

function safePoolBreakdown(raw){
  if(!object(raw))return null;
  const out={};
  for(const p of POOLS){
    const b=raw[p];if(!object(b))return null;
    if(!count(b.requests)||!nullableCount(b.totalTokens)||!nullableCount(b.inputTokens)||!nullableCount(b.outputTokens)||!nullableCount(b.thinkingTokens)||!nullableCount(b.coordinatorTokens)||!nullableCount(b.subagentTokens))return null;
    out[p]={totalTokens:b.totalTokens,inputTokens:b.inputTokens,outputTokens:b.outputTokens,thinkingTokens:b.thinkingTokens,requests:b.requests,coordinatorTokens:b.coordinatorTokens,subagentTokens:b.subagentTokens};
  }
  return out;
}

function safeRoleBreakdown(raw){
  if(!object(raw))return null;
  const out={};
  for(const r of ROLES){
    const b=raw[r];if(!object(b))return null;
    if(!count(b.requests)||!count(b.agents)||!nullableCount(b.totalTokens)||!nullableCount(b.thinkingTokens))return null;
    out[r]={totalTokens:b.totalTokens,requests:b.requests,agents:b.agents,thinkingTokens:b.thinkingTokens};
  }
  return out;
}

function safeTaskModelBreakdown(raw){
  if(!Array.isArray(raw)||raw.length>16)return null;
  const out=[];
  for(const m of raw){
    if(!object(m)||typeof m.model!=='string'||!POOLS.includes(m.pool)||!count(m.requests))return null;
    const label=cleanModel(m.model)||m.model.slice(0,120);
    if(!label||/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))return null;
    const numKeys=['inputTokens','uncachedTokens','cachedTokens','cacheWriteTokens','outputTokens','thinkingTokens','totalTokens'];
    if(numKeys.some(k=>!nullableCount(m[k])))return null;
    out.push({model:label,pool:m.pool,requests:m.requests,...Object.fromEntries(numKeys.map(k=>[k,m[k]]))});
  }
  return out;
}

function safeAgentsList(raw){
  if(!Array.isArray(raw)||raw.length>16)return null;
  const out=[];
  for(const a of raw){
    if(!object(a)||!ROLES.includes(a.role)||!POOLS.includes(a.pool)||!count(a.requests)||!nullableCount(a.tokens)||!nullableCount(a.thinkingTokens))return null;
    const label=cleanAgentLabel(a.label,40);if(!label)return null;
    const model=typeof a.model==='string'?(cleanModel(a.model)||cleanAgentLabel(a.model,80)||'Unknown'):'Unknown';
    if(/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(model))return null;
    out.push({label,role:a.role,pool:a.pool,model,tokens:a.tokens,thinkingTokens:a.thinkingTokens,requests:a.requests});
  }
  return out;
}

// Strict structural validation, with conservative completeness. No raw rows,
// identifiers, provider labels, titles or caller-supplied extra keys survive.
export function safeTaskUsage(value){
  if(!object(value)||!object(value.tokens)||!object(value.cache))return null;
  const t=value.tokens,c=value.cache;
  if(!tokenValues.every(key=>t[key]===null||count(t[key]))||!tokenCounts.every(key=>count(t[key]))||
    !cacheValues.every(key=>c[key]===null||count(c[key]))||!['measuredRequests','missingRequests'].every(key=>count(c[key]))||
    !['ownTokens','subagentTokens'].every(key=>value[key]===null||count(value[key]))||
    !count(value.subagents)||!count(value.loadedSubagents)||value.loadedSubagents>value.subagents||
    typeof t.complete!=='boolean'||typeof t.outputAvailable!=='boolean'||typeof c.complete!=='boolean'||typeof value.complete!=='boolean')return null;
  const state=value.state==='unavailable'?'partial':value.state;
  if(!['ready','partial','loading'].includes(state))return null;
  const requests=add([t.inputRequests,t.missingInputRequests]);
  if(requests===null||requests!==add([t.outputRequests,t.missingOutputRequests])||requests!==add([c.measuredRequests,c.missingRequests])||
    tokenCounts.some(key=>t[key]>requests)||t.inputRequests>Math.min(t.uncachedRequests,t.cachedRequests,t.cacheWriteRequests)||
    t.measuredRequests<Math.max(t.inputRequests,t.outputRequests,t.uncachedRequests,t.cachedRequests,t.cacheWriteRequests)||c.measuredRequests>t.inputRequests)return null;
  if(t.inputTokens!==add([t.uncachedTokens,t.cachedTokens,t.cacheWriteTokens])||t.totalTokens!==add([t.inputTokens,t.outputTokens])||
    c.inputTokens!==add([c.uncachedTokens,c.cachedTokens,c.cacheWriteTokens])||c.totalTokens!==add([c.inputTokens,c.outputTokens])||
    t.totalTokens!==add([value.ownTokens,value.subagentTokens]))return null;
  if(['uncachedTokens','cachedTokens','cacheWriteTokens','inputTokens','outputTokens'].some(key=>count(c[key])&&count(t[key])&&c[key]>t[key]))return null;
  const ratio=c.inputTokens>0&&count(c.cachedTokens)?c.cachedTokens/c.inputTokens:null;
  if(c.hitRate!==ratio||c.hitRate!==null&&(!Number.isFinite(c.hitRate)||c.hitRate<0||c.hitRate>1))return null;
  const extra={};
  if(Object.hasOwn(value,'thinkingTokens')){
    if(!nullableCount(value.thinkingTokens))return null;
    extra.thinkingTokens=value.thinkingTokens;
  }
  if(Object.hasOwn(value,'poolBreakdown')){
    const pb=safePoolBreakdown(value.poolBreakdown);if(!pb)return null;
    if(POOLS.reduce((n,p)=>n+pb[p].requests,0)!==requests)return null;
    if(POOLS.some(p=>pb[p].totalTokens!==null&&addNullable(pb[p].coordinatorTokens,pb[p].subagentTokens)!==pb[p].totalTokens))return null;
    if(t.totalTokens!==null){
      let total=0;for(const p of POOLS){total=addNullable(total,pb[p].totalTokens);if(total===null)break;}
      if(total!==t.totalTokens)return null;
    }
    extra.poolBreakdown=pb;
  }
  if(Object.hasOwn(value,'roleBreakdown')){
    const rb=safeRoleBreakdown(value.roleBreakdown);if(!rb)return null;
    if(ROLES.reduce((n,r)=>n+rb[r].requests,0)!==requests)return null;
    if(t.totalTokens!==null){
      let total=0;for(const r of ROLES){total=addNullable(total,rb[r].totalTokens);if(total===null)break;}
      if(total!==t.totalTokens)return null;
    }
    extra.roleBreakdown=rb;
  }
  if(Object.hasOwn(value,'modelBreakdown')){
    const mb=safeTaskModelBreakdown(value.modelBreakdown);if(!mb)return null;
    extra.modelBreakdown=mb;
  }
  if(Object.hasOwn(value,'agents')){
    const ag=safeAgentsList(value.agents);if(!ag)return null;
    extra.agents=ag;
  }
  const covered=state==='ready'&&value.loadedSubagents===value.subagents;
  const tokens={...Object.fromEntries([...tokenValues,...tokenCounts].map(key=>[key,t[key]])),
    outputAvailable:count(t.outputTokens)&&t.outputRequests>0,
    complete:t.complete&&covered&&t.missingInputRequests===0&&t.missingOutputRequests===0&&tokenValues.every(key=>count(t[key]))};
  const cache={...Object.fromEntries([...cacheValues,'measuredRequests','missingRequests'].map(key=>[key,c[key]])),
    hitRate:ratio,complete:c.complete&&covered&&c.missingRequests===0&&cacheValues.every(key=>count(c[key]))};
  return {tokens,cache,ownTokens:value.ownTokens,subagentTokens:value.subagentTokens,...extra,subagents:value.subagents,loadedSubagents:value.loadedSubagents,
    state,complete:value.complete&&tokens.complete&&covered};
}
