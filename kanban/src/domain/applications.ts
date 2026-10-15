import type { BoardData } from './types';
import { getProjectInfo, stableLocalId } from './project';
import { getWorkflow, validateWorkflow, type Workflow } from './workflow';

export type ApplicationInfo = { id: string; name: string };
export type ApplicationCatalog = { version: 1; items: ApplicationInfo[] };
export type MaintenanceConfig = { version: 1; enabled: boolean; workflow?: Workflow };
export function getApplications(data: BoardData): ApplicationInfo[] {
    const catalog = data.extensions.applications as ApplicationCatalog | undefined;
    if (catalog && (catalog.version !== 1 || !Array.isArray(catalog.items) || catalog.items.some((app) => !app?.id || !app.name?.trim()))) throw new Error('Invalid application catalog.');
    return catalog?.items || [];
}
export function projectApplication(data: BoardData): ApplicationInfo | null {
    const info = getProjectInfo(data), name = info.product.trim();
    if (!name) return null;
    return getApplications(data).find((app) => app.id === info.productId && app.name === name) || getApplications(data).find((app) => app.name.toLowerCase() === name.toLowerCase()) || { id: `application_${stableLocalId(name.toLowerCase())}`, name };
}
export function migrateApplications(data: BoardData): void {
    const app = projectApplication(data);
    if (!app) return;
    const items = getApplications(data);
    if (!items.some((item) => item.id === app.id)) data.extensions.applications = { version: 1, items: [...items, app] } satisfies ApplicationCatalog;
    getProjectInfo(data).productId = app.id;
}
export function getMaintenanceConfig(data: BoardData): MaintenanceConfig | null {
    const stored = data.extensions.maintenance as MaintenanceConfig | undefined;
    if (stored && (stored.version !== 1 || typeof stored.enabled !== 'boolean')) throw new Error('Invalid maintenance area.');
    if (stored?.workflow) validateWorkflow(stored.workflow);
    return stored || null;
}
export function enableMaintenance(data: BoardData): void {
    migrateApplications(data);
    if (!projectApplication(data)) throw new Error('Set the project product/application first.');
    data.extensions.maintenance = { version: 1, enabled: true, workflow: structuredClone(getWorkflow(data)) } satisfies MaintenanceConfig;
}
