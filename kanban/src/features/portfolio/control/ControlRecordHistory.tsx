import type { ControlRecord } from '@/domain/projectControl';
import type { HistoryCategory, TaskHistoryProjection } from '@/domain/taskHistory';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { TaskHistory } from '@/features/portfolio/task/dialogs/TaskHistory';

const CATEGORIES = ['all', 'creation', 'fields', 'status', 'people', 'planning', 'relations'] as const;
const FIELDS: Record<string, TranslationKey> = {
    id: 'control.id', kind: 'control.kind', title: 'control.title', description: 'control.description',
    status: 'control.status', owner: 'control.owner', probability: 'control.probability', impact: 'control.impact',
    mitigationPlan: 'control.mitigationPlan', contingencyPlan: 'control.contingencyPlan',
    decisionMaker: 'control.decisionMaker', decisionDate: 'control.decisionDate', rationale: 'control.rationale',
    validator: 'control.validator', dueDate: 'control.dueDate', deliveredDate: 'control.deliveredDate',
    acceptedDate: 'control.acceptedDate', materializedDate: 'control.materializedDate', actualImpact: 'control.actualImpact',
    related: 'control.related', createdAt: 'control.createdAt', updatedAt: 'control.updatedAt'
};

function category(field: string): HistoryCategory {
    if (field === 'id' || field === 'createdAt') return 'creation';
    if (field === 'status') return 'status';
    if (['owner', 'decisionMaker', 'validator'].includes(field)) return 'people';
    if (field.endsWith('Date')) return 'planning';
    if (field === 'related' || field === 'legacyWorkitemIds') return 'relations';
    return 'fields';
}

export function ControlRecordHistory({ record }: { record: ControlRecord }) {
    const { t } = useI18n();
    const history: TaskHistoryProjection = {
        baselineOnly: false, ambiguous: false, lifecycleId: record.id,
        // Preserve the recorded order and values; this is only a presentation adapter.
        entries: record.history.map((entry, index) => ({
            id: entry.id, eventIds: [entry.id], index, at: entry.at, kinds: ['control.updated'], summary: '',
            categories: [...new Set(Object.keys(entry.changes).map(category))],
            changes: Object.entries(entry.changes).map(([field, change]) => ({ field, ...change })),
            author: entry.author, localAuthor: true, bulk: false, partial: false
        })).reverse()
    };
    const formatValue = (value: unknown, field: string): string | undefined => {
        if (typeof value === 'string' && value) {
            if (field === 'kind' && ['risks', 'decisions', 'deliverables'].includes(value)) return t(`control.type.${value}` as TranslationKey);
            if (['status', 'probability', 'impact'].includes(field)) return t(`control.${value}` as TranslationKey);
        }
        if (field === 'related' && value && typeof value === 'object') {
            return Object.entries(value).map(([key, ids]) => `${t(`control.${key}` as TranslationKey)}: ${Array.isArray(ids) && ids.length ? ids.join(', ') : t('common.none')}`).join('\n');
        }
        return undefined;
    };
    return <TaskHistory history={history} categories={CATEGORIES} fieldLabels={FIELDS} formatValue={formatValue} emptyMessage="control.noHistory" />;
}
