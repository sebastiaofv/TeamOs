export type AppMessageButton = {
    label: string;
    value?: unknown;
    primary?: boolean;
    danger?: boolean;
    cancel?: boolean;
    submitsInput?: boolean;
};

export type AppMessage = {
    id: number;
    title: string;
    text: string;
    input?: { defaultValue: string };
    buttons: AppMessageButton[];
    cancelValue: unknown;
};

