"""Resolve every role to a validated CLI profile."""
import json
from pathlib import Path

ROLES = {'intake', 'spec-writer', 'builder', 'approver'}
REVIEWERS = {'code', 'security', 'ux', 'ui'}


class FactoryError(Exception):
    pass


def load_config(root):
    config = json.loads((Path(root) / 'factory/config.json').read_text())
    for key in ('concurrency', 'max_rounds', 'step_timeout_seconds', 'check_timeout_seconds'):
        value = config.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise FactoryError(f'{key} must be a positive integer')
    profiles = config.get('profiles', {})
    if not profiles:
        raise FactoryError('configure at least one CLI profile')
    for name, profile in profiles.items():
        if not isinstance(profile, dict) or profile.get('cli') not in {'claude', 'codex'}:
            raise FactoryError(f'profile {name}: cli must be claude or codex')
        if set(profile) - {'cli', 'model', 'reasoning_effort'}:
            raise FactoryError(f'profile {name}: unknown settings')
        for key in ('model', 'reasoning_effort'):
            value = profile.get(key)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise FactoryError(f'profile {name}: {key} must be a nonempty string or null')
        effort = profile.get('reasoning_effort')
        allowed = {'low', 'medium', 'high', 'xhigh', 'max'} if profile['cli'] == 'claude' else {'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'}
        if effort is not None and effort not in allowed:
            raise FactoryError(f'profile {name}: unsupported reasoning_effort {effort}')
    steps = config.get('steps', {})
    if set(steps) != ROLES:
        raise FactoryError('steps must define intake, spec-writer, builder, and approver')
    references = list(steps.values())
    routing = config.get('routing', {})
    if set(routing) != {'low', 'medium', 'high'}:
        raise FactoryError('routing must define low, medium, and high risk')
    for mapping in [*routing.values(), *config.get('surface_reviewers', {}).values()]:
        if not isinstance(mapping, dict) or not mapping or set(mapping) - REVIEWERS:
            raise FactoryError('reviewer routing must map known review roles to profiles')
        references.extend(mapping.values())
    for risk, mapping in routing.items():
        if 'code' not in mapping:
            raise FactoryError(f'{risk} risk must include a code reviewer')
    for name in references:
        if not isinstance(name, str) or name not in profiles:
            raise FactoryError(f'unknown profile {name!r}')
    return config


def agent_set(config, intake):
    reviewers = dict(config['routing'][intake['risk']])
    for surface in intake['surfaces']:
        if surface not in config['surface_reviewers']:
            raise FactoryError(f'unknown intake surface {surface!r}')
        reviewers.update(config['surface_reviewers'][surface])
    return {**config['steps'], 'reviewers': reviewers}


def profile_for(config, job, role):
    agents = job.get('agents') or {}
    name = agents.get('reviewers', {}).get(role.removeprefix('reviewer-')) if role.startswith('reviewer-') else agents.get(role, config['steps'].get(role))
    if name not in config['profiles']:
        raise FactoryError(f'{role}: unknown profile {name!r}; reroute legacy jobs before resuming')
    return name, dict(config['profiles'][name])
