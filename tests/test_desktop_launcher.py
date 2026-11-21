import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import stat
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

_launcher_spec = importlib.util.spec_from_file_location('pulse_desktop_launcher', ROOT / 'compat' / 'desktop_launcher.py')
launcher = importlib.util.module_from_spec(_launcher_spec)
_launcher_spec.loader.exec_module(launcher)

_manager_spec = importlib.util.spec_from_file_location('pulse_manager_test', ROOT / 'manage.py')
manager = importlib.util.module_from_spec(_manager_spec)
_manager_spec.loader.exec_module(manager)


class DesktopLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ag-launcher-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / 'home'
        self.local = self.root / 'local'
        self.home.mkdir(parents=True, exist_ok=True)
        self.local.mkdir(parents=True, exist_ok=True)

    def _make_darwin_app(self, with_icon=True, name='Antigravity.app'):
        bundle = self.root / 'apps' / name
        asar = bundle / 'Contents' / 'Resources' / 'app.asar'
        exe = bundle / 'Contents' / 'MacOS' / 'Antigravity'
        asar.parent.mkdir(parents=True, exist_ok=True)
        exe.parent.mkdir(parents=True, exist_ok=True)
        asar.write_bytes(b'asar')
        exe.write_bytes(b'#!/bin/sh\n')
        os.chmod(exe, 0o755)
        icon = bundle / 'Contents' / 'Resources' / 'icon.icns'
        if with_icon:
            icon.write_bytes(b'icns-fixture')
        return bundle, asar, exe, icon

    def _make_win32_app(self, exe_name='Antigravity.exe', folder='antigravity'):
        app_dir = self.root / folder
        asar = app_dir / 'resources' / 'app.asar'
        exe = app_dir / exe_name
        asar.parent.mkdir(parents=True, exist_ok=True)
        asar.write_bytes(b'asar')
        exe.write_bytes(b'MZ')
        return asar, exe

    def _make_linux_app(self, exe_name='antigravity'):
        app_dir = self.root / 'opt-antigravity'
        asar = app_dir / 'resources' / 'app.asar'
        exe = app_dir / exe_name
        asar.parent.mkdir(parents=True, exist_ok=True)
        asar.write_bytes(b'asar')
        exe.write_bytes(b'#!/bin/sh\n')
        os.chmod(exe, 0o755)
        return asar, exe

    def test_resolve_desktop_target_and_launcher_paths(self):
        bundle, d_asar, d_exe, d_icon = self._make_darwin_app()
        d_target = launcher.resolve_desktop_target(d_asar, platform='darwin')
        self.assertEqual(d_target['bundle'], bundle)
        self.assertEqual(d_target['executable'], d_exe)
        self.assertEqual(d_target['icon'], d_icon)
        with self.assertRaises(RuntimeError):
            launcher.resolve_desktop_target(self.root / 'not-a-bundle' / 'resources' / 'app.asar', platform='darwin')

        w_asar, w_exe = self._make_win32_app('antigravity.exe', folder='win-fallback')
        self.assertEqual(launcher.resolve_desktop_target(w_asar, platform='win32')['executable'], w_exe)
        w2_asar, w2_exe = self._make_win32_app('Antigravity.exe', folder='win-primary')
        self.assertEqual(launcher.resolve_desktop_target(w2_asar, platform='win32')['executable'], w2_exe)

        l_asar, l_exe = self._make_linux_app('Antigravity')
        self.assertEqual(launcher.resolve_desktop_target(l_asar, platform='linux')['executable'], l_exe)

        self.assertEqual(launcher.launcher_path(self.home, self.local, 'darwin'),
                         self.home / 'Applications' / 'Antigravity (Debug).app')
        self.assertEqual(launcher.launcher_path(self.home, self.local, 'linux'),
                         self.home / '.local' / 'share' / 'applications' / 'antigravity-pulse-debug.desktop')
        self.assertEqual(launcher.launcher_path(self.home, self.local, 'win32'),
                         self.local / 'AntigravityPulse' / 'Launch Antigravity (Debug).cmd')

    def test_darwin_install_inspect_uninstall_and_icon_toggle(self):
        bundle, asar, _, icon = self._make_darwin_app(with_icon=True)
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='darwin')['installed'])

        codesign_calls = []
        with patch.object(launcher.shutil, 'which', return_value='/usr/bin/codesign'), \
             patch.object(launcher.subprocess, 'run', side_effect=lambda cmd, **kw: codesign_calls.append(cmd) or types.SimpleNamespace(returncode=0)):
            result = launcher.install_launcher(self.home, self.local, asar, platform='darwin')

        dest = Path(result['path'])
        self.assertTrue(result['installed'])
        self.assertEqual(codesign_calls, [['/usr/bin/codesign', '--force', '--sign', '-', str(dest)]])
        self.assertTrue(launcher.inspect_launcher(self.home, self.local, platform='darwin')['installed'])

        plist = plistlib.loads((dest / 'Contents' / 'Info.plist').read_bytes())
        self.assertEqual(plist['CFBundleIdentifier'], launcher.BUNDLE_ID)
        self.assertEqual(plist['CFBundleName'], 'Antigravity (Debug)')
        self.assertEqual(plist['CFBundleDisplayName'], 'Antigravity (Debug)')
        self.assertEqual(plist['CFBundleExecutable'], 'launcher')
        self.assertEqual(plist['CFBundlePackageType'], 'APPL')
        self.assertTrue(plist['NSHighResolutionCapable'])
        self.assertEqual(plist['CFBundleIconFile'], 'icon.icns')
        self.assertEqual((dest / 'Contents' / 'Resources' / 'icon.icns').read_bytes(), b'icns-fixture')

        script_path = dest / 'Contents' / 'MacOS' / 'launcher'
        if os.name == 'posix':
            self.assertTrue(script_path.stat().st_mode & stat.S_IXUSR)
        script = script_path.read_text(encoding='utf-8')
        escaped_bundle = str(bundle).replace('\\', '\\\\').replace('"', '\\"')
        self.assertIn('unset ELECTRON_RUN_AS_NODE', script)
        self.assertIn('ps axo pid=,command=', script)
        self.assertIn('--type=', script)
        self.assertIn('--remote-debugging-port=0 --remote-debugging-address=127.0.0.1', script)
        self.assertIn('osascript', script)
        self.assertIn(f'tell application "{escaped_bundle}" to quit', script)
        self.assertIn('kill -0', script)
        self.assertIn('kill -TERM', script)
        self.assertIn('sleep 0.3', script)
        if os.name == 'posix':
            syntax = subprocess.run(['/bin/sh', '-n', str(script_path)], capture_output=True, text=True)
            self.assertEqual(syntax.returncode, 0, syntax.stderr)

        icon.unlink()
        with patch.object(launcher.shutil, 'which', return_value=None):
            launcher.install_launcher(self.home, self.local, asar, platform='darwin')
        plist_no_icon = plistlib.loads((dest / 'Contents' / 'Info.plist').read_bytes())
        self.assertNotIn('CFBundleIconFile', plist_no_icon)
        self.assertFalse((dest / 'Contents' / 'Resources' / 'icon.icns').exists())

        removed = launcher.uninstall_launcher(self.home, self.local, platform='darwin')
        self.assertTrue(removed['removed'])
        self.assertFalse(dest.exists())
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='darwin')['installed'])
        self.assertFalse(launcher.uninstall_launcher(self.home, self.local, platform='darwin')['removed'])

    @unittest.skipUnless(os.name == 'posix', 'POSIX shell launcher script test')
    def test_darwin_generated_shell_script_branches_with_mocked_binaries(self):
        bundle, asar, _, _ = self._make_darwin_app(with_icon=False)
        with patch.object(launcher.shutil, 'which', return_value=None):
            res = launcher.install_launcher(self.home, self.local, asar, platform='darwin')
        script_path = Path(res['path']) / 'Contents' / 'MacOS' / 'launcher'

        mock_bin = self.root / 'mock-bin'
        mock_bin.mkdir()
        open_log = self.root / 'open.log'
        ps_out = self.root / 'ps.out'
        osascript_code = self.root / 'osa.code'

        (mock_bin / 'open').write_text(f'#!/bin/sh\nprintf "%s\\n" "$*" > "{open_log}"\n', encoding='utf-8')
        (mock_bin / 'ps').write_text(f'#!/bin/sh\ncat "{ps_out}"\n', encoding='utf-8')
        (mock_bin / 'osascript').write_text(
            f'#!/bin/sh\ncode=$(cat "{osascript_code}")\nexit "$code"\n', encoding='utf-8'
        )
        for name in ('open', 'ps', 'osascript'):
            os.chmod(mock_bin / name, 0o755)

        env = {'PATH': f'{mock_bin}:/bin:/usr/bin', 'ELECTRON_RUN_AS_NODE': '1', 'ANTIGRAVITY_TEST': 'strip'}

        ps_out.write_text('', encoding='utf-8')
        osascript_code.write_text('0', encoding='utf-8')
        run1 = subprocess.run([str(script_path), '/tmp/ws'], env=env, capture_output=True, text=True)
        self.assertEqual(run1.returncode, 0, run1.stderr)
        self.assertEqual(
            open_log.read_text(encoding='utf-8').strip(),
            f'-a {bundle} --args --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 /tmp/ws',
        )

        open_log.unlink()
        ps_out.write_text(
            f'12345 {bundle}/Contents/MacOS/Antigravity --remote-debugging-port=0 --remote-debugging-address=127.0.0.1\n',
            encoding='utf-8',
        )
        run2 = subprocess.run([str(script_path)], env=env, capture_output=True, text=True)
        self.assertEqual(run2.returncode, 0, run2.stderr)
        self.assertEqual(open_log.read_text(encoding='utf-8').strip(), f'-a {bundle}')

        open_log.unlink()
        ps_out.write_text(f'12345 {bundle}/Contents/MacOS/Antigravity\n', encoding='utf-8')
        osascript_code.write_text('1', encoding='utf-8')
        run3 = subprocess.run([str(script_path)], env=env, capture_output=True, text=True)
        self.assertEqual(run3.returncode, 0, run3.stderr)
        self.assertFalse(open_log.exists())

    def test_linux_and_win32_install_inspect_uninstall(self):
        l_asar, l_exe = self._make_linux_app()
        l_res = launcher.install_launcher(self.home, self.local, l_asar, platform='linux')
        l_dest = Path(l_res['path'])
        self.assertTrue(l_dest.is_file())
        if os.name == 'posix':
            self.assertTrue(l_dest.stat().st_mode & stat.S_IXUSR)
        l_text = l_dest.read_text(encoding='utf-8')
        escaped_l_exe = str(l_exe).replace('\\', '\\\\').replace('"', '\\"')
        self.assertIn('X-Antigravity-Pulse-Launcher=true', l_text)
        self.assertIn(f'Exec="{escaped_l_exe}" --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 %U', l_text)
        self.assertTrue(launcher.inspect_launcher(self.home, self.local, platform='linux')['installed'])
        self.assertTrue(launcher.uninstall_launcher(self.home, self.local, platform='linux')['removed'])
        self.assertFalse(l_dest.exists())

        w_asar, w_exe = self._make_win32_app(folder='Programs & Spaces/antigravity')
        w_res = launcher.install_launcher(self.home, self.local, w_asar, platform='win32')
        w_dest = Path(w_res['path'])
        self.assertTrue(w_dest.is_file())
        w_text = w_dest.read_text(encoding='utf-8')
        self.assertIn('REM AG_PULSE_LAUNCHER_V1', w_text)
        self.assertIn(
            f"powershell.exe -NoProfile -WindowStyle Hidden -Command \"Start-Process -FilePath '{w_exe}' "
            "-ArgumentList '--remote-debugging-port=0','--remote-debugging-address=127.0.0.1' -WindowStyle Normal\"",
            w_text,
        )
        self.assertTrue(launcher.inspect_launcher(self.home, self.local, platform='win32')['installed'])
        self.assertTrue(launcher.uninstall_launcher(self.home, self.local, platform='win32')['removed'])
        self.assertFalse(w_dest.exists())

    def test_refuses_symlinks_and_foreign_launchers_without_mutation(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (outside / 'keep.txt').write_text('keep', encoding='utf-8')

        _, d_asar, _, _ = self._make_darwin_app()
        l_asar, _ = self._make_linux_app()
        w_asar, _ = self._make_win32_app()

        d_dest = launcher.launcher_path(self.home, self.local, 'darwin')
        d_dest.mkdir(parents=True)
        (d_dest / 'Contents').mkdir()
        (d_dest / 'Contents' / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.foreign.app'}))
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='darwin')['installed'])
        with self.assertRaises(RuntimeError):
            launcher.install_launcher(self.home, self.local, d_asar, platform='darwin')
        with self.assertRaises(RuntimeError):
            launcher.uninstall_launcher(self.home, self.local, platform='darwin')
        self.assertTrue((d_dest / 'Contents' / 'Info.plist').exists())
        shutil.rmtree(d_dest)

        l_dest = launcher.launcher_path(self.home, self.local, 'linux')
        l_dest.parent.mkdir(parents=True, exist_ok=True)
        l_dest.write_text('[Desktop Entry]\nName=Foreign\n', encoding='utf-8')
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='linux')['installed'])
        with self.assertRaises(RuntimeError):
            launcher.install_launcher(self.home, self.local, l_asar, platform='linux')
        with self.assertRaises(RuntimeError):
            launcher.uninstall_launcher(self.home, self.local, platform='linux')
        self.assertIn('Name=Foreign', l_dest.read_text(encoding='utf-8'))
        l_dest.unlink()

        w_dest = launcher.launcher_path(self.home, self.local, 'win32')
        w_dest.parent.mkdir(parents=True, exist_ok=True)
        w_dest.write_text('@echo off\necho foreign\n', encoding='utf-8')
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='win32')['installed'])
        with self.assertRaises(RuntimeError):
            launcher.install_launcher(self.home, self.local, w_asar, platform='win32')
        with self.assertRaises(RuntimeError):
            launcher.uninstall_launcher(self.home, self.local, platform='win32')
        self.assertIn('echo foreign', w_dest.read_text(encoding='utf-8'))
        w_dest.unlink()

        try:
            d_dest.symlink_to(outside, target_is_directory=True)
            l_dest.symlink_to(outside / 'keep.txt')
            w_dest.symlink_to(outside / 'missing.cmd')
        except OSError:
            self.skipTest('Symlink creation requires OS permission')

        for plat, asar in (('darwin', d_asar), ('linux', l_asar), ('win32', w_asar)):
            self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform=plat)['installed'])
            with self.assertRaises(RuntimeError):
                launcher.install_launcher(self.home, self.local, asar, platform=plat)
            with self.assertRaises(RuntimeError):
                launcher.uninstall_launcher(self.home, self.local, platform=plat)
        self.assertTrue((outside / 'keep.txt').exists())

        d_dest.unlink()
        with patch.object(launcher.shutil, 'which', return_value=None):
            launcher.install_launcher(self.home, self.local, d_asar, platform='darwin')
        (d_dest / 'Contents' / 'Resources' / 'escape').symlink_to(outside, target_is_directory=True)
        self.assertFalse(launcher.inspect_launcher(self.home, self.local, platform='darwin')['installed'])
        with self.assertRaises(RuntimeError):
            launcher.uninstall_launcher(self.home, self.local, platform='darwin')
        self.assertTrue((outside / 'keep.txt').exists())

    def test_launch_desktop_strips_env_and_handles_relaunch_polling(self):
        bundle, d_asar, d_exe, _ = self._make_darwin_app()
        popen_calls = []
        run_calls = []
        sleeps = []

        def fake_popen(cmd, **kw):
            popen_calls.append((cmd, kw))
            return types.SimpleNamespace(pid=999)

        test_env = {
            'PATH': '/usr/bin',
            'ELECTRON_RUN_AS_NODE': '1',
            'ANTIGRAVITY_AGENTAPI_EXE': '/x',
            'ANTIGRAVITY_OTHER': 'secret',
            'USER': 'alice',
        }
        res = launcher.launch_desktop(
            d_asar, relaunch=False, extra_args=('--new-window',), platform='darwin',
            run_fn=lambda *a, **kw: types.SimpleNamespace(returncode=0, stdout=''),
            popen_fn=fake_popen, sleep_fn=sleeps.append, env=test_env,
        )
        self.assertTrue(res['launched'])
        self.assertEqual(res['pid'], 999)
        self.assertEqual(popen_calls[0][0], [str(d_exe), *launcher.DEBUG_ARGS, '--new-window'])
        child_env = popen_calls[0][1]['env']
        self.assertEqual(child_env, {'PATH': '/usr/bin', 'USER': 'alice'})
        self.assertEqual(sleeps, [])

        popen_calls.clear()
        kill_checks = []
        alive_state = {'checks': 0}

        def fake_run(cmd, **kw):
            run_calls.append(cmd)
            if cmd[:2] == ['ps', 'axo']:
                return types.SimpleNamespace(
                    returncode=0,
                    stdout=(
                        f'5001 {d_exe}\n'
                        f'5002 {d_exe} --type=renderer\n'
                        '5003 /usr/bin/other\n'
                    ),
                )
            return types.SimpleNamespace(returncode=0, stdout='')

        def fake_kill(pid, sig):
            kill_checks.append((pid, sig))
            if pid != 5001:
                raise AssertionError(f'Unexpected PID signaled: {pid}')
            if sig == 0:
                alive_state['checks'] += 1
                if alive_state['checks'] <= 2:
                    return None
                raise ProcessLookupError()

        relaunch_res = launcher.launch_desktop(
            d_asar, relaunch=True, platform='darwin',
            run_fn=fake_run, popen_fn=fake_popen, sleep_fn=sleeps.append, kill_fn=fake_kill, env=test_env,
        )
        self.assertTrue(relaunch_res['relaunched'])
        self.assertEqual(relaunch_res['stoppedPids'], [5001])
        escaped_bundle = str(bundle).replace('\\', '\\\\').replace('"', '\\"')
        self.assertIn(['osascript', '-e', f'tell application "{escaped_bundle}" to quit'], run_calls)
        self.assertEqual(sleeps, [0.2, 0.2, 0.3])
        self.assertEqual(len(popen_calls), 1)

        popen_calls.clear()
        kill_checks.clear()
        sleeps.clear()
        sigterm_calls = []

        def persistent_kill(pid, sig):
            if sig == signal.SIGTERM:
                sigterm_calls.append(pid)
                return None
            if len(sigterm_calls) > 0:
                raise ProcessLookupError()
            return None

        launcher.launch_desktop(
            d_asar, relaunch=True, platform='darwin',
            run_fn=fake_run, popen_fn=fake_popen, sleep_fn=sleeps.append, kill_fn=persistent_kill, env=test_env,
        )
        self.assertEqual(sigterm_calls, [5001])
        self.assertEqual(len(popen_calls), 1)

        popen_calls.clear()
        with self.assertRaisesRegex(RuntimeError, 'Timed out'):
            launcher.launch_desktop(
                d_asar, relaunch=True, platform='darwin',
                run_fn=fake_run, popen_fn=fake_popen, sleep_fn=lambda _: None,
                kill_fn=lambda pid, sig: None, env=test_env,
            )
        self.assertEqual(popen_calls, [])

    def test_launch_desktop_linux_and_win32_relaunch(self):
        l_asar, l_exe = self._make_linux_app()
        linux_kills = []
        linux_popen = []
        linux_polls = {'count': 0}

        def linux_run(cmd, **kw):
            return types.SimpleNamespace(returncode=0, stdout=f'7101 {l_exe}\n7102 {l_exe} --type=gpu\n')

        def linux_kill(pid, sig):
            linux_kills.append((pid, sig))
            if sig == 0:
                linux_polls['count'] += 1
                if linux_polls['count'] > 1:
                    raise ProcessLookupError()

        launcher.launch_desktop(
            l_asar, relaunch=True, platform='linux',
            run_fn=linux_run, popen_fn=lambda cmd, **kw: linux_popen.append(cmd) or types.SimpleNamespace(pid=1),
            sleep_fn=lambda _: None, kill_fn=linux_kill, env={'ELECTRON_RUN_AS_NODE': '1'},
        )
        self.assertIn((7101, signal.SIGTERM), linux_kills)
        self.assertFalse(any(pid == 7102 for pid, _ in linux_kills))
        self.assertEqual(linux_popen[0], [str(l_exe), *launcher.DEBUG_ARGS])

        w_asar, w_exe = self._make_win32_app()
        win_runs = []
        win_popen = []
        ps_queries = {'n': 0}

        def win_run(cmd, **kw):
            win_runs.append(cmd)
            if cmd[0] == 'powershell.exe':
                ps_queries['n'] += 1
                return types.SimpleNamespace(returncode=0, stdout='8101\n' if ps_queries['n'] == 1 else '')
            return types.SimpleNamespace(returncode=0, stdout='')

        launcher.launch_desktop(
            w_asar, relaunch=True, platform='win32',
            run_fn=win_run, popen_fn=lambda cmd, **kw: win_popen.append(cmd) or types.SimpleNamespace(pid=2),
            sleep_fn=lambda _: None, env={'ELECTRON_RUN_AS_NODE': '1'},
        )
        self.assertIn(['taskkill', '/PID', '8101'], win_runs)
        self.assertEqual(win_popen[0], [str(w_exe), *launcher.DEBUG_ARGS])

    def test_manage_py_launcher_and_status_integration(self):
        plugin = self.home / '.gemini' / 'config' / 'plugins' / 'antigravity-pulse'
        config = self.home / '.gemini' / 'config' / 'config.json'
        settings = self.local / 'AntigravityPulse' / 'settings.json'
        backups = self.local / 'AntigravityPulseBackups'

        if os.sys.platform == 'darwin':
            _, app_asar, _, _ = self._make_darwin_app()
        elif os.sys.platform == 'win32':
            app_asar, _ = self._make_win32_app()
        else:
            app_asar, _ = self._make_linux_app()

        with patch.multiple(manager, HOME=self.home, LOCAL=self.local, PLUGIN=plugin,
                            CONFIG=config, SETTINGS=settings, APP=app_asar, BACKUPS=backups):
            manager.install(with_launcher=True)
            self.assertTrue((plugin / 'compat' / 'desktop_launcher.py').is_file())
            self.assertTrue(launcher.inspect_launcher(self.home, self.local)['installed'])

            out1 = io.StringIO()
            with patch('sys.stdout', out1):
                manager.status()
            st1 = json.loads(out1.getvalue())
            self.assertFalse(st1['debugPortAvailable'])
            self.assertTrue(st1['launcher']['installed'])
            self.assertIn('2.33+', st1['debugPortHint'])
            self.assertIn('--remote-debugging-port=0 --remote-debugging-address=127.0.0.1', st1['debugPortHint'])
            self.assertIn('install-launcher', st1['debugPortHint'])
            self.assertIn('launch', st1['debugPortHint'])

            profile = manager._current_profile()
            profile.mkdir(parents=True, exist_ok=True)
            (profile / 'DevToolsActivePort').write_text('9222\n/devtools/browser/1\n', encoding='utf-8')
            out2 = io.StringIO()
            with patch('sys.stdout', out2):
                manager.status()
            st2 = json.loads(out2.getvalue())
            self.assertTrue(st2['debugPortAvailable'])
            self.assertNotIn('debugPortHint', st2)

            manager.uninstall()
            self.assertFalse(launcher.inspect_launcher(self.home, self.local)['installed'])

            with patch('sys.argv', ['manage.py', 'install-launcher', '--app-path', str(app_asar)]):
                self.assertEqual(manager.main(), 0)
            self.assertTrue(launcher.inspect_launcher(self.home, self.local)['installed'])

            with patch('sys.argv', ['manage.py', 'uninstall-launcher']):
                self.assertEqual(manager.main(), 0)
            self.assertFalse(launcher.inspect_launcher(self.home, self.local)['installed'])

            launch_calls = []
            fake_mod = types.SimpleNamespace(
                launch_desktop=lambda app_path, relaunch=False, extra_args=(): launch_calls.append((app_path, relaunch)) or {'executable': str(app_path)},
            )
            with patch.object(manager, 'desktop_launcher', return_value=fake_mod), \
                 patch('sys.argv', ['manage.py', 'launch', '--relaunch', '--app-path', str(app_asar)]):
                self.assertEqual(manager.main(), 0)
            with patch.object(manager, 'desktop_launcher', return_value=fake_mod), \
                 patch('sys.argv', ['manage.py', 'launch', '--restart', '--app-path', str(app_asar)]):
                self.assertEqual(manager.main(), 0)
            self.assertEqual(launch_calls, [(app_asar.resolve(), True), (app_asar.resolve(), True)])

            with patch('sys.argv', ['manage.py', 'install', '--with-launcher', '--app-path', str(app_asar)]):
                self.assertEqual(manager.main(), 0)
            launcher_info = launcher.inspect_launcher(self.home, self.local)
            self.assertTrue(launcher_info['installed'])
            if os.sys.platform == 'darwin' and shutil.which('codesign'):
                verify = subprocess.run(
                    ['codesign', '--verify', '--verbose=1', launcher_info['path']],
                    capture_output=True, text=True,
                )
                self.assertEqual(verify.returncode, 0, verify.stderr)


if __name__ == '__main__':
    unittest.main()
