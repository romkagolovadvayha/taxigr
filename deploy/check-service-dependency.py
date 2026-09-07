#!/usr/bin/env python3
"""Exercise the API unit's DB dependency using temporary sleep services (root/Linux)."""

import configparser
import os
from pathlib import Path
import subprocess
import sys


def systemctl(*args, check=True):
    return subprocess.run(['systemctl', *args], check=check, capture_output=True, text=True).stdout.strip()


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as root on a systemd host; the production API and MySQL are not touched.')
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('taxigr-api.service')
    config = configparser.ConfigParser(interpolation=None)
    config.read_string(source.read_text())
    prefix = f'taxigr-dependency-check-{os.getpid()}'
    names = {kind: f'{prefix}-{kind}.service' for kind in ['db', 'old', 'fixed']}
    files = {kind: Path('/run/systemd/system') / name for kind, name in names.items()}
    created = []
    try:
        for kind, path in files.items():
            unit = ['[Unit]', 'Description=Temporary TaxiGR dependency regression check']
            if kind == 'old':
                unit.extend([f'After={names["db"]}', f'Requires={names["db"]}'])
            elif kind == 'fixed':
                for setting in ['After', 'Wants', 'Requires', 'BindsTo', 'PartOf']:
                    if 'mysql.service' in config['Unit'].get(setting, '').split():
                        unit.append(f'{setting}={names["db"]}')
            unit.extend(['[Service]', 'Type=simple', 'ExecStart=/usr/bin/sleep infinity',
                         f'Restart={config["Service"].get("Restart", "no")}'])
            with path.open('x') as output:
                output.write('\n'.join(unit) + '\n')
            created.append(path)
        systemctl('daemon-reload')
        systemctl('start', names['db'], names['old'], names['fixed'])
        assert all(systemctl('is-active', name) == 'active' for name in names.values())
        fixed_pid = systemctl('show', names['fixed'], '-p', 'MainPID', '--value')

        # Package upgrades can use separate stop/start operations, rather than restart.
        systemctl('stop', names['db'])
        assert systemctl('is-active', names['old'], check=False) == 'inactive'
        assert systemctl('is-active', names['fixed']) == 'active'
        print('DB stopped: original dependency stops API; fixed dependency keeps API running.')

        systemctl('start', names['db'])
        assert systemctl('is-active', names['old'], check=False) == 'inactive'
        assert systemctl('is-active', names['fixed']) == 'active'
        assert systemctl('show', names['fixed'], '-p', 'MainPID', '--value') == fixed_pid
        print('DB started: original API remains down; fixed API retains the same process.')
    finally:
        if created:
            systemctl('stop', *(path.name for path in created), check=False)
            for path in created:
                path.unlink(missing_ok=True)
            systemctl('daemon-reload')


if __name__ == '__main__':
    main()
