import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';
import { setThemeStylePreference, toggleThemePreference } from '@/shared/hooks/useTheme';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
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
    const panel = useRef<HTMLDivElement>(null);
    const place = useAnchoredPanel(open, 'appSettingsBtn', panel);
    const returnFocus = useReturnFocus();
    const { language, setLanguage, t } = useI18n();

    return <Dialog.Root modal={false} open={open} onOpenChange={(next) => { if (!next) closeDialog('appSettings'); }}>
        <Dialog.Portal>
            <Dialog.Content ref={panel} className="app-settings-panel" id="appSettingsModal" aria-describedby={undefined}
                onEscapeKeyDown={escapeAnswersAppMessage} {...returnFocus} onOpenAutoFocus={(event) => { place(); returnFocus.onOpenAutoFocus(event); }}>
                <div className="app-settings-heading">
                    <Dialog.Title>{t('appSettings.title')}</Dialog.Title>
                    <Dialog.Close className="btn icon-btn" aria-label={t('common.close')} title={t('common.close')}>×</Dialog.Close>
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
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>;
}
