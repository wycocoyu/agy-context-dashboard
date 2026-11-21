// Non-invasive, restart-free host UI localization with WeakMap restoration.
module.exports = function createHostI18n(options = {}) {
  const TRANSLATABLE_ATTRS = ['aria-label', 'title', 'placeholder'];
  const MAX_TEXT_LENGTH = 240;
  const MAX_PATTERN_TEXT_LENGTH = 64;
  const MAX_OVERRIDE_ENTRIES = 2000;
  const MAX_KEY_LENGTH = 200;
  const MAX_VALUE_LENGTH = 400;
  const MAX_TRACKED_REFS = 1024;
  const UNSAFE_TEXT_RE = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
  const METADATA_KEYS = new Set(['$schema', 'schema', 'license', 'locale', 'version', '_comment', 'patterns', 'exact']);

  const IMMUTABLE_SELECTOR = [
    '.monaco-editor',
    '.monaco-diff-editor',
    '.view-lines',
    '.view-line',
    '.monaco-list',
    '.explorer-viewlet',
    '.scm-view',
    '.tabs-container',
    '.monaco-breadcrumbs',
    '.xterm',
    '.terminal',
    '[data-testid="bottom-terminal-panel"]',
    '[data-testid="overview-panel-row-terminal"]',
    'code',
    'pre',
    'kbd',
    'samp',
    'style',
    'script',
    'noscript',
    'template',
    'svg',
    'math',
    'canvas',
    '.hljs',
    '.code-block',
    '[data-markdown-root]',
    '[data-testid="user-message-content"]',
    '[data-testid="user-message-bubble"]',
    '.agy-user-bubble',
    '[data-testid="user-input-step"]',
    '.prose',
    '.markdown',
    '.markdown-body',
    '[data-uri^="file:"]',
    '[data-uri^="vscode-"]',
    '.inline-pill[data-uri]',
    'a.inline-pill[href^="file:"]',
    'a.inline-pill[href^="vscode-"]',
    '[class*="group/file-title"]',
    '[data-testid="conversation-row-sidebar"] .truncate',
    '[data-testid="conversation-row-history"] .truncate',
    '.agy-sidebar-row .truncate',
    '[data-testid="breadcrumb-segment"]',
    '[data-testid="conversation-navigator-turn"]',
    '[data-testid*="model-selector"]',
    '[data-effort]',
    '[data-pulse-widget]',
    '[data-ag-pulse-bar]',
    '[id^="ag-pulse-status-bar"]',
    '#usage-dashboard',
    '#plugin-update-dialog',
    'iframe',
    'frame',
    'webview',
    'object',
    'embed',
    '[data-testid*="teamwork-frame"]',
    '[data-teamwork-frame]',
    '[data-ag-i18n-ignore]',
  ].join(',');

  const IMMUTABLE_TAGS = new Set([
    'CODE', 'PRE', 'KBD', 'SAMP', 'STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE',
    'SVG', 'MATH', 'CANVAS', 'IFRAME', 'FRAME', 'WEBVIEW', 'OBJECT', 'EMBED',
  ]);
  const EDITABLE_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || doc?.defaultView || (typeof window !== 'undefined' ? window : null);
  const ObserverImpl = options.MutationObserver || win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  const Filter = options.NodeFilter || win?.NodeFilter || (typeof NodeFilter !== 'undefined'
    ? NodeFilter
    : { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 });
  const allowNested = options.allowNested === true;
  const makeRef = typeof WeakRef === 'function' ? value => new WeakRef(value) : value => ({ deref: () => value });

  const isPathOrUrl = trimmed => {
    if (/^(?:https?|wss?|file|vscode-[a-z0-9-]+|mailto|data|blob):/i.test(trimmed)) return true;
    if (/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(trimmed)) return true;
    if (/^(?:~\/|\.\.?\/|\/[^\s])/.test(trimmed)) return true;
    if (/^[^\s]+\/[^\s]+$/.test(trimmed) || /^[^\s]+\\[^\s]+$/.test(trimmed)) return true;
    if (/^[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|json|md|css|html|yml|yaml|toml|sh|ps1|txt|log|asar)$/i.test(trimmed)) return true;
    return false;
  };

  const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  function normalizeOverrides(raw) {
    const cleaned = new Map();
    if (!isPlainObject(raw)) return cleaned;
    const sources = [];
    if (isPlainObject(raw.exact)) sources.push(raw.exact);
    sources.push(raw);
    for (const source of sources) {
      for (const [rawKey, rawValue] of Object.entries(source)) {
        if (cleaned.size >= MAX_OVERRIDE_ENTRIES) break;
        if (source === raw && METADATA_KEYS.has(rawKey)) continue;
        if (typeof rawKey !== 'string') continue;
        const key = rawKey.trim();
        if (!key || key.length > MAX_KEY_LENGTH || UNSAFE_TEXT_RE.test(key) || isPathOrUrl(key)) continue;
        if (rawValue === null || rawValue === false) {
          cleaned.set(key, null);
          continue;
        }
        if (typeof rawValue !== 'string') continue;
        const value = rawValue.trim();
        if (!value || value.length > MAX_VALUE_LENGTH || UNSAFE_TEXT_RE.test(value)) continue;
        cleaned.set(key, value);
      }
    }
    return cleaned;
  }

  function compileDictionary(baseDict, overrideInput) {
    const exactMap = new Map();
    const compiledPatterns = [];
    if (isPlainObject(baseDict)) {
      const exactSource = isPlainObject(baseDict.exact) ? baseDict.exact : baseDict;
      for (const [rawKey, rawValue] of Object.entries(exactSource)) {
        if (exactSource === baseDict && METADATA_KEYS.has(rawKey)) continue;
        if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue;
        const key = rawKey.trim(), value = rawValue.trim();
        if (!key || !value || key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) continue;
        exactMap.set(key, value);
      }
      if (Array.isArray(baseDict.patterns)) {
        for (const item of baseDict.patterns) {
          if (!isPlainObject(item) || typeof item.source !== 'string' || typeof item.replacement !== 'string') continue;
          if (!item.source || item.source.length > 160 || item.replacement.length > MAX_VALUE_LENGTH) continue;
          try {
            compiledPatterns.push({ regex: new RegExp(item.source), replacement: item.replacement });
          } catch { /* Ignore malformed built-in pattern defensively. */ }
        }
      }
    }
    for (const [key, value] of normalizeOverrides(overrideInput)) {
      exactMap.set(key, value);
    }
    return { exactMap, compiledPatterns };
  }

  const baseDictionary = options.dictionary ?? win?.__agPulseHostI18nDict ?? {};
  let overrideData = options.overrides || null;
  let { exactMap, compiledPatterns } = compileDictionary(baseDictionary, overrideData);

  const origText = new WeakMap();
  const origAttrs = new WeakMap();
  const trackedTextRefs = new Set();
  const trackedElementRefs = new Set();
  let observer = null;
  let enabled = false;

  const pruneRefs = set => {
    if (set.size < MAX_TRACKED_REFS) return;
    for (const ref of set) {
      if (ref.deref() === undefined) set.delete(ref);
    }
  };
  const trackText = node => { pruneRefs(trackedTextRefs); trackedTextRefs.add(makeRef(node)); };
  const trackElement = el => { pruneRefs(trackedElementRefs); trackedElementRefs.add(makeRef(el)); };

  function isImmutableElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (typeof el.closest === 'function') {
      try {
        if (el.closest(IMMUTABLE_SELECTOR)) return true;
      } catch { /* Fall back to ancestor check below if selector engine differs. */ }
    }
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const tag = cur.tagName ? cur.tagName.toUpperCase() : '';
      if (IMMUTABLE_TAGS.has(tag)) return true;
      if (typeof cur.hasAttribute === 'function') {
        if (cur.hasAttribute('data-markdown-root') || cur.hasAttribute('data-pulse-widget')
          || cur.hasAttribute('data-ag-pulse-bar') || cur.hasAttribute('data-ag-i18n-ignore')
          || cur.hasAttribute('data-effort') || cur.hasAttribute('data-teamwork-frame')) return true;
        const id = cur.getAttribute('id') || '';
        if (id.startsWith('ag-pulse-status-bar') || id === 'usage-dashboard' || id === 'plugin-update-dialog') return true;
        const uri = cur.getAttribute('data-uri') || '';
        if (uri.startsWith('file:') || uri.startsWith('vscode-')) return true;
      }
    }
    return false;
  }

  function isTextEditable(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.isContentEditable === true) return true;
    if (typeof el.closest === 'function') {
      try {
        if (el.closest('textarea,input,select,option')) return true;
        const ce = el.closest('[contenteditable]');
        if (ce) {
          const val = String(ce.getAttribute('contenteditable') || '').toLowerCase();
          if (val === '' || val === 'true' || val === 'plaintext-only') return true;
        }
      } catch {}
    }
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const tag = cur.tagName ? cur.tagName.toUpperCase() : '';
      if (EDITABLE_TAGS.has(tag)) return true;
      if (typeof cur.hasAttribute === 'function' && cur.hasAttribute('contenteditable')) {
        const val = String(cur.getAttribute('contenteditable') || '').toLowerCase();
        if (val === 'false') return false;
        if (val === '' || val === 'true' || val === 'plaintext-only') return true;
      }
    }
    return false;
  }

  function translate(rawText, { attrName = null } = {}) {
    if (typeof rawText !== 'string' || !rawText) return null;
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return null;
    // Host permission/editor onBlur checks exact aria-label === "Cancel".
    if (attrName === 'aria-label' && trimmed === 'Cancel') return null;
    if (isPathOrUrl(trimmed)) return null;

    let result = null;
    if (exactMap.has(trimmed)) {
      result = exactMap.get(trimmed);
      if (result === null) return null;
    } else if (trimmed.length <= MAX_PATTERN_TEXT_LENGTH) {
      for (const entry of compiledPatterns) {
        if (entry.regex.test(trimmed)) {
          result = trimmed.replace(entry.regex, entry.replacement);
          break;
        }
      }
    }
    if (typeof result !== 'string' || !result || result === trimmed) return null;
    const lead = rawText.match(/^\s*/)[0];
    const trail = rawText.match(/\s*$/)[0];
    return lead + result + trail;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return false;
    const current = node.nodeValue;
    const existing = origText.get(node);
    if (existing) {
      if (current === existing.translated) return false;
    }
    const next = translate(current);
    if (next === null) {
      if (existing) origText.delete(node);
      return false;
    }
    origText.set(node, { original: current, translated: next });
    trackText(node);
    node.nodeValue = next;
    return true;
  }

  function translateAttribute(el, attrName) {
    if (!el || el.nodeType !== 1 || !TRANSLATABLE_ATTRS.includes(attrName)) return false;
    if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return false;
    const current = el.getAttribute(attrName);
    const map = origAttrs.get(el);
    if (current === null) {
      if (map) {
        map.delete(attrName);
        if (!map.size) origAttrs.delete(el);
      }
      return false;
    }
    const existing = map?.get(attrName);
    if (existing && current === existing.translated) return false;
    const next = translate(current, { attrName });
    if (next === null) {
      if (map) {
        map.delete(attrName);
        if (!map.size) origAttrs.delete(el);
      }
      return false;
    }
    let targetMap = map;
    if (!targetMap) {
      targetMap = new Map();
      origAttrs.set(el, targetMap);
    }
    targetMap.set(attrName, { original: current, translated: next });
    trackElement(el);
    el.setAttribute(attrName, next);
    return true;
  }

  const isInsideEditableDescendant = el => Boolean(el?.parentElement && isTextEditable(el.parentElement));

  function processSingleElement(el) {
    if (isInsideEditableDescendant(el)) return;
    for (const attr of TRANSLATABLE_ATTRS) translateAttribute(el, attr);
    if (!isTextEditable(el) && el.childNodes) {
      for (const child of el.childNodes) {
        if (child && child.nodeType === 3) translateTextNode(child);
      }
    }
  }

  function processElementTree(startEl) {
    if (!startEl || startEl.nodeType !== 1 || isImmutableElement(startEl)) return;
    processSingleElement(startEl);
    if (typeof doc?.createTreeWalker === 'function') {
      const walker = doc.createTreeWalker(startEl, Filter.SHOW_ELEMENT, {
        acceptNode(node) {
          return isImmutableElement(node) ? Filter.FILTER_REJECT : Filter.FILTER_ACCEPT;
        },
      });
      for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
        processSingleElement(cur);
      }
      return;
    }
    const stack = Array.from(startEl.children || []);
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || cur.nodeType !== 1 || isImmutableElement(cur)) continue;
      processSingleElement(cur);
      if (cur.children) {
        for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
      }
    }
  }

  function resolveRoot() {
    return options.root || doc?.body || doc?.documentElement || null;
  }

  function restoreAll() {
    for (const ref of trackedTextRefs) {
      const node = ref.deref();
      if (!node) continue;
      const rec = origText.get(node);
      if (rec && node.nodeValue === rec.translated) node.nodeValue = rec.original;
      origText.delete(node);
    }
    trackedTextRefs.clear();

    for (const ref of trackedElementRefs) {
      const el = ref.deref();
      if (!el) continue;
      const map = origAttrs.get(el);
      if (map) {
        for (const [attr, rec] of map) {
          if (el.getAttribute(attr) === rec.translated) el.setAttribute(attr, rec.original);
        }
        origAttrs.delete(el);
      }
    }
    trackedElementRefs.clear();
  }

  function handleMutations(records) {
    if (!enabled || !Array.isArray(records) || !records.length) return;
    const seenElements = new Set();
    const seenText = new Set();
    for (const record of records) {
      if (!record || !record.target) continue;
      if (record.type === 'characterData') {
        const textNode = record.target;
        if (textNode.nodeType !== 3 || seenText.has(textNode)) continue;
        seenText.add(textNode);
        const parent = textNode.parentElement;
        if (!parent || isImmutableElement(parent) || isTextEditable(parent)) continue;
        translateTextNode(textNode);
      } else if (record.type === 'attributes') {
        const el = record.target;
        if (el.nodeType !== 1 || isImmutableElement(el) || isInsideEditableDescendant(el)) continue;
        if (record.attributeName) translateAttribute(el, record.attributeName);
      } else if (record.type === 'childList') {
        const parent = record.target;
        if (parent.nodeType !== 1 || isImmutableElement(parent)) continue;
        const parentEditable = isTextEditable(parent);
        for (const added of record.addedNodes || []) {
          if (!added) continue;
          if (added.nodeType === 3) {
            if (!seenText.has(added) && !parentEditable) {
              seenText.add(added);
              translateTextNode(added);
            }
          } else if (added.nodeType === 1 && !parentEditable && !seenElements.has(added)) {
            seenElements.add(added);
            processElementTree(added);
          }
        }
      }
    }
  }

  function startObserver(root) {
    if (observer || !ObserverImpl || !root) return;
    observer = new ObserverImpl(handleMutations);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    });
  }

  function stopObserver() {
    if (!observer) return;
    try { observer.takeRecords?.(); } catch {}
    observer.disconnect();
    observer = null;
  }

  function setEnabled(next) {
    const target = next === true;
    if (target === enabled) return enabled;
    if (target) {
      if (win && win !== win.top && !allowNested) return false;
      const root = resolveRoot();
      if (!root) return false;
      enabled = true;
      processElementTree(root);
      startObserver(root);
      return true;
    }
    enabled = false;
    stopObserver();
    restoreAll();
    return false;
  }

  function setOverrides(nextOverrides) {
    overrideData = nextOverrides || null;
    ({ exactMap, compiledPatterns } = compileDictionary(baseDictionary, overrideData));
    if (enabled) {
      stopObserver();
      restoreAll();
      const root = resolveRoot();
      if (root) {
        processElementTree(root);
        startObserver(root);
      }
    }
  }

  function stats() {
    let translatedTextNodes = 0;
    for (const ref of trackedTextRefs) {
      if (ref.deref()) translatedTextNodes++;
    }
    let translatedAttributes = 0;
    for (const ref of trackedElementRefs) {
      const el = ref.deref();
      if (el) translatedAttributes += origAttrs.get(el)?.size || 0;
    }
    return { enabled, translatedTextNodes, translatedAttributes };
  }

  function dispose() {
    setEnabled(false);
  }

  if (options.enabled === true) setEnabled(true);

  return {
    get enabled() { return enabled; },
    setEnabled,
    setOverrides,
    translate,
    isExcludedElement: isImmutableElement,
    stats,
    dispose,
  };
};
