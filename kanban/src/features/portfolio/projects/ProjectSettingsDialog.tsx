import { useRef, useState, type KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { DialogPropsByName } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { closeDialog } from '@/app/overlays/dialogs';
import { createProjectIdentity, getProjectData, PROJECT_STATUSES, projectNameKey } from '@/domain/projectData';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';
import { WorkflowEditor, useWorkflowEditor } from '@/features/portfolio/board/WorkflowSettings';
import { areSerializableValuesEqual } from '@/domain/serializable';

export function ProjectSettingsDialog() {
    const props = useAppStore((state) => state.activeDialog === 'projectSettings' ? state.dialogProps as DialogPropsByName['projectSettings'] : null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const returnFocus = useReturnFocus({ initialFocus: closeRef });
    return <Dialog.Root open={Boolean(props)} onOpenChange={(open) => { if (!open) closeDialog('projectSettings'); }}>
        <Dialog.Portal><Dialog.Overlay className="modal active" id="projectSettingsModal">
            <Dialog.Content className="modal-content workflow-dialog" aria-describedby="projectSettingsDescription" {...returnFocus}
                onKeyDown={(event) => event.stopPropagation()} onPointerDownOutside={keepOpenOnUndoToast} onEscapeKeyDown={escapeAnswersAppMessage}>
                {props && <ProjectSettingsForm key={`${props.boardId}:${props.data.meta.updatedAt}`} vm={props} closeRef={closeRef} />}
            </Dialog.Content>
        </Dialog.Overlay></Dialog.Portal>
    </Dialog.Root>;
}

function ProjectSettingsForm({ vm, closeRef }: { vm: DialogPropsByName['projectSettings']; closeRef: React.RefObject<HTMLButtonElement | null> }) {
    const { t } = useI18n();
    const { saveProjectSettings } = usePortfolioActions();
    const [tab, setTab] = useState<'general' | 'workflow'>('general');
    const formRef = useRef<HTMLFormElement>(null);
    const workflow = useWorkflowEditor(vm.data);
    const [original] = useState(() => ({ name: vm.data.board.settings.title, project: getProjectData(vm.data) }));
    const [name, setName] = useState(original.name);
    const [project, setProject] = useState(original.project);
    const [member, setMember] = useState('');
    const [memberError, setMemberError] = useState('');
    const [tag, setTag] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const memberUsed = (id: string) => vm.data.board.tasks.some((task) => task.assigneeIds?.includes(id));
    const tagUsed = (value: string) => vm.data.board.tasks.some((task) => task.tags.includes(value));
    const submit = async () => {
        if (vm.readOnly || saving) return;
        if (formRef.current && !formRef.current.checkValidity()) {
            setTab('general');
            requestAnimationFrame(() => formRef.current?.reportValidity());
            return;
        }
        setSaving(true);
        try {
            const workflowChanged = !areSerializableValuesEqual(workflow.original, workflow.draft);
            if (workflowChanged && !(await workflow.validate())) { setTab('workflow'); return; }
            await saveProjectSettings(vm.boardId, { name, project }, original, workflowChanged ? {
                original: workflow.original, workflow: workflow.draft, relocations: workflow.relocations
            } : undefined);
        } finally { setSaving(false); }
    };
    const addMember = () => {
        const value = member.trim();
        if (!value) { setMemberError(t('project.error.name')); return; }
        if (project.members.some((entry) => projectNameKey(entry.name) === projectNameKey(value))) {
            setMemberError(t('project.error.duplicateMember')); return;
        }
        setProject({ ...project, members: [...project.members, { id: createProjectIdentity('member'), name: value }] });
        setMember(''); setMemberError('');
    };
    const addTag = () => {
        const value = projectNameKey(tag);
        if (!value || value.length > 30) { setError(t('project.error.tag')); return; }
        if (project.tags.includes(value)) { setError(t('project.error.duplicateTag')); return; }
        setProject({ ...project, tags: [...project.tags, value] });
        setTag(''); setError('');
    };
    function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'general' : event.key === 'End' ? 'workflow' : tab === 'general' ? 'workflow' : 'general';
        setTab(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-project-tab="${next}"]`)?.focus();
    }
    return <div className="project-settings-content" onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); }
    }}>
        <div className="modal-header workflow-modal-header">
            <div><Dialog.Title className="modal-title">{t('project.settings')}</Dialog.Title>
                <Dialog.Description id="projectSettingsDescription" className="workflow-modal-description">{vm.data.board.settings.title}</Dialog.Description></div>
            <Dialog.Close ref={closeRef} className="modal-close" aria-label={t('common.close')}>&times;</Dialog.Close>
        </div>
        <div className="workflow-tabs project-settings-tabs" role="tablist" aria-label={t('project.settings')}>
            {(['general', 'workflow'] as const).map((value) => <button key={value} type="button" role="tab"
                id={`project-settings-tab-${value}`} data-project-tab={value} aria-controls={`project-settings-panel-${value}`}
                aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={navigateTabs}>
                {t(value === 'general' ? 'project.general' : 'project.workflow')}
            </button>)}
        </div>
        <div className="modal-body project-settings-general" role="tabpanel" id="project-settings-panel-general" aria-labelledby="project-settings-tab-general" hidden={tab !== 'general'}>
            <p id="projectSettingsHelp">{t(vm.readOnly ? 'project.readOnly' : 'project.help')}</p>
            <form ref={formRef} id="projectSettingsForm" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                <fieldset disabled={vm.readOnly || saving} className="project-settings-fields">
                    <div className="project-settings-metadata">
                        <div className="form-group">
                            <label htmlFor="projectName" className="required">{t('project.name')}</label>
                            <input id="projectName" value={name} onChange={(event) => setName(event.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="projectStatus">{t('task.status')}</label>
                            <select id="projectStatus" value={project.status || ''} onChange={(event) => setProject({ ...project, status: event.target.value as typeof project.status })}>
                                {project.status === null && <option value="" disabled>{t('project.undefined')}</option>}
                                {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{t(`project.status.${status}`)}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="projectDescription">{t('task.description')}</label>
                        <textarea id="projectDescription" value={project.description} onChange={(event) => setProject({ ...project, description: event.target.value })} />
                    </div>
                    <div className="project-settings-catalogs">
                        <section className="form-group project-settings-catalog" aria-labelledby="projectMembersLabel">
                            <h3 id="projectMembersLabel">{t('project.members')}</h3>
                            {!project.members.length && <p>{t('project.noMembers')}</p>}
                            {project.members.map((member, index) => <div className="project-settings-entry" key={member.id}>
                                <div className="project-settings-row">
                                    <input aria-label={t('project.memberName', { index: index + 1 })} value={member.name}
                                        aria-describedby={memberUsed(member.id) ? `projectMemberUse-${index}` : undefined}
                                        onChange={(event) => setProject({ ...project, members: project.members.map((entry) => entry.id === member.id ? { ...entry, name: event.target.value } : entry) })} />
                                    <button type="button" className="btn project-settings-remove" aria-label={t('project.removeMember', { index: index + 1 })}
                                        disabled={memberUsed(member.id)} title={memberUsed(member.id) ? t('project.error.memberInUse') : t('common.remove')}
                                        onClick={() => setProject({ ...project, members: project.members.filter((entry) => entry.id !== member.id) })}>{t('common.remove')}</button>
                                </div>
                                {memberUsed(member.id) && <p id={`projectMemberUse-${index}`} className="project-settings-use">{t('project.memberInUseHelp')}</p>}
                            </div>)}
                            <div className="project-settings-row">
                                <input id="projectNewMember" aria-label={t('project.newMember')} value={member} onChange={(event) => setMember(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addMember(); } }} />
                                <button className="btn" type="button" onClick={addMember}>{t('project.addMember')}</button>
                            </div>
                            {memberError && <p role="alert">{memberError}</p>}
                        </section>
                        <section className="form-group project-settings-catalog" aria-labelledby="projectTagsLabel">
                            <h3 id="projectTagsLabel">{t('task.tags')}</h3>
                            {!project.tags.length && <p>{t('editor.noTags')}</p>}
                            {project.tags.map((value, index) => <div className="project-settings-entry" key={value}>
                                <div className="project-settings-row">
                                    <span>{value}</span>
                                    <button className="btn project-settings-remove" type="button" aria-label={t('project.removeTag', { tag: value })}
                                        aria-describedby={tagUsed(value) ? `projectTagUse-${index}` : undefined}
                                        disabled={tagUsed(value)} title={tagUsed(value) ? t('project.error.tagInUse') : t('common.remove')}
                                        onClick={() => setProject({ ...project, tags: project.tags.filter((entry) => entry !== value) })}>{t('common.remove')}</button>
                                </div>
                                {tagUsed(value) && <p id={`projectTagUse-${index}`} className="project-settings-use">{t('project.tagInUseHelp')}</p>}
                            </div>)}
                            <div className="project-settings-row">
                                <input id="projectNewTag" aria-label={t('project.newTag')} value={tag} onChange={(event) => setTag(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addTag(); } }} />
                                <button type="button" className="btn" onClick={addTag}>{t('project.addTag')}</button>
                            </div>
                            {error && <p role="alert">{error}</p>}
                        </section>
                    </div>
                    <p className="project-settings-note">{t('project.removalHelp')}</p>
                </fieldset>
            </form>
        </div>
        <div className="project-settings-workflow" role="tabpanel" id="project-settings-panel-workflow" aria-labelledby="project-settings-tab-workflow" hidden={tab !== 'workflow'}>
            <WorkflowEditor data={vm.data} readOnly={vm.readOnly} busy={saving} editor={workflow} />
            {workflow.error && <div className="workflow-validation" role="alert">{workflow.error}</div>}
        </div>
        <div className="modal-footer workflow-modal-footer">
            <span>{t(vm.readOnly ? 'workflow.readOnlyNote' : 'workflow.draftNote')}</span>
            <div><Dialog.Close className="btn" disabled={saving}>{t(vm.readOnly ? 'common.close' : 'common.cancel')}</Dialog.Close>
                {!vm.readOnly && <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void submit()}>{t('common.save')}</button>}</div>
        </div>
    </div>;
}
