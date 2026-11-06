// Portable, project-scoped references. Never interpret a project-supplied path.
const REFERENCE = /^teamos-attachment:([A-Za-z0-9_-]+)\/([a-f0-9]{64})$/;
export function parseAttachmentReference(value: unknown): { projectId: string; fileName: string } | null {
    const match = typeof value === 'string' ? REFERENCE.exec(value) : null;
    return match ? { projectId: match[1], fileName: match[2] } : null;
}
export function isAttachmentSource(value: unknown): value is string {
    return typeof value === 'string' && (value.startsWith('data:') || Boolean(parseAttachmentReference(value)));
}
