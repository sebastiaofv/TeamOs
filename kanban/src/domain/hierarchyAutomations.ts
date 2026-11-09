import type { BoardData, Task, WorkflowCategory } from './types';
import { canTransition, getWorkflow, statusCategory } from './workflow';
import { childrenOf, parentOf, workitemType } from './workitems';
import { nowIso } from './util';

export const AUTOMATION_RULES = ['parentToTodo', 'startParent', 'prepareTesting', 'completeEpic', 'cancelParent', 'reopenParent', 'hierarchyChanges', 'sprintUnfinishedTasks'] as const;
export type AutomationRule = typeof AUTOMATION_RULES[number];
export type AutomationMode = 'off' | 'confirm' | 'automatic';
export type HierarchyAutomations = { version: 1; rules: Record<AutomationRule, AutomationMode> };
export type AutomationEffect = {
    parentId: number; taskId: number; rule: AutomationRule; mode: AutomationMode;
    from: string; to: string; outcome: 'automatic' | 'approved' | 'rejected' | 'blocked';
};
export function defaultHierarchyAutomations(): HierarchyAutomations {
    return { version: 1, rules: Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule, 'confirm'])) as HierarchyAutomations['rules'] };
}
export function parseHierarchyAutomations(value: unknown): HierarchyAutomations {
    const config = structuredClone(value) as HierarchyAutomations | null;
    // Version 1 projects created before the Sprint rule inherit its default.
    if (config?.version === 1 && config.rules && !Object.hasOwn(config.rules, 'sprintUnfinishedTasks')) config.rules.sprintUnfinishedTasks = 'confirm';
    if (!config || config.version !== 1 || !config.rules || AUTOMATION_RULES.some((rule) => !['off', 'confirm', 'automatic'].includes(config.rules[rule])) || Object.keys(config.rules).some((rule) => !AUTOMATION_RULES.includes(rule as AutomationRule))) throw new Error('Invalid hierarchy automation settings.');
    return structuredClone(config);
}
export function getHierarchyAutomations(data: BoardData): HierarchyAutomations {
    return data.extensions.hierarchyAutomations ? parseHierarchyAutomations(data.extensions.hierarchyAutomations) : defaultHierarchyAutomations();
}
export const automationEffectKey = (effect: Pick<AutomationEffect, 'parentId' | 'rule' | 'from' | 'to'>) => `${effect.parentId}:${effect.rule}:${effect.from}:${effect.to}`;

/** Evaluate bottom-up. Only accepted/applied states enter the next level. A preview
 * may accept every proposal, then execution repeats against the actual decisions.
 * Configuration/workflow-only edits never create child events. */
export function applyHierarchyAutomations(data: BoardData, previous: BoardData, approve: (effect: AutomationEffect) => boolean | undefined): AutomationEffect[] {
    const settings = getHierarchyAutomations(data);
    const effects: AutomationEffect[] = [];
    const sprintMode = settings.rules.sprintUnfinishedTasks;
    for (const closure of data.extensions.sprintResults?.closures || []) {
        if (previous.extensions.sprintResults?.closures.some((entry) => entry.sprintId === closure.sprintId) || sprintMode === 'off') continue;
        for (const task of data.board.tasks) {
            const before = previous.board.tasks.find((entry) => entry.id === task.id);
            if (!before || before.sprintId !== closure.sprintId || workitemType(task) !== 'task' || statusCategory(before.status, previous, before) === 'completed') continue;
            const workflow = getWorkflow(data, task);
            const target = workflow.states.find((state) => state.id === workflow.references.backlog) || workflow.states.find((state) => state.category === 'backlog');
            if (!target || task.status === target.id) continue;
            const effect: AutomationEffect = { parentId: task.id, taskId: task.id, rule: 'sprintUnfinishedTasks', mode: sprintMode, from: task.status, to: target.id, outcome: 'blocked' };
            if (canTransition(data, task.status, target.id, task)) {
                const decision = sprintMode === 'confirm' ? approve(effect) : true;
                if (decision === undefined) continue;
                effect.outcome = decision ? sprintMode === 'confirm' ? 'approved' : 'automatic' : 'rejected';
                if (decision) { task.status = target.id; task.statusChangedAt = task.updatedAt = nowIso(); delete task.acceptance; }
            }
            effects.push(effect);
        }
    }
    const oldTasks = new Map(previous.board.tasks.map((task) => [task.id, task]));
    const changed = new Set(data.board.tasks.filter((task) => {
        const old = oldTasks.get(task.id);
        return !old || old.status !== task.status || old.parentId !== task.parentId;
    }).map((task) => task.id));
    const structural = new Set<number>();
    for (const old of previous.board.tasks) {
        const next = data.board.tasks.find((task) => task.id === old.id);
        if (!next || next.parentId !== old.parentId) { if (old.parentId != null) structural.add(old.parentId); }
    }
    for (const task of data.board.tasks) if (!oldTasks.has(task.id) || oldTasks.get(task.id)?.parentId !== task.parentId) {
        if (task.parentId != null) structural.add(task.parentId);
    }
    const depth = (task: Task) => { let level = 0; const seen = new Set<number>(); let parent = parentOf(data, task); while (parent && !seen.has(parent.id)) { seen.add(parent.id); level++; parent = parentOf(data, parent); } return level; };
    const parents = data.board.tasks.filter((task) => ['epic', 'story'].includes(workitemType(task))).sort((a, b) => depth(b) - depth(a) || a.id - b.id);
    for (const parent of parents) {
        // A direct edit to the parent takes precedence over derived changes in the same action.
        if (oldTasks.get(parent.id)?.status !== parent.status) continue;
        const children = childrenOf(data, parent.id);
        const changedChildren = children.filter((child) => changed.has(child.id));
        const hierarchy = structural.has(parent.id);
        if (!hierarchy && !changedChildren.length) continue;
        const category = (task: Task) => statusCategory(task.status, data, task);
        const currentCategory = category(parent);
        const relevant = children.filter((task) => category(task) !== 'cancelled');
        const reopened = changedChildren.some((task) => {
            const old = oldTasks.get(task.id);
            if (!old || old.status === task.status) return false;
            const rank: WorkflowCategory[] = ['backlog', 'to-do', 'in-progress', 'testing', 'completed', 'cancelled'];
            return !['completed', 'cancelled'].includes(category(task)) && rank.indexOf(category(task)) < rank.indexOf(statusCategory(old.status, previous, old));
        });
        let rule: AutomationRule | undefined;
        let target: WorkflowCategory | undefined;
        if (children.length && children.every((task) => category(task) === 'cancelled')) { rule = 'cancelParent'; target = 'cancelled'; }
        else if (reopened || hierarchy && ['testing', 'completed', 'cancelled'].includes(currentCategory) && relevant.some((task) => !['testing', 'completed'].includes(category(task)))) { rule = 'reopenParent'; target = 'in-progress'; }
        else if (workitemType(parent) === 'epic' && relevant.length && relevant.every((task) => category(task) === 'completed')) { rule = 'completeEpic'; target = 'completed'; }
        else if (workitemType(parent) === 'story' && relevant.length && relevant.every((task) => workitemType(task) === 'task' && ['testing', 'completed'].includes(category(task)))) { rule = 'prepareTesting'; target = 'testing'; }
        else if (!['completed', 'cancelled'].includes(currentCategory) && (hierarchy ? relevant : changedChildren).some((task) => ['in-progress', 'testing', 'completed'].includes(category(task))) && ['backlog', 'to-do'].includes(currentCategory)) { rule = 'startParent'; target = 'in-progress'; }
        else if (currentCategory === 'backlog' && (hierarchy ? relevant : changedChildren).some((task) => category(task) === 'to-do')) { rule = 'parentToTodo'; target = 'to-do'; }
        if (!rule || !target) continue;
        // Structural events have their own switch; state changes use the specific rule.
        if (hierarchy) rule = 'hierarchyChanges';
        const mode = settings.rules[rule];
        if (mode === 'off' || currentCategory === target) continue;
        const workflow = getWorkflow(data, parent);
        const candidates = workflow.states.filter((state) => state.category === target && canTransition(data, parent.status, state.id, parent));
        const to = candidates.find((state) => state.id === workflow.references[target])?.id || candidates[0]?.id
            || workflow.states.find((state) => state.id === workflow.references[target])?.id || workflow.states.find((state) => state.category === target)?.id;
        if (!to || to === parent.status) continue;
        if (!canTransition(data, parent.status, to, parent)) {
            effects.push({ parentId: parent.id, taskId: changedChildren[0]?.id ?? parent.id, rule, mode, from: parent.status, to, outcome: 'blocked' });
            continue;
        }
        const effect: AutomationEffect = { parentId: parent.id, taskId: changedChildren[0]?.id ?? parent.id, rule, mode, from: parent.status, to, outcome: mode === 'automatic' ? 'automatic' : 'approved' };
        const decision = mode === 'confirm' ? approve(effect) : true;
        if (decision === undefined) continue;
        if (!decision) effect.outcome = 'rejected';
        else { parent.status = to; parent.updatedAt = nowIso(); delete parent.acceptance; changed.add(parent.id); }
        effects.push(effect);
    }
    return effects;
}
