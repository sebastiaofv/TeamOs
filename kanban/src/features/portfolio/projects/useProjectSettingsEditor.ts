import { getHierarchyAutomations, type HierarchyAutomations } from '@/domain/hierarchyAutomations';
import { useState } from 'react';
import type { Workflow, WorkflowKind, WorkitemType } from '@/domain/types';
import type { ProjectSettingsDraft } from '@/domain/projectData';
import { applyProjectSettings, ProjectDataError, getProjectData } from '@/domain/projectData';
import { applyWorkflow, applyWorkflowTypes, functionalWorkitemTypes, getWorkflow, workflowErrors, workflowKind } from '@/domain/workflow';
import { areSerializableValuesEqual, cloneSerializable } from '@/domain/serializable';
import type { DialogPropsByName } from '@/features/portfolio/types';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';
import { useSubmission } from '@/shared/hooks/useSubmission';

type Tab = 'general' | 'automations' | WorkflowKind;
type WorkflowSection = 'states' | 'references' | 'types';

function useWorkflowDraft(vm: DialogPropsByName['projectSettings'], kind: WorkflowKind, canEdit: () => boolean) {
    const [original] = useState(() => getWorkflow(vm.data, kind));
    const [draft, setDraft] = useState(() => cloneSerializable(original));
    const [relocations, setRelocations] = useState<Record<string, string>>({});
    const [selectedId, setSelectedId] = useState(original.states[0].id);
    const [section, selectSection] = useState<WorkflowSection>('states');
    const [error, setError] = useState('');
    const removed = original.states.filter((state) => !draft.states.some((current) => current.id === state.id));
    return {
        kind, original, draft, removed, relocations, section, error, selectSection, setError, selectedId, setSelectedId,
        clearError: () => setError(''),
        update: (edit: (workflow: Workflow) => void) => {
            if (canEdit()) setDraft((value) => { const next = cloneSerializable(value); edit(next); return next; });
        },
        relocate: (stateId: string, destinationId: string) => { if (canEdit()) setRelocations((value) => ({ ...value, [stateId]: destinationId })); }
    };
}

/** Owns the complete settings draft; views only edit values and render validation. */
export function useProjectSettingsEditor(vm: DialogPropsByName['projectSettings']) {
    const { t } = useI18n();
    const { saveProjectSettings } = portfolioActions;
    const [original] = useState(() => ({ name: vm.data.board.settings.title, project: getProjectData(vm.data) }));
    const [general, setGeneral] = useState(() => cloneSerializable(original));
    const [originalAutomations] = useState(() => cloneSerializable(getHierarchyAutomations(vm.data)));
    const [automations, setAutomations] = useState(originalAutomations);
    const [tab, selectTab] = useState<Tab>('general');
    const [error, setError] = useState('');
    const { busy, run, isRunning } = useSubmission();
    const canEdit = () => !vm.readOnly && !isRunning();
    const technical = useWorkflowDraft(vm, 'technical', canEdit);
    const functional = useWorkflowDraft(vm, 'functional', canEdit);
    const [originalTypes] = useState<WorkitemType[]>(() => functionalWorkitemTypes(vm.data));
    const [functionalTypes, setFunctionalTypes] = useState<WorkitemType[]>(originalTypes);
    const types = { functional: functionalTypes, original: originalTypes, set: (next: WorkitemType[]) => { if (canEdit()) setFunctionalTypes(next); } };

    async function save() {
        if (!canEdit()) return;
        const changed = [technical, functional].filter((editor) => !areSerializableValuesEqual(editor.original, editor.draft));
        for (const editor of changed) {
            const errors = workflowErrors(editor.draft);
            if (errors.length) {
                selectTab(editor.kind); editor.setError(`${t('workflow.invalid')} ${errors.join(' ')}`); return;
            }
            if (editor.removed.some((state) => vm.data.board.tasks.some((task) => workflowKind(task, vm.data) === editor.kind && task.status === state.id) && !editor.draft.states.some((target) => target.id === editor.relocations[state.id]))) {
                selectTab(editor.kind); editor.selectSection('references'); editor.setError(t('workflow.relocationRequired')); return;
            }
        }
        const typesChanged = !areSerializableValuesEqual([...originalTypes].sort(), [...functionalTypes].sort());
        technical.clearError(); functional.clearError();
        await run(async () => {
            try {
                if (vm.onCreate) {
                    const data = cloneSerializable(vm.data);
                    applyProjectSettings(data, general);
                    data.extensions.hierarchyAutomations = cloneSerializable(automations);
                    if (!data.extensions.project?.acronym) throw new ProjectDataError('acronym');
                    for (const editor of changed) applyWorkflow(data, editor.draft, editor.relocations, editor.kind);
                    if (typesChanged) applyWorkflowTypes(data, functionalTypes);
                    await vm.onCreate(data);
                    return;
                }
                await saveProjectSettings(vm.boardId, general, original, changed.length ? changed.map((editor) => ({
                    kind: editor.kind, original: editor.original, workflow: editor.draft, relocations: editor.relocations
                })) : undefined, typesChanged ? { original: originalTypes, functional: functionalTypes } : undefined, { original: originalAutomations, config: automations });
            } catch (error) {
                if (!(error instanceof ProjectDataError)) throw error;
                selectTab('general'); setError(t(`project.error.${error.code}`));
            }
        });
    }

    return {
        general, tab, selectTab, busy, save, error, technical, functional, types, automations,
        editAutomations: (config: HierarchyAutomations) => { if (canEdit()) setAutomations(config); },
        editGeneral: (patch: Partial<ProjectSettingsDraft>) => { if (canEdit()) setGeneral((value) => ({ ...value, ...patch })); }
    };
}

export type ProjectWorkflowEditor = ReturnType<typeof useWorkflowDraft>;
