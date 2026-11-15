"""Own the workflow; coding CLIs execute bounded roles and produce artifacts."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import signal
from pathlib import Path
import subprocess
import time
import uuid

from . import adapters
from .config import FactoryError, load_config, profile_for

TERMINAL = {'merged', 'rejected', 'needs-human', 'needs-info'}


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, indent=2) + '\n')
    temp.replace(path)


@contextmanager
def runner_lock(root):
    jobs = root / 'factory/jobs'
    jobs.mkdir(parents=True, exist_ok=True)
    with (jobs / '.runner.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise FactoryError('another factory runner is active in this checkout') from exc
        yield


class Runner:
    def __init__(self, root, config=None):
        self.root = Path(root).resolve()
        self.config = config or load_config(self.root)
        self.bin = self.root / 'factory/bin'
        self.jobs = self.root / 'factory/jobs'

    def call(self, args, cwd=None, check=True):
        try:
            result = subprocess.run([str(a) for a in args], cwd=cwd or self.root,
                                    capture_output=True, text=True, timeout=self.config['check_timeout_seconds'] + 30)
        except subprocess.TimeoutExpired as exc:
            raise FactoryError(f'{args[0]} timed out') from exc
        if check and result.returncode:
            raise FactoryError((result.stderr or result.stdout).strip() or f'{args[0]} failed')
        return result

    def job_command(self, *args):
        return self.call([self.bin / 'job', *args]).stdout.strip()

    def job(self, job_id):
        return json.loads((self.jobs / job_id / 'job.json').read_text())

    def git(self, job, *args):
        return self.call(['git', *args], cwd=job['worktree']).stdout.strip()

    def doctor(self):
        used = set(self.config['steps'].values())
        for mapping in [*self.config['routing'].values(), *self.config['surface_reviewers'].values()]:
            used.update(mapping.values())
        for cli in sorted({self.config['profiles'][p]['cli'] for p in used}):
            adapters.check_login(cli, self.root)
            print(f'{cli}: subscription account login verified', flush=True)
        self.call(['gh', 'auth', 'status'])
        self.call(['git', 'rev-parse', '--show-toplevel'])
        check = self.root / 'factory/checks.sh'
        if 'factory/checks.sh has no checks yet' in check.read_text():
            raise FactoryError('factory/checks.sh is still the installer template; configure project checks before running jobs')
        for role in ['intake', 'spec-writer', 'builder', 'approver', 'reviewer-code', 'reviewer-ux', 'reviewer-ui', 'reviewer-security']:
            if not (self.root / 'factory/prompts' / f'{role}.md').is_file():
                raise FactoryError(f'missing shared prompt for {role}')
        print('Factory configuration, prompts, GitHub login, and checks: ready', flush=True)

    def artifact(self, job, role):
        name = {'intake': 'intake.md', 'spec-writer': 'spec.md', 'builder': 'build.md', 'approver': 'decision.md'}.get(role)
        if role.startswith('reviewer-'):
            name = f'round-{job["round"]}/review-{role.removeprefix("reviewer-")}.md'
        if not name:
            raise FactoryError(f'unknown role {role}')
        return self.jobs / job['id'] / name

    def prompt(self, job, role, artifact):
        folder = self.jobs / job['id']
        worktree = Path(job['worktree']) if role != 'intake' else self.root
        number = int(job['id'].split('-')[0])
        offset = {'reviewer-ux': 1, 'reviewer-ui': 2}.get(role, 0)
        port = self.config['ports']['base'] + self.config['ports']['step'] * number + offset
        return (
            f'Job: {job["id"]}. Job folder: {folder}/. Main checkout: {self.root}. '
            f'Worktree: {worktree}. Branch: {job["branch"]}. Base: origin/{self.config["base_branch"]}. '
            f'Issue: #{job["issue"]}. Round: {job["round"]}. PR: {job.get("pr")}. Port: {port}.\n'
            f'Role: {role}. Required output: {artifact}\n\n'
            'Execute only this role. The Python runner owns scheduling, state transitions, commits, '
            'pushes, PR creation, labels, and merging. Do not invoke factory skills or job commands, '
            'spawn other agents, or modify job.json, run receipts, or gate reports. '
            'Use the job files for continuity: earlier rounds, build.md, decision.md, and every '
            'feedback-*.md are the history. This is a fresh CLI session. '
            'The only factory artifact you write is the Required output above. '
            'Only the builder may edit project source, and only in its supplied worktree. '
            'If a required tool or permission is unavailable, report the blocker; never claim verification you did not perform.\n\n'
            + (self.root / 'factory/prompts' / f'{role}.md').read_text()
        )

    def validate_artifact(self, job, role, path):
        if not path.is_file() or not path.read_text().strip():
            raise FactoryError(f'{role} did not write {path}')
        text = path.read_text()
        first = text.splitlines()[0].strip()
        accepted = {'intake': {'DECISION: ACCEPT', 'DECISION: NEEDS-INFO', 'DECISION: REJECT'},
                    'builder': {'STATUS: READY', 'STATUS: BLOCKED'}, 'approver': {'APPROVE', 'ESCALATE'}}
        if role.startswith('reviewer-'):
            valid = first in {'VERDICT: PASS', 'VERDICT: CHANGES'}
        elif role == 'spec-writer':
            valid = first.startswith('# ') and '## Acceptance criteria' in text
        else:
            valid = first in accepted[role]
        if not valid:
            raise FactoryError(f'{role}: invalid output header in {path}')
        if role == 'intake':
            fields = dict(line.split(': ', 1) for line in text.split('\n\n', 1)[0].splitlines() if ': ' in line)
            if fields.get('RISK') not in self.config['routing'] or fields.get('RESCOPED') not in {'yes', 'no'}:
                raise FactoryError('intake returned invalid risk or rescoping fields')
            surfaces = {v.strip() for v in fields.get('SURFACES', '').split(',')}
            if not surfaces or not surfaces <= {'none', *self.config['surface_reviewers']} or ('none' in surfaces and len(surfaces) > 1):
                raise FactoryError('intake returned invalid surfaces')
        return first

    def receipt_matches(self, job, role, commit, profile, artifact):
        for receipt_path in sorted((self.jobs / job['id'] / 'runs').glob('*/result.json'), reverse=True):
            receipt = json.loads(receipt_path.read_text())
            if receipt.get('role') != role or receipt.get('round') != job['round']:
                continue
            return (receipt.get('status') == 'completed' and receipt.get('commit') == commit
                    and receipt.get('profile') == profile
                    and receipt.get('source_sha256') == self.source_state(self.root if role == 'intake' else job['worktree'])[1]
                    and artifact.is_file()
                    and receipt.get('artifact_sha256') == hashlib.sha256(artifact.read_bytes()).hexdigest())
        return False

    def source_state(self, cwd):
        head = self.call(['git', 'rev-parse', 'HEAD'], cwd=cwd).stdout.strip()
        diff = self.call(['git', 'diff', '--binary', 'HEAD'], cwd=cwd).stdout
        digest = hashlib.sha256(diff.encode())
        names = self.call(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=cwd).stdout
        for name in sorted(p for p in names.split('\0') if p):
            digest.update(name.encode())
            path = Path(cwd) / name
            if path.is_symlink():
                digest.update(str(path.readlink()).encode())
            elif path.is_file():
                digest.update(path.read_bytes())
        return head, digest.hexdigest()

    def step(self, job, role):
        name, profile = profile_for(self.config, job, role)
        cwd = self.root if role == 'intake' else Path(job['worktree'])
        commit = self.call(['git', 'rev-parse', 'HEAD'], cwd=cwd).stdout.strip()
        artifact = self.artifact(job, role)
        if self.receipt_matches(job, role, commit, profile, artifact):
            return self.validate_artifact(job, role, artifact)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        log_dir = self.jobs / job['id'] / 'runs' / f'{stamp}-{role}-{uuid.uuid4().hex[:6]}'
        log_dir.mkdir(parents=True)
        receipt = {'role': role, 'round': job['round'], 'profile_name': name, 'profile': profile,
                   'commit': commit, 'started': now(), 'status': 'running', 'billing': 'subscription'}
        write_json(log_dir / 'result.json', receipt)
        prompt = self.prompt(job, role, artifact)
        (log_dir / 'prompt.txt').write_text(prompt)
        before = self.source_state(cwd) if role != 'builder' else None
        started = time.time_ns()
        print(f'{job["id"]}: {role} → {profile["cli"]} / {profile.get("model") or "CLI default"}', flush=True)
        try:
            result = adapters.execute(profile, cwd, self.jobs / job['id'], prompt, log_dir,
                                      self.config['step_timeout_seconds'])
            receipt.update(asdict(result))
            if not artifact.exists() or artifact.stat().st_mtime_ns < started:
                raise FactoryError(f'{role} did not refresh its required output')
            verdict = self.validate_artifact(job, role, artifact)
            if self.call(['git', 'rev-parse', 'HEAD'], cwd=cwd).stdout.strip() != commit:
                raise FactoryError(f'{role} changed Git history; the runner owns commits')
            if role != 'builder':
                if self.source_state(cwd) != before:
                    raise FactoryError(f'{role} changed project files or Git history; inspect the worktree before resuming')
            receipt.update(status='completed', source_sha256=self.source_state(cwd)[1], artifact_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest())
            return verdict
        except Exception as exc:
            receipt.update(status='failed', error=str(exc))
            raise
        finally:
            receipt['ended'] = now()
            write_json(log_dir / 'result.json', receipt)
            self.job_command('sync', job['id'])

    def publish(self, job):
        if self.git(job, 'branch', '--show-current') != job['branch']:
            raise FactoryError('builder changed branches; inspect the worktree')
        paths = self.call(['git', 'ls-files', '--modified', '--deleted', '--others', '--exclude-standard', '-z'], cwd=job['worktree']).stdout
        staged = self.call(['git', 'diff', '--cached', '--name-only', '-z'], cwd=job['worktree']).stdout
        changed = list(dict.fromkeys(p for p in (paths + staged).split('\0') if p))
        if changed:
            self.git(job, 'add', '--', *changed)
            self.git(job, 'commit', '-m', f'factory: {job["title"]}')
        if not int(self.git(job, 'rev-list', '--count', f'origin/{self.config["base_branch"]}..HEAD')):
            raise FactoryError('builder reported READY without implementing a change')
        self.git(job, 'push', '-u', 'origin', job['branch'])
        prs = json.loads(self.call(['gh', 'pr', 'list', '--head', job['branch'], '--state', 'open', '--json', 'number'], cwd=job['worktree']).stdout)
        if not prs:
            self.call(['gh', 'pr', 'create', '--draft', '--base', self.config['base_branch'], '--head', job['branch'],
                       '--title', job['title'], '--body', f'Closes #{job["issue"]}\n\nBuilt by the software factory. See build and review evidence in the local dashboard.'], cwd=job['worktree'])

    def require_reviewed_commit(self, job):
        commit = self.git(job, 'rev-parse', 'HEAD')
        checks = self.jobs / job['id'] / f'round-{job["round"]}/checks.md'
        if f'COMMIT: {commit}' not in checks.read_text().splitlines():
            raise FactoryError('the worktree changed after its gate; inspect the job before resuming')
        for reviewer in job['agents']['reviewers']:
            role = f'reviewer-{reviewer}'
            _, profile = profile_for(self.config, job, role)
            if not self.receipt_matches(job, role, commit, profile, self.artifact(job, role)):
                raise FactoryError(f'{role} evidence is stale for this commit/profile; inspect the job before resuming')

    def run_job(self, job_id):
        while True:
            job = self.job(job_id)
            stage = job['stage']
            if stage in TERMINAL:
                return stage
            if stage == 'intake':
                verdict = self.step(job, 'intake')
                target = {'DECISION: ACCEPT': 'spec', 'DECISION: NEEDS-INFO': 'needs-info', 'DECISION: REJECT': 'rejected'}[verdict]
                if target == 'spec':
                    self.call([self.bin / 'route', job_id])
                self.job_command('advance', job_id, target)
            elif stage == 'spec':
                self.step(job, 'spec-writer')
                self.job_command('advance', job_id, 'build')
            elif stage == 'build':
                if self.step(job, 'builder') == 'STATUS: BLOCKED':
                    self.job_command('advance', job_id, 'needs-human')
                else:
                    self.publish(job)
                    self.job_command('advance', job_id, 'gate')
            elif stage == 'gate':
                gate = self.call([self.bin / 'gate', job_id], check=False)
                if gate.returncode not in {0, 1}:
                    raise FactoryError(gate.stderr or 'gate failed to execute')
                target = 'review' if gate.returncode == 0 else 'needs-human' if job['round'] >= job['round_limit'] else 'build'
                self.job_command('advance', job_id, target)
            elif stage == 'review':
                with ThreadPoolExecutor(max_workers=len(job['agents']['reviewers'])) as pool:
                    futures = [pool.submit(self.step, job, f'reviewer-{role}') for role in job['agents']['reviewers']]
                    verdicts = [f.result() for f in futures]
                self.require_reviewed_commit(job)
                target = 'approve' if all(v == 'VERDICT: PASS' for v in verdicts) else 'needs-human' if job['round'] >= job['round_limit'] else 'build'
                self.job_command('advance', job_id, target)
            elif stage == 'approve':
                self.require_reviewed_commit(job)
                if self.step(job, 'approver') == 'ESCALATE':
                    self.job_command('advance', job_id, 'needs-human')
                else:
                    self.job_command('merge', job_id)
            elif stage == 'merging':
                self.job_command('merge', job_id)
            else:
                raise FactoryError(f'unknown stage {stage}')
            print(f'{job_id}: {stage} → {self.job(job_id)["stage"]}', flush=True)

    def run(self, issue=None):
        adapters._cancelled.clear()
        self.doctor()
        failed = set()
        touched = set()
        with runner_lock(self.root):
            while True:
                rows = [line.split('\t', 4) for line in self.job_command('queue').splitlines() if line]
                if issue is not None:
                    rows = [row for row in rows if row[1] == str(issue)]
                    if not rows:
                        raise FactoryError(f'issue #{issue} is not an open factory-labeled issue')
                selected = []
                for action, number, job_id, stage, note in rows:
                    if number in failed or action not in {'new', 'resume'}:
                        continue
                    if action == 'new':
                        job_id = self.job_command('create', number)
                    elif stage == 'needs-info':
                        self.job_command('advance', job_id, 'intake')
                    selected.append((number, job_id))
                if not selected:
                    break
                with ThreadPoolExecutor(max_workers=self.config['concurrency']) as pool:
                    futures = {pool.submit(self.run_job, job_id): (number, job_id) for number, job_id in selected}
                    for future in as_completed(futures):
                        number, job_id = futures[future]
                        touched.add(job_id)
                        try:
                            future.result()
                        except Exception as exc:
                            failed.add(number)
                            print(f'{job_id}: stopped: {exc}', flush=True)
                if issue is not None:
                    break
            if touched:
                print(self.job_command('summary', *sorted(touched)))
        if failed:
            raise FactoryError('some jobs stopped; fix the reported cause and rerun to resume')


def main(root, argv=None):
    parser = argparse.ArgumentParser(description='Run the software factory through subscription-authenticated coding CLIs.')
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('run', help='drain the labeled issue queue, or run one issue')
    run.add_argument('issue', nargs='?', type=int)
    sub.add_parser('doctor', help='check configuration, subscription logins, and installation')
    sub.add_parser('status', help='show local jobs and usage')
    args = parser.parse_args(argv)
    def interrupt(signum, frame):
        adapters.cancel_all()
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    try:
        runner = Runner(root)
        if args.command == 'run':
            runner.run(args.issue)
        elif args.command == 'doctor':
            runner.doctor()
        else:
            print(runner.job_command('summary'))
    except KeyboardInterrupt:
        parser.exit(130, 'factory: interrupted; inspect active jobs and rerun to resume\n')
    except (FactoryError, OSError, ValueError) as exc:
        parser.exit(1, f'factory: {exc}\n')
