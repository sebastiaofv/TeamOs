import { workitemLabel } from '@/domain/taskIdentity';
import { useState } from 'react';
import type { Task, Workflow } from '@/domain/types';
import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { getWorkflow, canTransition } from '@/domain/workflow';
import { eligibleSprint, isPlanningUnit, validParent, workitemType } from '@/domain/workitems';
import { isTaskBlocked } from '@/domain/taskRelations';
import { getProjectData } from '@/domain/projectData';
import { normalizeEffort, normalizePriority } from '@/domain/task';
import { useI18n } from '@/shared/i18n';
import { AssigneeEditor } from './editor/AssigneeEditor';
import { TagEditor } from './editor/TagEditor';
import { TaskPlanning } from './TaskPlanning';
import { WorkflowStateBadge } from '../WorkflowStateBadge';

export function TaskProperties({ vm, task }: { vm: TaskDetailViewModel; task: Task }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const data = vm.sourceBoardData;
    const type = workitemType(task);
    const project = getProjectData(data);
    const workflow = getWorkflow(data, task);
    const save = (changes: Parameters<typeof actions.setPortfolioTaskProperties>[2]) => void actions.setPortfolioTaskProperties(vm.boardId, task.id, changes);
    return <>
        <section className="workitem-property-group"><h3>{t('workitems.properties')}</h3>
            <StatusEditor task={task} workflow={workflow} vm={vm} />
            <div className="form-group"><label htmlFor="detailPriorityInput">{t('task.priority')}</label>
                <select id="detailPriorityInput" value={task.priority || ''} onChange={(event) => save({ priority: normalizePriority(event.target.value) })}>
                    <option value="">{t('common.none')}</option>{(['high', 'medium', 'low'] as const).map((value) => <option key={value} value={value}>{t(`toolbar.${value}`)}</option>)}
                </select></div>
            {type !== 'epic' && <div className="form-group"><label htmlFor="detailEffortInput">{t('task.effort')}</label>
                <select id="detailEffortInput" value={task.effort || ''} onChange={(event) => save({ effort: normalizeEffort(event.target.value) })}>
                    <option value="">{t('common.none')}</option>{['XS', 'S', 'M', 'L', 'XL'].map((value) => <option key={value}>{value}</option>)}
                </select></div>}
            <div className="form-group"><label htmlFor="detailDueDateInput">{t('task.due')}</label>
                <input id="detailDueDateInput" type="date" value={task.dueDate || ''} onChange={(event) => save({ dueDate: event.target.value })} /></div>
            <BlockerEditor key={`${task.id}:${task.blocked}:${task.blockerReason}`} task={task} effectiveBlocked={isTaskBlocked(data, task.id)} save={save} />
        </section>
        <section className="workitem-property-group"><h3>{t('workitems.people')}</h3>
            <div className="form-group"><label htmlFor="detailResponsibleInput">{t('task.responsible')}</label>
                <select id="detailResponsibleInput" value={task.responsible || ''} onChange={(event) => void actions.setPortfolioTaskResponsible(vm.boardId, task.id, event.target.value)}>
                    <option value="">{t('task.noResponsible')}</option>{project.members.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                </select></div>
            <div className="form-group"><label id="taskAssigneesLabel">{t('task.assignees')}</label>
                <AssigneeEditor value={task.assignees} pool={project.members.map((member) => member.name)} onChange={(next) => {
                    const added = next.find((name) => !task.assignees.includes(name));
                    if (added) void actions.togglePortfolioTaskAssignee(vm.boardId, task.id, added);
                }} onRemove={(index) => void actions.togglePortfolioTaskAssignee(vm.boardId, task.id, task.assignees[index])} /></div>
            <div className="form-group"><label id="taskTagsLabel">{t('task.tags')}</label>
                <TagEditor value={task.tags} suggestions={project.tags} onChange={(tags) => save({ tags })} /></div>
        </section>
        <section className="workitem-property-group"><h3>{t('roadmap.planning')}</h3>
            {['story', 'task'].includes(type) && <div className="form-group"><label htmlFor="detailParentInput">{t('workitems.parent')}</label>
                <select id="detailParentInput" value={task.parentId || ''} onChange={(event) => save({ parentId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">{t('common.none')}</option>{data.board.tasks.filter((parent) => parent.id !== task.id && validParent(type, parent)).map((parent) => <option key={parent.id} value={parent.id}>{workitemLabel(parent)} {parent.title}</option>)}
                </select></div>}
            <TaskPlanning readOnly={false} />
            {type !== 'epic' && <div className="form-group"><label htmlFor="detailSprintInput">{t('task.sprint')}</label>
                <select id="detailSprintInput" value={task.sprintId || ''} disabled={!isPlanningUnit(data, task)} onChange={(event) => save({ sprintId: event.target.value })}>
                    <option value="">{t('common.none')}</option>{data.extensions.roadmap?.sprints.filter((sprint) => sprint.id === task.sprintId || eligibleSprint(data, sprint.id)).map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.title}</option>)}
                </select></div>}
        </section>
        <section className="workitem-property-group"><h3>{t('history.title')}</h3><dl className="detail-list">
            <div className="detail-item"><dt className="detail-label">{t('task.created')}</dt><dd id="detailCreatedAt" className="detail-value">{vm.fields.createdAt}</dd></div>
            <div className="detail-item"><dt className="detail-label">{t('task.updated')}</dt><dd id="detailUpdatedAt" className="detail-value">{vm.fields.updatedAt}</dd></div>
        </dl></section>
    </>;
}

function StatusEditor({ task, workflow, vm }: { task: Task; workflow: Workflow; vm: TaskDetailViewModel }) {
    const { movePortfolioTaskToStatus } = usePortfolioActions();
    const { t } = useI18n();
    const state = workflow.states.find((state) => state.id === task.status);
    return <div className="form-group detail-status-editor"><label htmlFor="detailStatusInput">{t('task.status')}</label>
        <div className="detail-status-control" id="detailStatus">
            {state && <WorkflowStateBadge state={state} />}
            <select id="detailStatusInput" aria-label={t('task.status')} value={task.status} onChange={(event) => void movePortfolioTaskToStatus(vm.boardId, task.id, event.target.value)}>
                {workflow.states.filter((state) => state.id === task.status || canTransition(vm.sourceBoardData, task.status, state.id, task)).map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
        </div>
    </div>;
}

function BlockerEditor({ task, effectiveBlocked, save }: { task: Task; effectiveBlocked: boolean; save: (changes: Partial<Pick<Task, 'blocked' | 'blockerReason'>>) => void }) {
    const { t } = useI18n();
    const [blocked, setBlocked] = useState(task.blocked);
    const [reason, setReason] = useState(task.blockerReason);
    return <>
        <div className="form-group"><label htmlFor="detailBlockedInput">{t('task.blocked')} · <span id="detailBlocked">{t(effectiveBlocked ? 'common.yes' : 'common.no')}</span></label>
            <div className="form-checkbox-row"><input id="detailBlockedInput" aria-label={t('task.blocked')} type="checkbox" checked={blocked} onChange={(event) => {
                setBlocked(event.target.checked);
                if (!event.target.checked) save({ blocked: false, blockerReason: '' });
                else if (reason.trim()) save({ blocked: true, blockerReason: reason.trim() });
            }} /><span>{t('task.markBlocked')}</span></div></div>
        {blocked && <div className="form-group"><label className="required" htmlFor="detailBlockerInput">{t('task.blocker')}</label>
            <textarea id="detailBlockerInput" required value={reason} placeholder={t('task.blockerPlaceholder')} onChange={(event) => setReason(event.target.value)} onBlur={() => { if (reason.trim() !== task.blockerReason || blocked !== task.blocked) save({ blocked: true, blockerReason: reason.trim() }); }} />
        </div>}
    </>;
}
