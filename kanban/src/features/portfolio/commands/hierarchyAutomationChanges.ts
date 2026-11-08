import type { BoardData } from '@/domain/types';
import { applyHierarchyAutomations, automationEffectKey } from '@/domain/hierarchyAutomations';
import { appendTimelineEvent, captureTaskTimelineSnapshot, recordTaskTimelineEvent } from '@/domain/timeline';
import { getWorkflow } from '@/domain/workflow';
import { workitemType } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { translateCurrent as t } from '@/shared/i18n';
import type { ConfirmOptions } from '@/app/overlays/appMessages';

/** One review for all possible cascades, followed by evaluation using only actual
 * decisions. Rejecting the review keeps the original child action intact. */
export function resolveHierarchyAutomations(data: BoardData, previous: BoardData, confirm: (text: string, options?: ConfirmOptions) => unknown) {
    const preview = applyHierarchyAutomations(structuredClone(data), previous, () => true);
    // Rejection can leave an upper parent eligible for a different transition.
    const rejectedPreview = preview.some((effect) => effect.mode === 'confirm') ? applyHierarchyAutomations(structuredClone(data), previous, () => false) : [];
    const proposals = [...new Map([...preview, ...rejectedPreview].filter((effect) => effect.mode === 'confirm').map((effect) => [automationEffectKey(effect), effect])).values()];
    const reviewed = new Set(proposals.map(automationEffectKey));
    const state = (id: number, status: string) => getWorkflow(data, data.board.tasks.find((task) => task.id === id)).states.find((state) => state.id === status)?.name || status;
    const rules = [...new Set(proposals.map((effect) => effect.rule))];
    const review = () => confirm(t('automations.reviewHelp'), {
        title: t('automations.reviewTitle'), cancelLabel: t('automations.keepAll'),
        workitems: {
            countSelection: true,
            heading: rules.length === 1 ? t(`automations.${rules[0]}.name`) : undefined,
            rows: [...new Set(proposals.map((effect) => effect.parentId))].map((parentId) => {
                const task = data.board.tasks.find((task) => task.id === parentId)!;
                const alternatives = proposals.filter((effect) => effect.parentId === parentId);
                return { id: workitemLabel(task), type: workitemType(task), title: task.title,
                    from: state(task.id, task.status), to: [...new Set(alternatives.map((effect) => state(task.id, effect.to)))].join(' / '),
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
        const before = structuredClone(data);
        const effects = applyHierarchyAutomations(data, previous, (effect) => {
            const key = automationEffectKey(effect);
            if (!reviewed.has(key)) return undefined;
            return decision === true || Boolean(decision && typeof decision === 'object' && (decision as Record<string, unknown>)[key] === 'advance');
        });
        for (const effect of effects) {
            const summary = t(`automations.history.${effect.outcome}`, { rule: t(`automations.${effect.rule}.name`), from: state(effect.parentId, effect.from), to: state(effect.parentId, effect.to) });
            const meta = { automatic: true, automationRule: effect.rule, automationOutcome: effect.outcome, causeTaskId: effect.taskId, cause: summary, proposedStatus: effect.to, previousStatus: effect.from };
            if (effect.outcome === 'rejected') appendTimelineEvent(data, { kind: 'task.automation.rejected', entityType: 'task', entityId: String(effect.parentId), summary, meta });
            else {
                const event = recordTaskTimelineEvent(data, captureTaskTimelineSnapshot(before, effect.parentId), captureTaskTimelineSnapshot(data, effect.parentId));
                if (event) { event.meta = { ...event.meta, ...meta }; event.summary = summary; }
            }
        }
    };
    if (proposals.length) return Promise.resolve(review()).then(apply);
    apply(true);
}
