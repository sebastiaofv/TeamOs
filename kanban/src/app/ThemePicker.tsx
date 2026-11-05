import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { setThemeStylePreference } from '@/shared/hooks/useTheme';
import { useI18n } from '@/shared/i18n';

export function ThemePicker() {
    const { t } = useI18n();
    const style = useAppStore((state) => state.activeThemeStyle);
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const position = () => {
            const button = trigger.current?.getBoundingClientRect();
            const content = panel.current;
            if (!button || !content) return;
            content.style.left = `${Math.max(12, Math.min(button.left, window.innerWidth - content.offsetWidth - 12))}px`;
            content.style.top = `${button.bottom + 8}px`;
            content.style.maxHeight = `${Math.max(0, window.innerHeight - button.bottom - 20)}px`;
        };
        position();
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [open]);

    return (
        <>
            <button
                ref={trigger}
                className="btn icon-btn theme-picker-btn"
                id="themePickerBtn"
                type="button"
                popoverTarget="themePicker"
                aria-label={t('theme.choose')}
                title={`${t('theme.choose')}: ${t(`theme.${style}`)}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls="themePicker"
            >
                <svg className="theme-picker-icon" aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 3a9 9 0 1 0 0 18h1.4a2.1 2.1 0 0 0 1.5-3.6 1.4 1.4 0 0 1 1-2.4H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
                    <circle cx="7.5" cy="10" r=".75" /><circle cx="11" cy="7" r=".75" />
                    <circle cx="15.5" cy="8" r=".75" /><circle cx="7.5" cy="14" r=".75" />
                </svg>
            </button>
            {/* Native popovers escape the mobile header's scrolling container and
                provide outside-click, Escape and focus return without a modal. */}
            <div
                ref={panel}
                id="themePicker"
                className="theme-picker"
                popover="auto"
                role="dialog"
                aria-labelledby="themePickerTitle"
                aria-describedby="themePickerHint"
                onToggle={(event) => {
                    const visible = event.newState === 'open';
                    setOpen(visible);
                    if (visible) panel.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
                }}
                onKeyDown={(event) => {
                    // Do not let workspace shortcuts consume radio navigation or Escape.
                    event.stopPropagation();
                }}
            >
                <fieldset>
                    <legend id="themePickerTitle">{t('theme.choose')}</legend>
                    {(['classic', 'modern'] as const).map((value) => (
                        <label className="theme-picker-option" key={value}>
                            <span className={`theme-preview theme-preview-${value}`} aria-hidden="true">Aa</span>
                            <span className="theme-picker-copy">
                                <span className="theme-picker-name">{t(`theme.${value}`)}</span>
                                <span className="theme-picker-description">{t(`theme.${value}Description`)}</span>
                            </span>
                            <input
                                type="radio"
                                name="app-theme-style"
                                value={value}
                                checked={style === value}
                                aria-label={t(`theme.${value}`)}
                                onChange={() => setThemeStylePreference(value)}
                            />
                        </label>
                    ))}
                </fieldset>
                <p id="themePickerHint">{t('theme.modeHint')}</p>
            </div>
        </>
    );
}
