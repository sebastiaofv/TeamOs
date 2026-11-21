#!/usr/bin/env python3
"""Local test double for subscription CLIs and GitHub; never calls a model."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

name = Path(sys.argv[0]).name
args = sys.argv[1:]
root = Path(os.environ['FACTORY_TEST_ROOT'])
state_path = root / 'fake-github.json'

if name == 'gh':
    state = json.loads(state_path.read_text()) if state_path.exists() else {'pr': None, 'merged': False, 'draft': True}
    state.setdefault('comments', []); state.setdefault('label_edits', [])
    if args[:2] == ['auth', 'status']:
        print('test account authenticated')
    elif args[:2] == ['api', 'user']:
        print('factory-test')
    elif args[:2] == ['issue', 'list']:
        print(json.dumps([] if state['merged'] else [{'number': 1, 'title': 'Add numbers'}]))
    elif args[:2] == ['issue', 'view']:
        number = int(args[2])
        print(json.dumps({'number': number, 'title': 'Add numbers', 'body': 'Add two numbers.',
                          'author': {'login': 'factory-test'}, 'labels': [{'name': 'factory'}],
                          'state': 'OPEN', 'url': f'https://example.test/issues/{number}', 'comments': state['comments']}))
    elif args[:2] == ['issue', 'comment']:
        body = args[args.index('--body') + 1]
        state['comments'].append({'author': {'login': 'factory-test'}, 'body': body,
                                  'createdAt': f'2026-01-01T00:00:{len(state["comments"]):02d}Z'})
    elif args[:2] == ['issue', 'edit']:
        state['label_edits'].append(args[3:])
    elif args[:2] == ['pr', 'list']:
        print(json.dumps([{'number': 2, 'url': 'https://example.test/pull/2'}] if state['pr'] else []))
    elif args[:2] == ['pr', 'create']:
        state['pr'] = 2
        print('https://example.test/pull/2')
    elif args[:2] == ['pr', 'view']:
        print(json.dumps({'state': 'MERGED' if state['merged'] else 'OPEN', 'isDraft': state['draft']}))
    elif args[:2] == ['pr', 'ready']:
        state['draft'] = False
    elif args[:2] == ['pr', 'merge']:
        repo = root / 'repo'
        job = next((repo / 'factory/jobs').glob('*/job.json'))
        data = json.loads(job.read_text())
        subprocess.run(['git', 'push', 'origin', 'HEAD:main'], cwd=data['worktree'], check=True, capture_output=True)
        state['merged'] = True
    elif args[0] not in {'issue', 'pr'}:
        raise SystemExit('unexpected fake gh command: ' + repr(args))
    state_path.write_text(json.dumps(state))
    raise SystemExit(0)

if name == 'claude' and args[:2] == ['auth', 'status']:
    print(json.dumps({'loggedIn': True, 'authMethod': 'api_key' if os.environ.get('FACTORY_TEST_API_LOGIN') else 'claude.ai',
                      'apiProvider': 'firstParty', 'subscriptionType': 'pro'}))
    raise SystemExit(0)
if name == 'codex' and args[:2] == ['login', 'status']:
    print('Logged in using API key' if os.environ.get('FACTORY_TEST_API_LOGIN') else 'Logged in using ChatGPT', file=sys.stderr)
    raise SystemExit(0)

prompt = sys.stdin.read()
role = re.search(r'^Role: ([^.]+)\.', prompt, re.M).group(1)
artifact = Path(re.search(r'Required output: (.+)', prompt).group(1))
round_number = int(re.search(r'Round: (\d+)', prompt).group(1))
record = {'cli': name, 'role': role, 'round': round_number, 'args': args, 'cwd': str(Path.cwd())}
fd = os.open(root / 'invocations.jsonl', os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
os.write(fd, (json.dumps(record) + '\n').encode()); os.close(fd)
if name == 'claude':
    print(json.dumps({'type': 'system', 'subtype': 'init', 'session_id': 'test-claude'}))
    print(json.dumps({'type': 'assistant', 'message': {'id': 'msg-1', 'model': 'test-model',
                      'usage': {'input_tokens': 7, 'cache_read_input_tokens': 3, 'output_tokens': 2}}}), flush=True)
if os.environ.get('FACTORY_TEST_ORPHAN'):
    # Like a Playwright webServer: a child in its own process group.
    server = subprocess.Popen(['sleep', '300'], start_new_session=True)
    (root / 'orphan.pid').write_text(str(server.pid))
if os.environ.get('FACTORY_TEST_SLEEP'):
    time.sleep(30)
if os.environ.get('FACTORY_TEST_FAIL_ROLE') == role:
    if name == 'codex':
        print(json.dumps({'type': 'turn.failed', 'error': {'message': 'test failure'}}))
    else:
        print(json.dumps({'type': 'result', 'is_error': True}))
    raise SystemExit(0)

artifact.parent.mkdir(parents=True, exist_ok=True)
grill_round = int(re.search(r'Grilling round: (\d+)', prompt).group(1))
if role == 'intake' and os.environ.get('FACTORY_TEST_GRILL') and grill_round == 1:
    body = ('DECISION: NEEDS-INFO\nRISK: low\nTRACK: complex\nSURFACES: none\nRESCOPED: no\n\n## Summary\n- Ask about overflow.\n\n'
            '## Questions\n❓ **Q1** - **Overflow**: Should huge numbers be allowed?\n\n➡️ Yes, Python ints are unbounded.\n')
elif role == 'intake':
    body = 'DECISION: ACCEPT\nRISK: low\nTRACK: simple\nSURFACES: ui, security\nRESCOPED: no\n\n## Summary\n- Add numbers.\n\n## Scope\nImplement addition.\n'
elif role == 'spec-writer':
    body = '# Addition\n\n## Summary\n- Add numbers.\n\n## Acceptance criteria\n1. add(1, 2) returns 3.\n'
elif role == 'builder':
    Path('calc.py').write_text('def add(a, b):\n    return ' + ('0' if round_number == 1 else 'a + b') + '\n')
    body = 'STATUS: READY\n\n## Summary\n- Implemented addition.\n'
elif role.startswith('reviewer-'):
    verdict = 'CHANGES' if role == 'reviewer-code' and round_number == 2 else 'PASS'
    body = f'VERDICT: {verdict}\n\n## Summary\n- Tested review.\n'
else:
    body = 'APPROVE\n\n## Summary\n- Acceptance criteria verified.\n'
if not os.environ.get('FACTORY_TEST_NO_WRITE'):
    artifact.write_text(body)
if os.environ.get('FACTORY_TEST_MUTATE_SOURCE'):
    Path('calc.py').write_text('def add(a, b):\n    return 0\n')
if name == 'claude':
    print(json.dumps({'type': 'result', 'is_error': False, 'session_id': 'test-claude',
                      'usage': {'input_tokens': 10, 'output_tokens': 5}, 'total_cost_usd': .001,
                      'modelUsage': {'test-model': {}}}))
else:
    print(json.dumps({'type': 'thread.started', 'thread_id': 'test-codex'}))
    print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 12, 'cached_input_tokens': 4, 'output_tokens': 6}}))
