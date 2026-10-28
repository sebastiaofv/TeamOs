import type { Theme } from '@/shared/types/ui';
import { openDialog } from '@/app/overlays/dialogs';
import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { useI18n } from '@/shared/i18n';

export function AppHeader({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
    const { language, languageCode, toggleLanguage, t } = useI18n();
    const themeLabel = theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark');
    const languageLabel = language === 'en' ? t('language.switchToPt') : t('language.switchToEn');
    return (
        <header className="header">
            <h1 className="app-title" id="appTitle">TeamOS → Kanban</h1>
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
                    <svg className="app-settings-icon" aria-hidden="true" viewBox="0 0 24 24">
                        <path d="m9 3-.5 2-2 1.2-2-.5-2 3.5 1.5 1.5v2.6L2.5 15l2 3.5 2-.5 2 1.2.5 2h4l.5-2 2-1.2 2 .5 2-3.5-1.5-1.7v-2.6L20 9l-2-3.5-2 .5-2-1.2-.5-2Z" />
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
                <button className="btn" id="openHelpBtn" type="button" onClick={() => openDialog('help')}>{t('header.help')}</button>
                <button className="btn" id="importProjectsBtn" type="button" onClick={() => { void importPortfolioProjects(); }}>{t('header.importProjects')}</button>
                <button className="btn btn-primary" id="newProjectBtn" type="button" onClick={() => { void createNewProject(); }}>{t('header.newProject')}</button>
            </div>
        </header>
    );
}
