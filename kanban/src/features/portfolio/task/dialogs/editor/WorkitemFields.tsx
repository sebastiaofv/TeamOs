import type { TaskEditorFields, Task } from '@/domain/types';
import { WORKITEM_TYPES, canParent } from '@/domain/workitems';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';

export function WorkitemFields({ form, onChange }: { form: TaskEditorFields; onChange: (next: Partial<TaskEditorFields>) => void }) {
    const { t } = useI18n();
    const editing = useAppStore((s) => s.portfolioEditContext);
    const context = useAppStore((s) => s.portfolioEditContext || s.portfolioCreateContext);
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === context?.boardId));
    const parents = board?.data.board.tasks.filter((task) => task.id !== editing?.taskId && canParent(task, { workitemType: form.workitemType } as Task)) || [];
    return <>
        <div className="form-row"><div className="form-group"><label htmlFor="taskType">{t('workitem.type')}</label>
            <select id="taskType" value={form.workitemType || 'task'} disabled={Boolean(editing)} onChange={(e) => onChange({ workitemType: e.target.value as Task['workitemType'], parentId: null })}>
                {WORKITEM_TYPES.map((type) => <option key={type} value={type}>{t(`workitem.${type}`)}</option>)}
            </select></div><div className="form-group"><label htmlFor="taskParent">{t('workitem.parent')}</label>
            <select id="taskParent" value={form.parentId || ''} onChange={(e) => onChange({ parentId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('common.none')}</option>{parents.map((p) => <option key={p.id} value={p.id}>#{p.id} · {p.title}</option>)}
            </select></div></div>
        {form.workitemType === 'story' && <div className="form-group"><label htmlFor="taskAcceptance">{t('workitem.acceptance')}</label><textarea id="taskAcceptance" value={form.acceptanceCriteria || ''} onChange={(e) => onChange({ acceptanceCriteria: e.target.value })} /></div>}
        {form.workitemType === 'bug' && <><div className="form-group"><label htmlFor="taskReproduction">{t('workitem.reproduction')}</label><textarea id="taskReproduction" value={form.reproductionSteps || ''} onChange={(e) => onChange({ reproductionSteps: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="taskExpected">{t('workitem.expected')}</label><textarea id="taskExpected" value={form.expectedResult || ''} onChange={(e) => onChange({ expectedResult: e.target.value })} /></div></>}
    </>;
}
