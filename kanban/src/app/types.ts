export type AppMessageButton = {
    label: string;
    value?: unknown;
    primary?: boolean;
    danger?: boolean;
    cancel?: boolean;
    submitsInput?: boolean;
    submitsSelection?: boolean;
    submitsSelections?: boolean;
};

export type MessageSelection = { required?: boolean; id: string; label: string; current?: string; options: { value: string; label: string }[] };

export type AppMessageReview = {
    children?: { id: string; title: string; state: string; blocked: boolean }[];
    childrenLabel?: string;
    source: string; destination: string; state: string; color: string;
    sourceLabel: string; destinationLabel: string; stateLabel: string;
    removalsLabel: string; removals: { label: string; title: string; detail: string }[];
    mappingLabel: string; mappingNote: string; note: string;
};

export type AppMessage = {
    review?: AppMessageReview;
    id: number;
    title: string;
    text: string;
    input?: { defaultValue: string; required?: boolean };
    selection?: { required?: boolean; label: string; options: { value: unknown; label: string }[] };
    selections?: MessageSelection[];
    buttons: AppMessageButton[];
    cancelValue: unknown;
};
