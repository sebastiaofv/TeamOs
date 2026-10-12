import { useRef, useState, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ProjectDetailsViewModel } from '@/features/portfolio/types';
import type { ProjectBaseData } from '@/domain/projectDetails';
import type { ProjectDetailsSaveResult } from '@/features/portfolio/commands/projectDetailsCommands';
import { useAppStore } from '@/features/portfolio/state/store';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { useI18n } from '@/shared/i18n';

export function ProjectDetailsDialog() {
    const { closeProjectDetails } = usePortfolioActions();
    const vm = useAppStore((state) => state.activeDialog === 'projectDetails'
        ? state.dialogProps as ProjectDetailsViewModel : null);
    const titleRef = useRef<HTMLInputElement>(null);
    const returnFocus = useReturnFocus({ initialFocus: titleRef });

    return (
        <Dialog.Root open={Boolean(vm)} onOpenChange={(open) => { if (!open) closeProjectDetails(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="projectDetailsModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        {...returnFocus}
                    >
                        {vm && <ProjectDetailsForm key={vm.boardId} vm={vm} titleRef={titleRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function ProjectDetailsForm({ vm, titleRef }: {
    vm: ProjectDetailsViewModel;
    titleRef: RefObject<HTMLInputElement | null>;
}) {
    const { saveProjectDetails } = usePortfolioActions();
    const { t } = useI18n();
    const [draft, setDraft] = useState<ProjectBaseData>(() => ({ ...vm.initial, team: [...vm.initial.team] }));
    const [result, setResult] = useState<ProjectDetailsSaveResult | null>(null);
    const [saving, setSaving] = useState(false);
    const mutable = useAppStore((state) => Boolean(state.portfolioBoards.find((board) => board.id === vm.boardId)?.handle)
        && !isBoardInHistoricalPreview(state, vm.boardId));
    const readOnly = vm.readOnly || !mutable;

    async function save() {
        if (saving || readOnly) return;
        setSaving(true);
        try {
            const nextResult = await saveProjectDetails(vm, draft);
            setResult(nextResult);
            if (nextResult === 'invalid-name') titleRef.current?.focus();
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="modal-header">
                <Dialog.Title className="modal-title">{t('projectDetails.heading')}</Dialog.Title>
                <Dialog.Close className="modal-close" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                {readOnly && <p className="project-details-note" role="note">{t(vm.historical ? 'projectDetails.historical' : 'projectDetails.readOnly')}</p>}
                <form id="projectDetailsForm" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <div className="form-group">
                        <label className="required" htmlFor="projectDetailsName">{t('projectDetails.name')}</label>
                        <input
                            id="projectDetailsName"
                            ref={titleRef}
                            type="text"
                            required
                            readOnly={readOnly}
                            value={draft.title}
                            aria-invalid={result === 'invalid-name'}
                            aria-describedby={result === 'invalid-name' ? 'projectDetailsError' : undefined}
                            onChange={(event) => {
                                setDraft((current) => ({ ...current, title: event.target.value }));
                                if (result === 'invalid-name') setResult(null);
                            }}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="projectDetailsDescription">{t('projectDetails.description')}</label>
                        <textarea id="projectDetailsDescription" rows={4} readOnly={readOnly} value={draft.description}
                            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label id="projectDetailsTeamLabel">{t('projectDetails.team')}</label>
                        <div role="group" aria-labelledby="projectDetailsTeamLabel">
                            <p className="project-details-note">{t('projectDetails.teamHint')}</p>
                            {draft.team.map((name, index) => (
                                <div className="project-details-person" key={index}>
                                    <input
                                        type="text"
                                        aria-label={t('projectDetails.person', { number: index + 1 })}
                                        value={name}
                                        readOnly={readOnly}
                                        onChange={(event) => setDraft((current) => ({
                                            ...current,
                                            team: current.team.map((person, personIndex) => personIndex === index ? event.target.value : person)
                                        }))}
                                    />
                                    {!readOnly && <button className="btn" type="button" aria-label={t('projectDetails.removePerson', { number: index + 1 })}
                                        onClick={() => setDraft((current) => ({ ...current, team: current.team.filter((_, personIndex) => personIndex !== index) }))}
                                    >{t('common.remove')}</button>}
                                </div>
                            ))}
                            {draft.team.length === 0 && <p className="project-details-note">{t('projectDetails.emptyTeam')}</p>}
                            {!readOnly && <button className="btn" type="button" onClick={() => setDraft((current) => ({ ...current, team: [...current.team, ''] }))}>{t('projectDetails.addPerson')}</button>}
                        </div>
                    </div>
                    {(result === 'invalid-name' || result === 'conflict' || result === 'unavailable' || result === 'failed') && (
                        <p className="project-details-error" id="projectDetailsError" role="alert">
                            {t(result === 'invalid-name' ? 'projectDetails.nameRequired' : result === 'conflict' ? 'projectDetails.conflict'
                                : result === 'failed' ? 'projectDetails.saveFailed' : 'projectDetails.unavailable')}
                        </p>
                    )}
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn">{t(readOnly ? 'common.close' : 'projectDetails.cancel')}</Dialog.Close>
                {!readOnly && <button className="btn btn-primary" type="submit" form="projectDetailsForm" disabled={saving}>{t('projectDetails.save')}</button>}
            </div>
        </>
    );
}
