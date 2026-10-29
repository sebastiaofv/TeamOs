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

export type MessageSelection = { id: string; label: string; options: { value: string; label: string }[] };

export type AppMessage = {
    id: number;
    title: string;
    text: string;
    input?: { defaultValue: string; required?: boolean };
    selection?: { label: string; options: { value: unknown; label: string }[] };
    selections?: MessageSelection[];
    buttons: AppMessageButton[];
    cancelValue: unknown;
};
