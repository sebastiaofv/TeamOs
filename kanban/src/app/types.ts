export type AppMessageButton = {
    label: string;
    value?: unknown;
    primary?: boolean;
    danger?: boolean;
    cancel?: boolean;
    submitsInput?: boolean;
    submitsSelection?: boolean;
};

export type AppMessage = {
    id: number;
    title: string;
    text: string;
    input?: { defaultValue: string };
    selection?: { label: string; options: { value: unknown; label: string }[] };
    buttons: AppMessageButton[];
    cancelValue: unknown;
};
