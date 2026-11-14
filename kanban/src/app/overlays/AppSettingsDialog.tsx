import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { FloatingPanel, Popover } from '@/shared/ui/FloatingPanel';
import { useRef } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';
import { setThemeStylePreference, toggleThemePreference } from '@/shared/hooks/useTheme';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { closeDialog } from './dialogs';

export function AppSettingsDialog({ showTimeline, onShowTimelineChange }: {
    showTimeline: boolean;
    onShowTimelineChange: (visible: boolean) => void;
}) {
    const open = useAppStore((state) => state.activeDialog === 'appSettings');
    const style = useAppStore((state) => state.activeThemeStyle);
    const theme = useAppStore((state) => state.activeTheme);
    const anchor = useRef<HTMLElement | null>(null);
    anchor.current = document.getElementById('appSettingsBtn');
    const returnFocus = useReturnFocus();
    const { language, setLanguage, t } = useI18n();

    return <Popover.Root modal={false} open={open} onOpenChange={(next) => { if (!next) closeDialog('appSettings'); }}>
        <Popover.Anchor virtualRef={anchor} />
        <Popover.Portal>
            <FloatingPanel align="start" className="app-settings-panel" id="appSettingsModal" aria-label={t('appSettings.title')}
                onEscapeKeyDown={escapeAnswersAppMessage} {...returnFocus}>
                <div className="app-settings-heading">
                    <h2>{t('appSettings.title')}</h2>
                    <Popover.Close className="btn icon-btn" aria-label={t('common.close')} title={t('common.close')}><WorkspaceIcon name="close" /></Popover.Close>
                </div>
                <fieldset className="app-settings-row"><legend>{t('appSettings.mode')}</legend>
                    <div className="settings-choices">
                        {(['light', 'dark'] as const).map((value) => <label key={value}><input type="radio" name="color-mode" checked={theme === value} onChange={() => { if (theme !== value) toggleThemePreference(); }} /><span>{t(`appSettings.${value}`)}</span></label>)}
                    </div>
                </fieldset>
                <fieldset className="app-settings-row"><legend>{t('theme.choose')}</legend>
                    <div className="settings-choices">
                        {(['classic', 'modern'] as const).map((value) => <label key={value}><input type="radio" name="app-theme-style" checked={style === value} onChange={() => setThemeStylePreference(value)} /><span>{t(`theme.${value}`)}</span></label>)}
                    </div>
                </fieldset>
                <fieldset className="app-settings-row"><legend>{t('appSettings.language')}</legend>
                    <div className="settings-choices">
                        {(['en', 'pt'] as const).map((value) => <label key={value}><input type="radio" name="language" checked={language === value} onChange={() => setLanguage(value)} /><span>{value === 'en' ? 'English' : 'Português'}</span></label>)}
                    </div>
                </fieldset>
                <label className="app-settings-row app-settings-toggle"><span>{t('appSettings.showTimeline')}</span>
                    <input type="checkbox" checked={showTimeline} onChange={(event) => onShowTimelineChange(event.target.checked)} />
                </label>
            </FloatingPanel>
        </Popover.Portal>
    </Popover.Root>;
}
