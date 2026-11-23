import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { inspectHostDebugState, scheduleHostRelaunch } from '../compat/debug-relaunch.mjs';

const run = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exe = process.env.AG_EXE;
console.log('exe:', exe, 'exists:', existsSync(exe));

async function snapshot(label) {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" | Select-Object ProcessId,ParentProcessId,@{n='dbg';e={$_.CommandLine -match 'remote-debugging-port'}},@{n='type';e={if($_.CommandLine -match '--type=([a-z-]+)'){$Matches[1]}else{'MAIN'}}} | ConvertTo-Json -Compress"],
    { windowsHide: true });
  const raw = stdout.trim() ? JSON.parse(stdout) : [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const mains = rows.filter(r => r.type === 'MAIN');
  console.log(`[${label}] total=${rows.length} main=${JSON.stringify(mains)}`);
  return mains;
}

console.log('\n=== 1. launch host WITHOUT debug flag (like desktop shortcut) ===');
const host = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
host.unref();
await sleep(15000);
let mains = await snapshot('after-launch');

const dataDir = await mkdtemp(join(tmpdir(), 'pulse-data-'));
const resources = join(exe, '..', 'resources');
const state = await inspectHostDebugState({ appResources: resources });
console.log('inspectHostDebugState:', JSON.stringify(state));

console.log('\n=== 2. Pulse auto relaunch (real scheduleHostRelaunch) ===');
const t0 = Date.now();
const res = await scheduleHostRelaunch({ dataDir, appResources: resources, reason: 'auto' });
console.log('scheduleHostRelaunch:', JSON.stringify({ scheduled: res.scheduled, reason: res.reason, pids: res.pids, targetPath: res.targetPath }));
for (let i = 0; i < 20; i++) {
  await sleep(2000);
  await snapshot(`t+${Math.round((Date.now() - t0) / 1000)}s`);
}

console.log('\n=== 3. host main.log tail ===');
const base = join(process.env.APPDATA, 'Antigravity', 'logs');
if (existsSync(base)) {
  const dirs = readdirSync(base).map(n => join(base, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const d of dirs.slice(0, 3)) {
    const f = join(d, 'main.log');
    if (existsSync(f)) console.log(`--- ${f}\n` + readFileSync(f, 'utf8').split(/\r?\n/).slice(-25).join('\n'));
  }
} else console.log('no logs dir', base);
await run('taskkill', ['/F', '/IM', 'Antigravity.exe']).catch(() => {});
