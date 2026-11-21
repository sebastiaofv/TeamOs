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
from lib.adapters import check_login, command, execute, parse_result, partial_result
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
        self.assertEqual(len([c for c in calls if c['role'].startswith('reviewer-')]), 6)
        self.assertEqual(set(job['agents']['reviewers']), {'code', 'ui', 'security'})
        self.assertEqual(self.git('show', 'origin/main:calc.py'), 'def add(a, b):\n    return a + b')
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_trace_records_time_and_tokens_for_every_step(self):
        self.runner.run(1)
        job = self.runner.job('001-add-numbers')
        runs = job['usage']['executions']
        self.assertEqual([e['started'] for e in runs], sorted(e['started'] for e in runs))
        cli = [e for e in runs if e['kind'] == 'cli']
        checks = [e for e in runs if e['kind'] == 'check']
        self.assertEqual(len(cli), 1 + 1 + 3 + 6 + 1)  # intake, spec, 3 builds, 2 review rounds, approver
        self.assertEqual([e['verdict'] for e in checks], ['GATE: FAIL', 'GATE: PASS', 'GATE: PASS', 'GATE: PASS'])
        self.assertEqual(checks[-1]['role'], 'merge-gate')
        for e in runs:
            self.assertEqual(e['status'], 'completed')
            self.assertIsInstance(e['duration_seconds'], (int, float))
        codex = next(e for e in cli if e['profile']['cli'] == 'codex')
        self.assertEqual(codex['tokens']['uncached_input_tokens'], 8)  # 12 input, 4 of them cached
        claude = next(e for e in cli if e['profile']['cli'] == 'claude')
        self.assertEqual(claude['tokens']['uncached_input_tokens'], 10)
        self.assertEqual(claude['session_id'], 'test-claude')
        self.assertTrue((self.repo / 'factory/jobs' / job['id'] / 'runs' / codex['run'] / 'stdout.jsonl').is_file())
        self.assertEqual(job['usage']['by_role']['builder']['runs'], 3)
        self.assertEqual(job['usage']['by_role']['gate']['tokens'], {})
        self.assertEqual(job['usage']['tokens']['uncached_input_tokens'],
                         sum(e['tokens']['uncached_input_tokens'] for e in cli))
        self.assertEqual([h['to'] for h in job['history']][:4], ['intake', 'spec', 'build', 'gate'])
        self.assertEqual(job['history'][-1]['to'], 'merged')
        text = self.runner.job_command('trace', '1')
        self.assertIn('uncached in', text)
        self.assertIn('merge-gate', text)
        self.assertIn('By role:', text)
        self.assertIn('created → intake', text)
        traced = json.loads(self.runner.job_command('trace', '1', '--json'))
        self.assertEqual(len(traced['executions']), len(runs))
        out = subprocess.run([str(self.repo / 'factory/bin/factory'), 'trace', '1'], cwd=self.repo,
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('reviewer-ui', out)

    def github(self):
        return json.loads((self.base / 'fake-github.json').read_text())

    def test_grilling_waits_on_the_issue_then_resumes_with_the_answers(self):
        with patch.dict(os.environ, {'FACTORY_TEST_GRILL': '1'}):
            self.runner.run(1)
            job = self.runner.job('001-add-numbers')
            self.assertEqual(job['stage'], 'needs-info')
            self.assertEqual(job['intake']['grill_round'], 1)
            [question] = self.github()['comments']
            self.assertIn('### Factory grilling: round 1', question['body'])
            self.assertIn('➡️ Yes, Python ints are unbounded.', question['body'])
            self.assertIn('go with your recommendations', question['body'])
            self.assertIn(['--add-label', 'factory:needs-info'], self.github()['label_edits'])
            self.assertIn('waiting for answers to grilling round 1', self.runner.job_command('queue'))
            self.runner.run(1)
            self.assertEqual(self.runner.job(job['id'])['stage'], 'needs-info')

            state = self.github()
            state['comments'].append({'author': {'login': 'factory-test'}, 'body': 'go with your recommendations',
                                      'createdAt': '2026-01-02T00:00:00Z'})
            (self.base / 'fake-github.json').write_text(json.dumps(state))
            self.runner.run(1)
        folder = self.repo / 'factory/jobs' / job['id']
        job = self.runner.job(job['id'])
        self.assertEqual(job['stage'], 'merged')
        self.assertEqual(job['intake']['track'], 'simple')
        self.assertEqual(job['intake']['grill_round'], 2)
        self.assertTrue((folder / 'intake-1.md').read_text().startswith('DECISION: NEEDS-INFO'))
        self.assertIn('go with your recommendations', (folder / 'issue.md').read_text())
        prompts = {}
        for path in sorted(folder.glob('runs/*/prompt.txt')):
            prompts.setdefault(path.parent.name.split('-', 1)[1].rsplit('-', 1)[0], []).append(path.read_text())
        self.assertIn('Grilling round: 2 of at most 3. Questions allowed: yes.', prompts['intake'][1])
        self.assertIn('Track: simple.', prompts['builder'][0])
        accepted = [c['body'] for c in self.github()['comments'] if 'Factory intake: ACCEPT' in c['body']]
        self.assertIn('(simple track, risk low', accepted[0])

    def test_intake_track_and_grilling_limits_are_enforced(self):
        job_id = self.runner.job_command('create', '1')
        job = self.runner.job(job_id)
        folder = self.repo / 'factory/jobs' / job_id
        path = folder / 'intake.md'
        header = 'DECISION: {}\nRISK: {}\nTRACK: {}\nSURFACES: none\nRESCOPED: no\n\n## Summary\n- Test.\n'
        path.write_text(header.format('ACCEPT', 'medium', 'simple'))
        with self.assertRaisesRegex(FactoryError, 'medium-risk work on the simple track'):
            self.runner.validate_artifact(job, 'intake', path)
        path.write_text(header.format('ACCEPT', 'low', 'tiny'))
        with self.assertRaisesRegex(FactoryError, 'invalid track'):
            self.runner.validate_artifact(job, 'intake', path)
        path.write_text(header.format('ACCEPT', 'medium', 'complex'))
        self.assertEqual(self.runner.validate_artifact(job, 'intake', path), 'DECISION: ACCEPT')
        for k in range(1, 4):
            (folder / f'intake-{k}.md').write_text(header.format('NEEDS-INFO', 'low', 'simple'))
        path.write_text(header.format('NEEDS-INFO', 'low', 'simple'))
        with self.assertRaisesRegex(FactoryError, 'after 3 grilling rounds'):
            self.runner.validate_artifact(job, 'intake', path)
        self.assertIn('Questions allowed: no.', self.runner.prompt(job, 'intake', path))
        config = load_config(self.repo)
        config['simple_track_risks'] = ['high']
        (self.repo / 'factory/config.json').write_text(json.dumps(config))
        with self.assertRaisesRegex(FactoryError, 'simple_track_risks'):
            load_config(self.repo)

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

    def test_claude_stream_json_result(self):
        stream = '\n'.join(json.dumps(e) for e in [
            {'type': 'system', 'subtype': 'init', 'session_id': 's'},
            {'type': 'assistant', 'message': {'id': 'm', 'usage': {'input_tokens': 1, 'output_tokens': 1}}},
            {'type': 'result', 'is_error': False, 'session_id': 's', 'total_cost_usd': .5,
             'usage': {'input_tokens': 4, 'cache_read_input_tokens': 10, 'output_tokens': 3}, 'modelUsage': {'m1': {}}}])
        result = parse_result('claude', stream)
        self.assertEqual(result.session_id, 's')
        self.assertEqual(result.usage['input_tokens'], 14)
        self.assertEqual(result.usage['cached_input_tokens'], 10)
        self.assertEqual(result.models, ['m1'])
        with self.assertRaises(FactoryError):
            parse_result('claude', stream.rsplit('\n', 1)[0])

    def test_partial_usage_counts_each_api_call_once(self):
        call = {'type': 'assistant', 'message': {'id': 'a', 'model': 'm1',
                'usage': {'input_tokens': 2, 'cache_read_input_tokens': 5, 'output_tokens': 1}}}
        later = {'type': 'assistant', 'message': {'id': 'b', 'model': 'm1', 'usage': {'input_tokens': 1, 'output_tokens': 4}}}
        stream = '\n'.join(json.dumps(e) for e in [call, call, later]) + '\n{"type": "assis'
        result = partial_result('claude', stream)
        self.assertEqual(result.usage['input_tokens'], 8)
        self.assertEqual(result.usage['output_tokens'], 5)
        self.assertEqual(result.models, ['m1'])
        self.assertEqual(partial_result('codex', 'garbage').usage, {})

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
        receipt = json.loads(receipts[0].read_text())
        self.assertEqual(receipt['status'], 'failed')
        self.assertTrue(receipt['usage_partial'])
        self.assertEqual(receipt['usage']['input_tokens'], 10)
        self.assertGreater((receipts[0].parent / 'stdout.jsonl').stat().st_size, 0)

    def test_timeout_stops_servers_in_their_own_process_group(self):
        self.runner.config['step_timeout_seconds'] = 1
        job_id = self.runner.job_command('create', '1')
        with patch.dict(os.environ, {'FACTORY_TEST_SLEEP': '1', 'FACTORY_TEST_ORPHAN': '1'}):
            with self.assertRaisesRegex(FactoryError, 'exceeded 1s'):
                self.runner.step(self.runner.job(job_id), 'intake')
        pid = int((self.base / 'orphan.pid').read_text())
        self.addCleanup(lambda: subprocess.run(['kill', '-9', str(pid)], capture_output=True))
        deadline = time.monotonic() + 10
        while subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True,
                             text=True).stdout.strip() not in {'', 'Z', 'Z+'}:
            self.assertLess(time.monotonic(), deadline, 'server outlived the timed-out step')
            time.sleep(.1)

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
        config['surface_reviewers'] = {'ui': {'ui': 'codex'}, 'security': {'security': 'codex'}}
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
        claude = dict(config['profiles']['claude-strong'], reasoning_effort='xhigh')
        args = command(claude, self.repo, self.repo / 'factory/jobs/test')
        self.assertEqual(args[args.index('--effort') + 1], 'xhigh')
        self.assertEqual(args[args.index('--model') + 1], 'opus')
        config['profiles']['claude-strong']['reasoning_effort'] = 'ultra'
        (self.repo / 'factory/config.json').write_text(json.dumps(config))
        with self.assertRaisesRegex(FactoryError, 'unsupported reasoning_effort ultra'):
            load_config(self.repo)
        config['profiles']['claude-strong']['reasoning_effort'] = None
        config['steps']['builder'] = 'missing'
        (self.repo / 'factory/config.json').write_text(json.dumps(config))
        with self.assertRaisesRegex(FactoryError, 'unknown profile'):
            load_config(self.repo)


if __name__ == '__main__':
    unittest.main()
