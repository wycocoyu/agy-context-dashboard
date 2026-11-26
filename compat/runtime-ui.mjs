// The plugin owns this adapter. App upgrades never need to preserve app.asar edits.
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { platformPaths } from './platform.mjs';
import { createHash } from 'node:crypto';
import { sanitizeRemoteHost, buildRendererTrajectoryProbe } from './remote-ssh.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A previous sidecar may outlive a desktop update. Use a distinct protocol
// binding so its older collector cannot answer the current widget's requests.
const BINDING = '__agPulseRuntimeCallV4';
const offline = message => ({ connection: 'offline', error: message, speed: null, groups: [] });
const MAX_OVERRIDE_BYTES = 262144;
const MAX_OVERRIDE_ENTRIES = 2000;
const MAX_OVERRIDE_KEY_LEN = 200;
const MAX_OVERRIDE_VAL_LEN = 400;
const UNSAFE_OVERRIDE_TEXT = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
const OVERRIDE_META_KEYS = new Set(['$schema', 'schema', 'license', 'locale', 'version', '_comment', 'patterns', 'exact']);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isUnsafeOverrideKey = key => /^(?:https?|wss?|file|vscode-[a-z0-9-]+|mailto|data|blob):/i.test(key)
  || /^(?:[a-zA-Z]:[\\/]|\\\\|~\/|\.\.?\/|\/[^\s])/.test(key)
  || /^[^\s]+\/[^\s]+$/.test(key)
  || /^[^\s]+\\[^\s]+$/.test(key);

export async function readHostI18nOverrides(files = []) {
  const merged = Object.create(null);
  let count = 0;
  for (const file of [...new Set((Array.isArray(files) ? files : []).filter(f => typeof f === 'string' && f))]) {
    let st;
    try { st = await lstat(file); } catch { continue; }
    if (st.isSymbolicLink() || !st.isFile() || st.size <= 0 || st.size > MAX_OVERRIDE_BYTES) continue;
    let parsed;
    try { parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch { continue; }
    if (!isPlainObject(parsed)) continue;
    const sources = [];
    if (isPlainObject(parsed.exact)) sources.push(parsed.exact);
    sources.push(parsed);
    for (const src of sources) {
      for (const [rawKey, rawVal] of Object.entries(src)) {
        if (count >= MAX_OVERRIDE_ENTRIES) break;
        if (src === parsed && OVERRIDE_META_KEYS.has(rawKey)) continue;
        if (typeof rawKey !== 'string') continue;
        const key = rawKey.trim();
        if (!key || key.length > MAX_OVERRIDE_KEY_LEN || UNSAFE_OVERRIDE_TEXT.test(key) || isUnsafeOverrideKey(key)) continue;
        const hadKey = Object.hasOwn(merged, key);
        if (rawVal === null || rawVal === false) {
          merged[key] = null;
          if (!hadKey) count++;
          continue;
        }
        if (typeof rawVal !== 'string') continue;
        const val = rawVal.trim();
        if (!val || val.length > MAX_OVERRIDE_VAL_LEN || UNSAFE_OVERRIDE_TEXT.test(val)) continue;
        merged[key] = val;
        if (!hadKey) count++;
      }
    }
  }
  const plain = {};
  for (const key of Object.keys(merged).sort()) plain[key] = merged[key];
  const hash = count > 0 ? createHash('sha256').update(JSON.stringify(plain)).digest('hex') : 'empty';
  return { overrides: plain, hash };
}

export function validTarget(target, port) {
  try {
    const page = new URL(target.url), ws = new URL(target.webSocketDebuggerUrl);
    return target.type === 'page' && ['http:', 'https:'].includes(page.protocol) && LOOPBACK.has(page.hostname)
      && ws.protocol === 'ws:' && LOOPBACK.has(ws.hostname) && Number(ws.port) === port;
  } catch { return false; }
}

export function validatedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metrics request');
  if (value.conversationId != null && !GUID.test(value.conversationId)) throw new Error('Invalid conversation ID');
  const result = { conversationId: value.conversationId || null, force: value.force === true };
  // Historical usage import is an explicit, user-visible action. It must not
  // be started by the high-frequency inline metrics poll.
  if (value.usageSync === true) result.usageSync = true;
  if (value.usageOnly === true) result.usageOnly = true;
  if (value.usageScope === 'local' || value.usageScope === 'account') result.usageScope = value.usageScope;
  if (value.quotaRefresh === true) result.quotaRefresh = true;
  // Context-card expansion lazily requests the customization token base.
  if (value.contextDetail === true) result.contextDetail = true;
  if (typeof value.composerModel === 'string') {
    const composerModel = value.composerModel.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (composerModel) result.composerModel = composerModel;
  }
  if (typeof value.remoteHost === 'string') {
    const remoteHost = sanitizeRemoteHost(value.remoteHost);
    if (remoteHost) result.remoteHost = remoteHost;
  }
  return result;
}

function jsonGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1048576) req.destroy(new Error('Discovery response too large')); });
      res.on('end', () => { try { if (res.statusCode !== 200) throw new Error('Renderer discovery unavailable'); resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('Renderer discovery timeout'))); req.end();
  });
}

export async function discoverTargets(profile) {
  const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
  if (text.length > 1024) throw new Error('Invalid renderer discovery file');
  const port = Number(text.split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid renderer port');
  const targets = await jsonGet(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('Invalid renderer discovery response');
  return targets.filter(target => validTarget(target, port));
}

export class CdpConnection {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 5000, onEvent = () => {}, onClose = () => {} } = {}) {
    this.url = url; this.WebSocketImpl = WebSocketImpl; this.timeout = timeout; this.onEvent = onEvent; this.onClose = onClose;
    this.pending = new Map(); this.nextId = 0; this.closed = false;
  }
  async open() {
    if (!this.WebSocketImpl) throw new Error('This Node runtime has no WebSocket support');
    this.ws = new this.WebSocketImpl(this.url);
    this.ws.addEventListener('message', event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 2097152) return;
        const message = JSON.parse(event.data);
        if (message.id) {
          const item = this.pending.get(message.id); if (!item) return;
          this.pending.delete(message.id); clearTimeout(item.timer);
          if (message.error) item.reject(new Error('Renderer command failed: ' + message.error.code)); else item.resolve(message.result || {});
        } else if (message.method) this.onEvent(message);
      } catch { /* Ignore unrelated/malformed renderer events, without logging page data. */ }
    });
    this.ws.addEventListener('close', () => this.disconnect());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('Renderer connection timeout')); }, this.timeout);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); this.close(); reject(new Error('Renderer connection failed')); }, { once: true });
    });
    return this;
  }
  command(method, params = {}) {
    if (this.closed || this.ws?.readyState !== 1) return Promise.reject(new Error('Renderer disconnected'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Renderer command timeout')); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Renderer disconnected')); }
    this.pending.clear(); this.onClose();
  }
  close() { this.disconnect(); this.ws?.close(); }
}

// Only sanitized metrics cross the bridge. No API credential or conversation text is exposed.
function rendererBridge(binding, allowNested = false) {
  if (window !== window.top && !allowNested) return;
  if (window.__agPulseRuntimeBridge && window.agPulseHost) return;
  window.__agPulseRuntimeBridge?.dispose();
  const pending = new Map(); let sequence = 0;
  const empty = () => ({ connection: 'offline', error: '等待 Antigrative Dashboard 重新连接', speed: null, groups: [], enabled: false });
  const call = (type, input) => new Promise(resolve => {
    if (pending.size >= 8) { resolve(empty()); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); resolve(empty()); }, 15000);
    pending.set(id, { resolve, timer });
    try { window[binding](JSON.stringify({ id, type, input })); } catch { clearTimeout(timer); pending.delete(id); resolve(empty()); }
  });
  window.__agPulseRuntimeBridge = {
    binding,
    resolve(id, result) { const item = pending.get(id); if (!item) return; clearTimeout(item.timer); pending.delete(id); item.resolve(result); },
    reconnect() { for(const item of pending.values()){clearTimeout(item.timer);item.resolve({connection:'offline',error:'等待 Antigrative Dashboard 重新连接',speed:null,groups:[]});}pending.clear(); },
    dispose() { for (const item of pending.values()) { clearTimeout(item.timer); item.resolve(empty()); } pending.clear(); delete window.__agPulseRuntimeBridge; },
  };
  if (!window.agPulseHost) window.agPulseHost = {
    getMetrics: input => call('metrics', input),
    updatePlugin: input => call('update', input),
    getPreferences: () => call('preferences', {}),
    setPreferences: input => call('preferences', input),
    getHostI18nOverrides: () => call('host-i18n', {}),
    compactChat: () => call('compact-chat', {}),
    report: input => { void call('diagnostic', input); },
  };
}

export function makeRendererSource(i18n, widget, theme = '', owner = null, generation = 0, extraSource = '', {allowNested = false} = {}) {
  const extract = source => {
    const prefix = 'module.exports = ', index = source.indexOf(prefix);
    if (index < 0) throw new Error('Widget source format changed');
    return source.slice(index + prefix.length).trim().replace(/;$/, '');
  };
  const version = createHash('sha256').update(i18n + widget + theme + extraSource + rendererBridge.toString()+JSON.stringify([owner,allowNested])).digest('hex');
  const upgrade = 'if(window.__agPulseRuntimeVersion!==' + JSON.stringify(version) + '){window.__agPulseDispose?.();window.__agPulseRuntimeBridge?.dispose();delete window.agPulseHost;window.__agPulseRuntimeVersion=' + JSON.stringify(version) + ';}';
  const binding=owner?BINDING+'_'+owner.replaceAll('-',''):BINDING;
  const rank=JSON.stringify([generation,owner||'']);
  const code=upgrade + 'window.__agPulseRuntimeOwner='+JSON.stringify(owner)+';window.__agPulseRuntimeRank='+rank+';window.__agPulseAllowNested='+JSON.stringify(allowNested===true)+';' + '(' + rendererBridge.toString() + ')('+JSON.stringify(binding)+','+JSON.stringify(allowNested===true)+');window.__agPulseI18nFactory=(' + extract(i18n) + ');'
    + (theme ? 'window.__agPulseThemeFactory=(' + extract(theme) + ');' : '') + extraSource + '(' + extract(widget) + ')();';
  // A delayed injection from a superseded instance cannot replace a newer UI.
  return owner?'if(!window.__agPulseRuntimeRank||window.__agPulseRuntimeRank[0]<'+generation+'||(window.__agPulseRuntimeRank[0]==='+generation+'&&window.__agPulseRuntimeRank[1]<='+JSON.stringify(owner)+')){'+code+'}':code;
}

const frameHref = frame => typeof frame?.url === 'string'
  ? (typeof frame.urlFragment === 'string' && frame.urlFragment && !frame.url.includes('#') ? frame.url + frame.urlFragment : frame.url)
  : '';

export class RuntimeUi {
  constructor({ snapshot, source, profile = platformPaths().profile,
    dataDir, preferences, overrideFiles = null, updater=null, owner=null, owns=async()=>true, enabled = async () => true, discover = discoverTargets, diagnoseError = null, onTargets = null, targetOrigin = target => new URL(target.url).origin, sourceForTarget = () => source, connect = (url, options) => new CdpConnection(url, options), interval = 3000, onMissingDebugPort = null } = {}) {
    this.snapshot = snapshot; this.source = source; this.profile = profile; this.dataDir = dataDir; this.enabled = enabled;
    this.discover = discover; this.diagnoseError = diagnoseError; this.onTargets = onTargets; this.connect = connect; this.interval = interval; this.sessions = new Map(); this.running = false;
    this.targetOrigin=targetOrigin;
    this.sourceForTarget=sourceForTarget;
    this.health = { state: 'waiting', mode: 'runtime', message: 'Waiting for the app renderer', windows: 0 };
    this.preferences=preferences;
    this.overrideFiles=overrideFiles;
    this.updater=updater;
    this.owner=owner;this.owns=owns;
    this.onMissingDebugPort=onMissingDebugPort;
    this.binding=owner?BINDING+'_'+owner.replaceAll('-',''):BINDING;
    this.rendererTheme={};
  }
  defaultOverrideFiles() {
    const files = [join(homedir(), '.antigravity-pulse', 'host-i18n-override.json')];
    if (typeof this.preferences?.file === 'string' && this.preferences.file) {
      files.push(join(dirname(this.preferences.file), 'host-i18n-override.json'));
    }
    return [...new Set(files)];
  }
  async pushPreferences(prefs, { exclude = null } = {}) {
    if (this.stopping || !prefs || typeof prefs !== 'object' || prefs.error || !await this.owns()) return;
    const expression = this.rendererGuard('window.__agPulseOnPreferences?.(' + JSON.stringify(prefs) + ');');
    for (const connection of this.sessions.values()) {
      if (connection === exclude || connection.closed || connection.revoked || !connection.contexts.size) continue;
      const contextId = connection.ideWebview ? [...connection.contexts][0] : undefined;
      try {
        await connection.command('Runtime.evaluate', { expression, ...(contextId === undefined ? {} : { contextId }) });
      } catch { /* Best-effort immediate push; polling resynchronizes on recovery. */ }
    }
  }
  async setHealth(state, message, extra = {}) {
    const allowed = {};
    for (const key of ['reason', 'hostVersion', 'launchConfigured']) if (extra && extra[key] !== undefined) allowed[key] = extra[key];
    this.health = { state, mode: 'runtime', ...allowed, message, windows: this.sessions.size, checkedAt: new Date().toISOString() };
    if (this.dataDir&&await this.owns()) { try { await mkdir(this.dataDir, { recursive: true }); await writeFile(join(this.dataDir, 'integration-state.json'), JSON.stringify(this.health)); } catch { /* Read-only state reporting must not crash collection. */ } }
  }
  async event(connection, message) {
    if(this.stopping)return;
    const p = message.params || {};
    if(connection.closed)return;
    // Revoke synchronously in protocol event order. An asynchronous ownership
    // read must never let an old binding overtake a navigation notification.
    if(connection.ideWebview&&((message.method==='Page.frameNavigated'&&(p.frame?.id===connection.frameId||p.frame?.parentId===connection.parentFrameId))||
      (message.method==='Page.navigatedWithinDocument'&&p.frameId===connection.frameId)||
      (message.method==='Page.frameDetached'&&p.frameId===connection.frameId)||message.method==='Runtime.executionContextsCleared'||
      (message.method==='Runtime.executionContextDestroyed'&&connection.contexts.has(p.executionContextId)))){
      connection.revoked=true;connection.generation++;
      for(const id of connection.contexts)connection.retiredContexts.add(id);
      connection.contexts.clear();connection.mounted=false;return;
    }
    if(connection.revoked)return;
    if(message.method==='Page.frameNavigated'&&p.frame&&!p.frame.parentId){
      const replaced=connection.frameId!==p.frame.id;
      connection.generation++;
      connection.frameId=p.frame.id;connection.contexts.clear();connection.mounted=false;
      const trusted=p.frame.url===connection.origin||p.frame.url?.startsWith(connection.origin+'/');
      // With an unchanged frame ID, prior document contexts may not yet have
      // emitted their destruction events. Replay them on the next heartbeat.
      if(replaced&&trusted)for(const [id,context]of connection.contextCandidates)if(context.frameId===connection.frameId&&context.origin===connection.origin)connection.contexts.add(id);
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      if(p.context?.auxData?.isDefault){
        connection.contextCandidates.set(p.context.id,{frameId:p.context.auxData.frameId,origin:p.context.origin});
        if(connection.contextCandidates.size>32)connection.contextCandidates.delete(connection.contextCandidates.keys().next().value);
        if(p.context.auxData.frameId===connection.frameId&&p.context.origin===connection.origin)connection.contexts.add(p.context.id);
      }
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') { connection.generation++;connection.contexts.clear();connection.contextCandidates.clear();connection.mounted=false;return; }
    if (message.method === 'Runtime.executionContextDestroyed') { if(connection.contexts.has(p.executionContextId))connection.generation++;connection.contexts.delete(p.executionContextId);connection.contextCandidates.delete(p.executionContextId);return; }
    if (message.method !== 'Runtime.bindingCalled' || p.name !== this.binding || !connection.contexts.has(p.executionContextId)) return;
    if(!await this.owns()||connection.closed||connection.revoked||!connection.contexts.has(p.executionContextId))return;
    if (typeof p.payload !== 'string' || p.payload.length > 4096 || connection.inflight >= 8) return;
    let input;
    try { input = JSON.parse(p.payload); if (!Number.isSafeInteger(input.id) || input.id < 1) return; } catch { return; }
    const generation=connection.generation;
    const current=()=>!connection.closed&&!connection.revoked&&connection.generation===generation&&connection.contexts.has(p.executionContextId);
    connection.inflight++;
    try {
      let result = {};
      if (input.type === 'metrics') {
        if (await this.enabled()) {
          const metricsInput = validatedInput(input.input);
          if (metricsInput.remoteHost && metricsInput.conversationId) {
            metricsInput.fetchRemoteTrajectory = cid => this.fetchRendererTrajectory(connection, cid, p.executionContextId);
          }
          result = await this.snapshot(metricsInput);
        } else {
          result = { ...offline('Antigrative Dashboard 已停用'), enabled: false };
        }
      }
      else if(input.type==='update'&&this.updater){
        if(!await this.enabled())throw Error('Plugin disabled');
        result=await this.updater.request(input.input);
      }
      else if (input.type === 'preferences' && this.preferences) {
        const value=input.input;
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['language','languageGuideDismissed','usageGuideDismissed','speedStyle','quotaDisplay','usageScope','autoRelaunchDebug','hostUiLocalization','inlineCacheHit','cacheChipMode','barColors','themeMode','cacheHitTone','cacheHitTiers','barOrder','barHidden','contextChipMode','stripMode','barPlacement','turnFooter'].includes(key)))throw new Error('Invalid preferences request');
        result=Object.keys(value).length?await this.preferences.set(value):await this.preferences.get();
        if(Object.keys(value).length&&result&&!result.error)void this.pushPreferences(result,{exclude:connection});
      }
      else if (input.type === 'host-i18n') {
        result = await this.enabled()
          ? await readHostI18nOverrides(this.overrideFiles ?? this.defaultOverrideFiles())
          : { overrides: {}, hash: 'disabled' };
      }
      else if (input.type === 'compact-chat') {
        await connection.command('Input.insertText', { text: '/compact' });
        await new Promise(r => setTimeout(r, 120));
        await connection.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        await connection.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        await new Promise(r => setTimeout(r, 80));
        const sent = await connection.command('Runtime.evaluate', {
          expression: `(() => {
            const btn = Array.from(document.querySelectorAll('[data-testid="send-button"],[data-tooltip-id*="send-button"]')).find(b => !b.disabled && b.getAttribute('data-tooltip-id') !== 'input-send-button-record-tooltip');
            if (btn) { btn.click(); return true; }
            return false;
          })()`,
          returnByValue: true,
        });
        if (!sent?.result?.value) {
          await connection.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          await connection.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        }
        result = { ok: true };
      }
      else if (input.type === 'diagnostic' && ['boot', 'mounted', 'mount-error'].includes(input.input?.stage)) {
        if (input.input.stage === 'mounted' && input.input.editorFound && input.input.composerFound) connection.mounted = true;
      } else return;
      if (JSON.stringify(result).length > 1048576) result = offline('Metrics response too large');
      if(this.stopping||!await this.owns()||!current())return;
      await connection.command('Runtime.evaluate', { expression: this.rendererGuard('window.__agPulseRuntimeBridge?.resolve(' + input.id + ',' + JSON.stringify(result) + ')'), contextId: p.executionContextId });
    } catch {
      const failure=input.type==='preferences'?{error:'Language preference could not be saved or read'}:offline('等待 Antigrative Dashboard 重新连接');
      if(this.stopping||!await this.owns()||!current())return;
      try { await connection.command('Runtime.evaluate', { expression: this.rendererGuard('window.__agPulseRuntimeBridge?.resolve(' + input.id + ',' + JSON.stringify(failure) + ')'), contextId: p.executionContextId }); } catch { /* The next poll reconnects. */ }
    } finally { connection.inflight--; }
  }
  rendererGuard(expression){return this.owner?'if(window.__agPulseRuntimeOwner==='+JSON.stringify(this.owner)+'){'+expression+'}':expression;}
  async fetchRendererTrajectory(connection, conversationId, contextId = undefined) {
    if (!connection || connection.closed || connection.revoked || !conversationId) return null;
    try {
      const res = await connection.command('Runtime.evaluate', {
        expression: buildRendererTrajectoryProbe(conversationId),
        awaitPromise: true,
        returnByValue: true,
        ...(contextId === undefined ? {} : { contextId }),
      });
      if (res?.exceptionDetails) return null;
      return res?.result?.value || null;
    } catch {
      return null;
    }
  }
  async attach(target) {
    let connection;
    connection = this.connect(target.webSocketDebuggerUrl, { onEvent: message => { void this.event(connection, message); } });
    connection.origin = this.targetOrigin(target);
    connection.ideWebview=target.ideWebview===true;
    connection.parentFrameId=target.expectedParentId;
    connection.proofKey=target.ideWebview?JSON.stringify([target.expectedFrameId,target.expectedParentId,target.expectedUrl,target.workbenchId]):null;
    connection.generation=0;connection.revoked=false;
    connection.retiredContexts=new Set();
    connection.contexts = new Set();connection.contextCandidates=new Map(); connection.inflight = 0; connection.mounted = false;
    try {
      await connection.open();
      if(this.stopping||!await this.owns())throw new Error('Sidecar ownership changed');
      const frame = await connection.command('Page.getFrameTree'); connection.frameId = frame.frameTree?.frame?.id;
      if (!connection.frameId) throw new Error('Main renderer frame unavailable');
      if(connection.ideWebview&&(connection.frameId!==target.expectedFrameId||frameHref(frame.frameTree.frame)!==target.expectedUrl||
        frame.frameTree.frame.parentId!==target.expectedParentId))throw new Error('IDE Agent frame changed during discovery');
      await connection.command('Page.enable');
      await connection.command('Runtime.enable');
      if(connection.ideWebview&&(connection.revoked||connection.closed))throw new Error('IDE Agent context changed during attachment');
      await connection.command('Runtime.addBinding', { name: this.binding });
      connection.target=target;
      const rawSource=this.sourceForTarget(target);
      connection.rawSource=rawSource;
      const guardedSource=this.buildGuardedSource(connection,rawSource);
      connection.guardedSource = guardedSource;
      // Nested Agent documents receive no persistent preload. Every replacement
      // must pass IDE ownership/resource/frame validation again.
      if(!connection.ideWebview)connection.script = (await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: guardedSource })).identifier;
      if(this.stopping||!await this.owns()){await connection.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.script});throw new Error('Sidecar ownership changed');}
      if(connection.ideWebview&&(connection.revoked||connection.closed||!connection.contexts.size))throw new Error('IDE Agent context changed during attachment');
      const result = await connection.command('Runtime.evaluate', { expression: guardedSource });
      if (result.exceptionDetails) throw new Error('Widget initialization failed');
      return connection;
    } catch (error) {
      // CDP preloads outlive the socket; failed/aborted attachment must remove
      // its own script so it cannot run again after a later page navigation.
      try{if(connection.script)await connection.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.script});}catch{}
      try{if(this.owner)await connection.command('Runtime.removeBinding',{name:this.binding});}catch{}
      connection.close();throw error;
    }
  }
  buildGuardedSource(connection, rawSource) {
    return 'if (location.origin === ' + JSON.stringify(connection.origin) +
      (connection.ideWebview?' && location.href === '+JSON.stringify(connection.target?.expectedUrl):'') + ') {' + rawSource + '}';
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if(!await this.owns()){await this.detachAll();return;}
      if (!await this.enabled()) { await this.detachAll(); await this.setHealth('disabled', 'Dashboard is disabled'); return; }
      const targets = await this.discover(this.profile), active = new Set(targets.map(t => t.webSocketDebuggerUrl));
      this.onTargets?.(targets);
      if (this.stopping||!await this.owns()) return;
      for (const [url, connection] of this.sessions) if (!active.has(url) || connection.closed || connection.revoked) { await this.detach(connection); this.sessions.delete(url); }
      for (const target of targets) {
        const connection = this.sessions.get(target.webSocketDebuggerUrl);
        const proofKey=target.ideWebview?JSON.stringify([target.expectedFrameId,target.expectedParentId,target.expectedUrl,target.workbenchId]):null;
        if (connection && (connection.origin !== this.targetOrigin(target)||connection.proofKey!==proofKey)) { await this.detach(connection); this.sessions.delete(target.webSocketDebuggerUrl); }
      }
      for (const target of targets) if (!this.sessions.has(target.webSocketDebuggerUrl)) this.sessions.set(target.webSocketDebuggerUrl, await this.attach(target));
      if (this.stopping||!await this.owns()) { await this.detachAll(); return; }
      let sampledTheme={};
      for (const [url, connection] of this.sessions) {
        try {
          // Cold-start navigation may replace the top frame or lose its context
          // events while hooks still exist. Resynchronize on the same socket.
          if(!connection.contexts.size){
            if(connection.ideWebview)throw new Error('IDE Agent execution context unavailable');
            const frame=await connection.command('Page.getFrameTree');connection.frameId=frame.frameTree?.frame?.id;
            connection.contextCandidates.clear();
            await connection.command('Runtime.disable');await connection.command('Runtime.enable');
            // Runtime.disable also removes binding subscriptions. Restore the
            // data channel and release old calls before normal polling resumes.
            await connection.command('Runtime.addBinding',{name:this.binding});
            await connection.command('Runtime.evaluate',{expression:this.rendererGuard('window.__agPulseRuntimeBridge?.reconnect?.();')});
          }
          const result = await connection.command('Runtime.evaluate', { returnByValue: true,
            expression: '(()=>{const mounted=Boolean(document.getElementById("ag-pulse-status-bar")?.isConnected),installed=Boolean(window.__agPulseInlineInstalled),bridge=Boolean(window.__agPulseRuntimeBridge && window.agPulseHost'+(this.owner?' && window.__agPulseRuntimeBridge.binding==='+JSON.stringify(this.binding):'')+');let fontFamily=null,monoFontFamily=null;try{const pick=(els,vars)=>{for(const el of els){if(!el)continue;for(const v of vars){const s=(el.style?.getPropertyValue?.(v)||getComputedStyle(el).getPropertyValue(v)||"").trim();if(s)return s;}}return null;};const base=[document.querySelector(\'[data-testid="model-selector-trigger"], .rounded-composer, .monaco-workbench\'),document.body,document.documentElement];fontFamily=pick(base,[\'--ui-font-family\',\'--font-sans\',\'--font-family\',\'--vscode-font-family\',\'--antigravity-font-family\']);if(!fontFamily){for(const el of base){if(!el||el.hasAttribute?.("data-ag-pulse-bar"))continue;const f=getComputedStyle(el).fontFamily;if(f){fontFamily=f;break;}}}monoFontFamily=pick(base,[\'--vscode-editor-font-family\',\'--font-mono\']);}catch{}return {mounted,installed,bridge,fontFamily,monoFontFamily};})()' });
          if(result.exceptionDetails)throw new Error('Renderer document is not ready');
          const status = result.result?.value;
          connection.mounted = status?.mounted === true;
          if(!connection.ideWebview&&(status?.fontFamily||status?.monoFontFamily))sampledTheme={fontFamily:status.fontFamily||undefined,monoFontFamily:status.monoFontFamily||undefined};
          else if(!sampledTheme.fontFamily&&!sampledTheme.monoFontFamily&&(status?.fontFamily||status?.monoFontFamily))sampledTheme={fontFamily:status.fontFamily||undefined,monoFontFamily:status.monoFontFamily||undefined};
          let hotUpdated=false;
          const nextRaw=this.sourceForTarget(connection.target||{url:connection.origin});
          if(nextRaw&&nextRaw!==connection.rawSource){
            if(!await this.owns())break;
            const nextGuarded=this.buildGuardedSource(connection,nextRaw);
            if(!connection.ideWebview){
              if(connection.script)try{await connection.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.script});}catch{}
              connection.script=(await connection.command('Page.addScriptToEvaluateOnNewDocument',{source:nextGuarded})).identifier;
            }
            connection.rawSource=nextRaw;connection.guardedSource=nextGuarded;
            const upgraded=await connection.command('Runtime.evaluate',{expression:nextGuarded});
            if(upgraded.exceptionDetails)throw new Error('Widget hot-reload failed');
            hotUpdated=true;
          }
          // Startup can swap the document between discovery and first injection.
          // Reinstall missing hooks rather than waiting forever for a composer.
          if (!hotUpdated && status && (!status.installed || !status.bridge)) {
            if(!await this.owns())break;
            const recovery = await connection.command('Runtime.evaluate', { expression: connection.guardedSource });
            if (recovery.exceptionDetails) throw new Error('Widget recovery failed');
          }
        } catch {
          // Navigation failures must not accumulate a preload on each retry.
          try{if(connection.script)await connection.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.script});}catch{}
          await this.detach(connection);this.sessions.delete(url);
        }
      }
      this.rendererTheme={};
      for(const k of ['fontFamily','monoFontFamily']){
        const v=typeof sampledTheme[k]==='string'?sampledTheme[k].trim():'';
        if(v&&v.length<=240&&!/[;{}<>\\/\n\r\0]|url\s*\(|var\s*\(|expression\s*\(|javascript:|@import/i.test(v))this.rendererTheme[k]=v;
      }
      const mounted=[...this.sessions.values()].some(c=>c.mounted);
      this.nextTickAt=0;
      await this.setHealth(mounted ? 'mounted' : this.sessions.size ? 'waiting-for-composer' : 'waiting',
        mounted ? 'Dashboard attached to the conversation composer' : this.sessions.size ? 'Renderer connected; waiting for a conversation composer if needed' : 'Waiting for the app renderer');
    } catch (error) {
      const missingDebugPort = error?.code === 'ENOENT';
      let state = 'reconnecting';
      let message = missingDebugPort
        ? 'Antigravity debug port unavailable; relaunch with remote debugging enabled or use the side panel.'
        : 'Inline connection unavailable; the side panel remains available. Retrying automatically.';
      let extra = missingDebugPort ? { reason: 'missing-debug-port' } : {};
      if (this.diagnoseError) {
        try {
          const detail = await this.diagnoseError(error);
          if (detail && typeof detail === 'object') {
            if (typeof detail.state === 'string' && detail.state) state = detail.state;
            if (typeof detail.message === 'string' && detail.message) message = detail.message;
            extra = detail;
          }
        } catch {}
      }
      this.nextTickAt = state === 'unavailable' ? Date.now() + Math.max(this.interval, 60000) : 0;
      await this.setHealth(state, message, extra);
      if ((missingDebugPort || extra?.reason === 'missing-debug-port' || extra?.reason === 'debug-port-disabled') && state !== 'unavailable' && !this.stopping && await this.owns()) {
        try { await this.onMissingDebugPort?.(extra); } catch { /* Missing-port callback must not crash collection. */ }
      }
    }
    finally { this.busy = false; }
  }
  async detach(connection) {
    // Retired contexts remain cleanup-only: a same-document route change can
    // leave timers and pending bridge calls alive after authorization is revoked.
    const owned=await this.owns();
    if(owned){
      const ids=connection.ideWebview?[...new Set([...connection.contexts,...connection.retiredContexts])]:[undefined];
      for(const contextId of ids)try{
        await connection.command('Runtime.evaluate',{expression:this.rendererGuard('window.__agPulseDispose?.();window.__agPulseRuntimeBridge?.dispose();delete window.agPulseHost;'),...(contextId===undefined?{}:{contextId})});
      }catch{/* Destroyed contexts need no cleanup; still remove the preload/binding. */}
    }
    try{if(connection.script)await connection.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.script});}catch{}
    try{if(this.owner||owned)await connection.command('Runtime.removeBinding',{name:this.binding});}catch{}
    connection.close();
  }
  async detachAll() {
    for (const connection of this.sessions.values()) await this.detach(connection);
    this.sessions.clear();this.rendererTheme={};
  }
  start() {
    if (this.running) return; this.running = true; this.stopping = false; this.nextTickAt = 0;
    void this.tick(); this.timer = setInterval(() => { if (this.nextTickAt && Date.now() < this.nextTickAt) return; void this.tick(); }, this.interval); this.timer.unref?.();
  }
  async stop() { this.running = false; this.stopping = true; clearInterval(this.timer); await this.detachAll(); }
}
