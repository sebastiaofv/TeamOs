import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import type { ComponentProps } from 'react';

/** Keep the arrow inside the field, independently of native browser styling. */
export function EditorSelect(props: ComponentProps<'select'>) {
    return <span className="task-editor-select">
        <select {...props} />
        <WorkspaceIcon name="chevronDown" className="task-editor-select-arrow" size={14} focusable="false" />
    </span>;
}
