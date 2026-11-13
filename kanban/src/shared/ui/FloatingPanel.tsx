import * as Popover from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

export { Popover };

/** Radix owns collision handling, dismissal, focus and scroll/resize updates. */
export function FloatingPanel({ className = '', ...props }: ComponentProps<typeof Popover.Content>) {
    return <Popover.Content align="end" sideOffset={8} collisionPadding={12} {...props} className={`floating-panel ${className}`} />;
}
