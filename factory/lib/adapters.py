"""Subscription-authenticated coding CLIs behind a shared execution interface."""
from __future__ import annotations

import json
import os
import signal
import shutil
import subprocess
import threading
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
    for process in processes:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    for process in processes:
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
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
        args = ['claude', '--print', '--output-format', 'json', '--permission-mode', 'dontAsk',
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


def parse_result(cli, stdout):
    if cli == 'claude':
        try:
            data = json.loads(stdout)
        except ValueError as exc:
            raise FactoryError('claude returned invalid JSON; inspect the run log') from exc
        if data.get('is_error') or data.get('type') != 'result':
            raise FactoryError('claude did not complete successfully; inspect the run log')
        if data.get('permission_denials'):
            raise FactoryError('claude denied a required tool; inspect the run log and CLI permissions')
        cost = data.get('total_cost_usd')
        native = data.get('usage') or {}
        cached = native.get('cache_read_input_tokens', 0)
        written = native.get('cache_creation_input_tokens', 0)
        usage = {'input_tokens': native.get('input_tokens', 0) + cached + written,
                 'cached_input_tokens': cached, 'cache_write_input_tokens': written,
                 'output_tokens': native.get('output_tokens', 0)}
        return Result(data.get('session_id'), usage,
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
    if not completed:
        raise FactoryError('codex returned no completed turn; inspect the run log')
    return result


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
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            except ProcessLookupError:
                pass
            if isinstance(exc, subprocess.TimeoutExpired):
                raise FactoryError(f'{profile["cli"]} step exceeded {timeout}s; inspect {log_dir}') from exc
            raise
        finally:
            with _active_lock:
                _active.discard(process)
    if process.returncode:
        raise FactoryError(f'{profile["cli"]} exited {process.returncode}; inspect {log_dir}')
    return parse_result(profile['cli'], (log_dir / 'stdout.jsonl').read_text())
