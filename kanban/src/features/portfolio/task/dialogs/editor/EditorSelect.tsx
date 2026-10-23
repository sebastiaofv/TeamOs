import type { ComponentProps } from 'react';

/** Keep the arrow inside the field, independently of native browser styling. */
export function EditorSelect(props: ComponentProps<'select'>) {
    return <span className="task-editor-select">
        <select {...props} />
        <svg className="task-editor-select-arrow" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </span>;
}
