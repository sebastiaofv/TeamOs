import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';

export function PortfolioEmptyState() {
    const { t } = useI18n();
    return <section className="portfolio-empty-state" id="portfolioEmptyState" aria-labelledby="emptyWorkspaceTitle">
        <div className="portfolio-empty-content">
            <div className="portfolio-empty-icon"><WorkspaceIcon name="folder" /></div>
            <h2 id="emptyWorkspaceTitle">{t('toolbar.noProjectsLoaded')}</h2>
            <p>{t('workspace.emptyDescription')}</p>
            <div className="portfolio-empty-actions">
                <button className="btn" type="button" onClick={() => { void importPortfolioProjects(); }}><WorkspaceIcon name="folder" />{t('header.importProjects')}</button>
                <button className="btn btn-primary" type="button" onClick={() => { void createNewProject(); }}><WorkspaceIcon name="plus" />{t('header.newProject')}</button>
            </div>
        </div>
    </section>;
}
