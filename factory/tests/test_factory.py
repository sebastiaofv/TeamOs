"""Behavior tests use temporary repositories and fake CLIs, without paid requests."""
import json
import os
from pathlib import Path
import shutil
import signal
import time
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SOURCE / 'factory'))
from lib.adapters import check_login, command, execute, parse_result
from lib.config import FactoryError, load_config
from lib.runner import Runner, runner_lock


class FactoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        shutil.copytree(SOURCE / 'factory', self.repo / 'factory', ignore=shutil.ignore_patterns('jobs', '__pycache__'))
        shutil.copy(SOURCE / '.gitignore', self.repo / '.gitignore')
        (self.repo / 'calc.py').write_text('def add(a, b):\n    return a + b\n')
        (self.repo / 'factory/checks.sh').write_text('#!/usr/bin/env bash\nset -euo pipefail\npython3 -c "import calc; assert calc.add(1, 2) == 3"\n')
        self.tools = self.base / 'bin'
        self.tools.mkdir()
        for name in ['claude', 'codex', 'gh']:
            shutil.copy(SOURCE / 'factory/tests/fake_cli.py', self.tools / name)
            (self.tools / name).chmod(0o755)
        env = dict(os.environ, PATH=str(self.tools) + os.pathsep + os.environ['PATH'], FACTORY_TEST_ROOT=str(self.base))
        for key in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
                    'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
                    'OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'):
            env.pop(key, None)
        self.env = patch.dict(os.environ, env, clear=True)
        self.env.start(); self.addCleanup(self.env.stop)
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Factory Test')
        self.git('config', 'user.email', 'factory@example.test')
        self.git('add', '.')
        self.git('commit', '-m', 'Initial project')
        self.origin = self.base / 'origin.git'
        subprocess.run(['git', 'init', '--bare', str(self.origin)], check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(self.origin))
        self.git('push', '-u', 'origin', 'main')
        self.runner = Runner(self.repo)

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.repo, check=True, capture_output=True, text=True).stdout.strip()

    def test_mixed_provider_pipeline_repairs_then_merges(self):
        self.runner.run(1)
        job = self.runner.job('001-add-numbers')
        self.assertEqual(job['stage'], 'merged')
        self.assertEqual(job['round'], 3)
        self.assertFalse(Path(job['worktree']).exists())
        self.assertIsNone(job['cost_usd'])
        self.assertEqual(job['usage']['billing'], 'subscription')
        self.assertGreater(job['usage']['tokens']['input_tokens'], 0)
        self.assertEqual(job['agents']['builder'], 'claude-strong')
        self.assertEqual(job['agents']['reviewers']['code'], 'codex')
        calls = [json.loads(line) for line in (self.base / 'invocations.jsonl').read_text().splitlines()]
        self.assertEqual({c['cli'] for c in calls}, {'claude', 'codex'})
        self.assertEqual(len([c for c in calls if c['role'] == 'builder']), 3)
        self.assertEqual(len([c for c in calls if c['role'].startswith('reviewer-')]), 8)
        self.assertEqual(self.git('show', 'origin/main:calc.py'), 'def add(a, b):\n    return a + b')
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_cli_failure_does_not_advance_and_can_resume(self):
        with patch.dict(os.environ, {'FACTORY_TEST_FAIL_ROLE': 'spec-writer'}):
            with self.assertRaises(FactoryError):
                self.runner.run(1)
        job = self.runner.job('001-add-numbers')
        self.assertEqual(job['stage'], 'spec')
        receipts = list((self.repo / 'factory/jobs' / job['id'] / 'runs').glob('*/result.json'))
        self.assertIn('failed', [json.loads(p.read_text())['status'] for p in receipts])
        self.runner.run(1)
        self.assertEqual(self.runner.job(job['id'])['stage'], 'merged')
        calls = [json.loads(line) for line in (self.base / 'invocations.jsonl').read_text().splitlines()]
        self.assertEqual(len([c for c in calls if c['role'] == 'intake']), 1)

    def test_subscription_checks_reject_api_credentials(self):
        for cli, variable in [('claude', 'ANTHROPIC_API_KEY'), ('codex', 'OPENAI_API_KEY')]:
            with self.subTest(cli=cli), patch.dict(os.environ, {variable: 'do-not-print-this-value'}):
                with self.assertRaises(FactoryError) as error:
                    check_login(cli, self.repo)
                self.assertNotIn('do-not-print-this-value', str(error.exception))
        with patch.dict(os.environ, {'FACTORY_TEST_API_LOGIN': '1'}):
            for cli in ['claude', 'codex']:
                with self.subTest(cli=cli), self.assertRaises(FactoryError):
                    check_login(cli, self.repo)

    def test_bad_provider_output_and_missing_usage(self):
        for cli, payload in [('claude', '{}'), ('codex', '{"type":"turn.failed"}'), ('codex', 'garbage')]:
            with self.subTest(cli=cli), self.assertRaises(FactoryError):
                parse_result(cli, payload)
        result = parse_result('codex', '{"type":"turn.completed"}')
        self.assertEqual(result.usage, {})
        self.assertIsNone(result.api_equivalent_usd)

    def test_timeout_records_failure_without_advancing(self):
        self.runner.config['step_timeout_seconds'] = 1
        job_id = self.runner.job_command('create', '1')
        with patch.dict(os.environ, {'FACTORY_TEST_SLEEP': '1'}):
            with self.assertRaisesRegex(FactoryError, 'exceeded 1s'):
                self.runner.step(self.runner.job(job_id), 'intake')
        self.assertEqual(self.runner.job(job_id)['stage'], 'intake')
        receipts = list((self.repo / 'factory/jobs' / job_id / 'runs').glob('*/result.json'))
        self.assertEqual(json.loads(receipts[0].read_text())['status'], 'failed')

    def test_duplicate_creation_and_runner_lock(self):
        cmd = [str(self.repo / 'factory/bin/job'), 'create', '1']
        first = subprocess.Popen(cmd, cwd=self.repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        second = subprocess.Popen(cmd, cwd=self.repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        first.communicate(timeout=10); second.communicate(timeout=10)
        self.assertEqual(sorted([first.returncode, second.returncode]), [0, 1])
        with runner_lock(self.repo):
            with self.assertRaisesRegex(FactoryError, 'another factory runner'):
                with runner_lock(self.repo):
                    pass

    def test_single_cli_configuration_only_checks_selected_login(self):
        config = load_config(self.repo)
        config['steps'] = {role: 'codex' for role in config['steps']}
        config['routing'] = {risk: {'code': 'codex'} for risk in config['routing']}
        config['surface_reviewers'] = {'ui': {'ux': 'codex', 'ui': 'codex'}, 'security': {'security': 'codex'}}
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'unused-provider-key'}):
            Runner(self.repo, config).doctor()

    def test_stale_artifact_is_not_accepted_from_a_successful_cli(self):
        job_id = self.runner.job_command('create', '1')
        artifact = self.repo / 'factory/jobs' / job_id / 'intake.md'
        artifact.write_text('DECISION: ACCEPT\nRISK: low\nSURFACES: none\nRESCOPED: no\n')
        with patch.dict(os.environ, {'FACTORY_TEST_NO_WRITE': '1'}):
            with self.assertRaisesRegex(FactoryError, 'did not refresh'):
                self.runner.step(self.runner.job(job_id), 'intake')
        self.assertEqual(self.runner.job(job_id)['stage'], 'intake')

    def test_completed_step_reuse_binds_artifact_profile_and_commit(self):
        job_id = self.runner.job_command('create', '1')
        job = self.runner.job(job_id)
        self.runner.step(job, 'intake')
        self.runner.step(job, 'intake')
        calls = lambda: (self.base / 'invocations.jsonl').read_text().splitlines()
        self.assertEqual(len(calls()), 1)
        self.runner.artifact(job, 'intake').write_text('changed artifact')
        self.runner.step(job, 'intake')
        self.assertEqual(len(calls()), 2)
        self.runner.config['profiles']['claude-fast']['model'] = 'sonnet'
        self.runner.step(job, 'intake')
        self.assertEqual(len(calls()), 3)
        (self.repo / 'calc.py').write_text('def add(a, b):\n    return a - b\n')
        self.git('add', 'calc.py'); self.git('commit', '-m', 'Change base')
        self.runner.step(job, 'intake')
        self.assertEqual(len(calls()), 4)

    def test_nonbuilder_cannot_modify_already_dirty_source(self):
        job_id = self.runner.job_command('create', '1')
        (self.repo / 'calc.py').write_text('def add(a, b):\n    return a - b\n')
        with patch.dict(os.environ, {'FACTORY_TEST_MUTATE_SOURCE': '1'}):
            with self.assertRaisesRegex(FactoryError, 'changed project files'):
                self.runner.step(self.runner.job(job_id), 'intake')
        self.assertEqual(self.runner.job(job_id)['stage'], 'intake')

    def test_signal_stops_active_cli_and_leaves_job_resumable(self):
        env = dict(os.environ, FACTORY_TEST_SLEEP='1')
        process = subprocess.Popen([str(self.repo / 'factory/bin/factory'), 'run', '1'],
                                   cwd=self.repo, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 10
            while not (self.base / 'invocations.jsonl').exists() and time.monotonic() < deadline:
                time.sleep(.05)
            self.assertTrue((self.base / 'invocations.jsonl').exists())
            process.send_signal(signal.SIGTERM)
            process.communicate(timeout=10)
            self.assertEqual(process.returncode, 130)
            self.assertEqual(self.runner.job('001-add-numbers')['stage'], 'intake')
        finally:
            if process.poll() is None:
                process.kill(); process.communicate()

    def test_gate_timeout_produces_a_failed_report(self):
        config = load_config(self.repo)
        config['check_timeout_seconds'] = 1
        (self.repo / 'factory/config.json').write_text(json.dumps(config))
        self.runner = Runner(self.repo)
        job_id = self.runner.job_command('create', '1')
        self.runner.step(self.runner.job(job_id), 'intake')
        self.runner.call([self.repo / 'factory/bin/route', job_id])
        self.runner.job_command('advance', job_id, 'spec')
        (self.repo / 'factory/jobs' / job_id / 'spec.md').write_text('# Test\n')
        self.runner.job_command('advance', job_id, 'build')
        (self.repo / 'factory/checks.sh').write_text('#!/usr/bin/env bash\nsleep 30\n')
        result = self.runner.call([self.repo / 'factory/bin/gate', job_id], check=False)
        self.assertEqual(result.returncode, 1)
        report = (self.repo / 'factory/jobs' / job_id / 'round-1/checks.md').read_text()
        self.assertTrue(report.startswith('GATE: FAIL'))
        self.assertIn('Exit 124', report)

    def test_profiles_and_commands_keep_provider_settings(self):
        config = load_config(self.repo)
        profile = dict(config['profiles']['codex'], model='chosen-model', reasoning_effort='high')
        args = command(profile, self.repo, self.repo / 'factory/jobs/test')
        self.assertEqual(args[args.index('--model') + 1], 'chosen-model')
        self.assertIn('model_reasoning_effort="high"', args)
        self.assertIn('forced_login_method="chatgpt"', args)
        self.assertNotIn('--dangerously-bypass-approvals-and-sandbox', args)
        config['steps']['builder'] = 'missing'
        (self.repo / 'factory/config.json').write_text(json.dumps(config))
        with self.assertRaisesRegex(FactoryError, 'unknown profile'):
            load_config(self.repo)


if __name__ == '__main__':
    unittest.main()
