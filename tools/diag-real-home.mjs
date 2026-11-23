import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ensureDesktopLaunchConfig, inspectDesktopLaunch, parseLnkBuffer } from '../compat/launch-config.mjs';

const ps = cmd => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).trim();
const home = homedir();
const desktop = join(home, 'RedirectedDesk');
const exeDir = join(home, 'agapp');
mkdirSync(desktop, { recursive: true });
mkdirSync(exeDir, { recursive: true });
const exe = join(exeDir, 'Antigravity.exe');
copyFileSync(process.execPath, exe);

execFileSync('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Desktop', '/t', 'REG_EXPAND_SZ', '/d', '%USERPROFILE%\\RedirectedDesk', '/f']);
console.log('registry Desktop =', ps("(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').Desktop"));

const lnk = join(desktop, 'Antigravity.lnk');
ps(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.TargetPath='${exe}'; $s.Save()`);
console.log('lnk created:', lnk, 'args before =', JSON.stringify(parseLnkBuffer(readFileSync(lnk)).args));

const before = await inspectDesktopLaunch();
console.log('inspect (real home, default args):', JSON.stringify(before));
assert.ok(before.entrypoints.some(p => p.toLowerCase() === lnk.toLowerCase()), 'redirected desktop shortcut must be discovered via registry');
assert.equal(before.configured, false);

const result = await ensureDesktopLaunchConfig();
console.log('ensure:', JSON.stringify(result));
const after = parseLnkBuffer(readFileSync(lnk)).args;
console.log('args after =', JSON.stringify(after));
assert.match(after, /--remote-debugging-port=0/);
assert.match(after, /--remote-debugging-address=127\.0\.0\.1/);
console.log('REAL-HOME REGISTRY E2E: PASS');
