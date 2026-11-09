import type { BoardData } from '@/domain/types';
import { applyHierarchyAutomations, automationEffectKey, type AutomationEffect } from '@/domain/hierarchyAutomations';
import { appendTimelineEvent, captureTaskTimelineSnapshot, recordTaskTimelineEvent } from '@/domain/timeline';
import { getWorkflow } from '@/domain/workflow';
import { workitemType } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { translateCurrent as t } from '@/shared/i18n';
import { cloneBoardCurrentState } from '@/domain/boardMutation';
import type { ConfirmOptions } from '@/app/overlays/appMessages';

/** One review for all possible cascades, followed by evaluation using only actual
 * decisions. Rejecting the review keeps the original child action intact. */
export function resolveHierarchyAutomations(data: BoardData, previous: BoardData, confirm: (text: string, options?: ConfirmOptions) => unknown) {
    const previousTasks = new Map(previous.board.tasks.map((task) => [task.id, task]));
    const closures = new Set(previous.extensions.sprintResults?.closures.map((entry) => entry.sprintId));
    const hasNewClosure = data.extensions.sprintResults?.closures.some((entry) => !closures.has(entry.sprintId));
    if (!hasNewClosure && data.board.tasks.length === previous.board.tasks.length && data.board.tasks.every((task) => {
        const before = previousTasks.get(task.id);
        return before && before.status === task.status && before.parentId === task.parentId;
    })) return;
    const preview = applyHierarchyAutomations(cloneBoardCurrentState(data), previous, () => true);
    // Rejection can leave an upper parent eligible for a different transition.
    const rejectedPreview = preview.some((effect) => effect.mode === 'confirm') ? applyHierarchyAutomations(cloneBoardCurrentState(data), previous, () => false) : [];
    const proposals = [...new Map([...preview, ...rejectedPreview].filter((effect) => effect.mode === 'confirm' && effect.outcome !== 'blocked').map((effect) => [automationEffectKey(effect), effect])).values()];
    const reviewed = new Set(proposals.map(automationEffectKey));
    const state = (id: number, status: string) => getWorkflow(data, data.board.tasks.find((task) => task.id === id)).states.find((state) => state.id === status)?.name || status;
    const rules = [...new Set(proposals.map((effect) => effect.rule))];
    const review = () => confirm(t('automations.reviewHelp'), {
        title: t('automations.reviewTitle'), cancelLabel: t('automations.keepAll'),
        workitems: {
            countSelection: true,
            rules: rules.map((rule) => ({ name: t(`automations.${rule}.name`), description: t(`automations.${rule}.description`) })),
            rows: [...new Set(proposals.map((effect) => effect.parentId))].map((parentId) => {
                const task = data.board.tasks.find((task) => task.id === parentId)!;
                const alternatives = proposals.filter((effect) => effect.parentId === parentId);
                return { id: workitemLabel(task), type: workitemType(task), title: task.title,
                    field: t('task.status'), from: state(task.id, task.status), to: [...new Set(alternatives.map((effect) => state(task.id, effect.to)))].join(' / '),
                    selectionId: automationEffectKey(alternatives[0]), selectionIds: alternatives.map(automationEffectKey),
                    rule: rules.length > 1 ? [...new Set(alternatives.map((effect) => t(`automations.${effect.rule}.name`)))].join(' / ') : undefined };
            })
        },
        selections: proposals.map((effect) => ({ id: automationEffectKey(effect), label: workitemLabel(data.board.tasks.find((task) => task.id === effect.parentId)!), options: [
            { value: 'advance', label: t('automations.applyChange') },
            { value: 'keep', label: t('automations.keepCurrent') }
        ] }))
    });
    const apply = (decision: unknown) => {
        const before = cloneBoardCurrentState(data);
        const effects = applyHierarchyAutomations(data, previous, (effect) => {
            const key = automationEffectKey(effect);
            if (!reviewed.has(key)) return undefined;
            return decision === true || Boolean(decision && typeof decision === 'object' && (decision as Record<string, unknown>)[key] === 'advance');
        });
        for (const effect of effects) {
            const summary = t(`automations.history.${effect.outcome}`, { rule: t(`automations.${effect.rule}.name`), from: state(effect.parentId, effect.from), to: state(effect.parentId, effect.to) });
            const meta = { automatic: true, automationRule: effect.rule, automationOutcome: effect.outcome, causeTaskId: effect.taskId, cause: summary, proposedStatus: effect.to, previousStatus: effect.from };
            if (effect.outcome === 'rejected' || effect.outcome === 'blocked') appendTimelineEvent(data, { kind: `task.automation.${effect.outcome}`, entityType: 'task', entityId: String(effect.parentId), summary, meta });
            else {
                const event = recordTaskTimelineEvent(data, captureTaskTimelineSnapshot(before, effect.parentId), captureTaskTimelineSnapshot(data, effect.parentId));
                if (event) { event.meta = { ...event.meta, ...meta }; event.summary = summary; }
            }
        }
        const blocked = effects.filter((effect) => effect.outcome === 'blocked');
        if (blocked.length) return notifyBlocked(blocked);
    };
    const notifyBlocked = (effects: AutomationEffect[]) => confirm(t('automations.blockedHelp'), {
        title: t('automations.reviewTitle'), informational: true,
        workitems: {
            rules: [...new Set(effects.map((effect) => effect.rule))].map((rule) => ({ name: t(`automations.${rule}.name`), description: t(`automations.${rule}.description`) })),
            rows: effects.map((effect) => {
                const task = data.board.tasks.find((task) => task.id === effect.parentId)!;
                return { id: workitemLabel(task), type: workitemType(task), title: task.title, field: t('task.status'), from: state(task.id, effect.from), to: state(task.id, effect.to),
                    rule: t(`automations.${effect.rule}.name`), reason: t('automations.blockedReason') };
            })
        }
    });
    if (proposals.length) return Promise.resolve(review()).then(apply);
    const result = apply(true);
    if (result) return Promise.resolve(result).then(() => {});
}
