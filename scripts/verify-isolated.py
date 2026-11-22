#!/usr/bin/env python3
"""Copy source without opening .env files; validate against unreachable local DB only.
Usage: BIRTH_NODE_BINARY=/path/to/node python3 scripts/verify-isolated.py
No migrations, seed, mail, LINE, or deployment commands are executed.
"""
import os, pathlib, shutil, subprocess, tempfile
source = pathlib.Path(__file__).resolve().parents[1]
node = os.environ.get('BIRTH_NODE_BINARY') or shutil.which('node')
if not node:
    raise SystemExit('Set BIRTH_NODE_BINARY to a local Node executable.')
node = str(pathlib.Path(node).resolve())
with tempfile.TemporaryDirectory(prefix='birth-verify-') as folder:
    target = pathlib.Path(folder) / source.name
    shutil.copytree(source, target, ignore=shutil.ignore_patterns('.env*', '.git', '.next', 'node_modules', '*.tsbuildinfo'))
    (target / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
    env = {'PATH': str(pathlib.Path(node).parent) + ':/usr/bin:/bin', 'DATABASE_URL': 'postgresql://birth_test:birth_test@127.0.0.1:65432/birth_test', 'DIRECT_URL': 'postgresql://birth_test:birth_test@127.0.0.1:65432/birth_test', 'SESSION_SECRET': 'isolated-verification-only', 'NEXT_TELEMETRY_DISABLED': '1'}
    for command in [
        [str(target/'node_modules/.bin/prisma'), 'validate'],
        [str(target/'node_modules/.bin/prisma'), 'generate'],
        [node, '--require', 'tsx/cjs', '--test', *map(str, sorted((target/'tests').glob('*.test.cjs')))],
        [str(target/'node_modules/.bin/next'), 'build'],
    ]:
        subprocess.run(command, cwd=target, env=env, check=True)
