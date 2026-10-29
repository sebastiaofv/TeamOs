import { useState } from 'react';
import { HISTORY_CATEGORIES, type HistoryCategory, type TaskHistoryEntry, type TaskHistoryProjection } from '@/domain/taskHistory';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { formatFileSize } from '@/domain/util';

const FIELDS: Record<string, TranslationKey> = {
    transfer: 'history.transfer', title: 'task.title', description: 'task.description', status: 'task.status', assignees: 'task.assignees', responsible: 'task.responsible',
    tags: 'task.tags', priority: 'task.priority', effort: 'task.effort', dueDate: 'task.due', blocked: 'task.blocked', blockerReason: 'task.blocker',
    checklist: 'task.todoList', attachments: 'task.attachments', archived: 'table.archived', phaseId: 'task.phase', milestoneId: 'task.milestone', sprintId: 'task.sprint',
    planner: 'history.planner', relations: 'history.relations', existence: 'history.existence', pullRequests: 'history.pullRequests'
};

function operation(entry: TaskHistoryEntry, t: ReturnType<typeof useI18n>['t']): string {
    if (entry.kinds.includes('task.transferred')) return t('history.transfer');
    if (entry.kinds.includes('board.restored')) return t('history.projectRestore');
    if (entry.kinds.includes('task.created')) return t('history.created');
    if (entry.kinds.includes('task.deleted')) return t('history.deleted');
    if (entry.kinds.includes('task.archived')) return t('history.archived');
    if (entry.kinds.includes('task.restored')) return t('history.unarchived');
    if (entry.kinds.includes('task.comment.published')) return t('history.commentPublished');
    const categories = [...new Set(entry.categories)];
    const count = entry.changes.length;
    // Partial legacy operations may have no recorded changes to count.
    if (!count || !categories.length) return t('history.updated');
    const category = categories.length === 1
        ? t(`history.category.${categories[0]}`)
        : t('history.categoryCount', { count: categories.length });
    if (categories.length === 1 && count === 1) return category;
    return `${category} · ${t(count === 1 ? 'history.changeCount.one' : 'history.changeCount.other', { count })}`;
}

function readable(value: unknown, field: string, t: ReturnType<typeof useI18n>['t']): string {
    if (value === undefined) return t('history.unavailable');
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) return t('common.none');
    if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map((item) => readable(item, field, t)).join('\n');
    if (value && typeof value === 'object') {
        const item = value as Record<string, unknown>;
        if (typeof item.historical === 'boolean' && typeof item.id === 'string') return `${item.label || item.id} [${item.id}]${item.label && !item.historical ? ` · ${t('history.currentName')}` : ''}`;
        if (field === 'attachments') return item.unavailable ? t('history.detailsUnavailable') : `${item.name || item.id} · ${item.mime || item.kind || ''} · ${typeof item.sizeBytes === 'number' ? formatFileSize(item.sizeBytes) : t('history.unavailable')}`;
        if (field === 'checklist') return `${item.done ? '☑' : '☐'} ${item.text || ''}`;
        if (field === 'planner') return `${item.date || ''} ${item.start || ''}–${item.end || ''} [${item.id || ''}]`;
        if (field === 'relations') return `${t(item.direction === 'blocks' ? 'history.blocks' : item.direction === 'blockedBy' ? 'history.blockedBy' : 'history.related')} ${typeof item.displayId === 'string' ? item.displayId : `#${item.id}`}${item.title ? ` · ${item.title}` : ''}`;
        // Unknown future content stays legible without exposing binary payloads.
        return Object.entries(item).filter(([key]) => !['dataUrl', 'base64', 'body', 'images'].includes(key)).map(([key, child]) => `${key}: ${readable(child, field, t)}`).join('\n');
    }
    return t('history.unavailable');
}

export function TaskHistory({ history }: { history?: TaskHistoryProjection }) {
    const { t, language } = useI18n();
    const [category, setCategory] = useState<HistoryCategory>('all');
    const date = (value: string) => new Date(value).toLocaleString(language === 'pt' ? 'pt-PT' : 'en');
    const allEntries = history?.entries || [];
    const entries = allEntries.filter((entry) => category === 'all' || entry.categories.includes(category));
    return <section className="task-history" aria-label={t('history.title')}>
        <p className="history-note">{t('history.localRecord')}</p>
        {history?.availableFrom && <p className="history-note">{t('history.availableFrom', { date: date(history.availableFrom) })}</p>}
        {history?.historicalIndex !== undefined && <p className="history-context" role="note">{t('history.cutoff', { position: history.historicalIndex + 1 })}</p>}
        {history?.ambiguous && <p className="history-context" role="note">{t('history.ambiguous')}</p>}
        <label className="history-filter">{t('history.filter')}<select aria-label={t('history.filter')} value={category} onChange={(event) => setCategory(event.target.value as HistoryCategory)}>
            {HISTORY_CATEGORIES.map((value) => <option key={value} value={value}>{t(`history.category.${value}`)}</option>)}
        </select></label>
        {!entries.length ? <div className="history-empty" role="status">
            <p>{t(allEntries.length ? 'history.noMatches' : history?.baselineOnly ? 'history.baselineOnly' : 'history.empty')}</p>
            {category !== 'all' && <button className="btn" onClick={() => setCategory('all')}>{t('history.category.all')}</button>}
        </div> : <ol className="history-entries">{entries.map((entry) => <li key={entry.id}>
            <details className="history-entry"><summary>
                <span className="history-entry-heading">
                    <span className="history-operation">{operation(entry, t)}{entry.bulk && <span className="history-bulk">{t('history.bulk')}</span>}</span>
                    <span className="history-entry-meta">
                        <time dateTime={entry.at}>{date(entry.at)}</time>
                        <span className="history-author">{entry.author || t('history.unknown')}{entry.localAuthor && ` · ${t('history.localAuthor')}`}</span>
                    </span>
                </span>
            </summary>
                <p className="history-summary">{entry.summary}</p>
                {entry.cause && <p>{t('history.cause')}: {entry.cause}</p>}
                {entry.origin && <p>{t('history.origin')}: {entry.origin}</p>}
                {entry.partial && <p>{t('history.detailsUnavailable')}</p>}
                <dl className="history-changes">{entry.changes.map((change, index) => <div className="history-change" key={`${change.field}:${index}`}>
                    <dt>{FIELDS[change.field] ? t(FIELDS[change.field]) : change.field}</dt>
                    <dd><div><span>{t('common.before')}</span><pre>{change.before === undefined && entry.kinds.includes('task.created') ? '—' : readable(change.before, change.field, t)}</pre></div>
                        <div><span>{t('common.after')}</span><pre>{change.after === undefined && entry.kinds.includes('task.deleted') ? t('common.none') : readable(change.after, change.field, t)}</pre></div></dd>
                </div>)}</dl>
                <p className="history-event-ids">{entry.eventIds.join(' · ')}</p>
            </details>
        </li>)}</ol>}
    </section>;
}
