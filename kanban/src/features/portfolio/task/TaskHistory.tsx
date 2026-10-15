import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { workitemHistory, historyCategory, HISTORY_CATEGORIES, historyValue } from '@/domain/workitemHistory';
import { taskRef } from '@/domain/relations';
import { getBoardTimelineData } from '@/domain/timeline';
import { describeTimelineEvent } from '@/features/portfolio/timeline/timelineEventText';
import { useI18n, type TranslationKey } from '@/shared/i18n';

const FIELD_NAMES: Record<string, TranslationKey> = {
    title: 'task.title', description: 'task.description', status: 'task.status', assignees: 'task.assignees', assigneeId: 'task.assignee', tags: 'task.tags', blocked: 'task.blocked', blockerReason: 'task.blocker', priority: 'task.priority', effort: 'task.effort', phaseId: 'task.phase', milestoneId: 'task.milestone', sprintId: 'task.sprint', dueDate: 'task.due', attachments: 'task.attachments', parentId: 'workitem.parent', workitemType: 'workitem.type', archived: 'table.archived', checklist: 'task.todoList'
};

export function TaskHistory() {
    const { t, language } = useI18n();
    const boards = useAppStore((s) => s.portfolioBoards);
    const context = useAppStore((s) => s.portfolioDetailContext);
    const [category, setCategory] = useState('all');
    const [limit, setLimit] = useState(50);
    const board = boards.find((b) => b.id === context?.boardId);
    if (!board || !context) return null;
    const events = workitemHistory(boards.map((board) => board.data), taskRef(board.data, context.taskId));
    const filtered = events.filter((event) => category === 'all' || historyCategory(event) === category);
    const since = getBoardTimelineData(board.data)?.events[0]?.at;
    return <section id="taskHistory" aria-label={t('history.title')}>
        <p className="muted">{t('history.partial')}{since ? ` ${new Date(since).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}` : ''}</p>
        <label htmlFor="historyCategory">{t('history.category')}</label><select id="historyCategory" value={category} onChange={(e) => { setCategory(e.target.value); setLimit(50); }}>{HISTORY_CATEGORIES.map((category) => <option key={category} value={category}>{t(`history.${category}`)}</option>)}</select>
        <ol className="workitem-history">{filtered.slice(0, limit).map((event) => {
            const actor = event.meta?.actor as { name?: string } | undefined;
            return <li key={event.id}><div className="workitem-link-row"><strong>{describeTimelineEvent(event, language)}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}</time></div>
                <p className="muted">{actor?.name ? `${actor.name} · ${t('assignment.local')}` : t('assignment.unidentified')}</p>
                <dl>{Object.entries(event.changes || {}).map(([field, change]) => <div className="history-change" key={field}><dt>{FIELD_NAMES[field] ? t(FIELD_NAMES[field]) : field}</dt><dd><span>{historyValue(change.before)}</span> → <span>{historyValue(change.after)}</span></dd></div>)}</dl>
            </li>;
        })}</ol>
        {!filtered.length && <p>{t('history.empty')}</p>}
        <p className="muted">{Math.min(limit, filtered.length)} / {filtered.length}</p>
        {limit < filtered.length && <button className="btn" type="button" onClick={() => setLimit(limit + 50)}>{t('history.more')}</button>}
    </section>;
}
