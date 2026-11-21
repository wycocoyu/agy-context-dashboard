import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreferencesStore, validateHostUiLocalization } from '../../../compat/preferences.mjs';
import { RuntimeUi, readHostI18nOverrides, makeRendererSource } from '../../../compat/runtime-ui.mjs';

const require = createRequire(import.meta.url);
const createHostI18n = require('../../../compat/host-i18n.cjs');
const createDashboardI18n = require('../../../compat/i18n.cjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const builtinDict = JSON.parse(await readFile(join(ROOT, 'compat', 'host-i18n-dict.json'), 'utf8'));

// Lightweight zero-dependency DOM + MutationObserver test harness for Node unit tests.
function createTestDom({ top = true } = {}) {
  const observers = new Set();
  const emitMutation = record => {
    for (const obs of observers) {
      if (!obs.target) continue;
      if (obs.options.subtree ? obs.target.contains(record.target) : obs.target === record.target) {
        if (record.type === 'attributes' && Array.isArray(obs.options.attributeFilter) && !obs.options.attributeFilter.includes(record.attributeName)) continue;
        obs.queue.push(record);
      }
    }
  };

  class TestNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentNode = null;
      this.parentElement = null;
      this.childNodes = [];
    }
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) if (cur === this) return true;
      return false;
    }
  }

  class TestText extends TestNode {
    constructor(text = '') {
      super(3);
      this._value = String(text);
    }
    get nodeValue() { return this._value; }
    set nodeValue(val) {
      const next = String(val);
      const prev = this._value;
      this._value = next;
      emitMutation({ type: 'characterData', target: this, oldValue: prev });
    }
    get textContent() { return this._value; }
    set textContent(val) { this.nodeValue = val; }
  }

  function matchSimple(el, sel) {
    let rest = sel.trim();
    if (!rest) return false;
    const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
    if (tagMatch) {
      if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }
    while (rest.length) {
      if (rest[0] === '#') {
        const m = rest.match(/^#([\w-]+)/);
        if (!m || el.getAttribute('id') !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '.') {
        const m = rest.match(/^\.([\w-]+)/);
        if (!m || !el.classList.has(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const end = rest.indexOf(']');
        if (end < 0) return false;
        const inner = rest.slice(1, end);
        rest = rest.slice(end + 1);
        const eq = inner.match(/^([\w-]+)(?:\s*([*^$]?=)\s*(?:"([^"]*)"|'([^']*)'))?$/);
        if (!eq) return false;
        const [, attr, op, dq, sq] = eq;
        const val = dq ?? sq ?? '';
        const actual = el.getAttribute(attr);
        if (!op) { if (actual === null) return false; }
        else if (op === '=') { if (actual !== val) return false; }
        else if (op === '^=') { if (actual === null || !actual.startsWith(val)) return false; }
        else if (op === '*=') { if (actual === null || !actual.includes(val)) return false; }
      } else return false;
    }
    return true;
  }

  function matchSingleSelector(el, selector) {
    const parts = selector.trim().split(/\s+/);
    if (!matchSimple(el, parts[parts.length - 1])) return false;
    let cur = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !matchSimple(cur, parts[i])) cur = cur.parentElement;
      if (!cur) return false;
      cur = cur.parentElement;
    }
    return true;
  }

  class TestElement extends TestNode {
    constructor(tagName) {
      super(1);
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map();
    }
    get classList() {
      const raw = this.attributes.get('class') || '';
      return new Set(raw.split(/\s+/).filter(Boolean));
    }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get id() { return this.getAttribute('id') || ''; }
    set id(val) { this.setAttribute('id', val); }
    get className() { return this.getAttribute('class') || ''; }
    set className(val) { this.setAttribute('class', val); }
    get isContentEditable() {
      for (let cur = this; cur; cur = cur.parentElement) {
        if (cur.hasAttribute('contenteditable')) {
          const val = String(cur.getAttribute('contenteditable') || '').toLowerCase();
          if (val === 'false') return false;
          if (val === '' || val === 'true' || val === 'plaintext-only') return true;
        }
      }
      return false;
    }
    get textContent() {
      return this.childNodes.map(c => c.textContent).join('');
    }
    set textContent(val) {
      this.childNodes = [];
      if (val !== '') this.append(new TestText(val));
    }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) {
      const next = String(value);
      const prev = this.getAttribute(name);
      this.attributes.set(name, next);
      emitMutation({ type: 'attributes', target: this, attributeName: name, oldValue: prev });
    }
    append(...nodes) {
      const added = [];
      for (const n of nodes) {
        const node = typeof n === 'string' ? new TestText(n) : n;
        node.parentNode = this;
        node.parentElement = this;
        this.childNodes.push(node);
        added.push(node);
      }
      emitMutation({ type: 'childList', target: this, addedNodes: added });
    }
    matches(selectorList) {
      return selectorList.split(',').some(sel => matchSingleSelector(this, sel));
    }
    closest(selectorList) {
      for (let cur = this; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (cur.matches(selectorList)) return cur;
      }
      return null;
    }
  }

  class TestMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = {};
      this.queue = [];
    }
    observe(target, options = {}) {
      this.target = target;
      this.options = options;
      observers.add(this);
    }
    takeRecords() {
      const out = this.queue.slice();
      this.queue.length = 0;
      return out;
    }
    disconnect() {
      this.target = null;
      this.queue.length = 0;
      observers.delete(this);
    }
    flush() {
      if (!this.queue.length) return 0;
      const records = this.takeRecords();
      this.callback(records, this);
      return records.length;
    }
  }

  const NodeFilterConst = { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
  const doc = {
    body: new TestElement('body'),
    documentElement: new TestElement('html'),
    createElement(tag) { return new TestElement(tag); },
    createTextNode(text) { return new TestText(text); },
    createTreeWalker(root, whatToShow, filter) {
      const nodes = [];
      const walk = el => {
        for (const child of el.children) {
          if ((whatToShow & NodeFilterConst.SHOW_ELEMENT) === 0) continue;
          const verdict = filter?.acceptNode ? filter.acceptNode(child) : NodeFilterConst.FILTER_ACCEPT;
          if (verdict === NodeFilterConst.FILTER_REJECT) continue;
          if (verdict === NodeFilterConst.FILTER_ACCEPT) nodes.push(child);
          walk(child);
        }
      };
      walk(root);
      let index = -1;
      return {
        nextNode() {
          index++;
          return index < nodes.length ? nodes[index] : null;
        },
      };
    },
  };
  doc.documentElement.append(doc.body);
  const win = { document: doc };
  win.top = top ? win : {};
  doc.defaultView = win;

  const flushObservers = () => {
    let total = 0;
    for (let pass = 0; pass < 5; pass++) {
      let passCount = 0;
      for (const obs of [...observers]) passCount += obs.flush();
      total += passCount;
      if (!passCount) break;
    }
    return total;
  };

  return { doc, win, MutationObserver: TestMutationObserver, NodeFilter: NodeFilterConst, observers, flushObservers };
}

test('default OFF performs zero DOM modifications and attaches no observer', () => {
  const dom = createTestDom();
  const btn = dom.doc.createElement('button');
  btn.setAttribute('aria-label', 'New Conversation');
  btn.setAttribute('title', 'Settings');
  btn.textContent = 'New Conversation';
  dom.doc.body.append(btn);

  let mutations = 0;
  const spy = new dom.MutationObserver(list => { mutations += list.length; });
  spy.observe(dom.doc.body, { childList: true, subtree: true, characterData: true, attributes: true });

  const ctrl = createHostI18n({
    dictionary: builtinDict,
    document: dom.doc,
    window: dom.win,
    MutationObserver: dom.MutationObserver,
    NodeFilter: dom.NodeFilter,
  });

  assert.equal(ctrl.enabled, false);
  assert.equal(btn.textContent, 'New Conversation');
  assert.equal(btn.getAttribute('aria-label'), 'New Conversation');
  assert.equal(btn.getAttribute('title'), 'Settings');
  assert.equal(dom.observers.size, 1, 'Only our test spy observer should exist when disabled');
  assert.equal(dom.flushObservers(), 0);
  assert.equal(mutations, 0);
  ctrl.dispose();
  spy.disconnect();
});

test('dictionary lookup handles exact labels, whitespace, dynamic step durations, and user override merge', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-host-i18n-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const overrideFile = join(dir, 'host-i18n-override.json');
  const symlinkFile = join(dir, 'symlink-override.json');
  const oversizedFile = join(dir, 'oversized-override.json');

  await writeFile(overrideFile, JSON.stringify({
    _comment: 'user custom terms',
    exact: {
      Settings: '全局设置',
      Files: null,
      'https://evil.example': 'blocked',
      'src/app.js': 'blocked',
      'bad\u0007control': 'blocked',
    },
    Automations: '自动任务',
    'Custom Valid Label': '自定义标签',
  }));
  await writeFile(oversizedFile, JSON.stringify({ Settings: 'x'.repeat(270000) }));
  try { await symlink(overrideFile, symlinkFile); } catch {}

  const { overrides, hash } = await readHostI18nOverrides([oversizedFile, symlinkFile, overrideFile, join(dir, 'missing.json')]);
  assert.notEqual(hash, 'empty');
  assert.equal(overrides.Settings, '全局设置');
  assert.equal(overrides.Files, null);
  assert.equal(overrides.Automations, '自动任务');
  assert.equal(overrides['Custom Valid Label'], '自定义标签');
  assert.equal(Object.hasOwn(overrides, 'https://evil.example'), false);
  assert.equal(Object.hasOwn(overrides, 'src/app.js'), false);
  assert.equal(Object.hasOwn(overrides, 'bad\u0007control'), false);

  const ctrl = createHostI18n({ dictionary: builtinDict, overrides });
  assert.equal(ctrl.translate('  New Conversation\n'), '  新建对话\n');
  assert.equal(ctrl.translate('Settings'), '全局设置');
  assert.equal(ctrl.translate('Automations'), '自动任务');
  assert.equal(ctrl.translate('Files'), null, 'null override suppresses built-in translation');
  assert.equal(ctrl.translate('Thought for <1s'), '思考了 <1s');
  assert.equal(ctrl.translate('Thought for 1m 20s'), '思考了 1m 20s');
  assert.equal(ctrl.translate('Worked for 8s'), '工作了 8s');
  assert.equal(ctrl.translate('Running for 12s'), '已运行 12s');
  assert.equal(ctrl.translate('Thought for a while about code'), null);
  assert.equal(ctrl.translate('Ask anything, @ to mention, / for actions'), '输入任何内容，@ 提及，/ 执行操作');
  assert.equal(ctrl.translate('Cancel', { attrName: 'aria-label' }), null, 'Host bug guard blocks aria-label Cancel');
  assert.equal(ctrl.translate('Cancel Task', { attrName: 'aria-label' }), '取消任务');
  assert.equal(ctrl.translate('/Users/mac/Settings'), null);
  assert.equal(ctrl.translate('C:\\Users\\mac\\Settings'), null);
  assert.equal(ctrl.translate('~/Settings'), null);
  assert.equal(ctrl.translate('package.json'), null);
});

test('strict exclusion guards protect code, monaco, terminals, chat prose, file pills, titles, widget DOM, forms, Cancel aria-label, and Teamwork frames', () => {
  const dom = createTestDom();
  const make = (tag, attrs = {}, text = '') => {
    const el = dom.doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text) el.textContent = text;
    return el;
  };

  // Safe UI chrome elements
  const safeNav = make('button', { 'aria-label': 'New Conversation', title: 'Settings' }, 'New Conversation');
  const safeCancelTask = make('button', { 'aria-label': 'Cancel Task' }, 'Cancel step');
  const cancelGuardBtn = make('button', { 'aria-label': 'Cancel', title: 'Close' }, 'Close');
  const sidebarRow = make('div', { 'data-testid': 'conversation-row-sidebar' });
  const convTitle = make('span', { class: 'truncate' }, 'Settings');
  const convStatus = make('span', { class: 'status-chip' }, 'In Progress');
  sidebarRow.append(convTitle, convStatus);

  // Excluded code / editor / terminal / markdown / file pill / model selector / widget / form / frame elements
  const codeBlock = make('pre', {}, ''); const codeInner = make('code', {}, 'Settings'); codeBlock.append(codeInner);
  const monaco = make('div', { class: 'monaco-editor' }); const monacoLine = make('div', { class: 'view-line' }, 'Files'); monaco.append(monacoLine);
  const xterm = make('div', { class: 'xterm' }, 'Terminal');
  const chatProse = make('div', { 'data-markdown-root': 'true' }); const chatP = make('p', {}, 'Overview'); chatProse.append(chatP);
  const userBubble = make('div', { 'data-testid': 'user-message-bubble' }, 'Allow');
  const filePill = make('span', { class: 'inline-pill', 'data-uri': 'file:///tmp/Settings' }, 'Settings');
  const fileTitle = make('span', { class: 'group/file-title' }, 'Review');
  const breadcrumb = make('span', { 'data-testid': 'breadcrumb-segment' }, 'Files');
  const modelBtn = make('button', { 'data-testid': 'model-selector-trigger', 'aria-label': 'Settings' }, 'Settings');
  const effortBtn = make('button', { 'data-effort': 'high' }, 'General');
  const pulseWidget = make('div', { 'data-pulse-widget': 'true', 'aria-label': 'Settings' }, 'Overview');
  const pulseBar = make('div', { id: 'ag-pulse-status-bar', 'aria-label': 'Refresh' }, 'Settings');
  const editorInput = make('div', { contenteditable: 'true', 'aria-label': 'Message input', placeholder: 'Ask anything, @ to mention, / for actions' }, 'Settings');
  const pastedInsideEditor = make('span', { title: 'Settings' }, 'Files');
  editorInput.append(pastedInsideEditor);
  const searchInput = make('input', { placeholder: 'Search Conversations', title: 'Search Conversations' }, 'Files');
  const textarea = make('textarea', { placeholder: 'Ask anything, @ to mention, / for actions' }, 'Settings');
  const teamworkFrame = make('iframe', { 'data-testid': 'teamwork-frame', title: 'Settings' }, 'Settings');
  const pathSpan = make('span', {}, '/Users/mac/Settings');

  dom.doc.body.append(
    safeNav, safeCancelTask, cancelGuardBtn, sidebarRow,
    codeBlock, monaco, xterm, chatProse, userBubble, filePill, fileTitle, breadcrumb,
    modelBtn, effortBtn, pulseWidget, pulseBar, editorInput, searchInput, textarea,
    teamworkFrame, pathSpan
  );

  const ctrl = createHostI18n({
    dictionary: builtinDict,
    overrides: { Cancel: '取消' }, // Must STILL NOT mutate aria-label="Cancel"
    document: dom.doc,
    window: dom.win,
    MutationObserver: dom.MutationObserver,
    NodeFilter: dom.NodeFilter,
    enabled: true,
  });

  // Safe chrome translated
  assert.equal(safeNav.textContent, '新建对话');
  assert.equal(safeNav.getAttribute('aria-label'), '新建对话');
  assert.equal(safeNav.getAttribute('title'), '设置');
  assert.equal(safeCancelTask.getAttribute('aria-label'), '取消任务');
  assert.equal(safeCancelTask.textContent, '取消步骤');
  assert.equal(convStatus.textContent, '进行中', 'Non-.truncate status chip in row translates');
  assert.equal(editorInput.getAttribute('aria-label'), '消息输入', 'Editor aria-label allowed');
  assert.equal(searchInput.getAttribute('placeholder'), '搜索对话', 'Input placeholder allowed');
  assert.equal(textarea.getAttribute('placeholder'), '输入任何内容，@ 提及，/ 执行操作');

  // Host bug guard
  assert.equal(cancelGuardBtn.getAttribute('aria-label'), 'Cancel', 'aria-label === Cancel MUST remain untouched');
  assert.equal(cancelGuardBtn.getAttribute('title'), '关闭');

  // Strict exclusions untouched
  assert.equal(convTitle.textContent, 'Settings');
  assert.equal(codeInner.textContent, 'Settings');
  assert.equal(monacoLine.textContent, 'Files');
  assert.equal(xterm.textContent, 'Terminal');
  assert.equal(chatP.textContent, 'Overview');
  assert.equal(userBubble.textContent, 'Allow');
  assert.equal(filePill.textContent, 'Settings');
  assert.equal(fileTitle.textContent, 'Review');
  assert.equal(breadcrumb.textContent, 'Files');
  assert.equal(modelBtn.textContent, 'Settings');
  assert.equal(modelBtn.getAttribute('aria-label'), 'Settings');
  assert.equal(effortBtn.textContent, 'General');
  assert.equal(pulseWidget.textContent, 'Overview');
  assert.equal(pulseWidget.getAttribute('aria-label'), 'Settings');
  assert.equal(pulseBar.textContent, 'Settings');
  assert.equal(pulseBar.getAttribute('aria-label'), 'Refresh');
  assert.equal(editorInput.childNodes[0].nodeValue, 'Settings', 'Contenteditable text untouched');
  assert.equal(pastedInsideEditor.getAttribute('title'), 'Settings', 'Descendants inside contenteditable untouched');
  assert.equal(pastedInsideEditor.textContent, 'Files');
  assert.equal(searchInput.childNodes[0].nodeValue, 'Files');
  assert.equal(textarea.childNodes[0].nodeValue, 'Settings');
  assert.equal(teamworkFrame.getAttribute('title'), 'Settings');
  assert.equal(teamworkFrame.textContent, 'Settings');
  assert.equal(pathSpan.textContent, '/Users/mac/Settings');

  // Nested iframe without allowNested must remain inert
  const nestedDom = createTestDom({ top: false });
  const nestedBtn = nestedDom.doc.createElement('button');
  nestedBtn.textContent = 'Settings';
  nestedDom.doc.body.append(nestedBtn);
  const nestedCtrl = createHostI18n({
    dictionary: builtinDict,
    document: nestedDom.doc,
    window: nestedDom.win,
    MutationObserver: nestedDom.MutationObserver,
    NodeFilter: nestedDom.NodeFilter,
    allowNested: false,
  });
  assert.equal(nestedCtrl.setEnabled(true), false);
  assert.equal(nestedBtn.textContent, 'Settings');

  ctrl.dispose();
});

test('lossless WeakMap hot toggle restores 100% original English DOM, leaves zero residue attributes, and emits zero idle mutations', () => {
  const dom = createTestDom();
  const btn = dom.doc.createElement('button');
  btn.setAttribute('aria-label', 'Refresh');
  btn.setAttribute('title', 'Reload app');
  btn.textContent = '  General  ';
  const input = dom.doc.createElement('input');
  input.setAttribute('placeholder', 'Search Conversations');
  dom.doc.body.append(btn, input);

  const ctrl = createHostI18n({
    dictionary: builtinDict,
    document: dom.doc,
    window: dom.win,
    MutationObserver: dom.MutationObserver,
    NodeFilter: dom.NodeFilter,
  });

  // Toggle ON
  assert.equal(ctrl.setEnabled(true), true);
  assert.equal(btn.textContent, '  通用  ');
  assert.equal(btn.getAttribute('aria-label'), '刷新');
  assert.equal(btn.getAttribute('title'), '重新加载应用');
  assert.equal(input.getAttribute('placeholder'), '搜索对话');
  assert.equal([...btn.attributes.keys()].some(k => k.startsWith('data-ag-orig')), false, 'No residue data-ag-orig attributes');

  // Initial scan runs before observer attachment, leaving zero pending idle mutations.
  assert.equal(dom.flushObservers(), 0, 'Zero idle mutation loop after initial translation');

  // Dynamic incremental mutation adds new node while enabled
  const late = dom.doc.createElement('span');
  late.textContent = 'Thought for 4s';
  dom.doc.body.append(late);
  dom.flushObservers();
  assert.equal(late.textContent, '思考了 4s');
  assert.equal(dom.flushObservers(), 0);

  // If host changes a translated node to an untranslated dynamic string while ON, disabling must NOT clobber it
  const dynamicNode = dom.doc.createElement('span');
  dynamicNode.textContent = 'Automations';
  dom.doc.body.append(dynamicNode);
  dom.flushObservers();
  assert.equal(dynamicNode.textContent, '自动化');
  dynamicNode.childNodes[0].nodeValue = 'Custom User Label';
  dom.flushObservers();
  assert.equal(dynamicNode.textContent, 'Custom User Label');

  // Live override update while enabled
  ctrl.setOverrides({ General: '基本设置' });
  assert.equal(btn.textContent, '  基本设置  ');

  // Hot toggle OFF -> 100% lossless restore via WeakMap
  assert.equal(ctrl.setEnabled(false), false);
  assert.equal(btn.textContent, '  General  ');
  assert.equal(btn.getAttribute('aria-label'), 'Refresh');
  assert.equal(btn.getAttribute('title'), 'Reload app');
  assert.equal(input.getAttribute('placeholder'), 'Search Conversations');
  assert.equal(late.textContent, 'Thought for 4s');
  assert.equal(dynamicNode.textContent, 'Custom User Label');
  assert.deepEqual(ctrl.stats(), { enabled: false, translatedTextNodes: 0, translatedAttributes: 0 });

  // Adding new English nodes while OFF does nothing
  const afterOff = dom.doc.createElement('button');
  afterOff.textContent = 'Plugins';
  dom.doc.body.append(afterOff);
  assert.equal(dom.flushObservers(), 0);
  assert.equal(afterOff.textContent, 'Plugins');
});

test('hostUiLocalization trilingual copy, validation, persistence, and runtime bridge work end-to-end', async t => {
  // 1. Trilingual copy check across en / zh-CN / zh-TW
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const lang = createDashboardI18n(locale);
    assert.ok(lang.t('hostUiLocalization').length > 0);
    assert.ok(lang.t('hostUiLocalizationHint').length > 0);
    assert.ok(lang.t('hostUiLocalizationOn').length > 0);
    assert.ok(lang.t('hostUiLocalizationOff').length > 0);
    assert.ok(lang.t('hostUiLocalizationSaveFailed').length > 0);
  }
  assert.equal(createDashboardI18n('en').t('hostUiLocalization'), 'Host UI Chinese');
  assert.equal(createDashboardI18n('zh-CN').t('hostUiLocalization'), '宿主界面汉化');
  assert.equal(createDashboardI18n('zh-TW').t('hostUiLocalization'), '宿主介面漢化');

  // 2. Preference persistence & validation
  const dir = await mkdtemp(join(tmpdir(), 'ag-pref-host-i18n-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'preferences.json');
  const store = new PreferencesStore({ file });
  const initial = await store.get();
  assert.equal(Object.hasOwn(initial, 'hostUiLocalization'), false);
  assert.equal(createDashboardI18n().normalizeHostUiLocalization(initial.hostUiLocalization), false);

  assert.equal(validateHostUiLocalization(true), true);
  assert.equal(validateHostUiLocalization(false), false);
  for (const bad of ['true', 'false', 1, 0, null, {}, []]) {
    assert.throws(() => validateHostUiLocalization(bad));
    await assert.rejects(store.set({ hostUiLocalization: bad }));
  }

  await store.set({ hostUiLocalization: true });
  assert.equal((await new PreferencesStore({ file }).get()).hostUiLocalization, true);
  await store.set({ language: 'zh-TW' });
  assert.equal((await store.get()).hostUiLocalization, true);
  await store.set({ hostUiLocalization: false });
  assert.equal((await new PreferencesStore({ file }).get()).hostUiLocalization, false);
  await writeFile(file, JSON.stringify({ schema: 1, language: 'en', hostUiLocalization: 'yes', revision: 7 }));
  assert.equal(Object.hasOwn(await store.get(), 'hostUiLocalization'), false);

  // 3. Controller sync / error retention
  const lang = createDashboardI18n('en');
  let fail = false, rev = 1;
  const ctrl = lang.connectHostUiLocalization({
    initial: false,
    write: async input => {
      if (fail) throw new Error('disk full');
      return { language: 'en', hostUiLocalization: input.hostUiLocalization, revision: ++rev };
    },
  });
  assert.equal(ctrl.enabled, false);
  await ctrl.choose(true);
  assert.equal(ctrl.enabled, true);
  assert.equal(ctrl.error, false);
  ctrl.sync({ language: 'en', hostUiLocalization: false, revision: 1 });
  assert.equal(ctrl.enabled, true, 'Stale revision cannot revert newer choice');
  fail = true;
  await ctrl.choose(false);
  assert.equal(ctrl.enabled, false);
  assert.equal(ctrl.error, true);
  ctrl.dispose();

  // 4. RuntimeUi preferences + host-i18n override RPC + cross-session push
  const overrideFile = join(dir, 'host-i18n-override.json');
  await writeFile(overrideFile, JSON.stringify({ Settings: '自定义设置' }));
  class FakeConn {
    constructor(opts) { this.opts = opts; this.calls = []; this.closed = false; }
    async open() { return this; }
    async command(method, params = {}) {
      this.calls.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Runtime.enable') this.opts.onEvent({ method: 'Runtime.executionContextCreated', params: { context: { id: 7, origin: 'https://127.0.0.1:5000', auxData: { isDefault: true, frameId: 'main' } } } });
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 's1' };
      if (method === 'Runtime.evaluate') return { result: { value: { mounted: true, installed: true, bridge: true } } };
      return {};
    }
    close() { this.closed = true; }
  }
  const conns = [];
  const ui = new RuntimeUi({
    snapshot: async () => ({ connection: 'live', groups: [], speed: null }),
    source: makeRendererSource('module.exports = function(){return {};};', 'module.exports = function(){};'),
    preferences: store,
    overrideFiles: [overrideFile],
    discover: async () => [{ type: 'page', url: 'https://127.0.0.1:5000/c/chat', webSocketDebuggerUrl: 'ws://127.0.0.1:9123/devtools/page/one' }],
    connect: (_, opts) => { const c = new FakeConn(opts); conns.push(c); return c; },
  });
  await ui.tick();
  const c = conns[0];
  await ui.event(c, { method: 'Runtime.bindingCalled', params: { name: ui.binding, executionContextId: 7, payload: JSON.stringify({ id: 1, type: 'preferences', input: { hostUiLocalization: true } }) } });
  assert.equal((await store.get()).hostUiLocalization, true);
  assert.ok(c.calls.some(x => x.params.expression?.includes('"hostUiLocalization":true')));
  await ui.event(c, { method: 'Runtime.bindingCalled', params: { name: ui.binding, executionContextId: 7, payload: JSON.stringify({ id: 2, type: 'host-i18n', input: {} }) } });
  assert.ok(c.calls.some(x => x.params.expression?.includes('自定义设置')));
  await ui.pushPreferences({ language: 'en', hostUiLocalization: false, revision: 99 });
  assert.ok(c.calls.some(x => x.params.expression?.includes('__agPulseOnPreferences')));
  await ui.stop();
});
