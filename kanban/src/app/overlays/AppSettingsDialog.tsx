import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { closeDialog } from './dialogs';

export function AppSettingsDialog({ showTimeline, onShowTimelineChange }: {
    showTimeline: boolean;
    onShowTimelineChange: (visible: boolean) => void;
}) {
    const open = useAppStore((state) => state.activeDialog === 'appSettings');
    const returnFocus = useReturnFocus();
    const { t } = useI18n();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog('appSettings'); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="appSettingsModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">{t('appSettings.title')}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <label className="app-settings-toggle">
                                <input type="checkbox" checked={showTimeline} onChange={(event) => onShowTimelineChange(event.target.checked)} />
                                <span>{t('appSettings.showTimeline')}</span>
                            </label>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn">{t('common.close')}</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
