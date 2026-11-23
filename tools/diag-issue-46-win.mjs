import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ensureDesktopLaunchConfig, inspectDesktopLaunch, parseLnkBuffer } from '../compat/launch-config.mjs';
import { runRelaunchWorker } from '../compat/debug-relaunch-worker.mjs';

const execFileAsync = promisify(execFile);

async function runPs(cmd) {
  const encoded = Buffer.from(cmd, 'utf16le').toString('base64');
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 15000 },
  );
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

console.log('=== 1. Windows Desktop Path Discovery ===');
const psPaths = await runPs(`
  $out = @{
    getFolderPath = [Environment]::GetFolderPath('Desktop')
    userShellDesktop = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders' -Name Desktop -ErrorAction SilentlyContinue).Desktop
    shellDesktop = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders' -Name Desktop -ErrorAction SilentlyContinue).Desktop
    oneDrive = $env:OneDrive
    oneDriveCommercial = $env:OneDriveCommercial
    oneDriveConsumer = $env:OneDriveConsumer
  }
  $out | ConvertTo-Json -Compress
`);
console.log('PowerShell Desktop Paths:', psPaths.stdout);

console.log('\n=== 2. Real WScript.Shell .lnk + OneDrive Desktop Repro ===');
const home = await mkdtemp(join(tmpdir(), 'win46-home-'));
try {
  const startMenu = join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const oneDriveDesktop = join(home, 'OneDrive', 'Desktop');
  const settingsPath = join(home, 'AppData', 'Local', 'settings.json');
  await mkdir(startMenu, { recursive: true });
  await mkdir(oneDriveDesktop, { recursive: true });

  const startMenuLnk = join(startMenu, 'Antigravity.lnk');
  const oneDriveLnk = join(oneDriveDesktop, 'Antigravity.lnk');
  const targetExe = process.execPath;

  const createLnkScript = `
    $ws = New-Object -ComObject WScript.Shell
    $s1 = $ws.CreateShortcut('${startMenuLnk.replace(/'/g, "''")}')
    $s1.TargetPath = '${targetExe.replace(/'/g, "''")}'
    $s1.Arguments = '--remote-debugging-port=0 --remote-debugging-address=127.0.0.1'
    $s1.Save()
    $s2 = $ws.CreateShortcut('${oneDriveLnk.replace(/'/g, "''")}')
    $s2.TargetPath = '${targetExe.replace(/'/g, "''")}'
    $s2.Arguments = ''
    $s2.Save()
  `;
  await runPs(createLnkScript);

  const env = { ...process.env, OneDrive: join(home, 'OneDrive'), APPDATA: join(home, 'AppData', 'Roaming') };
  const inspectRes = await inspectDesktopLaunch({ platform: 'win32', home, env });
  const ensureRes = await ensureDesktopLaunchConfig({ platform: 'win32', home, env, settingsPath });
  const oneDriveParsed = parseLnkBuffer(await readFile(oneDriveLnk));

  console.log('inspectDesktopLaunch:', JSON.stringify(inspectRes));
  console.log('ensureDesktopLaunchConfig:', JSON.stringify(ensureRes));
  console.log('OneDrive .lnk args after ensure:', JSON.stringify(oneDriveParsed.args));
} finally {
  await rm(home, { recursive: true, force: true });
}

console.log('\n=== 3. Real Windows taskkill + spawn via runRelaunchWorker ===');
const workerDir = await mkdtemp(join(tmpdir(), 'win46-worker-'));
try {
  const outFile = join(workerDir, 'spawned.json');
  const targetScript = join(workerDir, 'target.mjs');
  await writeFile(
    targetScript,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(outFile)}, JSON.stringify({ pid: process.pid, argv: process.argv.slice(2), hasElectronRunAsNode: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE') }));\n`,
    'utf8',
  );

  const dummy = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {
    stdio: 'ignore',
    detached: false,
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('Dummy PID:', dummy.pid);

  const t0 = Date.now();
  const res = await runRelaunchWorker(
    {
      platform: 'win32',
      pids: [dummy.pid],
      targetPath: process.execPath,
      debugArgs: [targetScript, '--remote-debugging-port=0'],
    },
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ANTIGRAVITY_TEST: '1' },
      quitTimeoutMs: 5000,
    },
  );
  console.log('runRelaunchWorker result (elapsed ' + (Date.now() - t0) + 'ms):', JSON.stringify(res));

  await new Promise(r => setTimeout(r, 1000));
  try {
    const spawned = await readFile(outFile, 'utf8');
    console.log('Spawned target output:', spawned);
  } catch (err) {
    console.log('Spawned target output MISSING:', err.message);
  }
  try { dummy.kill('SIGKILL'); } catch {}
} finally {
  await rm(workerDir, { recursive: true, force: true });
}
