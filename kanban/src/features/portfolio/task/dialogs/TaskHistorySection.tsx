import type { TaskHistory, TaskHistoryValue } from '@/domain/taskHistoryTypes';
import type { ProjectSaveState } from '@/features/portfolio/types';
import { useI18n } from '@/shared/i18n';
import {
    taskHistoryDate, taskHistoryEntrySummary, taskHistoryFieldLabel,
    taskHistoryItemChanges, taskHistoryValueLines
} from './taskHistoryText';

export function TaskHistorySection({ history, saveState, sourceUnavailable }: {
    history: TaskHistory;
    saveState?: ProjectSaveState;
    sourceUnavailable: boolean;
}) {
    const { t, language } = useI18n();
    return (
        <details id="taskHistory" className="task-history">
            <summary>{t('taskHistory.title')}</summary>
            <div className="task-history-content">
                <div className="task-history-notices" role="status" aria-live="polite">
                    {saveState?.status === 'dirty' && <p>{t('taskHistory.projectPending')}</p>}
                    {saveState?.status === 'saving' && <p>{t('taskHistory.projectSaving')}</p>}
                    {saveState?.status === 'error' && <p className="task-history-save-error">{t('taskHistory.projectError')}</p>}
                    {history.asOf && <p>{t('taskHistory.asOf', { date: taskHistoryDate(history.asOf.at, language) })}</p>}
                    {sourceUnavailable ? <p>{t('taskHistory.sourceUnavailable')}</p>
                        : history.incomplete && <p>{t('taskHistory.incomplete')}</p>}
                    {history.earlierHistoryUnavailable && <p>{t('taskHistory.earlierUnavailable')}</p>}
                </div>
                {history.entries.length === 0 ? <p className="task-history-empty">{t('taskHistory.empty')}</p> : (
                    <ol className="task-history-list" tabIndex={0} aria-label={t('taskHistory.title')}>
                        {history.entries.map((entry) => (
                            <li key={entry.id}>
                                <details className="task-history-entry">
                                    <summary>
                                        <span className="task-history-entry-summary">{taskHistoryEntrySummary(entry, language)}</span>
                                        <time dateTime={entry.at}>{taskHistoryDate(entry.at, language)}</time>
                                    </summary>
                                    {entry.incomplete && <p className="task-history-entry-notice">{t('taskHistory.incomplete')}</p>}
                                    <dl className="task-history-changes">
                                        {entry.changes.map((change) => (
                                            <div className="task-history-change" key={change.field}>
                                                <dt>{taskHistoryFieldLabel(change.field, language)}</dt>
                                                {taskHistoryItemChanges(change, language).map((message, index) => (
                                                    <dd className="task-history-item-change" key={index}>{message}</dd>
                                                ))}
                                                <dd className="task-history-values">
                                                    <HistoryValue field={change.field} value={change.before} side="before" />
                                                    <HistoryValue field={change.field} value={change.after} side="after" />
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </details>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </details>
    );
}

function HistoryValue({ field, value, side }: { field: string; value: TaskHistoryValue; side: 'before' | 'after' }) {
    const { t, language } = useI18n();
    return (
        <div className={`task-history-value ${value.known ? '' : 'unavailable'}`}>
            <span className="task-history-value-label">{t(side === 'before' ? 'common.before' : 'common.after')}</span>
            <ul>{taskHistoryValueLines(field, value, language).map((line, index) => <li key={index}>{line}</li>)}</ul>
        </div>
    );
}
