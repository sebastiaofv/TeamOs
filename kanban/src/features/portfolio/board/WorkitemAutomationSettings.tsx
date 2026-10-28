import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { WorkitemAutomation } from '@/domain/types';
import { getWorkflow } from '@/domain/workflow';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';

export function WorkitemAutomationSettings() {
    const board = useAppStore((state) => state.portfolioBoards.find((item) => item.id === state.selectedPortfolioBoardId));
    const timeline = useAppStore((state) => state.portfolioTimelineSelection);
    const preview = timeline ? getSelectedPortfolioTimelineView(useAppStore.getState()) : null;
    const historical = Boolean(preview?.isPreview);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<WorkitemAutomation>({ version: 1 });
    const [expected, setExpected] = useState('null');
    const [busy, setBusy] = useState(false);
    const { saveWorkitemAutomation } = usePortfolioActions();
    const { t } = useI18n();
    if (!board) return null;
    const source = preview?.isPreview && preview.projectedBoard ? preview.projectedBoard : board.data;
    const states = getWorkflow(source).states.filter((state) => !['completed', 'cancelled'].includes(state.category));
    const readOnly = !board.handle || historical;
    return <><button className="btn" type="button" onClick={() => { setExpected(JSON.stringify(source.extensions.workitemAutomation ?? null)); setDraft(structuredClone(source.extensions.workitemAutomation || { version: 1 })); setOpen(true); }}>{t('workitems.automation')}</button>
        <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="modal active"><Dialog.Content className="modal-content" aria-describedby={undefined} onEscapeKeyDown={escapeAnswersAppMessage} onKeyDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><Dialog.Title className="modal-title">{t('workitems.automation')}</Dialog.Title><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div>
            <div className="modal-body">{(['start', 'finish'] as const).map((key) => <fieldset key={key} disabled={readOnly || busy}><legend>{t(`workitems.${key}`)}</legend>
                <label htmlFor={`automation-${key}`}>{t('workitems.to')}</label><select id={`automation-${key}`} value={draft[key]?.to || ''} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value ? { to: event.target.value, from: value[key]?.from.filter((id) => id !== event.target.value) || [] } : undefined }))}>
                    <option value="">{t('workitems.disabled')}</option>{states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
                </select>
                {draft[key] && <div className="form-group"><p>{t('workitems.from')}</p>{states.filter((state) => state.id !== draft[key]?.to).map((state) => <label key={state.id} style={{ display: 'block' }}><input type="checkbox" checked={draft[key]?.from.includes(state.id) || false} onChange={(event) => setDraft((value) => ({ ...value, [key]: { to: value[key]!.to, from: event.target.checked ? [...value[key]!.from, state.id] : value[key]!.from.filter((id) => id !== state.id) } }))} /> {state.name}</label>)}</div>}
            </fieldset>)}</div>
            <div className="modal-footer"><Dialog.Close className="btn">{t('common.cancel')}</Dialog.Close><button className="btn btn-primary" disabled={readOnly || busy} onClick={async () => { setBusy(true); try { if (await saveWorkitemAutomation(board.id, draft, expected)) setOpen(false); } finally { setBusy(false); } }}>{t('common.save')}</button></div>
        </Dialog.Content></Dialog.Overlay></Dialog.Portal></Dialog.Root></>;
}
