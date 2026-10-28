import { useRef, useState } from 'react';
import type { Workflow } from '@/domain/types';
import type { ProjectSettingsDraft } from '@/domain/projectData';
import { getProjectData } from '@/domain/projectData';
import { getWorkflow, workflowErrors } from '@/domain/workflow';
import { areSerializableValuesEqual, cloneSerializable } from '@/domain/serializable';
import type { DialogPropsByName } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

type Tab = 'general' | 'workflow';
type WorkflowSection = 'states' | 'references';

/** Owns the complete settings draft; views only edit values and render validation. */
export function useProjectSettingsEditor(vm: DialogPropsByName['projectSettings']) {
    const { t } = useI18n();
    const { saveProjectSettings } = usePortfolioActions();
    const [original] = useState(() => ({
        general: { name: vm.data.board.settings.title, project: getProjectData(vm.data) },
        workflow: getWorkflow(vm.data)
    }));
    const [general, setGeneral] = useState(() => cloneSerializable(original.general));
    const [draft, setDraft] = useState(() => cloneSerializable(original.workflow));
    const [relocations, setRelocations] = useState<Record<string, string>>({});
    const [tab, selectTab] = useState<Tab>('general');
    const [section, selectSection] = useState<WorkflowSection>('states');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const removed = original.workflow.states.filter((state) => !draft.states.some((current) => current.id === state.id));
    const canEdit = () => !vm.readOnly && !saving.current;

    async function save() {
        if (!canEdit()) return;
        const workflowChanged = !areSerializableValuesEqual(original.workflow, draft);
        if (workflowChanged) {
            const errors = workflowErrors(draft);
            if (errors.length) {
                selectTab('workflow'); setError(`${t('workflow.invalid')} ${errors.join(' ')}`); return;
            }
            if (removed.some((state) => vm.data.board.tasks.some((task) => task.status === state.id) && !draft.states.some((target) => target.id === relocations[state.id]))) {
                selectTab('workflow'); selectSection('references'); setError(t('workflow.relocationRequired')); return;
            }
        }
        saving.current = true; setBusy(true); setError('');
        try {
            await saveProjectSettings(vm.boardId, general, original.general, workflowChanged ? {
                original: original.workflow, workflow: draft, relocations
            } : undefined);
        } finally { saving.current = false; setBusy(false); }
    }

    return {
        general, tab, selectTab, busy, save,
        editGeneral: (patch: Partial<ProjectSettingsDraft>) => { if (canEdit()) setGeneral((value) => ({ ...value, ...patch })); },
        workflow: {
            draft, removed, relocations, section, error, selectSection,
            clearError: () => setError(''),
            update: (edit: (workflow: Workflow) => void) => {
                if (canEdit()) setDraft((value) => { const next = cloneSerializable(value); edit(next); return next; });
            },
            relocate: (stateId: string, destinationId: string) => { if (canEdit()) setRelocations((value) => ({ ...value, [stateId]: destinationId })); }
        }
    };
}

export type ProjectWorkflowEditor = ReturnType<typeof useProjectSettingsEditor>['workflow'];
