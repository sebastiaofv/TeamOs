"""Subscription-authenticated coding CLIs behind a shared execution interface."""
from __future__ import annotations

import json
import os
import signal
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from .config import FactoryError

_active = set()
_active_lock = threading.Lock()
_cancelled = threading.Event()


def cancel_all():
    _cancelled.set()
    with _active_lock:
        processes = list(_active)
    threads = [threading.Thread(target=terminate_tree, args=(process,)) for process in processes]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()


def tree_groups(root):
    """Process groups of root's descendants.

    Tools such as Playwright start servers in their own process group, so
    killing the step's group alone leaves them running. Collect the groups
    while the tree is intact, before anything exits and is reparented.
    """
    try:
        listing = subprocess.run(['ps', '-A', '-o', 'pid=,ppid=,pgid='], capture_output=True,
                                 text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    children, groups = {}, {}
    for line in listing.splitlines():
        fields = line.split()
        if len(fields) == 3 and all(f.isdigit() for f in fields):
            pid, ppid, pgid = map(int, fields)
            children.setdefault(ppid, []).append(pid)
            groups[pid] = pgid
    found, pending = set(), [root]
    while pending:
        for child in children.get(pending.pop(), []):
            found.add(groups[child])
            pending.append(child)
    return found - {os.getpgrp(), root}


def signal_groups(groups, sig):
    for group in groups:
        try:
            os.killpg(group, sig)
        except (ProcessLookupError, PermissionError):
            pass


def terminate_tree(process, grace=5):
    """Stop a process started with start_new_session and every group it spawned."""
    groups = {process.pid} | tree_groups(process.pid)
    signal_groups(groups, signal.SIGTERM)
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        pass
    # Servers that ignore SIGTERM, or outlive their parent's exit, still get killed.
    time.sleep(0.2)
    signal_groups(groups, signal.SIGKILL)
    process.wait()


API_ENV = {
    'claude': ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
               'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK',
               'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'),
    'codex': ('OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'),
}


def check_login(cli, cwd):
    configured = [key for key in API_ENV[cli] if os.environ.get(key)]
    if configured:
        raise FactoryError(f'{cli}: unset API/provider overrides for subscription runs: {", ".join(configured)}')
    if not shutil.which(cli):
        raise FactoryError(f'{cli} is not installed or not on PATH')
    command = [cli, 'auth', 'status'] if cli == 'claude' else [cli, 'login', 'status']
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired as exc:
        raise FactoryError(f'{cli}: login check timed out') from exc
    if cli == 'claude':
        try:
            auth = json.loads(result.stdout)
        except ValueError as exc:
            raise FactoryError('claude: cannot verify account login; run claude auth login') from exc
        valid = auth.get('loggedIn') and auth.get('authMethod') == 'claude.ai' and auth.get('apiProvider') == 'firstParty' and auth.get('subscriptionType') in {'pro', 'max', 'team', 'enterprise'}
    else:
        text = (result.stdout + result.stderr).lower()
        valid = 'chatgpt' in text and 'api key' not in text
    if result.returncode != 0 or not valid:
        login = 'claude auth login' if cli == 'claude' else 'codex login'
        raise FactoryError(f'{cli}: subscription account login is required; run {login}')


@dataclass
class Result:
    session_id: str | None = None
    usage: dict = field(default_factory=dict)
    api_equivalent_usd: float | None = None
    models: list = field(default_factory=list)


def command(profile, cwd, job_dir):
    cli = profile['cli']
    if cli == 'claude':
        # stream-json writes each event as it happens, so a killed step still leaves its transcript.
        args = ['claude', '--print', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
                '--allowedTools', 'Read,Glob,Grep,Edit,Write,Bash', '--tools', 'Read,Glob,Grep,Edit,Write,Bash',
                '--add-dir', str(job_dir)]
        if profile.get('reasoning_effort'):
            args += ['--effort', profile['reasoning_effort']]
    else:
        args = ['codex', 'exec', '--json', '--cd', str(cwd), '--sandbox', 'workspace-write',
                '--add-dir', str(job_dir), '-c', 'approval_policy="never"',
                '-c', 'sandbox_workspace_write.network_access=true',
                '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"']
        if profile.get('reasoning_effort'):
            args += ['-c', 'model_reasoning_effort=' + json.dumps(profile['reasoning_effort'])]
    if profile.get('model'):
        args += ['--model', profile['model']]
    if cli == 'codex':
        args.append('-')
    return args


def _claude_usage(native):
    cached = native.get('cache_read_input_tokens', 0)
    written = native.get('cache_creation_input_tokens', 0)
    # input_tokens is every prompt token; uncached_input_tokens is the part not read from cache.
    return {'input_tokens': native.get('input_tokens', 0) + cached + written,
            'uncached_input_tokens': native.get('input_tokens', 0) + written,
            'cached_input_tokens': cached, 'cache_write_input_tokens': written,
            'output_tokens': native.get('output_tokens', 0)}


def _claude_events(stdout):
    events = []
    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            events.append(json.loads(line))
        except ValueError as exc:
            raise FactoryError('claude returned invalid JSON; inspect the run log') from exc
    return events


def partial_result(cli, stdout):
    """Usage so far from a step that never finished, such as one that timed out."""
    if cli != 'claude':
        try:
            return parse_result(cli, stdout, require_completion=False)
        except FactoryError:
            return Result()
    events = []
    for line in stdout.splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            pass  # A killed CLI can leave its last line half written.
    result, native, models = Result(), {}, []
    # One API call can span several assistant events with the same message id and usage.
    calls = {}
    for event in events:
        if event.get('type') == 'system' and event.get('subtype') == 'init':
            result.session_id = event.get('session_id')
        message = event.get('message') if event.get('type') == 'assistant' else None
        if isinstance(message, dict) and isinstance(message.get('usage'), dict):
            calls[message.get('id') or len(calls)] = message['usage']
            if message.get('model') and message['model'] not in models:
                models.append(message['model'])
    for usage in calls.values():
        for key in ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'):
            if isinstance(usage.get(key), (int, float)):
                native[key] = native.get(key, 0) + usage[key]
    if native:
        result.usage = _claude_usage(native)
    result.models = models
    return result


def parse_result(cli, stdout, require_completion=True):
    if cli == 'claude':
        data = next((e for e in reversed(_claude_events(stdout)) if e.get('type') == 'result'), {})
        if data.get('is_error') or data.get('type') != 'result':
            raise FactoryError('claude did not complete successfully; inspect the run log')
        if data.get('permission_denials'):
            raise FactoryError('claude denied a required tool; inspect the run log and CLI permissions')
        cost = data.get('total_cost_usd')
        return Result(data.get('session_id'), _claude_usage(data.get('usage') or {}),
                      float(cost) if isinstance(cost, (int, float)) else None,
                      list((data.get('modelUsage') or {}).keys()))
    result = Result()
    completed = False
    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError as exc:
            raise FactoryError('codex returned invalid JSONL; inspect the run log') from exc
        kind = event.get('type')
        if kind == 'thread.started':
            result.session_id = event.get('thread_id')
        elif kind == 'turn.completed':
            completed = True
            for key, value in (event.get('usage') or {}).items():
                if isinstance(value, (int, float)):
                    result.usage[key] = result.usage.get(key, 0) + value
        elif kind == 'turn.failed':
            raise FactoryError('codex turn failed; inspect the run log')
    if require_completion and not completed:
        raise FactoryError('codex returned no completed turn; inspect the run log')
    return Result(result.session_id, with_uncached(result.usage), result.api_equivalent_usd, result.models)


def with_uncached(usage):
    """Add uncached_input_tokens when a provider reports input including cached reads."""
    usage = dict(usage)
    if 'uncached_input_tokens' not in usage and isinstance(usage.get('input_tokens'), (int, float)):
        usage['uncached_input_tokens'] = usage['input_tokens'] - usage.get('cached_input_tokens', 0)
    return usage


def execute(profile, cwd, job_dir, prompt, log_dir, timeout):
    """Run one step, retaining native output and terminating its process group on timeout."""
    if _cancelled.is_set():
        raise FactoryError('factory run interrupted')
    check_login(profile['cli'], cwd)
    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    args = command(profile, cwd, job_dir)
    env = dict(os.environ)
    env.pop('CLAUDECODE', None)  # The runner deliberately starts independent CLI sessions.
    with (log_dir / 'stdout.jsonl').open('w') as out, (log_dir / 'stderr.log').open('w') as err:
        process = subprocess.Popen(args, cwd=cwd, env=env, stdin=subprocess.PIPE,
                                   stdout=out, stderr=err, text=True, start_new_session=True)
        with _active_lock:
            _active.add(process)
        try:
            if _cancelled.is_set():
                os.killpg(process.pid, signal.SIGTERM)
            process.communicate(prompt, timeout=timeout)
        except BaseException as exc:
            # Also reap shells and dev servers spawned by the timed-out coding CLI.
            terminate_tree(process)
            if isinstance(exc, subprocess.TimeoutExpired):
                error = FactoryError(f'{profile["cli"]} step exceeded {timeout}s; inspect {log_dir}')
                error.partial = partial_result(profile['cli'], (log_dir / 'stdout.jsonl').read_text())
                raise error from exc
            raise
        finally:
            with _active_lock:
                _active.discard(process)
    if process.returncode:
        raise FactoryError(f'{profile["cli"]} exited {process.returncode}; inspect {log_dir}')
    return parse_result(profile['cli'], (log_dir / 'stdout.jsonl').read_text())
