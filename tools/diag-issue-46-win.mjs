import { execFile, spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ensureDesktopLaunchConfig, inspectDesktopLaunch, parseLnkBuffer } from '../compat/launch-config.mjs';
import { runRelaunchWorker } from '../compat/debug-relaunch-worker.mjs';

const execFileAsync = promisify(execFile);
const q = s => s.replace(/'/g, "''");
async function ps(cmd) {
  const encoded = Buffer.from(cmd, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 20000 });
  return stdout.trim();
}

console.log('=== A. OneDrive-redirected Desktop with real .lnk targeting Antigravity.exe ===');
const home = await mkdtemp(join(tmpdir(), 'win46-home-'));
try {
  const exeDir = join(home, 'AppData', 'Local', 'Programs', 'antigravity');
  const startMenu = join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const oneDriveDesktop = join(home, 'OneDrive', 'Desktop');
  await mkdir(exeDir, { recursive: true });
  await mkdir(startMenu, { recursive: true });
  await mkdir(oneDriveDesktop, { recursive: true });
  const exe = join(exeDir, 'Antigravity.exe');
  await copyFile(process.execPath, exe);
  const smLnk = join(startMenu, 'Antigravity.lnk');
  const odLnk = join(oneDriveDesktop, 'Antigravity.lnk');
  await ps(`$ws = New-Object -ComObject WScript.Shell
$a = $ws.CreateShortcut('${q(smLnk)}'); $a.TargetPath='${q(exe)}'; $a.Arguments='--remote-debugging-port=0 --remote-debugging-address=127.0.0.1'; $a.Save()
$b = $ws.CreateShortcut('${q(odLnk)}'); $b.TargetPath='${q(exe)}'; $b.Save()`);
  const env = { ...process.env, APPDATA: join(home, 'AppData', 'Roaming') };
  const settingsPath = join(home, 'AppData', 'Local', 'settings.json');
  const inspect = await inspectDesktopLaunch({ platform: 'win32', home, env });
  console.log('inspectDesktopLaunch:', JSON.stringify(inspect));
  const ensure = await ensureDesktopLaunchConfig({ platform: 'win32', home, env, settingsPath });
  console.log('ensureDesktopLaunchConfig:', JSON.stringify(ensure));
  console.log('OneDrive Desktop lnk args:', JSON.stringify(parseLnkBuffer(await readFile(odLnk)).args));
  console.log('OneDrive lnk scanned?', ensure.entrypoints.includes(odLnk));
} finally {
  await rm(home, { recursive: true, force: true });
}

console.log('\n=== B. taskkill graceful quit on a WINDOWED process (notepad) vs windowless node ===');
const dir = await mkdtemp(join(tmpdir(), 'win46-worker-'));
try {
  const out = join(dir, 'spawned.json');
  const target = join(dir, 'target.mjs');
  await writeFile(target, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));`);
  const pidText = await ps(`$p = Start-Process notepad.exe -PassThru; Start-Sleep -Seconds 3; (Get-Process -Name notepad -ErrorAction SilentlyContinue | Select-Object -First 1).Id`);
  const pid = Number(pidText);
  console.log('notepad pid:', pidText);
  if (Number.isSafeInteger(pid) && pid > 0) {
    const t0 = Date.now();
    const res = await runRelaunchWorker(
      { platform: 'win32', pids: [pid], targetPath: process.execPath, debugArgs: [target, '--remote-debugging-port=0'] },
      { quitTimeoutMs: 8000 },
    );
    console.log(`windowed worker result (${Date.now() - t0}ms):`, JSON.stringify(res));
    await new Promise(r => setTimeout(r, 1000));
    console.log('spawned file exists:', await readFile(out, 'utf8').then(() => true, () => false));
  }
  const dummy = spawn(process.execPath, ['-e', 'setInterval(()=>{},10000)'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 300));
  const res2 = await runRelaunchWorker(
    { platform: 'win32', pids: [dummy.pid], targetPath: process.execPath, debugArgs: [target] },
    { quitTimeoutMs: 3000 },
  );
  console.log('windowless worker result:', JSON.stringify(res2));
  try { dummy.kill(); } catch {}
} finally {
  await rm(dir, { recursive: true, force: true });
}
