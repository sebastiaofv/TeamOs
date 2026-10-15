import { useState } from 'react';
import type { BoardData, Task } from '@/domain/types';
import type { BoardRecord } from '@/features/portfolio/types';
import { buildDrilldownTree, type DrilldownNode } from '@/features/portfolio/queries/planDrilldown';
import { PortfolioTaskCard, type TaskCardState } from '@/features/portfolio/task/TaskCard';
import { getRoadmapExtension } from '@/domain/roadmap';
import { isTaskCompleted } from '@/domain/workflow';
import { executionProgress } from '@/domain/projectPlan';
import { useI18n } from '@/shared/i18n';

export function PlanDrilldown({ tasks, directIds, descriptor, board, data, historical, state }: {
    tasks: Task[]; directIds: Set<number>; descriptor: string; board: BoardRecord; data: BoardData; historical: boolean; state: TaskCardState;
}) {
    const { t } = useI18n();
    const [grouping, setGrouping] = useState('completion'), [limit, setLimit] = useState(100);
    const roadmap = getRoadmapExtension(data);
    const progress = executionProgress(data, tasks);
    const groups = new Map<string, { label: string; tasks: Task[] }>();
    for (const task of tasks.slice(0, limit)) {
        const key = grouping === 'completion' ? isTaskCompleted(data, task) ? 'done' : 'open' : grouping === 'sprint' ? task.sprintId : grouping === 'milestone' ? task.milestoneId : 'all';
        const label = grouping === 'completion' ? t(key === 'done' ? 'plan.completed' : 'plan.open') : grouping === 'sprint' ? roadmap?.sprints.find((item) => item.id === key)?.title || t('drilldown.unassociated') : grouping === 'milestone' ? roadmap?.milestones.find((item) => item.id === key)?.title || t('drilldown.unassociated') : t('drilldown.hierarchy');
        if (!groups.has(key)) groups.set(key, { label, tasks: [] });
        groups.get(key)!.tasks.push(task);
    }
    function renderNodes(nodes: DrilldownNode[]) {
        return <ul className="drilldown-tree">{nodes.map((node) => <li key={node.task.id}>
            <span className="drilldown-origin">{t(node.direct ? 'drilldown.direct' : 'drilldown.inherited')}{node.task.archived ? ` · ${t('table.archived')}` : ''}</span>
            <PortfolioTaskCard state={state} item={{ boardIndex: state.portfolioBoards.findIndex((b) => b.id === board.id), boardId: board.id, taskId: node.task.id, taskIndex: data.board.tasks.findIndex((task) => task.id === node.task.id), boardTitle: board.title, boardFileName: board.fileName, canMutate: false, historical, boardData: data, task: node.task }} />
            {node.children.length > 0 && <details open><summary>{t('drilldown.children', { count: node.children.length })}</summary>{renderNodes(node.children)}</details>}
        </li>)}</ul>;
    }
    return <div className="roadmap-task-list" data-roadmap-task-list={descriptor} id={`roadmap-tasks-${descriptor.replace(/[:\s]/g, '-')}`}><div className="roadmap-task-list-gutter" aria-hidden="true" /><div className="roadmap-task-list-track plan-drilldown">
        <div className="dashboard-controls"><label>{t('drilldown.group')}<select aria-label={t('drilldown.group')} value={grouping} onChange={(e) => setGrouping(e.target.value)}>{(['completion', 'hierarchy', 'sprint', 'milestone'] as const).map((group) => <option key={group} value={group}>{t(`drilldown.${group}`)}</option>)}</select></label>
            <span className="muted">{progress.completed.length}/{progress.eligible.length} · {progress.percent == null ? t('plan.na') : `${Math.round(progress.percent)}%`} · {Math.min(tasks.length, limit)}/{tasks.length}</span>
        </div>
        {!tasks.length && <p>{t('roadmap.noTasksAssigned')}</p>}
        {[...groups.entries()].map(([key, group]) => <section key={key}><h4>{group.label}</h4>{renderNodes(buildDrilldownTree(group.tasks, directIds))}</section>)}
        {tasks.length > limit && <button className="btn" type="button" onClick={() => setLimit(limit + 100)}>{t('drilldown.more')}</button>}
    </div></div>;
}
