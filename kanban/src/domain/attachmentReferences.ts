// Portable, project-scoped references. Never interpret a project-supplied path.
const REFERENCE = /^teamos-attachment:([^/]+)\/([a-f0-9]{64})$/;
export function parseAttachmentReference(value: unknown): { projectId: string; fileName: string } | null {
    const match = typeof value === 'string' ? REFERENCE.exec(value) : null;
    if (!match) return null;
    try {
        const projectId = decodeURIComponent(match[1]);
        return projectId && encodeURIComponent(projectId) === match[1] ? { projectId, fileName: match[2] } : null;
    } catch { return null; }
}
export function isAttachmentSource(value: unknown): value is string {
    return typeof value === 'string' && (value.startsWith('data:') || Boolean(parseAttachmentReference(value)));
}
