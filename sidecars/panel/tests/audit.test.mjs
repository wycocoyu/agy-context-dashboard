import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AntigravityClient } from '../client.mjs';
import { makeFoldCache, buildSessionAudit, SessionAuditService } from '../audit.mjs';

const CID = '11111111-2222-3333-4444-555555555555';

test('makeFoldCache enforces maxEntries LRU and idle auto-sweep', async () => {
  let clock = 1000;
  const cache = makeFoldCache({ maxEntries: 4, idleMs: 40, now: () => clock });
  cache.set('a', 1, 'm1');
  cache.set('b', 2, 'm1');
  cache.set('c', 3, 'm1');
  cache.set('d', 4, 'm1');
  assert.equal(cache.get('a', 'm1'), 1); // touches a -> oldest is b
  cache.set('e', 5, 'm1');
  assert.equal(cache.size, 4);
  assert.equal(cache.get('b', 'm1'), undefined);
  assert.equal(cache.get('a', 'wrong-mark'), undefined);

  clock += 50;
  await new Promise(resolve => setTimeout(resolve, 65));
  assert.equal(cache.size, 0);
  cache.dispose();
});

test('buildSessionAudit aggregates file activity, commands, and step filters cleanly', () => {
  const steps = [
    { type: 'CORTEX_STEP_TYPE_USER_INPUT', status: 'CORTEX_STEP_STATUS_DONE', metadata: { createdAt: '2026-11-21T08:00:00Z' }, userInput: { items: true } },
    {
      type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
      status: 'CORTEX_STEP_STATUS_DONE',
      metadata: {
        createdAt: '2026-11-21T08:00:01Z',
        generatorModel: 'Gemini 4 Neon (High)',
        modelUsage: { inputTokens: '1000', thinkingOutputTokens: '400', responseOutputTokens: '100', outputTokens: '500', cacheReadTokens: '2000' },
      },
      plannerResponse: { thinking: true, response: true, toolCalls: [{ id: 't1', name: 'read_file' }] },
    },
    {
      type: 'CORTEX_STEP_TYPE_VIEW_FILE',
      status: 'CORTEX_STEP_STATUS_DONE',
      metadata: { toolCall: { id: 't1', name: 'read_file' } },
      viewFile: { absolutePathUri: 'file:///repo/src/app.js' },
    },
    {
      type: 'CORTEX_STEP_TYPE_CODE_ACTION',
      status: 'CORTEX_STEP_STATUS_DONE',
      metadata: { toolCall: { id: 't2', name: 'edit_file' } },
      codeAction: { actionResult: { edit: { absoluteUri: 'file:///repo/src/app.js' } }, diffStats: { additions: 12, deletions: 4 } },
    },
    {
      type: 'CORTEX_STEP_TYPE_GENERIC',
      status: 'CORTEX_STEP_STATUS_DONE',
      metadata: { toolCall: { id: 't3', name: 'grep_search' } },
      generic: { args: { SearchPath: '"/repo/src"' } },
    },
    {
      type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
      status: 'CORTEX_STEP_STATUS_DONE',
      metadata: { startedAt: '2026-11-21T08:00:05.000Z', completedAt: '2026-11-21T08:00:06.500Z' },
      runCommand: { commandLine: 'npm test', cwd: '/repo', exitCode: 0, shellName: 'zsh' },
    },
    { type: 'CORTEX_STEP_TYPE_COMPACTION', status: 'CORTEX_STEP_STATUS_DONE', metadata: {} },
  ];
  const generators = [
    { stepIndices: [1], chatModel: { modelDisplayName: 'Gemini 4 Neon (High)', usage: { messageId: 'm1', inputTokens: '1000', cacheReadTokens: '2000', outputTokens: '500' } } },
  ];
  const transcriptSteps = new Map([[0, { tokens: 120 }]]);
  const audit = buildSessionAudit({ conversationId: CID, steps, generators, transcriptSteps });

  assert.equal(audit.totalSteps, 7);
  assert.equal(audit.totalFiles, 2);
  assert.equal(audit.totalCommands, 1);
  assert.deepEqual(audit.counts, { user: 1, thinking: 1, tools: 5, answer: 1, compactions: 1 });

  const appFile = audit.files.find(f => f.name === 'app.js');
  assert.equal(appFile.reads, 1);
  assert.equal(appFile.edits, 1);
  assert.equal(appFile.additions, 12);
  assert.equal(appFile.deletions, 4);
  assert.deepEqual(appFile.stepIndices, [2, 3]);

  const searchDir = audit.files.find(f => f.name === 'src');
  assert.equal(searchDir.path, '/repo/src');
  assert.equal(searchDir.searches, 1);

  assert.equal(audit.commands[0].command, 'npm test');
  assert.equal(audit.commands[0].exitCode, 0);
  assert.equal(audit.commands[0].durationMs, 1500);

  assert.equal(audit.steps[0].contextDeltaTokens, 120);
  assert.equal(audit.steps[0].deltaEstimated, true);
  assert.equal(audit.steps[1].contextDeltaTokens, 3000);
  assert.ok(audit.steps[1].categories.includes('thinking'));
  assert.ok(audit.steps[1].categories.includes('answer'));
  assert.ok(audit.steps[1].categories.includes('tools'));
});

test('SessionAuditService streams steps without buffering text bodies and caches in fold cache', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-audit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, CID, '.system_generated', 'logs'), { recursive: true });
  await writeFile(join(dir, CID, '.system_generated', 'logs', 'transcript.jsonl'), '{"step_index":0,"type":"USER_INPUT","content":"hello world"}\n');

  let stepCalls = 0;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const method = req.url.split('/').at(-1);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (method === 'GetAllCascadeTrajectories') {
      res.end(JSON.stringify({ trajectorySummaries: { [CID]: { stepCount: 2, lastModifiedTime: '2026-11-21T08:00:00Z', status: 'CASCADE_RUN_STATUS_IDLE' } } }));
      return;
    }
    if (method === 'GetCascadeTrajectorySteps') {
      stepCalls++;
      if (input.stepOffset === 0) {
        res.end(JSON.stringify({
          steps: [
            { type: 'CORTEX_STEP_TYPE_USER_INPUT', metadata: {}, userInput: { items: [{ text: 'SECRET_USER_TEXT_' + 'x'.repeat(30000) }] } },
            { type: 'CORTEX_STEP_TYPE_RUN_COMMAND', metadata: { startedAt: '2026-11-21T08:00:00Z', completedAt: '2026-11-21T08:00:01Z' }, runCommand: { commandLine: 'echo ok', exitCode: 0, combinedOutput: 'SECRET_STDOUT_' + 'y'.repeat(30000) } },
          ],
        }));
      } else {
        res.end(JSON.stringify({ steps: [] }));
      }
      return;
    }
    res.end(JSON.stringify({ generatorMetadata: [] }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const port = server.address().port;
  const client = new AntigravityClient({
    paths: () => ({ log: 'fixture' }),
    readLog: async () => `listening on random port at ${port} for HTTP\n`,
    processes: async () => [{ ProcessId: 77, CommandLine: 'language_server --standalone --csrf_token=tok', Ports: [port] }],
  });

  const service = new SessionAuditService(client, { transcriptRoot: dir, idleMs: 5000 });
  t.after(() => service.dispose());
  const first = await service.getAudit(CID);
  assert.equal(first.commands.length, 1);
  assert.equal(first.commands[0].command, 'echo ok');
  assert.equal(JSON.stringify(first).includes('SECRET_'), false);

  const callsAfterFirst = stepCalls;
  await service.getAudit(CID);
  assert.equal(stepCalls, callsAfterFirst);
});

test('AntigravityClient.streamContextWindowUsage extracts frame-0 tokenGroups while discarding heavy trajectory data', async t => {
  const rpcStats = [];
  const server = createServer(async (req, res) => {
    for await (const _ of req) {}
    const payload = JSON.stringify({
      update: {
        conversationId: CID,
        mainTrajectoryUpdate: { blob: 'Z'.repeat(512 * 1024) },
        contextWindowUsage: {
          generatorMetadataIndex: 5,
          lastStepIndex: 12,
          estimatedTokensUsed: 10000,
          maxContextTokens: 512000,
          tokenGroups: [
            { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 2000 },
            { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 8000 },
          ],
        },
        creditUsageSummary: {
          consumedCredits: [{ firstStepIndex: 0, lastStepIndex: 12, credits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: 10 }] }],
        },
      },
    });
    const frame = Buffer.allocUnsafe(5 + Buffer.byteLength(payload));
    frame[0] = 0;
    frame.writeUInt32BE(Buffer.byteLength(payload), 1);
    frame.write(payload, 5, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/connect+json' });
    res.write(frame.subarray(0, 100));
    res.write(frame.subarray(100));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const port = server.address().port;
  const client = new AntigravityClient({
    onRpc: s => rpcStats.push(s),
    paths: () => ({ log: 'fixture' }),
    readLog: async () => `listening on random port at ${port} for HTTP\n`,
    processes: async () => [{ ProcessId: 88, CommandLine: 'language_server --standalone --csrf_token=tok', Ports: [port] }],
  });
  const update = await client.streamContextWindowUsage(CID);
  assert.equal(update.contextWindowUsage.estimatedTokensUsed, 10000);
  assert.equal(update.contextWindowUsage.tokenGroups.length, 2);
  assert.equal(update.creditUsageSummary.consumedCredits[0].credits[0].creditAmount, 10);
  assert.ok(rpcStats[0].bytes > 500_000);
  assert.ok(rpcStats[0].retainedBytes < 4096);
});
