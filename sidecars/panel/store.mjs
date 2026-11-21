import {BackgroundStatistics} from './background-statistics.mjs';
import {dirname,join} from 'node:path';
import {collectionFailure} from './collection-state.mjs';
import { createHash } from 'node:crypto';
import { AntigravityClient } from './client.mjs';
import { quotaMetrics, trajectoryMetrics } from './metrics.mjs';
import { compositionMetrics, attachTokenBase, tokenBaseMetrics, hostContextMetrics, attachHostContextUsage } from './composition.mjs';
import { extractAccountCredits, extractCreditUsageSummary, estimateModelsCost } from './pricing.mjs';
import { makeFoldCache } from './audit.mjs';
import { SessionHistory, usableMetrics, reconcileMetrics, safeMetrics } from './history.mjs';
import { TranscriptReader } from './transcript.mjs';
import {DelegatedUsage} from './delegated-usage.mjs';
import {safeTaskUsage} from './task-usage.mjs';
import {delegatedIds} from './delegation.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_SCOPE = createHash('sha256').update('ag-pulse:local-unauthenticated').digest('hex');
const BACKGROUND_RECHECK_MS=5*60*1000, BACKGROUND_MANUAL_COOLDOWN_MS=10*1000;
const settledStatus=s=>/IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/.test(String(s||''));
export class MetricsStore {
  constructor(client = new AntigravityClient(), { history = new SessionHistory(), onTrajectory = null, onBackgroundResult = null, background = undefined, transcripts = new TranscriptReader(), owns=()=>true } = {}) {
    this.client = client; this.history = history; this.onTrajectory=onTrajectory; this.onBackgroundResult=onBackgroundResult; this.transcripts=transcripts; this.owns=owns;
    this.background=background===undefined?(typeof client.streamTrajectoryPage==='function'&&history.directory?new BackgroundStatistics({directory:join(dirname(history.directory),'collection-jobs'),owns:()=>this.owned(),onComplete:(...args)=>this.acceptBackground(...args)}):null):background;
    if(this.background&&client.reader)client.reader.isBackgroundManaged=id=>this.sessions.get(id)?.backgroundOnly===true;
    this.delegated=new DelegatedUsage(client,{owns,
      onSource:async(scope,id,raw,options={})=>{if(this.owned()&&scope===this.storageScope()&&this.onTrajectory&&(!options.isCurrent||options.isCurrent()===true))await this.onTrajectory(scope,id,raw,options);},
      onUpdate:async(scope,id,taskUsage,delegatedConversations)=>{
        const entry=this.sessions.get(id);if(!this.owned()||scope!==this.storageScope()||!entry?.data)return;
        const identity=this.identity,epoch=this.epoch,current=()=>this.owned()&&identity===this.identity&&epoch===this.epoch&&this.sessions.get(id)===entry;
        entry.data={...entry.data,taskUsage,delegatedConversations};
        try{const saved=await this.history.save(scope,id,entry.data,{isCurrent:current});if(saved&&current())entry.savedAt=saved.savedAt;}
        catch{if(current())this.persistenceError='统计暂时无法保存到本地';}
      },
    });
  }
  storageScope(identity = this.identity) { return identity || LOCAL_SCOPE; }
  quota = null;
  quotaAt = 0;
  quotaPending = null;
  accountCredits = null;
  // Customization token base (GetTokenBase) and host 8-category tokenGroups
  // (StreamAgentStateUpdates) are fetched lazily only when contextDetail is requested.
  tokenBase = null;
  tokenBaseAt = 0;
  tokenBasePending = null;
  tokenBaseFailedAt = 0;
  hostContextCache = makeFoldCache({ maxEntries: 4, idleMs: 20_000 });
  hostContextPending = new Map();
  hostContextFailedAt = new Map();
  identity = null;
  serverPid = null;
  summaries = [];
  summariesAt = 0;
  sessions = new Map();
  persistenceError = null;
  usagePersistenceError = false;
  usagePersistenceFailures = new Set();
  usagePersistenceFailureVersions = new Map();
  usagePersistenceFailureSerial = 0;
  epoch = 0;
  disposed = false;
  // Collection callbacks need a synchronous boolean. A Promise must never grant
  // ownership, and this hot predicate must not start disk I/O.
  owned(){return !this.disposed&&this.owns()===true;}
  setUsagePersistenceError(source,failed){
    if(failed){this.usagePersistenceFailures.add(source);this.usagePersistenceFailureVersions.set(source,++this.usagePersistenceFailureSerial);}else{this.usagePersistenceFailures.delete(source);this.usagePersistenceFailureVersions.delete(source);}
    this.usagePersistenceError=this.usagePersistenceFailures.size>0;
  }
  usageFailureVersion(source){return this.usagePersistenceFailureVersions.get(source)||0;}
  clearUsagePersistenceErrors(){this.usagePersistenceFailures.clear();this.usagePersistenceFailureVersions.clear();this.usagePersistenceError=false;}

  async cachedSession(id) {
    if (!this.owned() || !GUID.test(id)) return null;
    id=id.toLowerCase();
    const identity = this.identity, scope = this.storageScope(identity), epoch = this.epoch;
    const entry = this.sessions.get(id);
    if (usableMetrics(entry?.data)) return { ...entry.data, transcriptRestoredFromHistory:!!entry.data.transcriptStats, restoredFromHistory: true, savedAt: entry.savedAt || null };
    const saved = await this.history.load(scope,id);
    if (!this.owned() || identity !== this.identity || epoch !== this.epoch) return null;
    if (!saved) return null;
    if (!this.sessions.has(id)) this.sessions.set(id,{data:saved.metrics,savedAt:saved.savedAt,updatedAt:0});
    return {...saved.metrics,transcriptRestoredFromHistory:!!saved.metrics.transcriptStats,restoredFromHistory:true,savedAt:saved.savedAt};
  }

  async refreshQuota(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    if (!force && this.quota && Date.now() - this.quotaAt < 60000) return;
    if (this.quotaPending) return this.quotaPending;
    const epoch = this.epoch;
    this.quotaPending = (async () => {
      const user = await this.client.call('GetUserStatus');
      if (!this.owned() || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
      const email = user.userStatus?.email;
      const identity = email ? createHash('sha256').update(email).digest('hex') : null;
      if (identity !== this.identity) { this.background?.reset();this.delegated.reset();this.transcripts?.reset(); this.client.resetTrajectories?.(); this.quota = null; this.quotaAt = 0; this.accountCredits = null; this.tokenBase = null; this.tokenBaseAt = 0; this.tokenBaseFailedAt = 0; this.hostContextCache.clear(); this.hostContextFailedAt.clear(); this.sessions.clear(); this.summaries = []; this.summariesAt = 0;this.clearUsagePersistenceErrors(); }
      this.identity = identity;
      this.accountCredits = extractAccountCredits(user?.userStatus);
      const response = await this.client.call('RetrieveUserQuotaSummary',force?{forceRefresh:true}:{});
      if (!this.owned() || epoch !== this.epoch || identity !== this.identity) throw new Error('后台已重新连接，请等待刷新');
      this.quota = quotaMetrics(response);
      this.quotaAt = Date.now();
    })().finally(() => { this.quotaPending = null; });
    return this.quotaPending;
  }

  // Cached for 10 minutes; a failure retries at most every 15 seconds and
  // never propagates: composition simply renders without the exact figure.
  async refreshTokenBase() {
    if (this.tokenBase && Date.now() - this.tokenBaseAt < 10 * 60 * 1000) return this.tokenBase;
    if (this.tokenBasePending) return this.tokenBasePending;
    if (!this.tokenBase && Date.now() - this.tokenBaseFailedAt < 15000) return this.tokenBase;
    const epoch = this.epoch;
    this.tokenBasePending = (async () => {
      try {
        const value = tokenBaseMetrics(await this.client.call('GetTokenBase', {}));
        if (!this.owned() || epoch !== this.epoch) return this.tokenBase;
        if (value === null) { this.tokenBaseFailedAt = Date.now(); return this.tokenBase; }
        this.tokenBase = value; this.tokenBaseAt = Date.now(); this.tokenBaseFailedAt = 0;
        return value;
      } catch { if (this.owned() && epoch === this.epoch) this.tokenBaseFailedAt = Date.now(); return this.tokenBase; }
    })().finally(() => { this.tokenBasePending = null; });
    return this.tokenBasePending;
  }

  async refreshHostContext(conversationId, mark = '') {
    if (!GUID.test(conversationId || '') || typeof this.client.streamContextWindowUsage !== 'function') return null;
    const id = conversationId.toLowerCase();
    const cached = this.hostContextCache.get(id);
    if (cached && cached.mark === mark && Date.now() - cached.at < 10_000) return cached.value;
    if (this.hostContextPending.has(id)) return this.hostContextPending.get(id);
    const failedAt = this.hostContextFailedAt.get(id) || 0;
    if (!cached && Date.now() - failedAt < 15_000) return null;
    const epoch = this.epoch;
    const run = (async () => {
      try {
        const update = await this.client.streamContextWindowUsage(id);
        if (!this.owned() || epoch !== this.epoch) return cached?.value || null;
        const hostUsage = hostContextMetrics(update);
        if (!hostUsage) {
          this.hostContextFailedAt.set(id, Date.now());
          return cached?.value || null;
        }
        const creditUsage = extractCreditUsageSummary(update?.creditUsageSummary);
        const value = { hostUsage, creditUsage };
        this.hostContextCache.set(id, { value, mark, at: Date.now() });
        this.hostContextFailedAt.delete(id);
        return value;
      } catch {
        if (this.owned() && epoch === this.epoch) this.hostContextFailedAt.set(id, Date.now());
        return cached?.value || null;
      }
    })().finally(() => {
      if (this.hostContextPending.get(id) === run) this.hostContextPending.delete(id);
    });
    this.hostContextPending.set(id, run);
    return run;
  }

  async listConversations(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    const listTtlMs = this.summaries.length && this.summaries.every(s => settledStatus(s.status)) ? 15000 : 5000;
    if (!force && Date.now() - this.summariesAt < listTtlMs) return this.summaries;
    const scope = this.identity, epoch = this.epoch;
    const response = await this.client.call('GetAllCascadeTrajectories',{excludeSubtrajectories:false});
    if (!this.owned() || scope !== this.identity || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
    this.client.reader?.ingestSummaries?.(response.trajectorySummaries);
    this.summaries = Object.entries(response.trajectorySummaries || {}).map(([id, value]) => ({
      id, title: value.summary || '未命名会话', modifiedAt: value.lastModifiedTime, status: value.status,stepCount:value.stepCount,lastUserInputStepIndex:value.lastUserInputStepIndex,
    })).sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    this.summariesAt = Date.now();
    return this.summaries;
  }

  async acceptBackground(scope,id,result,{database,revision,isCurrent}) {
    const entry=this.sessions.get(id),epoch=this.epoch,identity=this.identity;
    const current=()=>isCurrent()&&this.owned()&&scope===this.storageScope(identity)&&identity===this.identity&&epoch===this.epoch&&this.sessions.get(id)===entry;
    if(!entry||!current())return;
    const fresh=safeMetrics(result.metrics,id);
    fresh.delegatedConversations=[...new Set([...(result.delegatedIds||[]),...(entry.data?.delegatedConversations||[])])].filter(x=>GUID.test(x)).slice(0,128);
    // A large parent snapshot does not verify its descendants. Display the
    // new root alone, never an old root/subagent aggregate as current. Keep
    // the previous verified aggregate separately for recovery, not arithmetic.
    const previousTask=safeTaskUsage(entry.data?.previousTaskUsage)||safeTaskUsage(entry.data?.taskUsage);
    if(previousTask)fresh.previousTaskUsage=previousTask;
    if(fresh.delegatedConversations.length||result.delegatedTruncated){
      fresh.taskUsage={tokens:{...fresh.tokens,outputAvailable:fresh.tokens.outputRequests>0,complete:false},cache:{...fresh.cache,complete:false},ownTokens:fresh.tokens.totalTokens,subagentTokens:0,subagents:Math.max(1,fresh.delegatedConversations.length),loadedSubagents:0,state:'partial',complete:false};
    }
    if(this.onBackgroundResult){
      try{await this.onBackgroundResult(scope,id,database,{isCurrent:current});if(current()){this.setUsagePersistenceError('background:'+id,false);entry.backgroundUsageComplete=true;}}
      catch(error){if(current()){this.setUsagePersistenceError('background:'+id,true);entry.backgroundUsageComplete=false;throw error;}return;}
    }
    if(!current())return;
    entry.data={...reconcileMetrics(entry.data,fresh,entry.savedAt||null),...(previousTask?{previousTaskUsage:previousTask}:{}),conversationId:id};entry.collection=null;entry.backgroundRevision=revision;entry.backgroundCheckedAt=Date.now();entry.backgroundCompletedAt=Date.now();entry.backgroundReady=true;entry.updatedAt=Date.now();entry.lastSuccessAt=new Date().toISOString();
    try{const saved=await this.history.save(scope,id,entry.data,{isCurrent:current});if(saved&&current())entry.savedAt=saved.savedAt;}catch{if(current())this.persistenceError='统计暂时无法保存到本地';}
  }
  startBackground(scope,id,entry,current){
    const started=this.background?.request(scope,id,this.client.server||this.client.reader?.endpoint,{summary:this.client.reader?.summaries?.[id],isCurrent:current});
    if(started){entry.backgroundOnly=true;entry.backgroundReady=false;}
    return started;
  }
  async session(id, force = false) {
    if (!GUID.test(id)) throw new Error('会话标识无效');
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    id=id.toLowerCase();
    const identity = this.identity, scope = this.storageScope(identity), epoch = this.epoch;
    let entry = this.sessions.get(id);
    if (entry?.pending) return entry.pending;
    if (!force && entry?.data && Date.now() - entry.updatedAt < 1800) return entry.data;
    entry ||= {};
    this.sessions.set(id, entry);
    const current = () => this.owned() && identity === this.identity && epoch === this.epoch && this.sessions.get(id) === entry;
    entry.pending = (async () => {
      if (!entry.data) {
        const saved = await this.history.load(scope,id);
        if (!current()) throw new Error('后台已重新连接，请等待刷新');
        if (saved) { entry.data = saved.metrics; entry.savedAt = saved.savedAt; entry.lastSuccessAt=saved.savedAt; }
      }
      if(entry.backgroundOnly&&this.background){
        const state=this.background.state(id);
        if(state?.state==='processing')return entry.data||null;
        if(entry.backgroundReady){
          // Host summaries can stay unchanged while final token/timing metadata
          // arrives. Revalidate slowly, with a shorter manual cooldown, rather
          // than returning an indefinitely frozen result or scanning each poll.
          const age=Date.now()-(entry.backgroundCompletedAt||0);
          if(force&&age<BACKGROUND_MANUAL_COOLDOWN_MS)return entry.data;
          if(!force&&Date.now()-entry.backgroundCheckedAt<30000)return entry.data;
          const summary=await this.client.reader.summary(id,null,force,12000);if(!current())throw Error('后台已重新连接，请等待刷新');
          entry.backgroundCheckedAt=Date.now();const revision=JSON.stringify([summary.stepCount??null,summary.lastModifiedTime??null,summary.status??null,summary.lastUserInputStepIndex??null]);
          if(revision===entry.backgroundRevision&&age<(force?BACKGROUND_MANUAL_COOLDOWN_MS:BACKGROUND_RECHECK_MS))return entry.data;
        }
        this.startBackground(scope,id,entry,current);return entry.data||null;
      }
      const isSettled=Boolean(entry.data?.status&&settledStatus(entry.data.status)&&(!entry.data.taskUsage||entry.data.taskUsage.state==='ready'));
      const raw = await this.client.trajectory(id,{force,isCurrent:current,summaryTtlMs:isSettled?12000:1800});
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      if(this.onTrajectory){try{const result=await this.onTrajectory(scope,id,raw,{isCurrent:current,guardKey:entry});if(current()&&result?.deferred!==true)this.setUsagePersistenceError('foreground:'+id,false);}catch{if(current())this.setUsagePersistenceError('foreground:'+id,true);}}
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      entry.collection=null;entry.lastSuccessAt=new Date().toISOString();
      const fresh = trajectoryMetrics(raw);
      fresh.delegatedConversations=[...new Set([...delegatedIds(id,raw,this.client.reader?.summaries||{}),...(entry.data?.delegatedConversations||[])])].slice(0,128);
      fresh.taskUsage=this.delegated.request(scope,id,raw,{saved:entry.data?.taskUsage,knownIds:fresh.delegatedConversations,force,isCurrent:current});
      // Optional background I/O cannot delay or fail the core metrics request.
      try { if(this.transcripts)fresh.transcriptStats=this.transcripts.request(scope,id,raw); } catch {}
      // Composition is pure arithmetic over already-collected statistics; the
      // exact customization figure is attached lazily in snapshot().
      fresh.contextComposition=compositionMetrics({context:fresh.context,steps:raw.trajectory?.steps,generators:raw.trajectory?.generatorMetadata,transcript:fresh.transcriptStats});
      entry.data = {...reconcileMetrics(entry.data,fresh,entry.savedAt || null),conversationId:id}; entry.updatedAt = Date.now();
      try { const saved = await this.history.save(scope,id,entry.data,{isCurrent:current}); if (saved&&current()) entry.savedAt = saved.savedAt; if (current()) this.persistenceError = null; }
      catch { if(current())this.persistenceError = '统计暂时无法保存到本地'; }
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      return entry.data;
    })().catch(error => {
      if(current()){
        entry.collection=collectionFailure(error);
        if(entry.collection&&entry.collection.kind!=='field')this.startBackground(scope,id,entry,current);
      }
      if (current() && usableMetrics(entry.data)) { entry.updatedAt = Date.now(); entry.data = {...entry.data,transcriptRestoredFromHistory:!!entry.data.transcriptStats,restoredFromHistory:true,savedAt:entry.savedAt || null}; return entry.data; }
      throw error;
    }).finally(() => { entry.pending = null; });
    return entry.pending;
  }

  async snapshot({ conversationId, force = false, quotaRefresh = false, selectLatest = true, contextDetail = false } = {}) {
    let connection = 'live', error = null, speed = null, sessionError = null, collection = null;
    try {
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      const server = await this.client.discover();
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      if (server.pid !== this.serverPid) {
        this.epoch++; this.background?.reset();this.delegated.reset();this.transcripts?.reset(); this.quota = null; this.quotaAt = 0; this.accountCredits = null; this.tokenBase = null; this.tokenBaseAt = 0; this.tokenBaseFailedAt = 0; this.hostContextCache.clear(); this.hostContextFailedAt.clear(); this.sessions.clear(); this.identity = null; this.summaries = []; this.summariesAt = 0; this.serverPid = server.pid;this.clearUsagePersistenceErrors();
      }
      try { await this.refreshQuota(force || quotaRefresh); }
      catch (e) { connection = this.quota ? 'stale' : 'offline'; error = e.message; }
      let summaries = this.summaries;
      // The inline composer already supplies its exact ID. Enumerating every
      // conversation first adds unrelated RPC latency to a route transition.
      // An unresolved inline composer must not read an unrelated recent chat.
      // Standalone panels retain their default automatic conversation selection.
      if (!conversationId && selectLatest !== false) {
        try { summaries = await this.listConversations(force); }
        catch (e) { connection = this.quota ? 'stale' : 'offline'; error ||= e.message; }
      }
      const selected = conversationId || (selectLatest !== false ? summaries[0]?.id : null);
      if (selected) {
        try { speed = await this.session(selected, force); }
        catch (e) { sessionError = e.message; }
        const entry=this.sessions.get(selected.toLowerCase());
        if(entry?.collection||this.background?.state(selected.toLowerCase()))collection={...entry?.collection,...this.background?.state(selected.toLowerCase()),freshness:usableMetrics(speed)?'saved':'unavailable',lastSuccessAt:entry.lastSuccessAt||null};
      }
    } catch (e) {
      connection = this.quota ? 'stale' : 'offline'; error = e.message;
      if (conversationId) speed = await this.cachedSession(conversationId);
    }
    if(!collection&&conversationId){
      const entry=this.sessions.get(conversationId.toLowerCase());
      if(entry?.collection||this.background?.state(conversationId.toLowerCase()))collection={...entry?.collection,...this.background?.state(conversationId.toLowerCase()),freshness:usableMetrics(speed)?'saved':'unavailable',lastSuccessAt:entry.lastSuccessAt||null};
    }
    // Only an explicit context-card request triggers GetTokenBase and
    // StreamAgentStateUpdates RPCs. Later polls reuse cached values smoothly.
    if (speed?.contextComposition) {
      const targetId = speed.conversationId || conversationId || null;
      const hostMark = `${speed.steps ?? ''}:${speed.requests ?? ''}:${speed.lastActiveAt ?? ''}`;
      if (contextDetail) {
        await Promise.allSettled([
          this.refreshTokenBase(),
          targetId ? this.refreshHostContext(targetId, hostMark) : Promise.resolve(null),
        ]);
      }
      let nextComposition = speed.contextComposition;
      if (this.tokenBase) nextComposition = attachTokenBase(nextComposition, this.tokenBase);
      if (targetId) {
        const cachedHost = this.hostContextCache.get(targetId.toLowerCase())?.value;
        if (cachedHost?.hostUsage) {
          nextComposition = attachHostContextUsage(nextComposition, cachedHost.hostUsage, cachedHost.creditUsage);
        }
      }
      if (nextComposition !== speed.contextComposition) speed = { ...speed, contextComposition: nextComposition };
    }
    if (speed?.model && speed?.tokens && !speed.estimatedCost) {
      const est = estimateModelsCost({
        [speed.model]: {
          uncached: speed.tokens.uncachedTokens ?? speed.counts?.input ?? 0,
          cacheRead: speed.tokens.cachedTokens ?? speed.counts?.cacheRead ?? 0,
          cacheWrite: speed.tokens.cacheWriteTokens ?? speed.counts?.cacheWrite ?? 0,
          output: speed.tokens.outputTokens ?? speed.counts?.output ?? 0,
        },
      });
      if (est.hasPriced) speed = { ...speed, estimatedCost: est };
    }
    return {
      connection, error, sessionError, collection, serverTime: new Date().toISOString(),
      quotaUpdatedAt: this.quotaAt ? new Date(this.quotaAt).toISOString() : null,
      groups: this.quota || [], accountCredits: this.accountCredits || null, speed, conversations: this.summaries,
      persistenceError: this.persistenceError,
      source: 'Antigravity local API',
    };
  }
  dispose(){this.disposed=true;this.background?.dispose();this.delegated.dispose();this.transcripts?.reset();this.hostContextCache.dispose();this.hostContextPending.clear();this.epoch++;}
}
