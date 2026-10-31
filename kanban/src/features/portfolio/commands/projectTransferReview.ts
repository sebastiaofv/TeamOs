import type { AppMessageReview, MessageSelection } from '@/app/types';
import type { BoardData, Task } from '@/domain/types';
import { transferMemberInputs, transferRemovals, type TransferMapping } from '@/domain/projectTransfers';
import { eligibleSprint, validParent, workitemType } from '@/domain/workitems';
import { isLeafPhase } from '@/domain/phaseTree';
import { getWorkflow, statusCategory } from '@/domain/workflow';
import { translateCurrent as t } from '@/shared/i18n';

export function childTransferReview(data: BoardData, children: Task[]): Pick<AppMessageReview, 'children' | 'childrenLabel'> {
    return { childrenLabel: t('transfer.children'), children: children.map((task) => ({
        id: task.displayId || `#${task.id}`, title: task.title,
        state: getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status,
        blocked: !['backlog', 'to-do'].includes(statusCategory(task.status, data, task))
    })) };
}

/** Every project-local value is reviewed beside its source value; nothing is matched by name. */
export function projectTransferFields(source: BoardData, destination: BoardData, task: Task, prefix = '', hierarchy: Task[] = []) {
    const catalog = destination.extensions.project!;
    const remove = { value: '__remove__', label: t('transfer.removeExplicit') };
    const members = transferMemberInputs(task);
    const removals = transferRemovals(source, task).filter((entry) => entry.kind !== 'child');
    const fields: MessageSelection[] = [{ required: true, id: `${prefix}state`, label: t('task.status'),
        current: getWorkflow(source, task).states.find((state) => state.id === task.status)?.name || task.status,
        options: getWorkflow(destination, task).states.filter((state) => !prefix || ['backlog', 'to-do'].includes(state.category)).map((state) => ({ value: state.id, label: state.name })) },
    ...members.map((member, index) => ({ required: true, id: `${prefix}member-${index}`, label: t('task.assignees'), current: `${member.name}${member.id === task.responsibleId || member.name === task.responsible ? ` (${t('task.responsible')})` : ''}`,
        options: [remove, ...catalog.members.map((entry) => ({ value: entry.id, label: entry.name }))] })),
    ...task.tags.map((tag, index) => ({ required: true, id: `${prefix}tag-${index}`, label: t('task.tags'), current: tag,
        options: [remove, ...catalog.tags.map((value) => ({ value, label: value }))] }))];
    const preservedParent = task.parentId != null && hierarchy.some((item) => item.id === task.parentId);
    for (const [index, entry] of removals.entries()) {
        if (entry.kind === 'parent' && preservedParent) continue;
        // Phase ancestors are context for the leaf association, not independent assignments.
        if (entry.kind === 'phases' && removals.findIndex((item) => item.kind === 'phases') !== index) continue;
        const roadmap = destination.extensions.roadmap;
        const choices = entry.kind === 'phases' ? (roadmap?.phases || []).filter((phase) => isLeafPhase(roadmap!.phases, phase.id))
            : entry.kind === 'milestones' ? roadmap?.milestones || []
                : entry.kind === 'sprints' ? (roadmap?.sprints || []).filter((sprint) => eligibleSprint(destination, sprint.id)) : [];
        const parents = entry.kind === 'parent' ? destination.board.tasks.filter((parent) => validParent(workitemType(task), parent)).map((parent) => ({ value: String(parent.id), label: `${parent.displayId || `#${parent.id}`} ${parent.title}` })) : [];
        fields.push({ required: true, id: `${prefix}association-${index}`, label: t(`transfer.kind.${entry.kind}`),
            current: `${entry.title}${entry.date ? ` · ${entry.date}` : ''}${entry.start ? ` · ${entry.start}–${entry.end}` : ''}`,
            options: [remove, ...choices.map((item) => ({ value: item.id, label: item.title })), ...parents] });
    }
    if (prefix) for (const field of fields) field.label = `${task.displayId || `#${task.id}`} · ${task.title} — ${field.label}`;
    return {
        fields,
        read: (values: Record<string, string>): { stateId: string; mapping: TransferMapping } => {
            const mapped = (value: string) => value === '__remove__' ? '' : value;
            return { stateId: values[`${prefix}state`], mapping: {
                members: Object.fromEntries(members.map((member, index) => [member.id, mapped(values[`${prefix}member-${index}`])])),
                tags: Object.fromEntries(task.tags.map((tag, index) => [tag, mapped(values[`${prefix}tag-${index}`])])),
                associations: Object.fromEntries(removals.map((entry, index) => [`${entry.kind}:${entry.id}`, fields.some((field) => field.id === `${prefix}association-${index}`) ? mapped(values[`${prefix}association-${index}`]) : '']))
            } };
        }
    };
}
