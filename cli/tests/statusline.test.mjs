import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, countdown, cleanText, quotaGroupForModel } from '../metrics.mjs';
import { render, displayWidth, truncate } from '../render.mjs';

const script = fileURLToPath(new URL('../statusline.mjs', import.meta.url));
const sample = {
  model: { display_name: 'Gemini 3.5 Flash (High)' }, agent_state: 'working', terminal_width: 100,
  context_window: { total_input_tokens: 88244, total_output_tokens: 61074, context_window_size: 1048576,
    used_percentage: 14.24, current_usage: { input_tokens: 63382, output_tokens: 346,
      cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 } },
  quota: { 'gemini-weekly': { remaining_fraction: 0.9378, reset_in_seconds: 560580 } },
};
const run = (input, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], {
  input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env }, timeout: 10000,
});

const cachePayload = (input = 190, read = 17244, write = 0, model = { id: 'claude-sonnet-4-6' }, version = '1.3.2') => ({
  version, model, context_window: { used_percentage: 8.6, total_input_tokens: 999999, total_output_tokens: 888888,
    current_usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: 777777 } },
});

// Numeric fixtures from nine completed real Windows CLI 1.3.2 experiment turns.
// No conversation IDs, account metadata or prompts are committed.
test('real CLI cache samples use separate current input/read counters, never output or totals', () => {
  for (const [model, rows] of [
    ['Claude Sonnet 4.6 (Thinking)', [[7776,9450,54.86], [3809,13521,78.02], [190,17244,98.91]]],
    ['GPT-OSS 120B (Medium)', [[10334,2752,21.03], [103,13056,99.22], [10480,2752,20.80]]],
    ['Gemini 3.8 Flash (High)', [[15959,0,0], [16176,0,0], [16309,0,0]]],
  ]) for (const [input, read, expected] of rows) {
    const payload = cachePayload(input, read, 0, { display_name: model });
    const metrics = normalize(payload);
    assert.ok(Math.abs(metrics.cacheRate.percentage - expected) < 0.005);
    payload.context_window.total_input_tokens = 1;
    payload.context_window.current_usage.output_tokens = 0;
    assert.deepEqual(normalize(payload).cacheRate, metrics.cacheRate);
  }
  assert.match(render(normalize(cachePayload()), { color: false }), /Cache 98\.9% · 17\.2K read/);
});

test('cache policy validates version, model identity and unverified cache-write semantics', () => {
  for (const id of ['claude-sonnet-4-6', 'Claude Sonnet 4.6 (Thinking)', 'gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)']) {
    assert.equal(normalize(cachePayload(1, 99, 0, { id })).cacheRate.percentage, 99);
  }
  for (const model of [{ id: 'Gemini', display_name: 'Claude Sonnet 4.6 (Thinking)' },
    { id: 'claude-opus-4-6' }, { id: 'gpt-oss-20b' }, { id: 'future-model' }, {}]) {
    assert.equal(normalize(cachePayload(1, 99, 0, model)).cacheRate.reason, 'unverified-model');
  }
  for (const version of [undefined, '1.3.4', '1.4.0', 'v1.3.2', 1.3]) {
    const payload = cachePayload(); payload.version = version;
    assert.equal(normalize(payload).cacheRate.reason, 'unverified-cli-version');
  }
  assert.equal(normalize(cachePayload(1, 99, 1)).cacheRate.reason, 'unverified-cache-write');
  assert.equal(normalize(cachePayload(1, 0, 1, {}, 'future')).cacheRate.percentage, 0);
  assert.equal(normalize(cachePayload(0, 99)).cacheRate.percentage, 100);
  assert.equal(normalize(cachePayload(0, 0)).cacheRate.reason, 'empty-input');
});

test('Linux CLI 1.3.3 Sonnet/GPT real samples have the same separate-input scope', () => {
  for (const [model, rows] of [
    ['Claude Sonnet 4.6 (Thinking)', [[18290,0], [8721,9648], [182,18287]]],
    ['GPT-OSS 120B (Medium)', [[10835,2752], [10904,2752], [93,13632]]],
  ]) for (const [input, read] of rows) {
    const metrics = normalize(cachePayload(input, read, 0, { id: model }, '1.3.3'));
    assert.equal(metrics.cacheRate.percentage, read / (input + read) * 100);
  }
});

test('Gemini 3.8 Flash High CLI 1.3.3 displays nonzero cache rates in both languages', () => {
  // Rounded deidentified regression fixture, shaped like the diagnosed request.
  for (const id of ['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)']) {
    const payload = cachePayload(2100, 130000, 0, { id }, '1.3.3');
    const metrics = normalize(payload);
    assert.equal(metrics.cacheRate.percentage, 130000 / 132100 * 100);
    assert.match(render(metrics, { color: false }), /Cache 98\.4% · 130K read/);
    assert.match(render(metrics, { color: false, language: 'zh-CN' }), /缓存 98\.4% · 130K 读取/);
    assert.match(run(payload, ['--language', 'en', '--no-color']).stdout, /Cache 98\.4%/);
    assert.equal(normalize({ ...payload, version: '1.3.2' }).cacheRate.percentage, null);
    payload.model = { id: 'future-model', display_name: 'Gemini 3.8 Flash (High)' };
    assert.equal(normalize(payload).cacheRate.percentage, null);
    payload.model = { id }; payload.context_window.current_usage.cache_creation_input_tokens = 1;
    assert.equal(normalize(payload).cacheRate.reason, 'unverified-cache-write');
  }
});

test('invalid counters and overflow do not create percentages; missing input differs from real zero', () => {
  for (const field of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
    for (const value of [undefined, null, '100', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const payload = cachePayload(); payload.context_window.current_usage[field] = value;
      assert.equal(normalize(payload).cacheRate.reason, 'missing-or-invalid-counts');
    }
  }
  assert.equal(normalize(cachePayload(Number.MAX_SAFE_INTEGER, 1)).cacheRate.reason, 'unsafe-total');
  assert.equal(normalize(cachePayload()).cacheRate.percentage > 0, true);
  assert.equal(normalize({}).cacheRate.percentage, null);
  assert.equal(normalize(cachePayload(1, 99, 0, { id: 'Gemini' })).cacheRate.percentage, null);
  assert.equal(normalize(cachePayload(1, 0)).cacheRate.percentage, 0);
});

test('busy zero cache snapshots are pending, never a fabricated zero or a previous request', () => {
  for (const agent_state of ['thinking', 'working', 'tool_use', 'initializing']) {
    for (const input of [0, 2100]) {
      const payload = { ...cachePayload(input, 0), agent_state };
      const metrics = normalize(payload);
      assert.equal(metrics.cacheRate.reason, 'awaiting-stable-usage');
      assert.equal(metrics.cacheRate.percentage, null);
      assert.equal(metrics.cacheReadTokens, 0, 'JSON preserves raw supplied counters');
      for (const language of ['en', 'zh-CN', 'zh-TW']) {
        const text = render(metrics, {color:false,language});
        assert.match(text, language === 'en' ? /Cache --/ : language === 'zh-TW' ? /快取 --/ : /缓存 --/);
        assert.doesNotMatch(text, /(?:Cache|缓存|快取) 0%|0 read|0 读取|0 讀取/);
      }
    }
    const valid = { ...cachePayload(), agent_state };
    assert.ok(normalize(valid).cacheRate.percentage > 98, 'Available nonzero reads remain useful while working');
  }
  assert.equal(normalize({ ...cachePayload(2100, 0), agent_state:'idle' }).cacheRate.percentage, 0);
  assert.equal(normalize({ ...cachePayload(0, 0), agent_state:'idle' }).cacheRate.reason, 'empty-input');
  assert.ok(run({...cachePayload(),agent_state:'idle'}, ['--language','en','--no-color']).stdout.includes('98.9%'));
  const result=run({...cachePayload(2100,0),agent_state:'working'}, ['--language','en','--no-color']);
  assert.equal(result.status,0);assert.match(result.stdout,/Cache --/);assert.doesNotMatch(result.stdout,/98\.9%|0 read/);
  assert.match(run({...cachePayload(2100,0),agent_state:'idle'}, ['--language','en','--no-color']).stdout,/Cache 0% · 0 read/);
});

test('narrow first row retains context and cache percentages before secondary read counts', () => {
  const metrics = normalize(cachePayload());
  for (const language of ['en', 'zh-CN', 'zh-TW']) for (let width = 1; width <= 500; width++) {
    const row = render(metrics, { language, width, color: false }).split('\n')[0];
    assert.ok(displayWidth(row) <= width);
    if (width >= 27) assert.match(row, /8\.6%.*98\.9%/);
    if (width === 30) assert.doesNotMatch(row, /17\.2K/);
    if (width >= 55) assert.match(row, /17\.2K/);
  }
});

test('official contract uses explicit occupancy and current cache count, never cumulative counters', () => {
  const metrics = normalize(sample);
  assert.equal(metrics.context.usedPercentage, 14.24);
  assert.equal(metrics.cacheReadTokens, 20857);
  const text = render(metrics, { color: false });
  assert.match(text, /14\.2%/);
  assert.match(text, /20\.9K/);
  assert.doesNotMatch(text, /tok\/s|TPS|cache hit/i);
});

test('zero, missing and malformed values remain distinct; compaction and model switches are stateless', () => {
  const zero = normalize({ context_window: { used_percentage: 0, current_usage: { cache_read_input_tokens: 0 } },
    quota: { 'gemini-5h': { remaining_fraction: 0 } } });
  const text = render(zero, { color: false });
  assert.match(text, /Context 0%/); assert.match(text, /Cache -- · 0 read/); assert.match(text, /left\s+5h 0%/);
  const missing = normalize({ model: { id: 'Claude' }, context_window: { used_percentage: '50', current_usage: { cache_read_input_tokens: -1 } } });
  assert.equal(missing.context.usedPercentage, null); assert.equal(missing.cacheReadTokens, null);
  assert.match(render(missing, { color: false }), /Context --.*Cache --.*Quota --/s);
  assert.equal(normalize({ context_window: { used_percentage: 2 } }).context.usedPercentage, 2);
  assert.equal(normalize({ context_window: { used_percentage: 120 } }).context.usedPercentage, 120);
  assert.equal(normalize({ context_window: { remaining_percentage: 70 } }).context.usedPercentage, 30);
  assert.equal(normalize({ context_window: { remaining_percentage: 120 } }).context.usedPercentage, null);
});

test('quota reset never fabricates restored balances; unknown IDs retain identity', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const metrics = normalize({ quota: { 'unknown-future-bucket': { remaining_fraction: 0,
    reset_time: '2026-10-09T00:00:00Z', reset_in_seconds: 100000 }, bad: { remaining_fraction: 2 } } });
  assert.equal(countdown(metrics.quotas[0], now), '<1m');
  const text = render(metrics, { color: false, width: 150, now });
  assert.match(text, /unknown-future-bucket left\s+0%/); assert.match(text, /bad left\s+--/);
});

test('render bounds account for CJK, emoji and combining clusters in both languages', () => {
  const metrics = normalize({ ...sample, model: { display_name: '中文模型👨‍👩‍👧‍👦é🧪很长的模型名称'.repeat(6) },
    quota: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`future-${i}`, { remaining_fraction: 0.5 }])) });
  for (const language of ['en', 'zh-CN', 'zh-TW']) for (const width of [1, 2, 10, 20, 39, 55, 79, 80, 100, 120, 500]) {
    const text = render(metrics, { width, language, color: false, details: true });
    assert.ok(text.split('\n').length <= 4);
    for (const line of text.split('\n')) assert.ok(displayWidth(line) <= width, `${width}: ${line}`);
  }
  assert.equal(displayWidth('中文'), 4); assert.equal(displayWidth('é'), 1);
  assert.equal(displayWidth('👨‍👩‍👧‍👦'), 2); assert.equal(truncate('A🧪B', 3), 'A…');
});

test('primary metrics stay on the first row; quota families and windows have stable independent rows', () => {
  const metrics = normalize({ ...sample, quota: {
    '3p-weekly': { remaining_fraction: 0.08 }, 'gemini-weekly': { remaining_fraction: 0.95 },
    'gemini-5h': { remaining_fraction: 1 }, '3p-5h': { remaining_fraction: 0.45 },
  } });
  for (const width of [55, 80, 100, 120]) {
    const rows = render(metrics, { width, color: false }).split('\n');
    assert.match(rows[0], /Context 14\.2%.*Cache -- · 20\.9K read/);
    assert.doesNotMatch(rows[0], /Gemini|Claude|reset/);
    assert.match(rows[1], /^Gemini\s+left\s+5h 100%.*week 95%/);
    assert.match(rows[2], /^Claude\s+left\s+5h 45%.*week 8% !/);
  }
  metrics.model = 'Claude Sonnet';
  assert.match(render(metrics, { color: false }).split('\n')[1], /^Claude\s/);
});

test('ANSI foreground and weight distinguish key values, alerts and secondary metadata without backgrounds', () => {
  const metrics = normalize({ ...sample, version: '1.3.2', model: { id: 'claude-sonnet-4-6' },
    context_window: { used_percentage: 95, current_usage: { input_tokens: 6000, cache_read_input_tokens: 24000, cache_creation_input_tokens: 0 } },
    quota: { 'gemini-5h': { remaining_fraction: 0.08, reset_in_seconds: 3600 } } });
  const colored = render(metrics, { color: true, width: 120 });
  const plain = render(metrics, { color: false, width: 120 });
  assert.match(colored, /\x1b\[1;31m95%/);
  assert.match(colored, /\x1b\[1;35m80%/);
  assert.match(colored, /\x1b\[2;39m · 24K read/);
  assert.match(colored, /\x1b\[1;31m8%/);
  assert.match(colored, /\x1b\[2;39m.*↻/);
  assert.equal(colored.replace(/\x1b\[[\d;]+m/g, ''), plain);
  assert.doesNotMatch(colored, /\x1b\[(?:\d+;)*4\d(?:;|m)/);
});

test('remaining quota uses green at 70+, yellow at 30..70, red below 30 for both numbers and bars', () => {
  for (const [remaining, code, alert] of [[0, 31, true], [29.9, 31, true], [30, 33, false],
    [69.9, 33, false], [70, 32, false], [100, 32, false]]) {
    const metrics = normalize({ quota: { 'gemini-5h': { remaining_fraction: remaining / 100 } } });
    const row = render(metrics, { width: 120, color: true }).split('\n')[1];
    assert.ok(row.includes(`\x1b[1;${code}m${remaining}%`), `${remaining}: wrong number color`);
    if (remaining >= 29.9) assert.match(row, new RegExp(`\\x1b\\[${code}m█`));
    assert.equal(row.includes(' !'), alert);
  }
  const missing = render(normalize({ quota: { 'gemini-5h': {} } }), { width: 120, color: true });
  assert.doesNotMatch(missing, /\x1b\[1;31m/);
});

test('shared 3p quota displays unified Claude terracotta label without splitting or recoloring balances', () => {
  const metrics = normalize({ model: { display_name: 'GPT' }, quota: {
    '3p-5h': { remaining_fraction: 0.75 }, '3p-weekly': { remaining_fraction: 0.49 },
  } });
  const colored = render(metrics, { color: true, width: 120 });
  assert.match(colored, /\x1b\[1;38;2;218;119;86mClaude\s+\x1b\[0m/);
  assert.doesNotMatch(colored, /GPT/);
  assert.match(colored, /\x1b\[1;32m75%/);
  assert.match(colored, /\x1b\[1;33m49%/);
  assert.equal(colored.replace(/\x1b\[[\d;]+m/g, ''), render(metrics, { color: false, width: 120 }));
  assert.equal(colored.split('\n').length, 2);
  for (const language of ['en', 'zh-CN', 'zh-TW']) for (const width of [1, 8, 10, 11, 20, 55, 80]) {
    for (const line of render(metrics, { language, width, color: true }).split('\n')) {
      assert.ok(displayWidth(line.replace(/\x1b\[[\d;]+m/g, '')) <= width);
    }
  }
  const light = render(metrics, { lightBackground: true });
  assert.match(light, /\x1b\[1;38;2;218;119;86mClaude/);
  const env = { ...process.env, TERM: 'xterm-256color', COLORFGBG: '0;15' }; delete env.NO_COLOR;
  const result = spawnSync(process.execPath, [script], { input: JSON.stringify({ quota: { '3p-5h': { remaining_fraction: 1 } } }), encoding: 'utf8', env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\x1b\[1;38;2;218;119;86mClaude/);
  assert.doesNotMatch(result.stdout, /\x1b\[(?:\d+;)*4\d(?:;|m)/);
});

test('model and bucket labels cannot inject ANSI, control characters or bidi overrides', () => {
  const hostile = '\x1b]0;SECRET_TITLE\x07\x1b[31mGemini\n\r\x08\u202e';
  assert.equal(cleanText(hostile), 'Gemini');
  const output = render(normalize({ model: { id: hostile }, quota: { [hostile]: {} } }), { color: false });
  assert.doesNotMatch(output, /SECRET|[\x00-\x09\x0b-\x1f\x7f\u202e]/);
});

test('process accepts stdin and whitelists output without accessing transcripts or exposing account metadata', () => {
  const result = run({ ...sample, email: 'SECRET_EMAIL', transcript_path: 'SECRET_PATH', cwd: 'SECRET_DIR', api_key: 'SECRET_KEY' }, ['--json']);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /SECRET|email|transcript|cwd|session/);
  assert.equal(JSON.parse(result.stdout).cacheReadTokens, 20857);
});

test('malformed and oversized inputs fail quietly without leaking data', () => {
  for (const input of ['{SECRET', 'null', '[]', '"SECRET"', ' '.repeat(262145)]) {
    const result = run(input);
    assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'Antigrative Dashboard: --\n');
  }
  assert.equal(run({}, ['--language', 'SECRET']).status, 1);
  assert.equal(run({}, ['--width', '0']).status, 1);
});

test('NO_COLOR and TERM=dumb disable foreground ANSI even when stdout is piped', () => {
  assert.doesNotMatch(run(sample, [], { NO_COLOR: '' }).stdout, /\x1b/);
  assert.doesNotMatch(run(sample, [], { TERM: 'dumb' }).stdout, /\x1b/);
  assert.doesNotMatch(run(sample, ['--no-color']).stdout, /\x1b/);
  const env = { ...process.env }; delete env.NO_COLOR; env.TERM = 'xterm';
  const result = spawnSync(process.execPath, [script], { input: JSON.stringify(sample), encoding: 'utf8', env });
  assert.match(result.stdout, /\x1b\[36m/); assert.doesNotMatch(result.stdout, /\x1b\[4[0-9]m/);
});

test('language survives separate process runs and explicit override; preview writes no history', () => {
  const root = mkdtempSync(join(tmpdir(), 'pulse-cli-'));
  try {
    const local = join(root, 'AntigravityPulse'); mkdirSync(local);
    writeFileSync(join(local, 'preferences.json'), JSON.stringify({ schema: 1, language: 'zh-CN', revision: 1 }));
    const env = { LOCALAPPDATA: root, XDG_DATA_HOME: root, HOME: root };
    // macOS has a fixed Application Support path.
    const mac = join(root, 'Library', 'Application Support', 'AntigravityPulse'); mkdirSync(mac, { recursive: true });
    writeFileSync(join(mac, 'preferences.json'), JSON.stringify({ schema: 1, language: 'zh-CN', revision: 1 }));
    for (let i = 0; i < 2; i++) assert.match(run({}, ['--preview', '--no-color'], env).stdout, /上下文/);
    assert.match(run({}, ['--preview', '--language', 'en', '--no-color'], env).stdout, /Context/);
    assert.equal(JSON.parse(run({}, ['--json', '--preview'], env).stdout).context.usedPercentage, 44.2);
    for(const file of [join(local,'preferences.json'),join(mac,'preferences.json')])writeFileSync(file,JSON.stringify({schema:1,language:'zh-TW',revision:2}));
    for(let i=0;i<2;i++)assert.match(run({},['--preview','--no-color'],env).stdout,/快取/);
    assert.match(run({},['--preview','--language','zh-TW','--no-color'],env).stdout,/讀取/);
    assert.match(run({},['--preview','--language','en','--no-color'],env).stdout,/Cache/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('agy 1.5.5 and 1.5.9 cacheRate policy supports verified ModelUsageStats models with zero cache writes', () => {
  const verifiedModels = [
    [{ id: 'gemini-4-hydrogen-xhigh', effort: 'xhigh' }, 'Gemini 4 Hydrogen (XHigh)'],
    [{ id: 'gemini-4-hydrogen', effort: 'extra-high' }, 'Gemini 4 Hydrogen (XHigh)'],
    [{ id: 'gemini-4-argon', effort: 'high' }, 'Gemini 4 Argon (High)'],
    [{ id: 'gemini-4-carbon-medium' }, 'Gemini 4 Carbon (Medium)'],
    [{ id: 'Gemini 3.8 Flash (High)', effort: 'high' }, 'Gemini 3.8 Flash (High)'],
    [{ id: 'MODEL_PLACEHOLDER_M318' }, 'Gemini 3.8 Flash (High)'],
    [{ id: 'MODEL_PLACEHOLDER_M319' }, 'Gemini 3.8 Flash (Medium)'],
    [{ id: 'MODEL_PLACEHOLDER_M320' }, 'Gemini 3.8 Flash (Low)'],
    [{ id: 'gemini-3.8-flash-tiered', effort: 'high' }, 'Gemini 3.8 Flash (Tiered)'],
    [{ id: 'gemini-pro-orchestrator-g1-pro' }, 'Orchestrator (Argon)'],
    [{ id: 'MODEL_PLACEHOLDER_M26' }, 'Claude Opus 4.6 (Thinking)'],
    [{ id: 'MODEL_PLACEHOLDER_M35' }, 'Claude Sonnet 4.6 (Thinking)'],
    [{ id: 'MODEL_CLAUDE_4_7_SONNET_THINKING' }, 'Claude Sonnet 4.7 (Thinking)'],
    [{ id: 'MODEL_CLAUDE_5_5_OPUS_MAX' }, 'Claude Opus 5.5 (Max)'],
    [{ id: 'claude-haiku-4-5-20251001' }, 'Claude Haiku 4.5'],
    [{ id: 'claude-opus-5-5', effort: 'xhigh' }, 'Claude Opus 5.5 (XHigh)'],
    [{ id: 'gpt-oss-120b-high' }, 'GPT-OSS 120B (High)'],
  ];
  for (const version of ['1.5.5', '1.5.9']) {
    for (const [model, expectedDisplay] of verifiedModels) {
      const metrics = normalize(cachePayload(200, 1800, 0, model, version));
      assert.equal(metrics.model, expectedDisplay);
      assert.equal(metrics.cacheRate.percentage, 90);
      assert.equal(metrics.cacheRate.basis, `separate-input-cli-${version}`);
    }
  }
  const failClosedModels = [
    [{ id: 'word/gemini-4-hydrogen-xhigh' }, 'Gemini 4 Hydrogen (XHigh)'],
    [{ id: 'word/MODEL_PLACEHOLDER_M318' }, 'Gemini 3.8 Flash (High)'],
    [{ id: 'word/MODEL_PLACEHOLDER_M35' }, 'Claude Sonnet 4.6 (Thinking)'],
    [{ id: 'perplexity/sonar-pro' }, 'Perplexity Sonar Pro'],
    [{ id: 'perplexity/sonnet-5-5-high' }, 'Perplexity Sonnet 5.5 (High)'],
    [{ id: 'perplexity/claude-4-7-opus-extra-high' }, 'Perplexity Claude 4.7 Opus (XHigh)'],
    [{ id: 'word/perplexity/sonnet-5-5-high' }, 'Perplexity Sonnet 5.5 (High)'],
    [{ id: 'gpt-6.1-sol', effort: 'extra-high' }, 'GPT-6.1 Sol (XHigh)'],
    [{ id: 'gpt-6-astra', effort: 'high' }, 'GPT-6 Astra (High)'],
    [{ id: 'MODEL_PLACEHOLDER_M322' }, 'MODEL_PLACEHOLDER_M322'],
    [{ id: 'MODEL_GOOGLE_GEMINI_INTERNAL_BYOM' }, 'MODEL_GOOGLE_GEMINI_INTERNAL_BYOM'],
    [{ id: 'MODEL_CLAUDE_4_6_OPUS_BYOK' }, 'Claude Opus 4.6 (BYOK)'],
  ];
  for (const [model, expectedDisplay] of failClosedModels) {
    const metrics = normalize(cachePayload(200, 1800, 0, model, '1.5.9'));
    assert.equal(metrics.model, expectedDisplay);
    assert.equal(metrics.cacheRate.percentage, null);
    assert.equal(metrics.cacheRate.reason, 'unverified-model');
  }
  assert.equal(normalize(cachePayload(200, 1800, 0, { id: 'word/MODEL_PLACEHOLDER_M35' }, '1.3.2')).cacheRate.reason, 'unverified-model');
  assert.equal(quotaGroupForModel('Perplexity Sonnet 5.5 (High)'), '3p');
  assert.equal(quotaGroupForModel('word/MODEL_PLACEHOLDER_M318'), 'gemini');
  assert.equal(normalize(cachePayload(200, 1800, 1, { id: 'gemini-4-hydrogen-xhigh' }, '1.5.9')).cacheRate.reason, 'unverified-cache-write');
  for (const version of ['1.4.0', '1.6.0', '1.5', '1.5.9-beta']) {
    assert.equal(normalize(cachePayload(200, 1800, 0, { id: 'gemini-4-hydrogen-xhigh' }, version)).cacheRate.reason, 'unverified-cli-version');
  }
  assert.equal(normalize({ ...cachePayload(200, 0, 0, { id: 'gemini-4-hydrogen-xhigh' }, '1.5.9'), agent_state: 'working' }).cacheRate.reason, 'awaiting-stable-usage');
});

test('Gemini 4 Argon weekly quota displays alongside Gemini and Claude with active-group ordering', () => {
  const fullQuota = {
    'gemini-5h': { remaining_fraction: 0.72, reset_in_seconds: 8100 },
    'gemini-weekly': { remaining_fraction: 0.94, reset_in_seconds: 560580 },
    'gemini-argon-wtu-weekly': { remaining_fraction: 0.97, reset_in_seconds: 432000 },
    '3p-5h': { remaining_fraction: 0.85, reset_in_seconds: 10800 },
    '3p-weekly': { remaining_fraction: 0.64, reset_in_seconds: 345600 },
  };
  const hydrogen = normalize({ ...sample, version: '1.5.9', model: { id: 'gemini-4-hydrogen-xhigh' }, quota: fullQuota });
  const plainRows = render(hydrogen, { color: false, width: 120 }).split('\n');
  assert.equal(plainRows.length, 4);
  assert.match(plainRows[1], /^Gemini     left  5h 72%.*week 94%/);
  assert.match(plainRows[2], /^Argon      left  week 97%/);
  assert.match(plainRows[3], /^Claude     left  5h 85%.*week 64%/);
  assert.doesNotMatch(plainRows.join('\n'), /… \+/);

  const colored = render(hydrogen, { color: true, width: 120 });
  assert.match(colored, /\x1b\[1;34mArgon      \x1b\[0m/);
  assert.match(colored, /\x1b\[1;38;2;218;119;86mClaude     \x1b\[0m/);

  const orchestrator = normalize({ ...sample, version: '1.5.9', model: { id: 'gemini-pro-orchestrator-g1-pro' }, quota: fullQuota });
  assert.equal(orchestrator.model, 'Orchestrator (Argon)');
  const orchRows = render(orchestrator, { color: false, width: 120 }).split('\n');
  assert.match(orchRows[1], /^Argon\s+left/);
  assert.match(orchRows[2], /^Gemini\s+left/);
  assert.match(orchRows[3], /^Claude\s+left/);

  const sharedUltraQuota = normalize({
    ...sample, version: '1.5.9', model: { id: 'gemini-pro-orchestrator-g1-pro' },
    quota: { 'gemini-5h': { remaining_fraction: 0.9 }, '3p-5h': { remaining_fraction: 0.5 } },
  });
  assert.match(render(sharedUltraQuota, { color: false, width: 120 }).split('\n')[1], /^Gemini\s+left/);

  const pplx = normalize({ ...sample, model: { id: 'perplexity/sonar-pro' }, quota: fullQuota });
  assert.match(render(pplx, { color: false, width: 120 }).split('\n')[1], /^Claude\s+left/);

  const withUnknown = normalize({ ...sample, model: { id: 'gemini-4-hydrogen-xhigh' }, quota: { ...fullQuota, 'future-bucket': { remaining_fraction: 0.5 } } });
  const cappedRows = render(withUnknown, { color: false, width: 120 }).split('\n');
  assert.equal(cappedRows.length, 4);
  assert.match(cappedRows[3], /… \+1$/);
});

test('subagents are sanitized in --json and summarized only when --details is enabled', () => {
  const payload = {
    ...sample,
    version: '1.5.9',
    model: { id: 'gemini-4-hydrogen-xhigh' },
    subagents: [
      { name: 'scout\x1b[31m\n', role: 'research', model: 'MODEL_PLACEHOLDER_M319', status: 'running' },
      { name: 'helper', model: 'flash_lite', status: 'completed' },
    ],
  };
  const jsonResult = run(payload, ['--json']);
  assert.equal(jsonResult.status, 0);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.deepEqual(parsed.subagents, [
    { name: 'scout', role: 'research', model: 'Gemini 3.8 Flash (Medium)', status: 'running' },
    { name: 'helper', role: null, model: 'flash_lite', status: 'completed' },
  ]);

  assert.doesNotMatch(run(payload, ['--no-color']).stdout, /Subagents|scout/);
  const detailsEn = run(payload, ['--details', '--language', 'en', '--width', '200', '--no-color']);
  assert.equal(detailsEn.status, 0);
  assert.match(detailsEn.stdout, /Subagents 2: scout \(Gemini 3\.8 Flash \(Medium\)\) running, helper \(flash_lite\) completed/);
  const detailsZh = run(payload, ['--details', '--language', 'zh-CN', '--width', '200', '--no-color']);
  assert.match(detailsZh.stdout, /子代理 2: scout \(Gemini 3\.8 Flash \(Medium\)\) running, helper \(flash_lite\) completed/);
  for (const line of run(payload, ['--details', '--width', '50', '--no-color']).stdout.trimEnd().split('\n')) {
    assert.ok(displayWidth(line) <= 50);
  }
});

test('modernized --preview reflects agy 1.5.9, Gemini 4 Hydrogen (XHigh) and Argon weekly quota', () => {
  const jsonResult = run({}, ['--json', '--preview']);
  assert.equal(jsonResult.status, 0);
  const metrics = JSON.parse(jsonResult.stdout);
  assert.equal(metrics.model, 'Gemini 4 Hydrogen (XHigh)');
  assert.equal(metrics.context.usedPercentage, 44.2);
  assert.equal(metrics.cacheRate.basis, 'separate-input-cli-1.5.9');
  assert.ok(Math.abs(metrics.cacheRate.percentage - 98.91) < 0.05);
  assert.equal(metrics.quotas.length, 5);
  assert.ok(metrics.quotas.some(q => q.id === 'gemini-argon-wtu-weekly'));

  const zhResult = run({}, ['--preview', '--language', 'zh-CN', '--no-color']);
  assert.equal(zhResult.status, 0);
  assert.match(zhResult.stdout, /上下文 44\.2%.*缓存 98\.9%/);
  assert.match(zhResult.stdout, /^Gemini\s+剩余/m);
  assert.match(zhResult.stdout, /^Argon\s+剩余/m);
  assert.match(zhResult.stdout, /^Claude\s+剩余/m);
});

test('CLI contract preserves output and cacheCreationTokens without fabricating streaming TPS or TTFT', () => {
  const payload = {
    version: '1.5.9',
    model: { id: 'gemini-4-hydrogen-xhigh', display_name: 'Gemini 4 Hydrogen (XHigh)' },
    context_window: {
      used_percentage: 25,
      context_window_size: 1000000,
      current_usage: { input_tokens: 100, output_tokens: 3205, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 },
    },
    streaming_duration: 22.54,
    time_to_first_token: 4.78,
  };
  const metrics = normalize(payload);
  assert.equal(metrics.outputTokens, 3205);
  assert.equal(metrics.cacheCreationTokens, 50);
  assert.equal(metrics.cacheRate.reason, 'unverified-cache-write');
  assert.equal(Object.hasOwn(metrics, 'tps'), false);
  assert.equal(Object.hasOwn(metrics, 'e2eTps'), false);
  assert.equal(Object.hasOwn(metrics, 'ttftSeconds'), false);
  const rendered = render(metrics, { color: false, details: true, width: 120 });
  assert.match(rendered, /Output 3\.2K/);
  assert.match(rendered, /Cache write 50/);
  assert.doesNotMatch(rendered, /tok\/s|TTFT/i);
});
