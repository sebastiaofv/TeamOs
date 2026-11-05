import teamosLogo from '@/assets/teamos-logo.svg';
import teamosLogoDark from '@/assets/teamos-logo-dark.svg';
import type { Theme } from '@/shared/types/ui';
import { openDialog } from '@/app/overlays/dialogs';
import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { useAppStore } from '@/features/portfolio/state/store';
import { closeDocs, DOCS_TOGGLE_ID, toggleDocs } from '@/app/docs/docsMode';
import { useI18n } from '@/shared/i18n';

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

export function AppHeader({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
    const { language, languageCode, toggleLanguage, t } = useI18n();
    const themeLabel = theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark');
    const languageLabel = language === 'en' ? t('language.switchToPt') : t('language.switchToEn');
    return (
        <header className="header">
            <h1 className="app-title" id="appTitle">
                <img
                    className="app-logo"
                    src={theme === 'dark' ? teamosLogoDark : teamosLogo}
                    alt="Teamos"
                    width="130"
                    height="32"
                />
            </h1>
            <div className="header-actions">
                <button
                    className="btn icon-btn theme-toggle-btn"
                    id="themeToggleBtn"
                    type="button"
                    aria-label={themeLabel}
                    title={themeLabel}
                    aria-pressed={theme === 'dark' ? 'true' : 'false'}
                    onClick={onToggleTheme}
                >
                    <svg className="theme-toggle-icon theme-toggle-icon-light" aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z" />
                    </svg>
                    <svg className="theme-toggle-icon theme-toggle-icon-dark" aria-hidden="true" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                </button>
                <button
                    className="btn icon-btn app-settings-btn"
                    id="appSettingsBtn"
                    type="button"
                    aria-label={t('appSettings.title')}
                    title={t('appSettings.title')}
                    aria-haspopup="dialog"
                    onClick={() => openDialog('appSettings')}
                >
                    <svg className="app-settings-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </button>
                <button
                    className="btn language-toggle-btn"
                    id="languageToggleBtn"
                    type="button"
                    aria-label={languageLabel}
                    title={languageLabel}
                    onClick={toggleLanguage}
                >{languageCode}</button>
                <button className="btn" id="openShortcutsBtn" type="button" onClick={() => openDialog('shortcuts')}>{t('header.shortcuts')}</button>
                <DocsToggleButton />
                <button className="btn" id="importProjectsBtn" type="button" onClick={() => { closeDocs(); void importPortfolioProjects(); }}>{t('header.importProjects')}</button>
                <button className="btn btn-primary" id="newProjectBtn" type="button" onClick={() => { closeDocs(); void createNewProject(); }}>{t('header.newProject')}</button>
            </div>
        </header>
    );
}
