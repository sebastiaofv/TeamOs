import type { TaskEditorFields } from '@/domain/types';
import { getProjectInfo } from '@/domain/project';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';

export function ResponsibleEditor({ form, onChange }: { form: TaskEditorFields; onChange: (patch: Partial<TaskEditorFields>) => void }) {
    const { t } = useI18n();
    const context = useAppStore((s) => s.portfolioEditContext || s.portfolioCreateContext);
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === context?.boardId));
    const team = board ? getProjectInfo(board.data).team : [];
    const inactive = team.find((member) => member.id === form.assigneeId && !member.active);
    return <><select id="taskResponsible" aria-labelledby="taskAssigneesLabel" value={form.assigneeId || (form.assignees.length ? 'legacy' : '')} onChange={(event) => {
        const member = team.find((member) => member.id === event.target.value);
        onChange({ assigneeId: member?.id || '', assignees: member ? [member.name] : [] });
    }}>
        <option value="">{t('common.none')}</option>
        {!form.assigneeId && form.assignees.length > 0 && <option value="legacy" disabled>{form.assignees.join(', ')} · {t('assignment.review')}</option>}
        {inactive && <option value={inactive.id} disabled>{inactive.name} · {t('assignment.inactive')}</option>}
        {team.filter((m) => m.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
    </select><p className="muted">{t('assignment.hint')}</p></>;
}
