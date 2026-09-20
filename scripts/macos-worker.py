"""Manage the local worker through launchd; every start remains paused."""
import argparse
import fcntl
import os
from pathlib import Path
import plistlib
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LABEL = 'com.tradefly.worker'
PLIST = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('install', 'status', 'stop'))
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('This service manager requires macOS')
    domain = f'gui/{os.getuid()}'
    target = f'{domain}/{LABEL}'
    if args.action == 'status':
        raise SystemExit(subprocess.run(['launchctl', 'print', target]).returncode)
    if args.action == 'stop':
        # Unload before removing its login definition. Never kill the Python process directly.
        subprocess.run(['launchctl', 'bootout', target], check=True)
        PLIST.unlink(missing_ok=True)
        print('Worker stopped and automatic startup removed.')
        return
    python = ROOT / '.venv/bin/python'
    if not python.exists():
        parser.error('Create .venv with uv sync --python 3.12 first')
    if PLIST.exists():
        parser.error('Service already installed. Use status, or stop before reinstalling.')
    runs = ROOT / 'runs'
    runs.mkdir(exist_ok=True)
    # Refuse to take over a foreground worker. Release only immediately before bootstrap.
    with (runs / 'worker.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('A worker is running. Stop it gracefully before installing the service.')
        config = {
            'Label': LABEL,
            'ProgramArguments': [str(python), '-u', '-m', 'tradefly.runner', '--load-brain', '--flies', '2'],
            'WorkingDirectory': str(ROOT),
            'RunAtLoad': True,
            'KeepAlive': True,
            'ThrottleInterval': 30,
            'ExitTimeOut': 120,
            'StandardOutPath': str(runs / 'worker.stdout.log'),
            'StandardErrorPath': str(runs / 'worker.stderr.log'),
        }
        PLIST.parent.mkdir(parents=True, exist_ok=True)
        with PLIST.open('xb') as file:
            plistlib.dump(config, file)
        PLIST.chmod(0o600)
    subprocess.run(['launchctl', 'bootstrap', domain, str(PLIST)], check=True)
    print('Worker installed for this Mac login. It starts paused, including after a restart.')
    print('Logs: runs/worker.stdout.log and runs/worker.stderr.log')


if __name__ == '__main__':
    main()
