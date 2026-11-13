import * as Menu from '@radix-ui/react-dropdown-menu';
import { useRef, type ReactElement, type ReactNode } from 'react';

type Action = { label: string; icon?: ReactNode; disabled?: boolean; title?: string; run: () => unknown };

export function ActionMenu({ trigger, actions }: { trigger: ReactElement; actions: Action[] }) {
    const pending = useRef<(() => unknown) | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return <span className="task-transfer-menu" onClick={event => event.stopPropagation()}>
        <Menu.Root modal={false}>
            <Menu.Trigger asChild ref={triggerRef}>{trigger}</Menu.Trigger>
            <Menu.Content className="task-transfer-options floating-panel" align="end" sideOffset={6} collisionPadding={12}
                onCloseAutoFocus={event => {
                    // Open any follow-up dialog after the menu's focus scope closes.
                    if (!pending.current) return;
                    event.preventDefault();
                    triggerRef.current?.focus({ preventScroll: true });
                    const run = pending.current; pending.current = null; void run();
                }}>
                {actions.map(action => <Menu.Item key={action.label} asChild disabled={action.disabled} onSelect={() => { pending.current = action.run; }}>
                    <button type="button" disabled={action.disabled} title={action.title}>{action.icon}{action.label}</button>
                </Menu.Item>)}
            </Menu.Content>
        </Menu.Root>
    </span>;
}
