import teamosLogo from '@/assets/teamos-logo.svg';
import teamosLogoDark from '@/assets/teamos-logo-dark.svg';
import type { Theme } from '@/shared/types/ui';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { useAppStore } from '@/features/portfolio/state/store';
import { closeDocs, DOCS_TOGGLE_ID, toggleDocs } from '@/app/docs/docsMode';
import { useI18n } from '@/shared/i18n';
import { PortfolioProjectPicker } from '@/features/portfolio/shell/PortfolioControls';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { openCommandPalette, PALETTE_SHORTCUT_LABEL } from '@/features/portfolio/palette/openCommandPalette';

// One button, two states: a book opens the documentation; an application icon
// returns to the workspace. The label always names the available action.
function DocsToggleButton() {
    const { t } = useI18n();
    const docsOpen = useAppStore((state) => state.appMode === 'docs');
    const label = docsOpen ? t('docs.back') : t('docs.open');
    return (
        <button
            className={`btn icon-btn docs-toggle-btn${docsOpen ? ' active' : ''}`}
            id={DOCS_TOGGLE_ID}
            type="button"
            aria-label={label}
            title={label}
            aria-controls={docsOpen ? 'docsView' : 'portfolioView'}
            data-docs-open={docsOpen ? 'true' : 'false'}
            onClick={() => toggleDocs()}
        >
            {docsOpen ? (
                <svg className="docs-toggle-icon" aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
            ) : (
                <svg className="docs-toggle-icon" aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2Z" />
                    <path d="M22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7Z" />
                </svg>
            )}
        </button>
    );
}

export function AppHeader({ theme }: { theme: Theme }) {
    const { t } = useI18n();
    const settingsOpen = useAppStore((state) => state.activeDialog === 'appSettings');
    const search = useAppStore((state) => state.selectedPortfolioViewMode === 'table'
        ? (state.tableFiltersByScope[state.activeTableFilterScope]?.search || '') : state.portfolioFilters.search);
    return (
        <header className="header">
            <div className="header-identity">
                <h1 className="app-title" id="appTitle">
                    <img className="app-logo" src={theme === 'dark' ? teamosLogoDark : teamosLogo} alt="Teamos" width="128" height="32" />
                </h1>
                <PortfolioProjectPicker />
            </div>
            <div className="header-actions">
                <button className={`btn icon-btn header-search-btn${search ? ' has-value' : ''}`} id="portfolioSearchBtn" type="button"
                    aria-haspopup="dialog" aria-label={search ? `${t('palette.openButton')}: ${search}` : t('palette.openButton')}
                    title={`${t('palette.openButton')} (${PALETTE_SHORTCUT_LABEL})`} onClick={() => openCommandPalette()}><WorkspaceIcon name="search" /></button>
                <button className="btn icon-btn" id="openShortcutsBtn" type="button" aria-label={t('header.shortcuts')} title={t('header.shortcuts')} onClick={() => openDialog('shortcuts')}><WorkspaceIcon name="keyboard" /></button>
                <DocsToggleButton />
                <button
                    className="btn icon-btn app-settings-btn"
                    id="appSettingsBtn"
                    type="button"
                    aria-label={t('appSettings.title')}
                    title={t('appSettings.title')}
                    aria-haspopup="dialog"
                    aria-expanded={settingsOpen}
                    aria-controls={settingsOpen ? 'appSettingsModal' : undefined}
                    onClick={() => settingsOpen ? closeDialog('appSettings') : openDialog('appSettings')}
                >
                    <svg className="app-settings-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </button>
                <span className="toolbar-divider" aria-hidden="true" />
                <button className="btn header-project-action" id="importProjectsBtn" type="button" onClick={() => { closeDocs(); void importPortfolioProjects(); }}><WorkspaceIcon name="folder" />{t('header.importProjects')}</button>
                <button className="btn btn-primary header-project-action" id="newProjectBtn" type="button" onClick={() => { closeDocs(); void createNewProject(); }}><WorkspaceIcon name="plus" />{t('header.newProject')}</button>
            </div>
        </header>
    );
}
