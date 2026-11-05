import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { projectActor, selectProjectMember, useProjectIdentityRevision } from './projectIdentity';

export function ProjectIdentityDialog() {
    const boards = useAppStore((state) => state.portfolioBoards);
    useProjectIdentityRevision();
    const board = boards.find((record) => !projectActor(record.id));
    return board ? <IdentityForm key={board.id} boardId={board.id} /> : null;
}
function IdentityForm({ boardId }: { boardId: string }) {
    const board = useAppStore((state) => state.portfolioBoards.find((record) => record.id === boardId))!;
    const { addProjectMember } = usePortfolioActions();
    const { t } = useI18n();
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    return <Dialog.Root open><Dialog.Portal><Dialog.Overlay className="modal active" id="projectIdentityModal"><Dialog.Content className="modal-content" aria-describedby="projectIdentityHelp" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="modal-header"><Dialog.Title>{t('identity.title')} · {board.title}</Dialog.Title></div>
        <div className="modal-body"><p id="projectIdentityHelp">{t('identity.help')}</p>
            <label className="form-group">{t('identity.member')}<select aria-label={t('identity.member')} value={id} disabled={busy} onChange={(event) => setId(event.target.value)}>
                <option value="">{t('identity.choose')}</option>{board.data.extensions.project?.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                {board.handle && <option value="@new">{t('identity.create')}</option>}
            </select></label>
            {id === '@new' && <label className="form-group">{t('identity.name')}<input autoFocus value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>}
            {!board.handle && !board.data.extensions.project?.members.length && <p>{t('identity.readOnly')}</p>}
        </div>
        <div className="modal-footer"><button className="btn btn-primary" disabled={busy || (!id && Boolean(board.handle || board.data.extensions.project?.members.length)) || (id === '@new' && !name.trim())} onClick={async () => {
            if (id !== '@new') { selectProjectMember(boardId, id || '@reader'); return; }
            setBusy(true); try { const memberId = await addProjectMember(boardId, name); if (memberId) selectProjectMember(boardId, memberId); } finally { setBusy(false); }
        }}>{busy && <span className="save-spinner" aria-hidden="true" />}{t('messages.confirm')}</button></div>
    </Dialog.Content></Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}
