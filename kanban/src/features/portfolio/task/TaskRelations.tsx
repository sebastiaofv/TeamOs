import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { getProjectInfo } from '@/domain/project';
import { getRelations, refKey, taskRef } from '@/domain/relations';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function TaskRelations({ readOnly }: { readOnly: boolean }) {
    const context = useAppStore((s) => s.portfolioDetailContext);
    const boards = useAppStore((s) => s.portfolioBoards);
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const [target, setTarget] = useState('');
    const [kind, setKind] = useState('related');
    const board = boards.find((b) => b.id === context?.boardId);
    const task = board?.data.board.tasks.find((task) => task.id === context?.taskId);
    if (!board || !task) return null;
    const currentRef = taskRef(board.data, task.id);
    const product = getProjectInfo(board.data).product.trim().toLowerCase();
    const candidates = boards.filter((b) => b.id === board.id || product && getProjectInfo(b.data).product.trim().toLowerCase() === product);
    const links = boards.flatMap((owner) => getRelations(owner.data).filter((link) => refKey(link.from) === refKey(currentRef) || refKey(link.to) === refKey(currentRef)).map((link) => ({ owner, link })));
    const hierarchy = board.data.board.tasks.filter((item) => item.id === task.parentId || item.parentId === task.id);
    return <section className="workitem-section" id="taskRelations"><h3>{t('relations.title')}</h3>
        <p className="muted">{t('relations.coverage')}</p>
        {hierarchy.map((item) => <div className="workitem-link-row" key={item.id}><span>{t(item.id === task.parentId ? 'relations.parent' : 'relations.child')}</span><button type="button" className="btn-text" onClick={() => actions.openPortfolioTaskDetails(board.id, item.id)}>#{item.id} · {item.title}</button></div>)}
        {links.map(({ owner, link }) => {
            const forward = refKey(link.from) === refKey(currentRef), other = forward ? link.to : link.from;
            const targetBoard = boards.find((b) => getProjectInfo(b.data).id === other.projectId);
            const otherTask = targetBoard?.data.board.tasks.find((t) => t.id === other.taskId);
            return <div className="workitem-link-row" key={link.id}><span>{t(link.kind === 'related' ? 'relations.related' : forward ? 'relations.blocks' : 'relations.blockedBy')}</span>
                <button className="btn-text" type="button" disabled={!otherTask} onClick={() => targetBoard && actions.openPortfolioTaskDetails(targetBoard.id, other.taskId)}>#{other.taskId} · {otherTask?.title || t('relations.unavailable')}</button>
                {!readOnly && owner.handle && <button className="btn-text" type="button" onClick={() => actions.unlinkWorkitems(owner.id, link.id)}>{t('common.remove')}</button>}</div>;
        })}
        {!links.length && !hierarchy.length && <p>{t('relations.empty')}</p>}
        {!readOnly && <>
            <div className="form-row"><label>{t('relations.kind')}<select value={kind} onChange={(e) => setKind(e.target.value)}>{['related', 'blocks', 'blockedBy', 'parent', 'child'].map((kind) => <option key={kind} value={kind}>{t(`relations.${kind}` as 'relations.related')}</option>)}</select></label>
                <label>{t('relations.target')}<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">{t('common.choose')}</option>{candidates.flatMap((candidate) => candidate.data.board.tasks.filter((item) => (candidate.id !== board.id || item.id !== task.id) && (!['parent', 'child'].includes(kind) || candidate.id === board.id)).map((item) => <option key={`${candidate.id}:${item.id}`} value={`${candidate.id}|${item.id}`}>{candidate.title} · #{item.id} · {item.title}</option>))}</select></label></div>
            <div className="project-actions"><button className="btn" type="button" disabled={!target} onClick={async () => {
                const [targetBoard, targetId] = target.split('|');
                if (kind === 'parent' || kind === 'child') await actions.setWorkitemParent(board.id, kind === 'parent' ? task.id : Number(targetId), kind === 'parent' ? Number(targetId) : task.id);
                else await actions.linkWorkitems(board.id, task.id, targetBoard, Number(targetId), kind === 'related' ? 'related' : 'blocks', kind === 'blockedBy');
                setTarget('');
            }}>{t('relations.link')}</button>
                <button className="btn" type="button" onClick={() => actions.openPortfolioCreateTaskModal(board.id, undefined, { relatedToTaskId: task.id })}>{t('relations.create')}</button>
            </div>
        </>}
    </section>;
}
